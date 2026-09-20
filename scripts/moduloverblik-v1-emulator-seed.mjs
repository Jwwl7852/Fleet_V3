/* Lokal, syntetisk reviewfixture til det integrerede Version 1-review.
 * Scriptet nægter at køre mod andre værter eller projekter og patcher kun de
 * navngivne testnoder, der mangler i den eksisterende review-tenant. Det sletter
 * ikke andre tenantdata, brugere eller emulatorfixtures. */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export const PROJECT_ID = process.env.VITE_FB_PROJECT_ID;
export const TENANT_ID = "procure-auth-a";
export const REVIEW_EMAIL = process.env.VITE_DEV_EJER_MAIL;

const apiKey = process.env.VITE_FB_API_KEY || "synthetic";
const password = process.env.VITE_DEV_BRUGER_KODE;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
const FIXTURE = "moduloverblik-v1-synthetic";

export const REVIEW_CATALOG_SUPPLIERS = [
  { id: "review-supplier-drift", navn: "Syntetisk Driftmateriel ApS", adresse: "Testvej 10, 8000 Aarhus C", kontaktEmail: "drift@example.invalid", prisaftale: "Syntetisk rammeaftale A", bestillingsmetode: "mail" },
  { id: "review-supplier-teknik", navn: "Syntetisk Teknikpartner A/S", adresse: "Prøvegade 20, 5000 Odense C", kontaktEmail: "teknik@example.invalid", prisaftale: "Syntetisk rammeaftale B", bestillingsmetode: "webshop" },
  { id: "review-supplier-kontor", navn: "Syntetisk Kontor & Lager ApS", adresse: "Demovej 30, 9000 Aalborg", kontaktEmail: "kontor@example.invalid", prisaftale: "Syntetisk nettoprisliste", bestillingsmetode: "begge" },
];

export const REVIEW_CATALOG_ITEMS = [
  { id: "review-item-long", varenummer: "TEST-LANG-001", navn: "Syntetisk sikkerheds- og afspærringspakke med refleksmarkering til midlertidige arbejdsområder", varegruppe: "Arbejdsmiljø", leverandoerId: "review-supplier-drift", enhed: "sæt", pakningsstoerrelse: "1 komplet sæt", indkoebsprisOere: 129995, favorit: true, tidligereKoeb: true, billedeType: "safety" },
  { id: "review-item-gloves", varenummer: "TEST-HAND-010", navn: "Syntetiske nitrilhandsker str. 10", varegruppe: "Arbejdsmiljø", leverandoerId: "review-supplier-drift", enhed: "par", pakningsstoerrelse: "12 par", indkoebsprisOere: 1895, favorit: true, tidligereKoeb: true, billedeType: "safety" },
  { id: "review-item-cleaner", varenummer: "TEST-REN-005", navn: "Syntetisk universalrengøring koncentrat", varegruppe: "Rengøring", leverandoerId: "review-supplier-drift", enhed: "liter", pakningsstoerrelse: "5 liters dunk", indkoebsprisOere: 23750, tidligereKoeb: true, billedeType: "cleaning" },
  { id: "review-item-filter", varenummer: "TEST-FIL-042", navn: "Syntetisk pollenfilter til servicekøretøj", varegruppe: "Reservedele", leverandoerId: "review-supplier-teknik", enhed: "stk.", pakningsstoerrelse: "1 stk.", indkoebsprisOere: 8450, tidligereKoeb: true, billedeType: "parts" },
  { id: "review-item-led", varenummer: "TEST-LED-120", navn: "Syntetisk LED-rør 1200 mm neutral hvid", varegruppe: "El-materiel", leverandoerId: "review-supplier-teknik", enhed: "stk.", pakningsstoerrelse: "10 stk.", indkoebsprisOere: 9975, billedeType: "electrical" },
  { id: "review-item-cable", varenummer: "TEST-KAB-050", navn: "Syntetisk installationskabel 3G2,5 mm²", varegruppe: "El-materiel", leverandoerId: "review-supplier-teknik", enhed: "meter", pakningsstoerrelse: "50 meter rulle", indkoebsprisOere: 1485, favorit: true, billedeType: "electrical" },
  { id: "review-item-bolts", varenummer: "TEST-BOL-M8", navn: "Syntetisk boltsæt M8 rustfri", varegruppe: "Befæstelse", leverandoerId: "review-supplier-teknik", enhed: "æske", pakningsstoerrelse: "100 stk.", indkoebsprisOere: 32400, billedeType: "parts" },
  { id: "review-item-tape", varenummer: "TEST-TAP-048", navn: "Syntetisk pakketape klar 48 mm", varegruppe: "Emballage", leverandoerId: "review-supplier-kontor", enhed: "rulle", pakningsstoerrelse: "6 ruller", indkoebsprisOere: 2495, tidligereKoeb: true, billedeType: "packaging" },
  { id: "review-item-paper", varenummer: "TEST-PAP-A4", navn: "Syntetisk kopipapir A4 80 g", varegruppe: "Kontorartikler", leverandoerId: "review-supplier-kontor", enhed: "pakke", pakningsstoerrelse: "500 ark", indkoebsprisOere: 4595, billedeType: "office" },
  { id: "review-item-marker", varenummer: "TEST-MAR-BLU", navn: "Syntetisk permanent marker blå", varegruppe: "Kontorartikler", leverandoerId: "review-supplier-kontor", enhed: "stk.", pakningsstoerrelse: "10 stk.", indkoebsprisOere: 1275, billedeType: "office" },
  { id: "review-item-battery", varenummer: "TEST-BAT-18V", navn: "Syntetisk batteripakke 18 V 5,0 Ah", varegruppe: "Værktøj", leverandoerId: "review-supplier-teknik", enhed: "stk.", pakningsstoerrelse: "1 stk.", indkoebsprisOere: 74900, favorit: true, billedeType: "tools" },
  { id: "review-item-ties", varenummer: "TEST-BIN-300", navn: "Syntetiske kabelbindere 300 mm UV-bestandige", varegruppe: "Befæstelse", leverandoerId: "review-supplier-kontor", enhed: "pose", pakningsstoerrelse: "100 stk.", indkoebsprisOere: 3895, billedeType: "parts" },
];

export const REVIEW_CALENDAR_CATEGORIES = [
  ["ferie", "Ferie"],
  ["feriefridag", "Feriefridag"],
  ["afspadsering", "Afspadsering"],
  ["sygdom", "Sygdom"],
  ["barnSyg", "Barns 1. sygedag"],
  ["barsel", "Barsel"],
  ["kursus", "Kursus"],
  ["andet", "Andet"],
];

export const REVIEW_UNIT_TYPES = [
  ["review-servicekoeretoej", "Servicekøretøj", "varevogn", true],
  ["review-lagertruck", "Lagertruck", "truck", true],
  ["review-udgaaet-trailer", "Udgået trailertype", "trailer", false],
];

function catalogPatch() {
  return Object.fromEntries([
    ...REVIEW_CATALOG_SUPPLIERS.map((row) => [`tenants/${TENANT_ID}/leverandoerer/${row.id}`, { ...row, aktiv: true, fixture: FIXTURE }]),
    ...[...new Set(REVIEW_CATALOG_ITEMS.map((row) => row.varegruppe))].map((name, index) => [`tenants/${TENANT_ID}/ressourceKategorier/varer/review-category-${index + 1}`, { navn: name, aktiv: true, sortering: (index + 1) * 100, fixture: FIXTURE }]),
    ...REVIEW_CATALOG_ITEMS.map((row) => [`tenants/${TENANT_ID}/forbrugsvarer/${row.id}`, {
      ...row,
      aktiv: true,
      bestillingsenhed: row.enhed,
      grundenhed: row.enhed,
      antalPrBestillingsenhed: 1,
      bestillingsprisOere: row.indkoebsprisOere,
      minimumsantal: 1,
      bestillingstrin: 1,
      enkeltsalg: true,
      standardAfdelingId: "review-department-drift",
      fixture: FIXTURE,
    }]),
  ]);
}

function assertLocalHost(host, name) {
  assert.match(host || "", /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal være en lokal emulator.`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body?.error?.message || JSON.stringify(body)}`);
  return body;
}

function claimsFromToken(token) {
  const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
}

export function workforcePatch({ uid, now = Date.now() }) {
  const hour = 3_600_000;
  const day = 24 * hour;
  return {
    ...catalogPatch(),
    ...Object.fromEntries(REVIEW_UNIT_TYPES.map(([id, navn, tekniskArt, aktiv], index) => [
      `tenants/${TENANT_ID}/ressourceKategorier/enheder/${id}`,
      {
        navn, tekniskArt, aktiv, sortering: (index + 1) * 10,
        oprettetMs: now - day, oprettetAf: uid, opdateretMs: now, opdateretAf: uid,
      },
    ])),
    ...Object.fromEntries(REVIEW_CALENDAR_CATEGORIES.map(([id, navn], index) => [
      `tenants/${TENANT_ID}/ressourceKategorier/kalenderkategorier/${id}`,
      { navn, aktiv: true, sortering: (index + 1) * 10, fixture: FIXTURE },
    ])),
    [`tenants/${TENANT_ID}/_findes`]: true,
    [`tenants/${TENANT_ID}/abonnement/status`]: "aktiv",
    [`tenants/${TENANT_ID}/moduler/bemanding`]: true,
    [`tenants/${TENANT_ID}/moduler/unitbooking`]: true,
    [`tenants/${TENANT_ID}/moduler/flaade`]: true,
    [`tenants/${TENANT_ID}/moduler/facility`]: true,
    [`tenants/${TENANT_ID}/moduler/indkoeb`]: true,
    [`tenants/${TENANT_ID}/moduler/warehouse`]: true,
    [`tenants/${TENANT_ID}/koeretoejer/review-unit-service`]: {
      art: "varevogn",
      kategoriId: "review-servicekoeretoej",
      status: "aktiv",
      kaldenavn: "TEST-101",
      navn: "Syntetisk servicebil",
      hjemsted: "Review-værksted",
      registrering: "TEST101",
      kmStand: 12500,
      fleetProfil: {
        schemaVersion: 1, number: "TEST-101", type: "vehicle",
        make: "Syntetisk", model: "Servicebil", department: "Review-værksted",
        meterType: "km", meter: 12500,
        equipment: { towHook: false, trailerCoupling: false, crane: false, lift: false },
        notes: "Kun syntetiske testdata", updatedAt: new Date(now).toISOString(),
      },
    },
    [`tenants/${TENANT_ID}/brugere/${uid}`]: {
      email: REVIEW_EMAIL,
      navn: "Syntetisk administrator",
      rolle: "admin",
      personId: "wf-review-admin",
      fixture: FIXTURE,
    },
    [`tenants/${TENANT_ID}/personale/wf-review-admin`]: {
      navn: "Syntetisk administrator",
      email: REVIEW_EMAIL,
      status: "aktiv",
      uid,
      funktioner: { administration: true },
      stationeret: "Review-kontor",
      ansaettelsesform: "fastansat",
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/personale/wf-review-service`]: {
      navn: "Sofie Syntetisk",
      email: "sofie.workforce@example.invalid",
      status: "aktiv",
      funktioner: { servicetekniker: true },
      stationeret: "Review-værksted",
      ansaettelsesform: "fastansat",
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/personale/wf-review-logistik`]: {
      navn: "Lars Syntetisk",
      email: "lars.workforce@example.invalid",
      status: "aktiv",
      funktioner: { lager: true },
      stationeret: "Review-lager",
      ansaettelsesform: "fastansat",
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/vagter/wf-review-shift`]: {
      personId: "wf-review-admin",
      fra: now - 3 * hour,
      til: now + 5 * hour,
      pauseMin: 30,
      status: "published",
      arbejdssted: "Review-kontor",
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/fravaer/wf-review-approved`]: {
      personId: "wf-review-service",
      fra: now - hour,
      til: now + 5 * hour,
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/fravaer/wf-review-pending`]: {
      personId: "wf-review-logistik",
      fra: now + 7 * day,
      til: now + 8 * day,
      ansoegning: { status: "ansoegt", oensket: "ferie", ansoegtMs: now - day },
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/sensitive/fravaer/wf-review-approved`]: {
      art: "ferie",
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/kompetencer/wf-review-skill`]: {
      personId: "wf-review-service",
      type: "SERVICE",
      udloeberMs: now + 15 * day,
      dokumentreference: "syntetisk-certifikat.pdf",
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/stemplinger/wf-review-admin/wf-review-open`]: {
      indMs: now - 2 * hour,
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/stemplinger/wf-review-service/wf-review-awaiting`]: {
      indMs: now - 9 * hour,
      udMs: now - hour,
      pauseMin: 30,
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/workforceGodkendelsesomfang/${uid}/personer`]: {
      "wf-review-service": true,
      "wf-review-logistik": true,
    },
    [`tenants/${TENANT_ID}/kassetyper/moduloverblik-v1-type`]: {
      navn: "Syntetisk review-unit",
      aktiv: true,
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/reolpladser/moduloverblik-v1-plads`]: {
      hal: "TEST",
      reol: "01",
      fag: "01",
      niveau: "01",
      position: "A",
      aktiv: true,
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/kasser/moduloverblik-v1-ledig`]: {
      type: "moduloverblik-v1-type",
      status: "ledig",
      hjemPladsId: "moduloverblik-v1-plads",
      pladsId: "moduloverblik-v1-plads",
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/kasser/moduloverblik-v1-udlaant`]: {
      type: "moduloverblik-v1-type",
      status: "udlaant",
      hjemPladsId: "moduloverblik-v1-plads",
      pladsId: null,
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/kasser/moduloverblik-v1-ude-af-drift`]: {
      type: "moduloverblik-v1-type",
      status: "udeAfDrift",
      hjemPladsId: "moduloverblik-v1-plads",
      pladsId: "moduloverblik-v1-plads",
      udeAfDriftFra: now - day,
      fixture: "moduloverblik-v1-synthetic",
    },
    [`tenants/${TENANT_ID}/kasseudlaan/moduloverblik-v1-udlaant`]: {
      kasseId: "moduloverblik-v1-udlaant",
      sagsnummer: "TEST-UNIT-001",
      beskrivelse: "Tydeligt syntetisk belægningsfixture",
      fra: now - day,
      til: now + day,
      tilstand: "udlaant",
      udleveretMs: now - day,
      fixture: "moduloverblik-v1-synthetic",
    },
  };
}

export async function seedModuleOverviewWorkforce() {
  assert.equal(PROJECT_ID, "demo-veyro-integration", "Seedet må kun bruges i demo-veyro-integration.");
  assertLocalHost(authHost, "FIREBASE_AUTH_EMULATOR_HOST");
  assertLocalHost(databaseHost, "FIREBASE_DATABASE_EMULATOR_HOST");
  assert.ok(REVIEW_EMAIL && password, "Review-login skal komme fra procesmiljøet.");

  const login = await jsonRequest(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: REVIEW_EMAIL, password, returnSecureToken: true }),
  });
  const claims = claimsFromToken(login.idToken);
  assert.equal(claims.tenant, TENANT_ID, "Review-brugeren skal tilhøre den dokumenterede tenant.");
  assert.equal(claims.pv, 2, "Review-brugeren skal have claims v2.");

  const patch = workforcePatch({ uid: login.localId });
  await jsonRequest(`http://${databaseHost}/.json?ns=${encodeURIComponent(PROJECT_ID)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify(patch),
  });
  return {
    ok: true,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    dataSource: "Realtime Database emulator",
    fixture: FIXTURE,
    employees: 3,
    units: 3,
    catalogItems: REVIEW_CATALOG_ITEMS.length,
    catalogSuppliers: REVIEW_CATALOG_SUPPLIERS.length,
    calendarCategories: REVIEW_CALENDAR_CATEGORIES.length,
    externalServices: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedModuleOverviewWorkforce()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
