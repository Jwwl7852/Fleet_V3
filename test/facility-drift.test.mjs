/* test/facility-drift.test.mjs
 * De afledte tilstande på Facility, og demo-sættets invarianter.
 *
 * HVORFOR DEN FINDES. Mockuppen viste Normal/Advarsel/Kritisk pr. lokation, og
 * det nærliggende var et statusfelt. Et felt ville drive fra anlæggene under
 * det: står der Kritisk på en hal hvor den sidste fejl blev lukket i går, er
 * status en påstand og ikke en oplysning. Samme grund som alarmTilstand() ikke
 * er et gemt flag.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import { lokationTilstand, driftsforhold, aktivFordeling } from "../src/fleet/facility.js";
import {
  DEMO_LOKATIONER, DEMO_AKTIVER, demoAabneFejl, zonePar,
} from "../src/fleet/demo-facility.js";
import { DEMO_PERSONALE } from "../src/fleet/demo-personale.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { erSted } from "../src/fleet/steder.js";

const ctx = () => ({ aktiver: DEMO_AKTIVER, aabneFejl: demoAabneFejl(), par: zonePar() });

test("Lokationens tilstand er afledt", async (t) => {
  const zone = { id: "z", lokationId: "L", graenser: { minC: 2, maksC: 6 } };

  await t.test("en klimaalarm er kritisk uanset fejlenes alvor", () => {
    /* Står et kølerum for varmt, er varen i fare. Det er ikke et spørgsmål
       om hvem der meldte det, eller hvor højt de satte prioriteten. */
    const t1 = lokationTilstand("L", {
      aktiver: [{ id: "a", lokationId: "L", art: "koeleanlaeg", status: "idrift" }],
      aabneFejl: [],
      par: [{ zone, maaling: { tempC: 9.9 } }],
    });
    assert.equal(t1.tekst, "Kritisk");
    assert.equal(t1.grund, "aktiv klimaalarm");
  });

  await t.test("et anlæg ude af drift er kritisk", () => {
    const t1 = lokationTilstand("L", {
      aktiver: [{ id: "a", lokationId: "L", art: "port", status: "udeAfDrift" }],
    });
    assert.equal(t1.tekst, "Kritisk");
  });

  await t.test("en åben fejl af lav alvor er kun en advarsel", () => {
    const t1 = lokationTilstand("L", {
      aktiver: [{ id: "a", lokationId: "L", art: "port", status: "idrift" }],
      aabneFejl: [{ aktivId: "a", alvor: "lav" }],
    });
    assert.equal(t1.tekst, "Advarsel");
  });

  await t.test("intet åbent er Normal", () => {
    const t1 = lokationTilstand("L", {
      aktiver: [{ id: "a", lokationId: "L", art: "port", status: "idrift" }],
    });
    assert.equal(t1.tekst, "Normal");
  });

  await t.test("en fejl på et ANDET steds anlæg smitter ikke", () => {
    /* Uden filtreringen på lokationId ville én defekt port gøre hele
       organisationen kritisk. */
    const t1 = lokationTilstand("L", {
      aktiver: [
        { id: "a", lokationId: "L", art: "port", status: "idrift" },
        { id: "b", lokationId: "ANDET", art: "port", status: "udeAfDrift" },
      ],
      aabneFejl: [{ aktivId: "b", alvor: "hoej" }],
    });
    assert.equal(t1.tekst, "Normal");
  });

  await t.test("hver demo-lokation får en kendt tilstand", () => {
    for (const l of DEMO_LOKATIONER) {
      const t1 = lokationTilstand(l.id, ctx());
      assert.ok(["Normal", "Advarsel", "Kritisk"].includes(t1.tekst), `${l.id}: ${t1.tekst}`);
      assert.ok(t1.grund, `${l.id} mangler en grund`);
    }
  });
});

test("Driftsforhold viser lokationens KOLDESTE zone", () => {
  /* Et kontor på 21 grader siger intet om et kølerum ved siden af. Vælges
     den første zone i stedet for den koldeste, kan et kølerum over grænsen
     stå bag et grønt flueben. */
  const raekker = driftsforhold("L", {
    aktiver: [],
    par: [
      { zone: { id: "kontor", navn: "Kontor", lokationId: "L", graenser: { minC: 5, maksC: 25 } },
        maaling: { tempC: 21.0 } },
      { zone: { id: "koel", navn: "Kølerum", lokationId: "L", graenser: { minC: 2, maksC: 6 } },
        maaling: { tempC: 4.2 } },
    ],
  });
  assert.equal(raekker[0].label, "Kølerum");
  assert.equal(raekker[0].vaerdi, "4.2 °C");
});

test("Aktivfordelingen folder til fem og bevarer summen", async (t) => {
  await t.test("seks kategorier bliver til fem", () => {
    /* Seriepaletten har fem farver. En sjette ville genbruge den første, og
       så betyder to slices i samme figur det samme uden at gøre det. */
    const f = aktivFordeling({ a: 10, b: 9, c: 8, d: 7, e: 6, f: 5 });
    assert.equal(f.length, 5);
    assert.equal(f[4].antal, 11, "de to mindste skal lægges sammen");
    assert.deepEqual(f.map((x) => x.antal).reduce((s, n) => s + n, 0), 45);
  });

  await t.test("fem eller færre foldes ikke", () => {
    const f = aktivFordeling({ a: 3, b: 2 });
    assert.equal(f.length, 2);
    assert.ok(!f.some((x) => x.dele));
  });

  await t.test("demo-fordelingen summer til kpi.facility.aktiver", () => {
    /* Ellers beskriver donutten en anden aktivbase end nøgletallet over den. */
    for (const div of ["gods", "bus"]) {
      const f = DEMO_KPI[div].facility;
      const sum = aktivFordeling(f.aktiverPrArt).reduce((s, d) => s + d.antal, 0);
      assert.equal(sum, f.aktiver, `${div}: ${sum} ≠ ${f.aktiver}`);
    }
  });
});

test("Demo-facility hænger sammen med resten", async (t) => {
  await t.test("hver lokations sted står i STED-kataloget", () => {
    for (const l of DEMO_LOKATIONER) {
      assert.ok(erSted(l.sted), `${l.id} står i "${l.sted}", som ikke er et sted`);
    }
  });

  await t.test("hvert aktiv har en ansvarlig der findes i personale", () => {
    /* ⚠ personId, ALDRIG uid. En facilityansvarlig har måske intet login;
       bytter man om, matcher ejerskabstjekket i reglerne aldrig. */
    const ider = new Set(DEMO_PERSONALE.map((p) => p.id));
    for (const a of DEMO_AKTIVER) {
      assert.ok(a.ansvarligPersonId, `${a.id} har ingen ansvarlig`);
      assert.ok(ider.has(a.ansvarligPersonId),
        `${a.id} peger på personId "${a.ansvarligPersonId}", som ikke findes`);
    }
  });

  await t.test("hver lokation har mindst ét aktiv", () => {
    /* En tom lokation er en række der ikke kan svare på noget — og
       driftskortet ville stå tomt hvis nogen klikkede på den. */
    for (const l of DEMO_LOKATIONER) {
      const n = DEMO_AKTIVER.filter((a) => a.lokationId === l.id).length;
      assert.ok(n > 0, `${l.id} har ingen aktiver`);
    }
  });
});
