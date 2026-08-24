/* test/retention-funktioner.test.mjs
 * Beslutning 115 — at de to retention-funktioner rent faktisk håndhæver det
 * politikken siger, og at ingen af dem sletter eller anonymiserer noget.
 * Samme mønster som test/sager-funktioner.test.mjs.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const kilde = readFileSync("functions/index.js", "utf8");

const blokAf = (navn) => {
  const start = kilde.indexOf(`export const ${navn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${navn}`);
  const naeste = kilde.indexOf("\nexport const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
};

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const retentionLegalHold = blokAf("retentionLegalHold");
const retentionDryRun = blokAf("retentionDryRun");

describe("⚠ INGEN AF FUNKTIONERNE SLETTER ELLER ANONYMISERER", () => {
  it("hverken kalder .remove(), set(null), eller de ubyggede hooks", () => {
    for (const b of [retentionLegalHold, retentionDryRun]) {
      const ren = udenKommentarer(b);
      assert.ok(!/\.remove\(\)/.test(ren), "funktionen kalder .remove()");
      assert.ok(!/set\(null\)/.test(ren), "funktionen kalder set(null)");
      assert.ok(!ren.includes("anonymiser("), "funktionen kalder den ubyggede anonymiser()");
      assert.ok(!ren.includes(" slet("), "funktionen kalder den ubyggede slet()");
    }
  });

  it("importerer simulerRetention() fra den delte politik — ikke en afskrift", () => {
    assert.match(kilde, /from "\.\/delt\/retention-regler\.js"/);
    assert.ok(kilde.includes("simulerRetention("), "simulerRetention importeres ikke");
  });
});

describe("retentionLegalHold", () => {
  it("⚠ KRÆVER BEGGE — retention.skriv OG retention.laes", () => {
    assert.ok(retentionLegalHold.includes('perms.includes("|retention.skriv|")'));
    assert.ok(retentionLegalHold.includes('perms.includes("|retention.laes|")'));
  });

  it("⚠ satAf/satMs SÆTTES AF SERVEREN — ikke taget fra klienten", () => {
    const b = udenKommentarer(retentionLegalHold);
    assert.ok(b.includes("satAf: uid"), "satAf sættes ikke fra tokenets uid");
    assert.ok(!/satAf:\s*kortStreng\(d\.satAf/.test(b), "satAf kan oplyses af klienten");
  });

  it("⚠ ET ALLEREDE OPHÆVET HOLD KAN IKKE OPHÆVES IGEN", () => {
    assert.ok(retentionLegalHold.includes("eksisterende.ophaevetMs"));
  });

  it("kræver en begrundelse for et nyt hold", () => {
    assert.ok(retentionLegalHold.includes("Et legal hold skal have en begrundelse"));
  });

  it("logges via logRetention()", () => {
    assert.ok(retentionLegalHold.includes("logRetention("));
  });
});

describe("retentionDryRun", () => {
  it("⚠ KRÆVER KUN retention.laes — den er read-only", () => {
    assert.ok(retentionDryRun.includes('perms.includes("|retention.laes|")'));
    assert.ok(!retentionDryRun.includes('"|retention.skriv|"'), "dry-run kræver skriv-permission");
  });

  it("⚠ AFVISER EN KATEGORI DER IKKE ER BYGGET", () => {
    assert.ok(retentionDryRun.includes("info.bygget"));
  });

  it("⚠ SVARER MED ID'ER, IKKE HELE POSTER", () => {
    assert.ok(retentionDryRun.includes("paavirkedeIder"));
    /* Skal IKKE returnere de fulde poster i svaret. */
    assert.ok(!/return\s*\{[^}]*paavirkede:/.test(udenKommentarer(retentionDryRun)),
      "returnerer muligvis de fulde, følsomme poster");
  });

  it("henter legal holds før simuleringen", () => {
    assert.ok(retentionDryRun.includes('rod.child("retention/legalHold")'));
  });
});
