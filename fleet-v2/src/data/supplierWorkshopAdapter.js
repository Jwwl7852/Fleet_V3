const text = (value) => String(value || "").trim();

export function supplierToWorkshop(supplier) {
  if (!supplier?.id || supplier.kategori !== "vaerksted") return null;
  return {
    id: supplier.id,
    name: text(supplier.navn) || supplier.id,
    kind: "external",
    address: text(supplier.adresse || supplier.postadresse),
    email: text(supplier.kontaktEmail),
    phone: text(supplier.kontaktTelefon),
    active: supplier.aktiv !== false,
    selectable: supplier.aktiv !== false,
    source: "shared-supplier-register",
  };
}

const referencedWorkshopIds = (dataset) => new Set([
  ...(dataset.relations?.workshopTasks || []).map((item) => item.workshopId),
  ...(dataset.relations?.bookings || []).map((item) => item.workshopId),
  ...(dataset.relations?.cases || []).map((item) => item.vendorId),
  ...(dataset.relations?.serviceRequirements || []).map((item) => item.vendorId),
].filter(Boolean));

export function mergeSharedWorkshops(dataset, suppliers) {
  if (!Array.isArray(suppliers)) return dataset;
  const existing = dataset.relations?.workshops || [];
  const referenced = referencedWorkshopIds(dataset);
  const internal = existing.filter((item) => item.kind === "internal");
  const shared = suppliers.map(supplierToWorkshop).filter(Boolean);
  const sharedIds = new Set(shared.map((item) => item.id));
  const historical = existing
    .filter((item) => item.kind !== "internal" && !sharedIds.has(item.id) && referenced.has(item.id))
    .map((item) => ({
      ...item,
      active: false,
      selectable: false,
      source: "legacy-fleet-reference",
    }));
  return {
    ...dataset,
    relations: {
      ...dataset.relations,
      workshops: [...internal, ...shared, ...historical],
    },
  };
}

export function selectableWorkshops(workshops, selectedId = null) {
  return (workshops || []).filter((item) => item.selectable !== false || item.id === selectedId);
}

export function datasetForLocalPersistence(dataset, localDataset) {
  return {
    ...dataset,
    relations: {
      ...dataset.relations,
      workshops: localDataset.relations?.workshops || [],
    },
  };
}
