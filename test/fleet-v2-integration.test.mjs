import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FLEET_V2_INTEGRATION_DATABASE,
  FLEET_V2_TEST_DATABASE,
  fleetV2ActorFromUser,
  fleetV2PermissionForPath,
} from "../src/fleet/fleet-v2-integration.js";
import { PERM } from "../src/fleet/permissions.js";
import { findModul } from "../src/fleet/nav.js";

describe("FLEET v2 integrationsgrænse", () => {
  it("bruger særskilte databasenavne til integration og automatiske tests", () => {
    assert.notEqual(FLEET_V2_INTEGRATION_DATABASE, FLEET_V2_TEST_DATABASE);
    assert.match(FLEET_V2_INTEGRATION_DATABASE, /^veyro-fleet-v2-integration-/);
    assert.match(FLEET_V2_TEST_DATABASE, /^veyro-fleet-v2-integration-tests-/);
  });

  it("genbruger platformens eksisterende permissions ved direkte ruter", () => {
    assert.equal(fleetV2PermissionForPath("/fleet-v2"), PERM.koeretoejerLaes);
    assert.equal(fleetV2PermissionForPath("/fleet-v2/enheder/unit-1"), PERM.koeretoejerLaes);
    assert.equal(fleetV2PermissionForPath("/fleet-v2/indberetninger/ny"), PERM.indberetningerSkriv);
    assert.equal(fleetV2PermissionForPath("/fleet-v2/indberetninger/report-1"), PERM.indberetningerSkrivAlle);
    assert.equal(fleetV2PermissionForPath("/fleet-v2/arbejdsko/case-1"), PERM.sagLaes);
    assert.equal(fleetV2PermissionForPath("/fleet-v2/sager/case-1"), PERM.sagLaes);
  });

  it("bruger den autentificerede Veyro-identitet som lokal prototypeaktør", () => {
    assert.deepEqual(fleetV2ActorFromUser({
      uid: "uid-1", navn: "Test Bruger", rolle: "disponent", rolleLabel: "Disponent",
    }), { id: "uid-1", name: "Test Bruger", role: "Disponent" });
  });

  it("skelner katalogruten fra den dynamiske enhedsprofil i AppShell", () => {
    assert.equal(findModul("/fleet-v2/enheder").key, "fleetV2Enheder");
    assert.equal(findModul("/fleet-v2/enheder/unit-1").key, "fleetV2Enhed");
  });
});
