import { createReportRecords } from "./caseWorkflow";
import { nextReadableReference, nextWorkshopOrderReference } from "./caseFolderWorkflow";
import { evaluateServiceRequirement, SERVICE_CATEGORIES } from "./serviceWorkflow";

const clone = (value) => structuredClone(value);
const uid = () => crypto.randomUUID();
const ACTIVE_OCCURRENCE_STATUSES = new Set(["alerted", "planned", "in_progress"]);

export const DEFAULT_SERVICE_SETTINGS = {
  id: "service-settings-default",
  autoMailEntitled: false,
  autoMailRuleEnabled: false,
  checkIntervalMinutes: 1,
  lastAutomationRunAt: null,
  lastAutomationCreated: 0,
};

export function serviceOccurrenceKey(requirement, evaluation) {
  const date = evaluation.dueDate || "no-date";
  const meter = Number.isFinite(evaluation.dueMeter) ? evaluation.dueMeter : "no-meter";
  return `${requirement.id}::${date}::${meter}`;
}

export function currentServiceOccurrence(relations, requirementId) {
  return [...(relations.serviceOccurrences || [])]
    .filter((item) => item.requirementId === requirementId && ACTIVE_OCCURRENCE_STATUSES.has(item.status))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

function automationReportInput(requirement, unit, evaluation, reference, occurrenceId, now) {
  const dueParts = [
    evaluation.dueDate ? `dato ${evaluation.dueDate}` : null,
    Number.isFinite(evaluation.dueMeter) ? `${evaluation.dueMeter.toLocaleString("da-DK")} ${requirement.meterUnit === "hours" ? "driftstimer" : "km"}` : null,
  ].filter(Boolean).join(" eller ");
  return {
    reference,
    unitId: unit.id,
    type: "service",
    category: SERVICE_CATEGORIES[requirement.category] || requirement.category || "Service",
    severity: evaluation.underlyingStatus === "overdue" ? "high" : "moderate",
    title: requirement.title,
    description: `${requirement.description || requirement.instructions || `Tilbagevendende serviceopgave: ${requirement.title}.`} Frist: ${dueParts || "beregningsgrundlag mangler"}.`,
    images: [], media: [], incident: null,
    clientSubmissionId: `service-occurrence:${occurrenceId}`,
    meterObservation: Number.isFinite(unit.meter) ? { value: unit.meter, unit: unit.meterType === "hours" ? "hours" : "km", observedAt: now, source: "service_automation_snapshot" } : null,
    usability: "usable",
    reporterId: null,
    reporterName: "Automatisk oprettet fra Service",
  };
}

export function applyServiceAutomation(dataset, options = {}) {
  const now = options.now || new Date().toISOString();
  const today = now.slice(0, 10);
  let next = clone(dataset);
  const created = [];
  const reused = [];
  const skipped = [];
  let occurrences = [...(next.relations.serviceOccurrences || [])];
  let requirements = [...(next.relations.serviceRequirements || [])];

  for (let index = 0; index < requirements.length; index += 1) {
    const requirement = requirements[index];
    if (!requirement.active) { skipped.push({ requirementId: requirement.id, reason: "inactive" }); continue; }
    const unit = next.units.find((item) => item.id === requirement.unitId);
    const evaluation = evaluateServiceRequirement(requirement, unit, { ...next.relations, serviceOccurrences: occurrences }, { today });
    const existingTask = evaluation.task;
    const shouldAlert = ["upcoming", "overdue"].includes(evaluation.underlyingStatus);
    if (!shouldAlert && !existingTask) { skipped.push({ requirementId: requirement.id, reason: evaluation.underlyingStatus }); continue; }
    const key = serviceOccurrenceKey(requirement, evaluation);
    const existing = occurrences.find((item) => item.key === key || (item.requirementId === requirement.id && ACTIVE_OCCURRENCE_STATUSES.has(item.status)));
    if (existing) { reused.push(existing); continue; }

    if (existingTask) {
      const existingCase = (next.relations.cases || []).find((item) => item.id === existingTask.caseId);
      const migrated = {
        id: `service-occurrence-legacy-${existingTask.id}`,
        tenantId: next.tenantId, key, requirementId: requirement.id, templateId: requirement.templateId || null,
        unitId: requirement.unitId, reportId: existingCase?.reportId || null, caseId: existingTask.caseId,
        taskId: existingTask.id, orderReference: existingCase?.orderReference || null,
        dueDate: evaluation.dueDate, dueMeter: evaluation.dueMeter, status: "planned",
        origin: "migrated_existing_plan", createdAt: existingTask.createdAt || now, updatedAt: now,
      };
      occurrences.push(migrated); reused.push(migrated);
      requirements[index] = { ...requirement, activeOccurrenceId: migrated.id, activeCaseId: migrated.caseId, activeTaskId: migrated.taskId };
      continue;
    }

    const occurrenceId = `service-occurrence-${options.idFactory?.("occurrence", requirement) || uid()}`;
    const reference = nextReadableReference(next, "VYR", { now });
    const orderReference = nextWorkshopOrderReference({ ...next, relations: { ...next.relations, serviceOccurrences: occurrences } }, now);
    const records = createReportRecords(next, automationReportInput(requirement, unit, evaluation, reference, occurrenceId, now), { id: options.idFactory?.("report", requirement) || uid(), now });
    const report = {
      ...records.report,
      serviceRequirementId: requirement.id,
      serviceOccurrenceId: occurrenceId,
      origin: "service_automation",
      originLabel: "Automatisk oprettet fra Service",
      dueDate: evaluation.dueDate,
      dueMeter: evaluation.dueMeter,
      vendorId: requirement.vendorId || null,
      vendorContact: requirement.vendorContact || null,
    };
    const caseItem = {
      ...records.caseItem,
      serviceRequirementId: requirement.id,
      serviceOccurrenceId: occurrenceId,
      serviceCase: true,
      automatic: true,
      title: requirement.title,
      description: report.description,
      vendorId: requirement.vendorId || null,
      vendorContact: requirement.vendorContact || null,
      orderReference,
      dueDate: evaluation.dueDate,
      nextAction: "Vurder automatisk servicevarsel",
      priority: evaluation.underlyingStatus === "overdue" ? "high" : "normal",
    };
    const occurrence = {
      id: occurrenceId, tenantId: next.tenantId, key, requirementId: requirement.id,
      templateId: requirement.templateId || null, unitId: unit.id, reportId: report.id, caseId: caseItem.id,
      taskId: null, orderReference, dueDate: evaluation.dueDate, dueMeter: evaluation.dueMeter,
      status: "alerted", origin: "service_automation", warningReachedAt: now,
      createdAt: now, updatedAt: now,
    };
    const event = {
      ...records.event,
      actorId: null,
      actorName: "Serviceautomatik",
      type: "service_automation",
      title: "Automatisk oprettet fra Service",
      text: `${report.number}, ${caseItem.number} og bestillingsnummer ${orderReference} blev reserveret atomisk. Ingen mail er sendt.`,
      serviceRequirementId: requirement.id,
      serviceOccurrenceId: occurrence.id,
    };
    const serviceEvent = {
      id: `service-event-${uid()}`, tenantId: next.tenantId, requirementId: requirement.id,
      occurrenceId: occurrence.id, unitId: unit.id, reportId: report.id, caseId: caseItem.id,
      at: now, actorId: null, actorName: "Serviceautomatik", type: "automatic_alert",
      title: "Servicevarsel oprettede indberetning og sag",
      text: `${reference} · ${orderReference}. Automatisk mail er ikke sendt.`,
    };
    occurrences.push(occurrence);
    requirements[index] = { ...requirement, activeOccurrenceId: occurrence.id, activeCaseId: caseItem.id, activeTaskId: null, updatedAt: now };
    next = {
      ...next,
      relations: {
        ...next.relations,
        reports: [...(next.relations.reports || []), report],
        cases: [...(next.relations.cases || []), caseItem],
        caseEvents: [...(next.relations.caseEvents || []), event],
        serviceEvents: [...(next.relations.serviceEvents || []), serviceEvent],
      },
    };
    created.push({ occurrence, report, caseItem });
  }

  const previousSettings = next.relations.serviceSettings?.[0] || DEFAULT_SERVICE_SETTINGS;
  const settings = { ...DEFAULT_SERVICE_SETTINGS, ...previousSettings, tenantId: next.tenantId, lastAutomationRunAt: now, lastAutomationCreated: created.length };
  next = { ...next, relations: { ...next.relations, serviceRequirements: requirements, serviceOccurrences: occurrences, serviceSettings: [settings] } };
  return { dataset: next, created, reused, skipped, settings };
}

export function applyServiceSettingsSave(dataset, input, options = {}) {
  const now = options.now || new Date().toISOString();
  const current = dataset.relations.serviceSettings?.[0] || DEFAULT_SERVICE_SETTINGS;
  const settings = {
    ...current,
    tenantId: dataset.tenantId,
    autoMailEntitled: Boolean(input.autoMailEntitled),
    autoMailRuleEnabled: Boolean(input.autoMailEntitled && input.autoMailRuleEnabled),
    updatedAt: now,
  };
  return { dataset: { ...dataset, relations: { ...dataset.relations, serviceSettings: [settings] } }, settings };
}
