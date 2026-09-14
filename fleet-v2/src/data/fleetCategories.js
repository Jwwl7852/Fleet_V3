export const CATEGORY_PURPOSE = Object.freeze({
  report: "report",
  cost: "cost",
});

export const DEFAULT_FLEET_CATEGORIES = Object.freeze([
  { id: "damage", name: "Skader", active: true, order: 10, usages: { report: true, cost: true }, system: true },
  { id: "tires", name: "Dæk", active: true, order: 20, usages: { report: true, cost: true }, system: true },
  { id: "service", name: "Service", active: true, order: 30, usages: { report: true, cost: true }, system: true },
  { id: "workshop", name: "Værksted og reparation", active: true, order: 40, usages: { report: true, cost: true }, system: true },
  { id: "insurance", name: "Forsikring", active: true, order: 50, usages: { report: false, cost: true }, system: true },
  { id: "leasing", name: "Leasing", active: true, order: 60, usages: { report: false, cost: true }, system: true },
  { id: "energy", name: "Brændstof og energi", active: true, order: 70, usages: { report: false, cost: true }, system: true },
  { id: "other", name: "Øvrige enhedsomkostninger", active: true, order: 80, usages: { report: true, cost: true }, system: true },
]);

const text = (value) => String(value || "").trim();

export function normalizeFleetCategory(category) {
  if (!category?.id) return null;
  return {
    id: text(category.id),
    name: text(category.name || category.navn) || text(category.id),
    active: (category.active ?? category.aktiv) !== false,
    order: Number.isFinite(Number(category.order ?? category.sortering)) ? Number(category.order ?? category.sortering) : 9999,
    usages: {
      report: Boolean(category.usages?.report ?? category.brugIndberetning),
      cost: Boolean(category.usages?.cost ?? category.brugOmkostning),
    },
    system: Boolean(category.system),
  };
}

export function sortFleetCategories(categories) {
  return (categories || []).map(normalizeFleetCategory).filter(Boolean).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, "da"));
}

export function categoriesForPurpose(categories, purpose, selectedId = null) {
  return sortFleetCategories(categories).filter((category) => category.usages[purpose] && (category.active || category.id === selectedId));
}

export function categoryById(categories, id) {
  return sortFleetCategories(categories).find((category) => category.id === id) || null;
}

export function validateFleetCategory(input) {
  const errors = {};
  if (!text(input.name || input.navn)) errors.name = "Angiv et kategorinavn.";
  if (text(input.name || input.navn).length > 80) errors.name = "Navnet må højst være 80 tegn.";
  const order = Number(input.order ?? input.sortering);
  if (!Number.isInteger(order) || order < 0 || order > 9999) errors.order = "Sortering skal være et helt tal fra 0 til 9.999.";
  const report = Boolean(input.usages?.report ?? input.brugIndberetning);
  const cost = Boolean(input.usages?.cost ?? input.brugOmkostning);
  if (!report && !cost) errors.usages = "Vælg mindst én anvendelse.";
  return errors;
}

export function fleetCategoryRecord(input, previous, actorId, now = Date.now()) {
  const normalized = normalizeFleetCategory(input);
  return {
    navn: normalized.name,
    aktiv: normalized.active,
    sortering: normalized.order,
    brugIndberetning: normalized.usages.report,
    brugOmkostning: normalized.usages.cost,
    oprettetMs: previous?.oprettetMs || now,
    oprettetAf: previous?.oprettetAf || actorId,
    opdateretMs: now,
    opdateretAf: actorId,
  };
}
