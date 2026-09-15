import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFleetServiceClient,
  fleetServiceProjectionState,
  mapServerCaseToFleet,
  mapServerOccurrenceToFleet,
  mapServerReportToFleet,
  mapServerRequirementToFleet,
  mapServerServiceHistoryToFleet,
  mapFleetUnitToShared,
  mapSharedUnitToFleet,
  requirementInputToServer,
} from "../src/fleet/fleet-service-client.js";

describe("FLEET-serviceklientens autoritative grænse", () => {
  it("afslutter loading, når alle seks serverprojektioner er færdige og tomme", () => {
    const ready = { data: [], henter: false, fejl: null };
    const service = {
      units: ready, requirements: ready, occurrences: ready,
      reports: ready, cases: ready, history: ready,
    };
    assert.deepEqual(fleetServiceProjectionState(service), { loading: false, error: null });
    assert.equal(fleetServiceProjectionState({ ...service, history: { ...ready, henter: true } }).loading, true);
    const error = new Error("afvist");
    assert.equal(fleetServiceProjectionState({ ...service, reports: { ...ready, fejl: error } }).error, error);
  });

  it("mapper den fælles enheds-ID uden at oprette et nyt FLEET-ID", () => {
    const mapped = mapSharedUnitToFleet({
      id: "kt-104", kaldenavn: "Bil 104", navn: "Mercedes Actros",
      registrering: "DE 45 678", art: "lastbil", status: "aktiv", kmStand: 298450,
    });
    assert.equal(mapped.id, "kt-104");
    assert.equal(mapped.number, "Bil 104");
    assert.equal(mapped.meter, 298450);
    assert.equal(mapped.source, "shared-unit-register");
  });

  it("round-tripper FLEET-profilen gennem den fælles koeretoejer-post", () => {
    const shared = mapFleetUnitToShared({
      id: "kt-104", number: "Bil 104", type: "vehicle", make: "Mercedes",
      model: "Actros", department: "Kolding", meterType: "km", meter: 298451,
      status: "operation", registration: "DE 45 678", serialNumber: "SYNTH-VIN-104",
      year: 2024, vehicleDetails: { fuel: "diesel", color: "blå" },
      dimensions: { unit: "cm", lengthCm: 1035, widthCm: 255, heightCm: 390 },
      interiorDimensions: { unit: "cm", lengthCm: 800, widthCm: 245, heightCm: 260 },
      equipment: { towHook: true, trailerCoupling: false, crane: true, lift: false },
      notes: "Syntetisk testpost", updatedAt: "2026-09-15T12:00:00.000Z",
    }, { id: "kt-104", art: "lastbil", status: "aktiv", servicepunkter: { a: { type: "service" } } });
    assert.equal(shared.art, "lastbil");
    assert.equal(shared.kmStand, 298451);
    assert.deepEqual(shared.servicepunkter, { a: { type: "service" } });
    const mapped = mapSharedUnitToFleet({ id: "kt-104", ...shared });
    assert.equal(mapped.number, "Bil 104");
    assert.equal(mapped.vehicleDetails.color, "blå");
    assert.equal(mapped.interiorDimensions.lengthCm, 800);
    assert.equal(mapped.equipment.crane, true);
  });

  it("round-tripper serverens servicefelter til FLEET-visningen", () => {
    const mapped = mapServerRequirementToFleet({
      id: "servicekrav-104", enhedId: "kt-104", titel: "Årligt service",
      maalerEnhed: "km", intervalMaaneder: 12, aarligMaaned: 10, aarligDag: 15,
      kategori: "maintenance", revision: 4, aktiv: true,
    });
    assert.equal(mapped.unitId, "kt-104");
    assert.equal(mapped.annualMonth, 10);
    assert.equal(mapped.revision, 4);
    assert.equal(mapped.source, "server");
  });

  it("sender hele den redigerbare plan og danske måleenheder til serveren", () => {
    const payload = requirementInputToServer({
      unitId: "maskine-1", title: "Hydraulik", category: "inspection",
      intervalMeter: "500", warningMeter: "50", annualMonth: "11", annualDay: "3",
      baselineDate: "2026-01-02", baselineMeter: "1200", documentIds: ["doc-1", "doc-1"],
    }, { meterType: "hours" });
    assert.equal(payload.maalerEnhed, "timer");
    assert.equal(payload.intervalMaeler, 500);
    assert.equal(payload.aarligMaaned, 11);
    assert.deepEqual(payload.dokumentIder, ["doc-1"]);
  });

  it("bruger serverkald og falder ikke tilbage til lokal lagring ved fejl", async () => {
    const calls = [];
    const client = createFleetServiceClient({ call: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "fleetServiceKontrolNu") throw Object.assign(new Error("offline"), { code: "functions/unavailable" });
      return { data: { ok: true, revision: 3 } };
    } });
    const saved = await client.saveRequirement({ unitId: "kt-104", title: "Service" }, [{ id: "kt-104", meterType: "km" }], null);
    assert.equal(saved.revision, 3);
    assert.equal(calls[0].name, "fleetServiceKravGem");
    await assert.rejects(client.runAutomation(), /Intet blev gemt lokalt/);
  });

  it("sender eksplicit bevar-valg ved deaktivering med åben forekomst", async () => {
    const calls = [];
    const client = createFleetServiceClient({ call: async (name, payload) => {
      calls.push({ name, payload });
      return { ok: true };
    } });
    await client.saveRequirement({
      id: "servicekrav-1", unitId: "unit-1", title: "Service", active: false,
      keepOpenOccurrence: true, firstDueDate: "2027-01-01",
    }, [{ id: "unit-1", meterType: "km" }], {
      id: "servicekrav-1", revision: 3, activeOccurrenceId: "occ-1",
    });
    assert.equal(calls[0].payload.aabenForekomstHandling, "bevar");
    assert.equal(calls[0].payload.forventetRevision, 3);
  });

  it("mapper deterministiske serverforekomster til eksisterende ruter", () => {
    const occurrence = mapServerOccurrenceToFleet({
      id: "svcocc-1", servicekravId: "servicekrav-1", enhedId: "kt-104",
      indberetningId: "svcrep-1", sagId: "svccase-1", status: "varslet",
    });
    assert.equal(occurrence.status, "alerted");
    assert.equal(occurrence.reportId, "svcrep-1");
    assert.equal(occurrence.origin, "service_automation");
  });

  it("projekterer serverens indberetning og sag uden at ændre deres ID'er", () => {
    const report = mapServerReportToFleet({
      id: "svcrep-1", sagId: "svccase-1", enhedId: "kt-104", titel: "Årligt service",
      prioritet: "hoej", oprettetMs: Date.parse("2026-09-15T08:00:00Z"),
    });
    const caseItem = mapServerCaseToFleet({
      id: "svccase-1", indberetningId: "svcrep-1", enhedId: "kt-104",
      status: "fakturaafklaring", prioritet: "hoej", oprettetMs: Date.parse("2026-09-15T08:00:00Z"),
    });
    assert.equal(report.id, "svcrep-1");
    assert.equal(report.caseId, "svccase-1");
    assert.equal(report.usability, "uncertain");
    assert.equal(report.readOnly, true);
    assert.equal(caseItem.id, "svccase-1");
    assert.equal(caseItem.reportId, "svcrep-1");
    assert.equal(caseItem.status, "invoice_pending");
    assert.equal(caseItem.readOnly, true);
  });

  it("mapper serverhistorik til sagens tidslinje", () => {
    const event = mapServerServiceHistoryToFleet({
      id: "svcevt-1", sagId: "svccase-1", indberetningId: "svcrep-1",
      handling: "service_gennemfoert", aktor: "user-7", dato: "2026-09-15",
      maaler: 12000, tidspunktMs: Date.parse("2026-09-15T09:30:00Z"),
    });
    assert.equal(event.caseId, "svccase-1");
    assert.match(event.text, /12\.000/);
    assert.equal(event.source, "server");
  });
});
