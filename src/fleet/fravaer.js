/* src/fleet/fravaer.js
 * Ferie og fravær. Beslutning 4, 17 og 18 mødes her.
 *
 * FRAVÆR RAMMER ALLE MEDARBEJDERE, ikke kun chauffører. En lagermedarbejders
 * ferie skal blokere hende lige så meget som en chaufførs — ressourcen hedder
 * `medarbejder` og ikke `chauffoer` netop derfor (se RESSOURCE i
 * reservations.js). Hed den `chauffoer`, var halvdelen af personalet usynligt
 * for disponeringen.
 *
 * NØGLEN ER ET personId, ikke et uid og ikke et chauffoerId. `uid` er hvem der
 * GJORDE noget; `personId` er hvem det HANDLER OM. En chauffør har måske slet
 * intet login, og et fravær skal virke alligevel. Reglerne kræver `personId`.
 *
 * ⚠ ÅRSAGEN LIGGER I sensitive/fravaer/<id>. Reglerne afviser `art` i
 * general-noden med .validate: false, så den kan ikke ende her ved et uheld.
 * Disponeringen skal vide AT medarbejderen er utilgængelig 14.–18. juli —
 * ikke hvorfor.
 *
 * OG DET ER ALLE ÅRSAGER DER SKJULES, IKKE KUN SYGDOM. Det er ikke overdrevet
 * forsigtighed: viste vi `ferie` og `kursus` på general og skjulte kun
 * `sygdom`, ville et MANGLENDE felt betyde sygdom. Delvis afsløring lækker
 * gennem udeladelsen, og den der læser listen, kan regne resten ud. Enten er
 * hele feltet klassificeret, eller også er intet af det.
 */

import { RESSOURCE, KILDE, prioritetFor } from "./reservations.js";

const DAG = 86400000;

/* ---- Årsager. HØRER I sensitive/, aldrig i general. ------------------ */

/**
 * Vokabular for sensitive/fravaer/<id>.art.
 *
 * `sygdom` og `barnSyg` er helbredsoplysninger efter GDPR art. 9 — særlig
 * kategori. `barsel` er det i praksis også. De øvrige er det ikke, men de
 * ligger samme sted alligevel; se noten om udeladelse i toppen af filen.
 */
export const FRAVAER_ART = {
  sygdom:   { label: "Sygdom",            pill: "bad",  helbred: true },
  barnSyg:  { label: "Barns 1. sygedag",  pill: "bad",  helbred: true },
  barsel:   { label: "Barsel",            pill: "info", helbred: true },
  ferie:    { label: "Ferie",             pill: "ok",   helbred: false },
  kursus:   { label: "Kursus",            pill: "info", helbred: false },
  andet:    { label: "Andet",             pill: "info", helbred: false },
};

export const ALLE_FRAVAER_ARTER = Object.keys(FRAVAER_ART);

export const erHelbredsoplysning = (art) => Boolean(FRAVAER_ART[art]?.helbred);

/* ---- Tilstand. AFLEDT, aldrig gemt. ---------------------------------- */

/**
 * fravaerTilstand(f, nu) → "kommende" | "igangvaerende" | "afsluttet"
 *
 * Udledt af fra/til, ikke gemt som felt. Samme regel som at der ikke findes
 * en `forfalden`-tilstand på en etape: vi gemmer ikke det vi kan regne ud, og
 * et gemt statusfelt ville drive fra datoerne i det sekund nogen retter en
 * dato uden at røre feltet.
 *
 * ⚠ INTERVALLET ER HALVÅBENT: [fra, til). Et fravær der slutter kl. 00.00 den
 * 19. dækker til og med den 18. — se noten ved sidsteDag().
 */
export const TILSTAND = {
  kommende:      { label: "Kommende",      pill: "info" },
  igangvaerende: { label: "I gang",        pill: "warn" },
  afsluttet:     { label: "Afsluttet",     pill: "ok"   },
};

export function fravaerTilstand(f, nu = Date.now()) {
  if (nu < f.fra) return "kommende";
  if (nu < f.til) return "igangvaerende";
  return "afsluttet";
}

export const erAktivt = (f, nu = Date.now()) => nu >= f.fra && nu < f.til;

/* ---- Visning: inklusivt. Lagring: eksklusivt. ------------------------ */

/**
 * sidsteDag(f) → ms på den SIDSTE dag fraværet dækker.
 *
 * ⚠ DEN HER ER EN FÆLDE, OG DEN ER VÆRD AT LÆSE TO GANGE.
 *
 * Et fravær 14.–18. juli gemmes med til = 19. juli kl. 00.00, fordi
 * intervallet er halvåbent. Gemmer nogen i stedet den 18. kl. 00.00, er
 * medarbejderen ledig hele den 18. — og så kan en syg chauffør disponeres,
 * hvilket er præcis det denne skærm findes for at forhindre.
 *
 * Mennesket siger "til og med den 18.", maskinen regner på "før den 19.".
 * Vis det ene, gem det andet. Samme disciplin som meter mod millimeter på
 * flåden og kroner mod øre i beslutning 2.
 *
 * Trækker ét millisekund fra, så både et døgnjusteret og et vilkårligt
 * sluttidspunkt lander på den rigtige dato.
 */
export const sidsteDag = (f) => f.til - 1;

/** Antal påbegyndte kalenderdage. Til visning — ikke til lønberegning. */
export const varighedDage = (f) => Math.max(1, Math.ceil((f.til - f.fra) / DAG));

/** Overlapper to fravær? Samme halvåbne regel som overlapper() i
 *  reservations.js — to fravær på samme person i samme periode er en konflikt
 *  på en eksklusiv ressource, ikke bare et rod i data. */
export const overlapper = (a, b) => a.fra < b.til && b.fra < a.til;

/* ---- Reservationen --------------------------------------------------- */

/**
 * reservationFraFravaer(f) → posten reserver() skal skrive.
 *
 * BYGGER, SKRIVER IKKE. Samme mønster som reservationFraAftale() i sager.js:
 * konfliktkontrollen hører i en Cloud Function, fordi to skrivninger kan ramme
 * samme sekund, og et klientsidetjek ikke kan forhindre det.
 *
 * Prioriteten kommer fra reservations.js og skrives ikke her — 30 tastet ind
 * i en skærm er samme regel to steder.
 *
 * ⚠ HVERKEN NAVN ELLER ÅRSAG KOMMER MED. Reservationen er synlig for enhver
 * der kan læse reservationsnoden, og den er ikke klassificeret. Lagde vi
 * årsagen i `note` eller navnet i `kilde.reference`, ville helbredsoplysningen
 * være lækket ud af sensitive/ ad bagvejen — beslutning 17 omgået af en
 * bekvemmelighed. konfliktTekst() siger derfor "Medarbejderen har registreret
 * fravær i perioden" og ikke hvem eller hvorfor.
 */
export function reservationFraFravaer(f) {
  if (!f?.personId) throw new Error("reservationFraFravaer: fravær uden personId kan ikke reserveres.");
  if (!Number.isFinite(f.fra) || !Number.isFinite(f.til) || f.til <= f.fra) {
    throw new Error("reservationFraFravaer: fra og til skal være konkrete tidspunkter med til > fra.");
  }
  return {
    ressourceType: RESSOURCE.medarbejder,
    /* personId, ikke uid. Reservationen hænger på personen, ikke på kontoen —
       kontoen kan lukkes ved fratrædelse uden at et fravær fra i fjor
       forsvinder. */
    ressourceId: f.personId,
    fra: f.fra,
    til: f.til,
    kilde: { type: KILDE.fravaer, id: f.id, reference: null },
    maengde: null,
    note: null,
  };
}

/** Prioriteten for et fravær. Én kilde: reservations.js. */
export const fravaerPrioritet = () => prioritetFor(KILDE.fravaer);
