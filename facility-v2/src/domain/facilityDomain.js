export class DomainValidationError extends Error {
  constructor(message, fieldErrors = {}, blockers = []) {
    super(message); this.name = 'DomainValidationError'; this.fieldErrors = fieldErrors; this.blockers = blockers;
  }
}

export class RevisionConflictError extends Error {
  constructor(entityType, entityId, latest) {
    super('Posten er ændret i en anden fane. Dine indtastninger er bevaret, så du kan sammenholde dem med den seneste version.');
    this.name = 'RevisionConflictError'; this.entityType = entityType; this.entityId = entityId; this.latest = latest;
  }
}

export const LOCATION_TYPES = { building: 'Bygning', floor: 'Etage', area: 'Område', room: 'Rum', outdoorArea: 'Udendørsareal', roof: 'Tag', facade: 'Facade', commonArea: 'Fællesområde' };
export const INSTALLATION_TYPES = ['Ventilation', 'Varme', 'Køling', 'Elevator', 'Port', 'Elinstallation', 'Vandinstallation', 'Brandmateriel', 'Andet'];
export const FUNCTION_STATUSES = { notAssessed: 'Ikke vurderet', operational: 'I drift', limited: 'Begrænset drift', out: 'Ude af drift' };

export const ALLOWED_LOCATION_PARENTS = {
  building: ['property'], floor: ['building'], area: ['property', 'building', 'floor', 'area'],
  room: ['building', 'floor', 'area', 'commonArea'], outdoorArea: ['property'], roof: ['property', 'building'],
  facade: ['property', 'building'], commonArea: ['property', 'building', 'floor'],
};

const CLOSED_TASK_STATUSES = new Set(['completed', 'cancelled']);
const clone = (value) => structuredClone(value);
const text = (value) => String(value ?? '').trim();
const nowIso = (now) => (now ? now() : new Date()).toISOString();
const unique = (values) => [...new Set(values)];
const makeId = (prefix, createId) => `${prefix}-${createId ? createId() : crypto.randomUUID()}`;
const labelValue = (value) => value === null || value === undefined || value === '' ? 'Ikke angivet' : String(value);

function changesFrom(before, after, fields) {
  return fields.filter((field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]))
    .map((field) => ({ field, before: labelValue(before?.[field]), after: labelValue(after?.[field]) }));
}

function historyEvent({ entityType, entityId, action, changes = [], reason = '', snapshot = {}, now, createId }) {
  return { id: makeId('history', createId), entityType, entityId, timestamp: nowIso(now), action, changes, reason: text(reason), actor: { id: 'local-demo-actor', name: 'Lokal demoaktør', verified: false }, snapshot };
}

export function parseDanishArea(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new DomainValidationError('Registreret areal skal være et positivt tal.', { registeredArea: 'Indtast et positivt tal eller lad feltet være tomt.' });
    return value;
  }
  const source = text(value);
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^\d+(?:,\d+)?$/.test(source)) throw new DomainValidationError('Registreret areal har et ugyldigt format.', { registeredArea: 'Brug tal, eventuelt med dansk decimalkomma, fx 1250,5.' });
  const parsed = Number(source.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new DomainValidationError('Registreret areal skal være et positivt tal.', { registeredArea: 'Indtast et positivt tal eller lad feltet være tomt.' });
  return parsed;
}

export function suggestPropertyNumber(properties) {
  const max = properties.reduce((value, property) => { const match = /^EJ-(\d+)$/i.exec(property.number ?? ''); return match ? Math.max(value, Number(match[1])) : value; }, 0);
  return `EJ-${String(max + 1).padStart(3, '0')}`;
}

export function validatePropertyInput(dataset, input, editingId = null) {
  const fieldErrors = {}; const number = text(input.number); const name = text(input.name);
  if (!number) fieldErrors.number = 'Ejendomsnummer er påkrævet.';
  if (!name) fieldErrors.name = 'Navn er påkrævet.';
  if (number && dataset.properties.some((item) => item.id !== editingId && item.number.toLocaleLowerCase('da-DK') === number.toLocaleLowerCase('da-DK'))) fieldErrors.number = 'Ejendomsnummeret bruges allerede, også blandt arkiverede ejendomme.';
  let registeredArea = null;
  try { registeredArea = parseDanishArea(input.registeredArea); } catch (error) { Object.assign(fieldErrors, error.fieldErrors); }
  const constructionYear = input.constructionYear === '' || input.constructionYear === null || input.constructionYear === undefined ? null : Number(input.constructionYear);
  if (constructionYear !== null && (!Number.isInteger(constructionYear) || constructionYear < 1000 || constructionYear > 2200)) fieldErrors.constructionYear = 'Opførelsesår skal være et helt årstal mellem 1000 og 2200.';
  if (!['active', 'inactive'].includes(input.administrativeStatus ?? 'active')) fieldErrors.administrativeStatus = 'Vælg aktiv eller inaktiv.';
  if (Object.keys(fieldErrors).length) throw new DomainValidationError('Kontrollér de markerede felter.', fieldErrors);
  const hasLatitude = input.latitude !== '' && input.latitude !== null && input.latitude !== undefined;
  const hasLongitude = input.longitude !== '' && input.longitude !== null && input.longitude !== undefined;
  const latitude = hasLatitude ? Number(String(input.latitude).replace(',', '.')) : null;
  const longitude = hasLongitude ? Number(String(input.longitude).replace(',', '.')) : null;
  if (hasLatitude !== hasLongitude) fieldErrors.coordinates = 'Angiv både bredde- og længdegrad.';
  if (hasLatitude && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) fieldErrors.latitude = 'Breddegrad skal være mellem -90 og 90.';
  if (hasLongitude && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) fieldErrors.longitude = 'Længdegrad skal være mellem -180 og 180.';
  if (Object.keys(fieldErrors).length) throw new DomainValidationError('Ejendommen kunne ikke gemmes.', fieldErrors);
  return { number, name, type: text(input.type), address: text(input.address), postalCode: text(input.postalCode), city: text(input.city), country: text(input.country), administrativeStatus: input.administrativeStatus ?? 'active', registeredArea, constructionYear, energyLabel: text(input.energyLabel), managerName: text(input.managerName), managerEmail: text(input.managerEmail), managerPhone: text(input.managerPhone), description: text(input.description), notes: text(input.notes), latitude, longitude, coordinateSource: latitude === null ? '' : 'Manuelt registreret' };
}

export function getPropertyNodes(dataset, propertyId, { includeArchived = true } = {}) {
  return (dataset.locationNodes ?? []).filter((node) => node.propertyId === propertyId && (includeArchived || !node.archivedAt));
}

export function getDescendantIds(dataset, nodeId, { includeSelf = false } = {}) {
  const descendants = new Set(includeSelf ? [nodeId] : []); const queue = [nodeId];
  while (queue.length) {
    const current = queue.shift();
    for (const child of (dataset.locationNodes ?? []).filter((item) => item.parentId === current)) if (!descendants.has(child.id)) { descendants.add(child.id); queue.push(child.id); }
  }
  return [...descendants];
}

export function getLocationPath(dataset, propertyId, nodeId, separator = ' → ') {
  const property = dataset.properties.find((item) => item.id === propertyId);
  if (!nodeId) return property?.name ?? 'Ejendom';
  const nodes = dataset.locationNodes ?? []; const parts = []; const visited = new Set(); let current = nodes.find((item) => item.id === nodeId);
  while (current && !visited.has(current.id)) { visited.add(current.id); parts.unshift(current.name); current = current.parentId ? nodes.find((item) => item.id === current.parentId) : null; }
  return parts.length ? parts.join(separator) : property?.name ?? 'Ukendt placering';
}

export function validateLocationInput(dataset, input, editingId = null) {
  const fieldErrors = {}; const property = dataset.properties.find((item) => item.id === input.propertyId);
  if (!property) fieldErrors.propertyId = 'Ejendommen blev ikke fundet.'; else if (property.archivedAt) fieldErrors.propertyId = 'Der kan ikke oprettes nye relationer til en arkiveret ejendom.';
  if (!LOCATION_TYPES[input.type]) fieldErrors.type = 'Vælg en gyldig nodetype.';
  if (!text(input.name)) fieldErrors.name = 'Navn er påkrævet.';
  const parent = input.parentId ? dataset.locationNodes.find((item) => item.id === input.parentId) : null;
  if (input.parentId && !parent) fieldErrors.parentId = 'Den valgte forælder findes ikke.';
  if (parent && parent.propertyId !== input.propertyId) fieldErrors.parentId = 'Forælderen tilhører en anden ejendom.';
  if (parent?.archivedAt) fieldErrors.parentId = 'Der kan ikke knyttes nye poster til en arkiveret forælder.';
  if (editingId && input.parentId === editingId) fieldErrors.parentId = 'En post kan ikke være sin egen forælder.';
  if (editingId && getDescendantIds(dataset, editingId).includes(input.parentId)) fieldErrors.parentId = 'En post kan ikke flyttes ind under en af sine egne underposter.';
  const parentType = parent ? parent.type : 'property';
  if (input.type && !ALLOWED_LOCATION_PARENTS[input.type]?.includes(parentType)) fieldErrors.parentId = `${LOCATION_TYPES[input.type]} kan ikke placeres under ${parent ? LOCATION_TYPES[parent.type].toLocaleLowerCase('da-DK') : 'denne placering'}.`;
  if (Object.keys(fieldErrors).length) throw new DomainValidationError('Placeringen kunne ikke gemmes.', fieldErrors);
  return { propertyId: input.propertyId, parentId: input.parentId || null, type: input.type, name: text(input.name), number: text(input.number), description: text(input.description) };
}

export function validateInstallationInput(dataset, input, editingId = null) {
  const fieldErrors = {}; const property = dataset.properties.find((item) => item.id === input.propertyId);
  if (!property) fieldErrors.propertyId = 'Ejendommen blev ikke fundet.'; else if (property.archivedAt) fieldErrors.propertyId = 'Der kan ikke oprettes nye relationer til en arkiveret ejendom.';
  const number = text(input.number); const name = text(input.name);
  if (!number) fieldErrors.number = 'Installationsnummer er påkrævet.'; if (!name) fieldErrors.name = 'Navn er påkrævet.';
  if (!INSTALLATION_TYPES.includes(input.type)) fieldErrors.type = 'Vælg en installationstype.';
  if (number && dataset.installations.some((item) => item.id !== editingId && item.propertyId === input.propertyId && item.number.toLocaleLowerCase('da-DK') === number.toLocaleLowerCase('da-DK'))) fieldErrors.number = 'Installationsnummeret bruges allerede på denne ejendom, også blandt arkiverede installationer.';
  const physical = input.physicalLocationId ? dataset.locationNodes.find((item) => item.id === input.physicalLocationId) : null;
  if (input.physicalLocationId && !physical) fieldErrors.physicalLocationId = 'Den fysiske placering findes ikke.';
  if (physical && physical.propertyId !== input.propertyId) fieldErrors.physicalLocationId = 'Den fysiske placering tilhører en anden ejendom.';
  if (physical?.archivedAt) fieldErrors.physicalLocationId = 'Den fysiske placering er arkiveret.';
  const rawServed = (input.servedAreaIds ?? []).filter(Boolean); const servedAreaIds = unique(rawServed);
  for (const servedId of servedAreaIds) {
    if (servedId === `property:${input.propertyId}`) continue;
    const node = dataset.locationNodes.find((item) => item.id === servedId);
    if (!node || node.propertyId !== input.propertyId || node.archivedAt) { fieldErrors.servedAreaIds = 'Et eller flere betjente områder mangler, er arkiverede eller tilhører en anden ejendom.'; break; }
  }
  if (!Object.keys(FUNCTION_STATUSES).includes(input.functionStatus ?? 'notAssessed')) fieldErrors.functionStatus = 'Vælg en gyldig funktionstilstand.';
  if (Object.keys(fieldErrors).length) throw new DomainValidationError('Installationen kunne ikke gemmes.', fieldErrors);
  return { number, name, type: input.type, propertyId: input.propertyId, physicalLocationId: input.physicalLocationId || null, servedAreaIds, manufacturer: text(input.manufacturer), model: text(input.model), serialNumber: text(input.serialNumber), acquisitionDate: text(input.acquisitionDate), commissioningDate: text(input.commissioningDate), description: text(input.description), technicalNotes: text(input.technicalNotes), supplierName: text(input.supplierName), supplierContactName: text(input.supplierContactName), supplierEmail: text(input.supplierEmail), supplierPhone: text(input.supplierPhone), functionStatus: input.functionStatus ?? 'notAssessed', functionNote: text(input.functionNote) };
}

export function propertyArchiveBlockers(dataset, propertyId) {
  const blockers = []; const nodes = getPropertyNodes(dataset, propertyId, { includeArchived: false }); const installations = dataset.installations.filter((item) => item.propertyId === propertyId && !item.archivedAt); const cases = dataset.cases.filter((item) => item.propertyId === propertyId && item.status !== 'closed'); const tasks = dataset.tasks.filter((item) => item.propertyId === propertyId && !CLOSED_TASK_STATUSES.has(item.status));
  if (nodes.length) blockers.push(`${nodes.length} ikke-arkiverede lokationsposter`); if (installations.length) blockers.push(`${installations.length} ikke-arkiverede installationer`); if (cases.length) blockers.push(`${cases.length} åbne sager`); if (tasks.length) blockers.push(`${tasks.length} åbne opgaver`); return blockers;
}
export function locationArchiveBlockers(dataset, nodeId) {
  const blockers = []; const children = dataset.locationNodes.filter((item) => item.parentId === nodeId && !item.archivedAt); const placed = dataset.installations.filter((item) => item.physicalLocationId === nodeId && !item.archivedAt); const served = dataset.installations.filter((item) => item.servedAreaIds?.includes(nodeId) && !item.archivedAt);
  if (children.length) blockers.push(`${children.length} ikke-arkiverede underposter`); if (placed.length) blockers.push(`${placed.length} fysisk placerede installationer`); if (served.length) blockers.push(`${served.length} installationer betjener området`); return blockers;
}
export function installationArchiveBlockers(dataset, installationId) {
  const blockers = []; const cases = dataset.cases.filter((item) => item.installationId === installationId && item.status !== 'closed'); const tasks = dataset.tasks.filter((item) => item.installationId === installationId && !CLOSED_TASK_STATUSES.has(item.status)); const service = dataset.serviceOccurrences.filter((item) => item.installationId === installationId && item.status === 'planned');
  if (cases.length) blockers.push(`${cases.length} åbne sager`); if (tasks.length) blockers.push(`${tasks.length} åbne opgaver`); if (service.length) blockers.push(`${service.length} aktive servicebindinger`); return blockers;
}

function requireReason(reason, message) { if (!text(reason)) throw new DomainValidationError(message, { reason: message }); }

export function createProperty(dataset, input, options = {}) {
  const next = clone(dataset); const values = validatePropertyInput(next, input); const entity = { id: makeId('property', options.createId), ...values, registeredAt: next.referenceDate, illustration: 'office', imageIds: [], primaryImageId: null, archivedAt: null, revision: 1 };
  next.properties.push(entity); next.history.push(historyEvent({ entityType: 'property', entityId: entity.id, action: 'Oprettet', snapshot: { name: entity.name, number: entity.number }, ...options })); return { dataset: next, entity };
}

export function updateProperty(dataset, propertyId, expectedRevision, input, options = {}) {
  const next = clone(dataset); const index = next.properties.findIndex((item) => item.id === propertyId); if (index < 0) throw new DomainValidationError('Ejendommen blev ikke fundet.'); const before = next.properties[index]; if (before.revision !== expectedRevision) throw new RevisionConflictError('property', propertyId, before);
  const values = validatePropertyInput(next, input, propertyId); const after = { ...before, ...values, revision: before.revision + 1 }; next.properties[index] = after;
  const fields = ['number', 'name', 'type', 'address', 'postalCode', 'city', 'country', 'administrativeStatus', 'registeredArea', 'constructionYear', 'energyLabel', 'managerName', 'managerEmail', 'managerPhone', 'description', 'notes', 'latitude', 'longitude'];
  next.history.push(historyEvent({ entityType: 'property', entityId: propertyId, action: 'Redigeret', changes: changesFrom(before, after, fields), snapshot: { name: after.name, number: after.number }, ...options })); return { dataset: next, entity: after };
}

export function createLocationNode(dataset, input, options = {}) {
  const next = clone(dataset); const values = validateLocationInput(next, input); const entity = { id: makeId('location', options.createId), ...values, archivedAt: null, revision: 1 }; next.locationNodes.push(entity);
  next.history.push(historyEvent({ entityType: 'location', entityId: entity.id, action: 'Oprettet', snapshot: { name: entity.name, path: getLocationPath(next, entity.propertyId, entity.id) }, ...options })); return { dataset: next, entity };
}

export function updateLocationNode(dataset, nodeId, expectedRevision, input, options = {}) {
  const next = clone(dataset); const index = next.locationNodes.findIndex((item) => item.id === nodeId); if (index < 0) throw new DomainValidationError('Lokationsposten blev ikke fundet.'); const before = next.locationNodes[index]; if (before.revision !== expectedRevision) throw new RevisionConflictError('location', nodeId, before);
  if (input.propertyId !== before.propertyId) throw new DomainValidationError('Flytning mellem ejendomme understøttes ikke i denne etape.', { propertyId: 'Behold den nuværende ejendom.' }); const oldPath = getLocationPath(next, before.propertyId, nodeId); const values = validateLocationInput(next, input, nodeId); const after = { ...before, ...values, propertyId: before.propertyId, revision: before.revision + 1 }; next.locationNodes[index] = after;
  const newPath = getLocationPath(next, after.propertyId, nodeId); const moved = before.parentId !== after.parentId; next.history.push(historyEvent({ entityType: 'location', entityId: nodeId, action: moved ? 'Flyttet' : 'Redigeret', changes: [...changesFrom(before, after, ['type', 'name', 'number', 'description']), ...(moved ? [{ field: 'placementPath', before: oldPath, after: newPath }] : [])], reason: input.reason, snapshot: { name: after.name, path: newPath }, ...options })); return { dataset: next, entity: after };
}

export function createInstallation(dataset, input, options = {}) {
  const next = clone(dataset); const values = validateInstallationInput(next, input); const entity = { id: makeId('installation', options.createId), ...values, functionAssessedAt: values.functionStatus === 'notAssessed' ? '' : nowIso(options.now), imageIds: [], primaryImageId: null, archivedAt: null, revision: 1 }; next.installations.push(entity);
  next.history.push(historyEvent({ entityType: 'installation', entityId: entity.id, action: 'Oprettet', snapshot: { name: entity.name, number: entity.number, path: getLocationPath(next, entity.propertyId, entity.physicalLocationId) }, ...options })); return { dataset: next, entity };
}

export function updateInstallation(dataset, installationId, expectedRevision, input, options = {}) {
  const next = clone(dataset); const index = next.installations.findIndex((item) => item.id === installationId); if (index < 0) throw new DomainValidationError('Installationen blev ikke fundet.'); const before = next.installations[index]; if (before.revision !== expectedRevision) throw new RevisionConflictError('installation', installationId, before);
  if (input.propertyId !== before.propertyId) throw new DomainValidationError('Flytning af installationer mellem ejendomme er udskudt.', { propertyId: 'Behold den nuværende ejendom.' }); const functionChanged = before.functionStatus !== input.functionStatus; if (functionChanged) requireReason(input.functionReason, 'Angiv en begrundelse for den ændrede funktionsvurdering.');
  const oldPath = getLocationPath(next, before.propertyId, before.physicalLocationId); const values = validateInstallationInput(next, input, installationId); const after = { ...before, ...values, propertyId: before.propertyId, revision: before.revision + 1, functionAssessedAt: functionChanged ? nowIso(options.now) : before.functionAssessedAt }; next.installations[index] = after; const newPath = getLocationPath(next, after.propertyId, after.physicalLocationId); const moved = before.physicalLocationId !== after.physicalLocationId;
  next.history.push(historyEvent({ entityType: 'installation', entityId: installationId, action: functionChanged ? 'Funktionsvurdering ændret' : moved ? 'Flyttet' : 'Redigeret', changes: [...changesFrom(before, after, ['number', 'name', 'type', 'servedAreaIds', 'manufacturer', 'model', 'serialNumber', 'acquisitionDate', 'commissioningDate', 'description', 'technicalNotes', 'supplierName', 'supplierContactName', 'supplierEmail', 'supplierPhone', 'functionStatus', 'functionNote']), ...(moved ? [{ field: 'physicalLocation', before: oldPath, after: newPath }] : [])], reason: functionChanged ? input.functionReason : input.reason, snapshot: { name: after.name, number: after.number, path: newPath }, ...options })); return { dataset: next, entity: after };
}

function archiveEntity(dataset, collection, type, id, revision, reason, blockers, options = {}) {
  requireReason(reason, 'Angiv en begrundelse for arkiveringen.'); if (blockers.length) throw new DomainValidationError('Posten kan ikke arkiveres, før relationerne er afklaret.', {}, blockers); const next = clone(dataset); const index = next[collection].findIndex((item) => item.id === id); const before = next[collection][index]; if (!before) throw new DomainValidationError('Posten blev ikke fundet.'); if (before.revision !== revision) throw new RevisionConflictError(type, id, before); const after = { ...before, archivedAt: nowIso(options.now), revision: before.revision + 1 }; next[collection][index] = after; next.history.push(historyEvent({ entityType: type, entityId: id, action: 'Arkiveret', reason, snapshot: { name: after.name, number: after.number }, ...options })); return { dataset: next, entity: after };
}

function restoreEntity(dataset, collection, type, id, revision, options = {}) {
  const next = clone(dataset); const index = next[collection].findIndex((item) => item.id === id); const before = next[collection][index]; if (!before) throw new DomainValidationError('Posten blev ikke fundet.'); if (before.revision !== revision) throw new RevisionConflictError(type, id, before);
  if (type === 'location' && before.parentId) { const parent = next.locationNodes.find((item) => item.id === before.parentId); if (!parent || parent.archivedAt) throw new DomainValidationError('Forælderen skal gendannes først.', {}, ['Den nødvendige forælder er manglende eller arkiveret']); }
  if (type === 'installation') { const property = next.properties.find((item) => item.id === before.propertyId); const location = before.physicalLocationId ? next.locationNodes.find((item) => item.id === before.physicalLocationId) : null; if (!property || property.archivedAt || (before.physicalLocationId && (!location || location.archivedAt))) throw new DomainValidationError('Ejendom og fysisk placering skal være gendannet først.'); }
  const after = { ...before, archivedAt: null, revision: before.revision + 1 }; next[collection][index] = after; next.history.push(historyEvent({ entityType: type, entityId: id, action: 'Gendannet', snapshot: { name: after.name, number: after.number }, ...options })); return { dataset: next, entity: after };
}

export const archiveProperty = (dataset, id, revision, reason, options) => archiveEntity(dataset, 'properties', 'property', id, revision, reason, propertyArchiveBlockers(dataset, id), options);
export const restoreProperty = (dataset, id, revision, options) => restoreEntity(dataset, 'properties', 'property', id, revision, options);
export const archiveLocationNode = (dataset, id, revision, reason, options) => archiveEntity(dataset, 'locationNodes', 'location', id, revision, reason, locationArchiveBlockers(dataset, id), options);
export const restoreLocationNode = (dataset, id, revision, options) => restoreEntity(dataset, 'locationNodes', 'location', id, revision, options);
export const archiveInstallation = (dataset, id, revision, reason, options) => archiveEntity(dataset, 'installations', 'installation', id, revision, reason, installationArchiveBlockers(dataset, id), options);
export const restoreInstallation = (dataset, id, revision, options) => restoreEntity(dataset, 'installations', 'installation', id, revision, options);

export function updateMediaReferences(dataset, type, id, revision, imageId, mode, options = {}) {
  const collection = type === 'property' ? 'properties' : 'installations'; const next = clone(dataset); const index = next[collection].findIndex((item) => item.id === id); const before = next[collection][index]; if (!before) throw new DomainValidationError('Profilen blev ikke fundet.'); if (before.revision !== revision) throw new RevisionConflictError(type, id, before);
  let imageIds = [...(before.imageIds ?? [])]; let primaryImageId = before.primaryImageId ?? null;
  if (mode === 'add') { imageIds = unique([...imageIds, imageId]); if (!primaryImageId) primaryImageId = imageId; }
  else if (mode === 'primary') { if (!imageIds.includes(imageId)) throw new DomainValidationError('Billedet er ikke knyttet til profilen.'); primaryImageId = imageId; }
  else if (mode === 'remove') { imageIds = imageIds.filter((value) => value !== imageId); if (primaryImageId === imageId) primaryImageId = imageIds[0] ?? null; }
  const after = { ...before, imageIds, primaryImageId, revision: before.revision + 1 }; next[collection][index] = after; next.history.push(historyEvent({ entityType: type, entityId: id, action: mode === 'add' ? 'Billede tilføjet' : mode === 'primary' ? 'Hovedbillede valgt' : 'Billede fjernet fra profil', snapshot: { name: after.name, number: after.number }, ...options })); return { dataset: next, entity: after };
}
