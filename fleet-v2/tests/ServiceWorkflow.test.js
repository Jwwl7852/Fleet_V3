import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { createMemoryUnitRepository, migrateDataset } from "../src/data/unitRepository";
import { addMonthsClamped, applyServicePlanning, applyServiceRequirementSave, calculateServiceTargets, evaluateServiceRequirement } from "../src/data/serviceWorkflow";
import { applyBookingSave, applyWorkshopTaskUpdate } from "../src/data/workshopWorkflow";

const actor = { id: "demo-lars", name: "Lars Hansen" };

describe("servicekrav, frister og servicebog", () => {
  it("håndterer månedsskifte uden at skubbe 31. januar ind i marts", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("lader den først nåede grænse udløse et kombineret krav", () => {
    const dataset = createFixtureDataset();
    const requirement = { ...dataset.relations.serviceRequirements[0], baselineDate: "2026-08-20", intervalMonths: 6, baselineMeter: 12000, intervalMeter: 3000, fixedDueDate: null };
    const unit = { ...dataset.units[0], meter: 15010 };
    const evaluation = evaluateServiceRequirement(requirement, unit, { ...dataset.relations, service: [] }, { today: "2026-09-08" });
    expect(evaluation.dueDate).toBe("2027-02-20");
    expect(evaluation.dueMeter).toBe(15000);
    expect(evaluation.status).toBe("overdue");
  });

  it("viser manglende beregningsgrundlag uden at opfinde en frist", () => {
    const dataset = createFixtureDataset();
    const requirement = dataset.relations.serviceRequirements.find((item) => item.id === "service-requirement-nb-018");
    const unit = dataset.units.find((item) => item.id === requirement.unitId);
    const evaluation = evaluateServiceRequirement(requirement, unit, dataset.relations, { today: "2026-09-08" });
    expect(evaluation.status).toBe("missing_basis");
    expect(evaluation.missing).toContain("seneste servicedato");
  });

  it("opretter og redigerer samme servicekrav med valgfri kombination", () => {
    const dataset = createFixtureDataset();
    const created = applyServiceRequirementSave(dataset, { unitId: "unit-nb-002", title: "Gearservice", category: "maintenance", intervalMonths: "12", intervalMeter: "25000", baselineDate: "2026-09-01", baselineMeter: "98210", warningDays: "30", warningMeter: "1500", active: true }, actor, { id: "gear", now: "2026-09-08T08:00:00Z" });
    const changed = applyServiceRequirementSave(created.dataset, { ...created.requirement, title: "Gear- og transmissionsservice", intervalMonths: "18" }, actor, { now: "2026-09-08T09:00:00Z" });
    expect(changed.dataset.relations.serviceRequirements.filter((item) => item.id === created.requirement.id)).toHaveLength(1);
    expect(changed.requirement.intervalMonths).toBe(18);
  });

  it("planlægger gennem én sag og én opgave med fælles reference uden fiktiv indberetning", () => {
    const dataset = createFixtureDataset();
    const input = { workshopId: "workshop-internal-east", assigneeId: "demo-lars", workDescription: "Udfør scooterservice" };
    const first = applyServicePlanning(dataset, "service-requirement-sc-104", input, actor, { caseId: "service", taskId: "service", now: "2026-09-08T08:00:00Z" });
    const repeated = applyServicePlanning(first.dataset, "service-requirement-sc-104", input, actor, { now: "2026-09-08T08:01:00Z" });
    expect(first.caseItem.reportId).toBeNull();
    expect(first.caseItem.reference).toBe(first.task.reference);
    expect(first.task.serviceRequirementId).toBe("service-requirement-sc-104");
    expect(repeated.duplicate).toBe(true);
    expect(repeated.dataset.relations.cases.filter((item) => item.serviceRequirementId === "service-requirement-sc-104")).toHaveLength(1);
  });

  it("en booking opfylder ikke kravet, men udført service flytter begge næste frister og holder sagen åben", () => {
    let dataset = createFixtureDataset();
    const planned = applyServicePlanning(dataset, "service-requirement-nb-001", { workshopId: "workshop-external-volvo", assigneeId: "demo-lars", workDescription: "Årligt service" }, actor, { caseId: "run", taskId: "run", now: "2026-09-08T08:00:00Z" });
    dataset = applyBookingSave(planned.dataset, { taskId: planned.task.id, workshopId: "workshop-external-volvo", startAt: "2026-09-10T08:00:00Z", endAt: "2026-09-10T12:00:00Z", confirmed: true }, actor, { id: "service", now: "2026-09-08T08:10:00Z" }).dataset;
    expect(dataset.relations.service.find((item) => item.taskId === planned.task.id)).toBeUndefined();
    dataset = applyWorkshopTaskUpdate(dataset, planned.task.id, { status: "in_progress" }, actor, { now: "2026-09-10T08:00:00Z" }).dataset;
    dataset = applyWorkshopTaskUpdate(dataset, planned.task.id, { status: "completed", workPerformed: "Service udført", actualEndAt: "2026-09-10T12:00:00Z", problemResolved: true, usability: "usable", workType: "service", serviceTitle: "Årligt serviceeftersyn", meter: "125000", otherCost: "900" }, actor, { now: "2026-09-10T12:00:00Z" }).dataset;
    const caseItem = dataset.relations.cases.find((item) => item.id === planned.caseItem.id);
    const record = dataset.relations.service.find((item) => item.taskId === planned.task.id);
    const requirement = dataset.relations.serviceRequirements.find((item) => item.id === "service-requirement-nb-001");
    expect(record.requirementId).toBe(requirement.id);
    expect(requirement.baselineDate).toBe("2026-09-10");
    expect(caseItem).toMatchObject({ status: "invoice_pending", closureStatus: "open" });
    expect(dataset.relations.costs.filter((item) => item.taskId === planned.task.id).every((item) => item.actual === false)).toBe(true);
  });

  it("annullering gør kravet planlægbart igen uden at flytte fristen", () => {
    const dataset = createFixtureDataset();
    const planned = applyServicePlanning(dataset, "service-requirement-nb-008", { workshopId: "workshop-internal-east" }, actor, { caseId: "cancel", taskId: "cancel" });
    const original = calculateServiceTargets(planned.requirement, planned.dataset.relations.service).dueMeter;
    const cancelled = applyWorkshopTaskUpdate(planned.dataset, planned.task.id, { status: "cancelled", reason: "Ingen kapacitet" }, actor).dataset;
    const replanned = applyServicePlanning(cancelled, "service-requirement-nb-008", { workshopId: "workshop-internal-west" }, actor, { caseId: "retry", taskId: "retry" });
    expect(replanned.duplicate).toBe(false);
    expect(calculateServiceTargets(replanned.requirement, replanned.dataset.relations.service).dueMeter).toBe(original);
  });

  it("bevarer gamle lokale data og gemmer historisk service idempotent", async () => {
    const legacy = createFixtureDataset(); delete legacy.relations.serviceRequirements; legacy.version = 6; legacy.units[0].notes = "Bevar mig";
    expect(migrateDataset(legacy).units[0].notes).toBe("Bevar mig");
    const repository = createMemoryUnitRepository();
    const input = { clientId: "history-1", unitId: "unit-sc-104", requirementId: "service-requirement-sc-104", title: "Historisk scooterservice", date: "2026-08-31", meter: "14500", result: "Udført", advanceRequirement: true };
    await repository.saveHistoricalService(input, actor, { id: "history", now: "2026-09-08T10:00:00Z" });
    await repository.saveHistoricalService(input, actor, { id: "history-again", now: "2026-09-08T10:01:00Z" });
    const state = repository.inspect();
    expect(state.relations.service.filter((item) => item.clientId === "history-1")).toHaveLength(1);
    expect(state.relations.serviceRequirements.find((item) => item.id === "service-requirement-sc-104").baselineDate).toBe("2026-08-31");
  });
});
