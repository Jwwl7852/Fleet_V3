/* src/fleet/braendstofmatch.js
 * Brændstofmatch — G.2. Matcher en leverandørs fakturalinje (indkøb,
 * kategori "braendstof") mod chaufførens egen tankningsregistrering
 * (indberetning, art "braendstof").
 *
 * ⚠ TILLÆGSKRAV "BRÆNDSTOFMATCH" §1/§8/§14/§15. Leverandørfakturaen er den
 * ØKONOMISKE SANDHED — literantal og pris kommer derfra, ALDRIG fra
 * chaufførens indberetning. Matchet forbinder de to poster; det retter
 * ALDRIG et tal på nogen af dem. Se G.1 (Indberetning.jsx) for hvorfor
 * chaufførens formular ikke længere har et prisfelt.
 *
 * ⚠ GENERISK PÅ TVÆRS AF LEVERANDØRER. Ingen leverandørspecifik logik —
 * signalerne er køretøj, dato og literantal, som er de samme uanset om
 * fakturaen kommer fra Circle K, OK eller en tredje.
 *
 * ⚠ SAMME SKABELON SOM procure.js's matchForslag()/kanMatche() — signaler,
 * en vægtet score, et minimumsvindue i dage, en tolerance i basispoint. Se
 * MATCHSIGNAL/naerNok/MATCH_VINDUE_DAGE i procure.js. Denne fil genbruger
 * naerNok() derfra frem for at skrive endnu en kopi af samme aritmetik.
 *
 * ⚠ SCOREN GEMMES ALDRIG — samme disciplin som procure.js/fakturacenter.js.
 * Kun AFGØRELSEN (hvilken tankning, hvornår, af hvem, automatisk eller ej)
 * er en kendsgerning der skal huskes; scoren er genberegnet hver gang.
 *
 * ⚠ AUTO-MATCH FINDES IKKE SOM MØNSTER ANDRE STEDER I KODEBASEN — det er
 * NYT her, ikke en genbrugt mekanisme. afgørAutomatch() er derfor skrevet
 * forsigtigt: kun ÉT kvalificerende forslag (ikke "det bedste af flere")
 * tæller som utvetydigt. To eller flere forslag over grænsen er PR.
 * DEFINITION tvetydigt, uanset hvor meget bedre det ene er end det andet —
 * "det bedste vinder" er en gætte-regel, "der var kun ét at vælge mellem"
 * er det ikke.
 *
 * INGEN FIREBASE-IMPORT — samme grund som procure.js: skal kunne læses af
 * enhver Cloud Function og prøves uden en emulator.
 */
import { naerNok } from "./procure.js";
import { msTilIso } from "./format.js";

export const BRAENDSTOF_MATCHSIGNAL = {
  koeretoej: { label: "Samme angivne køretøj", vaegt: 100 },
  datoExact: { label: "Samme dato", vaegt: 55 },
  datoNaer:  { label: "Tæt på i tid", vaegt: 20 },
  literNaer: { label: "Literantal inden for tolerance", vaegt: 40 },
};

/** Hvor tæt to literantal skal være — 3 %, skaleret til centiliter-heltal. */
export const LITER_TOLERANCE_BPS = 300;

/** Hvor mange dage fra hinanden fakturalinjen og tankningen stadig kan høre sammen. */
export const MATCH_VINDUE_DAGE = 5;

/** Under det her vises forslaget slet ikke — samme begrundelse som procure.js's MATCH_MINDSTE_SCORE. */
export const MATCH_MINDSTE_SCORE = 45;

/**
 * ⚠ KUN STÆRKE FORSLAG MÅ AUTO-MATCHES. Grænsen er højere end
 * MATCH_MINDSTE_SCORE med vilje — et forslag der lige akkurat er værd at
 * VISE, er ikke automatisk værd at BEKRÆFTE uden at nogen har set det.
 */
export const AUTOMATCH_MINDSTE_SCORE = 85;

/**
 * ⚠ CENTILITER, IKKE LITER. naerNok() kræver hele tal (samme grund som øre:
 * en BPS-sammenligning på flydende tal runder forkert). Literantal har
 * typisk to decimaler (45,32 l) — centiliter er derfor den mindste enhed
 * der ikke mister præcision, og et helt tal naerNok() kan regne på.
 */
const centiliter = (liter) => Math.round(Number(liter) * 100);

/**
 * matchForslag(indkoebLinje, tankninger) → [{ tankning, score, signaler }]
 *
 * Sorteret bedst først, kun dem over MATCH_MINDSTE_SCORE.
 *
 * `matchedeTankningIder` udelukker tankninger der allerede er matchet til
 * en ANDEN fakturalinje — samme "en ordre der allerede er matchet foreslås
 * ikke"-princip som procure.js. Én tankning kan kun matches én gang.
 */
export function matchForslag(indkoebLinje, tankninger = [], { matchedeTankningIder = [] } = {}) {
  if (!indkoebLinje) return [];
  const brugte = new Set(matchedeTankningIder.filter(Boolean));
  const linjeDatoIso = Number.isFinite(indkoebLinje.dato) ? msTilIso(indkoebLinje.dato) : null;
  const linjeCl = Number.isFinite(indkoebLinje.antal) ? centiliter(indkoebLinje.antal) : null;

  const ud = [];
  for (const t of tankninger) {
    if (!t?.id || brugte.has(t.id)) continue;
    if (t.art !== "braendstof" || !t.dato) continue;

    const signaler = [];

    /* ⚠ ET ANGIVET KØRETØJ ER AFGØRENDE, IKKE ET SIGNAL BLANDT FLERE.
       Fakturalinjen bærer sjældent et koeretoejId (leverandøren kender kun
       et kortnummer) — men står det der (kontoret har evt. slået det op i
       forvejen), og det er DET SAMME som tankningens, er der intet at
       gætte om. */
    if (indkoebLinje.koeretoejId && indkoebLinje.koeretoejId === t.koeretoejId) {
      signaler.push("koeretoej");
    }

    if (linjeDatoIso) {
      if (linjeDatoIso === t.dato) {
        signaler.push("datoExact");
      } else {
        const dage = Math.abs((new Date(`${linjeDatoIso}T12:00:00`).getTime()
          - new Date(`${t.dato}T12:00:00`).getTime())) / 86400000;
        if (dage <= MATCH_VINDUE_DAGE) signaler.push("datoNaer");
      }
    }

    if (linjeCl != null && Number.isFinite(t.liter)) {
      const tankningCl = centiliter(t.liter);
      if (naerNok(linjeCl, tankningCl, LITER_TOLERANCE_BPS)) signaler.push("literNaer");
    }

    if (!signaler.length) continue;
    /* ⚠ DATO ELLER LITER SKAL MED — et køretøjstræf alene, uden hverken
       dato eller literantal der stemmer nogenlunde, er ikke nok: to
       tankninger på samme bil kan sagtens ligge en uge fra hinanden. */
    if (!signaler.includes("datoExact") && !signaler.includes("datoNaer") && !signaler.includes("literNaer")) continue;

    const raa = signaler.reduce((s, k) => s + BRAENDSTOF_MATCHSIGNAL[k].vaegt, 0);
    const score = Math.min(98, raa);
    if (score < MATCH_MINDSTE_SCORE) continue;

    ud.push({ tankning: t, score, signaler });
  }

  return ud.sort((a, b) => b.score - a.score || (b.tankning.oprettetMs || 0) - (a.tankning.oprettetMs || 0));
}

/**
 * afgørAutomatch(forslag) → { automatisk: true, tankning, score } | { automatisk: false }
 *
 * ⚠ UTVETYDIG = NØJAGTIG ÉT KVALIFICERENDE FORSLAG, IKKE "BEDST VINDER".
 * To forslag der begge ligger over AUTOMATCH_MINDSTE_SCORE er tvetydige,
 * uanset afstanden mellem dem — se filens hoved.
 */
export function afgørAutomatch(forslag = []) {
  const kvalificerede = forslag.filter((f) => f.score >= AUTOMATCH_MINDSTE_SCORE);
  if (kvalificerede.length === 1) {
    return { automatisk: true, tankning: kvalificerede[0].tankning, score: kvalificerede[0].score };
  }
  return { automatisk: false };
}

/**
 * kanMatcheBraendstof(indkoebLinje, { alleredeMatchetTilAnden }) → { ok, aarsag }
 *
 * Svarer, afgør ikke — skærmen viser, braendstofMatchBekraeft håndhæver
 * med den samme. Samme figur som procure.js's kanMatche().
 */
export function kanMatcheBraendstof(indkoebLinje, { alleredeMatchetTilAnden = false } = {}) {
  if (!indkoebLinje) return { ok: false, aarsag: "Ingen fakturalinje valgt." };
  /* ⚠ EN BOGFØRT LINJE MATCHES IKKE OM — samme princip som en bogført
     faktura i procure.js: en afstemning der stod, må ikke stille skifte
     grundlag under sig. */
  if (indkoebLinje.fakturastatus === "bogfoert") {
    return { ok: false, aarsag: "Linjen er bogført. Matchet kan ikke ændres bagefter." };
  }
  if (indkoebLinje.fakturastatus === "afvist") {
    return { ok: false, aarsag: "Linjen er afvist og kan ikke matches." };
  }
  if (indkoebLinje.kategori !== "braendstof") {
    return { ok: false, aarsag: "Kun linjer i kategorien brændstof kan matches her." };
  }
  if (alleredeMatchetTilAnden) {
    return { ok: false, aarsag: "Den valgte tankning er allerede matchet med en anden fakturalinje." };
  }
  return { ok: true, aarsag: null };
}
