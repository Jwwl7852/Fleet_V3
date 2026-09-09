import { createFixtureDataset, DEMO_TENANT_ID } from "./fleetFixtures";
import { applyCaseChange, applyReportSubmission } from "./caseWorkflow";
import { applyBookingCancellation, applyBookingSave, applyWorkshopTaskCreation, applyWorkshopTaskUpdate } from "./workshopWorkflow";
import { applyCaseClosure, applyCaseReopen, applyManualCaseCreation, applyReportDraftSave, applyWorkshopOrderSave, ensureCaseFolderRelations, saveEvidenceSnapshot } from "./caseFolderWorkflow";
import { applyInvoiceCenterEvent } from "./invoiceCenterAdapter";
import { SERVICE_CATEGORIES, applyHistoricalServiceSave, applyServicePlanning, applyServiceRequirementSave } from "./serviceWorkflow";
import { DEFAULT_SERVICE_SETTINGS, applyServiceAutomation, applyServiceSettingsSave } from "./serviceAutomation";
import { applyPositionDemo, applyPositionMeasurement, normalizePosition } from "./positionWorkflow";
import { applyDocumentArchive, applyDocumentRelationRemoval, applyDocumentUpdate, applyDocumentUpload, applyDocumentVersion, ensureDocumentRegistry } from "./documentWorkflow";
import { applyContractReviewSave, applyLeaseAutomation, applyLeaseDeliveryUpdate, applyLeaseSaveWithContract, ensureLeasingRegistry, migrateLeaseDemoMeterObservations, saveMeterObservation } from "./leasingWorkflow";
import { applyManualCostSave } from "./economyWorkflow";

export const PROTOTYPE_DATABASE_NAME = "veyro-fleet-v2-prototype";
const DATABASE_VERSION = 1;
const STORE_NAME = "tenant-datasets";
export const CURRENT_DATASET_VERSION = 14;

const clone = (value) => structuredClone(value);

export function migrateDataset(dataset) {
  if (!dataset) return dataset;
  const fixtureRelations = createFixtureDataset(dataset.tenantId).relations;
  const relations = dataset.relations || {};
  const normalizedRequirements = (relations.serviceRequirements || clone(fixtureRelations.serviceRequirements)).map((item) => ({
    description: "", templateId: null, equipmentLabel: "", firstDueDate: item.fixedDueDate || null,
    annualMonth: null, annualDay: null, vendorId: null, vendorContact: "", instructions: "", documentIds: [],
    ...item,
  }));
  const migratedOccurrences = [...(relations.serviceOccurrences || [])];
  const legacyGps = relations.gps || [];
  const positionsSource = relations.positions?.length
    ? relations.positions
    : legacyGps.length && legacyGps.every((item) => item.live === false && !item.source)
      ? fixtureRelations.positions
      : legacyGps.length ? legacyGps : fixtureRelations.positions;
  const migratedPositions = positionsSource.map((item) => normalizePosition({ ...item, tenantId: dataset.tenantId })).filter(Boolean);
  (relations.workshopTasks || []).filter((task) => task.serviceRequirementId).forEach((task) => {
    if (migratedOccurrences.some((item) => item.taskId === task.id)) return;
    const linkedCase = (relations.cases || []).find((item) => item.id === task.caseId);
    migratedOccurrences.push({
      id: `service-occurrence-legacy-${task.id}`, tenantId: dataset.tenantId,
      key: `legacy:${task.id}`, requirementId: task.serviceRequirementId, templateId: null,
      unitId: task.unitId, reportId: task.reportId || linkedCase?.reportId || null, caseId: task.caseId,
      taskId: task.id, orderReference: linkedCase?.orderReference || null, dueDate: linkedCase?.dueDate || null,
      dueMeter: null, status: ["completed", "cancelled"].includes(task.status) ? task.status : "planned",
      origin: "migrated_existing_plan", createdAt: task.createdAt, updatedAt: task.updatedAt,
    });
  });
  const migrated = {
    ...dataset,
    version: CURRENT_DATASET_VERSION,
    units: (dataset.units || []).map((unit) => ({
      ...unit,
      image: unit.image || null,
      dimensions: unit.dimensions || null,
      vehicleDetails: unit.vehicleDetails || null,
    })),
    relations: {
      ...relations,
      reports: (relations.reports || clone(fixtureRelations.reports)).map((report) => report.origin === "service_automation" && SERVICE_CATEGORIES[report.category] ? { ...report, category: SERVICE_CATEGORIES[report.category] } : report),
      cases: relations.cases || clone(fixtureRelations.cases),
      caseEvents: relations.caseEvents || clone(fixtureRelations.caseEvents),
      workshops: relations.workshops || clone(fixtureRelations.workshops),
      workshopResources: relations.workshopResources || clone(fixtureRelations.workshopResources),
      workshopTasks: relations.workshopTasks || clone(fixtureRelations.workshopTasks),
      bookings: relations.bookings || clone(fixtureRelations.bookings),
      workshopEvents: relations.workshopEvents || clone(fixtureRelations.workshopEvents),
      serviceRequirements: normalizedRequirements,
      serviceTemplates: relations.serviceTemplates || [],
      serviceOccurrences: migratedOccurrences,
      serviceSettings: relations.serviceSettings?.length ? relations.serviceSettings : [{ ...DEFAULT_SERVICE_SETTINGS, tenantId: dataset.tenantId }],
      serviceEvents: relations.serviceEvents || clone(fixtureRelations.serviceEvents),
      positions: migratedPositions,
      positionEvents: relations.positionEvents || [],
      costs: relations.costs || clone(fixtureRelations.costs),
      reportDrafts: relations.reportDrafts || [],
    },
  };
  const withLeasing = ensureLeasingRegistry(ensureCaseFolderRelations(migrated));
  const withLeaseMeterMigration = migrateLeaseDemoMeterObservations(withLeasing);
  return ensureDocumentRegistry(withLeaseMeterMigration);
}

function openDatabase(databaseName) {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "tenantId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const transaction = async (databaseName, mode, operation) => {
  const database = await openDatabase(databaseName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try {
        result = operation(store);
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB-transaktionen blev afbrudt."));
    });
  } finally {
    database.close();
  }
};

const mutateStoredDataset = async (databaseName, tenantId, mutate) => transaction(databaseName, "readwrite", (store) => new Promise((resolve, reject) => {
  const request = store.get(tenantId);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    try {
      const current = migrateDataset(request.result || createFixtureDataset(tenantId));
      const rawResult = mutate(current);
      const result = { ...rawResult, dataset: ensureDocumentRegistry(ensureLeasingRegistry(rawResult.dataset)) };
      const put = store.put(clone(result.dataset));
      put.onerror = () => reject(put.error);
      put.onsuccess = () => resolve(clone(result));
    } catch (error) {
      reject(error);
    }
  };
}));

export function createIndexedDbUnitRepository({
  databaseName = PROTOTYPE_DATABASE_NAME,
  tenantId = DEMO_TENANT_ID,
} = {}) {
  const runTransaction = (mode, operation) => transaction(databaseName, mode, operation);
  const mutate = (operation) => mutateStoredDataset(databaseName, tenantId, operation);
  return {
    kind: "indexeddb-prototype",
    databaseName,
    tenantId,
    async load() {
      const stored = await runTransaction("readonly", (store) => new Promise((resolve, reject) => {
        const request = store.get(tenantId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      }));
      if (stored) {
        const migrated = migrateDataset(stored);
        if (stored.version !== CURRENT_DATASET_VERSION) {
          await runTransaction("readwrite", (store) => store.put(clone(migrated)));
        }
        return clone(migrated);
      }
      const initial = migrateDataset(createFixtureDataset(tenantId));
      await runTransaction("readwrite", (store) => store.put(clone(initial)));
      return clone(initial);
    },
    async saveUnit(unit) {
      const dataset = await this.load();
      const index = dataset.units.findIndex((item) => item.id === unit.id);
      if (index >= 0) dataset.units[index] = clone(unit);
      else dataset.units.push(clone(unit));
      await runTransaction("readwrite", (store) => store.put(dataset));
      return clone(unit);
    },
    async submitReport(input, options) {
      return mutate((dataset) => applyReportSubmission(dataset, input, options));
    },
    async saveReportDraft(input, options) {
      return mutate((dataset) => applyReportDraftSave(dataset, input, options));
    },
    async createManualCase(input, actor, options) {
      return mutate((dataset) => applyManualCaseCreation(dataset, input, actor, options));
    },
    async saveWorkshopOrder(caseId, input, actor, options) {
      return mutate((dataset) => applyWorkshopOrderSave(dataset, caseId, input, actor, options));
    },
    async closeCase(caseId, input, actor, options) {
      return mutate((dataset) => applyCaseClosure(dataset, caseId, input, actor, options));
    },
    async reopenCase(caseId, reason, actor, options) {
      return mutate((dataset) => applyCaseReopen(dataset, caseId, reason, actor, options));
    },
    async saveEvidence(caseId, input, actor, options) {
      return mutate((dataset) => saveEvidenceSnapshot(dataset, caseId, input, actor, options));
    },
    async applyInvoiceFixture(event, options) {
      return mutate((dataset) => applyInvoiceCenterEvent(dataset, event, options));
    },
    async updateCase(caseId, change, actor, options) {
      return mutate((dataset) => applyCaseChange(dataset, caseId, change, actor, options));
    },
    async createWorkshopTask(caseId, input, actor, options) {
      return mutate((dataset) => applyWorkshopTaskCreation(dataset, caseId, input, actor, options));
    },
    async updateWorkshopTask(taskId, change, actor, options) {
      return mutate((dataset) => applyWorkshopTaskUpdate(dataset, taskId, change, actor, options));
    },
    async saveBooking(input, actor, options) {
      return mutate((dataset) => applyBookingSave(dataset, input, actor, options));
    },
    async cancelBooking(bookingId, reason, actor, options) {
      return mutate((dataset) => applyBookingCancellation(dataset, bookingId, reason, actor, options));
    },
    async saveServiceRequirement(input, actor, options) {
      return mutate((dataset) => applyServiceRequirementSave(dataset, input, actor, options));
    },
    async planService(requirementId, input, actor, options) {
      return mutate((dataset) => applyServicePlanning(dataset, requirementId, input, actor, options));
    },
    async saveHistoricalService(input, actor, options) {
      return mutate((dataset) => applyHistoricalServiceSave(dataset, input, actor, options));
    },
    async runServiceAutomation(options) {
      return mutate((dataset) => applyServiceAutomation(dataset, options));
    },
    async saveServiceSettings(input, options) {
      return mutate((dataset) => applyServiceSettingsSave(dataset, input, options));
    },
    async savePositionMeasurement(input, options) {
      return mutate((dataset) => applyPositionMeasurement(dataset, input, options));
    },
    async runPositionDemo(input, options) {
      return mutate((dataset) => applyPositionDemo(dataset, input, options));
    },
    async uploadDocuments(input, actor, options) {
      return mutate((dataset) => applyDocumentUpload(dataset, input, actor, options));
    },
    async updateDocument(documentId, input, actor, options) {
      return mutate((dataset) => applyDocumentUpdate(dataset, documentId, input, actor, options));
    },
    async replaceDocumentFile(documentId, file, actor, options) {
      return mutate((dataset) => applyDocumentVersion(dataset, documentId, file, actor, options));
    },
    async removeDocumentRelation(documentId, relationId, options) {
      return mutate((dataset) => applyDocumentRelationRemoval(dataset, documentId, relationId, options));
    },
    async archiveDocument(documentId, archived, actor, options) {
      return mutate((dataset) => applyDocumentArchive(dataset, documentId, archived, actor, options));
    },
    async saveLease(input, actor, options) {
      return mutate((dataset) => applyLeaseSaveWithContract(dataset, input, actor, options));
    },
    async runLeaseAutomation(options) {
      return mutate((dataset) => applyLeaseAutomation(dataset, options));
    },
    async updateLeaseDelivery(deliveryId, input, actor, options) {
      return mutate((dataset) => applyLeaseDeliveryUpdate(dataset, deliveryId, input, actor, options));
    },
    async saveLeaseMeterObservation(input, options) {
      return mutate((dataset) => saveMeterObservation(dataset, input, options));
    },
    async saveContractReview(leaseId, input, actor, options) {
      return mutate((dataset) => applyContractReviewSave(dataset, leaseId, input, actor, options));
    },
    async saveManualCost(input, actor, options) {
      return mutate((dataset) => applyManualCostSave(dataset, input, actor, options));
    },
  };
}

export function createMemoryUnitRepository(dataset = createFixtureDataset()) {
  let state = clone(migrateDataset(dataset));
  return {
    kind: "memory-test",
    tenantId: state.tenantId,
    async load() { return clone(state); },
    async saveUnit(unit) {
      const index = state.units.findIndex((item) => item.id === unit.id);
      if (index >= 0) state.units[index] = clone(unit);
      else state.units.push(clone(unit));
      return clone(unit);
    },
    async submitReport(input, options) {
      const result = applyReportSubmission(state, input, options);
      const dataset = ensureDocumentRegistry(result.dataset); state = clone(dataset); return clone({ ...result, dataset });
    },
    async saveReportDraft(input, options) {
      const result = applyReportDraftSave(state, input, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async createManualCase(input, actor, options) {
      const result = applyManualCaseCreation(state, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async saveWorkshopOrder(caseId, input, actor, options) {
      const result = applyWorkshopOrderSave(state, caseId, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async closeCase(caseId, input, actor, options) {
      const result = applyCaseClosure(state, caseId, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async reopenCase(caseId, reason, actor, options) {
      const result = applyCaseReopen(state, caseId, reason, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async saveEvidence(caseId, input, actor, options) {
      const result = saveEvidenceSnapshot(state, caseId, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async applyInvoiceFixture(event, options) {
      const result = applyInvoiceCenterEvent(state, event, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async updateCase(caseId, change, actor, options) {
      const result = applyCaseChange(state, caseId, change, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async createWorkshopTask(caseId, input, actor, options) {
      const result = applyWorkshopTaskCreation(state, caseId, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async updateWorkshopTask(taskId, change, actor, options) {
      const result = applyWorkshopTaskUpdate(state, taskId, change, actor, options);
      const dataset = ensureDocumentRegistry(result.dataset); state = clone(dataset); return clone({ ...result, dataset });
    },
    async saveBooking(input, actor, options) {
      const result = applyBookingSave(state, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async cancelBooking(bookingId, reason, actor, options) {
      const result = applyBookingCancellation(state, bookingId, reason, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async saveServiceRequirement(input, actor, options) {
      const result = applyServiceRequirementSave(state, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async planService(requirementId, input, actor, options) {
      const result = applyServicePlanning(state, requirementId, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async saveHistoricalService(input, actor, options) {
      const result = applyHistoricalServiceSave(state, input, actor, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async runServiceAutomation(options) {
      const result = applyServiceAutomation(state, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async saveServiceSettings(input, options) {
      const result = applyServiceSettingsSave(state, input, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async savePositionMeasurement(input, options) {
      const result = applyPositionMeasurement(state, input, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async runPositionDemo(input, options) {
      const result = applyPositionDemo(state, input, options);
      state = clone(result.dataset);
      return clone(result);
    },
    async uploadDocuments(input, actor, options) {
      const result = applyDocumentUpload(state, input, actor, options); state = clone(result.dataset); return clone(result);
    },
    async updateDocument(documentId, input, actor, options) {
      const result = applyDocumentUpdate(state, documentId, input, actor, options); state = clone(result.dataset); return clone(result);
    },
    async replaceDocumentFile(documentId, file, actor, options) {
      const result = applyDocumentVersion(state, documentId, file, actor, options); state = clone(result.dataset); return clone(result);
    },
    async removeDocumentRelation(documentId, relationId, options) {
      const result = applyDocumentRelationRemoval(state, documentId, relationId, options); state = clone(result.dataset); return clone(result);
    },
    async archiveDocument(documentId, archived, actor, options) {
      const result = applyDocumentArchive(state, documentId, archived, actor, options); state = clone(result.dataset); return clone(result);
    },
    async saveLease(input, actor, options) {
      const result = applyLeaseSaveWithContract(state, input, actor, options); state = clone(result.dataset); return clone(result);
    },
    async runLeaseAutomation(options) {
      const result = applyLeaseAutomation(state, options); state = clone(result.dataset); return clone(result);
    },
    async updateLeaseDelivery(deliveryId, input, actor, options) {
      const result = applyLeaseDeliveryUpdate(state, deliveryId, input, actor, options); state = clone(result.dataset); return clone(result);
    },
    async saveLeaseMeterObservation(input, options) {
      const result = saveMeterObservation(state, input, options); state = clone(result.dataset); return clone(result);
    },
    async saveContractReview(leaseId, input, actor, options) {
      const result = applyContractReviewSave(state, leaseId, input, actor, options); state = clone(result.dataset); return clone(result);
    },
    async saveManualCost(input, actor, options) {
      const result = applyManualCostSave(state, input, actor, options); state = clone(result.dataset); return clone(result);
    },
    inspect() { return clone(state); },
  };
}

let singleton;
export const defaultUnitRepository = () => {
  if (!singleton) singleton = createIndexedDbUnitRepository();
  return singleton;
};
