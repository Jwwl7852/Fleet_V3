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

const { users } = await seedProcureAuthEmulator();

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

const invoice = (fakturanummer, beloebOere, extra = {}) => ({
  fakturanummer,
  leverandoerId: "nordisk",
  leverandoernavn: "Nordisk Materialehandel A/S",
  fakturadatoMs: Date.parse("2026-09-14T10:00:00Z"),
  modtagetMs: Date.parse("2026-09-14T10:00:00Z"),
  status: "modtaget",
  kontrolstatus: "indbakke",
  kontrolRevision: 0,
  beloebOere,
  momsOere: Math.round(beloebOere * 0.25),
  destinationArt: "fleet",
  destinationId: "case-demo-001",
  destinationNavn: "FLEET-sag · case-demo-001",
  filnavn: `${fakturanummer}.pdf`,
  dokumenttype: "application/pdf",
  kilde: "syntetisk-integrationsfixture",
  ...extra,
});

const invoices = {
  "fc-enkelt-over": invoice("FC-ENKELT-OVER", 120_000),
  "fc-masse-over": invoice("FC-MASSE-OVER", 125_000),
  // Totalen er over 1.000 kr., men nettobeløbet er under grænsen. Denne post
  // beviser, at ekstra kontrol afgøres ekskl. moms.
  "fc-masse-net-under": invoice("FC-MASSE-NET-UNDER", 90_000),
  "fc-masse-mangler-grundlag": invoice("FC-MASSE-MANGLER-GRUNDLAG", 130_000, {
    destinationArt: null,
    destinationId: null,
    destinationNavn: null,
  }),
};

const patch = {
  [`tenants/${TENANT_A}/moduler`]: modules,
  [`tenants/${TENANT_A}/virksomhed/navn`]: "Veyro pilotdrift — syntetisk",
  [`tenants/${TENANT_A}/koeretoejer`]: units,
  [`tenants/${TENANT_A}/fakturacenterOpsaetning`]: {
    model: "over-beloeb",
    graenseNettoOere: 100_000,
    kontrollantUids: [users.admin.uid, users.approver.uid].sort(),
    revision: 1,
  },
  [`tenants/${TENANT_A}/fakturaer`]: invoices,
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
  syntheticInvoices: Object.keys(invoices).length,
  invoiceControl: "net threshold 100000 øre + second approver",
  modules: Object.keys(modules),
  externalServices: false,
}, null, 2));
