import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { randomUUID } from "node:crypto";
import { permStrengFraClaims } from "./delt/permissions.js";
import { erTokenEfterRevocation } from "./delt/ejeradgang.js";

const REGION = "europe-west1";
const REQUEST_TYPES = Object.freeze({ vacation: "ferie", personal: "feriefridag", timeOff: "afspadsering" });
const PLATFORM_TO_REQUEST = Object.freeze(Object.fromEntries(Object.entries(REQUEST_TYPES).map(([key, value]) => [value, key])));
const EMPLOYEE_STATUS = Object.freeze({ aktiv: "active", orlov: "leave", fratraadt: "terminated" });
const STATUS_TO_PLATFORM = Object.freeze({ active: "aktiv", leave: "orlov", terminated: "fratraadt" });

const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const list = (object) => Object.entries(object || {}).map(([id, value]) => ({ id, ...(value || {}) }));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const text = (value, max = 200) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const safeId = (value, label = "id") => {
  const id = text(value, 80);
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)) throw new HttpsError("invalid-argument", `${label} er ugyldigt.`);
  return id;
};
const requirePermission = (context, permission) => {
  if (!context.perms.includes(`|${permission}|`)) throw new HttpsError("permission-denied", `Kræver ${permission}.`);
};
const moduleEnabled = (tenant) => !tenant.moduler || tenant.moduler.bemanding === true;
const activeSubscription = (tenant) => !tenant.abonnement?.status || tenant.abonnement.status === "aktiv";

async function authorize(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = req.auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const db = getDatabase();
  const root = db.ref();
  const [revocation, legacy, tenantSnap] = await Promise.all([
    root.child(`authRevocations/${req.auth.uid}/revokeTime`).once("value"),
    root.child(`legacyClaimsAllowlist/${req.auth.uid}`).once("value"),
    root.child(`tenants/${tenantId}`).once("value"),
  ]);
  if (!erTokenEfterRevocation(req.auth.token?.auth_time, revocation.val())) {
    throw new HttpsError("permission-denied", "Loginet er tilbagekaldt.");
  }
  if (req.auth.token?.pv !== 2) {
    const grant = legacy.val();
    if (!grant || grant.tenant !== tenantId || finite(grant.expiresAtMs) <= Date.now()) {
      throw new HttpsError("permission-denied", "Legacy-claimet er ikke allowlistet.");
    }
  }
  const tenant = tenantSnap.val();
  if (!tenant?._findes) throw new HttpsError("not-found", "Tenant findes ikke.");
  if (!activeSubscription(tenant)) throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  return {
    db, root, tenant, tenantId, tenantRef: root.child(`tenants/${tenantId}`),
    uid: req.auth.uid, perms: permStrengFraClaims(req.auth.token),
    personId: tenant.brugere?.[req.auth.uid]?.personId || null,
  };
}

function employeeFromPlatform(id, person, version) {
  return {
    id,
    name: person.navn,
    status: EMPLOYEE_STATUS[person.status] || "active",
    functions: Object.entries(person.funktioner || {}).filter(([, enabled]) => enabled === true).map(([name]) => name),
    workplace: person.stationeret || "",
    employment: person.ansaettelsesform || "fastansat",
    phone: person.telefon || "",
    email: person.email || "",
    userId: person.uid || null,
    terminatedAtMs: person.fratraadtMs || null,
    version,
  };
}

function shiftFromPlatform(id, shift, version) {
  return {
    id, employeeId: shift.personId, startMs: shift.fra, endMs: shift.til,
    breakMinutes: shift.pauseMin || 0, status: shift.status || "draft",
    seriesId: shift.serieId || null, copiedFromId: shift.kopieretFraId || null,
    publishedAtMs: shift.offentliggjortMs || null, cancelledAtMs: shift.annulleretMs || null,
    version,
  };
}

function leaveFromPlatform(id, leave, sensitive, version, showApplicationDetails = false) {
  const application = leave.ansoegning;
  const status = !application ? "approved" : ({ ansoegt: "pending", godkendt: "approved", afvist: "rejected" }[application.status] || "cancelled");
  return {
    id, employeeId: leave.personId, fromMs: leave.fra, toMs: leave.til, status,
    requestedType: application && showApplicationDetails ? PLATFORM_TO_REQUEST[application.oensket] || null : undefined,
    type: PLATFORM_TO_REQUEST[sensitive?.art] || sensitive?.art || undefined,
    employeeNote: sensitive?.medarbejderNote || undefined,
    sensitiveNote: sensitive?.note || undefined,
    response: application?.svar || "", requestedAtMs: application?.ansoegtMs || null,
    decidedAtMs: application?.afgjortMs || null, decidedBy: application?.afgjortAf || null,
    direct: !application, cancelledAtMs: leave.annulleretMs || null, version,
  };
}

function skillFromPlatform(id, skill, version) {
  return {
    id, employeeId: skill.personId, type: skill.type,
    validUntilMs: skill.udloeberMs ?? null, documentName: skill.dokumentreference || null,
    version,
  };
}

function timeFromPlatform(personId, id, entry, version) {
  return {
    id, employeeId: personId, inMs: entry.indMs, outMs: entry.udMs ?? null,
    breakMinutes: entry.pauseMin || 0, correctedAtMs: entry.rettetMs || null,
    version,
  };
}

function projectState(context) {
  const { tenant, personId, perms } = context;
  const manager = perms.includes("|vagter.laes|");
  const sensitiveReader = perms.includes("|fravaer.sensitiveLaes|");
  const version = tenant._workforceVersioner || {};
  let employees = list(tenant.personale).map((person) => employeeFromPlatform(person.id, person, version.personale?.[person.id] || 1));
  if (!manager) employees = employees.filter((person) => person.id === personId);
  if (!moduleEnabled(tenant)) {
    return { tenantId: context.tenantId, employees, shifts: [], leaves: [], sensitiveLeave: {}, skills: [], timeEntries: [], reservations: [], planningAssignments: [], history: [], workforceEnabled: false };
  }
  let shifts = list(tenant.vagter).map((shift) => shiftFromPlatform(shift.id, shift, version.vagter?.[shift.id] || 1));
  let leaves = list(tenant.fravaer).filter((leave) => !leave.annulleretMs).map((leave) => {
    const maySeeDetail = sensitiveReader || leave.personId === personId;
    return leaveFromPlatform(
      leave.id,
      leave,
      maySeeDetail ? tenant.sensitive?.fravaer?.[leave.id] : null,
      version.fravaer?.[leave.id] || 1,
      maySeeDetail,
    );
  });
  let skills = list(tenant.kompetencer).map((skill) => skillFromPlatform(skill.id, skill, version.kompetencer?.[skill.id] || 1));
  let timeEntries = Object.entries(tenant.stemplinger || {}).flatMap(([employeeId, entries]) => list(entries).map((entry) => timeFromPlatform(employeeId, entry.id, entry, version.stemplinger?.[employeeId]?.[entry.id] || 1)));
  if (!manager) {
    shifts = shifts.filter((shift) => shift.employeeId === personId && shift.status === "published");
    leaves = leaves.filter((leave) => leave.employeeId === personId);
    skills = skills.filter((skill) => skill.employeeId === personId);
    timeEntries = timeEntries.filter((entry) => entry.employeeId === personId);
  }
  const reservations = manager ? Object.entries(tenant.reservationer?.medarbejder || {}).flatMap(([employeeId, rows]) => list(rows).map((row) => ({ id: row.id, employeeId, fromMs: row.fra, toMs: row.til, source: row.kilde?.type || "ukendt" }))) : [];
  return { tenantId: context.tenantId, employees, shifts, leaves, sensitiveLeave: {}, skills, timeEntries, reservations, planningAssignments: [], history: [], workforceEnabled: true };
}

function fail(state, code, message) {
  state.failure = { code, message };
  return undefined;
}

function nextVersion(tenant, area, id, expectedVersion, state) {
  tenant._workforceVersioner ||= {};
  const parts = String(id).split("/");
  tenant._workforceVersioner[area] ||= {};
  let versions = tenant._workforceVersioner[area];
  for (const part of parts.slice(0, -1)) { versions[part] ||= {}; versions = versions[part]; }
  const key = parts.at(-1);
  const current = versions[key] || 1;
  if (expectedVersion != null && Number(expectedVersion) !== current) return fail(state, "aborted", "Data er ændret i en anden session. Genindlæs og prøv igen.");
  const next = current + 1;
  versions[key] = next;
  return next;
}

function approvalScope(tenant, uid, personId) {
  return tenant.workforceGodkendelsesomfang?.[uid]?.personer?.[personId] === true;
}

function requireScope(tenant, context, personId) {
  if (context.personId && context.personId === personId) throw new HttpsError("permission-denied", "Egen fraværsansøgning kan ikke godkendes.");
  if (!approvalScope(tenant, context.uid, personId)) throw new HttpsError("permission-denied", "Brugeren har intet tildelt godkendelsesomfang for medarbejderen.");
}

function reservationConflict(tenant, personId, fromMs, toMs, ignoreId = null) {
  return list(tenant.reservationer?.medarbejder?.[personId]).find((row) => row.id !== ignoreId && row.fra < toMs && fromMs < row.til);
}

function addLocalDays(timestamp, days) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function audit(tenant, context, requestId, action, object, objectId, note = null) {
  tenant.audit ||= {};
  tenant.audit[`wf-${requestId}`] = { ms: Date.now(), uid: context.uid, handling: action, objekt: object, objektId: objectId, ...(note ? { note } : {}) };
}

function event(tenant, requestId, type, objectId, context) {
  tenant.workforceEvents ||= {};
  tenant.workforceEvents[requestId] = { id: requestId, type, objectId, tenantId: context.tenantId, occurredAtMs: Date.now(), actorUid: context.uid };
}

function isAvailable(tenant, personId, fromMs, toMs) {
  const leaveConflict = reservationConflict(tenant, personId, fromMs, toMs);
  const taskConflict = list(tenant.etaper).some((task) => task.personId === personId && task.fra < toMs && fromMs < task.til);
  return !leaveConflict && !taskConflict;
}

function availabilityEvent(tenant, requestId, context, { personId, fromMs, toMs, sourceId, suffix = "current" }) {
  const id = `${requestId}-${suffix}`;
  tenant.workforceEvents ||= {};
  tenant.workforceEvents[id] = {
    id,
    type: "workforce.availability.changed.v1",
    tenantId: context.tenantId,
    personId,
    fromMs,
    toMs,
    sourceType: "fravaer",
    sourceId,
    available: isAvailable(tenant, personId, fromMs, toMs),
    occurredAtMs: Date.now(),
    actorUid: context.uid,
  };
}

async function mutate(context, operation, requestId, args) {
  const state = { failure: null, result: null };
  // Hold et aktivt value-abonnement, mens transaktionen starter. Admin-SDK'et
  // har da den autoritative tenant i sin lokale cache og behøver ikke kalde
  // transaktionshandleren med en syntetisk tom startværdi.
  let snapshotReady;
  let snapshotFailed;
  const ready = new Promise((resolve, reject) => { snapshotReady = resolve; snapshotFailed = reject; });
  const primeCache = () => snapshotReady();
  context.tenantRef.on("value", primeCache, snapshotFailed);
  await ready;
  let tx;
  try {
    tx = await context.tenantRef.transaction((tenant) => {
      if (!tenant?._findes) return fail(state, "not-found", "Tenant findes ikke.");
    if (!activeSubscription(tenant)) return fail(state, "permission-denied", "Abonnementet er ikke aktivt.");
    if (!moduleEnabled(tenant)) return fail(state, "permission-denied", "WORKFORCE-modulet er ikke aktivt.");
    const previous = tenant._workforceAnmodninger?.[context.uid]?.[requestId];
    if (previous) { state.result = previous.result; return tenant; }
    try {
      state.result = applyOperation(tenant, context, operation, args, requestId, state);
    } catch (error) {
      if (error instanceof HttpsError) return fail(state, error.code, error.message);
      return fail(state, "invalid-argument", error.message || "Ugyldig WORKFORCE-kommando.");
    }
    if (state.failure) return undefined;
    tenant._workforceAnmodninger ||= {};
    tenant._workforceAnmodninger[context.uid] ||= {};
    tenant._workforceAnmodninger[context.uid][requestId] = { operation, result: state.result, completedAtMs: Date.now() };
      return tenant;
    });
  } finally {
    context.tenantRef.off("value", primeCache);
  }
  if (state.failure) throw new HttpsError(state.failure.code, state.failure.message);
  if (!tx.committed) throw new HttpsError("aborted", "Samtidig ændring blev afvist. Genindlæs og prøv igen.");
  return state.result;
}

function applyOperation(tenant, context, operation, args, requestId, state) {
  const now = Date.now();
  if (operation === "requestLeave") {
    if (!context.personId) throw new HttpsError("permission-denied", "Loginet er ikke knyttet til en medarbejder.");
    const input = args.input || {};
    if (input.employeeId !== context.personId) throw new HttpsError("permission-denied", "Man kan kun anmode om frihed for sig selv.");
    const type = REQUEST_TYPES[input.requestedType];
    const fromMs = finite(input.fromMs); const toMs = finite(input.toMs);
    if (!type || fromMs == null || toMs == null || toMs <= fromMs) throw new HttpsError("invalid-argument", "Frihedsansøgningen har ugyldig type eller periode.");
    const id = `wf-leave-${requestId}`;
    tenant.fravaer ||= {}; tenant.sensitive ||= {}; tenant.sensitive.fravaer ||= {};
    tenant.fravaer[id] = { personId: context.personId, fra: fromMs, til: toMs, ansoegning: { status: "ansoegt", oensket: type, ansoegtMs: now } };
    const note = text(input.employeeNote, 500);
    if (note) tenant.sensitive.fravaer[id] = { medarbejderNote: note };
    tenant._workforceVersioner ||= {}; tenant._workforceVersioner.fravaer ||= {}; tenant._workforceVersioner.fravaer[id] = 1;
    audit(tenant, context, requestId, "opret", "fravaer", id, "frihedsansøgning");
    availabilityEvent(tenant, requestId, context, { personId: context.personId, fromMs, toMs, sourceId: id });
    return { id, status: "pending", version: 1 };
  }

  if (operation === "decideLeave") {
    requirePermission(context, "fravaer.skriv");
    const id = safeId(args.leaveId, "leaveId"); const leave = tenant.fravaer?.[id];
    if (!leave) throw new HttpsError("not-found", "Fraværsansøgningen findes ikke.");
    requireScope(tenant, context, leave.personId);
    const decision = args.decision === "approved" ? "godkendt" : args.decision === "rejected" ? "afvist" : null;
    if (!decision || leave.ansoegning?.status !== "ansoegt") throw new HttpsError("failed-precondition", "Ansøgningen er allerede afgjort eller afgørelsen er ugyldig.");
    const next = nextVersion(tenant, "fravaer", id, args.expectedVersion, state); if (!next) return null;
    if (decision === "godkendt") {
      const conflict = reservationConflict(tenant, leave.personId, leave.fra, leave.til, `res-${id}`);
      if (conflict) throw new HttpsError("failed-precondition", "Medarbejderen har allerede en reservation i perioden.");
      tenant.reservationer ||= {}; tenant.reservationer.medarbejder ||= {}; tenant.reservationer.medarbejder[leave.personId] ||= {};
      tenant.reservationer.medarbejder[leave.personId][`res-${id}`] = { fra: leave.fra, til: leave.til, kilde: { type: "fravaer", id, reference: null }, oprettetAf: context.uid, oprettetMs: now };
      tenant.sensitive ||= {}; tenant.sensitive.fravaer ||= {}; tenant.sensitive.fravaer[id] ||= {};
      tenant.sensitive.fravaer[id].art = leave.ansoegning.oensket;
    }
    leave.ansoegning = { ...leave.ansoegning, status: decision, afgjortAf: context.uid, afgjortMs: now, ...(text(args.response, 300) ? { svar: text(args.response, 300) } : {}) };
    audit(tenant, context, requestId, "tilstandsskift", "fravaer", id, decision);
    availabilityEvent(tenant, requestId, context, { personId: leave.personId, fromMs: leave.fra, toMs: leave.til, sourceId: id });
    return { id, status: args.decision, version: next };
  }

  if (operation === "cancelLeave") {
    requirePermission(context, "fravaer.skriv");
    const id = safeId(args.leaveId, "leaveId"); const leave = tenant.fravaer?.[id];
    if (!leave) throw new HttpsError("not-found", "Fraværet findes ikke.");
    requireScope(tenant, context, leave.personId);
    const next = nextVersion(tenant, "fravaer", id, args.expectedVersion, state); if (!next) return null;
    leave.annulleretMs = now; leave.annulleretAf = context.uid;
    if (tenant.reservationer?.medarbejder?.[leave.personId]) delete tenant.reservationer.medarbejder[leave.personId][`res-${id}`];
    audit(tenant, context, requestId, "tilstandsskift", "fravaer", id, text(args.reason, 300) || "annulleret");
    availabilityEvent(tenant, requestId, context, { personId: leave.personId, fromMs: leave.fra, toMs: leave.til, sourceId: id });
    return { id, status: "cancelled", version: next };
  }

  if (operation === "registerLeave") {
    requirePermission(context, "fravaer.skriv"); requirePermission(context, "fravaer.sensitiveLaes");
    const input = args.input || {}; const personId = safeId(input.employeeId, "employeeId");
    if (!tenant.personale?.[personId]) throw new HttpsError("not-found", "Medarbejderen findes ikke.");
    requireScope(tenant, context, personId);
    const fromMs = finite(input.fromMs); const toMs = finite(input.toMs);
    if (fromMs == null || toMs == null || toMs <= fromMs) throw new HttpsError("invalid-argument", "Fraværsperioden er ugyldig.");
    const id = input.id ? safeId(input.id) : `wf-leave-${requestId}`;
    const existing = tenant.fravaer?.[id];
    const next = existing ? nextVersion(tenant, "fravaer", id, input.version, state) : 1; if (!next) return null;
    tenant.fravaer ||= {}; tenant.sensitive ||= {}; tenant.sensitive.fravaer ||= {}; tenant.reservationer ||= {}; tenant.reservationer.medarbejder ||= {}; tenant.reservationer.medarbejder[personId] ||= {};
    if (existing?.personId && tenant.reservationer.medarbejder[existing.personId]) {
      delete tenant.reservationer.medarbejder[existing.personId][`res-${id}`];
    }
    tenant.fravaer[id] = { personId, fra: fromMs, til: toMs };
    tenant.sensitive.fravaer[id] = { art: REQUEST_TYPES[input.type] || text(input.type, 40) || "andet", ...(text(input.sensitiveNote, 500) ? { note: text(input.sensitiveNote, 500) } : {}) };
    tenant.reservationer.medarbejder[personId][`res-${id}`] = { fra: fromMs, til: toMs, kilde: { type: "fravaer", id, reference: null }, oprettetAf: context.uid, oprettetMs: now };
    tenant._workforceVersioner ||= {}; tenant._workforceVersioner.fravaer ||= {}; tenant._workforceVersioner.fravaer[id] = next;
    audit(tenant, context, requestId, existing ? "opdater" : "opret", "fravaer", id);
    if (existing && (existing.personId !== personId || existing.fra !== fromMs || existing.til !== toMs)) {
      availabilityEvent(tenant, requestId, context, { personId: existing.personId, fromMs: existing.fra, toMs: existing.til, sourceId: id, suffix: "previous" });
    }
    availabilityEvent(tenant, requestId, context, { personId, fromMs, toMs, sourceId: id });
    return { id, status: "approved", version: next };
  }

  if (operation === "saveShift") {
    requirePermission(context, "vagter.skriv");
    const input = args.input || {}; const personId = safeId(input.employeeId, "employeeId");
    if (!tenant.personale?.[personId]) throw new HttpsError("not-found", "Medarbejderen findes ikke.");
    const fromMs = finite(input.startMs); const toMs = finite(input.endMs);
    if (fromMs == null || toMs == null || toMs <= fromMs || toMs - fromMs > 24 * 60 * 60 * 1000) throw new HttpsError("invalid-argument", "Vagten har en ugyldig periode.");
    const id = input.id ? safeId(input.id) : `wf-shift-${requestId}`;
    const existing = tenant.vagter?.[id]; const next = existing ? nextVersion(tenant, "vagter", id, input.version, state) : 1; if (!next) return null;
    const repeatWeeks = existing ? 0 : Math.max(0, Math.min(7, Math.trunc(finite(args.options?.repeatWeeks) || 0)));
    const seriesId = existing?.serieId || (repeatWeeks > 0 ? `wf-series-${requestId}` : input.seriesId ? safeId(input.seriesId, "seriesId") : null);
    const created = [];
    tenant.vagter ||= {}; tenant._workforceVersioner ||= {}; tenant._workforceVersioner.vagter ||= {};
    for (let index = 0; index <= repeatWeeks; index += 1) {
      const shiftId = index === 0 ? id : `wf-shift-${requestId}-${index + 1}`;
      const shift = {
        personId,
        fra: addLocalDays(fromMs, index * 7),
        til: addLocalDays(toMs, index * 7),
        pauseMin: Math.max(0, finite(input.breakMinutes) || 0),
        status: input.status || existing?.status || "draft",
        ...(seriesId ? { serieId: seriesId } : {}),
      };
      tenant.vagter[shiftId] = shift;
      tenant._workforceVersioner.vagter[shiftId] = index === 0 ? next : 1;
      created.push(shiftFromPlatform(shiftId, shift, index === 0 ? next : 1));
    }
    audit(tenant, context, requestId, existing ? "opdater" : "opret", "vagt", id);
    return created;
  }

  if (operation === "cancelShift") {
    requirePermission(context, "vagter.skriv");
    const id = safeId(args.shiftId, "shiftId"); const shift = tenant.vagter?.[id]; if (!shift) throw new HttpsError("not-found", "Vagten findes ikke.");
    const next = nextVersion(tenant, "vagter", id, args.expectedVersion, state); if (!next) return null;
    shift.status = "cancelled"; shift.annulleretMs = now; shift.annulleretAf = context.uid;
    audit(tenant, context, requestId, "tilstandsskift", "vagt", id, text(args.reason, 300) || "annulleret");
    return { id, status: "cancelled", version: next };
  }

  if (operation === "publishWeek") {
    requirePermission(context, "vagter.skriv");
    const weekMs = finite(args.weekMs); if (weekMs == null) throw new HttpsError("invalid-argument", "Ugen mangler.");
    const date = new Date(weekMs); const day = (date.getDay() + 6) % 7; date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - day); const end = new Date(date); end.setDate(end.getDate() + 7);
    let count = 0;
    for (const [id, shift] of Object.entries(tenant.vagter || {})) if (shift.status === "draft" && shift.fra >= date.getTime() && shift.fra < end.getTime()) { shift.status = "published"; shift.offentliggjortMs = now; tenant._workforceVersioner ||= {}; tenant._workforceVersioner.vagter ||= {}; tenant._workforceVersioner.vagter[id] = (tenant._workforceVersioner.vagter[id] || 1) + 1; count += 1; }
    audit(tenant, context, requestId, "tilstandsskift", "vagtplan", String(date.getTime()), `offentliggjort ${count}`);
    event(tenant, requestId, "workforce.shift.published.v1", String(date.getTime()), context);
    return { count };
  }

  if (operation === "copyWeek") {
    requirePermission(context, "vagter.skriv");
    const source = finite(args.sourceWeekMs); const target = finite(args.targetWeekMs); if (source == null || target == null || source === target) throw new HttpsError("invalid-argument", "Kilde- og målugen er ugyldig.");
    const deltaDays = Math.round((target - source) / 86_400_000); const sourceEnd = addLocalDays(source, 7); const copies = [];
    tenant.vagter ||= {}; tenant._workforceVersioner ||= {}; tenant._workforceVersioner.vagter ||= {};
    for (const [id, shift] of Object.entries(tenant.vagter)) if (shift.status !== "cancelled" && shift.fra >= source && shift.fra < sourceEnd) { const copyId = `wf-shift-${requestId}-${copies.length + 1}`; tenant.vagter[copyId] = { ...shift, fra: addLocalDays(shift.fra, deltaDays), til: addLocalDays(shift.til, deltaDays), status: "draft", kopieretFraId: id, serieId: `wf-series-${requestId}` }; tenant._workforceVersioner.vagter[copyId] = 1; copies.push({ id: copyId }); }
    audit(tenant, context, requestId, "opret", "vagtplan", String(target), `kopieret ${copies.length}`); return copies;
  }

  if (operation === "saveEmployee" || operation === "terminateEmployee") {
    requirePermission(context, "personale.skriv");
    const input = operation === "saveEmployee" ? (args.input || {}) : null;
    const id = operation === "saveEmployee" ? (input.id ? safeId(input.id) : `wf-person-${requestId}`) : safeId(args.employeeId, "employeeId");
    const existing = tenant.personale?.[id]; if (operation === "terminateEmployee" && !existing) throw new HttpsError("not-found", "Medarbejderen findes ikke.");
    const expected = operation === "saveEmployee" ? input.version : args.expectedVersion;
    const next = existing ? nextVersion(tenant, "personale", id, expected, state) : 1; if (!next) return null;
    tenant.personale ||= {};
    if (operation === "terminateEmployee") tenant.personale[id] = { ...existing, status: "fratraadt", fratraadtMs: finite(args.terminatedAtMs) || now };
    else {
      const name = text(input.name, 120); if (!name) throw new HttpsError("invalid-argument", "Medarbejderens navn mangler.");
      tenant.personale[id] = { ...(existing || {}), navn: name, status: STATUS_TO_PLATFORM[input.status] || existing?.status || "aktiv", funktioner: Object.fromEntries((input.functions || []).map((name) => [String(name).toLocaleLowerCase("da-DK").replaceAll("ø", "oe").replaceAll("æ", "ae").replaceAll("å", "aa").replace(/[^a-z0-9]+/g, ""), true])), stationeret: text(input.workplace, 120) || "Ikke angivet", ansaettelsesform: text(input.employment, 60) || "fastansat", ...(text(input.phone, 40) ? { telefon: text(input.phone, 40) } : {}), ...(text(input.email, 180) ? { email: text(input.email, 180) } : {}) };
    }
    tenant._workforceVersioner ||= {}; tenant._workforceVersioner.personale ||= {}; tenant._workforceVersioner.personale[id] = next;
    audit(tenant, context, requestId, operation === "terminateEmployee" ? "tilstandsskift" : existing ? "opdater" : "opret", "personale", id, text(args.reason, 300));
    event(tenant, requestId, "workforce.employee.changed.v1", id, context);
    return employeeFromPlatform(id, tenant.personale[id], next);
  }

  if (operation === "saveSkill") {
    requirePermission(context, "kompetencer.skriv"); const input = args.input || {}; const personId = safeId(input.employeeId, "employeeId");
    if (!tenant.personale?.[personId]) throw new HttpsError("not-found", "Medarbejderen findes ikke.");
    const id = input.id ? safeId(input.id) : `wf-skill-${requestId}`; const existing = tenant.kompetencer?.[id]; const next = existing ? nextVersion(tenant, "kompetencer", id, input.version, state) : 1; if (!next) return null;
    const type = text(input.type, 100); if (!type) throw new HttpsError("invalid-argument", "Kompetencetypen mangler.");
    tenant.kompetencer ||= {}; tenant.kompetencer[id] = { personId, type, ...(finite(input.validUntilMs) != null ? { udloeberMs: finite(input.validUntilMs) } : {}), ...(text(input.documentName, 180) ? { dokumentreference: text(input.documentName, 180) } : {}) };
    tenant._workforceVersioner ||= {}; tenant._workforceVersioner.kompetencer ||= {}; tenant._workforceVersioner.kompetencer[id] = next;
    audit(tenant, context, requestId, existing ? "opdater" : "opret", "kompetence", id); event(tenant, requestId, "workforce.skill.changed.v1", id, context);
    return skillFromPlatform(id, tenant.kompetencer[id], next);
  }

  if (operation === "clockIn" || operation === "clockOut") {
    if (!context.personId || args.employeeId !== context.personId) throw new HttpsError("permission-denied", "Man kan kun stemple for sig selv.");
    tenant.stemplinger ||= {}; tenant.stemplinger[context.personId] ||= {};
    const entries = tenant.stemplinger[context.personId]; const openEntry = Object.entries(entries).find(([, entry]) => !own(entry, "udMs"));
    if (operation === "clockIn") {
      if (openEntry) throw new HttpsError("failed-precondition", "Der findes allerede en åben stempling.");
      const id = `wf-time-${requestId}`; entries[id] = { indMs: finite(args.atMs) || now }; tenant._workforceVersioner ||= {}; tenant._workforceVersioner.stemplinger ||= {}; tenant._workforceVersioner.stemplinger[context.personId] ||= {}; tenant._workforceVersioner.stemplinger[context.personId][id] = 1; audit(tenant, context, requestId, "opret", "stempling", id); return timeFromPlatform(context.personId, id, entries[id], 1);
    }
    if (!openEntry) throw new HttpsError("failed-precondition", "Der findes ingen åben stempling.");
    const [id, entry] = openEntry; const outMs = finite(args.options?.atMs) || now; if (outMs <= entry.indMs || outMs - entry.indMs > 24 * 60 * 60 * 1000) throw new HttpsError("invalid-argument", "Udstemplingen har en ugyldig varighed.");
    entry.udMs = outMs; entry.pauseMin = Math.max(0, finite(args.options?.breakMinutes) || 0);
    tenant._workforceVersioner ||= {}; tenant._workforceVersioner.stemplinger ||= {}; tenant._workforceVersioner.stemplinger[context.personId] ||= {}; tenant._workforceVersioner.stemplinger[context.personId][id] = 2;
    audit(tenant, context, requestId, "tilstandsskift", "stempling", id); return timeFromPlatform(context.personId, id, entry, 2);
  }

  if (operation === "correctTime") {
    requirePermission(context, "stemplinger.rette"); const input = args.input || {}; const personId = safeId(input.employeeId, "employeeId"); const id = safeId(input.id);
    const entry = tenant.stemplinger?.[personId]?.[id]; if (!entry) throw new HttpsError("not-found", "Tidsregistreringen findes ikke.");
    const reason = text(args.reason, 300); if (!reason) throw new HttpsError("invalid-argument", "Rettelsen kræver en begrundelse.");
    const next = nextVersion(tenant, "stemplinger", `${personId}/${id}`, input.version, state); if (!next) return null;
    const inMs = finite(input.inMs); const outMs = finite(input.outMs); if (inMs == null || outMs == null || outMs <= inMs) throw new HttpsError("invalid-argument", "Tidsperioden er ugyldig.");
    tenant.stemplinger[personId][id] = { indMs: inMs, udMs: outMs, pauseMin: Math.max(0, finite(input.breakMinutes) || 0), rettetMs: now, rettetAf: context.uid, rettelsesgrund: reason };
    audit(tenant, context, requestId, "opdater", "stempling", id, reason); return timeFromPlatform(personId, id, tenant.stemplinger[personId][id], next);
  }
  throw new HttpsError("invalid-argument", `Ukendt WORKFORCE-operation: ${operation}.`);
}

export const workforceprojektionhent = onCall({ region: REGION }, async (req) => {
  const context = await authorize(req);
  if (!context.perms.includes("|personale.laes|") && !context.personId) throw new HttpsError("permission-denied", "Ingen adgang til medarbejderstamdata.");
  return { state: projectState(context), actorEmployeeId: context.personId, workforceEnabled: moduleEnabled(context.tenant) };
});

export const workforcekommando = onCall({ region: REGION }, async (req) => {
  const context = await authorize(req);
  const operation = text(req.data?.operation, 60); const requestId = safeId(req.data?.requestId || randomUUID(), "requestId");
  if (!operation) throw new HttpsError("invalid-argument", "operation mangler.");
  return { result: await mutate(context, operation, requestId, req.data?.args || {}) };
});

export const workforceplanningtjek = onCall({ region: REGION }, async (req) => {
  const context = await authorize(req); requirePermission(context, "booking.laes");
  const employeeId = safeId(req.data?.employeeId, "employeeId"); const startMs = finite(req.data?.startMs); const endMs = finite(req.data?.endMs);
  if (!context.tenant.personale?.[employeeId] || startMs == null || endMs == null || endMs <= startMs) throw new HttpsError("invalid-argument", "Planlægningsopgaven har ugyldig medarbejder eller periode.");
  const leave = reservationConflict(context.tenant, employeeId, startMs, endMs);
  const competingTask = list(context.tenant.etaper).find((task) => task.personId === employeeId && task.fra < endMs && startMs < task.til);
  const requirements = Array.isArray(req.data?.requirements) ? req.data.requirements.map((value) => text(value, 100)).filter(Boolean) : [];
  const skills = list(context.tenant.kompetencer).filter((skill) => skill.personId === employeeId);
  const missingSkills = requirements.filter((required) => !skills.some((skill) => skill.type.toLocaleLowerCase("da-DK") === required.toLocaleLowerCase("da-DK") && (!skill.udloeberMs || skill.udloeberMs >= startMs)));
  const withinPublishedShift = list(context.tenant.vagter).some((shift) => shift.personId === employeeId && shift.status === "published" && shift.fra <= startMs && shift.til >= endMs);
  return { available: !leave && !competingTask && missingSkills.length === 0, leaveConflict: leave ? { id: leave.id, source: leave.kilde?.type || "reservation" } : null, competingTask: competingTask ? { id: competingTask.id } : null, missingSkills, withinPublishedShift };
});
