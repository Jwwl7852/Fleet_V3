import test from "node:test";
import assert from "node:assert/strict";
import { createSeedState } from "../src/data/seed.js";
import { checkPlanningAssignment, toPlanningWorkforceFacts, toPlatformEmployee } from "../src/data/veyroIntegration.js";

test("fælles medarbejder-id bevares i platform- og PLANNING-kontrakten", () => {
  const state = createSeedState(); const employee = state.employees[0]; const platform = toPlatformEmployee(employee); const facts = toPlanningWorkforceFacts(state);
  assert.equal(platform.id, employee.id); assert.equal(platform.uid, employee.userId);
  assert.equal(facts.shifts.every((item) => item.personId), true);
  assert.equal(facts.leave.every((item) => item.personId), true);
});

test("PLANNING-opgave inden i vagten er ikke dobbeltbooking mod vagten", () => {
  const state = createSeedState(); const assignment = state.planningAssignments.find((item) => item.id === "task-101");
  const result = checkPlanningAssignment(state, assignment);
  assert.equal(result.available, true); assert.equal(result.withinPublishedShift, true); assert.equal(result.skills.ok, true);
});

test("PLANNING får utilgængelighed men ingen følsom fraværsårsag", () => {
  const state = createSeedState(); const facts = toPlanningWorkforceFacts(state);
  assert.equal(facts.leave.length, 1); assert.equal("type" in facts.leave[0], false); assert.equal("note" in facts.leave[0], false);
});
