import test from "node:test";
import assert from "node:assert/strict";
import { addLocalDays, localDateTimeMs, startOfWeek } from "../src/domain/workforceDomain.js";
import { createMemoryWorkforceRepository } from "../src/data/workforceRepository.js";

const manager = {
  id: "user-manager", tenantId: "demo-transport", employeeId: "emp-dennis",
  permissions: ["workforce.employee.read", "workforce.employee.write", "workforce.shift.write",
    "workforce.leave.write", "workforce.leave.approve", "workforce.leave.sensitive",
    "workforce.skill.write", "workforce.time.correct", "workforce.self"],
};
const employee = { id: "user-anne", tenantId: "demo-transport", employeeId: "emp-anne", permissions: ["workforce.self"] };

test("medarbejder uden login kan oprettes, redigeres og fratræde med historik", async () => {
  const repository = createMemoryWorkforceRepository();
  const created = await repository.saveEmployee(manager, { name: "Nora Jensen", status: "active", functions: ["Tekniker"], workplace: "Odense", employment: "Fastansat" });
  assert.equal(created.userId, undefined);
  await repository.saveEmployee(manager, { ...created, team: "Service" });
  const termination = await repository.terminateEmployee(manager, created.id, localDateTimeMs("2026-12-01", "00:00"), "Ansættelse ophørt");
  assert.equal(termination.employee.status, "terminated");
  const state = await repository.getState(manager);
  assert.equal(state.employees.filter((item) => item.id === created.id).length, 1);
  assert.equal(state.history.filter((item) => item.objectId === created.id).length, 3);
});

test("vagt kan gentages, en forekomst ændres alene og nattevagt gemmes", async () => {
  const repository = createMemoryWorkforceRepository(); const monday = startOfWeek();
  const shifts = await repository.saveShift(manager, { employeeId: "emp-anne", startMs: monday + 20 * 3_600_000,
    endMs: addLocalDays(monday, 1) + 4 * 3_600_000, breakMinutes: 45, status: "draft", workplace: "Kolding" }, { repeatWeeks: 2 });
  assert.equal(shifts.length, 3); assert.ok(shifts.every((item) => item.seriesId === shifts[0].seriesId));
  await repository.saveShift(manager, { ...shifts[1], startMs: shifts[1].startMs + 3_600_000, endMs: shifts[1].endMs + 3_600_000 });
  const state = await repository.getState(manager);
  assert.equal(state.shifts.find((item) => item.id === shifts[0].id).startMs, shifts[0].startMs);
  assert.equal(state.shifts.find((item) => item.id === shifts[1].id).startMs, shifts[1].startMs + 3_600_000);
});

test("fratrådt medarbejder kan ikke få en ny vagt efter fratrædelsen", async () => {
  const repository = createMemoryWorkforceRepository();
  await assert.rejects(repository.saveShift(manager, { employeeId: "emp-frank", startMs: localDateTimeMs("2026-10-01", "08:00"),
    endMs: localDateTimeMs("2026-10-01", "16:00"), breakMinutes: 30, status: "draft" }), /fratrådt/);
});

test("godkendelse er idempotent, viser konflikter og reservationen følger kun fraværet", async () => {
  const repository = createMemoryWorkforceRepository();
  const first = await repository.decideLeave(manager, "leave-pending", "approved", "Godkendt");
  assert.equal(first.idempotent, false); assert.equal(first.conflicts.assignments.length, 1);
  const second = await repository.decideLeave(manager, "leave-pending", "approved", "Godkendt");
  assert.equal(second.idempotent, true);
  let state = await repository.getState(manager);
  assert.equal(state.reservations.filter((item) => item.id === "leave:leave-pending").length, 1);
  const unrelated = state.reservations.find((item) => item.id === "leave:leave-approved");
  await repository.cancelLeave(manager, "leave-pending", "Plan ændret");
  state = await repository.getState(manager);
  assert.equal(state.reservations.some((item) => item.id === "leave:leave-pending"), false);
  assert.deepEqual(state.reservations.find((item) => item.id === unrelated.id), unrelated);
});

test("selvbetjening viser kun egen offentliggjorte plan og skjuler følsomt fravær", async () => {
  const repository = createMemoryWorkforceRepository(); const state = await repository.getState(employee);
  assert.deepEqual(state.employees.map((item) => item.id), ["emp-anne"]);
  assert.ok(state.shifts.every((item) => item.employeeId === "emp-anne" && item.status === "published"));
  assert.deepEqual(state.sensitiveLeave, {});
});

test("tenant-isolation og følsom permission håndhæves af repositorygrænsen", async () => {
  const repository = createMemoryWorkforceRepository();
  await assert.rejects(repository.getState({ ...manager, tenantId: "anden-kunde" }), /anden kundes data/);
  const withoutSensitive = await repository.getState({ ...manager, permissions: manager.permissions.filter((item) => item !== "workforce.leave.sensitive") });
  assert.deepEqual(withoutSensitive.sensitiveLeave, {});
});

test("egen ind- og udstempling er faktisk tid og lederrettelse kræver begrundelse", async () => {
  const repository = createMemoryWorkforceRepository();
  const inMs = Date.now(); const entry = await repository.clockIn(employee, "emp-anne", inMs);
  const closed = await repository.clockOut(employee, "emp-anne", { atMs: inMs + 8 * 3_600_000, breakMinutes: 30 });
  assert.equal(closed.id, entry.id); assert.equal(closed.breakMinutes, 30);
  await assert.rejects(repository.correctTime(manager, { ...closed, inMs: closed.inMs - 60_000 }, ""), /begrundelse/);
  await repository.correctTime(manager, { ...closed, inMs: closed.inMs - 60_000 }, "Rettet efter medarbejderens besked");
  const state = await repository.getState(manager);
  assert.equal(state.history.some((item) => item.objectId === closed.id && item.action === "correct"), true);
});
