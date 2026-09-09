import { DEMO_ACTORS } from "./caseWorkflow";
import { nextReadableReference } from "./caseFolderWorkflow";

const clone = (value) => structuredClone(value);
const uid = () => crypto.randomUUID();
const ACTIVE_TASK_STATUSES = new Set(["created", "booked", "in_progress", "waiting_parts"]);

export const SERVICE_REQUIREMENT_STATUSES = {
  overdue: "Overskredet",
  upcoming: "Kommende",
  planned: "Planlagt",
  okay: "OK",
  missing_basis: "Mangler beregningsgrundlag",
  inactive: "Inaktiv",
};

export const SERVICE_CATEGORIES = {
  maintenance: "Serviceeftersyn",
  inspection: "Periodisk kontrol",
  tyres: "Dæk",
  insurance: "Forsikring",
  compliance: "Compliance",
  other: "Andet",
};

const toDateKey = (value) => value ? String(value).slice(0, 10) : null;

const annualDate = (year, month, day = 1) => {
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0, 12)).getUTCDate();
  return new Date(Date.UTC(Number(year), Number(month) - 1, Math.min(Number(day) || 1, lastDay), 12)).toISOString().slice(0, 10);
};

export function nextAnnualServiceDate(currentDueDate, completedDate, month, day = 1) {
  const completed = toDateKey(completedDate);
  let year = Number(String(currentDueDate || completed).slice(0, 4));
  let candidate = annualDate(year, month, day);
  while (candidate <= completed) candidate = annualDate(++year, month, day);
  return candidate;
}

export function addMonthsClamped(dateValue, months) {
  if (!dateValue || !Number.isInteger(Number(months)) || Number(months) <= 0) return null;
  const source = new Date(`${toDateKey(dateValue)}T12:00:00Z`);
  if (Number.isNaN(source.getTime())) return null;
  const targetMonth = source.getUTCMonth() + Number(months);
  const year = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay), 12)).toISOString().slice(0, 10);
}

const latestServiceRecord = (requirement, records = []) => [...records]
  .filter((item) => item.unitId === requirement.unitId && (!item.requirementId || item.requirementId === requirement.id))
  .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || Number(right.meter || -1) - Number(left.meter || -1))[0] || null;

export function calculateServiceTargets(requirement, serviceRecords = []) {
  const latest = latestServiceRecord(requirement, serviceRecords);
  const baseDate = toDateKey(latest?.date || requirement.baselineDate);
  const baseMeter = Number.isFinite(latest?.meter) ? latest.meter : Number.isFinite(requirement.baselineMeter) ? requirement.baselineMeter : null;
  const dates = [];
  if (requirement.fixedDueDate) dates.push(toDateKey(requirement.fixedDueDate));
  if (requirement.intervalMonths && baseDate) dates.push(addMonthsClamped(baseDate, Number(requirement.intervalMonths)));
  const dueDate = dates.filter(Boolean).sort()[0] || null;
  const dueMeter = requirement.intervalMeter && Number.isFinite(baseMeter) ? baseMeter + Number(requirement.intervalMeter) : null;
  const missing = [];
  if (requirement.intervalMonths && !baseDate) missing.push("seneste servicedato");
  if (requirement.intervalMeter && !Number.isFinite(baseMeter)) missing.push("seneste målerstand");
  return { dueDate, dueMeter, baseDate, baseMeter, latest, missing };
}

const daysBetween = (from, to) => Math.ceil((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000);

export function evaluateServiceRequirement(requirement, unit, relations, options = {}) {
  if (!requirement.active) return { status: "inactive", underlyingStatus: "inactive", ...calculateServiceTargets(requirement, relations.service || []) };
  const today = toDateKey(options.today || new Date().toISOString());
  const targets = calculateServiceTargets(requirement, relations.service || []);
  const currentMeter = Number.isFinite(unit?.meter) ? unit.meter : null;
  const dateDays = targets.dueDate ? daysBetween(today, targets.dueDate) : null;
  const meterRemaining = Number.isFinite(targets.dueMeter) && Number.isFinite(currentMeter) ? targets.dueMeter - currentMeter : null;
  let underlyingStatus = "okay";
  if (targets.missing.length || (!targets.dueDate && !Number.isFinite(targets.dueMeter))) underlyingStatus = "missing_basis";
  else if ((dateDays != null && dateDays < 0) || (meterRemaining != null && meterRemaining <= 0)) underlyingStatus = "overdue";
  else if ((dateDays != null && dateDays <= (requirement.warningDays ?? 30)) || (meterRemaining != null && meterRemaining <= (requirement.warningMeter ?? Math.max(100, Math.round((requirement.intervalMeter || 0) * .1))))) underlyingStatus = "upcoming";
  const task = (relations.workshopTasks || []).find((item) => item.serviceRequirementId === requirement.id && ACTIVE_TASK_STATUSES.has(item.status));
  const booking = task ? (relations.bookings || []).find((item) => item.taskId === task.id && item.status !== "cancelled") : null;
  return { ...targets, status: task ? "planned" : underlyingStatus, underlyingStatus, currentMeter, dateDays, meterRemaining, task, booking };
}

export function validateServiceRequirement(input, units = [], currentId = null, requirements = []) {
  const errors = {};
  if (!input.unitId || !units.some((item) => item.id === input.unitId)) errors.unitId = "Vælg en enhed.";
  if (!input.title?.trim()) errors.title = "Angiv kravets titel.";
  if (!input.fixedDueDate && !input.firstDueDate && !input.annualMonth && !input.intervalMonths && !input.intervalMeter) errors.basis = "Vælg mindst én frist: dato, årlig måned, måneder eller målerinterval.";
  if (input.annualMonth && (!Number.isInteger(Number(input.annualMonth)) || Number(input.annualMonth) < 1 || Number(input.annualMonth) > 12)) errors.annualMonth = "Vælg en gyldig årlig måned.";
  if (input.annualMonth && !input.firstDueDate && !input.fixedDueDate) errors.firstDueDate = "Angiv første frist for den årlige plan.";
  if (input.annualDay && (!Number.isInteger(Number(input.annualDay)) || Number(input.annualDay) < 1 || Number(input.annualDay) > 31)) errors.annualDay = "Dagen i måneden skal være mellem 1 og 31.";
  if (input.intervalMonths && (!Number.isInteger(Number(input.intervalMonths)) || Number(input.intervalMonths) <= 0)) errors.intervalMonths = "Månedsintervallet skal være et positivt helt tal.";
  if (input.intervalMeter && (!Number.isFinite(Number(input.intervalMeter)) || Number(input.intervalMeter) <= 0)) errors.intervalMeter = "Målerintervallet skal være et positivt tal.";
  if (input.baselineMeter !== "" && input.baselineMeter != null && (!Number.isFinite(Number(input.baselineMeter)) || Number(input.baselineMeter) < 0)) errors.baselineMeter = "Målergrundlaget skal være nul eller højere.";
  if (input.warningDays !== "" && input.warningDays != null && (!Number.isInteger(Number(input.warningDays)) || Number(input.warningDays) < 0)) errors.warningDays = "Datovarslet skal være et positivt helt tal eller nul.";
  if (input.warningMeter !== "" && input.warningMeter != null && (!Number.isFinite(Number(input.warningMeter)) || Number(input.warningMeter) < 0)) errors.warningMeter = "Målervarslet skal være nul eller højere.";
  if (requirements.some((item) => item.id !== currentId && item.unitId === input.unitId && item.title.toLocaleLowerCase("da-DK") === input.title?.trim().toLocaleLowerCase("da-DK") && item.active)) errors.title = "Enheden har allerede et aktivt servicekrav med denne titel.";
  return errors;
}

export function applyServiceRequirementSave(dataset, input, actor = DEMO_ACTORS[1], options = {}) {
  if (!input.id && Array.isArray(input.unitIds) && input.unitIds.length) {
    const unitIds = [...new Set(input.unitIds)];
    if (unitIds.some((id) => !dataset.units.some((unit) => unit.id === id))) throw new Error("En eller flere valgte enheder findes ikke.");
    const meterTypes = new Set(dataset.units.filter((unit) => unitIds.includes(unit.id)).map((unit) => unit.meterType));
    if (input.intervalMeter && meterTypes.size > 1) throw new Error("En fælles målerplan kan kun tildeles enheder med samme målerart.");
    const now = options.now || new Date().toISOString();
    const templateId = `service-template-${options.templateId || uid()}`;
    const template = {
      id: templateId, tenantId: dataset.tenantId, name: input.title.trim(), description: input.description?.trim() || "",
      unitIds, equipmentLabel: input.equipmentLabel?.trim() || "", category: input.category || "maintenance",
      firstDueDate: input.firstDueDate || input.fixedDueDate || null, annualMonth: input.annualMonth ? Number(input.annualMonth) : null,
      annualDay: input.annualDay ? Number(input.annualDay) : null, intervalMonths: input.intervalMonths ? Number(input.intervalMonths) : null,
      intervalMeter: input.intervalMeter ? Number(input.intervalMeter) : null, warningDays: input.warningDays === "" ? 30 : Number(input.warningDays ?? 30),
      warningMeter: input.warningMeter === "" || input.warningMeter == null ? null : Number(input.warningMeter), vendorId: input.vendorId || null,
      vendorContact: input.vendorContact?.trim() || "", instructions: input.instructions?.trim() || "", documentIds: [...new Set(input.documentIds || [])],
      active: input.active !== false, createdAt: now, updatedAt: now,
    };
    let working = { ...dataset, relations: { ...dataset.relations, serviceTemplates: [...(dataset.relations.serviceTemplates || []), template] } };
    const created = [];
    unitIds.forEach((unitId, index) => {
      const result = applyServiceRequirementSave(working, { ...input, unitIds: undefined, unitId, templateId }, actor, { ...options, id: `${options.id || templateId.replace("service-template-", "")}-${index + 1}`, now });
      working = result.dataset; created.push(result.requirement);
    });
    return { dataset: working, template, requirements: created, requirement: created[0], event: null };
  }
  const requirements = [...(dataset.relations.serviceRequirements || [])];
  const index = input.id ? requirements.findIndex((item) => item.id === input.id) : -1;
  const errors = validateServiceRequirement(input, dataset.units, input.id || null, requirements);
  if (Object.keys(errors).length) { const error = new Error(Object.values(errors)[0]); error.validation = errors; throw error; }
  const now = options.now || new Date().toISOString();
  const current = index >= 0 ? requirements[index] : null;
  const requirement = {
    id: current?.id || `service-requirement-${options.id || uid()}`,
    tenantId: dataset.tenantId,
    unitId: input.unitId,
    title: input.title.trim(),
    description: input.description?.trim() || current?.description || "",
    templateId: input.templateId || current?.templateId || null,
    equipmentLabel: input.equipmentLabel?.trim() || "",
    category: input.category || "maintenance",
    firstDueDate: input.firstDueDate || input.fixedDueDate || current?.firstDueDate || null,
    fixedDueDate: input.firstDueDate || input.fixedDueDate || null,
    annualMonth: input.annualMonth ? Number(input.annualMonth) : null,
    annualDay: input.annualDay ? Number(input.annualDay) : null,
    intervalMonths: input.intervalMonths ? Number(input.intervalMonths) : null,
    intervalMeter: input.intervalMeter ? Number(input.intervalMeter) : null,
    meterUnit: dataset.units.find((item) => item.id === input.unitId)?.meterType === "hours" ? "hours" : "km",
    baselineDate: input.baselineDate || null,
    baselineMeter: input.baselineMeter === "" || input.baselineMeter == null ? null : Number(input.baselineMeter),
    warningDays: input.warningDays === "" || input.warningDays == null ? 30 : Number(input.warningDays),
    warningMeter: input.warningMeter === "" || input.warningMeter == null ? null : Number(input.warningMeter),
    responsibleId: input.responsibleId || "demo-lars",
    vendorId: input.vendorId || null,
    vendorContact: input.vendorContact?.trim() || "",
    instructions: input.instructions?.trim() || "",
    documentIds: [...new Set(input.documentIds || [])],
    notes: input.notes?.trim() || "",
    active: input.active !== false,
    activeCaseId: current?.activeCaseId || null,
    activeTaskId: current?.activeTaskId || null,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  if (index >= 0) requirements[index] = requirement; else requirements.push(requirement);
  const event = { id: `service-event-${uid()}`, tenantId: dataset.tenantId, requirementId: requirement.id, unitId: requirement.unitId, at: now, actorId: actor.id, actorName: actor.name, type: index >= 0 ? "requirement_updated" : "requirement_created", title: index >= 0 ? "Servicekrav redigeret" : "Servicekrav oprettet", text: requirement.title };
  return { dataset: { ...dataset, relations: { ...dataset.relations, serviceRequirements: requirements, serviceEvents: [...(dataset.relations.serviceEvents || []), event] } }, requirement, event };
}

export function applyServicePlanning(dataset, requirementId, input, actor = DEMO_ACTORS[1], options = {}) {
  const requirements = [...(dataset.relations.serviceRequirements || [])];
  const index = requirements.findIndex((item) => item.id === requirementId);
  if (index < 0) throw new Error("Servicekravet findes ikke.");
  const requirement = requirements[index];
  const existingTask = (dataset.relations.workshopTasks || []).find((item) => item.serviceRequirementId === requirementId && ACTIVE_TASK_STATUSES.has(item.status));
  if (existingTask) return { dataset, requirement, caseItem: (dataset.relations.cases || []).find((item) => item.id === existingTask.caseId), task: existingTask, duplicate: true };
  const unit = dataset.units.find((item) => item.id === requirement.unitId);
  if (!unit) throw new Error("Enheden findes ikke.");
  const workshop = (dataset.relations.workshops || []).find((item) => item.id === input.workshopId || item.id === requirement.vendorId);
  if (!workshop) throw new Error("Vælg et gyldigt værksted.");
  const now = options.now || new Date().toISOString();
  const occurrences = [...(dataset.relations.serviceOccurrences || [])];
  const occurrenceIndex = occurrences.findIndex((item) => item.requirementId === requirementId && ["alerted", "planned", "in_progress"].includes(item.status));
  const occurrence = occurrenceIndex >= 0 ? occurrences[occurrenceIndex] : null;
  const linkedCase = occurrence ? (dataset.relations.cases || []).find((item) => item.id === occurrence.caseId) : null;
  const caseId = linkedCase?.id || `case-${options.caseId || uid()}`;
  const taskId = `workshop-task-${options.taskId || uid()}`;
  const reference = linkedCase?.reference || nextReadableReference(dataset, "VYR", { now });
  const caseItem = linkedCase ? { ...linkedCase, status: "ready", vendorId: workshop.id, assigneeId: input.assigneeId || actor.id, nextAction: "Book værkstedsopgaven", dueDate: input.dueDate || linkedCase.dueDate, updatedAt: now } : { id: caseId, tenantId: dataset.tenantId, reference, number: `SAG-${String((dataset.relations.cases || []).length + 1).padStart(5, "0")}`, historicalReferences: [], reportId: null, unitId: unit.id, serviceRequirementId: requirement.id, title: requirement.title, description: input.workDescription?.trim() || `Planlagt ud fra servicekravet ${requirement.title}.`, status: "ready", closureStatus: "open", invoiceResolution: "disconnected", expectedInvoiceCount: 0, priority: input.priority || "normal", assigneeId: input.assigneeId || actor.id, nextAction: "Book værkstedsopgaven", dueDate: input.dueDate || null, manual: true, serviceCase: true, vendorId: workshop.id, createdAt: now, updatedAt: now };
  const task = { id: taskId, tenantId: dataset.tenantId, number: `VO-${String((dataset.relations.workshopTasks || []).length + 1).padStart(5, "0")}`, reference, caseId, reportId: caseItem.reportId || null, unitId: unit.id, serviceRequirementId: requirement.id, serviceOccurrenceId: occurrence?.id || null, title: requirement.title, workshopId: workshop.id, workshopKind: workshop.kind, assigneeId: input.assigneeId || actor.id, priority: caseItem.priority, status: "created", workDescription: input.workDescription?.trim() || requirement.instructions || `Udfør ${requirement.title}.`, checklist: [{ id: `check-${uid()}`, text: "Kontrollér servicekrav og målerstand", done: false }, { id: `check-${uid()}`, text: "Registrér udført service", done: false }], expectedCost: input.expectedCost === "" || input.expectedCost == null ? null : Number(input.expectedCost), actualCost: null, expectedCompletionAt: input.expectedCompletionAt || null, actualStartAt: null, actualEndAt: null, notes: [], materials: [], workLogs: [], beforeImages: [], afterImages: [], workTypeHint: "service", createdAt: now, updatedAt: now };
  if (task.expectedCost != null && (!Number.isFinite(task.expectedCost) || task.expectedCost < 0)) throw new Error("Forventet omkostning skal være et positivt beløb eller tomt.");
  requirements[index] = { ...requirement, activeCaseId: caseId, activeTaskId: taskId, updatedAt: now };
  const caseEvent = linkedCase
    ? { id: `event-service-case-${uid()}`, tenantId: dataset.tenantId, caseId, unitId: unit.id, requirementId, taskId, at: now, actorId: actor.id, actorName: actor.name, type: "workshop_task_created", title: "Værkstedsopgave oprettet på eksisterende servicesag", text: `${task.number} blev knyttet til den automatisk varslede sag ${reference}.` }
    : { id: `event-service-case-${uid()}`, tenantId: dataset.tenantId, caseId, unitId: unit.id, requirementId, taskId, at: now, actorId: actor.id, actorName: actor.name, type: "created", title: "Servicesag oprettet", text: `${reference} blev oprettet uden en fiktiv indberetning.` };
  const workshopEvent = { id: `workshop-event-${uid()}`, tenantId: dataset.tenantId, taskId, caseId, unitId: unit.id, requirementId, at: now, actorId: actor.id, actorName: actor.name, type: "created", title: "Værkstedsopgave oprettet fra servicekrav", text: `${task.number} bruger sagens fælles reference ${reference}.` };
  const serviceEvent = { id: `service-event-${uid()}`, tenantId: dataset.tenantId, requirementId, caseId, taskId, unitId: unit.id, at: now, actorId: actor.id, actorName: actor.name, type: "planned", title: "Service planlagt", text: `${caseItem.number} og ${task.number} blev oprettet uden dubletter.` };
  const cases = linkedCase ? (dataset.relations.cases || []).map((item) => item.id === linkedCase.id ? caseItem : item) : [...(dataset.relations.cases || []), caseItem];
  const nextOccurrence = occurrence ? { ...occurrence, taskId, status: "planned", updatedAt: now } : { id: `service-occurrence-manual-${uid()}`, tenantId: dataset.tenantId, key: `manual:${requirement.id}:${caseId}`, requirementId, templateId: requirement.templateId || null, unitId: unit.id, reportId: null, caseId, taskId, orderReference: caseItem.orderReference || null, dueDate: input.dueDate || null, dueMeter: null, status: "planned", origin: "manual_planning", createdAt: now, updatedAt: now };
  if (occurrenceIndex >= 0) occurrences[occurrenceIndex] = nextOccurrence; else occurrences.push(nextOccurrence);
  return { dataset: { ...dataset, relations: { ...dataset.relations, serviceRequirements: requirements, serviceOccurrences: occurrences, cases, workshopTasks: [...(dataset.relations.workshopTasks || []), task], caseEvents: [...(dataset.relations.caseEvents || []), caseEvent], workshopEvents: [...(dataset.relations.workshopEvents || []), workshopEvent], serviceEvents: [...(dataset.relations.serviceEvents || []), serviceEvent] } }, requirement: requirements[index], occurrence: nextOccurrence, caseItem, task, duplicate: false };
}

export function applyHistoricalServiceSave(dataset, input, actor = DEMO_ACTORS[1], options = {}) {
  if (!dataset.units.some((item) => item.id === input.unitId)) throw new Error("Vælg en enhed.");
  if (!input.title?.trim()) throw new Error("Angiv servicens titel.");
  if (!input.date) throw new Error("Angiv servicedato.");
  if (input.meter !== "" && input.meter != null && (!Number.isFinite(Number(input.meter)) || Number(input.meter) < 0)) throw new Error("Målerstanden skal være nul eller højere.");
  const records = [...(dataset.relations.service || [])];
  const duplicate = input.clientId ? records.find((item) => item.clientId === input.clientId) : null;
  if (duplicate) return { dataset, record: duplicate, duplicate: true };
  const now = options.now || new Date().toISOString();
  const record = { id: `service-${options.id || uid()}`, clientId: input.clientId || null, tenantId: dataset.tenantId, unitId: input.unitId, requirementId: input.requirementId || null, date: input.date, title: input.title.trim(), meter: input.meter === "" || input.meter == null ? null : Number(input.meter), result: input.result?.trim() || "Udført", notes: input.notes?.trim() || "", source: "manual_history", recordedAt: now, recordedBy: actor.id, cost: null };
  const event = { id: `service-event-${uid()}`, tenantId: dataset.tenantId, requirementId: record.requirementId, unitId: record.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "historical_service", title: "Historisk service registreret", text: `${record.title} · ${record.date}` };
  const requirements = input.advanceRequirement === false ? (dataset.relations.serviceRequirements || []) : advanceRequirementAfterService(dataset.relations.serviceRequirements || [], record.requirementId, record, now);
  return { dataset: { ...dataset, relations: { ...dataset.relations, service: [...records, record], serviceRequirements: requirements, serviceEvents: [...(dataset.relations.serviceEvents || []), event] } }, record, duplicate: false };
}

export function advanceRequirementAfterService(requirements, requirementId, serviceRecord, now) {
  if (!requirementId) return requirements;
  return requirements.map((item) => item.id === requirementId ? { ...item, baselineDate: serviceRecord.date, baselineMeter: Number.isFinite(serviceRecord.meter) ? serviceRecord.meter : item.baselineMeter, fixedDueDate: item.annualMonth ? nextAnnualServiceDate(serviceRecord.occurrenceDueDate || item.fixedDueDate, serviceRecord.date, item.annualMonth, item.annualDay || 1) : item.fixedDueDate ? null : item.fixedDueDate, active: item.fixedDueDate && !item.annualMonth && !item.intervalMonths && !item.intervalMeter ? false : item.active, lastCompletedAt: serviceRecord.date, lastServiceRecordId: serviceRecord.id, activeOccurrenceId: null, activeCaseId: null, activeTaskId: null, updatedAt: now } : item);
}

export const serviceRequirementCounts = (requirements, units, relations, options) => requirements.reduce((result, requirement) => {
  const evaluation = evaluateServiceRequirement(requirement, units.find((item) => item.id === requirement.unitId), relations, options);
  result[evaluation.status] = (result[evaluation.status] || 0) + 1;
  return result;
}, {});

export function serviceForUnitSummary(unit, relations, options) {
  const rank = { overdue: 0, upcoming: 1, planned: 2, missing_basis: 3, okay: 4, inactive: 5 };
  return (relations.serviceRequirements || []).filter((item) => item.unitId === unit.id).map((requirement) => ({ requirement, evaluation: evaluateServiceRequirement(requirement, unit, relations, options) })).sort((left, right) => rank[left.evaluation.status] - rank[right.evaluation.status] || String(left.evaluation.dueDate || "9999").localeCompare(String(right.evaluation.dueDate || "9999")))[0] || null;
}

export const cloneServiceValue = clone;
