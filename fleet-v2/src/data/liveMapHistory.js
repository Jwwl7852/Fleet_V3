const EARTH_RADIUS_KM = 6371;

export const LIVE_MAP_TIME_ZONE = "Europe/Copenhagen";

const radians = (value) => value * Math.PI / 180;

export function distanceKm(first, second) {
  if (!first || !second) return 0;
  const latDelta = radians(second.latitude - first.latitude);
  const lngDelta = radians(second.longitude - first.longitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
    * Math.sin(lngDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function localDateTime(value, options = {}) {
  if (!value) return "Ikke oplyst";
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: LIVE_MAP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: options.seconds ? "2-digit" : undefined,
  }).format(new Date(value));
}

export function localTime(value, seconds = false) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: LIVE_MAP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
  }).format(new Date(value));
}

export function deduplicatePackets(packets = []) {
  const unique = new Map();
  [...packets]
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt)
      || Date.parse(a.receivedAt || a.measuredAt) - Date.parse(b.receivedAt || b.measuredAt))
    .forEach((packet) => {
      const key = packet.providerPacketId || `${packet.measuredAt}:${packet.latitude}:${packet.longitude}`;
      const current = unique.get(key);
      if (!current || Date.parse(packet.receivedAt || packet.measuredAt) < Date.parse(current.receivedAt || current.measuredAt)) {
        unique.set(key, packet);
      }
    });
  return [...unique.values()].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
}

export function historyInPeriod(packets, from, to) {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  return deduplicatePackets(packets).filter((packet) => {
    const measured = Date.parse(packet.measuredAt);
    return measured >= fromMs && measured <= toMs;
  });
}

export function routeSegments(packets = []) {
  const segments = [];
  let current = [];
  deduplicatePackets(packets).forEach((packet) => {
    if (packet.gapBefore && current.length) {
      segments.push(current);
      current = [];
    }
    current.push(packet);
  });
  if (current.length) segments.push(current);
  return segments.filter((segment) => segment.length > 1);
}

const sameStop = (first, second) => distanceKm(first, second) <= 0.08;

export function deriveTripsAndStops(packets = []) {
  const sorted = deduplicatePackets(packets);
  const events = [];
  let tripStart = null;
  let stopStart = null;
  let tripPoints = [];

  const closeTrip = (last) => {
    if (!tripStart || tripPoints.length < 2 || !last) return;
    const distance = tripPoints.slice(1).reduce((sum, point, index) => {
      const previous = tripPoints[index];
      return sum + (point.gapBefore ? 0 : distanceKm(previous, point));
    }, 0);
    events.push({
      id: `trip-${tripStart.measuredAt}`,
      kind: "trip",
      from: tripStart.measuredAt,
      to: last.measuredAt,
      fromLabel: tripStart.address || tripStart.label,
      toLabel: last.address || last.label,
      distanceKm: distance,
      points: tripPoints,
    });
    tripStart = null;
    tripPoints = [];
  };

  sorted.forEach((packet, index) => {
    const moving = Number(packet.speedKph) > 2 && packet.ignition !== false;
    if (packet.gapBefore) {
      closeTrip(sorted[index - 1]);
      // Et databrud er hverken kørsel eller stilstand. En igangværende
      // stopkandidat må derfor ikke fortsætte på tværs af hullet.
      stopStart = null;
      events.push({ id: `gap-${packet.measuredAt}`, kind: "gap", from: sorted[index - 1]?.measuredAt, to: packet.measuredAt });
    }
    if (moving) {
      if (stopStart) {
        const durationMinutes = (Date.parse(packet.measuredAt) - Date.parse(stopStart.measuredAt)) / 60000;
        if (durationMinutes >= 5 && sameStop(stopStart, sorted[index - 1] || stopStart)) {
          events.push({
            id: `stop-${stopStart.measuredAt}`,
            kind: "stop",
            from: stopStart.measuredAt,
            to: packet.measuredAt,
            durationMinutes,
            label: stopStart.address || stopStart.label,
          });
        }
        stopStart = null;
      }
      if (!tripStart) tripStart = packet;
      tripPoints.push(packet);
    } else {
      closeTrip(sorted[index - 1]);
      if (!stopStart) stopStart = packet;
    }
  });
  closeTrip(sorted.at(-1));
  if (stopStart && sorted.length) {
    const last = sorted.at(-1);
    const durationMinutes = (Date.parse(last.measuredAt) - Date.parse(stopStart.measuredAt)) / 60000;
    if (durationMinutes >= 5 && sameStop(stopStart, last)) {
      events.push({ id: `stop-${stopStart.measuredAt}`, kind: "stop", from: stopStart.measuredAt, to: last.measuredAt, durationMinutes, label: stopStart.address || stopStart.label });
    }
  }
  return events.sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
}

export function latestValidMeasurement(packets, field, at) {
  const atMs = Date.parse(at);
  const packet = [...deduplicatePackets(packets)]
    .reverse()
    .find((item) => Date.parse(item.measuredAt) <= atMs && item[field] !== null && item[field] !== undefined && Number.isFinite(Number(item[field])));
  if (!packet) return null;
  return {
    value: Number(packet[field]),
    measuredAt: packet.measuredAt,
    ageMinutes: Math.max(0, Math.round((atMs - Date.parse(packet.measuredAt)) / 60000)),
  };
}

export function liveOperationalStatus(position, now = new Date().toISOString()) {
  if (!position?.measuredAt || position.connectionStatus === "offline") return "offline";
  const ageMinutes = (Date.parse(now) - Date.parse(position.measuredAt)) / 60000;
  if (!Number.isFinite(ageMinutes) || ageMinutes > 120) return "offline";
  return Number(position.speedKph) > 2 && position.movementState === "moving" ? "moving" : "holding";
}

export const LIVE_STATUS_LABELS = { moving: "Kører", holding: "Holder", offline: "Intet signal" };

function interpolate(first, second, count, start, durationMinutes, options = {}) {
  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0 : index / (count - 1);
    const measuredAt = new Date(Date.parse(start) + ratio * durationMinutes * 60000).toISOString();
    return {
      id: `${options.prefix}-${index}`,
      providerPacketId: `${options.prefix}-${index}`,
      unitId: options.unitId,
      latitude: first[0] + (second[0] - first[0]) * ratio + Math.sin(index) * 0.002,
      longitude: first[1] + (second[1] - first[1]) * ratio + Math.cos(index * 0.7) * 0.003,
      address: index === 0 ? options.fromLabel : index === count - 1 ? options.toLabel : options.addresses?.[index % options.addresses.length] || "Københavnsområdet",
      measuredAt,
      receivedAt: new Date(Date.parse(measuredAt) + (index % 4) * 1200).toISOString(),
      speedKph: Math.max(8, Math.round((options.speed || 46) + Math.sin(index * 1.3) * 9)),
      ignition: true,
      heading: Math.round(45 + ratio * 35),
      gpsFix: true,
      odometerKm: Number((42812.4 + (options.odometerOffset || 0) + index * 0.74).toFixed(1)),
      driveBatteryPct: options.electric ? Math.max(0, 72 - Math.floor(index / 4)) : null,
      trackerBatteryPct: 96,
      signalPercent: 78 - (index % 3) * 8,
      source: "synthetic-live-map-fixture",
      synthetic: true,
      gapBefore: options.gapIndex === index,
    };
  });
}

export function createSyntheticHistory(unitId, options = {}) {
  const electric = options.electric === true;
  const addresses = ["Greve Main 12, 2670 Greve", "Ishøj Stationsvej, 2635 Ishøj", "Hvidovrevej, 2650 Hvidovre", "Vigerslev Allé, København", "Kalvebod Brygge, København V"];
  const first = interpolate([55.5830, 12.3006], [55.6738, 12.5710], 18, "2026-09-21T06:10:00.000Z", 55, { prefix: `${unitId}-a`, unitId, fromLabel: "Greve", toLabel: "København", addresses, speed: 44, gapIndex: 10, electric });
  const stopOne = [0, 7, 15].map((minutes, index) => ({
    ...first.at(-1), id: `${unitId}-stop-a-${index}`, providerPacketId: `${unitId}-stop-a-${index}`,
    measuredAt: new Date(Date.parse("2026-09-21T07:05:00.000Z") + minutes * 60000).toISOString(), speedKph: 0, ignition: index === 2, address: "Kalvebod Brygge 45, 1560 København V",
  }));
  const second = interpolate([55.6738, 12.5710], [55.7702, 12.5038], 12, "2026-09-21T07:20:00.000Z", 32, { prefix: `${unitId}-b`, unitId, fromLabel: "København", toLabel: "Lyngby", addresses: ["Nørrebrogade, København N", "Tagensvej, København N", "Lyngbyvej, Hellerup"], speed: 39, odometerOffset: 24.6, electric });
  const stopTwo = [0, 10, 20].map((minutes, index) => ({
    ...second.at(-1), id: `${unitId}-stop-b-${index}`, providerPacketId: `${unitId}-stop-b-${index}`,
    measuredAt: new Date(Date.parse("2026-09-21T07:52:00.000Z") + minutes * 60000).toISOString(), speedKph: 0, ignition: false, address: "Lyngby Hovedgade 37, 2800 Lyngby",
  }));
  const duplicate = { ...first[4], id: `${first[4].id}-duplicate`, receivedAt: new Date(Date.parse(first[4].receivedAt) + 20000).toISOString() };
  return deduplicatePackets([...first, duplicate, ...stopOne, ...second, ...stopTwo]);
}

export function historyCsv(packets, unit, from, to) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const headers = ["Enhed", "Registrering", "Periode fra (Europe/Copenhagen)", "Periode til (Europe/Copenhagen)", "Måletid (Europe/Copenhagen)", "Modtaget", "Adresse", "Latitude", "Longitude", "Hastighed km/t", "Tænding", "Kilometertæller km", "Drivbatteri %", "Trackerbatteri %", "Signal %", "Datakilde"];
  const rows = historyInPeriod(packets, from, to).map((packet) => [unit?.number, unit?.registration, localDateTime(from, { seconds: true }), localDateTime(to, { seconds: true }), localDateTime(packet.measuredAt, { seconds: true }), localDateTime(packet.receivedAt, { seconds: true }), packet.address, packet.latitude, packet.longitude, packet.speedKph, packet.ignition ? "Til" : "Fra", packet.odometerKm, packet.driveBatteryPct, packet.trackerBatteryPct, packet.signalPercent, packet.source]);
  return `\ufeff${[headers, ...rows].map((row) => row.map(quote).join(";")).join("\n")}`;
}
