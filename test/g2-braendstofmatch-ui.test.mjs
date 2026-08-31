/* test/g2-braendstofmatch-ui.test.mjs
 * G.2 — Brændstofmatch-sektionen i Fakturaer.jsx (Procure → Match &
 * kontantkøb).
 *
 * Samme "skærmen tegner, maskinen håndhæver"-disciplin som resten af
 * appen — se test/leverandoerportal-ui.test.mjs/f2-opgavedokumenter-ui.
 * test.mjs for samme metode. Denne fil beviser kun at kildeteksten følger
 * de mønstre resten af appen holder sig til; DEV-adfærden er verificeret
 * i en rigtig browser, se commit-teksten.
 *
 * Kør: npm test
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SKAERM = readFileSync("src/moduler/indkoeb/Fakturaer.jsx", "utf8");
const KLIENT = readFileSync("src/fleet/braendstofmatch-klient.js", "utf8");

describe("src/fleet/braendstofmatch-klient.js", () => {
  test("hver funktion går gennem kaldFunktion() — samme mønster som faktura.js", () => {
    assert.match(KLIENT, /import \{ kaldFunktion \} from "\.\.\/firebase\.js"/);
    assert.match(KLIENT, /kald\("braendstofAutomatch"/);
    assert.match(KLIENT, /kald\("braendstofMatchBekraeft"/);
  });

  test("⚠ 'ikkeMatchbar' AFVISES LOKALT UDEN EN GRUND — samme forvagt som matchFaktura()", () => {
    assert.match(KLIENT, /handling === "ikkeMatchbar" && !String\(grund \|\| ""\)\.trim\(\)/);
  });
});

describe("Brændstofmatch-sektionen i Fakturaer.jsx", () => {
  test("kalder den delte klient og de rene funktioner, ikke kaldFunktion direkte", () => {
    assert.match(SKAERM, /from "\.\.\/\.\.\/fleet\/braendstofmatch-klient\.js"/);
    assert.match(SKAERM, /from "\.\.\/\.\.\/fleet\/braendstofmatch\.js"/);
    assert.doesNotMatch(SKAERM, /kaldFunktion\(/,
      "skærmen kalder Cloud Functions direkte i stedet for gennem braendstofmatch-klient.js");
  });

  test("⚠ BRUGER DEN DELTE afgørAutomatch() TIL AT VISE HVORNÅR NOGET ER UTVETYDIGT — genopfinder ikke reglen i JSX'et", () => {
    assert.match(SKAERM, /bmAfgoerelse = afgørAutomatch\(bmForslag\)/);
    assert.doesNotMatch(SKAERM, /kvalificerede\.length\s*===\s*1/,
      "skærmen ser ud til selv at genimplementere 'ét kvalificerende forslag'-logikken");
  });

  test("⚠ FORSLAGENE REGNES I RENDER, IKKE GEMT I STATE OG IKKE HENTET FRA SERVEREN", () => {
    const start = SKAERM.indexOf("const bmForslag");
    assert.ok(start >= 0, "bmForslag findes ikke");
    const linje = SKAERM.slice(start, SKAERM.indexOf(";", start) + 1);
    assert.match(linje, /braendstofMatchForslag\(bmValgtLinje, tankninger\.data,/);
  });

  test("⚠ EN ALLEREDE MATCHET TANKNING KAN IKKE FORESLÅS IGEN — matchedeTankningIder sendes med", () => {
    assert.match(SKAERM, /matchedeTankningIder: bmMatchedeTankningIder/);
  });

  test("⚠ EN VELLYKKET HANDLING GENINDLÆSER BÅDE indkoeb OG braendstofmatch", () => {
    const start = SKAERM.indexOf("const koerBm =");
    const slut = SKAERM.indexOf("};", start);
    const krop = SKAERM.slice(start, slut);
    assert.match(krop, /indkoeb\.genindlaes\(\)/);
    assert.match(krop, /braendstofmatch\.genindlaes\(\)/);
  });

  test("⚠ AUTOMATCH GENINDLÆSER OGSÅ BEGGE LISTER", () => {
    const start = SKAERM.indexOf("const koerAutomatch =");
    const slut = SKAERM.indexOf("};", start);
    const krop = SKAERM.slice(start, slut);
    assert.match(krop, /indkoeb\.genindlaes\(\)/);
    assert.match(krop, /braendstofmatch\.genindlaes\(\)/);
  });

  test("⚠ TANKNINGERNE HENTES SERVER-SIDE FILTRERET PÅ art — ikke hele indberetninger-noden", () => {
    assert.match(SKAERM, /useListe\("indberetninger", \{\s*\n\s*ordnPaa: "art", lig: "braendstof"/);
  });

  test("⚠ 'ikkeMatchbar' KRÆVER EN BEGRUNDELSE I DIALOGEN — samme mønster som fakturamatch", () => {
    assert.match(SKAERM, /titel="Ingen af tankningerne passer"/);
    assert.match(SKAERM, /disabled=\{!bmGrund\.trim\(\) \|\| bmArbejder\}/);
  });

  test("⚠ 'Fjern match' ER SKJULT FOR EN BOGFØRT LINJE", () => {
    const start = SKAERM.indexOf(">Afgjorte<");
    assert.ok(start >= 0, "'Afgjorte'-overskriften findes ikke");
    const slut = SKAERM.indexOf("</Gitter>", start);
    const krop = SKAERM.slice(start, slut);
    assert.match(krop, /l\.fakturastatus !== "bogfoert" && \(/);
  });

  test("⚠ SAMME PERMISSION SOM KONTANTKØB (indkoeb.skriv) — ingen ny brændstofmatch-specifik permission i UI'et", () => {
    const start = SKAERM.indexOf('titel="Brændstofmatch"');
    const slut = SKAERM.indexOf("{valgt && (", start);
    const krop = SKAERM.slice(start, slut);
    assert.doesNotMatch(krop, /PERM\.braendstof/i);
    assert.match(krop, /maaKontant/);
  });
});
