const clone = (value) => structuredClone(value);

export const MOVEMENT_STATES = {
  moving: "I bevægelse",
  stationary: "Stilstand",
  unknown: "Ukendt bevægelse",
};

export const CONNECTION_STATES = {
  online: "Online",
  degraded: "Ustabil forbindelse",
  offline: "Offline",
  unknown: "Ukendt forbindelse",
};

export function hasValidCoordinates(position) {
  return Number.isFinite(position?.latitude)
    && Number.isFinite(position?.longitude)
    && position.latitude >= -90
    && position.latitude <= 90
    && position.longitude >= -180
    && position.longitude <= 180;
}

export function normalizePosition(position) {
  if (!position || !position.unitId) return null;
  const normalized = {
    id: position.id || `position-${position.unitId}`,
    tenantId: position.tenantId,
    unitId: position.unitId,
    latitude: Number(position.latitude),
    longitude: Number(position.longitude),
    label: position.label?.trim() || "Position uden adresse",
    measuredAt: position.measuredAt || position.updatedAt || null,
    receivedAt: position.receivedAt || position.updatedAt || null,
    lastContactAt: position.lastContactAt || position.receivedAt || position.updatedAt || null,
    movementState: MOVEMENT_STATES[position.movementState] ? position.movementState : "unknown",
    connectionStatus: CONNECTION_STATES[position.connectionStatus] ? position.connectionStatus : "unknown",
    accuracyMeters: Number.isFinite(Number(position.accuracyMeters)) ? Number(position.accuracyMeters) : null,
    speedKph: Number.isFinite(Number(position.speedKph)) ? Number(position.speedKph) : null,
    source: position.source || "legacy-local-demo",
    alarms: Array.isArray(position.alarms) ? position.alarms : [],
    demo: position.demo !== false,
  };
  return hasValidCoordinates(normalized) && Number.isFinite(Date.parse(normalized.measuredAt)) ? normalized : null;
}

export function positionFreshness(position, now = new Date().toISOString()) {
  if (!hasValidCoordinates(position) || !position?.measuredAt) return { key: "missing", label: "Ingen position", ageMinutes: null, stale: false };
  const ageMinutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(position.measuredAt)) / 60000));
  if (!Number.isFinite(ageMinutes)) return { key: "invalid", label: "Ugyldigt tidspunkt", ageMinutes: null, stale: true };
  if (ageMinutes <= 15) return { key: "current", label: "Aktuel position", ageMinutes, stale: false };
  if (ageMinutes <= 120) return { key: "delayed", label: `${ageMinutes} min. gammel`, ageMinutes, stale: false };
  const hours = Math.floor(ageMinutes / 60);
  return { key: "stale", label: hours < 48 ? `${hours} timer gammel` : `${Math.floor(hours / 24)} dage gammel`, ageMinutes, stale: true };
}

export function positionForUnit(relations, unitId) {
  return (relations.positions || []).find((item) => item.unitId === unitId) || null;
}

export function filterPositionUnits(units, positions, filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("da-DK");
  return units.filter((unit) => {
    const position = positions.find((item) => item.unitId === unit.id);
    const movement = position?.movementState || "unknown";
    const connection = position?.connectionStatus || "unknown";
    const haystack = [unit.number, unit.registration, unit.make, unit.model].filter(Boolean).join(" ").toLocaleLowerCase("da-DK");
    return (!query || haystack.includes(query))
      && (!filters.department || unit.department === filters.department)
      && (!filters.type || unit.type === filters.type)
      && (!filters.movement || movement === filters.movement)
      && (!filters.connection || connection === filters.connection);
  });
}

export function applyPositionMeasurement(dataset, input, options = {}) {
  const unit = dataset.units.find((item) => item.id === input.unitId);
  if (!unit) throw new Error("Enheden findes ikke.");
  const normalized = normalizePosition({ ...input, tenantId: dataset.tenantId, demo: input.demo !== false });
  if (!normalized) throw new Error("Positionen har ugyldige koordinater eller mangler måletidspunkt.");
  const positions = [...(dataset.relations.positions || [])];
  const index = positions.findIndex((item) => item.unitId === input.unitId);
  const current = index >= 0 ? positions[index] : null;
  if (current && Date.parse(normalized.measuredAt) <= Date.parse(current.measuredAt)) {
    return { dataset, position: current, ignored: true, reason: "older_or_equal_measurement" };
  }
  const position = { ...current, ...normalized, id: current?.id || normalized.id };
  if (index >= 0) positions[index] = position;
  else positions.push(position);
  const event = {
    id: `position-event-${options.eventId || crypto.randomUUID()}`,
    tenantId: dataset.tenantId,
    unitId: unit.id,
    positionId: position.id,
    at: position.receivedAt,
    type: "position_received",
    title: "Demoposition opdateret",
    text: `${position.label} · ${CONNECTION_STATES[position.connectionStatus]}.`,
    source: position.source,
  };
  return {
    dataset: { ...dataset, relations: { ...dataset.relations, positions, positionEvents: [...(dataset.relations.positionEvents || []), event] } },
    position,
    event,
    ignored: false,
  };
}

export function applyPositionDemo(dataset, input, options = {}) {
  const current = positionForUnit(dataset.relations, input.unitId);
  if (!current) throw new Error("Enheden har ingen position at simulere ud fra.");
  const now = input.now || options.now || new Date().toISOString();
  const scenarios = {
    move: { latitude: current.latitude + 0.0025, longitude: current.longitude + 0.0035, movementState: "moving", connectionStatus: "online", speedKph: 42, alarms: [] },
    stop: { movementState: "stationary", connectionStatus: "online", speedKph: 0, alarms: [] },
    degraded: { movementState: "unknown", connectionStatus: "degraded", speedKph: null, alarms: [{ code: "connection_degraded", label: "Ustabil forbindelse" }] },
    offline: { movementState: "unknown", connectionStatus: "offline", speedKph: null, alarms: [{ code: "connection_lost", label: "Forbindelse mistet" }] },
    restore: { movementState: "stationary", connectionStatus: "online", speedKph: 0, alarms: [] },
  };
  const change = scenarios[input.scenario];
  if (!change) throw new Error("Vælg en gyldig demosituation.");
  return applyPositionMeasurement(dataset, {
    ...clone(current),
    ...change,
    measuredAt: now,
    receivedAt: now,
    lastContactAt: input.scenario === "offline" ? current.lastContactAt : now,
    source: "fleet-v2-demo-control",
    demo: true,
  }, options);
}
