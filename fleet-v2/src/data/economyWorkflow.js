const uid = () => crypto.randomUUID();
const dateFromMonth = (month) => month ? `${month}-15` : null;
const amountMinor = (item) => Number.isFinite(item.amountMinor) ? item.amountMinor : Number.isFinite(item.amount) ? Math.round(item.amount * 100) : null;

export const ECONOMY_CATEGORIES = {
  workshop: "Værksted og reparation",
  service: "Service",
  leasing: "Leasing",
  energy: "Brændstof og energi",
  insurance: "Forsikring",
  other: "Øvrige enhedsomkostninger",
};

export const COST_STATES = { actual: "Registreret faktisk", provisional: "Foreløbigt eksternt beløb", estimate: "Estimat / tilbud", contractual: "Kontraktlig forventning" };

export function categoryKey(value = "") {
  const text = value.toLocaleLowerCase("da-DK");
  if (text.includes("værksted") || text.includes("arbejde") || text.includes("material")) return "workshop";
  if (text.includes("service")) return "service";
  if (text.includes("leasing")) return "leasing";
  if (text.includes("energi") || text.includes("brændstof")) return "energy";
  if (text.includes("forsikring")) return "insurance";
  return "other";
}

export function normalizeCost(item) {
  const state = item.state || (item.actual === false ? "provisional" : item.source === "external_provisional" ? "provisional" : "actual");
  return { ...item, date: item.date || dateFromMonth(item.month), month: item.month || item.date?.slice(0, 7), categoryKey: item.categoryKey || categoryKey(item.category), category: ECONOMY_CATEGORIES[item.categoryKey || categoryKey(item.category)], amountMinor: amountMinor(item), currency: item.currency || "DKK", vatBasis: item.vatBasis || "unknown", state, source: item.source || "legacy_local_demo" };
}

export function buildEconomyEntries(dataset) {
  const costs = (dataset.relations.costs || []).map(normalizeCost).filter((item) => item.amountMinor != null);
  const existingTaskIds = new Set(costs.map((item) => item.taskId).filter(Boolean));
  const taskRows = (dataset.relations.workshopTasks || []).flatMap((task) => {
    if (existingTaskIds.has(task.id)) return [];
    const rows = [];
    if (Number.isFinite(task.expectedCost)) rows.push({ id: `estimate-${task.id}`, unitId: task.unitId, caseId: task.caseId, taskId: task.id, date: task.createdAt?.slice(0, 10), categoryKey: "workshop", category: ECONOMY_CATEGORIES.workshop, amountMinor: Math.round(task.expectedCost * 100), currency: "DKK", vatBasis: "excl_vat", state: "estimate", source: "workshop_estimate" });
    return rows;
  });
  const leaseRows = (dataset.relations.leases || []).filter((lease) => Number.isFinite(lease.payment?.recurringMinor)).map((lease) => ({ id: `contract-${lease.id}`, unitId: lease.unitId, leaseId: lease.id, date: lease.startDate, categoryKey: "leasing", category: ECONOMY_CATEGORIES.leasing, amountMinor: lease.payment.recurringMinor, currency: lease.payment.currency || "DKK", vatBasis: lease.payment.vat || "unknown", state: "contractual", source: "lease_contract", note: `${lease.payment.interval || "monthly"} kontraktlig ydelse; depositum er ikke medregnet.` }));
  return [...costs, ...taskRows, ...leaseRows];
}

export function filterEconomyEntries(entries, units, filters = {}) {
  const from = filters.from || "0000-01-01"; const to = filters.to || "9999-12-31";
  return entries.filter((item) => {
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
  if (!dataset.units.some((unit) => unit.id === input.unitId)) errors.unitId = "Vælg en eksisterende enhed.";
  if (!input.date) errors.date = "Angiv dato.";
  if (!ECONOMY_CATEGORIES[input.categoryKey]) errors.categoryKey = "Vælg kategori.";
  const parsed = Number(String(input.amount).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) errors.amount = "Angiv et positivt beløb.";
  if (!input.currency) errors.currency = "Angiv valuta.";
  if (Object.keys(errors).length) { const error = new Error(Object.values(errors)[0]); error.validation = errors; throw error; }
  const at = options.now || new Date().toISOString();
  const costs = [...(dataset.relations.costs || [])]; const index = input.id ? costs.findIndex((item) => item.id === input.id) : -1;
  const previous = index >= 0 ? normalizeCost(costs[index]) : null;
  const item = { ...previous, id: previous?.id || `cost-manual-${options.id || uid()}`, tenantId: dataset.tenantId, unitId: input.unitId, date: input.date, month: input.date.slice(0,7), categoryKey: input.categoryKey, category: ECONOMY_CATEGORIES[input.categoryKey], amountMinor: Math.round(parsed * 100), amount: parsed, currency: input.currency, vatBasis: input.vatBasis || "unknown", source: "manual_local", state: "actual", note: input.note?.trim() || "", caseId: input.caseId || null, taskId: input.taskId || null, leaseId: input.leaseId || null, createdAt: previous?.createdAt || at, updatedAt: at, history: [...(previous?.history || []), ...(previous ? [{ at, actorId: actor?.id, actorName: actor?.name, previous }] : [])] };
  if (index >= 0) costs[index] = item; else costs.push(item);
  return { dataset: { ...dataset, relations: { ...dataset.relations, costs } }, cost: item };
}

export function economyCsv(entries, units) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"','""')}"`;
  return ["Dato;Enhed;Kategori;Beløb;Valuta;Status;Kilde;Reference", ...entries.map((item) => [item.date, units.find((unit) => unit.id === item.unitId)?.number, item.category, (item.amountMinor/100).toFixed(2).replace(".",","), item.currency, COST_STATES[item.state], item.source, item.caseId || item.taskId || item.leaseId || ""].map(quote).join(";"))].join("\r\n");
}
