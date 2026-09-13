/* Lokal end-to-end runtime-QA mod Auth, Functions og RTDB-emulatorer. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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

const emlBytes = Buffer.from(`From: booking@example.invalid\nSubject: Booking NK-2026-EML\nContent-Type: text/plain; charset=utf-8\n\n${material.replace("NK-2026-184", "NK-2026-EML")}`, "utf8");
const uploadOperation = "upload-eml-runtime-01";
const uploadStart = await call("unitbookingimportuploadstart", {
  operationId: uploadOperation,
  filnavn: "syntetisk-booking.eml",
  mimeType: "message/rfc822",
  filtype: "eml",
  stoerrelse: emlBytes.length,
  sha256: createHash("sha256").update(emlBytes).digest("hex"),
}, tokens.unit);
const uploadResponse = await fetch(uploadStart.uploadUrl, {
  method: "PUT", headers: { "content-type": uploadStart.mimeType }, body: emlBytes,
});
assert.equal(uploadResponse.ok, true, await uploadResponse.text());
const uploadDone = await call("unitbookingimportuploadslut", {
  operationId: uploadOperation,
  kladdeId: uploadStart.kladdeId,
  dokumentId: uploadStart.dokumentId,
}, tokens.unit);
assert.equal(uploadDone.kladde.original.status, "aktiv");
assert.equal(uploadDone.kladde.aflæsning.connectorStatus, "lokal");
assert.equal(uploadDone.kladde.kladde.eksternReference, "NK-2026-EML");

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

const returned = await call("kasseudlaanskriv", { handling: "skift", udlaanId: "dag-retur", til: "returneret", modtagelsesPladsId: "modtagelse", operationId: "return-runtime-01" }, tokens.unit);
assert.equal(returned.gentaget, false);
const returnedRetry = await call("kasseudlaanskriv", { handling: "skift", udlaanId: "dag-retur", til: "returneret", modtagelsesPladsId: "modtagelse", operationId: "return-runtime-01" }, tokens.unit);
assert.equal(returnedRetry.gentaget, true);
assert.equal((await read(TENANTS.unit, "kasser/AL-101", tokens.unit)).pladsId, "modtagelse");
const moved = await call("unitlagerhandling", { operationId: "move-runtime-0001", unitId: "AL-101", art: "flytning", tilPladsId: "destination", kilde: "unitbooking" }, tokens.unit);
assert.equal(moved.gentaget, false);
assert.equal((await call("unitlagerhandling", { operationId: "move-runtime-0001", unitId: "AL-101", art: "flytning", tilPladsId: "destination", kilde: "unitbooking" }, tokens.unit)).gentaget, true);
assert.equal((await read(TENANTS.unit, "kasser/AL-101", tokens.unit)).pladsId, "destination");
assert.equal(Object.keys(await read(TENANTS.unit, "unitbevaegelser", tokens.unit)).filter((id) => ["return-runtime-01", "move-runtime-0001"].includes(id)).length, 2);

const warehouseMove = await call("unitlagerhandling", { operationId: "warehouse-move-01", unitId: "AL-102", art: "flytning", tilPladsId: "modtagelse", kilde: "warehouse" }, tokens.warehouse);
assert.equal(warehouseMove.unit.pladsId, "modtagelse");
const bothMove = await call("unitlagerhandling", { operationId: "both-move-unit-1", unitId: "AL-102", art: "flytning", tilPladsId: "modtagelse", kilde: "unitbooking" }, tokens.both);
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
    emlUpload: {
      draftId: uploadStart.kladdeId,
      originalRetained: uploadDone.kladde.original.status === "aktiv",
      connectorStatus: uploadDone.kladde.aflæsning.connectorStatus,
    },
  },
  concurrency: { attempts: 2, committed: 1, rejected: 1 },
  physical: { returnLocation: "modtagelse", laterLocation: "destination", retryMovements: 2, sameQrId: "AL-101" },
};
await writeFile(path.join(outputDir, "UNITBOOKING_AUTH_FUNCTIONS_QA.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
