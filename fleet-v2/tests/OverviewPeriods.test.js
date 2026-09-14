import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { deriveOverview } from "../src/data/unitSelectors";
import { deriveMonthlyCosts, deriveMonthlyDowntime, deriveOperationSeries, operationSamplePoints } from "../src/data/overviewWorkflow";

describe("FLEET-overblikkets registrerede perioder", () => {
  it("dag, uge, måned, kvartal og år ændrer de faktiske datapunkter", () => {
    const lengths = Object.fromEntries(["day", "week", "month", "quarter", "year"].map((period) => [period, operationSamplePoints(period, "2025-03-12T23:59:59Z").map((point) => point.toISOString())]));
    expect(lengths.day).toHaveLength(7);
    expect(lengths.week).toHaveLength(7);
    expect(lengths.month.length).toBeGreaterThan(4);
    expect(lengths.quarter).toHaveLength(3);
    expect(lengths.year).toHaveLength(3);
    expect(lengths.day).not.toEqual(lengths.week);
    expect(lengths.week).not.toEqual(lengths.month);
  });

  it("bruger kun dateret statushistorik og viser manglende dækning", () => {
    const dataset = createFixtureDataset();
    const recorded = deriveOperationSeries(dataset.units, dataset.relations.unitStatusHistory, { period: "week", asOf: "2025-03-12T23:59:59Z" });
    const missing = deriveOperationSeries(dataset.units, [], { period: "week", asOf: "2025-03-12T23:59:59Z" });
    expect(recorded.coverage.pct).toBe(100);
    expect(missing.coverage.pct).toBe(0);
    expect(missing.series.every((point) => point.unknown === dataset.units.filter((unit) => unit.status !== "inactive").length)).toBe(true);
  });

  it("opfinder ikke nul eller historiske omkostninger i måneder uden poster", () => {
    const result = deriveMonthlyCosts([{ month: "2025-03", amount: 125, state: "actual", currency: "DKK" }], "2025-03");
    expect(result.values.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(result.current).toBe(125);
    expect(result.lastYear).toBeNull();
  });

  it("nedetid bruger registrerede statusintervaller og skelner manglende data", () => {
    const dataset = createFixtureDataset();
    const result = deriveMonthlyDowntime(dataset.units, dataset.relations.unitStatusHistory, "2025-03");
    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(deriveMonthlyDowntime(dataset.units, [], "2025-03").current).toBeNull();
  });

  it("samler valgt periode og måned uden de tidligere hardkodede serier", () => {
    const dataset = createFixtureDataset();
    const overview = deriveOverview(dataset.units, dataset.relations, { operationPeriod: "quarter", costMonth: "2025-02" });
    expect(overview.operationDays).toHaveLength(3);
    expect(overview.selectedCostMonth).toBe("2025-02");
    expect(overview.costByMonth.at(-1)).toBe(overview.totals.monthlyCost);
    expect(overview.operationCoverage.pct).toBe(100);
  });
});
