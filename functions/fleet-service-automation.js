import { createHash } from "node:crypto";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const clone = (value) => structuredClone(value);
const integerOrNull = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isSafeInteger(Number(value)) ? Number(value) : null);
const shortText = (value, max = 160) => String(value || "").trim().slice(0, max);

function addMonths(date, months) {
  const source = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(source.getTime())) return null;
  const day = source.getUTCDate();
  source.setUTCDate(1);
  source.setUTCMonth(source.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
  source.setUTCDate(Math.min(day, lastDay));
  return source.toISOString().slice(0, 10);
}

function subtractDays(date, days) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function currentMeter(unit, meterUnit) {
  const candidates = meterUnit === "timer"
    ? [unit?.driftstimer, unit?.maalerstand]
    : [unit?.kilometer, unit?.km, unit?.maalerstand];
  return candidates.map(integerOrNull).find((value) => value != null && value >= 0) ?? null;
}

export function validateFleetServiceRequirement(input) {
  const errors = {};
  const title = shortText(input?.titel, 120);
  const unitId = shortText(input?.enhedId, 80);
  const meterUnit = input?.maalerEnhed === "timer" ? "timer" : "km";
  const intervalMonths = integerOrNull(input?.intervalMaaneder);
  const intervalMeter = integerOrNull(input?.intervalMaeler);
  const warningDays = integerOrNull(input?.varselDage) ?? 0;
  const warningMeter = integerOrNull(input?.varselMaeler) ?? 0;
  const lastDate = ISO_DATE.test(input?.sidsteServiceDato || "") ? input.sidsteServiceDato : null;
  const fixedDate = ISO_DATE.test(input?.naesteDato || "") ? input.naesteDato : null;
  const lastMeter = integerOrNull(input?.sidsteServiceMaaler);
  const nextMeter = integerOrNull(input?.naesteMaaler);

  if (!title) errors.titel = "Angiv servicekravets titel.";
  if (!unitId) errors.enhedId = "Vælg en enhed.";
  if (intervalMonths != null && (intervalMonths < 1 || intervalMonths > 120)) errors.intervalMaaneder = "Kalenderinterval skal være 1-120 måneder.";
  if (intervalMeter != null && (intervalMeter < 1 || intervalMeter > 10_000_000)) errors.intervalMaeler = "Målerintervallet er ugyldigt.";
  if (warningDays < 0 || warningDays > 730) errors.varselDage = "Datovarsel skal være 0-730 dage.";
  if (warningMeter < 0 || warningMeter > 1_000_000) errors.varselMaeler = "Målervarslet er ugyldigt.";
  if (!fixedDate && intervalMonths == null && intervalMeter == null && nextMeter == null) errors.interval = "Angiv en dato eller et kalender-/målerinterval.";
  if (intervalMonths != null && !fixedDate && !lastDate) errors.sidsteServiceDato = "Kalenderinterval kræver seneste servicedato eller en fast næste dato.";
  if (intervalMeter != null && nextMeter == null && lastMeter == null) errors.sidsteServiceMaaler = "Målerinterval kræver seneste servicemåler eller en fast næste grænse.";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      titel: title,
      enhedId: unitId,
      aktiv: input?.aktiv !== false,
      maalerEnhed: meterUnit,
      intervalMaaneder: intervalMonths,
      intervalMaeler: intervalMeter,
      varselDage: warningDays,
      varselMaaler: warningMeter,
      sidsteServiceDato: lastDate,
      sidsteServiceMaaler: lastMeter,
      naesteDato: fixedDate,
      naesteMaaler: nextMeter,
      beskrivelse: shortText(input?.beskrivelse, 500) || null,
    },
  };
}

export function evaluateFleetServiceRequirement(requirement, unit, today) {
  const dueDate = requirement.naesteDato
    || (requirement.sidsteServiceDato && requirement.intervalMaaneder
      ? addMonths(requirement.sidsteServiceDato, requirement.intervalMaaneder) : null);
  const dueMeter = integerOrNull(requirement.naesteMaaler)
    ?? (integerOrNull(requirement.sidsteServiceMaaler) != null && integerOrNull(requirement.intervalMaeler) != null
      ? integerOrNull(requirement.sidsteServiceMaaler) + integerOrNull(requirement.intervalMaeler) : null);
  const meter = currentMeter(unit, requirement.maalerEnhed);
  const dateAlert = dueDate ? today >= subtractDays(dueDate, integerOrNull(requirement.varselDage) ?? 0) : false;
  const meterAlert = dueMeter != null && meter != null
    ? meter >= dueMeter - (integerOrNull(requirement.varselMaaler) ?? 0) : false;
  const missingBasis = !dueDate && dueMeter == null;
  return {
    dueDate,
    dueMeter,
    meter,
    alert: dateAlert || meterAlert,
    overdue: (dueDate ? today > dueDate : false) || (dueMeter != null && meter != null ? meter > dueMeter : false),
    reason: missingBasis ? "missing_basis" : (!dueDate && dueMeter != null && meter == null ? "missing_meter" : "not_due"),
  };
}

export function fleetServiceCycleKey(requirement, evaluation) {
  return `${requirement.id}::${evaluation.dueDate || "no-date"}::${evaluation.dueMeter ?? "no-meter"}`;
}

const stableId = (prefix, key) => `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;

export function applyFleetServiceAutomation(tenantInput, options = {}) {
  const tenant = clone(tenantInput || {});
  const nowMs = Number(options.nowMs) || Date.now();
  const today = options.today || new Date(nowMs).toISOString().slice(0, 10);
  const requirements = tenant.fleetServiceKrav || {};
  tenant.fleetServiceForekomster ||= {};
  tenant.fleetIndberetninger ||= {};
  tenant.fleetSager ||= {};
  tenant.fleetServiceHistorik ||= {};
  const result = { created: [], reused: [], skipped: [] };

  for (const [requirementId, raw] of Object.entries(requirements)) {
    const requirement = { ...raw, id: requirementId };
    if (requirement.aktiv === false) { result.skipped.push({ requirementId, reason: "inactive" }); continue; }
    const unit = tenant.koeretoejer?.[requirement.enhedId];
    if (!unit) { result.skipped.push({ requirementId, reason: "unit_missing" }); continue; }
    const evaluation = evaluateFleetServiceRequirement(requirement, unit, today);
    if (!evaluation.alert) { result.skipped.push({ requirementId, reason: evaluation.reason }); continue; }
    const cycleKey = fleetServiceCycleKey(requirement, evaluation);
    const occurrenceId = stableId("svcocc", cycleKey);
    const existing = tenant.fleetServiceForekomster[occurrenceId];
    if (existing) { result.reused.push({ requirementId, occurrenceId }); continue; }

    const reportId = stableId("svcrep", cycleKey);
    const caseId = stableId("svccase", cycleKey);
    const historyId = stableId("svcevt", `${cycleKey}:${nowMs}`);
    tenant.fleetServiceForekomster[occurrenceId] = {
      id: occurrenceId, cyklusNoegle: cycleKey, servicekravId: requirementId,
      enhedId: requirement.enhedId, indberetningId: reportId, sagId: caseId,
      forfaldsdato: evaluation.dueDate, forfaldsMaeler: evaluation.dueMeter,
      maalerVedVarsling: evaluation.meter, status: "varslet",
      varsletMs: nowMs, opdateretMs: nowMs,
    };
    tenant.fleetIndberetninger[reportId] = {
      id: reportId, oprindelse: "serviceautomatik", servicekravId: requirementId,
      serviceforekomstId: occurrenceId, sagId: caseId, enhedId: requirement.enhedId,
      kategoriId: "service", titel: requirement.titel,
      beskrivelse: requirement.beskrivelse || "Automatisk oprettet fra et aktivt servicekrav.",
      prioritet: evaluation.overdue ? "hoej" : "normal", status: "ny",
      forfaldsdato: evaluation.dueDate, forfaldsMaeler: evaluation.dueMeter,
      oprettetMs: nowMs,
    };
    tenant.fleetSager[caseId] = {
      id: caseId, oprindelse: "serviceautomatik", indberetningId: reportId,
      servicekravId: requirementId, serviceforekomstId: occurrenceId,
      enhedId: requirement.enhedId, titel: requirement.titel,
      status: "ny", prioritet: evaluation.overdue ? "hoej" : "normal",
      naesteHandling: "Vurder automatisk servicevarsel", oprettetMs: nowMs,
      opdateretMs: nowMs,
    };
    tenant.fleetServiceHistorik[historyId] = {
      id: historyId, servicekravId: requirementId, serviceforekomstId: occurrenceId,
      indberetningId: reportId, sagId: caseId, handling: "varsel_oprettet",
      aktor: "serviceautomatik", tidspunktMs: nowMs,
    };
    tenant.fleetServiceKrav[requirementId] = {
      ...raw, aktivForekomstId: occurrenceId, senestKontrolleretMs: nowMs,
      senesteResultat: "varsel_oprettet", opdateretMs: nowMs,
    };
    result.created.push({ requirementId, occurrenceId, reportId, caseId, cycleKey });
  }
  tenant.fleetServiceAutomatik = {
    senesteKoerselMs: nowMs,
    oprettetAntal: result.created.length,
    genbrugtAntal: result.reused.length,
    sprungetOverAntal: result.skipped.length,
  };
  return { tenant, ...result };
}

export function completeFleetServiceOccurrence(tenantInput, occurrenceId, input, options = {}) {
  const tenant = clone(tenantInput || {});
  const occurrence = tenant.fleetServiceForekomster?.[occurrenceId];
  if (!occurrence) return { ok: false, code: "occurrence_missing" };
  const serviceDate = ISO_DATE.test(input?.dato || "") ? input.dato : null;
  const serviceMeter = integerOrNull(input?.maaler);
  if (!serviceDate) return { ok: false, code: "invalid_date" };
  if (serviceMeter != null && serviceMeter < 0) return { ok: false, code: "invalid_meter" };
  if (occurrence.status === "gennemfoert") {
    const sameCompletion = occurrence.gennemfoertDato === serviceDate
      && (occurrence.gennemfoertMaeler ?? null) === serviceMeter;
    return sameCompletion
      ? { ok: true, repeated: true, tenant }
      : { ok: false, code: "completion_conflict" };
  }
  const requirement = tenant.fleetServiceKrav?.[occurrence.servicekravId];
  if (!requirement) return { ok: false, code: "requirement_missing" };
  const nowMs = Number(options.nowMs) || Date.now();
  tenant.fleetServiceForekomster[occurrenceId] = {
    ...occurrence, status: "gennemfoert", gennemfoertDato: serviceDate,
    gennemfoertMaeler: serviceMeter, gennemfoertAf: shortText(input?.actorId, 128) || "ukendt",
    opdateretMs: nowMs,
  };
  tenant.fleetServiceKrav[occurrence.servicekravId] = {
    ...requirement, sidsteServiceDato: serviceDate,
    sidsteServiceMaaler: serviceMeter ?? requirement.sidsteServiceMaaler ?? null,
    naesteDato: null, naesteMaaler: null, aktivForekomstId: null,
    senesteResultat: "service_gennemfoert", opdateretMs: nowMs,
  };
  if (tenant.fleetIndberetninger?.[occurrence.indberetningId]) {
    tenant.fleetIndberetninger[occurrence.indberetningId].status = "service_gennemfoert";
  }
  if (tenant.fleetSager?.[occurrence.sagId]) {
    tenant.fleetSager[occurrence.sagId] = {
      ...tenant.fleetSager[occurrence.sagId], status: "fakturaafklaring",
      naesteHandling: "Afklar faktura før afslutning", opdateretMs: nowMs,
    };
  }
  const historyId = stableId("svcevt", `${occurrence.cyklusNoegle}:completed:${nowMs}`);
  tenant.fleetServiceHistorik ||= {};
  tenant.fleetServiceHistorik[historyId] = {
    id: historyId, servicekravId: occurrence.servicekravId,
    serviceforekomstId: occurrenceId, handling: "service_gennemfoert",
    aktor: shortText(input?.actorId, 128) || "ukendt", tidspunktMs: nowMs,
    dato: serviceDate, maaler: serviceMeter,
  };
  return { ok: true, repeated: false, tenant };
}

export async function runFleetServiceAutomationForTenant(tenantRef, options = {}) {
  const before = await tenantRef.once("value");
  if (!before.exists()) return { committed: false, created: [], reused: [], skipped: [{ reason: "tenant_missing" }] };
  const current = before.val();
  if ((current.abonnement?.status && current.abonnement.status !== "aktiv")
    || (current.moduler && current.moduler.flaade !== true)) {
    return { committed: false, created: [], reused: [], skipped: [{ reason: "tenant_inactive" }] };
  }
  let summary = null;
  let warm = true;
  const transaction = await tenantRef.transaction((value) => {
    if (!value && warm) value = clone(current);
    warm = false;
    if (!value) return;
    const applied = applyFleetServiceAutomation(value, options);
    summary = { created: applied.created, reused: applied.reused, skipped: applied.skipped };
    return applied.tenant;
  });
  return { committed: transaction.committed, ...(summary || { created: [], reused: [], skipped: [] }) };
}
