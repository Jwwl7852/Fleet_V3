/* src/fleet/audit-regler.js
 * Auditloggens POLITIK: vokabular, feltallowliste, før/efter og
 * retention-klasser.
 *
 * INGEN IMPORTS — samme grund som permissions.js. Den Cloud Function der
 * skriver loggen, skal filtrere før/efter mod NØJAGTIG samme allowliste som
 * klienten. Klientens filtrering er en bekvemmelighed; serverens er
 * kontrollen. To lister ville betyde, at det der slipper igennem den ene,
 * ender i loggen.
 *
 * Selve kaldet ligger i audit.js, som importerer firebase.
 */

/* Fast vokabular. Fritekst gør en log usøgbar, og så bliver den aldrig brugt
   til det den er lavet til. */
export const AUDIT = {
  opret: "opret",
  aendre: "aendre",
  slet: "slet",                 // altid soft delete på regnskabsdata
  laes: "laes",
  eksporter: "eksporter",
  tilstandsskift: "tilstandsskift",
  login: "login",
  adgangNaegtet: "adgangNaegtet",
};

/**
 * Felter hvis VÆRDI må stå i loggen.
 *
 * Alle ændrede felter navngives altid i `aendrede` — et feltnavn er ikke
 * følsomt. Kun felter herunder får deres før/efter-værdi med. Det er sådan
 * kravet om før/efter og kravet om ingen følsomme oplysninger kan opfyldes
 * samtidig.
 *
 * På listen: tal, tilstande, klassifikationer, tidspunkter og id'er — det man
 * skal kunne stille nogen til regnskab for.
 * Uden for listen: navne, adresser, noter, beskrivelser, begrundelser, al
 * fritekst. Begrundelser går ikke tabt: de står i objektets egen `historik`,
 * som også er append-only.
 *
 * Tilføjer du et felt her, gør du det læsbart for enhver med audit.laes.
 */
export const LOGBARE_FELTER = new Set([
  // beløb og mængder
  "beloebOere", "momsOere", "aftaltOere", "faktureretOere", "budgetOere",
  "omsaetningOere", "daekningsbidragOere", "kmPrisOere", "km", "antal",
  "kmEstimeret", "maengde", "doegnParkering",
  // tilstand og status
  "tilstand", "status", "aftalestatus", "aktiv", "annulleret", "slettet",
  "harAabneEtaper",
  // klassifikation
  "division", "art", "prisgruppe", "kategori", "type", "metode", "valuta",
  // tid
  "gyldigFra", "fra", "til", "senestMs", "aftaleUdloeberMs", "forfaldMs",
  "sidsteAktivitetMs", "friDage",
  // referencer og numre
  "nummer", "bookingId", "etapeNr", "kundeId", "koeretoejId", "personId",
  "lagerId", "leverandoerId", "valgtForslagId", "ressourceType", "ressourceId",
]);

/* ---- Retention ------------------------------------------------------ */

/**
 * ⚠ 24 er FORELØBIGT og skal afgøres juridisk før første betalende kunde.
 * Bogføringsloven trækker mod 5 år for det der rører regnskabsdata; GDPR
 * trækker mod kortere for personoplysninger. Det ender sandsynligvis med
 * forskellige tal pr. klasse — mekanismen er klar til det, tallene er ikke
 * besluttet. Se BESLUTNINGER.md.
 *
 * Retention varierer pr. KLASSE og ikke pr. handling, fordi partitionerne er
 * månedlige: en partition indeholder alle handlinger. Skulle grænsen variere
 * pr. handlingstype, kunne man ikke slette en hel partition, og så skal hver
 * enkelt post scannes. Klassen ligger derfor i STIEN —
 * audit/<tenantId>/<klasse>/<år>/<måned>/ — så sletning bliver én operation.
 */
export const RETENTION_MAANEDER = {
  drift: 24,
  regnskab: 24,     // bogføringsloven peger mod 60. Ikke afgjort.
  sikkerhed: 24,    // login og afviste forsøg holdes typisk længere. Ikke afgjort.
};

export const KLASSER = Object.keys(RETENTION_MAANEDER);

/* Objekter hvor en ændring rører regnskabsgrundlaget. */
const REGNSKABSOBJEKTER = new Set([
  "fakturaer", "indkoeb", "satser", "bookinger", "etaper", "countere",
]);

const SIKKERHEDSHANDLINGER = new Set([
  AUDIT.login, AUDIT.adgangNaegtet, AUDIT.eksporter,
]);

/** Hvilken retention-klasse — og dermed hvilken partition — en post hører i. */
export function klasseFor(handling, objekt) {
  if (SIKKERHEDSHANDLINGER.has(handling)) return "sikkerhed";
  if (REGNSKABSOBJEKTER.has(objekt)) return "regnskab";
  return "drift";
}

export const retentionFor = (klasse) =>
  RETENTION_MAANEDER[klasse] ?? RETENTION_MAANEDER.drift;

/* ---- Før/efter ------------------------------------------------------ */

const ens = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * diff(foer, efter) → { aendrede, foer, efter }
 *
 * aendrede: ALLE felter der har ændret sig, ved navn.
 * foer/efter: kun de af dem der står på LOGBARE_FELTER.
 *
 * Man kan altid se HVAD der blev rørt, og for det der betyder noget også
 * hvad det blev ændret fra og til.
 */
export function diff(foer, efter) {
  const a = foer || {};
  const b = efter || {};
  const noegler = new Set([...Object.keys(a), ...Object.keys(b)]);
  const aendrede = [];
  const foerUd = {};
  const efterUd = {};

  for (const n of noegler) {
    if (ens(a[n], b[n])) continue;
    aendrede.push(n);
    if (LOGBARE_FELTER.has(n)) {
      foerUd[n] = a[n] ?? null;
      efterUd[n] = b[n] ?? null;
    }
  }
  aendrede.sort();
  return { aendrede, foer: foerUd, efter: efterUd };
}
