/* Sammenhængende lokal PROCURE-flowtest mod Auth/Functions/Database/Storage.
 * Alle værter skal være loopback, alle brugere/data er syntetiske, og den
 * lokale mailtransport accepterer kun reserverede .invalid-adresser. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PROJECT_ID, SYNTHETIC_PASSWORD, TENANT_A, TEST_USERS } from "./procure-auth-emulator-seed.mjs";

const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9109",
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9010",
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5012",
  storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9209",
};
for (const [name, host] of Object.entries(hosts)) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal være en lokal emulator.`);
const functionBase = `http://${hosts.functions}/${PROJECT_ID}/europe-west1`;
const databaseBase = `http://${hosts.database}`;

async function signIn(email) {
  const response = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body)); return body.idToken;
}
async function call(name, data, token, expected = 200) {
  const response = await fetch(`${functionBase}/${name}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json(); assert.equal(response.status, expected, `${name}: ${JSON.stringify(body)}`); return body.result;
}
async function read(path, token) {
  const response = await fetch(`${databaseBase}/tenants/${TENANT_A}/${path}.json?ns=${PROJECT_ID}&auth=${encodeURIComponent(token)}`);
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body)); return body;
}
async function readAsEmulatorOwner(path) {
  const response = await fetch(`${databaseBase}/${path}.json?ns=${PROJECT_ID}&auth=owner`);
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body)); return body;
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const buyer = await signIn(TEST_USERS.buyer.email);
const approver = await signIn(TEST_USERS.approver.email);
const admin = await signIn(TEST_USERS.admin.email);

const syntheticWebshopPassword = "Kun-lokal-syntetisk-webshopkode";
await call("procureWebshopCredentialGem", { leverandoerId: "nordisk", brugernavn: "syntetisk-indkoeber", adgangskode: syntheticWebshopPassword }, admin);
const credential = await call("procureWebshopCredentialHent", { leverandoerId: "nordisk" }, admin);
assert.equal(credential.username, "syntetisk-indkoeber"); assert.equal(credential.password, syntheticWebshopPassword);
await call("procureWebshopCredentialHent", { leverandoerId: "nordisk" }, buyer, 403);
const auditAfterCredential = await readAsEmulatorOwner(`audit/${TENANT_A}`);
assert.equal(JSON.stringify(auditAfterCredential).includes(syntheticWebshopPassword), false);

const save = await call("procureMobilKladdeGem", {
  expectedRevision: 0, mutationId: `save-${randomUUID()}`,
  draft: { items: { tape: 120, film: 80 }, departmentId: "lager", department: "Lager",
    deliveryLocationId: "hovedlager", deliveryLocation: "Hovedlager · rampe 2",
    wantedDate: "2026-09-30", asSoonAsPossible: false },
}, buyer);
const submissionRequest = `submit-${randomUUID()}`;
const submitted = await call("procureMobilKladdeDelIndsend", {
  expectedRevision: save.draft.revision, requestId: submissionRequest,
  selections: [{ id: "tape", quantity: 120 }, { id: "film", quantity: 80 }],
}, buyer);
assert.match(submitted.reference, /^IND-\d{4}-[A-F0-9]{6}$/);
const approval = await read(`procureGodkendelsessager/${submitted.approvalId}`, approver);
const decisionRequest = `decide-${randomUUID()}`;
const decided = await call("procureGodkendelseslinjerAfgor", {
  approvalId: approval.id, expectedRevision: approval.revision, requestId: decisionRequest,
  decisions: Object.values(approval.lines).map((line) => ({ lineId: line.id, action: "approve", quantity: line.requestedQuantity })),
}, approver);
assert.equal(decided.orders.length, 1);
const orderId = decided.orders[0].id;
let order = await read(`indkoebsordrer/${orderId}`, buyer);
assert.equal(Object.values(order.linjer).reduce((sum, line) => sum + line.antal * line.prisPrEnhedOere, 0), 888000);

const preview = await call("ordrePdfHent", { ordreId: orderId }, buyer);
const previewBytes = Buffer.from(await (await fetch(preview.url)).arrayBuffer());
assert.equal(sha(previewBytes), preview.sha256);
if (process.env.PROCURE_QA_PDF_OUTPUT) {
  const outputPath = resolve(process.env.PROCURE_QA_PDF_OUTPUT);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, previewBytes);
}
const sendRequestId = `send-${randomUUID()}`;
const sent = await call("ordreMailSend", { ordreId: orderId, sendRequestId, sprog: "da", emne: `Syntetisk bestilling ${order.nummer}`, ledsagetekst: "Kontrolleret lokal flowtest." }, buyer);
assert.equal(sent.mailStatus, "accepteret");
assert.equal(sent.transportBilagSha256, preview.sha256);
order = await read(`indkoebsordrer/${orderId}`, buyer);
assert.equal(order.sendtMail.pdfSha256, preview.sha256);
assert.equal(order.sendtMail.transportBilagSha256, preview.sha256);
assert.equal(order.sendtMail.ordreRevision, preview.revision);
const repeatedSend = await call("ordreMailSend", { ordreId: orderId, sendRequestId, sprog: "da" }, buyer);
assert.equal(repeatedSend.allerede, true);

const pngA = Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001", "hex");
const pngB = Buffer.concat([pngA, Buffer.from("syntetisk-foto-2")]);
async function uploadReceiptImage(receiptId, name, bytes) {
  const init = await call("procureModtagelseUploadInitier", { ordreId: orderId, modtagelseId: receiptId,
    ordreRevision: order.revision, originaltFilnavn: name, mimeType: "image/png", stoerrelse: bytes.length }, buyer);
  const uploaded = await fetch(init.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: bytes });
  assert.equal(uploaded.ok, true, await uploaded.text());
  const confirmed = await call("procureModtagelseUploadBekraeft", { ordreId: orderId, modtagelseId: receiptId, dokumentId: init.dokumentId }, buyer);
  return { ...init, ...confirmed };
}
const firstReceiptId = `receipt-${randomUUID()}`;
const docA = await uploadReceiptImage(firstReceiptId, "foelgeseddel.png", pngA);
const docB = await uploadReceiptImage(firstReceiptId, "varefoto.png", pngB);
assert.equal(docA.status, "aktiv"); assert.equal(docB.status, "aktiv");
const lineByItem = Object.fromEntries(Object.entries(order.linjer).map(([id, line]) => [line.vareId, id]));
await call("procureModtagelseRegistrer", { ordreId: orderId, modtagelseId: firstReceiptId, ordreRevision: order.revision,
  receivedDate: "2026-09-16", receivedBy: "Syntetisk lagermedarbejder", deliveryNote: "FS-4482",
  lines: [{ orderLineId: lineByItem.tape, deliveredQuantity: 72, damagedQuantity: 0, rejectedQuantity: 0 },
    { orderLineId: lineByItem.film, deliveredQuantity: 80, damagedQuantity: 0, rejectedQuantity: 0 }] }, buyer);
const reopenedReceipt = await read(`indkoebsordrer/${orderId}/modtagelser/${firstReceiptId}`, buyer);
assert.equal(Object.keys(reopenedReceipt.dokumenter).length, 2);
const download = await call("procureModtagelseDownloadLink", { ordreId: orderId, modtagelseId: firstReceiptId, dokumentId: docA.dokumentId }, buyer);
assert.equal((await fetch(download.url)).ok, true);
const foreign = await signIn(TEST_USERS.foreign.email);
await call("procureModtagelseDownloadLink", { ordreId: orderId, modtagelseId: firstReceiptId, dokumentId: docA.dokumentId }, foreign, 404);

const invoice1 = await call("procureFakturaImport", { ordreId: orderId, ordreRevision: order.revision,
  requestId: `invoice-${randomUUID()}`, invoiceNumber: "SYN-DEL-1", invoiceDate: "2026-09-17", type: "invoice",
  lines: [{ orderLineId: lineByItem.tape, quantity: 72, unitPriceOere: 2600 },
    { orderLineId: lineByItem.film, quantity: 80, unitPriceOere: 7500 }] }, admin);
assert.equal(invoice1.beloebOere, 787200); assert.equal(invoice1.prisafvigelseOere, 14400);
await call("fakturastatus", { fakturaId: invoice1.fakturaId, til: "godkendt" }, approver);
const credit = await call("procureFakturaImport", { ordreId: orderId, ordreRevision: order.revision,
  requestId: `credit-${randomUUID()}`, invoiceNumber: "SYN-KN-1", invoiceDate: "2026-09-18", type: "credit-note",
  creditsInvoiceId: invoice1.fakturaId, lines: [{ orderLineId: lineByItem.tape, quantity: 72, unitPriceOere: 200 }] }, admin);
assert.equal(credit.beloebOere, 14400);
await call("fakturastatus", { fakturaId: credit.fakturaId, til: "godkendt" }, approver);

const secondReceiptId = `receipt-${randomUUID()}`;
await call("procureModtagelseRegistrer", { ordreId: orderId, modtagelseId: secondReceiptId, ordreRevision: order.revision,
  receivedDate: "2026-09-20", receivedBy: "Syntetisk lagermedarbejder", deliveryNote: "FS-4499",
  lines: [{ orderLineId: lineByItem.tape, deliveredQuantity: 48, damagedQuantity: 0, rejectedQuantity: 0 }] }, buyer);
const invoiceRequest2 = `invoice-${randomUUID()}`;
const invoice2Input = { ordreId: orderId, ordreRevision: order.revision, requestId: invoiceRequest2,
  invoiceNumber: "SYN-SLUT-1", invoiceDate: "2026-09-21", type: "invoice",
  lines: [{ orderLineId: lineByItem.tape, quantity: 48, unitPriceOere: 2400 }] };
const invoice2 = await call("procureFakturaImport", invoice2Input, admin);
assert.equal(invoice2.beloebOere, 115200);
await call("fakturastatus", { fakturaId: invoice2.fakturaId, til: "godkendt" }, approver);
const repeatedImport = await call("procureFakturaImport", invoice2Input, admin);
assert.equal(repeatedImport.allerede, true);
const invoices = Object.values(await read("fakturaer", admin)).filter((row) => row.destinationId === orderId && row.status === "godkendt");
const net = invoices.reduce((sum, row) => sum + (row.fakturatype === "credit-note" ? -1 : 1) * row.beloebOere, 0);
assert.equal(net, 888000);
order = await read(`indkoebsordrer/${orderId}`, buyer);
assert.equal(order.status, "modtaget"); assert.equal(order.resterendeVaerdiOere, 0);

const returnId = `return-${randomUUID()}`;
const returned = await call("procureVareReturneringRegistrer", { ordreId: orderId, ordreRevision: order.revision,
  returneringId: returnId, returnDate: "2026-09-22", reason: "Syntetisk fysisk retur",
  invoiceId: invoice2.fakturaId, lines: [{ orderLineId: lineByItem.tape, quantity: 1 }] }, buyer);
assert.equal(returned.vaerdiOere, 2400); assert.equal(returned.kreditstatus, "afventer-kreditnota");
const repeatedReturn = await call("procureVareReturneringRegistrer", { ordreId: orderId, ordreRevision: order.revision,
  returneringId: returnId, returnDate: "2026-09-22", reason: "Syntetisk fysisk retur",
  invoiceId: invoice2.fakturaId, lines: [{ orderLineId: lineByItem.tape, quantity: 1 }] }, buyer);
assert.equal(repeatedReturn.allerede, true);
const returnCredit = await call("procureFakturaImport", { ordreId: orderId, ordreRevision: order.revision,
  requestId: `return-credit-${randomUUID()}`, invoiceNumber: "SYN-RET-KN-1", invoiceDate: "2026-09-23", type: "credit-note",
  creditsInvoiceId: invoice2.fakturaId, returnId, lines: [{ orderLineId: lineByItem.tape, quantity: 1, unitPriceOere: 2400 }] }, admin);
await call("fakturastatus", { fakturaId: returnCredit.fakturaId, til: "godkendt" }, approver);
const postReturnInvoices = Object.values(await read("fakturaer", admin)).filter((row) => row.destinationId === orderId && row.status === "godkendt");
const postReturnNet = postReturnInvoices.reduce((sum, row) => sum + (row.fakturatype === "credit-note" ? -1 : 1) * row.beloebOere, 0);
assert.equal(postReturnNet, 885600);
order = await read(`indkoebsordrer/${orderId}`, buyer);
assert.equal(order.returneringer[returnId].kreditstatus, "krediteret");

const webshopSave = await call("procureMobilKladdeGem", { expectedRevision: submitted.draft.revision, mutationId: `webshop-save-${randomUUID()}`,
  draft: { items: { tape: 2 }, departmentId: "lager", department: "Lager", deliveryLocationId: "hovedlager",
    deliveryLocation: "Hovedlager · rampe 2", wantedDate: null, asSoonAsPossible: true } }, buyer);
const webshopSubmitted = await call("procureMobilKladdeDelIndsend", { expectedRevision: webshopSave.draft.revision,
  requestId: `webshop-submit-${randomUUID()}`, selections: [{ id: "tape", quantity: 2 }] }, buyer);
const webshopApproval = await read(`procureGodkendelsessager/${webshopSubmitted.approvalId}`, approver);
const webshopDecided = await call("procureGodkendelseslinjerAfgor", { approvalId: webshopApproval.id,
  expectedRevision: webshopApproval.revision, requestId: `webshop-approve-${randomUUID()}`,
  decisions: Object.values(webshopApproval.lines).map((line) => ({ lineId: line.id, action: "approve", quantity: line.requestedQuantity })) }, approver);
assert.equal(webshopDecided.orders.length, 1);
const webshopOrderId = webshopDecided.orders[0].id;
const webshopBeforeOpen = await read(`indkoebsordrer/${webshopOrderId}`, buyer);
await call("procureWebshopCredentialHent", { leverandoerId: "nordisk" }, admin);
const webshopAfterOpen = await read(`indkoebsordrer/${webshopOrderId}`, buyer);
assert.equal(webshopBeforeOpen.status, "godkendt"); assert.equal(webshopAfterOpen.status, "godkendt");
const webshopRequest = `webshop-order-${randomUUID()}`;
const webshopRegistered = await call("procureWebshopBestillingRegistrer", { ordreId: webshopOrderId, requestId: webshopRequest,
  eksternOrdrenummer: "SYN-WEB-1001", beloebOere: 4800, betalingsmetode: "firmakort",
  betalingsdato: "2026-09-24", betalingsreference: "SYN-KORT-KVITTERING", dokumentId: "syntetisk-kvittering" }, buyer);
assert.equal(webshopRegistered.status, "sendt"); assert.equal(webshopRegistered.supplierConfirmationStatus, "pending");
const webshopRepeated = await call("procureWebshopBestillingRegistrer", { ordreId: webshopOrderId, requestId: webshopRequest,
  eksternOrdrenummer: "SYN-WEB-1001", beloebOere: 4800, betalingsmetode: "firmakort",
  betalingsdato: "2026-09-24", betalingsreference: "SYN-KORT-KVITTERING", dokumentId: "syntetisk-kvittering" }, buyer);
assert.equal(webshopRepeated.duplicate, true);
const webshopOrder = await read(`indkoebsordrer/${webshopOrderId}`, buyer);
assert.equal(webshopOrder.betaling.metode, "firmakort"); assert.equal(webshopOrder.betaling.oekonomistatus, "afventerDokumentation");

console.log(JSON.stringify({ ok: true, reference: submitted.reference, poNumber: order.nummer,
  orderTotalOere: 888000, firstReceiptAcceptedOere: 772800, remainingAfterFirstOere: 115200,
  firstInvoiceOere: invoice1.beloebOere, priceDeviationOere: invoice1.prisafvigelseOere,
  creditNoteOere: credit.beloebOere, finalInvoiceOere: invoice2.beloebOere, approvedNetSpendOere: net,
  pdf: { previewSha256: preview.sha256, transportedSha256: sent.transportBilagSha256,
    archivedSha256: order.sendtMail.pdfSha256, bytes: previewBytes.length },
  receipt: { id: firstReceiptId, activeDocuments: 2, reopened: true, otherTenantDenied: true },
  duplicates: { send: repeatedSend.allerede, invoiceImport: repeatedImport.allerede },
  supplierConfirmationStatus: order.leverandoerBekraeftelseStatus || "afventer",
  physicalReturn: { valueOere: returned.vaerdiOere, duplicateProtected: repeatedReturn.allerede,
    creditStatus: order.returneringer[returnId].kreditstatus, netAfterCreditOere: postReturnNet },
  webshop: { encryptedCredentialRoundTrip: true, unauthorizedBuyerDenied: true, secretAbsentFromAudit: true,
    openingDidNotOrder: webshopAfterOpen.status === "godkendt", orderStatus: webshopOrder.status,
    paymentMethod: webshopOrder.betaling.metode, financeStatus: webshopOrder.betaling.oekonomistatus,
    duplicateProtected: webshopRepeated.duplicate } }, null, 2));
