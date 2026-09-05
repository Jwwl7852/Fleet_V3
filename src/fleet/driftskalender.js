/* src/fleet/driftskalender.js
 * Driftskalenderens fem tal og dens tidsvinduer. INGEN REACT.
 *
 * Opdelingen er den samme som i gitter.js: node kan ikke indlæse .jsx, så lå
 * regnestykket i skærmen, kunne det ikke prøves — og de fem tal er det første
 * en disponent kigger på om morgenen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ DE FEM TAL LIGGER IKKE I kpi/, OG DET ER UNDTAGELSEN — IKKE ET BRUD.
 *
 * Reglen er at nøgletal kommer fra én aggregeret node (beslutning 6). Undtagelsen
 * i CLAUDE.md er lige så klar: er tallet AFLEDT af data skærmen allerede har,
 * beregnes det hos forbrugeren og lægges IKKE i kpi/. Et gemt afledt tal driver
 * fra sit grundlag — det er fejlen i `bemanding.ledig`.
 *
 * Her gælder begge dele, og den anden er den afgørende:
 *
 *   1. Skærmen henter alligevel `opgaver` og `indberetninger` for at tegne
 *      gitteret. Tallene er tællinger af de lister der allerede ligger der.
 *   2. "Kommende" afhænger af et interval BRUGEREN vælger — 1 uge, 2 uger,
 *      1 md., 3 mdr. Et aggregeret tal ville være regnet på ét vindue og stå
 *      forkert i de tre andre, uden at nogen kunne se hvilket det var.
 *
 * ⚠ OG DERFOR TÆLLER HVERT KORT PRÆCIS DEN LISTE DETS "ÅBN" VISER. Funktionen
 * returnerer `poster` ved siden af `antal`, så skærmen ikke kan komme til at
 * tælle ét udsnit og åbne et andet. Det var netop dét der skete med Indkøb →
 * Fakturaer: ni demo-fakturaer på skærmen og et KPI-tal regnet af de rigtige.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ENHED } from "./gitter.js";
import { prioritetVaegt, harPrioritet } from "./prioritet.js";

const MIN = 60000;
const DAG = 86400000;

/* ---- Visninger -------------------------------------------------------- */

/**
 * Dag, uge og måned. `enhed` er gitterets kolonnebredde, `dage` er hvor bredt
 * vinduet er.
 *
 * ⚠ MÅNED ER 35 DAGE, IKKE 30. Gitteret begynder på vinduets første dag, og en
 * måned der starter en torsdag, ville ellers slutte midt i den sidste uge.
 * 35 = fem hele uger, så kolonnerne står under de samme ugedage hele vejen.
 *
 * ⚠ OG DAGSVISNINGEN ER 24 TIMEKOLONNER. MAX_SLOTS i gitter.js er 200, så en
 * måned i timer (840 kolonner) ville KASTE. Det er med vilje: et gitter med
 * 840 kolonner er ikke et gitter, det er en liste — og gitter.js afkorter
 * ikke i stilhed.
 */
export const VISNING = {
  dag:    { key: "dag",    label: "Dag",   enhed: ENHED.time, dage: 1 },
  uge:    { key: "uge",    label: "Uge",   enhed: ENHED.dag,  dage: 7 },
  maaned: { key: "maaned", label: "Måned", enhed: ENHED.dag,  dage: 35 },
};

export const ALLE_VISNINGER = Object.keys(VISNING);

/**
 * vindueFor(visning, ankerMs) → { fra, til, enhed }
 *
 * Vinduet begynder ved DØGNETS start, ikke ved klokkeslættet. Et gitter der
 * begyndte kl. 09.13, ville have en første kolonne på 47 minutter — og
 * blokkene ville stå forskudt i forhold til datoerne over dem.
 *
 * Halvåbent [fra, til), som alt andet.
 */
export function vindueFor(visningKey, ankerMs = Date.now()) {
  const v = VISNING[visningKey] || VISNING.uge;
  const d = new Date(ankerMs);
  d.setHours(0, 0, 0, 0);
  const fra = d.getTime();
  /* Dage lægges med Date og ikke med addition af 86400000: ved sommertidsskiftet
     er et døgn 23 eller 25 timer, og en fast addition ville lade kolonnerne
     glide en time i marts og en time i oktober. Samme grund som i gitter.js. */
  const slut = new Date(fra);
  slut.setDate(slut.getDate() + v.dage);
  return { fra, til: slut.getTime(), enhed: v.enhed, visning: v };
}

/** Flyt vinduet et helt spring frem eller tilbage. */
export function flyt(visningKey, ankerMs, retning) {
  const v = VISNING[visningKey] || VISNING.uge;
  const d = new Date(ankerMs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + v.dage * (retning < 0 ? -1 : 1));
  return d.getTime();
}

/* ---- Hvor langt frem "Kommende" kigger -------------------------------- */

/**
 * ⚠ BRUGERENS EGET VALG, OG DET ER DERFOR TALLET IKKE KAN AGGREGERES.
 * Rækkefølgen er visningsrækkefølgen i knapperækken.
 */
export const FREMAD = [
  { dage: 7,  label: "1 uge" },
  { dage: 14, label: "2 uger" },
  { dage: 30, label: "1 md." },
  { dage: 90, label: "3 mdr." },
];

export const STANDARD_FREMAD = 14;

/* ---- Opgavens vindue -------------------------------------------------- */

/**
 * slutter(opgave) → ms | null
 *
 * ⚠ null, IKKE startMs. En opgave uden `estimeretMin` har intet slutpunkt, og
 * det er ikke det samme som at den slutter med det samme. Regnede vi videre
 * med startMs, ville hver eneste opgave uden estimat stå som FORSINKET i det
 * øjeblik den var oprettet — et tal der ser ud som en måling, og som ingen
 * kunne forklare.
 *
 * Det er samme gate som `num()` og `deviation()`: tjek med Number.isFinite()
 * FØR regnestykket, ikke efter.
 */
export function slutter(opgave) {
  if (!Number.isFinite(opgave?.startMs)) return null;
  if (!Number.isFinite(opgave?.estimeretMin) || opgave.estimeretMin <= 0) return null;
  return opgave.startMs + opgave.estimeretMin * MIN;
}

/* ---- De fem tal ------------------------------------------------------- */

/**
 * ⚠ HVAD DE FEM BETYDER — SKREVET UD, FORDI TRE AF DEM OVERLAPPER.
 *
 *   nye         indberetninger med forløb `ny`. Endnu ikke triageret, altså
 *               heller ikke prioriteret. Det er en INDBERETNING, ikke en
 *               opgave: den er meldt af en chauffør og er ikke blevet til
 *               arbejde endnu.
 *
 *   afventer    opgaver med status `indberettet` eller `afventer`.
 *
 *               ⚠ IKKE "OPGAVER UDEN TIDSPUNKT". Noden KRÆVER startMs
 *               (hasChildren i firebase.rules.json), så en opgave uden
 *               tidspunkt kan ikke gemmes — "ikke planlagt" må derfor være en
 *               TILSTAND og ikke et manglende felt. Tidspunktet er en
 *               pladsholder indtil nogen har taget stilling, og opgaven tegnes
 *               på gitteret i sin egen tone, så pladsholderen ikke læses som
 *               en aftale.
 *
 *   vurderet    indberetninger med forløb `vurderet` — TILFØJET 2026-09-05,
 *               produktejerens eget triageflow: "når de er prioriteret,
 *               lægges de i afventer planlægning". EN EGEN KASSE, IKKE SLÅET
 *               SAMMEN MED `afventer`: en indberetning har et forløb og en
 *               art, en opgave har en status og et tidspunkt — samme
 *               kilde-skel som Arbejdskoe.jsx's `UDSNIT` allerede håndhæver
 *               for `nye`. Uden den egen kasse viste en prioriteret
 *               indberetning sig ingen steder før den blev planlagt — kun
 *               inde på selve Indberetninger-skærmen.
 *
 *               ⚠ Falder automatisk UD igen den dag den planlægges.
 *               `opgaveplanlaeg` sætter allerede `forloeb: "planlagt"`
 *               atomisk (functions/index.js) — ingen ekstra kobling
 *               nødvendig her.
 *
 *   planlagt    opgaver med status `planlagt` eller `igang`.
 *
 *   kommende    DE PLANLAGTE der starter inden for brugerens valgte vindue.
 *               ⚠ Et UDSNIT af `planlagt`, ikke et tal ved siden af. Derfor
 *               skriver skærmen "heraf" — to tal der begge lyder som totaler,
 *               er beslutning 11 og 14 om igen.
 *
 *   forsinkede  planlagte eller igangværende opgaver hvis SLUTNING ligger bag
 *               os. Også et udsnit af `planlagt`.
 *
 *               ⚠ En opgave uden `estimeretMin` har ingen slutning og kan
 *               derfor hverken være forsinket eller til tiden. Den tælles for
 *               sig i `udenVarighed` — ikke som rettidig. Et system der
 *               regnede den som grøn, ville sige "0 forsinkede" om en liste
 *               hvor halvdelen ikke kunne afgøres.
 *
 * Alle fem bærer deres egen `poster`-liste, så kortets "Åbn" viser præcis det
 * der blev talt.
 */
export function driftstal({
  opgaver = [], indberetninger = [], nu = Date.now(), fremDage = STANDARD_FREMAD,
} = {}) {
  const nye = indberetninger.filter((i) => i.forloeb === "ny");

  /* ⚠ EGEN KASSE, SAMME KILDE-DISCIPLIN SOM `nye` — se noten ovenfor. */
  const vurderet = indberetninger.filter((i) => i.forloeb === "vurderet");

  const afventer = opgaver.filter(
    (o) => o.status === "indberettet" || o.status === "afventer");

  const planlagte = opgaver.filter(
    (o) => o.status === "planlagt" || o.status === "igang");

  /* Vinduet lægges med Date, ikke med fremDage * 86400000 — se noten i
     vindueFor(). */
  const graense = new Date(nu);
  graense.setDate(graense.getDate() + fremDage);
  const fremTil = graense.getTime();

  const kommende = planlagte.filter(
    (o) => Number.isFinite(o.startMs) && o.startMs >= nu && o.startMs < fremTil);

  const forsinkede = [];
  const udenVarighed = [];
  for (const o of planlagte) {
    const slut = slutter(o);
    if (slut === null) { udenVarighed.push(o); continue; }
    if (slut < nu) forsinkede.push(o);
  }

  return {
    nye: { antal: nye.length, poster: nye, ...prioritetsfordeling(nye) },
    vurderet: { antal: vurderet.length, poster: vurderet, ...prioritetsfordeling(vurderet) },
    afventer: { antal: afventer.length, poster: afventer },
    planlagt: { antal: planlagte.length, poster: planlagte },
    kommende: { antal: kommende.length, poster: kommende, fremDage },
    forsinkede: { antal: forsinkede.length, poster: forsinkede },
    udenVarighed: { antal: udenVarighed.length, poster: udenVarighed },
  };
}

/**
 * prioritetsfordeling(poster) → { lav, normal, hoej, uvurderet }
 *
 * ⚠ `uvurderet` ER IKKE NUL-BUNKEN. Den tælles og VISES. En indberetning uden
 * prioritet er ikke lavt prioriteret — den er ikke set af nogen endnu, og det
 * er præcis det tal en værkfører skal handle på om morgenen. Skjulte vi den,
 * ville tre tal der summer til mindre end totalen, se ud som en regnefejl.
 */
export function prioritetsfordeling(poster = []) {
  const ud = { lav: 0, normal: 0, hoej: 0, uvurderet: 0 };
  for (const p of poster) {
    if (harPrioritet(p)) ud[p.prioritet] += 1;
    else ud.uvurderet += 1;
  }
  return ud;
}

/* ---- Køen ------------------------------------------------------------- */

/**
 * sorterKoe(poster) → ny liste, hastende først.
 *
 * Prioritet først, derefter tidspunkt. ⚠ De UVURDEREDE ligger mellem høj og
 * mellem (vægt 1,5 — se prioritet.js): en post ingen har taget stilling til,
 * ville blive liggende nederst netop fordi ingen havde taget stilling til den.
 *
 * Sekundær sortering på tid, tertiær på id: to poster med samme prioritet og
 * samme tidspunkt skal stå i samme rækkefølge ved hver render, ellers hopper
 * listen. Samme regel som fordelPaaSted() i opgaver.js.
 */
export function sorterKoe(poster = []) {
  return [...poster].sort((a, b) =>
    prioritetVaegt(a) - prioritetVaegt(b) ||
    (a.startMs ?? a.oprettetMs ?? 0) - (b.startMs ?? b.oprettetMs ?? 0) ||
    String(a.id).localeCompare(String(b.id), "da"));
}

/* ---- Gitterets rækker ------------------------------------------------- */

/**
 * ⚠ KUN RESSOURCER MED NOGET I VINDUET. Et gitter med 60 rækker hvoraf 55 er
 * tomme, skjuler de fem der betyder noget — og med scroll bliver de fem
 * usynlige frem for bare små.
 *
 * Tallet skrives ud på skærmen, så udeladelsen kan ses. `useListe` afkorter
 * ikke i stilhed, og det gør et gitter heller ikke.
 */
export function raekkerIVindue(opgaver = [], fra, til, alleRessourcer = []) {
  const brugte = new Set();
  for (const o of opgaver) {
    const slut = slutter(o) ?? (Number.isFinite(o.startMs) ? o.startMs + DAG : null);
    if (slut === null || !Number.isFinite(o.startMs)) continue;
    if (o.startMs < til && fra < slut) brugte.add(o.koeretoejId ?? o.aktivId ?? o.lokationId);
  }
  return alleRessourcer.filter((r) => brugte.has(r.id));
}
