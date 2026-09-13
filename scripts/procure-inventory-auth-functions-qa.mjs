/* Lokal runtime-QA for PROCURE-lager gennem Auth-, Functions- og RTDB-emulator.
 * Ingen produktionsværter accepteres, og alle identiteter/data er syntetiske. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inventoryCsv, inventoryPeriodSummary } from "../src/fleet/procure-v2/procure-inventory-domain.js";
import { PROJECT_ID, SYNTHETIC_PASSWORD, TENANT_A, TEST_USERS, seedProcureAuthEmulator } from "./procure-auth-emulator-seed.mjs";

const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9109",
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9010",
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5012",
};
for (const [name, host] of Object.entries(hosts)) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal være en lokal emulator.`);
const functionBase = `http://${hosts.functions}/${PROJECT_ID}/europe-west1`;
const databaseBase = `http://${hosts.database}`;
const outputDir = path.resolve(process.argv[2] || "output/review/lager-runtime");
await mkdir(outputDir, { recursive: true });
await seedProcureAuthEmulator();

async function signIn(email) {
  const response = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body)); return body.idToken;
}
async function callable(name, data, token, { fail = false } = {}) {
  const response = await fetch(`${functionBase}/${name}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({}));
  if (fail) { assert.notEqual(response.status, 200, `${name} skulle være afvist`); return { status: response.status, error: body.error || body }; }
  assert.equal(response.status, 200, `${name}: ${JSON.stringify(body)}`); return body.result;
}
async function read(tenant, pathname, token, { fail = false } = {}) {
  const response = await fetch(`${databaseBase}/tenants/${tenant}/${pathname}.json?ns=${PROJECT_ID}&auth=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({}));
  if (fail) { assert.equal(response.ok, false, `læsning af ${tenant}/${pathname} skulle være afvist: ${JSON.stringify(body)}`); return response.status; }
  assert.equal(response.ok, true, JSON.stringify(body)); return body;
}

const tokenClaims = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

const buyerA = await signIn(TEST_USERS.buyer.email);
const buyerB = await signIn(TEST_USERS.buyer.email);
const reader = await signIn(TEST_USERS.reader.email);
const foreign = await signIn(TEST_USERS.foreign.email);
const admin = await signIn(TEST_USERS.admin.email);
assert.equal(tokenClaims(buyerA).tenant, TENANT_A);
assert.equal(tokenClaims(foreign).tenant, TEST_USERS.foreign.tenant);
assert.equal(tokenClaims(foreign).udbyder, undefined);
const orderId = "lager-ordre-1";
const location = { warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01" };

const receiptInput = { ordreId: orderId, modtagelseId: "auth-receipt-1", ordreRevision: 1,
  receivedDate: "2026-09-12", receivedBy: TEST_USERS.buyer.name, deliveryNote: "FS-AUTH-1",
  lines: [{ orderLineId: "tape", deliveredQuantity: 10, damagedQuantity: 0, rejectedQuantity: 0, ...location }],
};
const receipt = await callable("procureModtagelseRegistrer", receiptInput, buyerA);
assert.equal(receipt.inventoryEffects[0].after, 68);
const receiptRetry = await callable("procureModtagelseRegistrer", receiptInput, buyerA);
assert.equal(receiptRetry.allerede, true);

const reopenedOrder = await read(TENANT_A, `indkoebsordrer/${orderId}`, buyerB);
const reopenedItem = await read(TENANT_A, "forbrugsvarer/tape", buyerB);
assert.equal(reopenedOrder.modtagelser[receiptInput.modtagelseId].foelgeseddel, "FS-AUTH-1");
assert.equal(reopenedItem.lagerplaceringer["10_hovedlager_a-01"].beholdning, 68);

const noDifference = await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "optaelling", requestId: "auth-count-equal", quantity: 68, unit: "ruller", expectedRevision: 2, ...location }, buyerB);
assert.equal(noDifference.movements[0].delta, 0);
const stale = await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "optaelling", requestId: "auth-stale", quantity: 66, unit: "ruller", expectedRevision: 2, reason: "Forældet session", ...location }, buyerA, { fail: true });
assert.match(String(stale.error.status || stale.error.message || ""), /ABORTED|ændret/i);
const counted = await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "optaelling", requestId: "auth-count-difference", quantity: 66, unit: "ruller", expectedRevision: 3, reason: "Afvigelse ved optælling", ...location }, buyerA);
assert.deepEqual([counted.movements[0].foer, counted.movements[0].delta, counted.movements[0].efter], [68, -2, 66]);
assert.equal((await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "optaelling", requestId: "auth-count-difference", quantity: 66, unit: "ruller", expectedRevision: 3, reason: "Afvigelse ved optælling", ...location }, buyerA)).already, true);
await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "forbrug", requestId: "auth-use-1", quantity: 1, unit: "ruller", expectedRevision: 4, ...location }, buyerB);

await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "startbeholdning", requestId: "auth-start-b", quantity: 0, unit: "ruller", expectedRevision: 0,
  warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "b-01", location: "B-01" }, buyerA);
const transfer = await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "flytning", requestId: "auth-transfer", quantity: 2, unit: "ruller",
  fromWarehouseId: "hovedlager", fromWarehouse: "Hovedlager", fromLocationId: "a-01", fromLocation: "A-01", expectedFromRevision: 5,
  toWarehouseId: "hovedlager", toWarehouse: "Hovedlager", toLocationId: "b-01", toLocation: "B-01", expectedToRevision: 1 }, buyerB);
assert.deepEqual(transfer.movements.map((row) => row.delta), [-2, 2]);
const returned = await callable("procureVareReturneringRegistrer", { ordreId: orderId, ordreRevision: 1, returneringId: "auth-return-1", returnDate: "2026-09-12", reason: "Syntetisk fysisk retur",
  lines: [{ orderLineId: "tape", quantity: 1, warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01" }] }, buyerA);
assert.equal(returned.allerede, false);

const beforeCredit = await read(TENANT_A, "forbrugsvarer/tape", buyerB);
const invoice = await callable("procureFakturaImport", { ordreId: orderId, ordreRevision: 1, requestId: "auth-invoice", invoiceNumber: "AUTH-INV-1", invoiceDate: "2026-09-12", type: "invoice",
  lines: [{ orderLineId: "tape", quantity: 10, unitPriceOere: 2400 }] }, admin);
await callable("fakturastatus", { fakturaId: invoice.fakturaId, til: "godkendt" }, admin);
const credit = await callable("procureFakturaImport", { ordreId: orderId, ordreRevision: 1, requestId: "auth-credit", invoiceNumber: "AUTH-KN-1", invoiceDate: "2026-09-12", type: "credit-note", creditsInvoiceId: invoice.fakturaId, returnId: "auth-return-1",
  lines: [{ orderLineId: "tape", quantity: 1, unitPriceOere: 2400 }] }, admin);
await callable("fakturastatus", { fakturaId: credit.fakturaId, til: "godkendt" }, admin);
const afterCredit = await read(TENANT_A, "forbrugsvarer/tape", buyerB);
assert.deepEqual(afterCredit.lagerplaceringer, beforeCredit.lagerplaceringer, "kreditnota må ikke flytte fysisk lager");

await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "forbrug", requestId: "auth-reader-denied", quantity: 1, unit: "ruller", expectedRevision: 7, ...location }, reader, { fail: true });
await read(TENANT_A, "forbrugsvarer/tape", foreign, { fail: true });
const foreignWrite = await callable("procureLagerBevaegelse", { forbrugsvareId: "tape", type: "forbrug", requestId: "auth-foreign-denied", quantity: 1, unit: "ruller", expectedRevision: 7, ...location }, foreign, { fail: true });
assert.notEqual(foreignWrite.status, 200);

const movementCountBeforeFailure = Object.keys(await read(TENANT_A, "forbrugsvarebevaegelser", buyerA)).length;
await callable("procureModtagelseRegistrer", { ...receiptInput, modtagelseId: "auth-receipt-invalid", lines: [{ ...receiptInput.lines[0], warehouseId: "ukendt", locationId: "ukendt" }] }, buyerA, { fail: true });
assert.equal(await read(TENANT_A, `indkoebsordrer/${orderId}/modtagelser/auth-receipt-invalid`, buyerA), null);
assert.equal(Object.keys(await read(TENANT_A, "forbrugsvarebevaegelser", buyerA)).length, movementCountBeforeFailure);

const movementsObject = await read(TENANT_A, "forbrugsvarebevaegelser", buyerA);
const movements = Object.entries(movementsObject).map(([id, row]) => ({ id, ...row }));
const item = await read(TENANT_A, "forbrugsvarer/tape", buyerA);
const from = "2026-01-01"; const to = "2026-12-31";
const rows = inventoryPeriodSummary([{ ...item, id: "tape" }], movements, { fromMs: Date.parse(`${from}T00:00:00Z`), toMs: Date.parse(`${to}T23:59:59.999Z`), groupBy: "warehouse" });
assert.equal(rows[0].opening + rows[0].starts + rows[0].receipts - rows[0].consumption - rows[0].returns + rows[0].corrections + rows[0].transfers, rows[0].closing);
const csv = inventoryCsv(rows, { from, to });
await writeFile(path.join(outputDir, "PROCURE-lager-periode-2026.csv"), `\ufeff${csv}`);
const finalItem = await read(TENANT_A, "forbrugsvarer/tape", buyerB);
const proof = {
  generatedAt: new Date().toISOString(), projectId: PROJECT_ID, environment: "Firebase Emulator Suite",
  auth: { ordinaryPasswordSignIn: true, sessions: 2, writerDenied: true, foreignTenantReadDenied: true },
  receipt: { id: receiptInput.modtagelseId, after: receipt.inventoryEffects[0].after, retryAlready: receiptRetry.allerede, reopenedInSecondSession: Boolean(reopenedOrder.modtagelser[receiptInput.modtagelseId]) },
  counts: {
    withoutDifference: { before: noDifference.movements[0].foer, delta: noDifference.movements[0].delta, after: noDifference.movements[0].efter },
    withDifference: { before: counted.movements[0].foer, delta: counted.movements[0].delta, after: counted.movements[0].efter },
  },
  concurrency: { staleStatus: stale.error.status || stale.error.message, savedAfter: counted.movements[0].efter },
  movements: { count: movements.length, transferDeltas: transfer.movements.map((row) => row.delta), physicalReturn: true, creditChangedStock: false },
  atomicFailure: { noReceipt: true, movementCountUnchanged: true },
  period: { from, to, rows: rows.map(({ movements: _movements, item: _item, ...row }) => row), csvSha256: createHash("sha256").update(csv).digest("hex") },
  final: { quantity: finalItem.beholdning, locations: finalItem.lagerplaceringer },
};
await writeFile(path.join(outputDir, "PROCURE-lager-auth-functions-bevis.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
