import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyFleetServiceAutomation,
  completeFleetServiceOccurrence,
  evaluateFleetServiceRequirement,
  validateFleetServiceRequirement,
} from "../functions/fleet-service-automation.js";

const dueRequirement = {
  titel: "Årligt eftersyn",
  enhedId: "unit-1",
  aktiv: true,
  maalerEnhed: "km",
  sidsteServiceDato: "2025-09-20",
  sidsteServiceMaaler: 100_000,
  intervalMaaneder: 12,
  intervalMaeler: 20_000,
  varselDage: 30,
  varselMaeler: 1_000,
};

const tenant = () => ({
  _findes: true,
  abonnement: { status: "aktiv" },
  moduler: { flaade: true },
  koeretoejer: { "unit-1": { navn: "Syntetisk enhed", kilometer: 119_500 } },
  fleetServiceKrav: { "servicekrav-1": dueRequirement },
});

describe("serverstyret FLEET-serviceautomatik", () => {
  it("validerer kalender-/målergrundlag og forklarer mangler", () => {
    const invalid = validateFleetServiceRequirement({ titel: "Test", enhedId: "unit-1", intervalMaeler: 500 });
    assert.equal(invalid.ok, false);
    assert.match(invalid.errors.sidsteServiceMaaler, /kræver/);
    const evaluation = evaluateFleetServiceRequirement({ ...dueRequirement, sidsteServiceDato: null, intervalMaaneder: null }, {}, "2026-09-15");
    assert.equal(evaluation.alert, false);
    assert.equal(evaluation.reason, "missing_meter");
  });

  it("opretter én sammenhængende forekomst, indberetning og sag", () => {
    const result = applyFleetServiceAutomation(tenant(), { nowMs: Date.parse("2026-09-15T08:00:00Z"), today: "2026-09-15" });
    assert.equal(result.created.length, 1);
    const created = result.created[0];
    assert.equal(result.tenant.fleetServiceForekomster[created.occurrenceId].indberetningId, created.reportId);
    assert.equal(result.tenant.fleetIndberetninger[created.reportId].sagId, created.caseId);
    assert.equal(result.tenant.fleetSager[created.caseId].indberetningId, created.reportId);
    assert.equal(result.tenant.fleetSager[created.caseId].naesteHandling, "Vurder automatisk servicevarsel");
  });

  it("genbruger den deterministiske cyklus ved gentagne kørsler", () => {
    const first = applyFleetServiceAutomation(tenant(), { nowMs: 1, today: "2026-09-15" });
    const second = applyFleetServiceAutomation(first.tenant, { nowMs: 2, today: "2026-09-15" });
    assert.equal(second.created.length, 0);
    assert.equal(second.reused.length, 1);
    assert.equal(Object.keys(second.tenant.fleetServiceForekomster).length, 1);
    assert.equal(Object.keys(second.tenant.fleetIndberetninger).length, 1);
    assert.equal(Object.keys(second.tenant.fleetSager).length, 1);
  });

  it("gennemført service flytter beregningsgrundlaget, men lukker ikke fakturaafklaringen", () => {
    const first = applyFleetServiceAutomation(tenant(), { nowMs: 1, today: "2026-09-15" });
    const occurrenceId = first.created[0].occurrenceId;
    const completed = completeFleetServiceOccurrence(first.tenant, occurrenceId, {
      dato: "2026-09-18", maaler: 120_100, actorId: "admin-1",
    }, { nowMs: 2 });
    assert.equal(completed.ok, true);
    assert.equal(completed.tenant.fleetServiceKrav["servicekrav-1"].sidsteServiceDato, "2026-09-18");
    assert.equal(completed.tenant.fleetServiceForekomster[occurrenceId].status, "gennemfoert");
    assert.equal(completed.tenant.fleetSager[first.created[0].caseId].status, "fakturaafklaring");
    const tooEarly = applyFleetServiceAutomation(completed.tenant, { nowMs: 3, today: "2026-10-01" });
    assert.equal(tooEarly.created.length, 0);
    const repeated = completeFleetServiceOccurrence(completed.tenant, occurrenceId, {
      dato: "2026-09-18", maaler: 120_100, actorId: "admin-1",
    }, { nowMs: 4 });
    assert.equal(repeated.repeated, true);
    const conflict = completeFleetServiceOccurrence(completed.tenant, occurrenceId, {
      dato: "2026-09-19", maaler: 120_200, actorId: "admin-1",
    }, { nowMs: 5 });
    assert.deepEqual({ ok: conflict.ok, code: conflict.code }, { ok: false, code: "completion_conflict" });
  });

  it("eksponerer scheduler, manuel kontrol, gem og gennemførsel som serverfunktioner", () => {
    const source = readFileSync("functions/index.js", "utf8");
    for (const name of ["fleetServiceKravGem", "fleetServiceKontrolNu", "fleetServiceGennemfoer"]) {
      assert.match(source, new RegExp(`export const ${name} = onCall`));
    }
    assert.match(source, /export const fleetServiceKontrolPlanlagt = onSchedule/);
    assert.match(source, /schedule: "every 60 minutes"/);
  });
});
