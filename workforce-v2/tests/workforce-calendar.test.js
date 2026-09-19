import test from "node:test";
import assert from "node:assert/strict";
import {
  addLocalMonths, filterCalendarEmployees, isoWeekInfo, movePeriod, periodForView,
  periodLabel, reconcilePersonIds, weeksIntersectingMonth,
} from "../src/domain/workforceCalendar.js";
import { localDateTimeMs, toLocalDateKey } from "../src/domain/workforceDomain.js";

test("ISO-uger håndterer uge 53 og et årsskifte", () => {
  assert.deepEqual(isoWeekInfo(localDateTimeMs("2020-12-31", "12:00")), { week: 53, year: 2020 });
  assert.deepEqual(isoWeekInfo(localDateTimeMs("2021-01-01", "12:00")), { week: 53, year: 2020 });
  assert.deepEqual(isoWeekInfo(localDateTimeMs("2021-01-04", "12:00")), { week: 1, year: 2021 });
});

test("ugeperioden begynder mandag og ugeetiketten viser intervallet", () => {
  const anchor = localDateTimeMs("2026-09-17", "12:00");
  const period = periodForView("week", anchor);
  assert.equal(toLocalDateKey(period.startMs), "2026-09-14");
  assert.equal(toLocalDateKey(period.endMs), "2026-09-21");
  assert.match(periodLabel("week", anchor), /^Uge 38 ·/);
});

test("visningsskift og periodeskift bevarer en gyldig valgt dato", () => {
  const january31 = localDateTimeMs("2026-01-31", "12:00");
  assert.equal(toLocalDateKey(addLocalMonths(january31, 1)), "2026-02-28");
  assert.equal(toLocalDateKey(movePeriod("month", january31, 1)), "2026-02-28");
  assert.equal(toLocalDateKey(movePeriod("day", january31, 1)), "2026-02-01");
});

test("ugevælgeren medtager uger, der krydser måneds- og årsskifte", () => {
  const weeks = weeksIntersectingMonth(localDateTimeMs("2021-01-15", "12:00"));
  assert.deepEqual({ week: weeks[0].week, year: weeks[0].year }, { week: 53, year: 2020 });
  assert.ok(weeks.some((item) => item.week === 1 && item.year === 2021));
});

test("kombinerede afdelings- og personfiltre fjerner skjulte modstridende valg", () => {
  const employees = [
    { id: "a", name: "A", department: "Drift", status: "active" },
    { id: "b", name: "B", department: "Kontor", status: "active" },
    { id: "c", name: "C", department: "Drift", status: "terminated" },
  ];
  assert.deepEqual(reconcilePersonIds(["a", "b"], employees, ["Drift"]), ["a"]);
  assert.deepEqual(filterCalendarEmployees(employees, { departments: ["Drift"], people: ["a"] }).map((item) => item.id), ["a"]);
});
