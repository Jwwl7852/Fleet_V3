const SOURCE_LABELS = Object.freeze({
  manual: "Manuel registrering",
  lease_delivery: "Leasing / aflevering",
  fleet_v2_demo_fixture: "Syntetisk FLEET-scenarie",
  "fleet-v2-demo-fixture": "Syntetisk FLEET-scenarie",
});

export const FLEET_METRICS = Object.freeze({
  odometer_km: { label: "Kilometerstand", unit: "km" },
  operating_hours: { label: "Driftstimer", unit: "t" },
  position: { label: "Position", unit: "koordinat" },
  speed_kph: { label: "Hastighed", unit: "km/t" },
});

const dateOnly = (value) => value ? String(value).slice(0, 10) : "";
const sourceLabel = (source) => SOURCE_LABELS[source] || source || "Ukendt kilde";
const isSynthetic = (item) => Boolean(item.demo) || String(item.source || "").includes("demo");

export function buildFleetMeasurements(dataset) {
  const relations = dataset?.relations || {};
  const meters = (relations.meterObservations || []).flatMap((item) => {
    const metric = item.unit === "km" ? "odometer_km" : item.unit === "hours" ? "operating_hours" : null;
    const value = Number(item.value);
    if (!metric || !Number.isFinite(value) || !item.observedAt) return [];
    return [{
      id: item.id,
      tenantId: item.tenantId,
      unitId: item.unitId,
      metric,
      value,
      unit: FLEET_METRICS[metric].unit,
      observedAt: item.observedAt,
      receivedAt: item.receivedAt || null,
      source: item.source || "unknown",
      sourceLabel: sourceLabel(item.source),
      synthetic: isSynthetic(item),
      connected: Boolean(item.connected) && !isSynthetic(item),
    }];
  });
  const positions = (relations.positions || []).flatMap((item) => {
    if (!Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude)) || !item.measuredAt) return [];
    const common = {
      tenantId: item.tenantId,
      unitId: item.unitId,
      observedAt: item.measuredAt,
      receivedAt: item.receivedAt || null,
      source: item.source || "unknown",
      sourceLabel: sourceLabel(item.source),
      synthetic: isSynthetic(item),
      connected: Boolean(item.connected) && !isSynthetic(item),
    };
    const rows = [{
      ...common,
      id: `${item.id}:position`,
      metric: "position",
      value: `${Number(item.latitude).toFixed(5)}, ${Number(item.longitude).toFixed(5)}`,
      unit: FLEET_METRICS.position.unit,
      label: item.label || null,
    }];
    if (Number.isFinite(Number(item.speedKph))) rows.push({
      ...common,
      id: `${item.id}:speed`,
      metric: "speed_kph",
      value: Number(item.speedKph),
      unit: FLEET_METRICS.speed_kph.unit,
    });
    return rows;
  });
  return [...meters, ...positions].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

export function filterFleetMeasurements(rows, filters = {}) {
  const from = filters.from || "0000-01-01";
  const to = filters.to || "9999-12-31";
  return rows.filter((item) => {
    const date = dateOnly(item.observedAt);
    return date >= from && date <= to
      && (!filters.unitId || item.unitId === filters.unitId)
      && (!filters.metric || item.metric === filters.metric)
      && (!filters.source || (filters.source === "synthetic" ? item.synthetic : filters.source === "connected" ? item.connected : !item.synthetic && !item.connected));
  });
}

export function fleetMeasurementCoverage(rows, units) {
  const unitIds = new Set(rows.map((item) => item.unitId));
  const sources = [...new Set(rows.map((item) => item.sourceLabel))].sort((a, b) => a.localeCompare(b, "da"));
  const connectedRows = rows.filter((item) => item.connected);
  const syntheticRows = rows.filter((item) => item.synthetic);
  return {
    unitCount: unitIds.size,
    totalUnits: units.length,
    measurementCount: rows.length,
    sources,
    connectedCount: connectedRows.length,
    syntheticCount: syntheticRows.length,
    connectionState: connectedRows.length ? "connected" : "not_connected",
    firstObservedAt: rows.length ? [...rows].sort((a, b) => a.observedAt.localeCompare(b.observedAt))[0].observedAt : null,
    lastObservedAt: rows[0]?.observedAt || null,
  };
}

export function fleetStatisticsCsv(rows, units) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = "Dato;Enhed;Måling;Værdi;Enhed;Kilde;Datatype";
  const body = rows.map((item) => [
    item.observedAt,
    units.find((unit) => unit.id === item.unitId)?.number || item.unitId,
    FLEET_METRICS[item.metric]?.label || item.metric,
    typeof item.value === "number" ? String(item.value).replace(".", ",") : item.value,
    item.unit,
    item.sourceLabel,
    item.synthetic ? "Syntetisk" : item.connected ? "Tilsluttet kilde" : "Lokal / manuel",
  ].map(quote).join(";"));
  return `\ufeff${[header, ...body].join("\r\n")}`;
}
