import { DEFAULT_FLEET_CATEGORIES, categoryById } from "./fleetCategories";

const uid = () => crypto.randomUUID();
const dateFromMonth = (month) => month ? `${month}-15` : null;
const amountMinor = (item) => Number.isFinite(item.amountMinor) ? item.amountMinor : Number.isFinite(item.amount) ? Math.round(item.amount * 100) : null;

export const ECONOMY_CATEGORIES = Object.freeze(Object.fromEntries(
  DEFAULT_FLEET_CATEGORIES.filter((item) => item.usages.cost).map((item) => [item.id, item.name]),
));

export const COST_STATES = {
  actual: "Manuelt / lokalt registreret",
  controlled: "Kontrolleret faktura",
  booked: "Bogført beløb",
  provisional: "Foreløbigt eksternt beløb",
  estimate: "Estimat / tilbud",
  contractual: "Kontraktlig forventning",
};

export function categoryKey(value = "") {
  const text = value.toLocaleLowerCase("da-DK");
  if (text.includes("værksted") || text.includes("arbejde") || text.includes("material")) return "workshop";
  if (text.includes("service")) return "service";
  if (text.includes("leasing")) return "leasing";
  if (text.includes("energi") || text.includes("brændstof")) return "energy";
  if (text.includes("forsikring")) return "insurance";
  return "other";
}

export function normalizeCost(item, categories = DEFAULT_FLEET_CATEGORIES) {
  const state = item.state || item.accountingState || (item.actual === false ? "provisional" : item.source === "external_provisional" ? "provisional" : "actual");
  const categoryId = item.categoryId || item.categoryKey || categoryKey(item.category);
  const category = categoryById(categories, categoryId);
  return { ...item, date: item.date || dateFromMonth(item.month), month: item.month || item.date?.slice(0, 7), categoryId, categoryKey: categoryId, category: item.categorySnapshot || item.category || category?.name || "Udgået kategori", amountMinor: amountMinor(item), currency: item.currency || "DKK", vatBasis: item.vatBasis || "unknown", state, source: item.source || "legacy_local_demo", economicEventId: item.economicEventId || item.invoiceId || item.sourceKey || item.id };
}

const stateRank = Object.freeze({ contractual: 0, estimate: 1, provisional: 2, actual: 3, controlled: 4, booked: 5 });

export function deduplicateEconomyEntries(entries) {
  const byEvent = new Map();
  entries.forEach((item) => {
    const key = item.economicEventId || item.id;
    const current = byEvent.get(key);
    if (!current || (stateRank[item.state] ?? -1) > (stateRank[current.state] ?? -1)) byEvent.set(key, item);
  });
  return [...byEvent.values()];
}

const monthStart = (value) => `${value.slice(0, 7)}-01`;
const nextMonth = (value) => {
  const date = new Date(`${monthStart(value)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
};

export function materializeRecurringEntries(entries, from, to) {
  return entries.flatMap((item) => {
    if (item.recurrence !== "monthly") return [item];
    const first = monthStart(item.periodStart || item.date || from);
    const last = monthStart(item.periodEnd || to);
    const rangeStart = monthStart(from);
    const rangeEnd = monthStart(to);
    const rows = [];
    for (let cursor = first; cursor <= last && cursor <= rangeEnd; cursor = nextMonth(cursor)) {
      if (cursor < rangeStart) continue;
      const month = cursor.slice(0, 7);
      rows.push({ ...item, id: `${item.id}:${month}`, date: cursor, month, economicEventId: `${item.economicEventId}:${month}`, recurrenceOccurrence: month });
    }
    return rows;
  });
}

export function buildEconomyEntries(dataset) {
  const categories = dataset.relations.fleetCategories || DEFAULT_FLEET_CATEGORIES;
  const costs = (dataset.relations.costs || []).map((item) => normalizeCost(item, categories)).filter((item) => item.amountMinor != null);
  const existingTaskIds = new Set(costs.map((item) => item.taskId).filter(Boolean));
  const taskRows = (dataset.relations.workshopTasks || []).flatMap((task) => {
    if (existingTaskIds.has(task.id)) return [];
    const rows = [];
    if (Number.isFinite(task.expectedCost)) rows.push({ id: `estimate-${task.id}`, unitId: task.unitId, caseId: task.caseId, taskId: task.id, date: task.createdAt?.slice(0, 10), categoryId: "workshop", categoryKey: "workshop", category: categoryById(categories, "workshop")?.name || "Værksted og reparation", amountMinor: Math.round(task.expectedCost * 100), currency: "DKK", vatBasis: "excl_vat", state: "estimate", source: "workshop_estimate" });
    return rows;
  });
  const leaseRows = (dataset.relations.leases || []).filter((lease) => Number.isFinite(lease.payment?.recurringMinor)).map((lease) => ({ id: `contract-${lease.id}`, economicEventId: `lease:${lease.id}`, unitId: lease.unitId, leaseId: lease.id, date: lease.startDate, periodStart: lease.startDate, periodEnd: lease.endDate, recurrence: lease.payment.interval === "monthly" ? "monthly" : null, categoryId: "leasing", categoryKey: "leasing", category: categoryById(categories, "leasing")?.name || "Leasing", amountMinor: lease.payment.recurringMinor, currency: lease.payment.currency || "DKK", vatBasis: lease.payment.vat || "unknown", state: "contractual", source: "lease_contract", note: `${lease.payment.interval || "monthly"} kontraktlig ydelse fra ${lease.startDate || "ukendt start"} til ${lease.endDate || "ukendt slut"}; depositum er ikke medregnet.` }));
  return deduplicateEconomyEntries([...costs, ...taskRows, ...leaseRows]);
}

export function filterEconomyEntries(entries, units, filters = {}) {
  const from = filters.from || "0000-01-01"; const to = filters.to || "9999-12-31";
  return deduplicateEconomyEntries(materializeRecurringEntries(entries, from, to)).filter((item) => {
    const unit = units.find((entry) => entry.id === item.unitId);
    return (!item.date || item.date >= from && item.date <= to)
      && (!filters.department || unit?.department === filters.department)
      && (!filters.unitType || unit?.type === filters.unitType)
      && (!filters.unitId || item.unitId === filters.unitId)
      && (!filters.category || item.categoryKey === filters.category);
  });
}

export function actualCostSummary(entries) {
  const actual = entries.filter((item) => item.state === "actual");
  const currencies = [...new Set(actual.map((item) => item.currency))];
  return { calculable: currencies.length <= 1, currency: currencies[0] || "DKK", amountMinor: currencies.length <= 1 ? actual.reduce((sum, item) => sum + item.amountMinor, 0) : null, count: actual.length };
}

export function previousPeriod(filters) {
  const start = new Date(`${filters.from}T00:00:00Z`);
  const end = new Date(`${filters.to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const days = Math.round((end - start) / 86400000) + 1;
  const previousEnd = new Date(start.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);
  return { from: previousStart.toISOString().slice(0, 10), to: previousEnd.toISOString().slice(0, 10) };
}

export function economyPeriodComparison(entries, units, filters, state = "actual") {
  const prior = previousPeriod(filters);
  if (!prior) return { calculable: false, reason: "Vælg en gyldig periode." };
  const currentRows = filterEconomyEntries(entries, units, filters).filter((item) => item.state === state);
  const priorRows = filterEconomyEntries(entries, units, { ...filters, ...prior }).filter((item) => item.state === state);
  if (!currentRows.length || !priorRows.length) return { calculable: false, prior, reason: "Der findes ikke registrerede poster i begge sammenligningsperioder." };
  const currencies = [...new Set([...currentRows, ...priorRows].map((item) => item.currency))];
  if (currencies.length !== 1) return { calculable: false, prior, reason: "Perioderne indeholder flere valutaer uden omregningsgrundlag." };
  const currentMinor = currentRows.reduce((sum, item) => sum + item.amountMinor, 0);
  const priorMinor = priorRows.reduce((sum, item) => sum + item.amountMinor, 0);
  return { calculable: true, prior, currency: currencies[0], currentMinor, priorMinor, changePct: priorMinor === 0 ? null : (currentMinor - priorMinor) / Math.abs(priorMinor) * 100 };
}

export function periodDistance(unitId, observations, from, to) {
  const rows = (observations || []).filter((item) => item.unitId === unitId && item.unit === "km" && item.observedAt?.slice(0, 10) >= from && item.observedAt?.slice(0, 10) <= to && Number.isFinite(Number(item.value))).sort((a,b) => a.observedAt.localeCompare(b.observedAt));
  if (rows.length < 2) return { calculable: false, reason: "Mindst to daterede kilometermålinger i perioden kræves." };
  const distance = Number(rows.at(-1).value) - Number(rows[0].value);
  if (distance < 0) return { calculable: false, reason: "Målingerne falder og kræver afklaring af målerskift eller rettelse." };
  return { calculable: true, distance, first: rows[0], last: rows.at(-1) };
}

export function mergeDowntimeIntervals(intervals) {
  const rows = intervals.filter((item) => item.start && item.end && item.end > item.start).sort((a,b) => a.start.localeCompare(b.start));
  const merged = [];
  rows.forEach((item) => { const last = merged.at(-1); if (last && item.start <= last.end) last.end = last.end > item.end ? last.end : item.end; else merged.push({ ...item }); });
  return merged;
}

export function unitDowntime(unitId, dataset, from, to) {
  const tasks = (dataset.relations.workshopTasks || []).filter((item) => item.unitId === unitId && item.actualStartAt).map((item) => ({ start: item.actualStartAt, end: item.actualEndAt || `${to}T23:59:59.999Z` }));
  const reportBlocks = (dataset.relations.reports || []).filter((item) => item.unitId === unitId && item.usability === "blocked").map((report) => { const linked = (dataset.relations.cases || []).find((item) => item.reportId === report.id); return { start: report.createdAt, end: linked?.blockReleasedAt || linked?.workCompletedAt || `${to}T23:59:59.999Z` }; });
  const clipped = [...tasks, ...reportBlocks].map((item) => ({ start: item.start < `${from}T00:00:00Z` ? `${from}T00:00:00Z` : item.start, end: item.end > `${to}T23:59:59.999Z` ? `${to}T23:59:59.999Z` : item.end }));
  const merged = mergeDowntimeIntervals(clipped);
  return { intervals: merged, hours: merged.reduce((sum, item) => sum + (new Date(item.end) - new Date(item.start)) / 3600000, 0) };
}

export function applyManualCostSave(dataset, input, actor, options = {}) {
  const errors = {};
  const categories = dataset.relations.fleetCategories || DEFAULT_FLEET_CATEGORIES;
  const category = categoryById(categories, input.categoryId || input.categoryKey);
  if (!dataset.units.some((unit) => unit.id === input.unitId)) errors.unitId = "Vælg en eksisterende enhed.";
  if (!input.date) errors.date = "Angiv dato.";
  if (!category?.active || !category.usages.cost) errors.categoryKey = "Vælg en aktiv omkostningskategori.";
  const parsed = Number(String(input.amount).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) errors.amount = "Angiv et positivt beløb.";
  if (!input.currency) errors.currency = "Angiv valuta.";
  if (Object.keys(errors).length) { const error = new Error(Object.values(errors)[0]); error.validation = errors; throw error; }
  const at = options.now || new Date().toISOString();
  const costs = [...(dataset.relations.costs || [])]; const index = input.id ? costs.findIndex((item) => item.id === input.id) : -1;
  const previous = index >= 0 ? normalizeCost(costs[index], categories) : null;
  const categoryId = category.id;
  const item = { ...previous, id: previous?.id || `cost-manual-${options.id || uid()}`, tenantId: dataset.tenantId, unitId: input.unitId, date: input.date, month: input.date.slice(0,7), categoryId, categoryKey: categoryId, category: category.name, categorySnapshot: category.name, amountMinor: Math.round(parsed * 100), amount: parsed, currency: input.currency, vatBasis: input.vatBasis || "unknown", source: "manual_local", state: "actual", note: input.note?.trim() || "", caseId: input.caseId || null, taskId: input.taskId || null, leaseId: input.leaseId || null, createdAt: previous?.createdAt || at, updatedAt: at, history: [...(previous?.history || []), ...(previous ? [{ at, actorId: actor?.id, actorName: actor?.name, previous }] : [])] };
  if (index >= 0) costs[index] = item; else costs.push(item);
  return { dataset: { ...dataset, relations: { ...dataset.relations, costs } }, cost: item };
}

export function economyCsv(entries, units) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"','""')}"`;
  const decimal = (minor) => Number.isFinite(minor) ? (minor / 100).toFixed(2).replace(".", ",") : "";
  const vatBasisLabel = (value) => value === "excl_vat" || value === "exclusive" ? "Ekskl. moms" : value === "incl_vat" || value === "inclusive" ? "Inkl. moms" : "Uafklaret";
  const vatAmounts = (item) => {
    let netMinor = Number.isFinite(item.netAmountMinor) ? item.netAmountMinor : null;
    let vatMinor = Number.isFinite(item.vatAmountMinor) ? item.vatAmountMinor : null;
    let grossMinor = Number.isFinite(item.grossAmountMinor) ? item.grossAmountMinor : null;
    if (netMinor == null && (item.vatBasis === "excl_vat" || item.vatBasis === "exclusive")) netMinor = item.amountMinor;
    if (grossMinor == null && (item.vatBasis === "incl_vat" || item.vatBasis === "inclusive")) grossMinor = item.amountMinor;
    if (netMinor != null && vatMinor != null && grossMinor == null) grossMinor = netMinor + vatMinor;
    if (grossMinor != null && vatMinor != null && netMinor == null) netMinor = grossMinor - vatMinor;
    if (netMinor != null && grossMinor != null && vatMinor == null) vatMinor = grossMinor - netMinor;
    return { netMinor, vatMinor, grossMinor };
  };
  const header = "Dato;Enhed;Kategori;Beløb;Beløbsgrundlag;Beløb ekskl. moms;Momsbeløb;Beløb inkl. moms;Valuta;Status;Kilde;Reference";
  const rows = entries.map((item) => {
    const vat = vatAmounts(item);
    return [item.date, units.find((unit) => unit.id === item.unitId)?.number, item.category, decimal(item.amountMinor), vatBasisLabel(item.vatBasis), decimal(vat.netMinor), decimal(vat.vatMinor), decimal(vat.grossMinor), item.currency, COST_STATES[item.state], item.source, item.caseId || item.taskId || item.leaseId || ""].map(quote).join(";");
  });
  return `\ufeff${[header, ...rows].join("\r\n")}`;
}
