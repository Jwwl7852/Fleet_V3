import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { defaultUnitRepository } from "./unitRepository";

const FleetDataContext = createContext(null);

const DEFAULT_ACTOR = { id: "demo-lars", name: "Lars Hansen", role: "Demo-disponent" };

export function FleetDataProvider({ children, repository = defaultUnitRepository(), actor: authenticatedActor = null }) {
  const [dataset, setDataset] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setDataset(null);
    setError(null);
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
    const contextualInput = authenticatedActor ? {
      ...input,
      reporterId: authenticatedActor.id,
      reporterName: authenticatedActor.name,
    } : input;
    const result = await repository.submitReport(contextualInput, options);
    setDataset(result.dataset);
    return result;
  }, [authenticatedActor, repository]);

  const runMutation = useCallback(async (method, ...args) => {
    const result = await repository[method](...args);
    setDataset(result.dataset);
    return result;
  }, [repository]);
  const resolveActor = useCallback(
    (suppliedActor) => authenticatedActor || suppliedActor || DEFAULT_ACTOR,
    [authenticatedActor],
  );

  const saveReportDraft = useCallback((input, options) => runMutation(
    "saveReportDraft",
    authenticatedActor ? {
      ...input,
      reporterId: authenticatedActor.id,
      reporterName: authenticatedActor.name,
    } : input,
    options,
  ), [authenticatedActor, runMutation]);
  const createManualCase = useCallback((input, suppliedActor, options) => runMutation("createManualCase", input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const saveWorkshopOrder = useCallback((caseId, input, suppliedActor, options) => runMutation("saveWorkshopOrder", caseId, input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const closeCase = useCallback((caseId, input, suppliedActor, options) => runMutation("closeCase", caseId, input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const reopenCase = useCallback((caseId, reason, suppliedActor, options) => runMutation("reopenCase", caseId, reason, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const saveEvidence = useCallback((caseId, input, suppliedActor, options) => runMutation("saveEvidence", caseId, input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const applyInvoiceFixture = useCallback((...args) => runMutation("applyInvoiceFixture", ...args), [runMutation]);
  const saveServiceRequirement = useCallback((input, suppliedActor, options) => runMutation("saveServiceRequirement", input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const planService = useCallback((requirementId, input, suppliedActor, options) => runMutation("planService", requirementId, input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const saveHistoricalService = useCallback((input, suppliedActor, options) => runMutation("saveHistoricalService", input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const runServiceAutomation = useCallback((...args) => runMutation("runServiceAutomation", ...args), [runMutation]);
  const saveServiceSettings = useCallback((...args) => runMutation("saveServiceSettings", ...args), [runMutation]);
  const savePositionMeasurement = useCallback((...args) => runMutation("savePositionMeasurement", ...args), [runMutation]);
  const runPositionDemo = useCallback((...args) => runMutation("runPositionDemo", ...args), [runMutation]);
  const uploadDocuments = useCallback((input, suppliedActor, options) => runMutation("uploadDocuments", input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const updateDocument = useCallback((documentId, input, suppliedActor, options) => runMutation("updateDocument", documentId, input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const replaceDocumentFile = useCallback((documentId, file, suppliedActor, options) => runMutation("replaceDocumentFile", documentId, file, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const removeDocumentRelation = useCallback((...args) => runMutation("removeDocumentRelation", ...args), [runMutation]);
  const archiveDocument = useCallback((documentId, archived, suppliedActor, options) => runMutation("archiveDocument", documentId, archived, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const saveLease = useCallback((input, suppliedActor, options) => runMutation("saveLease", input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const runLeaseAutomation = useCallback((...args) => runMutation("runLeaseAutomation", ...args), [runMutation]);
  const updateLeaseDelivery = useCallback((deliveryId, input, suppliedActor, options) => runMutation("updateLeaseDelivery", deliveryId, input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const saveLeaseMeterObservation = useCallback((...args) => runMutation("saveLeaseMeterObservation", ...args), [runMutation]);
  const saveContractReview = useCallback((leaseId, input, suppliedActor, options) => runMutation("saveContractReview", leaseId, input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);
  const saveManualCost = useCallback((input, suppliedActor, options) => runMutation("saveManualCost", input, resolveActor(suppliedActor), options), [resolveActor, runMutation]);

  const updateCase = useCallback(async (caseId, change, suppliedActor, options) => {
    const result = await repository.updateCase(caseId, change, resolveActor(suppliedActor), options);
    setDataset(result.dataset);
    return result;
  }, [repository, resolveActor]);

  const createWorkshopTask = useCallback(async (caseId, input, suppliedActor, options) => {
    const result = await repository.createWorkshopTask(caseId, input, resolveActor(suppliedActor), options);
    setDataset(result.dataset);
    return result;
  }, [repository, resolveActor]);

  const updateWorkshopTask = useCallback(async (taskId, change, suppliedActor, options) => {
    const result = await repository.updateWorkshopTask(taskId, change, resolveActor(suppliedActor), options);
    setDataset(result.dataset);
    return result;
  }, [repository, resolveActor]);

  const saveBooking = useCallback(async (input, suppliedActor, options) => {
    const result = await repository.saveBooking(input, resolveActor(suppliedActor), options);
    setDataset(result.dataset);
    return result;
  }, [repository, resolveActor]);

  const cancelBooking = useCallback(async (bookingId, reason, suppliedActor, options) => {
    const result = await repository.cancelBooking(bookingId, reason, resolveActor(suppliedActor), options);
    setDataset(result.dataset);
    return result;
  }, [repository, resolveActor]);

  const value = useMemo(() => ({
    dataset,
    actor: authenticatedActor || DEFAULT_ACTOR,
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
  }), [authenticatedActor, dataset, error, repository.kind, repository.tenantId, saveUnit, submitReport, saveReportDraft, createManualCase, saveWorkshopOrder, closeCase, reopenCase, saveEvidence, applyInvoiceFixture, saveServiceRequirement, planService, saveHistoricalService, runServiceAutomation, saveServiceSettings, savePositionMeasurement, runPositionDemo, uploadDocuments, updateDocument, replaceDocumentFile, removeDocumentRelation, archiveDocument, saveLease, runLeaseAutomation, updateLeaseDelivery, saveLeaseMeterObservation, saveContractReview, saveManualCost, updateCase, createWorkshopTask, updateWorkshopTask, saveBooking, cancelBooking]);

  return <FleetDataContext.Provider value={value}>{children}</FleetDataContext.Provider>;
}

export function useFleetData() {
  const value = useContext(FleetDataContext);
  if (!value) throw new Error("useFleetData skal bruges under FleetDataProvider.");
  return value;
}
