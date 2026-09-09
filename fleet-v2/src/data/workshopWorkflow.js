import { CASE_STATUSES, isOpenCase } from "./caseWorkflow";
import { advanceRequirementAfterService } from "./serviceWorkflow";

export const WORKSHOP_TASK_STATUSES = {
  created: "Oprettet",
  booked: "Booket",
  in_progress: "I gang",
  waiting_parts: "Afventer dele",
  completed: "Afsluttet",
  cancelled: "Annulleret",
};

export const WORKSHOP_TASK_TRANSITIONS = {
  created: ["booked", "in_progress", "cancelled"],
  booked: ["created", "in_progress", "cancelled"],
  in_progress: ["waiting_parts", "completed", "cancelled"],
  waiting_parts: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const ACTIVE_WORKSHOP_STATUSES = new Set(["created", "booked", "in_progress", "waiting_parts"]);
export const PHYSICAL_WORKSHOP_STATUSES = new Set(["in_progress", "waiting_parts"]);

export const DEMO_WORKSHOPS = [
  { id: "workshop-internal-east", name: "VEYRO Værksted Øst", kind: "internal", address: "Industrivej 24, 2300 København S" },
  { id: "workshop-internal-west", name: "VEYRO Værksted Vest", kind: "internal", address: "Logistikvej 8, 2605 Brøndby" },
  { id: "workshop-external-volvo", name: "Volvo Truck Center Taastrup", kind: "external", address: "Roskildevej 316, 2630 Taastrup" },
];

export const DEMO_WORKSHOP_RESOURCES = [
  { id: "resource-bay-1", workshopId: "workshop-internal-east", name: "Bås 1", specialty: "Tunge køretøjer" },
  { id: "resource-bay-2", workshopId: "workshop-internal-east", name: "Bås 2", specialty: "Varebiler" },
  { id: "resource-diagnostics", workshopId: "workshop-internal-east", name: "Diagnose", specialty: "Fejlsøgning" },
  { id: "resource-west-1", workshopId: "workshop-internal-west", name: "Bås Vest 1", specialty: "Generelt værkstedsarbejde" },
];

const clone = (value) => structuredClone(value);
const randomId = () => crypto.randomUUID();
const numberFor = (prefix, count) => `${prefix}-${String(count + 1).padStart(5, "0")}`;
const workshopById = (dataset, id) => (dataset.relations.workshops || []).find((item) => item.id === id);

export function validateWorkshopTransition(task, toStatus, details = {}) {
  const errors = {};
  if (toStatus === task.status) {
    if (["completed", "cancelled"].includes(task.status)) errors.status = `Opgaven er allerede ${WORKSHOP_TASK_STATUSES[task.status].toLocaleLowerCase("da-DK")}.`;
    return errors;
  }
  if (!WORKSHOP_TASK_TRANSITIONS[task.status]?.includes(toStatus)) {
    errors.status = `Skift fra ${WORKSHOP_TASK_STATUSES[task.status]} til ${WORKSHOP_TASK_STATUSES[toStatus]} er ikke tilladt.`;
  }
  if (toStatus === "cancelled" && !details.reason?.trim()) errors.reason = "Annullering kræver en begrundelse.";
  if (toStatus === "completed") {
    if (!details.workPerformed?.trim()) errors.workPerformed = "Beskriv det udførte arbejde.";
    if (!details.actualEndAt) errors.actualEndAt = "Angiv faktisk afslutningstidspunkt.";
    if (typeof details.problemResolved !== "boolean") errors.problemResolved = "Vurder, om problemet er løst.";
    if (!details.usability) errors.usability = "Vurder enhedens anvendelighed.";
  }
  return errors;
}

export function validateBooking(dataset, input, editingId = null) {
  const errors = {};
  const start = Date.parse(input.startAt);
  const end = Date.parse(input.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) errors.time = "Angiv gyldig start og slut.";
  else if (start >= end) errors.time = "Starttidspunkt skal ligge før sluttidspunkt.";
  const task = (dataset.relations.workshopTasks || []).find((item) => item.id === input.taskId);
  const workshop = workshopById(dataset, input.workshopId);
  if (!task) errors.taskId = "Værkstedsopgaven findes ikke.";
  if (!workshop) errors.workshopId = "Vælg et værksted.";
  if (workshop?.kind === "internal" && !input.resourceId) errors.resourceId = "Vælg en intern ressource.";
  if (!errors.time && task) {
    const overlaps = (dataset.relations.bookings || []).filter((item) => item.id !== editingId && item.status !== "cancelled" && Date.parse(item.startAt) < end && Date.parse(item.endAt) > start);
    if (overlaps.some((item) => item.unitId === task.unitId)) errors.unitId = "Enheden har allerede et overlappende værkstedsophold.";
    if (workshop?.kind === "internal" && overlaps.some((item) => item.resourceId === input.resourceId)) errors.resourceId = "Den interne ressource er allerede booket i dette tidsrum.";
  }
  return errors;
}

export function applyWorkshopTaskCreation(dataset, caseId, input, actor, options = {}) {
  const caseItem = (dataset.relations.cases || []).find((item) => item.id === caseId);
  if (!caseItem) throw new Error("Sagen findes ikke.");
  if (caseItem.status !== "ready") throw new Error(`Sagen skal være ${CASE_STATUSES.ready}, før en værkstedsopgave kan oprettes.`);
  const existing = (dataset.relations.workshopTasks || []).find((item) => item.caseId === caseId && ACTIVE_WORKSHOP_STATUSES.has(item.status));
  if (existing) throw new Error(`Sagen har allerede den aktive værkstedsopgave ${existing.number}.`);
  const workshop = workshopById(dataset, input.workshopId);
  if (!workshop) throw new Error("Vælg et gyldigt værksted.");
  const now = options.now || new Date().toISOString();
  const id = options.id ? `workshop-task-${options.id}` : `workshop-task-${randomId()}`;
  const task = {
    id, tenantId: dataset.tenantId,
    number: numberFor("VO", (dataset.relations.workshopTasks || []).length),
    reference: caseItem.reference,
    caseId, reportId: caseItem.reportId, unitId: caseItem.unitId,
    title: input.title?.trim() || "Værkstedsbehandling",
    workshopId: input.workshopId,
    workshopKind: workshop.kind,
    assigneeId: input.assigneeId || null,
    priority: caseItem.priority,
    status: "created",
    workDescription: input.workDescription?.trim() || "",
    checklist: (input.checklist || []).filter((item) => item.text?.trim()).map((item) => ({ id: item.id || randomId(), text: item.text.trim(), done: Boolean(item.done) })),
    expectedCost: input.expectedCost === "" || input.expectedCost == null ? null : Number(input.expectedCost),
    actualCost: null,
    expectedCompletionAt: input.expectedCompletionAt || null,
    actualStartAt: null,
    actualEndAt: null,
    notes: [], materials: [], workLogs: [], beforeImages: [], afterImages: [],
    createdAt: now, updatedAt: now,
  };
  if (task.expectedCost != null && (!Number.isFinite(task.expectedCost) || task.expectedCost < 0)) throw new Error("Forventet omkostning skal være et positivt beløb eller tomt.");
  const event = { id: `workshop-event-${randomId()}`, tenantId: dataset.tenantId, taskId: id, caseId, unitId: task.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "created", title: "Værkstedsopgave oprettet", text: `${task.number} blev oprettet lokalt hos ${workshop.name}.` };
  return { dataset: { ...dataset, relations: { ...dataset.relations, workshopTasks: [...(dataset.relations.workshopTasks || []), task], workshopEvents: [...(dataset.relations.workshopEvents || []), event] } }, task, event };
}

export function applyBookingSave(dataset, input, actor, options = {}) {
  const editingId = input.id || null;
  const errors = validateBooking(dataset, input, editingId);
  if (Object.keys(errors).length) { const error = new Error(Object.values(errors)[0]); error.validation = errors; throw error; }
  const now = options.now || new Date().toISOString();
  const taskIndex = (dataset.relations.workshopTasks || []).findIndex((item) => item.id === input.taskId);
  const task = dataset.relations.workshopTasks[taskIndex];
  const booking = {
    id: editingId || `booking-${options.id || randomId()}`,
    tenantId: dataset.tenantId, taskId: task.id, caseId: task.caseId, unitId: task.unitId,
    workshopId: input.workshopId, resourceId: input.resourceId || null,
    startAt: new Date(input.startAt).toISOString(), endAt: new Date(input.endAt).toISOString(),
    status: input.confirmed ? "confirmed" : "requested",
    note: input.note?.trim() || "", updatedAt: now, createdAt: input.createdAt || now,
  };
  const bookings = [...(dataset.relations.bookings || [])];
  const bookingIndex = bookings.findIndex((item) => item.id === booking.id);
  if (bookingIndex >= 0) bookings[bookingIndex] = booking; else bookings.push(booking);
  const tasks = [...dataset.relations.workshopTasks];
  tasks[taskIndex] = { ...task, status: task.status === "created" ? "booked" : task.status, bookingId: booking.id, workshopId: booking.workshopId, updatedAt: now };
  const event = { id: `workshop-event-${randomId()}`, tenantId: dataset.tenantId, taskId: task.id, caseId: task.caseId, unitId: task.unitId, at: now, actorId: actor.id, actorName: actor.name, type: bookingIndex >= 0 ? "booking_updated" : "booked", title: booking.confirmed ? "Booking bekræftet" : "Ønsket tid registreret", text: `${booking.startAt} – ${booking.endAt}` };
  return { dataset: { ...dataset, relations: { ...dataset.relations, bookings, workshopTasks: tasks, workshopEvents: [...(dataset.relations.workshopEvents || []), event] } }, booking, task: tasks[taskIndex], event };
}

export function applyBookingCancellation(dataset, bookingId, reason, actor, options = {}) {
  if (!reason?.trim()) throw new Error("Annullering af booking kræver en begrundelse.");
  const index = (dataset.relations.bookings || []).findIndex((item) => item.id === bookingId);
  if (index < 0) throw new Error("Bookingen findes ikke.");
  const now = options.now || new Date().toISOString();
  const bookings = [...dataset.relations.bookings];
  const current = bookings[index];
  bookings[index] = { ...current, status: "cancelled", cancellationReason: reason.trim(), updatedAt: now };
  const tasks = [...(dataset.relations.workshopTasks || [])];
  const taskIndex = tasks.findIndex((item) => item.id === current.taskId);
  if (taskIndex >= 0 && tasks[taskIndex].bookingId === bookingId && tasks[taskIndex].status === "booked") tasks[taskIndex] = { ...tasks[taskIndex], status: "created", bookingId: null, updatedAt: now };
  const event = { id: `workshop-event-${randomId()}`, tenantId: dataset.tenantId, taskId: current.taskId, caseId: current.caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "booking_cancelled", title: "Booking annulleret", text: reason.trim() };
  return { dataset: { ...dataset, relations: { ...dataset.relations, bookings, workshopTasks: tasks, workshopEvents: [...(dataset.relations.workshopEvents || []), event] } }, booking: bookings[index], task: taskIndex >= 0 ? tasks[taskIndex] : null, event };
}

const actualPartsCost = (materials = []) => materials.reduce((sum, item) => sum + (Number.isFinite(item.totalCost) ? item.totalCost : 0), 0);
const actualLabourCost = (logs = []) => logs.reduce((sum, item) => sum + (Number.isFinite(item.cost) ? item.cost : 0), 0);

export function applyWorkshopTaskUpdate(dataset, taskId, change, actor, options = {}) {
  const tasks = dataset.relations.workshopTasks || [];
  const index = tasks.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error("Værkstedsopgaven findes ikke.");
  const current = tasks[index];
  const now = options.now || new Date().toISOString();
  const targetStatus = change.status || current.status;
  const errors = change.status ? validateWorkshopTransition(current, targetStatus, change) : {};
  if (Object.keys(errors).length) { const error = new Error(Object.values(errors)[0]); error.validation = errors; throw error; }
  const workLogs = [...(current.workLogs || []), ...(change.workLog?.description?.trim() ? [{ id: `worklog-${randomId()}`, at: now, description: change.workLog.description.trim(), hours: change.workLog.hours === "" ? null : Number(change.workLog.hours), cost: change.workLog.cost === "" ? null : Number(change.workLog.cost) }] : [])];
  const materials = [...(current.materials || []), ...(change.material?.name?.trim() ? [{ id: `material-${randomId()}`, name: change.material.name.trim(), quantity: Number(change.material.quantity) || 1, totalCost: change.material.totalCost === "" ? null : Number(change.material.totalCost) }] : [])];
  const next = {
    ...current,
    status: targetStatus,
    assigneeId: change.assigneeId === undefined ? current.assigneeId : change.assigneeId || null,
    workDescription: change.workDescription === undefined ? current.workDescription : change.workDescription.trim(),
    checklist: change.checklist || current.checklist,
    expectedCompletionAt: change.expectedCompletionAt === undefined ? current.expectedCompletionAt : change.expectedCompletionAt || null,
    expectedCost: change.expectedCost === undefined ? current.expectedCost : change.expectedCost === "" ? null : Number(change.expectedCost),
    notes: change.note?.trim() ? [...(current.notes || []), { id: `note-${randomId()}`, at: now, actorName: actor.name, text: change.note.trim() }] : current.notes,
    workLogs, materials,
    beforeImages: change.beforeImages || current.beforeImages,
    afterImages: change.afterImages || current.afterImages,
    actualStartAt: targetStatus === "in_progress" && !current.actualStartAt ? (change.actualStartAt || now) : current.actualStartAt,
    actualEndAt: targetStatus === "completed" ? change.actualEndAt : current.actualEndAt,
    workPerformed: targetStatus === "completed" ? change.workPerformed.trim() : current.workPerformed,
    problemResolved: targetStatus === "completed" ? change.problemResolved : current.problemResolved,
    completionUsability: targetStatus === "completed" ? change.usability : current.completionUsability,
    cancellationReason: targetStatus === "cancelled" ? change.reason.trim() : current.cancellationReason,
    updatedAt: now,
  };
  next.actualCost = actualLabourCost(workLogs) + actualPartsCost(materials);
  if (targetStatus === "completed" && change.otherCost !== "" && change.otherCost != null && Number.isFinite(Number(change.otherCost))) next.actualCost += Number(change.otherCost);
  const nextTasks = [...tasks]; nextTasks[index] = next;
  const cases = [...(dataset.relations.cases || [])];
  const caseIndex = cases.findIndex((item) => item.id === current.caseId);
  const caseItem = caseIndex >= 0 ? cases[caseIndex] : null;
  if (caseItem) {
    let caseStatus = caseItem.status;
    let nextAction = caseItem.nextAction;
    if (PHYSICAL_WORKSHOP_STATUSES.has(targetStatus)) { caseStatus = "workshop"; nextAction = targetStatus === "waiting_parts" ? "Afventer dele" : "Værkstedsarbejde i gang"; }
    else if (targetStatus === "cancelled") { caseStatus = "ready"; nextAction = "Vurder ny værkstedsbehandling"; }
    else if (targetStatus === "completed") {
      caseStatus = change.problemResolved ? (current.workshopKind === "external" ? "invoice_pending" : "ready_to_close") : "assessing";
      nextAction = change.problemResolved ? (current.workshopKind === "external" ? "Afvent fakturaafklaring" : "Gennemgå og luk sagen") : "Problemet er ikke løst – revurder sagen";
    }
    cases[caseIndex] = {
      ...caseItem,
      status: caseStatus,
      closureStatus: caseItem.closureStatus || "open",
      nextAction,
      resolution: targetStatus === "completed" ? change.workPerformed.trim() : caseItem.resolution,
      workCompletedAt: targetStatus === "completed" ? change.actualEndAt : caseItem.workCompletedAt,
      invoiceResolution: targetStatus === "completed" && change.problemResolved && current.workshopKind === "external" ? "pending" : caseItem.invoiceResolution,
      expectedInvoiceCount: targetStatus === "completed" && change.problemResolved && current.workshopKind === "external" ? Math.max(1, caseItem.expectedInvoiceCount || 0) : caseItem.expectedInvoiceCount,
      blockReleasedAt: targetStatus === "completed" && change.usability === "usable" ? now : caseItem.blockReleasedAt,
      blockReleaseReason: targetStatus === "completed" && change.usability === "usable" ? "Eksplicit vurderet anvendelig efter værkstedsarbejde." : caseItem.blockReleaseReason,
      updatedAt: now,
    };
  }
  const units = [...dataset.units];
  const unitIndex = units.findIndex((item) => item.id === current.unitId);
  if (unitIndex >= 0) {
    const otherPhysical = nextTasks.some((item) => item.id !== current.id && item.unitId === current.unitId && PHYSICAL_WORKSHOP_STATUSES.has(item.status));
    const openCase = cases.some((item) => item.unitId === current.unitId && isOpenCase(item));
    const status = PHYSICAL_WORKSHOP_STATUSES.has(targetStatus) || otherPhysical ? "workshop" : openCase ? "action" : "operation";
    units[unitIndex] = { ...units[unitIndex], status, updatedAt: now };
  }
  const events = [...(dataset.relations.workshopEvents || [])];
  if (targetStatus !== current.status) events.push({ id: `workshop-event-${randomId()}`, tenantId: dataset.tenantId, taskId, caseId: current.caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "status", title: `Status ændret til ${WORKSHOP_TASK_STATUSES[targetStatus]}`, text: change.reason?.trim() || change.workPerformed?.trim() || "Værkstedsopgaven blev opdateret." });
  if (change.note?.trim()) events.push({ id: `workshop-event-${randomId()}`, tenantId: dataset.tenantId, taskId, caseId: current.caseId, unitId: current.unitId, at: now, actorId: actor.id, actorName: actor.name, type: "note", title: "Værkstedsnote", text: change.note.trim() });
  let activities = dataset.relations.activities || [];
  let service = dataset.relations.service || [];
  let serviceRequirements = dataset.relations.serviceRequirements || [];
  let serviceOccurrences = dataset.relations.serviceOccurrences || [];
  let serviceEvents = dataset.relations.serviceEvents || [];
  let costs = dataset.relations.costs || [];
  let caseEvents = dataset.relations.caseEvents || [];
  if (targetStatus === "completed" && current.status !== "completed") {
    const activityId = `activity-workshop-${taskId}`;
    if (!activities.some((item) => item.id === activityId)) activities = [...activities, { id: activityId, unitId: current.unitId, taskId, caseId: current.caseId, at: change.actualEndAt, title: change.problemResolved ? "Værkstedsarbejde afsluttet" : "Værkstedsarbejde afsluttet – problem ikke løst", text: change.workPerformed.trim(), tone: change.problemResolved ? "success" : "warning", category: "Værksted" }];
    if (change.workType === "service" && !service.some((item) => item.taskId === taskId)) {
      const occurrence = serviceOccurrences.find((item) => item.id === current.serviceOccurrenceId || item.taskId === taskId);
      const serviceRecord = { id: `service-workshop-${taskId}`, tenantId: dataset.tenantId, unitId: current.unitId, caseId: current.caseId, taskId, requirementId: current.serviceRequirementId || null, occurrenceId: occurrence?.id || null, occurrenceDueDate: occurrence?.dueDate || null, date: change.actualEndAt.slice(0, 10), title: change.serviceTitle?.trim() || current.title || "Servicearbejde", meter: change.meter == null || change.meter === "" ? null : Number(change.meter), result: change.problemResolved ? "Udført" : "Kræver opfølgning", source: "workshop_completion", cost: current.workshopKind === "internal" ? next.actualCost || null : null };
      service = [...service, serviceRecord];
      if (change.problemResolved) {
        serviceRequirements = advanceRequirementAfterService(serviceRequirements, current.serviceRequirementId, serviceRecord, now);
        serviceOccurrences = serviceOccurrences.map((item) => item.id === occurrence?.id ? { ...item, status: "completed", completedAt: change.actualEndAt, serviceRecordId: serviceRecord.id, updatedAt: now } : item);
        serviceEvents = [...serviceEvents, { id: `service-event-complete-${taskId}`, tenantId: dataset.tenantId, requirementId: current.serviceRequirementId || null, unitId: current.unitId, caseId: current.caseId, taskId, at: now, actorId: actor.id, actorName: actor.name, type: "completed", title: "Service udført", text: `${serviceRecord.title} blev registreret i den fælles servicebog.` }];
      }
    }
    const costParts = [
      ["Arbejde", actualLabourCost(workLogs)], ["Materialer", actualPartsCost(materials)],
      ["Øvrigt", change.otherCost === "" || change.otherCost == null ? null : Number(change.otherCost)],
    ];
    costParts.forEach(([category, amount]) => { if (Number.isFinite(amount) && amount > 0 && !costs.some((item) => item.taskId === taskId && item.category === `Værksted · ${category}`)) costs = [...costs, { id: `cost-${taskId}-${category.toLocaleLowerCase("da-DK")}`, unitId: current.unitId, taskId, caseId: current.caseId, month: change.actualEndAt.slice(0, 7), category: `Værksted · ${category}`, amount, currency: "DKK", vatBasis: "excl_vat", actual: current.workshopKind === "internal", source: current.workshopKind === "internal" ? "internal_registration" : "external_provisional" }]; });
    caseEvents = [...caseEvents, { id: `event-workshop-complete-${taskId}`, tenantId: dataset.tenantId, reportId: current.reportId, caseId: current.caseId, unitId: current.unitId, taskId, at: now, actorId: actor.id, actorName: actor.name, type: "workshop", title: change.problemResolved ? "Sag opdateret efter værkstedsarbejde" : "Sag kræver opfølgning efter værksted", text: change.workPerformed.trim() }];
  }
  return { dataset: { ...dataset, units, relations: { ...dataset.relations, workshopTasks: nextTasks, workshopEvents: events, cases, caseEvents, activities, service, serviceRequirements, serviceOccurrences, serviceEvents, costs } }, task: next, caseItem: caseIndex >= 0 ? cases[caseIndex] : null };
}

export function deriveWorkshopUnitState(unitId, tasks = []) {
  const physical = tasks.find((item) => item.unitId === unitId && PHYSICAL_WORKSHOP_STATUSES.has(item.status));
  if (physical) return { value: "workshop", label: "På værksted", tone: "danger", taskId: physical.id };
  const booked = tasks.find((item) => item.unitId === unitId && item.status === "booked");
  if (booked) return { value: "booked", label: "Kommende værkstedstid", tone: "info", taskId: booked.id };
  return null;
}

export const workshopTaskRecordedCost = (task) => Number.isFinite(task.actualCost) ? task.actualCost : actualLabourCost(task.workLogs) + actualPartsCost(task.materials);
export const workshopTaskActualCost = (task) => task.workshopKind === "external" ? null : workshopTaskRecordedCost(task);
export const cloneWorkshopValue = clone;
