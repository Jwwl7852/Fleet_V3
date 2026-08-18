/* test/format.test.mjs
 * Formatterne — og den ene forskel der betyder mest: nul mod ikke beregnet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { num, pct, km, kr, INTET , deviation } from "../src/fleet/format.js";

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
