/* Autoriseret runtime-QA for allerede foretaget køb og kvitteringsbilag.
 * Scriptet accepterer kun lokale emulatorhosts og syntetiske identiteter. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ID, SYNTHETIC_PASSWORD, TENANT_A, TEST_USERS, seedProcureAuthEmulator } from "./procure-auth-emulator-seed.mjs";

const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9109",
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9010",
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5012",
};
for (const [name, host] of Object.entries(hosts)) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal være en lokal emulator.`);
const functionBase = `http://${hosts.functions}/${PROJECT_ID}/europe-west1`;
const databaseBase = `http://${hosts.database}`;
const outputDir = path.resolve(process.argv[2] || "output/review/varelager-koeb-runtime");
await mkdir(outputDir, { recursive: true });
await seedProcureAuthEmulator();

async function signIn(email) {
  const response = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body)); return body.idToken;
}
async function callable(name, data, token, { fail = false } = {}) {
  const response = await fetch(`${functionBase}/${name}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  const body = await response.json().catch(() => ({}));
  if (fail) { assert.notEqual(response.status, 200, `${name} skulle være afvist`); return { status: response.status, error: body.error || body }; }
  assert.equal(response.status, 200, `${name}: ${JSON.stringify(body)}`); return body.result;
}
async function read(tenant, pathname, token, { fail = false } = {}) {
  const response = await fetch(`${databaseBase}/tenants/${tenant}/${pathname}.json?ns=${PROJECT_ID}&auth=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({}));
  if (fail) { assert.equal(response.ok, false, `${tenant}/${pathname} skulle være afvist`); return response.status; }
  assert.equal(response.ok, true, JSON.stringify(body)); return body;
}
async function attach(purchaseId, bytes, name, token) {
  const initiated = await callable("procureKoebBilagUploadInitier", { purchaseId, originalFilename: name, mimeType: "image/png", size: bytes.length }, token);
  const upload = await fetch(initiated.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: bytes });
  assert.equal(upload.ok, true, await upload.text());
  const confirmed = await callable("procureKoebBilagUploadBekraeft", { purchaseId, documentId: initiated.documentId }, token);
  return { ...initiated, ...confirmed };
}

const buyerA = await signIn(TEST_USERS.buyer.email);
const buyerB = await signIn(TEST_USERS.buyer.email);
const approver = await signIn(TEST_USERS.approver.email);
const reader = await signIn(TEST_USERS.reader.email);
const foreign = await signIn(TEST_USERS.foreign.email);
const request = {
  requestId: "auth-already-purchased-mixed", supplierId: "nordisk", purchaseDate: "2026-09-12", paymentMethod: "firmakort",
  lines: [
    { itemId: "milk", quantity: 12, unit: "liter", departmentId: "administration", amountOere: 14400 },
    { itemId: "tape", quantity: 2, unit: "ruller", departmentId: "lager", amountOere: 4800, warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01", expectedRevision: 1 },
  ],
};
const orderCountBefore = Object.keys(await read(TENANT_A, "indkoebsordrer", buyerA) || {}).length;
const purchase = await callable("procureKoebRegistrer", request, buyerA);
assert.equal(purchase.vendorMailSent, false); assert.equal(purchase.paymentCreated, false);
assert.deepEqual(purchase.inventoryEffects.map((row) => [row.itemId, row.before, row.delta, row.after]), [["tape", 58, 2, 60]]);
const retry = await callable("procureKoebRegistrer", request, buyerA);
assert.equal(retry.already, true); assert.equal(retry.purchaseId, purchase.purchaseId);
assert.equal(Object.keys(await read(TENANT_A, "indkoebsordrer", buyerA) || {}).length, orderCountBefore, "køb med kvittering må ikke oprette leverandørordre");
const rows = Object.values(await read(TENANT_A, "indkoeb", buyerB) || {}).filter((row) => row.koebId === purchase.purchaseId);
assert.equal(rows.length, 2); assert.deepEqual(new Set(rows.map((row) => row.afdelingId)), new Set(["administration", "lager"]));
assert.equal((await read(TENANT_A, "forbrugsvarer/tape", buyerB)).lagerplaceringer["10_hovedlager_a-01"].beholdning, 60);
await callable("procureKoebRegistrer", { ...request, requestId: "reader-denied" }, reader, { fail: true });
await read(TENANT_A, `indkoeb/${purchase.purchaseId}__linje-1`, foreign, { fail: true });

// Gyldigt 1x1 PNG. Bytes bruges direkte til upload, download og SHA-256-bevis.
const receiptBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const attached = await attach(purchase.purchaseId, receiptBytes, "syntetisk-kvittering.png", buyerA);
const expectedSha256 = createHash("sha256").update(receiptBytes).digest("hex");
assert.equal(attached.sha256, expectedSha256);
const reopenedRows = Object.values(await read(TENANT_A, "indkoeb", buyerB) || {}).filter((row) => row.koebId === purchase.purchaseId);
assert.ok(reopenedRows.every((row) => row.bilagId === attached.documentId && row.kvitteringsstatus === "vedhaeftet"));
const link = await callable("procureKoebBilagDownloadLink", { purchaseId: purchase.purchaseId, documentId: attached.documentId }, buyerB);
const downloaded = Buffer.from(await (await fetch(link.url)).arrayBuffer());
assert.deepEqual(downloaded, receiptBytes); assert.equal(link.sha256, expectedSha256);
await callable("procureKoebBilagDownloadLink", { purchaseId: purchase.purchaseId, documentId: attached.documentId }, foreign, { fail: true });

// Manglende bilag suppleres på samme køb uden nyt køb eller lagerbevægelse.
const missing = await callable("procureKoebRegistrer", { requestId: "auth-purchase-missing-receipt", supplierId: "nordisk", purchaseDate: "2026-09-12", paymentMethod: "firmakort",
  lines: [{ itemId: "milk", quantity: 1, unit: "liter", departmentId: "administration", amountOere: 1200 }] }, buyerA);
const movementCountBeforeSupplement = Object.keys(await read(TENANT_A, "forbrugsvarebevaegelser", buyerA) || {}).length;
const supplemented = await attach(missing.purchaseId, receiptBytes, "senere-kvittering.png", buyerB);
assert.equal(Object.keys(await read(TENANT_A, "forbrugsvarebevaegelser", buyerA) || {}).length, movementCountBeforeSupplement);
assert.equal(Object.values(await read(TENANT_A, "indkoeb", buyerA) || {}).filter((row) => row.koebId === missing.purchaseId).length, 1);

// Falsk indhold med PNG-mimetype afvises og må ikke fremstå som vedhæftet.
const invalidPurchase = await callable("procureKoebRegistrer", { requestId: "auth-purchase-invalid-receipt", supplierId: "nordisk", purchaseDate: "2026-09-12", paymentMethod: "firmakort",
  lines: [{ itemId: "milk", quantity: 1, unit: "liter", departmentId: "administration", amountOere: 1200 }] }, buyerA);
const bad = Buffer.from("ikke en png", "utf8");
const badInit = await callable("procureKoebBilagUploadInitier", { purchaseId: invalidPurchase.purchaseId, originalFilename: "forkert.png", mimeType: "image/png", size: bad.length }, buyerA);
assert.equal((await fetch(badInit.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: bad })).ok, true);
await callable("procureKoebBilagUploadBekraeft", { purchaseId: invalidPurchase.purchaseId, documentId: badInit.documentId }, buyerA, { fail: true });
const invalidRows = Object.values(await read(TENANT_A, "indkoeb", buyerB) || {}).filter((row) => row.koebId === invalidPurchase.purchaseId);
assert.ok(invalidRows.every((row) => row.kvitteringsstatus === "mangler" && !row.bilagId));

// Én leverandørbestilling kan bevare flere kundeskabte afdelinger på linjeniveau.
const draftSaved = await callable("procureMobilKladdeGem", { expectedRevision: 0, mutationId: "auth-mixed-departments-save", draft: {
  items: { tape: 2, milk: 12 }, lineDepartments: { tape: "lager", milk: "administration" }, departmentId: "lager", department: "Varemodtagelse",
  deliveryLocationId: "hovedlager", deliveryLocation: "Hovedlager · rampe 2", wantedDate: "2026-09-30", asSoonAsPossible: false,
} }, buyerA);
const submitted = await callable("procureMobilKladdeDelIndsend", { expectedRevision: draftSaved.draft.revision, requestId: "auth-mixed-departments-submit",
  selections: [{ id: "tape", quantity: 2, departmentId: "lager" }, { id: "milk", quantity: 12, departmentId: "administration" }] }, buyerA);
const approval = await read(TENANT_A, `procureGodkendelsessager/${submitted.approvalId}`, approver);
assert.deepEqual(new Set(Object.values(approval.lines).map((line) => line.departmentId)), new Set(["lager", "administration"]));
const decision = await callable("procureGodkendelseslinjerAfgor", { approvalId: approval.id, expectedRevision: approval.revision, requestId: "auth-mixed-departments-approve",
  decisions: Object.values(approval.lines).map((line) => ({ lineId: line.id, action: "approve", quantity: line.requestedQuantity })) }, approver);
assert.equal(decision.orders.length, 1, "samme leverandør giver én ordre");
const mixedOrder = await read(TENANT_A, `indkoebsordrer/${decision.orders[0].id}`, buyerB);
assert.deepEqual(new Set(Object.values(mixedOrder.linjer).map((line) => line.afdelingId)), new Set(["lager", "administration"]));

await writeFile(path.join(outputDir, "syntetisk-kvittering.png"), receiptBytes);
const proof = {
  generatedAt: new Date().toISOString(), projectId: PROJECT_ID, environment: "Firebase Emulator Suite",
  auth: { ordinaryPasswordSignIn: true, authorizedSessions: 2, readOnlyWriteDenied: true, foreignTenantReadAndDocumentDenied: true },
  purchase: { id: purchase.purchaseId, reference: purchase.reference, lineCount: 2, departments: ["Administration", "Varemodtagelse"], vendorMailSent: false, paymentCreated: false, supplierOrderCountUnchanged: true, retryWasDuplicate: retry.already },
  supplierOrder: { oneSupplierOrder: true, lineDepartments: ["Administration", "Varemodtagelse"], fullApprovalBasisPreserved: mixedOrder.godkendelsesgrundlagOere === approval.approvalBasisOere },
  inventory: { stockedLineBefore: 58, stockedLineReceived: 2, stockedLineAfter: 60, nonStockedLineDidNotCreateMovement: true },
  receipt: { documentId: attached.documentId, size: receiptBytes.length, uploadSha256: attached.sha256, downloadSha256: createHash("sha256").update(downloaded).digest("hex"), reopenedSecondAuthorizedSession: true, supplementedSamePurchase: supplemented.sha256 === expectedSha256, invalidMagicBytesRejected: true },
};
await writeFile(path.join(outputDir, "PROCURE_KOEB_AUTH_FUNCTIONS_BEVIS.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
