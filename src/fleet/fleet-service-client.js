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

export function mapSharedUnitToFleet(unit = {}) {
  const type = unit.art === "scooter" ? "scooter"
    : ["truck", "maskine", "udstyr"].includes(unit.art) ? "machine" : "vehicle";
  const status = unit.status === "vaerksted" ? "workshop"
    : ["solgt", "skrottet", "inaktiv"].includes(unit.status) ? "inactive" : "operation";
  const meterType = Number.isFinite(unit.driftstimer) && !Number.isFinite(unit.kmStand)
    ? "hours" : "km";
  return {
    id: unit.id,
    tenantId: unit.tenantId,
    number: unit.kaldenavn || unit.registrering || unit.id,
    type,
    make: unit.maerke || "",
    model: unit.model || unit.navn || "Model ikke oplyst",
    department: unit.hjemsted || "Ikke oplyst",
    meterType,
    meter: meterType === "hours" ? (unit.driftstimer ?? null) : (unit.kmStand ?? null),
    status,
    registration: unit.registrering || null,
    serialNumber: unit.stelnummer || unit.serienummer || null,
    year: unit.aargang || null,
    nextServiceDate: Number.isFinite(unit.naesteServiceMs)
      ? new Date(unit.naesteServiceMs).toISOString().slice(0, 10) : null,
    nextServiceMeter: unit.naesteServiceKm ?? null,
    energy: unit.drivmiddel || unit.energikilde || null,
    source: "shared-unit-register",
  };
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
