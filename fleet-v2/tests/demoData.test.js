import { describe, expect, it } from "vitest";
import { fleetNavigation, platformNavigation } from "../src/demoData";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { deriveOverview } from "../src/data/unitSelectors";

describe("FLEET v2-demodata", () => {
  it("holder KPI'er, grafer og lister indbyrdes konsistente", () => {
    const dataset = createFixtureDataset();
    const overview = deriveOverview(dataset.units, dataset.relations);
    expect(overview.totals.units).toBe(dataset.units.length);
    expect(overview.totals.needsAction).toBe(dataset.relations.cases.filter((item) => ["new", "assessing"].includes(item.status)).length);
    expect(overview.actionItems).toHaveLength(overview.totals.needsAction);
    expect(overview.costByMonth.at(-1)).toBe(overview.totals.monthlyCost);
  });

  it("har alle elleve aftalte navigationselementer og kun de godkendte etaper implementeret", () => {
    expect(fleetNavigation.map((item) => item.label)).toEqual([
      "Overblik", "Enheder", "Indberetninger", "Arbejdskø", "Værksted", "Service",
      "Livekort", "Dokumenter", "Leasing", "Mobil indberetning", "Økonomi og flådestatistik",
    ]);
    expect(fleetNavigation.filter((item) => item.implemented).map((item) => item.id)).toEqual(["overview", "units", "reports", "queue", "workshop", "service", "map", "documents", "leasing", "mobile", "economy"]);
    expect(platformNavigation.map((group) => group.label)).toEqual(["Fælles", "Driftsmoduler", "Administration", "Hjælp"]);
  });
});
