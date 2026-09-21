const text = (value) => String(value ?? "");

export const UNCATEGORIZED_SERVICE_ID = "__uncategorized__";

export function filterServiceRows(rows, filters = {}) {
  const categories = new Set(filters.categories || []);
  const units = new Set(filters.units || []);
  const departments = new Set(filters.departments || []);
  return (rows || []).filter((row) => (
    (!categories.size || categories.has(row.categoryId))
    && (!units.size || units.has(row.unitId))
    && (!departments.size || departments.has(row.departmentId))
  ));
}

export function sortServiceRows(rows) {
  return [...(rows || [])].sort((left, right) => {
    const leftDate = text(left.dueDate).slice(0, 10);
    const rightDate = text(right.dueDate).slice(0, 10);
    if (!leftDate && rightDate) return 1;
    if (leftDate && !rightDate) return -1;
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return text(left.label).localeCompare(text(right.label), "da-DK");
  });
}

export function pruneSelectedUnits(selectedUnitIds, availableUnits) {
  const available = new Set((availableUnits || []).map((unit) => unit.value ?? unit.id));
  const kept = (selectedUnitIds || []).filter((id) => available.has(id));
  return {
    kept,
    removed: (selectedUnitIds || []).filter((id) => !available.has(id)),
  };
}
