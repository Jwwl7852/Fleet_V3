import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { applyReportSubmission } from "../src/data/caseWorkflow";
import { applyManualCostSave, buildEconomyEntries } from "../src/data/economyWorkflow";
import { categoriesForPurpose, fleetCategoryRecord, validateFleetCategory } from "../src/data/fleetCategories";
import { mergeSharedCategories } from "../src/data/categoryAdapter";

describe("kundestyrede FLEET-kategorier", () => {
  it("bruger én sorteret kilde med særskilte anvendelser", () => {
    const categories = [{ id: "z", navn: "Z", aktiv: true, sortering: 20, brugIndberetning: false, brugOmkostning: true }, { id: "a", navn: "A", aktiv: true, sortering: 10, brugIndberetning: true, brugOmkostning: false }];
    expect(categoriesForPurpose(categories, "report").map((item) => item.id)).toEqual(["a"]);
    expect(categoriesForPurpose(categories, "cost").map((item) => item.id)).toEqual(["z"]);
  });

  it("afviser tom anvendelse og bevarer oprettelsesaudit ved ændring", () => {
    expect(validateFleetCategory({ name: "Ingen", order: 1, usages: {} }).usages).toMatch(/mindst én/);
    const previous = { oprettetMs: 10, oprettetAf: "u1" };
    expect(fleetCategoryRecord({ id: "x", name: "Ny", active: false, order: 2, usages: { report: true, cost: false } }, previous, "u2", 20)).toMatchObject({ oprettetMs: 10, oprettetAf: "u1", opdateretMs: 20, opdateretAf: "u2" });
  });

  it("bevarer en deaktiveret kategori som historisk reference", () => {
    const dataset = createFixtureDataset();
    dataset.relations.reports[0].categoryId = "legacy-brakes";
    dataset.relations.fleetCategories = [{ id: "legacy-brakes", name: "Bremser", active: true, order: 1, usages: { report: true, cost: false } }];
    const merged = mergeSharedCategories(dataset, [{ id: "new", navn: "Ny", aktiv: true, sortering: 1, brugIndberetning: true, brugOmkostning: false }]);
    expect(merged.relations.fleetCategories.find((item) => item.id === "legacy-brakes")).toMatchObject({ active: false, historical: true });
  });

  it("gemmer kategori-id og snapshot på nye indberetninger", () => {
    const dataset = mergeSharedCategories(createFixtureDataset(), [{ id: "custom", navn: "Kundens kategori", aktiv: true, sortering: 1, brugIndberetning: true, brugOmkostning: false }]);
    const result = applyReportSubmission(dataset, { unitId: "unit-nb-001", type: "fault", categoryId: "custom", severity: "low", title: "Test", description: "En tilstrækkelig beskrivelse", images: [], meterObservation: { value: 1, unit: "km", observedAt: "2026-09-15T10:00:00Z" }, usability: "usable", reporterId: "u1", reporterName: "Tester" }, { id: "cat", now: "2026-09-15T10:00:00Z" });
    expect(result.report).toMatchObject({ categoryId: "custom", category: "Kundens kategori", categorySnapshot: "Kundens kategori" });
  });

  it("afviser inaktiv kategori ved nye registreringer men bevarer gamle navne", () => {
    const dataset = mergeSharedCategories(createFixtureDataset(), [{ id: "old", navn: "Udgået", aktiv: false, sortering: 1, brugIndberetning: true, brugOmkostning: true }]);
    expect(() => applyManualCostSave(dataset, { unitId: "unit-nb-001", date: "2026-09-15", categoryKey: "old", amount: "10", currency: "DKK" }, { id: "u" })).toThrow(/aktiv/);
    dataset.relations.costs = [{ id: "old-cost", unitId: "unit-nb-001", date: "2025-01-01", categoryId: "old", categorySnapshot: "Historisk navn", amountMinor: 1000, currency: "DKK", state: "actual" }];
    expect(buildEconomyEntries(dataset)[0].category).toBe("Historisk navn");
  });
});
