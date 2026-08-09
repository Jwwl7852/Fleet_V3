/* src/fleet/demo-indkoeb.js
 * Leverandører, indkøbslinjer, fakturaer og afstemning. Én fil, begge
 * Indkøb-skærme.
 *
 * ⚠ LEVERANDØRERNE ER KILDEN. De stod som fritekst i demo-vaerksted og
 * demo-facility — "Mercedes Greve", "Crawford Døre & Porte" — og hver fil
 * havde sin egen stavemåde at drive med. Nu peger de på et id herfra, og der
 * er en test der fastholder at hvert id kan slås op.
 *
 * ⚠ PRISER I ØRE. Mockuppens 18,50 kr/stk er 1850 øre. `prisPrEnhedOere` er
 * altid ekskl. moms, og linjens beløb beregnes — det gemmes ikke, så det ikke
 * kan drive fra antal × pris.
 *
 * ⚠ DIVISION ER PÅKRÆVET PÅ ET INDKØB. Reglerne validerer
 * hasChildren(['division']) på indkoeb/$id. Værdien kan ikke arves fra
 * køretøjet (beslutning 19) — den skal sættes af den der registrerer.
 *
 * ⚠ INGEN GEMTE TOTALER. Afstemningens tre summer regnes af listerne, og de
 * to afvigelser af summerne. Et gemt total ville kunne drive fra sine linjer,
 * og så mangler en post uden at nogen ser det.
 */
import { DEMO_KPI } from "./demo-kpi.js";
import {
  LEVERANDOER_KATEGORI, AFTALETYPE, FAKTURASTATUS,
  afstem, fakturaTotalOere, parterFraLeverandoer,
} from "./leverandoerer.js";

const DAG = 86400000;
const iDag = new Date();
iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();
const dag = (n) => D0 + n * DAG;

/* ---- Leverandører ------------------------------------------------------ */

/**
 * `division` beskriver LEVERANDØRENS forretning, ikke vores organisation —
 * se prøven i leverandoerer.js. Crawford leverer porte til begge slags
 * vognmænd og er derfor `faelles`; Mercedes Greve er et lastbilværksted.
 *
 * `kontaktEmail` bliver startlisten af parter på en sag (beslutning 20).
 */
export const DEMO_LEVERANDOERER = [
  { id: "lv-mercedes", navn: "Mercedes Greve", cvr: "18447291", kategori: "vaerksted",
    division: "gods", aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-400) },
    kontaktEmail: "service@mercedes-greve.dk", kontaktTelefon: "43 90 22 10" },
  { id: "lv-scania", navn: "Scania Kolding", cvr: "27118804", kategori: "vaerksted",
    division: "gods", aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-720) },
    kontaktEmail: "kolding@scania.dk", kontaktTelefon: "76 33 41 00" },
  { id: "lv-daf", navn: "DAF Trucks Fredericia", cvr: "30556612", kategori: "vaerksted",
    division: "gods", aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "service@daf-fredericia.dk", kontaktTelefon: "75 92 18 40" },
  { id: "lv-man", navn: "MAN Truck Center Horsens", cvr: "29844170", kategori: "vaerksted",
    division: "gods", aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-300) },
    kontaktEmail: "horsens@mantruck.dk", kontaktTelefon: "75 61 90 20" },
  { id: "lv-schmitz", navn: "Schmitz Service Padborg", cvr: "31220945", kategori: "vaerksted",
    division: "gods", aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "service@schmitz-padborg.dk", kontaktTelefon: "74 67 30 55" },
  { id: "lv-daekteam", navn: "Dækteam Vejle", cvr: "26719038", kategori: "daek",
    division: "faelles", aktiv: true, aftale: { type: "fastaftale", gyldigFra: dag(-540), rabatPct: 12 },
    kontaktEmail: "salg@daekteam-vejle.dk", kontaktTelefon: "75 82 66 14" },
  { id: "lv-applus", navn: "Applus Bilsyn Kolding", cvr: "30104786", kategori: "vaerksted",
    division: "faelles", aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "kolding@applusbilsyn.dk", kontaktTelefon: "70 22 21 20" },
  { id: "lv-scooter", navn: "Scootercenter Kolding", cvr: "33918822", kategori: "vaerksted",
    division: "faelles", aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "vaerksted@scootercenter-kolding.dk", kontaktTelefon: "75 50 12 88" },
  { id: "lv-crawford", navn: "Crawford Døre & Porte", cvr: "19477320", kategori: "facility",
    division: "faelles", aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-620) },
    kontaktEmail: "service@crawford.dk", kontaktTelefon: "70 15 30 40" },
  { id: "lv-koelecenter", navn: "Kølecenter Syd", cvr: "28660314", kategori: "facility",
    division: "faelles", aktiv: true, aftale: { type: "fastaftale", gyldigFra: dag(-380), rabatPct: 8 },
    kontaktEmail: "service@koelecentersyd.dk", kontaktTelefon: "74 52 88 90" },
  { id: "lv-wash", navn: "Wash Systems A/S", cvr: "25901147", kategori: "facility",
    division: "faelles", aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "support@washsystems.dk", kontaktTelefon: "86 12 44 70" },
  { id: "lv-gulv", navn: "Dansk Gulvteknik", cvr: "32770158", kategori: "facility",
    division: "faelles", aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "info@danskgulvteknik.dk", kontaktTelefon: "70 26 11 05" },
  { id: "lv-clever", navn: "Clever Service", cvr: "33251290", kategori: "facility",
    division: "faelles", aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-210) },
    kontaktEmail: "erhverv@clever.dk", kontaktTelefon: "82 30 30 30" },
  { id: "lv-hydra", navn: "Hydra-Grene Kolding", cvr: "17293355", kategori: "reservedele",
    division: "gods", aktiv: true, aftale: { type: "fastaftale", gyldigFra: dag(-800), rabatPct: 15 },
    kontaktEmail: "kolding@hydra-grene.dk", kontaktTelefon: "97 35 05 00" },
  { id: "lv-circlek", navn: "Circle K Erhverv", cvr: "26147847", kategori: "braendstof",
    division: "faelles", aktiv: true, aftale: { type: "fastaftale", gyldigFra: dag(-900) },
    kontaktEmail: "erhverv@circlek.dk", kontaktTelefon: "70 10 20 30" },
  { id: "lv-kontorland", navn: "Kontorland A/S", cvr: "21883016", kategori: "kontor",
    division: "faelles", aktiv: false, aftale: { type: "spot" },
    kontaktEmail: "salg@kontorland.dk", kontaktTelefon: "86 44 12 00" },
];

/* ---- Indkøbslinjer ----------------------------------------------------- */

/**
 * `prisPrEnhedOere` er ekskl. moms. Linjens beløb BEREGNES af antal × pris —
 * gemte vi det, kunne de to drive fra hinanden.
 *
 * Mockuppens 18,50 kr/stk står som 1850. En float her ville ende som 1849,999
 * i en sum over hundrede linjer.
 */
export const DEMO_INDKOEBSLINJER = [
  { id: "il-001", dato: dag(-2), leverandoerId: "lv-hydra", division: "gods",
    vare: "Hydraulikslange 3/8\"", kategori: "reservedele", antal: 12, enhed: "stk",
    prisPrEnhedOere: 1850, lokationId: "lok-kolding",
    fakturastatus: "modtaget", godkendtAf: "Søren Dahl", godkendtMs: dag(-1) },
  { id: "il-002", dato: dag(-3), leverandoerId: "lv-daekteam", division: "bus",
    vare: "Dæk 315/70 R22.5", kategori: "daek", antal: 4, enhed: "stk",
    prisPrEnhedOere: 412500, lokationId: "lok-kolding",
    fakturastatus: "modtaget", godkendtAf: null, godkendtMs: null },
  { id: "il-003", dato: dag(-4), leverandoerId: "lv-circlek", division: "gods",
    vare: "Diesel B7", kategori: "braendstof", antal: 4820, enhed: "liter",
    prisPrEnhedOere: 1142, lokationId: "lok-kolding",
    fakturastatus: "bogfoert", godkendtAf: "Anne Bøgh", godkendtMs: dag(-3) },
  { id: "il-004", dato: dag(-5), leverandoerId: "lv-hydra", division: "gods",
    vare: "Bremseklods, aksel 2", kategori: "reservedele", antal: 8, enhed: "sæt",
    prisPrEnhedOere: 78500, lokationId: "lok-halb",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },
  { id: "il-005", dato: dag(-6), leverandoerId: "lv-crawford", division: "faelles",
    vare: "Portmotor, reservedel", kategori: "facility", antal: 1, enhed: "stk",
    prisPrEnhedOere: 1284000, lokationId: "lok-halb",
    fakturastatus: "modtaget", godkendtAf: "Benjamin Holm", godkendtMs: dag(-5) },
  { id: "il-006", dato: dag(-7), leverandoerId: "lv-koelecenter", division: "faelles",
    vare: "Kølemiddel R452A", kategori: "facility", antal: 25, enhed: "kg",
    prisPrEnhedOere: 34800, lokationId: "lok-halb",
    fakturastatus: "godkendt", godkendtAf: "Benjamin Holm", godkendtMs: dag(-6) },
  { id: "il-007", dato: dag(-8), leverandoerId: "lv-circlek", division: "bus",
    vare: "AdBlue", kategori: "braendstof", antal: 900, enhed: "liter",
    prisPrEnhedOere: 682, lokationId: "lok-aalborg",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },
  { id: "il-008", dato: dag(-9), leverandoerId: "lv-hydra", division: "gods",
    vare: "Luftfilter", kategori: "reservedele", antal: 6, enhed: "stk",
    prisPrEnhedOere: 24900, lokationId: "lok-kolding",
    fakturastatus: "bogfoert", godkendtAf: "Søren Dahl", godkendtMs: dag(-8) },
  { id: "il-009", dato: dag(-11), leverandoerId: "lv-daekteam", division: "gods",
    vare: "Dæk 385/65 R22.5", kategori: "daek", antal: 2, enhed: "stk",
    prisPrEnhedOere: 498000, lokationId: "lok-kolding",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },
  { id: "il-010", dato: dag(-13), leverandoerId: "lv-kontorland", division: "faelles",
    vare: "Kontorartikler, diverse", kategori: "kontor", antal: 1, enhed: "pk",
    prisPrEnhedOere: 184500, lokationId: "lok-kolding",
    fakturastatus: "afvist", godkendtAf: null, godkendtMs: null },
];

/** BEREGNET, aldrig gemt. */
export const linjeBeloebOere = (l) => (l.antal || 0) * (l.prisPrEnhedOere || 0);

/* ---- Fakturaer --------------------------------------------------------- */

/**
 * `beloebOere` er ALTID ekskl. moms; `momsOere` er et separat felt. Mockuppen
 * viste ét beløb inkl. moms, og blandes de, lægges inkl.-tal sammen med
 * ekskl.-tal i en rapport (beslutning 2).
 *
 * `sagsnummer` er beslutning 20: en faktura der kom ind på en sag, skal kunne
 * spores tilbage til den tråd der aftalte arbejdet.
 */
export const DEMO_FAKTURAER = [
  { id: "fa-9001", leverandoerId: "lv-scania", fakturanummer: "SK-2026-4471",
    fakturadatoMs: dag(-22), forfaldMs: dag(8), status: "bogfoert",
    beloebOere: 1842500, momsOere: 460625, indkoebId: "ik-001", sagsnummer: null },
  { id: "fa-9002", leverandoerId: "lv-daekteam", fakturanummer: "DV-88213",
    fakturadatoMs: dag(-9), forfaldMs: dag(21), status: "modtaget",
    beloebOere: 2960000, momsOere: 740000, indkoebId: "il-002", sagsnummer: null },
  { id: "fa-9003", leverandoerId: "lv-daf", fakturanummer: "DAF-2026-1188",
    fakturadatoMs: dag(-1), forfaldMs: dag(29), status: "modtaget",
    beloebOere: 1215000, momsOere: 303750, indkoebId: null, sagsnummer: null },
  { id: "fa-9004", leverandoerId: "lv-crawford", fakturanummer: "CR-551204",
    fakturadatoMs: dag(-4), forfaldMs: dag(26), status: "modtaget",
    beloebOere: 1284000, momsOere: 321000, indkoebId: "il-005",
    /* Kom ind på en sag — se demo-sag.js og Værkstedskalenders sagsvisning. */
    sagsnummer: "FAC-2026-00127" },
  { id: "fa-9005", leverandoerId: "lv-circlek", fakturanummer: "CK-2026-77120",
    fakturadatoMs: dag(-3), forfaldMs: dag(12), status: "godkendt",
    beloebOere: 5504440, momsOere: 1376110, indkoebId: "il-003", sagsnummer: null },
  { id: "fa-9006", leverandoerId: "lv-koelecenter", fakturanummer: "KS-4412",
    fakturadatoMs: dag(-6), forfaldMs: dag(24), status: "godkendt",
    beloebOere: 870000, momsOere: 217500, indkoebId: "il-006", sagsnummer: null },
  { id: "fa-9007", leverandoerId: "lv-kontorland", fakturanummer: "KL-9982",
    fakturadatoMs: dag(-12), forfaldMs: dag(18), status: "afvist",
    beloebOere: 184500, momsOere: 46125, indkoebId: "il-010", sagsnummer: null },
  { id: "fa-9008", leverandoerId: "lv-schmitz", fakturanummer: "SSP-70412",
    fakturadatoMs: dag(0), forfaldMs: dag(30), status: "modtaget",
    beloebOere: 3480000, momsOere: 870000, indkoebId: null, sagsnummer: null },
];

/* ---- Afstemning: TRE TOTALER, TO AFVIGELSER ---------------------------- */

/**
 * ⚠ TRE PERIODEOPGØRELSER — IKKE SUMMER AF LISTERNE OVENFOR.
 *
 * Linjerne og fakturaerne i denne fil er et UDSNIT på ti og otte poster, som
 * alle andre demo-sæt. Afstemningen dækker hele perioden, og de tre tal kommer
 * hver sit sted fra:
 *
 *   registrerede   vores egne indkøbsregistreringer
 *   modtagne       leverandørernes fakturaer
 *   bogførte       regnskabssystemets opgørelse — IKKE afledt af de to andre
 *
 * At bogført er en selvstændig kilde er hele grunden til at de tre kan være
 * uenige. Beregnede vi den af de andre, ville afstemningen altid gå op, og så
 * var der intet at afstemme.
 *
 * Tallene er mockuppens, så rekonstruktionen kan efterprøves:
 *   9.842.250 − 9.781.625 = 60.625 kr manglende fakturaer
 *   9.781.625 − 9.765.125 = 16.500 kr ikke bogført
 */
export const DEMO_AFSTEMNING = {
  registreredeIndkoebOere: 984225000,
  modtagneFakturaerOere: 978162500,
  bogfoertOere: 976512500,
};

/** Afvigelserne beregnes. Se afstem() for hvorfor de har hvert sit navn. */
export const demoAfstemning = () => afstem(DEMO_AFSTEMNING);

/* ---- Opslag ------------------------------------------------------------ */

export const demoLeverandoer = (id) => DEMO_LEVERANDOERER.find((l) => l.id === id) || null;

export const demoFakturaerFor = (leverandoerId) =>
  DEMO_FAKTURAER.filter((f) => f.leverandoerId === leverandoerId);

/** Fakturaer uden match mod et registreret indkøb. Det er dem "manglende
 *  match" tæller — BEREGNET af listen, ikke gemt. */
export const demoUdenMatch = () => DEMO_FAKTURAER.filter((f) => !f.indkoebId && f.status !== "afvist");

/* ---- Selvkontrol ------------------------------------------------------- */

if (import.meta.env?.DEV) {
  const lvIder = new Set(DEMO_LEVERANDOERER.map((l) => l.id));
  const linjeIder = new Set(DEMO_INDKOEBSLINJER.map((l) => l.id));

  for (const l of DEMO_LEVERANDOERER) {
    if (!LEVERANDOER_KATEGORI[l.kategori]) {
      console.warn(`demo-indkoeb: ${l.id} har ukendt kategori "${l.kategori}".`);
    }
    if (!AFTALETYPE[l.aftale?.type]) {
      console.warn(`demo-indkoeb: ${l.id} har ukendt aftaletype "${l.aftale?.type}".`);
    }
    /* Division BESKRIVER LEVERANDØRENS FORRETNING — se prøven i
       leverandoerer.js. Den er tilladt her, modsat på personale og køretøjer. */
    if (!["gods", "bus", "faelles"].includes(l.division)) {
      console.warn(`demo-indkoeb: ${l.id} har ugyldig division "${l.division}".`);
    }
    /* E-mailen bliver sagens startliste af parter (beslutning 20). Mangler
       den, kan en sag på leverandøren ikke tage imod svar. */
    if (!parterFraLeverandoer(l).length) {
      console.warn(
        `demo-indkoeb: ${l.id} har ingen kontaktEmail. En sag på leverandøren ville ` +
        `have en tom parter[] og sætte hvert svar i karantæne.`
      );
    }
  }

  for (const l of DEMO_INDKOEBSLINJER) {
    if (!lvIder.has(l.leverandoerId)) {
      console.warn(`demo-indkoeb: linje ${l.id} peger på ukendt leverandør "${l.leverandoerId}".`);
    }
    if (!["gods", "bus", "faelles"].includes(l.division)) {
      console.warn(
        `demo-indkoeb: linje ${l.id} mangler gyldig division. Reglerne kræver den på ` +
        `indkoeb/, og den kan ikke arves fra køretøjet (beslutning 19).`
      );
    }
    if (!Number.isInteger(l.prisPrEnhedOere) || l.prisPrEnhedOere < 0) {
      console.warn(
        `demo-indkoeb: linje ${l.id} har prisPrEnhedOere=${l.prisPrEnhedOere}. ` +
        `Hele øre som integer — 18,50 kr er 1850, aldrig 18.5.`
      );
    }
    if (!FAKTURASTATUS[l.fakturastatus]) {
      console.warn(`demo-indkoeb: linje ${l.id} har ukendt fakturastatus "${l.fakturastatus}".`);
    }
    if ("beloebOere" in l) {
      console.warn(
        `demo-indkoeb: linje ${l.id} har et GEMT beløb. Det beregnes af antal × pris ` +
        `— to kilder kan drive fra hinanden.`
      );
    }
  }

  for (const f of DEMO_FAKTURAER) {
    if (!lvIder.has(f.leverandoerId)) {
      console.warn(`demo-indkoeb: faktura ${f.id} peger på ukendt leverandør.`);
    }
    if (!FAKTURASTATUS[f.status]) {
      console.warn(`demo-indkoeb: faktura ${f.id} har ukendt status "${f.status}".`);
    }
    if (!Number.isInteger(f.beloebOere) || !Number.isInteger(f.momsOere)) {
      console.warn(`demo-indkoeb: faktura ${f.id} har beløb der ikke er hele øre.`);
    }
    if ("totalOere" in f || "beloebInklMoms" in f) {
      console.warn(
        `demo-indkoeb: faktura ${f.id} har en gemt total. beloebOere er ekskl. moms, ` +
        `momsOere står for sig, og totalen beregnes (beslutning 2).`
      );
    }
    /* Momsen skal svare til 25 % — fanger et beløb hvor moms og beløb er
       byttet om, eller hvor nogen har gemt inkl.-tallet i beloebOere. */
    if (f.momsOere !== Math.round(f.beloebOere * 0.25)) {
      console.warn(`demo-indkoeb: faktura ${f.id} har moms der ikke er 25 % af beløbet.`);
    }
    if (f.indkoebId && !linjeIder.has(f.indkoebId) && !f.indkoebId.startsWith("ik-")) {
      console.warn(`demo-indkoeb: faktura ${f.id} matcher et indkøb der ikke findes.`);
    }
  }

  /* Uden en faktura uden match kan "manglende match" ikke ses virke. */
  if (!demoUdenMatch().length) {
    console.warn(`demo-indkoeb: ingen faktura mangler match — tallet kan ikke ses virke.`);
  }
  /* Og uden en sagsmærket faktura kan sporet til beslutning 20 ikke ses. */
  if (!DEMO_FAKTURAER.some((f) => f.sagsnummer)) {
    console.warn(`demo-indkoeb: ingen faktura bærer et sagsnummer.`);
  }

  /* Afvigelsen der stod i mockuppen. Holder rekonstruktionen ikke, er noten
     i afstem() forkert. */
  const a = demoAfstemning();
  if (a.ikkeBogfoertOere <= 0 || a.manglendeFakturaerOere <= 0) {
    console.warn(
      `demo-indkoeb: afstemningen giver ${a.manglendeFakturaerOere} og ${a.ikkeBogfoertOere}. ` +
      `Begge afvigelser skal være positive, ellers kan de to handlinger ikke vises.`
    );
  }

  /* Loft mod kpi/, som de øvrige demo-sæt. */
  const iAlt = (DEMO_KPI.gods?.indkoeb?.aabneOrdrer || 0) + (DEMO_KPI.bus?.indkoeb?.aabneOrdrer || 0);
  if (DEMO_INDKOEBSLINJER.length > iAlt) {
    console.warn(
      `demo-indkoeb: ${DEMO_INDKOEBSLINJER.length} linjer i demo, men kpi/ siger ${iAlt} ` +
      `åbne ordrer i alt. Et udsnit kan ikke være større end totalen.`
    );
  }
}
