import { describe, expect, it } from "vitest";
import { applyCaseChange, applyReportSubmission, deriveUnitUsability, filterAndSortCases, validateTransition } from "../src/data/caseWorkflow";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { createMemoryUnitRepository, migrateDataset } from "../src/data/unitRepository";

const input = { unitId: "unit-nb-001", type: "damage", category: "Karrosseri", severity: "high", title: "Skade på sidespejl", description: "Spejlet sidder løst efter kontakt med port.", images: [{ id: "img-1", blob: new Blob(["x"], { type: "image/png" }) }], meterObservation: { value: 124600, unit: "km", observedAt: "2026-09-07T10:00:00Z" }, usability: "blocked", reporterId: "demo-mette", reporterName: "Mette Larsen" };

describe("fælles indberetnings- og sagsforløb", () => {
  it("opretter én indberetning og én sag atomisk med stabile relationer og billede", async () => {
    const repository = createMemoryUnitRepository();
    const before = repository.inspect();
    const result = await repository.submitReport(input, { id: "stable", now: "2026-09-07T10:00:00Z" });
    const after = repository.inspect();
    expect(after.relations.reports).toHaveLength(before.relations.reports.length + 1);
    expect(after.relations.cases).toHaveLength(before.relations.cases.length + 1);
    expect(result.report.id).toBe("report-stable");
    expect(result.caseItem.reportId).toBe(result.report.id);
    expect(result.caseItem.unitId).toBe(input.unitId);
    expect(result.caseItem.status).toBe("new");
    expect(result.report.images[0]).toMatchObject({ id: "img-1" });
    expect(result.report.images[0].blob).toBeTruthy();
  });

  it("triage opdaterer samme sag og tilføjer historik uden dublet", async () => {
    const repository = createMemoryUnitRepository();
    const created = await repository.submitReport(input, { id: "same-case", now: "2026-09-07T10:00:00Z" });
    const count = repository.inspect().relations.cases.length;
    await repository.updateCase(created.caseItem.id, { status: "assessing", priority: "critical", assigneeId: "demo-lars", internalNote: "Kontrolleres straks" }, { id: "demo-lars", name: "Lars Hansen" }, { now: "2026-09-07T10:05:00Z" });
    const state = repository.inspect();
    expect(state.relations.cases).toHaveLength(count);
    expect(state.relations.cases.find((item) => item.id === created.caseItem.id)).toMatchObject({ status: "assessing", priority: "critical", assigneeId: "demo-lars" });
    expect(state.relations.caseEvents.filter((item) => item.caseId === created.caseItem.id)).toHaveLength(4);
  });

  it("håndhæver overgange og begrundelser centralt", () => {
    const dataset = createFixtureDataset();
    const item = dataset.relations.cases.find((entry) => entry.status === "assessing");
    const report = dataset.relations.reports.find((entry) => entry.id === item.reportId);
    expect(validateTransition(item, "rejected", {}, report).reason).toMatch(/begrundelse/);
    expect(() => applyCaseChange(dataset, item.id, { status: "completed" }, { id: "x", name: "X" })).toThrow(/ikke tilladt/);
    const corrected = applyCaseChange(dataset, item.id, { status: "new", expectedStatus: "assessing" }, { id: "x", name: "X" }, { now: "2026-09-08T10:00:00Z" });
    expect(corrected.caseItem.status).toBe("new");
    expect(corrected.events[0]).toMatchObject({ type: "status", actorName: "X" });
    expect(() => applyCaseChange(dataset, item.id, { status: "new", expectedStatus: "waiting" }, { id: "x", name: "X" })).toThrow(/anden visning/);
  });

  it("bevarer spærring indtil eksplicit ophævelse og respekterer flere sager", () => {
    let dataset = createFixtureDataset();
    const created = applyReportSubmission(dataset, input, { id: "blocked-two", now: "2026-09-07T10:00:00Z" });
    dataset = created.dataset;
    expect(deriveUnitUsability(input.unitId, dataset.relations.reports, dataset.relations.cases).value).toBe("blocked");
    dataset = applyCaseChange(dataset, created.caseItem.id, { status: "assessing" }, { id: "demo-lars", name: "Lars" }).dataset;
    expect(deriveUnitUsability(input.unitId, dataset.relations.reports, dataset.relations.cases).value).toBe("blocked");
    const released = applyCaseChange(dataset, created.caseItem.id, { releaseBlock: true, releaseReason: "Sikkerhedskontrol bestået" }, { id: "demo-lars", name: "Lars" }).dataset;
    expect(deriveUnitUsability(input.unitId, released.relations.reports, released.relations.cases).value).toBe("usable");
  });

  it("filtrerer og sorterer samme sager for begge køvisninger", () => {
    const dataset = createFixtureDataset();
    const result = filterAndSortCases(dataset.relations.cases, dataset.relations.reports, dataset.units, { query: "SC-104", priority: "high", sort: "due" });
    expect(result).toHaveLength(1);
    expect(result[0].reportId).toBe("report-demo-001");
  });

  it("migrerer ældre enhedsdata uden tab og tilføjer sagsrelationer én gang", () => {
    const legacy = createFixtureDataset();
    legacy.version = 3;
    delete legacy.relations.reports;
    delete legacy.relations.cases;
    delete legacy.relations.caseEvents;
    legacy.units[0].image = { name: "bevar.png", blob: new Blob(["x"]) };
    const migrated = migrateDataset(legacy);
    expect(migrated.units[0].image.name).toBe("bevar.png");
    expect(migrated.relations.reports.length).toBeGreaterThan(0);
    expect(migrateDataset(migrated).relations.reports).toHaveLength(migrated.relations.reports.length);
  });
});
