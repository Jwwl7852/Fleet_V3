import { kaldFunktion } from "../../firebase.js";
import { buildReceipt } from "./procure-v2-domain.js";

export async function registerReceipt({ order, receipts, input, actorId, demo }) {
  const built = buildReceipt(order, receipts, input, { actorId });
  if (!built.ok) return { ok: false, kind: "validation", errors: built.errors };
  if (demo) return { ok: true, kind: "test-adapter", receipt: built.receipt };
  try {
    const response = await kaldFunktion("procureModtagelseRegistrer", {
      orderId: order.id,
      lines: built.receipt.lines.map(({ orderLineId, deliveredQuantity, damagedQuantity, rejectedQuantity }) => ({ orderLineId, deliveredQuantity, damagedQuantity, rejectedQuantity })),
      receivedDate: built.receipt.receivedDate,
      receivedBy: built.receipt.receivedBy,
      deliveryNote: built.receipt.deliveryNote || undefined,
      note: built.receipt.note || undefined,
      attachmentIds: built.receipt.attachments.map((item) => item.id).filter(Boolean),
      correctionOf: built.receipt.correctionOf || undefined,
    });
    return { ok: true, kind: "server", receipt: response?.data ?? response };
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
  persistence: "indkoebsmodtagelser/{receiptId}",
  attachments: "server-validated attachmentIds",
});
