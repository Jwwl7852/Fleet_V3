/* test/servicepunkter.test.mjs
 * Fleet §9.10 Servicebog — intervalregning, status og valideServicepunkt().
 *
 * ⚠ INGEN REACT, INGEN EMULATOR. Samme opdeling som driftskalender.js: hvad
 * der kan prøves rent, prøves rent. `firebase.rules.json`'s nestede
 * .validate under koeretoejer/$id/servicepunkter/$id spejler
 * valideServicepunkt() — se test/rules.tenant.test.mjs for hvordan
 * regelfilens egen node-liste udledes; denne fil rører kun det rene lag.
 *
 * Kør: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SERVICEPUNKT_TYPE, ALLE_SERVICEPUNKT_TYPER,
  tilfoejMaaneder, naesteForfaldMs, naesteForfaldKm,
  servicepunktStatus, SERVICEPUNKT_STATUS,
  valideServicepunkt, byggUdfoerelse,
  alleServicepunkter, sorterServicepunkter,
} from "../src/fleet/servicepunkter.js";

const DAG = 86400000;

describe("kataloget", () => {
  it("har de fem typer §9.10 nævner", () => {
    assert.deepEqual(ALLE_SERVICEPUNKT_TYPER,
      ["syn", "service", "daek", "lovpligtigt", "egen"]);
  });

  it("hver type har et label", () => {
    for (const t of ALLE_SERVICEPUNKT_TYPER) {
      assert.ok(SERVICEPUNKT_TYPE[t].label, `${t} mangler et label`);
    }
  });
});

describe("tilfoejMaaneder", () => {
  it("lægger kalendermåneder til, ikke 30 dage ad gangen", () => {
    /* 31. januar + 1 måned: JS's Date ruller selv over i marts, hvis
       februar ikke har 31 dage — det er en kendt JS-adfærd, ikke noget
       funktionen selv opfinder. Vi prøver derfor en dato uden den fælde. */
    const jan15 = new Date(2026, 0, 15).getTime();
    const feb15 = tilfoejMaaneder(jan15, 1);
    assert.equal(new Date(feb15).getMonth(), 1);
    assert.equal(new Date(feb15).getDate(), 15);
  });
});

describe("naesteForfaldMs / naesteForfaldKm", () => {
  it("⚠ null NÅR PUNKTET ALDRIG ER UDFØRT — ikke 'om intervallet fra nu'", () => {
    assert.equal(naesteForfaldMs({ intervalMaaneder: 6 }), null);
    assert.equal(naesteForfaldKm({ intervalKm: 20000 }), null);
  });

  it("null når intervallet slet ikke er sat", () => {
    assert.equal(naesteForfaldMs({ senestUdfoertMs: Date.now() }), null);
    assert.equal(naesteForfaldKm({ senestUdfoertKm: 100000 }), null);
  });

  it("regner forfaldet af senest udført + interval", () => {
    const senest = new Date(2026, 0, 1).getTime();
    const punkt = { intervalMaaneder: 6, senestUdfoertMs: senest };
    assert.equal(naesteForfaldMs(punkt), tilfoejMaaneder(senest, 6));

    assert.equal(naesteForfaldKm({ intervalKm: 20000, senestUdfoertKm: 100000 }), 120000);
  });
});

describe("servicepunktStatus", () => {
  const nu = Date.now();

  it("⚠ 'ukendt' ER IKKE 'ok' — et upåbegyndt punkt kan ikke være til tiden", () => {
    assert.equal(servicepunktStatus({}, { nu }), "ukendt");
    assert.equal(servicepunktStatus({ intervalMaaneder: 6 }, { nu }), "ukendt");
  });

  it("forfalden når datoen er passeret", () => {
    const punkt = { intervalMaaneder: 1, senestUdfoertMs: nu - 60 * DAG };
    assert.equal(servicepunktStatus(punkt, { nu }), "forfalden");
  });

  it("snart inden for varselsvinduet, ok uden for", () => {
    const snart = { intervalMaaneder: 1, senestUdfoertMs: nu };
    // Om ca. en måned, altså langt uden for 30-dages-varslet lige nu.
    assert.equal(servicepunktStatus(snart, { nu }), "ok");

    const lige = { senestUdfoertMs: nu - 20 * DAG, intervalMaaneder: 1 };
    // Én måned efter "for 20 dage siden" lander ~8-11 dage ude — inden for
    // VARSEL_DAGE (30) uanset om måneden har 28, 30 eller 31 dage.
    const forfaldOm = naesteForfaldMs(lige) - nu;
    assert.ok(forfaldOm > 0 && forfaldOm < 30 * DAG, "test-opsætningen selv skal ramme varselsvinduet");
    assert.equal(servicepunktStatus(lige, { nu }), "snart");
  });

  it("km-baseret forfald bruger den faktiske kmStand, ikke et gæt", () => {
    const punkt = { intervalKm: 20000, senestUdfoertKm: 100000 };
    assert.equal(servicepunktStatus(punkt, { nu, kmStand: 119500 }), "snart");
    assert.equal(servicepunktStatus(punkt, { nu, kmStand: 121000 }), "forfalden");
    assert.equal(servicepunktStatus(punkt, { nu, kmStand: 105000 }), "ok");
    // Ingen kendt kmStand — kan ikke afgøres af km alene.
    assert.equal(servicepunktStatus(punkt, { nu }), "ok");
  });

  it("hvert statusnøgle har en pille i SERVICEPUNKT_STATUS", () => {
    for (const s of ["forfalden", "snart", "ok", "ukendt"]) {
      assert.ok(SERVICEPUNKT_STATUS[s]?.label, `${s} mangler et label`);
    }
  });
});

describe("valideServicepunkt", () => {
  it("kræver type, label og mindst ét interval", () => {
    const f = valideServicepunkt({});
    assert.ok(f.type);
    assert.ok(f.label);
    assert.ok(f.interval);
  });

  it("godtager et km-baseret punkt uden dato-interval", () => {
    const f = valideServicepunkt({ type: "daek", label: "Dækskift", intervalKm: 20000 });
    assert.deepEqual(f, {});
  });

  it("afviser et negativt interval", () => {
    const f = valideServicepunkt({
      type: "service", label: "Service", intervalMaaneder: -3,
    });
    assert.ok(f.intervalMaaneder);
  });

  it("afviser en ukendt type", () => {
    const f = valideServicepunkt({ type: "olieskift", label: "X", intervalKm: 1 });
    assert.ok(f.type);
  });
});

describe("byggUdfoerelse", () => {
  it("bærer et tidspunkt, en valgfri km og en valgfri kommentar", () => {
    const u = byggUdfoerelse({ ms: 123, km: 45000, kommentar: "OK", udfoertAf: "uid-1" });
    assert.deepEqual(u, { udfoertMs: 123, udfoertKm: 45000, kommentar: "OK", udfoertAf: "uid-1" });
  });

  it("km er null, ikke NaN, når den ikke er kendt", () => {
    const u = byggUdfoerelse({ ms: 123 });
    assert.equal(u.udfoertKm, null);
  });
});

describe("alleServicepunkter / sorterServicepunkter", () => {
  const nu = Date.now();
  const koeretoejer = [
    {
      id: "kt-1", kmStand: 100000,
      servicepunkter: {
        "p-forfalden": { type: "syn", label: "Syn", intervalMaaneder: 12, senestUdfoertMs: nu - 400 * DAG },
        "p-inaktiv": { type: "egen", label: "Skjult", aktiv: false },
      },
    },
    {
      id: "kt-2", kmStand: 50000,
      servicepunkter: {
        "p-ok": { type: "daek", label: "Dæk", intervalKm: 20000, senestUdfoertKm: 40000 },
      },
    },
    { id: "kt-3" }, // ingen servicepunkter overhovedet
  ];

  it("⚠ FLADER UD PÅ TVÆRS AF ENHEDER, INGEN NY FORESPØRGSEL", () => {
    const alle = alleServicepunkter(koeretoejer, { nu });
    assert.equal(alle.length, 2, "det inaktive punkt og den enhed uden punkter skal springes over");
    const forfalden = alle.find((p) => p.id === "p-forfalden");
    assert.equal(forfalden.koeretoejId, "kt-1");
    assert.equal(forfalden.status, "forfalden");
  });

  it("sorterer forfaldne før ok, og aldrig et inaktivt punkt", () => {
    const alle = alleServicepunkter(koeretoejer, { nu });
    const sorteret = sorterServicepunkter(alle);
    assert.equal(sorteret[0].id, "p-forfalden");
    assert.ok(!sorteret.some((p) => p.id === "p-inaktiv"));
  });
});
