import { it } from "node:test";
import assert from "node:assert/strict";
import { opretBenchmarkScenarie, optimerDagsplan, scenarieChecksum } from "../../src/fleet/planning-optimization/index.js";

it("afslutter 190-køretøjs/2.000-opgave-benchmarken deterministisk ved den eksplicitte grænse", () => {
  const job = opretBenchmarkScenarie({ antalKoeretoejer: 190, antalOpgaver: 2000, maksOperationer: 6000 });
  const a = optimerDagsplan(job); const b = optimerDagsplan(job);
  const alle = [...a.dagsplanskladde.ruter.flatMap((rute) => rute.stop.map((stop) => stop.opgaveforekomstId)), ...a.ikkePlanlagte.flatMap((post) => post.forekomstIder)];
  assert.equal(job.ressourcer.koeretoejer.length, 190); assert.equal(job.planlaegningspulje.length, 2000);
  assert.equal(a.operationsgraenseNaaet, true); assert.equal(a.antalEvalueringer, 6000);
  assert.equal(alle.length, 2000); assert.equal(new Set(alle).size, 2000);
  assert.equal(a.domænevalidering.ok, true); assert.equal(scenarieChecksum(a), scenarieChecksum(b));
});
