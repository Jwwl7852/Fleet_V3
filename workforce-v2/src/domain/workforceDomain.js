export const MINUTE_MS = 60_000;

export const EMPLOYEE_STATUS = { active: "Aktiv", leave: "Orlov", terminated: "Fratrådt" };
export const SHIFT_STATUS = { draft: "Kladde", published: "Offentliggjort", cancelled: "Annulleret" };
export const LEAVE_STATUS = { pending: "Afventer", approved: "Godkendt", rejected: "Afvist", cancelled: "Annulleret" };
export const LEAVE_TYPES = {
  vacation: "Ferie", personal: "Feriefridag", timeOff: "Afspadsering", sickness: "Sygdom",
  childSick: "Barns 1. sygedag", parental: "Barsel", course: "Kursus", other: "Andet",
};
export const REQUESTABLE_LEAVE_TYPES = ["vacation", "personal", "timeOff"];

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function makeId(prefix = "wf") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function toLocalDateKey(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localDateTimeMs(dateKey, time) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(dateKey), "Datoen skal være i formatet ÅÅÅÅ-MM-DD.");
  assert(/^\d{2}:\d{2}$/.test(time), "Tidspunktet skal være i formatet TT:MM.");
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  assert(value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === day
    && value.getHours() === hour && value.getMinutes() === minute,
  "Dato eller tidspunkt findes ikke i den lokale tidszone.");
  return value.getTime();
}

export function addLocalDays(ms, days) {
  const date = new Date(ms);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function startOfLocalDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function startOfWeek(ms = Date.now()) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.getTime();
}

export function endExclusiveForDay(dateKey) {
  return addLocalDays(localDateTimeMs(dateKey, "00:00"), 1);
}

export function intervalOverlaps(a, b) {
  return Number(a?.startMs ?? a?.fromMs) < Number(b?.endMs ?? b?.toMs)
    && Number(b?.startMs ?? b?.fromMs) < Number(a?.endMs ?? a?.toMs);
}

export function shiftMinutes(shift) {
  if (!Number.isFinite(shift?.startMs) || !Number.isFinite(shift?.endMs)) return 0;
  const gross = Math.max(0, Math.round((shift.endMs - shift.startMs) / MINUTE_MS));
  return Math.max(0, gross - Math.max(0, Number(shift.breakMinutes) || 0));
}

export function deduplicateShifts(shifts = []) {
  const unique = new Map();
  shifts.forEach((shift, index) => unique.set(shift?.id || `__missing-id-${index}`, shift));
  return [...unique.values()];
}

export function shiftsStartingInPeriod(shifts, employeeId, fromMs, toMs) {
  return deduplicateShifts(shifts).filter((shift) => shift.employeeId === employeeId
    && shift.status !== "cancelled" && shift.startMs >= fromMs && shift.startMs < toMs);
}

export function validateEmployee(employee) {
  const errors = {};
  if (!String(employee?.name || "").trim()) errors.name = "Navn skal udfyldes.";
  if (!String(employee?.workplace || "").trim()) errors.workplace = "Arbejdssted skal udfyldes.";
  if (!Array.isArray(employee?.functions) || employee.functions.length === 0) errors.functions = "Vælg mindst én funktion.";
  if (!EMPLOYEE_STATUS[employee?.status]) errors.status = "Vælg en gyldig status.";
  if (employee?.status === "terminated" && !Number.isFinite(employee?.terminatedAtMs)) errors.terminatedAtMs = "Fratrædelsesdatoen skal udfyldes.";
  assert(employee?.division == null, "Division må ikke gemmes på medarbejderen.");
  return errors;
}

export function validateShift(shift, employee) {
  assert(employee, "Medarbejderen findes ikke.");
  assert(employee.status !== "terminated" || shift.startMs < employee.terminatedAtMs,
    "En fratrådt medarbejder kan ikke få nye vagter efter fratrædelsesdatoen.");
  assert(Number.isFinite(shift.startMs) && Number.isFinite(shift.endMs), "Vagten mangler start eller slut.");
  assert(shift.endMs > shift.startMs, "Vagtens slut skal ligge efter start.");
  assert(shift.endMs - shift.startMs <= 24 * 60 * MINUTE_MS, "En vagt må højst vare 24 timer.");
  assert(Number(shift.breakMinutes || 0) >= 0, "Pausen kan ikke være negativ.");
  assert(shiftMinutes(shift) > 0, "Pausen kan ikke være lige så lang som vagten.");
  assert(SHIFT_STATUS[shift.status], "Vagten har en ukendt status.");
}

export function plannedMinutes(shifts, employeeId, fromMs, toMs, { publishedOnly = false } = {}) {
  return deduplicateShifts(shifts).filter((shift) => shift.employeeId === employeeId && shift.status !== "cancelled"
    && (!publishedOnly || shift.status === "published") && intervalOverlaps(shift, { startMs: fromMs, endMs: toMs }))
    .reduce((sum, shift) => sum + shiftMinutes(shift), 0);
}

export function recordedMinutes(entries, employeeId, fromMs, toMs) {
  return entries.filter((entry) => entry.employeeId === employeeId && entry.inMs >= fromMs && entry.inMs < toMs)
    .reduce((sum, entry) => sum + (Number.isFinite(entry.outMs)
      ? Math.max(0, Math.round((entry.outMs - entry.inMs) / MINUTE_MS) - (entry.breakMinutes || 0)) : 0), 0);
}

export function timeRegistrationSummary(shifts, entries, employeeId, fromMs, toMs, atMs = Date.now()) {
  const publishedShifts = deduplicateShifts(shifts).filter((shift) => shift.employeeId === employeeId
    && shift.status === "published" && intervalOverlaps(shift, { startMs: fromMs, endMs: toMs }));
  const draftMinutes = plannedMinutes(shifts.filter((shift) => shift.status === "draft"), employeeId, fromMs, toMs);
  const periodEntries = entries.filter((entry) => entry.employeeId === employeeId
    && intervalOverlaps({ startMs: entry.inMs, endMs: Number.isFinite(entry.outMs) ? entry.outMs : Infinity }, { startMs: fromMs, endMs: toMs }));
  const open = periodEntries.find((entry) => !Number.isFinite(entry.outMs)) || null;
  const missingShiftCount = publishedShifts.filter((shift) => shift.endMs <= atMs
    && !periodEntries.some((entry) => intervalOverlaps(shift, {
      startMs: entry.inMs, endMs: Number.isFinite(entry.outMs) ? entry.outMs : atMs,
    }))).length;
  return {
    plannedMinutes: publishedShifts.reduce((sum, shift) => sum + shiftMinutes(shift), 0),
    draftMinutes,
    actualMinutes: recordedMinutes(periodEntries, employeeId, fromMs, toMs),
    open,
    registrationState: open ? "open" : periodEntries.length ? "completed" : "none",
    missingShiftCount,
  };
}

export function staffingSnapshot(state, fromMs, toMs, atMs = Date.now()) {
  const shifts = deduplicateShifts(state.shifts).filter((shift) => shift.status !== "cancelled"
    && intervalOverlaps(shift, { startMs: fromMs, endMs: toMs }));
  const publishedShifts = shifts.filter((shift) => shift.status === "published");
  const draftShifts = shifts.filter((shift) => shift.status === "draft");
  const currentlyClockedEmployeeIds = [...new Set(state.timeEntries.filter((entry) => entry.inMs <= atMs
    && (!Number.isFinite(entry.outMs) || entry.outMs > atMs)).map((entry) => entry.employeeId))];
  return {
    publishedShifts,
    draftShifts,
    publishedEmployeeCount: new Set(publishedShifts.map((shift) => shift.employeeId)).size,
    draftEmployeeCount: new Set(draftShifts.map((shift) => shift.employeeId)).size,
    currentlyClockedEmployeeIds,
  };
}

export function requirementResult(skills, requirements, employeeId, atMs) {
  const byType = new Map();
  for (const skill of skills.filter((item) => item.employeeId === employeeId && item.status !== "cancelled")) {
    const current = byType.get(skill.type);
    if (!current || (skill.validUntilMs || Infinity) > (current.validUntilMs || Infinity)) byType.set(skill.type, skill);
  }
  const evaluate = (types = []) => types.reduce((result, type) => {
    const skill = byType.get(type);
    if (!skill) result.missing.push(type);
    else if (Number.isFinite(skill.validUntilMs) && skill.validUntilMs < atMs) result.expired.push(type);
    return result;
  }, { missing: [], expired: [] });
  const blocking = evaluate(requirements?.blocking);
  const warnings = evaluate(requirements?.warnings);
  return { ok: blocking.missing.length === 0 && blocking.expired.length === 0, blocking, warnings };
}

export const activeLeave = (leave) => leave.status === "approved" && !leave.cancelledAtMs;

export function availabilityFor(state, employeeId, fromMs, toMs) {
  const employee = state.employees.find((item) => item.id === employeeId);
  if (!employee) return { available: false, reason: "Medarbejderen findes ikke." };
  if (employee.status === "terminated" && fromMs >= employee.terminatedAtMs) return { available: false, reason: "Medarbejderen er fratrådt." };
  if (employee.status === "leave") return { available: false, reason: "Medarbejderen er på orlov." };
  const leave = state.leaves.find((item) => item.employeeId === employeeId && activeLeave(item)
    && intervalOverlaps(item, { fromMs, toMs }));
  if (leave) return { available: false, reason: "Medarbejderen har registreret fravær.", leaveId: leave.id };
  return { available: true };
}

export function conflictsForLeave(state, leave) {
  const period = { startMs: leave.fromMs, endMs: leave.toMs };
  return {
    shifts: state.shifts.filter((shift) => shift.employeeId === leave.employeeId && shift.status !== "cancelled" && intervalOverlaps(shift, period)),
    assignments: (state.planningAssignments || []).filter((assignment) => assignment.employeeId === leave.employeeId
      && assignment.status !== "cancelled" && intervalOverlaps(assignment, period)),
  };
}

export function futureAssignmentsForTermination(state, employeeId, terminatedAtMs) {
  return {
    shifts: state.shifts.filter((shift) => shift.employeeId === employeeId && shift.status !== "cancelled" && shift.startMs >= terminatedAtMs),
    assignments: (state.planningAssignments || []).filter((assignment) => assignment.employeeId === employeeId
      && assignment.status !== "cancelled" && assignment.startMs >= terminatedAtMs),
  };
}

export function effectiveLeaveReservation(leave) {
  if (!activeLeave(leave)) return null;
  return { id: `leave:${leave.id}`, resourceType: "employee", resourceId: leave.employeeId,
    fromMs: leave.fromMs, toMs: leave.toMs, source: { type: "leave", id: leave.id } };
}

export function syncLeaveReservation(state, leave) {
  const reservationId = `leave:${leave.id}`;
  state.reservations = state.reservations.filter((item) => item.id !== reservationId);
  const reservation = effectiveLeaveReservation(leave);
  if (reservation) state.reservations.push(reservation);
  return reservation;
}

export function assertPermission(actor, permission) {
  assert(actor?.tenantId, "Brugeren mangler tenant.");
  assert(actor?.permissions?.includes(permission), `Handlingen kræver ${permission}.`);
}

export function audit(state, actor, action, objectType, objectId, before, after, reason = null) {
  state.history.push({ id: makeId("history"), tenantId: actor.tenantId, actorId: actor.id, action, objectType,
    objectId, atMs: Date.now(), before, after, reason });
}
