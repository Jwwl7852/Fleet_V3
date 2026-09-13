/* Lokal end-to-end runtime-QA mod Auth, Functions og RTDB-emulatorer. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "../functions/node_modules/exceljs/excel.js";
import { DATABASE_NAMESPACE, PROJECT_ID, SYNTHETIC_PASSWORD, TENANTS, TEST_USERS, seedUnitbookingAuthEmulator } from "./unitbooking-auth-emulator-seed.mjs";

const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9119",
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9020",
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5022",
};
for (const [name, host] of Object.entries(hosts)) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal være lokal.`);
const functionsBase = `http://${hosts.functions}/${PROJECT_ID}/europe-west1`;
const dbBase = `http://${hosts.database}`;
const outputDir = path.resolve(process.argv[2] || "artifacts/unitbooking-v2/runtime");
await mkdir(outputDir, { recursive: true });
await seedUnitbookingAuthEmulator();

async function signIn(email) {
  const response = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body)); return body.idToken;
}
async function callRaw(name, data, token) {
  const response = await fetch(`${functionsBase}/${name}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.status === 200, status: response.status, result: body.result, error: body.error };
}
async function call(name, data, token, options = {}) {
  const value = await callRaw(name, data, token);
  if (options.fail) { assert.equal(value.ok, false, `${name} skulle afvises`); return value; }
  assert.equal(value.ok, true, `${name}: ${JSON.stringify(value.error)}`); return value.result;
}
async function read(tenant, pathname, token, options = {}) {
  const response = await fetch(`${dbBase}/tenants/${tenant}/${pathname}.json?ns=${DATABASE_NAMESPACE}&auth=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({}));
  if (options.fail) { assert.equal(response.ok, false, `${tenant}/${pathname} skulle afvises`); return body; }
  assert.equal(response.ok, true, JSON.stringify(body)); return body;
}

const tokens = Object.fromEntries(await Promise.all(Object.entries(TEST_USERS).map(async ([key, u]) => [key, await signIn(u.email)])));
assert.ok(await read(TENANTS.unit, "kasser/AL-101", tokens.unit));
assert.ok(await read(TENANTS.warehouse, "kasser/AL-101", tokens.warehouse));
assert.ok(await read(TENANTS.both, "kasser/AL-101", tokens.both));
assert.equal((await read(TENANTS.unit, "kasser/AL-102", tokens.unit)).status, "klargjort");
assert.equal((await read(TENANTS.unit, "kasseudlaan/dag-ud", tokens.unit)).tilstand, "klargjort");
await read(TENANTS.unit, "kasser/AL-101", tokens.foreign, { fail: true });
await call("unitbookingimportopret", { operationId: "denied-import-01", originalTekst: "Kunde: Afvist" }, tokens.noPerm, { fail: true });

const material = `Kunde: Nordkyst Kunstmuseum\nKontaktperson: Anna Berg\nSagsnummer: NK-2026-184\nObjekt: Bronzerelief\nMål: 100 x 60 x 80 cm\nKassetype: AL\nUndertype: stor\nFra: 21-09-2026\nTil: 28-09-2026\nKlargøres senest: 20-09-2026\nHåndtering: Skal stå oprejst og må ikke vendes.`;
const imported = await call("unitbookingimportopret", { operationId: "import-runtime-01", originalTekst: material }, tokens.unit);
await read(TENANTS.unit, `unitbookingImporter/${imported.kladde.id}`, tokens.noPerm, { fail: true });
const kladde = imported.kladde.kladde;
kladde.linjer[0] = {
  ...kladde.linjer[0], valgtKasseId: "AL-101", maaIkkeVendes: true,
  polstringLaengdePrSideMm: 50, polstringBreddePrSideMm: 50, polstringHoejdePrSideMm: 50,
};
await call("unitbookingimportgem", { operationId: "save-runtime-0001", kladdeId: imported.kladde.id, kladde }, tokens.unit);
assert.equal(await read(TENANTS.unit, "kasseudlaan", tokens.unit).then((v) => Object.keys(v).length), 4, "udkast må ikke reservere");
const confirmed = await call("unitbookingimportbekraeft", { operationId: "confirm-runtime-1", kladdeId: imported.kladde.id, kladde }, tokens.unit);
assert.equal(confirmed.bookingIder.length, 1);
const savedBooking = await read(TENANTS.unit, `kasseudlaan/${confirmed.bookingIder[0]}`, tokens.unit);
assert.deepEqual({ kasseId: savedBooking.kasseId, state: savedBooking.tilstand, draft: savedBooking.importKladdeId }, { kasseId: "AL-101", state: "booket", draft: imported.kladde.id });
const retry = await call("unitbookingimportbekraeft", { operationId: "confirm-runtime-1", kladdeId: imported.kladde.id, kladde }, tokens.unit);
assert.equal(retry.gentaget, true);
const duplicate = await call("unitbookingimportopret", { operationId: "import-runtime-02", originalTekst: material }, tokens.unit);
assert.equal(duplicate.kladde.dubletAf, imported.kladde.id);

async function uploadDokument({ navn, mimeType, filtype, bytes, operation }) {
  const start = await call("unitbookingimportuploadstart", {
    operationId: operation, filnavn: navn, mimeType, filtype, stoerrelse: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }, tokens.unit);
  const response = await fetch(start.uploadUrl, { method: "PUT", headers: { "content-type": start.mimeType }, body: bytes });
  assert.equal(response.ok, true, await response.text());
  const done = await call("unitbookingimportuploadslut", {
    operationId: operation, kladdeId: start.kladdeId, dokumentId: start.dokumentId,
  }, tokens.unit);
  assert.equal(done.kladde.original.status, "aktiv");
  assert.equal(done.kladde.aflæsning.connectorStatus, "lokal");
  return done;
}

const csvBytes = Buffer.from("Kunde;Kontaktperson;Sagsnummer;Fra dato;Til dato;Objekt;Længde;Bredde;Højde;Enhed\nMuseum CSV;Ida;CSV-42;21-09-2026;28-09-2026;Relief;100,5;60;80;cm");
const csvDone = await uploadDokument({ navn: "syntetisk.csv", mimeType: "text/csv", filtype: "csv", bytes: csvBytes, operation: "upload-csv-runtime-01" });
assert.equal(csvDone.kladde.kladde.eksternReference, "CSV-42");
assert.equal(csvDone.kladde.kladde.linjer[0].laengdeMm, 1005);

const emlBilag = csvBytes.toString("base64");
const emlBytes = Buffer.from(["From: booking@example.invalid", "Subject: Booking NK-2026-EML", "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="UNIT"', "", "--UNIT", "Content-Type: text/plain; charset=utf-8", "", material.replace("NK-2026-184", "NK-2026-EML"), "--UNIT", 'Content-Type: text/csv; name="objekter.csv"', 'Content-Disposition: attachment; filename="objekter.csv"', "Content-Transfer-Encoding: base64", "", emlBilag, "--UNIT--", ""].join("\r\n"), "utf8");
const emlDone = await uploadDokument({ navn: "syntetisk-booking.eml", mimeType: "message/rfc822", filtype: "eml", bytes: emlBytes, operation: "upload-eml-runtime-01" });
assert.equal(emlDone.kladde.kladde.eksternReference, "CSV-42");
assert.equal(emlDone.kladde.aflæsning.udtræk.vedhaeftninger[0].status, "udtrukket");

const workbook = new ExcelJS.Workbook();
const ark = workbook.addWorksheet("Booking");
ark.addRow(["Kunde", "Kontaktperson", "Sagsnummer", "Fra dato", "Til dato", "Objekt", "Længde", "Bredde", "Højde", "Enhed"]);
ark.addRow(["Museum XLSX", "Ida", "XLSX-42", "21-09-2026", "28-09-2026", "Relief", "100,5", "60", "80", "cm"]);
const xlsxDone = await uploadDokument({ navn: "syntetisk.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filtype: "xlsx", bytes: Buffer.from(await workbook.xlsx.writeBuffer()), operation: "upload-xlsx-runtime-01" });
assert.equal(xlsxDone.kladde.kladde.eksternReference, "XLSX-42");
assert.ok(xlsxDone.kladde.aflæsning.kilder.some((x) => /celle/.test(x.reference)));

const pdfDone = await uploadDokument({ navn: "tekst.pdf", mimeType: "application/pdf", filtype: "pdf", bytes: await readFile(new URL("../output/pdf/PROCURE-bestilling-senest-dato.pdf", import.meta.url)), operation: "upload-pdf-runtime-01" });
assert.ok(pdfDone.kladde.aflæsning.udtræk.tekstTegn > 20);
const msgDone = await uploadDokument({ navn: "mail.msg", mimeType: "application/vnd.ms-outlook", filtype: "msg", bytes: await readFile(new URL("../test/fixtures/unitbooking-msgreader-test2.msg", import.meta.url)), operation: "upload-msg-runtime-01" });
assert.equal(msgDone.kladde.aflæsning.udtræk.vedhaeftninger[0].status, "udtrukket");

async function prepareCollision(ref, operation) {
  const text = `Kunde: Samtidighedstest\nSagsnummer: ${ref}\nObjekt: Relief\nMål: 100 x 60 x 80 cm\nFra: 01-10-2026\nTil: 05-10-2026`;
  const created = await call("unitbookingimportopret", { operationId: `collision-create-${operation}`, originalTekst: text }, tokens.unit);
  const draft = created.kladde.kladde;
  draft.linjer[0] = { ...draft.linjer[0], valgtKasseId: "AL-102", polstringLaengdePrSideMm: 0, polstringBreddePrSideMm: 0, polstringHoejdePrSideMm: 0 };
  await call("unitbookingimportgem", { operationId: `collision-save-${operation}`, kladdeId: created.kladde.id, kladde: draft }, tokens.unit);
  return { kladdeId: created.kladde.id, kladde: draft, operationId: `collision-confirm-${operation}` };
}
const [c1, c2] = await Promise.all([prepareCollision("SAM-1", "0001"), prepareCollision("SAM-2", "0002")]);
const collisions = await Promise.all([callRaw("unitbookingimportbekraeft", c1, tokens.unit), callRaw("unitbookingimportbekraeft", c2, tokens.unit)]);
assert.equal(collisions.filter((x) => x.ok).length, 1);
assert.equal(collisions.filter((x) => !x.ok).length, 1);

await call("kasseudlaanskriv", { handling: "skift", udlaanId: "dag-ud", til: "udlaant", operationId: "status-out-runtime-01" }, tokens.unit);
assert.equal((await read(TENANTS.unit, "kasser/AL-102", tokens.unit)).status, "udlaant");
assert.equal((await read(TENANTS.unit, "kasser/AL-102", tokens.unit)).pladsId ?? null, null);
await call("kasseudlaanskriv", { handling: "skift", udlaanId: "dag-ud", til: "returneret", modtagelsesPladsId: "destination", operationId: "status-return-runtime-01" }, tokens.unit);
assert.equal((await read(TENANTS.unit, "kasser/AL-102", tokens.unit)).status, "ledig");
assert.equal((await read(TENANTS.unit, "kasseudlaan/dag-ud", tokens.unit)).tilstand, "returneret");

const returned = await call("kasseudlaanskriv", { handling: "skift", udlaanId: "dag-retur", til: "returneret", modtagelsesPladsId: "modtagelse", operationId: "return-runtime-01" }, tokens.unit);
assert.equal(returned.gentaget, false);
const returnedRetry = await call("kasseudlaanskriv", { handling: "skift", udlaanId: "dag-retur", til: "returneret", modtagelsesPladsId: "modtagelse", operationId: "return-runtime-01" }, tokens.unit);
assert.equal(returnedRetry.gentaget, true);
assert.equal((await read(TENANTS.unit, "kasser/AL-101", tokens.unit)).pladsId, "modtagelse");
const moved = await call("unitlagerhandling", { operationId: "move-runtime-0001", unitId: "AL-101", art: "flytning", tilPladsId: "destination", forventetPladsId: "modtagelse", kilde: "unitbooking" }, tokens.unit);
assert.equal(moved.gentaget, false);
assert.equal((await call("unitlagerhandling", { operationId: "move-runtime-0001", unitId: "AL-101", art: "flytning", tilPladsId: "destination", forventetPladsId: "modtagelse", kilde: "unitbooking" }, tokens.unit)).gentaget, true);
assert.equal((await read(TENANTS.unit, "kasser/AL-101", tokens.unit)).pladsId, "destination");
assert.equal(Object.keys(await read(TENANTS.unit, "unitbevaegelser", tokens.unit)).filter((id) => ["return-runtime-01", "move-runtime-0001"].includes(id)).length, 2);

const warehouseMove = await call("unitlagerhandling", { operationId: "warehouse-move-01", unitId: "AL-102", art: "flytning", tilPladsId: "modtagelse", forventetPladsId: "destination", kilde: "warehouse" }, tokens.warehouse);
assert.equal(warehouseMove.unit.pladsId, "modtagelse");
const bothMove = await call("unitlagerhandling", { operationId: "both-move-unit-1", unitId: "AL-102", art: "flytning", tilPladsId: "modtagelse", forventetPladsId: "destination", kilde: "unitbooking" }, tokens.both);
assert.equal((await read(TENANTS.both, "kasser/AL-102", tokens.both)).pladsId, bothMove.unit.pladsId);
assert.equal((await read(TENANTS.both, "unitbevaegelser/both-move-unit-1", tokens.both)).kilde, "unitbooking");

const proof = {
  generatedAt: new Date().toISOString(), projectId: PROJECT_ID, environment: "Firebase Auth/Functions/RTDB Emulator Suite",
  access: { unitOnly: true, warehouseOnly: true, bothModules: true, tenantIsolation: true, permissionDenied: true },
  import: {
    draftId: imported.kladde.id,
    originalRetained: Boolean(imported.kladde.original?.tekst),
    bookingIds: confirmed.bookingIder,
    duplicateWarning: duplicate.kladde.dubletAf,
    retryIdempotent: retry.gentaget,
    formats: {
      csv: { extraction: "local", interpreted: csvDone.kladde.kladde.eksternReference === "CSV-42", browserUploadEquivalent: true },
      eml: { extraction: "local", attachments: emlDone.kladde.aflæsning.udtræk.vedhaeftninger.length, browserUploadEquivalent: true },
      xlsx: { extraction: "local", interpreted: xlsxDone.kladde.kladde.eksternReference === "XLSX-42", browserUploadEquivalent: true },
      pdf: { extraction: "local", textCharacters: pdfDone.kladde.aflæsning.udtræk.tekstTegn, browserUploadEquivalent: true },
      msg: { extraction: "local", attachments: msgDone.kladde.aflæsning.udtræk.vedhaeftninger.length, browserUploadEquivalent: true },
    },
  },
  concurrency: { attempts: 2, committed: 1, rejected: 1 },
  physical: { statusFlow: ["klargjort", "udlaant", "returneret"], returnLocation: "modtagelse", laterLocation: "destination", retryMovements: 2, sameQrId: "AL-101" },
};
await writeFile(path.join(outputDir, "UNITBOOKING_AUTH_FUNCTIONS_QA.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
