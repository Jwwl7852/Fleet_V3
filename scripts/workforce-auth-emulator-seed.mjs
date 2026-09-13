/* Syntetisk seed til WORKFORCE-integration. Scriptet accepterer kun lokale
 * emulatorhosts og demo-projekter og sletter ikke andre lokale brugere. */
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import {
  CLAIM_PERMISSION_VERSION,
  kompaktPermStreng,
  PERM,
} from "../src/fleet/permissions.js";

export const PROJECT_ID = process.env.WORKFORCE_QA_PROJECT_ID || "demo-veyro-workforce-test";
// Functions-emulatorens Admin SDK bruger projekt-id'et som runtime-namespace.
export const DATABASE_NAMESPACE = PROJECT_ID;
export const TENANT_A = "workforce-auth-a";
export const TENANT_B = "workforce-auth-b";
export const TENANT_NO_MODULE = "workforce-auth-no-module";
export const SYNTHETIC_PASSWORD = process.env.WORKFORCE_QA_PASSWORD;

if (!PROJECT_ID.startsWith("demo-")) throw new Error("WORKFORCE-QA kræver et demo-projekt.");
if (!SYNTHETIC_PASSWORD) throw new Error("WORKFORCE_QA_PASSWORD skal sættes proceslokalt til emulator-QA.");

const managerPermissions = [
  PERM.personaleLaes,
  PERM.personaleSkriv,
  PERM.fravaerSkriv,
  PERM.bookingLaes,
  PERM.kompetencerSkriv,
  PERM.vagterLaes,
  PERM.vagterSkriv,
  PERM.stemplingerLaesAlle,
  PERM.stemplingerRette,
];

export const TEST_USERS = Object.freeze({
  employee: { email: "workforce-employee@example.invalid", name: "Anna Syntetisk", tenant: TENANT_A, role: "chauffoer", personId: "week-employee-anna", permissions: [PERM.personaleLaes, PERM.fravaerSkriv] },
  manager: { email: "workforce-manager@example.invalid", name: "Maja Syntetisk", tenant: TENANT_A, role: "disponent", personId: "wf-manager-001", permissions: managerPermissions },
  hr: { email: "workforce-hr@example.invalid", name: "Helle Syntetisk", tenant: TENANT_A, role: "admin", personId: "wf-hr-001", permissions: [...managerPermissions, PERM.fravaerSensitiveLaes] },
  outscope: { email: "workforce-outscope@example.invalid", name: "Otto Uden Omfang", tenant: TENANT_A, role: "disponent", personId: "wf-outscope-001", permissions: managerPermissions },
  unauthorized: { email: "workforce-readonly@example.invalid", name: "Rita Uden Workforce", tenant: TENANT_A, role: "revisor", permissions: [PERM.personaleLaes] },
  foreign: { email: "workforce-foreign@example.invalid", name: "Freja Fremmed", tenant: TENANT_B, role: "disponent", personId: "wf-foreign-001", permissions: managerPermissions },
  noModule: { email: "workforce-base@example.invalid", name: "Nina Basis", tenant: TENANT_NO_MODULE, role: "disponent", personId: "wf-base-001", permissions: managerPermissions },
});

function localHost(name, fallback) {
  const host = process.env[name] || fallback;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error(`${name} skal pege på en lokal emulator.`);
  return host;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function createOrUpdateUser(authHost, definition) {
  let account;
  const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: definition.email, password: SYNTHETIC_PASSWORD, displayName: definition.name, returnSecureToken: true }),
  });
  if (signup.ok) account = await signup.json();
  else {
    account = await jsonRequest(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: definition.email, password: SYNTHETIC_PASSWORD, returnSecureToken: true }),
    });
  }
  const claims = {
    tenant: definition.tenant,
    rolle: definition.role,
    pv: CLAIM_PERMISSION_VERSION,
    perms: kompaktPermStreng(definition.permissions),
  };
  await jsonRequest(`http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ localId: account.localId, displayName: definition.name, customAttributes: JSON.stringify(claims) }),
  });
  return { ...definition, uid: account.localId };
}

async function writeTenant(databaseHost, tenantId, data) {
  await jsonRequest(`http://${databaseHost}/tenants/${tenantId}.json?ns=${DATABASE_NAMESPACE}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify(data),
  });
}

export async function seedWorkforceAuthEmulator() {
  const authHost = localHost("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9119");
  const databaseHost = localHost("FIREBASE_DATABASE_EMULATOR_HOST", "127.0.0.1:9020");
  // Firebase CLI kan lægge konfigurationsreglerne på *-default-rtdb, mens
  // Functions bruger projekt-id'et. Installer derfor de samme regler eksplicit
  // på runtime-namespacet, så QA aldrig kommer til at køre med åbne regler.
  const rules = await readFile(new URL("../firebase.rules.json", import.meta.url), "utf8");
  await jsonRequest(`http://${databaseHost}/.settings/rules.json?ns=${DATABASE_NAMESPACE}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: rules,
  });
  const users = {};
  for (const [key, definition] of Object.entries(TEST_USERS)) users[key] = await createOrUpdateUser(authHost, definition);

  const userRows = (tenantId) => Object.fromEntries(Object.values(users).filter((user) => user.tenant === tenantId).map((user) => [user.uid, {
    email: user.email,
    navn: user.name,
    rolle: user.role,
    ...(user.personId ? { personId: user.personId } : {}),
  }]));
  const people = {
    "week-employee-anna": { navn: "Anna Syntetisk", status: "aktiv", uid: users.employee.uid, funktioner: { chauffoer: true }, stationeret: "Demo-depot" },
    "week-employee-bo": { navn: "Bo Syntetisk", status: "aktiv", funktioner: { chauffoer: true }, stationeret: "Demo-depot" },
    "wf-manager-001": { navn: "Maja Syntetisk", status: "aktiv", uid: users.manager.uid, funktioner: { disponent: true }, stationeret: "Demo-kontor" },
    "wf-hr-001": { navn: "Helle Syntetisk", status: "aktiv", uid: users.hr.uid, funktioner: { administration: true }, stationeret: "Demo-kontor" },
    "wf-outscope-001": { navn: "Otto Uden Omfang", status: "aktiv", uid: users.outscope.uid, funktioner: { disponent: true }, stationeret: "Andet demo-team" },
  };
  await writeTenant(databaseHost, TENANT_A, {
    _findes: true,
    abonnement: { status: "aktiv" },
    virksomhed: { navn: "WORKFORCE syntetisk pilot" },
    moduler: { dashboard: true, bemanding: true, booking: true },
    brugere: userRows(TENANT_A),
    personale: people,
    kompetencer: {
      "wf-skill-service": { personId: "week-employee-anna", type: "SERVICE", udloeberMs: Date.parse("2033-01-01T00:00:00Z") },
    },
    workforceGodkendelsesomfang: {
      [users.manager.uid]: { personer: { "week-employee-anna": true, "week-employee-bo": true } },
      [users.hr.uid]: { personer: { "week-employee-anna": true, "week-employee-bo": true } },
    },
  });
  await writeTenant(databaseHost, TENANT_B, {
    _findes: true,
    abonnement: { status: "aktiv" },
    virksomhed: { navn: "Fremmed syntetisk tenant" },
    moduler: { dashboard: true, bemanding: true, booking: true },
    brugere: userRows(TENANT_B),
    personale: { "wf-foreign-001": { navn: "Freja Fremmed", status: "aktiv", uid: users.foreign.uid, funktioner: { disponent: true }, stationeret: "Fremmed depot" } },
  });
  await writeTenant(databaseHost, TENANT_NO_MODULE, {
    _findes: true,
    abonnement: { status: "aktiv" },
    virksomhed: { navn: "Syntetisk kunde uden WORKFORCE" },
    moduler: { dashboard: true },
    brugere: userRows(TENANT_NO_MODULE),
    personale: { "wf-base-001": { navn: "Nina Basis", status: "aktiv", uid: users.noModule.uid, funktioner: { administration: true }, stationeret: "Basis-depot" } },
  });
  return users;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedWorkforceAuthEmulator().then((users) => console.log(JSON.stringify({ ok: true, projectId: PROJECT_ID, users: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { uid: user.uid, email: user.email, tenant: user.tenant }])) }, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
