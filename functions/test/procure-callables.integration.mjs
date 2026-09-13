/* Reelt handler-flow mod isolerede RTDB/Storage-emulatorer. Callables køres
 * med syntetiske auth-claims. Mailgun-grænsen erstattes af en kontrolleret
 * multipart-inspektion; ingen ekstern mail sendes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deleteApp, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";

const projectId = "demo-fleetcontrol-rules-test";
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= "127.0.0.1:9200";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "127.0.0.1:9399";
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
  storageBucket: `${projectId}.appspot.com`,
});
process.env.MAILGUN_API_KEY = "syntetisk-noegle";
process.env.MAILGUN_DOMAIN = "example.invalid";
process.env.MAILGUN_AFSENDER = "Veyro test <no-reply@example.invalid>";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mailPayloads = [];
let mailMode = "accept";
globalThis.fetch = async (url, options = {}) => {
  assert.match(String(url), /^https:\/\/api\.eu\.mailgun\.net\/v3\/example\.invalid\/messages$/);
  if (mailMode === "unknown") throw new Error("syntetisk timeout efter transportens accept");
  const payload = { attachments: [] };
  for (const [name, value] of options.body.entries()) {
    if (name === "attachment") payload.attachments.push({
      filename: value.name,
      contentType: value.type,
      bytes: Buffer.from(await value.arrayBuffer()),
    });
    else payload[name] = String(value);
  }
  mailPayloads.push(payload);
  return new Response(JSON.stringify({ id: "<syntetisk-accept@example.invalid>" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const functions = await import("../index.js");
const { ordrePdfStoragePath } = await import("../delt/procure-v2/procure-pdf.js");
const { permStrengFraRolle } = await import("../delt/permissions.js");
const db = getDatabase();
const bucket = getStorage().bucket();
const tenantA = "procure-callable-a";
const tenantB = "procure-callable-b";
const orderId = "ordre-8880";
const uid = "procure-bestiller";
const auth = (tenant = tenantA, user = uid) => ({
  uid: user,
  token: {
    tenant,
    rolle: "admin",
    perms: permStrengFraRolle("admin"),
  },
});
const run = (handler, data, login = auth()) => handler.run({ auth: login, data });
const order = (id = orderId) => ({
  id,
  nummer: id === orderId ? "BST-2026-00888" : "BST-2026-00889",
  leverandoerId: "nordisk",
  status: "godkendt",
  revision: 4,
  godkendtRevision: 4,
  leveringssted: "Hovedlager",
  leveringsstedId: "hovedlager",
  leveringsadresse: "Lagervej 8", leveringspostnr: "8000", leveringsby: "Aarhus C",
  oensketDato: "2026-09-15",
  oprettetAf: uid,
  oprettetMs: Date.parse("2026-09-11T09:00:00Z"),
  bestillerNavn: "Mette Jensen", bestillerEmail: "indkoeb@fjordholm.example",
  linjer: {
    tape: { vare: "Pakketape", antal: 120, enhed: "ruller", prisPrEnhedOere: 2400, forbrugsvareId: "tape", varegruppe: "Emballage" },
    film: { vare: "Strækfilm", antal: 80, enhed: "ruller", prisPrEnhedOere: 7500, forbrugsvareId: "film", varegruppe: "Emballage" },
  },
});
const supplier = {
  navn: "Syntetisk Leverandør A/S",
  adresse: "Industrivej 12", postnr: "8200", by: "Aarhus N", kundenummer: "FH-1042",
  ordreEmail: "ordre@example.invalid",
  kontaktEmail: "kontakt@example.invalid",
  sprog: "da",
};
const company = { navn: "Nordisk Drift", adresse: "Havnevej 14", postnr: "8000", by: "Aarhus C", fakturaModtagelse: "faktura@example.invalid", faktureringsInstruktioner: ["Fakturaen skal være i PDF-format."], procureAppUrl: "https://procure-preview.example.invalid" };

await db.ref().set(null);
/* Testen bruger faste syntetiske id'er og skal derfor også nulstille sit eget
 * Storage-prefix. Arkiver fra en tidligere testrunde må ikke få en ny
 * skabelon til at se ud som den gamle; produktionskoden bevarer dem fortsat. */
await Promise.all([
  bucket.deleteFiles({ prefix: `tenants/${tenantA}/` }),
  bucket.deleteFiles({ prefix: `tenants/${tenantB}/` }),
]);
await db.ref(`tenants/${tenantA}`).set({
  _findes: true,
  abonnement: { status: "aktiv" },
  moduler: { indkoeb: true },
  virksomhed: company,
  brugere: { [uid]: { navn: "Mette Jensen", email: "indkoeb@fjordholm.example" } },
  procureOpsaetning: {
    leveringssteder: { hovedlager: { id: "hovedlager", label: "Hovedlager", adresse: "Lagervej 8", postnr: "8000", by: "Aarhus C", active: true } },
    lagre: { hovedlager: { id: "hovedlager", label: "Hovedlager", active: true } },
    lagerplaceringer: {
      "a-01": { id: "a-01", label: "A-01", lagerId: "hovedlager", active: true },
      "a-02": { id: "a-02", label: "A-02", lagerId: "hovedlager", active: true },
      "b-01": { id: "b-01", label: "B-01", lagerId: "hovedlager", active: true },
    },
  },
  leverandoerer: { nordisk: supplier },
  forbrugsvarer: {
    tape: { navn: "Pakketape", varenummer: "ND-1001", enhed: "ruller", grundenhed: "ruller", bestillingsenhed: "ruller", antalPrBestillingsenhed: 1,
      lagerfoert: true, pakningsstoerrelse: "6 ruller", indkoebsprisOere: 2400, varegruppe: "Emballage", leverandoerId: "nordisk", aktiv: true,
      lagerplaceringer: { "10_hovedlager_a-01": { lagerId: "hovedlager", lager: "Hovedlager", placeringId: "a-01", placering: "A-01", beholdning: 12, enhed: "ruller", revision: 1, senestBevaegetMs: 1, senestOptaltMs: 1 } } },
    film: { navn: "Strækfilm", varenummer: "ND-2005", enhed: "ruller", grundenhed: "ruller", bestillingsenhed: "ruller", antalPrBestillingsenhed: 1,
      lagerfoert: true, indkoebsprisOere: 7500, varegruppe: "Emballage", leverandoerId: "nordisk", aktiv: true,
      lagerplaceringer: { "10_hovedlager_a-02": { lagerId: "hovedlager", lager: "Hovedlager", placeringId: "a-02", placering: "A-02", beholdning: 6, enhed: "ruller", revision: 1, senestBevaegetMs: 1, senestOptaltMs: 1 } } },
  },
  indkoebsordrer: { [orderId]: order(), "ordre-unknown": order("ordre-unknown") },
});
await db.ref(`tenants/${tenantB}`).set({
  _findes: true,
  abonnement: { status: "aktiv" },
  moduler: { indkoeb: true },
  forbrugsvarer: {
    tape: { navn: "Anden tenants tape", varenummer: "B-100", enhed: "rulle", aktiv: true },
  },
});

/* QR: stabil idempotent reference, live varedata og tenantafvisning. */
const qrCreated = await run(functions.procureQrMaerkatOpret, {
  vareId: "tape", placering: "Reol A · Hylde 1", requestId: "qr-request-8880",
});
assert.match(qrCreated.maerkatId, /^qr-[a-f0-9]{24}$/);
assert.equal(qrCreated.allerede, false);
const qrReplay = await run(functions.procureQrMaerkatOpret, {
  vareId: "tape", placering: "Reol A · Hylde 1", requestId: "qr-request-8880",
});
assert.equal(qrReplay.maerkatId, qrCreated.maerkatId);
assert.equal(qrReplay.allerede, true);
const qrResolved = await run(functions.procureQrMaerkatHent, { maerkatId: qrCreated.maerkatId });
assert.equal(qrResolved.maerkat.placering, "Reol A · Hylde 1");
assert.equal(qrResolved.vare.navn, "Pakketape");
const qrSecondLocation = await run(functions.procureQrMaerkatOpret, {
  vareId: "tape", placering: "Reol D · Hylde 4", requestId: "qr-request-8881",
});
assert.notEqual(qrSecondLocation.maerkatId, qrCreated.maerkatId);
const qrList = await run(functions.procureQrMaerkatListe, {});
assert.equal(qrList.maerkater.length, 2);
assert.ok(qrList.maerkater.every((row) => row.itemId === "tape"));
assert.equal((await run(functions.procureQrMaerkatListe, {}, auth(tenantA, "procure-second-session"))).maerkater.length, 2);
assert.equal((await run(functions.procureQrMaerkatListe, {}, auth(tenantB, "tenant-b-user"))).maerkater.length, 0);
await assert.rejects(
  run(functions.procureQrMaerkatHent, { maerkatId: qrCreated.maerkatId }, auth(tenantB, "tenant-b-user")),
  (error) => error?.code === "not-found",
);
await run(functions.procureQrMaerkatStatus, { maerkatId: qrCreated.maerkatId, aktiv: false });
await assert.rejects(
  run(functions.procureQrMaerkatHent, { maerkatId: qrCreated.maerkatId }),
  (error) => error?.code === "failed-precondition",
);
await run(functions.procureQrMaerkatStatus, { maerkatId: qrCreated.maerkatId, aktiv: true });

/* Mail: handleren renderer, arkiverer og transporterer samme bytes. */
const mailResult = await run(functions.ordreMailSend, {
  ordreId: orderId,
  sendRequestId: "mail-8880",
  cc: "indkoeb@example.invalid",
  emne: "Bestilling BST-2026-00888",
  ledsagetekst: "Kontrolleret integrationsprøve.",
});
assert.equal(mailResult.mailStatus, "accepteret");
assert.equal(mailPayloads.length, 1);
assert.equal(mailPayloads[0].attachments.length, 1);
assert.equal(mailPayloads[0].attachments[0].contentType, "application/pdf");
const attachmentBytes = mailPayloads[0].attachments[0].bytes;
const archivedPath = ordrePdfStoragePath(tenantA, orderId, 4);
const [archivedBytes] = await bucket.file(archivedPath).download();
const sentRecord = (await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/sendtMail`).get()).val();
assert.deepEqual(attachmentBytes, archivedBytes);
assert.equal(hash(attachmentBytes), mailResult.pdfSha256);
assert.equal(hash(archivedBytes), sentRecord.pdfSha256);
assert.equal(sentRecord.ordreRevision, 4);
assert.equal(sentRecord.til, "ordre@example.invalid");
assert.equal(sentRecord.afsender, process.env.MAILGUN_AFSENDER);
assert.equal(sentRecord.mailStatus, "accepteret");
assert.equal((await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/pdfArkiv/4/skabelonVersion`).get()).val(), 7);
const attachmentPdf = Buffer.from(attachmentBytes).toString("latin1");
assert.match(attachmentPdf, /\/Subtype \/TrueType \/BaseFont \/Inter-Regular/);
assert.match(attachmentPdf, /\/Subtype \/TrueType \/BaseFont \/Inter-Bold/);
assert.equal((attachmentPdf.match(/\/FontFile2/g) || []).length, 2);
assert.ok(!/kr\.|pris|moms|total|i alt/i.test(mailPayloads[0].text), "leverandørmailen indeholder interne priser");
assert.match(mailPayloads[0].text, /Angiv vores bestillingsnummer BST-2026-00888 på følgesedlen og fakturaen\./);
assert.match(mailPayloads[0].text, /Fakturering\nSend faktura til: faktura@example\.invalid/);
assert.match(mailPayloads[0].text, /Fakturaen skal være i PDF-format\./);
assert.ok(!Buffer.from(attachmentBytes).toString("latin1").toLowerCase()
  .includes(Buffer.from("VAREMODTAGELSE", "latin1").toString("hex").toLowerCase()),
"ny leverandør-PDF indeholder modtagelses-QR-blokken");
assert.equal((await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/status`).get()).val(), "sendt");

const replay = await run(functions.ordreMailSend, { ordreId: orderId, sendRequestId: "mail-8880" });
assert.equal(replay.allerede, true);
assert.equal(mailPayloads.length, 1, "gentagelse må ikke kontakte transporten igen");

/* Timeout efter mulig accept gemmes som ukendt, uden statusændring/retry. */
mailMode = "unknown";
await assert.rejects(
  run(functions.ordreMailSend, { ordreId: "ordre-unknown", sendRequestId: "mail-unknown" }),
  (error) => error?.code === "aborted",
);
assert.equal((await db.ref(`tenants/${tenantA}/indkoebsordrer/ordre-unknown/status`).get()).val(), "godkendt");
assert.equal((await db.ref(`tenants/${tenantA}/indkoebsordrer/ordre-unknown/mail/mail-unknown/mailStatus`).get()).val(), "ukendt");
assert.equal((await run(functions.ordreMailSend, {
  ordreId: "ordre-unknown", sendRequestId: "mail-unknown",
})).allerede, true);
mailMode = "accept";

/* En faktisk Storage-fil valideres før den vedvarende modtagelse oprettes. */
const receiptId = "receipt-1";
const documentId = "delivery-note-1";
const noteBytes = Buffer.from("%PDF-1.4\n% syntetisk følgeseddel\n%%EOF\n");
const notePath = `tenants/${tenantA}/indkoebsordrer/${orderId}/modtagelser/${receiptId}/dokumenter/${documentId}`;
await bucket.file(notePath).save(noteBytes, { resumable: false, metadata: { contentType: "application/pdf" } });
await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/modtagelser/${receiptId}/dokumenter/${documentId}`).set({
  dokumentId: documentId,
  originaltFilnavn: "FS-4482.pdf",
  valideretMime: "application/pdf",
  stoerrelse: noteBytes.length,
  storagePath: notePath,
  uploader: uid,
  oprettetTid: Date.now(),
  status: "karantaene",
});
const confirm = await run(functions.procureModtagelseUploadBekraeft, {
  ordreId: orderId, modtagelseId: receiptId, dokumentId: documentId,
});
assert.equal(confirm.status, "aktiv");
assert.equal(confirm.sha256, hash(noteBytes));

const receiptInput = {
  ordreId: orderId,
  modtagelseId: receiptId,
  ordreRevision: 4,
  receivedDate: "2026-09-15",
  receivedBy: "Lagerbruger",
  deliveryNote: "FS-4482",
  lines: [
    { orderLineId: "tape", deliveredQuantity: 72, damagedQuantity: 0, rejectedQuantity: 0, warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01" },
    { orderLineId: "film", deliveredQuantity: 82, damagedQuantity: 1, rejectedQuantity: 1, warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-02", location: "A-02" },
  ],
};
const beforeReceipt = (await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}`).get()).val();
assert.equal(beforeReceipt.status, "sendt");
assert.equal(beforeReceipt.revision, 4);
assert.deepEqual(
  Object.values(beforeReceipt.modtagelser[receiptId].dokumenter).map((document) => document.status),
  ["aktiv"],
);
const receipt = await run(functions.procureModtagelseRegistrer, receiptInput);
assert.equal(receipt.ordreStatus, "sendt");
assert.equal(receipt.inventoryEffects.length, 2);
assert.equal(receipt.inventoryEffects.find((effect) => effect.itemId === "tape").after, 84);
assert.equal(receipt.inventoryEffects.find((effect) => effect.itemId === "film").after, 86);
assert.equal((await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/resterendeVaerdiOere`).get()).val(), 115200);
const persisted = (await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/modtagelser/${receiptId}`).get()).val();
assert.equal(persisted.linjer.film.godkendtAntal, 80);
assert.equal(persisted.dokumenter[documentId].status, "aktiv");

/* En ny autoriseret session genåbner posten; en anden tenant kan ikke. */
const reopened = await run(functions.procureModtagelseRegistrer, receiptInput, auth(tenantA, "anden-lagerbruger"));
assert.equal(reopened.allerede, true);
assert.deepEqual(reopened.inventoryEffects, receipt.inventoryEffects);
assert.equal(Object.keys((await db.ref(`tenants/${tenantA}/forbrugsvarebevaegelser`).get()).val()).length, 2, "retry oprettede en ekstra lagerbevægelse");
await assert.rejects(
  run(functions.procureModtagelseRegistrer, receiptInput, auth(tenantB, "fremmed-bruger")),
  (error) => error?.code === "not-found",
);

/* Lager: optælling, samtidighed, forbrug og atomisk flytning gennem callables. */
const counted = await run(functions.procureLagerBevaegelse, {
  forbrugsvareId: "tape", type: "optaelling", requestId: "lager-count-1", quantity: 82, unit: "ruller",
  warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01",
  expectedRevision: 2, reason: "Afvigelse ved optælling",
});
assert.equal(counted.already, false);
assert.deepEqual([counted.movements[0].foer, counted.movements[0].delta, counted.movements[0].efter], [84, -2, 82]);
assert.equal((await run(functions.procureLagerBevaegelse, {
  forbrugsvareId: "tape", type: "optaelling", requestId: "lager-count-1", quantity: 82, unit: "ruller",
  warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01",
  expectedRevision: 2, reason: "Afvigelse ved optælling",
})).already, true);
await assert.rejects(run(functions.procureLagerBevaegelse, {
  forbrugsvareId: "tape", type: "optaelling", requestId: "lager-stale-1", quantity: 81, unit: "ruller",
  warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01",
  expectedRevision: 2, reason: "Forældet session",
}), (error) => error?.code === "aborted");
await run(functions.procureLagerBevaegelse, {
  forbrugsvareId: "tape", type: "forbrug", requestId: "lager-use-1", quantity: 2, unit: "ruller",
  warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01", expectedRevision: 3,
});
await run(functions.procureLagerBevaegelse, {
  forbrugsvareId: "tape", type: "startbeholdning", requestId: "lager-start-b", quantity: 0, unit: "ruller",
  warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "b-01", location: "B-01", expectedRevision: 0,
});
const moved = await run(functions.procureLagerBevaegelse, {
  forbrugsvareId: "tape", type: "flytning", requestId: "lager-move-1", quantity: 5, unit: "ruller",
  fromWarehouseId: "hovedlager", fromWarehouse: "Hovedlager", fromLocationId: "a-01", fromLocation: "A-01", expectedFromRevision: 4,
  toWarehouseId: "hovedlager", toWarehouse: "Hovedlager", toLocationId: "b-01", toLocation: "B-01", expectedToRevision: 1,
});
assert.deepEqual(moved.movements.map((entry) => [entry.art, entry.delta]), [["flytningUd", -5], ["flytningInd", 5]]);
assert.equal((await run(functions.procureLagerBevaegelse, {
  forbrugsvareId: "tape", type: "flytning", requestId: "lager-move-1", quantity: 5, unit: "ruller",
  fromWarehouseId: "hovedlager", fromWarehouse: "Hovedlager", fromLocationId: "a-01", fromLocation: "A-01", expectedFromRevision: 4,
  toWarehouseId: "hovedlager", toWarehouse: "Hovedlager", toLocationId: "b-01", toLocation: "B-01", expectedToRevision: 1,
})).already, true);
const tapeAfterTransfer = (await db.ref(`tenants/${tenantA}/forbrugsvarer/tape`).get()).val();
assert.equal(tapeAfterTransfer.beholdning, 80);
assert.equal(tapeAfterTransfer.lagerplaceringer["10_hovedlager_a-01"].beholdning, 75);
assert.equal(tapeAfterTransfer.lagerplaceringer["10_hovedlager_b-01"].beholdning, 5);
const returned = await run(functions.procureVareReturneringRegistrer, {
  ordreId: orderId, ordreRevision: 4, returneringId: "return-stock-1", returnDate: "2026-09-18",
  reason: "Beskadiget efter udpakning", lines: [{ orderLineId: "tape", quantity: 1,
    warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01" }],
});
assert.equal(returned.allerede, false);
assert.equal((await db.ref(`tenants/${tenantA}/forbrugsvarer/tape/lagerplaceringer/10_hovedlager_a-01/beholdning`).get()).val(), 74);
assert.equal((await run(functions.procureVareReturneringRegistrer, {
  ordreId: orderId, ordreRevision: 4, returneringId: "return-stock-1", returnDate: "2026-09-18",
  reason: "Beskadiget efter udpakning", lines: [{ orderLineId: "tape", quantity: 1,
    warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01" }],
})).allerede, true);
await assert.rejects(run(functions.procureLagerBevaegelse, {
  forbrugsvareId: "tape", type: "forbrug", requestId: "foreign-tenant-stock", quantity: 1, unit: "ruller",
  warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01", expectedRevision: 5,
}, auth(tenantB, "fremmed-bruger")), (error) => error?.code === "failed-precondition");

/* Forkert magic bytes afvises, slettes og bliver aldrig en aktiv fil. */
const badReceiptId = "receipt-bad";
const badDocumentId = "bad-file";
const badPath = `tenants/${tenantA}/indkoebsordrer/${orderId}/modtagelser/${badReceiptId}/dokumenter/${badDocumentId}`;
await bucket.file(badPath).save(Buffer.from("MZ-malware"), { resumable: false, metadata: { contentType: "application/pdf" } });
await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/modtagelser/${badReceiptId}/dokumenter/${badDocumentId}`).set({
  dokumentId: badDocumentId,
  originaltFilnavn: "forkert.pdf",
  valideretMime: "application/pdf",
  stoerrelse: 10,
  storagePath: badPath,
  uploader: uid,
  oprettetTid: Date.now(),
  status: "karantaene",
});
await assert.rejects(
  run(functions.procureModtagelseUploadBekraeft, {
    ordreId: orderId, modtagelseId: badReceiptId, dokumentId: badDocumentId,
  }),
  (error) => error?.code === "failed-precondition",
);
assert.equal((await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/modtagelser/${badReceiptId}/dokumenter/${badDocumentId}/status`).get()).val(), "afvist");
assert.equal((await bucket.file(badPath).exists())[0], false);

/* Autoriseret Fakturacenter-import: 7.872 kr., 144 kr. afvigelse/kredit. */
const importInvoice = (data) => run(functions.procureFakturaImport, {
  ordreId: orderId, ordreRevision: 4, ...data,
});
const firstInvoice = await importInvoice({
  requestId: "invoice-1", invoiceNumber: "ND-8841", invoiceDate: "2026-09-16", type: "invoice",
  lines: [
    { orderLineId: "tape", quantity: 72, unitPriceOere: 2600 },
    { orderLineId: "film", quantity: 80, unitPriceOere: 7500 },
  ],
});
assert.equal(firstInvoice.beloebOere, 787200);
assert.equal(firstInvoice.prisafvigelseOere, 14400);
assert.equal((await importInvoice({
  requestId: "invoice-1", invoiceNumber: "ND-8841", invoiceDate: "2026-09-16", type: "invoice",
  lines: [
    { orderLineId: "tape", quantity: 72, unitPriceOere: 2600 },
    { orderLineId: "film", quantity: 80, unitPriceOere: 7500 },
  ],
})).allerede, true);
await run(functions.fakturastatus, { fakturaId: firstInvoice.fakturaId, til: "godkendt" });

const credit = await importInvoice({
  requestId: "credit-1", invoiceNumber: "KN-8841", invoiceDate: "2026-09-17", type: "credit-note",
  creditsInvoiceId: firstInvoice.fakturaId,
  lines: [{ orderLineId: "tape", quantity: 72, unitPriceOere: 200 }],
});
assert.equal(credit.beloebOere, 14400);
await run(functions.fakturastatus, { fakturaId: credit.fakturaId, til: "godkendt" });
assert.equal((await db.ref(`tenants/${tenantA}/fakturaer/${firstInvoice.fakturaId}/afvigelsesstatus`).get()).val(), "korrigeret");
assert.equal((await db.ref(`tenants/${tenantA}/forbrugsvarer/tape/lagerplaceringer/10_hovedlager_a-01/beholdning`).get()).val(), 74,
  "prisafvigelseskreditten må ikke ændre fysisk lager");

await run(functions.procureModtagelseRegistrer, {
  ordreId: orderId, modtagelseId: "receipt-2", ordreRevision: 4,
  receivedDate: "2026-09-20", receivedBy: "Lagerbruger", deliveryNote: "FS-4499",
  lines: [{ orderLineId: "tape", deliveredQuantity: 48, damagedQuantity: 0, rejectedQuantity: 0,
    warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01" }],
});
const finalInvoice = await importInvoice({
  requestId: "invoice-2", invoiceNumber: "ND-8892", invoiceDate: "2026-09-21", type: "invoice",
  lines: [{ orderLineId: "tape", quantity: 48, unitPriceOere: 2400 }],
});
assert.equal(finalInvoice.beloebOere, 115200);
await run(functions.fakturastatus, { fakturaId: finalInvoice.fakturaId, til: "godkendt" });
const invoices = (await db.ref(`tenants/${tenantA}/fakturaer`).get()).val();
const netOere = Object.values(invoices).reduce((sum, invoice) =>
  invoice.status !== "godkendt" ? sum
    : sum + (invoice.fakturatype === "credit-note" ? -1 : 1) * Number(invoice.beloebOere || 0), 0);
assert.equal(netOere, 888000);
assert.equal((await db.ref(`tenants/${tenantA}/indkoebsordrer/${orderId}/status`).get()).val(), "modtaget");

console.log(JSON.stringify({
  ok: true,
  handlerFlow: "ordreMailSend → procureModtagelseUploadBekraeft → procureModtagelseRegistrer → procureFakturaImport → fakturastatus",
  ordreOere: 888000,
  modtagetFoersteGangOere: 772800,
  restOere: 115200,
  delFakturaOere: 787200,
  prisafvigelseOere: 14400,
  kreditnotaOere: 14400,
  nettoOere: netOere,
  pdfSha256: mailResult.pdfSha256,
  mailTransportCalls: mailPayloads.length,
  tenantIsolation: "verified",
  qrLabelId: qrCreated.maerkatId,
  qrIdempotency: qrReplay.allerede,
  qrTenantIsolation: "verified",
  receiptReopened: reopened.allerede,
}));
await Promise.all(getApps().map((app) => deleteApp(app)));
