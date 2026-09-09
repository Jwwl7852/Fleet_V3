import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { applyServiceRequirementSave, applyServicePlanning, advanceRequirementAfterService, nextAnnualServiceDate } from "../src/data/serviceWorkflow";
import { applyServiceAutomation, applyServiceSettingsSave } from "../src/data/serviceAutomation";
import { createMemoryUnitRepository, migrateDataset } from "../src/data/unitRepository";
import { applyWorkshopTaskUpdate } from "../src/data/workshopWorkflow";

const actor = { id: "demo-lars", name: "Lars Hansen" };
const isolated = (requirement) => {
  const dataset = createFixtureDataset();
  dataset.relations.serviceRequirements = [requirement];
  dataset.relations.serviceOccurrences = [];
  dataset.relations.serviceTemplates = [];
  dataset.relations.reports = [];
  dataset.relations.cases = [];
  dataset.relations.caseEvents = [];
  dataset.relations.workshopTasks = [];
  dataset.relations.workshopOrders = [];
  return dataset;
};

describe("tilbagevendende Service-planer og lokal varslingsmotor", () => {
  it("opretter atomisk én automatisk indberetning, sag, forekomst og bestillingsreference ved varsling", () => {
    const base = createFixtureDataset().relations.serviceRequirements[1];
    const result = applyServiceAutomation(isolated(base), { now: "2026-09-08T10:00:00.000Z", idFactory: (kind) => kind });
    expect(result.created).toHaveLength(1);
    expect(result.dataset.relations.reports).toHaveLength(1);
    expect(result.dataset.relations.cases).toHaveLength(1);
    expect(result.dataset.relations.serviceOccurrences).toHaveLength(1);
    expect(result.created[0].report).toMatchObject({ origin: "service_automation", originLabel: "Automatisk oprettet fra Service", reporterId: null });
    expect(result.created[0].caseItem).toMatchObject({ reportId: result.created[0].report.id, status: "new", orderReference: "BST-2026-00001" });
    expect(result.created[0].report.reference).toBe(result.created[0].caseItem.reference);
    expect(result.dataset.relations.workshopOrders).toHaveLength(0);
  });

  it("deduplikerer gentagne kontroller og samtidige fanekald via stabil forekomstidentitet", async () => {
    const base = createFixtureDataset().relations.serviceRequirements[1];
    const repository = createMemoryUnitRepository(isolated(base));
    await Promise.all([repository.runServiceAutomation({ now: "2026-09-08T10:00:00.000Z" }), repository.runServiceAutomation({ now: "2026-09-08T10:00:00.000Z" })]);
    const state = repository.inspect();
    expect(state.relations.reports).toHaveLength(1);
    expect(state.relations.cases).toHaveLength(1);
    expect(state.relations.serviceOccurrences).toHaveLength(1);
  });

  it("tildeler en fælles skabelon som separate stabile krav pr. valgt enhed", () => {
    const dataset = createFixtureDataset();
    dataset.relations.serviceRequirements = [];
    const result = applyServiceRequirementSave(dataset, { unitIds: ["unit-nb-001", "unit-nb-002"], title: "Vinterdæk", description: "Skift til vinterdæk", category: "tyres", firstDueDate: "2026-11-01", annualMonth: "11", annualDay: "1", warningDays: "30", active: true }, actor, { templateId: "winter", id: "winter", now: "2026-09-08T10:00:00.000Z" });
    expect(result.template.unitIds).toEqual(["unit-nb-001", "unit-nb-002"]);
    expect(result.requirements).toHaveLength(2);
    expect(new Set(result.requirements.map((item) => item.id)).size).toBe(2);
    expect(new Set(result.requirements.map((item) => item.templateId))).toEqual(new Set(["service-template-winter"]));
  });

  it("afviser en fælles målerskabelon på tværs af kilometer og driftstimer", () => {
    const dataset = createFixtureDataset();
    expect(() => applyServiceRequirementSave(dataset, { unitIds: ["unit-nb-001", "unit-nb-008"], title: "Fælles målerkrav", category: "maintenance", intervalMeter: "1000", warningDays: 30, active: true }, actor)).toThrow(/samme målerart/i);
  });

  it("bevarer kalenderens novembermåned efter forsinket udførelse", () => {
    expect(nextAnnualServiceDate("2026-11-01", "2026-12-14", 11, 1)).toBe("2027-11-01");
    const requirement = { id: "annual", annualMonth: 11, annualDay: 1, fixedDueDate: "2026-11-01", active: true };
    const [next] = advanceRequirementAfterService([requirement], "annual", { id: "record", date: "2026-12-14", meter: null, occurrenceDueDate: "2026-11-01" }, "2026-12-14T12:00:00Z");
    expect(next.fixedDueDate).toBe("2027-11-01");
  });

  it("opretter ikke en sag ved manglende målergrundlag", () => {
    const base = { ...createFixtureDataset().relations.serviceRequirements[3], intervalMonths: null, intervalMeter: 500, baselineMeter: null };
    const result = applyServiceAutomation(isolated(base), { now: "2026-09-08T10:00:00.000Z" });
    expect(result.created).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("missing_basis");
  });

  it("lader manuel Planlæg videreføre den automatisk oprettede sag uden dublet", () => {
    const base = createFixtureDataset().relations.serviceRequirements[1];
    const automatic = applyServiceAutomation(isolated(base), { now: "2026-09-08T10:00:00.000Z" });
    const occurrence = automatic.created[0].occurrence;
    const planned = applyServicePlanning(automatic.dataset, base.id, { workshopId: "workshop-external-volvo", assigneeId: "demo-lars", workDescription: "Udfør årligt eftersyn" }, actor, { taskId: "continued", now: "2026-09-08T11:00:00.000Z" });
    expect(planned.caseItem.id).toBe(occurrence.caseId);
    expect(planned.task.reportId).toBe(occurrence.reportId);
    expect(planned.dataset.relations.cases).toHaveLength(1);
    expect(planned.dataset.relations.serviceOccurrences[0]).toMatchObject({ taskId: planned.task.id, status: "planned" });
  });

  it("deaktivering stopper fremtidig automatik uden at slette eksisterende historik", () => {
    const base = { ...createFixtureDataset().relations.serviceRequirements[1], active: false };
    const dataset = isolated(base);
    dataset.relations.service = [{ id: "old", unitId: base.unitId, date: "2025-09-20", title: "Tidligere service" }];
    const result = applyServiceAutomation(dataset, { now: "2026-09-08T10:00:00.000Z" });
    expect(result.created).toHaveLength(0);
    expect(result.dataset.relations.service).toHaveLength(1);
  });

  it("mailtilvalg er slået fra som standard og ændrer ikke sagsoprettelsen", () => {
    const base = createFixtureDataset().relations.serviceRequirements[1];
    const withSettings = applyServiceSettingsSave(isolated(base), { autoMailEntitled: false, autoMailRuleEnabled: true }, { now: "2026-09-08T09:00:00Z" });
    const result = applyServiceAutomation(withSettings.dataset, { now: "2026-09-08T10:00:00.000Z" });
    expect(result.settings.autoMailRuleEnabled).toBe(false);
    expect(result.created).toHaveLength(1);
    expect(result.dataset.relations.workshopOrders).toHaveLength(0);
    expect(result.dataset.relations.caseEvents[0].text).toContain("Ingen mail er sendt");
  });

  it("migrerer eksisterende planlagte serviceopgaver til forekomster uden nye sager eller rapporter", () => {
    const legacy = createFixtureDataset();
    const requirement = legacy.relations.serviceRequirements[0];
    legacy.relations.workshopTasks.push({ id: "legacy-service-task", caseId: "case-demo-001", reportId: "report-demo-001", unitId: requirement.unitId, serviceRequirementId: requirement.id, status: "booked", createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z" });
    legacy.relations.reports.push({ ...legacy.relations.reports[0], id: "legacy-auto-report", origin: "service_automation", category: "maintenance" });
    delete legacy.relations.serviceOccurrences;
    legacy.version = 7;
    const migrated = migrateDataset(legacy);
    expect(migrated.relations.serviceOccurrences.find((item) => item.taskId === "legacy-service-task")).toMatchObject({ status: "planned", origin: "migrated_existing_plan" });
    expect(migrated.relations.cases).toHaveLength(legacy.relations.cases.length);
    expect(migrated.relations.reports).toHaveLength(legacy.relations.reports.length);
    expect(migrated.relations.reports.find((item) => item.id === "legacy-auto-report").category).toBe("Serviceeftersyn");
  });

  it("kan varsle næste årlige forekomst selv om den udførte forekomst stadig afventer faktura", () => {
    const source = createFixtureDataset().relations.serviceRequirements[1];
    const annual = { ...source, annualMonth: 9, annualDay: 20, firstDueDate: "2026-09-20", fixedDueDate: "2026-09-20" };
    let dataset = applyServiceAutomation(isolated(annual), { now: "2026-09-08T10:00:00.000Z" }).dataset;
    const planned = applyServicePlanning(dataset, annual.id, { workshopId: "workshop-external-volvo", workDescription: "Årligt service" }, actor, { taskId: "annual", now: "2026-09-08T11:00:00Z" });
    dataset = applyWorkshopTaskUpdate(planned.dataset, planned.task.id, { status: "in_progress" }, actor, { now: "2026-09-20T08:00:00Z" }).dataset;
    dataset = applyWorkshopTaskUpdate(dataset, planned.task.id, { status: "completed", workPerformed: "Service udført", actualEndAt: "2026-09-20T12:00:00Z", problemResolved: true, usability: "usable", workType: "service", serviceTitle: "Årligt service", meter: "125000", otherCost: "500" }, actor, { now: "2026-09-20T12:00:00Z" }).dataset;
    expect(dataset.relations.cases[0]).toMatchObject({ status: "invoice_pending", closureStatus: "open" });
    const next = applyServiceAutomation(dataset, { now: "2027-09-01T10:00:00.000Z" });
    expect(next.created).toHaveLength(1);
    expect(next.created[0].occurrence.dueDate).toBe("2027-09-20");
    expect(next.dataset.relations.cases).toHaveLength(2);
  });
});
