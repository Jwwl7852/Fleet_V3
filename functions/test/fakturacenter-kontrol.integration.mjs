/* Autoritativ Fakturacenter-kontrol mod isoleret RTDB-emulator.
 * Alle poster er syntetiske; testen bruger ingen eksterne tjenester. */
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
const tenantA = "fakturakontrol-a";
const tenantB = "fakturakontrol-b";
const foerste = "kontrollant-1";
const anden = "kontrollant-2";
const udenAdgang = "chauffoer-1";

const auth = (uid = foerste, tenant = tenantA, rolle = "admin") => ({
  uid,
  token: { tenant, rolle, perms: permStrengFraRolle(rolle) },
});
const run = (handler, data, login = auth()) => handler.run({ auth: login, data });
const invoice = (number, extra = {}) => ({
  leverandoerId: "lev-1",
  fakturanummer: number,
  fakturadatoMs: Date.parse("2026-09-14T10:00:00Z"),
  modtagetMs: Date.parse("2026-09-14T10:00:00Z"),
  status: "modtaget",
  beloebOere: 200_000,
  momsOere: 50_000,
  destinationArt: "procure",
  destinationId: "po-1",
  ...extra,
});

await db.ref().set(null);
await db.ref(`tenants/${tenantA}`).set({
  _findes: true,
  abonnement: { status: "aktiv" },
  brugere: {
    [foerste]: { navn: "Første Kontrollant", rolle: "admin", spaerret: false },
    [anden]: { navn: "Anden Kontrollant", rolle: "admin", spaerret: false },
    [udenAdgang]: { navn: "Chauffør", rolle: "chauffoer", spaerret: false },
  },
  leverandoerer: { "lev-1": { navn: "Syntetisk leverandør", aktiv: true } },
  fakturaer: {
    "f-egen": invoice("F-EGEN"),
    "f-replay": invoice("F-REPLAY"),
    "f-masse-ok": invoice("F-MASSE-OK"),
    "f-masse-grundlag": invoice("F-MASSE-GRUNDLAG", { destinationArt: null, destinationId: null }),
    "f-masse-revision": invoice("F-MASSE-REV", { kontrolRevision: 2 }),
  },
});
await db.ref(`tenants/${tenantB}`).set({
  _findes: true,
  abonnement: { status: "aktiv" },
  brugere: { [anden]: { navn: "Anden tenant", rolle: "admin", spaerret: false } },
});

/* Opsætningen kræver brugeradministration og validerer kontrollantens rolle. */
await assert.rejects(
  run(functions.fakturacenterOpsaetningGem, {
    forventetRevision: 0,
    mutationId: "config-chauffoer",
    opsaetning: { model: "alle", kontrollantUids: [udenAdgang] },
  }),
  (error) => error?.code === "failed-precondition" && /fakturaer\.godkend/.test(error.message),
);
await assert.rejects(
  run(functions.fakturacenterOpsaetningGem, {
    forventetRevision: 0,
    mutationId: "config-uden-admin",
    opsaetning: { model: "alle", kontrollantUids: [anden] },
  }, auth(udenAdgang, tenantA, "chauffoer")),
  (error) => error?.code === "permission-denied",
);
const gemt = await run(functions.fakturacenterOpsaetningGem, {
  forventetRevision: 0,
  mutationId: "config-1",
  opsaetning: { model: "alle", kontrollantUids: [foerste, anden] },
});
assert.equal(gemt.opsaetning.revision, 1);
assert.deepEqual(gemt.opsaetning.kontrollantUids, [anden, foerste].sort());
const konfiguration = await run(functions.fakturacenterOpsaetningHent, {});
assert.equal(konfiguration.opsaetning.model, "alle");

/* Første kontrollant kan ikke selv udføre den ekstra kontrol. */
const foersteSvar = await run(functions.fakturakontrolUdfoer, {
  fakturaId: "f-egen", handling: "kontroller", forventetRevision: 0, requestId: "egen-1",
});
assert.equal(foersteSvar.status, "ekstra-kontrol");
assert.equal((await db.ref(`tenants/${tenantA}/fakturaer/f-egen/status`).get()).val(), "modtaget",
  "Veyro-kontrol må ikke ændre betalingsstatus");
await assert.rejects(
  run(functions.fakturakontrolUdfoer, {
    fakturaId: "f-egen", handling: "ekstra-godkend", forventetRevision: 1, requestId: "egen-2",
  }),
  (error) => error?.code === "permission-denied" && /anden person/.test(error.message),
);
const andenSvar = await run(functions.fakturakontrolUdfoer, {
  fakturaId: "f-egen", handling: "ekstra-godkend", forventetRevision: 1, requestId: "egen-3",
}, auth(anden));
assert.equal(andenSvar.status, "arkiveret");
assert.equal((await db.ref(`tenants/${tenantA}/fakturaer/f-egen/ekstraKontrolleretAf`).get()).val(), anden);

/* Samme request er idempotent; payloadskifte under samme id afvises. */
const replayFoerst = await run(functions.fakturakontrolUdfoer, {
  fakturaId: "f-replay", handling: "kontroller", forventetRevision: 0, requestId: "replay-1",
});
const replayAnden = await run(functions.fakturakontrolUdfoer, {
  fakturaId: "f-replay", handling: "kontroller", forventetRevision: 0, requestId: "replay-1",
});
assert.equal(replayFoerst.revision, 1);
assert.equal(replayAnden.gentaget, true);
assert.equal((await db.ref(`tenants/${tenantA}/fakturaer/f-replay/kontrolRevision`).get()).val(), 1);
assert.equal(Object.keys((await db.ref(`tenants/${tenantA}/fakturaer/f-replay/kontrolHistorik`).get()).val()).length, 1);
await assert.rejects(
  run(functions.fakturakontrolUdfoer, {
    fakturaId: "f-replay", handling: "ekstra-afvis", forventetRevision: 1,
    begrundelse: "ændret payload", requestId: "replay-1",
  }),
  (error) => error?.code === "already-exists",
);

/* Massekontrol giver resultat pr. faktura og bevarer blokerede poster. */
const masse = await run(functions.fakturakontrolMasse, {
  requestId: "masse-1",
  poster: [
    { fakturaId: "f-masse-ok", forventetRevision: 0 },
    { fakturaId: "f-masse-grundlag", forventetRevision: 0 },
    { fakturaId: "f-masse-revision", forventetRevision: 0 },
  ],
});
assert.equal(masse.gennemfoert, 1);
assert.equal(masse.blokeret, 2);
assert.equal(masse.resultater.length, 3);
assert.equal((await db.ref(`tenants/${tenantA}/fakturaer/f-masse-ok/kontrolstatus`).get()).val(), "ekstra-kontrol");
assert.equal((await db.ref(`tenants/${tenantA}/fakturaer/f-masse-grundlag/kontrolstatus`).get()).exists(), false);
assert.equal((await db.ref(`tenants/${tenantA}/fakturaer/f-masse-revision/kontrolRevision`).get()).val(), 2);
const masseReplay = await run(functions.fakturakontrolMasse, {
  requestId: "masse-1",
  poster: [{ fakturaId: "f-masse-ok", forventetRevision: 0 }],
});
assert.equal(masseReplay.resultater[0].gentaget, true);

/* Tenant B kan kun slå op under sin egen signerede tenantrod. */
await assert.rejects(
  run(functions.fakturakontrolUdfoer, {
    fakturaId: "f-egen", handling: "ekstra-godkend", forventetRevision: 1, requestId: "cross-tenant",
  }, auth(anden, tenantB)),
  (error) => error?.code === "not-found",
);

console.log("Fakturacenter-kontrol integration: 21 assertions bestået.");
await Promise.all(getApps().map((app) => deleteApp(app)));
