/* Read-only Auth/custom-claims-inventering. Scriptet skriver aldrig til Auth,
 * RTDB eller claims og skal koeres manuelt med eksplicit projektbekraeftelse. */
import { pathToFileURL } from "node:url";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import {
  CUSTOM_CLAIM_EXTRA_ALLOWLIST,
  RESERVED_CUSTOM_CLAIM_KEYS,
  vurderClaimPermissions,
} from "../src/fleet/permissions.js";

const AUTORITET = new Set(["tenant", "rolle", "pv", "perms"]);
const RESERVERET = new Set(RESERVED_CUSTOM_CLAIM_KEYS);
const BEKRAEFT = "READ_ONLY_AUTH_INVENTORY";

export function laesInventeringsArgumenter(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  if (typeof a.project !== "string" || !/^[a-z][a-z0-9-]{4,39}$/.test(a.project)) {
    throw new Error("--project med et eksplicit Firebase project-id mangler.");
  }
  if (typeof a["database-url"] !== "string") throw new Error("--database-url mangler.");
  const host = new URL(a["database-url"]).hostname;
  if (!host.startsWith(`${a.project}-`) && host !== `${a.project}.firebaseio.com`) {
    throw new Error("--database-url tilhoerer ikke det angivne --project.");
  }
  if (a.bekraeft !== BEKRAEFT) {
    throw new Error(`--bekraeft ${BEKRAEFT} mangler.`);
  }
  return { projectId: a.project, databaseURL: a["database-url"] };
}

export function klassificerKonto(bruger) {
  const claims = bruger.customClaims || {};
  const vurdering = vurderClaimPermissions(claims);
  const version = Object.prototype.hasOwnProperty.call(claims, "pv")
    ? (vurdering.ok && vurdering.format === "v2" ? "v2" : "ukendt")
    : (vurdering.ok && vurdering.format === "legacy" ? "legacy" : "ukendt");
  const ekstra = Object.keys(claims).filter((felt) => !AUTORITET.has(felt));
  return {
    uid: bruger.uid,
    tenant: typeof claims.tenant === "string" ? claims.tenant : null,
    version,
    claimFejlkode: vurdering.kode,
    ukendteEkstraClaims: ekstra.filter((felt) => !CUSTOM_CLAIM_EXTRA_ALLOWLIST[felt] && !RESERVERET.has(felt)),
    reserveredeEkstraClaims: ekstra.filter((felt) => RESERVERET.has(felt)),
  };
}

async function alleBrugere(auth) {
  const brugere = [];
  let pageToken;
  do {
    const side = await auth.listUsers(1000, pageToken);
    brugere.push(...side.users);
    pageToken = side.pageToken;
  } while (pageToken);
  return brugere;
}

export async function inventer({ auth, db }) {
  const konti = (await alleBrugere(auth)).map(klassificerKonto);
  const authUids = new Set(konti.map((konto) => konto.uid));
  const tenantIds = new Set(konti.map((konto) => konto.tenant).filter(Boolean));
  const kundeindeks = (await db.ref("udbyder/kunder").once("value")).val() || {};
  Object.keys(kundeindeks).forEach((tenant) => tenantIds.add(tenant));

  const udenTenantindeks = [];
  const indeksUdenAuth = [];
  for (const tenant of [...tenantIds].sort()) {
    const indeks = (await db.ref(`tenants/${tenant}/brugere`).once("value")).val() || {};
    for (const uid of Object.keys(indeks)) {
      if (!authUids.has(uid)) indeksUdenAuth.push({ tenant, uid });
    }
    for (const konto of konti.filter((k) => k.tenant === tenant)) {
      if (!Object.prototype.hasOwnProperty.call(indeks, konto.uid)) {
        udenTenantindeks.push({ tenant, uid: konto.uid });
      }
    }
  }
  return {
    dryRun: true,
    antalAuthKonti: konti.length,
    legacy: konti.filter((k) => k.version === "legacy").map((k) => k.uid),
    v2: konti.filter((k) => k.version === "v2").map((k) => k.uid),
    ukendteVersioner: konti.filter((k) => k.version === "ukendt").map((k) => ({ uid: k.uid, kode: k.claimFejlkode })),
    claimsUdenTenantindeks: udenTenantindeks,
    tenantindeksUdenAuthKonto: indeksUdenAuth,
    ukendteEkstraClaims: konti.filter((k) => k.ukendteEkstraClaims.length).map((k) => ({ uid: k.uid, felter: k.ukendteEkstraClaims })),
    reserveredeEkstraClaims: konti.filter((k) => k.reserveredeEkstraClaims.length).map((k) => ({ uid: k.uid, felter: k.reserveredeEkstraClaims })),
  };
}

async function main() {
  const config = laesInventeringsArgumenter(process.argv.slice(2));
  const app = initializeApp({ credential: applicationDefault(), ...config }, "auth-claims-read-only-inventory");
  try {
    console.log(JSON.stringify(await inventer({ auth: getAuth(app), db: getDatabase(app) }), null, 2));
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((fejl) => { console.error(`AFBRUDT: ${fejl.message}`); process.exitCode = 1; });
}
