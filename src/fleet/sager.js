/* src/fleet/sager.js
 * Sagsbaseret mail — vokabular og politik. BESLUTNING 20.
 *
 * Mekanismen i én sætning: en sag har et nummer, nummeret står i emnefeltet,
 * modtageren svarer normalt i Outlook, Re: bevarer nummeret, og vi genkender
 * det. Ingen Outlook-integration. Modtageren gør ingenting anderledes.
 *
 * DENNE FIL ER POLITIK, IKKE UI. Den Cloud Function der modtager mail, skal
 * bruge NØJAGTIG samme regex og NØJAGTIG samme afsendervurdering som
 * skærmen — ellers kan en besked se accepteret ud ét sted og karantæneret et
 * andet. Samme disciplin som permissions.js og audit-regler.js: filen
 * importerer kun booking-state (nummerserien), aldrig firebase.
 *
 * ⚠ HELE SIKKERHEDSMODELLEN HÆNGER PÅ ÉT PUNKT:
 * Indgående mail er UAUTENTIFICERET INPUT FRA INTERNETTET. Sagsnummeret er
 * fortløbende og dermed gætbart — det er en ADRESSE, ikke en hemmelighed.
 * Enhver kan sende til adressen med et gyldigt nummer i emnet. Det der
 * afgør om en besked lander på tråden, er AFSENDEREN — se vurderAfsender().
 */

import { naesteNummer } from "./booking-state.js";

/* ---- Sagsarter ------------------------------------------------------ */

/**
 * To arter, ét mønster. Fleet-sager går til et værksted, facility-sager til
 * en leverandør — forskellen er præfiks, counter og hvad knappen hedder.
 * Alt andet er identisk, og det skal det blive: to sagsvisninger der driver
 * fra hinanden er beslutning 12 om igen.
 *
 * Serierne er ADSKILTE med vilje. FLT kan stå på 00381 mens FAC står på
 * 00127; én fælles tæller ville give huller i begge rækker og gøre et
 * nummer ulæseligt som "den 127. facility-sag i år".
 */
export const SAG_ART = {
  fleet: {
    art: "fleet",
    praefiks: "FLT",
    serie: "sagFlt",
    label: "Værkstedssag",
    modpart: "værksted",
    kontaktKnap: "Kontakt værksted",
  },
  facility: {
    art: "facility",
    praefiks: "FAC",
    serie: "sagFac",
    label: "Facility-sag",
    modpart: "leverandør",
    kontaktKnap: "Kontakt leverandør",
  },
};

export const ARTER = Object.values(SAG_ART);

/** Nyt sagsnummer. Samme counter-mekanisme som beslutning 8 — ikke et nyt
 *  system. Skrives af en Cloud Function; klienten kalder den aldrig selv. */
export const naesteSagsnummer = (db, path, art) => {
  const a = SAG_ART[art];
  if (!a) throw new Error(`naesteSagsnummer: ukendt sagsart "${art}".`);
  return naesteNummer(db, path, { praefiks: a.praefiks, serie: a.serie });
};

/* ---- Genkendelse i emnefeltet --------------------------------------- */

/* Ét mønster, begge arter. \b i begge ender, så "XFLT-2026-00381" ikke
   matcher, og så et nummer klistret ind i et ord ikke opfanges.
   \d{5} er præcis fem — "FLT-2026-003812" er ikke sag 00381.
 *
 * VERSALUFØLSOM med vilje. Nummeret er ikke kun noget et mailprogram fører
 * videre i et Re: — det er også noget et menneske taster af fra en seddel
 * eller læser op i telefonen. Et system der taber "flt-2026-00381" ville
 * ikke være sikrere; det ville bare fejle på den mest almindelige måde
 * afsenderen kan skrive. Sikkerheden ligger i vurderAfsender(), ikke i om
 * bogstaverne er store. Nummeret normaliseres til versaler nedenfor. */
const MOENSTER = /\b(FLT|FAC)-(\d{4})-(\d{5})\b/gi;

/**
 * sagsnummerFraEmne(emne) → { nummer, art } | null
 *
 * Læser KUN emnefeltet. Aldrig brødteksten.
 *
 * Det er ikke en optimering, det er kontrollen: en brødtekst indeholder
 * citerede tidligere mails, og en af dem kan bære et ANDET sagsnummer. Læste
 * vi brødteksten, kunne en fremmed videresende en gammel tråd og få sin
 * besked lagt på en sag han aldrig har haft med at gøre. Emnefeltet er det
 * eneste sted afsenderen bevisligt selv har sat nummeret — eller har fået det
 * med af sit mailprogram via Re:.
 *
 * Re:, SV:, VS: og Fwd: kræver ingen særbehandling. De står FORAN emnet, og
 * mønstret er ikke forankret — nummeret findes hvor det end står.
 *
 * TO FORSKELLIGE numre i samme emne giver null. Det sker når nogen svarer på
 * én sag og limer et andet nummer ind, og der findes ikke et rigtigt svar på
 * hvilken sag beskeden hører til. At gætte ville lægge en fremmeds besked på
 * en tilfældig af de to.
 */
export function sagsnummerFraEmne(emne) {
  if (!emne) return null;
  const fundne = [...String(emne).matchAll(MOENSTER)].map((m) => ({
    nummer: m[0].toUpperCase(),
    art: m[1].toUpperCase() === "FLT" ? "fleet" : "facility",
  }));
  if (!fundne.length) return null;
  const unikke = new Set(fundne.map((f) => f.nummer));
  if (unikke.size > 1) return null;
  return fundne[0];
}

/** Emnelinjen på en udgående mail. Nummeret står FØRST — så overlever det
 *  et mailprogram der forkorter et langt emne i midten. */
export const emneMedNummer = (nummer, emne) => `[${nummer}] ${emne}`;

/* ---- Afsendervurdering ---------------------------------------------- */

/**
 * Tre udfald. Bemærk at der ikke findes et fjerde der hedder "sandsynligvis
 * i orden" — så ville nogen klikke videre fra det.
 */
export const AFSENDER_STATUS = {
  kendt: "kendt",             // matcher en part på sagen → lægges på tråden
  karantaene: "karantaene",   // gyldigt nummer, ukendt afsender → IKKE på tråden
  afvist: "afvist",           // ingen/tvetydigt nummer, eller fejlet DMARC
};

export const AFSENDER_TONE = { kendt: "ok", karantaene: "warn", afvist: "bad" };
export const AFSENDER_LABEL = {
  kendt: "Kendt afsender",
  karantaene: "I karantæne",
  afvist: "Afvist",
};

const normaliser = (adresse) => String(adresse || "").trim().toLowerCase();
const domaene = (adresse) => normaliser(adresse).split("@")[1] || "";

/**
 * vurderAfsender({ envelopeAfsender, dmarc, parter, egneDomaener })
 *   → { status, aarsag }
 *
 * ⚠ envelopeAfsender er SMTP'ens MAIL FROM / Return-Path — ikke `From:`.
 * From:-headeren er fritekst afsenderen skriver selv og kan forfalskes af
 * enhver. Bruger man den til at afgøre om en besked er "fra værkstedet",
 * har man bygget en dør med et skilt hvor låsen skulle sidde.
 *
 * dmarc er providerens verifikationsresultat ("pass" | "fail" | "none").
 * Alt andet end "pass" er afvist: uden alignment mellem envelope og
 * signatur beviser adressen ingenting.
 *
 * parter er adresserne på DENNE sag. En leverandør vi kender fra en anden
 * sag er ikke kendt her — se frigivKarantaene() nedenfor.
 */
export function vurderAfsender({ envelopeAfsender, dmarc, parter = [], egneDomaener = [] }) {
  const adresse = normaliser(envelopeAfsender);
  if (!adresse) return { status: AFSENDER_STATUS.afvist, aarsag: "Ingen envelope-afsender." };
  if (dmarc !== "pass") {
    return { status: AFSENDER_STATUS.afvist, aarsag: `Afsenderen kunne ikke verificeres (DMARC: ${dmarc || "ingen"}).` };
  }
  if (parter.map(normaliser).includes(adresse)) {
    return { status: AFSENDER_STATUS.kendt, aarsag: "Adressen står som part på sagen." };
  }
  if (egneDomaener.map((d) => String(d).toLowerCase()).includes(domaene(adresse))) {
    return { status: AFSENDER_STATUS.kendt, aarsag: "Afsenderen er på virksomhedens eget domæne." };
  }
  return {
    status: AFSENDER_STATUS.karantaene,
    aarsag: `${adresse} står ikke som part på sagen.`,
  };
}

/**
 * Frigivelse fra karantæne tilføjer adressen til DENNE sags parter — ikke til
 * leverandørkartoteket, og ikke til andre sager.
 *
 * Det er hele pointen med at have en frigivelse frem for bare at acceptere:
 * gjorde ét klik en fremmed adresse permanent kendt overalt, ville én
 * uopmærksom frigivelse åbne for alle fremtidige sager. Rækkevidden af en
 * fejl skal svare til rækkevidden af beslutningen.
 *
 * Selve skrivningen hører i en Cloud Function bag sag.karantaeneFrigiv.
 */
export const frigivKarantaene = (sag, adresse) => ({
  parter: [...(sag.parter || []), normaliser(adresse)],
});

/* ---- Vedhæftninger --------------------------------------------------- */

/**
 * Tre tilstande, og rækkefølgen er ufravigelig: en fil er afventerScan indtil
 * en scanner har sagt noget andet.
 *
 * FEJLER LUKKET. Er scanneren nede, bliver status stående på afventerScan —
 * den bliver ALDRIG "antaget ren". En scanner der er ude af drift, må gøre
 * systemet ubrugeligt; den må ikke gøre det utroværdigt.
 */
export const VEDHAEFTNING_STATUS = {
  afventerScan: "afventerScan",
  ren: "ren",
  blokeret: "blokeret",
};

export const VEDHAEFTNING_TONE = { afventerScan: "warn", ren: "ok", blokeret: "bad" };
export const VEDHAEFTNING_LABEL = {
  afventerScan: "Afventer scanning",
  ren: "Scannet",
  blokeret: "Blokeret",
};

/**
 * Må filen hentes? Kun hvis den er scannet ren.
 *
 * Denne funktion er grunden til at skærmen ikke selv må rende og tegne et
 * downloadlink: et link der findes i DOM'en, bliver klikket. Det er samme
 * regel som "en udløbet kompetence blokerer, den advarer ikke" — en advarsel
 * man kan klikke videre fra, er ikke en kontrol.
 *
 * Serveren skal spærre den samme vej. Dette er UI-feedback, ikke garantien.
 */
export const maaHentes = (v) => v?.status === VEDHAEFTNING_STATUS.ren;

/* ---- Sagen og tråden ------------------------------------------------- */

export const SAG_TILSTAND = {
  aaben:        { label: "Åben",            pill: "info" },
  afventerSvar: { label: "Afventer svar",   pill: "warn" },
  afsluttet:    { label: "Afsluttet",       pill: "ok"   },
};

export const RETNING = { indgaaende: "indgaaende", udgaaende: "udgaaende" };
export const RETNING_LABEL = { indgaaende: "Indgående", udgaaende: "Udgående" };

/* ---- Aftaleforslag (beslutning 4, femte kilde) ----------------------- */

/**
 * En sætning i en mail — "vi kan tage bilen 18/8 kl. 08.00" — kan blive en
 * reservation. Men den bliver et FORSLAG først.
 *
 * ⚠ TO TING DER IKKE MÅ RODES SAMMEN:
 *
 * 1. Mailen er ikke en femte kilde i reservationsnoden. Den reservation der
 *    til sidst skrives, er et VÆRKSTEDSBESØG og skal have kilde.type
 *    'vaerksted' med prioritet 40. Fik den sin egen lave prioritet, ville en
 *    bekræftet værkstedsaftale tabe til en booking — og en bil på værksted
 *    kan ikke køre, uanset hvad disponenten har lovet. Sporet bevares med
 *    kilde.viaSagId, ikke ved at ændre kilde.type.
 *
 * 2. Automatikken skriver aldrig selv. Præcis som matchAabneEtaper() bliver
 *    et match et forslag, aldrig en reservation — ellers omgår automatikken
 *    rolletjekket, og beslutning 5 er væk ad bagvejen.
 *
 * Og datoen er et GÆT. At læse "18/8 kl. 08.00" ud af dansk fritekst går galt
 * på 18/8 vs. 8/18, på "næste tirsdag" og på "otte". Derfor bærer forslaget
 * altid udtrukketFra: den sætning det blev læst ud af skal stå ved siden af
 * feltet, så mennesket kan se hvad maskinen læste — og selv sætte
 * tidspunktet. Aldrig forudfyldt og bekræftet i ét klik.
 */
export const AFTALE_TILSTAND = {
  forslag: { label: "Forslag",  pill: "warn" },
  aftalt:  { label: "Aftalt",   pill: "ok"   },
  afvist:  { label: "Afvist",   pill: "bad"  },
};

/**
 * Den reservation et bekræftet aftaleforslag skal blive til.
 *
 * Bemærk hvad der IKKE sker her: der skrives ikke. Funktionen bygger den post
 * en Cloud Function skal reservere med — konfliktkontrollen ligger i
 * reservations.js, og to disponenter kan ramme samme sekund.
 */
export function reservationFraAftale(sag, aftale) {
  if (aftale.tilstand !== "aftalt") {
    throw new Error("reservationFraAftale: kun en bekræftet aftale må blive til en reservation.");
  }
  return {
    ressourceType: aftale.ressourceType,
    ressourceId: aftale.ressourceId,
    fra: aftale.fra,
    til: aftale.til,
    /* Værkstedsbesøg, ikke "mail". Prioritet 40 — se noten ovenfor. */
    kilde: {
      type: sag.art === "facility" ? "facilitySag" : "vaerksted",
      id: sag.id,
      reference: sag.nummer,
      viaSagId: sag.id,
    },
  };
}

/* ---- Fanerne --------------------------------------------------------- */

/* Rækkefølgen er ikke tilfældig: Oversigt er hvad sagen ER, Kommunikation er
   hvad der er sagt, Dokumenter er hvad der er vedhæftet, Aktiviteter er hvad
   systemet har gjort. Fra det menneskelige mod det maskinelle. */
export const FANER = [
  { key: "oversigt", label: "Oversigt" },
  { key: "kommunikation", label: "Kommunikation" },
  { key: "dokumenter", label: "Dokumenter" },
  { key: "aktiviteter", label: "Aktiviteter" },
];
