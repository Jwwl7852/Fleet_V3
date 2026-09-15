import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFleetServiceClient,
  mapServerOccurrenceToFleet,
  mapServerRequirementToFleet,
  mapSharedUnitToFleet,
  requirementInputToServer,
} from "../src/fleet/fleet-service-client.js";

describe("FLEET-serviceklientens autoritative grænse", () => {
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

  it("mapper deterministiske serverforekomster til eksisterende ruter", () => {
    const occurrence = mapServerOccurrenceToFleet({
      id: "svcocc-1", servicekravId: "servicekrav-1", enhedId: "kt-104",
      indberetningId: "svcrep-1", sagId: "svccase-1", status: "varslet",
    });
    assert.equal(occurrence.status, "alerted");
    assert.equal(occurrence.reportId, "svcrep-1");
    assert.equal(occurrence.origin, "service_automation");
  });
});
