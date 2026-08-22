/* src/fleet/demo-forbrugsvarer.js
 * Procures EGET varelager — beslutning 85.
 *
 * ⚠ VORES EGNE VARER, IKKE KUNDENS. `DEMO_VARER` i demo-lager.js er
 * Warehouses gods, hvor hver post bærer et `kundeId`. De to sæt må aldrig
 * blandes: et tal derfra ville få Procure til at bede os bestille noget en
 * KUNDE mangler. Se beslutning 84 og 85.
 *
 * ⚠ SÆTTET BRUGES KUN NÅR DER INGEN DATABASE ER. `useListe(node, { demo })`
 * er den rigtige vej — en seedet node må aldrig vise noget andet end sig selv
 * (beslutning 56 og 64).
 */
import { selvkontrol } from "./selvkontrol.js";
import {
  valideForbrugsvare, valideBevaegelse, beholdningAfBevaegelser,
  laveVarer, udenGraense, ALLE_BEVAEGELSESARTER,
} from "./forbrugsvarer.js";

const NU = Date.now();
const DAG = 86400000;

/**
 * ⚠ FIRE LAVE OG TO UDEN GRÆNSE — og det er ikke pynt.
 *
 * `kpi.indkoeb.lavBeholdning` er 4 og `forbrugsvarerUdenGraense` er 2 i
 * `demo-kpi.js`. Er sættet uenigt med sig selv, viser Overblikket ét tal og
 * Varelageret et andet — og de står to klik fra hinanden. Selvkontrollen
 * nedenfor måler det.
 *
 * ⚠ OG ÉN ER NEGATIV MED VILJE. En beholdning under nul er ikke en fejl i
 * modellen; den er beviset på at der mangler en bevægelse (se
 * `negativeBeholdninger()`). Uden et eksempel kan skærmen ikke vise hvordan
 * det ser ud, og ingen ville vide at svaret er en optælling.
 */
export const DEMO_FORBRUGSVARER = [
  { id: "fv-handsker", navn: "Arbejdshandsker str. 10", varenummer: "AH10-12",
    enhed: "par", beholdning: 8, minimumBeholdning: 24,
    leverandoerId: "lv-kontorland",
    oprettetAf: "uid-michael", oprettetMs: NU - 300 * DAG, sidstBevaegetMs: NU - 2 * DAG },

  { id: "fv-straekfilm", navn: "Strækfilm 50 cm × 300 m", varenummer: "SF500-300",
    enhed: "ruller", beholdning: 3, minimumBeholdning: 10,
    leverandoerId: "lv-kontorland",
    oprettetAf: "uid-lars", oprettetMs: NU - 280 * DAG, sidstBevaegetMs: NU - 5 * DAG },

  { id: "fv-papir", navn: "Papir A4, 80 g", varenummer: "PA4-80",
    enhed: "pk", beholdning: 42, minimumBeholdning: 10,
    leverandoerId: "lv-kontorland",
    oprettetAf: "uid-mette", oprettetMs: NU - 200 * DAG, sidstBevaegetMs: NU - 12 * DAG },

  { id: "fv-luftfilter", navn: "Luftfilter", varenummer: "LUF-01",
    enhed: "stk", beholdning: 6, minimumBeholdning: 6,
    leverandoerId: "lv-hydra",
    oprettetAf: "uid-michael", oprettetMs: NU - 150 * DAG, sidstBevaegetMs: NU - 20 * DAG },

  /* ⚠ NEGATIV. Nogen tog de sidste to spande uden at melde det, og
     beholdningen var forkert i forvejen. Systemet spærrer ikke forbruget —
     det ville lade den rigtige hændelse gå tabt for at beskytte et tal der
     allerede var galt. Svaret er en optælling. */
  { id: "fv-affedter", navn: "Affedtningsmiddel 5 l", varenummer: "AFF-5",
    enhed: "spand", beholdning: -2, minimumBeholdning: 4,
    leverandoerId: "lv-hydra",
    oprettetAf: "uid-michael", oprettetMs: NU - 120 * DAG, sidstBevaegetMs: NU - 1 * DAG },

  /* ⚠ TO UDEN GRÆNSE. En vare uden minimum har ingen "lav"-tilstand — og
     manglen skal kunne ses, ellers betyder "0 under minimum" både "alt er
     fyldt op" og "ingen har sat en grænse". */
  { id: "fv-kabelbinder", navn: "Kabelbinder 300 mm", varenummer: "KB-300",
    enhed: "pk", beholdning: 14,
    oprettetAf: "uid-michael", oprettetMs: NU - 90 * DAG, sidstBevaegetMs: NU - 30 * DAG },
  { id: "fv-klud", navn: "Værkstedsklude", enhed: "kg", beholdning: 25,
    oprettetAf: "uid-lars", oprettetMs: NU - 60 * DAG, sidstBevaegetMs: NU - 40 * DAG },
];

/**
 * Bevægelserne bag beholdningerne.
 *
 * ⚠ DE SKAL SUMMERE TIL DET GEMTE TAL. Beholdningen skrives sammen med
 * bevægelsen i én `update()` (beslutning 39), fordi en skærm ikke kan summere
 * hele historikken for hver vare hver gang — men et gemt afledt tal driver
 * (beslutning 71), og `beholdningsafvigelse()` viser forskellen på skærmen.
 * Er demo-sættet selv uenigt, viser skærmen en drift vi selv har lavet, og så
 * kan man ikke se en rigtig.
 *
 * ⚠ EN OPTÆLLING SÆTTER, DEN LÆGGER IKKE TIL. `antal` er det TALTE.
 */
export const DEMO_FORBRUGSVAREBEVAEGELSER = [
  /* Handsker: 24 ind, 16 brugt = 8. */
  { id: "fb-1", forbrugsvareId: "fv-handsker", art: "modtaget", antal: 24,
    ms: NU - 40 * DAG, uid: "uid-michael", foer: 0, efter: 24 },
  { id: "fb-2", forbrugsvareId: "fv-handsker", art: "forbrug", antal: 16,
    ms: NU - 2 * DAG, uid: "uid-michael", foer: 24, efter: 8 },

  /* Strækfilm: 10 ind, 7 brugt = 3. */
  { id: "fb-3", forbrugsvareId: "fv-straekfilm", art: "modtaget", antal: 10,
    ms: NU - 35 * DAG, uid: "uid-lars", foer: 0, efter: 10 },
  { id: "fb-4", forbrugsvareId: "fv-straekfilm", art: "forbrug", antal: 7,
    ms: NU - 5 * DAG, uid: "uid-lars", foer: 10, efter: 3 },

  /* Papir: 50 ind, 8 brugt = 42. */
  { id: "fb-5", forbrugsvareId: "fv-papir", art: "modtaget", antal: 50,
    ms: NU - 60 * DAG, uid: "uid-mette", foer: 0, efter: 50 },
  { id: "fb-6", forbrugsvareId: "fv-papir", art: "forbrug", antal: 8,
    ms: NU - 12 * DAG, uid: "uid-mette", foer: 50, efter: 42 },

  /* ⚠ LUFTFILTER: EN OPTÆLLING RETTEDE TALLET. 12 ind, 4 brugt = 8 på papiret,
     men der stod 6 på hylden. Uden arten skulle den der talte, have tastet
     "korrektion −2" — og en fejl i det hovedregnestykke ser bagefter ud som
     svind. */
  { id: "fb-7", forbrugsvareId: "fv-luftfilter", art: "modtaget", antal: 12,
    ms: NU - 80 * DAG, uid: "uid-michael", foer: 0, efter: 12 },
  { id: "fb-8", forbrugsvareId: "fv-luftfilter", art: "forbrug", antal: 4,
    ms: NU - 50 * DAG, uid: "uid-michael", foer: 12, efter: 8 },
  { id: "fb-9", forbrugsvareId: "fv-luftfilter", art: "optaelling", antal: 6,
    ms: NU - 20 * DAG, uid: "uid-michael", foer: 8, efter: 6,
    note: "Talt ved kvartalsoptælling." },

  /* ⚠ AFFEDTER: SVIND MED SIN GRUND, og et forbrug der endte i minus. */
  { id: "fb-10", forbrugsvareId: "fv-affedter", art: "modtaget", antal: 6,
    ms: NU - 70 * DAG, uid: "uid-michael", foer: 0, efter: 6 },
  { id: "fb-11", forbrugsvareId: "fv-affedter", art: "svind", antal: 3,
    ms: NU - 30 * DAG, uid: "uid-michael", foer: 6, efter: 3,
    note: "En spand væltede og løb ud på gulvet." },
  { id: "fb-12", forbrugsvareId: "fv-affedter", art: "forbrug", antal: 5,
    ms: NU - 1 * DAG, uid: "uid-lars", foer: 3, efter: -2 },

  /* Kabelbinder og klude: kun en modtagelse. */
  { id: "fb-13", forbrugsvareId: "fv-kabelbinder", art: "modtaget", antal: 14,
    ms: NU - 30 * DAG, uid: "uid-michael", foer: 0, efter: 14 },
  { id: "fb-14", forbrugsvareId: "fv-klud", art: "modtaget", antal: 25,
    ms: NU - 40 * DAG, uid: "uid-lars", foer: 0, efter: 25 },
];

/* ══════════════════════════════════════════════════════════════════════════
   Selvkontrol
   ══════════════════════════════════════════════════════════════════════════ */
selvkontrol("demo-forbrugsvarer", () => {
  for (const v of DEMO_FORBRUGSVARER) {
    const r = valideForbrugsvare(v);
    if (!r.ok) {
      console.warn(
        `demo-forbrugsvarer: ${v.id} kunne ikke gemmes — `
        + Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")
      );
    }
  }

  const varer = new Set(DEMO_FORBRUGSVARER.map((v) => v.id));
  for (const b of DEMO_FORBRUGSVAREBEVAEGELSER) {
    if (!varer.has(b.forbrugsvareId)) {
      console.warn(`demo-forbrugsvarer: ${b.id} peger på varen "${b.forbrugsvareId}", som ikke findes.`);
    }
    const r = valideBevaegelse(b);
    if (!r.ok) {
      console.warn(
        `demo-forbrugsvarer: ${b.id} er ikke en gyldig bevægelse — `
        + Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")
      );
    }
  }

  /**
   * ⚠ DET GEMTE TAL SKAL STEMME MED BEVÆGELSERNE.
   *
   * Beholdningen er gemt fordi en skærm ikke kan summere historikken for hver
   * vare hver gang — men `beholdningsafvigelse()` viser forskellen PÅ SKÆRMEN,
   * netop fordi et gemt afledt tal driver (beslutning 71). Er demo-sættet selv
   * uenigt, tegner skærmen en drift vi selv har lavet, og så kan man ikke se
   * en rigtig.
   */
  for (const v of DEMO_FORBRUGSVARER) {
    const regnet = beholdningAfBevaegelser(
      DEMO_FORBRUGSVAREBEVAEGELSER.filter((b) => b.forbrugsvareId === v.id));
    if (regnet !== v.beholdning) {
      console.warn(
        `demo-forbrugsvarer: ${v.id} har beholdning ${v.beholdning}, men `
        + `bevægelserne summerer til ${regnet}. Skærmen ville vise en drift vi selv har lavet.`
      );
    }
  }

  /* ⚠ HVER ART SKAL VÆRE BRUGT. En art uden et eksempel kan ikke ses virke —
     og optællingen er den der er svær at forstå uden en. */
  const brugte = new Set(DEMO_FORBRUGSVAREBEVAEGELSER.map((b) => b.art));
  for (const a of ALLE_BEVAEGELSESARTER) {
    if (!brugte.has(a)) {
      console.warn(`demo-forbrugsvarer: ingen bevægelse med arten "${a}" — den kan ikke ses virke.`);
    }
  }

  /* ⚠ OG TALLENE SKAL PASSE MED demo-kpi.js. De står to klik fra hinanden. */
  const lav = laveVarer(DEMO_FORBRUGSVARER).length;
  const uden = udenGraense(DEMO_FORBRUGSVARER).length;
  if (lav !== 4 || uden !== 2) {
    console.warn(
      `demo-forbrugsvarer: ${lav} lave og ${uden} uden grænse, men demo-kpi.js `
      + "lover 4 og 2. Overblikket og Varelageret ville vise hver sit tal."
    );
  }

  /* ⚠ ÉN NEGATIV. Uden et eksempel kan skærmen ikke vise hvordan en manglende
     bevægelse ser ud — og ingen ville vide at svaret er en optælling. */
  if (!DEMO_FORBRUGSVARER.some((v) => v.beholdning < 0)) {
    console.warn(
      "demo-forbrugsvarer: ingen negativ beholdning. Så kan skærmen ikke vise "
      + "at et minus er beviset på en manglende bevægelse."
    );
  }
});
