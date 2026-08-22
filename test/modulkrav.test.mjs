/* test/modulkrav.test.mjs
 * Et modul der ikke kan virke alene, må ikke sælges alene.
 *
 * ⚠ HVORFOR FILEN FINDES. `bookinger` har et PÅKRÆVET `kundeId`, og `kunder`
 * er sit eget modul. Sælges Planning uden Kunder, afviser reglen hver eneste
 * skrivning: kunden kan ikke oprette én booking. Han har betalt for et modul
 * der ikke kan bruges til noget.
 *
 * `kundemoduler` tog imod enhver kombination af kendte moduler. Kombinationen
 * var ikke forbudt — den var bare umulig, og det ville først vise sig hos
 * kunden.
 *
 * ⚠ KRAVET UDLEDES AF REGLERNE, IKKE AF EN HOLDNING. Et modul M kræver modul
 * N, hvis en node M ejer har et påkrævet felt der peger på en node N ejer.
 * Prøven regner listen ud af `firebase.rules.json` og holder den op mod
 * `MODUL_KRAEVER`. Får en node et nyt påkrævet felt der krydser en
 * modulgrænse, bliver den her rød — og så skal nogen tage stilling, frem for
 * at opdage det hos en kunde.
 *
 * ⚠ OG DET ER IKKE NAV-PUNKTERNES `kraeverModul`. Den skjuler et MENUPUNKT.
 * Det her er om modulet overhovedet kan bruges — en skjult menu ville bare
 * gøre et ubrugeligt modul usynligt.
 *
 * Se beslutning 93.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MODUL, MODUL_KRAEVER, NODE_MODUL, ALLE_MODULER,
  manglendeKrav, kravtekst,
} from "../src/fleet/moduler.js";

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules.tenants.$tenantId;

/**
 * Feltnavn → den node det peger på.
 *
 * ⚠ KUN DE FELTER DER KAN VÆRE PÅKRÆVEDE. Listen er bevidst kort: den skal
 * dække det `hasChildren([...])` faktisk nævner, ikke hvert id i modellen.
 * Et felt der mangler her, kan skjule et krav — derfor kræver prøven
 * nedenfor at hvert påkrævet felt der ender på `Id`, er kendt.
 */
const FELT_NODE = {
  kundeId: "kunder",
  koeretoejId: "koeretoejer",
  personId: "personale",
  lagerId: "lagre",
  leverandoerId: "leverandoerer",
  bookingId: "bookinger",
  etapeId: "etaper",
  kasseId: "kasser",
  vareId: "varer",
  carrierId: "carriers",
  /* Beholderen der SENDES med — samme node som `carrierId`, andet formål. */
  afsendCarrierId: "carriers",
  forbrugsvareId: "forbrugsvarer",
  aktivId: "facility",
  hjemPladsId: "reolpladser",
};

const modulerFor = (node) => {
  const m = NODE_MODUL[node];
  if (!m) return null;
  return Array.isArray(m) ? m : [m];
};

/** De felter en nodes `.validate` KRÆVER. */
function paakraevedeFelter(def) {
  const barn = Object.keys(def || {}).find((k) => k.startsWith("$"));
  const udtryk = barn ? def[barn]?.[".validate"] : null;
  if (typeof udtryk !== "string") return [];
  const m = udtryk.match(/hasChildren\(\[([^\]]*)\]\)/);
  if (!m) return [];
  return m[1].split(",").map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean);
}

/** Kravene, regnet ud af regelfilen. */
function udledteKrav() {
  const krav = {};
  const ukendte = new Set();
  for (const [node, def] of Object.entries(REGLER)) {
    if (node.startsWith(".")) continue;
    const ejere = modulerFor(node);
    if (!ejere) continue;                       /* noden er base */
    for (const felt of paakraevedeFelter(def)) {
      if (!/Id$/.test(felt)) continue;
      const mal = FELT_NODE[felt];
      if (!mal) { ukendte.add(`${node}.${felt}`); continue; }
      const malModuler = modulerFor(mal);
      if (!malModuler) continue;                /* målnoden er base */
      for (const em of ejere) {
        /* ⚠ DELT EJERSKAB ER IKKE ET KRAV. `reolpladser` ejes af BÅDE
           unitbooking og warehouse, så en unitbooking-kunde har den
           allerede — et "krav" der peger på noget han har, er støj. */
        if (malModuler.includes(em)) continue;
        for (const mm of malModuler) {
          (krav[em] = krav[em] || new Set()).add(mm);
        }
      }
    }
  }
  return { krav, ukendte: [...ukendte] };
}

describe("Kravene er udledt af reglerne, ikke skrevet af", () => {
  it("⚠ MODUL_KRAEVER ER PRÆCIS DET REGLERNE KRÆVER", () => {
    const { krav } = udledteKrav();
    const udledt = Object.fromEntries(
      Object.entries(krav).map(([k, v]) => [k, [...v].sort()]));
    const skrevet = Object.fromEntries(
      Object.entries(MODUL_KRAEVER).map(([k, v]) => [k, [...v].sort()]));

    assert.deepEqual(udledt, skrevet,
      "MODUL_KRAEVER passer ikke med det regelfilen kræver. Enten er et "
      + "påkrævet felt kommet til, eller også står der et krav reglerne ikke "
      + "har.\n  udledt:  " + JSON.stringify(udledt)
      + "\n  skrevet: " + JSON.stringify(skrevet));
  });

  /**
   * ⚠ ET FELT PRØVEN IKKE KENDER, KAN SKJULE ET KRAV. Springer den et
   * påkrævet `*Id` over, siger den ikke "intet krav" — den siger ingenting,
   * og det er samme fejl som linten der aldrig læste `src/moduler/`.
   */
  it("⚠ HVERT PÅKRÆVET *Id-FELT ER KENDT", () => {
    const { ukendte } = udledteKrav();
    assert.deepEqual(ukendte, [],
      "påkrævede referencefelter prøven ikke kender målnoden for:\n  "
      + ukendte.join("\n  "));
  });

  it("de moduler der kræves, findes i kataloget", () => {
    for (const [modul, kraever] of Object.entries(MODUL_KRAEVER)) {
      assert.ok(MODUL[modul], `${modul} er ikke et modul`);
      for (const k of kraever) assert.ok(MODUL[k], `${k} er ikke et modul`);
    }
  });
});

describe("manglendeKrav() svarer på det kombinationen kan", () => {
  it("⚠ PLANNING UDEN KUNDER ER EN UMULIG KOMBINATION", () => {
    assert.deepEqual(manglendeKrav(["booking", "flaade"]),
      [{ modul: "booking", kraever: "kunder" }]);
  });

  it("og med Kunder er den i orden", () => {
    assert.deepEqual(manglendeKrav(["booking", "kunder"]), []);
  });

  it("Warehouse uden Kunder er den samme fejl", () => {
    assert.deepEqual(manglendeKrav(["warehouse"]),
      [{ modul: "warehouse", kraever: "kunder" }]);
  });

  it("et tomt valg er gyldigt — de obligatoriske kræver ingenting", () => {
    assert.deepEqual(manglendeKrav([]), []);
    assert.deepEqual(manglendeKrav(), []);
  });

  /**
   * ⚠ DE OBLIGATORISKE TÆLLER MED. `dashboard`, `support` og `opsaetning` er
   * `altid: true` og står sjældent i en nyttelast. Talte de ikke med, ville
   * et krav til et af dem fælde et fuldstændig gyldigt valg.
   */
  it("⚠ DE OBLIGATORISKE REGNES SOM VALGTE", () => {
    const obligatoriske = ALLE_MODULER.filter((m) => MODUL[m].altid);
    assert.ok(obligatoriske.length >= 3);
    for (const m of obligatoriske) {
      assert.deepEqual(manglendeKrav([m]), [],
        `${m} er obligatorisk og kan ikke mangle`);
    }
  });

  it("alle moduler på én gang er altid i orden", () => {
    assert.deepEqual(manglendeKrav(ALLE_MODULER), []);
  });

  it("teksten nævner begge moduler ved deres rigtige navn", () => {
    const t = kravtekst(manglendeKrav(["booking"]));
    assert.match(t, /Planning/);
    assert.match(t, /Kunder/);
  });
});

describe("Serveren afviser kombinationen — ikke kun skærmen", () => {
  const KODE = readFileSync("functions/index.js", "utf8");

  const kropAf = (navn) => {
    const start = KODE.indexOf(`export const ${navn} = onCall`);
    assert.ok(start > 0, `fandt ikke ${navn}`);
    const slut = KODE.indexOf("\nexport const ", start + 10);
    return KODE.slice(start, slut > 0 ? slut : KODE.length);
  };

  /**
   * ⚠ BEGGE VEJE IND. Stod tjekket kun i `kundemoduler`, kunne en kunde FØDES
   * med en umulig kombination — og så ville den første fejl vise sig hos ham.
   */
  for (const navn of ["kundeopret", "kundemoduler"]) {
    it(`⚠ ${navn} KALDER manglendeKrav()`, () => {
      assert.match(kropAf(navn), /manglendeKrav\(/,
        `${navn} tager imod en kombination der ikke kan bruges`);
    });
  }

  it("⚠ DER TILFØJES IKKE AUTOMATISK", () => {
    /* Et manglende modul er noget kunden ikke har købt. At slå det til for
       ham ville enten forære det væk eller fakturere for noget han ikke bad
       om — samme retning som at en momssats ikke gættes. */
    for (const navn of ["kundeopret", "kundemoduler"]) {
      const krop = kropAf(navn);
      assert.ok(!/moduler\.push\(|\[\.\.\.d\.moduler,/.test(krop),
        `${navn} lægger et modul til af sig selv`);
    }
  });

  it("konsollen bruger den SAMME funktion", () => {
    const skaerm = readFileSync("src/moduler/udbyder/Konsol.jsx", "utf8");
    assert.match(skaerm, /manglendeKrav\(/,
      "konsollen tegner en knap serveren afviser");
  });
});
