/* test/facility-drift.test.mjs
 * De afledte tilstande på Facility, og demo-sættets invarianter.
 *
 * HVORFOR DEN FINDES. Mockuppen viste Normal/Advarsel/Kritisk pr. lokation, og
 * det nærliggende var et statusfelt. Et felt ville drive fra anlæggene under
 * det: står der Kritisk på en hal hvor den sidste fejl blev lukket i går, er
 * status en påstand og ikke en oplysning. Samme grund som alarmTilstand() ikke
 * er et gemt flag.
 *
 * ⚠ SENSORDATA ER FJERNET SOM KILDE (produktejer-review 2026-09-02, anden
 * runde). lokationTilstand() og driftsforhold() tog begge et `par`
 * (zone+måling fra facility/zoner+sensorer) og lod det gøre en lokation
 * kritisk eller vise en temperatur. `facility/sensorer` har ingen reel
 * V1-datakilde — se noterne i fleet/facility.js selv og
 * docs/product-redesign-v1/01_ROUTE_DISPOSITION.md linje 165 — så et `par`
 * i kaldet ignoreres nu af begge funktioner. De tests der herunder beviser
 * det, er ikke overflødige bare fordi parameteren er væk: en fremtidig
 * tilføjelse af sensordata igen skal først bevidst fjerne netop den.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import { lokationTilstand, driftsforhold, aktivFordeling } from "../src/fleet/facility.js";
import { DEMO_LOKATIONER, DEMO_AKTIVER, demoAabneFejl } from "../src/fleet/demo-facility.js";
import { DEMO_PERSONALE } from "../src/fleet/demo-personale.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { erSted } from "../src/fleet/steder.js";

const ctx = () => ({ aktiver: DEMO_AKTIVER, aabneFejl: demoAabneFejl() });

test("Lokationens tilstand er afledt", async (t) => {
  await t.test("⚠ en sensormåling over grænsen gør IKKE lokationen kritisk", () => {
    /* facility/sensorer har ingen reel V1-datakilde — se filens hoved. Denne
       test var før "en klimaalarm er kritisk uanset fejlenes alvor" og
       beviste det modsatte; den beviser nu at et `par` i kaldet ignoreres. */
    const zone = { id: "z", lokationId: "L", graenser: { minC: 2, maksC: 6 } };
    const t1 = lokationTilstand("L", {
      aktiver: [{ id: "a", lokationId: "L", art: "koeleanlaeg", status: "idrift" }],
      aabneFejl: [],
      par: [{ zone, maaling: { tempC: 9.9 } }],
    });
    assert.equal(t1.tekst, "Normal");
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

test("Driftsforhold viser porte og ventilation fra rigtige aktiver", async (t) => {
  await t.test("en port der er ude af drift, tælles med", () => {
    const raekker = driftsforhold("L", {
      aktiver: [
        { id: "p1", lokationId: "L", art: "port", status: "idrift" },
        { id: "p2", lokationId: "L", art: "port", status: "udeAfDrift" },
      ],
    });
    const porte = raekker.find((r) => r.label === "Porte");
    assert.equal(porte.vaerdi, "1 af 2 porte nede");
    assert.equal(porte.tone, "bad");
  });

  await t.test("⚠ et `par` i kaldet ignoreres — ingen temperatur- eller alarmrække", () => {
    /* Kortet havde før en temperaturrække (lokationens koldeste zone) og en
       "Klimaalarmer"-række, begge fra facility/zoner+sensorer. Ingen af dem
       må komme tilbage, heller ikke selvom en kalder stadig sender et `par`. */
    const raekker = driftsforhold("L", {
      aktiver: [],
      par: [
        { zone: { id: "koel", navn: "Kølerum", lokationId: "L", graenser: { minC: 2, maksC: 6 } },
          maaling: { tempC: 99 } },
      ],
    });
    assert.equal(raekker.length, 0);
    assert.ok(!raekker.some((r) => r.ikon === "termometer" || r.label === "Klimaalarmer"));
  });

  await t.test("en lokation uden porte eller ventilation giver en tom liste", () => {
    /* Kølehus Odense har kun køleanlæg — det er ikke et hul, det er den
       eneste anlægstype driftsforhold() i dag kan udlede noget om. */
    const raekker = driftsforhold("L", {
      aktiver: [{ id: "k1", lokationId: "L", art: "koeleanlaeg", status: "idrift" }],
    });
    assert.equal(raekker.length, 0);
  });
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

  await t.test("hver del hedder navn — Donut-primitivets kontrakt", () => {
    /* Hed feltet label, tegnede figuren rigtigt og legenden stod tom. En test
       af tallene alene ville ikke have fanget det. */
    for (const d of aktivFordeling({ port: 4, koeleanlaeg: 3, oevrige: 2 })) {
      assert.ok(typeof d.navn === "string" && d.navn.length,
        `en del uden navn: ${JSON.stringify(d)}`);
    }
  });

  await t.test("demo-fordelingen summer til kpi.facility.aktiver", () => {
    /* Ellers beskriver donutten en anden aktivbase end nøgletallet over den. */
    const f = DEMO_KPI.facility;
    const sum = aktivFordeling(f.aktiverPrArt).reduce((s, d) => s + d.antal, 0);
    assert.equal(sum, f.aktiver, `${sum} ≠ ${f.aktiver}`);
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
