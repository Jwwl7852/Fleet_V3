import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { createMemoryUnitRepository, migrateDataset } from "../src/data/unitRepository";
import { actualExternalCost, applyCaseClosure, applyCaseReopen, applyManualCaseCreation, applyWorkshopOrderSave, invoiceResolutionForCase, saveEvidenceSnapshot } from "../src/data/caseFolderWorkflow";
import { applyInvoiceCenterEvent, hasExactReferenceToken, invoiceCenterFixtures } from "../src/data/invoiceCenterAdapter";
import { createDisconnectedMailSender, createMockMailSender } from "../src/data/mailSender";

const actor = { id: "demo-lars", name: "Lars Hansen" };

describe("sagsmappe, referencer og Fakturacenter-grænse", () => {
  it("migrerer stabile referencer uden at omskrive historiske numre", () => {
    const first = migrateDataset(createFixtureDataset());
    const second = migrateDataset(first);
    expect(first.relations.cases[0].reference).toBe("VYR-2025-00001");
    expect(second.relations.cases[0].reference).toBe(first.relations.cases[0].reference);
    expect(first.relations.cases[0].historicalReferences).toContain("SAG-00001");
    expect(first.relations.reports[0].reference).toBe(first.relations.cases[0].reference);
  });

  it("bevarer en kladdes reference og beskytter gentagen indsendelse", async () => {
    const repository = createMemoryUnitRepository();
    const draft = await repository.saveReportDraft({ unitId: "unit-nb-001", type: "damage", title: "Skade", incident: {}, images: [] }, { id: "draft", now: "2026-09-07T09:00:00Z" });
    const input = { draftId: draft.draft.id, reference: draft.draft.reference, clientSubmissionId: "submit-once", unitId: "unit-nb-001", type: "damage", category: "Karrosseri", severity: "high", title: "Skade", description: "Skade på venstre sidespejl.", images: [], media: [], incident: { location: "Depot" }, meterObservation: { value: 100, unit: "km", observedAt: "2026-09-07T09:10:00Z" }, usability: "usable", reporterId: "demo-mette", reporterName: "Mette" };
    const first = await repository.submitReport(input, { id: "submit", now: "2026-09-07T09:10:00Z" });
    const second = await repository.submitReport(input, { id: "submit-again", now: "2026-09-07T09:11:00Z" });
    expect(first.caseItem.reference).toBe(draft.draft.reference);
    expect(second.duplicate).toBe(true);
    expect(repository.inspect().relations.reports.filter((item) => item.clientSubmissionId === "submit-once")).toHaveLength(1);
    expect(repository.inspect().relations.reportDrafts).toHaveLength(0);
  });

  it("opretter manuel sag og kræver bemærkning, når værkstedsvalg gemmes uden mail", () => {
    const created = applyManualCaseCreation(migrateDataset(createFixtureDataset()), { unitId: "unit-nb-001", title: "Manuel kontrol" }, actor, { id: "manual", now: "2026-09-07T10:00:00Z" });
    expect(created.caseItem.reportId).toBeNull();
    expect(() => applyWorkshopOrderSave(created.dataset, created.caseItem.id, { mode: "order", workshopId: "workshop-external-volvo", communicationMode: "no_mail", noMailReason: "" }, actor)).toThrow(/bemærkning/);
    const saved = applyWorkshopOrderSave(created.dataset, created.caseItem.id, { mode: "order", workshopId: "workshop-external-volvo", communicationMode: "no_mail", noMailReason: "Aftalt telefonisk", selectedAttachmentIds: ["ukendt"] }, actor, { id: "phone", now: "2026-09-07T10:05:00Z" });
    expect(saved.order.deliveryState).toBe("draft");
    expect(saved.order.sentAt).toBeNull();
    expect(saved.order.selectedAttachmentIds).toEqual([]);
  });

  it("matcher reference eksakt inden for tenant og deduplikerer kontrollerede beløb og kreditnota", () => {
    let dataset = migrateDataset(createFixtureDataset());
    const caseItem = dataset.relations.cases[0];
    dataset = { ...dataset, relations: { ...dataset.relations, cases: dataset.relations.cases.map((item) => item.id === caseItem.id ? { ...item, expectedInvoiceCount: 2, invoiceResolution: "pending" } : item) } };
    expect(hasExactReferenceToken(`Faktura ${caseItem.reference}`, caseItem.reference)).toBe(true);
    expect(hasExactReferenceToken(`X${caseItem.reference}Y`, caseItem.reference)).toBe(false);
    const invoice = invoiceCenterFixtures.controlled(caseItem.reference);
    let result = applyInvoiceCenterEvent(dataset, invoice, { now: "2026-09-07T10:00:00Z" });
    result = applyInvoiceCenterEvent(result.dataset, invoice, { now: "2026-09-07T10:01:00Z" });
    expect(result.duplicate).toBe(true);
    result = applyInvoiceCenterEvent(result.dataset, invoiceCenterFixtures.credit(caseItem.reference), { now: "2026-09-07T10:02:00Z" });
    expect(actualExternalCost(result.dataset, caseItem.id)).toBe(1000);
    expect(invoiceResolutionForCase(result.dataset, result.dataset.relations.cases[0])).toBe("cleared");
    const closed = applyCaseClosure(result.dataset, caseItem.id, { mode: "normal", confirmClosure: true }, actor, { now: "2026-09-07T10:03:00Z" });
    expect(closed.caseItem.closureStatus).toBe("closed");
    const changed = applyInvoiceCenterEvent(closed.dataset, invoiceCenterFixtures.controlled(caseItem.reference, { version: 2, controlStatus: "to_control", idempotencyKey: "fixture-status-change-002" }), { now: "2026-09-07T10:04:00Z" });
    expect(changed.dataset.relations.cases[0].invoiceResolution).toBe("review_required");
    expect(actualExternalCost(changed.dataset, caseItem.id)).toBe(-250);
  });

  it("holder arbejde og sag adskilt og håndhæver normal lukning eller begrundet lukning uden faktura", () => {
    let dataset = migrateDataset(createFixtureDataset());
    const caseId = "case-demo-001";
    dataset = { ...dataset, relations: { ...dataset.relations, cases: dataset.relations.cases.map((item) => item.id === caseId ? { ...item, status: "invoice_pending", expectedInvoiceCount: 1, invoiceResolution: "pending" } : item) } };
    expect(() => applyCaseClosure(dataset, caseId, { mode: "normal", confirmClosure: true }, actor)).toThrow(/Fakturacenter/);
    expect(() => applyCaseClosure(dataset, caseId, { mode: "no_invoice", confirmClosure: true, reason: "" }, actor)).toThrow(/begrundelse/);
    const closed = applyCaseClosure(dataset, caseId, { mode: "no_invoice", confirmClosure: true, reason: "Ingen ekstern regning forventes" }, actor, { now: "2026-09-07T11:00:00Z" });
    expect(closed.caseItem).toMatchObject({ status: "completed", closureStatus: "closed", invoiceResolution: "no_invoice" });
    const reopened = applyCaseReopen(closed.dataset, caseId, "Nye oplysninger", actor, { now: "2026-09-07T12:00:00Z" });
    expect(reopened.caseItem).toMatchObject({ status: "assessing", closureStatus: "open" });
    expect(reopened.dataset.relations.closureEvents).toHaveLength(2);
  });

  it("bevarer original OBD-måling og manuelt supplement som separate felter", () => {
    const result = saveEvidenceSnapshot(migrateDataset(createFixtureDataset()), "case-demo-001", { source: "manual", measuredAt: "2026-09-07T08:00:00Z", originalMeasurement: { speedKph: 42 }, manualSupplement: { note: "Fører oplyser 35 km/t" } }, actor, { id: "snapshot", now: "2026-09-07T09:00:00Z" });
    expect(result.snapshot.originalMeasurement.speedKph).toBe(42);
    expect(result.snapshot.manualSupplement.note).toMatch(/35/);
    expect(result.snapshot.receivedAt).toBe("2026-09-07T09:00:00Z");
  });

  it("har adskilte mailtilstande uden utilsigtet afsendelse", async () => {
    const disconnected = createDisconnectedMailSender();
    await expect(disconnected.send({ subject: "Test" })).rejects.toThrow(/ikke tilsluttet/);
    const success = createMockMailSender();
    expect((await success.send({ subject: "Test" })).state).toBe("sent");
    const failure = createMockMailSender({ fail: true });
    await expect(failure.send({ subject: "Test" })).rejects.toThrow(/testfejl/);
    expect(failure.deliveries[0].state).toBe("error");
  });
});
