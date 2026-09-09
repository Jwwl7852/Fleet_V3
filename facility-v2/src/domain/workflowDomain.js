import { DomainValidationError, RevisionConflictError, getLocationPath } from './facilityDomain';

export const CASE_STATUSES = {
  new: 'Ny', triage: 'Under vurdering', ready: 'Klar til udførelse', inProgress: 'I gang',
  awaitingInvoice: 'Afventer fakturaafklaring', closed: 'Lukket',
};
export const PRIORITIES = { acute: 'Akut', high: 'Høj', normal: 'Normal', low: 'Lav' };
export const TASK_STATUSES = { planned: 'Planlagt', ready: 'Klar', inProgress: 'I gang', completed: 'Afsluttet', cancelled: 'Annulleret' };
export const DOCUMENT_RELATION_TYPES = ['property', 'location', 'installation', 'report', 'case', 'task', 'servicePlan', 'serviceOccurrence'];

const clone = (value) => structuredClone(value);
const clean = (value) => String(value ?? '').trim();
const iso = (options = {}) => (options.now ? options.now() : new Date()).toISOString();
const makeId = (prefix, options = {}) => `${prefix}-${options.createId ? options.createId() : crypto.randomUUID()}`;
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const openTask = (task) => !['completed', 'cancelled'].includes(task.status);

function assertRevision(entity, revision, type) {
  if (!entity) throw new DomainValidationError('Posten blev ikke fundet.');
  if (entity.revision !== revision) throw new RevisionConflictError(type, entity.id, entity);
}

function sequence(items, field, prefix, width = 5) {
  const highest = items.reduce((max, item) => {
    const match = new RegExp(`^${prefix}-(\\d+)`, 'i').exec(item[field] ?? '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(width, '0')}`;
}

function history(next, entityType, entity, action, options = {}, details = {}) {
  next.history.push({
    id: makeId('history', options), entityType, entityId: entity.id, timestamp: iso(options), action,
    changes: details.changes ?? [], reason: clean(details.reason),
    actor: { id: 'local-demo-actor', name: 'Lokal demoaktør', verified: false },
    snapshot: details.snapshot ?? { name: entity.name ?? entity.title, number: entity.number ?? entity.reference ?? entity.taskNumber },
  });
}

function validateTarget(next, propertyId, locationId, installationId, affectedAreaIds = []) {
  const property = next.properties.find((item) => item.id === propertyId);
  if (!property || property.archivedAt) throw new DomainValidationError('Vælg en aktiv ejendom.', { propertyId: 'Ejendommen mangler eller er arkiveret.' });
  const location = locationId ? next.locationNodes.find((item) => item.id === locationId) : null;
  if (locationId && (!location || location.archivedAt || location.propertyId !== propertyId)) throw new DomainValidationError('Den valgte placering er ikke gyldig.', { locationId: 'Placeringen mangler, er arkiveret eller tilhører en anden ejendom.' });
  const installation = installationId ? next.installations.find((item) => item.id === installationId) : null;
  if (installationId && (!installation || installation.archivedAt || installation.propertyId !== propertyId)) throw new DomainValidationError('Den valgte installation er ikke gyldig.', { installationId: 'Installationen mangler, er arkiveret eller tilhører en anden ejendom.' });
  for (const id of unique(affectedAreaIds)) {
    if (id === `property:${propertyId}`) continue;
    const area = next.locationNodes.find((item) => item.id === id);
    if (!area || area.archivedAt || area.propertyId !== propertyId) throw new DomainValidationError('Et påvirket område er ugyldigt.', { affectedAreaIds: 'Vælg kun aktive områder på samme ejendom.' });
  }
  return { property, location, installation };
}

function validateVersionIds(next, versionIds = []) {
  const all = new Set(next.documents.flatMap((document) => document.versions.map((version) => version.id)));
  const missing = unique(versionIds).filter((id) => !all.has(id));
  if (missing.length) throw new DomainValidationError('En valgt dokumentversion findes ikke længere.', { attachmentVersionIds: 'Vælg bilagene igen.' });
  return unique(versionIds);
}

export function submitReport(dataset, input, options = {}) {
  const next = clone(dataset); const key = clean(input.submissionKey);
  if (!key) throw new DomainValidationError('Indsendelsesnøglen mangler. Genindlæs formularen og prøv igen.');
  const prior = next.reportSubmissions.find((item) => item.key === key);
  if (prior) return { dataset: next, report: next.reports.find((item) => item.id === prior.reportId), caseRecord: next.cases.find((item) => item.id === prior.caseId), duplicate: true };
  if (!clean(input.title)) throw new DomainValidationError('Udfyld en kort titel.', { title: 'Titlen er påkrævet.' });
  if (!clean(input.description)) throw new DomainValidationError('Beskriv problemet.', { description: 'Beskrivelsen er påkrævet.' });
  const target = validateTarget(next, input.propertyId, input.locationId, input.installationId, input.affectedAreaIds);
  const report = {
    id: makeId('report', options), reference: sequence(next.reports, 'reference', 'IND'), submissionKey: key,
    caseId: null, source: input.source ?? 'desktop', propertyId: input.propertyId, locationId: input.locationId || null,
    installationId: input.installationId || null, title: clean(input.title), description: clean(input.description),
    category: clean(input.category) || 'Andet', reporterSeverity: input.reporterSeverity ?? 'medium',
    observedAt: input.observedAt || iso(options), affectedAreaIds: unique(input.affectedAreaIds),
    contactName: clean(input.contactName), contactEmail: clean(input.contactEmail), contactPhone: clean(input.contactPhone),
    attachmentVersionIds: validateVersionIds(next, input.attachmentVersionIds), status: 'received', createdAt: iso(options), revision: 1,
  };
  const caseRecord = {
    id: makeId('case', options), reference: sequence(next.cases, 'reference', 'FAC'), reportId: report.id,
    source: input.source === 'service' ? 'Automatisk oprettet fra Service' : 'Oprettet fra indberetning',
    title: report.title, description: report.description, propertyId: report.propertyId, locationId: report.locationId,
    installationId: report.installationId, historicalLocationSnapshot: `${target.property.name}${report.locationId ? ` · ${getLocationPath(next, report.propertyId, report.locationId)}` : ''}`,
    status: 'new', priority: 'normal', category: report.category, responsibleId: '', dueDate: '', notes: '',
    attachmentVersionIds: [...report.attachmentVersionIds], invoiceResolution: { status: 'unavailable', source: '', timestamp: '' },
    closedAt: null, closureReason: '', revision: 1, createdAt: iso(options),
  };
  report.caseId = caseRecord.id; next.reports.push(report); next.cases.push(caseRecord);
  next.reportSubmissions.push({ key, reportId: report.id, caseId: caseRecord.id, createdAt: iso(options) });
  history(next, 'report', report, 'Indberetning modtaget', options, { snapshot: { title: report.title, reference: report.reference, locationPath: caseRecord.historicalLocationSnapshot } });
  history(next, 'case', caseRecord, 'Sag oprettet', options, { snapshot: { title: caseRecord.title, reference: caseRecord.reference, locationPath: caseRecord.historicalLocationSnapshot } });
  return { dataset: next, report, caseRecord, duplicate: false };
}

export function createManualCase(dataset, input, options = {}) {
  const next = clone(dataset); if (!clean(input.title)) throw new DomainValidationError('Titlen er påkrævet.', { title: 'Udfyld titel.' });
  const target = validateTarget(next, input.propertyId, input.locationId, input.installationId);
  const entity = { id: makeId('case', options), reference: sequence(next.cases, 'reference', 'FAC'), reportId: null, source: 'Manuelt oprettet sag', title: clean(input.title), description: clean(input.description), propertyId: input.propertyId, locationId: input.locationId || null, installationId: input.installationId || null, historicalLocationSnapshot: `${target.property.name}${input.locationId ? ` · ${getLocationPath(next, input.propertyId, input.locationId)}` : ''}`, status: 'triage', priority: input.priority ?? 'normal', category: clean(input.category) || 'Andet', responsibleId: input.responsibleId || '', dueDate: input.dueDate || '', notes: clean(input.notes), attachmentVersionIds: validateVersionIds(next, input.attachmentVersionIds), invoiceResolution: { status: 'unavailable', source: '', timestamp: '' }, closedAt: null, closureReason: '', revision: 1, createdAt: iso(options) };
  next.cases.push(entity); history(next, 'case', entity, 'Manuel sag oprettet', options, { snapshot: { title: entity.title, reference: entity.reference, locationPath: entity.historicalLocationSnapshot } }); return { dataset: next, entity };
}

export function updateCase(dataset, id, revision, input, options = {}) {
  const next = clone(dataset); const index = next.cases.findIndex((item) => item.id === id); const before = next.cases[index]; assertRevision(before, revision, 'case');
  const status = input.status ?? before.status; if (!CASE_STATUSES[status]) throw new DomainValidationError('Vælg en gyldig sagsstatus.');
  if (status !== before.status && !clean(input.statusReason)) throw new DomainValidationError('Begrund statusændringen.', { statusReason: 'Begrundelsen er påkrævet.' });
  const after = { ...before, priority: input.priority ?? before.priority, category: clean(input.category ?? before.category), responsibleId: input.responsibleId ?? before.responsibleId, dueDate: input.dueDate ?? before.dueDate, notes: clean(input.notes ?? before.notes), status, revision: before.revision + 1 };
  next.cases[index] = after; if (before.reportId) { const report = next.reports.find((item) => item.id === before.reportId); if (report) { report.status = status === 'new' ? 'received' : 'triaged'; report.revision += 1; } }
  history(next, 'case', after, status !== before.status ? 'Sagsstatus ændret' : 'Triage opdateret', options, { reason: input.statusReason, changes: ['priority', 'category', 'responsibleId', 'dueDate', 'notes', 'status'].filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])).map((field) => ({ field, before: before[field] ?? '', after: after[field] ?? '' })), snapshot: { title: after.title, reference: after.reference, locationPath: after.historicalLocationSnapshot } });
  return { dataset: next, entity: after };
}

export function createTask(dataset, input, options = {}) {
  const next = clone(dataset); const caseRecord = input.caseId ? next.cases.find((item) => item.id === input.caseId) : null;
  if (input.caseId && !caseRecord) throw new DomainValidationError('Sagen blev ikke fundet.');
  if (!clean(input.title)) throw new DomainValidationError('Opgavetitlen er påkrævet.', { title: 'Udfyld titel.' });
  const assignmentType = input.assignmentType ?? 'internal';
  if (assignmentType === 'internal' && !input.resourceId) throw new DomainValidationError('Vælg en intern ressource.', { resourceId: 'Vælg ressource.' });
  if (assignmentType === 'external' && !input.supplierId) throw new DomainValidationError('Vælg en leverandør.', { supplierId: 'Vælg leverandør.' });
  if (assignmentType === 'external' && input.manualWithoutMail && !clean(input.manualWithoutMailReason)) throw new DomainValidationError('Begrund manuel håndtering uden mail.', { manualWithoutMailReason: 'Begrundelsen er påkrævet.' });
  const base = caseRecord ?? { propertyId: input.propertyId, installationId: input.installationId };
  const entity = { id: makeId('task', options), taskNumber: sequence(next.tasks, 'taskNumber', 'OPG'), orderNumber: assignmentType === 'external' ? sequence(next.tasks, 'orderNumber', 'BST') : '', title: clean(input.title), description: clean(input.description), caseId: caseRecord?.id ?? null, propertyId: base.propertyId, installationId: input.installationId ?? base.installationId ?? null, assignmentType, assigneeId: assignmentType === 'internal' ? input.resourceId : '', resourceId: assignmentType === 'internal' ? input.resourceId : input.resourceId || '', supplierId: assignmentType === 'external' ? input.supplierId : null, contactId: input.contactId || null, manualWithoutMail: assignmentType === 'external' && Boolean(input.manualWithoutMail), manualWithoutMailReason: assignmentType === 'external' && input.manualWithoutMail ? clean(input.manualWithoutMailReason) : '', dueDate: input.dueDate || '', priority: input.priority ?? caseRecord?.priority ?? 'normal', status: 'planned', amountType: input.amountType ?? 'estimate', amount: input.amount === '' || input.amount === null || input.amount === undefined ? null : Number(input.amount), currency: 'DKK', attachmentVersionIds: validateVersionIds(next, input.attachmentVersionIds), workLogs: [], timeEntries: [], materials: [], checklist: (input.checklist ?? []).filter(Boolean).map((label) => ({ id: makeId('check', options), label: clean(label), done: false })), solution: '', remainingRestrictions: '', startedAt: '', completedAt: '', acceptance: null, mailDraft: null, revision: 1 };
  next.tasks.push(entity); history(next, 'task', entity, 'Opgave oprettet', options, { snapshot: { title: entity.title, taskNumber: entity.taskNumber, orderNumber: entity.orderNumber } }); return { dataset: next, entity };
}

export function updateTask(dataset, id, revision, input, options = {}) {
  const next = clone(dataset); const index = next.tasks.findIndex((item) => item.id === id); const before = next.tasks[index]; assertRevision(before, revision, 'task');
  const after = { ...before, ...input, id: before.id, taskNumber: before.taskNumber, orderNumber: before.orderNumber, propertyId: before.propertyId, caseId: before.caseId, attachmentVersionIds: input.attachmentVersionIds ? validateVersionIds(next, input.attachmentVersionIds) : before.attachmentVersionIds, revision: before.revision + 1 };
  next.tasks[index] = after; history(next, 'task', after, 'Opgave opdateret', options, { reason: input.reason, snapshot: { title: after.title, taskNumber: after.taskNumber, orderNumber: after.orderNumber } }); return { dataset: next, entity: after };
}

export function saveMailDraft(dataset, taskId, revision, input, options = {}) {
  const next = clone(dataset); const index = next.tasks.findIndex((item) => item.id === taskId); const before = next.tasks[index]; assertRevision(before, revision, 'task');
  if (!clean(input.to) || !clean(input.subject) || !clean(input.body)) throw new DomainValidationError('Modtager, emne og besked skal udfyldes.');
  const mailDraft = { id: before.mailDraft?.id ?? makeId('mail-draft', options), version: (before.mailDraft?.version ?? 0) + 1, to: clean(input.to), cc: clean(input.cc), subject: clean(input.subject), body: clean(input.body), attachmentVersionIds: validateVersionIds(next, input.attachmentVersionIds), status: 'draft', savedAt: iso(options) };
  const after = { ...before, mailDraft, revision: before.revision + 1 }; next.tasks[index] = after; history(next, 'task', after, 'Mailkladde gemt – ikke afsendt', options, { snapshot: { taskNumber: after.taskNumber, orderNumber: after.orderNumber, mailDraftVersion: mailDraft.version } }); return { dataset: next, entity: after };
}

export function recordSupplierAcceptance(dataset, taskId, revision, source, options = {}) {
  if (!clean(source)) throw new DomainValidationError('Angiv kilden til leverandørens accept.', { source: 'Kilden er påkrævet.' });
  return updateTask(dataset, taskId, revision, { acceptance: { source: clean(source), recordedAt: iso(options) }, reason: 'Leverandøraccept registreret eksplicit' }, options);
}

export function createBooking(dataset, input, options = {}) {
  const next = clone(dataset); const task = next.tasks.find((item) => item.id === input.taskId); if (!task) throw new DomainValidationError('Opgaven blev ikke fundet.');
  const start = new Date(input.startAt); const end = new Date(input.endAt); if (!(start < end)) throw new DomainValidationError('Sluttidspunkt skal være efter starttidspunkt.');
  const conflicts = input.resourceId ? next.bookings.filter((item) => item.status !== 'cancelled' && item.resourceId === input.resourceId && new Date(item.startAt) < end && new Date(item.endAt) > start) : [];
  const entity = { id: makeId('booking', options), taskId: task.id, caseId: task.caseId, propertyId: task.propertyId, resourceId: input.resourceId || null, supplierId: input.supplierId || task.supplierId || null, startAt: start.toISOString(), endAt: end.toISOString(), status: 'planned', note: clean(input.note), capacityStatus: input.resourceId ? (conflicts.length ? 'conflict' : 'verifiedNoConflict') : 'notVerified', revision: 1 };
  next.bookings.push(entity); history(next, 'booking', entity, 'Booking oprettet', options, { snapshot: { taskNumber: task.taskNumber, startAt: entity.startAt, endAt: entity.endAt } }); return { dataset: next, entity, conflicts };
}

export function updateBooking(dataset, id, revision, input, options = {}) {
  const next = clone(dataset); const index = next.bookings.findIndex((item) => item.id === id); const before = next.bookings[index]; assertRevision(before, revision, 'booking');
  const start = new Date(input.startAt ?? before.startAt); const end = new Date(input.endAt ?? before.endAt); if (!(start < end)) throw new DomainValidationError('Sluttidspunkt skal være efter starttidspunkt.');
  const resourceId = input.resourceId ?? before.resourceId; const conflicts = resourceId ? next.bookings.filter((item) => item.id !== id && item.status !== 'cancelled' && item.resourceId === resourceId && new Date(item.startAt) < end && new Date(item.endAt) > start) : [];
  const after = { ...before, ...input, startAt: start.toISOString(), endAt: end.toISOString(), capacityStatus: resourceId ? (conflicts.length ? 'conflict' : 'verifiedNoConflict') : 'notVerified', revision: before.revision + 1 }; next.bookings[index] = after; history(next, 'booking', after, after.status === 'cancelled' ? 'Booking annulleret' : 'Booking ændret', options, { reason: input.reason, snapshot: { startAt: after.startAt, endAt: after.endAt } }); return { dataset: next, entity: after, conflicts };
}

export function appendWork(dataset, taskId, revision, operation, input, options = {}) {
  const next = clone(dataset); const index = next.tasks.findIndex((item) => item.id === taskId); const before = next.tasks[index]; assertRevision(before, revision, 'task'); let after = clone(before);
  if (operation === 'start') { after.status = 'inProgress'; after.startedAt ||= iso(options); }
  if (operation === 'log') after.workLogs.push({ id: makeId('worklog', options), timestamp: iso(options), resourceId: input.resourceId || before.resourceId, note: clean(input.note) });
  if (operation === 'time') { const hours = Number(input.hours); if (!(hours > 0)) throw new DomainValidationError('Timer skal være større end nul.'); after.timeEntries.push({ id: makeId('time', options), date: input.date, resourceId: input.resourceId, hours, hourlyCost: input.hourlyCost === '' ? null : Number(input.hourlyCost) }); }
  if (operation === 'material') { const quantity = Number(input.quantity); const unitPrice = input.unitPrice === '' ? null : Number(input.unitPrice); if (!(quantity > 0)) throw new DomainValidationError('Antal skal være større end nul.'); after.materials.push({ id: makeId('material', options), name: clean(input.name), quantity, unit: clean(input.unit), unitPrice, total: unitPrice === null ? null : quantity * unitPrice }); }
  if (operation === 'check') after.checklist = after.checklist.map((item) => item.id === input.id ? { ...item, done: !item.done } : item);
  if (operation === 'complete') { if (!clean(input.solution)) throw new DomainValidationError('Beskriv løsningen, før arbejdet afsluttes.', { solution: 'Løsningsbeskrivelse er påkrævet.' }); if (!input.restrictionDecision) throw new DomainValidationError('Tag stilling til resterende begrænsninger.', { restrictionDecision: 'Vælg om der er resterende begrænsninger.' }); after = { ...after, status: 'completed', completedAt: iso(options), solution: clean(input.solution), remainingRestrictions: input.restrictionDecision === 'none' ? 'Ingen resterende begrænsninger registreret for denne opgave.' : clean(input.remainingRestrictions) }; if (input.restrictionDecision === 'remaining' && !clean(input.remainingRestrictions)) throw new DomainValidationError('Beskriv de resterende begrænsninger.', { remainingRestrictions: 'Beskrivelse er påkrævet.' }); }
  after.revision = before.revision + 1; next.tasks[index] = after;
  if (after.caseId && operation === 'start') { const caseIndex = next.cases.findIndex((item) => item.id === after.caseId); if (caseIndex >= 0 && !['closed', 'inProgress'].includes(next.cases[caseIndex].status)) { next.cases[caseIndex].status = 'inProgress'; next.cases[caseIndex].revision += 1; } }
  history(next, 'task', after, operation === 'complete' ? 'Arbejde afsluttet – sag forbliver åben' : `Arbejdsregistrering: ${operation}`, options, { snapshot: { taskNumber: after.taskNumber, status: after.status, solution: after.solution } }); return { dataset: next, entity: after };
}

export function addRestriction(dataset, caseId, revision, input, options = {}) {
  const next = clone(dataset); const caseRecord = next.cases.find((item) => item.id === caseId); assertRevision(caseRecord, revision, 'case'); if (!clean(input.reason) || !clean(input.scope)) throw new DomainValidationError('Omfang og begrundelse er påkrævet.');
  const entity = { id: makeId('restriction', options), caseId, targetType: input.targetType, targetId: input.targetId, scope: clean(input.scope), reason: clean(input.reason), source: clean(input.source) || 'Manuel driftsvurdering', status: 'active', createdAt: iso(options), resolvedAt: '', revision: 1 }; next.restrictions.push(entity); caseRecord.revision += 1; history(next, 'restriction', entity, 'Driftsbegrænsning registreret', options, { reason: entity.reason, snapshot: { scope: entity.scope, source: entity.source } }); return { dataset: next, entity };
}

export function resolveRestriction(dataset, id, revision, reason, options = {}) {
  const next = clone(dataset); const index = next.restrictions.findIndex((item) => item.id === id); const before = next.restrictions[index]; assertRevision(before, revision, 'restriction'); if (!clean(reason)) throw new DomainValidationError('Begrund afklaringen.'); const after = { ...before, status: 'resolved', resolvedAt: iso(options), revision: before.revision + 1 }; next.restrictions[index] = after; history(next, 'restriction', after, 'Driftsbegrænsning afklaret', options, { reason, snapshot: { scope: after.scope } }); return { dataset: next, entity: after };
}

export function closeCase(dataset, id, revision, input, options = {}) {
  const next = clone(dataset); const index = next.cases.findIndex((item) => item.id === id); const before = next.cases[index]; assertRevision(before, revision, 'case');
  const tasks = next.tasks.filter((item) => item.caseId === id); if (tasks.some(openTask)) throw new DomainValidationError('Sagen har opgaver, som ikke er afklaret.', {}, [`${tasks.filter(openTask).length} åbne opgaver`]);
  if (!input.confirmed) throw new DomainValidationError('Bekræft aktivt, at sagen skal lukkes.', { confirmed: 'Bekræftelsen er påkrævet.' });
  if (input.mode === 'normal') { if (before.invoiceResolution?.status !== 'resolved') throw new DomainValidationError('Normal lukning er blokeret, fordi Fakturacenter ikke har afklaret forventede fakturaer.', {}, ['Fakturacenter-integration er ikke tilsluttet i den lokale prototype']); }
  else if (input.mode === 'withoutInvoice') { if (!clean(input.reason)) throw new DomainValidationError('Angiv en begrundelse for lukning uden faktura.', { reason: 'Begrundelsen er påkrævet.' }); }
  else throw new DomainValidationError('Vælg en gyldig lukningsmåde.');
  const after = { ...before, status: 'closed', closedAt: iso(options), closureReason: input.mode === 'withoutInvoice' ? clean(input.reason) : 'Normal lukning efter fakturaafklaring', revision: before.revision + 1 }; next.cases[index] = after; history(next, 'case', after, 'Sag lukket', options, { reason: after.closureReason, snapshot: { reference: after.reference, title: after.title, locationPath: after.historicalLocationSnapshot } }); return { dataset: next, entity: after };
}

export function reopenCase(dataset, id, revision, reason, options = {}) {
  if (!clean(reason)) throw new DomainValidationError('Angiv en begrundelse for genåbning.', { reason: 'Begrundelsen er påkrævet.' }); const next = clone(dataset); const index = next.cases.findIndex((item) => item.id === id); const before = next.cases[index]; assertRevision(before, revision, 'case'); const after = { ...before, status: 'triage', closedAt: null, closureReason: '', revision: before.revision + 1 }; next.cases[index] = after; history(next, 'case', after, 'Sag genåbnet', options, { reason, snapshot: { reference: after.reference, title: after.title } }); return { dataset: next, entity: after };
}

function daysInMonth(year, monthIndex) { return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(); }
export function addCalendarMonths(dateValue, months, anchorDay = null) {
  const source = new Date(`${dateValue.slice(0, 10)}T00:00:00Z`); const targetMonth = source.getUTCMonth() + Number(months); const year = source.getUTCFullYear() + Math.floor(targetMonth / 12); const month = ((targetMonth % 12) + 12) % 12; const day = Math.min(anchorDay ?? source.getUTCDate(), daysInMonth(year, month)); return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function annualDate(year, month, day) { const safe = Math.min(day, daysInMonth(year, month - 1)); return `${year}-${String(month).padStart(2, '0')}-${String(safe).padStart(2, '0')}`; }

export function calculateNextServiceDue(plan, completion = {}) {
  if (plan.intervalType === 'hours') { const meter = Number(completion.meter); if (!Number.isFinite(meter)) return { nextDueDate: '', nextMeter: null, missingBasis: true }; return { nextDueDate: '', nextMeter: meter + Number(plan.operatingHoursInterval), missingBasis: false }; }
  if (plan.intervalType === 'annual') { const completed = new Date(`${completion.date ?? plan.nextDueDate}T00:00:00Z`); const startYear = completed.getUTCFullYear(); let next = annualDate(startYear, Number(plan.annualMonth), Number(plan.annualDay)); if (next <= (completion.date ?? plan.nextDueDate)) next = annualDate(startYear + 1, Number(plan.annualMonth), Number(plan.annualDay)); return { nextDueDate: next, nextMeter: null, missingBasis: false }; }
  const months = Number(plan.intervalValue); if (plan.calendarPrinciple === 'fixedCalendar') return { nextDueDate: addCalendarMonths(plan.nextDueDate || plan.anchorDate, months, Number(plan.anchorDate.slice(8, 10))), nextMeter: null, missingBasis: false };
  return { nextDueDate: addCalendarMonths(completion.date, months), nextMeter: null, missingBasis: false };
}

export function createServicePlan(dataset, input, options = {}) {
  const next = clone(dataset); if (!clean(input.name)) throw new DomainValidationError('Navnet er påkrævet.'); validateTarget(next, input.propertyId, input.targetType === 'location' ? input.targetId : null, input.targetType === 'installation' ? input.targetId : null);
  if (input.intervalType === 'months' && !(Number(input.intervalValue) > 0)) throw new DomainValidationError('Månedsinterval skal være større end nul.');
  if (input.intervalType === 'annual' && (!(Number(input.annualMonth) >= 1 && Number(input.annualMonth) <= 12) || !(Number(input.annualDay) >= 1 && Number(input.annualDay) <= 31))) throw new DomainValidationError('Angiv en gyldig årlig måned og dag.');
  if (input.intervalType === 'hours' && !(Number(input.operatingHoursInterval) > 0)) throw new DomainValidationError('Driftstimeinterval skal være større end nul.');
  const entity = { id: makeId('service-plan', options), templateId: input.templateId || null, name: clean(input.name), targetType: input.targetType, targetId: input.targetId || input.propertyId, propertyId: input.propertyId, intervalType: input.intervalType, intervalValue: Number(input.intervalValue) || null, calendarPrinciple: input.calendarPrinciple ?? 'fromCompletion', anchorDate: input.anchorDate, annualMonth: input.intervalType === 'annual' ? Number(input.annualMonth) : null, annualDay: input.intervalType === 'annual' ? Number(input.annualDay) : null, operatingHoursInterval: input.intervalType === 'hours' ? Number(input.operatingHoursInterval) : null, lastMeter: input.lastMeter === '' ? null : Number(input.lastMeter), nextMeter: input.intervalType === 'hours' && input.lastMeter !== '' ? Number(input.lastMeter) + Number(input.operatingHoursInterval) : null, meterReadings: input.lastMeter === '' ? [] : [{ id: makeId('meter', options), date: input.anchorDate, value: Number(input.lastMeter) }], warningDays: Number(input.warningDays) || 0, supplierId: input.supplierId || null, contactId: input.contactId || null, instruction: clean(input.instruction), checklist: input.checklist ?? [], documentVersionIds: validateVersionIds(next, input.documentVersionIds), status: 'active', nextDueDate: input.intervalType === 'hours' ? '' : input.anchorDate, missedHistoryCount: 0, archivedAt: null, revision: 1 };
  next.servicePlans.push(entity); history(next, 'servicePlan', entity, 'Serviceplan oprettet', options); return { dataset: next, entity };
}

export function updateServicePlan(dataset, id, revision, input, options = {}) { const next = clone(dataset); const index = next.servicePlans.findIndex((item) => item.id === id); const before = next.servicePlans[index]; assertRevision(before, revision, 'servicePlan'); const after = { ...before, ...input, id: before.id, propertyId: before.propertyId, targetType: before.targetType, targetId: before.targetId, documentVersionIds: input.documentVersionIds ? validateVersionIds(next, input.documentVersionIds) : before.documentVersionIds, revision: before.revision + 1 }; next.servicePlans[index] = after; history(next, 'servicePlan', after, after.archivedAt ? 'Serviceplan arkiveret' : after.status === 'paused' ? 'Serviceplan sat på pause' : 'Serviceplan opdateret', options, { reason: input.reason }); return { dataset: next, entity: after }; }

function warningReached(plan, currentDate) { if (plan.intervalType === 'hours') return plan.nextMeter !== null && Number(plan.lastMeter) >= Number(plan.nextMeter); const warning = new Date(`${plan.nextDueDate}T00:00:00Z`); warning.setUTCDate(warning.getUTCDate() - Number(plan.warningDays || 0)); return warning <= new Date(`${currentDate}T23:59:59Z`); }
function missedTerms(plan, currentDate) {
  if (plan.intervalType === 'hours') return plan.nextMeter && plan.lastMeter >= plan.nextMeter ? Math.max(0, Math.floor((plan.lastMeter - plan.nextMeter) / plan.operatingHoursInterval)) : 0;
  let cursor = plan.nextDueDate; let missed = 0;
  while (cursor && missed < 120) {
    let nextDate;
    if (plan.intervalType === 'annual') { const year = Number(cursor.slice(0, 4)) + 1; nextDate = annualDate(year, Number(plan.annualMonth), Number(plan.annualDay)); }
    else nextDate = addCalendarMonths(cursor, Number(plan.intervalValue), Number((plan.anchorDate || cursor).slice(8, 10)));
    if (nextDate > currentDate) break;
    missed += 1; cursor = nextDate;
  }
  return missed;
}
export function runServiceCatchUp(dataset, currentDate, options = {}) {
  let next = clone(dataset); const created = [];
  for (const plan of next.servicePlans.filter((item) => item.status === 'active' && !item.archivedAt && warningReached(item, currentDate))) {
    const planIndex = next.servicePlans.findIndex((item) => item.id === plan.id); const missing = missedTerms(plan, currentDate);
    if (next.servicePlans[planIndex].missedHistoryCount !== missing) next.servicePlans[planIndex] = { ...next.servicePlans[planIndex], missedHistoryCount: missing, revision: next.servicePlans[planIndex].revision + 1 };
    const occurrenceKey = `${plan.id}:${plan.intervalType === 'hours' ? `meter-${plan.nextMeter}` : plan.nextDueDate}`;
    const existing = next.serviceOccurrences.find((item) => item.occurrenceKey === occurrenceKey && item.status !== 'completed'); if (existing) continue;
    const submissionKey = `service:${occurrenceKey}`; const reportResult = submitReport(next, { submissionKey, source: 'service', propertyId: plan.propertyId, locationId: plan.targetType === 'location' ? plan.targetId : '', installationId: plan.targetType === 'installation' ? plan.targetId : '', title: plan.name, description: plan.instruction || 'Planlagt service er nået til varsling.', category: 'Service', reporterSeverity: 'normal', observedAt: `${currentDate}T08:00:00Z`, affectedAreaIds: [], attachmentVersionIds: plan.documentVersionIds }, options); next = reportResult.dataset;
    const occurrence = { id: makeId('service-occurrence', options), occurrenceKey, planId: plan.id, propertyId: plan.propertyId, locationId: plan.targetType === 'location' ? plan.targetId : null, installationId: plan.targetType === 'installation' ? plan.targetId : null, activity: plan.name, supplier: next.suppliers.find((item) => item.id === plan.supplierId)?.name ?? 'Ikke angivet', dueDate: plan.nextDueDate, dueMeter: plan.nextMeter, status: 'open', reportId: reportResult.report.id, caseId: reportResult.caseRecord.id, orderNumber: sequence(next.serviceOccurrences, 'orderNumber', 'BST'), instructionSnapshot: plan.instruction, checklistSnapshot: clone(plan.checklist), documentVersionIds: [...plan.documentVersionIds], completedAt: '', meterAtCompletion: null, revision: 1 };
    next.serviceOccurrences.push(occurrence); const caseIndex = next.cases.findIndex((item) => item.id === reportResult.caseRecord.id); next.cases[caseIndex].source = 'Automatisk oprettet fra Service'; history(next, 'serviceOccurrence', occurrence, 'Serviceforekomst oprettet ved varsling', options); created.push(occurrence);
  }
  return { dataset: next, created };
}

export function completeServiceOccurrence(dataset, id, revision, input, options = {}) {
  const next = clone(dataset); const index = next.serviceOccurrences.findIndex((item) => item.id === id); const before = next.serviceOccurrences[index]; assertRevision(before, revision, 'serviceOccurrence'); const planIndex = next.servicePlans.findIndex((item) => item.id === before.planId); const plan = next.servicePlans[planIndex]; if (!plan) throw new DomainValidationError('Serviceplanen blev ikke fundet.');
  const completion = { date: input.completedDate, meter: input.meter }; const calculated = calculateNextServiceDue(plan, completion); const after = { ...before, status: 'completed', completedAt: `${input.completedDate}T12:00:00Z`, meterAtCompletion: input.meter === '' ? null : Number(input.meter), revision: before.revision + 1 }; next.serviceOccurrences[index] = after; next.servicePlans[planIndex] = { ...plan, nextDueDate: calculated.nextDueDate, nextMeter: calculated.nextMeter, lastMeter: input.meter === '' ? plan.lastMeter : Number(input.meter), status: 'active', revision: plan.revision + 1 }; history(next, 'serviceOccurrence', after, 'Service udført', options, { snapshot: { name: after.activity, completedAt: after.completedAt, nextDueDate: calculated.nextDueDate, nextMeter: calculated.nextMeter } }); return { dataset: next, entity: after, plan: next.servicePlans[planIndex] };
}

function relationExists(next, relation) {
  const map = { property: 'properties', location: 'locationNodes', installation: 'installations', report: 'reports', case: 'cases', task: 'tasks', servicePlan: 'servicePlans', serviceOccurrence: 'serviceOccurrences' };
  return DOCUMENT_RELATION_TYPES.includes(relation.type) && next[map[relation.type]]?.some((item) => item.id === relation.id);
}
export function validateDocumentRelations(next, relations) { const normalized = unique((relations ?? []).map((item) => `${item.type}:${item.id}`)).map((value) => { const [type, ...id] = value.split(':'); return { type, id: id.join(':') }; }); if (normalized.some((item) => !relationExists(next, item))) throw new DomainValidationError('En dokumentrelation er ugyldig.', { relations: 'Vælg eksisterende FACILITY-poster.' }); return normalized; }

export function createDocumentRecord(dataset, input, version, options = {}) {
  const next = clone(dataset); if (!clean(input.title)) throw new DomainValidationError('Dokumenttitel er påkrævet.'); const relations = validateDocumentRelations(next, input.relations); const entity = { id: makeId('document', options), title: clean(input.title), category: clean(input.category) || 'Andet', notes: clean(input.notes), validUntil: input.validUntil || '', relations, versions: [version], currentVersionId: version.id, archivedAt: null, revision: 1, createdAt: iso(options) }; next.documents.push(entity); history(next, 'document', entity, 'Dokument oprettet', options, { snapshot: { title: entity.title, versionId: version.id, fileName: version.fileName } }); return { dataset: next, entity };
}
export function addDocumentVersionRecord(dataset, documentId, revision, version, options = {}) { const next = clone(dataset); const index = next.documents.findIndex((item) => item.id === documentId); const before = next.documents[index]; assertRevision(before, revision, 'document'); const after = { ...before, versions: [...before.versions, version], currentVersionId: version.id, revision: before.revision + 1 }; next.documents[index] = after; history(next, 'document', after, 'Ny dokumentversion', options, { snapshot: { title: after.title, versionId: version.id, fileName: version.fileName } }); return { dataset: next, entity: after }; }
export function updateDocument(dataset, id, revision, input, options = {}) { const next = clone(dataset); const index = next.documents.findIndex((item) => item.id === id); const before = next.documents[index]; assertRevision(before, revision, 'document'); const after = { ...before, title: clean(input.title ?? before.title), category: clean(input.category ?? before.category), notes: clean(input.notes ?? before.notes), validUntil: input.validUntil ?? before.validUntil, relations: input.relations ? validateDocumentRelations(next, input.relations) : before.relations, archivedAt: input.archivedAt === undefined ? before.archivedAt : input.archivedAt, revision: before.revision + 1 }; next.documents[index] = after; history(next, 'document', after, after.archivedAt && !before.archivedAt ? 'Dokument arkiveret' : !after.archivedAt && before.archivedAt ? 'Dokument gendannet' : 'Dokument opdateret', options, { reason: input.reason }); return { dataset: next, entity: after }; }

export function createManualCost(dataset, input, options = {}) {
  const next = clone(dataset); const amount = Number(input.amount);
  if (!next.properties.some((item) => item.id === input.propertyId)) throw new DomainValidationError('Vælg en ejendom.');
  if (!(amount >= 0)) throw new DomainValidationError('Beløbet skal være nul eller større.');
  if (!['registered_manual', 'budget', 'estimate'].includes(input.kind)) throw new DomainValidationError('Vælg budget, estimat eller registreret omkostning.');
  const entity = { id: makeId('cost', options), propertyId: input.propertyId, installationId: input.installationId || null, caseId: input.caseId || null, date: input.date, category: clean(input.category) || 'Øvrige', kind: input.kind, amount, currency: 'DKK', vatBasis: 'Ekskl. moms', source: 'Manuel FACILITY-registrering' };
  next.costs.push(entity); history(next, 'cost', entity, 'Økonomisk registrering oprettet', options, { snapshot: { name: entity.category, amount: entity.amount, kind: entity.kind } }); return { dataset: next, entity };
}
