import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { ensureLeasingRegistry } from "../src/data/leasingWorkflow";
import { buildFleetMeasurements, filterFleetMeasurements, fleetMeasurementCoverage, fleetStatisticsCsv } from "../src/data/fleetStatistics";

describe("FLEET køretøjs- og driftsstatistik", () => {
  it("viser kun faktisk understøttede målinger og mærker alle demodata", () => {
    const dataset = ensureLeasingRegistry(createFixtureDataset());
    const rows = buildFleetMeasurements(dataset);
    expect(new Set(rows.map((item) => item.metric))).toEqual(new Set(["odometer_km", "position", "speed_kph"]));
    expect(rows.every((item) => item.synthetic)).toBe(true);
    expect(rows.some((item) => item.metric === "operating_hours")).toBe(false);
  });

  it("opfinder ikke en OBD-forbindelse fra lokale eller syntetiske kilder", () => {
    const dataset = ensureLeasingRegistry(createFixtureDataset());
    const rows = buildFleetMeasurements(dataset);
    const coverage = fleetMeasurementCoverage(rows, dataset.units);
    expect(coverage.connectionState).toBe("not_connected");
    expect(coverage.connectedCount).toBe(0);
  });

  it("filtrerer på periode, enhed, måling og datatype", () => {
    const rows = buildFleetMeasurements(ensureLeasingRegistry(createFixtureDataset()));
    const filtered = filterFleetMeasurements(rows, { from: "2026-09-01", to: "2026-09-30", unitId: "unit-nb-001", metric: "odometer_km", source: "synthetic" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ unitId: "unit-nb-001", metric: "odometer_km", synthetic: true });
  });

  it("eksporterer kilder og danske tegn som UTF-8 med BOM", () => {
    const dataset = ensureLeasingRegistry(createFixtureDataset());
    const csv = fleetStatisticsCsv(buildFleetMeasurements(dataset), dataset.units);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Måling");
    expect(csv).toContain("Syntetisk");
    expect([...new TextEncoder().encode(csv).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
