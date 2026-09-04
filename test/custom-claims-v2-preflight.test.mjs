import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

it("lokal preflight bevarer dual-read, revocation og kopiparitet uden deploy", () => {
  const rules = readFileSync("firebase.rules.json", "utf8");
  const klient = readFileSync("src/firebase.js", "utf8");
  const functions = readFileSync("functions/index.js", "utf8");
  const doc = readFileSync("docs/CUSTOM_CLAIMS_V2_MIGRATION.md", "utf8");
  const pakke = JSON.parse(readFileSync("package.json", "utf8"));
  const workflow = readFileSync(".github/workflows/custom-claims-v2.yml", "utf8");
  assert.match(klient, /permStrengFraClaims/);
  assert.match(functions, /\.\/delt\/permissions\.js/);
  assert.equal(rules.split("auth.token.perms.matches").length - 1, 0);
  assert.equal(rules.split("auth.token.pv === 2 && auth.token.perms != null && auth.token.perms.contains").length - 1, 82);
  assert.equal(rules.split("child('legacyClaimsAllowlist').child(auth.uid).child('expiresAtMs').val() > now").length - 1, 105);
  assert.equal(rules.split("auth.token.perms.contains('|" ).length - 1, 164);
  assert.ok(Buffer.byteLength(rules, "utf8") < 450_000);
  assert.equal(rules.split("child('authRevocations').child(auth.uid)").length - 1, 210);
  assert.match(rules, /"authRevocations"[\s\S]*?"\.read": false[\s\S]*?"\.write": false/);
  assert.match(rules, /"legacyClaimsAllowlist"[\s\S]*?"\.read": false[\s\S]*?"\.write": false/);
  assert.match(rules, /child\('tenant'\)\.val\(\) === auth\.token\.tenant/);
  assert.match(rules, /child\('expiresAtMs'\)\.isNumber\(\)/);
  const parsed = JSON.parse(rules.replace(/^\s*\/\/.*$/gm, ""));
  const authRegler = [];
  const besøg = (værdi, sti = []) => {
    if (!værdi || typeof værdi !== "object") return;
    for (const [navn, barn] of Object.entries(værdi)) {
      if ([".read", ".write"].includes(navn) &&
          typeof barn === "string" && barn.includes("auth")) {
        authRegler.push({ sti: [...sti, navn].join("/"), regel: barn });
      }
      besøg(barn, [...sti, navn]);
    }
  };
  besøg(parsed);
  assert.ok(authRegler.length > 0);
  assert.deepEqual(authRegler.filter(({ regel }) =>
    !regel.includes("child('authRevocations').child(auth.uid)")), []);
  assert.deepEqual(authRegler.filter(({ regel }) =>
    !regel.includes("child('legacyClaimsAllowlist').child(auth.uid)")), []);
  assert.match(doc, /Rollback-matrix/);
  assert.match(doc, /inventering.*godkendt/is);
  assert.match(doc, /Deploy er blokeret/);
  assert.match(pakke.scripts["test:rules"], /firebase-tools@15\.29\.0/);
  assert.match(pakke.scripts["test:rules"], /--project demo-/);
  assert.match(workflow, /codex\/firebase-custom-claims-v2/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /node-version: "20"/);
  assert.match(workflow, /distribution: temurin[\s\S]*java-version: "21"/);
  assert.match(workflow, /firebase-tools@15\.29\.0/);
  assert.doesNotMatch(workflow, /secrets\.|environment:|firebase login|deploy/i);
});
