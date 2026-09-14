const DAY_MS = 24 * 60 * 60 * 1000;

export const OPERATION_PERIODS = Object.freeze({
  day: "Dag",
  week: "Uge",
  month: "Måned",
  quarter: "Kvartal",
  year: "Indeværende år",
});

const pad = (value) => String(value).padStart(2, "0");
const isoDate = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const dateAtUtc = (value) => new Date(value.length === 10 ? `${value}T23:59:59.999Z` : value);

function endOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

function labelForPoint(date, period) {
  if (period === "day") return date.toLocaleTimeString("da-DK", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
  if (period === "year" || period === "quarter") return date.toLocaleDateString("da-DK", { timeZone: "UTC", month: "short" }).replace(".", "");
  return date.toLocaleDateString("da-DK", { timeZone: "UTC", day: "numeric", month: "short" }).replace(".", "");
}

export function operationSamplePoints(period = "week", asOf = new Date().toISOString()) {
  if (!OPERATION_PERIODS[period]) throw new Error(`Ukendt driftsperiode: ${period}`);
  const end = dateAtUtc(asOf);
  if (period === "day") {
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    return [0, 4, 8, 12, 16, 20, 23].map((hour) => new Date(start.getTime() + hour * 60 * 60 * 1000));
  }
  if (period === "week") {
    return Array.from({ length: 7 }, (_, index) => new Date(end.getTime() - (6 - index) * DAY_MS));
  }
  if (period === "month") {
    const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 23, 59, 59, 999));
    const lastDay = end.getUTCDate();
    const count = Math.min(7, lastDay);
    return Array.from({ length: count }, (_, index) =>
      1 + Math.round(index * (lastDay - 1) / Math.max(1, count - 1)))
      .filter((day, index, list) => list.indexOf(day) === index)
      .map((day) => new Date(first.getTime() + (day - 1) * DAY_MS));
  }
  const months = period === "quarter"
    ? [end.getUTCMonth() - 2, end.getUTCMonth() - 1, end.getUTCMonth()]
    : Array.from({ length: end.getUTCMonth() + 1 }, (_, index) => index);
  return months.map((month) => endOfMonth(end.getUTCFullYear(), month));
}

function latestStatus(history, unitId, atMs) {
  let latest = null;
  for (const item of history) {
    const itemMs = Date.parse(item.at);
    if (item.unitId === unitId && Number.isFinite(itemMs) && itemMs <= atMs
      && (!latest || itemMs > latest.atMs)) latest = { status: item.status, atMs: itemMs };
  }
  return latest?.status || null;
}

export function deriveOperationSeries(units, history = [], options = {}) {
  const period = options.period || "week";
  const points = operationSamplePoints(period, options.asOf);
  const activeUnits = units.filter((unit) => unit.status !== "inactive");
  const series = points.map((point) => {
    const counts = { operation: 0, workshop: 0, action: 0, unknown: 0 };
    activeUnits.forEach((unit) => {
      const status = latestStatus(history, unit.id, point.getTime());
      if (status === "operation") counts.operation += 1;
      else if (status === "workshop") counts.workshop += 1;
      else if (["action", "offline"].includes(status)) counts.action += 1;
      else counts.unknown += 1;
    });
    return { date: isoDate(point), label: labelForPoint(point, period), ...counts };
  });
  const known = series.reduce((sum, item) => sum + activeUnits.length - item.unknown, 0);
  const possible = activeUnits.length * series.length;
  return {
    period,
    series,
    coverage: { known, possible, pct: possible ? Math.round(known / possible * 100) : 0 },
  };
}

export function monthKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function monthKeysEndingAt(selectedMonth, count = 6) {
  if (!/^\d{4}-\d{2}$/.test(selectedMonth)) throw new Error("Måneden skal have formatet ÅÅÅÅ-MM.");
  const [year, month] = selectedMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const point = new Date(Date.UTC(year, month - count + index, 1));
    return monthKey(point);
  });
}

function amountMinor(item) {
  if (Number.isFinite(item.amountMinor)) return item.amountMinor;
  return Number.isFinite(item.amount) ? Math.round(item.amount * 100) : null;
}

function isActual(item) {
  return (item.state || (item.actual === false ? "provisional" : "actual")) === "actual";
}

export function deriveMonthlyCosts(costs = [], selectedMonth) {
  const months = monthKeysEndingAt(selectedMonth);
  const totalForMonth = (month) => {
    const rows = costs.filter((item) => (item.month || item.date?.slice(0, 7)) === month
      && isActual(item) && (item.currency || "DKK") === "DKK");
    if (!rows.length) return null;
    return rows.reduce((sum, item) => sum + amountMinor(item), 0) / 100;
  };
  const values = months.map(totalForMonth);
  const [year, month] = selectedMonth.split("-").map(Number);
  const lastYearMonth = monthKey(new Date(Date.UTC(year - 1, month - 1, 1)));
  return { months, values, current: values.at(-1), previous: values.at(-2), lastYear: totalForMonth(lastYearMonth), lastYearMonth };
}

function monthBounds(month) {
  const [year, value] = month.split("-").map(Number);
  return {
    start: Date.UTC(year, value - 1, 1),
    end: Date.UTC(year, value, 1),
  };
}

export function deriveMonthlyDowntime(units, history = [], selectedMonth) {
  const months = monthKeysEndingAt(selectedMonth);
  const activeIds = new Set(units.filter((unit) => unit.status !== "inactive").map((unit) => unit.id));
  const sorted = history
    .filter((item) => activeIds.has(item.unitId) && Number.isFinite(Date.parse(item.at)))
    .sort((left, right) => left.at.localeCompare(right.at));
  const values = months.map((month) => {
    const { start, end } = monthBounds(month);
    let knownMs = 0;
    let workshopMs = 0;
    activeIds.forEach((unitId) => {
      const rows = sorted.filter((item) => item.unitId === unitId);
      const before = rows.filter((item) => Date.parse(item.at) <= start).at(-1);
      const inMonth = rows.filter((item) => Date.parse(item.at) > start && Date.parse(item.at) < end);
      const timeline = [...(before ? [{ ...before, at: new Date(start).toISOString() }] : []), ...inMonth];
      timeline.forEach((item, index) => {
        const itemStart = Math.max(start, Date.parse(item.at));
        const itemEnd = Math.min(end, index + 1 < timeline.length ? Date.parse(timeline[index + 1].at) : end);
        if (itemEnd <= itemStart) return;
        knownMs += itemEnd - itemStart;
        if (item.status === "workshop") workshopMs += itemEnd - itemStart;
      });
    });
    return knownMs ? Number((workshopMs / knownMs * 100).toFixed(1)) : null;
  });
  return { months, values, current: values.at(-1), previous: values.at(-2) };
}
