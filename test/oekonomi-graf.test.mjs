/* test/oekonomi-graf.test.mjs
 * Trendkurven og de tal den står ved siden af.
 *
 * HVORFOR DEN FINDES. Mockuppen har en sparkline i hver række af den
 * økonomiske nøgletalstabel. En kurve uden akse er et FORM-INDTRYK: den kan
 * vise hvad som helst, og læses den som et niveau, er den løgn. Aftalen er
 * derfor at kurven aldrig står alene — der skal være et tal ved siden af, og
 * kurven skal have noget at tegne af.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  omkostningsserie, DEMO_DAEKNINGSGRAD_HISTORIK, maanedsEtiketter,
} from "../src/fleet/demo-oekonomi.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";

test("Kategorierne summer til KPI-nodens totaler", () => {
  /* Ellers siger tabellens rækker og dens totalrække hver sit — og det er
     den fejl hele skærmen handler om. */
  const { kategorier } = omkostningsserie();
  const faktisk = kategorier.reduce((s, c) => s + c.faktiskOere, 0);
  const budget = kategorier.reduce((s, c) => s + c.budgetOere, 0);
  assert.equal(faktisk, DEMO_KPI.oekonomi.driftsomkostningerOere, `faktisk`);
  assert.equal(budget, DEMO_KPI.oekonomi.budgetOere, `budget`);
});

test("Hver kategori har historik nok til en kurve", () => {
  /* MiniKurve tegner historik + det aktuelle tal. Med færre end to punkter
     kan der ikke tegnes en linje — i demo skal der være elleve plus én. */
  const { kategorier, historik } = omkostningsserie();
  assert.equal(historik.length, 11, `totalhistorikken`);
  for (const c of kategorier) {
    assert.equal(c.historik.length, 11, `/${c.id}`);
    assert.ok(c.historik.every(Number.isFinite), `/${c.id} har huller`);
  }
});

test("Historikkens sidste punkt ER forrigeOere", () => {
  /* Trenden regnes mod forrigeOere, og kurven tegnes af historik. Var de to
     forskellige tal, ville kurvens sidste knæk og procenttallet ved siden af
     beskrive hver sin måned — og de står i samme celle. */
  for (const c of omkostningsserie().kategorier) {
    assert.equal(c.historik.at(-1), c.forrigeOere, `/${c.id}`);
  }
});

test("Dækningsgradhistorikken har et punkt pr. måned undtagen den nyeste", () => {
  /* Den tolvte kommer fra KPI-noden, så grafens sidste punkt og nøgletallet
     ovenfor ikke kan vise hver sit. */
  assert.equal(maanedsEtiketter(12).length, 12);
  assert.equal(DEMO_DAEKNINGSGRAD_HISTORIK.length, 11);
});

test("Periodeafvigelserne findes som felter frem for i skærmen", () => {
  /* De kræver historik længere tilbage end de tolv måneder graferne har, og
     kan derfor ikke beregnes af det skærmen har. Reglen fra beslutning 6:
     et manglende KPI-tal defineres i demo-kpi.js, det hardkodes ikke. */
  const o = DEMO_KPI.oekonomi;
  for (const felt of ["driftsomkostningerDeltaPct", "ikkeFaktureretDeltaPct",
                      "daekningsgradDeltaPoint"]) {
    assert.ok(Number.isFinite(o[felt]), `oekonomi.${felt} mangler`);
  }
});

test("Budgetafvigelsen er IKKE et gemt felt", () => {
  /* Den er faktisk − budget og beregnes ét sted i skærmen. Mockuppens fejl
     var at tallet stod to steder på samme side, med modsat fortegn. */
  const o = DEMO_KPI.oekonomi;
  assert.equal("budgetAfvigelseOere" in o, false, `har et gemt afvigelsesfelt`);
  assert.equal("budgetAfvigelsePct" in o, false);
});

test("Trendkurven står aldrig alene i tabellen", () => {
  /* LINT. En MiniKurve i en tabelcelle skal have et tal ved siden af sig —
     ellers er den en aflæsning man ikke kan lave. Testen læser skærmen som
     tekst, som demo-kilder-linten gør. */
  const kilde = readFileSync(new URL("../src/moduler/Oekonomi.jsx", import.meta.url), "utf8");
  const i = kilde.indexOf("<MiniKurve");
  assert.ok(i > 0, "Oekonomi bruger ikke MiniKurve");
  const celle = kilde.slice(i, i + 400);
  assert.match(celle, /\{d\.pil\}|\{d\.text\}/,
    "MiniKurve står uden et tal ved siden af — en kurve uden akse er et " +
    "form-indtryk, ikke en aflæsning.");
});
