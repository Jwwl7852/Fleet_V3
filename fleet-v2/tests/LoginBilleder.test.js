import { describe, expect, it } from "vitest";
import { LOGIN_BILLEDER, LOGIN_MODULER, loginBillederForModuler, loginSenesteBilledeNøgle, vaelgLoginBillede } from "../../src/fleet/login-billeder.js";

describe("kundespecifikt loginbilledkatalog", () => {
  it("har præcis to billeder for hvert af de otte moduler", () => {
    expect(LOGIN_BILLEDER).toHaveLength(16);
    for (const modul of LOGIN_MODULER) {
      expect(LOGIN_BILLEDER.filter((billede) => billede.modul === modul).map((billede) => billede.nummer)).toEqual([1, 2]);
    }
    expect(LOGIN_BILLEDER.find((billede) => billede.id === "fleet-2").src).toContain("samlet-drift");
  });

  it("en kunde uden FACILITY får aldrig et FACILITY-billede ved genvalg eller reload", () => {
    const tilladte = loginBillederForModuler(["fleet", "workforce"]);
    for (let trin = 0; trin < 50; trin += 1) {
      const valgt = vaelgLoginBillede({ billeder: tilladte, forrigeId: trin ? tilladte[0].id : "facility-2", tilfældig: () => trin / 50 });
      expect(valgt.modul).not.toBe("facility");
    }
  });

  it("skift mellem kunder bruger adskilte lokale nøgler", () => {
    expect(loginSenesteBilledeNøgle("kunde_a_public")).not.toBe(loginSenesteBilledeNøgle("kunde_b_public"));
    expect(loginBillederForModuler(["fleet"]).every((billede) => billede.modul === "fleet")).toBe(true);
    expect(loginBillederForModuler(["facility"]).every((billede) => billede.modul === "facility")).toBe(true);
  });
});
