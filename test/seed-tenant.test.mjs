/* test/seed-tenant.test.mjs
 * Provisioneren kan pege på en kundes tenant — beslutning 72.
 *
 * ⚠ HVORFOR DEN KAN DET. `nordvest` (Nordvest Transport ApS) stod tom: kun
 * `_findes`, `moduler` og `virksomhed`. Skærmene skrev *"Nøgletallene er ikke
 * aggregeret for den her virksomhed endnu"* — rigtigt, men uden data er der
 * heller ikke noget at aggregere, og man kan hverken se om tallene passer
 * eller hvordan designet ser ud med indhold i.
 *
 * ⚠ OG TO TING SKAL VÆRE ANDERLEDES END I DEV. Der oprettes ingen brugere —
 * DEV-konti med kendte adgangskoder hører ikke i en kundes tenant — og seedet
 * FØLGER KUNDENS MODULER.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { modulForNode, SEED } from "../scripts/provisioner-dev.mjs";

const REGLER = readFileSync("firebase.rules.json", "utf8");
const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const KILDE = udenKommentarer(readFileSync("scripts/provisioner-dev.mjs", "utf8"));

describe("Modulet læses ud af reglerne", () => {
  /**
   * ⚠ IKKE EN LISTE I SCRIPTET. Reglens `.read` bærer allerede klausulen
   * `moduler').child('<modul>')`, og en liste her ville være den samme
   * kendsgerning to steder — den ene ville drive. Det er nøjagtig den fejl
   * beslutning 70 fjernede en hel akse for.
   */
  test("⚠ MAPPINGEN LÆSES, DEN SKRIVES IKKE AF", () => {
    for (const [node, modul] of [
      ["koeretoejer", "flaade"],
      ["bookinger", "booking"],
      ["kasser", "unitbooking"],
      ["varer", "warehouse"],
      ["fravaer", "bemanding"],
      ["indkoeb", "indkoeb"],
      ["kunder", "kunder"],
    ]) {
      assert.equal(modulForNode(node, REGLER), modul, `${node} spærres ikke af ${modul}`);
    }
  });

  /**
   * ⚠ NOGLE NODER HØRER TIL ALLE, OG DET ER MED VILJE.
   *
   * `personale` deles mellem Fleet og Workforce; `opgaver` spænder flere
   * moduler — samme carve-out som KPI-domænerne `opgaver` og `afvigelser`
   * (beslutning 33). Fik de en modulklausul, ville en kunde med kun Facility
   * ikke kunne se sine egne servicebesøg.
   */
  test("⚠ personale OG opgaver HØRER TIL ALLE", () => {
    assert.equal(modulForNode("personale", REGLER), null);
    assert.equal(modulForNode("opgaver", REGLER), null);
  });

  test("en node der ikke findes i reglerne, giver null frem for at kaste", () => {
    assert.equal(modulForNode("findesIkke", REGLER), null);
  });

  /**
   * ⚠ HVER SEEDET NODE SKAL KUNNE SLÅS OP. Kan en node ikke findes i
   * regelfilen, er den enten ikke reguleret — hvilket ville være et hul —
   * eller stavet forkert her, og så ville den blive seedet til enhver kunde.
   */
  test("⚠ HVER NODE I SEED STÅR I REGELFILEN", () => {
    const ukendte = [];
    for (const { node } of SEED) {
      const rod = node.split("/")[0];
      if (!new RegExp(`"${rod}":\\s*\\{`).test(REGLER)) ukendte.push(node);
    }
    assert.deepEqual(ukendte, [],
      "en seedet node står ikke i firebase.rules.json — enten et hul i reglerne "
      + "eller en stavefejl der seeder den til enhver kunde");
  });
});

describe("En kundes tenant behandles anderledes end dev's", () => {
  /**
   * ⚠ INGEN BRUGERE. DEV-brugerne har kendte adgangskoder fra `.env.local` og
   * findes for at prøve claims-kæden i en browser. Oprettedes de i en kundes
   * tenant, ville kunden have syv konti han ikke kender — med fulde perms.
   */
  test("⚠ DER OPRETTES INGEN BRUGERE PÅ EN KUNDES TENANT", () => {
    assert.match(KILDE, /for \(const b of erDev \?/,
      "brugerløkken kører uanset hvilken tenant der provisioneres");
  });

  /**
   * ⚠ SEEDET MÅ IKKE OPRETTE EN TENANT. `kundeopret` skriver også posten i
   * `udbyder/kunder`, som natjobbet henter sin tenantliste fra. En tenant
   * oprettet af et seed ville få data og ALDRIG få nøgletal — og det ville
   * ligne en fejl i aggregeringen.
   */
  test("⚠ EN UKENDT TENANT AFVISES FREM FOR AT BLIVE OPRETTET", () => {
    assert.match(KILDE, /findes ikke\. Opret den med kundeopret/,
      "seedet opretter en tenant uden om kundeopret");
  });

  test("⚠ SEEDET FØLGER KUNDENS MODULER", () => {
    assert.match(KILDE, /if \(!harModulet\(node\)\) \{/,
      "seedet skriver noder kunden ikke kan læse");
    /* Og udeladelsen rapporteres — en udeladelse man kan se, er et valg. */
    assert.match(KILDE, /sprunget over — kunden har ikke modulet/);
  });

  /**
   * ⚠ OG DE AFLEDTE POSTER FØLGER MED.
   *
   * Målt på nordvest, ikke antaget: første kørsel skrev **13 reservationer
   * med `kilde.type: "booking"`** — på etaper der ikke var seedet, fordi
   * kunden ikke har Booking-modulet. Tretten enheder så OPTAGET ud af en tur
   * ingen kunne slå op. Dertil en bookingtæller på 318 hos en kunde uden
   * bookinger: hans første booking ville hedde BKG-2026-00319, som om der lå
   * tre hundrede før den.
   *
   * **En afledt post arver ikke sit modulfilter af sig selv.**
   */
  test("⚠ RESERVATIONER OG TÆLLER FØLGER OGSÅ MODULET", () => {
    assert.match(KILDE, /harModulet\("etaper"\) \? DEMO_ETAPER : \[\]/,
      "etapernes reservationer skrives uanset om etaperne blev seedet");
    assert.match(KILDE, /harModulet\("bookinger"\) \? DEMO_BOOKINGER : \[\]/,
      "bookingtælleren sættes uanset om kunden har modulet");
  });
});

describe("Beskeden om manglende nøgletal er ikke forældet", () => {
  const UI = readFileSync("src/fleet/ui.jsx", "utf8");

  /**
   * ⚠ DEN SAGDE *"en aggregering der endnu ikke er bygget"* — og den ER
   * bygget: `kpiaggregering` kører hver nat, og `beregnKpi()` regner 44
   * felters værd. Beskeden stod på den skærm en ny kunde ser FØRST, og den
   * fortalte ham at systemet manglede noget der fandtes.
   */
  test("⚠ DEN PÅSTÅR IKKE AT AGGREGERINGEN MANGLER", () => {
    assert.ok(!/aggregering der endnu ikke er bygget/.test(UI),
      "beskeden siger stadig at aggregeringen ikke er bygget");
    assert.match(UI, /beregnes <b>hver nat<\/b>/,
      "beskeden siger ikke hvornår tallene så kommer");
  });

  /**
   * ⚠ OG DEN SIGER STADIG HVORFOR DET IKKE ER NUL. Det er hele grunden til at
   * tilstanden findes: "0 aktive enheder" ville være en PÅSTAND om at kunden
   * ingen har, og en ny kunde med fjorten ville tro systemet var i stykker.
   *
   * ⚠ OG DET HEDDER ENHEDER, IKKE KØRETØJER. Første udgave af den her tekst
   * skrev "0 aktive køretøjer" — og `test/navne.test.mjs` fangede det med det
   * samme. Fleets ting er en ENHED; ordet blev skiftet 37 steder, og en ny
   * streng må ikke lægge det tilbage.
   */
  test("den forklarer stadig hvorfor nul ville være forkert", () => {
    assert.match(UI, /ville være en påstand om at virksomheden ingen har/);
    assert.ok(!/0 aktive køretøjer/.test(UI), "det hedder enheder");
  });
});
