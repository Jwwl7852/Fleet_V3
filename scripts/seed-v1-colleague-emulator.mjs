/* Reproducerbar, lokal Version 1-fixture til kollegatest.
 * Scriptet accepterer kun localhost og det faste demo-projekt og kan derfor
 * ikke oprette brugere eller data i DEV/produktion. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  ALLE_PERMS, CLAIM_PERMISSION_VERSION, kompaktPermStreng,
} from "../src/fleet/permissions.js";

export const PROJECT_ID = "demo-veyro-integration";
export const TEST_EMAIL = "kollegatest-admin@example.invalid";
export const TEST_PASSWORD = "Veyro-Kollegatest-Only-2026!";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";

function assertLocalHost(host, name) {
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal pege på en lokal emulator.`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body?.error?.message || JSON.stringify(body)}`);
  return body;
}

async function createOrLogin() {
  const endpoint = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts`;
  const payload = { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: "Syntetisk kollegatest-administrator", returnSecureToken: true };
  const signup = await fetch(`${endpoint}:signUp?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  if (signup.ok) return signup.json();
  return jsonRequest(`${endpoint}:signInWithPassword?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
}

export async function seedV1ColleagueEmulator() {
  assertLocalHost(authHost, "FIREBASE_AUTH_EMULATOR_HOST");
  assertLocalHost(databaseHost, "FIREBASE_DATABASE_EMULATOR_HOST");

  process.env.VITE_FB_PROJECT_ID = PROJECT_ID;
  process.env.VITE_DEV_EJER_MAIL = TEST_EMAIL;
  process.env.VITE_DEV_BRUGER_KODE = TEST_PASSWORD;
  const { TENANT_ID, workforcePatch } = await import("./moduloverblik-v1-emulator-seed.mjs");

  const account = await createOrLogin();
  const claims = {
    tenant: TENANT_ID,
    rolle: "admin",
    pv: CLAIM_PERMISSION_VERSION,
    perms: kompaktPermStreng(ALLE_PERMS),
  };
  await jsonRequest(`http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({
      localId: account.localId,
      displayName: "Syntetisk kollegatest-administrator",
      password: TEST_PASSWORD,
      customAttributes: JSON.stringify(claims),
    }),
  });

  const rules = await readFile(new URL("../firebase.rules.json", import.meta.url), "utf8");
  await jsonRequest(`http://${databaseHost}/.settings/rules.json?ns=${PROJECT_ID}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: rules,
  });
  const patch = workforcePatch({ uid: account.localId, now: Date.now() });
  await jsonRequest(`http://${databaseHost}/.json?ns=${PROJECT_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify(patch),
  });

  return {
    ok: true,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    email: TEST_EMAIL,
    data: "Kun syntetiske tenantdata i lokale emulatorer",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedV1ColleagueEmulator()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
