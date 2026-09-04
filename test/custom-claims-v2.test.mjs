import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALLE_PERMS, CLAIM_PERMISSION_VERSION, CUSTOM_CLAIMS_BUDGET_BYTES,
  CUSTOM_CLAIM_EXTRA_ALLOWLIST, FIREBASE_CUSTOM_CLAIMS_MAX_BYTES,
  PERM_KODE, ROLLE_PERMS, RESERVED_CUSTOM_CLAIM_KEYS,
  byggRolleClaims, customClaimsBytes, kompaktPermStreng,
  opdaterTilladtEkstraClaim, permStrengFraClaims, tjekPermissionMapping,
  vurderClaimPermissions,
} from "../src/fleet/permissions.js";
import * as functionsDecoder from "../functions/delt/permissions.js";
import { migrerClaimKonti } from "../src/fleet/claims-migration.js";
import { claimsFor } from "../src/fleet/dev-brugere.js";
import { GYLDIGE_CLAIM_CASES, UGYLDIGE_CLAIM_CASES } from "./custom-claims-v2-cases.mjs";
import { klassificerKonto, laesInventeringsArgumenter } from "../scripts/auth-claims-inventering.mjs";
import { testClaimsV2 } from "./rules-test-claims.mjs";

const TENANT_40 = `t${"x".repeat(39)}`;

describe("custom claims v2", () => {
  it("migrerer almindelige emulator-fixtures gennem den officielle v2-encoder", () => {
    const permissions = [ALLE_PERMS[0], ALLE_PERMS[1]];
    assert.deepEqual(testClaimsV2({
      tenant: "syntetiskTenant",
      rolle: "koordinator",
      perms: `|${permissions.join("|")}|`,
    }), {
      tenant: "syntetiskTenant",
      rolle: "koordinator",
      pv: 2,
      perms: kompaktPermStreng(permissions),
    });
    assert.equal(testClaimsV2({ udbyder: true }).udbyder, true);
    assert.throws(() => testClaimsV2({ udbyder: "true" }), /Ikke-tilladt/);
    assert.throws(() => testClaimsV2({ ukendt: true }), /Ikke-tilladt/);
    assert.throws(() => testClaimsV2({ pv: null }), /må ikke sætte pv/);
    assert.throws(() => testClaimsV2({ rolle: "superadmin" }), /Ukendt testrolle/);
  });

  it("round-tripper alle 58 permissions, alle roller og tenanttilpassede roller", () => {
    assert.equal(ALLE_PERMS.length, 58);
    const lister = [...Object.entries(ROLLE_PERMS), ["tenant-alle", ALLE_PERMS]];
    for (const [navn, perms] of lister) {
      const rolle = navn === "tenant-alle" ? "disponent" : navn;
      const claims = byggRolleClaims({ tenant: TENANT_40, rolle, perms });
      assert.equal(claims.pv, CLAIM_PERMISSION_VERSION);
      assert.deepEqual([...vurderClaimPermissions(claims).perms].sort(), [...perms].sort(), navn);
      assert.deepEqual([...functionsDecoder.vurderClaimPermissions(claims).perms].sort(), [...perms].sort(), navn);
    }
  });

  it("giver identisk resultat i klient- og Functions-decoder for hele matrixen", () => {
    for (const testCase of GYLDIGE_CLAIM_CASES) {
      const klient = vurderClaimPermissions(testCase.claims);
      const functions = functionsDecoder.vurderClaimPermissions(testCase.claims);
      assert.equal(klient.ok, true, testCase.navn);
      assert.deepEqual(klient, functions, testCase.navn);
      assert.deepEqual(klient.perms, [...testCase.forventet], testCase.navn);
    }
    for (const testCase of UGYLDIGE_CLAIM_CASES) {
      const klient = vurderClaimPermissions(testCase.claims);
      const functions = functionsDecoder.vurderClaimPermissions(testCase.claims);
      assert.equal(klient.ok, false, testCase.navn);
      assert.deepEqual(klient.perms, [], testCase.navn);
      assert.deepEqual(klient, functions, testCase.navn);
      assert.equal(permStrengFraClaims(testCase.claims), "", testCase.navn);
    }
  });

  it("mappingen er komplet, kollisionsfri og har præcis to tegn", () => {
    assert.deepEqual(tjekPermissionMapping(ALLE_PERMS, PERM_KODE), { ok: true, kode: null });
    const mangler = { ...PERM_KODE }; delete mangler[ALLE_PERMS[0]];
    assert.equal(tjekPermissionMapping(ALLE_PERMS, mangler).kode, "mapping/missing-permission");
    const kollision = { ...PERM_KODE, [ALLE_PERMS[1]]: PERM_KODE[ALLE_PERMS[0]] };
    assert.equal(tjekPermissionMapping(ALLE_PERMS, kollision).kode, "mapping/code-collision");
    const laengde = { ...PERM_KODE, [ALLE_PERMS[0]]: "x" };
    assert.equal(tjekPermissionMapping(ALLE_PERMS, laengde).kode, "mapping/invalid-code-length");
  });

  it("allowlister kun boolske serverflags og overskriver autoritetsfelterne", () => {
    assert.deepEqual(CUSTOM_CLAIM_EXTRA_ALLOWLIST, { udbyder: "boolean", devTester: "boolean" });
    const claims = byggRolleClaims({ tenant: TENANT_40, rolle: "chauffoer", perms: [],
      eksisterende: { tenant: "gammel", rolle: "admin", pv: 1, perms: "x", udbyder: true, devTester: false } });
    assert.equal(claims.tenant, TENANT_40); assert.equal(claims.rolle, "chauffoer");
    assert.equal(claims.pv, 2); assert.equal(claims.perms, "");
    assert.equal(claims.udbyder, true); assert.equal(claims.devTester, false);
    for (const [ekstra, kode] of [["ukendt", "claims/unknown-extra-claim"], ["sub", "claims/reserved-extra-claim"]]) {
      assert.throws(() => byggRolleClaims({ tenant: TENANT_40, rolle: "admin", perms: [], eksisterende: { [ekstra]: true } }),
        (fejl) => fejl.code === kode);
    }
    assert.ok(RESERVED_CUSTOM_CLAIM_KEYS.includes("auth_time"));
    assert.throws(() => byggRolleClaims({ tenant: TENANT_40, rolle: "admin", perms: [], eksisterende: { udbyder: "true" } }),
      (fejl) => fejl.code === "claims/invalid-extra-claim");
    assert.deepEqual(opdaterTilladtEkstraClaim({ tenant: "t", rolle: "r", perms: "", udbyder: true }, "udbyder", undefined),
      { tenant: "t", rolle: "r", perms: "" });
  });

  it("måler hele slutobjektet i UTF-8 og holder worst case under 750 bytes", () => {
    const claims = byggRolleClaims({ tenant: TENANT_40, rolle: "admin", perms: ALLE_PERMS,
      eksisterende: { udbyder: true, devTester: true } });
    const bytes = Buffer.byteLength(JSON.stringify(claims), "utf8");
    assert.equal(customClaimsBytes(claims), bytes);
    assert.equal(bytes, 294);
    assert.ok(bytes <= CUSTOM_CLAIMS_BUDGET_BYTES);
    assert.ok(FIREBASE_CUSTOM_CLAIMS_MAX_BYTES - CUSTOM_CLAIMS_BUDGET_BYTES >= 250);
    assert.deepEqual(Object.keys(claims).sort(), ["devTester", "perms", "pv", "rolle", "tenant", "udbyder"]);
  });

  it("bruger samme builder til første admin og autoritative rolleskift", () => {
    assert.equal(claimsFor("admin", TENANT_40).perms, kompaktPermStreng(ROLLE_PERMS.admin));
    const functions = readFileSync("functions/index.js", "utf8");
    assert.match(functions, /setCustomUserClaims\(bruger\.uid, await claimForRolle\(tenantId, rolle\)\)/);
    for (const navn of ["skiftrolle", "rolleskriv", "claimsfornyv2"]) {
      const start = functions.indexOf(`export const ${navn} = onCall`);
      const slut = functions.indexOf("\nexport const ", start + 1);
      const krop = functions.slice(start, slut < 0 ? undefined : slut);
      assert.match(krop, /byggRolleClaims|claimForRolle|migrerClaimKonti/, navn);
      assert.match(krop, /tilbagekaldOgGemRevocation|saetClaimsEfterRevocation/, navn);
    }
  });

  it("migrationen fortsætter efter enkeltfejl og rapporterer alle detaljer", async () => {
    const set = [];
    const fejl = Object.assign(new Error("fortrolig detalje"), { code: "claims/too-large" });
    const resultat = await migrerClaimKonti({
      poster: { a: { rolle: "admin" }, b: { rolle: "admin" }, c: { rolle: "ukendt" } },
      gyldigRolle: (rolle) => rolle === "admin",
      forny: async (uid) => { set.push(uid); if (uid === "a") throw fejl; },
      fejlkode: (e) => e.code,
      vedFejl: () => {},
    });
    assert.deepEqual(set, ["a", "b"]);
    assert.deepEqual(resultat, { ok: false, ramte: 3, fornyet: 1, fejlede: ["a", "c"],
      fejldetaljer: [{ uid: "a", kode: "claims/too-large" }, { uid: "c", kode: "claims/invalid-role" }] });
  });

  it("claimsfornyv2 er tenantlåst, serverautoritativt og logger sikre fejl", () => {
    const functions = readFileSync("functions/index.js", "utf8");
    const start = functions.indexOf("export const claimsfornyv2 = onCall");
    const slut = functions.indexOf("\nexport const ", start + 1);
    const migration = functions.slice(start, slut);
    assert.doesNotMatch(migration, /req\.data|req\.auth\.token\.rolle/);
    assert.match(migration, /kraevBrugeradmin\(req\)/);
    assert.match(migration, /hentRoller\(tenantId\)/);
    assert.match(migration, /hentIEgenTenant/);
    assert.match(functions, /tokensValidAfterTime/);
    assert.match(functions, /authRevocations/);
    assert.match(functions, /claims\/claim-write-failed/);
    assert.doesNotMatch(functions, /catch\s*\{\s*\}/);
  });

  it("Auth-inventeringen kræver eksplicit projektbekræftelse og er read-only", () => {
    assert.throws(() => laesInventeringsArgumenter([]), /--project/);
    assert.throws(() => laesInventeringsArgumenter([
      "--project", "fleet-dev", "--database-url", "https://fleet-dev-default-rtdb.firebaseio.com",
    ]), /--bekraeft/);
    assert.deepEqual(laesInventeringsArgumenter([
      "--project", "fleet-dev", "--database-url", "https://fleet-dev-default-rtdb.firebaseio.com",
      "--bekraeft", "READ_ONLY_AUTH_INVENTORY",
    ]), { projectId: "fleet-dev", databaseURL: "https://fleet-dev-default-rtdb.firebaseio.com" });
    assert.equal(klassificerKonto({ uid: "u", customClaims: { pv: 2, perms: "", ukendt: true, sub: "x" } }).version, "v2");
    const script = readFileSync("scripts/auth-claims-inventering.mjs", "utf8");
    assert.doesNotMatch(script, /\.(set|update|remove|deleteUser|setCustomUserClaims)\s*\(/);
    assert.match(script, /listUsers\(1000, pageToken\)/);
  });
});
