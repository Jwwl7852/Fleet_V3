import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import {
  SYNTHETIC_CONTRACT_DOCUMENT_ID,
  applyContractReviewSave,
  applyLeaseAutomation,
  applyLeaseDeliveryUpdate,
  applyLeaseSave,
  applyLeaseSaveWithContract,
  calculateEarlyReturn,
  calculateLeaseProjection,
  contractExtractionProposal,
  ensureLeasingRegistry,
  includedKilometres,
  leaseMeterBasis,
  leaseOdometerAdapter,
  migrateLeaseDemoMeterObservations,
  saveMeterObservation,
} from "../src/data/leasingWorkflow";

const actor = { id: "demo-mette", name: "Mette Holm" };
const now = () => "2026-09-08T12:00:00.000Z";
const dataset = () => ensureLeasingRegistry(createFixtureDataset());

const leaseInput = (overrides = {}) => ({
  agreementNumber: "LS-TEST-001", unitId: "unit-nb-002", lessorName: "Test Leasing", contactName: "Kontakt",
  type: "operational", status: "active", startDate: "2026-01-01", endDate: "2028-12-31", plannedDeliveryDate: "2028-12-31",
  recurringAmount: "4200", currency: "DKK", vat: "exclusive", startMeter: "10000", startMeterDate: "2026-01-01",
  allowanceScope: "total", includedKm: "90000", overageRate: "1,25", warningDays: [120, 90, 30],
  maintenance: "included", repairs: "conditional", tyres: "excluded", tyreChange: "excluded", tyreStorage: "unresolved",
  insurance: "excluded", roadside: "unresolved", replacementVehicle: "unresolved", ...overrides,
});

describe("Leasing-workflow", () => {
  it("etablerer det lokale register én gang med stabile demo-ID'er", () => {
    const first = dataset();
    const second = ensureLeasingRegistry(first);
    expect(second.relations.leases.map((item) => item.id)).toEqual(["lease-demo-nb-001"]);
    expect(second.relations.documents.filter((item) => item.id === SYNTHETIC_CONTRACT_DOCUMENT_ID)).toHaveLength(1);
  });

  it("tilføjer manglende leasing-demomålinger tabsfrit og kun én gang", () => {
    const state = dataset();
    const unrelated = { id: "meter-existing", tenantId: state.tenantId, unitId: "unit-nb-002", value: 40000, unit: "km", observedAt: "2026-01-01" };
    const legacy = { ...state, relations: { ...state.relations, meterObservations: [unrelated] } };
    const first = migrateLeaseDemoMeterObservations(legacy);
    const second = migrateLeaseDemoMeterObservations(first);
    expect(first.relations.meterObservations.find((item) => item.id === unrelated.id)).toEqual(unrelated);
    expect(first.relations.meterObservations.filter((item) => item.unitId === "unit-nb-001")).toHaveLength(3);
    expect(second.relations.meterObservations).toHaveLength(first.relations.meterObservations.length);
  });

  it("opretter og redigerer samme aftale med historik og uændret ID", () => {
    const created = applyLeaseSave(dataset(), leaseInput(), actor, { now, idFactory: () => "stable" });
    expect(created.lease.id).toBe("lease-stable");
    const edited = applyLeaseSave(created.dataset, leaseInput({ id: created.lease.id, recurringAmount: "4300" }), actor, { now });
    expect(edited.lease.id).toBe(created.lease.id);
    expect(edited.lease.payment.recurringMinor).toBe(430000);
    expect(edited.event.snapshot.payment.recurringMinor).toBe(420000);
  });

  it("gemmer kontrakt, aftale og relationer som ét resultat uden filkopier", () => {
    const contractFile = new File(["kontrakt"], "leasingaftale.pdf", { type: "application/pdf" });
    const result = applyLeaseSaveWithContract(dataset(), { ...leaseInput(), contractFile }, actor, {
      now,
      idFactory: () => "stable",
      documentOptions: { now, uuid: () => "contract" },
    });
    expect(result.lease.id).toBe("lease-stable");
    expect(result.documents).toHaveLength(1);
    const document = result.documents[0];
    expect(document.versions).toHaveLength(1);
    expect(document.versions[0].blob).toBe(contractFile);
    expect(document.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "lease", targetId: result.lease.id }),
      expect.objectContaining({ type: "unit", targetId: result.lease.unitId }),
    ]));
    expect(result.lease.documentIds).toContain(document.id);
    expect(result.dataset.relations.documents.filter((item) => item.id === document.id)).toHaveLength(1);
  });

  it("afviser en ugyldig kontrakt før aftale eller dokument kan oprettes", () => {
    const state = dataset();
    const beforeLeases = state.relations.leases.length;
    const beforeDocuments = state.relations.documents.length;
    const contractFile = new File(["<html></html>"], "kontrakt.html", { type: "text/html" });
    expect(() => applyLeaseSaveWithContract(state, { ...leaseInput(), contractFile }, actor, { now })).toThrow(/Filtypen understøttes ikke/);
    expect(state.relations.leases).toHaveLength(beforeLeases);
    expect(state.relations.documents).toHaveLength(beforeDocuments);
  });

  it("afviser dublet-aftalenummer og markerer utilsigtet periodeoverlap", () => {
    expect(() => applyLeaseSave(dataset(), leaseInput({ agreementNumber: "LS-2024-018" }), actor, { now })).toThrow(/findes allerede/i);
    const first = applyLeaseSave(dataset(), leaseInput(), actor, { now, idFactory: () => "one" });
    const second = applyLeaseSave(first.dataset, leaseInput({ agreementNumber: "LS-TEST-002", startDate: "2027-01-01", endDate: "2029-01-01" }), actor, { now, idFactory: () => "two" });
    expect(second.lease.overlapLeaseIds).toEqual([first.lease.id]);
  });

  it("beregner både samlet og periodisk kilometergrænse", () => {
    const lease = dataset().relations.leases[0];
    expect(includedKilometres(lease)).toBe(120000);
    expect(includedKilometres({ ...lease, startDate: "2026-01-01", endDate: "2026-12-31", mileage: { allowanceScope: "period", periodKm: 10000, periodMonths: 3 } })).toBe(40000);
  });

  it("viser manglende, faldende og forældede målergrundlag ærligt", () => {
    const lease = dataset().relations.leases[0];
    expect(leaseMeterBasis({ ...lease, mileage: { ...lease.mileage, startValue: null } }, []).reason).toMatch(/Startmålerstand/);
    const falling = leaseMeterBasis(lease, [
      { id: "a", unitId: lease.unitId, unit: "km", value: 50000, observedAt: "2026-01-01" },
      { id: "b", unitId: lease.unitId, unit: "km", value: 49000, observedAt: "2026-02-01" },
    ], { today: "2026-09-08" });
    expect(falling.calculable).toBe(false);
    expect(falling.reason).toMatch(/falder|modstridende/);
    const stale = leaseMeterBasis(lease, [{ id: "c", unitId: lease.unitId, unit: "km", value: 50000, observedAt: "2026-01-01" }], { today: "2026-09-08" });
    expect(stale.stale).toBe(true);
  });

  it("beregner distance fra startmåler og viser prognosegrundlag", () => {
    const state = dataset(); const lease = state.relations.leases[0];
    const projection = calculateLeaseProjection(lease, state.relations.meterObservations, { today: "2026-09-08", windowDays: 220 });
    expect(projection.basis.distance).toBe(114532);
    expect(projection.remainingKm).toBe(5468);
    expect(projection.method).toBe("observed_window");
    expect(projection.projectedDistance).toBeGreaterThan(projection.basis.distance);
  });

  it("ændrer ikke historiske målinger ved et manuelt forventet kørselsniveau", () => {
    const state = dataset(); const lease = structuredClone(state.relations.leases[0]);
    lease.mileage.manualExpectedMonthlyKm = 2100;
    const before = structuredClone(state.relations.meterObservations);
    const projection = calculateLeaseProjection(lease, [state.relations.meterObservations.at(-1)], { today: "2026-09-08" });
    expect(projection.method).toBe("manual_monthly");
    expect(state.relations.meterObservations).toEqual(before);
  });

  it("udelader depositum fra beregningen af tidlig aflevering", () => {
    const state = dataset(); const lease = structuredClone(state.relations.leases[0]);
    lease.returnTerms.earlyReturnFeeMinor = 100000;
    const result = calculateEarlyReturn(lease, state.relations.meterObservations, { alternativeDate: "2026-09-30", replacementCostMinor: 250000 }, { today: "2026-09-08" });
    expect(result.calculable).toBe(true);
    expect(result.totalMinor).toBe(350000);
    expect(result.totalMinor).not.toBe(lease.payment.depositMinor);
  });

  it("opretter én indberetning og én afleveringssag atomisk uden dubletter", () => {
    const first = applyLeaseAutomation(dataset(), { now, today: "2026-09-08", leadDays: 999, idFactory: (kind) => kind });
    expect(first.created).toHaveLength(1);
    expect(first.created[0].report.originLabel).toBe("Automatisk oprettet fra Leasing");
    expect(first.created[0].caseItem.reference).toBe(first.created[0].report.reference);
    expect(first.created[0].caseItem.orderReference).toMatch(/^BST-/);
    const linkedContract = first.dataset.relations.documents.find((item) => item.id === SYNTHETIC_CONTRACT_DOCUMENT_ID);
    expect(linkedContract.relations).toContainEqual(expect.objectContaining({ type: "case", targetId: first.created[0].caseItem.id }));
    const second = applyLeaseAutomation(first.dataset, { now, today: "2026-09-08", leadDays: 999 });
    expect(second.created).toHaveLength(0);
    expect(second.dataset.relations.reports).toHaveLength(first.dataset.relations.reports.length);
    expect(new Set(second.dataset.relations.leaseEvents.filter((item) => item.reminderKey).map((item) => item.reminderKey)).size).toBe(second.dataset.relations.leaseEvents.filter((item) => item.reminderKey).length);
  });

  it("markerer en eksisterende afleveringssag til revurdering ved forlængelse", () => {
    const automated = applyLeaseAutomation(dataset(), { now, today: "2026-09-08", leadDays: 999 });
    const lease = automated.dataset.relations.leases[0];
    const updated = applyLeaseSave(automated.dataset, leaseInput({ id: lease.id, agreementNumber: lease.agreementNumber, unitId: lease.unitId, lessorName: lease.lessor.name, startDate: lease.startDate, endDate: "2027-12-31", plannedDeliveryDate: "2027-12-31" }), actor, { now });
    expect(updated.dataset.relations.leaseDeliveryCases[0].reviewRequired).toBe(true);
  });

  it("registrerer fysisk aflevering uden automatisk sagslukning eller nul-omkostning", () => {
    const automated = applyLeaseAutomation(dataset(), { now, today: "2026-09-08", leadDays: 999 });
    const delivery = automated.created[0].delivery;
    const result = applyLeaseDeliveryUpdate(automated.dataset, delivery.id, { actualDeliveryDate: "2026-12-31", finalMeter: "131000", confirmPhysicalDelivery: true }, actor, { now });
    const caseItem = result.dataset.relations.cases.find((item) => item.id === delivery.caseId);
    expect(result.delivery.status).toBe("awaiting_settlement");
    expect(caseItem.closureStatus).toBe("open");
    expect(result.dataset.units.find((item) => item.id === delivery.unitId).status).toBe("inactive");
    expect(result.dataset.relations.costs.filter((item) => item.leaseId === delivery.leaseId)).toHaveLength(0);
    const repeated = applyLeaseDeliveryUpdate(result.dataset, delivery.id, { actualDeliveryDate: "2026-12-31", finalMeter: "131000", confirmPhysicalDelivery: true }, actor, { now });
    expect(repeated.dataset.relations.meterObservations.filter((item) => item.sourceKey === `lease-delivery:${delivery.id}`)).toHaveLength(1);
  });

  it("gemmer leasinggiverens mail som lokal kladde med eksplicit bilagsvalg og uden sendt-status", () => {
    const automated = applyLeaseAutomation(dataset(), { now, today: "2026-09-08", leadDays: 999 });
    const delivery = automated.created[0].delivery;
    const saved = applyLeaseDeliveryUpdate(automated.dataset, delivery.id, {
      mailDraft: {
        recipient: "leasing@example.invalid",
        subject: `${delivery.orderReference} · NB-001 · leasingaflevering`,
        body: "Bekræft venligst afleveringen.",
        documentIds: [SYNTHETIC_CONTRACT_DOCUMENT_ID],
      },
    }, actor, { now });
    expect(saved.delivery.mailDraft).toMatchObject({
      state: "draft",
      recipient: "leasing@example.invalid",
      version: 1,
      documentIds: [SYNTHETIC_CONTRACT_DOCUMENT_ID],
    });
    expect(saved.delivery.mailDraft.sentAt).toBeUndefined();
    expect(saved.event.type).toBe("lease_mail_draft_saved");
  });

  it("anvender kun eksplicit valgte kontraktforslag og aldrig fixture på egne uploads", () => {
    const state = dataset(); const document = state.relations.documents.find((item) => item.id === SYNTHETIC_CONTRACT_DOCUMENT_ID);
    expect(contractExtractionProposal(document).demo).toBe(true);
    expect(contractExtractionProposal({ ...document, id: "user-upload", origin: "manual_upload" }).fields).toEqual([]);
    const applied = applyContractReviewSave(state, state.relations.leases[0].id, { documentId: document.id, selectedKeys: ["recurringAmount", "roadside"], manualValues: { recurringAmount: "4999", roadside: "excluded" }, apply: true }, actor, { now });
    expect(applied.lease.payment.recurringMinor).toBe(499900);
    expect(applied.lease.services.roadside).toBe("unresolved");
  });

  it("gemmer daterede målinger og normaliserer kun gyldige adapterdata", () => {
    const state = dataset();
    const saved = saveMeterObservation(state, { unitId: "unit-nb-001", value: "125000,5", observedAt: "2026-09-08T10:00:00.000Z", source: "manual" }, { now, id: "manual" });
    expect(saved.observation.value).toBe(125000.5);
    expect(leaseOdometerAdapter.connected).toBe(false);
    expect(leaseOdometerAdapter.normalize({ unitId: "unit-nb-001", value: "x", observedAt: "2026-09-08" })).toBeNull();
  });
});
