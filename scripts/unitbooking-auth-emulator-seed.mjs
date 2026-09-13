/* Syntetisk UNIT-seed. Scriptet nægter at ramme andet end lokale emulatorer. */
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { CLAIM_PERMISSION_VERSION, kompaktPermStreng, PERM } from "../src/fleet/permissions.js";

export const PROJECT_ID = "demo-unitbooking-v2";
// Admin SDK'et i Functions-emulatoren bruger projekt-id'et som namespace.
export const DATABASE_NAMESPACE = PROJECT_ID;
export const SYNTHETIC_PASSWORD = "Unit-QA-only-2026!";
export const TENANTS = Object.freeze({ unit: "unit-only-qa", warehouse: "warehouse-only-qa", both: "unit-warehouse-qa", foreign: "foreign-qa" });
export const TEST_USERS = Object.freeze({
  unit: { email: "unit-operator@example.invalid", name: "Syntetisk UNIT-medarbejder", tenant: TENANTS.unit, role: "lagermedarbejder", perms: [PERM.kasserSkriv, PERM.kasseudlaanSkriv, PERM.reolpladserSkriv] },
  warehouse: { email: "warehouse-operator@example.invalid", name: "Syntetisk Warehouse-medarbejder", tenant: TENANTS.warehouse, role: "lagermedarbejder", perms: [PERM.carriersSkriv, PERM.bevaegelserSkriv, PERM.reolpladserSkriv] },
  both: { email: "unit-warehouse@example.invalid", name: "Syntetisk tværmodulbruger", tenant: TENANTS.both, role: "lagermedarbejder", perms: [PERM.kasserSkriv, PERM.kasseudlaanSkriv, PERM.reolpladserSkriv, PERM.carriersSkriv, PERM.bevaegelserSkriv] },
  noPerm: { email: "unit-reader@example.invalid", name: "Syntetisk læser", tenant: TENANTS.unit, role: "revisor", perms: [] },
  foreign: { email: "unit-foreign@example.invalid", name: "Anden tenant", tenant: TENANTS.foreign, role: "lagermedarbejder", perms: [PERM.kasserSkriv, PERM.kasseudlaanSkriv] },
});

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function createUser(authHost, definition) {
  const created = await jsonRequest(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: definition.email, password: SYNTHETIC_PASSWORD, displayName: definition.name, returnSecureToken: true }),
  });
  const claims = { tenant: definition.tenant, rolle: definition.role, pv: CLAIM_PERMISSION_VERSION, perms: kompaktPermStreng(definition.perms) };
  await jsonRequest(`http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ localId: created.localId, displayName: definition.name, customAttributes: JSON.stringify(claims) }),
  });
  return { ...definition, uid: created.localId };
}

const pladser = {
  modtagelse: { hal: "Hovedlager", reol: "M01", fag: "01", hylde: "1", plads: "1", zone: "Modtagelse", type: "gulvplads", status: "aktiv" },
  hjemAl: { hal: "Hovedlager", reol: "A01", fag: "02", hylde: "1", plads: "1", zone: "Kasser", type: "hylde", status: "aktiv" },
  hjemTr: { hal: "Hovedlager", reol: "B02", fag: "03", hylde: "1", plads: "1", zone: "Kasser", type: "hylde", status: "aktiv" },
  destination: { hal: "Hovedlager", reol: "C03", fag: "04", hylde: "1", plads: "1", zone: "Kasser", type: "hylde", status: "aktiv" },
};
const typer = {
  AL: { navn: "Aluminiumskasse", aktiv: true, undertyper: { stor: { navn: "Stor" }, mellem: { navn: "Mellem" } } },
  TR: { navn: "Transportkasse", aktiv: true, undertyper: { standard: { navn: "Standard" } } },
};
const kasser = {
  "AL-101": { type: "AL", undertype: "stor", status: "ledig", hjemPladsId: "hjemAl", pladsId: "hjemAl", indvendigLaengdeMm: 1200, indvendigBreddeMm: 800, indvendigHoejdeMm: 1000, laengdeMm: 1300, breddeMm: 900, hoejdeMm: 1100, maalBetydning: "udvendig" },
  "AL-102": { type: "AL", undertype: "stor", status: "ledig", hjemPladsId: "hjemAl", pladsId: "destination", indvendigLaengdeMm: 1450, indvendigBreddeMm: 950, indvendigHoejdeMm: 1200, laengdeMm: 1550, breddeMm: 1050, hoejdeMm: 1300, maalBetydning: "udvendig" },
  "TR-201": { type: "TR", undertype: "standard", status: "ledig", hjemPladsId: "hjemTr", pladsId: "hjemTr", indvendigLaengdeMm: 900, indvendigBreddeMm: 600, indvendigHoejdeMm: 700, laengdeMm: 1000, breddeMm: 700, hoejdeMm: 800, maalBetydning: "udvendig" },
  "LEGACY-301": { type: "TR", status: "ledig", hjemPladsId: "hjemTr", pladsId: "hjemTr", laengdeMm: 1400, breddeMm: 900, hoejdeMm: 1000, maalBetydning: "ukendt" },
  "AL-OUT": { type: "AL", undertype: "mellem", status: "udeAfDrift", udeAfDriftFra: Date.parse("2026-09-01T00:00:00Z"), hjemPladsId: "hjemAl", pladsId: "hjemAl", indvendigLaengdeMm: 1300, indvendigBreddeMm: 900, indvendigHoejdeMm: 1100 },
};

const booking = (kasseId, sagsnummer, fra, til, tilstand, extra = {}) => ({
  kasseId, sagsnummer, fra: Date.parse(`${fra}T00:00:00Z`), til: Date.parse(`${til}T00:00:00Z`), tilstand,
  oprettetAf: "seed", oprettetMs: Date.parse("2026-09-01T08:00:00Z"), ...extra,
});

function tenantData(moduler, users, variant) {
  const base = {
    _findes: true, virksomhed: { navn: `Veyro syntetisk ${variant}` }, abonnement: { status: "aktiv" }, moduler,
    brugere: Object.fromEntries(users.map((u) => [u.uid, { email: u.email, navn: u.name, rolle: u.role }])),
    reolpladser: pladser, kassetyper: typer, kasser,
  };
  if (moduler.unitbooking) {
    base.kasseudlaan = {
      "dag-klar": booking("TR-201", "DAG-KLAR", "2026-09-15", "2026-09-18", "booket", { klargoerSenest: Date.parse("2026-09-13T00:00:00Z") }),
      "dag-ud": booking("AL-102", "DAG-UD", "2026-09-13", "2026-09-16", "klargjort"),
      "dag-retur": booking("AL-101", "DAG-RETUR", "2026-09-08", "2026-09-13", "udlaant", { udleveretMs: Date.parse("2026-09-08T09:00:00Z") }),
      "dag-forsinket": booking("TR-201", "DAG-FORSINKET", "2026-09-01", "2026-09-10", "returneret", { returneretMs: Date.parse("2026-09-11T10:00:00Z") }),
    };
    base.kasser = { ...kasser, "AL-101": { ...kasser["AL-101"], status: "udlaant", pladsId: null } };
  }
  return base;
}

export async function seedUnitbookingAuthEmulator() {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9119";
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9020";
  for (const host of [authHost, databaseHost]) if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error("UNIT QA må kun bruge lokale emulatorhosts.");
  // CLI 13 lægger konfigurationsreglerne på *-default-rtdb, mens Functions'
  // Admin SDK bruger projekt-id'et. Kopiér derfor de samme regler eksplicit
  // til runtime-namespacet; uden dette ville browser-QA'en køre med åbne regler.
  const rules = await readFile(new URL("../firebase.rules.json", import.meta.url), "utf8");
  await jsonRequest(`http://${databaseHost}/.settings/rules.json?ns=${DATABASE_NAMESPACE}`, {
    method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer owner" }, body: rules,
  });
  await jsonRequest(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  const users = {};
  for (const [key, definition] of Object.entries(TEST_USERS)) users[key] = await createUser(authHost, definition);
  const put = (tenant, value) => jsonRequest(`http://${databaseHost}/tenants/${tenant}.json?ns=${DATABASE_NAMESPACE}`, {
    method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer owner" }, body: JSON.stringify(value),
  });
  await Promise.all([
    put(TENANTS.unit, tenantData({ unitbooking: true }, [users.unit, users.noPerm], "kun UNIT")),
    put(TENANTS.warehouse, tenantData({ warehouse: true }, [users.warehouse], "kun Warehouse")),
    put(TENANTS.both, tenantData({ unitbooking: true, warehouse: true }, [users.both], "UNIT + Warehouse")),
    put(TENANTS.foreign, tenantData({ unitbooking: true }, [users.foreign], "anden tenant")),
  ]);
  const result = { ok: true, projectId: PROJECT_ID, tenants: TENANTS, users: Object.fromEntries(Object.entries(users).map(([key, u]) => [key, { uid: u.uid, email: u.email, tenant: u.tenant }])) };
  console.log(JSON.stringify(result, null, 2));
  return { users, result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedUnitbookingAuthEmulator().catch((error) => { console.error(error); process.exitCode = 1; });
}
