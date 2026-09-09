export const PLANSTATUS = Object.freeze({
  I_KOE: "I_KOE", KLADDE: "KLADDE", FORELOEBIG: "KLADDE",
  AFVENTER_BEKRAEFTELSE: "AFVENTER_BEKRAEFTELSE", PLANLAGT: "AFVENTER_BEKRAEFTELSE",
  BEKRAEFTET: "BEKRAEFTET", AENDRING_OENSKET: "AENDRING_OENSKET",
});
export const BEKRAEFTELSESFLOW = Object.freeze({ INTERN: "INTERN_PLANLAEGNING", ORIENTER: "ORIENTER_BESTILLER", KRAEV: "KRAEV_BEKRAEFTELSE" });
export const FORSLAGSSTATUS = Object.freeze({ AFVENTER: "AFVENTER_BEKRAEFTELSE", BEKRAEFTET: "BEKRAEFTET", AENDRING_OENSKET: "AENDRING_OENSKET", ERSTATTET: "ERSTATTET" });
export const BEKRAEFTELSESFUND = Object.freeze({ FORSLAG_MANGLER: "BEKRAEFTELSE_FORSLAG_MANGLER", FORSLAG_FORAELDET: "BEKRAEFTELSE_FORSLAG_FORAELDET", PLACERING_UGYLDIG: "BEKRAEFTELSE_PLACERING_UGYLDIG" });
export const PERIODEART = Object.freeze({ DATO: "DATO", DATO_TID: "DATO_TID", TIDSVINDUE: "TIDSVINDUE", ISO_UGE: "ISO_UGE", DATO_INTERVAL: "DATO_INTERVAL", UDEN_DATO_OENSKE: "UDEN_DATO_OENSKE" });
export const PERIODENIVEAU = Object.freeze({ OENSKET: "OENSKET", SKAL_OVERHOLDES: "SKAL_OVERHOLDES" });
export const PLANFUND = Object.freeze({
  OPGAVE_UKENDT: "PLAN_OPGAVE_UKENDT", DATO_UGYLDIG: "PLAN_DATO_UGYLDIG", DATO_UDEN_FOR_PERIODE: "PLAN_DATO_UDEN_FOR_PERIODE",
  RESSOURCE_UKENDT: "PLAN_RESSOURCE_UKENDT", RESSOURCEKONFLIKT: "PLAN_RESSOURCEKONFLIKT", KOMPETENCE_MANGLER: "PLAN_KOMPETENCE_MANGLER",
  KOERETOEJSTYPE_FORKERT: "PLAN_KOERETOEJSTYPE_FORKERT", KAPACITET_UTILSTRAEKKELIG: "PLAN_KAPACITET_UTILSTRAEKKELIG",
  TIDSVINDUE_UMULIGT: "PLAN_TIDSVINDUE_UMULIGT", STOPRAEKKEFOELGE_UGYLDIG: "PLAN_STOPRAEKKEFOELGE_UGYLDIG",
  RETURKOERSEL_MANGLER: "PLAN_RETURKOERSEL_MANGLER", BESTILLERKRAV_BRUDT: "PLAN_BESTILLERKRAV_BRUDT",
  BESTILLEROENSKE_AFVIGER: "PLAN_BESTILLEROENSKE_AFVIGER", PERIODE_UGYLDIG: "PLAN_PERIODE_UGYLDIG",
});

const clone = (value) => structuredClone(value);
const timeToMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match || Number(match[1]) >= 24 || Number(match[2]) >= 60) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};
const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateValue = (value) => datePattern.test(value || "") ? new Date(`${value}T00:00:00Z`) : null;
const isoDate = (value) => value.toISOString().slice(0, 10);
const placementSnapshot = (placement) => ({ placementId: placement.id, taskId: placement.taskId, date: placement.date, resourceType: placement.resourceType, resourceId: placement.resourceId, startTime: placement.startTime, durationMin: placement.durationMin, stops: clone(placement.stops || []) });
const snapshotKey = (snapshot) => JSON.stringify(snapshot);
const appendUnique = (items, item) => items.some((entry) => entry.id === item.id) ? items : [...items, item];
const proposalMessage = (placement) => {
  const end = timeToMinutes(placement.startTime) + placement.durationMin;
  const endText = `${String(Math.floor(end / 60)).padStart(2, "0")}.${String(end % 60).padStart(2, "0")}`;
  return `Forslag: Din opgave kan planlægges til ${placement.date} kl. ${placement.startTime.replace(":", ".")}–${endText}. Bekræft venligst tidspunktet.`;
};

export function isoUgeInterval(aar, uge) {
  if (!Number.isInteger(aar) || !Number.isInteger(uge) || uge < 1 || uge > 53) return null;
  const fourth = new Date(Date.UTC(aar, 0, 4));
  const monday = new Date(fourth);
  monday.setUTCDate(fourth.getUTCDate() - ((fourth.getUTCDay() + 6) % 7) + (uge - 1) * 7);
  const thursday = new Date(monday); thursday.setUTCDate(monday.getUTCDate() + 3);
  if (thursday.getUTCFullYear() !== aar) return null;
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  return { aar, uge, fra: isoDate(monday), til: isoDate(sunday), noegle: `${aar}-W${String(uge).padStart(2, "0")}` };
}

export function isoUgeFraDato(dato) {
  const value = dateValue(dato); if (!value) return null;
  const thursday = new Date(value); thursday.setUTCDate(value.getUTCDate() + 3 - ((value.getUTCDay() + 6) % 7));
  const aar = thursday.getUTCFullYear();
  const first = new Date(Date.UTC(aar, 0, 4));
  const firstThursday = new Date(first); firstThursday.setUTCDate(first.getUTCDate() + 3 - ((first.getUTCDay() + 6) % 7));
  const uge = 1 + Math.round((thursday - firstThursday) / 604800000);
  return isoUgeInterval(aar, uge);
}

export function periodeInterval(periode) {
  if (!periode || periode.art === PERIODEART.UDEN_DATO_OENSKE) return null;
  if (periode.art === PERIODEART.ISO_UGE) return isoUgeInterval(Number(periode.aar), Number(periode.uge));
  if (periode.art === PERIODEART.DATO_INTERVAL) return dateValue(periode.fraDato) && dateValue(periode.tilDato) && periode.fraDato <= periode.tilDato ? { fra: periode.fraDato, til: periode.tilDato } : null;
  return dateValue(periode.dato) ? { fra: periode.dato, til: periode.dato } : null;
}

export function validerBestillingsperiode(periode) {
  if (!periode || periode.art === PERIODEART.UDEN_DATO_OENSKE) return [];
  const findings = [];
  if (!Object.values(PERIODEART).includes(periode.art) || !Object.values(PERIODENIVEAU).includes(periode.niveau)) findings.push({ code: PLANFUND.PERIODE_UGYLDIG, text: "Bestillerens periodetype eller kravsniveau er ugyldigt." });
  if (!periodeInterval(periode)) findings.push({ code: PLANFUND.PERIODE_UGYLDIG, text: "Bestillerens dato, ISO-uge eller datointerval er ugyldigt." });
  if ([PERIODEART.DATO_TID, PERIODEART.TIDSVINDUE].includes(periode.art) && timeToMinutes(periode.tid || periode.fra) == null) findings.push({ code: PLANFUND.PERIODE_UGYLDIG, text: "Bestillerens klokkeslæt er ugyldigt." });
  if (periode.art === PERIODEART.TIDSVINDUE && (timeToMinutes(periode.til) == null || timeToMinutes(periode.fra) >= timeToMinutes(periode.til))) findings.push({ code: PLANFUND.PERIODE_UGYLDIG, text: "Bestillerens tidsvindue er ugyldigt." });
  return findings;
}

export function periodeOverlapperUger(periode, uger, { medUdenDato = false } = {}) {
  if (!periode || periode.art === PERIODEART.UDEN_DATO_OENSKE) return medUdenDato;
  const interval = periodeInterval(periode); if (!interval) return false;
  return uger.some((uge) => { const value = typeof uge === "string" ? /^([0-9]{4})-W([0-9]{2})$/.exec(uge) : null; const target = value ? isoUgeInterval(Number(value[1]), Number(value[2])) : uge; return target && interval.fra <= target.til && target.fra <= interval.til; });
}

export function filtrerOpgaverEfterUger(opgaver, uger, options) {
  return clone(opgaver).filter((task) => periodeOverlapperUger(task.requestPeriod, uger, options));
}

export function validerPlaceringsforslag(state, proposal) {
  const findings = [];
  const task = state.tasks.find((item) => item.id === proposal.taskId);
  const resource = state.resources.find((item) => item.id === proposal.resourceId && item.type === proposal.resourceType);
  const start = timeToMinutes(proposal.startTime);
  const duration = Number(proposal.durationMin);
  if (!task) findings.push({ code: PLANFUND.OPGAVE_UKENDT, text: "Opgaven findes ikke." });
  if (!datePattern.test(proposal.date || "") || start == null || !Number.isInteger(duration) || duration <= 0) findings.push({ code: PLANFUND.DATO_UGYLDIG, text: "Dato, starttid eller varighed er ugyldig." });
  if (!resource) findings.push({ code: PLANFUND.RESSOURCE_UKENDT, text: "Den valgte ressource findes ikke." });
  if (!task || !resource || findings.length) return findings;
  if (proposal.date < task.allowedFrom || proposal.date > task.allowedTo) findings.push({ code: PLANFUND.DATO_UDEN_FOR_PERIODE, text: "Placeringen ligger uden for opgavens tilladte periode." });
  const periodefund = validerBestillingsperiode(task.requestPeriod);
  findings.push(...periodefund);
  const requestInterval = periodeInterval(task.requestPeriod);
  const outsideRequest = requestInterval && (proposal.date < requestInterval.fra || proposal.date > requestInterval.til);
  if (outsideRequest) findings.push({ code: task.requestPeriod.niveau === PERIODENIVEAU.SKAL_OVERHOLDES ? PLANFUND.BESTILLERKRAV_BRUDT : PLANFUND.BESTILLEROENSKE_AFVIGER, level: task.requestPeriod.niveau === PERIODENIVEAU.SKAL_OVERHOLDES ? "HARD" : "WARNING", text: task.requestPeriod.niveau === PERIODENIVEAU.SKAL_OVERHOLDES ? "Placeringen ligger uden for bestillerens bindende periode." : "Placeringen afviger fra bestillerens ønske; alternativet er ikke accepteret." });
  if (task.requestPeriod?.art === PERIODEART.DATO_TID && proposal.date === task.requestPeriod.dato && start !== timeToMinutes(task.requestPeriod.tid)) findings.push({ code: task.requestPeriod.niveau === PERIODENIVEAU.SKAL_OVERHOLDES ? PLANFUND.BESTILLERKRAV_BRUDT : PLANFUND.BESTILLEROENSKE_AFVIGER, level: task.requestPeriod.niveau === PERIODENIVEAU.SKAL_OVERHOLDES ? "HARD" : "WARNING", text: "Placeringen afviger fra bestillerens klokkeslæt." });
  if (task.requestPeriod?.art === PERIODEART.TIDSVINDUE && proposal.date === task.requestPeriod.dato && (start < timeToMinutes(task.requestPeriod.fra) || start + duration > timeToMinutes(task.requestPeriod.til))) findings.push({ code: task.requestPeriod.niveau === PERIODENIVEAU.SKAL_OVERHOLDES ? PLANFUND.BESTILLERKRAV_BRUDT : PLANFUND.BESTILLEROENSKE_AFVIGER, level: task.requestPeriod.niveau === PERIODENIVEAU.SKAL_OVERHOLDES ? "HARD" : "WARNING", text: "Placeringen ligger uden for bestillerens tidsvindue." });
  if (task.timeWindow) {
    const from = timeToMinutes(task.timeWindow.from); const to = timeToMinutes(task.timeWindow.to);
    if (start < from || start + duration > to) findings.push({ code: PLANFUND.TIDSVINDUE_UMULIGT, text: "Start og varighed kan ikke rummes i tidsvinduet." });
  }
  const capabilities = resource.capabilities || {};
  if (task.requiredSkill && !(capabilities.skills || []).includes(task.requiredSkill)) findings.push({ code: PLANFUND.KOMPETENCE_MANGLER, text: `Kompetencen ${task.requiredSkill} mangler.` });
  if (task.requiredVehicleType && capabilities.vehicleType !== task.requiredVehicleType) findings.push({ code: PLANFUND.KOERETOEJSTYPE_FORKERT, text: `Kræver køretøjstype ${task.requiredVehicleType}.` });
  if (task.requiredCapacity && Number(capabilities.capacity || 0) < task.requiredCapacity) findings.push({ code: PLANFUND.KAPACITET_UTILSTRAEKKELIG, text: `Kræver kapacitet ${task.requiredCapacity}.` });
  if (!Number.isInteger(task.returnTravelMin) || task.returnTravelMin < 0) findings.push({ code: PLANFUND.RETURKOERSEL_MANGLER, text: "Nødvendig returkørsel mangler." });
  const order = (task.stops || []).map((stop) => stop.order);
  if (new Set(order).size !== order.length || order.some((item) => !Number.isInteger(item) || item <= 0)) findings.push({ code: PLANFUND.STOPRAEKKEFOELGE_UGYLDIG, text: "Flerstop-rækkefølgen er ugyldig." });
  const pickup = (task.stops || []).find((stop) => stop.type === "AFHENTNING"); const delivery = (task.stops || []).find((stop) => stop.type === "LEVERING");
  if (pickup && delivery && pickup.order >= delivery.order) findings.push({ code: PLANFUND.STOPRAEKKEFOELGE_UGYLDIG, text: "Afhentning skal ligge før levering." });
  const end = start + duration + task.returnTravelMin;
  const conflict = state.placements.find((item) => item.id !== proposal.placementId && item.date === proposal.date && item.resourceType === proposal.resourceType && item.resourceId === proposal.resourceId && overlap(start, end, timeToMinutes(item.startTime), timeToMinutes(item.startTime) + item.durationMin + item.returnTravelMin));
  if (conflict) findings.push({ code: PLANFUND.RESSOURCEKONFLIKT, text: `Konflikt med ${conflict.taskName}.` });
  return findings;
}

export function placerForeloebigt(state, proposal, { placementId, timestamp } = {}) {
  const original = clone(state); const findings = validerPlaceringsforslag(original, proposal);
  if (findings.some((finding) => finding.level !== "WARNING")) return { ok: false, state: original, findings };
  const task = original.tasks.find((item) => item.id === proposal.taskId);
  const existing = original.placements.find((item) => item.id === proposal.placementId);
  const placement = { id: proposal.placementId || placementId, taskId: task.id, taskName: task.name, date: proposal.date, resourceType: proposal.resourceType, resourceId: proposal.resourceId, startTime: proposal.startTime, durationMin: Number(proposal.durationMin), returnTravelMin: task.returnTravelMin, status: PLANSTATUS.KLADDE, final: false, warning: findings.length > 0, changedAt: timestamp, stops: clone(task.stops), requestPeriodSnapshot: clone(task.requestPeriod || { art: PERIODEART.UDEN_DATO_OENSKE, niveau: PERIODENIVEAU.OENSKET }) };
  const changed = existing && snapshotKey(placementSnapshot(existing)) !== snapshotKey(placementSnapshot(placement));
  if (existing && !changed) return { ok: true, duplicate: true, state: original, placement: existing, findings };
  const confirmation = changed && task.confirmation?.currentProposalId ? { ...task.confirmation, currentProposalId: null, proposals: task.confirmation.proposals.map((item) => item.id === task.confirmation.currentProposalId ? { ...item, status: FORSLAGSSTATUS.ERSTATTET, replacedAt: timestamp } : item) } : task.confirmation;
  const placements = proposal.placementId ? original.placements.map((item) => item.id === proposal.placementId ? placement : item) : [...original.placements, placement];
  return { ok: true, state: { ...original, placements, tasks: original.tasks.map((item) => item.id === task.id ? { ...item, status: PLANSTATUS.KLADDE, confirmation } : item), revision: original.revision + 1 }, placement, findings };
}

export function fjernPlacering(state, placementId) {
  const original = clone(state); const placement = original.placements.find((item) => item.id === placementId);
  if (!placement) return original;
  return { ...original, placements: original.placements.filter((item) => item.id !== placementId), tasks: original.tasks.map((task) => task.id === placement.taskId ? { ...task, status: PLANSTATUS.I_KOE, confirmation: task.confirmation?.currentProposalId ? { ...task.confirmation, currentProposalId: null, proposals: task.confirmation.proposals.map((item) => item.id === task.confirmation.currentProposalId ? { ...item, status: FORSLAGSSTATUS.ERSTATTET } : item) } : task.confirmation } : task), revision: original.revision + 1 };
}

export function sendTilBekraeftelse(state, placementId, { timestamp, messageId, proposalId } = {}) {
  const original = clone(state); const placement = original.placements.find((item) => item.id === placementId);
  const task = placement && original.tasks.find((item) => item.id === placement.taskId);
  if (!placement || !task) return { ok: false, state: original, findings: [{ code: BEKRAEFTELSESFUND.PLACERING_UGYLDIG, text: "Placeringen findes ikke." }] };
  const findings = validerPlaceringsforslag(original, { ...placement, placementId: placement.id });
  if (findings.some((finding) => finding.level !== "WARNING")) return { ok: false, state: original, findings };
  const snapshot = placementSnapshot(placement);
  const active = task.confirmation?.proposals?.find((item) => item.id === task.confirmation.currentProposalId);
  if (active && snapshotKey(active.placement) === snapshotKey(snapshot) && [FORSLAGSSTATUS.AFVENTER, FORSLAGSSTATUS.BEKRAEFTET].includes(active.status)) return { ok: true, duplicate: true, proposal: active, message: active.message, state: original, findings };
  const version = Number(task.confirmation?.latestVersion || 0) + 1;
  const id = proposalId || `proposal-${task.id}-v${version}`;
  const message = proposalMessage(placement);
  const proposal = { id, version, status: FORSLAGSSTATUS.AFVENTER, createdAt: timestamp, placement: snapshot, message };
  const previous = (task.confirmation?.proposals || []).map((item) => item.id === task.confirmation?.currentProposalId ? { ...item, status: FORSLAGSSTATUS.ERSTATTET, replacedAt: timestamp } : item);
  const confirmation = { latestVersion: version, currentProposalId: id, proposals: [...previous, proposal] };
  const threadEntry = { id: messageId || `thread-${id}`, kind: "PLANFORSLAG", timestamp, text: message, synthetic: true, proposalId: id, proposalVersion: version };
  return { ok: true, proposal, message, findings, state: { ...original, placements: original.placements.map((item) => item.id === placementId ? { ...item, status: PLANSTATUS.AFVENTER_BEKRAEFTELSE, final: false, warning: false, proposalId: id, proposalVersion: version } : item), tasks: original.tasks.map((item) => item.id === task.id ? { ...item, status: PLANSTATUS.AFVENTER_BEKRAEFTELSE, confirmation, thread: appendUnique(item.thread, threadEntry) } : item), revision: original.revision + 1 } };
}

export function markerPlanlagtOgTilfoejBesked(state, placementId, options = {}) {
  return sendTilBekraeftelse(state, placementId, options);
}

export function findAktueltForslag(task) {
  return clone(task?.confirmation?.proposals?.find((item) => item.id === task.confirmation.currentProposalId) || null);
}

export function bekraeftForslag(state, taskId, { proposalId, version, timestamp, messageId, notificationId } = {}) {
  const original = clone(state); const task = original.tasks.find((item) => item.id === taskId); const active = task && task.confirmation?.proposals?.find((item) => item.id === task.confirmation.currentProposalId);
  if (!task || !active) return { ok: false, state: original, code: BEKRAEFTELSESFUND.FORSLAG_MANGLER, text: "Der findes ikke et aktivt forslag." };
  if (active.id !== proposalId || active.version !== Number(version)) return { ok: false, stale: true, state: original, code: BEKRAEFTELSESFUND.FORSLAG_FORAELDET, text: "Forslaget er forældet. Åbn det nyeste forslag." };
  if (active.status === FORSLAGSSTATUS.BEKRAEFTET) return { ok: true, duplicate: true, state: original, proposal: active };
  if (active.status !== FORSLAGSSTATUS.AFVENTER) return { ok: false, stale: true, state: original, code: BEKRAEFTELSESFUND.FORSLAG_FORAELDET, text: "Forslaget er ikke længere aktuelt. Åbn det nyeste forslag." };
  const placement = original.placements.find((item) => item.id === active.placement.placementId);
  if (!placement || snapshotKey(placementSnapshot(placement)) !== snapshotKey(active.placement)) return { ok: false, stale: true, state: original, code: BEKRAEFTELSESFUND.FORSLAG_FORAELDET, text: "Placeringen er ændret. Åbn det nyeste forslag." };
  const threadEntry = { id: messageId || `thread-confirm-${active.id}`, kind: "BESTILLER_BEKRAEFTELSE", timestamp, text: `Bestilleren bekræftede forslag version ${active.version}.`, synthetic: true, proposalId: active.id, proposalVersion: active.version };
  const notification = { id: notificationId || `notification-confirm-${active.id}`, type: "TIDSPUNKT_BEKRAEFTET", title: "Tidspunkt bekræftet", text: `${task.name} · ${placement.date} kl. ${placement.startTime.replace(":", ".")}`, taskId, placementId: placement.id, proposalId: active.id, proposalVersion: active.version, date: placement.date, resourceId: placement.resourceId, read: false, createdAt: timestamp };
  return { ok: true, proposal: { ...active, status: FORSLAGSSTATUS.BEKRAEFTET }, state: { ...original, tasks: original.tasks.map((item) => item.id === taskId ? { ...item, status: PLANSTATUS.BEKRAEFTET, confirmation: { ...item.confirmation, proposals: item.confirmation.proposals.map((proposal) => proposal.id === active.id ? { ...proposal, status: FORSLAGSSTATUS.BEKRAEFTET, confirmedAt: timestamp } : proposal) }, thread: appendUnique(item.thread, threadEntry) } : item), placements: original.placements.map((item) => item.id === placement.id ? { ...item, status: PLANSTATUS.BEKRAEFTET, final: true, warning: false } : item), notifications: appendUnique(original.notifications || [], notification), revision: original.revision + 1 } };
}

export function registrerAendringOensket(state, taskId, { timestamp, messageId, notificationId, proposalId, version, text, alternativeDate = null, alternativeTime = null } = {}) {
  const original = clone(state); const task = original.tasks.find((item) => item.id === taskId);
  if (!task) return { ok: false, state: original };
  const active = task.confirmation?.proposals?.find((item) => item.id === task.confirmation.currentProposalId);
  if (proposalId && (!active || active.id !== proposalId || active.version !== Number(version))) return { ok: false, stale: true, state: original, code: BEKRAEFTELSESFUND.FORSLAG_FORAELDET, text: "Forslaget er forældet. Åbn det nyeste forslag." };
  const entryId = messageId || `thread-change-${active?.id || taskId}`;
  if (task.thread.some((entry) => entry.id === entryId)) return { ok: true, duplicate: true, state: original };
  const threadEntry = { id: entryId, kind: "AENDRING_OENSKET", timestamp, text, synthetic: true, proposalId: active?.id || null, proposalVersion: active?.version || null, alternativeDate, alternativeTime };
  const placement = original.placements.find((item) => item.taskId === taskId);
  const notification = { id: notificationId || `notification-change-${active?.id || taskId}`, type: "AENDRING_OENSKET", title: "Ændring ønsket", text: `${task.name} · ${text}`, taskId, placementId: placement?.id || null, proposalId: active?.id || null, proposalVersion: active?.version || null, date: placement?.date || alternativeDate, resourceId: placement?.resourceId || null, read: false, createdAt: timestamp };
  return { ok: true, state: { ...original, tasks: original.tasks.map((item) => item.id === taskId ? { ...item, status: PLANSTATUS.AENDRING_OENSKET, confirmation: active ? { ...item.confirmation, proposals: item.confirmation.proposals.map((proposal) => proposal.id === active.id ? { ...proposal, status: FORSLAGSSTATUS.AENDRING_OENSKET, answeredAt: timestamp, alternativeDate, alternativeTime } : proposal) } : item.confirmation, thread: appendUnique(item.thread, threadEntry) } : item), placements: original.placements.map((item) => item.taskId === taskId ? { ...item, status: PLANSTATUS.AENDRING_OENSKET, final: false, warning: true } : item), notifications: appendUnique(original.notifications || [], notification), revision: original.revision + 1 } };
}

export function markerNotifikationLaest(state, notificationId) {
  const original = clone(state); const notification = (original.notifications || []).find((item) => item.id === notificationId);
  if (!notification || notification.read) return original;
  return { ...original, notifications: original.notifications.map((item) => item.id === notificationId ? { ...item, read: true } : item), revision: original.revision + 1 };
}

export function alleStopErBevaret(state) {
  const planned = state.placements.flatMap((placement) => placement.stops.map((stop) => `${placement.taskId}:${stop.id}`));
  return planned.length === new Set(planned).size;
}

export { opretDemoPlanlaegning } from "./demo-planning-scheduling.js";
