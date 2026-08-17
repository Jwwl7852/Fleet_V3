/* test/reolplads.test.mjs
 * Hyldens ENE sandhed.
 *
 * ⚠ HELE FILEN FINDES FORDI CARRIEREN BLEV SIN EGEN NODE (WAREHOUSE.md 6.2).
 * Fra nu af står der tre slags ting på en reolplads — beholdningsposter,
 * transportkasser og carriers — og de ligger i hver sin node. Opgøres
 * belægningen mere end ét sted, bliver de to opgørelser uenige uden at nogen
 * kan se det. Det er `bemanding.ledig` og divisionsfilteret der stod to
 * steder.
 *
 * Skærmen talte i forvejen kun beholdningen og var dermed allerede blind for
 * Turtlebookings kasser. Den fejl er den her fil skrevet imod.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  belaegningPaaPlads, pladsErLedig, belaegningPrPlads,
} from "../src/fleet/reolplads.js";
import { DEMO_CARRIERS, DEMO_REOLPLADSER, DEMO_BEHOLDNING } from "../src/fleet/demo-lager.js";
import { DEMO_KASSER } from "../src/fleet/demo-turtlebooking.js";

const P = "p-a-01-02";

const SAET = {
  beholdning: [
    { pladsId: P, vareId: "v1", antal: 1000 },
    { pladsId: P, vareId: "v2", antal: 500 },
    { pladsId: "p-anden", vareId: "v3", antal: 10 },
  ],
  kasser: [
    { id: "MDT-101", pladsId: P },
    /* En udlånt kasse har ingen plads — den optager ingen hylde. */
    { id: "MDT-102", pladsId: null },
  ],
  carriers: [
    { id: "CRR-1", pladsId: P },
    { id: "CRR-2", pladsId: "p-anden" },
    /* I transit: ingen plads. */
    { id: "CRR-3" },
  ],
};

describe("belægningen tæller alle tre kilder", () => {
  it("⚠ EN HYLDE MED EN KASSE PÅ ER IKKE FRI", () => {
    /* Det er hele grunden til at funktionen findes. Talte vi kun
       beholdningen, ville en hylde med en transportkasse eller en carrier på
       stå som ledig — og en putaway ville blive foreslået til den. */
    const kunKasse = belaegningPaaPlads(
      { beholdning: [], kasser: [{ pladsId: P }], carriers: [] }, P);
    assert.equal(kunKasse.optaget, true);
    assert.equal(kunKasse.ialt, 1);
    assert.equal(kunKasse.varelinjer, 0);

    const kunCarrier = belaegningPaaPlads(
      { beholdning: [], kasser: [], carriers: [{ pladsId: P }] }, P);
    assert.equal(kunCarrier.optaget, true);
  });

  it("opgør de tre kilder hver for sig", () => {
    /* Hver for sig, fordi et samlet tal ikke kan forklare hvad der fylder. */
    const b = belaegningPaaPlads(SAET, P);
    assert.deepEqual(b, { varelinjer: 2, kasser: 1, carriers: 1, ialt: 4, optaget: true });
  });

  it("en tom plads er tom", () => {
    const b = belaegningPaaPlads(SAET, "p-tom");
    assert.equal(b.ialt, 0);
    assert.equal(b.optaget, false);
  });

  it("tåler at en kilde helt mangler", () => {
    /* Hos en kunde uden Turtlebooking findes `kasser` slet ikke, og listen er
       tom — ikke en fejl. Se `hent` i useListe.js. */
    assert.equal(belaegningPaaPlads({ beholdning: SAET.beholdning }, P).ialt, 2);
    assert.equal(belaegningPaaPlads({}, P).ialt, 0);
    assert.equal(belaegningPaaPlads(undefined, P).ialt, 0);
  });

  it("uden et plads-id svarer den nej frem for at gætte", () => {
    /* En carrier uden lokation må ikke komme til at tælle på en tilfældig
       hylde, bare fordi begge mangler feltet. */
    const b = belaegningPaaPlads(SAET, null);
    assert.equal(b.optaget, false);
    assert.equal(b.ialt, 0);
  });

  it("⚠ EN BEHOLDNINGSPOST PÅ NUL FYLDER IKKE", () => {
    /* Posten bliver stående når hylden tømmes — den er historik. Talte den
       med, ville hver eneste tømte hylde se optaget ud for altid. */
    const b = belaegningPaaPlads(
      { beholdning: [{ pladsId: P, vareId: "v1", antal: 0 }] }, P);
    assert.equal(b.ialt, 0);
    assert.equal(b.optaget, false);
  });
});

describe("hele lageret på én gang", () => {
  it("giver samme svar som ét opslag ad gangen", () => {
    /* To veje til samme tal er to steder at tage fejl. Prøven binder dem. */
    const alle = belaegningPrPlads(SAET);
    for (const id of [P, "p-anden", "p-tom"]) {
      const en = belaegningPaaPlads(SAET, id);
      const flere = alle[id] || { varelinjer: 0, kasser: 0, carriers: 0, ialt: 0, optaget: false };
      assert.deepEqual(flere, en, `uenighed om ${id}`);
    }
  });

  it("nævner ikke pladser der intet bærer", () => {
    assert.equal(belaegningPrPlads(SAET)["p-tom"], undefined);
  });
});

describe("ledig er ikke det samme som tom", () => {
  it("⚠ EN KARANTÆNERAMT PLADS ER IKKE LEDIG, SELV OM DER INTET STÅR", () => {
    /* Varen dér er under mistanke. Samme regel som at karantæne BLOKERER en
       pluk frem for at advare. */
    const tom = belaegningPaaPlads({}, "p-x");
    assert.equal(pladsErLedig({ id: "p-x", status: "aktiv" }, tom), true);
    assert.equal(pladsErLedig({ id: "p-x", status: "karantaene" }, tom), false);
    assert.equal(pladsErLedig({ id: "p-x", status: "lukket" }, tom), false);
  });

  it("en plads uden status er aktiv — Turtlebookings egne har ingen", () => {
    /* De fire WMS-felter er valgfrie (WAREHOUSE.md 3.3). En plads uden
       status må ikke falde ud som spærret. */
    assert.equal(pladsErLedig({ id: "p-x" }, belaegningPaaPlads({}, "p-x")), true);
  });

  it("en optaget plads er ikke ledig", () => {
    assert.equal(pladsErLedig({ id: P, status: "aktiv" }, belaegningPaaPlads(SAET, P)), false);
  });

  it("en plads der ikke findes, er ikke ledig", () => {
    assert.equal(pladsErLedig(null, { optaget: false }), false);
  });
});

describe("demo-sættet viser de tilfælde skærmen skal kunne tegne", () => {
  const alle = belaegningPrPlads({
    beholdning: DEMO_BEHOLDNING, kasser: DEMO_KASSER, carriers: DEMO_CARRIERS,
  });

  it("⚠ MINDST ÉN PLADS BÆRER BÅDE EN KASSE OG EN CARRIER", () => {
    /* Uden den kan man ikke se om skærmen tæller begge noder — og det er
       netop det den ikke gjorde før. */
    const delte = Object.values(alle).filter((b) => b.kasser > 0 && b.carriers > 0);
    assert.ok(delte.length >= 1,
      "ingen demo-plads deles af en transportkasse og en carrier");
  });

  it("mindst én plads bærer både beholdning og en carrier", () => {
    const blandet = Object.values(alle).filter((b) => b.varelinjer > 0 && b.carriers > 0);
    assert.ok(blandet.length >= 1, "ingen demo-plads har både varer og en carrier");
  });

  it("mindst én carrier står uden lokation", () => {
    /* De elleve på planchen. Tilstanden er rigtig, ikke en fejl. */
    assert.ok(DEMO_CARRIERS.some((c) => !c.pladsId));
  });

  it("hver demo-carrier står på en plads der findes", () => {
    const pladser = new Set(DEMO_REOLPLADSER.map((p) => p.id));
    for (const c of DEMO_CARRIERS) {
      if (c.pladsId) assert.ok(pladser.has(c.pladsId), `${c.id} står på "${c.pladsId}"`);
    }
  });
});

describe("skærmen bruger den fælles opgørelse", () => {
  /* ⚠ EN KODEPRØVE, som den der holder øje med `flet: true` i samme skærm.
     Adfærdsprøverne ovenfor kan ikke se om nogen tæller selv igen — og det er
     præcis dét der skal fanges. */
  const skaerm = readFileSync("src/moduler/warehouse/Lokationer.jsx", "utf8");

  it("kalder belaegningPrPlads frem for at tælle selv", () => {
    assert.ok(skaerm.includes("belaegningPrPlads("),
      "Lokationer.jsx opgør ikke længere belægningen ét sted");
  });

  it("læser både kasser og carriers", () => {
    assert.ok(skaerm.includes('useListe("carriers"'), "carriers læses ikke");
    assert.ok(skaerm.includes('useListe("kasser"'), "kasser læses ikke");
  });

  it("⚠ SPØRGER IKKE OM kasser UDEN TURTLEBOOKING", () => {
    /* Noden er spærret af modulet, og svaret ville være permission-denied —
       en afvisning brugeren ikke skal se, fordi den ikke er en fejl. */
    assert.ok(/hent:\s*harModul\(moduler,\s*"turtlebooking"\)/.test(skaerm),
      "kasser hentes uden hensyn til om tenanten har Turtlebooking");
  });
});
