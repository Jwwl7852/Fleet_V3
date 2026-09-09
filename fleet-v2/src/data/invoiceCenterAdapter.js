const normalize = (value) => String(value || "").trim().toLocaleUpperCase("da-DK");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const INVOICE_CONTROL_STATUSES = {
  to_control: "Til kontrol",
  controlled: "Kontrolleret",
  rejected: "Afvist",
};

export function hasExactReferenceToken(text, reference) {
  const token = normalize(reference);
  if (!token) return false;
  return new RegExp(`(^|[^A-Z0-9-])${escapeRegExp(token)}([^A-Z0-9-]|$)`, "u").test(normalize(text));
}

export function findCaseForInvoiceEvent(dataset, event) {
  if (event.tenantId !== dataset.tenantId) return { status: "tenant_mismatch", caseItem: null };
  const matches = (dataset.relations.cases || []).filter((item) => hasExactReferenceToken(event.reference || event.referenceText, item.reference));
  if (matches.length !== 1) return { status: matches.length ? "ambiguous" : "not_found", caseItem: null };
  return { status: "matched", caseItem: matches[0] };
}

export function applyInvoiceCenterEvent(dataset, event, options = {}) {
  const required = ["tenantId", "documentId", "allocationId", "reference", "controlStatus", "currency", "netAmountMinor", "version", "idempotencyKey"];
  const missing = required.find((key) => event[key] === undefined || event[key] === null || event[key] === "");
  if (missing) throw new Error(`Fakturahændelsen mangler ${missing}.`);
  if (!Number.isInteger(event.netAmountMinor)) throw new Error("Nettobeløb skal angives i hele øre.");
  if (event.currency !== "DKK") throw new Error("Den lokale adapterfixture understøtter kun DKK.");
  const existingEvents = dataset.relations.invoiceEvents || [];
  if (existingEvents.some((item) => item.idempotencyKey === event.idempotencyKey)) return { dataset, duplicate: true, matched: null };
  const match = findCaseForInvoiceEvent(dataset, event);
  const now = options.now || new Date().toISOString();
  const recorded = { ...structuredClone(event), id: event.id || `invoice-event-${crypto.randomUUID()}`, receivedAt: now, matchStatus: match.status, caseId: match.caseItem?.id || null };
  let allocations = [...(dataset.relations.invoiceAllocations || [])];
  if (match.caseItem) {
    allocations = allocations.map((item) => item.allocationId === event.allocationId && item.version < event.version ? { ...item, superseded: true } : item);
    const latest = allocations.find((item) => item.allocationId === event.allocationId && item.version === event.version);
    if (!latest) allocations.push({ ...recorded, caseId: match.caseItem.id, unitId: event.unitId || match.caseItem.unitId, vendorId: event.vendorId || match.caseItem.vendorId || null, superseded: false });
  }
  const cases = (dataset.relations.cases || []).map((item) => item.id === match.caseItem?.id && item.closureStatus === "closed" ? { ...item, invoiceResolution: "review_required", updatedAt: now } : item);
  return { dataset: { ...dataset, relations: { ...dataset.relations, cases, invoiceEvents: [...existingEvents, recorded], invoiceAllocations: allocations } }, duplicate: false, matched: match.caseItem || null, event: recorded };
}

export function createLocalInvoiceCenterAdapter() {
  return {
    kind: "local-fixture-adapter",
    connected: false,
    async send() { throw new Error("Fakturacenter er ikke tilsluttet."); },
    applyFixture: applyInvoiceCenterEvent,
  };
}

export const invoiceCenterFixtures = {
  controlled: (reference, overrides = {}) => ({ tenantId: "tenant-demo-nordic", documentId: "doc-invoice-001", allocationId: "alloc-001", reference, controlStatus: "controlled", currency: "DKK", netAmountMinor: 125000, version: 1, idempotencyKey: "fixture-controlled-001", revision: { number: 1, at: "2026-09-07T10:00:00.000Z" }, ...overrides }),
  partial: (reference, overrides = {}) => ({ tenantId: "tenant-demo-nordic", documentId: "doc-partial-001", allocationId: "alloc-partial-001", reference, controlStatus: "to_control", currency: "DKK", netAmountMinor: 75000, version: 1, idempotencyKey: "fixture-partial-001", revision: { number: 1, at: "2026-09-07T10:00:00.000Z" }, ...overrides }),
  credit: (reference, overrides = {}) => ({ tenantId: "tenant-demo-nordic", documentId: "doc-credit-001", allocationId: "alloc-credit-001", reference, controlStatus: "controlled", currency: "DKK", netAmountMinor: -25000, version: 1, idempotencyKey: "fixture-credit-001", revision: { number: 1, at: "2026-09-07T10:00:00.000Z" }, ...overrides }),
};
