import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.VITE_FB_PROJECT_ID ||= "demo-veyro-integration";
process.env.VITE_DEV_EJER_MAIL ||= "admin@integration.invalid";
process.env.VITE_DEV_BRUGER_KODE ||= "test-only-not-used";

const { TENANT_ID, workforcePatch } = await import("../scripts/moduloverblik-v1-emulator-seed.mjs");

describe("Version 1 moduloverblik – WORKFORCE emulatorfixture", () => {
  it("opretter tenantmarkør, aktivt modul og tenantbundet bruger", () => {
    const patch = workforcePatch({ uid: "uid-review", now: Date.parse("2026-09-17T10:00:00Z") });
    assert.equal(patch[`tenants/${TENANT_ID}/_findes`], true);
    assert.equal(patch[`tenants/${TENANT_ID}/moduler/bemanding`], true);
    assert.equal(patch[`tenants/${TENANT_ID}/moduler/unitbooking`], true);
    assert.equal(patch[`tenants/${TENANT_ID}/brugere/uid-review`].personId, "wf-review-admin");
  });

  it("bruger kun tydeligt syntetiske, tenantlagrede WORKFORCE-poster", () => {
    const patch = workforcePatch({ uid: "uid-review", now: Date.parse("2026-09-17T10:00:00Z") });
    const workforceRows = Object.entries(patch).filter(([path]) => /\/(personale|vagter|fravaer|kompetencer|stemplinger)\//.test(path));
    assert.ok(workforceRows.length >= 8);
    for (const [path, value] of workforceRows) {
      assert.ok(path.startsWith(`tenants/${TENANT_ID}/`));
      assert.equal(value.fixture, "moduloverblik-v1-synthetic");
    }
  });

  it("bevarer øvrige tenantnoder ved at levere en flersti-patch", () => {
    const patch = workforcePatch({ uid: "uid-review", now: Date.parse("2026-09-17T10:00:00Z") });
    assert.equal(Object.hasOwn(patch, `tenants/${TENANT_ID}`), false);
    assert.equal(Object.hasOwn(patch, `tenants/${TENANT_ID}/koeretoejer`), false);
    assert.equal(Object.hasOwn(patch, `tenants/${TENANT_ID}/bookinger`), false);
  });

  it("giver belægningskortet ledig, udlånt og ude-af-drift grundlag", () => {
    const patch = workforcePatch({ uid: "uid-review", now: Date.parse("2026-09-17T10:00:00Z") });
    assert.equal(patch[`tenants/${TENANT_ID}/kasser/moduloverblik-v1-ledig`].status, "ledig");
    assert.equal(patch[`tenants/${TENANT_ID}/kasser/moduloverblik-v1-udlaant`].status, "udlaant");
    assert.equal(patch[`tenants/${TENANT_ID}/kasser/moduloverblik-v1-ude-af-drift`].status, "udeAfDrift");
  });
});
