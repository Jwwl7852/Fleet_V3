const FLEET_WORKSHOP_RETURN = /^\/fleet-v2\/sager\/([^/?#]+)\/bestilling$/;

export function safeSupplierReturnPath(value) {
  if (typeof value !== "string" || !FLEET_WORKSHOP_RETURN.test(value)) return "";
  return value;
}

export function withSelectedSupplier(returnPath, supplierId) {
  const safeReturn = safeSupplierReturnPath(returnPath);
  if (!safeReturn || typeof supplierId !== "string" || !supplierId.trim()) return "";
  const params = new URLSearchParams({ leverandoer: supplierId.trim() });
  return `${safeReturn}?${params.toString()}`;
}

export function workshopAssignmentDraftKey(tenantId, caseId) {
  const tenant = String(tenantId || "ukendt-tenant").replace(/[^a-zA-Z0-9_-]/g, "_");
  const caseKey = String(caseId || "ukendt-sag").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `veyro:fleet:workshop-assignment-draft:${tenant}:${caseKey}`;
}
