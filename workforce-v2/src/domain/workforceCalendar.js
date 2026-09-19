import { addLocalDays, startOfLocalDay, startOfWeek, toLocalDateKey } from "./workforceDomain.js";

export const CALENDAR_VIEWS = Object.freeze(["day", "week", "month", "year"]);

const monthFormatter = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long" });

const capitalize = (value) => value ? `${value[0].toLocaleUpperCase("da-DK")}${value.slice(1)}` : value;

export function startOfMonth(ms = Date.now()) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export function startOfYear(ms = Date.now()) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), 0, 1).getTime();
}

export function addLocalMonths(ms, months) {
  const source = new Date(ms);
  const targetDay = source.getDate();
  const result = new Date(source.getFullYear(), source.getMonth() + months, 1, source.getHours(), source.getMinutes(), 0, 0);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(targetDay, lastDay));
  return result.getTime();
}

export function addLocalYears(ms, years) {
  const source = new Date(ms);
  const result = new Date(source.getFullYear() + years, source.getMonth(), 1, source.getHours(), source.getMinutes(), 0, 0);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(source.getDate(), lastDay));
  return result.getTime();
}

export function isoWeekInfo(ms = Date.now()) {
  const local = new Date(ms);
  const utc = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  return { week: Math.ceil((((utc - yearStart) / 86_400_000) + 1) / 7), year };
}

export function periodForView(view, anchorMs = Date.now()) {
  const safeView = CALENDAR_VIEWS.includes(view) ? view : "week";
  const startMs = safeView === "day" ? startOfLocalDay(anchorMs)
    : safeView === "week" ? startOfWeek(anchorMs)
      : safeView === "month" ? startOfMonth(anchorMs) : startOfYear(anchorMs);
  const endMs = safeView === "day" ? addLocalDays(startMs, 1)
    : safeView === "week" ? addLocalDays(startMs, 7)
      : safeView === "month" ? addLocalMonths(startMs, 1) : addLocalYears(startMs, 1);
  return { view: safeView, startMs, endMs };
}

export function movePeriod(view, anchorMs, direction) {
  if (view === "day") return addLocalDays(anchorMs, direction);
  if (view === "week") return addLocalDays(anchorMs, 7 * direction);
  if (view === "month") return addLocalMonths(anchorMs, direction);
  return addLocalYears(anchorMs, direction);
}

export function periodLabel(view, anchorMs) {
  if (view === "day") return capitalize(fullDateFormatter.format(anchorMs));
  if (view === "week") {
    const start = startOfWeek(anchorMs);
    const end = addLocalDays(start, 6);
    const { week } = isoWeekInfo(anchorMs);
    const startYear = new Date(start).getFullYear();
    const endYear = new Date(end).getFullYear();
    const startLabel = shortDateFormatter.format(start);
    const endLabel = shortDateFormatter.format(end);
    return `Uge ${week} · ${startLabel}–${endLabel}${startYear === endYear ? ` ${endYear}` : ` ${startYear}/${endYear}`}`;
  }
  if (view === "month") return capitalize(monthFormatter.format(anchorMs));
  return String(new Date(anchorMs).getFullYear());
}

export function daysInPeriod(view, anchorMs) {
  const { startMs, endMs } = periodForView(view, anchorMs);
  const result = [];
  for (let day = startMs; day < endMs; day = addLocalDays(day, 1)) result.push(day);
  return result;
}

export function monthCalendarDays(anchorMs) {
  const monthStart = startOfMonth(anchorMs);
  const calendarStart = startOfWeek(monthStart);
  const monthEnd = addLocalMonths(monthStart, 1);
  const calendarEnd = addLocalDays(startOfWeek(addLocalDays(monthEnd, 6)), 7);
  const days = [];
  for (let day = calendarStart; day < calendarEnd; day = addLocalDays(day, 1)) days.push(day);
  return days;
}

export function weeksIntersectingMonth(anchorMs) {
  const monthStart = startOfMonth(anchorMs);
  const monthEnd = addLocalMonths(monthStart, 1);
  const result = [];
  for (let week = startOfWeek(monthStart); week < monthEnd; week = addLocalDays(week, 7)) {
    result.push({ startMs: week, endMs: addLocalDays(week, 7), ...isoWeekInfo(week) });
  }
  return result;
}

export function calendarCategoryId(leave, sensitiveLeave = {}) {
  return sensitiveLeave?.[leave.id]?.type || leave.type || leave.requestedType || "leave";
}

export function reconcilePersonIds(selectedPersonIds, employees, selectedDepartments) {
  const departments = new Set(selectedDepartments || []);
  const allowed = new Set(employees.filter((employee) => departments.size === 0 || departments.has(employee.department || employee.workplace)).map((employee) => employee.id));
  return (selectedPersonIds || []).filter((id) => allowed.has(id));
}

export function filterCalendarEmployees(employees, { departments = [], people = [] } = {}) {
  const departmentSet = new Set(departments);
  const peopleSet = new Set(people);
  return employees.filter((employee) => employee.status !== "terminated"
    && (departmentSet.size === 0 || departmentSet.has(employee.department || employee.workplace))
    && (peopleSet.size === 0 || peopleSet.has(employee.id)));
}

export function dateKey(ms) {
  return toLocalDateKey(startOfLocalDay(ms));
}
