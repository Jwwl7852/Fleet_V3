/* Samlet, syntetisk pilotseed til integrationsrunden V2.
 *
 * Seedet genbruger Procures autoritative claims-v2-fixture og udvider kun
 * den lokale demo-tenant med alle integrerede moduler og seks enheder. Det
 * nægter at køre mod andet end demo-veyro-owner på de aftalte localhost-
 * emulatorporte. Ingen ekstern transport eller produktionsdata anvendes.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

// Firebase CLI lægger konfigurationsreglerne på *-default-rtdb. Browseren og
// Functions bruger projekt-id'et som runtime-namespace i denne samlede QA.
// Installer derfor repositoryets uændrede regler eksplicit dér; ellers kan
// indekserede, autentificerede forespørgsler fejle med et misvisende tomt UI.
const rules = await readFile(new URL("../firebase.rules.json", import.meta.url), "utf8");
const rulesResponse = await fetch(`http://${databaseHost}/.settings/rules.json?ns=${projectId}`, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: "Bearer owner" },
  body: rules,
});
assert.equal(rulesResponse.ok, true, await rulesResponse.text());

const { users } = await seedProcureAuthEmulator();

const now = Date.now();
const modules = Object.fromEntries([
  "booking", "bemanding", "flaade", "facility", "indkoeb", "unitbooking",
  "warehouse", "kunder", "oekonomi",
].map((id) => [id, true]));
const unitFixtures = [
  ["unit-sc-104", "SC-104", "scooter", "Silence", "S04", "Varelevering", 12458, "vaerksted", "KB 39217"],
  ["unit-nb-001", "NB-001", "varevogn", "Ford", "Transit", "Byggeri", 124532, "aktiv", "DM 12 345"],
  ["unit-nb-002", "NB-002", "varevogn", "Mercedes", "Sprinter", "Service", 98210, "aktiv", "DX 98 765"],
  ["unit-nb-003", "NB-003", "lastbil", "Volvo", "FH 500", "Transport", 412980, "udeAfDrift", "CM 45 678"],
  ["unit-nb-008", "NB-008", "truck", "Still", "RX 20", "Lager", 8421, "udeAfDrift", null, "hours"],
  ["unit-nb-014", "NB-014", "truck", "Hilti", "TE 3000-AVR", "Byggeri", 618, "udeAfDrift", null, "hours"],
  ["unit-nb-018", "NB-018", "truck", "Husqvarna", "K 770", "Service", 884, "aktiv", null, "hours"],
];
const genericType = (art) => art === "scooter" ? "scooter" : art === "truck" ? "machine" : "vehicle";
const units = Object.fromEntries(unitFixtures.map(([id, number, art, make, model, department, meter, status, registration, meterType = "km"], index) => [id, {
  art, status, kaldenavn: number, navn: `${make} ${model}`, hjemsted: department,
  ...(registration ? { registrering: registration } : {}),
  ...(meterType === "hours" ? { driftstimer: meter } : { kmStand: meter }),
  securityLevel: "normal",
  fleetProfil: {
    schemaVersion: 1, number, type: genericType(art), make, model, department,
    meterType, meter, equipment: { towHook: false, trailerCoupling: false, crane: false, lift: false },
    notes: "Tydeligt syntetisk integrationsfixture",
    updatedAt: new Date(now).toISOString(),
  },
  oprettetMs: now - (index + 1) * 86_400_000,
  opdateretMs: now,
  fixture: "integration-v2-synthetic",
}]));

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
  "fc-filter-flere": invoice("FC-FILTER-FLERE", 80_000, {
    fordelinger: {
      fleet: { fordelingId: "fc-filter-flere-fleet", modul: "fleet", destinationId: "case-demo-001", nettoOere: 40_000 },
      facility: { fordelingId: "fc-filter-flere-facility", modul: "facility", destinationId: "facility-case-synthetic", nettoOere: 40_000 },
    },
  }),
  "fc-multi-kontrol": invoice("FC-MULTI-KONTROL", 260_000, {
    fordelinger: {
      fleet: { fordelingId: "fc-multi-kontrol-fleet", modul: "fleet", destinationId: "case-demo-001", nettoOere: 120_000 },
      facility: { fordelingId: "fc-multi-kontrol-facility", modul: "facility", destinationId: "facility-case-synthetic", nettoOere: 40_000 },
      procure: { fordelingId: "fc-multi-kontrol-procure", modul: "procure", destinationId: "procure-order-synthetic", nettoOere: 100_000 },
    },
  }),
  ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => {
    const nummer = String(index + 1).padStart(2, "0");
    return [`fc-scroll-${nummer}`, invoice(`FC-SCROLL-${nummer}`, 35_000 + index * 2_500, {
      destinationId: index % 2 ? "case-demo-002" : "case-demo-001",
      destinationNavn: `FLEET-sag · case-demo-00${index % 2 ? 2 : 1}`,
      modtagetMs: Date.parse(`2026-09-${String(13 - index).padStart(2, "0")}T10:00:00Z`),
    })];
  })),
};

const patch = {
  [`tenants/${TENANT_A}/moduler`]: modules,
  [`tenants/${TENANT_A}/virksomhed/navn`]: "Veyro pilotdrift — syntetisk",
  [`tenants/${TENANT_A}/koeretoejer`]: units,
  [`tenants/${TENANT_A}/fakturacenterOpsaetning`]: {
    version: 2,
    moduler: {
      fleet: { model: "over-beloeb", graenseNettoOere: 100_000, kontrollantUid: users.approver.uid },
      facility: { model: "alle", graenseNettoOere: null, kontrollantUid: users.approver.uid },
      procure: { model: "over-beloeb", graenseNettoOere: 200_000, kontrollantUid: users.approver.uid },
    },
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
  sharedUnitSource: "tenants/<tenant>/koeretoejer",
  syntheticInvoices: Object.keys(invoices).length,
  invoiceControl: "per-module net thresholds + named second approver",
  modules: Object.keys(modules),
  externalServices: false,
}, null, 2));
