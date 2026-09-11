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

export async function registerPhysicalReturn(input) {
  try {
    const response = await kaldFunktion("procureVareReturneringRegistrer", input);
    return { ok: true, data: response?.data ?? response };
  } catch (error) { return callableFailure(error, "Den fysiske retur kunne ikke registreres. Modtagelsen er uændret."); }
}

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

export async function getWebshopCredential(supplierId) {
  try {
    const response = await kaldFunktion("procureWebshopCredentialHent", { leverandoerId: supplierId });
    return { ok: true, data: response?.data ?? response };
  } catch (error) {
    const code = String(error?.code || "");
    if (code.includes("permission-denied")) return { ok: false, kind: "denied", message: "Kun en ansvarlig indkøber eller administrator må se webshopadgangen." };
    if (code.includes("failed-precondition")) return { ok: false, kind: "missing", message: error?.message || "Webshopadgang er ikke konfigureret." };
    return { ok: false, kind: "error", message: "Webshopadgangen kunne ikke hentes sikkert." };
  }
}

export async function registerWebshopOrder(input) {
  try {
    const response = await kaldFunktion("procureWebshopBestillingRegistrer", input);
    return { ok: true, data: response?.data ?? response };
  } catch (error) {
    const code = String(error?.code || "");
    if (code.includes("permission-denied")) return { ok: false, kind: "denied", message: "Du har ikke rettighed til at registrere webshopbestillingen." };
    if (code.includes("failed-precondition")) return { ok: false, kind: "conflict", message: error?.message || "Bestillingen er ændret eller har allerede en anden bestillingsmetode." };
    return { ok: false, kind: "error", message: "Registreringen kunne ikke bekræftes. Kontrollér Mine indkøb før et nyt forsøg." };
  }
}

function callableFailure(error, fallback) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied") || code.includes("unauthenticated")) return { ok: false, kind: "denied", message: error?.message || "Adgangen blev afvist." };
  if (code.includes("aborted") || code.includes("already-exists")) return { ok: false, kind: "conflict", message: error?.message || "Data er ændret i en anden session. Genindlæs og prøv igen.", current: error?.details?.current || null };
  if (code.includes("invalid-argument") || code.includes("failed-precondition")) return { ok: false, kind: "validation", message: error?.message || fallback };
  return { ok: false, kind: "error", message: fallback };
}

export async function loadMobileDraft() {
  try {
    const response = await kaldFunktion("procureMobilKladdeHent", {});
    return { ok: true, data: response?.data ?? response };
  } catch (error) { return callableFailure(error, "Serverkladden kunne ikke hentes."); }
}

export async function saveMobileDraft({ draft, expectedRevision, mutationId }) {
  try {
    const response = await kaldFunktion("procureMobilKladdeGem", { draft, expectedRevision, mutationId });
    return { ok: true, data: response?.data ?? response };
  } catch (error) { return callableFailure(error, "Serverkladden kunne ikke gemmes. Den lokale kopi er bevaret."); }
}

export async function submitMobileDraftPart({ selections, expectedRevision, requestId }) {
  try {
    const response = await kaldFunktion("procureMobilKladdeDelIndsend", { selections, expectedRevision, requestId });
    return { ok: true, data: response?.data ?? response };
  } catch (error) { return callableFailure(error, "De valgte linjer kunne ikke sendes videre. Kladden er bevaret."); }
}

export async function decideApprovalLineBatch({ approvalId, expectedRevision, decisions, requestId }) {
  try {
    const response = await kaldFunktion("procureGodkendelseslinjerAfgor", { approvalId, expectedRevision, decisions, requestId });
    return { ok: true, data: response?.data ?? response };
  } catch (error) { return callableFailure(error, "Linjeafgørelsen kunne ikke gemmes."); }
}

export async function loadProcureSetup() {
  try { const response = await kaldFunktion("procureOpsaetningHent", {}); return { ok: true, data: response?.data ?? response }; }
  catch (error) { return callableFailure(error, "PROCURE-opsætningen kunne ikke hentes."); }
}

export async function saveProcureMasterData(input) {
  try { const response = await kaldFunktion("procureStamdataGem", input); return { ok: true, data: response?.data ?? response }; }
  catch (error) { return callableFailure(error, "Stamdata kunne ikke gemmes."); }
}

export async function saveProcureBudget(input) {
  try { const response = await kaldFunktion("procureBudgetGem", input); return { ok: true, data: response?.data ?? response }; }
  catch (error) { return callableFailure(error, "Budgettet kunne ikke gemmes."); }
}
