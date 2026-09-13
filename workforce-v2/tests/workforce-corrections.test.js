import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addLocalDays, localDateTimeMs, plannedMinutes, shiftsStartingInPeriod,
  staffingSnapshot, startOfWeek, timeRegistrationSummary,
} from "../src/domain/workforceDomain.js";
import { formatLeavePeriod } from "../src/domain/workforcePresentation.js";
import { createSeedState } from "../src/data/seed.js";

test("nattevagt vises på startdagen og samme vagt-id tælles kun én gang", () => {
  const monday = localDateTimeMs("2026-09-14", "00:00");
  const night = {
    id: "night-1", employeeId: "emp-camilla",
    startMs: localDateTimeMs("2026-09-14", "20:00"),
    endMs: localDateTimeMs("2026-09-15", "04:00"),
    breakMinutes: 45, status: "published",
  };
  const duplicatedInput = [night, { ...night }];
  assert.deepEqual(shiftsStartingInPeriod(duplicatedInput, "emp-camilla", monday, addLocalDays(monday, 1)).map((shift) => shift.id), ["night-1"]);
  assert.equal(shiftsStartingInPeriod(duplicatedInput, "emp-camilla", addLocalDays(monday, 1), addLocalDays(monday, 2)).length, 0);
  assert.equal(plannedMinutes(duplicatedInput, "emp-camilla", monday, addLocalDays(monday, 7)), 435);
});

test("timeoverblik sammenligner kun med offentliggjort plan og opgør kladder separat", () => {
  const now = localDateTimeMs("2026-09-17", "12:00");
  const state = createSeedState({ now });
  const week = startOfWeek(now);
  const summary = timeRegistrationSummary(state.shifts, state.timeEntries, "emp-anne", week, addLocalDays(week, 7), now);
  assert.equal(summary.plannedMinutes, 3 * 450);
  assert.equal(summary.draftMinutes, 450);
});

test("tidsstatus skelner ingen registrering, åben stempling og afsluttet registrering", () => {
  const week = localDateTimeMs("2026-09-14", "00:00");
  const shifts = [{
    id: "shift-1", employeeId: "emp-1", startMs: localDateTimeMs("2026-09-14", "08:00"),
    endMs: localDateTimeMs("2026-09-14", "16:00"), breakMinutes: 30, status: "published",
  }];
  const periodEnd = addLocalDays(week, 7);
  const afterShift = localDateTimeMs("2026-09-14", "18:00");
  const none = timeRegistrationSummary(shifts, [], "emp-1", week, periodEnd, afterShift);
  assert.equal(none.registrationState, "none");
  assert.equal(none.missingShiftCount, 1);
  const open = timeRegistrationSummary(shifts, [{ id: "time-1", employeeId: "emp-1", inMs: localDateTimeMs("2026-09-14", "08:02"), outMs: null, breakMinutes: 0 }], "emp-1", week, periodEnd, afterShift);
  assert.equal(open.registrationState, "open");
  const completed = timeRegistrationSummary(shifts, [{ id: "time-1", employeeId: "emp-1", inMs: localDateTimeMs("2026-09-14", "08:02"), outMs: localDateTimeMs("2026-09-14", "15:58"), breakMinutes: 30 }], "emp-1", week, periodEnd, afterShift);
  assert.equal(completed.registrationState, "completed");
  assert.equal(completed.missingShiftCount, 0);
});

test("dagens bemanding holder offentliggjort, kladde og faktisk indstempling adskilt", () => {
  const day = localDateTimeMs("2026-09-14", "00:00");
  const atMs = localDateTimeMs("2026-09-14", "10:00");
  const state = {
    shifts: [
      { id: "published", employeeId: "emp-1", startMs: day, endMs: addLocalDays(day, 1), status: "published" },
      { id: "draft", employeeId: "emp-2", startMs: day, endMs: addLocalDays(day, 1), status: "draft" },
    ],
    timeEntries: [{ id: "time", employeeId: "emp-3", inMs: localDateTimeMs("2026-09-14", "09:00"), outMs: null }],
  };
  const snapshot = staffingSnapshot(state, day, addLocalDays(day, 1), atMs);
  assert.equal(snapshot.publishedEmployeeCount, 1);
  assert.equal(snapshot.draftEmployeeCount, 1);
  assert.deepEqual(snapshot.currentlyClockedEmployeeIds, ["emp-3"]);
});

test("heldagsfravær vises med inklusive datoer, mens deltid viser klokkeslæt", () => {
  const fullDay = formatLeavePeriod({
    fromMs: localDateTimeMs("2026-09-14", "00:00"),
    toMs: localDateTimeMs("2026-09-16", "00:00"),
    partialDay: false,
  });
  assert.match(fullDay, /14\. sep\. 2026/);
  assert.match(fullDay, /15\. sep\. 2026/);
  assert.doesNotMatch(fullDay, /16\. sep\. 2026|00[.:]00/);
  const partial = formatLeavePeriod({
    fromMs: localDateTimeMs("2026-09-14", "08:30"),
    toMs: localDateTimeMs("2026-09-14", "12:15"),
    partialDay: true,
  });
  assert.match(partial, /08[.:]30/);
  assert.match(partial, /12[.:]15/);
});

test("Vis som er kun tilgængelig uden en autentificeret actor", () => {
  const source = readFileSync(new URL("../src/WorkforceV2App.jsx", import.meta.url), "utf8");
  assert.match(source, /!actorProp\s*&&\s*<label className="wf-role">Vis som/);
  assert.match(source, /const actor = actorProp \|\|/);
});
