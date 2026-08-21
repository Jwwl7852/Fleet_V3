/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/booking-state.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/booking-state.js
 * Bookingflowet som tilstandsmaskine. Tre roller, ikke én bruger.
 *
 *   casehandler  opretter forespørgsel
 *   disponent    laver 1-3 forslag
 *   koordinator  godkender, returnerer eller afviser
 *
 * Reglerne hører her — ikke i knapperne. Ellers kan en disponent godkende
 * sit eget forslag, og hele pointen med koordinatorleddet forsvinder.
 *
 * BESLUTNING 16 — et forløb med flere etaper.
 * Tilstanden ligger på ETAPEN, ikke på bookingen: etape 1 kan være reserveret
 * mens etape 2 stadig er åben og venter på en passende tur. Bookingens egen
 * tilstand er AFLEDT af etaperne med forloebstilstand() nedenfor, og et forløb
 * er først udført når hver eneste etape er det.
 */

import { PERM, harPerm } from "./permissions.js";

/* Rollenavnene bruges til visning og som navn på et permission-preset — se
   permissions.js. De afgør IKKE længere hvad man må: overgangene nedenfor
   spørger efter en permission. */
export const ROLLE = {
  casehandler: "casehandler",
  disponent: "disponent",
  koordinator: "koordinator",
  admin: "admin",
  chauffoer: "chauffoer",
};

export const TILSTAND = {
  kladde:            { label: "Kladde",                 pill: "info"  },
  afventerPlan:      { label: "Afventer planlægning",   pill: "warn"  },
  aaben:             { label: "Åben – afventer tur",    pill: "info"  },
  afventerKoord:     { label: "Afventer koordinator",   pill: "warn"  },
  reserveret:        { label: "Reserveret / Booket",    pill: "ok"    },
  returneret:        { label: "Returneret til disponent", pill: "warn" },
  delvist:           { label: "Delvist gennemført",     pill: "warn"  },
  afvist:            { label: "Afvist",                 pill: "bad"   },
  annulleret:        { label: "Annulleret",             pill: "bad"   },
  udfoert:           { label: "Udført",                 pill: "ok"    },
};


/* ---- Hvad forespørgslen beskriver ------------------------------------- *
 *
 * ⚠ DE TRE KATALOGER LÅ I `demo-bookinger.js` — ALTSÅ I EN DEMOFIL.
 *
 * Nøjagtig samme sted som `ARBEJDSTYPE` lå, før den flyttede til
 * `opgaver.js`: et modul kunne ikke nå dem uden at importere et demosæt, og
 * den der ikke ville det, ville lave sin egen kopi. Tre skærme importerede
 * dem derfra — Ny forespørgsel, Forslag og Bookingoversigt — og serveren
 * kunne slet ikke, for `functions/` deployer kun `delt/`, hvor demofiler
 * ikke hører hjemme.
 *
 * Nu står de her, hvor `TILSTAND` står, og `valideBooking()` prøver imod
 * dem — det samme sted klienten tegner vælgeren fra.
 */

export const TRANSPORTTYPE = {
  fuldlast: "Fuldlast (FTL)",
  delparti: "Delparti (LTL)",
  temperatur: "Temperaturreguleret",
  farligtGods: "Farligt gods (ADR)",
  kombi: "Kombineret transport",
};
export const ALLE_TRANSPORTTYPER = Object.keys(TRANSPORTTYPE);

export const RUTEPRAEFERENCE = {
  hurtigst: "Hurtigste rute",
  billigst: "Billigste rute",
  undgaaFaerge: "Undgå færger",
  kunMotorvej: "Kun motorvej",
};
export const ALLE_RUTEPRAEFERENCER = Object.keys(RUTEPRAEFERENCE);

/** Hvor meget afhentning og levering må rykke sig. Uden fleksibilitet kan
 *  matchningen ikke lægge to forsendelser sammen. */
export const FLEKSIBILITET = {
  fast: "Fast tidspunkt",
  timer2: "± 2 timer",
  halvdag: "± en halv dag",
  dag1: "± en dag",
};
export const ALLE_FLEKSIBILITETER = Object.keys(FLEKSIBILITET);

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ DER ER KUN ÉN OVERGANGSTABEL — BESLUTNING 40.

   Her stod `OVERGANGE` ved siden af `ETAPE_OVERGANGE`: to næsten identiske
   tabeller, hvor bookingens manglede `aaben` og ellers var den samme.
   Kommentaren under den sagde selv "Én kontrol, to tabeller. Ellers driver
   reglerne fra hinanden" — men to tabeller ER hvordan de driver.

   Den er væk, og med den `kanSkifte()`, `byggSkifte()` og
   `tilgaengeligeHandlinger()`. Grunden er ikke oprydning:

     · Det man disponerer, er en ETAPE (beslutning 16). Forslaget ligger
       på etapen, og godkendelsen sker dér.
     · Bookingens tilstand er AFLEDT — `forloebstilstand()` regner den ud,
       og `etapeskift` skriver den i samme opdatering som etapeskiftet.

   En tilstandsmaskine der kunne sætte bookingens tilstand direkte, ville
   være en anden vej til et felt der har ét sted at komme fra. Og en funktion
   der findes, bliver kaldt: `kanSkifte()` havde nøjagtig én kalder tilbage,
   og den skrev ikke — den ville have gjort det, næste gang nogen byggede
   videre på Forslag-skærmen.

   `TILSTAND` bliver stående: de ti navne er de samme for et forløb og en
   etape, og et forløb skal kunne tegnes med sin pille.
   ══════════════════════════════════════════════════════════════════════════ */
/* Etapens overgange. Samme flow som en enkeltbooking, plus ÉN ting: aaben.
   aaben er en TILSTAND, ikke fravær af planlægning. Tre grunde:
     1. Matchningen skal kunne forespørge på den —
        orderByChild("tilstand").equalTo("aaben"). Fravær kan ikke indekseres.
     2. Den skal kunne skelnes fra kladde. "Venter bevidst på en passende tur"
        og "ingen har kigget på den endnu" er to forskellige situationer.
     3. Den bærer senestMs. Uden en frist på selve tilstanden fyldes lageret
        op med gods ingen henter, uden at nogen kan se det.

   Der er ingen 'forfalden'-tilstand. Overskredet frist udledes af senestMs
   med serviceTone() — samme tre trin som Flåde og Facility bruger — og kan
   intervalforespørges. Vi gemmer ikke det vi kan regne ud. */
const ETAPE_OVERGANGE = {
  kladde: [
    { til: "afventerPlan", kraeverPerm: PERM.bookingOpret, handling: "Send til planlægning" },
    { til: "annulleret",   kraeverPerm: PERM.bookingOpret, handling: "Annullér" },
  ],
  afventerPlan: [
    { til: "afventerKoord", kraeverPerm: PERM.bookingForeslaa, handling: "Send forslag", kraeverForslag: true },
    { til: "aaben",         kraeverPerm: PERM.bookingForeslaa, handling: "Sæt på venteliste", kraeverFrist: true, kraeverBegrundelse: true },
    { til: "afvist",        kraeverPerm: PERM.bookingAfvis, handling: "Kan ikke løses", kraeverBegrundelse: true },
  ],
  aaben: [
    /* Et match fra matchAabneEtaper() bliver et FORSLAG her — det bliver
       aldrig en reservation af sig selv. Koordinatoren godkender stadig,
       ellers er beslutning 5 væk ad bagvejen. */
    { til: "afventerKoord", kraeverPerm: PERM.bookingForeslaa, handling: "Foreslå matchet tur", kraeverForslag: true },
    { til: "afventerPlan",  kraeverPerm: PERM.bookingForeslaa, handling: "Tag af venteliste" },
    { til: "afvist",        kraeverPerm: PERM.bookingAfvis, handling: "Kan ikke løses", kraeverBegrundelse: true },
    { til: "annulleret",    kraeverPerm: PERM.bookingAnnuller, handling: "Annullér etape", kraeverBegrundelse: true },
  ],
  afventerKoord: [
    { til: "reserveret",  kraeverPerm: PERM.bookingGodkend, handling: "Godkend valgt forslag", kraeverValgtForslag: true },
    { til: "returneret",  kraeverPerm: PERM.bookingReturner, handling: "Returnér til disponent", kraeverBegrundelse: true },
    /* Samme permission som returnér: begge er "send tilbage uden at afvise".
       Se noten på PERM.bookingReturner. */
    { til: "aaben",       kraeverPerm: PERM.bookingReturner, handling: "Tilbage på venteliste", kraeverFrist: true, kraeverBegrundelse: true },
    { til: "afvist",      kraeverPerm: PERM.bookingAfvis, handling: "Afvis alle", kraeverBegrundelse: true },
  ],
  returneret: [
    { til: "afventerKoord", kraeverPerm: PERM.bookingForeslaa, handling: "Send nye forslag", kraeverForslag: true },
    { til: "aaben",         kraeverPerm: PERM.bookingForeslaa, handling: "Sæt på venteliste", kraeverFrist: true, kraeverBegrundelse: true },
    { til: "afvist",        kraeverPerm: PERM.bookingAfvis, handling: "Kan ikke løses", kraeverBegrundelse: true },
  ],
  reserveret: [
    { til: "udfoert",    kraeverPerm: PERM.bookingUdfoer, handling: "Markér udført" },
    { til: "annulleret", kraeverPerm: PERM.bookingAnnuller, handling: "Annullér etape", kraeverBegrundelse: true },
  ],
  afvist: [
    { til: "afventerPlan", kraeverPerm: PERM.bookingOpret, handling: "Genåbn etape" },
  ],
  udfoert: [],
  annulleret: [],
};

/** Hvad må brugeren gøre lige nu. Driver knapperne i UI'et.
 *  perms er claim-strengen fra auth.token.perms — eller et array.
 *
 *  ⚠ DER ER KUN DEN HER. Bookingens udgave er væk med beslutning 40 — se
 *  noten ovenfor. Spørger du efter et forløbs handlinger, spørger du efter
 *  dets etapers. */
export function tilgaengeligeEtapeHandlinger(tilstand, perms) {
  return (ETAPE_OVERGANGE[tilstand] || []).filter((o) => harPerm(perms, o.kraeverPerm));
}

/* ⚠ ÉN KONTROL, ÉN TABEL. Der stod "to tabeller" her, med den begrundelse at
   reglerne ellers driver fra hinanden — men to tabeller ER hvordan de driver.
   Funktionen tager stadig tabellen som parameter, så den kan prøves isoleret,
   og fordi en tabel mere er tænkelig den dag et forløb får sit eget flow der
   IKKE bare er dets etapers. Indtil da er der én. */
function pruvOvergang(overgange, post, tilTilstand, perms, { begrundelse } = {}) {
  const o = (overgange[post.tilstand] || []).find((x) => x.til === tilTilstand);
  if (!o) return { ok: false, aarsag: `Kan ikke gå fra ${TILSTAND[post.tilstand]?.label} til ${TILSTAND[tilTilstand]?.label}.` };
  if (!harPerm(perms, o.kraeverPerm)) return { ok: false, aarsag: `Du mangler adgangen "${o.kraeverPerm}" til at udføre "${o.handling}".` };
  if (o.kraeverForslag && !(post.forslag?.length > 0)) return { ok: false, aarsag: "Der skal være mindst ét forslag." };
  if (o.kraeverValgtForslag && !post.valgtForslagId) return { ok: false, aarsag: "Vælg et forslag før godkendelse." };
  if (o.kraeverBegrundelse && !begrundelse?.trim()) return { ok: false, aarsag: "Angiv en begrundelse." };
  if (o.kraeverFrist && !post.senestMs) return { ok: false, aarsag: "En åben etape skal have en frist — ellers kan lageret fyldes op uden at nogen ser det." };
  return { ok: true };
}

/**
 * kanSkifteEtape(etape, tilTilstand, perms, { begrundelse }) → { ok, aarsag }
 *
 * perms er auth.token.perms-strengen, ikke en rolle. Det er den eneste måde
 * at sikre at UI'et og serveren spørger om det samme.
 *
 * ⚠ DER ER INGEN kanSkifte() PÅ EN BOOKING. Se noten ved overgangstabellen:
 * bookingens tilstand er afledt, og det man disponerer, er en etape.
 * Bemærk kraeverFrist på vej til aaben.
 */
export function kanSkifteEtape(etape, tilTilstand, perms, opts = {}) {
  return pruvOvergang(ETAPE_OVERGANGE, etape, tilTilstand, perms, opts);
}

/**
 * Bygger den opdatering der skal skrives. Skriver ALTID til historik —
 * "Historik"-knappen i mockuppen skal have noget at vise, og en afvist etape
 * skal kunne forklares et halvt år senere. senestMs skrives med, når etapen
 * sættes åben — det er den frist matchningen og lagerprisen begge regner på.
 *
 * ⚠ DER ER INGEN byggSkifte() PÅ EN BOOKING (beslutning 40). Bookingens
 * tilstand er afledt af etaperne og skrives af etapeskift i samme opdatering.
 *
 * Skrivningen hører i en Cloud Function: etapens koeretoejId og dens
 * reservation skal oprettes i ÉN transaktion. I prototypen stod der
 * DE-QR 777 med afgang 28/6 i reservationstabellen og DE-KL 404 den 24/6 i
 * timelinen og i svaret til koordinatoren — fordi svaret og reservationen
 * var to poster. Der må ikke være to steder at være uenige.
 */
export function byggEtapeSkifte(etape, tilTilstand, { rolle, bruger, begrundelse, valgtForslagId, senestMs }) {
  const nu = Date.now();
  return {
    tilstand: tilTilstand,
    valgtForslagId: valgtForslagId ?? etape.valgtForslagId ?? null,
    senestMs: tilTilstand === "aaben" ? (senestMs ?? etape.senestMs ?? null) : (etape.senestMs ?? null),
    sidstAendretMs: nu,
    sidstAendretAf: bruger,
    [`historik/${nu}`]: {
      fra: etape.tilstand,
      til: tilTilstand,
      rolle,
      af: bruger,
      begrundelse: begrundelse || null,
      ms: nu,
    },
  };
}

/* ---- Forløbstilstand ---------------------------------------------- */

/* Hvor langt en etape er nået. Bruges KUN når intet er reserveret eller
   udført endnu — så snart der er spredning, er forløbet 'delvist'.
   afvist og annulleret står ikke her; de behandles for sig. */
const RANG = { kladde: 0, afventerPlan: 1, aaben: 2, returneret: 2, afventerKoord: 3 };

const FAERDIG = new Set(["reserveret", "udfoert"]);

/**
 * forloebstilstand(etaper) → { tilstand, harAabneEtaper, antal }
 *
 * Bookingens tilstand er AFLEDT af etaperne. Den lagres på bookingen som
 * denormaliseret felt, men skrives af PRÆCIS én ting: den Cloud Function der
 * skifter en etapetilstand, i samme transaktion. Samme mønster som kpi/ —
 * bookinger er allerede .write: false. Klienten kan altid genberegne og
 * kontrollere, så et felt der er drevet fra hinanden kan opdages.
 *
 * Reglen du skal huske: et forløb er først UDFØRT når hver eneste etape er
 * det. Er én etape stadig åben, er forløbet 'delvist' — ikke færdigt, og
 * ikke usynligt.
 */
export function forloebstilstand(etaper = []) {
  const alle = etaper.filter(Boolean);
  const aktive = alle.filter((e) => e.tilstand !== "annulleret");

  const antal = {
    ialt: alle.length,
    aabne: alle.filter((e) => e.tilstand === "aaben").length,
    udfoerte: alle.filter((e) => e.tilstand === "udfoert").length,
    annullerede: alle.length - aktive.length,
  };
  const svar = (tilstand) => ({ tilstand, harAabneEtaper: antal.aabne > 0, antal });

  if (!alle.length) return svar("kladde");
  if (!aktive.length) return svar("annulleret");

  /* Er alle etaper det samme, er forløbet det. Det dækker udfoert (alle
     kørt), reserveret (alle booket, ingen kørt) og afvist. */
  const unikke = new Set(aktive.map((e) => e.tilstand));
  if (unikke.size === 1) return svar(aktive[0].tilstand);

  /* Spredning, hvor noget er booket eller kørt: det er 'delvist'. Bemærk at
     udfoert+reserveret også hører her — etape 1 er kørt, etape 2 er kun
     booket, og forløbet er hverken færdigt eller bare reserveret. Uden det
     eget navn bliver et halvfærdigt forløb læst som færdigt. */
  if (aktive.some((e) => FAERDIG.has(e.tilstand))) return svar("delvist");

  /* Intet er booket endnu: forløbet står hvor den mindst fremskredne etape
     står. En afvist etape blandt åbne trækker ikke forløbet ned — den kan
     genåbnes, og de åbne venter stadig. */
  const laveste = aktive
    .filter((e) => e.tilstand in RANG)
    .sort((a, b) => RANG[a.tilstand] - RANG[b.tilstand])[0];
  return svar(laveste ? laveste.tilstand : "afventerPlan");
}

/* ---- Nummerserier (beslutning 8) ----------------------------------- */

/**
 * naesteNummer(db, path, { praefiks, serie })
 *   → "PRÆFIKS-ÅÅÅÅ-NNNNN"
 *
 * ÉT format, ÉN mekanisme: en counter i en transaction, aldrig en optælling
 * af eksisterende poster. Serien er nøglen under countere/, præfikset er det
 * der står i nummeret — de er adskilt, fordi to serier kan dele præfiks-logik
 * uden at dele tæller.
 *
 * ⚠ Et nummer fra denne serie er FORTLØBENDE og dermed gætbart: findes
 * FLT-2026-00381, findes 00382 også. Det er i orden så længe nummeret
 * behandles som en ADRESSE og ikke som en hemmelighed. Beslutning 20 hænger
 * på det: et sagsnummer i et emnefelt må aldrig i sig selv give adgang til
 * noget — afsenderen skal valideres uafhængigt. Læg ikke et tilfældigt token
 * ind i nummeret for at "gøre det sikrere"; det ville bryde formatet her og
 * alligevel ikke flytte kontrollen hen hvor den hører hjemme.
 */
export async function naesteNummer(db, path, { praefiks, serie, rod = null }) {
  if (!praefiks || !serie) throw new Error("naesteNummer: praefiks og serie er påkrævede.");
  const aar = new Date().getFullYear();
  /* `rod` gør counteren GLOBAL i stedet for tenant-scoped.
     Supportsager er VORES numre, ikke kundens: to tenants må ikke kunne få
     samme sagsnummer, for så kan to sager ikke skelnes i en samtale med den
     ene af dem. Derfor support/countere/… og ikke tenants/<t>/countere/….
     Alt andet — bookinger, sager, indkøb — hører i tenanten, hvor to kunder
     GERNE må have hver sit BKG-2026-00125. */
  const sti = rod ? `${rod}/countere/${serie}/${aar}` : path(`countere/${serie}/${aar}`);
  const ref = db.ref(sti);
  const res = await ref.transaction((n) => (n || 0) + 1);
  return `${praefiks}-${aar}-${String(res.snapshot.val()).padStart(5, "0")}`;
}

/** Bookingnumre. Wrapper om naesteNummer — samme counter som før
 *  (countere/booking/<år>), så eksisterende tællere er uberørte. */
export const naesteBookingnummer = (db, path) =>
  naesteNummer(db, path, { praefiks: "BKG", serie: "booking" });


/* ══════════════════════════════════════════════════════════════════════════
   AT OPRETTE EN BOOKING — beslutning 55

   ⚠ EN BOOKING ER ET FORLØB, OG DEN KAN IKKE OPRETTES ALENE.
   Beslutning 16: det man disponerer er en ETAPE, og bookingen er forløbet de
   hænger på. En booking uden etaper ville være en forespørgsel ingen kan
   planlægge — og `forloebstilstand([])` svarer allerede `kladde` på præcis
   den tomme liste. Derfor skrives bookingen og dens etaper SAMMEN eller slet
   ikke, som opgaven og dens reservation (45).

   ⚠ OG TILSTANDEN SÆTTES IKKE — DEN REGNES.
   Beslutning 40: bookingens tilstand er AFLEDT af etaperne. Kunne den sættes
   her, ville der være to veje til ét felt, og den ene ville før eller siden
   være uenig med den anden. `bookingOpdatering()` kalder derfor
   `forloebstilstand()` på de etaper den selv er ved at skrive.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ EN NY BOOKING BEGYNDER SOM `kladde`, OG DET ER IKKE ET VALG.
 *
 * Alt andet ville springe et led over i maskinen: `afventerPlan` betyder at
 * en casehandler har SENDT den til planlægning, og det skift er en handling
 * med sin egen permission (`booking.opret` på overgangen). Kunne
 * oprettelsen sætte den direkte, ville "gem kladde" og "send til
 * planlægning" være den samme knap — og en halvfærdig forespørgsel ville
 * lande hos disponenten.
 */
export const NY_ETAPE_TILSTAND = "kladde";

/**
 * valideBooking(post, { kunder, etaper }) → { ok, fejl }
 *
 * `fejl` er et map felt → sætning, som `valideOpgaveplan()`. Serveren kalder
 * den SAMME funktion og afviser med den samme sætning.
 *
 * `kunder` er en liste af id'er. Sendes den ikke med, springes
 * eksistenstjekket over: klienten har listen i hånden, serveren slår op i
 * basen, og ingen af de to gætter på den andens vegne.
 */
export function valideBooking(post = {}, { kunder = null } = {}) {
  const f = {};

  if (!post.kundeId) {
    f.kundeId = "Vælg hvilken kunde forespørgslen hører til.";
  } else if (kunder && !kunder.includes(post.kundeId)) {
    f.kundeId = "Ukendt kunde.";
  }

  /* ⚠ DIVISIONEN KAN IKKE UDLEDES AF KUNDEN. Samme grund som på opgaven:
     stamdata bærer ikke feltet (beslutning 19), og en booking der arvede den
     fra kunden, ville genindføre koblingen. */
  if (!["gods", "bus", "faelles"].includes(post.division)) {
    f.division = "Vælg hvilken division der bærer forløbet.";
  }

  if (!post.fraSted?.trim()) f.fraSted = "Hvor skal godset hentes?";
  if (!post.tilSted?.trim()) f.tilSted = "Hvor skal det leveres?";

  if (!ALLE_TRANSPORTTYPER.includes(post.transporttype)) {
    f.transporttype = "Vælg hvilken slags transport det er.";
  }
  if (post.rutepraeference != null && !ALLE_RUTEPRAEFERENCER.includes(post.rutepraeference)) {
    f.rutepraeference = "Ukendt rutepræference.";
  }

  /* ⚠ FLEKSIBILITETEN ER PÅKRÆVET, OG DEN GÆTTES IKKE. Uden et spænd kan
     matchningen ikke lægge to forsendelser sammen, og hver forespørgsel bliver
     sin egen tur. En default på "fast" ville se ud som et svar kunden havde
     givet — og det er det dyreste af de fire. */
  for (const felt of ["afhentningFleks", "leveringFleks"]) {
    if (!ALLE_FLEKSIBILITETER.includes(post[felt])) {
      f[felt] = "Vælg hvor meget tidspunktet må rykke sig. Uden det kan turen ikke lægges sammen med andre.";
    }
  }

  /* ⚠ ØNSKET AFHENTNING SKAL LIGGE FØR LEVERING. To tidspunkter i den forkerte
     rækkefølge kan ikke planlægges, og fejlen ville først vise sig som en
     etape hvor `til` er mindre end `fra` — dér hvor reglen afviser den, langt
     fra det felt der blev tastet forkert. */
  const a = post.onsketAfhentningMs, l = post.onsketLeveringMs;
  if (a != null && !Number.isFinite(a)) f.onsketAfhentningMs = "Ugyldigt tidspunkt.";
  if (l != null && !Number.isFinite(l)) f.onsketLeveringMs = "Ugyldigt tidspunkt.";
  if (Number.isFinite(a) && Number.isFinite(l) && l <= a) {
    f.onsketLeveringMs = "Levering skal ligge efter afhentning.";
  }

  /* ⚠ BELØBET ER ØRE SOM HELTAL. En float bliver 1849,999 i en sum — og det
     her tal ender på et fakturagrundlag. */
  if (post.omsaetningOere != null
      && (!Number.isFinite(post.omsaetningOere) || post.omsaetningOere % 1 !== 0
          || post.omsaetningOere < 0)) {
    f.omsaetningOere = "Beløbet skal være hele ører.";
  }

  if (typeof post.kundekrav === "string" && post.kundekrav.length > 500) {
    f.kundekrav = "Højst 500 tegn.";
  }
  if (typeof post.kundeRef === "string" && post.kundeRef.length > 60) {
    f.kundeRef = "Højst 60 tegn.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * bookingOpdatering(bookingId, etapeIder, post, { uid, nu, nummer })
 *   → { opdatering, booking, etaper }
 *
 * BYGGER, SKRIVER IKKE — samme mønster som `flytOpdatering()`, og af samme
 * grund: funktionen er ren og kender ingen database, så regnestykket kan
 * prøves uden en emulator.
 *
 * ⚠ ÉN ETAPE PR. STRÆKNING, OG MINDST ÉN. Kalderen bestemmer hvor mange;
 * en forespørgsel fra skærmen har én (fra → til), og et kombineret forløb
 * kan have flere. Er listen tom, kastes der — en booking uden etaper er en
 * forespørgsel ingen kan planlægge.
 */
export function bookingOpdatering(bookingId, etapeIder, post, { uid, nu, nummer }) {
  if (!bookingId) throw new Error("bookingOpdatering: bookingId mangler.");
  if (!Array.isArray(etapeIder) || !etapeIder.length) {
    throw new Error("bookingOpdatering: en booking uden etaper kan ikke planlægges.");
  }
  if (!nummer) throw new Error("bookingOpdatering: nummeret kommer fra counteren.");

  const straekninger = post.straekninger?.length
    ? post.straekninger
    : [{ fraSted: post.fraSted, tilSted: post.tilSted }];
  if (straekninger.length !== etapeIder.length) {
    throw new Error("bookingOpdatering: der skal være ét id pr. strækning.");
  }

  const etaper = straekninger.map((s, i) => {
    const e = {
      bookingId,
      nr: i + 1,
      tilstand: NY_ETAPE_TILSTAND,
      division: post.division,
      fraSted: s.fraSted,
      tilSted: s.tilSted,
      oprettetAf: uid,
      oprettetMs: nu,
    };
    /* ⚠ FRA OG SENEST SÆTTES KUN PÅ FØRSTE OG SIDSTE, og kun hvis kunden har
       ønsket et tidspunkt. Et forløb med tre etaper har ét afhentnings- og ét
       leveringsønske — mellemtiderne er noget disponenten finder, ikke noget
       kunden har sagt. Gættede vi dem, ville et forslag blive prøvet mod et
       vindue ingen har besluttet. */
    if (i === 0 && Number.isFinite(post.onsketAfhentningMs)) e.fra = post.onsketAfhentningMs;
    if (i === straekninger.length - 1 && Number.isFinite(post.onsketLeveringMs)) {
      e.senestMs = post.onsketLeveringMs;
    }
    return e;
  });

  /* ⚠ TILSTANDEN REGNES AF ETAPERNE — beslutning 40. Se hovedet. */
  const forloeb = forloebstilstand(etaper);

  const booking = {
    nummer,
    kundeId: post.kundeId,
    division: post.division,
    tilstand: forloeb.tilstand,
    harAabneEtaper: forloeb.harAabneEtaper,
    fraSted: post.fraSted,
    tilSted: post.tilSted,
    transporttype: post.transporttype,
    oprettetAf: uid,
    oprettetMs: nu,
  };
  /* Valgfrie felter udelades frem for at stå tomme: et felt der ikke blev
     udfyldt, er noget andet end et felt der blev udfyldt med ingenting — og
     RTDB sletter alligevel et null. */
  const maaske = {
    rutepraeference: post.rutepraeference,
    omsaetningOere: post.omsaetningOere,
    onsketAfhentningMs: post.onsketAfhentningMs,
    afhentningFleks: post.afhentningFleks,
    onsketLeveringMs: post.onsketLeveringMs,
    leveringFleks: post.leveringFleks,
    kundekrav: post.kundekrav?.trim() || undefined,
    kundeRef: post.kundeRef?.trim() || undefined,
  };
  for (const [k, v] of Object.entries(maaske)) if (v != null && v !== "") booking[k] = v;
  if (post.krav?.length) booking.krav = post.krav;

  const opdatering = { [`bookinger/${bookingId}`]: booking };
  etapeIder.forEach((id, i) => { opdatering[`etaper/${id}`] = etaper[i]; });

  return { opdatering, booking, etaper };
}


/* ══════════════════════════════════════════════════════════════════════════
   FORSLAGET — beslutning 58

   ⚠ ET FORSLAG ER IKKE EN RESERVATION. Det siger hvem og hvad der KUNNE køre
   turen; først når koordinatoren godkender, bindes ressourcerne. Derfor
   spærrer et forslag ingenting, og derfor kan der ligge tre ad gangen.

   ⚠ OG DISPONENTEN MÅ IKKE GODKENDE SIT EGET — beslutning 5. Det er hele
   grunden til at forslaget og godkendelsen er to skridt: `booking.foreslaa`
   skriver forslaget, `booking.godkend` vælger det.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ FORSLAGENE ER NØGLET PÅ DERES EGET id — DE ER IKKE EN ARRAY.
 *
 * RTDB har ingen arrays: en array skrevet råt bliver til et objekt med
 * nøglerne "0", "1", "2", og de nøgler FLYTTER SIG når en post fjernes. Det
 * er ikke teoretisk her — regelfilen kræver at `valgtForslagId` peger på en
 * nøgle der findes, og et valg der pegede på "1", ville pege på et andet
 * forslag i det øjeblik det første blev trukket tilbage.
 *
 * Målt i DEV før rettelsen: `et-004/forslag` lå med nøglerne 0, 1, 2 og
 * bar sit `id` INDE i objektet — en form regelfilens `$andet: false` afviser,
 * og som `valgtForslagId` aldrig kunne matche. `etapeskift` fandt alligevel
 * forslaget, fordi den søgte på `f.id` frem for på nøglen; serveren og reglen
 * var altså uenige om hvor forslagets identitet bor.
 *
 * Funktionen her er det ene sted formen oversættes til en liste — sorteret på
 * `nr`, så to skærme ikke viser forslagene i hver sin rækkefølge.
 */
export function forslagListe(etape) {
  const f = etape?.forslag;
  if (!f) return [];
  return Object.entries(f)
    .map(([id, v]) => ({ ...v, id }))
    .sort((a, b) => (a.nr ?? 0) - (b.nr ?? 0));
}

/**
 * ⚠ ET FORSLAG SKRIVES KUN HVOR DISPONENTEN ARBEJDER.
 *
 * `afventerPlan` (den er sendt til planlægning), `aaben` (den venter på en
 * passende tur) og `returneret` (koordinatoren har sendt den tilbage). IKKE
 * `afventerKoord`: dér står koordinatoren og tager stilling, og et forslag
 * der kom til undervejs, ville ændre det der bliver besluttet — under den der
 * beslutter. Og ikke `kladde`: en forespørgsel der ikke er sendt til
 * planlægning, er ikke disponentens endnu.
 */
/**
 * ⚠ ET TRUKKET FORSLAG BLIVER LIGGENDE — beslutning 59.
 *
 * Det slettes ikke: et forslag koordinatoren HAR set, og som saa forsvandt,
 * kan ikke forklares et halvt år senere. Det er samme regel som på etapens
 * historik, og samme svar som beslutning 53 gav på hardsletning i det hele
 * taget — en post tages ud af drift med en status, ikke ved at forsvinde.
 */
export const erTrukket = (f) => Number.isFinite(f?.trukketMs);

/** De forslag der stadig gælder. Det er DEM loftet tælles på. */
export const aktiveForslag = (etape) => forslagListe(etape).filter((f) => !erTrukket(f));

export const FORSLAGBARE_TILSTANDE = ["afventerPlan", "aaben", "returneret"];

/** Højst tre. Se valideForslag(). */
export const MAKS_FORSLAG = 3;

/**
 * valideForslag(forslag, etape, { biler, personale }) → { ok, fejl }
 *
 * Samme form og samme svar som `valideBooking()` og `valideOpgaveplan()`, og
 * serveren kalder den SAMME funktion.
 */
export function valideForslag(forslag = {}, etape = {}, { biler = null, personale = null } = {}) {
  const f = {};

  if (!FORSLAGBARE_TILSTANDE.includes(etape.tilstand)) {
    f.tilstand = etape.tilstand === "afventerKoord"
      ? "Koordinatoren er ved at tage stilling. Et nyt forslag hører til efter en returnering."
      : `Der kan ikke foreslås på en etape der er ${TILSTAND[etape.tilstand]?.label || etape.tilstand}.`;
  }

  /* ⚠ TRE ER LOFTET, OG DET ER EN BESLUTNING. Mockuppen viser 1-3, og
     koordinatoren skal kunne sammenligne dem uden at scrolle. Et fjerde
     forslag er ikke mere information — det er en beslutning der ikke er
     truffet. Trækkes et tilbage, bliver der plads igen. */
  /* ⚠ LOFTET TÆLLER DE AKTIVE. Talte det alle, ville et trukket forslag
     blive ved med at optage sin plads — og sætningen "træk et tilbage for at
     lave et nyt" ville være usand. Det var den blindgyde beslutning 59
     lukkede. */
  const findes = aktiveForslag(etape);
  if (findes.length >= MAKS_FORSLAG) {
    f._antal = `Der er allerede ${MAKS_FORSLAG} aktive forslag. Træk et tilbage for at lave et nyt.`;
  }

  const ider = Object.keys(forslag.koeretoejIder || {});
  if (!ider.length) {
    f.koeretoejIder = "Vælg mindst én enhed. En sættevogn er trækker PLUS trailer.";
  } else if (biler && ider.some((id) => !biler.includes(id))) {
    f.koeretoejIder = "Ukendt enhed.";
  }

  /* ⚠ CHAUFFØREN ER PÅKRÆVET — reglen kræver den, og et forslag uden en
     chauffør kan ikke blive til en reservation: `etapeskift` afviser det med
     "Forslaget mangler enten køretøj eller chauffør". Bedre at sige det her. */
  if (!forslag.personId) {
    f.personId = "Vælg hvem der kører.";
  } else if (personale && !personale.includes(forslag.personId)) {
    f.personId = "Ukendt medarbejder.";
  }

  const a = forslag.afhentningMs, l = forslag.leveringMs;
  if (!Number.isFinite(a)) f.afhentningMs = "Hvornår hentes godset?";
  if (!Number.isFinite(l)) f.leveringMs = "Hvornår leveres det?";
  if (Number.isFinite(a) && Number.isFinite(l) && l <= a) {
    f.leveringMs = "Levering skal ligge efter afhentning.";
  }

  /* ⚠ TRANSITTIDEN ER IKKE VINDUET. Et forslag der løber over 40 timer,
     betyder ikke at der køres i 40 — chaufføren sover undervejs, og
     køre-hviletidstjekket regner på KØRSEL. Det er samme skel som mellem en
     etapes vindue og dens `koerselMin`. */
  if (forslag.transitTimer != null
      && (!Number.isFinite(forslag.transitTimer) || forslag.transitTimer <= 0)) {
    f.transitTimer = "Transittiden er timer i kørsel — ikke hele vinduet.";
  }

  if (forslag.estimatOere != null
      && (!Number.isFinite(forslag.estimatOere) || forslag.estimatOere % 1 !== 0
          || forslag.estimatOere < 0)) {
    f.estimatOere = "Beløbet skal være hele ører.";
  }

  if (typeof forslag.note === "string" && forslag.note.length > 300) {
    f.note = "Højst 300 tegn.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * forslagOpdatering(etapeId, forslagId, forslag, etape) → { opdatering, post }
 *
 * BYGGER, SKRIVER IKKE — som `flytOpdatering()` og `bookingOpdatering()`.
 *
 * ⚠ NUMMERET ER EN PLADS I RÆKKEN, IKKE ET id. Koordinatoren taler om
 * "forslag 2", og nummeret skal derfor være stabilt for de forslag der ligger
 * der. Det tildeles som det næste ledige — ikke som `antal + 1`, for så ville
 * to forslag få nr. 3 hvis nr. 2 blev trukket tilbage.
 */
export function forslagOpdatering(etapeId, forslagId, forslag, etape = {}) {
  if (!etapeId || !forslagId) throw new Error("forslagOpdatering: id mangler.");

  /* ⚠ NUMRENE TÆLLES PÅ ALLE, OGSÅ DE TRUKNE. Koordinatoren har måske set
     "forslag 2"; genbrugte vi nummeret til et nyt, ville en samtale om
     forslag 2 pege på to forskellige ting. Pladsen bliver ledig, nummeret gør
     ikke. */
  const brugte = new Set(forslagListe(etape).map((f) => f.nr));
  let nr = 1;
  while (brugte.has(nr)) nr += 1;

  const post = {
    nr,
    koeretoejIder: forslag.koeretoejIder,
    personId: forslag.personId,
    afhentningMs: forslag.afhentningMs,
    leveringMs: forslag.leveringMs,
  };
  /* Valgfrie felter udelades frem for at stå tomme — RTDB sletter alligevel
     et null, og et felt der ikke blev udfyldt, er noget andet end et tomt. */
  if (Number.isFinite(forslag.transitTimer)) post.transitTimer = forslag.transitTimer;
  if (Number.isFinite(forslag.estimatOere)) post.estimatOere = forslag.estimatOere;
  if (forslag.note?.trim()) post.note = forslag.note.trim();

  return {
    /* ⚠ ÉN STI, OG DEN RØRER IKKE ETAPEN SELV. Et forslag ændrer ikke
       tilstanden — det er `etapeskift`s arbejde — og en opdatering der skrev
       begge dele, ville være to beslutninger i ét kald. */
    opdatering: { [`etaper/${etapeId}/forslag/${forslagId}`]: post },
    post,
  };
}

/**
 * kanTraekkeForslag(etape, forslagId) → { ok, aarsag }
 *
 * ⚠ SAMME TILSTANDE SOM DER MÅ SKRIVES I. Står etapen hos koordinatoren
 * (`afventerKoord`), ville et forslag der forsvandt undervejs, ændre det der
 * bliver besluttet — under den der beslutter. Skal det trækkes, returnerer
 * koordinatoren etapen først; det er netop hvad `returneret` er til.
 */
export function kanTraekkeForslag(etape = {}, forslagId) {
  if (!FORSLAGBARE_TILSTANDE.includes(etape.tilstand)) {
    return {
      ok: false,
      aarsag: etape.tilstand === "afventerKoord"
        ? "Koordinatoren er ved at tage stilling. Bed om at få etapen returneret først."
        : `Der kan ikke trækkes forslag på en etape der er ${TILSTAND[etape.tilstand]?.label || etape.tilstand}.`,
    };
  }
  const f = (etape.forslag || {})[forslagId];
  if (!f) return { ok: false, aarsag: "Forslaget findes ikke på etapen." };
  if (erTrukket(f)) return { ok: false, aarsag: "Forslaget er allerede trukket tilbage." };
  return { ok: true };
}

/**
 * traekOpdatering(etapeId, forslagId, { uid, nu }) → { opdatering }
 *
 * ⚠ TO FELTER, IKKE EN SLETNING. Og `valgtForslagId` ryddes hvis den peger på
 * netop dette forslag: et valg der pegede på noget trukket, ville være en
 * godkendelse der ventede på at ske. `etapeskift` afviser det også — men et
 * felt der peger på noget der ikke gælder, skal ikke blive stående og se
 * gyldigt ud.
 */
export function traekOpdatering(etapeId, forslagId, etape, { uid, nu }) {
  if (!etapeId || !forslagId) throw new Error("traekOpdatering: id mangler.");
  const opdatering = {
    [`etaper/${etapeId}/forslag/${forslagId}/trukketMs`]: nu,
    [`etaper/${etapeId}/forslag/${forslagId}/trukketAf`]: uid,
  };
  if (etape?.valgtForslagId === forslagId) {
    opdatering[`etaper/${etapeId}/valgtForslagId`] = null;
  }
  return { opdatering };
}
