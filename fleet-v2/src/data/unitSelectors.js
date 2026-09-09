import { UNIT_STATUSES, UNIT_TYPES } from "./fleetFixtures";
import { isOpenCase } from "./caseWorkflow";
import { SERVICE_CATEGORIES, SERVICE_REQUIREMENT_STATUSES, evaluateServiceRequirement } from "./serviceWorkflow";
import { documentsForUnit } from "./documentWorkflow";

export const formatNumber = new Intl.NumberFormat("da-DK");
export const formatCurrency = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 });

export const meterUnit = (unit) => unit.meterType === "hours" ? "t" : "km";
export const formatMeter = (unit, value = unit.meter) => Number.isFinite(value) ? `${formatNumber.format(value)} ${meterUnit(unit)}` : "—";
export const typeLabel = (unit) => UNIT_TYPES[unit.type]?.label || "Ikke oplyst";
export const statusMeta = (unit) => UNIT_STATUSES[unit.status] || { label: "Ikke oplyst", tone: "neutral" };
export const modelLabel = (unit) => [unit.make, unit.model].filter(Boolean).join(" ") || "Ikke oplyst";
export const formatDimension = (value) => Number.isFinite(value) ? `${formatNumber.format(value)} cm` : "Ikke oplyst";

export function parsePositiveDanishNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
}

export function unitCost(unitId, costs = []) {
  return costs.filter((item) => item.unitId === unitId).reduce((sum, item) => sum + item.amount, 0);
}

export const relationsForUnit = (relations, unitId) => Object.fromEntries(
  Object.entries(relations || {}).map(([key, items]) => [key, key === "documents" ? documentsForUnit(items, unitId) : (items || []).filter((item) => item.unitId === unitId)]),
);

export function filterAndSortUnits(units, filters) {
  const query = filters.query.trim().toLocaleLowerCase("da-DK");
  const filtered = units.filter((unit) => {
    const haystack = [unit.number, unit.registration, unit.make, unit.model].filter(Boolean).join(" ").toLocaleLowerCase("da-DK");
    return (!query || haystack.includes(query))
      && (filters.tab === "all" || unit.type === filters.tab)
      && (!filters.department || unit.department === filters.department)
      && (!filters.type || unit.type === filters.type)
      && (!filters.status || unit.status === filters.status);
  });

  const collator = new Intl.Collator("da-DK", { numeric: true, sensitivity: "base" });
  return [...filtered].sort((left, right) => {
    if (filters.sort === "meter-desc") return right.meter - left.meter;
    if (filters.sort === "service") return (left.nextServiceDate || "9999").localeCompare(right.nextServiceDate || "9999");
    if (filters.sort === "model") return collator.compare(modelLabel(left), modelLabel(right));
    return collator.compare(left.number, right.number);
  });
}

export function validateUnit(values, units, currentId = null) {
  const errors = {};
  const number = values.number.trim();
  if (!number) errors.number = "Enhedsnummer skal udfyldes.";
  else if (units.some((item) => item.id !== currentId && item.number.toLocaleLowerCase("da-DK") === number.toLocaleLowerCase("da-DK"))) errors.number = "Enhedsnummeret bruges allerede.";
  if (!values.type) errors.type = "Vælg en enhedstype.";
  if (!values.make.trim()) errors.make = "Mærke skal udfyldes.";
  if (!values.model.trim()) errors.model = "Model skal udfyldes.";
  if (!values.department.trim()) errors.department = "Afdeling skal udfyldes.";
  if (!values.meterType) errors.meterType = "Vælg målerart.";
  const meter = Number(values.meter);
  if (values.meter === "" || !Number.isFinite(meter) || meter < 0 || !Number.isInteger(meter)) errors.meter = "Målerstand skal være et positivt helt tal eller nul.";
  if (!values.status) errors.status = "Vælg driftsstatus.";
  if (values.year && (!Number.isInteger(Number(values.year)) || Number(values.year) < 1900 || Number(values.year) > 2100)) errors.year = "Produktionsår er ugyldigt.";
  if (values.dimensionsEnabled) {
    ["lengthCm", "widthCm", "heightCm"].forEach((key) => {
      if (values[key] !== "" && !Number.isFinite(parsePositiveDanishNumber(values[key]))) errors[key] = "Angiv et positivt tal eller lad feltet være tomt.";
    });
  }
  return errors;
}

export function deriveOverview(units, relations) {
  const counts = units.reduce((result, unit) => ({ ...result, [unit.status]: (result[unit.status] || 0) + 1 }), {});
  const costs = relations.costs || [];
  const monthKeys = ["2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"];
  const knownMonthly = monthKeys.map((month, index) => index < 3 ? [145600, 151900, 164300][index] : costs.filter((item) => item.month === month).reduce((sum, item) => sum + item.amount, 0));
  const serviceEvaluations = (relations.serviceRequirements || []).map((requirement) => ({ requirement, unit: units.find((item) => item.id === requirement.unitId), evaluation: evaluateServiceRequirement(requirement, units.find((item) => item.id === requirement.unitId), relations) }));
  const serviceRank = { overdue: 0, upcoming: 1, planned: 2, missing_basis: 3, okay: 4, inactive: 5 };
  const serviceItems = serviceEvaluations.filter((item) => item.unit).sort((a, b) => serviceRank[a.evaluation.status] - serviceRank[b.evaluation.status]).slice(0, 5).map(({ requirement, unit, evaluation }) => ({ unit: unit.number, type: SERVICE_CATEGORIES[requirement.category], date: evaluation.dueDate ? new Date(`${evaluation.dueDate}T12:00:00`).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "—", meter: Number.isFinite(evaluation.dueMeter) ? formatNumber.format(evaluation.dueMeter) : "—", status: SERVICE_REQUIREMENT_STATUSES[evaluation.status] }));
  const reports = relations.reports || [];
  const openCases = (relations.cases || []).filter(isOpenCase);
  const actionCases = openCases.filter((item) => ["new", "assessing"].includes(item.status));
  const actionUnits = actionCases.slice(0, 5).map((item) => {
    const unit = units.find((entry) => entry.id === item.unitId);
    const report = reports.find((entry) => entry.id === item.reportId);
    return { unit: unit?.number || "Ukendt", title: report?.title || "Sag kræver handling", time: "Lokal demo", level: ["high", "critical"].includes(item.priority) ? "critical" : "warning", reportId: report?.id };
  });
  const total = units.length;
  const operationDays = Array.from({ length: 14 }, (_, index) => {
    const workshop = Math.max(0, (counts.workshop || 0) + (index % 5 === 0 ? 1 : 0));
    const action = Math.max(0, total - (counts.operation || 0) - workshop);
    return { label: ["27. feb", "28. feb", "1. mar", "2. mar", "3. mar", "4. mar", "5. mar", "6. mar", "7. mar", "8. mar", "9. mar", "10. mar", "11. mar", "I dag"][index], operation: total - workshop - action, workshop, action };
  });
  operationDays[13] = { ...operationDays[13], operation: counts.operation || 0, workshop: counts.workshop || 0, action: total - (counts.operation || 0) - (counts.workshop || 0) };
  return {
    totals: { units: total, inOperation: counts.operation || 0, workshop: counts.workshop || 0, needsAction: actionCases.length, reports: openCases.length, upcomingService: serviceEvaluations.filter((item) => ["overdue", "upcoming", "planned", "missing_basis"].includes(item.evaluation.status)).length, monthlyCost: knownMonthly.at(-1), downtimePct: total ? Number((((counts.workshop || 0) / total) * 100).toFixed(1)) : 0 },
    operationDays,
    actionItems: actionUnits,
    serviceItems,
    reportItems: [
      { icon: "warning", color: "red", label: "Skader", count: openCases.filter((item) => reports.find((entry) => entry.id === item.reportId)?.type === "damage").length, latest: "Lokale data" },
      { icon: "warning", color: "amber", label: "Tekniske fejl", count: openCases.filter((item) => reports.find((entry) => entry.id === item.reportId)?.type === "fault").length, latest: "Lokale data" },
      { icon: "document", color: "blue", label: "Servicebehov", count: openCases.filter((item) => reports.find((entry) => entry.id === item.reportId)?.type === "service").length, latest: "Lokale data" },
    ],
    costByMonth: knownMonthly,
    downtimeByMonth: [2.3, 2.8, 2.5, 3.1, 2.6, total ? Number((((counts.workshop || 0) / total) * 100).toFixed(1)) : 0],
  };
}
