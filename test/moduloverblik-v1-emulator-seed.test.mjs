import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.VITE_FB_PROJECT_ID ||= "demo-veyro-integration";
process.env.VITE_DEV_EJER_MAIL ||= "admin@integration.invalid";
process.env.VITE_DEV_BRUGER_KODE ||= "test-only-not-used";

const {
  TENANT_ID, REVIEW_CALENDAR_CATEGORIES, REVIEW_CATALOG_ITEMS, REVIEW_CATALOG_SUPPLIERS,
  REVIEW_UNIT_TYPES, workforcePatch,
} = await import("../scripts/moduloverblik-v1-emulator-seed.mjs");

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

  it("leverer et varieret, tydeligt syntetisk varekatalog til layoutkontrol", () => {
    const patch = workforcePatch({ uid: "uid-review", now: Date.parse("2026-09-17T10:00:00Z") });
    const items = REVIEW_CATALOG_ITEMS.map((item) => patch[`tenants/${TENANT_ID}/forbrugsvarer/${item.id}`]);
    const suppliers = REVIEW_CATALOG_SUPPLIERS.map((supplier) => patch[`tenants/${TENANT_ID}/leverandoerer/${supplier.id}`]);

    assert.equal(items.length, 12);
    assert.equal(suppliers.length, 3);
    assert.ok(items.some((item) => item.navn.length >= 80), "langt varenavn skal være dækket");
    assert.ok(new Set(items.map((item) => item.varegruppe)).size >= 6, "flere kategorier skal være dækket");
    assert.ok(new Set(items.map((item) => item.enhed)).size >= 6, "flere enheder skal være dækket");
    assert.ok(Math.min(...items.map((item) => item.indkoebsprisOere)) < 2000, "lav pris skal være dækket");
    assert.ok(Math.max(...items.map((item) => item.indkoebsprisOere)) > 100000, "høj pris skal være dækket");
    for (const row of [...items, ...suppliers]) {
      assert.equal(row.fixture, "moduloverblik-v1-synthetic");
    }
  });

  it("leverer kalenderkategorier gennem det autoritative Opsætning-register", () => {
    const patch = workforcePatch({ uid: "uid-review", now: Date.parse("2026-09-17T10:00:00Z") });
    const categories = REVIEW_CALENDAR_CATEGORIES.map(([id]) => patch[`tenants/${TENANT_ID}/ressourceKategorier/kalenderkategorier/${id}`]);
    assert.equal(categories.length, 8);
    assert.ok(categories.every((category) => category.aktiv === true));
    assert.ok(categories.every((category) => category.fixture === "moduloverblik-v1-synthetic"));
  });

  it("leverer kundestyrede enhedstyper med stabilt ID og teknisk grundtype", () => {
    const patch = workforcePatch({ uid: "uid-review", now: Date.parse("2026-09-17T10:00:00Z") });
    const types = REVIEW_UNIT_TYPES.map(([id]) => patch[`tenants/${TENANT_ID}/ressourceKategorier/enheder/${id}`]);
    assert.equal(types.length, 3);
    assert.ok(types.every((type) => type.tekniskArt));
    assert.equal(types.filter((type) => type.aktiv === false).length, 1);
    assert.equal(patch[`tenants/${TENANT_ID}/koeretoejer/review-unit-service`].kategoriId, "review-servicekoeretoej");
  });
});
