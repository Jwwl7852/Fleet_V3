import test from "node:test";
import assert from "node:assert/strict";
import {
  FAKTURAKONTROL_HANDLING as H,
  FAKTURAKONTROL_MODEL as M,
  FAKTURAKONTROL_STATUS as S,
  anvendFakturakontrol,
  fakturaKraeverEkstraKontrol,
  fakturakontrolTrin,
  validerFakturakontrolOpsaetning,
  vurderFakturakontrol,
} from "../src/fleet/fakturacenter-kontrol.js";

const faktura = (ekstra = {}) => ({
  leverandoerId: "lev-1",
  fakturanummer: "F-1",
  fakturadatoMs: 1_700_000_000_000,
  status: "modtaget",
  beloebOere: 100_000,
  momsOere: 25_000,
  destinationArt: "procure",
  destinationId: "po-1",
  kontrolstatus: S.indbakke,
  kontrolRevision: 0,
  ...ekstra,
});
const opsaetning = (ekstra = {}) => ({
  model: M.alle,
  graenseNettoOere: null,
  kontrollantUids: ["uid-2"],
  revision: 1,
  ...ekstra,
});

const modulOpsaetning = (moduler) => ({ version: 2, revision: 1, moduler: {
  fleet: { model: M.ingen, kontrollantUid: null },
  facility: { model: M.ingen, kontrollantUid: null },
  procure: { model: M.ingen, kontrollantUid: null },
  ...moduler,
} });

test("ekstra kontrol kan ikke aktiveres uden udpeget kontrollant", () => {
  const svar = validerFakturakontrolOpsaetning({ model: M.alle, kontrollantUids: [] });
  assert.equal(svar.ok, false);
  assert.match(svar.fejl["fleet.kontrollantUid"], /udpeg/i);
});

test("modulregler vurderer den summerede nettoandel og ikke hele fakturaen", () => {
  const post = faktura({
    beloebOere: 300_000,
    fordelinger: [
      { modul: "fleet", nettoOere: 80_000 },
      { modul: "fleet", nettoOere: 30_001 },
      { modul: "procure", nettoOere: 189_999 },
    ],
  });
  const regler = modulOpsaetning({
    fleet: { model: M.overBeloeb, graenseNettoOere: 110_000, kontrollantUid: "uid-fleet" },
    procure: { model: M.overBeloeb, graenseNettoOere: 200_000, kontrollantUid: "uid-procure" },
  });
  assert.deepEqual(fakturakontrolTrin(post, regler), [{
    modul: "fleet", nettoOere: 110_001, kontrollantUid: "uid-fleet",
  }]);
});

test("RTDB-objekter med fordelinger bevarer hvert krævet modultrin", () => {
  const regler = modulOpsaetning({
    fleet: { model: M.alle, kontrollantUid: "uid-fleet" },
    facility: { model: M.alle, kontrollantUid: "uid-facility" },
  });
  const post = faktura({
    destinationArt: "fleet",
    beloebOere: 160_000,
    fordelinger: {
      fleet: { modul: "fleet", destinationId: "case-1", nettoOere: 120_000 },
      facility: { modul: "facility", destinationId: "facility-1", nettoOere: 40_000 },
    },
  });

  assert.deepEqual(fakturakontrolTrin(post, regler), [
    { modul: "fleet", nettoOere: 120_000, kontrollantUid: "uid-fleet" },
    { modul: "facility", nettoOere: 40_000, kontrollantUid: "uid-facility" },
  ]);
  const første = anvendFakturakontrol({
    faktura: post, opsaetning: regler, handling: H.kontroller,
    uid: "uid-1", nu: 100, operationId: "rtdb-object-1",
  });
  assert.deepEqual(Object.keys(første.faktura.modulKontroller), ["fleet", "facility"]);
  assert.match(første.faktura.kontrolGrundlag, /facility-1/);
});

test("fler-modulfaktura arkiveres først efter alle krævede modultrin", () => {
  const regler = modulOpsaetning({
    fleet: { model: M.alle, kontrollantUid: "uid-fleet" },
    procure: { model: M.alle, kontrollantUid: "uid-procure" },
  });
  const oprindelig = faktura({ fordelinger: [
    { modul: "fleet", nettoOere: 40_000 }, { modul: "procure", nettoOere: 60_000 },
  ] });
  const første = anvendFakturakontrol({
    faktura: oprindelig, opsaetning: regler, handling: H.kontroller,
    uid: "uid-1", nu: 100, operationId: "multi-1",
  });
  assert.equal(første.status, S.ekstraKontrol);
  assert.deepEqual(Object.keys(første.faktura.modulKontroller), ["fleet", "procure"]);
  assert.equal(vurderFakturakontrol({
    faktura: første.faktura, opsaetning: regler, handling: H.ekstraGodkend,
    modul: "fleet", uid: "uid-fleet", forventetRevision: 1,
  }).ok, true);
  const fleetGodkendt = anvendFakturakontrol({
    faktura: første.faktura, opsaetning: regler, handling: H.ekstraGodkend,
    modul: "fleet", uid: "uid-fleet", nu: 200, operationId: "multi-2",
  });
  assert.equal(fleetGodkendt.status, S.ekstraKontrol);
  const procureGodkendt = anvendFakturakontrol({
    faktura: fleetGodkendt.faktura, opsaetning: regler, handling: H.ekstraGodkend,
    modul: "procure", uid: "uid-procure", nu: 300, operationId: "multi-3",
  });
  assert.equal(procureGodkendt.status, S.arkiveret);
});

test("modultrinnet kan kun godkendes af den navngivne anden godkender", () => {
  const regler = modulOpsaetning({ fleet: { model: M.alle, kontrollantUid: "uid-fleet" } });
  const første = anvendFakturakontrol({
    faktura: faktura({ destinationArt: "fleet" }), opsaetning: regler,
    handling: H.kontroller, uid: "uid-1", nu: 100, operationId: "named-1",
  });
  assert.equal(vurderFakturakontrol({
    faktura: første.faktura, opsaetning: regler, handling: H.ekstraGodkend,
    modul: "fleet", uid: "uid-other", forventetRevision: 1,
  }).kode, "ikke-udpeget");
  assert.equal(vurderFakturakontrol({
    faktura: første.faktura, opsaetning: regler, handling: H.ekstraGodkend,
    modul: "fleet", uid: "uid-fleet", forventetRevision: 1,
  }).ok, true);
});

test("ændret fordeling kan ikke genbruge tidligere modulgodkendelsesgrundlag", () => {
  const regler = modulOpsaetning({ fleet: { model: M.alle, kontrollantUid: "uid-fleet" } });
  const første = anvendFakturakontrol({
    faktura: faktura({ destinationArt: "fleet", fordelinger: [
      { modul: "fleet", destinationId: "case-1", nettoOere: 100_000 },
    ] }),
    opsaetning: regler, handling: H.kontroller, uid: "uid-1", nu: 100, operationId: "basis-1",
  });
  const ændret = { ...første.faktura, fordelinger: [
    { modul: "fleet", destinationId: "case-2", nettoOere: 100_000 },
  ] };
  assert.equal(vurderFakturakontrol({
    faktura: ændret, opsaetning: regler, handling: H.ekstraGodkend,
    modul: "fleet", uid: "uid-fleet", forventetRevision: 1,
  }).kode, "grundlag-aendret");
});

test("beløbsgrænsen bruger netto ekskl. moms og ikke moms/total", () => {
  const indstilling = opsaetning({ model: M.overBeloeb, graenseNettoOere: 100_000 });
  assert.equal(fakturaKraeverEkstraKontrol(faktura({ beloebOere: 100_000, momsOere: 9_000_000 }), indstilling), false);
  assert.equal(fakturaKraeverEkstraKontrol(faktura({ beloebOere: 100_001, momsOere: 0 }), indstilling), true);
  assert.equal(fakturaKraeverEkstraKontrol(faktura({ beloebOere: -100_001, momsOere: 0 }), indstilling), true,
    "en kreditnota må ikke omgå grænsen med negativt fortegn");
});

test("første kontrol sender til ekstra kontrol uden at ændre betalingsstatus", () => {
  const oprindelig = faktura();
  assert.equal(vurderFakturakontrol({
    faktura: oprindelig, opsaetning: opsaetning(), handling: H.kontroller,
    uid: "uid-1", forventetRevision: 0,
  }).ok, true);
  const svar = anvendFakturakontrol({
    faktura: oprindelig, opsaetning: opsaetning(), handling: H.kontroller,
    uid: "uid-1", nu: 1234, operationId: "op-1",
  });
  assert.equal(svar.status, S.ekstraKontrol);
  assert.equal(svar.faktura.status, "modtaget");
  assert.equal(svar.faktura.kontrolleretAf, "uid-1");
  assert.equal(svar.revision, 1);
});

test("uden ekstra kontrol arkiveres Veyro-kontrollen direkte", () => {
  const svar = anvendFakturakontrol({
    faktura: faktura(), opsaetning: opsaetning({ model: M.ingen, kontrollantUids: [] }),
    handling: H.kontroller, uid: "uid-1", nu: 1234, operationId: "op-1",
  });
  assert.equal(svar.status, S.arkiveret);
  assert.equal(svar.faktura.status, "modtaget");
});

test("egen ekstra godkendelse afvises selv når brugeren står på listen", () => {
  const post = faktura({ kontrolstatus: S.ekstraKontrol, kontrolRevision: 1, kontrolleretAf: "uid-1" });
  const svar = vurderFakturakontrol({
    faktura: post,
    opsaetning: opsaetning({ kontrollantUids: ["uid-1", "uid-2"] }),
    handling: H.ekstraGodkend, uid: "uid-1", forventetRevision: 1,
  });
  assert.equal(svar.ok, false);
  assert.equal(svar.kode, "egen-godkendelse");
});

test("en anden udpeget kontrollant kan arkivere", () => {
  const post = faktura({ kontrolstatus: S.ekstraKontrol, kontrolRevision: 1, kontrolleretAf: "uid-1" });
  const vurdering = vurderFakturakontrol({
    faktura: post, opsaetning: opsaetning(), handling: H.ekstraGodkend,
    uid: "uid-2", forventetRevision: 1,
  });
  assert.equal(vurdering.ok, true);
  const svar = anvendFakturakontrol({
    faktura: post, opsaetning: opsaetning(), handling: H.ekstraGodkend,
    uid: "uid-2", nu: 2000, operationId: "op-2",
  });
  assert.equal(svar.status, S.arkiveret);
  assert.equal(svar.faktura.ekstraKontrolleretAf, "uid-2");
});

test("revisionkonflikt afvises før en handling", () => {
  const svar = vurderFakturakontrol({
    faktura: faktura({ kontrolRevision: 4 }), opsaetning: opsaetning(),
    handling: H.kontroller, uid: "uid-1", forventetRevision: 3,
  });
  assert.equal(svar.ok, false);
  assert.equal(svar.kode, "revisionskonflikt");
});

test("ekstra afvisning kræver grund og sender sporbart tilbage til Indbakke", () => {
  const post = faktura({ kontrolstatus: S.ekstraKontrol, kontrolRevision: 1, kontrolleretAf: "uid-1" });
  assert.equal(vurderFakturakontrol({
    faktura: post, opsaetning: opsaetning(), handling: H.ekstraAfvis,
    uid: "uid-2", forventetRevision: 1,
  }).kode, "mangler-begrundelse");
  const svar = anvendFakturakontrol({
    faktura: post, opsaetning: opsaetning(), handling: H.ekstraAfvis,
    uid: "uid-2", nu: 3000, operationId: "op-3", begrundelse: "Kontrollér fordelingen igen",
  });
  assert.equal(svar.status, S.indbakke);
  assert.equal(svar.faktura.kontrolleretAf, undefined);
  assert.equal(svar.historik.begrundelse, "Kontrollér fordelingen igen");
});
