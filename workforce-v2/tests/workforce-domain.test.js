import test from "node:test";
import assert from "node:assert/strict";
import {
  addLocalDays, availabilityFor, localDateTimeMs, plannedMinutes, recordedMinutes,
  requirementResult, shiftMinutes, startOfWeek,
} from "../src/domain/workforceDomain.js";
import { createSeedState } from "../src/data/seed.js";

test("lokale kalenderdage håndterer sommertid uden at antage 24 timer", () => {
  const before = localDateTimeMs("2026-10-24", "08:00");
  const after = addLocalDays(before, 1);
  assert.equal(new Date(after).getHours(), 8);
  assert.equal(new Date(after).getDate(), 25);
});

test("en nattevagt beregnes på den gemte periode og pause", () => {
  const startMs = localDateTimeMs("2026-09-14", "20:00");
  const endMs = localDateTimeMs("2026-09-15", "04:00");
  assert.equal(shiftMinutes({ startMs, endMs, breakMinutes: 45 }), 435);
});

test("planlagte og faktiske minutter forbliver to forskellige mål", () => {
  const state = createSeedState(); const week = startOfWeek(); const end = addLocalDays(week, 7);
  const planned = plannedMinutes(state.shifts, "emp-anne", week, end, { publishedOnly: true });
  const actual = recordedMinutes(state.timeEntries, "emp-anne", week, end);
  assert.notEqual(planned, actual);
  assert.ok(planned > actual);
});

test("godkendt fravær styrer tilgængelighed uden at afsløre årsagen", () => {
  const state = createSeedState(); const leave = state.leaves.find((item) => item.id === "leave-approved");
  assert.deepEqual(availabilityFor(state, leave.employeeId, leave.fromMs, leave.toMs), {
    available: false, reason: "Medarbejderen har registreret fravær.", leaveId: leave.id,
  });
});

test("kompetencekrav vurderes på opgavens tidspunkt og pr. kravtype", () => {
  const state = createSeedState();
  const beforeExpiry = requirementResult(state.skills, { blocking: ["ADR"], warnings: ["Kundekursus"] }, "emp-anne", localDateTimeMs("2026-10-01", "12:00"));
  const afterExpiry = requirementResult(state.skills, { blocking: ["ADR"], warnings: [] }, "emp-anne", localDateTimeMs("2026-11-01", "12:00"));
  assert.equal(beforeExpiry.ok, true);
  assert.deepEqual(beforeExpiry.warnings.missing, ["Kundekursus"]);
  assert.equal(afterExpiry.ok, false);
  assert.deepEqual(afterExpiry.blocking.expired, ["ADR"]);
});
