import { createDemoDataset, DATASET_VERSION, DEMO_TENANT_ID } from './fixtures';
import { archiveInstallation, archiveLocationNode, archiveProperty, createInstallation, createLocationNode, createProperty, restoreInstallation, restoreLocationNode, restoreProperty, updateInstallation, updateLocationNode, updateMediaReferences, updateProperty, DomainValidationError } from '../domain/facilityDomain';
import { addDocumentVersionRecord, addRestriction, appendWork, closeCase, completeServiceOccurrence, createBooking, createDocumentRecord, createManualCase, createManualCost, createServicePlan, createTask, recordSupplierAcceptance, reopenCase, resolveRestriction, runServiceCatchUp, saveMailDraft, submitReport, updateBooking, updateCase, updateDocument, updateServicePlan, updateTask } from '../domain/workflowDomain';

export const FACILITY_DATABASE_NAME = 'veyro-facility-v2';
export const FACILITY_DATABASE_VERSION = 8;
export const FACILITY_DATASET_STORE = 'tenant-datasets';
export const FACILITY_MEDIA_STORE = 'media-blobs';
export const FACILITY_CHANNEL_NAME = 'veyro-facility-v2:data-changes';

function mergeDefaults(defaultItems, storedItems) {
  if (!Array.isArray(storedItems)) return structuredClone(defaultItems);
  const defaults = new Map(defaultItems.map((item) => [item.id, item]));
  return storedItems.map((item) => ({ ...(defaults.get(item.id) ?? {}), ...item }));
}

export function migrateDataset(input) {
  const seed = createDemoDataset();
  if (!input) return seed;
  const version = Number(input.version ?? 0);
  if (version > DATASET_VERSION) throw new Error(`Datasættets version ${version} er nyere end appens version ${DATASET_VERSION}.`);
  const migrated = { ...seed, ...input, version: DATASET_VERSION, properties: mergeDefaults(seed.properties, input.properties), locationNodes: mergeDefaults(seed.locationNodes, input.locationNodes), installations: mergeDefaults(seed.installations, input.installations), cases: mergeDefaults(seed.cases, input.cases), tasks: mergeDefaults(seed.tasks, input.tasks), serviceOccurrences: mergeDefaults(seed.serviceOccurrences, input.serviceOccurrences), costs: mergeDefaults(seed.costs, input.costs), media: input.media ?? [], history: input.history ?? [], reports: input.reports ?? [], reportSubmissions: input.reportSubmissions ?? [], restrictions: input.restrictions ?? [], resources: input.resources ?? seed.resources, suppliers: input.suppliers ?? seed.suppliers, bookings: input.bookings ?? [], serviceTemplates: input.serviceTemplates ?? [], servicePlans: input.servicePlans ?? [], documents: input.documents ?? [], migrationNotes: input.migrationNotes ?? seed.migrationNotes };
  const caseStatus = { open: 'ready', pending: 'triage', active: 'inProgress', done: 'closed' };
  migrated.cases = migrated.cases.map((item) => ({ reportId: null, source: 'Migreret FACILITY-sag', description: '', locationId: null, historicalLocationSnapshot: '', priority: 'normal', category: 'Andet', responsibleId: '', dueDate: '', notes: '', attachmentVersionIds: [], invoiceResolution: { status: 'unavailable', source: '', timestamp: '' }, closedAt: null, closureReason: '', revision: 1, createdAt: input.referenceDate ? `${input.referenceDate}T12:00:00Z` : new Date().toISOString(), ...item, status: caseStatus[item.status] ?? item.status }));
  migrated.tasks = migrated.tasks.map((item) => ({ taskNumber: item.id, orderNumber: '', description: '', caseId: null, installationId: null, assignmentType: 'internal', resourceId: item.assigneeId ?? '', supplierId: null, contactId: null, amountType: 'estimate', amount: null, currency: 'DKK', attachmentVersionIds: [], workLogs: [], timeEntries: [], materials: [], checklist: [], solution: '', remainingRestrictions: '', startedAt: '', completedAt: '', acceptance: null, mailDraft: null, revision: 1, ...item }));
  migrated.serviceOccurrences = migrated.serviceOccurrences.map((item) => ({ occurrenceKey: item.id, planId: null, locationId: null, reportId: null, caseId: null, orderNumber: '', instructionSnapshot: '', checklistSnapshot: [], documentVersionIds: [], completedAt: '', meterAtCompletion: null, revision: 1, ...item }));
  const represented = new Set(migrated.documents.flatMap((document) => document.versions ?? []).map((version) => version.blobId));
  for (const media of migrated.media) {
    if (represented.has(media.id)) continue;
    const relations = [
      ...migrated.properties.filter((item) => item.imageIds?.includes(media.id)).map((item) => ({ type: 'property', id: item.id })),
      ...migrated.installations.filter((item) => item.imageIds?.includes(media.id)).map((item) => ({ type: 'installation', id: item.id })),
    ];
    if (!relations.length) continue;
    const versionId = `document-version-${media.id}`;
    migrated.documents.push({ id: `document-${media.id}`, title: media.fileName, category: 'Profilbillede', notes: 'Migreret fra etape 2 uden kopiering af Blob-data.', validUntil: '', relations, versions: [{ id: versionId, number: 1, fileName: media.fileName, mimeType: media.mimeType, size: media.size, blobId: media.id, createdAt: media.createdAt }], currentVersionId: versionId, archivedAt: null, revision: 1, createdAt: media.createdAt });
  }
  return migrated;
}

function openDatabase(databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, FACILITY_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FACILITY_DATASET_STORE)) database.createObjectStore(FACILITY_DATASET_STORE, { keyPath: 'tenantId' });
      if (!database.objectStoreNames.contains(FACILITY_MEDIA_STORE)) database.createObjectStore(FACILITY_MEDIA_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('FACILITY-databasen er blokeret af en ældre åben fane. Luk eller genindlæs den anden fane.'));
  });
}

function requestAsPromise(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transactionDone(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }
function validateImageFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new DomainValidationError('Vælg et JPEG-, PNG- eller WebP-billede.');
  if (file.size > 20 * 1024 * 1024) throw new DomainValidationError('Billedet må højst fylde 20 MB.');
}

function validateDocumentFile(file) {
  const limits = { 'application/pdf': 20, 'image/jpeg': 20, 'image/png': 20, 'image/webp': 20, 'video/mp4': 100, 'video/webm': 100, 'video/quicktime': 100 };
  const limit = limits[file?.type];
  if (!limit) throw new DomainValidationError('Filtypen understøttes ikke. Brug PDF, JPEG, PNG, WebP, MP4, WebM eller MOV.');
  if (file.size > limit * 1024 * 1024) throw new DomainValidationError(`Filen må højst fylde ${limit} MB.`);
}

function createFileVersion(file, number = 1) {
  const blobId = `blob-${crypto.randomUUID()}`;
  return { version: { id: `document-version-${crypto.randomUUID()}`, number, fileName: file.name, mimeType: file.type, size: file.size, blobId, createdAt: new Date().toISOString() }, blobId };
}

export function createFacilityRepository({ databaseName = FACILITY_DATABASE_NAME, tenantId = DEMO_TENANT_ID } = {}) {
  const listeners = new Set();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${FACILITY_CHANNEL_NAME}:${databaseName}`) : null;
  const announce = () => { listeners.forEach((listener) => listener()); channel?.postMessage({ tenantId, changedAt: Date.now() }); };
  if (channel) channel.onmessage = (event) => { if (event.data?.tenantId === tenantId) listeners.forEach((listener) => listener()); };

  async function read() {
    const database = await openDatabase(databaseName);
    try {
      const transaction = database.transaction(FACILITY_DATASET_STORE, 'readwrite');
      const store = transaction.objectStore(FACILITY_DATASET_STORE);
      const existing = await requestAsPromise(store.get(tenantId));
      const migrated = migrateDataset(existing);
      if (!existing || existing.version !== migrated.version) store.put(migrated);
      await transactionDone(transaction);
      return migrated;
    } finally { database.close(); }
  }

  async function mutate(operation) {
    const database = await openDatabase(databaseName);
    try {
      const transaction = database.transaction(FACILITY_DATASET_STORE, 'readwrite');
      const store = transaction.objectStore(FACILITY_DATASET_STORE);
      const latest = migrateDataset(await requestAsPromise(store.get(tenantId)));
      const result = operation(latest);
      store.put(result.dataset);
      await transactionDone(transaction);
      announce();
      return result;
    } finally { database.close(); }
  }

  async function mediaMutation(type, id, revision, imageId, mode, file = null) {
    if (file) validateImageFile(file);
    const database = await openDatabase(databaseName);
    try {
      const transaction = database.transaction([FACILITY_DATASET_STORE, FACILITY_MEDIA_STORE], 'readwrite');
      const datasetStore = transaction.objectStore(FACILITY_DATASET_STORE);
      const blobStore = transaction.objectStore(FACILITY_MEDIA_STORE);
      const latest = migrateDataset(await requestAsPromise(datasetStore.get(tenantId)));
      const result = updateMediaReferences(latest, type, id, revision, imageId, mode);
      if (file) {
        result.dataset.media.push({ id: imageId, fileName: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString(), blobStore: FACILITY_MEDIA_STORE });
        blobStore.put({ id: imageId, blob: file });
      }
      datasetStore.put(result.dataset);
      await transactionDone(transaction);
      announce();
      return result;
    } finally { database.close(); }
  }

  async function mutateWithBlobs(operation) {
    const database = await openDatabase(databaseName);
    try {
      const transaction = database.transaction([FACILITY_DATASET_STORE, FACILITY_MEDIA_STORE], 'readwrite');
      const datasetStore = transaction.objectStore(FACILITY_DATASET_STORE); const blobStore = transaction.objectStore(FACILITY_MEDIA_STORE);
      const latest = migrateDataset(await requestAsPromise(datasetStore.get(tenantId)));
      const result = operation(latest, (id, blob) => blobStore.put({ id, blob }));
      datasetStore.put(result.dataset); await transactionDone(transaction); announce(); return result;
    } finally { database.close(); }
  }

  return {
    databaseName,
    load: read,
    async save(dataset) { const database = await openDatabase(databaseName); try { const transaction = database.transaction(FACILITY_DATASET_STORE, 'readwrite'); const migrated = migrateDataset(dataset); transaction.objectStore(FACILITY_DATASET_STORE).put(migrated); await transactionDone(transaction); announce(); return migrated; } finally { database.close(); } },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { channel?.close(); listeners.clear(); },
    createProperty: (input) => mutate((dataset) => createProperty(dataset, input)), updateProperty: (id, revision, input) => mutate((dataset) => updateProperty(dataset, id, revision, input)), archiveProperty: (id, revision, reason) => mutate((dataset) => archiveProperty(dataset, id, revision, reason)), restoreProperty: (id, revision) => mutate((dataset) => restoreProperty(dataset, id, revision)),
    createLocationNode: (input) => mutate((dataset) => createLocationNode(dataset, input)), updateLocationNode: (id, revision, input) => mutate((dataset) => updateLocationNode(dataset, id, revision, input)), archiveLocationNode: (id, revision, reason) => mutate((dataset) => archiveLocationNode(dataset, id, revision, reason)), restoreLocationNode: (id, revision) => mutate((dataset) => restoreLocationNode(dataset, id, revision)),
    createInstallation: (input) => mutate((dataset) => createInstallation(dataset, input)), updateInstallation: (id, revision, input) => mutate((dataset) => updateInstallation(dataset, id, revision, input)), archiveInstallation: (id, revision, reason) => mutate((dataset) => archiveInstallation(dataset, id, revision, reason)), restoreInstallation: (id, revision) => mutate((dataset) => restoreInstallation(dataset, id, revision)),
    addImage(type, id, revision, file) { const imageId = `media-${crypto.randomUUID()}`; return mediaMutation(type, id, revision, imageId, 'add', file); },
    setPrimaryImage: (type, id, revision, imageId) => mediaMutation(type, id, revision, imageId, 'primary'),
    removeImage: (type, id, revision, imageId) => mediaMutation(type, id, revision, imageId, 'remove'),
    submitReport(input, files = []) { files.forEach(validateDocumentFile); return mutateWithBlobs((dataset, putBlob) => { let result = submitReport(dataset, { ...input, attachmentVersionIds: input.attachmentVersionIds ?? [] }); if (result.duplicate) return result; for (const file of files) { const created = createFileVersion(file); putBlob(created.blobId, file); const documentResult = createDocumentRecord(result.dataset, { title: file.name, category: 'Indberetningsbilag', notes: '', validUntil: '', relations: [{ type: 'report', id: result.report.id }, { type: 'case', id: result.caseRecord.id }] }, created.version); result.dataset = documentResult.dataset; result.report = result.dataset.reports.find((item) => item.id === result.report.id); result.caseRecord = result.dataset.cases.find((item) => item.id === result.caseRecord.id); result.report.attachmentVersionIds.push(created.version.id); result.report.revision += 1; result.caseRecord.attachmentVersionIds.push(created.version.id); result.caseRecord.revision += 1; } return result; }); },
    createManualCase: (input) => mutate((dataset) => createManualCase(dataset, input)),
    updateCase: (id, revision, input) => mutate((dataset) => updateCase(dataset, id, revision, input)),
    createTask: (input) => mutate((dataset) => createTask(dataset, input)),
    updateTask: (id, revision, input) => mutate((dataset) => updateTask(dataset, id, revision, input)),
    saveMailDraft: (id, revision, input) => mutate((dataset) => saveMailDraft(dataset, id, revision, input)),
    recordSupplierAcceptance: (id, revision, source) => mutate((dataset) => recordSupplierAcceptance(dataset, id, revision, source)),
    createBooking: (input) => mutate((dataset) => createBooking(dataset, input)),
    updateBooking: (id, revision, input) => mutate((dataset) => updateBooking(dataset, id, revision, input)),
    appendWork: (id, revision, operation, input) => mutate((dataset) => appendWork(dataset, id, revision, operation, input)),
    addRestriction: (caseId, revision, input) => mutate((dataset) => addRestriction(dataset, caseId, revision, input)),
    resolveRestriction: (id, revision, reason) => mutate((dataset) => resolveRestriction(dataset, id, revision, reason)),
    closeCase: (id, revision, input) => mutate((dataset) => closeCase(dataset, id, revision, input)),
    reopenCase: (id, revision, reason) => mutate((dataset) => reopenCase(dataset, id, revision, reason)),
    createServicePlan: (input) => mutate((dataset) => createServicePlan(dataset, input)),
    updateServicePlan: (id, revision, input) => mutate((dataset) => updateServicePlan(dataset, id, revision, input)),
    runServiceCatchUp: (date) => mutate((dataset) => runServiceCatchUp(dataset, date)),
    completeServiceOccurrence: (id, revision, input) => mutate((dataset) => completeServiceOccurrence(dataset, id, revision, input)),
    createDocuments(input, files) { files.forEach(validateDocumentFile); return mutateWithBlobs((dataset, putBlob) => { let next = dataset; const documents = []; for (const file of files) { const created = createFileVersion(file); putBlob(created.blobId, file); const result = createDocumentRecord(next, { ...input, title: files.length === 1 && input.title ? input.title : file.name }, created.version); next = result.dataset; documents.push(result.entity); } return { dataset: next, documents }; }); },
    addDocumentVersion(id, revision, file) { validateDocumentFile(file); return mutateWithBlobs((dataset, putBlob) => { const document = dataset.documents.find((item) => item.id === id); const created = createFileVersion(file, (document?.versions.length ?? 0) + 1); putBlob(created.blobId, file); return addDocumentVersionRecord(dataset, id, revision, created.version); }); },
    updateDocument: (id, revision, input) => mutate((dataset) => updateDocument(dataset, id, revision, input)),
    createManualCost: (input) => mutate((dataset) => createManualCost(dataset, input)),
    async getBlob(blobId) { const database = await openDatabase(databaseName); try { const transaction = database.transaction(FACILITY_MEDIA_STORE, 'readonly'); const record = await requestAsPromise(transaction.objectStore(FACILITY_MEDIA_STORE).get(blobId)); await transactionDone(transaction); return record?.blob ?? null; } finally { database.close(); } },
    async getMediaBlob(imageId) { const database = await openDatabase(databaseName); try { const transaction = database.transaction(FACILITY_MEDIA_STORE, 'readonly'); const record = await requestAsPromise(transaction.objectStore(FACILITY_MEDIA_STORE).get(imageId)); await transactionDone(transaction); return record?.blob ?? null; } finally { database.close(); } },
  };
}

export function createMemoryFacilityRepository(initialDataset = createDemoDataset()) {
  let stored = migrateDataset(structuredClone(initialDataset)); const blobs = new Map(); const listeners = new Set(); let queue = Promise.resolve();
  const mutate = (operation) => { const run = async () => { const result = operation(structuredClone(stored)); stored = result.dataset; listeners.forEach((listener) => listener()); return structuredClone(result); }; queue = queue.then(run, run); return queue; };
  return {
    databaseName: 'memory-facility-test', load: async () => structuredClone(stored), save: async (dataset) => { stored = migrateDataset(structuredClone(dataset)); return structuredClone(stored); }, peek: () => structuredClone(stored), subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, close() {},
    createProperty: (input) => mutate((dataset) => createProperty(dataset, input)), updateProperty: (id, revision, input) => mutate((dataset) => updateProperty(dataset, id, revision, input)), archiveProperty: (id, revision, reason) => mutate((dataset) => archiveProperty(dataset, id, revision, reason)), restoreProperty: (id, revision) => mutate((dataset) => restoreProperty(dataset, id, revision)),
    createLocationNode: (input) => mutate((dataset) => createLocationNode(dataset, input)), updateLocationNode: (id, revision, input) => mutate((dataset) => updateLocationNode(dataset, id, revision, input)), archiveLocationNode: (id, revision, reason) => mutate((dataset) => archiveLocationNode(dataset, id, revision, reason)), restoreLocationNode: (id, revision) => mutate((dataset) => restoreLocationNode(dataset, id, revision)),
    createInstallation: (input) => mutate((dataset) => createInstallation(dataset, input)), updateInstallation: (id, revision, input) => mutate((dataset) => updateInstallation(dataset, id, revision, input)), archiveInstallation: (id, revision, reason) => mutate((dataset) => archiveInstallation(dataset, id, revision, reason)), restoreInstallation: (id, revision) => mutate((dataset) => restoreInstallation(dataset, id, revision)),
    async addImage(type, id, revision, file) { validateImageFile(file); const imageId = `media-${crypto.randomUUID()}`; blobs.set(imageId, file); return mutate((dataset) => { const result = updateMediaReferences(dataset, type, id, revision, imageId, 'add'); result.dataset.media.push({ id: imageId, fileName: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString(), blobStore: FACILITY_MEDIA_STORE }); return result; }); },
    setPrimaryImage: (type, id, revision, imageId) => mutate((dataset) => updateMediaReferences(dataset, type, id, revision, imageId, 'primary')), removeImage: (type, id, revision, imageId) => mutate((dataset) => updateMediaReferences(dataset, type, id, revision, imageId, 'remove')), getMediaBlob: async (id) => blobs.get(id) ?? null,
    submitReport: (input) => mutate((dataset) => submitReport(dataset, input)), createManualCase: (input) => mutate((dataset) => createManualCase(dataset, input)), updateCase: (id, revision, input) => mutate((dataset) => updateCase(dataset, id, revision, input)), createTask: (input) => mutate((dataset) => createTask(dataset, input)), updateTask: (id, revision, input) => mutate((dataset) => updateTask(dataset, id, revision, input)), saveMailDraft: (id, revision, input) => mutate((dataset) => saveMailDraft(dataset, id, revision, input)), recordSupplierAcceptance: (id, revision, source) => mutate((dataset) => recordSupplierAcceptance(dataset, id, revision, source)), createBooking: (input) => mutate((dataset) => createBooking(dataset, input)), updateBooking: (id, revision, input) => mutate((dataset) => updateBooking(dataset, id, revision, input)), appendWork: (id, revision, operation, input) => mutate((dataset) => appendWork(dataset, id, revision, operation, input)), addRestriction: (id, revision, input) => mutate((dataset) => addRestriction(dataset, id, revision, input)), resolveRestriction: (id, revision, reason) => mutate((dataset) => resolveRestriction(dataset, id, revision, reason)), closeCase: (id, revision, input) => mutate((dataset) => closeCase(dataset, id, revision, input)), reopenCase: (id, revision, reason) => mutate((dataset) => reopenCase(dataset, id, revision, reason)), createServicePlan: (input) => mutate((dataset) => createServicePlan(dataset, input)), updateServicePlan: (id, revision, input) => mutate((dataset) => updateServicePlan(dataset, id, revision, input)), runServiceCatchUp: (date) => mutate((dataset) => runServiceCatchUp(dataset, date)), completeServiceOccurrence: (id, revision, input) => mutate((dataset) => completeServiceOccurrence(dataset, id, revision, input)),
    async createDocuments(input, files) { let next = stored; const documents = []; for (const file of files) { validateDocumentFile(file); const created = createFileVersion(file); blobs.set(created.blobId, file); const result = createDocumentRecord(next, { ...input, title: files.length === 1 && input.title ? input.title : file.name }, created.version); next = result.dataset; documents.push(result.entity); } stored = next; listeners.forEach((listener) => listener()); return { dataset: structuredClone(stored), documents }; }, async addDocumentVersion(id, revision, file) { validateDocumentFile(file); const document = stored.documents.find((item) => item.id === id); const created = createFileVersion(file, (document?.versions.length ?? 0) + 1); blobs.set(created.blobId, file); return mutate((dataset) => addDocumentVersionRecord(dataset, id, revision, created.version)); }, updateDocument: (id, revision, input) => mutate((dataset) => updateDocument(dataset, id, revision, input)), createManualCost: (input) => mutate((dataset) => createManualCost(dataset, input)), getBlob: async (id) => blobs.get(id) ?? null,
  };
}
