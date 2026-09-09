import { describe, expect, it } from "vitest";
import { applyCaseChange } from "../src/data/caseWorkflow";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { createMemoryUnitRepository, migrateDataset } from "../src/data/unitRepository";
import { applyBookingSave, applyWorkshopTaskCreation, applyWorkshopTaskUpdate, validateBooking } from "../src/data/workshopWorkflow";

const actor = { id: "demo-sara", name: "Sara Nielsen" };
const taskInput = { title: "Kontrollér AdBlue-system", workshopId: "workshop-internal-east", assigneeId: "demo-sara", workDescription: "Diagnose og udbedring", checklist: [{ text: "Læs fejlkoder" }], expectedCost: "2500" };

function readyCase(dataset, caseId = "case-demo-002") {
  let next = applyCaseChange(dataset, caseId, { status: "assessing" }, actor, { now: "2026-09-07T08:00:00Z" }).dataset;
  next = applyCaseChange(next, caseId, { status: "ready" }, actor, { now: "2026-09-07T08:05:00Z" }).dataset;
  return next;
}

describe("værkstedsforløb", () => {
  it("opretter eksplicit én opgave fra samme sag og afviser dublet", () => {
    const dataset = readyCase(createFixtureDataset());
    const result = applyWorkshopTaskCreation(dataset, "case-demo-002", taskInput, actor, { id: "stable", now: "2026-09-07T09:00:00Z" });
    expect(result.task).toMatchObject({ id: "workshop-task-stable", caseId: "case-demo-002", reportId: "report-demo-002", unitId: "unit-nb-003", status: "created" });
    expect(() => applyWorkshopTaskCreation(result.dataset, "case-demo-002", taskInput, actor)).toThrow(/allerede den aktive/);
  });

  it("booker uden at sætte sag eller enhed på værksted før faktisk start", () => {
    let dataset = readyCase(createFixtureDataset());
    const created = applyWorkshopTaskCreation(dataset, "case-demo-002", taskInput, actor, { id: "booked" });
    dataset = applyBookingSave(created.dataset, { taskId: created.task.id, workshopId: "workshop-internal-east", resourceId: "resource-bay-2", startAt: "2026-09-09T08:00:00Z", endAt: "2026-09-09T12:00:00Z", confirmed: true }, actor, { id: "stable" }).dataset;
    expect(dataset.relations.workshopTasks.find((item) => item.id === created.task.id).status).toBe("booked");
    expect(dataset.relations.cases.find((item) => item.id === "case-demo-002").status).toBe("ready");
    expect(dataset.units.find((item) => item.id === "unit-nb-003").status).not.toBe("workshop");
  });

  it("afviser overlap for intern ressource og enhed, men tillader samtidige eksterne opgaver", () => {
    const dataset = createFixtureDataset();
    const internalConflict = validateBooking(dataset, { taskId: "workshop-task-demo-001", workshopId: "workshop-internal-east", resourceId: "resource-bay-1", startAt: "2026-09-08T09:00:00Z", endAt: "2026-09-08T11:00:00Z" });
    expect(internalConflict.resourceId).toMatch(/allerede booket/);
    expect(internalConflict.unitId).toMatch(/Enheden/);
    const externalDataset = structuredClone(dataset);
    externalDataset.relations.bookings[0] = { ...externalDataset.relations.bookings[0], workshopId: "workshop-external-volvo", resourceId: null };
    externalDataset.relations.workshopTasks.push({ ...externalDataset.relations.workshopTasks[0], id: "workshop-task-external-2", caseId: "case-demo-002", reportId: "report-demo-002", unitId: "unit-nb-003", workshopId: "workshop-external-volvo", workshopKind: "external", bookingId: null });
    const external = validateBooking(externalDataset, { taskId: "workshop-task-external-2", workshopId: "workshop-external-volvo", resourceId: "", startAt: "2026-09-08T09:00:00Z", endAt: "2026-09-09T11:00:00Z" });
    expect(external).toEqual({});
  });

  it("understøtter flerdagsbooking og validerer start før slut", () => {
    const dataset = createFixtureDataset();
    expect(validateBooking(dataset, { taskId: "workshop-task-demo-001", workshopId: "workshop-external-volvo", startAt: "2026-09-10T08:00:00Z", endAt: "2026-09-12T16:00:00Z" })).toEqual({});
    expect(validateBooking(dataset, { taskId: "workshop-task-demo-001", workshopId: "workshop-external-volvo", startAt: "2026-09-12T16:00:00Z", endAt: "2026-09-12T08:00:00Z" }).time).toMatch(/før/);
  });

  it("flytter en booking uden at oprette en dublet", () => {
    const dataset = createFixtureDataset();
    const moved = applyBookingSave(dataset, { ...dataset.relations.bookings[0], startAt: "2026-09-10T08:00:00Z", endAt: "2026-09-11T16:00:00Z", confirmed: true }, actor, { now: "2026-09-07T10:00:00Z" }).dataset;
    expect(moved.relations.bookings).toHaveLength(dataset.relations.bookings.length);
    expect(moved.relations.bookings[0].startAt).toBe("2026-09-10T08:00:00.000Z");
  });

  it("starter akut uden booking og synkroniserer sag og driftsstatus", () => {
    let dataset = readyCase(createFixtureDataset());
    const created = applyWorkshopTaskCreation(dataset, "case-demo-002", { ...taskInput, workshopId: "workshop-external-volvo" }, actor, { id: "acute" });
    dataset = applyWorkshopTaskUpdate(created.dataset, created.task.id, { status: "in_progress" }, actor, { now: "2026-09-07T10:00:00Z" }).dataset;
    expect(dataset.relations.cases.find((item) => item.id === "case-demo-002").status).toBe("workshop");
    expect(dataset.units.find((item) => item.id === "unit-nb-003").status).toBe("workshop");
  });

  it("afslutter arbejdet atomisk uden at lukke sagen og skriver historik, service og interne omkostninger", async () => {
    const repository = createMemoryUnitRepository(readyCase(createFixtureDataset()));
    const created = await repository.createWorkshopTask("case-demo-002", taskInput, actor, { id: "complete" });
    await repository.updateWorkshopTask(created.task.id, { status: "in_progress", workLog: { description: "Diagnose", hours: "1.5", cost: "1200" }, material: { name: "Sensor", quantity: "1", totalCost: "640" } }, actor, { now: "2026-09-07T10:00:00Z" });
    await repository.updateWorkshopTask(created.task.id, { status: "completed", workPerformed: "Sensor udskiftet og system testet", actualEndAt: "2026-09-07T12:00:00Z", problemResolved: true, usability: "usable", workType: "service", serviceTitle: "AdBlue-service", meter: "412990", otherCost: "160" }, actor, { now: "2026-09-07T12:00:00Z" });
    const state = repository.inspect();
    expect(state.relations.cases.find((item) => item.id === "case-demo-002").status).toBe("ready_to_close");
    expect(state.relations.cases.find((item) => item.id === "case-demo-002").closureStatus).toBe("open");
    expect(state.relations.activities.filter((item) => item.taskId === created.task.id)).toHaveLength(1);
    expect(state.relations.service.filter((item) => item.taskId === created.task.id)).toHaveLength(1);
    expect(state.relations.costs.filter((item) => item.taskId === created.task.id)).toHaveLength(3);
    expect(state.relations.workshopTasks.find((item) => item.id === created.task.id).actualCost).toBe(2000);
    await expect(repository.updateWorkshopTask(created.task.id, { status: "completed", workPerformed: "igen", actualEndAt: "2026-09-07T13:00:00Z", problemResolved: true, usability: "usable" }, actor)).rejects.toThrow(/allerede afsluttet/);
  });

  it("holder sagen åben, når problemet ikke er løst, og kræver annulleringsgrund", () => {
    let dataset = readyCase(createFixtureDataset());
    const created = applyWorkshopTaskCreation(dataset, "case-demo-002", taskInput, actor, { id: "unresolved" });
    dataset = applyWorkshopTaskUpdate(created.dataset, created.task.id, { status: "in_progress" }, actor).dataset;
    const unresolved = applyWorkshopTaskUpdate(dataset, created.task.id, { status: "completed", workPerformed: "Diagnose udført", actualEndAt: "2026-09-07T12:00:00Z", problemResolved: false, usability: "blocked" }, actor).dataset;
    expect(unresolved.relations.cases.find((item) => item.id === "case-demo-002").status).toBe("assessing");
    const fresh = applyWorkshopTaskCreation(readyCase(createFixtureDataset()), "case-demo-002", taskInput, actor, { id: "cancel" });
    expect(() => applyWorkshopTaskUpdate(fresh.dataset, fresh.task.id, { status: "cancelled" }, actor)).toThrow(/begrundelse/);
    expect(applyWorkshopTaskUpdate(fresh.dataset, fresh.task.id, { status: "cancelled", reason: "Værkstedet har ingen kapacitet" }, actor).caseItem.status).toBe("ready");
  });

  it("holder eksterne værkstedsbeløb foreløbige og sagen åben efter afsluttet arbejde", () => {
    let dataset = readyCase(createFixtureDataset());
    const created = applyWorkshopTaskCreation(dataset, "case-demo-002", { ...taskInput, workshopId: "workshop-external-volvo" }, actor, { id: "external-cost" });
    dataset = applyWorkshopTaskUpdate(created.dataset, created.task.id, { status: "in_progress", workLog: { description: "Ekstern diagnose", hours: "1", cost: "900" } }, actor).dataset;
    dataset = applyWorkshopTaskUpdate(dataset, created.task.id, { status: "completed", workPerformed: "Fejl afhjulpet", actualEndAt: "2026-09-07T12:00:00Z", problemResolved: true, usability: "usable", workType: "repair", otherCost: "100" }, actor).dataset;
    const caseItem = dataset.relations.cases.find((item) => item.id === "case-demo-002");
    expect(caseItem).toMatchObject({ status: "invoice_pending", closureStatus: "open", invoiceResolution: "pending", expectedInvoiceCount: 1 });
    expect(dataset.relations.costs.filter((item) => item.taskId === created.task.id).every((item) => item.actual === false && item.source === "external_provisional")).toBe(true);
  });

  it("migrerer gamle lokale data uden at nulstille eksisterende relationer", () => {
    const legacy = createFixtureDataset();
    legacy.version = 4;
    delete legacy.relations.workshopTasks;
    delete legacy.relations.bookings;
    legacy.units[0].notes = "Bevar lokal ændring";
    const migrated = migrateDataset(legacy);
    expect(migrated.units[0].notes).toBe("Bevar lokal ændring");
    expect(migrated.relations.workshopTasks).toHaveLength(1);
    expect(migrateDataset(migrated).relations.workshopTasks).toHaveLength(1);
  });
});
