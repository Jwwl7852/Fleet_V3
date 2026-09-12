/* Syntetisk, lokal PROCURE-seed. Scriptet nægter at køre uden emulatorhosts
 * og kan derfor ikke ramme et rigtigt Firebase-projekt. */
import { pathToFileURL } from "node:url";
import { ALLE_PERMS, CLAIM_PERMISSION_VERSION, kompaktPermStreng, PERM } from "../src/fleet/permissions.js";

// Matcher den eksisterende lokale emulator-suite, som også bruges af de
// isolerede PROCURE integrationstests. Ingen rigtig projekt-id accepteres.
export const PROJECT_ID = "demo-veyro-owner";
export const TENANT_A = "procure-auth-a";
export const TENANT_B = "procure-auth-b";
export const SYNTHETIC_PASSWORD = process.env.PROCURE_AUTH_QA_PASSWORD || "Procure-QA-only-2026!";
export const TEST_USERS = Object.freeze({
  buyer: { email: "procure-buyer@example.invalid", name: "Syntetisk indkøber", tenant: TENANT_A, role: "indkoeber" },
  approver: { email: "procure-approver@example.invalid", name: "Syntetisk godkender", tenant: TENANT_A, role: "godkender" },
  admin: { email: "procure-admin@example.invalid", name: "Syntetisk administrator", tenant: TENANT_A, role: "admin" },
  reader: { email: "procure-reader@example.invalid", name: "Syntetisk lagerlæser", tenant: TENANT_A, role: "revisor" },
  foreign: { email: "procure-foreign@example.invalid", name: "Anden tenant", tenant: TENANT_B, role: "indkoeber" },
});

const buyerPerms = [PERM.indkoebSkriv, PERM.indkoebLaes, PERM.leverandoererLaes, PERM.fakturaerLaes];
const approverPerms = [...buyerPerms, PERM.indkoebGodkend, PERM.fakturaerGodkend];
const permissionsFor = (key) => key === "admin" ? ALLE_PERMS : key === "approver" ? approverPerms : key === "reader" ? [PERM.indkoebLaes] : buyerPerms;

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function createUser(authHost, key, definition) {
  const created = await jsonRequest(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: definition.email, password: SYNTHETIC_PASSWORD, displayName: definition.name, returnSecureToken: true }),
  });
  const claims = {
    tenant: definition.tenant,
    rolle: definition.role,
    pv: CLAIM_PERMISSION_VERSION,
    perms: kompaktPermStreng(permissionsFor(key)),
  };
  await jsonRequest(`http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ localId: created.localId, displayName: definition.name, customAttributes: JSON.stringify(claims) }),
  });
  return { ...definition, uid: created.localId };
}

const catalog = {
  tape: { navn: "Pakketape, klar 48 mm", varenummer: "EMB-1001", enhed: "ruller", bestillingsenhed: "ruller", grundenhed: "ruller", antalPrBestillingsenhed: 1, bestillingsprisOere: 2400, indkoebsprisOere: 2400, leverandoerId: "nordisk", varegruppe: "Emballage", standardAfdelingId: "lager", aktiv: true, favorit: true, tidligereKoeb: true, lagerfoert: true, minimumBeholdning: 10,
    lagerplaceringer: { "10_hovedlager_a-01": { lagerId: "hovedlager", lager: "Hovedlager", placeringId: "a-01", placering: "A-01", afdelingId: "lager", beholdning: 58, enhed: "ruller", revision: 1, senestBevaegetMs: 1789120800000, senestOptaltMs: 1789120800000 } } },
  film: { navn: "Strækfilm 50 cm", varenummer: "EMB-2040", enhed: "rulle", bestillingsenhed: "rulle", grundenhed: "rulle", antalPrBestillingsenhed: 1, bestillingsprisOere: 7500, indkoebsprisOere: 7500, leverandoerId: "nordisk", varegruppe: "Emballage", aktiv: true, favorit: true, tidligereKoeb: true },
  gloves: { navn: "Arbejdshandsker", varenummer: "SIK-1212", enhed: "kasse", bestillingsenhed: "kasse", grundenhed: "par", antalPrBestillingsenhed: 12, bestillingsprisOere: 18900, indkoebsprisOere: 18900, leverandoerId: "sikker", varegruppe: "Sikkerhedsudstyr", aktiv: true, favorit: false, tidligereKoeb: true },
  cleaner: { navn: "Industrirens 5 l", varenummer: "REN-5000", enhed: "dunk", bestillingsenhed: "dunk", grundenhed: "liter", antalPrBestillingsenhed: 5, bestillingsprisOere: 22900, indkoebsprisOere: 22900, leverandoerId: "sikker", varegruppe: "Rengøring", aktiv: true, favorit: false, tidligereKoeb: false },
  filters: { navn: "Oliefilter standard", varenummer: "RES-9080", enhed: "stk.", bestillingsenhed: "stk.", grundenhed: "stk.", antalPrBestillingsenhed: 1, bestillingsprisOere: 9800, indkoebsprisOere: 9800, leverandoerId: "sikker", varegruppe: "Reservedele", aktiv: true, favorit: true, tidligereKoeb: true },
  cloths: { navn: "Mikrofiberklude", varenummer: "REN-5010", enhed: "pakke", bestillingsenhed: "pakke", grundenhed: "stk.", antalPrBestillingsenhed: 10, bestillingsprisOere: 7900, indkoebsprisOere: 7900, leverandoerId: "sikker", varegruppe: "Rengøring", aktiv: true },
  masks: { navn: "Støvmasker FFP2", varenummer: "SIK-2200", enhed: "æske", bestillingsenhed: "æske", grundenhed: "stk.", antalPrBestillingsenhed: 20, bestillingsprisOere: 24900, indkoebsprisOere: 24900, leverandoerId: "sikker", varegruppe: "Sikkerhedsudstyr", aktiv: true },
  bags: { navn: "Affaldssække 120 l", varenummer: "REN-1200", enhed: "rulle", bestillingsenhed: "rulle", grundenhed: "stk.", antalPrBestillingsenhed: 10, bestillingsprisOere: 6900, indkoebsprisOere: 6900, leverandoerId: "nordisk", varegruppe: "Rengøring", aktiv: true },
  soap: { navn: "Håndsæbe", varenummer: "REN-3300", enhed: "dunk", bestillingsenhed: "dunk", grundenhed: "liter", antalPrBestillingsenhed: 5, bestillingsprisOere: 11900, indkoebsprisOere: 11900, leverandoerId: "sikker", varegruppe: "Rengøring", aktiv: true },
  cable: { navn: "Kabelbindere", varenummer: "RES-4400", enhed: "pose", bestillingsenhed: "pose", grundenhed: "stk.", antalPrBestillingsenhed: 100, bestillingsprisOere: 4900, indkoebsprisOere: 4900, leverandoerId: "nordisk", varegruppe: "Reservedele", aktiv: true },
  milk: { navn: "Mælk 1 liter", varenummer: "KANT-1001", enhed: "liter", bestillingsenhed: "liter", grundenhed: "liter", antalPrBestillingsenhed: 1, bestillingsprisOere: 1200, indkoebsprisOere: 1200, leverandoerId: "nordisk", varegruppe: "Kantine", standardAfdelingId: "administration", aktiv: true, tidligereKoeb: true, lagerfoert: false },
};

export async function seedProcureAuthEmulator() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= "127.0.0.1:9000";
  if (!/^127\.0\.0\.1:|^localhost:/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST)
      || !/^127\.0\.0\.1:|^localhost:/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST)) {
    throw new Error("PROCURE Auth-seed må kun køre mod lokale emulatorhosts.");
  }
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  await jsonRequest(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  const users = {};
  for (const [key, definition] of Object.entries(TEST_USERS)) users[key] = await createUser(authHost, key, definition);
  const now = Date.now();
  const tenantBase = {
    _findes: true,
    virksomhed: { navn: "Fjordholm Drift A/S", cvr: "00000000", adresse: "Havnevej 14", postnr: "8000", by: "Aarhus C", fakturaModtagelse: "faktura@fjordholm.example", faktureringsInstruktioner: ["Fakturaen skal være i PDF-format."], procureAppUrl: "https://procure-preview.example.invalid" },
    abonnement: { status: "aktiv" },
    moduler: { indkoeb: true, oekonomi: true },
    brugere: Object.fromEntries(Object.values(users).filter((user) => user.tenant === TENANT_A).map((user) => [user.uid, { email: user.email, navn: user.name, rolle: user.role }])),
    leverandoerer: {
      nordisk: { navn: "Nordisk Materialehandel A/S", ordreEmail: "testtransport@example.invalid", kontaktEmail: "kontakt@example.invalid", adresse: "Industrivej 12", postnr: "8200", by: "Aarhus N", kundenummer: "FH-1042", bestillingsmetode: "begge", prisaftale: "QA-aftale", webshopUrl: "https://example.invalid/testshop" },
      sikker: { navn: "Sikkerhed Materiel A/S", ordreEmail: "testtransport-2@example.invalid", kontaktEmail: "kontakt-2@example.invalid", adresse: "Håndværkervej 4", postnr: "2600", by: "Glostrup", kundenummer: "FH-1043", bestillingsmetode: "mail", prisaftale: "QA-aftale 2" },
    },
    forbrugsvarer: catalog,
    procureOpsaetning: {
      afdelinger: { lager: { id: "lager", label: "Varemodtagelse", active: true, revision: 1 }, drift: { id: "drift", label: "Teknisk drift", active: true, revision: 1 }, administration: { id: "administration", label: "Administration", active: true, revision: 1 } },
      varekategorier: { emballage: { id: "emballage", label: "Emballage", active: true, revision: 1 }, sikkerhed: { id: "sikkerhed", label: "Sikkerhedsudstyr", active: true, revision: 1 } },
      leveringssteder: { hovedlager: { id: "hovedlager", label: "Hovedlager · rampe 2", adresse: "Lagervej 8", postnr: "8000", by: "Aarhus C", active: true, revision: 1 }, vaerksted: { id: "vaerksted", label: "Værksted", adresse: "Værkstedsvej 2", postnr: "8000", by: "Aarhus C", active: true, revision: 1 } },
      lagre: { hovedlager: { id: "hovedlager", label: "Hovedlager", active: true, revision: 1 } },
      lagerplaceringer: { "a-01": { id: "a-01", label: "A-01", lagerId: "hovedlager", active: true, revision: 1 }, "b-01": { id: "b-01", label: "B-01", lagerId: "hovedlager", active: true, revision: 1 } },
      budgetter: { "2026-09": { lager: { departmentId: "lager", period: "2026-09", amountOere: 12000000, currency: "DKK", revision: 1 } } },
    },
    indkoebsordrer: {
      "lager-ordre-1": { id: "lager-ordre-1", nummer: "BST-2026-00042", leverandoerId: "nordisk", status: "sendt", revision: 1, godkendtRevision: 1,
        leveringssted: "Hovedlager · rampe 2", leveringsstedId: "hovedlager", leveringsadresse: "Lagervej 8", leveringspostnr: "8000", leveringsby: "Aarhus C",
        oensketDato: "2026-09-30", oprettetAf: users.buyer.uid, oprettetMs: 1789120800000, bestillerNavn: users.buyer.name, bestillerEmail: users.buyer.email,
        linjer: { tape: { vare: "Pakketape, klar 48 mm", varenummer: "EMB-1001", antal: 10, enhed: "ruller", prisPrEnhedOere: 2400, forbrugsvareId: "tape", varegruppe: "Emballage" } } },
      "mail-ordre-1": { id: "mail-ordre-1", nummer: "BST-2026-00043", leverandoerId: "nordisk", status: "godkendt", revision: 5, godkendtRevision: 5,
        leveringssted: "Hovedlager · rampe 2", leveringsstedId: "hovedlager", leveringsadresse: "Lagervej 8", leveringspostnr: "8000", leveringsby: "Aarhus C",
        hurtigstMuligt: true, oprettetAf: users.buyer.uid, oprettetMs: 1789120800000, bestillerNavn: users.buyer.name, bestillerEmail: users.buyer.email,
        linjer: { tape: { vare: "Pakketape, klar 48 mm", varenummer: "EMB-1001", antal: 10, enhed: "ruller", prisPrEnhedOere: 2400, forbrugsvareId: "tape", varegruppe: "Emballage" } } },
    },
    procureQrMaerkater: {
      "qr-auth-tape-a1": { forbrugsvareId: "tape", placering: "A1 · tape", aktiv: true, anmodningsnoegle: "seed-tape-a1", oprettetAf: users.admin.uid, oprettetMs: now, aendretAf: users.admin.uid, aendretMs: now },
    },
    forbrugsvarebevaegelser: {
      "seed-tape-count-start": { forbrugsvareId: "tape", art: "optaelling", antal: 50, delta: 0, enhed: "ruller", lagerId: "hovedlager", lager: "Hovedlager", placeringId: "a-01", placering: "A-01", afdelingId: "lager", foer: 50, efter: 50, medarbejderNavn: users.buyer.name, uid: users.buyer.uid, ms: 1782900000000 },
      "seed-tape-receipt": { forbrugsvareId: "tape", art: "modtaget", antal: 10, delta: 10, enhed: "ruller", lagerId: "hovedlager", lager: "Hovedlager", placeringId: "a-01", placering: "A-01", afdelingId: "lager", foer: 50, efter: 60, medarbejderNavn: users.buyer.name, uid: users.buyer.uid, ms: 1785600000000 },
      "seed-tape-count-end": { forbrugsvareId: "tape", art: "optaelling", antal: 58, delta: -2, enhed: "ruller", lagerId: "hovedlager", lager: "Hovedlager", placeringId: "a-01", placering: "A-01", afdelingId: "lager", foer: 60, efter: 58, medarbejderNavn: users.buyer.name, uid: users.buyer.uid, ms: 1789120800000 },
    },
  };
  const databaseWrite = (tenant, value) => jsonRequest(`http://${databaseHost}/tenants/${tenant}.json?ns=${PROJECT_ID}`, {
    method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer owner" }, body: JSON.stringify(value),
  });
  await databaseWrite(TENANT_A, tenantBase);
  await databaseWrite(TENANT_B, { _findes: true, virksomhed: { navn: "Anden syntetisk tenant" }, abonnement: { status: "aktiv" }, moduler: { indkoeb: true }, brugere: { [users.foreign.uid]: { email: users.foreign.email, navn: users.foreign.name, rolle: users.foreign.role } }, forbrugsvarer: { foreign: { navn: "Kun anden tenant", varenummer: "B-1", enhed: "stk.", bestillingsenhed: "stk.", grundenhed: "stk.", antalPrBestillingsenhed: 1, bestillingsprisOere: 100, leverandoerId: "foreign", varegruppe: "Andet", aktiv: true } }, procureQrMaerkater: { "qr-other-tenant": { forbrugsvareId: "foreign", placering: "B1", aktiv: true, anmodningsnoegle: "seed-other", oprettetAf: users.foreign.uid, oprettetMs: now, aendretAf: users.foreign.uid, aendretMs: now } } });
  console.log(JSON.stringify({ ok: true, projectId: PROJECT_ID, tenants: [TENANT_A, TENANT_B], users: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { uid: user.uid, email: user.email, tenant: user.tenant, role: user.role }])) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) seedProcureAuthEmulator().catch((error) => { console.error(error); process.exitCode = 1; });
