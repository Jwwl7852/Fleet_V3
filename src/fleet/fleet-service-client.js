/*
 * Den autentificerede klientgrænse til FLEET-service.
 *
 * Serverens danske feltnavne er autoritative. FLEET v2 bruger fortsat sit
 * præsentationsformat internt; mapperne her er den eneste overgang mellem de
 * to modeller. Der findes bevidst ingen IndexedDB-fallback ved kaldfejl.
 */
const valueOf = (response) => response?.data ?? response ?? null;
const requestId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`.slice(0, 80);

const integerOrNull = (value) => value === "" || value == null
  ? null : (Number.isSafeInteger(Number(value)) ? Number(value) : null);

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

export function mapSharedUnitToFleet(unit = {}) {
  const profile = unit.fleetProfil || {};
  const type = unit.art === "scooter" ? "scooter"
    : ["truck", "maskine", "udstyr"].includes(unit.art) ? "machine" : "vehicle";
  const status = unit.status === "vaerksted" ? "workshop"
    : ["solgt", "skrottet", "inaktiv"].includes(unit.status) ? "inactive" : "operation";
  const meterType = Number.isFinite(unit.driftstimer) && !Number.isFinite(unit.kmStand)
    ? "hours" : "km";
  return {
    id: unit.id,
    tenantId: unit.tenantId,
    number: profile.number || unit.kaldenavn || unit.registrering || unit.id,
    type: profile.type || type,
    make: profile.make || unit.maerke || "",
    model: profile.model || unit.model || unit.navn || "Model ikke oplyst",
    department: profile.department || unit.hjemsted || "Ikke oplyst",
    meterType: profile.meterType || meterType,
    meter: profile.meter ?? (meterType === "hours" ? (unit.driftstimer ?? null) : (unit.kmStand ?? null)),
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
    source: "shared-unit-register",
  };
}

const sharedArtFor = (unit, current) => {
  if (current?.art) return current.art;
  if (unit.type === "scooter") return "scooter";
  if (unit.type === "machine") return "truck";
  if (unit.type === "equipment") return "trailer";
  return "varevogn";
};

const sharedStatusFor = (unit, current) => {
  if (unit.status === "workshop") return "vaerksted";
  if (["action", "offline"].includes(unit.status)) return "udeAfDrift";
  if (unit.status === "inactive") {
    return ["solgt", "skrottet"].includes(current?.status) ? current.status : "solgt";
  }
  return "aktiv";
};

/**
 * Skriveadapteren til det fælles enhedsregister. Den returnerer hele posten,
 * så eksisterende servicepunkter og andre autoritative felter bevares ved en
 * redigering. Browserens Blob-billede er med vilje ikke en del af RTDB-posten;
 * en permanent billedkilde kræver Storage-adapteren.
 */
export function mapFleetUnitToShared(unit = {}, current = {}) {
  if (!unit.id) throw new Error("Enheden mangler et stabilt id.");
  const existing = { ...(current || {}) };
  delete existing.id;
  delete existing.tenantId;
  const meterType = unit.meterType === "hours" ? "hours" : "km";
  const profile = {
    schemaVersion: 1,
    number: unit.number,
    type: unit.type,
    make: unit.make,
    model: unit.model,
    department: unit.department,
    meterType,
    meter: Number(unit.meter),
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
    status: sharedStatusFor(unit, current),
    kaldenavn: unit.number,
    navn: [unit.make, unit.model].filter(Boolean).join(" ") || unit.number,
    hjemsted: unit.department,
    fleetProfil: profile,
  };
  if (unit.registration) next.registrering = unit.registration;
  else delete next.registrering;
  if (meterType === "hours") {
    next.driftstimer = Number(unit.meter);
    delete next.kmStand;
  } else {
    next.kmStand = Number(unit.meter);
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
