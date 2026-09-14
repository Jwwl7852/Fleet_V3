import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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
  // UNIT/Warehouse-dual-write samler to tidligere dublerede permissionled,
  // mens importlæseren tilføjer sin egen kompakte kasseudlaan-gate.
  assert.equal(rules.split("auth.token.pv === 2 && auth.token.perms != null && auth.token.perms.contains").length - 1, 82);
  // PROCURE-godkendelseskøen bruger samme tidsbegrænsede dual-read som de
  // øvrige læsbare noder under claims-migreringen.
  // Ejerens tenantløse udbydergrænse bruger ikke legacy-tenantallowlisten.
  // WAREHOUSEs fælles unitbevægelseshistorik tilføjer én tenantbundet
  // dual-read. UNIT-importens læsbare kladde løfter den videre til 103.
  assert.equal(rules.split("child('legacyClaimsAllowlist').child(auth.uid).child('expiresAtMs').val() > now").length - 1, 103);
  // WAREHOUSE må ikke oprette fælles unittyper eller units direkte. De to
  // skrivegrene er derfor fjernet, mens den læsbare PROCURE-godkendelseskø
  // fortsat har både den kompakte indkoeb.laes-gate og legacy-permissionen.
  assert.equal(rules.split("auth.token.perms.contains('|" ).length - 1, 172);
  // PROCUREs serverlukkede kladder/opsætning, linjespor og læsbare
  // godkendelseskø udvider den målte regelkontrakt med ca. 3 kB. Bevar et
  // snævert loft, så senere ukontrolleret vækst fortsat opdages.
  // Git kan checke filen ud med CRLF på Windows. Loftet måler den
  // versionsstyrede regelkilde (LF), ikke arbejdsplatformens linjeender.
  // Den samlede PROCURE-, ejer-, WORKFORCE- og WAREHOUSE-regelmodel udvider
  // kilden kontrolleret. WAREHOUSEs serverstyrede unit-/bevægelseskontrakt
  // løfter den målte LF-normaliserede kilde til 463.047 byte.
  assert.ok(Buffer.byteLength(rules.replace(/\r\n/g, "\n"), "utf8") < 470_000);
  // WAREHOUSEs nye læseregel kontrollerer både revocationens eksistens og
  // tidspunkt. UNIT-importens læser løfter den målte forekomst videre til 252.
  assert.equal(rules.split("child('authRevocations').child(auth.uid)").length - 1, 252);
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
  /* Ejerregler accepterer med vilje ikke legacy tenant-claims: ejeren er
     tenantløs og har kun det serverudstedte `udbyder`-claim. Alle øvrige
     auth-regler skal fortsat bevare migrationsperiodens dual-read. */
  assert.deepEqual(authRegler.filter(({ regel }) =>
    !regel.includes("child('legacyClaimsAllowlist').child(auth.uid)") &&
    !regel.includes("auth.token.udbyder === true")), []);
  assert.deepEqual(authRegler.filter(({ regel }) =>
    regel.split("child('authRevocations').child(auth.uid)").length - 1 !== 2), [],
  "hver auth-regel skal kontrollere revocationens eksistens og tidspunkt");
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
  const almindeligeRulesTests = readdirSync("test")
    .filter((navn) => (navn.startsWith("rules.") || navn === "storage.rules.test.mjs") &&
      navn.endsWith(".test.mjs") &&
      navn !== "rules.custom-claims-v2.test.mjs");
  assert.ok(almindeligeRulesTests.length > 0);
  for (const navn of almindeligeRulesTests) {
    const kilde = readFileSync(`test/${navn}`, "utf8");
    assert.match(kilde, /from "\.\/rules-test-claims\.mjs"/, navn);
    assert.doesNotMatch(kilde, /from "@firebase\/rules-unit-testing"/, navn);
  }
  assert.match(
    readFileSync("test/rules.custom-claims-v2.test.mjs", "utf8"),
    /from "@firebase\/rules-unit-testing"/
  );
});
