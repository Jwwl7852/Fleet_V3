import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { defaultUnitRepository } from "./unitRepository";

const FleetDataContext = createContext(null);

const DEFAULT_ACTOR = { id: "demo-lars", name: "Lars Hansen", role: "Demo-disponent" };
const mergeById = (local = [], server = []) => {
  const merged = new Map(local.map((item) => [item.id, item]));
  server.forEach((item) => merged.set(item.id, { ...(merged.get(item.id) || {}), ...item }));
  return [...merged.values()];
};

export function FleetDataProvider({ children, repository = defaultUnitRepository(), actor: authenticatedActor = null, serviceBackend = null }) {
  const [dataset, setDataset] = useState(null);
  const [error, setError] = useState(null);
  const serverControlledService = serviceBackend?.kind === "server";
  const serverControlledUnits = serverControlledService && typeof serviceBackend?.saveUnit === "function";
  const [serverUnitSnapshot, setServerUnitSnapshot] = useState(() => serviceBackend?.units || []);

  useEffect(() => {
    if (serverControlledUnits) setServerUnitSnapshot(serviceBackend.units || []);
  }, [serverControlledUnits, serviceBackend?.units]);

  useEffect(() => {
    let active = true;
    setDataset(null);
    setError(null);
    repository.load()
      .then(() => !serverControlledService && repository.runServiceAutomation ? repository.runServiceAutomation() : repository.load())
      .then(() => repository.runLeaseAutomation ? repository.runLeaseAutomation() : repository.load())
      .then((result) => {
      if (active) setDataset(result.dataset || result);
    }).catch((cause) => {
      if (active) setError(cause);
    });
    return () => { active = false; };
  }, [repository]);

  const saveUnit = useCallback(async (unit) => {
    if (serverControlledUnits) {
      const saved = await serviceBackend.saveUnit(unit);
      setServerUnitSnapshot((current) => {
        const units = [...current];
        const index = units.findIndex((item) => item.id === saved.id);
        if (index >= 0) units[index] = saved;
        else units.push(saved);
        return units;
      });
      return saved;
    }
    const saved = await repository.saveUnit(unit);
    setDataset((current) => {
      const units = [...current.units];
      const index = units.findIndex((item) => item.id === saved.id);
      if (index >= 0) units[index] = saved;
      else units.push(saved);
      return { ...current, units };
    });
    return saved;
  }, [repository, serverControlledUnits, serviceBackend]);

  useEffect(() => {
    if (!dataset || serverControlledService || !repository.runServiceAutomation) return undefined;
    const interval = window.setInterval(() => {
      repository.runServiceAutomation()
        .then(() => repository.runLeaseAutomation ? repository.runLeaseAutomation() : repository.load())
        .then((result) => setDataset(result.dataset || result))
        .catch((cause) => setError(cause));
    }, 60000);
    return () => window.clearInterval(interval);
  }, [dataset?.tenantId, repository, serverControlledService]);

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
  }, [repository, serverControlledService]);
  const resolveActor = useCallback(
    (suppliedActor) => authenticatedActor || suppliedActor || DEFAULT_ACTOR,
    [authenticatedActor],
  );
  const assertLocalCase = useCallback((caseId) => {
    const isServerCase = serverControlledService
      && (serviceBackend?.relations?.cases || []).some((item) => item.id === caseId);
    if (isServerCase) {
      throw new Error("Den serverstyrede sag kan ikke ændres i den lokale FLEET-prototype. Intet blev gemt.");
    }
  }, [serverControlledService, serviceBackend?.relations?.cases]);

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
  const saveWorkshopOrder = useCallback((caseId, input, suppliedActor, options) => {
    assertLocalCase(caseId);
    return runMutation("saveWorkshopOrder", caseId, input, resolveActor(suppliedActor), options);
  }, [assertLocalCase, resolveActor, runMutation]);
  const closeCase = useCallback((caseId, input, suppliedActor, options) => {
    assertLocalCase(caseId);
    return runMutation("closeCase", caseId, input, resolveActor(suppliedActor), options);
  }, [assertLocalCase, resolveActor, runMutation]);
  const reopenCase = useCallback((caseId, reason, suppliedActor, options) => {
    assertLocalCase(caseId);
    return runMutation("reopenCase", caseId, reason, resolveActor(suppliedActor), options);
  }, [assertLocalCase, resolveActor, runMutation]);
  const saveEvidence = useCallback((caseId, input, suppliedActor, options) => {
    assertLocalCase(caseId);
    return runMutation("saveEvidence", caseId, input, resolveActor(suppliedActor), options);
  }, [assertLocalCase, resolveActor, runMutation]);
  const applyInvoiceFixture = useCallback((...args) => runMutation("applyInvoiceFixture", ...args), [runMutation]);
  const saveServiceRequirement = useCallback(async (input, suppliedActor, options) => {
    if (serverControlledService) return serviceBackend.saveRequirement(input, resolveActor(suppliedActor), options);
    return runMutation("saveServiceRequirement", input, resolveActor(suppliedActor), options);
  }, [resolveActor, runMutation, serverControlledService, serviceBackend]);
  const planService = useCallback(async (requirementId, input, suppliedActor, options) => {
    if (serverControlledService) throw new Error("Planlægning fra serverkravet afventer den fælles sagsadapter. Intet blev gemt lokalt.");
    return runMutation("planService", requirementId, input, resolveActor(suppliedActor), options);
  }, [resolveActor, runMutation, serverControlledService]);
  const saveHistoricalService = useCallback(async (input, suppliedActor, options) => {
    if (serverControlledService) throw new Error("Historisk service afventer serveradapteren. Intet blev gemt lokalt.");
    return runMutation("saveHistoricalService", input, resolveActor(suppliedActor), options);
  }, [resolveActor, runMutation, serverControlledService]);
  const runServiceAutomation = useCallback((...args) => serverControlledService
    ? serviceBackend.runAutomation(...args) : runMutation("runServiceAutomation", ...args),
  [runMutation, serverControlledService, serviceBackend]);
  const saveServiceSettings = useCallback(async (...args) => {
    if (serverControlledService) throw new Error("Mailindstillinger er ikke del af den serverstyrede servicegrænse endnu.");
    return runMutation("saveServiceSettings", ...args);
  }, [runMutation, serverControlledService]);
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
    assertLocalCase(caseId);
    const result = await repository.updateCase(caseId, change, resolveActor(suppliedActor), options);
    setDataset(result.dataset);
    return result;
  }, [assertLocalCase, repository, resolveActor]);

  const createWorkshopTask = useCallback(async (caseId, input, suppliedActor, options) => {
    assertLocalCase(caseId);
    const result = await repository.createWorkshopTask(caseId, input, resolveActor(suppliedActor), options);
    setDataset(result.dataset);
    return result;
  }, [assertLocalCase, repository, resolveActor]);

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

  const effectiveUnits = useMemo(() => serverControlledUnits
    ? serverUnitSnapshot
    : mergeById(dataset?.units || [], serverControlledService ? serviceBackend?.units || [] : []),
  [dataset?.units, serverControlledService, serverControlledUnits, serverUnitSnapshot, serviceBackend?.units]);
  const effectiveRelations = useMemo(() => {
    const local = dataset?.relations || {};
    const server = serverControlledService ? serviceBackend?.relations || {} : {};
    return {
      ...local,
      ...server,
      reports: mergeById(local.reports, server.reports),
      cases: mergeById(local.cases, server.cases),
      caseEvents: mergeById(local.caseEvents, server.caseEvents),
    };
  }, [dataset?.relations, serverControlledService, serviceBackend?.relations]);

  const value = useMemo(() => ({
    dataset,
    actor: authenticatedActor || DEFAULT_ACTOR,
    units: effectiveUnits,
    relations: effectiveRelations,
    tenantId: dataset?.tenantId || repository.tenantId,
    // Serverens serviceprojektion har sin egen serviceLoading-tilstand nedenfor.
    // Den må ikke blokere uafhængige lokale FLEET-flader som Overblik,
    // Arbejdskø og Livekort, mens en autoritativ serviceforespørgsel afventer.
    loading: !dataset && !error,
    error,
    serverProjectionError: serverControlledService ? serviceBackend?.error : null,
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
    repositoryKind: serverControlledUnits ? "shared-unit-register" : repository.kind,
    serviceUnits: serverControlledService ? serviceBackend.units : effectiveUnits,
    serviceRelations: effectiveRelations,
    serviceLoading: serverControlledService ? serviceBackend.loading : !dataset && !error,
    serviceError: serverControlledService ? serviceBackend.error : error,
    serviceBackendKind: serverControlledService ? "server" : "prototype",
    serviceCapabilities: serviceBackend?.capabilities || {
      saveRequirement: true, runAutomation: true, planService: true,
      saveHistory: true, saveSettings: true,
    },
  }), [authenticatedActor, dataset, error, repository.kind, repository.tenantId, saveUnit, submitReport, saveReportDraft, createManualCase, saveWorkshopOrder, closeCase, reopenCase, saveEvidence, applyInvoiceFixture, saveServiceRequirement, planService, saveHistoricalService, runServiceAutomation, saveServiceSettings, savePositionMeasurement, runPositionDemo, uploadDocuments, updateDocument, replaceDocumentFile, removeDocumentRelation, archiveDocument, saveLease, runLeaseAutomation, updateLeaseDelivery, saveLeaseMeterObservation, saveContractReview, saveManualCost, updateCase, createWorkshopTask, updateWorkshopTask, saveBooking, cancelBooking, serverControlledService, serverControlledUnits, serviceBackend, effectiveUnits, effectiveRelations]);

  return <FleetDataContext.Provider value={value}>{children}</FleetDataContext.Provider>;
}

export function useFleetData() {
  const value = useContext(FleetDataContext);
  if (!value) throw new Error("useFleetData skal bruges under FleetDataProvider.");
  return value;
}
