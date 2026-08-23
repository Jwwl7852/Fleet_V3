/* test/modulmangler.test.mjs
 * En tom liste fordi modulet mangler, er ikke en tom liste.
 *
 * ⚠ HVORFOR FILEN FINDES — OG DEN ER EN FØLGE AF EN RETTELSE.
 *
 * Beslutning 94 fik `useListe` til at holde op med at spørge om noder kunden
 * ikke har modulet til. Det var rigtigt: forespørgslen ville være sikker på at
 * blive afvist, og afvisningen skrev en auditpost om nægtet adgang.
 *
 * Men listen blev **tom**, og tom er tvetydigt. `leverandoerNavn()` slog op i
 * den og skrev
 *
 *     "ukendt leverandør (lv-hydra)"
 *
 * på hver eneste værkstedsopgave i arbejdskøen hos en kunde uden Procure. Det
 * er en **påstand om at hans data er i stykker**, fremsat af et opslag der
 * aldrig havde noget at slå op i.
 *
 * Funktionens egen kommentar sagde hvorfor teksten fandtes: *"et id der ikke
 * kan slås op, er en fejl i data og ikke en manglende værdi."* Den sætning er
 * rigtig — når vi HAR kartoteket. Den holder ikke, når vi ikke har spurgt.
 *
 * Det er samme fejlklasse som datatilstand.js selv er skrevet imod: en
 * tilstand oversat til en anden, hvor den forkerte af de to ser ud som en
 * fejl hos brugeren.
 *
 * Se beslutning 95.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TILSTAND, blokerer, vaerste } from "../src/fleet/datatilstand.js";
import { leverandoerNavn } from "../src/fleet/leverandoerer.js";

const LISTE = [
  { id: "lv-hydra", navn: "Hydra Teknik" },
  { id: "lv-scania", navn: "Scania Kolding" },
];

describe("Et opslag i en TOM liste er ikke et mislykket opslag", () => {
  it("⚠ TOM LISTE GIVER ID'ET — IKKE EN ANKLAGE", () => {
    assert.equal(leverandoerNavn([], "lv-hydra"), "lv-hydra");
    assert.equal(leverandoerNavn(null, "lv-hydra"), "lv-hydra");
    assert.equal(leverandoerNavn(undefined, "lv-hydra"), "lv-hydra");
  });

  it("⚠ MEN EN LISTE VI HAR, OG ET ID DER IKKE ER I DEN, ER STADIG EN FEJL", () => {
    /* Så HAVDE vi kartoteket og fandt ham ikke — det er en fejl i data, og
       den skal ses. Rettelsen må ikke dæmpe den. */
    assert.equal(leverandoerNavn(LISTE, "lv-findes-ikke"),
      "ukendt leverandør (lv-findes-ikke)");
  });

  it("et navn der findes, står som det er", () => {
    assert.equal(leverandoerNavn(LISTE, "lv-hydra"), "Hydra Teknik");
  });

  it("intet id giver en streg, ikke en anklage om ingenting", () => {
    assert.equal(leverandoerNavn(LISTE, null), "—");
    assert.equal(leverandoerNavn([], undefined), "—");
  });
});

describe("Tilstanden siger HVORFOR listen er tom", () => {
  it("⚠ modulMangler ER IKKE naegtet", () => {
    /* Forskellen er ikke akademisk: en afvisning betyder at nogen skal se på
       rettighederne, mens et manglende modul betyder at nogen skal ringe til
       os. Samme skelnen som filen selv er skrevet for. */
    assert.notEqual(TILSTAND.modulMangler, TILSTAND.naegtet);
    assert.ok(TILSTAND.modulMangler);
  });

  it("⚠ OG DEN BLOKERER ALDRIG EN SKÆRM", () => {
    /* Noden hører sjældent til skærmens eget modul — Arbejdskøen læser
       `leverandoerer`, som er Procures. Blokerede den, ville en kunde uden
       Procure miste sin Fleet-arbejdskø, fordi et leverandørnavn ikke kunne
       slås op. */
    assert.equal(blokerer({ art: TILSTAND.modulMangler }), false);
    /* De øvrige blokerer stadig — rettelsen må ikke løsne dem. */
    assert.equal(blokerer({ art: TILSTAND.naegtet }), true);
    assert.equal(blokerer({ art: TILSTAND.forbindelse }), true);
    assert.equal(blokerer({ art: TILSTAND.uautentificeret }), true);
  });

  it("⚠ EN AFVISNING VEJER TUNGERE END ET MANGLENDE MODUL", () => {
    /* Læser en skærm to noder, og er den ene afvist mens den anden bare
       hører til et fravalgt modul, er det AFVISNINGEN brugeren skal se. */
    assert.equal(
      vaerste({ art: TILSTAND.modulMangler }, { art: TILSTAND.naegtet }).art,
      TILSTAND.naegtet);
    assert.equal(
      vaerste({ art: TILSTAND.modulMangler }, { art: TILSTAND.forbindelse }).art,
      TILSTAND.forbindelse);
  });

  it("men den vejer tungere end ok — ellers ville den forsvinde", () => {
    assert.equal(
      vaerste({ art: TILSTAND.ok }, { art: TILSTAND.modulMangler }).art,
      TILSTAND.modulMangler);
  });

  it("den viser ALDRIG demo-data", () => {
    /* Opdigtede tal findes kun hvor der ikke er en database at spørge
       (beslutning 26). Her ER der en — vi har bare ikke spurgt. */
    const kode = readFileSync("src/fleet/useListe.js", "utf8");
    const i = kode.indexOf("art: TILSTAND.modulMangler");
    assert.ok(i > 0, "useListe sætter aldrig tilstanden");
    const linje = kode.slice(i, kode.indexOf("\n", i));
    assert.match(linje, /visDemo: false/);
  });
});

describe("Skærmen kan sige det", () => {
  const UI = readFileSync("src/fleet/ui.jsx", "utf8");

  it("⚠ <Datatilstand> HAR EN TEKST TIL DEN", () => {
    assert.match(UI, /art === "modulMangler"/,
      "uden en gren viser komponenten ingenting, og så er tilstanden usynlig");
  });

  it("⚠ OG DEN NÆVNER MODULET VED NAVN", () => {
    /* "De her oplysninger hører til et andet modul" er ubrugeligt: kunden
       skal kunne sige HVILKET når han ringer. */
    const i = UI.indexOf('art === "modulMangler"');
    const blok = UI.slice(i, i + 900);
    assert.match(blok, /MODUL\[m\]\?\.label/,
      "teksten skal slå modulets rigtige navn op");
  });

  it("⚠ INGEN GENPRØV-KNAP", () => {
    /* Der er intet at prøve igen. En knap ville love at det kunne løses ved
       at klikke — samme grund som ikkeAggregeret ikke har en. */
    const i = UI.indexOf('art === "modulMangler"');
    const blok = UI.slice(i, i + 900);
    assert.ok(!/genprov/.test(blok), "en genprøv-knap lover noget den ikke kan holde");
  });
});
