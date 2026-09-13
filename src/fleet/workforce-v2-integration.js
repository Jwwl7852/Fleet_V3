import { kaldFunktion } from "../firebase.js";
import { harPerm } from "./permissions.js";

export const WORKFORCE_V2_ROUTE_PREFIX = "/workforce-v2";

export const WORKFORCE_V2_PAGES = Object.freeze({
  overview: "",
  employees: "medarbejdere",
  schedule: "bemanding",
  leave: "fravaer",
  skills: "kompetencer",
  time: "timer",
  self: "min-arbejdsdag",
});

export function workforceV2PageForPath(pathname = "") {
  const tail = pathname.replace(/^\/workforce-v2\/?/, "").split("/")[0];
  return Object.entries(WORKFORCE_V2_PAGES).find(([, path]) => path === tail)?.[0] || "overview";
}

export function workforceV2PathForPage(page) {
  const tail = WORKFORCE_V2_PAGES[page] ?? "";
  return `${WORKFORCE_V2_ROUTE_PREFIX}${tail ? `/${tail}` : ""}`;
}

export function workforceV2ActorFromUser(bruger, employeeId = null) {
  const permissions = [];
  if (harPerm(bruger?.perms, "vagter.laes")) permissions.push("workforce.employee.read");
  if (harPerm(bruger?.perms, "personale.skriv")) permissions.push("workforce.employee.write");
  if (harPerm(bruger?.perms, "vagter.skriv")) permissions.push("workforce.shift.write");
  if (harPerm(bruger?.perms, "fravaer.skriv")) permissions.push("workforce.leave.write", "workforce.leave.approve");
  if (harPerm(bruger?.perms, "fravaer.sensitiveLaes")) permissions.push("workforce.leave.sensitive");
  if (harPerm(bruger?.perms, "kompetencer.skriv")) permissions.push("workforce.skill.write");
  if (harPerm(bruger?.perms, "stemplinger.rette")) permissions.push("workforce.time.correct");
  if (employeeId) permissions.push("workforce.self");
  return {
    id: bruger?.uid,
    tenantId: bruger?.tenant,
    employeeId,
    name: bruger?.navn || bruger?.email || "Ukendt bruger",
    permissions,
  };
}

function payload(operation, args) {
  return { operation, args, requestId: crypto.randomUUID() };
}

export function createFirebaseWorkforceRepository() {
  let latestState = null;
  const versionFor = (collection, id, employeeId = null) => {
    const rows = latestState?.[collection] || [];
    return rows.find((row) => row.id === id && (!employeeId || row.employeeId === employeeId))?.version ?? null;
  };
  const command = async (operation, args = {}) => {
    const response = await kaldFunktion("workforcekommando", payload(operation, args));
    return response?.data?.result ?? response?.data ?? null;
  };
  return {
    async getState() {
      const response = await kaldFunktion("workforceprojektionhent", {});
      latestState = response?.data?.state;
      return latestState;
    },
    reset: () => Promise.reject(new Error("Serverdata kan ikke nulstilles fra WORKFORCE-skærmen.")),
    saveEmployee: (_actor, input) => command("saveEmployee", { input }),
    terminateEmployee: (_actor, employeeId, terminatedAtMs, reason) => command("terminateEmployee", { employeeId, terminatedAtMs, reason }),
    saveShift: (_actor, input, options = {}) => command("saveShift", { input, options }),
    cancelShift: (_actor, shiftId, reason) => command("cancelShift", { shiftId, reason, expectedVersion: versionFor("shifts", shiftId) }),
    publishWeek: (_actor, weekMs) => command("publishWeek", { weekMs }),
    copyWeek: (_actor, sourceWeekMs, targetWeekMs) => command("copyWeek", { sourceWeekMs, targetWeekMs }),
    requestLeave: (_actor, input) => command("requestLeave", { input }),
    registerLeave: (_actor, input) => command("registerLeave", { input }),
    decideLeave: (_actor, leaveId, decision, response = "") => command("decideLeave", { leaveId, decision, response, expectedVersion: versionFor("leaves", leaveId) }),
    cancelLeave: (_actor, leaveId, reason) => command("cancelLeave", { leaveId, reason, expectedVersion: versionFor("leaves", leaveId) }),
    saveSkill: (_actor, input) => command("saveSkill", { input }),
    clockIn: (_actor, employeeId, atMs) => command("clockIn", { employeeId, atMs }),
    clockOut: (_actor, employeeId, options = {}) => command("clockOut", { employeeId, options }),
    correctTime: (_actor, input, reason) => command("correctTime", { input, reason }),
  };
}

export async function workforcePlanningCheck(assignment) {
  const response = await kaldFunktion("workforceplanningtjek", assignment);
  return response?.data ?? null;
}
