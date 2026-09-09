import { DEMO_ACTORS } from "./caseWorkflow";

const clone = (value) => structuredClone(value);
const uid = () => crypto.randomUUID();
const digits = (value) => String(value || "").replace(/\D/g, "");

export const CASE_CLOSURE_STATES = {
  open: "Åben",
  closed: "Lukket",
};

export const INVOICE_RESOLUTION_STATES = {
  disconnected: "Fakturacenter er ikke tilsluttet",
  pending: "Afventer fakturaafklaring",
  partial: "Delvist afklaret",
  cleared: "Fakturaer kontrolleret",
  no_invoice: "Lukket uden faktura",
  review_required: "Kræver ny afklaring",
};

export function deterministicCaseReference(caseItem, used = new Set()) {
  if (caseItem.reference) return caseItem.reference;
  const year = new Date(caseItem.createdAt || Date.now()).getUTCFullYear();
  const baseNumber = digits(caseItem.number).slice(-5).padStart(5, "0") || "00001";
  let reference = `VYR-${year}-${baseNumber}`;
  let suffix = 1;
  while (used.has(reference)) reference = `VYR-${year}-${baseNumber}-${suffix++}`;
  return reference;
}

export function ensureCaseFolderRelations(dataset) {
  const relations = dataset.relations || {};
  const used = new Set((relations.cases || []).map((item) => item.reference).filter(Boolean));
  const cases = (relations.cases || []).map((item) => {
    const reference = deterministicCaseReference(item, used);
    used.add(reference);
    return {
      ...item,
      reference,
      historicalReferences: item.historicalReferences || (item.number && item.number !== reference ? [item.number] : []),
      closureStatus: item.closureStatus || (item.status === "completed" ? "closed" : "open"),
      invoiceResolution: item.invoiceResolution || "disconnected",
      expectedInvoiceCount: Number.isInteger(item.expectedInvoiceCount) ? item.expectedInvoiceCount : 0,
    };
  });
  const caseById = new Map(cases.map((item) => [item.id, item]));
  const reports = (relations.reports || []).map((item) => ({ ...item, reference: item.reference || caseById.get((relations.cases || []).find((entry) => entry.reportId === item.id)?.id)?.reference || null }));
  const workshopTasks = (relations.workshopTasks || []).map((item) => ({ ...item, reference: item.reference || caseById.get(item.caseId)?.reference || null }));
  return {
    ...dataset,
    relations: {
      ...relations,
      cases,
      reports,
      workshopTasks,
      reportDrafts: relations.reportDrafts || [],
      workshopOrders: relations.workshopOrders || [],
      orderEvents: relations.orderEvents || [],
      invoiceEvents: relations.invoiceEvents || [],
      invoiceAllocations: relations.invoiceAllocations || [],
      evidenceSnapshots: relations.evidenceSnapshots || [],
      closureEvents: relations.closureEvents || [],
    },
  };
}

export function nextReadableReference(dataset, prefix = "VYR", options = {}) {
  const now = options.now || new Date().toISOString();
  const year = new Date(now).getUTCFullYear();
  const existing = new Set([
    ...(dataset.relations.cases || []).map((item) => item.reference),
    ...(dataset.relations.reportDrafts || []).map((item) => item.reference),
  ].filter(Boolean));
  let sequence = (dataset.relations.cases || []).length + (dataset.relations.reportDrafts || []).length + 1;
  let candidate;
  do candidate = `${prefix}-${year}-${String(sequence++).padStart(5, "0")}`; while (existing.has(candidate));
  return candidate;
}

export function applyReportDraftSave(dataset, input, options = {}) {
  const now = options.now || new Date().toISOString();
  const drafts = [...(dataset.relations.reportDrafts || [])];
  const index = input.draftId || input.draftClientId ? drafts.findIndex((item) => item.id === input.draftId || item.draftClientId === input.draftClientId) : -1;
  const current = index >= 0 ? drafts[index] : null;
  const draft = {
    ...clone(input),
    id: current?.id || `draft-${options.id || uid()}`,
    tenantId: dataset.tenantId,
    reference: current?.reference || input.reference || nextReadableReference(dataset, "VYR", { now }),
    status: "draft",
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  if (index >= 0) drafts[index] = draft; else drafts.push(draft);
  return { dataset: { ...dataset, relations: { ...dataset.relations, reportDrafts: drafts } }, draft };
}

export function applyManualCaseCreation(dataset, input, actor = DEMO_ACTORS[1], options = {}) {
  if (!input.unitId) throw new Error("Vælg en enhed.");
  if (!input.title?.trim()) throw new Error("Angiv en sagstitel.");
  const now = options.now || new Date().toISOString();
  const reference = nextReadableReference(dataset, "VYR", { now });
  const id = `case-${options.id || uid()}`;
  const caseItem = {
    id, tenantId: dataset.tenantId, reference,
    number: `SAG-${String((dataset.relations.cases || []).length + 1).padStart(5, "0")}`,
    historicalReferences: [], reportId: null, unitId: input.unitId,
    title: input.title.trim(), description: input.description?.trim() || "",
    status: "assessing", closureStatus: "open", invoiceResolution: "disconnected", expectedInvoiceCount: 0,
    priority: input.priority || "normal", assigneeId: actor.id, nextAction: input.nextAction?.trim() || "Vurder manuel sag",
    dueDate: input.dueDate || null, manual: true, createdAt: now, updatedAt: now,
  };
  const event = { id: `event-${uid()}`, tenantId: dataset.tenantId, caseId: id, unitId: input.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "created", title: "Manuel sag oprettet", text: `${reference} blev oprettet uden forudgående indberetning.` };
  return { dataset: { ...dataset, relations: { ...dataset.relations, cases: [...(dataset.relations.cases || []), caseItem], caseEvents: [...(dataset.relations.caseEvents || []), event] } }, caseItem, event };
}

export function nextWorkshopOrderReference(dataset, now = new Date().toISOString()) {
  const year = new Date(now).getUTCFullYear();
  const existing = new Set([
    ...(dataset.relations.workshopOrders || []).map((item) => item.reference),
    ...(dataset.relations.serviceOccurrences || []).map((item) => item.orderReference),
  ].filter(Boolean));
  let sequence = existing.size + 1;
  let candidate;
  do candidate = `BST-${year}-${String(sequence++).padStart(5, "0")}`; while (existing.has(candidate));
  return candidate;
}

export function buildWorkshopMail({ caseItem, unit, orderReference, mode, workDescription, vendorContact }) {
  const action = mode === "quote" ? "Anmodning om tilbud" : "Bestilling af værkstedsarbejde";
  const registration = unit.registration || "ikke oplyst";
  const resolvedOrderReference = orderReference || caseItem.orderReference || caseItem.reference;
  return {
    subject: `${action} · ${resolvedOrderReference} · ${unit.number}`,
    body: `Hej${vendorContact ? ` ${vendorContact}` : ""}\n\n${mode === "quote" ? "Vi ønsker et tilbud på" : "Vi ønsker at bestille"} følgende arbejde:\n${workDescription || caseItem.description || caseItem.title}\n\nEnhed: ${unit.number}\nMærke/model: ${unit.make} ${unit.model}\nRegistrering: ${registration}\nØnsket tidspunkt: ${caseItem.dueDate || "aftales nærmere"}\nVeyro-reference: ${caseItem.reference}\nBestillingsreference: ${resolvedOrderReference}\n\nAnfør venligst Veyro-referencen på tilbud, ordrebekræftelse og eventuel faktura.\n\nVenlig hilsen\nVeyro FLEET (lokal prototype)`,
  };
}

export function applyWorkshopOrderSave(dataset, caseId, input, actor = DEMO_ACTORS[1], options = {}) {
  const caseItem = (dataset.relations.cases || []).find((item) => item.id === caseId);
  if (!caseItem) throw new Error("Sagen findes ikke.");
  if (!input.workshopId) throw new Error("Vælg et værksted eller en leverandør.");
  if (!input.recipient?.trim() && input.communicationMode !== "no_mail") throw new Error("Angiv en modtager til mailudkastet.");
  if (input.communicationMode === "no_mail" && !input.noMailReason?.trim()) throw new Error("Gem uden mail kræver en kort bemærkning.");
  const now = options.now || new Date().toISOString();
  const report = (dataset.relations.reports || []).find((item) => item.id === caseItem.reportId);
  const task = input.taskId ? (dataset.relations.workshopTasks || []).find((item) => item.id === input.taskId) : null;
  const allowedAttachmentIds = new Set([...(report?.images || []), ...(report?.media || []), ...(task?.beforeImages || []), ...(task?.afterImages || [])].map((item) => item.id));
  const orders = [...(dataset.relations.workshopOrders || [])];
  const index = input.id || input.clientOrderId ? orders.findIndex((item) => item.id === input.id || item.clientOrderId === input.clientOrderId) : -1;
  const current = index >= 0 ? orders[index] : null;
  const order = {
    ...clone(input), id: current?.id || `order-${options.id || uid()}`, tenantId: dataset.tenantId, caseId,
    unitId: caseItem.unitId, taskId: input.taskId || current?.taskId || null,
    caseReference: caseItem.reference, reference: current?.reference || input.orderReference || caseItem.orderReference || nextWorkshopOrderReference(dataset, now),
    version: (current?.version || 0) + 1,
    deliveryState: "draft", sentAt: null,
    selectedAttachmentIds: [...new Set(input.selectedAttachmentIds || [])].filter((id) => allowedAttachmentIds.has(id)),
    createdAt: current?.createdAt || now, updatedAt: now,
  };
  if (index >= 0) orders[index] = order; else orders.push(order);
  const event = { id: `order-event-${uid()}`, tenantId: dataset.tenantId, caseId, orderId: order.id, unitId: order.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "draft", title: input.communicationMode === "no_mail" ? "Værkstedsvalg gemt uden mail" : "Mailudkast gemt", text: input.communicationMode === "no_mail" ? input.noMailReason.trim() : `${order.reference} version ${order.version} blev gemt som kladde. Intet er sendt.` };
  const cases = (dataset.relations.cases || []).map((item) => item.id === caseId ? { ...item, vendorId: input.workshopId, expectedInvoiceCount: input.mode === "order" ? Math.max(1, item.expectedInvoiceCount || 0) : item.expectedInvoiceCount, invoiceResolution: input.mode === "order" ? "pending" : item.invoiceResolution, updatedAt: now } : item);
  return { dataset: { ...dataset, relations: { ...dataset.relations, cases, workshopOrders: orders, orderEvents: [...(dataset.relations.orderEvents || []), event] } }, order, event };
}

export function invoiceResolutionForCase(dataset, caseItem) {
  if (caseItem.invoiceWaiver?.active) return "no_invoice";
  const controlled = (dataset.relations.invoiceAllocations || []).filter((item) => item.caseId === caseItem.id && item.controlStatus === "controlled" && !item.superseded);
  if (!caseItem.expectedInvoiceCount) return caseItem.invoiceResolution === "disconnected" ? "disconnected" : "cleared";
  const documents = new Set(controlled.map((item) => item.documentId));
  if (documents.size >= caseItem.expectedInvoiceCount) return "cleared";
  if (documents.size) return "partial";
  return caseItem.invoiceResolution === "review_required" ? "review_required" : "pending";
}

export function validateCaseClosure(dataset, caseId, input) {
  const errors = {};
  const caseItem = (dataset.relations.cases || []).find((item) => item.id === caseId);
  if (!caseItem) return { caseId: "Sagen findes ikke." };
  const activeTasks = (dataset.relations.workshopTasks || []).filter((item) => item.caseId === caseId && !["completed", "cancelled"].includes(item.status));
  if (activeTasks.length) errors.tasks = "Alle værkstedsopgaver skal være afklaret før sagen kan lukkes.";
  if (!input.confirmClosure) errors.confirmClosure = "Bekræft, at sagen kan lukkes.";
  if (input.mode === "no_invoice") {
    if (!input.reason?.trim()) errors.reason = "Lukning uden faktura kræver en begrundelse.";
  } else if (invoiceResolutionForCase(dataset, caseItem) !== "cleared") {
    errors.invoice = "Alle forventede fakturaer skal være kontrolleret i Fakturacenter før normal lukning.";
  }
  return errors;
}

export function applyCaseClosure(dataset, caseId, input, actor = DEMO_ACTORS[1], options = {}) {
  const errors = validateCaseClosure(dataset, caseId, input);
  if (Object.keys(errors).length) { const error = new Error(Object.values(errors)[0]); error.validation = errors; throw error; }
  const now = options.now || new Date().toISOString();
  const cases = [...(dataset.relations.cases || [])];
  const index = cases.findIndex((item) => item.id === caseId);
  const current = cases[index];
  const next = { ...current, status: "completed", closureStatus: "closed", closedAt: now, closedBy: actor.id, closureReason: input.reason?.trim() || "Arbejdet og fakturagrundlaget er afklaret.", invoiceResolution: input.mode === "no_invoice" ? "no_invoice" : "cleared", invoiceWaiver: input.mode === "no_invoice" ? { active: true, reason: input.reason.trim(), at: now, actorId: actor.id } : current.invoiceWaiver, updatedAt: now };
  cases[index] = next;
  const event = { id: `closure-${uid()}`, tenantId: dataset.tenantId, caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "closed", title: input.mode === "no_invoice" ? "Sag lukket uden faktura" : "Sag lukket", text: next.closureReason };
  return { dataset: { ...dataset, relations: { ...dataset.relations, cases, closureEvents: [...(dataset.relations.closureEvents || []), event], caseEvents: [...(dataset.relations.caseEvents || []), event] } }, caseItem: next, event };
}

export function applyCaseReopen(dataset, caseId, reason, actor = DEMO_ACTORS[1], options = {}) {
  if (!reason?.trim()) throw new Error("Genåbning kræver en begrundelse.");
  const now = options.now || new Date().toISOString();
  const cases = [...(dataset.relations.cases || [])];
  const index = cases.findIndex((item) => item.id === caseId);
  if (index < 0) throw new Error("Sagen findes ikke.");
  const current = cases[index];
  if (current.closureStatus !== "closed") throw new Error("Kun en lukket sag kan genåbnes.");
  const next = { ...current, status: "assessing", closureStatus: "open", reopenedAt: now, reopenReason: reason.trim(), invoiceResolution: current.invoiceResolution === "cleared" ? "review_required" : current.invoiceResolution, updatedAt: now };
  cases[index] = next;
  const event = { id: `closure-${uid()}`, tenantId: dataset.tenantId, caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "reopened", title: "Sag genåbnet", text: reason.trim() };
  return { dataset: { ...dataset, relations: { ...dataset.relations, cases, closureEvents: [...(dataset.relations.closureEvents || []), event], caseEvents: [...(dataset.relations.caseEvents || []), event] } }, caseItem: next, event };
}

export function saveEvidenceSnapshot(dataset, caseId, input, actor = DEMO_ACTORS[1], options = {}) {
  const caseItem = (dataset.relations.cases || []).find((item) => item.id === caseId);
  if (!caseItem) throw new Error("Sagen findes ikke.");
  const now = options.now || new Date().toISOString();
  const snapshot = { id: `evidence-${options.id || uid()}`, tenantId: dataset.tenantId, caseId, unitId: caseItem.unitId, source: input.source || "manual", occurredAt: input.occurredAt || null, measuredAt: input.measuredAt || null, receivedAt: input.receivedAt || now, position: input.position || null, accuracyMeters: input.accuracyMeters ?? null, meter: input.meter || null, speedKph: input.speedKph ?? null, faultCodes: input.faultCodes || [], originalMeasurement: clone(input.originalMeasurement || null), manualSupplement: clone(input.manualSupplement || null), createdAt: now, actorId: actor.id };
  return { dataset: { ...dataset, relations: { ...dataset.relations, evidenceSnapshots: [...(dataset.relations.evidenceSnapshots || []), snapshot] } }, snapshot };
}

export function actualExternalCost(dataset, caseId) {
  return (dataset.relations.invoiceAllocations || []).filter((item) => item.caseId === caseId && item.controlStatus === "controlled" && !item.superseded).reduce((sum, item) => sum + item.netAmountMinor, 0) / 100;
}
