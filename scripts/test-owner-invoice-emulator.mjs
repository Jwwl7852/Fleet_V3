/* End-to-end af etape F. Må kun køre i en frisk, lokal Emulator Suite. */
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { byggEjerClaims } from "../src/fleet/ejeradgang.js";

const PROJEKT = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const VAERTER = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST, database: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST, storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
};
if (!/^demo-/.test(PROJEKT) || VAERTER.auth !== "127.0.0.1:9099" || VAERTER.database !== "127.0.0.1:9000"
    || VAERTER.functions !== "127.0.0.1:5001" || VAERTER.storage !== "127.0.0.1:9199") {
  throw new Error(`Afvist: fakturaflow-testen kræver demo-projekt og alle fire lokale emulatorer. Modtog ${JSON.stringify({ PROJEKT, VAERTER })}`);
}

const app = initializeApp({ projectId: PROJEKT, databaseURL: `http://${VAERTER.database}?ns=${PROJEKT}`, storageBucket: `${PROJEKT}.appspot.com` }, "ejer-faktura-test");
const auth = getAuth(app);
const db = getDatabase(app);
const kode = "Kun-Lokal-Fakturatest-2026!";
const url = (navn) => `http://${VAERTER.functions}/${PROJEKT}/europe-west1/${navn}`;

async function login(email) {
  const svar = await fetch(`http://${VAERTER.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: kode, returnSecureToken: true }),
  });
  const json = await svar.json();
  assert.equal(svar.ok, true, JSON.stringify(json));
  return json.idToken;
}
async function kald(navn, data, token) {
  const svar = await fetch(url(navn), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  const json = await svar.json();
  if (json.error) { const e = new Error(json.error.message); e.status = json.error.status; throw e; }
  return json.result;
}
async function fejl(promise, status) {
  let e; try { await promise; } catch (x) { e = x; }
  assert.ok(e, `Forventede ${status}`); assert.equal(e.status, status); return e;
}
const grundlag = (tenantId, periode = "2026-08") => ({
  type: "ordinaer", forretningsnoegle: `faktura:${periode}:${tenantId}:ordinaer`, kundeId: tenantId, periode,
  periodeFra: Date.parse(`${periode}-01T00:00:00Z`), periodeTil: Date.parse("2026-09-01T00:00:00Z") - 1,
  prislisteId: "fixture-pris-v1", aftaleId: "fixture-aftale-v1", aftaleVersion: 1,
  maengdekilder: { platform: "syntetisk emulatorfixture" },
  linjer: [{ modul: "dashboard", akse: "platform", antal: 1000, satsOere: 10000, momssats: 25 }],
  beloebOere: 10000, momsOere: 2500, ialtOere: 12500, laast: true,
  genereretMs: Date.now(), genereretAf: "fixture", generationId: `gen_${tenantId}`, revision: 0,
});

try {
  const ejer = await auth.createUser({ email: "faktura-ejer@demo.veyro.invalid", password: kode });
  await auth.setCustomUserClaims(ejer.uid, byggEjerClaims({}));
  const kunde = await auth.createUser({ email: "faktura-kunde@demo.veyro.invalid", password: kode });
  await auth.setCustomUserClaims(kunde.uid, { tenant: "faktura-a", rolle: "admin", schemaVersion: 2 });
  const ejerToken = await login(ejer.email);
  const kundeToken = await login(kunde.email);

  for (const tenantId of ["faktura-a", "faktura-b", "faktura-c"]) {
    await db.ref(`tenants/${tenantId}`).set({ _findes: true, virksomhed: { navn: `Fixture ${tenantId} ApS`, cvr: "00000001" } });
    await db.ref(`udbyder/kunder/${tenantId}`).set({ oprettetMs: Date.now() });
    await db.ref(`udbyder/crm/virksomheder/crm-${tenantId}/stamdata`).set({
      navn: `Fixture ${tenantId} ApS`, cvr: "00000001", tenantId,
      fakturaEmail: `${tenantId}@demo.veyro.invalid`, afsendelseskanal: "email",
    });
    await db.ref(`udbyder/fakturagrundlag/2026-08/${tenantId}`).set(grundlag(tenantId));
  }

  await fejl(kald("fakturagrundlagfrigiv", { periode: "2026-08", tenantId: "faktura-a", forventetRevision: 0 }, kundeToken), "PERMISSION_DENIED");
  const resultater = await Promise.all([
    kald("fakturagrundlagfrigiv", { periode: "2026-08", tenantId: "faktura-a", forventetRevision: 0, sendEfterFrigivelse: true, operationId: "race-a" }, ejerToken),
    kald("fakturagrundlagfrigiv", { periode: "2026-08", tenantId: "faktura-a", forventetRevision: 0, sendEfterFrigivelse: true, operationId: "race-b" }, ejerToken),
  ]);
  assert.equal(new Set(resultater.map((r) => r.jobId)).size, 1);
  assert.equal((await db.ref("udbyder/fakturajobs").once("value")).numChildren(), 1);

  const dokumenter = await kald("fakturagrundlagdokumenter", { periode: "2026-08", tenantId: "faktura-a" }, ejerToken);
  assert.ok(dokumenter.dokumenter.pdf.sha256 && dokumenter.dokumenter.csv.sha256);
  const bucket = getStorage(app).bucket();
  assert.equal((await bucket.file(dokumenter.dokumenter.pdf.storagePath).exists())[0], true);
  assert.equal((await bucket.file(dokumenter.dokumenter.csv.storagePath).exists())[0], true);

  await db.ref("udbyder/integrationer/dinero").set({ status: "aktiv", adapter: "test", testScenario: "success" });
  const sendt = await kald("fakturajobkoer", { periode: "2026-08", tenantId: "faktura-a", operationId: "send-a" }, ejerToken);
  const sendtIgen = await kald("fakturajobkoer", { periode: "2026-08", tenantId: "faktura-a", operationId: "send-b" }, ejerToken);
  assert.equal(sendt.eksternReference, sendtIgen.eksternReference);
  assert.equal(sendtIgen.genbrugt, true);

  await kald("fakturagrundlagfrigiv", { periode: "2026-08", tenantId: "faktura-b", forventetRevision: 0, sendEfterFrigivelse: true }, ejerToken);
  await db.ref("udbyder/integrationer/dinero/testScenario").set("timeout_after_create");
  await fejl(kald("fakturajobkoer", { periode: "2026-08", tenantId: "faktura-b" }, ejerToken), "DEADLINE_EXCEEDED");
  await fejl(kald("fakturajobkoer", { periode: "2026-08", tenantId: "faktura-b" }, ejerToken), "FAILED_PRECONDITION");

  await kald("fakturagrundlagfrigiv", { periode: "2026-08", tenantId: "faktura-c", forventetRevision: 0, sendEfterFrigivelse: true }, ejerToken);
  await db.ref("udbyder/integrationer/dinero/testScenario").set("book_ok_send_fail");
  await fejl(kald("fakturajobkoer", { periode: "2026-08", tenantId: "faktura-c" }, ejerToken), "UNAVAILABLE");
  const refFoer = (await db.ref("udbyder/fakturajobs/faktura_202608_faktura-c/eksternReference").once("value")).val();
  await db.ref("udbyder/integrationer/dinero/testScenario").set("success");
  const genkoert = await kald("fakturajobkoer", { periode: "2026-08", tenantId: "faktura-c" }, ejerToken);
  assert.equal(genkoert.eksternReference, refFoer);

  // Etape G: en halv linje reserveres straks. To samtidige ejere kan derefter
  // ikke begge tage den sidste halvdel, fordi reservationen ligger i samme
  // RTDB-transaction som kontrollen af restmængde og restbeløb.
  await fejl(kald("kreditnotaopret", {
    fakturaId: "faktura_202608_faktura-a", operationId: "kunde-forsoeg",
    aarsag: "Må afvises", valg: [{ kildeIndeks: 0, antal: 500 }],
  }, kundeToken), "PERMISSION_DENIED");
  const delkredit = await kald("kreditnotaopret", {
    fakturaId: "faktura_202608_faktura-a", operationId: "delkredit-a",
    aarsag: "Aftalt delvis kreditering", valg: [{ kildeIndeks: 0, antal: 500 }],
  }, ejerToken);
  const restRace = await Promise.allSettled(["rest-a", "rest-b"].map((operationId) => kald("kreditnotaopret", {
    fakturaId: "faktura_202608_faktura-a", operationId,
    aarsag: "Resterende kredit", valg: [{ kildeIndeks: 0, antal: 500 }],
  }, ejerToken)));
  assert.equal(restRace.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(restRace.filter((r) => r.status === "rejected").length, 1);
  await fejl(kald("kreditnotaopret", {
    fakturaId: "faktura_202608_faktura-a", operationId: "overkredit",
    aarsag: "Skal afvises", valg: [{ kildeIndeks: 0, antal: 1 }],
  }, ejerToken), "ABORTED");

  await kald("kreditnotafrigiv", {
    fakturaId: "faktura_202608_faktura-a", kreditId: delkredit.kreditId,
    forventetRevision: 0, sendEfterFrigivelse: true, operationId: "frigiv-delkredit",
  }, ejerToken);
  const kreditDokument = await kald("kreditnotadokumenter", {
    fakturaId: "faktura_202608_faktura-a", kreditId: delkredit.kreditId,
  }, ejerToken);
  assert.equal((await bucket.file(kreditDokument.dokument.storagePath).exists())[0], true);
  const kreditSendt = await kald("kreditnotajobkoer", {
    fakturaId: "faktura_202608_faktura-a", kreditId: delkredit.kreditId,
    operationId: "send-delkredit",
  }, ejerToken);
  assert.equal(kreditSendt.status, "sendt");
  assert.equal((await db.ref(`udbyder/kreditnotaer/faktura_202608_faktura-a/poster/${delkredit.kreditId}/status`).once("value")).val(), "sendt");

  // Etape H: uploadinitieringen kræver en tenantløs ejer. Selve fixturefilen
  // lægges med Admin SDK i den lokale Storage-emulator, så testen aldrig
  // rammer et eksternt, signeret uploadlink.
  const bilagBytes = Buffer.from("%PDF-1.7\nKun syntetisk Veyro-bilagsfixture\n%%EOF");
  const uploadData = { operationId: "bilag-upload-a", filnavn: "fixture.pdf", contentType: "application/pdf", stoerrelse: bilagBytes.length };
  await fejl(kald("ejerbilaguploadinitier", uploadData, kundeToken), "PERMISSION_DENIED");
  const bilagInit = await kald("ejerbilaguploadinitier", uploadData, ejerToken);
  assert.equal(bilagInit.uploadUrl, null);
  assert.equal(bilagInit.testOnlyStoragePath, `ejer/bilag/${bilagInit.id}/original`);
  await bucket.file(bilagInit.testOnlyStoragePath).save(bilagBytes, { metadata: { contentType: "application/pdf" } });
  const bekraeftet = await kald("ejerbilaguploadbekraeft", { id: bilagInit.id }, ejerToken);
  assert.equal(bekraeftet.status, "ny");

  const dubletInit = await kald("ejerbilaguploadinitier", { ...uploadData, operationId: "bilag-upload-b" }, ejerToken);
  await bucket.file(dubletInit.testOnlyStoragePath).save(bilagBytes, { metadata: { contentType: "application/pdf" } });
  const dublet = await kald("ejerbilaguploadbekraeft", { id: dubletInit.id }, ejerToken);
  assert.equal(dublet.status, "mulig_dublet");
  assert.equal(dublet.dubletAf, bilagInit.id);

  const metadata = await kald("ejerbilagmetadatagem", {
    id: bilagInit.id, forventetRevision: 1,
    metadata: {
      leverandoer: "Fixtureleverandør ApS", dokumentnummer: "B-2026-1", dato: "2026-09-10", forfaldsdato: "2026-09-24",
      valuta: "DKK", beloebEksklMomsOere: 10000, momsOere: 2500, totalOere: 12500, kategori: "Software",
    },
  }, ejerToken);
  const godkendt = await kald("ejerbilagstatus", { id: bilagInit.id, forventetRevision: metadata.revision, status: "godkendt" }, ejerToken);
  assert.equal(godkendt.status, "godkendt");

  const klargoeringer = await Promise.all([
    kald("ejerbilagklargoerdinero", { id: bilagInit.id }, ejerToken),
    kald("ejerbilagklargoerdinero", { id: bilagInit.id }, ejerToken),
  ]);
  assert.equal(new Set(klargoeringer.map((r) => r.jobId)).size, 1);
  assert.equal((await db.ref("udbyder/bilagjobs").once("value")).numChildren(), 1);
  const bilagJob = (await db.ref(`udbyder/bilagjobs/${klargoeringer[0].jobId}`).once("value")).val();
  assert.equal(bilagJob.snapshot.metadataVersion, 1);
  assert.equal(bilagJob.overfoerselsStatus, "ikke_tilsluttet");

  await db.ref("udbyder/dinero/posteringer/postering-h1").set({ id: "postering-h1", kontonummer: "4000", beloebOere: 12500, bogfoertMs: Date.now() });
  const matchet = await kald("ejerbilagmatchdinero", { id: bilagInit.id, posteringId: "postering-h1" }, ejerToken);
  assert.equal(matchet.status, "matchet_dinero");
  assert.equal((await db.ref(`udbyder/dinero/posteringer/postering-h1/bilagMatch/${bilagInit.id}`).once("value")).exists(), true);

  console.log("Ejerøkonomi E2E: faktura, kredit, bilagsupload/dublet, frossen Dinero-klargøring og match er verificeret.");
} finally {
  await deleteApp(app);
}
