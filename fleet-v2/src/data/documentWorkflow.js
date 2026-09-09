export const DOCUMENT_CATEGORIES = {
  registration: "Registreringsattest",
  insurance: "Forsikring",
  inspection: "Syn og eftersyn",
  service_workshop: "Service og værksted",
  manual: "Manual og vejledning",
  damage: "Skadedokumentation",
  lease: "Leasingkontrakt",
  other: "Øvrigt",
};

export const DOCUMENT_RELATION_TYPES = {
  unit: "Enhed",
  case: "Sag",
  workshopTask: "Værkstedsopgave",
  serviceRequirement: "Serviceplan",
  serviceRecord: "Servicepost",
  lease: "Leasingaftale",
};

export const DOCUMENT_LIMITS = {
  image: 20 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

const allowedImages = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedVideos = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const categoryAliases = {
  Registrering: "registration", Registreringsattest: "registration", Forsikring: "insurance",
  Service: "service_workshop", Værksted: "service_workshop", Skade: "damage",
};
const id = (prefix, options = {}) => `${prefix}-${options.uuid?.() || crypto.randomUUID()}`;
const now = (options = {}) => options.now?.() || new Date().toISOString();

export function documentFileKind(mimeType = "") {
  if (allowedImages.has(mimeType)) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (allowedVideos.has(mimeType)) return "video";
  return null;
}

export function validateDocumentFile(file) {
  const kind = documentFileKind(file?.type);
  if (!kind) throw new Error("Filtypen understøttes ikke. Brug PDF, JPG, PNG, WebP, MP4, WebM eller MOV.");
  if (!file?.size) throw new Error("Filen er tom og kan ikke uploades.");
  if (file.size > DOCUMENT_LIMITS[kind]) {
    const limit = Math.round(DOCUMENT_LIMITS[kind] / 1024 / 1024);
    throw new Error(`${kind === "video" ? "Videoen" : "Filen"} må højst fylde ${limit} MB.`);
  }
  return kind;
}

const metadataSnapshot = (document) => ({
  title: document.title, category: document.category, note: document.note || "",
  validFrom: document.validFrom || null, expiresAt: document.expiresAt || null,
  reminderDays: document.reminderDays ?? null,
});

const relation = (type, targetId, at, options = {}) => ({ id: id("document-link", options), type, targetId, addedAt: at });

function normalizeLegacyDocument(item, tenantId) {
  if (item.versions && item.relations) return { archivedAt: null, archivedBy: null, note: "", validFrom: null, expiresAt: null, reminderDays: null, ...item };
  const createdAt = item.createdAt || (item.date ? `${item.date}T09:00:00.000Z` : "2025-01-01T09:00:00.000Z");
  const category = categoryAliases[item.category] || (DOCUMENT_CATEGORIES[item.category] ? item.category : "other");
  const document = {
    id: item.id, tenantId, title: item.title || item.fileName || "Dokument uden titel", category,
    note: item.note || "", validFrom: item.validFrom || null, expiresAt: item.expiresAt || null,
    reminderDays: item.reminderDays ?? null, origin: item.origin || "legacy_metadata",
    originLabel: item.originLabel || "Eksisterende dokumentmetadata", sourceKey: item.sourceKey || null,
    currentVersionId: `${item.id}-version-1`, relations: item.unitId ? [{ id: `${item.id}-unit-link`, type: "unit", targetId: item.unitId, addedAt: createdAt }] : [],
    archivedAt: item.archivedAt || null, archivedBy: item.archivedBy || null,
    createdAt, updatedAt: item.updatedAt || createdAt,
  };
  document.versions = [{
    id: document.currentVersionId, version: 1, fileName: item.fileName || item.title || "Ukendt fil",
    mimeType: item.mimeType || "application/pdf", size: item.size ?? null, blob: item.blob || null,
    uploadedAt: createdAt, sourceAttachment: item.sourceAttachment || null,
    metadata: metadataSnapshot(document),
  }];
  return document;
}

function sourceDocument({ tenantId, sourceKey, title, category, originLabel, at, sourceAttachment, links, mimeType, size }) {
  const documentId = `document-${sourceKey.replace(/[^a-z0-9-]/gi, "-")}`;
  const document = {
    id: documentId, tenantId, title, category, note: "", validFrom: null, expiresAt: null,
    reminderDays: null, origin: "linked_attachment", originLabel, sourceKey,
    currentVersionId: `${documentId}-version-1`,
    relations: links.filter((item) => item.targetId).map((item) => ({ id: `${documentId}-${item.type}-${item.targetId}`, type: item.type, targetId: item.targetId, addedAt: at })),
    archivedAt: null, archivedBy: null, createdAt: at, updatedAt: at,
  };
  document.versions = [{ id: document.currentVersionId, version: 1, fileName: title, mimeType, size: size ?? null, blob: null, uploadedAt: at, sourceAttachment, metadata: metadataSnapshot(document) }];
  return document;
}

export function ensureDocumentRegistry(dataset) {
  const tenantId = dataset.tenantId;
  const relations = dataset.relations || {};
  const documents = (relations.documents || []).map((item) => normalizeLegacyDocument(item, tenantId));
  const known = new Set(documents.map((item) => item.sourceKey).filter(Boolean));
  const add = (document) => { if (!known.has(document.sourceKey)) { documents.push(document); known.add(document.sourceKey); } };

  (relations.reports || []).forEach((report) => {
    const caseItem = (relations.cases || []).find((item) => item.reportId === report.id);
    [...(report.images || []), ...(report.media || [])].forEach((attachment) => {
      const sourceKey = `report-${report.id}-${attachment.id}`;
      add(sourceDocument({ tenantId, sourceKey, title: attachment.name || `Indberetningsbillede ${report.number}`, category: report.type === "damage" ? "damage" : "other", originLabel: `Indberetning ${report.number}`, at: attachment.addedAt || report.createdAt, sourceAttachment: { ownerType: "report", ownerId: report.id, field: (report.images || []).some((item) => item.id === attachment.id) ? "images" : "media", attachmentId: attachment.id }, links: [{ type: "unit", targetId: report.unitId }, { type: "case", targetId: caseItem?.id }], mimeType: attachment.type || attachment.blob?.type || "application/octet-stream", size: attachment.size ?? attachment.blob?.size }));
    });
  });
  (relations.workshopTasks || []).forEach((task) => {
    ["beforeImages", "afterImages"].forEach((field) => (task[field] || []).forEach((attachment) => {
      const sourceKey = `workshop-${task.id}-${field}-${attachment.id}`;
      add(sourceDocument({ tenantId, sourceKey, title: attachment.name || `${field === "beforeImages" ? "Før" : "Efter"} arbejdet`, category: "service_workshop", originLabel: `${task.number} · ${field === "beforeImages" ? "før arbejdet" : "efter arbejdet"}`, at: attachment.addedAt || task.updatedAt || task.createdAt, sourceAttachment: { ownerType: "workshopTask", ownerId: task.id, field, attachmentId: attachment.id }, links: [{ type: "unit", targetId: task.unitId }, { type: "case", targetId: task.caseId }, { type: "workshopTask", targetId: task.id }], mimeType: attachment.type || attachment.blob?.type || "image/jpeg", size: attachment.size ?? attachment.blob?.size }));
    }));
  });
  return { ...dataset, relations: { ...relations, documents } };
}

export function resolveDocumentVersion(document, dataset, versionId = document.currentVersionId) {
  const version = document.versions?.find((item) => item.id === versionId);
  if (!version) return null;
  if (version.blob) return { ...version, available: true };
  const source = version.sourceAttachment;
  if (!source) return { ...version, available: false };
  const ownerCollection = source.ownerType === "report" ? dataset.relations.reports : dataset.relations.workshopTasks;
  const owner = (ownerCollection || []).find((item) => item.id === source.ownerId);
  const attachment = (owner?.[source.field] || []).find((item) => item.id === source.attachmentId);
  return attachment?.blob ? { ...version, blob: attachment.blob, mimeType: attachment.type || version.mimeType, size: attachment.size ?? attachment.blob.size, available: true } : { ...version, available: false };
}

export const documentsForRelation = (documents, type, targetId) => (documents || []).filter((document) => document.relations?.some((item) => item.type === type && item.targetId === targetId));
export const documentsForUnit = (documents, unitId) => documentsForRelation(documents, "unit", unitId);

export function documentValidity(document, today = new Date()) {
  const date = new Date(today); date.setHours(0, 0, 0, 0);
  const from = document.validFrom ? new Date(`${document.validFrom}T00:00:00`) : null;
  const expires = document.expiresAt ? new Date(`${document.expiresAt}T00:00:00`) : null;
  if (from && from > date) return { key: "future", label: "Endnu ikke gyldigt" };
  if (!expires) return { key: "none", label: "Ingen udløbsdato" };
  if (expires < date) return { key: "expired", label: "Udløbet" };
  const reminder = new Date(date); reminder.setDate(reminder.getDate() + (Number(document.reminderDays) || 30));
  return expires <= reminder ? { key: "expiring", label: "Udløber snart" } : { key: "valid", label: "Gyldigt" };
}

export function applyDocumentUpload(dataset, input, actor, options = {}) {
  const files = [...(input.files || [])];
  if (!files.length) throw new Error("Vælg mindst én fil.");
  files.forEach(validateDocumentFile);
  if (!DOCUMENT_CATEGORIES[input.category]) throw new Error("Vælg en dokumentkategori.");
  const at = now(options);
  const created = files.map((file) => {
    const documentId = id("document", options);
    const document = {
      id: documentId, tenantId: dataset.tenantId,
      title: files.length === 1 && input.title?.trim() ? input.title.trim() : file.name,
      category: input.category, note: input.note?.trim() || "", validFrom: input.validFrom || null,
      expiresAt: input.expiresAt || null, reminderDays: input.reminderDays === "" || input.reminderDays == null ? null : Number(input.reminderDays),
      origin: "manual_upload", originLabel: "Manuel upload i FLEET", sourceKey: null,
      currentVersionId: id("document-version", options),
      relations: (input.relations || []).filter((item) => item.type && item.targetId).map((item) => relation(item.type, item.targetId, at, options)),
      archivedAt: null, archivedBy: null, createdAt: at, updatedAt: at, createdBy: actor?.id || "demo-local",
    };
    document.versions = [{ id: document.currentVersionId, version: 1, fileName: file.name, mimeType: file.type, size: file.size, blob: file, uploadedAt: at, uploadedBy: actor?.id || "demo-local", sourceAttachment: null, metadata: metadataSnapshot(document) }];
    return document;
  });
  return { dataset: { ...dataset, relations: { ...dataset.relations, documents: [...(dataset.relations.documents || []), ...created] } }, documents: created };
}

export function applyDocumentUpdate(dataset, documentId, input, actor, options = {}) {
  const documents = (dataset.relations.documents || []).map((item) => ({ ...item, relations: (item.relations || []).map((link) => ({ ...link })), versions: (item.versions || []).map((version) => ({ ...version })) }));
  const index = documents.findIndex((item) => item.id === documentId);
  if (index < 0) throw new Error("Dokumentet findes ikke.");
  const current = documents[index];
  const at = now(options);
  const next = { ...current, title: input.title?.trim() || current.title, category: input.category || current.category, note: input.note?.trim() || "", validFrom: input.validFrom || null, expiresAt: input.expiresAt || null, reminderDays: input.reminderDays === "" || input.reminderDays == null ? null : Number(input.reminderDays), updatedAt: at, updatedBy: actor?.id || "demo-local" };
  if (input.relations) {
    const wanted = input.relations.filter((item) => item.type && item.targetId);
    next.relations = wanted.map((item) => current.relations.find((existing) => existing.type === item.type && existing.targetId === item.targetId) || relation(item.type, item.targetId, at, options));
  }
  documents[index] = next;
  return { dataset: { ...dataset, relations: { ...dataset.relations, documents } }, document: next };
}

export function applyDocumentVersion(dataset, documentId, file, actor, options = {}) {
  validateDocumentFile(file);
  const documents = (dataset.relations.documents || []).map((item) => ({ ...item, relations: (item.relations || []).map((link) => ({ ...link })), versions: (item.versions || []).map((version) => ({ ...version })) }));
  const index = documents.findIndex((item) => item.id === documentId);
  if (index < 0) throw new Error("Dokumentet findes ikke.");
  const current = documents[index]; const at = now(options);
  const version = { id: id("document-version", options), version: Math.max(0, ...current.versions.map((item) => item.version || 0)) + 1, fileName: file.name, mimeType: file.type, size: file.size, blob: file, uploadedAt: at, uploadedBy: actor?.id || "demo-local", sourceAttachment: null, metadata: metadataSnapshot(current) };
  documents[index] = { ...current, currentVersionId: version.id, versions: [...current.versions, version], updatedAt: at };
  return { dataset: { ...dataset, relations: { ...dataset.relations, documents } }, document: documents[index], version };
}

export function applyDocumentRelationRemoval(dataset, documentId, relationId, options = {}) {
  const documents = (dataset.relations.documents || []).map((item) => ({ ...item, relations: (item.relations || []).map((link) => ({ ...link })), versions: (item.versions || []).map((version) => ({ ...version })) })); const index = documents.findIndex((item) => item.id === documentId);
  if (index < 0) throw new Error("Dokumentet findes ikke.");
  if (!documents[index].relations.some((item) => item.id === relationId)) throw new Error("Tilknytningen findes ikke.");
  documents[index] = { ...documents[index], relations: documents[index].relations.filter((item) => item.id !== relationId), updatedAt: now(options) };
  return { dataset: { ...dataset, relations: { ...dataset.relations, documents } }, document: documents[index] };
}

export function applyDocumentArchive(dataset, documentId, archived, actor, options = {}) {
  const documents = (dataset.relations.documents || []).map((item) => ({ ...item, relations: (item.relations || []).map((link) => ({ ...link })), versions: (item.versions || []).map((version) => ({ ...version })) })); const index = documents.findIndex((item) => item.id === documentId);
  if (index < 0) throw new Error("Dokumentet findes ikke.");
  documents[index] = { ...documents[index], archivedAt: archived ? now(options) : null, archivedBy: archived ? actor?.id || "demo-local" : null, updatedAt: now(options) };
  return { dataset: { ...dataset, relations: { ...dataset.relations, documents } }, document: documents[index] };
}
