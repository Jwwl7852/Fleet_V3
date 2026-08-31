/* test/format.test.mjs
 * Formatterne — og den ene forskel der betyder mest: nul mod ikke beregnet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { num, pct, km, kr, INTET , deviation, isoPlusDage } from "../src/fleet/format.js";

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ ET TAL DER IKKE ER BEREGNET, ER IKKE NUL

   `num(null)` gav "0" indtil KPI-aggregeringen skulle skrives. Så længe kpi/
   blev seedet fra demo-sættet, havde hvert felt en værdi, og forskellen kunne
   ikke ses. Den dag et job skriver null for et felt hvis KILDE ikke findes,
   ville skærmen skrive "0 åbne ordrer" — ikke en tom liste, men et ubesvaret
   spørgsmål.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ NUL ER NUL, OG INTET ER INTET", () => {
  assert.equal(num(0), "0", "en tom liste er et svar");
  assert.equal(num(null), INTET);
  assert.equal(num(undefined), INTET);
  assert.equal(num(NaN), INTET, "NaN er heller ikke nul");
});

test("det gælder også procent og km", () => {
  assert.equal(pct(0), "0 %");
  assert.equal(pct(null), INTET);
  assert.equal(km(0), "0 km");
  assert.equal(km(null), INTET);
});

test("rigtige tal formateres uændret", () => {
  assert.equal(num(1234), "1.234");
  assert.equal(num(1234.5, 1), "1.234,5");
  assert.equal(pct(92), "92 %");
  assert.equal(km(1500), "1.500 km");
});

test("⚠ EN AFVIGELSE DER IKKE ER REGNET, ER IKKE UAENDRET", () => {
  /* Her stod `const value = v || 0`, og null blev til "0,0 %" med neutral
     tone — en PAASTAND om at intet havde flyttet sig. Det er samme fejl som
     num() havde, og den er vaerre her: et noegletal der mangler, skriver
     INTET og indroemmer det, mens en afvigelse paa nul lyder som en maaling
     af stabilitet.

     Den blev synlig da kpi/ holdt op med at vaere seedet: Dashboardet skrev
     "0,0 % vs. budget" under en driftsomkostning der aldrig var regnet. */
  for (const v of [null, undefined, NaN]) {
    const d = deviation(v, { unit: "pct" });
    assert.equal(d.text, INTET, `deviation(${String(v)}) skal skrive INTET`);
    assert.equal(d.pil, "", "en pil uden et tal peger et sted ingen kan genfinde");
    assert.equal(d.tone, "neutral");
  }
});

test("⚠ NUL ER STADIG NUL — uaendret er et svar", () => {
  /* Det er kun det UBESVAREDE der skiller sig ud. En afvigelse paa nul
     betyder at tallet ikke har flyttet sig, og det skal kunne siges. */
  const d = deviation(0, { unit: "pct" });
  assert.equal(d.text, "0,0 %");
  assert.equal(d.pil, "");
  assert.equal(d.tone, "neutral");
});

test("⚠ kr() SKELNER IKKE — og det er med vilje", () => {
  /* Et beløb er ØRE som integer. `kr(0)` er "0 kr." og det er et rigtigt
     beløb; en manglende sum skrives af kalderen som INTET, fordi kun
     kalderen ved om nul er et svar. Se momsTekst() i Fakturering og
     afregningssum(), der begge returnerer null OG viser det. */
  assert.equal(kr(0), "0 kr.");
  assert.equal(kr(null), "0 kr.");
});

/* ---- Én markør, ikke tre ---------------------------------------------- */

const jsxFiler = (mappe) => {
  const ud = [];
  for (const navn of readdirSync(mappe)) {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) ud.push(...jsxFiler(sti));
    else if (/\.(jsx|js)$/.test(navn)) ud.push(sti);
  }
  return ud;
};

test("⚠ INGEN SKÆRM OPFINDER EN ANDEN MARKØR", () => {
  /* De ~96 hårdkodede "—" er ikke forkerte — de er det SAMME tegn. Det
     farlige ville være "n/a", "N/A" eller "ingen data": den næste ville tro
     der var forskel, og ingen af dem kunne søges frem. */
  const fundet = [];
  for (const fil of jsxFiler("src")) {
    const s = readFileSync(fil, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of s.matchAll(/["'`](n\/a|N\/A|ingen data|-{2,})["'`]/g)) {
      fundet.push(`${fil}: ${m[1]}`);
    }
  }
  assert.deepEqual(fundet, [],
    `en anden markoer for "ikke beregnet" end ${INTET}`);
});

test("INTET er ét tegn, ikke to bindestreger", () => {
  /* En em-dash. To bindestreger ville brække i en tabel og se ud som et
     minus. */
  assert.equal(INTET.length, 1);
  assert.equal(INTET, "\u2014");
});

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   \u26a0 V1-BRUGERTEST \u00a710.3 \u2014 TURPLANENS DATO-PILE. Se noten ved isoPlusDage()
   i format.js. Pr\u00f8ven k\u00f8rer i lokal tidszone (samme foruds\u00e6tning som
   fravaer.test.mjs's sommertidspr\u00f8ver) \u2014 i Danmark, hvor lokal tid altid
   ligger FORAN UTC, er det netop d\u00e9t der udl\u00f8ser fejlen.
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
test("isoPlusDage flytter pr\u00e6cis \u00e9n kalenderdag frem og tilbage", () => {
  assert.equal(isoPlusDage("2026-08-31", 1), "2026-09-01");
  assert.equal(isoPlusDage("2026-09-01", -1), "2026-08-31");
  assert.equal(isoPlusDage("2026-08-31", 7), "2026-09-07");
});

test("\u26a0 M\u00c5NEDSSKIFTE OG SKUD\u00c5R \u2014 samme greb som varighedDage, bygget med Date", () => {
  assert.equal(isoPlusDage("2026-12-31", 1), "2027-01-01");
  assert.equal(isoPlusDage("2024-02-28", 1), "2024-02-29", "2024 er skud\u00e5r");
  assert.equal(isoPlusDage("2025-02-28", 1), "2025-03-01", "2025 er ikke skud\u00e5r");
});

test("\u26a0 DEN FUNDNE FEJL, GENSKABT: msTilIso(d.getTime()) p\u00e5 en LOKAL midnat giver G\u00c5RSDAGENS dato", () => {
  /* Dette er den PR\u00c6CISE fejl Turplan.jsx havde, genskabt her for at bevise
     at den var reel \u2014 ikke en formodning. Fejler denne pr\u00f8ve en dag fordi
     nogen k\u00f8rer den i UTC, er det selve pointen: i UTC opst\u00e5r fejlen ikke,
     og det er derfor den er s\u00e5 sv\u00e6r at f\u00e5 \u00f8je p\u00e5 uden at kende brugerens
     tidszone. */
  const lokalOffsetMinutter = new Date("2026-08-31T00:00:00").getTimezoneOffset();
  if (lokalOffsetMinutter >= 0) return; // ikke reproducerbar i UTC eller bagved UTC

  const fraDag = new Date(2026, 7, 31).setHours(0, 0, 0, 0); // lokal midnat, 31. august
  const d = new Date(fraDag);
  d.setDate(d.getDate() + 1); // "flyt \u00e9n dag frem" \u2014 lokal midnat, 1. september
  const gammelBeregning = new Date(d.getTime()).toISOString().slice(0, 10);
  assert.equal(gammelBeregning, "2026-08-31",
    "den gamle msTilIso(d.getTime())-vej skulle netop IKKE flytte datoen \u2014 det var fejlen");

  // isoPlusDage rammer den rigtige dato med samme udgangspunkt:
  assert.equal(isoPlusDage("2026-08-31", 1), "2026-09-01");
});
