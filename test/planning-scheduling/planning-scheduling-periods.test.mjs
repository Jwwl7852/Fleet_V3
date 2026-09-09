import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PERIODENIVEAU, PLANFUND, filtrerOpgaverEfterUger, isoUgeFraDato,
  isoUgeInterval, periodeOverlapperUger, placerForeloebigt,
  validerBestillingsperiode,
} from "../../src/fleet/planning-scheduling/index.js";
import { opretDemoPlanlaegning } from "../../src/fleet/planning-scheduling/demo-planning-scheduling.js";

describe("Bestillerperioder og ISO-ugefiltrering", () => {
  it("beregner ISO-uger deterministisk hen over et årsskifte", () => {
    assert.deepEqual(isoUgeFraDato("2033-01-01"), {
      aar: 2032, uge: 53, fra: "2032-12-27", til: "2033-01-02", noegle: "2032-W53",
    });
    assert.deepEqual(isoUgeInterval(2032, 53), {
      aar: 2032, uge: 53, fra: "2032-12-27", til: "2033-01-02", noegle: "2032-W53",
    });
    assert.equal(isoUgeInterval(2033, 53), null);
  });

  it("filtrerer flere uger efter bestillerens oprindelige periode uden dubletter", () => {
    const state = opretDemoPlanlaegning();
    const before = structuredClone(state.tasks);
    const weeks = [isoUgeInterval(2032, 37), isoUgeInterval(2032, 38), isoUgeInterval(2032, 39)];
    const filtered = filtrerOpgaverEfterUger(state.tasks, weeks, { medUdenDato: true });
    assert.equal(filtered.length, 40);
    assert.equal(new Set(filtered.map((task) => task.id)).size, filtered.length);
    assert.deepEqual(state.tasks, before);
  });

  it("viser et datointerval i alle overlappende uger og en opgave uden dato kun efter valg", () => {
    const interval = { art: "DATO_INTERVAL", niveau: PERIODENIVEAU.OENSKET, fraDato: "2032-09-11", tilDato: "2032-09-22" };
    assert.equal(periodeOverlapperUger(interval, [isoUgeInterval(2032, 37)]), true);
    assert.equal(periodeOverlapperUger(interval, [isoUgeInterval(2032, 38)]), true);
    assert.equal(periodeOverlapperUger(interval, [isoUgeInterval(2032, 39)]), true);
    assert.equal(periodeOverlapperUger({ art: "UDEN_DATO_OENSKE", niveau: PERIODENIVEAU.OENSKET }, [isoUgeInterval(2032, 38)]), false);
    assert.equal(periodeOverlapperUger({ art: "UDEN_DATO_OENSKE", niveau: PERIODENIVEAU.OENSKET }, [isoUgeInterval(2032, 38)], { medUdenDato: true }), true);
  });

  it("afviser en ugyldig uge 53", () => {
    assert.ok(validerBestillingsperiode({ art: "ISO_UGE", niveau: PERIODENIVEAU.OENSKET, aar: 2033, uge: 53 }).some((finding) => finding.code === PLANFUND.PERIODE_UGYLDIG));
  });

  it("tillader et alternativ uden for et ønske, men bevarer en advarsel", () => {
    const state = opretDemoPlanlaegning();
    state.tasks[0].requestPeriod = { art: "DATO", niveau: PERIODENIVEAU.OENSKET, dato: "2032-09-13" };
    const result = placerForeloebigt(state, {
      taskId: "week-task-01", date: "2032-09-15", resourceType: "rute",
      resourceId: "week-route-nord", startTime: "09:30", durationMin: 45,
    }, { placementId: "alternative-demo", timestamp: "13.09.2032 · 09:42" });
    assert.equal(result.ok, true);
    assert.ok(result.findings.some((finding) => finding.code === PLANFUND.BESTILLEROENSKE_AFVIGER));
    assert.equal(result.placement.warning, true);
    assert.deepEqual(result.placement.requestPeriodSnapshot, state.tasks[0].requestPeriod);
  });

  it("afviser et forslag uden for et bindende tidsvindue og bevarer input", () => {
    const state = opretDemoPlanlaegning();
    const before = structuredClone(state);
    const task = state.tasks.find((item) => item.id === "week-task-10");
    const result = placerForeloebigt(state, {
      taskId: task.id, date: "2032-09-16", resourceType: "rute",
      resourceId: "week-route-nord", startTime: "10:30", durationMin: task.durationMin,
    }, { placementId: "binding-demo", timestamp: "13.09.2032 · 09:42" });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === PLANFUND.BESTILLERKRAV_BRUDT));
    assert.deepEqual(state, before);
  });
});
