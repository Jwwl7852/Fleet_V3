/* test/braendstofmatch.test.mjs
 * Brændstofmatch — G.2. De rene funktioner: matchForslag, afgørAutomatch,
 * kanMatcheBraendstof. Ingen emulator — se test/rules.braendstofmatch.
 * test.mjs (RTDB) og test/g2-braendstofmatch-cloud.test.mjs (Cloud
 * Functions, kildekode-inspektion) for resten af dækningen.
 *
 * Kør: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BRAENDSTOF_MATCHSIGNAL, LITER_TOLERANCE_BPS, MATCH_VINDUE_DAGE,
  MATCH_MINDSTE_SCORE, AUTOMATCH_MINDSTE_SCORE,
  matchForslag, afgørAutomatch, kanMatcheBraendstof,
} from "../src/fleet/braendstofmatch.js";
import { isoTilMs } from "../src/fleet/format.js";

const tankning = (id, { koeretoejId = "kt-1", dato, liter, oprettetMs = 1 } = {}) =>
  ({ id, art: "braendstof", koeretoejId, dato, liter, oprettetMs });

const linje = ({ dato, antal, koeretoejId } = {}) =>
  ({ dato: isoTilMs(dato), antal, koeretoejId, kategori: "braendstof", fakturastatus: "modtaget" });

describe("matchForslag — samme dato og literantal", () => {
  it("⚠ SAMME DATO + LITERANTAL INDEN FOR TOLERANCE GIVER ET STÆRKT FORSLAG", () => {
    const f = matchForslag(
      linje({ dato: "2026-08-20", antal: 45.32 }),
      [tankning("t1", { dato: "2026-08-20", liter: 45.3 })]
    );
    assert.equal(f.length, 1);
    assert.equal(f[0].tankning.id, "t1");
    assert.ok(f[0].signaler.includes("datoExact"));
    assert.ok(f[0].signaler.includes("literNaer"));
  });

  it("⚠ ET ANGIVET SAMME KØRETØJ ER DET STÆRKESTE SIGNAL", () => {
    const f = matchForslag(
      linje({ dato: "2026-08-20", antal: 45.32, koeretoejId: "kt-9" }),
      [tankning("t1", { dato: "2026-08-20", liter: 45.3, koeretoejId: "kt-9" })]
    );
    assert.ok(f[0].signaler.includes("koeretoej"));
    assert.equal(f[0].score, 98); // loftet — se "score capper" nedenfor
  });

  it("⚠ FORKELLIGT LITERANTAL UDEN FOR TOLERANCEN GIVER INTET literNaer-SIGNAL", () => {
    const f = matchForslag(
      linje({ dato: "2026-08-20", antal: 100 }),
      [tankning("t1", { dato: "2026-08-20", liter: 40 })]
    );
    assert.equal(f.length, 1); // stadig et forslag (datoExact alene er nok), men uden literNaer
    assert.ok(!f[0].signaler.includes("literNaer"));
  });

  it("⚠ EN TANKNING UDEN FOR VINDUET (MATCH_VINDUE_DAGE) FORESLÅS IKKE, MEDMINDRE LITERANTALLET REDDER DEN", () => {
    const f = matchForslag(
      linje({ dato: "2026-08-01", antal: 100 }),
      [tankning("t1", { dato: "2026-09-01", liter: 100 })] // 31 dage væk, literantal ens
    );
    // hverken datoExact, datoNaer (uden for vinduet) — kun literNaer, som alene ikke må score nok
    assert.equal(f.length, 0);
  });

  it("⚠ EN ALLEREDE MATCHET TANKNING FORESLÅS IKKE IGEN", () => {
    const f = matchForslag(
      linje({ dato: "2026-08-20", antal: 45 }),
      [tankning("t1", { dato: "2026-08-20", liter: 45 })],
      { matchedeTankningIder: ["t1"] }
    );
    assert.equal(f.length, 0);
  });

  it("⚠ EN TANKNING AF EN ANDEN ART FORESLÅS ALDRIG", () => {
    const f = matchForslag(
      linje({ dato: "2026-08-20", antal: 45 }),
      [{ id: "t1", art: "parkering", dato: "2026-08-20", liter: 45, oprettetMs: 1 }]
    );
    assert.equal(f.length, 0);
  });

  it("sorteret bedst først", () => {
    const f = matchForslag(
      linje({ dato: "2026-08-20", antal: 45 }),
      [
        tankning("svag", { dato: "2026-08-23", liter: 90 }),
        tankning("staerk", { dato: "2026-08-20", liter: 45 }),
      ]
    );
    assert.equal(f[0].tankning.id, "staerk");
  });

  it("tom liste giver tom liste, ikke en fejl", () => {
    assert.deepEqual(matchForslag(linje({ dato: "2026-08-20", antal: 45 }), []), []);
    assert.deepEqual(matchForslag(null, [tankning("t1", { dato: "2026-08-20", liter: 45 })]), []);
  });

  it("⚠ SCOREN CAPPER PÅ 98 — ALDRIG 100, DER FINDES INTET NATURLIGT NØGLETRÆF SOM ET ORDRENUMMER", () => {
    const f = matchForslag(
      linje({ dato: "2026-08-20", antal: 45, koeretoejId: "kt-9" }),
      [tankning("t1", { dato: "2026-08-20", liter: 45, koeretoejId: "kt-9" })]
    );
    assert.equal(f[0].score, 98);
    assert.ok(f[0].score < 100);
  });
});

describe("afgørAutomatch — ÉT kvalificerende forslag, ikke 'det bedste vinder'", () => {
  it("⚠ NØJAGTIG ÉT FORSLAG OVER AUTOMATCH_MINDSTE_SCORE AUTO-MATCHER", () => {
    const forslag = [{ tankning: { id: "t1" }, score: AUTOMATCH_MINDSTE_SCORE, signaler: [] }];
    const r = afgørAutomatch(forslag);
    assert.equal(r.automatisk, true);
    assert.equal(r.tankning.id, "t1");
  });

  it("⚠ TO FORSLAG OVER GRÆNSEN ER TVETYDIGE — SELV NÅR DET ENE ER MEGET BEDRE END DET ANDET", () => {
    const forslag = [
      { tankning: { id: "bedst" }, score: 98, signaler: [] },
      { tankning: { id: "naest" }, score: AUTOMATCH_MINDSTE_SCORE, signaler: [] },
    ];
    const r = afgørAutomatch(forslag);
    assert.equal(r.automatisk, false);
  });

  it("intet forslag over grænsen giver ingen automatch", () => {
    const forslag = [{ tankning: { id: "t1" }, score: AUTOMATCH_MINDSTE_SCORE - 1, signaler: [] }];
    assert.equal(afgørAutomatch(forslag).automatisk, false);
  });

  it("tom liste giver ingen automatch", () => {
    assert.equal(afgørAutomatch([]).automatisk, false);
  });

  it("⚠ ET FORSLAG UNDER AUTOMATCH-GRÆNSEN, MEN OVER MATCH_MINDSTE_SCORE, AUTO-MATCHER IKKE", () => {
    assert.ok(MATCH_MINDSTE_SCORE < AUTOMATCH_MINDSTE_SCORE,
      "automatch-grænsen skal være strengere end den grænse der blot viser et forslag");
    const forslag = [{ tankning: { id: "t1" }, score: MATCH_MINDSTE_SCORE, signaler: [] }];
    assert.equal(afgørAutomatch(forslag).automatisk, false);
  });
});

describe("kanMatcheBraendstof", () => {
  it("afviser uden en valgt linje", () => {
    assert.equal(kanMatcheBraendstof(null).ok, false);
  });

  it("⚠ EN BOGFØRT LINJE MATCHES IKKE OM", () => {
    const r = kanMatcheBraendstof({ kategori: "braendstof", fakturastatus: "bogfoert" });
    assert.equal(r.ok, false);
    assert.match(r.aarsag, /bogført/i);
  });

  it("en afvist linje kan ikke matches", () => {
    const r = kanMatcheBraendstof({ kategori: "braendstof", fakturastatus: "afvist" });
    assert.equal(r.ok, false);
  });

  it("⚠ KUN kategori BRÆNDSTOF KAN MATCHES HER", () => {
    const r = kanMatcheBraendstof({ kategori: "reservedele", fakturastatus: "modtaget" });
    assert.equal(r.ok, false);
    assert.match(r.aarsag, /brændstof/i);
  });

  it("⚠ EN TANKNING DER ALLEREDE ER MATCHET TIL EN ANDEN LINJE, AFVISES", () => {
    const r = kanMatcheBraendstof(
      { kategori: "braendstof", fakturastatus: "modtaget" },
      { alleredeMatchetTilAnden: true }
    );
    assert.equal(r.ok, false);
  });

  it("en gyldig, umatchet linje kan matches", () => {
    const r = kanMatcheBraendstof({ kategori: "braendstof", fakturastatus: "modtaget" });
    assert.equal(r.ok, true);
  });
});

describe("konstanterne", () => {
  it("MATCH_MINDSTE_SCORE er strengere end 0, løsere end AUTOMATCH_MINDSTE_SCORE", () => {
    assert.ok(MATCH_MINDSTE_SCORE > 0);
    assert.ok(MATCH_MINDSTE_SCORE < AUTOMATCH_MINDSTE_SCORE);
  });

  it("LITER_TOLERANCE_BPS og MATCH_VINDUE_DAGE er positive tal", () => {
    assert.ok(LITER_TOLERANCE_BPS > 0);
    assert.ok(MATCH_VINDUE_DAGE > 0);
  });

  it("hvert signal i BRAENDSTOF_MATCHSIGNAL har et label og en positiv vægt", () => {
    for (const [key, s] of Object.entries(BRAENDSTOF_MATCHSIGNAL)) {
      assert.ok(s.label, `${key} mangler et label`);
      assert.ok(s.vaegt > 0, `${key} har ikke en positiv vægt`);
    }
  });
});
