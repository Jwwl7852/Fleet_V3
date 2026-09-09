import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { defaultUnitRepository } from "./unitRepository";

const FleetDataContext = createContext(null);

export function FleetDataProvider({ children, repository = defaultUnitRepository() }) {
  const [dataset, setDataset] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    repository.load()
      .then(() => repository.runServiceAutomation ? repository.runServiceAutomation() : repository.load())
      .then(() => repository.runLeaseAutomation ? repository.runLeaseAutomation() : repository.load())
      .then((result) => {
      if (active) setDataset(result.dataset || result);
    }).catch((cause) => {
      if (active) setError(cause);
    });
    return () => { active = false; };
  }, [repository]);

  const saveUnit = useCallback(async (unit) => {
    const saved = await repository.saveUnit(unit);
    setDataset((current) => {
      const units = [...current.units];
      const index = units.findIndex((item) => item.id === saved.id);
      if (index >= 0) units[index] = saved;
      else units.push(saved);
      return { ...current, units };
    });
    return saved;
  }, [repository]);

  useEffect(() => {
    if (!dataset || !repository.runServiceAutomation) return undefined;
    const interval = window.setInterval(() => {
      repository.runServiceAutomation()
        .then(() => repository.runLeaseAutomation ? repository.runLeaseAutomation() : repository.load())
        .then((result) => setDataset(result.dataset || result))
        .catch((cause) => setError(cause));
    }, 60000);
    return () => window.clearInterval(interval);
  }, [dataset?.tenantId, repository]);

  const submitReport = useCallback(async (input, options) => {
    const result = await repository.submitReport(input, options);
    setDataset(result.dataset);
    return result;
  }, [repository]);

  const runMutation = useCallback(async (method, ...args) => {
    const result = await repository[method](...args);
    setDataset(result.dataset);
    return result;
  }, [repository]);

  const saveReportDraft = useCallback((...args) => runMutation("saveReportDraft", ...args), [runMutation]);
  const createManualCase = useCallback((...args) => runMutation("createManualCase", ...args), [runMutation]);
  const saveWorkshopOrder = useCallback((...args) => runMutation("saveWorkshopOrder", ...args), [runMutation]);
  const closeCase = useCallback((...args) => runMutation("closeCase", ...args), [runMutation]);
  const reopenCase = useCallback((...args) => runMutation("reopenCase", ...args), [runMutation]);
  const saveEvidence = useCallback((...args) => runMutation("saveEvidence", ...args), [runMutation]);
  const applyInvoiceFixture = useCallback((...args) => runMutation("applyInvoiceFixture", ...args), [runMutation]);
  const saveServiceRequirement = useCallback((...args) => runMutation("saveServiceRequirement", ...args), [runMutation]);
  const planService = useCallback((...args) => runMutation("planService", ...args), [runMutation]);
  const saveHistoricalService = useCallback((...args) => runMutation("saveHistoricalService", ...args), [runMutation]);
  const runServiceAutomation = useCallback((...args) => runMutation("runServiceAutomation", ...args), [runMutation]);
  const saveServiceSettings = useCallback((...args) => runMutation("saveServiceSettings", ...args), [runMutation]);
  const savePositionMeasurement = useCallback((...args) => runMutation("savePositionMeasurement", ...args), [runMutation]);
  const runPositionDemo = useCallback((...args) => runMutation("runPositionDemo", ...args), [runMutation]);
  const uploadDocuments = useCallback((...args) => runMutation("uploadDocuments", ...args), [runMutation]);
  const updateDocument = useCallback((...args) => runMutation("updateDocument", ...args), [runMutation]);
  const replaceDocumentFile = useCallback((...args) => runMutation("replaceDocumentFile", ...args), [runMutation]);
  const removeDocumentRelation = useCallback((...args) => runMutation("removeDocumentRelation", ...args), [runMutation]);
  const archiveDocument = useCallback((...args) => runMutation("archiveDocument", ...args), [runMutation]);
  const saveLease = useCallback((...args) => runMutation("saveLease", ...args), [runMutation]);
  const runLeaseAutomation = useCallback((...args) => runMutation("runLeaseAutomation", ...args), [runMutation]);
  const updateLeaseDelivery = useCallback((...args) => runMutation("updateLeaseDelivery", ...args), [runMutation]);
  const saveLeaseMeterObservation = useCallback((...args) => runMutation("saveLeaseMeterObservation", ...args), [runMutation]);
  const saveContractReview = useCallback((...args) => runMutation("saveContractReview", ...args), [runMutation]);
  const saveManualCost = useCallback((...args) => runMutation("saveManualCost", ...args), [runMutation]);

  const updateCase = useCallback(async (caseId, change, actor, options) => {
    const result = await repository.updateCase(caseId, change, actor, options);
    setDataset(result.dataset);
    return result;
  }, [repository]);

  const createWorkshopTask = useCallback(async (caseId, input, actor, options) => {
    const result = await repository.createWorkshopTask(caseId, input, actor, options);
    setDataset(result.dataset);
    return result;
  }, [repository]);

  const updateWorkshopTask = useCallback(async (taskId, change, actor, options) => {
    const result = await repository.updateWorkshopTask(taskId, change, actor, options);
    setDataset(result.dataset);
    return result;
  }, [repository]);

  const saveBooking = useCallback(async (input, actor, options) => {
    const result = await repository.saveBooking(input, actor, options);
    setDataset(result.dataset);
    return result;
  }, [repository]);

  const cancelBooking = useCallback(async (bookingId, reason, actor, options) => {
    const result = await repository.cancelBooking(bookingId, reason, actor, options);
    setDataset(result.dataset);
    return result;
  }, [repository]);

  const value = useMemo(() => ({
    dataset,
    units: dataset?.units || [],
    relations: dataset?.relations || {},
    tenantId: dataset?.tenantId || repository.tenantId,
    loading: !dataset && !error,
    error,
    saveUnit,
    submitReport,
    saveReportDraft,
    createManualCase,
    saveWorkshopOrder,
    closeCase,
    reopenCase,
    saveEvidence,
    applyInvoiceFixture,
    saveServiceRequirement,
    planService,
    saveHistoricalService,
    runServiceAutomation,
    saveServiceSettings,
    savePositionMeasurement,
    runPositionDemo,
    uploadDocuments,
    updateDocument,
    replaceDocumentFile,
    removeDocumentRelation,
    archiveDocument,
    saveLease,
    runLeaseAutomation,
    updateLeaseDelivery,
    saveLeaseMeterObservation,
    saveContractReview,
    saveManualCost,
    updateCase,
    createWorkshopTask,
    updateWorkshopTask,
    saveBooking,
    cancelBooking,
    repositoryKind: repository.kind,
  }), [dataset, error, repository.kind, repository.tenantId, saveUnit, submitReport, saveReportDraft, createManualCase, saveWorkshopOrder, closeCase, reopenCase, saveEvidence, applyInvoiceFixture, saveServiceRequirement, planService, saveHistoricalService, runServiceAutomation, saveServiceSettings, savePositionMeasurement, runPositionDemo, uploadDocuments, updateDocument, replaceDocumentFile, removeDocumentRelation, archiveDocument, saveLease, runLeaseAutomation, updateLeaseDelivery, saveLeaseMeterObservation, saveContractReview, saveManualCost, updateCase, createWorkshopTask, updateWorkshopTask, saveBooking, cancelBooking]);

  return <FleetDataContext.Provider value={value}>{children}</FleetDataContext.Provider>;
}

export function useFleetData() {
  const value = useContext(FleetDataContext);
  if (!value) throw new Error("useFleetData skal bruges under FleetDataProvider.");
  return value;
}
