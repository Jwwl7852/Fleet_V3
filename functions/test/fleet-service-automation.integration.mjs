/* Autoritativ serviceautomatik mod isoleret RTDB-emulator.
 * Alle data er syntetiske; testen bruger ingen eksterne tjenester. */
import assert from "node:assert/strict";
import { deleteApp, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const projectId = "demo-fleetcontrol-rules-test";
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= "127.0.0.1:9200";
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
});

const functions = await import("../index.js");
const { permStrengFraRolle } = await import("../delt/permissions.js");
const db = getDatabase();
const tenantA = "fleet-service-a";
const tenantB = "fleet-service-b";
const adminUid = "service-admin";
const auth = (tenant = tenantA, uid = adminUid, role = "admin") => ({
  uid,
  token: { tenant, rolle: role, perms: permStrengFraRolle(role) },
});
const run = (handler, data, login = auth()) => handler.run({ auth: login, data });

await db.ref().set(null);
await db.ref(`tenants/${tenantA}`).set({
  _findes: true,
  abonnement: { status: "aktiv" },
  moduler: { flaade: true },
  koeretoejer: { "unit-1": { navn: "Syntetisk serviceenhed", kilometer: 119_500 } },
});
await db.ref(`tenants/${tenantB}`).set({
  _findes: true,
  abonnement: { status: "aktiv" },
  moduler: { flaade: true },
  koeretoejer: { "unit-2": { navn: "Anden tenant", kilometer: 10 } },
});

const input = {
  mutationId: "service-create-1",
  forventetRevision: 0,
  krav: {
    titel: "Årligt eftersyn",
    enhedId: "unit-1",
    aktiv: true,
    maalerEnhed: "km",
    sidsteServiceDato: "2025-09-20",
    sidsteServiceMaaler: 100000,
    intervalMaaneder: 12,
    intervalMaeler: 20000,
    varselDage: 30,
    varselMaaler: 1000,
  },
};

const saved = await run(functions.fleetServiceKravGem, input);
assert.equal(saved.revision, 1);
const replay = await run(functions.fleetServiceKravGem, input);
assert.equal(replay.gentaget, true);
await assert.rejects(
  run(functions.fleetServiceKravGem, input, auth(tenantA, "chauffoer-1", "chauffoer")),
  (error) => error?.code === "permission-denied",
);

const [firstRun, secondRun] = await Promise.all([
  run(functions.fleetServiceKontrolNu, {}),
  run(functions.fleetServiceKontrolNu, {}),
]);
assert.equal(firstRun.oprettet + secondRun.oprettet, 1);
const occurrences = (await db.ref(`tenants/${tenantA}/fleetServiceForekomster`).get()).val();
const reports = (await db.ref(`tenants/${tenantA}/fleetIndberetninger`).get()).val();
const cases = (await db.ref(`tenants/${tenantA}/fleetSager`).get()).val();
assert.equal(Object.keys(occurrences).length, 1);
assert.equal(Object.keys(reports).length, 1);
assert.equal(Object.keys(cases).length, 1);
assert.equal((await db.ref(`tenants/${tenantB}/fleetServiceForekomster`).get()).exists(), false);

const occurrenceId = Object.keys(occurrences)[0];
await assert.rejects(
  run(functions.fleetServiceKravGem, {
    id: saved.id, mutationId: "service-deactivate-unconfirmed", forventetRevision: 1,
    krav: { ...input.krav, aktiv: false },
  }),
  (error) => error?.code === "failed-precondition"
    && error?.details?.aarsag === "active_occurrence_confirmation_required",
);
await assert.rejects(
  run(functions.fleetServiceKravGem, {
    id: saved.id, mutationId: "service-cycle-change-blocked", forventetRevision: 1,
    aabenForekomstHandling: "bevar",
    krav: { ...input.krav, intervalMaaneder: 6 },
  }),
  (error) => error?.code === "failed-precondition"
    && error?.details?.aarsag === "active_occurrence_cycle_change",
);
const renamed = await run(functions.fleetServiceKravGem, {
  id: saved.id, mutationId: "service-metadata-change", forventetRevision: 1,
  krav: { ...input.krav, titel: "Årligt eftersyn · opdateret tekst" },
});
assert.equal(renamed.revision, 2);
const deactivated = await run(functions.fleetServiceKravGem, {
  id: saved.id, mutationId: "service-deactivate-preserve", forventetRevision: 2,
  aabenForekomstHandling: "bevar",
  krav: { ...input.krav, titel: "Årligt eftersyn · opdateret tekst", aktiv: false },
});
assert.equal(deactivated.revision, 3);
assert.equal((await db.ref(`tenants/${tenantA}/fleetServiceKrav/${saved.id}/aktiv`).get()).val(), false);
assert.equal((await db.ref(`tenants/${tenantA}/fleetServiceKrav/${saved.id}/aktivForekomstId`).get()).val(), occurrenceId);
assert.equal((await db.ref(`tenants/${tenantA}/fleetServiceForekomster/${occurrenceId}/status`).get()).val(), "varslet");
assert.equal(Object.values((await db.ref(`tenants/${tenantA}/fleetSager`).get()).val())[0].status, "ny");

const completed = await run(functions.fleetServiceGennemfoer, {
  forekomstId: occurrenceId,
  dato: "2026-09-18",
  maaler: 120100,
});
assert.equal(completed.ok, true);
const completedReplay = await run(functions.fleetServiceGennemfoer, {
  forekomstId: occurrenceId,
  dato: "2026-09-18",
  maaler: 120100,
});
assert.equal(completedReplay.gentaget, true);
assert.equal((await db.ref(`tenants/${tenantA}/fleetServiceForekomster/${occurrenceId}/status`).get()).val(), "gennemfoert");
assert.equal(Object.values((await db.ref(`tenants/${tenantA}/fleetSager`).get()).val())[0].status, "fakturaafklaring");

console.log("FLEET-serviceautomatik integration: åbne forekomster, revision og idempotens bestået.");
await Promise.all(getApps().map((app) => deleteApp(app)));
