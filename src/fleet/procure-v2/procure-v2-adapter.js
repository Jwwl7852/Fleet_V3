import { kaldFunktion } from "../../firebase.js";
import { buildReceipt } from "./procure-v2-domain.js";

export async function registerReceipt({ order, receipts, input, actorId, demo }) {
  const built = buildReceipt(order, receipts, input, { actorId });
  if (!built.ok) return { ok: false, kind: "validation", errors: built.errors };
  if (demo) return { ok: true, kind: "test-adapter", receipt: built.receipt };
  const modtagelseId = input.requestId || globalThis.crypto?.randomUUID?.() || `modtagelse-${Date.now()}`;
  try {
    const uploaded = [];
    for (const file of input.attachments || []) {
      const init = await kaldFunktion("procureModtagelseUploadInitier", {
        ordreId: order.id, modtagelseId, ordreRevision: order.revision,
        originaltFilnavn: file.name, mimeType: file.type, stoerrelse: file.size,
      });
      const meta = init?.data ?? init;
      const upload = await fetch(meta.uploadUrl, {
        method: "PUT", headers: { "Content-Type": file.type }, body: file,
      });
      if (!upload.ok) throw new Error(`Upload fejlede med HTTP ${upload.status}.`);
      const confirmed = await kaldFunktion("procureModtagelseUploadBekraeft", {
        ordreId: order.id, modtagelseId, dokumentId: meta.dokumentId,
      });
      uploaded.push({ ...meta, ...(confirmed?.data ?? confirmed) });
    }
    const response = await kaldFunktion("procureModtagelseRegistrer", {
      ordreId: order.id, modtagelseId, ordreRevision: order.revision,
      lines: built.receipt.lines.map(({ orderLineId, deliveredQuantity, damagedQuantity, rejectedQuantity }) => ({ orderLineId, deliveredQuantity, damagedQuantity, rejectedQuantity })),
      receivedDate: built.receipt.receivedDate,
      receivedBy: built.receipt.receivedBy,
      deliveryNote: built.receipt.deliveryNote || undefined,
      note: built.receipt.note || undefined,
    });
    return { ok: true, kind: "server", receipt: response?.data ?? response, attachments: uploaded };
  } catch (error) {
    const code = String(error?.code || "");
    if (code.includes("not-found") || code.includes("unimplemented")) {
      return { ok: false, kind: "not-connected", message: "Modtagelses-API'et er ikke tilsluttet i dette miljø. Ingen modtagelse er registreret." };
    }
    if (code.includes("permission-denied")) return { ok: false, kind: "denied", message: "Du har ikke rettighed til at registrere modtagelsen." };
    return { ok: false, kind: "error", message: "Modtagelsen kunne ikke gemmes. Ingen data er ændret." };
  }
}

export const RECEIPT_CONTRACT = Object.freeze({
  callable: "procureModtagelseRegistrer",
  tenantSource: "signed auth token",
  requiredPermission: "indkoeb.skriv",
  persistence: "indkoebsordrer/{orderId}/modtagelser/{receiptId}",
  attachments: "signed upload URL → magic-byte validation → active attachment",
});

export async function getOrderPdf(orderId) {
  const response = await kaldFunktion("ordrePdfHent", { ordreId: orderId });
  return response?.data ?? response;
}

export async function getReceiptAttachment({ orderId, receiptId, attachmentId }) {
  const response = await kaldFunktion("procureModtagelseDownloadLink", {
    ordreId: orderId, modtagelseId: receiptId, dokumentId: attachmentId,
  });
  return response?.data ?? response;
}

export async function resolveQrLabel(labelId) {
  try {
    const response = await kaldFunktion("procureQrMaerkatHent", { maerkatId: labelId });
    return { ok: true, data: response?.data ?? response };
  } catch (error) {
    const code = String(error?.code || "");
    if (code.includes("permission-denied")) return { ok: false, kind: "denied", message: "Du har ikke adgang til varen på denne QR-kode." };
    if (code.includes("not-found")) return { ok: false, kind: "not-found", message: "QR-koden er ukendt eller tilhører en anden kunde." };
    if (code.includes("failed-precondition")) return { ok: false, kind: "inactive", message: "QR-koden eller varen er deaktiveret." };
    return { ok: false, kind: "error", message: "QR-koden kunne ikke hentes. Kontrollér forbindelsen og prøv igen." };
  }
}

export async function createQrLabel({ itemId, location, requestId }) {
  try {
    const response = await kaldFunktion("procureQrMaerkatOpret", {
      vareId: itemId, placering: location, requestId,
    });
    return { ok: true, data: response?.data ?? response };
  } catch (error) {
    const code = String(error?.code || "");
    if (code.includes("permission-denied")) return { ok: false, message: "Du har ikke rettighed til at oprette QR-mærkater." };
    return { ok: false, message: error?.message || "QR-mærkatet kunne ikke oprettes." };
  }
}

export async function listQrLabels() {
  try {
    const response = await kaldFunktion("procureQrMaerkatListe", {});
    return { ok: true, data: response?.data ?? response };
  } catch (error) {
    return { ok: false, message: error?.message || "QR-mærkaterne kunne ikke indlæses." };
  }
}

export async function setQrLabelActive({ labelId, active }) {
  try {
    const response = await kaldFunktion("procureQrMaerkatStatus", { maerkatId: labelId, aktiv: active });
    return { ok: true, data: response?.data ?? response };
  } catch (error) {
    return { ok: false, message: error?.message || "QR-mærkatets status kunne ikke ændres." };
  }
}
