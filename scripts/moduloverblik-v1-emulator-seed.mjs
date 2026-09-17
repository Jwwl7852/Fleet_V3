/* Lokal, syntetisk WORKFORCE-fixture til det integrerede Version 1-review.
 * Scriptet nægter at køre mod andre værter eller projekter og patcher kun de
 * WORKFORCE-noder, der mangler i den eksisterende review-tenant. Det sletter
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
    [`tenants/${TENANT_ID}/_findes`]: true,
    [`tenants/${TENANT_ID}/abonnement/status`]: "aktiv",
    [`tenants/${TENANT_ID}/moduler/bemanding`]: true,
    [`tenants/${TENANT_ID}/moduler/unitbooking`]: true,
    [`tenants/${TENANT_ID}/moduler/flaade`]: true,
    [`tenants/${TENANT_ID}/moduler/facility`]: true,
    [`tenants/${TENANT_ID}/moduler/indkoeb`]: true,
    [`tenants/${TENANT_ID}/moduler/warehouse`]: true,
    [`tenants/${TENANT_ID}/brugere/${uid}`]: {
      email: REVIEW_EMAIL,
      navn: "Syntetisk administrator",
      rolle: "admin",
      personId: "wf-review-admin",
      fixture: "moduloverblik-v1-synthetic",
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
    fixture: "moduloverblik-v1-synthetic",
    employees: 3,
    units: 3,
    externalServices: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedModuleOverviewWorkforce()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
