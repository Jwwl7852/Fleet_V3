import { DEFAULT_FLEET_CATEGORIES, normalizeFleetCategory, sortFleetCategories } from "./fleetCategories";

const referencedCategoryIds = (dataset) => new Set([
  ...(dataset.relations?.reports || []).map((item) => item.categoryId),
  ...(dataset.relations?.costs || []).map((item) => item.categoryId || item.categoryKey),
].filter(Boolean));

export function mergeSharedCategories(dataset, sharedCategories) {
  const source = Array.isArray(sharedCategories) ? sharedCategories : DEFAULT_FLEET_CATEGORIES;
  const shared = sortFleetCategories(source);
  const ids = new Set(shared.map((item) => item.id));
  const referenced = referencedCategoryIds(dataset);
  const previous = dataset.relations?.fleetCategories || [];
  const historical = previous
    .map(normalizeFleetCategory)
    .filter((item) => item && referenced.has(item.id) && !ids.has(item.id))
    .map((item) => ({ ...item, active: false, historical: true }));
  return {
    ...dataset,
    relations: {
      ...dataset.relations,
      fleetCategories: [...shared, ...historical],
    },
  };
}

export function datasetWithoutSharedCategories(dataset, localDataset) {
  return {
    ...dataset,
    relations: {
      ...dataset.relations,
      fleetCategories: localDataset.relations?.fleetCategories || [],
    },
  };
}
