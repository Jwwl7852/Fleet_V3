import test from "node:test";
import assert from "node:assert/strict";
import {
  createSyntheticHistory,
  deduplicatePackets,
  deriveTripsAndStops,
  historyCsv,
  historyInPeriod,
  latestValidMeasurement,
  liveOperationalStatus,
  localDateTime,
  routeSegments,
} from "../fleet-v2/src/data/liveMapHistory.js";

test("historik dubletter fjernes og periodegrænser er inklusive", () => {
  const packets = createSyntheticHistory("unit-test", { electric: true });
  assert.equal(deduplicatePackets(packets).length, packets.length);
  const selected = historyInPeriod(packets, packets[2].measuredAt, packets[4].measuredAt);
  assert.equal(selected.length, 3);
});

test("ture, stop og databrud adskilles uden afstand hen over brud", () => {
  const packets = createSyntheticHistory("unit-test");
  const events = deriveTripsAndStops(packets);
  assert.ok(events.filter((event) => event.kind === "trip").length >= 2);
  assert.ok(events.some((event) => event.kind === "stop" && event.durationMinutes >= 5));
  assert.ok(events.some((event) => event.kind === "gap"));
  assert.equal(routeSegments(packets).length, 2);
  assert.ok(events.filter((event) => event.kind === "trip").every((event) => event.distanceKm > 0));
});

test("manglende signal må ikke blive afledt som et stop", () => {
  const packets = [
    { id: "a", providerPacketId: "a", measuredAt: "2026-09-21T08:00:00.000Z", latitude: 55.67, longitude: 12.55, speedKph: 0, ignition: true },
    { id: "b", providerPacketId: "b", measuredAt: "2026-09-21T08:20:00.000Z", latitude: 55.6701, longitude: 12.5501, speedKph: 0, ignition: true, gapBefore: true },
    { id: "c", providerPacketId: "c", measuredAt: "2026-09-21T08:21:00.000Z", latitude: 55.6701, longitude: 12.5501, speedKph: 20, ignition: true },
  ];
  const events = deriveTripsAndStops(packets);
  assert.ok(events.some((event) => event.kind === "gap"));
  assert.equal(events.some((event) => event.kind === "stop"), false);
});

test("seneste gyldige måling før valgt tidspunkt bevarer nul", () => {
  const packets = createSyntheticHistory("unit-test");
  const at = packets.at(-1).measuredAt;
  const speed = latestValidMeasurement(packets, "speedKph", at);
  assert.equal(speed.value, 0);
  assert.equal(latestValidMeasurement(packets, "driveBatteryPct", at), null);
});

test("live-status skelner mellem kørsel, hold og manglende signal", () => {
  const now = "2026-09-21T08:00:00.000Z";
  assert.equal(liveOperationalStatus({ measuredAt: now, connectionStatus: "online", movementState: "moving", speedKph: 38 }, now), "moving");
  assert.equal(liveOperationalStatus({ measuredAt: now, connectionStatus: "online", movementState: "stationary", speedKph: 0 }, now), "holding");
  assert.equal(liveOperationalStatus({ measuredAt: "2026-09-20T08:00:00.000Z", connectionStatus: "online", movementState: "moving", speedKph: 38 }, now), "offline");
});

test("dansk tidszone håndterer sommertid uden et opdigtet klokkeslæt", () => {
  assert.match(localDateTime("2026-03-29T00:30:00.000Z"), /01[.:]30/);
  assert.match(localDateTime("2026-03-29T01:30:00.000Z"), /03[.:]30/);
});

test("en tur over midnat bevarer kronologi", () => {
  const packets = [
    { id: "a", providerPacketId: "a", measuredAt: "2026-09-20T21:58:00.000Z", receivedAt: "2026-09-20T21:58:01.000Z", latitude: 55.67, longitude: 12.55, address: "Før midnat", speedKph: 25, ignition: true },
    { id: "b", providerPacketId: "b", measuredAt: "2026-09-20T22:04:00.000Z", receivedAt: "2026-09-20T22:04:01.000Z", latitude: 55.68, longitude: 12.56, address: "Efter midnat", speedKph: 28, ignition: true },
  ];
  const [trip] = deriveTripsAndStops(packets);
  assert.equal(trip.kind, "trip");
  assert.equal(trip.from, packets[0].measuredAt);
  assert.equal(trip.to, packets[1].measuredAt);
});

test("CSV-eksport medtager periode, tidszone, nulværdier og alle rækker", () => {
  const packets = createSyntheticHistory("unit-test");
  const csv = historyCsv(packets, { number: "TEST-1", registration: "AB12345" }, packets[0].measuredAt, packets.at(-1).measuredAt);
  assert.match(csv, /Europe\/Copenhagen/);
  assert.match(csv, /"TEST-1";"AB12345"/);
  assert.equal(csv.trim().split("\n").length, packets.length + 1);
  assert.match(csv, /;"0";"Fra";/);
});
