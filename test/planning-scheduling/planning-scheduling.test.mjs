import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLANFUND, PLANSTATUS, alleStopErBevaret, fjernPlacering,
  markerPlanlagtOgTilfoejBesked, placerForeloebigt, registrerAendringOensket,
} from "../../src/fleet/planning-scheduling/index.js";
import { opretDemoPlanlaegning } from "../../src/fleet/planning-scheduling/demo-planning-scheduling.js";

const place = (state, overrides = {}) => placerForeloebigt(state, { taskId: "week-task-01", date: "2032-09-13", resourceType: "rute", resourceId: "week-route-nord", startTime: "09:30", durationMin: 45, ...overrides }, { placementId: overrides.placementId || "placement-test-1", timestamp: "13.09.2032 · 09:42" });

describe("Deterministisk ugeplanlægning", () => {
  it("opretter uge 38 uden implicit tid eller mutation", () => {
    const state = opretDemoPlanlaegning(); const before = structuredClone(state);
    const result = place(state);
    assert.equal(result.ok, true); assert.equal(result.placement.status, PLANSTATUS.FORELOEBIG); assert.deepEqual(state, before);
  });
  it("giver samme resultat ved samme input", () => {
    assert.deepEqual(place(opretDemoPlanlaegning()), place(opretDemoPlanlaegning()));
  });
  it("flytter en foreløbig opgave uden at duplikere den", () => {
    const first = place(opretDemoPlanlaegning()).state;
    const moved = place(first, { placementId: "placement-test-1", date: "2032-09-14", startTime: "10:00" });
    assert.equal(moved.ok, true); assert.equal(moved.state.placements.length, 1); assert.equal(moved.state.placements[0].date, "2032-09-14"); assert.equal(moved.state.revision, first.revision + 1);
  });
  it("fjerner placeringen og sender opgaven tilbage i kø", () => {
    const state = place(opretDemoPlanlaegning()).state; const next = fjernPlacering(state, "placement-test-1");
    assert.equal(next.placements.length, 0); assert.equal(next.tasks.find((task) => task.id === "week-task-01").status, PLANSTATUS.I_KOE); assert.equal(next.revision, state.revision + 1);
  });
});

describe("Hårde placeringsregler", () => {
  it("afviser placering uden for perioden", () => assert.ok(place(opretDemoPlanlaegning(), { date: "2032-09-19" }).findings.some((finding) => finding.code === PLANFUND.DATO_UDEN_FOR_PERIODE)));
  it("afviser umuligt tidsvindue", () => assert.ok(place(opretDemoPlanlaegning(), { startTime: "15:15" }).findings.some((finding) => finding.code === PLANFUND.TIDSVINDUE_UMULIGT)));
  it("afviser manglende kompetence", () => assert.ok(place(opretDemoPlanlaegning(), { taskId: "week-task-03", date: "2032-09-13", resourceType: "medarbejder", resourceId: "week-employee-bo", startTime: "13:00", durationMin: 30 }).findings.some((finding) => finding.code === PLANFUND.KOMPETENCE_MANGLER)));
  it("afviser forkert køretøjstype og kapacitet", () => {
    const state = opretDemoPlanlaegning();
    const result = place(state, { taskId: "week-task-04", date: "2032-09-15", resourceType: "koeretoej", resourceId: "week-vehicle-van", startTime: "09:00", durationMin: 60 });
    assert.ok(result.findings.some((finding) => finding.code === PLANFUND.KOERETOEJSTYPE_FORKERT)); assert.ok(result.findings.some((finding) => finding.code === PLANFUND.KAPACITET_UTILSTRAEKKELIG));
  });
  it("afviser ressourcekonflikt inklusive returkørsel", () => {
    const first = place(opretDemoPlanlaegning()).state;
    const result = place(first, { taskId: "week-task-03", placementId: undefined, startTime: "10:20", durationMin: 30 });
    assert.ok(result.findings.some((finding) => finding.code === PLANFUND.RESSOURCEKONFLIKT));
  });
  it("bevarer flerstop-blokken med afhentning før levering", () => {
    const state = opretDemoPlanlaegning();
    const result = place(state, { taskId: "week-task-02", date: "2032-09-14", resourceId: "week-route-nord", startTime: "10:00", durationMin: 90 });
    assert.equal(result.ok, true); assert.deepEqual(result.placement.stops.map((stop) => stop.type), ["AFHENTNING", "LEVERING"]); assert.equal(alleStopErBevaret(result.state), true);
  });
});

describe("Bestillingstråd og flerdagsrute", () => {
  it("sender et forslag uden at foregive bestillerbekræftelse", () => {
    const placed = place(opretDemoPlanlaegning()).state;
    const result = markerPlanlagtOgTilfoejBesked(placed, "placement-test-1", { timestamp: "13.09.2032 · 10:05", messageId: "message-test" });
    assert.equal(result.ok, true); assert.equal(result.state.placements[0].final, false); assert.equal(result.state.tasks[0].status, PLANSTATUS.AFVENTER_BEKRAEFTELSE); assert.match(result.message, /Forslag/); assert.equal(result.state.tasks[0].thread.at(-1).synthetic, true);
  });
  it("bevarer tråden og gør den gamle reservation ikke-endelig ved ændringsønske", () => {
    const planned = markerPlanlagtOgTilfoejBesked(place(opretDemoPlanlaegning()).state, "placement-test-1", { timestamp: "13.09.2032 · 10:05", messageId: "message-test" }).state;
    const result = registrerAendringOensket(planned, "week-task-01", { timestamp: "13.09.2032 · 10:16", messageId: "change-test", text: "Torsdag efter kl. 13?" });
    assert.equal(result.state.tasks[0].status, PLANSTATUS.AENDRING_OENSKET); assert.equal(result.state.tasks[0].thread.length, 3); assert.equal(result.state.placements[0].final, false); assert.equal(result.state.placements[0].warning, true);
  });
  it("viser flerdagsruten nederst med entydige stop og samlet ugeprogram", () => {
    const route = opretDemoPlanlaegning().multiDayRoutes[0]; const stops = route.days.flatMap((day) => day.stops);
    assert.equal(new Set(stops.map((stop) => stop.id)).size, stops.length); assert.equal(route.startDate, "2032-09-13"); assert.equal(route.endDate, "2032-09-17"); assert.equal(route.nextStop, "Fiktivt stop 09");
  });
});
