import { activeLeave, availabilityFor, requirementResult } from "../domain/workforceDomain.js";

export const WORKFORCE_ROUTE_PREFIX = "/workforce";
export const WORKFORCE_EVENTS = {
  employeeChanged: "workforce.employee.changed.v1",
  availabilityChanged: "workforce.availability.changed.v1",
  shiftPublished: "workforce.shift.published.v1",
  skillChanged: "workforce.skill.changed.v1",
};

const STATUS_TO_PLATFORM = { active: "aktiv", leave: "orlov", terminated: "fratraadt" };

/** Samme person-id, kun navne-normalisering til den eksisterende platformskontrakt. */
export function toPlatformEmployee(employee) {
  if (!employee?.id) throw new Error("Medarbejderen mangler et fælles id.");
  return {
    id: employee.id,
    navn: employee.name,
    status: STATUS_TO_PLATFORM[employee.status],
    funktioner: Object.fromEntries(employee.functions.map((value) => [
      value.toLocaleLowerCase("da").replaceAll("ø", "oe").replaceAll("æ", "ae").replaceAll("å", "aa").replaceAll(" ", ""), true,
    ])),
    stationeret: employee.workplace,
    ansaettelsesform: employee.employment,
    ...(employee.phone ? { telefon: employee.phone } : {}),
    ...(employee.email ? { email: employee.email } : {}),
    ...(employee.userId ? { uid: employee.userId } : {}),
    ...(employee.terminatedAtMs ? { fratraadtMs: employee.terminatedAtMs } : {}),
  };
}

export function toPlanningWorkforceFacts(state) {
  return {
    employees: state.employees.map(toPlatformEmployee),
    shifts: state.shifts.filter((item) => item.status === "published").map((item) => ({ id: item.id, personId: item.employeeId, fraMs: item.startMs, tilMs: item.endMs })),
    leave: state.leaves.filter(activeLeave).map((item) => ({ id: item.id, personId: item.employeeId, fraMs: item.fromMs, tilMs: item.toMs })),
    skills: state.skills.map((item) => ({ id: item.id, personId: item.employeeId, type: item.type, udloeberMs: item.validUntilMs })),
  };
}

/** PLANNING kalder denne ved opgavens tidspunkt; en vagt er et arbejdsrum, ikke en konkurrerende opgave. */
export function checkPlanningAssignment(state, assignment) {
  const availability = availabilityFor(state, assignment.employeeId, assignment.startMs, assignment.endMs);
  const skills = requirementResult(state.skills, assignment.requirements, assignment.employeeId, assignment.startMs);
  const containingShift = state.shifts.find((shift) => shift.employeeId === assignment.employeeId && shift.status === "published"
    && shift.startMs <= assignment.startMs && shift.endMs >= assignment.endMs);
  return { available: availability.available, availability, skills, withinPublishedShift: Boolean(containingShift) };
}
