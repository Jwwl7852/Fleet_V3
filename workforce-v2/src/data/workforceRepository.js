import {
  addLocalDays, assert, assertPermission, audit, conflictsForLeave, deduplicateShifts, makeId, startOfWeek,
  syncLeaveReservation, validateEmployee, validateShift,
} from "../domain/workforceDomain.js";
import { createSeedState } from "./seed.js";

export const WORKFORCE_DB_NAME = "veyro-workforce-v2-integration-v1";
const STORE = "tenant-state";

const clone = (value) => structuredClone(value);

function assertTenant(actor, tenantId) {
  assert(actor?.tenantId === tenantId, "Brugeren kan ikke tilgå en anden kundes data.");
}

function normalizedState(state, tenantId) {
  const base = state || createSeedState({ tenantId });
  return {
    ...base, tenantId,
    employees: base.employees || [], shifts: deduplicateShifts(base.shifts || []), leaves: base.leaves || [],
    sensitiveLeave: base.sensitiveLeave || {}, skills: base.skills || [], timeEntries: base.timeEntries || [],
    reservations: base.reservations || [], planningAssignments: base.planningAssignments || [], history: base.history || [],
  };
}

function visibleState(state, actor) {
  const result = clone(state);
  const ownOnly = !actor.permissions.includes("workforce.employee.read");
  const canReadSensitiveLeave = actor.permissions.includes("workforce.leave.sensitive");
  if (ownOnly) {
    assertPermission(actor, "workforce.self");
    const employeeId = actor.employeeId;
    result.employees = result.employees.filter((item) => item.id === employeeId);
    result.shifts = result.shifts.filter((item) => item.employeeId === employeeId && item.status === "published");
    result.leaves = result.leaves.filter((item) => item.employeeId === employeeId);
    result.skills = result.skills.filter((item) => item.employeeId === employeeId);
    result.timeEntries = result.timeEntries.filter((item) => item.employeeId === employeeId);
    result.reservations = [];
    result.planningAssignments = [];
    result.history = [];
  }
  if (!canReadSensitiveLeave) {
    result.sensitiveLeave = {};
    result.leaves = result.leaves.map((leave) => {
      const projected = { ...leave };
      delete projected.type;
      delete projected.sensitiveNote;
      if (leave.employeeId !== actor.employeeId) {
        delete projected.requestedType;
        delete projected.employeeNote;
      }
      return projected;
    });
  }
  return result;
}

function operations(tenantId, read, mutate) {
  const getState = async (actor) => {
    assertTenant(actor, tenantId);
    return visibleState(await read(), actor);
  };
  const change = (actor, permission, fn) => {
    assertTenant(actor, tenantId);
    if (permission) assertPermission(actor, permission);
    return mutate((state) => fn(normalizedState(state, tenantId)));
  };
  return {
    getState,
    reset: (actor) => change(actor, "workforce.employee.write", (state) => {
      const fresh = createSeedState({ tenantId });
      audit(fresh, actor, "reset", "workforce", tenantId, state, fresh, "Nulstillet i lokalt testmiljø");
      return fresh;
    }),
    saveEmployee: (actor, input) => change(actor, "workforce.employee.write", (state) => {
      const before = input.id ? state.employees.find((item) => item.id === input.id) : null;
      const employee = { ...before, ...clone(input), id: input.id || makeId("employee"), status: input.status || "active" };
      const errors = validateEmployee(employee);
      assert(Object.keys(errors).length === 0, Object.values(errors)[0]);
      state.employees = state.employees.filter((item) => item.id !== employee.id).concat(employee);
      audit(state, actor, before ? "update" : "create", "employee", employee.id, before, employee);
      return { state, result: employee };
    }),
    terminateEmployee: (actor, employeeId, terminatedAtMs, reason) => change(actor, "workforce.employee.write", (state) => {
      assert(String(reason || "").trim(), "Fratrædelse kræver en begrundelse.");
      const before = state.employees.find((item) => item.id === employeeId);
      assert(before, "Medarbejderen findes ikke.");
      const employee = { ...before, status: "terminated", terminatedAtMs };
      state.employees = state.employees.map((item) => item.id === employeeId ? employee : item);
      audit(state, actor, "terminate", "employee", employeeId, before, employee, reason.trim());
      const future = {
        shifts: state.shifts.filter((item) => item.employeeId === employeeId && item.status !== "cancelled" && item.startMs >= terminatedAtMs),
        assignments: state.planningAssignments.filter((item) => item.employeeId === employeeId && item.status !== "cancelled" && item.startMs >= terminatedAtMs),
      };
      return { state, result: { employee, future } };
    }),
    saveShift: (actor, input, { repeatWeeks = 0 } = {}) => change(actor, "workforce.shift.write", (state) => {
      const before = input.id ? state.shifts.find((item) => item.id === input.id) : null;
      const employee = state.employees.find((item) => item.id === input.employeeId);
      const first = { ...before, ...clone(input), id: input.id || makeId("shift"), status: input.status || "draft" };
      validateShift(first, employee);
      const seriesId = before?.seriesId || (repeatWeeks > 0 ? makeId("series") : input.seriesId || null);
      const created = [{ ...first, ...(seriesId ? { seriesId } : {}) }];
      if (!before && repeatWeeks > 0) {
        for (let index = 1; index <= repeatWeeks; index += 1) {
          created.push({ ...first, id: makeId("shift"), seriesId,
            startMs: addLocalDays(first.startMs, index * 7), endMs: addLocalDays(first.endMs, index * 7) });
        }
      }
      state.shifts = state.shifts.filter((item) => item.id !== first.id).concat(created);
      audit(state, actor, before ? "update-occurrence" : "create", "shift", first.id, before, created);
      return { state, result: created };
    }),
    cancelShift: (actor, shiftId, reason) => change(actor, "workforce.shift.write", (state) => {
      assert(String(reason || "").trim(), "Annullering kræver en begrundelse.");
      const before = state.shifts.find((item) => item.id === shiftId);
      assert(before, "Vagten findes ikke.");
      const after = { ...before, status: "cancelled", cancelledAtMs: Date.now() };
      state.shifts = state.shifts.map((item) => item.id === shiftId ? after : item);
      audit(state, actor, "cancel", "shift", shiftId, before, after, reason.trim());
      return { state, result: after };
    }),
    publishWeek: (actor, weekMs) => change(actor, "workforce.shift.write", (state) => {
      const fromMs = startOfWeek(weekMs); const toMs = addLocalDays(fromMs, 7);
      let count = 0;
      state.shifts = state.shifts.map((item) => {
        if (item.status === "draft" && item.startMs >= fromMs && item.startMs < toMs) { count += 1; return { ...item, status: "published", publishedAtMs: Date.now() }; }
        return item;
      });
      audit(state, actor, "publish-week", "shift-plan", String(fromMs), null, { count });
      return { state, result: { count } };
    }),
    copyWeek: (actor, sourceWeekMs, targetWeekMs) => change(actor, "workforce.shift.write", (state) => {
      const source = startOfWeek(sourceWeekMs); const target = startOfWeek(targetWeekMs);
      assert(source !== target, "Vælg en anden mål-uge.");
      const sourceEnd = addLocalDays(source, 7); const deltaDays = Math.round((target - source) / 86_400_000);
      const copies = state.shifts.filter((item) => item.startMs >= source && item.startMs < sourceEnd && item.status !== "cancelled")
        .map((item) => ({ ...item, id: makeId("shift"), seriesId: makeId("copy"), status: "draft",
          startMs: addLocalDays(item.startMs, deltaDays), endMs: addLocalDays(item.endMs, deltaDays), copiedFromId: item.id }));
      for (const shift of copies) validateShift(shift, state.employees.find((item) => item.id === shift.employeeId));
      state.shifts.push(...copies);
      audit(state, actor, "copy-week", "shift-plan", String(source), null, { target, count: copies.length });
      return { state, result: copies };
    }),
    requestLeave: (actor, input) => change(actor, null, (state) => {
      assertPermission(actor, "workforce.self");
      assert(actor.employeeId === input.employeeId, "Man kan kun anmode om frihed for sig selv.");
      assert(["vacation", "personal", "timeOff"].includes(input.requestedType), "Denne fraværstype kan ikke selvbetjenes.");
      assert(input.toMs > input.fromMs, "Fraværets slut skal ligge efter start.");
      const leave = { ...clone(input), id: makeId("leave"), status: "pending", requestedAtMs: Date.now() };
      state.leaves.push(leave);
      audit(state, actor, "request", "leave", leave.id, null, leave);
      return { state, result: leave };
    }),
    registerLeave: (actor, input) => change(actor, "workforce.leave.write", (state) => {
      assertPermission(actor, "workforce.leave.sensitive");
      assert(input.toMs > input.fromMs, "Fraværets slut skal ligge efter start.");
      const leave = { ...clone(input), id: input.id || makeId("leave"), status: "approved", direct: true,
        decidedAtMs: Date.now(), decidedBy: actor.id };
      const before = input.id ? state.leaves.find((item) => item.id === input.id) : null;
      state.leaves = state.leaves.filter((item) => item.id !== leave.id).concat(leave);
      state.sensitiveLeave[leave.id] = { type: input.type, note: input.sensitiveNote || "" };
      syncLeaveReservation(state, leave);
      audit(state, actor, before ? "update" : "register", "leave", leave.id, before, leave, input.reason || null);
      return { state, result: { leave, conflicts: conflictsForLeave(state, leave) } };
    }),
    decideLeave: (actor, leaveId, decision, response = "") => change(actor, "workforce.leave.approve", (state) => {
      assert(["approved", "rejected"].includes(decision), "Afgørelsen skal være godkendt eller afvist.");
      const before = state.leaves.find((item) => item.id === leaveId);
      assert(before, "Anmodningen findes ikke.");
      if (before.status === decision) return { state, result: { leave: before, conflicts: conflictsForLeave(state, before), idempotent: true } };
      assert(before.status === "pending", "Anmodningen er allerede afgjort.");
      const after = { ...before, status: decision, type: decision === "approved" ? before.requestedType : undefined,
        response: String(response || "").trim(), decidedAtMs: Date.now(), decidedBy: actor.id };
      state.leaves = state.leaves.map((item) => item.id === leaveId ? after : item);
      if (decision === "approved") state.sensitiveLeave[leaveId] = { type: after.type, note: "" };
      syncLeaveReservation(state, after);
      audit(state, actor, "decide", "leave", leaveId, before, after);
      return { state, result: { leave: after, conflicts: conflictsForLeave(state, after), idempotent: false } };
    }),
    cancelLeave: (actor, leaveId, reason) => change(actor, "workforce.leave.write", (state) => {
      assert(String(reason || "").trim(), "Annullering kræver en begrundelse.");
      const before = state.leaves.find((item) => item.id === leaveId);
      assert(before, "Fraværet findes ikke.");
      const after = { ...before, status: "cancelled", cancelledAtMs: Date.now(), cancelledBy: actor.id };
      state.leaves = state.leaves.map((item) => item.id === leaveId ? after : item);
      syncLeaveReservation(state, after);
      audit(state, actor, "cancel", "leave", leaveId, before, after, reason.trim());
      return { state, result: after };
    }),
    saveSkill: (actor, input) => change(actor, "workforce.skill.write", (state) => {
      const before = input.id ? state.skills.find((item) => item.id === input.id) : null;
      const skill = { ...before, ...clone(input), id: input.id || makeId("skill") };
      assert(skill.employeeId && String(skill.type || "").trim(), "Kompetencen mangler medarbejder eller type.");
      state.skills = state.skills.filter((item) => item.id !== skill.id).concat(skill);
      audit(state, actor, before ? "update" : "create", "skill", skill.id, before, skill);
      return { state, result: skill };
    }),
    clockIn: (actor, employeeId, atMs = Date.now()) => change(actor, null, (state) => {
      assertPermission(actor, "workforce.self"); assert(actor.employeeId === employeeId, "Man kan kun stemple for sig selv.");
      assert(!state.timeEntries.some((item) => item.employeeId === employeeId && !Number.isFinite(item.outMs)), "Der findes allerede en åben stempling.");
      const entry = { id: makeId("time"), employeeId, inMs: atMs, outMs: null, breakMinutes: 0, source: "clock" };
      state.timeEntries.push(entry); audit(state, actor, "clock-in", "time", entry.id, null, entry);
      return { state, result: entry };
    }),
    clockOut: (actor, employeeId, { atMs = Date.now(), breakMinutes = 0 } = {}) => change(actor, null, (state) => {
      assertPermission(actor, "workforce.self"); assert(actor.employeeId === employeeId, "Man kan kun stemple for sig selv.");
      const before = [...state.timeEntries].reverse().find((item) => item.employeeId === employeeId && !Number.isFinite(item.outMs));
      assert(before, "Der findes ingen åben stempling."); assert(atMs > before.inMs && atMs - before.inMs <= 24 * 60 * 60_000, "Stemplingen skal slutte inden for 24 timer.");
      const after = { ...before, outMs: atMs, breakMinutes: Math.max(0, Number(breakMinutes) || 0) };
      state.timeEntries = state.timeEntries.map((item) => item.id === after.id ? after : item);
      audit(state, actor, "clock-out", "time", after.id, before, after);
      return { state, result: after };
    }),
    correctTime: (actor, input, reason) => change(actor, "workforce.time.correct", (state) => {
      assert(String(reason || "").trim(), "En timerettelse kræver en begrundelse.");
      const before = state.timeEntries.find((item) => item.id === input.id); assert(before, "Tidsregistreringen findes ikke.");
      assert(Number.isFinite(input.inMs) && Number.isFinite(input.outMs) && input.outMs > input.inMs, "Rettelsen har en ugyldig periode.");
      const after = { ...before, ...clone(input), correctedAtMs: Date.now(), correctedBy: actor.id };
      state.timeEntries = state.timeEntries.map((item) => item.id === after.id ? after : item);
      audit(state, actor, "correct", "time", after.id, before, after, reason.trim());
      return { state, result: after };
    }),
  };
}

export function createMemoryWorkforceRepository({ tenantId = "demo-transport", initialState } = {}) {
  let state = normalizedState(initialState ? clone(initialState) : createSeedState({ tenantId }), tenantId);
  const read = async () => clone(state);
  const mutate = async (fn) => {
    const outcome = fn(clone(state));
    state = normalizedState(outcome?.state || outcome, tenantId);
    return clone(outcome?.result ?? state);
  };
  return operations(tenantId, read, mutate);
}

function openDatabase(databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createIndexedDbWorkforceRepository({ databaseName = WORKFORCE_DB_NAME, tenantId = "demo-transport" } = {}) {
  let databasePromise;
  const db = () => (databasePromise ||= openDatabase(databaseName));
  const read = async () => {
    const database = await db(); const transaction = database.transaction(STORE, "readonly");
    return normalizedState(await requestValue(transaction.objectStore(STORE).get(tenantId)), tenantId);
  };
  const mutate = async (fn) => {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite"); const store = transaction.objectStore(STORE);
      let result;
      const get = store.get(tenantId);
      get.onsuccess = () => {
        try {
          const outcome = fn(normalizedState(get.result, tenantId));
          const state = normalizedState(outcome?.state || outcome, tenantId); result = outcome?.result ?? state;
          store.put(state, tenantId);
        } catch (error) { transaction.abort(); reject(error); }
      };
      get.onerror = () => reject(get.error);
      transaction.oncomplete = () => resolve(clone(result));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => { if (transaction.error) reject(transaction.error); };
    });
  };
  return operations(tenantId, read, mutate);
}
