import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { migrateDataset } from "../src/data/unitRepository";
import { applyPositionDemo, applyPositionMeasurement, filterPositionUnits, hasValidCoordinates, positionFreshness } from "../src/data/positionWorkflow";

describe("fælles positionslag", () => {
  it("afviser ugyldige koordinater og bevarer en nyere måling", () => {
    const dataset = createFixtureDataset();
    expect(() => applyPositionMeasurement(dataset, { unitId: "unit-sc-104", latitude: 91, longitude: 12, measuredAt: "2026-09-08T09:00:00Z" })).toThrow(/ugyldige koordinater/i);
    expect(() => applyPositionMeasurement(dataset, { unitId: "unit-sc-104", latitude: 55, longitude: 12, measuredAt: "ikke-et-tidspunkt" })).toThrow(/måletidspunkt/i);
    const current = dataset.relations.positions.find((item) => item.unitId === "unit-sc-104");
    const result = applyPositionMeasurement(dataset, { ...current, latitude: 55, measuredAt: "2026-09-08T07:00:00Z", receivedAt: "2026-09-08T10:00:00Z" });
    expect(result.ignored).toBe(true);
    expect(result.dataset).toBe(dataset);
    expect(result.position.latitude).toBe(current.latitude);
  });

  it("skelner aktualitet, bevægelse og forbindelse", () => {
    const dataset = createFixtureDataset();
    const moving = dataset.relations.positions.find((item) => item.movementState === "moving");
    const offline = dataset.relations.positions.find((item) => item.connectionStatus === "offline");
    expect(positionFreshness(moving, "2026-09-08T09:10:00Z").stale).toBe(false);
    expect(positionFreshness(offline, "2026-09-08T09:10:00Z").stale).toBe(true);
    expect(offline.connectionStatus).toBe("offline");
    expect(offline.movementState).toBe("unknown");
  });

  it("kombinerer søgning og filtre og beholder enheder uden position", () => {
    const dataset = createFixtureDataset();
    const byQuery = filterPositionUnits(dataset.units, dataset.relations.positions, { query: "husqvarna" });
    expect(byQuery.map((item) => item.id)).toContain("unit-nb-018");
    const combined = filterPositionUnits(dataset.units, dataset.relations.positions, { department: "Byggeri", type: "machine", movement: "stationary", connection: "online" });
    expect(combined.length).toBeGreaterThan(0);
    expect(combined.every((unit) => unit.department === "Byggeri" && unit.type === "machine")).toBe(true);
  });

  it("demokontrollen ændrer kun den valgte positionspost", () => {
    const dataset = createFixtureDataset();
    const before = dataset.relations.positions.find((item) => item.unitId === "unit-sc-104");
    const result = applyPositionDemo(dataset, { unitId: "unit-sc-104", scenario: "move", now: "2026-09-08T10:30:00Z" }, { eventId: "demo" });
    const after = result.dataset.relations.positions.find((item) => item.unitId === "unit-sc-104");
    expect(after.latitude).not.toBe(before.latitude);
    expect(after.movementState).toBe("moving");
    expect(result.dataset.relations.positionEvents.at(-1).unitId).toBe("unit-sc-104");
    expect(result.dataset.units).toEqual(dataset.units);
  });

  it("migrerer ældre lokale datasæt uden at nulstille enheder", () => {
    const dataset = createFixtureDataset();
    const legacy = structuredClone(dataset);
    legacy.version = 9;
    legacy.relations.gps = [{ id: "gps-old", tenantId: legacy.tenantId, unitId: "unit-sc-104", latitude: 55.67, longitude: 12.56, label: "Gammel demo", updatedAt: "2025-01-01T08:00:00Z", live: false }];
    delete legacy.relations.positions;
    const migrated = migrateDataset(legacy);
    expect(migrated.units).toHaveLength(dataset.units.length);
    expect(migrated.relations.positions.length).toBeGreaterThan(0);
    expect(migrated.relations.positions.every(hasValidCoordinates)).toBe(true);
  });
});
