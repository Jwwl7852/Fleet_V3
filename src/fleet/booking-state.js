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

/* fra → [{ til, kraeverPerm, handling, kraeverForslag, kraeverBegrundelse }]
 *
 * kraeverPerm frem for en rolle-liste. Før stod der fire steder
 * `roller: [ROLLE.koordinator, ROLLE.admin]`, og admin skulle huskes på hver
 * eneste linje — glemte man den, kunne administratoren ikke rydde op. Nu har
 * admin-presettet alle permissions, og listerne kan ikke komme ud af sync.
 */
const OVERGANGE = {
  kladde: [
    { til: "afventerPlan", kraeverPerm: PERM.bookingOpret, handling: "Send til planlægning" },
    { til: "annulleret",   kraeverPerm: PERM.bookingOpret, handling: "Annullér" },
  ],
  afventerPlan: [
    { til: "afventerKoord", kraeverPerm: PERM.bookingForeslaa, handling: "Send forslag", kraeverForslag: true },
    { til: "afvist",        kraeverPerm: PERM.bookingAfvis, handling: "Kan ikke løses", kraeverBegrundelse: true },
  ],
  afventerKoord: [
    /* Bemærk: disponent-presettet har IKKE bookingGodkend. Den der har lavet
       forslaget må ikke godkende det — beslutning 5, nu som et felt der
       mangler i en liste frem for en kommentar om hvem der ikke står der. */
    { til: "reserveret",  kraeverPerm: PERM.bookingGodkend, handling: "Godkend valgt forslag", kraeverValgtForslag: true },
    { til: "returneret",  kraeverPerm: PERM.bookingReturner, handling: "Returnér til disponent", kraeverBegrundelse: true },
    { til: "afvist",      kraeverPerm: PERM.bookingAfvis, handling: "Afvis alle", kraeverBegrundelse: true },
  ],
  returneret: [
    { til: "afventerKoord", kraeverPerm: PERM.bookingForeslaa, handling: "Send nye forslag", kraeverForslag: true },
    { til: "afvist",        kraeverPerm: PERM.bookingAfvis, handling: "Kan ikke løses", kraeverBegrundelse: true },
  ],
  reserveret: [
    { til: "udfoert",    kraeverPerm: PERM.bookingUdfoer, handling: "Markér udført" },
    { til: "annulleret", kraeverPerm: PERM.bookingAnnuller, handling: "Annullér booking", kraeverBegrundelse: true },
  ],
  afvist: [
    { til: "afventerPlan", kraeverPerm: PERM.bookingOpret, handling: "Genåbn forespørgsel" },
  ],
  udfoert: [],
  annulleret: [],
};

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
 *  perms er claim-strengen fra auth.token.perms — eller et array. */
export function tilgaengeligeHandlinger(tilstand, perms) {
  return (OVERGANGE[tilstand] || []).filter((o) => harPerm(perms, o.kraeverPerm));
}

export function tilgaengeligeEtapeHandlinger(tilstand, perms) {
  return (ETAPE_OVERGANGE[tilstand] || []).filter((o) => harPerm(perms, o.kraeverPerm));
}

/* Én kontrol, to tabeller. Ellers driver reglerne fra hinanden, og så kan en
   disponent godkende sit eget forslag på en etape men ikke på en booking. */
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
 * kanSkifte(booking, tilTilstand, perms, { begrundelse })
 * → { ok, aarsag }
 *
 * perms er auth.token.perms-strengen, ikke en rolle. Det er den eneste måde
 * at sikre at UI'et og serveren spørger om det samme.
 */
export function kanSkifte(booking, tilTilstand, perms, opts = {}) {
  return pruvOvergang(OVERGANGE, booking, tilTilstand, perms, opts);
}

/** Samme kontrol på en etape. Bemærk kraeverFrist på vej til aaben. */
export function kanSkifteEtape(etape, tilTilstand, perms, opts = {}) {
  return pruvOvergang(ETAPE_OVERGANGE, etape, tilTilstand, perms, opts);
}

/**
 * Bygger den opdatering der skal skrives. Skriver ALTID til historik —
 * "Historik"-knappen i mockuppen skal have noget at vise, og en afvist
 * booking skal kunne forklares et halvt år senere.
 *
 * Selve skrivningen hører i en Cloud Function: rolletjek på klienten kan
 * omgås, og reservationen i reserveret-tilstanden skal oprettes atomisk
 * sammen med tilstandsskiftet.
 */
export function byggSkifte(booking, tilTilstand, { rolle, bruger, begrundelse, valgtForslagId }) {
  const nu = Date.now();
  return {
    tilstand: tilTilstand,
    valgtForslagId: valgtForslagId ?? booking.valgtForslagId ?? null,
    sidstAendretMs: nu,
    sidstAendretAf: bruger,
    [`historik/${nu}`]: {
      fra: booking.tilstand,
      til: tilTilstand,
      rolle,
      af: bruger,
      begrundelse: begrundelse || null,
      ms: nu,
    },
  };
}

/**
 * Samme for en etape. senestMs skrives med, når etapen sættes åben — det er
 * den frist matchningen og lagerprisen begge regner på.
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

/** Nummerserie. Bookingnumre skal komme fra en counter i en transaction,
 *  ikke fra en optælling af eksisterende bookinger. */
export async function naesteBookingnummer(db, path) {
  const aar = new Date().getFullYear();
  const ref = db.ref(path(`countere/booking/${aar}`));
  const res = await ref.transaction((n) => (n || 0) + 1);
  return `BKG-${aar}-${String(res.snapshot.val()).padStart(5, "0")}`;
}
