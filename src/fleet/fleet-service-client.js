/*
 * Den autentificerede klientgrænse til FLEET-service.
 *
 * Serverens danske feltnavne er autoritative. FLEET v2 bruger fortsat sit
 * præsentationsformat internt; mapperne her er den eneste overgang mellem de
 * to modeller. Der findes bevidst ingen IndexedDB-fallback ved kaldfejl.
 */
import { resolveUnitType } from "../../fleet-v2/src/data/unitTypeRegistry.js";
const valueOf = (response) => response?.data ?? response ?? null;
const requestId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`.slice(0, 80);

const integerOrNull = (value) => value === "" || value == null
  ? null : (Number.isSafeInteger(Number(value)) ? Number(value) : null);

const SHARED_TO_FLEET_STATUS = Object.freeze({
  aktiv: "operation",
  vaerksted: "workshop",
  udeAfDrift: "action",
  solgt: "inactive",
  skrottet: "inactive",
});

const meterSnapshot = (unit = {}) => ({
  type: unit.meterType === "hours" ? "hours" : "km",
  value: Number(unit.meter),
});

const sameMeter = (left, right) => left.type === right.type && left.value === right.value;

export class FleetUnitConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "FleetUnitConflictError";
    this.code = "fleet/unit-conflict";
  }
}

/**
 * Samler loading/fejl for hele den autoritative serviceprojektion. Alle seks
 * lister tæller, også når deres færdige resultat fortsat er en tom liste.
 * Ellers kan React-memoisering fastholde `loading: true`, fordi `[]` før og
 * efter hentningen har samme serialiserede payload.
 */
export function fleetServiceProjectionState(service = {}) {
  const projections = [
    service.units,
    service.requirements,
    service.occurrences,
    service.reports,
    service.cases,
    service.history,
  ];
  return {
    loading: projections.some((projection) => Boolean(projection?.henter)),
    error: projections.find((projection) => projection?.fejl)?.fejl || null,
  };
}

export function mapSharedUnitToFleet(unit = {}, resourceTypes = []) {
  const profile = unit.fleetProfil || {};
  const resolvedType = resolveUnitType(unit, resourceTypes);
  const type = unit.art === "scooter" ? "scooter"
    : ["truck", "maskine", "udstyr"].includes(unit.art) ? "machine" : "vehicle";
  const status = SHARED_TO_FLEET_STATUS[unit.status] || "operation";
  const hasHours = Number.isFinite(unit.driftstimer);
  const hasKilometres = Number.isFinite(unit.kmStand);
  const meterType = hasHours && !hasKilometres ? "hours"
    : hasKilometres ? "km"
      : profile.meterType === "hours" ? "hours" : "km";
  const sharedMeter = meterType === "hours" ? unit.driftstimer : unit.kmStand;
  return {
    id: unit.id,
    tenantId: unit.tenantId,
    number: profile.number || unit.kaldenavn || unit.registrering || unit.id,
    type: profile.type || type,
    make: profile.make || unit.maerke || "",
    model: profile.model || unit.model || unit.navn || "Model ikke oplyst",
    department: profile.department || unit.hjemsted || "Ikke oplyst",
    meterType,
    // kmStand/driftstimer er den fælles, autoritative måler. Profilfeltet er
    // kun en bagudkompatibel projektion for poster fra før fællesregisteret.
    meter: sharedMeter ?? profile.meter ?? null,
    status,
    registration: unit.registrering || null,
    serialNumber: profile.serialNumber || unit.stelnummer || unit.serienummer || null,
    year: profile.year ?? unit.aargang ?? null,
    nextServiceDate: Number.isFinite(unit.naesteServiceMs)
      ? new Date(unit.naesteServiceMs).toISOString().slice(0, 10) : null,
    nextServiceMeter: unit.naesteServiceKm ?? null,
    vehicleDetails: profile.vehicleDetails || {},
    dimensions: profile.dimensions || null,
    interiorDimensions: profile.interiorDimensions || null,
    equipment: profile.equipment || {},
    notes: profile.notes || "",
    updatedAt: profile.updatedAt || null,
    energy: profile.vehicleDetails?.fuel || unit.drivmiddel || unit.energikilde || null,
    sharedArt: unit.art || null,
    categoryId: unit.kategoriId || null,
    categoryName: resolvedType.name,
    categoryActive: resolvedType.selected?.aktiv !== false,
    unitTypeConflict: resolvedType.conflict,
    obdHardwareId: unit.obdHardwareId || null,
    source: "shared-unit-register",
  };
}

/**
 * Projekterer kun en position, når det fælles enhedsregister faktisk bærer
 * gyldige koordinater og et gyldigt måletidspunkt. Dermed får den integrerede
 * FLEET-visning samme stabile enheds-id som stamdataene uden at gætte en
 * position for enheder, der ikke har positionsdata.
 */
export function mapSharedUnitPositionToFleet(unit = {}) {
  const position = unit.fleetLivePosition;
  const latitude = Number(position?.latitude);
  const longitude = Number(position?.longitude);
  const measuredAt = position?.measuredAt || position?.updatedAt || null;
  if (!unit.id || !position
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(Date.parse(measuredAt))) return null;

  const numericOrNull = (value) => value === "" || value == null || !Number.isFinite(Number(value))
    ? null : Number(value);
  const heading = numericOrNull(position.heading);
  return {
    id: position.id || `position-${unit.id}`,
    tenantId: unit.tenantId,
    unitId: unit.id,
    latitude,
    longitude,
    label: String(position.label || "Position uden adresse").trim(),
    measuredAt,
    receivedAt: position.receivedAt || measuredAt,
    lastContactAt: position.lastContactAt || position.receivedAt || measuredAt,
    movementState: ["moving", "stationary", "unknown"].includes(position.movementState)
      ? position.movementState : "unknown",
    connectionStatus: ["online", "degraded", "offline", "unknown"].includes(position.connectionStatus)
      ? position.connectionStatus : "unknown",
    accuracyMeters: numericOrNull(position.accuracyMeters),
    speedKph: numericOrNull(position.speedKph),
    heading,
    source: position.source || "shared-unit-register",
    alarms: Array.isArray(position.alarms) ? position.alarms : [],
    demo: position.demo === true,
  };
}

const sharedArtFor = (unit, current) => {
  if (unit.sharedArt) return unit.sharedArt;
  if (current?.art) return current.art;
  if (unit.type === "scooter") return "scooter";
  if (unit.type === "machine") return "truck";
  if (unit.type === "equipment") return "trailer";
  return "varevogn";
};

const sharedStatusFor = (unit, current) => {
  if (unit.status === "workshop") return "vaerksted";
  if (unit.status === "action") return "udeAfDrift";
  if (unit.status === "offline") {
    throw new Error("Offline er en forbindelsestilstand og kan ikke gemmes som enhedens driftsstatus.");
  }
  if (unit.status === "inactive") {
    return ["solgt", "skrottet"].includes(current?.status) ? current.status : "solgt";
  }
  return "aktiv";
};

function resolvedEditableState(unit, current, openedUnit) {
  if (!openedUnit) return { meter: meterSnapshot(unit), status: unit.status };
  if (!current) throw new FleetUnitConflictError("Enheden findes ikke længere. Formularen er bevaret; genindlæs før du prøver igen.");

  const openedMeter = meterSnapshot(openedUnit);
  const inputMeter = meterSnapshot(unit);
  const currentFleet = mapSharedUnitToFleet(current);
  const currentMeter = meterSnapshot(currentFleet);
  const userChangedMeter = !sameMeter(inputMeter, openedMeter);
  const serverChangedMeter = !sameMeter(currentMeter, openedMeter);
  if (userChangedMeter && serverChangedMeter && !sameMeter(inputMeter, currentMeter)) {
    throw new FleetUnitConflictError(
      `Målerstanden er siden ændret til ${currentMeter.value} ${currentMeter.type === "hours" ? "timer" : "km"}. `
      + "Din øvrige tekst er bevaret; genindlæs enheden og foretag målerændringen igen.",
    );
  }

  const userChangedStatus = unit.status !== openedUnit.status;
  const serverChangedStatus = currentFleet.status !== openedUnit.status;
  if (userChangedStatus && serverChangedStatus && unit.status !== currentFleet.status) {
    throw new FleetUnitConflictError(
      "Driftsstatus er ændret af en anden bruger. Din øvrige tekst er bevaret; genindlæs enheden og vælg status igen.",
    );
  }
  return {
    meter: userChangedMeter ? inputMeter : currentMeter,
    status: userChangedStatus ? unit.status : currentFleet.status,
  };
}

/**
 * Skriveadapteren til det fælles enhedsregister. Den returnerer hele posten,
 * så eksisterende servicepunkter og andre autoritative felter bevares ved en
 * redigering. Browserens Blob-billede er med vilje ikke en del af RTDB-posten;
 * en permanent billedkilde kræver Storage-adapteren.
 */
export function mapFleetUnitToShared(unit = {}, current = {}, { openedUnit = null } = {}) {
  if (!unit.id) throw new Error("Enheden mangler et stabilt id.");
  const existing = { ...(current || {}) };
  delete existing.id;
  delete existing.tenantId;
  const editable = resolvedEditableState(unit, current, openedUnit);
  const meterType = editable.meter.type;
  const meter = editable.meter.value;
  const profile = {
    schemaVersion: 1,
    number: unit.number,
    type: unit.type,
    make: unit.make,
    model: unit.model,
    department: unit.department,
    meterType,
    meter,
    serialNumber: unit.serialNumber || null,
    year: unit.year ?? null,
    vehicleDetails: unit.vehicleDetails || {},
    dimensions: unit.dimensions || null,
    interiorDimensions: unit.interiorDimensions || null,
    equipment: unit.equipment || {},
    notes: unit.notes || "",
    updatedAt: unit.updatedAt || new Date().toISOString(),
  };
  const next = {
    ...existing,
    art: sharedArtFor(unit, current),
    status: sharedStatusFor({ ...unit, status: editable.status }, current),
    kaldenavn: unit.number,
    navn: [unit.make, unit.model].filter(Boolean).join(" ") || unit.number,
    hjemsted: unit.department,
    fleetProfil: profile,
  };
  if (unit.categoryId) next.kategoriId = unit.categoryId;
  else delete next.kategoriId;
  if (unit.registration) next.registrering = unit.registration;
  else delete next.registrering;
  if (meterType === "hours") {
    next.driftstimer = meter;
    delete next.kmStand;
  } else {
    next.kmStand = meter;
    delete next.driftstimer;
  }
  return next;
}

export function mapServerRequirementToFleet(requirement = {}) {
  return {
    id: requirement.id,
    unitId: requirement.enhedId,
    title: requirement.titel,
    description: requirement.beskrivelse || "",
    category: requirement.kategori || "maintenance",
    fixedDueDate: requirement.naesteDato || null,
    intervalMonths: requirement.intervalMaaneder ?? null,
    intervalMeter: requirement.intervalMaeler ?? null,
    meterUnit: requirement.maalerEnhed === "timer" ? "hours" : "km",
    baselineDate: requirement.sidsteServiceDato || null,
    baselineMeter: requirement.sidsteServiceMaaler ?? null,
    warningDays: requirement.varselDage ?? 0,
    warningMeter: requirement.varselMaaler ?? null,
    responsibleId: requirement.ansvarligId || null,
    vendorId: requirement.leverandoerId || null,
    vendorContact: requirement.leverandoerKontakt || "",
    equipmentLabel: requirement.udstyrLabel || "",
    instructions: requirement.instruktioner || "",
    documentIds: requirement.dokumentIder || [],
    notes: requirement.noter || "",
    annualMonth: requirement.aarligMaaned ?? null,
    annualDay: requirement.aarligDag ?? null,
    active: requirement.aktiv !== false,
    activeOccurrenceId: requirement.aktivForekomstId || null,
    revision: Number(requirement.revision || 0),
    createdAt: requirement.oprettetMs ? new Date(requirement.oprettetMs).toISOString() : null,
    updatedAt: requirement.opdateretMs ? new Date(requirement.opdateretMs).toISOString() : null,
    source: "server",
  };
}

export function mapServerOccurrenceToFleet(occurrence = {}) {
  const status = occurrence.status === "gennemfoert" ? "completed"
    : occurrence.status === "varslet" ? "alerted" : occurrence.status;
  return {
    id: occurrence.id,
    key: occurrence.cyklusNoegle,
    requirementId: occurrence.servicekravId,
    unitId: occurrence.enhedId,
    reportId: occurrence.indberetningId || null,
    caseId: occurrence.sagId || null,
    dueDate: occurrence.forfaldsdato || null,
    dueMeter: occurrence.forfaldsMaeler ?? null,
    status,
    origin: "service_automation",
    createdAt: occurrence.varsletMs ? new Date(occurrence.varsletMs).toISOString() : null,
    updatedAt: occurrence.opdateretMs ? new Date(occurrence.opdateretMs).toISOString() : null,
  };
}

const serverCaseStatus = (status) => ({
  ny: "new",
  vurdering: "assessing",
  afventer: "waiting",
  klar: "ready",
  vaerksted: "workshop",
  fakturaafklaring: "invoice_pending",
  klar_til_lukning: "ready_to_close",
  afsluttet: "completed",
  afvist: "rejected",
}[status] || "new");

const serverPriority = (priority) => ({ lav: "low", normal: "normal", hoej: "high", kritisk: "critical" }[priority] || "normal");
const isoFromMs = (value) => Number.isFinite(Number(value)) ? new Date(Number(value)).toISOString() : null;

/**
 * Læseprojektioner til de almindelige FLEET-visninger. Server-ID'et bevares som
 * identitet; readOnly forhindrer, at IndexedDB-prototypen bliver en konkurrerende
 * skrivekilde. Et automatisk servicevarsel tager ikke stilling til enhedens
 * anvendelighed, derfor vises den ærligt som "skal vurderes".
 */
export function mapServerReportToFleet(report = {}) {
  const priority = serverPriority(report.prioritet);
  return {
    id: report.id,
    number: report.nummer || report.id,
    reference: report.reference || report.sagId || report.id,
    caseId: report.sagId || null,
    unitId: report.enhedId,
    type: "service",
    category: report.kategoriId || "service",
    title: report.titel || "Automatisk servicevarsel",
    description: report.beskrivelse || "Automatisk oprettet fra et aktivt servicekrav.",
    severity: report.alvorlighed || (priority === "high" || priority === "critical" ? "high" : "moderate"),
    usability: report.anvendelighed || "uncertain",
    reporterId: "serviceautomatik",
    reporterName: "Serviceautomatik",
    meterObservation: report.forfaldsMaeler == null ? null : {
      value: report.forfaldsMaeler,
      unit: report.maalerEnhed === "timer" ? "hours" : "km",
    },
    images: [],
    media: [],
    createdAt: isoFromMs(report.oprettetMs),
    updatedAt: isoFromMs(report.opdateretMs || report.oprettetMs),
    origin: "service_automation",
    source: "server",
    readOnly: true,
  };
}

export function mapServerCaseToFleet(caseItem = {}) {
  const status = serverCaseStatus(caseItem.status);
  const createdAt = isoFromMs(caseItem.oprettetMs);
  return {
    id: caseItem.id,
    number: caseItem.nummer || caseItem.id,
    reference: caseItem.reference || caseItem.id,
    reportId: caseItem.indberetningId || null,
    unitId: caseItem.enhedId,
    title: caseItem.titel || "Automatisk servicevarsel",
    description: caseItem.beskrivelse || "",
    status,
    priority: serverPriority(caseItem.prioritet),
    nextAction: caseItem.naesteHandling || "Vurder automatisk servicevarsel",
    assigneeId: caseItem.ansvarligId || null,
    dueDate: caseItem.forfaldsdato || null,
    closureStatus: status === "completed" || status === "rejected" ? "closed" : "open",
    invoiceResolution: status === "invoice_pending" ? "pending" : "disconnected",
    expectedInvoiceCount: status === "invoice_pending" ? 1 : 0,
    createdAt,
    updatedAt: isoFromMs(caseItem.opdateretMs) || createdAt,
    origin: "service_automation",
    source: "server",
    readOnly: true,
  };
}

export function mapServerServiceHistoryToFleet(entry = {}) {
  const completed = entry.handling === "service_gennemfoert";
  return {
    id: entry.id,
    caseId: entry.sagId || null,
    reportId: entry.indberetningId || null,
    type: completed ? "service_completed" : "service_alert_created",
    title: completed ? "Service gennemført" : "Servicevarsel oprettet",
    text: completed
      ? `Gennemført ${entry.dato || "uden oplyst dato"}${entry.maaler == null ? "" : ` · måler ${entry.maaler.toLocaleString("da-DK")}`}`
      : "Serverautomatikken oprettede indberetning og sag én gang for servicecyklussen.",
    actorId: entry.aktor || "serviceautomatik",
    actorName: entry.aktor === "serviceautomatik" ? "Serviceautomatik" : (entry.aktor || "Server"),
    at: isoFromMs(entry.tidspunktMs),
    source: "server",
    readOnly: true,
  };
}

export function requirementInputToServer(input = {}, unit = {}) {
  return {
    titel: String(input.title || "").trim(),
    enhedId: input.unitId,
    aktiv: input.active !== false,
    maalerEnhed: unit.meterType === "hours" ? "timer" : "km",
    intervalMaaneder: integerOrNull(input.intervalMonths),
    intervalMaeler: integerOrNull(input.intervalMeter),
    varselDage: integerOrNull(input.warningDays) ?? 0,
    varselMaeler: integerOrNull(input.warningMeter) ?? 0,
    sidsteServiceDato: input.baselineDate || null,
    sidsteServiceMaaler: integerOrNull(input.baselineMeter),
    naesteDato: input.firstDueDate || input.fixedDueDate || null,
    naesteMaaler: null,
    beskrivelse: String(input.description || "").trim() || null,
    kategori: input.category || "maintenance",
    aarligMaaned: integerOrNull(input.annualMonth),
    aarligDag: integerOrNull(input.annualDay),
    ansvarligId: input.responsibleId || null,
    leverandoerId: input.vendorId || null,
    leverandoerKontakt: String(input.vendorContact || "").trim() || null,
    udstyrLabel: String(input.equipmentLabel || "").trim() || null,
    instruktioner: String(input.instructions || "").trim() || null,
    dokumentIder: [...new Set(input.documentIds || [])],
    noter: String(input.notes || "").trim() || null,
  };
}

function readableError(error, fallback) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return new Error(error?.message || "Du har ikke adgang til at ændre servicekrav.");
  if (code.includes("aborted")) return new Error(error?.message || "Servicekravet blev ændret af en anden. Genindlæs og prøv igen.");
  if (code.includes("invalid-argument") || code.includes("failed-precondition") || code.includes("not-found")) {
    return new Error(error?.message || fallback);
  }
  return new Error("Der er ikke forbindelse til FLEETs serverlagring. Intet blev gemt lokalt.");
}

export function createFleetServiceClient({ call } = {}) {
  const execute = call || (async (name, payload) => {
    const { kaldFunktion } = await import("../firebase.js");
    return kaldFunktion(name, payload);
  });
  const invoke = async (name, payload, fallback) => {
    try { return valueOf(await execute(name, payload)); }
    catch (error) { throw readableError(error, fallback); }
  };
  return {
    async saveRequirement(input, units, current) {
      const unit = units.find((item) => item.id === input.unitId);
      if (!unit) throw new Error("Den valgte enhed findes ikke i den fælles enhedsstamme.");
      return invoke("fleetServiceKravGem", {
        id: input.id || undefined,
        mutationId: requestId("fleet-servicekrav"),
        forventetRevision: Number(current?.revision || 0),
        krav: requirementInputToServer(input, unit),
        ...(current?.activeOccurrenceId && input.active === false && input.keepOpenOccurrence
          ? { aabenForekomstHandling: "bevar" } : {}),
      }, "Servicekravet kunne ikke gemmes.");
    },
    async runAutomation() {
      const result = await invoke("fleetServiceKontrolNu", {}, "Servicekontrollen kunne ikke køres.");
      return {
        created: result?.resultater || [],
        reused: Array.from({ length: Number(result?.genbrugt || 0) }),
        skipped: Array.from({ length: Number(result?.sprungetOver || 0) }),
      };
    },
    async completeOccurrence({ occurrenceId, date, meter }) {
      return invoke("fleetServiceGennemfoer", {
        forekomstId: occurrenceId,
        dato: date,
        maaler: integerOrNull(meter),
      }, "Servicegennemførelsen kunne ikke registreres.");
    },
  };
}
