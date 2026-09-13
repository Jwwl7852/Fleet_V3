/* Samlet, syntetisk pilotseed til integrationsrunden V2.
 *
 * Seedet genbruger Procures autoritative claims-v2-fixture og udvider kun
 * den lokale demo-tenant med alle integrerede moduler og seks enheder. Det
 * nægter at køre mod andet end demo-veyro-owner på de aftalte localhost-
 * emulatorporte. Ingen ekstern transport eller produktionsdata anvendes.
 */
import assert from "node:assert/strict";
import { seedProcureAuthEmulator, TENANT_A } from "./procure-auth-emulator-seed.mjs";

const projectId = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

assert.equal(projectId, "demo-veyro-owner");
assert.equal(authHost, "127.0.0.1:9099");
assert.equal(databaseHost, "127.0.0.1:9000");
assert.equal(functionsHost, "127.0.0.1:5001");
assert.equal(storageHost, "127.0.0.1:9199");

await seedProcureAuthEmulator();

const now = Date.now();
const modules = Object.fromEntries([
  "booking", "bemanding", "flaade", "facility", "indkoeb", "unitbooking",
  "warehouse", "kunder", "oekonomi",
].map((id) => [id, true]));
const units = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
  const number = index + 1;
  const id = `pilot-enhed-${String(number).padStart(2, "0")}`;
  return [id, {
    id,
    navn: `Syntetisk pilotenhed ${number}`,
    registrering: `TEST${String(number).padStart(2, "0")}`,
    status: number === 6 ? "service" : "aktiv",
    type: number % 2 ? "varebil" : "lastbil",
    oprettetMs: now - number * 86_400_000,
    opdateretMs: now,
    fixture: "integration-v2",
  }];
}));

const patch = {
  [`tenants/${TENANT_A}/moduler`]: modules,
  [`tenants/${TENANT_A}/virksomhed/navn`]: "Veyro pilotdrift — syntetisk",
  [`tenants/${TENANT_A}/koeretoejer`]: units,
};
const response = await fetch(`http://${databaseHost}/.json?ns=${projectId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: "Bearer owner" },
  body: JSON.stringify(patch),
});
assert.equal(response.ok, true, await response.text());

console.log(JSON.stringify({
  ok: true,
  projectId,
  tenant: TENANT_A,
  syntheticUsersFromProcureSeed: 5,
  syntheticUnits: Object.keys(units).length,
  modules: Object.keys(modules),
  externalServices: false,
}, null, 2));
