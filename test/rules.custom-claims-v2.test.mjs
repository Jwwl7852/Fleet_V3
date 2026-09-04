import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";
import { GYLDIGE_CLAIM_CASES } from "./custom-claims-v2-cases.mjs";

const T = "claims-v2-a";
const ANDEN = "claims-v2-b";
let miljoe;
const kunde = (db, tenant = T) => get(ref(db, `tenants/${tenant}/kunder/k1`));
const virksomhed = (db, tenant = T) => get(ref(db, `tenants/${tenant}/virksomhed`));
const kontekst = (uid, claims) => miljoe.authenticatedContext(uid, claims).database();
const v2Claims = GYLDIGE_CLAIM_CASES.find(({ navn }) => navn === "v2-kanonisk").claims;
const legacyClaims = GYLDIGE_CLAIM_CASES.find(({ navn }) => navn === "legacy-katalogordnet").claims;

async function tilladLegacy(uid, tenant = T, expiresAtMs = Date.now() + 60_000) {
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `legacyClaimsAllowlist/${uid}`), { tenant, expiresAtMs });
  });
}

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "demo-fleet-custom-claims-v2",
    database: { host: "127.0.0.1", port: 9000, rules: readFileSync("firebase.rules.json", "utf8") },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const tenant of [T, ANDEN]) {
      await set(ref(db, `tenants/${tenant}/_findes`), true);
      await set(ref(db, `tenants/${tenant}/virksomhed`), { navn: "Syntetisk tenant" });
      await set(ref(db, `tenants/${tenant}/kunder/k1`), { navn: "Kunde", aktiv: true });
    }
  });
});

after(async () => { await miljoe?.cleanup(); });

describe("custom claims v2-paritet i Database Rules", () => {
  for (const testCase of GYLDIGE_CLAIM_CASES.filter(({ claims }) => claims.pv === 2)) {
    it(`accepterer ${testCase.navn}`, async () => {
      await assertSucceeds(kunde(kontekst(`ok-${testCase.navn}`, { ...testCase.claims, auth_time: 200 })));
    });
  }
  it("afviser ukendt pv, forkert pv-type og v2 uden den krævede kode", async () => {
    await assertFails(kunde(kontekst("ukendt-pv", { ...v2Claims, pv: 3, auth_time: 200 })));
    await assertFails(kunde(kontekst("streng-pv", { ...v2Claims, pv: "2", auth_time: 200 })));
    await assertFails(kunde(kontekst("ukendt-kode", { ...v2Claims, perms: "|zz|", auth_time: 200 })));
  });
  it("bruger kun hele delimiterbeskyttede v2-tokens", async () => {
    const kode = v2Claims.perms.slice(1, -1);
    await assertFails(kunde(kontekst("uden-delimitere", { ...v2Claims, perms: kode, auth_time: 200 })));
    await assertFails(kunde(kontekst("substring", { ...v2Claims, perms: `|${kode}x|`, auth_time: 200 })));
    await assertFails(kunde(kontekst("anden-kode", { ...v2Claims, perms: "|00|zz|", auth_time: 200 })));
  });
  it("afviser legacy ved tom allowlist, både uden pv og med pv:null", async () => {
    await assertFails(kunde(kontekst("legacy-tom", { ...legacyClaims, auth_time: 200 })));
    await assertFails(kunde(kontekst("legacy-null-tom", { ...legacyClaims, pv: null, auth_time: 200 })));
    await assertFails(virksomhed(kontekst("legacy-tom-tenantregel", { ...legacyClaims, auth_time: 200 })));
  });
  it("accepterer tidsbegrænset allowlist for både manglende pv og pv:null", async () => {
    await tilladLegacy("legacy-mangler-pv");
    await tilladLegacy("legacy-null");
    await assertSucceeds(kunde(kontekst("legacy-mangler-pv", { ...legacyClaims, auth_time: 200 })));
    await assertSucceeds(kunde(kontekst("legacy-null", { ...legacyClaims, pv: null, auth_time: 200 })));
    await assertSucceeds(virksomhed(kontekst("legacy-mangler-pv", { ...legacyClaims, auth_time: 200 })));
    await assertSucceeds(virksomhed(kontekst("legacy-null", { ...legacyClaims, pv: null, auth_time: 200 })));
  });
  it("afviser legacy ved forkert tenant, udløbet post og forkert UID", async () => {
    await tilladLegacy("legacy-forkert-tenant", ANDEN);
    await tilladLegacy("legacy-udloebet", T, Date.now() - 1);
    await tilladLegacy("legacy-anden-uid");
    await assertFails(kunde(kontekst("legacy-forkert-tenant", { ...legacyClaims, auth_time: 200 })));
    await assertFails(kunde(kontekst("legacy-udloebet", { ...legacyClaims, auth_time: 200 })));
    await assertFails(kunde(kontekst("legacy-forkert-uid", { ...legacyClaims, auth_time: 200 })));
  });
  it("ukendt legacy-indhold kan ikke skabe en permission uden et helt token", async () => {
    await tilladLegacy("legacy-ukendt");
    await tilladLegacy("legacy-substring");
    await assertFails(kunde(kontekst("legacy-ukendt", { ...legacyClaims, perms: "|ukendt.permission|", auth_time: 200 })));
    await assertFails(kunde(kontekst("legacy-substring", {
      ...legacyClaims, perms: `${legacyClaims.perms.slice(0, -1)}Ekstra|`, auth_time: 200,
    })));
  });
  it("afviser cross-tenant selv med gyldigt claim", async () => {
    await assertFails(kunde(kontekst("cross", { ...v2Claims, auth_time: 200 }), ANDEN));
  });
  it("håndhæver gammel/ny token, manglende metadata og forkert UID", async () => {
    const claims = { ...v2Claims };
    await miljoe.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), "authRevocations/gammel/revokeTime"), 100);
      await set(ref(ctx.database(), "authRevocations/ny/revokeTime"), 100);
      await set(ref(ctx.database(), "authRevocations/anden/revokeTime"), 999);
    });
    await assertFails(kunde(kontekst("gammel", { ...claims, auth_time: 100 })));
    await assertSucceeds(kunde(kontekst("ny", { ...claims, auth_time: 101 })));
    await assertSucceeds(kunde(kontekst("uden-metadata", { ...claims, auth_time: 1 })));
    await assertSucceeds(kunde(kontekst("forkert-uid", { ...claims, auth_time: 1 })));
  });
  it("låser revocation-metadata mod direkte SDK-læsning og -skrivning", async () => {
    const db = kontekst("direkte", { ...v2Claims, auth_time: 200 });
    await assertFails(get(ref(db, "authRevocations/direkte")));
    await assertFails(set(ref(db, "authRevocations/direkte/revokeTime"), 300));
  });
  it("låser legacy-allowlisten mod direkte SDK-læsning og -skrivning", async () => {
    const db = kontekst("direkte-legacy", { ...v2Claims, auth_time: 200 });
    await assertFails(get(ref(db, "legacyClaimsAllowlist/direkte-legacy")));
    await assertFails(set(ref(db, "legacyClaimsAllowlist/direkte-legacy"), {
      tenant: T, expiresAtMs: Date.now() + 60_000,
    }));
  });
});
