/* Isoleret WAREHOUSE/UNIT-kontrakt-QA gennem Auth, Functions og RTDB.
 * Scriptet accepterer kun loopback-emulatorer, demo-projekt og et
 * proceslokalt password. Det rører aldrig produktionsdata. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CLAIM_PERMISSION_VERSION,
  kompaktPermStreng,
  PERM,
} from "../src/fleet/permissions.js";

const projectId = process.env.WAREHOUSE_QA_PROJECT_ID || "demo-veyro-warehouse-integration-test";
const namespace = `${projectId}-default-rtdb`;
const password = process.env.WAREHOUSE_QA_PASSWORD;
const tenantWarehouse = "warehouse-only-tenant";
const tenantUnit = "unit-only-tenant";
const tenantShared = "warehouse-unit-tenant";
const tenantForeign = "warehouse-foreign-tenant";
const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9121",
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9022",
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5024",
};
assert.ok(projectId.startsWith("demo-"), "WAREHOUSE-QA kræver et demo-projekt.");
assert.ok(password, "WAREHOUSE_QA_PASSWORD skal sættes proceslokalt.");
for (const [name, host] of Object.entries(hosts)) {
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal være en lokal emulator.`);
}

const userDefinitions = {
  warehouse: { email: "warehouse-only@example.invalid", tenant: tenantWarehouse, role: "lagermedarbejder", permissions: [PERM.bevaegelserSkriv, PERM.reolpladserSkriv, PERM.varerSkriv, PERM.carriersSkriv] },
  unit: { email: "unit-only@example.invalid", tenant: tenantUnit, role: "koordinator", permissions: [PERM.kasseudlaanSkriv, PERM.kasserSkriv, PERM.reolpladserSkriv] },
  warehouseShared: { email: "warehouse-shared@example.invalid", tenant: tenantShared, role: "lagermedarbejder", permissions: [PERM.bevaegelserSkriv, PERM.reolpladserSkriv] },
  unitShared: { email: "unit-shared@example.invalid", tenant: tenantShared, role: "koordinator", permissions: [PERM.kasseudlaanSkriv, PERM.kasserSkriv, PERM.reolpladserSkriv] },
  both: { email: "warehouse-unit@example.invalid", tenant: tenantShared, role: "admin", permissions: [PERM.bevaegelserSkriv, PERM.kasseudlaanSkriv, PERM.kasserSkriv, PERM.reolpladserSkriv] },
  denied: { email: "warehouse-denied@example.invalid", tenant: tenantShared, role: "revisor", permissions: [] },
  foreign: { email: "warehouse-foreign@example.invalid", tenant: tenantForeign, role: "lagermedarbejder", permissions: [PERM.bevaegelserSkriv] },
};

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function createUser(definition) {
  let signup = await jsonRequest(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: definition.email, password, displayName: definition.email.split("@")[0], returnSecureToken: true }),
  });
  /* QA må kunne genkøres mod samme isolerede emulator. Der oprettes aldrig
     nye eksterne konti; en eksisterende syntetisk bruger slås kun op ved at
     logge ind med det proceslokale QA-password. */
  if (!signup.response.ok && signup.body?.error?.message === "EMAIL_EXISTS") {
    signup = await jsonRequest(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: definition.email, password, returnSecureToken: true }),
    });
  }
  assert.equal(signup.response.ok, true, JSON.stringify(signup.body));
  const claims = {
    tenant: definition.tenant,
    rolle: definition.role,
    pv: CLAIM_PERMISSION_VERSION,
    perms: kompaktPermStreng(definition.permissions),
  };
  const update = await jsonRequest(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ localId: signup.body.localId, customAttributes: JSON.stringify(claims) }),
  });
  assert.equal(update.response.ok, true, JSON.stringify(update.body));
  return { ...definition, uid: signup.body.localId };
}

async function signIn(email) {
  const result = await jsonRequest(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.body));
  return result.body.idToken;
}

async function adminPut(pathname, value) {
  const result = await jsonRequest(`http://${hosts.database}/${pathname}.json?ns=${namespace}`, {
    method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer owner" }, body: JSON.stringify(value),
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.body));
}

async function adminRead(pathname) {
  const result = await jsonRequest(`http://${hosts.database}/${pathname}.json?ns=${namespace}`, { headers: { authorization: "Bearer owner" } });
  assert.equal(result.response.ok, true, JSON.stringify(result.body));
  return result.body;
}

async function clientRequest(pathname, token, { method = "GET", value, fail = false } = {}) {
  const result = await jsonRequest(`http://${hosts.database}/${pathname}.json?ns=${namespace}&auth=${encodeURIComponent(token)}`, {
    method, headers: { "content-type": "application/json" }, ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  assert.equal(result.response.ok, !fail, `${method} ${pathname}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function callable(name, data, token, { fail = false } = {}) {
  const result = await jsonRequest(`http://${hosts.functions}/${projectId}/europe-west1/${name}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }),
  });
  assert.equal(result.response.status === 200, !fail, `${name}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return fail ? result.body.error : result.body.result;
}

const users = {};
for (const [key, definition] of Object.entries(userDefinitions)) users[key] = await createUser(definition);
const tokens = {};
for (const [key, definition] of Object.entries(userDefinitions)) tokens[key] = await signIn(definition.email);

const commonLocations = {
  reception: { hal: "Syntetisk modtagelse", type: "modtagelse", status: "aktiv" },
  aisleA: { hal: "Syntetisk lager", reol: "A", type: "lager", status: "aktiv" },
  aisleB: { hal: "Syntetisk lager", reol: "B", type: "lager", status: "aktiv" },
};
const filler = Object.fromEntries(Array.from({ length: 1200 }, (_, index) => [`syntetisk-${String(index).padStart(4, "0")}`, { aktiv: true, label: `Syntetisk ${index}` }]));
const tenantData = (tenantId, modules, { withFiller = false } = {}) => ({
  _findes: true,
  abonnement: { status: "aktiv" },
  moduler: modules,
  brugere: Object.fromEntries(Object.entries(users).filter(([, user]) => user.tenant === tenantId).map(([, user]) => [user.uid, { email: user.email, rolle: user.role }])),
  reolpladser: commonLocations,
  kassetyper: { transport: { navn: "Transportunit" } },
  ...(withFiller ? { qaFylddata: filler } : {}),
});
await adminPut(`tenants/${tenantWarehouse}`, tenantData(tenantWarehouse, { warehouse: true }));
await adminPut(`tenants/${tenantUnit}`, { ...tenantData(tenantUnit, { unitbooking: true }), kasser: { "QA-UNIT-UNIT": { type: "transport", status: "ledig", pladsId: "reception" } } });
await adminPut(`tenants/${tenantShared}`, tenantData(tenantShared, { warehouse: true, unitbooking: true }, { withFiller: true }));
await adminPut(`tenants/${tenantForeign}`, tenantData(tenantForeign, { warehouse: true }));
assert.equal((await adminRead(`tenants/${tenantWarehouse}/_findes`)), true, "syntetisk tenant skal være seedet før Functions-kald");
const warehouseClaims = JSON.parse(Buffer.from(tokens.warehouse.split(".")[1], "base64url").toString("utf8"));
assert.equal(warehouseClaims.tenant, tenantWarehouse, "Auth-tokenet skal bære den syntetiske tenant");

const createStarted = performance.now();
const created = await callable("unitlageropret", {
  operationId: "warehouse-create-0001", unitId: "QA-UNIT-001", typeId: "transport",
  modtagelsesPladsId: "reception", kilde: "warehouse", reference: "SYNTHETIC-QA",
}, tokens.warehouse);
const createDurationMs = Math.round(performance.now() - createStarted);
assert.equal(created.gentaget, false);
const createRetry = await callable("unitlageropret", {
  operationId: "warehouse-create-0001", unitId: "QA-UNIT-001", typeId: "transport",
  modtagelsesPladsId: "reception", kilde: "warehouse", reference: "SYNTHETIC-QA",
}, tokens.warehouse);
assert.equal(createRetry.gentaget, true);
assert.equal(Object.keys(await adminRead(`tenants/${tenantWarehouse}/unitbevaegelser`)).length, 1);

const movedByUnit = await callable("unitlagerhandling", {
  operationId: "unit-move-00000001", unitId: "QA-UNIT-UNIT", art: "flytning",
  tilPladsId: "aisleA", kilde: "unitbooking", reference: "SYNTHETIC-UNIT", forventetPladsId: "reception",
}, tokens.unit);
assert.equal(movedByUnit.unit.pladsId, "aisleA");
await callable("unitlagerhandling", {
  operationId: "unit-move-00000001", unitId: "QA-UNIT-UNIT", art: "flytning",
  tilPladsId: "aisleB", kilde: "unitbooking", reference: "SYNTHETIC-UNIT", forventetPladsId: "reception",
}, tokens.unit, { fail: true });

await callable("unitlageropret", {
  operationId: "shared-create-0001", unitId: "QA-UNIT-SHARED", typeId: "transport",
  modtagelsesPladsId: "reception", kilde: "warehouse", reference: "SYNTHETIC-SHARED",
}, tokens.warehouseShared);
await callable("unitlagerhandling", {
  operationId: "shared-unit-move-1", unitId: "QA-UNIT-SHARED", art: "flytning",
  tilPladsId: "aisleA", kilde: "unitbooking", reference: "SYNTHETIC-SHARED",
}, tokens.unitShared);
const concurrent = await Promise.allSettled([
  callable("unitlagerhandling", { operationId: "warehouse-race-a1", unitId: "QA-UNIT-SHARED", art: "flytning", tilPladsId: "aisleB", kilde: "warehouse", forventetPladsId: "aisleA" }, tokens.warehouseShared),
  callable("unitlagerhandling", { operationId: "warehouse-race-b1", unitId: "QA-UNIT-SHARED", art: "udlevering", kilde: "warehouse", forventetPladsId: "aisleA" }, tokens.warehouseShared),
]);
assert.equal(concurrent.filter((item) => item.status === "fulfilled").length, 1, "præcis én modstridende handling skal vinde");

// Sæt en syntetisk, faktisk udlånt booking op som indgang til WAREHOUSE-retur.
await adminPut(`tenants/${tenantShared}/kasser/QA-UNIT-BOOKED`, { type: "transport", status: "udlaant" });
await adminPut(`tenants/${tenantShared}/kasseudlaan/booking-synthetic-1`, {
  kasseId: "QA-UNIT-BOOKED", sagsnummer: "SYN-BOOK-0001", tilstand: "udlaant", fra: 1956528000000, til: 1956614400000,
});
const returned = await callable("unitlagerhandling", {
  operationId: "warehouse-return-01", unitId: "QA-UNIT-BOOKED", art: "retur", tilPladsId: "reception",
  bookingId: "booking-synthetic-1", kilde: "warehouse", forventetPladsId: null,
}, tokens.warehouseShared);
assert.equal(returned.bookingId, "booking-synthetic-1");
const returnRetry = await callable("unitlagerhandling", {
  operationId: "warehouse-return-01", unitId: "QA-UNIT-BOOKED", art: "retur", tilPladsId: "reception",
  bookingId: "booking-synthetic-1", kilde: "warehouse", forventetPladsId: null,
}, tokens.warehouseShared);
assert.equal(returnRetry.gentaget, true);
await callable("unitlagerhandling", {
  operationId: "warehouse-putaway-1", unitId: "QA-UNIT-BOOKED", art: "flytning", tilPladsId: "aisleB", kilde: "warehouse", forventetPladsId: "reception",
}, tokens.warehouseShared);

await callable("unitlagerhandling", { operationId: "warehouse-denied-1", unitId: "QA-UNIT-BOOKED", art: "flytning", tilPladsId: "aisleA", kilde: "warehouse", forventetPladsId: "aisleB" }, tokens.denied, { fail: true });
await callable("unitlagerhandling", { operationId: "warehouse-foreign-1", unitId: "QA-UNIT-BOOKED", art: "flytning", tilPladsId: "aisleA", kilde: "warehouse", forventetPladsId: "aisleB" }, tokens.foreign, { fail: true });
await clientRequest(`tenants/${tenantShared}/kasser/QA-UNIT-BOOKED/pladsId`, tokens.unitShared, { method: "PUT", value: "aisleA", fail: true });
await clientRequest(`tenants/${tenantShared}/kasser/QA-UNIT-BOOKED/status`, tokens.unitShared, { method: "PUT", value: "udlaant", fail: true });
await clientRequest(`tenants/${tenantShared}/kasser/QA-UNIT-BOOKED/note`, tokens.unitShared, { method: "PUT", value: "Tilladt syntetisk note" });
await clientRequest(`tenants/${tenantShared}/unitbevaegelser/client-forsoeg-1`, tokens.unitShared, { method: "PUT", value: { art: "flytning" }, fail: true });
await clientRequest(`tenants/${tenantShared}/kasser`, tokens.foreign, { fail: true });

const events = await adminRead(`tenants/${tenantShared}/unitbevaegelser`);
assert.equal(events["warehouse-return-01"].bookingId, "booking-synthetic-1");
assert.equal(Object.keys(events).filter((id) => id === "warehouse-return-01").length, 1);
assert.equal((await adminRead(`tenants/${tenantShared}/kasseudlaan/booking-synthetic-1`)).tilstand, "returneret");
const tenantBytes = Buffer.byteLength(JSON.stringify(await adminRead(`tenants/${tenantShared}`)));

const proof = {
  generatedAt: new Date().toISOString(), projectId, environment: "isolated Firebase Emulator Suite",
  identities: { warehouseOnly: users.warehouse.uid, unitOnly: users.unit.uid, bothModules: users.both.uid, foreignTenant: users.foreign.uid },
  sharedContract: { sameQrAndUnitId: true, sameLocations: true, unitOnlyCallableMove: true, warehouseReturnClosedBooking: true, retryProducedOneMovement: true },
  security: { missingPermissionDenied: true, foreignTenantDenied: true, directPladsIdDenied: true, directPhysicalStatusDenied: true, directMovementDenied: true, nonPhysicalNoteAllowed: true },
  concurrency: { oneWinner: true, fulfilled: concurrent.filter((item) => item.status === "fulfilled").length, rejected: concurrent.filter((item) => item.status === "rejected").length },
  transactionRiskSample: { syntheticRows: 1200, tenantBytes, createDurationMs, note: "Én lokal måling er ikke en produktionskapacitetsgaranti; hele tenant-roden er fortsat risikogrænsen." },
  limitation: "Bookingens serverstyrede udlevering og det komplette browserforløb afventer et eksplicit UNIT-checkpoint; en udlånt syntetisk booking blev seedet som afgrænset indgang til WAREHOUSE-retur.",
};
const outputDir = path.resolve(process.argv[2] || "artifacts/warehouse-v2/runtime");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "WAREHOUSE_AUTH_FUNCTIONS_QA.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
