import test from "node:test";
import assert from "node:assert/strict";
import {
  FAKTURAKONTROL_HANDLING as H,
  FAKTURAKONTROL_MODEL as M,
  FAKTURAKONTROL_STATUS as S,
  anvendFakturakontrol,
  fakturaKraeverEkstraKontrol,
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

test("ekstra kontrol kan ikke aktiveres uden udpeget kontrollant", () => {
  const svar = validerFakturakontrolOpsaetning({ model: M.alle, kontrollantUids: [] });
  assert.equal(svar.ok, false);
  assert.match(svar.fejl.kontrollantUids, /mindst én/i);
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
