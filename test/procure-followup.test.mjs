import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { sendMail } from "../functions/mail/transport.js";
import {
  byggImporteretFaktura, byggServerModtagelse, byggServerReturnering, modtagetPrLinje,
  nettoFaktureretOere, ordreErFuldtModtaget, serverOrdreLinjer,
} from "../src/fleet/procure-v2/procure-backend-domain.js";
import { createOrderPdfBytes, ordreModtagelsesUrl, ordrePdfStoragePath } from "../src/fleet/procure-v2/procure-pdf.js";
import { receiptValueOere } from "../src/fleet/procure-v2/procure-v2-domain.js";
import { tjekSignatur } from "../src/fleet/dokumenter.js";

const order = () => ({
  id: "ordre-8880", nummer: "BST-2026-00888", leverandoerId: "nordisk",
  status: "godkendt", revision: 4, godkendtRevision: 4, leveringssted: "Hovedlager",
  oensketDato: "2026-09-15", oprettetAf: "bestiller-1",
  linjer: {
    tape: { vare: "Pakketape", antal: 120, enhed: "ruller", prisPrEnhedOere: 2400, forbrugsvareId: "tape", varegruppe: "Emballage" },
    film: { vare: "Strækfilm", antal: 80, enhed: "ruller", prisPrEnhedOere: 7500, forbrugsvareId: "film", varegruppe: "Emballage" },
  },
});

const addReceipt = (ordre, id, input) => {
  const built = byggServerModtagelse(ordre, input, { uid: "lager-1", now: 1789100000000 });
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  ordre.modtagelser = { ...(ordre.modtagelser || {}), [id]: built.receipt };
  return built.receipt;
};

describe("ordre-PDF: preview, transport og arkiv er samme bytekontrakt", () => {
  it("bruger kun en konfigureret offentlig https-adresse til modtagelses-QR", () => {
    const ordre = order();
    assert.equal(ordreModtagelsesUrl(ordre, { procureAppUrl: "http://127.0.0.1:5205" }), null);
    assert.equal(ordreModtagelsesUrl(ordre, { procureAppUrl: "https://kunde.veyro.example/base" }), "https://kunde.veyro.example/indkoeb/mobil/modtag/ordre-8880");
    const withoutQr = createOrderPdfBytes(ordre, {}, {});
    const withQr = createOrderPdfBytes(ordre, {}, { procureAppUrl: "https://kunde.veyro.example" });
    assert.notEqual(createHash("sha256").update(withoutQr).digest("hex"), createHash("sha256").update(withQr).digest("hex"));
  });
  it("er deterministisk, revisionslåst og sendes som faktisk payload", async () => {
    const ordre = order();
    const preview = createOrderPdfBytes(ordre, { navn: "Nordisk Drift" }, { navn: "Syntetisk A/S", fakturaModtagelse: "faktura@example.invalid" });
    const archive = createOrderPdfBytes(ordre, { navn: "Nordisk Drift" }, { navn: "Syntetisk A/S", fakturaModtagelse: "faktura@example.invalid" });
    assert.deepEqual(preview, archive);
    const sha = createHash("sha256").update(preview).digest("hex");
    assert.equal(sha, createHash("sha256").update(archive).digest("hex"));
    assert.equal(ordrePdfStoragePath("tenant-a", ordre.id, 4), "tenants/tenant-a/indkoebsordrer/ordre-8880/revisioner/4/ordre.pdf");
    let payload;
    const sent = await sendMail({ send: async (input) => { payload = input; return { providerId: "test-provider", afsender: "test@example.invalid" }; } }, {
      til: "supplier@example.invalid", emne: ordre.nummer, tekst: "Syntetisk test",
      attachments: [{ filename: `${ordre.nummer}.pdf`, contentType: "application/pdf", bytes: archive }],
    });
    assert.equal(sent.status, "accepteret");
    assert.equal(payload.attachments.length, 1);
    assert.deepEqual(payload.attachments[0].bytes, preview);
    assert.equal(createHash("sha256").update(payload.attachments[0].bytes).digest("hex"), sha);
    const pdfText = Buffer.from(preview).toString("latin1");
    for (const expected of [ordre.nummer, "Pakketape", "120", "24,00", "Straekfilm", "80", "75,00", "8880,00", "Hovedlager"]) {
      assert.match(pdfText, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `PDF mangler ${expected}`);
    }
  });

  it("markerer transporttimeout som ukendt og gør den ikke til accepteret", async () => {
    const error = new Error("forbindelsen lukkede efter POST"); error.resultatUkendt = true;
    const result = await sendMail({ send: async () => { throw error; } }, { til: "x@example.invalid", emne: "x", tekst: "x" });
    assert.equal(result.status, "ukendt");
  });
});

describe("fysisk retur, kreditnota og tilbagebetaling er adskilte hændelser", () => {
  it("tillader retur af modtaget vare til korrekt pris uden at omskrive modtagelsen", () => {
    const ordre = { id: "o-retur", revision: 1, linjer: { tape: { vare: "Pakketape", antal: 10, enhed: "ruller", prisPrEnhedOere: 2400 } }, modtagelser: {
      m1: { status: "registreret", linjer: { tape: { ordrelinjeId: "tape", godkendtAntal: 10 } } },
    } };
    const returned = byggServerReturnering(ordre, { returnDate: "2026-09-22", reason: "Overskydende vare", invoiceId: "invoice-correct", lines: [{ orderLineId: "tape", quantity: 2 }] }, { uid: "lager-1", now: 30 });
    assert.equal(returned.ok, true);
    assert.equal(returned.returned.vaerdiOere, 4800);
    assert.equal(returned.returned.kreditstatus, "afventer-kreditnota");
    assert.equal(modtagetPrLinje(ordre).get("tape"), 10);
  });
});

describe("sammenhængende bestilling → dellevering → faktura → kreditnota", () => {
  it("ender på 8.880 kr. uden dobbeltælling og viser prisafvigelsen 144 kr.", () => {
    const ordre = order();
    assert.equal(serverOrdreLinjer(ordre).reduce((sum, line) => sum + line.antal * line.prisOere, 0), 888000);

    const firstReceipt = addReceipt(ordre, "receipt-1", {
      receivedDate: "2026-09-15", receivedBy: "Lagerbruger", deliveryNote: "FS-4482",
      lines: [
        { orderLineId: "tape", deliveredQuantity: 72, damagedQuantity: 0, rejectedQuantity: 0 },
        { orderLineId: "film", deliveredQuantity: 80, damagedQuantity: 0, rejectedQuantity: 0 },
      ],
    });
    const normalizedReceipt = { lines: Object.values(firstReceipt.linjer).map((line) => ({ orderLineId: line.ordrelinjeId, acceptedQuantity: line.godkendtAntal })) };
    const clientOrder = { lines: serverOrdreLinjer(ordre).map((line) => ({ id: line.id, unitPriceOere: line.prisOere })) };
    assert.equal(receiptValueOere(clientOrder, normalizedReceipt), 772800);
    assert.equal(modtagetPrLinje(ordre).get("tape"), 72);
    assert.equal(120 - modtagetPrLinje(ordre).get("tape"), 48);
    assert.equal((120 - modtagetPrLinje(ordre).get("tape")) * 2400, 115200);
    assert.equal(ordreErFuldtModtaget(ordre), false);

    const firstInvoice = byggImporteretFaktura(ordre, {
      requestId: "invoice-1", invoiceNumber: "ND-8841", invoiceDate: "2026-09-16", type: "invoice",
      lines: [
        { orderLineId: "tape", quantity: 72, unitPriceOere: 2600 },
        { orderLineId: "film", quantity: 80, unitPriceOere: 7500 },
      ],
    }, { uid: "finance-1", now: 1789200000000 });
    assert.equal(firstInvoice.ok, true);
    assert.equal(firstInvoice.invoice.beloebOere, 787200);
    assert.equal(firstInvoice.invoice.prisafvigelseOere, 14400);

    const credit = byggImporteretFaktura(ordre, {
      requestId: "credit-1", invoiceNumber: "KN-8841", invoiceDate: "2026-09-17", type: "credit-note", creditsInvoiceId: "invoice-1",
      lines: [{ orderLineId: "tape", quantity: 72, unitPriceOere: 200 }],
    }, { uid: "finance-1", now: 1789300000000 });
    assert.equal(credit.ok, true);
    assert.equal(credit.invoice.beloebOere, 14400);

    addReceipt(ordre, "receipt-2", {
      receivedDate: "2026-09-20", receivedBy: "Lagerbruger", deliveryNote: "FS-4499",
      lines: [{ orderLineId: "tape", deliveredQuantity: 48, damagedQuantity: 0, rejectedQuantity: 0 }],
    });
    assert.equal(ordreErFuldtModtaget(ordre), true);
    const finalInvoice = byggImporteretFaktura(ordre, {
      requestId: "invoice-2", invoiceNumber: "ND-8892", invoiceDate: "2026-09-21", type: "invoice",
      lines: [{ orderLineId: "tape", quantity: 48, unitPriceOere: 2400 }],
    }, { uid: "finance-1", now: 1789400000000 });
    assert.equal(finalInvoice.invoice.beloebOere, 115200);
    const approved = [firstInvoice.invoice, credit.invoice, finalInvoice.invoice].map((invoice) => ({ ...invoice, status: "godkendt" }));
    assert.equal(nettoFaktureretOere(approved), 888000);
  });
});

describe("backendgrænser og filkontrakt", () => {
  const source = readFileSync("functions/index.js", "utf8");
  it("alle nye callables tager tenant fra den signerede authkontekst", () => {
    for (const name of ["procureModtagelseUploadInitier", "procureModtagelseUploadBekraeft", "procureModtagelseDownloadLink", "procureModtagelseRegistrer", "procureModtagelseKorriger", "procureVareReturneringRegistrer", "procureFakturaImport", "ordrePdfHent"]) {
      const start = source.indexOf(`export const ${name}`); const next = source.indexOf("\nexport const ", start + 1); const block = source.slice(start, next < 0 ? undefined : next);
      assert.ok(start >= 0, `${name} mangler`);
      assert.match(block, /procureDoer\(req,/);
      assert.ok(!/tenantId\s*=\s*(d|req\.data)/.test(block), `${name} tager tenant fra payload`);
    }
  });
  it("modtagelse og import bruger transaktion/idempotens og lukket Storage", () => {
    assert.match(source, /const ordreRef = rod\.child\(`indkoebsordrer\/\$\{ordreId\}`\);[\s\S]*?ordreRef\.transaction/);
    assert.match(source, /const fakturaerRef = rod\.child\("fakturaer"\);[\s\S]*?fakturaerRef\.transaction/);
    assert.match(source, /Fakturanummeret er allerede importeret/);
    const rules = readFileSync("storage.rules", "utf8");
    assert.match(rules, /indkoebsordrer\/\{ordreId\}\/modtagelser/);
    assert.match(rules, /indkoebsordrer\/\{ordreId\}\/revisioner/);
  });
  it("PDF/JPEG/PNG magic bytes håndhæves", () => {
    assert.equal(tjekSignatur(new Uint8Array([0x25,0x50,0x44,0x46,0x2d]), "application/pdf"), true);
    assert.equal(tjekSignatur(new Uint8Array([0x4d,0x5a,0x90]), "application/pdf"), false);
  });
});

describe("mobilindsendelse bevarer kladden og genbruger stabile referencer", () => {
  const mobile = readFileSync("src/fleet/procure-v2/MobileOrderScreen.jsx", "utf8");
  const needs = readFileSync("src/fleet/behov.js", "utf8");
  const orders = readFileSync("src/fleet/bestilling.js", "utf8");
  const backend = readFileSync("functions/index.js", "utf8");

  it("gemmer kladden tenant- og brugerspecifikt lokalt og på serveren", () => {
    assert.match(mobile, /mobile-draft:v1:\$\{scope\}/);
    assert.match(mobile, /submissionId: newSubmissionId\(\)/);
    assert.match(mobile, /submittingRef\.current/);
    assert.match(mobile, /kurven er bevaret/i);
    assert.match(mobile, /loadMobileDraft\(\)/);
    assert.match(mobile, /saveMobileDraft\(\{ draft: snapshot, expectedRevision:/);
    assert.match(mobile, /Synkroniseret/);
  });

  it("sender samme idempotensreference gennem behov og leverandørordre", () => {
    assert.match(mobile, /requestId: draft\.submissionId/);
    assert.match(needs, /requestId: post\.requestId \|\| undefined/);
    assert.match(orders, /requestId: requestId \|\| undefined/);
    assert.match(backend, /indkoebsbehov\/mobil-\$\{requestId\}/);
    assert.match(backend, /procureMobilAnmodninger\/\$\{requestId\}/);
    assert.match(backend, /Bestillingen kan allerede være oprettet\. Kontrollér Mine indkøb/);
  });
});
