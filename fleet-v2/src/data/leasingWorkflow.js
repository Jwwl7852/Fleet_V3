import { createReportRecords } from "./caseWorkflow";
import { nextReadableReference, nextWorkshopOrderReference } from "./caseFolderWorkflow";
import { applyDocumentUpload, validateDocumentFile } from "./documentWorkflow";

const clone = (value) => structuredClone(value);
const uid = () => crypto.randomUUID();
const isoNow = (options = {}) => options.now?.() || new Date().toISOString();
const dateOnly = (value) => value ? String(value).slice(0, 10) : null;
const DAY = 86400000;

export const LEASE_TYPES = {
  operational: "Operationel",
  financial: "Finansiel",
  other: "Anden / ukendt",
};

export const LEASE_STATUSES = {
  draft: "Kladde",
  active: "Aktiv",
  ending: "Udløber snart",
  delivered: "Fysisk afleveret",
  closed: "Afsluttet",
};

export const LEASE_SERVICE_STATES = {
  included: "Inkluderet",
  excluded: "Ikke inkluderet",
  conditional: "Inkluderet med betingelser",
  unresolved: "Uafklaret / ikke fundet",
};

export const DEFAULT_LEASE_SETTINGS = {
  id: "lease-settings-default",
  warningDays: [120, 90, 30],
  deliveryCaseLeadDays: 120,
  lastAutomationRunAt: null,
};

const demoLease = (tenantId) => ({
  id: "lease-demo-nb-001",
  tenantId,
  agreementNumber: "LS-2024-018",
  unitId: "unit-nb-001",
  lessor: { id: "lessor-nord-demo", name: "Nord Leasing (fiktiv)", contactName: "Mette Sørensen", email: "mette.demo@example.invalid", phone: "+45 70 12 34 56" },
  type: "operational",
  status: "active",
  startDate: "2024-01-01",
  endDate: "2026-12-31",
  bindingMonths: 36,
  noticeDays: 92,
  lastNoticeDate: "2026-09-30",
  extensionTerms: "Forlængelse kræver skriftlig aftale.",
  plannedDeliveryDate: "2026-12-31",
  actualDeliveryDate: null,
  payment: { initialMinor: 1500000, recurringMinor: 425000, interval: "monthly", currency: "DKK", vat: "exclusive", depositMinor: 500000, feesMinor: null, adjustmentTerms: "Årlig regulering efter aftale.", residualValueMinor: null, purchaseOptionMinor: null },
  mileage: { startValue: 10000, startObservedAt: "2024-01-01", allowanceScope: "total", includedKm: 120000, periodKm: null, periodMonths: null, overageRateMinor: 125, underageRateMinor: null, toleranceKm: 0, capKm: null, manualExpectedMonthlyKm: null },
  services: { maintenance: "included", repairs: "conditional", tyres: "excluded", tyreChange: "excluded", tyreStorage: "unresolved", insurance: "excluded", roadside: "unresolved", replacementVehicle: "conditional", notes: "Service er inkluderet; dækaftale kræver særskilt gennemgang." },
  returnTerms: { location: "Nord Leasing, Aarhus", contact: "Mette Sørensen", condition: "Normal stand for alder og kilometer.", equipment: "To nøgler, ladekabel og registreringsattest", inspection: "Forhåndsinspektion senest 14 dage før aflevering", earlyReturnFeeMinor: null, revisedAllowanceKm: null, otherFeesMinor: null },
  documentIds: ["document-lease-demo-contract"],
  warningDays: [120, 90, 30],
  source: "demo_fixture",
  createdAt: "2026-01-05T09:00:00.000Z",
  updatedAt: "2026-01-05T09:00:00.000Z",
});

const demoObservations = (tenantId) => [
  { id: "meter-lease-nb-001-start", tenantId, unitId: "unit-nb-001", value: 10000, unit: "km", observedAt: "2024-01-01T09:00:00.000Z", receivedAt: "2024-01-01T09:05:00.000Z", source: "lease_delivery", demo: true },
  { id: "meter-lease-nb-001-apr", tenantId, unitId: "unit-nb-001", value: 98500, unit: "km", observedAt: "2026-04-01T09:00:00.000Z", receivedAt: "2026-04-01T09:05:00.000Z", source: "manual", demo: true },
  { id: "meter-lease-nb-001-latest", tenantId, unitId: "unit-nb-001", value: 124532, unit: "km", observedAt: "2026-09-01T09:00:00.000Z", receivedAt: "2026-09-01T09:05:00.000Z", source: "manual", demo: true },
];

function demoContractDocument(tenantId) {
  const at = "2026-01-05T09:00:00.000Z";
  return {
    id: "document-lease-demo-contract", tenantId, title: "Leasingaftale LS-2024-018.pdf", category: "lease",
    note: "Navngiven syntetisk kontrakt til demonstration af gennemgangsflowet.", validFrom: "2024-01-01", expiresAt: "2026-12-31", reminderDays: 120,
    origin: "lease_demo_fixture", originLabel: "Demonstration af kontraktaflæsning", sourceKey: "lease-demo-contract",
    currentVersionId: "document-lease-demo-contract-version-1",
    relations: [
      { id: "document-lease-demo-contract-unit", type: "unit", targetId: "unit-nb-001", addedAt: at },
      { id: "document-lease-demo-contract-lease", type: "lease", targetId: "lease-demo-nb-001", addedAt: at },
    ],
    versions: [{ id: "document-lease-demo-contract-version-1", version: 1, fileName: "Leasingaftale LS-2024-018.pdf", mimeType: "application/pdf", size: null, blob: null, uploadedAt: at, sourceAttachment: null, metadata: { title: "Leasingaftale LS-2024-018.pdf", category: "lease", note: "Syntetisk demokontrakt", validFrom: "2024-01-01", expiresAt: "2026-12-31", reminderDays: 120 } }],
    archivedAt: null, archivedBy: null, createdAt: at, updatedAt: at,
  };
}

export function ensureLeasingRegistry(dataset) {
  const relations = dataset.relations || {};
  const hadLeases = Array.isArray(relations.leases);
  const leases = hadLeases ? relations.leases.map((item) => clone(item)) : [demoLease(dataset.tenantId)];
  const observations = Array.isArray(relations.meterObservations) ? relations.meterObservations.map((item) => clone(item)) : demoObservations(dataset.tenantId);
  const documents = [...(relations.documents || [])];
  if (!hadLeases && !documents.some((item) => item.id === "document-lease-demo-contract")) documents.push(demoContractDocument(dataset.tenantId));
  return {
    ...dataset,
    relations: {
      ...relations,
      leases,
      meterObservations: observations,
      leaseEvents: relations.leaseEvents || [],
      leaseDeliveryCases: relations.leaseDeliveryCases || [],
      leaseContractReviews: relations.leaseContractReviews || [],
      leaseSettings: relations.leaseSettings?.length ? relations.leaseSettings : [{ ...DEFAULT_LEASE_SETTINGS, tenantId: dataset.tenantId }],
      documents,
    },
  };
}

export function migrateLeaseDemoMeterObservations(dataset) {
  if (dataset.relations?.leaseSettings?.[0]?.demoMeterMigrationVersion >= 2) return dataset;
  const lease = dataset.relations?.leases?.find((item) => item.id === "lease-demo-nb-001" && item.source === "demo_fixture");
  if (!lease) return { ...dataset, relations: { ...dataset.relations, leaseSettings: dataset.relations.leaseSettings?.map((item, index) => index === 0 ? { ...item, demoMeterMigrationVersion: 2 } : item) || [] } };
  const existing = dataset.relations.meterObservations || [];
  const missing = demoObservations(dataset.tenantId).filter((item) => !existing.some((current) => current.id === item.id));
  return { ...dataset, relations: { ...dataset.relations, meterObservations: [...existing, ...missing], leaseSettings: dataset.relations.leaseSettings.map((item, index) => index === 0 ? { ...item, demoMeterMigrationVersion: 2 } : item) } };
}

const parseMinor = (value) => value === "" || value == null ? null : Math.round(Number(String(value).replace(",", ".")) * 100);
const positiveOrNull = (value) => value === "" || value == null ? null : Number(String(value).replace(",", "."));

export function validateLease(input, units, leases = []) {
  const errors = {};
  if (!input.agreementNumber?.trim()) errors.agreementNumber = "Angiv aftalenummer.";
  if (!units.some((item) => item.id === input.unitId)) errors.unitId = "Vælg en eksisterende enhed.";
  if (!input.lessorName?.trim()) errors.lessorName = "Angiv leasingselskab.";
  if (!input.startDate) errors.startDate = "Angiv startdato.";
  if (!input.endDate) errors.endDate = "Angiv kontraktudløb.";
  if (input.startDate && input.endDate && input.startDate > input.endDate) errors.endDate = "Kontraktudløb skal ligge efter startdato.";
  const duplicate = leases.find((item) => item.id !== input.id && item.agreementNumber?.toLowerCase() === input.agreementNumber?.trim().toLowerCase());
  if (duplicate) errors.agreementNumber = "Aftalenummeret findes allerede.";
  const recurring = positiveOrNull(input.recurringAmount);
  if (recurring != null && recurring < 0) errors.recurringAmount = "Ydelsen kan ikke være negativ.";
  const startMeter = positiveOrNull(input.startMeter);
  if (startMeter != null && startMeter < 0) errors.startMeter = "Startmålerstanden kan ikke være negativ.";
  const included = positiveOrNull(input.includedKm);
  if (included != null && included <= 0) errors.includedKm = "Kilometergrænsen skal være positiv.";
  const warningDays = (input.warningDays || []).map(Number).filter(Number.isFinite);
  if (warningDays.some((item) => item < 0)) errors.warningDays = "Varslingsfrister kan ikke være negative.";
  return errors;
}

function leaseFromInput(input, current, tenantId, at, idFactory) {
  return {
    ...current,
    id: current?.id || `lease-${idFactory?.() || uid()}`,
    tenantId,
    agreementNumber: input.agreementNumber.trim(), unitId: input.unitId,
    lessor: { id: current?.lessor?.id || `lessor-${input.lessorName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: input.lessorName.trim(), contactName: input.contactName?.trim() || "", email: input.contactEmail?.trim() || "", phone: input.contactPhone?.trim() || "" },
    type: input.type || "other", status: input.status || current?.status || "draft",
    startDate: input.startDate, endDate: input.endDate, bindingMonths: positiveOrNull(input.bindingMonths), noticeDays: positiveOrNull(input.noticeDays), lastNoticeDate: input.lastNoticeDate || null,
    extensionTerms: input.extensionTerms?.trim() || "", plannedDeliveryDate: input.plannedDeliveryDate || input.endDate, actualDeliveryDate: current?.actualDeliveryDate || null,
    payment: {
      initialMinor: parseMinor(input.initialAmount), recurringMinor: parseMinor(input.recurringAmount), interval: input.paymentInterval || "monthly", currency: input.currency || "DKK", vat: input.vat || "unknown",
      depositMinor: parseMinor(input.depositAmount), feesMinor: parseMinor(input.feesAmount), adjustmentTerms: input.adjustmentTerms?.trim() || "", residualValueMinor: parseMinor(input.residualValue), purchaseOptionMinor: parseMinor(input.purchaseOption),
    },
    mileage: {
      startValue: positiveOrNull(input.startMeter), startObservedAt: input.startMeterDate || input.startDate,
      allowanceScope: input.allowanceScope || "total", includedKm: positiveOrNull(input.includedKm), periodKm: positiveOrNull(input.periodKm), periodMonths: positiveOrNull(input.periodMonths),
      overageRateMinor: parseMinor(input.overageRate), underageRateMinor: parseMinor(input.underageRate), toleranceKm: positiveOrNull(input.toleranceKm), capKm: positiveOrNull(input.capKm), manualExpectedMonthlyKm: positiveOrNull(input.manualExpectedMonthlyKm),
    },
    services: { maintenance: input.maintenance || "unresolved", repairs: input.repairs || "unresolved", tyres: input.tyres || "unresolved", tyreChange: input.tyreChange || "unresolved", tyreStorage: input.tyreStorage || "unresolved", insurance: input.insurance || "unresolved", roadside: input.roadside || "unresolved", replacementVehicle: input.replacementVehicle || "unresolved", notes: input.serviceNotes?.trim() || "" },
    returnTerms: { location: input.returnLocation?.trim() || "", contact: input.returnContact?.trim() || "", condition: input.returnCondition?.trim() || "", equipment: input.returnEquipment?.trim() || "", inspection: input.returnInspection?.trim() || "", earlyReturnFeeMinor: parseMinor(input.earlyReturnFee), revisedAllowanceKm: positiveOrNull(input.revisedAllowanceKm), otherFeesMinor: parseMinor(input.otherReturnFees) },
    documentIds: current?.documentIds || [], warningDays: [...new Set((input.warningDays || [120,90,30]).map(Number).filter((item) => Number.isFinite(item) && item >= 0))].sort((a,b) => b-a),
    createdAt: current?.createdAt || at, updatedAt: at,
  };
}

export function applyLeaseSave(dataset, input, actor, options = {}) {
  const normalized = ensureLeasingRegistry(dataset);
  const errors = validateLease(input, normalized.units, normalized.relations.leases);
  if (Object.keys(errors).length) { const error = new Error(Object.values(errors)[0]); error.validation = errors; throw error; }
  const at = isoNow(options);
  const leases = [...normalized.relations.leases];
  const index = input.id ? leases.findIndex((item) => item.id === input.id) : -1;
  if (input.id && index < 0) throw new Error("Leasingaftalen findes ikke.");
  const current = index >= 0 ? leases[index] : null;
  const lease = leaseFromInput(input, current, normalized.tenantId, at, options.idFactory);
  const overlaps = leases.filter((item) => item.id !== lease.id && item.unitId === lease.unitId && item.status !== "closed" && item.startDate <= lease.endDate && item.endDate >= lease.startDate).map((item) => item.id);
  lease.overlapLeaseIds = overlaps;
  if (index >= 0) leases[index] = lease; else leases.push(lease);
  const event = { id: `lease-event-${uid()}`, tenantId: normalized.tenantId, leaseId: lease.id, unitId: lease.unitId, at, actorId: actor?.id || "demo-local", actorName: actor?.name || "Lokal demo-bruger", type: current ? "updated" : "created", title: current ? "Leasingaftale opdateret" : "Leasingaftale oprettet", text: `${lease.agreementNumber} blev ${current ? "opdateret" : "oprettet"} i den lokale prototype.`, snapshot: current ? clone(current) : null };
  let deliveryCases = normalized.relations.leaseDeliveryCases || [];
  if (current && (current.endDate !== lease.endDate || current.plannedDeliveryDate !== lease.plannedDeliveryDate)) deliveryCases = deliveryCases.map((item) => item.leaseId === lease.id && item.status !== "completed" ? { ...item, dueDate: lease.plannedDeliveryDate || lease.endDate, reviewRequired: true, reviewReason: "Aftalens udløb eller afleveringsdato er ændret.", updatedAt: at } : item);
  return { dataset: { ...normalized, relations: { ...normalized.relations, leases, leaseDeliveryCases: deliveryCases, leaseEvents: [...normalized.relations.leaseEvents, event] } }, lease, event };
}

export function applyLeaseSaveWithContract(dataset, input, actor, options = {}) {
  const contractFile = input.contractFile || null;
  const unitImageChange = input.unitImageChange;
  if (contractFile) validateDocumentFile(contractFile);

  const leaseInput = { ...input };
  delete leaseInput.contractFile;
  delete leaseInput.unitImageChange;
  const leaseResult = applyLeaseSave(dataset, leaseInput, actor, options);
  const withUnitImage = (result) => {
    if (unitImageChange === undefined) return result;
    const units = result.dataset.units.map((unit) => unit.id === result.lease.unitId ? { ...unit, image: unitImageChange, updatedAt: options.now || new Date().toISOString() } : unit);
    return { ...result, updatedUnit: units.find((unit) => unit.id === result.lease.unitId), dataset: { ...result.dataset, units } };
  };
  if (!contractFile) return withUnitImage({ ...leaseResult, documents: [] });

  const uploadResult = applyDocumentUpload(leaseResult.dataset, {
    files: [contractFile],
    title: contractFile.name,
    category: "lease",
    note: "Leasingkontrakt uploadet sammen med aftalen.",
    relations: [
      { type: "lease", targetId: leaseResult.lease.id },
      { type: "unit", targetId: leaseResult.lease.unitId },
    ],
  }, actor, options.documentOptions || options);
  const document = uploadResult.documents[0];
  const lease = {
    ...leaseResult.lease,
    documentIds: [...new Set([...(leaseResult.lease.documentIds || []), document.id])],
  };
  const leases = uploadResult.dataset.relations.leases.map((item) => item.id === lease.id ? lease : item);
  return withUnitImage({
    ...leaseResult,
    lease,
    documents: uploadResult.documents,
    dataset: {
      ...uploadResult.dataset,
      relations: { ...uploadResult.dataset.relations, leases },
    },
  });
}

export function includedKilometres(lease) {
  const mileage = lease.mileage || {};
  if (mileage.allowanceScope === "total") return Number.isFinite(mileage.includedKm) ? mileage.includedKm : null;
  if (!Number.isFinite(mileage.periodKm) || !Number.isFinite(mileage.periodMonths) || mileage.periodMonths <= 0 || !lease.startDate || !lease.endDate) return null;
  const start = new Date(`${lease.startDate}T00:00:00Z`); const end = new Date(`${lease.endDate}T00:00:00Z`);
  const months = Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1);
  return mileage.periodKm * Math.ceil(months / mileage.periodMonths);
}

export function leaseMeterBasis(lease, observations, options = {}) {
  const all = (observations || []).filter((item) => item.unitId === lease.unitId && item.unit === "km" && Number.isFinite(Number(item.value)) && item.observedAt).sort((a,b) => new Date(a.observedAt) - new Date(b.observedAt));
  const startValue = Number.isFinite(lease.mileage?.startValue) ? lease.mileage.startValue : null;
  if (startValue == null) return { calculable: false, reason: "Startmålerstand mangler.", observations: all };
  const relevant = all.filter((item) => dateOnly(item.observedAt) >= lease.startDate);
  const falling = relevant.find((item, index) => index > 0 && Number(item.value) < Number(relevant[index - 1].value) && !item.meterReset && !item.correction);
  if (falling) return { calculable: false, reason: "Målerstanden falder eller er modstridende og kræver en eksplicit rettelse.", observations: relevant, conflictingObservationId: falling.id };
  const latest = relevant.at(-1) || null;
  if (!latest) return { calculable: false, reason: "Der findes ingen dateret kilometermåling i aftaleperioden.", observations: relevant };
  if (Number(latest.value) < startValue && !latest.meterReset && !latest.correction) return { calculable: false, reason: "Seneste måling er lavere end startmålerstanden.", observations: relevant };
  const today = new Date(options.today || new Date());
  const ageDays = Math.floor((today - new Date(latest.observedAt)) / DAY);
  return { calculable: true, startValue, latest, distance: Number(latest.value) - startValue, ageDays, stale: ageDays > (options.staleDays || 90), observations: relevant };
}

export function calculateLeaseProjection(lease, observations, options = {}) {
  const basis = leaseMeterBasis(lease, observations, options);
  const allowance = includedKilometres(lease);
  if (!basis.calculable || allowance == null) return { calculable: false, reason: basis.reason || "Kilometergrænsen er ikke tilstrækkeligt registreret.", basis, allowance };
  const latestDate = new Date(basis.latest.observedAt);
  const windowDays = Number(options.windowDays || 183);
  const cutoff = new Date(latestDate.getTime() - windowDays * DAY);
  const candidates = basis.observations.filter((item) => new Date(item.observedAt) >= cutoff && new Date(item.observedAt) < latestDate && Number(item.value) <= Number(basis.latest.value));
  const first = candidates[0] || null;
  let dailyRate = null; let method = "insufficient"; let periodDays = null;
  if (first) {
    periodDays = Math.max(1, (latestDate - new Date(first.observedAt)) / DAY);
    dailyRate = (Number(basis.latest.value) - Number(first.value)) / periodDays;
    method = "observed_window";
  } else if (Number.isFinite(lease.mileage?.manualExpectedMonthlyKm)) {
    dailyRate = lease.mileage.manualExpectedMonthlyKm / 30.4375; method = "manual_monthly";
  }
  const projectionEndDate = options.endDate || lease.endDate;
  const endDate = new Date(`${projectionEndDate}T23:59:59Z`);
  const remainingDays = Math.max(0, (endDate - latestDate) / DAY);
  const projectedDistance = dailyRate == null ? null : Math.round(basis.distance + dailyRate * remainingDays);
  const remainingKm = allowance - basis.distance;
  const excessKm = projectedDistance == null ? null : Math.max(0, projectedDistance - allowance - (lease.mileage?.toleranceKm || 0));
  const excessCostMinor = excessKm == null || !Number.isFinite(lease.mileage?.overageRateMinor) ? null : Math.round(excessKm * lease.mileage.overageRateMinor);
  const quotaExhaustedAt = dailyRate > 0 && remainingKm > 0 ? new Date(latestDate.getTime() + remainingKm / dailyRate * DAY).toISOString() : remainingKm <= 0 ? basis.latest.observedAt : null;
  return { calculable: projectedDistance != null, reason: projectedDistance == null ? "Mindst to relevante målinger eller et manuelt forventet kørselsniveau kræves." : null, basis, allowance, remainingKm, dailyRate, projectedDistance, excessKm, excessCostMinor, quotaExhaustedAt, method, windowDays, periodDays, stale: basis.stale };
}

export function calculateEarlyReturn(lease, observations, input = {}, options = {}) {
  const alternativeDate = input.alternativeDate || null;
  const projection = calculateLeaseProjection(lease, observations, { ...options, endDate: alternativeDate });
  const missing = [];
  if (!alternativeDate) missing.push("alternativ afleveringsdato");
  if (!Number.isFinite(lease.returnTerms?.earlyReturnFeeMinor)) missing.push("aftalt betaling for tidlig afslutning");
  if (!Number.isFinite(lease.payment?.recurringMinor)) missing.push("løbende leasingydelse");
  const replacementMinor = input.replacementCostMinor == null ? null : Number(input.replacementCostMinor);
  if (missing.length) return { calculable: false, missing, projection, totalMinor: null };
  const from = new Date(`${alternativeDate}T00:00:00Z`); const to = new Date(`${lease.endDate}T00:00:00Z`);
  const remainingMonths = Math.max(0, Math.ceil((to - from) / (30.4375 * DAY)));
  const paymentCommitmentMinor = remainingMonths * lease.payment.recurringMinor;
  const totalMinor = lease.returnTerms.earlyReturnFeeMinor + (lease.returnTerms.otherFeesMinor || 0) + (replacementMinor || 0);
  return { calculable: true, projection, remainingMonths, paymentCommitmentMinor, earlyReturnFeeMinor: lease.returnTerms.earlyReturnFeeMinor, otherFeesMinor: lease.returnTerms.otherFeesMinor || 0, replacementMinor, totalMinor };
}

export function saveMeterObservation(dataset, input, options = {}) {
  const normalized = ensureLeasingRegistry(dataset);
  if (!normalized.units.some((item) => item.id === input.unitId)) throw new Error("Enheden findes ikke.");
  const value = Number(String(input.value).replace(",", "."));
  if (!Number.isFinite(value) || value < 0) throw new Error("Angiv en gyldig, positiv målerstand.");
  if (!input.observedAt) throw new Error("Angiv måledato.");
  const observation = { id: `meter-${options.id || uid()}`, tenantId: normalized.tenantId, unitId: input.unitId, value, unit: input.unit || "km", observedAt: input.observedAt, receivedAt: isoNow(options), source: input.source || "manual", demo: Boolean(input.demo), correction: Boolean(input.correction), meterReset: Boolean(input.meterReset), note: input.note?.trim() || "" };
  return { dataset: { ...normalized, relations: { ...normalized.relations, meterObservations: [...normalized.relations.meterObservations, observation] } }, observation };
}

export const leaseOdometerAdapter = Object.freeze({
  id: "obd-odometer-not-connected",
  connected: false,
  normalize(measurement) {
    if (!measurement || !Number.isFinite(Number(measurement.value)) || !measurement.observedAt) return null;
    return {
      unitId: measurement.unitId,
      value: Number(measurement.value),
      unit: "km",
      observedAt: measurement.observedAt,
      receivedAt: measurement.receivedAt || null,
      source: measurement.source || "obd_adapter",
      demo: Boolean(measurement.demo),
    };
  },
});

const daysUntil = (date, today) => Math.ceil((new Date(`${date}T00:00:00Z`) - new Date(`${dateOnly(today)}T00:00:00Z`)) / DAY);

export function applyLeaseAutomation(dataset, options = {}) {
  let normalized = ensureLeasingRegistry(dataset);
  const at = isoNow(options); const today = options.today || dateOnly(at);
  let deliveryCases = [...normalized.relations.leaseDeliveryCases];
  let reports = [...(normalized.relations.reports || [])]; let cases = [...(normalized.relations.cases || [])]; let caseEvents = [...(normalized.relations.caseEvents || [])]; let leaseEvents = [...normalized.relations.leaseEvents];
  const created = []; const reused = [];
  for (const lease of normalized.relations.leases.filter((item) => ["active", "ending"].includes(item.status))) {
    const dueDate = lease.plannedDeliveryDate || lease.endDate;
    const lead = Number(options.leadDays ?? normalized.relations.leaseSettings[0]?.deliveryCaseLeadDays ?? 120);
    if (!dueDate) continue;
    const remainingDays = daysUntil(dueDate, today);
    for (const threshold of lease.warningDays || normalized.relations.leaseSettings[0]?.warningDays || []) {
      const reminderKey = `${lease.id}:${dueDate}:${threshold}`;
      if (remainingDays <= threshold && !leaseEvents.some((event) => event.reminderKey === reminderKey)) {
        leaseEvents.push({ id: `lease-event-${uid()}`, tenantId: normalized.tenantId, leaseId: lease.id, unitId: lease.unitId, at, actorId: null, actorName: "Leasingautomatik", type: "delivery_reminder", reminderKey, title: `${threshold}-dages varsel`, text: `Aflevering ${dueDate}. Varslet er knyttet til samme leasingforekomst.` });
      }
    }
    if (remainingDays > lead) continue;
    const occurrenceKey = `${lease.id}:${dueDate}`;
    const existing = deliveryCases.find((item) => item.occurrenceKey === occurrenceKey);
    if (existing) { reused.push(existing); continue; }
    const unit = normalized.units.find((item) => item.id === lease.unitId);
    if (!unit) continue;
    const reference = nextReadableReference({ ...normalized, relations: { ...normalized.relations, cases } }, "VYR", { now: at });
    const orderReference = nextWorkshopOrderReference({ ...normalized, relations: { ...normalized.relations, cases, leaseDeliveryCases: deliveryCases } }, at);
    const records = createReportRecords({ ...normalized, relations: { ...normalized.relations, reports, cases } }, { unitId: unit.id, type: "service", category: "Leasingaflevering", severity: "moderate", title: `${unit.number} – Klargøring og aflevering af leasingbil`, description: `Forbered fysisk aflevering af ${unit.number} under aftale ${lease.agreementNumber}.`, usability: "usable", images: [], media: [], reference, submissionKey: `lease:${occurrenceKey}`, reporter: { id: null, name: "Leasingautomatik" } }, { id: options.idFactory?.("report", lease) || uid(), now: at });
    const report = { ...records.report, reference, origin: "lease_automation", originLabel: "Automatisk oprettet fra Leasing", reporterId: null, reporterName: null, leaseId: lease.id, leaseDeliveryOccurrenceKey: occurrenceKey };
    const caseItem = { ...records.caseItem, reference, title: report.title, description: report.description, origin: "lease_automation", originLabel: "Automatisk oprettet fra Leasing", leaseId: lease.id, leaseDeliveryOccurrenceKey: occurrenceKey, orderReference, dueDate, nextAction: "Planlæg og gennemfør leasingaflevering", invoiceResolution: "pending", expectedInvoiceCount: 1 };
    const delivery = { id: `lease-delivery-${options.idFactory?.("delivery", lease) || uid()}`, tenantId: normalized.tenantId, occurrenceKey, leaseId: lease.id, unitId: unit.id, reportId: report.id, caseId: caseItem.id, reference, orderReference, dueDate, status: "preparing", physicalDeliveryStatus: "planned", settlementStatus: "pending", checklist: { booking: false, damageReview: false, photos: false, equipment: false, finalMeter: false, receipt: false }, finalMeter: null, actualDeliveryDate: null, receiptDocumentId: null, createdAt: at, updatedAt: at };
    const event = { ...records.event, actorId: null, actorName: "Leasingautomatik", type: "lease_automation", title: "Automatisk oprettet fra Leasing", text: `${report.number}, ${caseItem.number} og ${orderReference} blev oprettet atomisk. Ingen mail er sendt.`, leaseId: lease.id };
    reports.push(report); cases.push(caseItem); caseEvents.push(event); deliveryCases.push(delivery);
    normalized = { ...normalized, relations: { ...normalized.relations, documents: (normalized.relations.documents || []).map((document) => document.relations?.some((link) => link.type === "lease" && link.targetId === lease.id) && !document.relations.some((link) => link.type === "case" && link.targetId === caseItem.id) ? { ...document, relations: [...document.relations, { id: `document-link-${uid()}`, type: "case", targetId: caseItem.id, addedAt: at }] } : document) } };
    leaseEvents.push({ id: `lease-event-${uid()}`, tenantId: normalized.tenantId, leaseId: lease.id, unitId: unit.id, caseId: caseItem.id, reportId: report.id, at, actorId: null, actorName: "Leasingautomatik", type: "delivery_case_created", title: "Afleveringssag oprettet", text: `${reference} · ${orderReference}` });
    created.push({ delivery, report, caseItem });
  }
  const settings = { ...normalized.relations.leaseSettings[0], lastAutomationRunAt: at, lastAutomationCreated: created.length };
  normalized = { ...normalized, relations: { ...normalized.relations, reports, cases, caseEvents, leaseDeliveryCases: deliveryCases, leaseEvents, leaseSettings: [settings] } };
  return { dataset: normalized, created, reused, settings };
}

export function applyLeaseDeliveryUpdate(dataset, deliveryId, input, actor, options = {}) {
  const normalized = ensureLeasingRegistry(dataset); const at = isoNow(options);
  const deliveries = [...normalized.relations.leaseDeliveryCases]; const index = deliveries.findIndex((item) => item.id === deliveryId);
  if (index < 0) throw new Error("Afleveringssagen findes ikke.");
  const current = deliveries[index]; const lease = normalized.relations.leases.find((item) => item.id === current.leaseId);
  const actualDeliveryDate = input.actualDeliveryDate === undefined ? current.actualDeliveryDate : input.actualDeliveryDate || null;
  if (actualDeliveryDate && !input.confirmPhysicalDelivery && !current.actualDeliveryDate) throw new Error("Bekræft den fysiske aflevering.");
  const finalMeter = input.finalMeter === "" || input.finalMeter == null ? current.finalMeter : Number(String(input.finalMeter).replace(",", "."));
  if (finalMeter != null && (!Number.isFinite(finalMeter) || finalMeter < 0)) throw new Error("Den endelige målerstand er ugyldig.");
  const mailDraft = input.mailDraft === undefined ? current.mailDraft || null : {
    id: current.mailDraft?.id || `lease-mail-${uid()}`,
    state: "draft",
    recipient: input.mailDraft.recipient?.trim() || "",
    subject: input.mailDraft.subject?.trim() || "",
    body: input.mailDraft.body?.trim() || "",
    documentIds: [...new Set(input.mailDraft.documentIds || [])],
    version: (current.mailDraft?.version || 0) + 1,
    updatedAt: at,
  };
  const next = { ...current, checklist: { ...current.checklist, ...(input.checklist || {}) }, bookingAt: input.bookingAt === undefined ? current.bookingAt : input.bookingAt || null, finalMeter, actualDeliveryDate, receiptDocumentId: input.receiptDocumentId === undefined ? current.receiptDocumentId : input.receiptDocumentId || null, mailDraft, physicalDeliveryStatus: actualDeliveryDate ? "delivered" : current.physicalDeliveryStatus, status: actualDeliveryDate ? "awaiting_settlement" : current.status, updatedAt: at };
  deliveries[index] = next;
  const leases = normalized.relations.leases.map((item) => item.id === lease.id && actualDeliveryDate ? { ...item, status: "delivered", actualDeliveryDate, updatedAt: at } : item);
  const units = normalized.units.map((item) => item.id === current.unitId && actualDeliveryDate ? { ...item, status: "inactive", updatedAt: at } : item);
  let meterObservations = normalized.relations.meterObservations;
  if (actualDeliveryDate && finalMeter != null && !meterObservations.some((item) => item.sourceKey === `lease-delivery:${deliveryId}`)) meterObservations = [...meterObservations, { id: `meter-delivery-${uid()}`, tenantId: normalized.tenantId, unitId: current.unitId, value: finalMeter, unit: "km", observedAt: `${actualDeliveryDate}T12:00:00.000Z`, receivedAt: at, source: "lease_delivery", sourceKey: `lease-delivery:${deliveryId}`, demo: false }];
  const eventType = actualDeliveryDate ? "physical_delivery" : input.mailDraft ? "lease_mail_draft_saved" : "delivery_updated";
  const event = { id: `lease-event-${uid()}`, tenantId: normalized.tenantId, leaseId: current.leaseId, deliveryId, caseId: current.caseId, unitId: current.unitId, at, actorId: actor?.id || "demo-local", actorName: actor?.name || "Lokal demo-bruger", type: eventType, title: actualDeliveryDate ? "Enheden er fysisk afleveret" : input.mailDraft ? "Mailudkast gemt" : "Afleveringsforløb opdateret", text: actualDeliveryDate ? "Enheden er markeret afleveret/inaktiv. Sagen afventer fortsat slutafregning." : input.mailDraft ? `Kladdeversion ${mailDraft.version} er gemt lokalt. Ingen mail er sendt.` : "Tjekliste og booking er opdateret." };
  return { dataset: { ...normalized, units, relations: { ...normalized.relations, leases, meterObservations, leaseDeliveryCases: deliveries, leaseEvents: [...normalized.relations.leaseEvents, event], caseEvents: [...(normalized.relations.caseEvents || []), event] } }, delivery: next, event };
}

export const SYNTHETIC_CONTRACT_DOCUMENT_ID = "document-lease-demo-contract";

export function contractExtractionProposal(document) {
  if (document?.id !== SYNTHETIC_CONTRACT_DOCUMENT_ID || document.origin !== "lease_demo_fixture") return { connected: false, demo: false, message: "Automatisk aflæsning er ikke tilsluttet for brugerens egne filer.", fields: [] };
  return { connected: false, demo: true, message: "Demonstration af kontraktaflæsning · syntetisk kontrakt", fields: [
    { key: "agreementNumber", label: "Aftalenummer", value: "LS-2024-018", page: 1, excerpt: "Leasingaftale nr. LS-2024-018", state: "found" },
    { key: "recurringAmount", label: "Månedlig ydelse", value: "4250", display: "4.250 kr. ekskl. moms", page: 2, excerpt: "Månedlig leasingydelse 4.250 kr. ekskl. moms", state: "found" },
    { key: "includedKm", label: "Inkluderede kilometer", value: "120000", display: "120.000 km · hele perioden", page: 3, excerpt: "Aftalen omfatter 120.000 km i hele leasingperioden", state: "found" },
    { key: "maintenance", label: "Service og vedligeholdelse", value: "included", display: "Inkluderet", page: 3, excerpt: "Service og vedligeholdelse er inkluderet", state: "found" },
    { key: "tyres", label: "Dæk", value: "excluded", display: "Ikke inkluderet", page: 3, excerpt: "Dæk er ikke inkluderet", state: "found" },
    { key: "roadside", label: "Vejhjælp", value: "unresolved", display: "Uafklaret / ikke fundet", page: null, excerpt: "Ikke fundet i det syntetiske dokument", state: "not_found" },
    { key: "earlyReturnFee", label: "Tidlig aflevering", value: "", display: "Kræver manuel afklaring", page: 6, excerpt: "Tidlig aflevering kræver særskilt skriftlig aftale", state: "conflict" },
  ] };
}

export function applyContractReviewSave(dataset, leaseId, input, actor, options = {}) {
  const normalized = ensureLeasingRegistry(dataset); const lease = normalized.relations.leases.find((item) => item.id === leaseId);
  if (!lease) throw new Error("Leasingaftalen findes ikke.");
  const document = normalized.relations.documents.find((item) => item.id === input.documentId);
  if (!document) throw new Error("Dokumentet findes ikke.");
  const proposal = contractExtractionProposal(document); const at = isoNow(options);
  const review = { id: input.id || `lease-review-${uid()}`, tenantId: normalized.tenantId, leaseId, documentId: document.id, documentVersionId: document.currentVersionId, status: input.apply ? "applied" : "draft", selectedKeys: input.selectedKeys || [], manualValues: input.manualValues || {}, proposal: clone(proposal), createdAt: at, updatedAt: at, actorId: actor?.id || "demo-local" };
  let leases = normalized.relations.leases; let appliedLease = lease;
  if (input.apply) {
    const allowed = new Map(proposal.fields.map((field) => [field.key, field]));
    const patch = {};
    for (const key of review.selectedKeys) { const field = allowed.get(key); if (field && field.state !== "not_found") patch[key] = review.manualValues[key] ?? field.value; }
    appliedLease = { ...lease, agreementNumber: patch.agreementNumber || lease.agreementNumber, payment: { ...lease.payment, recurringMinor: patch.recurringAmount ? parseMinor(patch.recurringAmount) : lease.payment.recurringMinor }, mileage: { ...lease.mileage, includedKm: patch.includedKm ? positiveOrNull(patch.includedKm) : lease.mileage.includedKm }, services: { ...lease.services, maintenance: patch.maintenance || lease.services.maintenance, tyres: patch.tyres || lease.services.tyres, roadside: patch.roadside || lease.services.roadside }, updatedAt: at };
    leases = normalized.relations.leases.map((item) => item.id === leaseId ? appliedLease : item);
  }
  const reviews = [...normalized.relations.leaseContractReviews.filter((item) => item.id !== review.id), review];
  const event = { id: `lease-event-${uid()}`, tenantId: normalized.tenantId, leaseId, unitId: lease.unitId, at, actorId: actor?.id || "demo-local", actorName: actor?.name || "Lokal demo-bruger", type: input.apply ? "contract_fields_applied" : "contract_review_draft", title: input.apply ? "Valgte kontraktoplysninger anvendt" : "Kontraktgennemgang gemt som kladde", text: `${review.selectedKeys.length} felt(er) er ${input.apply ? "anvendt efter eksplicit valg" : "gemt til senere gennemgang"}.` };
  return { dataset: { ...normalized, relations: { ...normalized.relations, leases, leaseContractReviews: reviews, leaseEvents: [...normalized.relations.leaseEvents, event] } }, lease: appliedLease, review, event };
}

export function leaseSummary(lease, units, observations, options = {}) {
  const unit = units.find((item) => item.id === lease.unitId);
  const projection = calculateLeaseProjection(lease, observations, options);
  return { lease, unit, projection, remainingKm: projection.remainingKm ?? null, currency: lease.payment?.currency || null };
}
