import { describe, expect, it } from "vitest";
import { fixtureUnits } from "../src/data/fleetFixtures";
import { MOBILE_DEMO_USERS, mobileUnitsForUser, resolveUnitCode, unitCode } from "../src/data/mobileReporting";

describe("mobil adgang og stabile enhedskoder", () => {
  it("afgrænser enheder efter demo-brugerens afdelinger", () => {
    const rows = mobileUnitsForUser(fixtureUnits, MOBILE_DEMO_USERS[0]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((unit) => ["Service", "Varelevering"].includes(unit.department))).toBe(true);
    expect(mobileUnitsForUser(fixtureUnits, MOBILE_DEMO_USERS[1])).toHaveLength(fixtureUnits.length);
  });

  it("løser kun kendte stabile koder og håndhæver adgang", () => {
    expect(resolveUnitCode(unitCode("unit-sc-104"), fixtureUnits, MOBILE_DEMO_USERS[0]).unit.id).toBe("unit-sc-104");
    expect(resolveUnitCode(unitCode("unit-nb-001"), fixtureUnits, MOBILE_DEMO_USERS[0]).error).toMatch(/ikke adgang/);
    expect(resolveUnitCode("https://example.com", fixtureUnits, MOBILE_DEMO_USERS[1]).error).toMatch(/ukendt/);
  });
});
