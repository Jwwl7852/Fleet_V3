import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EJER_KPI_DEFINITIONER, beregnEjerKpi, maanedsperiode } from "../src/fleet/ejer-kpi.js";

const DATA = {
  periode: "2026-08", nuDato: "2026-09-10",
  dinero: {
    dokumenter: {
      faktura: {
        f1: { guid: "f1", dato: "2026-08-05", forfaldsdato: "2026-08-10", mailStatus: "Sent", totalEksklMomsOere: 100000, totalInklMomsOere: 125000, betaling: { restOere: 50000, poster: [{ Id: "p1", Date: "2026-08-20", Amount: 750 }] } },
        f2: { guid: "f2", dato: "2026-08-08", forfaldsdato: "2026-10-01", mailStatus: "Failed", totalEksklMomsOere: 40000, totalInklMomsOere: 50000, betaling: { restOere: 50000, poster: [] } },
      },
      kreditnota: { c1: { guid: "c1", dato: "2026-08-18", status: "Booked", totalEksklMomsOere: 20000 } },
    },
    posteringer: {
      e1: { id: "e1", dato: "2026-08-02", kontonummer: "4000", beloebOere: 10000 },
      e2: { id: "e2", dato: "2026-08-03", kontonummer: "4000", beloebOere: -2000, bilagMatch: { b1: true } },
      e3: { id: "e3", dato: "2026-08-04", kontonummer: "9999", beloebOere: 9000 },
      e4: { id: "e4", dato: "2026-07-31", kontonummer: "4000", beloebOere: 7000 },
    },
    kontomapping: { "4000": { resultatkonto: true, kategori: "Drift", koefficient: 1 } },
    synk: { status: { posteringer: { status: "ajour" } } },
  },
  bilag: {
    b1: { id: "b1", status: "ny" },
    b2: { id: "b2", status: "mulig_dublet", metadata: { aktuel: { totalOere: 12500 } } },
    b3: { id: "b3", status: "godkendt", metadata: { aktuel: { totalOere: 25000 } } },
  },
  aftaler: {
    a1: { id: "a1", status: "aktiv", aktuelVersion: 1, versioner: { 1: { prisSnapshot: { beregning: { maanedlig: { beloebOere: 30000 }, introMaanedlig: { beloebOere: 20000 } } } } } },
    a2: { id: "a2", status: "planlagt", aktuelVersion: 1, versioner: {} },
  },
  crm: {
    v1: { muligheder: {
      m1: { fase: "behov", maanedligVaerdiOere: 50000, engangsVaerdiOere: 100000 },
      m2: { fase: "vundet", opdateretDato: "2026-08-10", maanedligVaerdiOere: 0, engangsVaerdiOere: 0 },
      m3: { fase: "tabt", opdateretDato: "2026-08-12", maanedligVaerdiOere: 0, engangsVaerdiOere: 0 },
    }, aktiviteter: { x1: { status: "aaben", fristDato: "2026-09-01" } } },
  },
};

test("månedens grænser er kalenderdatoer og ikke lokale klokkeslæt", () => {
  assert.deepEqual(maanedsperiode("2026-02"), { maaned: "2026-02", fra: "2026-02-01", til: "2026-02-28" });
  assert.throws(() => maanedsperiode("august"), /ÅÅÅÅ-MM/);
});

test("faktureret salg bruger kun dokumenteret sendte fakturaer og bogførte kreditnotaer", () => {
  const kpi = beregnEjerKpi(DATA);
  assert.equal(kpi.salg.fakturaNettoOere, 100000);
  assert.equal(kpi.salg.kreditNettoOere, 20000);
  assert.equal(kpi.salg.faktureretNettoOere, 80000);
  assert.equal(kpi.salg.fakturaer.length, 1);
});

test("betaling, rest og gældsalder bruger inklusiv-moms-grundlaget separat", () => {
  const kpi = beregnEjerKpi(DATA);
  assert.equal(kpi.betaling.registreretOere, 75000);
  assert.equal(kpi.betaling.restOere, 100000);
  assert.equal(kpi.betaling.aldersgrupper.dage31_60, 50000);
  assert.equal(kpi.betaling.aldersgrupper.ikkeForfalden, 50000);
});

test("omkostninger afgrænses til periode og eksplicit resultatkonto med korrekt kreditfortegn", () => {
  const kpi = beregnEjerKpi(DATA);
  assert.equal(kpi.omkostning.ialtOere, 8000);
  assert.deepEqual(kpi.omkostning.umappede.map((p) => p.id), ["e3"]);
  assert.equal(kpi.bilagsarbejde.bogfoertUdenBilag, 1);
});

test("aftale, pipeline, vinderate og arbejdsstatus blander ikke engangsbeløb ind i månedsværdi", () => {
  const kpi = beregnEjerKpi(DATA);
  assert.deepEqual([kpi.abonnement.aktive, kpi.abonnement.maanedligOere, kpi.abonnement.introMaanedligOere], [1, 30000, 20000]);
  assert.equal(kpi.pipeline.aabenMaanedligOere, 50000);
  assert.equal(kpi.pipeline.aabenEngangOere, 100000);
  assert.equal(kpi.pipeline.vinderate, 0.5);
  assert.equal(kpi.opfoelgning.forfaldne, 1);
  assert.deepEqual([kpi.bilagsarbejde.nye, kpi.bilagsarbejde.muligeDubletter, kpi.bilagsarbejde.ukendtBeloeb], [1, 1, 1]);
});

test("kunde-, modul- og kategorifiltre afgrænser relevante datasæt uden at skjule datadækning", () => {
  const kpi = beregnEjerKpi({ ...DATA, kundeId: "ukendt-kunde", kategori: "Andet" });
  assert.equal(kpi.salg.faktureretNettoOere, 0);
  assert.equal(kpi.abonnement.aktive, 0);
  assert.equal(kpi.pipeline.aabenMaanedligOere, 0);
  assert.equal(kpi.omkostning.ialtOere, 0);
  assert.equal(kpi.salg.dataKomplet, true);
  const modul = beregnEjerKpi({ ...DATA, modulId: "facility" });
  assert.equal(modul.salg.dataKomplet, false, "eksterne dokumenter uden linjedata må ikke foregive en komplet modulfordeling");
});

test("fælles definitioner navngiver grundlag og kilde, og skærmen bruger domænelaget", () => {
  for (const definition of Object.values(EJER_KPI_DEFINITIONER)) {
    assert.ok(definition.label && definition.grundlag && definition.kilde);
  }
  const skaerm = readFileSync("src/moduler/udbyder/EjerOekonomiOverblik.jsx", "utf8");
  const app = readFileSync("src/App.jsx", "utf8");
  assert.match(skaerm, /beregnEjerKpi/);
  assert.match(skaerm, /Ikke tilstrækkelige data/);
  assert.match(app, /path="\/main\/oekonomi" element=\{<EjerOekonomiOverblik/);
});
