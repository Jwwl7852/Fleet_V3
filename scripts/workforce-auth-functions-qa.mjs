/* Autoriseret WORKFORCE-runtime-QA gennem Auth, Functions og RTDB.
 * Alle værter skal være lokale og alle data er syntetiske. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PROJECT_ID,
  DATABASE_NAMESPACE,
  SYNTHETIC_PASSWORD,
  TENANT_A,
  TEST_USERS,
  seedWorkforceAuthEmulator,
} from "./workforce-auth-emulator-seed.mjs";

const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9119",
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9020",
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5022",
};
for (const [name, host] of Object.entries(hosts)) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal være en lokal emulator.`);
assert.ok(PROJECT_ID.startsWith("demo-"), "Projektet skal være syntetisk.");
const functionBase = `http://${hosts.functions}/${PROJECT_ID}/europe-west1`;
const databaseBase = `http://${hosts.database}`;
const outputDir = path.resolve(process.argv[2] || "artifacts/workforce-v2/runtime");
await mkdir(outputDir, { recursive: true });
const users = await seedWorkforceAuthEmulator();

async function signIn(email) {
  const response = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body.idToken;
}

async function callable(name, data, token, { fail = false } = {}) {
  const response = await fetch(`${functionBase}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({}));
  if (fail) {
    assert.notEqual(response.status, 200, `${name} skulle være afvist`);
    return { status: response.status, error: body.error || body };
  }
  assert.equal(response.status, 200, `${name}: ${JSON.stringify(body)}`);
  return body.result;
}

async function clientRead(tenant, pathname, token, { fail = false } = {}) {
  const response = await fetch(`${databaseBase}/tenants/${tenant}/${pathname}.json?ns=${DATABASE_NAMESPACE}&auth=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({}));
  if (fail) {
    assert.equal(response.ok, false, `${tenant}/${pathname} skulle være afvist: ${JSON.stringify(body)}`);
    return null;
  }
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

async function adminRead(tenant, pathname) {
  const response = await fetch(`${databaseBase}/tenants/${tenant}/${pathname}.json?ns=${DATABASE_NAMESPACE}`, { headers: { authorization: "Bearer owner" } });
  const raw = await response.text();
  assert.equal(response.ok, true, raw);
  return raw ? JSON.parse(raw) : null;
}

const employee = await signIn(TEST_USERS.employee.email);
const managerA = await signIn(TEST_USERS.manager.email);
const managerB = await signIn(TEST_USERS.manager.email);
const hr = await signIn(TEST_USERS.hr.email);
const outscope = await signIn(TEST_USERS.outscope.email);
const unauthorized = await signIn(TEST_USERS.unauthorized.email);
const foreign = await signIn(TEST_USERS.foreign.email);
const noModule = await signIn(TEST_USERS.noModule.email);

const fromMs = Date.parse("2032-09-15T00:00:00Z");
const toMs = Date.parse("2032-09-16T00:00:00Z");
const requestPayload = {
  operation: "requestLeave",
  requestId: "wf-auth-request-one",
  args: { input: { employeeId: "week-employee-anna", fromMs, toMs, requestedType: "vacation", employeeNote: "Syntetisk privat note" } },
};
const requested = await callable("workforcekommando", requestPayload, employee);
const requestedRetry = await callable("workforcekommando", requestPayload, employee);
assert.deepEqual(requestedRetry, requested, "gentaget request-id skal give samme resultat");
assert.equal(Object.keys(await adminRead(TENANT_A, "fravaer")).length, 1);

const managerProjection = await callable("workforceprojektionhent", {}, managerA);
const managerLeave = managerProjection.state.leaves.find((leave) => leave.id === requested.result.id);
assert.equal(managerLeave.requestedType ?? null, null);
assert.equal(managerLeave.employeeNote ?? null, null);
const employeeProjectionBefore = await callable("workforceprojektionhent", {}, employee);
assert.equal(employeeProjectionBefore.state.leaves[0].requestedType, "vacation");
assert.equal(employeeProjectionBefore.state.leaves[0].employeeNote, "Syntetisk privat note");
await callable("workforcekommando", { operation: "decideLeave", requestId: "wf-auth-self-approve", args: { leaveId: requested.result.id, decision: "approved", expectedVersion: 1 } }, employee, { fail: true });

const decisionPayload = { operation: "decideLeave", requestId: "wf-auth-approve-one", args: { leaveId: requested.result.id, decision: "approved", response: "Godkendt i syntetisk QA", expectedVersion: 1 } };
const decided = await callable("workforcekommando", decisionPayload, managerA);
const decisionRetry = await callable("workforcekommando", decisionPayload, managerB);
assert.deepEqual(decisionRetry, decided);
const reservationId = `res-${requested.result.id}`;
const reservations = await adminRead(TENANT_A, "reservationer/medarbejder/week-employee-anna");
assert.deepEqual(Object.keys(reservations), [reservationId]);

const employeeProjectionAfter = await callable("workforceprojektionhent", {}, employee);
const employeeLeave = employeeProjectionAfter.state.leaves.find((leave) => leave.id === requested.result.id);
assert.equal(employeeLeave.status, "approved");
assert.equal(employeeLeave.response, "Godkendt i syntetisk QA");

const planningBlocked = await callable("workforceplanningtjek", {
  employeeId: "week-employee-anna",
  startMs: Date.parse("2032-09-15T09:00:00Z"),
  endMs: Date.parse("2032-09-15T10:00:00Z"),
  requirements: ["SERVICE"],
}, managerA);
assert.equal(planningBlocked.available, false);
assert.equal(planningBlocked.leaveConflict.id, reservationId);
assert.equal(JSON.stringify(planningBlocked).includes("ferie"), false, "PLANNING må ikke få fraværsårsag");
await callable("workforceplanningtjek", { employeeId: "week-employee-anna", startMs: fromMs, endMs: fromMs + 3_600_000 }, unauthorized, { fail: true });
await clientRead(TENANT_A, "personale", foreign, { fail: true });
for (const node of ["workforceGodkendelsesomfang", "_workforceAnmodninger", "_workforceVersioner", "workforceEvents"]) {
  await clientRead(TENANT_A, node, managerA, { fail: true });
}
await clientRead(TENANT_A, "vagter", unauthorized, { fail: true });

// Godkendelsespermission uden eksplicit omfang og to samtidige afgørelser.
const concurrentRequest = await callable("workforcekommando", {
  operation: "requestLeave",
  requestId: "wf-auth-concurrent-request",
  args: { input: { employeeId: "week-employee-anna", fromMs: Date.parse("2032-09-18T00:00:00Z"), toMs: Date.parse("2032-09-19T00:00:00Z"), requestedType: "personal" } },
}, employee);
await callable("workforcekommando", { operation: "decideLeave", requestId: "wf-auth-outscope", args: { leaveId: concurrentRequest.result.id, decision: "approved", expectedVersion: 1 } }, outscope, { fail: true });
const concurrent = await Promise.allSettled([
  callable("workforcekommando", { operation: "decideLeave", requestId: "wf-auth-concurrent-a", args: { leaveId: concurrentRequest.result.id, decision: "approved", expectedVersion: 1 } }, managerA),
  callable("workforcekommando", { operation: "decideLeave", requestId: "wf-auth-concurrent-b", args: { leaveId: concurrentRequest.result.id, decision: "rejected", expectedVersion: 1 } }, managerB),
]);
assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);

// To overlappende fravær: annullering af den ene må ikke gøre perioden ledig.
for (const [id, startHour, endHour] of [["wf-direct-a", 8, 12], ["wf-direct-b", 10, 14]]) {
  await callable("workforcekommando", {
    operation: "registerLeave",
    requestId: `register-${id}`,
    args: { input: { id, employeeId: "week-employee-bo", fromMs: Date.parse(`2032-09-20T${String(startHour).padStart(2, "0")}:00:00Z`), toMs: Date.parse(`2032-09-20T${String(endHour).padStart(2, "0")}:00:00Z`), type: "timeOff" } },
  }, hr);
}
await callable("workforcekommando", { operation: "cancelLeave", requestId: "cancel-direct-a", args: { leaveId: "wf-direct-a", reason: "Syntetisk ændring", expectedVersion: 1 } }, hr);
const stillBlocked = await callable("workforceplanningtjek", { employeeId: "week-employee-bo", startMs: Date.parse("2032-09-20T10:30:00Z"), endMs: Date.parse("2032-09-20T11:00:00Z") }, managerA);
assert.equal(stillBlocked.available, false);
await callable("workforcekommando", { operation: "cancelLeave", requestId: "cancel-direct-b", args: { leaveId: "wf-direct-b", reason: "Syntetisk ændring", expectedVersion: 1 } }, hr);
const nowAvailable = await callable("workforceplanningtjek", { employeeId: "week-employee-bo", startMs: Date.parse("2032-09-20T10:30:00Z"), endMs: Date.parse("2032-09-20T11:00:00Z") }, managerA);
assert.equal(nowAvailable.available, true);

// Flyt et registreret fravær til anden medarbejder og periode; gammel fysisk
// reservation skal fjernes atomisk.
const moving = await callable("workforcekommando", { operation: "registerLeave", requestId: "register-moving", args: { input: { id: "wf-moving", employeeId: "week-employee-anna", fromMs: Date.parse("2032-09-22T08:00:00Z"), toMs: Date.parse("2032-09-22T10:00:00Z"), type: "vacation" } } }, hr);
await callable("workforcekommando", { operation: "registerLeave", requestId: "update-moving", args: { input: { id: "wf-moving", employeeId: "week-employee-bo", fromMs: Date.parse("2032-09-23T08:00:00Z"), toMs: Date.parse("2032-09-23T10:00:00Z"), type: "vacation", version: moving.result.version } } }, hr);
assert.equal(await adminRead(TENANT_A, "reservationer/medarbejder/week-employee-anna/res-wf-moving"), null);
assert.ok(await adminRead(TENANT_A, "reservationer/medarbejder/week-employee-bo/res-wf-moving"));

// Gentaget nattevagt, publicering og tids-/kompetencekontrol.
const shifts = await callable("workforcekommando", { operation: "saveShift", requestId: "wf-shift-series", args: { input: { employeeId: "week-employee-anna", startMs: Date.parse("2032-09-24T20:00:00Z"), endMs: Date.parse("2032-09-25T04:00:00Z"), breakMinutes: 45, status: "draft" }, options: { repeatWeeks: 2 } } }, managerA);
assert.equal(shifts.result.length, 3);
await callable("workforcekommando", { operation: "publishWeek", requestId: "wf-publish-week", args: { weekMs: Date.parse("2032-09-20T00:00:00Z") } }, managerA);
const insideShift = await callable("workforceplanningtjek", { employeeId: "week-employee-anna", startMs: Date.parse("2032-09-24T21:00:00Z"), endMs: Date.parse("2032-09-24T22:00:00Z"), requirements: ["SERVICE"] }, managerA);
assert.equal(insideShift.available, true);
assert.equal(insideShift.withinPublishedShift, true);
const afterCertificateExpiry = await callable("workforceplanningtjek", { employeeId: "week-employee-anna", startMs: Date.parse("2033-02-01T09:00:00Z"), endMs: Date.parse("2033-02-01T10:00:00Z"), requirements: ["SERVICE"] }, managerA);
assert.deepEqual(afterCertificateExpiry.missingSkills, ["SERVICE"]);

const clockedIn = await callable("workforcekommando", { operation: "clockIn", requestId: "wf-clock-in", args: { employeeId: "week-employee-anna", atMs: Date.parse("2032-09-24T20:00:00Z") } }, employee);
const clockedOut = await callable("workforcekommando", { operation: "clockOut", requestId: "wf-clock-out", args: { employeeId: "week-employee-anna", options: { atMs: Date.parse("2032-09-25T04:00:00Z"), breakMinutes: 45 } } }, employee);
assert.equal(clockedIn.result.version, 1);
assert.equal(clockedOut.result.version, 2);

const baseProjection = await callable("workforceprojektionhent", {}, noModule);
assert.equal(baseProjection.workforceEnabled, false);
assert.equal(baseProjection.state.employees.length, 1, "fælles medarbejderstamme skal bestå uden WORKFORCE");
await callable("workforcekommando", { operation: "saveShift", requestId: "wf-no-module-write", args: { input: { employeeId: "wf-base-001", startMs: fromMs, endMs: fromMs + 3_600_000 } } }, noModule, { fail: true });

const events = await adminRead(TENANT_A, "workforceEvents");
assert.equal(events["cancel-direct-a-current"].available, false, "overlappende fravær skal fortsat blokere efter første annullering");
assert.equal(events["cancel-direct-b-current"].available, true, "sidste annullering skal genberegne tilgængelighed");

const proof = {
  generatedAt: new Date().toISOString(),
  projectId: PROJECT_ID,
  environment: "isolated Firebase Emulator Suite",
  identities: {
    employeeUid: users.employee.uid,
    managerUid: users.manager.uid,
    sharedTenantId: TENANT_A,
    separateAuthenticatedSessions: true,
  },
  leave: {
    id: requested.result.id,
    reservationId,
    requestRetryDidNotDuplicate: true,
    decisionRetryDidNotDuplicate: true,
    employeeSawReply: true,
    managerProjectionRedactedSensitiveFields: true,
    overlapRecalculatedOnCancellation: true,
    oldReservationRemovedAfterEmployeeAndPeriodChange: true,
  },
  security: {
    outOfScopeDenied: true,
    missingPermissionDenied: true,
    foreignTenantDenied: true,
    serverInternalNodesDenied: true,
    oneConcurrentDecisionAccepted: true,
  },
  planning: {
    sameBackendLeaveBlockedAssignment: true,
    reasonNotDisclosed: true,
    publishedShiftIsNotAConflict: true,
    skillCheckedAtAssignmentTime: true,
  },
  moduleGate: { commonPersonnelWithoutWorkforce: true, workforceWriteWithoutSubscriptionDenied: true },
  certificateUpload: { verified: false, limitation: "Checkpointet indeholder kun dokumentreference; egentlig Storage-upload er ikke implementeret." },
};
await writeFile(path.join(outputDir, "WORKFORCE_AUTH_FUNCTIONS_BEVIS.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
