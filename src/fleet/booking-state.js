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
