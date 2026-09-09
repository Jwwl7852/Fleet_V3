import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FACILITY_V2_INTEGRATION_DATABASE,
  FACILITY_V2_ROUTE_PREFIX,
  FACILITY_V2_TEST_DATABASE,
  facilityV2ActorFromUser,
  facilityV2PermissionForPath,
} from "../src/fleet/facility-v2-integration.js";
import { PERM } from "../src/fleet/permissions.js";
import { findModul } from "../src/fleet/nav.js";

describe("FACILITY v2 integrationsgrænse", () => {
  it("bruger nyt route-prefix og særskilte databaser til integration og test", () => {
    assert.equal(FACILITY_V2_ROUTE_PREFIX, "/facility-v2");
    assert.notEqual(FACILITY_V2_INTEGRATION_DATABASE, FACILITY_V2_TEST_DATABASE);
    assert.match(FACILITY_V2_INTEGRATION_DATABASE, /^veyro-facility-v2-integration-/);
    assert.match(FACILITY_V2_TEST_DATABASE, /^veyro-facility-v2-test-/);
  });

  it("bruger den eksisterende facility.skriv-gate ved direkte ruter", () => {
    assert.equal(facilityV2PermissionForPath("/facility-v2"), PERM.facilitySkriv);
    assert.equal(facilityV2PermissionForPath("/facility-v2/sager/case-1"), PERM.facilitySkriv);
    assert.equal(facilityV2PermissionForPath("/facility-v2/dokumenter"), PERM.facilitySkriv);
  });

  it("bruger den autentificerede Veyro-identitet som lokal prototypeaktør", () => {
    assert.deepEqual(facilityV2ActorFromUser({
      uid: "uid-1", navn: "Test Bruger", email: "test@example.invalid",
    }), { id: "uid-1", name: "Test Bruger", verified: true });
  });

  it("skelner katalogruter fra dynamiske profiler i AppShell", () => {
    assert.equal(findModul("/facility-v2").key, "facilityV2Overblik");
    assert.equal(findModul("/facility-v2/ejendomme").key, "facilityV2Ejendomme");
    assert.equal(findModul("/facility-v2/ejendomme/property-1").key, "facilityV2Ejendom");
    assert.equal(findModul("/facility-v2/opgaver/task-1").key, "facilityV2Opgave");
  });
});
