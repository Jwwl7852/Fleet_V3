export const DEMO_ACTORS = [
  { id: "demo-mette", name: "Mette Larsen", role: "Demo-indberetter" },
  { id: "demo-lars", name: "Lars Hansen", role: "Demo-disponent" },
  { id: "demo-sara", name: "Sara Nielsen", role: "Demo-flådeansvarlig" },
];

export const REPORT_TYPES = {
  damage: "Skade",
  fault: "Teknisk fejl",
  service: "Servicebehov",
};

export const SEVERITIES = {
  low: "Lav",
  moderate: "Moderat",
  high: "Høj",
  critical: "Kritisk",
};

export const CASE_PRIORITIES = {
  low: "Lav",
  normal: "Normal",
  high: "Høj",
  critical: "Kritisk",
};

export const CASE_STATUSES = {
  new: "Ny",
  assessing: "Under vurdering",
  waiting: "Afventer oplysninger",
  ready: "Klar til værksted",
  workshop: "På værksted",
  invoice_pending: "Afventer faktura",
  ready_to_close: "Klar til lukning",
  completed: "Afsluttet",
  rejected: "Afvist",
};

export const USABILITY = {
  usable: "Kan bruges",
  blocked: "Kan ikke bruges",
  uncertain: "Usikker",
};

export const ALLOWED_TRANSITIONS = {
  new: ["assessing", "rejected"],
  assessing: ["new", "waiting", "ready", "rejected"],
  waiting: ["assessing", "ready", "rejected"],
  ready: ["assessing", "rejected"],
  workshop: [],
  invoice_pending: [],
  ready_to_close: [],
  completed: ["assessing"],
  rejected: ["assessing"],
};

const openStatuses = new Set(["new", "assessing", "waiting", "ready", "workshop", "invoice_pending", "ready_to_close"]);
export const isOpenCase = (item) => openStatuses.has(item.status);

export function validateTransition(item, toStatus, details = {}, report = null) {
  if (toStatus === item.status) return {};
  const errors = {};
  if (!ALLOWED_TRANSITIONS[item.status]?.includes(toStatus)) errors.status = `Skift fra ${CASE_STATUSES[item.status]} til ${CASE_STATUSES[toStatus]} er ikke tilladt.`;
  if (toStatus === "rejected" && !details.reason?.trim()) errors.reason = "Afvisning kræver en begrundelse.";
  if (toStatus === "completed" && !details.resolution?.trim()) errors.resolution = "Afslutning kræver en beskrivelse af løsningen.";
  if (["completed", "rejected"].includes(item.status) && toStatus === "assessing" && !details.reason?.trim()) errors.reason = "Genåbning kræver en begrundelse.";
  if (report?.usability === "blocked" && ["completed", "rejected"].includes(toStatus) && details.releaseBlock && !details.releaseReason?.trim()) errors.releaseReason = "Ophævelse af spærringen kræver en begrundelse.";
  return errors;
}

export function deriveUnitUsability(unitId, reports = [], cases = [], workshopTasks = []) {
  const physicalTask = workshopTasks.find((item) => item.unitId === unitId && ["in_progress", "waiting_parts"].includes(item.status));
  if (physicalTask) return { value: "blocked", label: USABILITY.blocked, tone: "danger", caseId: physicalTask.caseId, taskId: physicalTask.id };
  const linked = reports.map((report) => ({ report, item: cases.find((entry) => entry.reportId === report.id) }))
    .filter(({ report, item }) => report.unitId === unitId && item);
  const blocking = linked.find(({ report, item }) => report.usability === "blocked" && !item.blockReleasedAt);
  if (blocking) return { value: "blocked", label: USABILITY.blocked, tone: "danger", caseId: blocking.item.id };
  const uncertain = linked.find(({ report, item }) => report.usability === "uncertain" && isOpenCase(item));
  if (uncertain) return { value: "uncertain", label: USABILITY.uncertain, tone: "warning", caseId: uncertain.item.id };
  return { value: "usable", label: USABILITY.usable, tone: "success", caseId: null };
}

export function filterAndSortCases(cases, reports, units, filters = {}) {
  const query = (filters.query || "").trim().toLocaleLowerCase("da-DK");
  const result = cases.filter((item) => {
    const report = reports.find((entry) => entry.id === item.reportId);
    const unit = units.find((entry) => entry.id === item.unitId);
    const haystack = [item.reference, item.number, item.title, item.description, report?.number, report?.title, unit?.number, unit?.registration, unit?.make, unit?.model].filter(Boolean).join(" ").toLocaleLowerCase("da-DK");
    return (!query || haystack.includes(query))
      && (!filters.status || item.status === filters.status)
      && (!filters.priority || item.priority === filters.priority)
      && (!filters.assigneeId || item.assigneeId === filters.assigneeId)
      && (!filters.type || report?.type === filters.type)
      && (!filters.severity || report?.severity === filters.severity)
      && (!filters.department || unit?.department === filters.department)
      && (!filters.unitId || item.unitId === filters.unitId);
  });
  return [...result].sort((left, right) => {
    if (filters.sort === "priority") {
      const rank = { critical: 0, high: 1, normal: 2, low: 3 };
      return (rank[left.priority] ?? 9) - (rank[right.priority] ?? 9) || right.createdAt.localeCompare(left.createdAt);
    }
    if (filters.sort === "due") return (left.dueDate || "9999").localeCompare(right.dueDate || "9999");
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export function createReportRecords(dataset, input, options = {}) {
  const now = options.now || new Date().toISOString();
  const random = options.id || crypto.randomUUID();
  const reportId = `report-${random}`;
  const caseId = `case-${random}`;
  const sequence = (dataset.relations.reports || []).length + 1;
  const existingReferences = new Set([...(dataset.relations.cases || []), ...(dataset.relations.reportDrafts || [])].map((item) => item.reference).filter(Boolean));
  let referenceSequence = (dataset.relations.cases || []).length + (dataset.relations.reportDrafts || []).length + 1;
  let reference = input.reference;
  while (!reference || existingReferences.has(reference) && reference !== input.reference) reference = `VYR-${new Date(now).getUTCFullYear()}-${String(referenceSequence++).padStart(5, "0")}`;
  const report = {
    id: reportId,
    tenantId: dataset.tenantId,
    number: `IND-${String(sequence).padStart(5, "0")}`,
    reference,
    unitId: input.unitId,
    type: input.type,
    category: input.category.trim(),
    severity: input.severity,
    title: input.title.trim(),
    description: input.description.trim(),
    images: input.images || [],
    media: input.media || [],
    incident: input.type === "damage" ? input.incident || null : null,
    clientSubmissionId: input.clientSubmissionId || null,
    meterObservation: input.meterObservation,
    usability: input.usability,
    reporterId: input.reporterId,
    reporterName: input.reporterName,
    origin: input.origin || "manual_local_prototype",
    createdAt: now,
  };
  const item = {
    id: caseId,
    tenantId: dataset.tenantId,
    number: `SAG-${String(sequence).padStart(5, "0")}`,
    reference,
    historicalReferences: [],
    reportId,
    unitId: input.unitId,
    status: "new",
    closureStatus: "open",
    invoiceResolution: "disconnected",
    expectedInvoiceCount: 0,
    priority: input.severity === "critical" ? "critical" : input.severity === "high" ? "high" : "normal",
    assigneeId: null,
    nextAction: "Vurder indberetningen",
    dueDate: null,
    createdAt: now,
    updatedAt: now,
  };
  const event = {
    id: `event-${random}-created`, tenantId: dataset.tenantId, reportId, caseId, unitId: input.unitId,
    at: now, actorId: input.reporterId, actorName: input.reporterName,
    type: "created", title: "Indberetning oprettet", text: `${report.number} og ${item.number} blev oprettet som ét lokalt forløb.`,
  };
  return { report, caseItem: item, event };
}

export function applyReportSubmission(dataset, input, options) {
  const duplicate = input.clientSubmissionId && (dataset.relations.reports || []).find((item) => item.clientSubmissionId === input.clientSubmissionId);
  if (duplicate) {
    const caseItem = (dataset.relations.cases || []).find((item) => item.reportId === duplicate.id);
    return { dataset, report: duplicate, caseItem, duplicate: true };
  }
  const records = createReportRecords(dataset, input, options);
  const reportDrafts = input.draftId ? (dataset.relations.reportDrafts || []).filter((item) => item.id !== input.draftId) : (dataset.relations.reportDrafts || []);
  return {
    dataset: {
      ...dataset,
      relations: {
        ...dataset.relations,
        reports: [...(dataset.relations.reports || []), records.report],
        cases: [...(dataset.relations.cases || []), records.caseItem],
        caseEvents: [...(dataset.relations.caseEvents || []), records.event],
        reportDrafts,
      },
    },
    ...records,
  };
}

export function applyCaseChange(dataset, caseId, change, actor = DEMO_ACTORS[1], options = {}) {
  const cases = dataset.relations.cases || [];
  const index = cases.findIndex((item) => item.id === caseId);
  if (index < 0) throw new Error("Sagen findes ikke.");
  const current = cases[index];
  if (change.expectedStatus && current.status !== change.expectedStatus) {
    throw new Error(`Sagen er ændret i en anden visning og står nu som ${CASE_STATUSES[current.status]}. Genindlæs og prøv igen.`);
  }
  if (current.closureStatus === "closed" && change.status) throw new Error("En lukket sag kan kun genåbnes eksplicit fra sagsmappen.");
  const report = (dataset.relations.reports || []).find((item) => item.id === current.reportId);
  const errors = change.status ? validateTransition(current, change.status, change, report) : {};
  if (Object.keys(errors).length) {
    const error = new Error(Object.values(errors)[0]);
    error.validation = errors;
    throw error;
  }
  const now = options.now || new Date().toISOString();
  const next = {
    ...current,
    priority: change.priority ?? current.priority,
    assigneeId: change.assigneeId === undefined ? current.assigneeId : change.assigneeId,
    nextAction: change.nextAction === undefined ? current.nextAction : change.nextAction.trim(),
    dueDate: change.dueDate === undefined ? current.dueDate : change.dueDate || null,
    status: change.status || current.status,
    resolution: change.resolution?.trim() || current.resolution,
    rejectionReason: change.status === "rejected" ? change.reason.trim() : current.rejectionReason,
    reopenReason: ["completed", "rejected"].includes(current.status) && change.status === "assessing" ? change.reason.trim() : current.reopenReason,
    blockReleasedAt: change.releaseBlock ? now : current.blockReleasedAt,
    blockReleaseReason: change.releaseBlock ? change.releaseReason.trim() : current.blockReleaseReason,
    updatedAt: now,
  };
  const changedFields = ["priority", "assigneeId", "nextAction", "dueDate"].filter((key) => next[key] !== current[key]);
  const isStatus = next.status !== current.status;
  const note = change.internalNote?.trim();
  const events = [];
  if (isStatus) events.push({ id: `event-${crypto.randomUUID()}`, tenantId: dataset.tenantId, reportId: current.reportId, caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "status", title: `Status ændret til ${CASE_STATUSES[next.status]}`, text: change.reason?.trim() || change.resolution?.trim() || change.nextAction?.trim() || "Status opdateret i lokal prototype." });
  if (changedFields.length) events.push({ id: `event-${crypto.randomUUID()}`, tenantId: dataset.tenantId, reportId: current.reportId, caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "updated", title: "Vurdering opdateret", text: `Opdateret: ${changedFields.join(", ")}.` });
  if (note) events.push({ id: `event-${crypto.randomUUID()}`, tenantId: dataset.tenantId, reportId: current.reportId, caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "note", title: "Intern note", text: note });
  if (change.releaseBlock) events.push({ id: `event-${crypto.randomUUID()}`, tenantId: dataset.tenantId, reportId: current.reportId, caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "usability", title: "Spærring ophævet", text: change.releaseReason.trim() });
  const nextCases = [...cases];
  nextCases[index] = next;
  return { dataset: { ...dataset, relations: { ...dataset.relations, cases: nextCases, caseEvents: [...(dataset.relations.caseEvents || []), ...events] } }, caseItem: next, events };
}
