import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { get, ref, set } from "firebase/database";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "./rules-test-claims.mjs";
import { permStrengFraRolle } from "../src/fleet/permissions.js";

const KUN_UNIT = "unitV2KunUnit";
const KUN_WAREHOUSE = "unitV2KunWh";
const BEGGE = "unitV2Begge";
const ANDEN = "unitV2Anden";
let miljoe;
const REGEL_PORT = Number(process.env.UNITBOOKING_RULES_PORT || 9001);
const t = (tenant, sti) => `tenants/${tenant}/${sti}`;
const som = (tenant, rolle = "lagermedarbejder") => miljoe.authenticatedContext(`u-${tenant}-${rolle}`, {
  tenant, rolle, perms: permStrengFraRolle(rolle),
}).database();
const plads = { hal: "Hal 1", reol: "1", fag: "1", hylde: "1", plads: "1" };
const unit = (ekstra = {}) => ({
  type: "AL", status: "ledig", hjemPladsId: "p1", pladsId: "p1",
  maalBetydning: "udvendig", laengdeMm: 1400, breddeMm: 900, hoejdeMm: 1100,
  indvendigLaengdeMm: 1300, indvendigBreddeMm: 800, indvendigHoejdeMm: 1000,
  ...ekstra,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-unitbooking-v2",
    database: { host: "127.0.0.1", port: REGEL_PORT, rules: readFileSync("firebase.rules.json", "utf8") },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    const moduler = {
      [KUN_UNIT]: { unitbooking: true, warehouse: false },
      [KUN_WAREHOUSE]: { unitbooking: false, warehouse: true },
      [BEGGE]: { unitbooking: true, warehouse: true },
      [ANDEN]: { unitbooking: true, warehouse: false },
    };
    for (const [tenant, m] of Object.entries(moduler)) {
      await set(ref(db, t(tenant, "_findes")), true);
      await set(ref(db, t(tenant, "moduler")), m);
      await set(ref(db, t(tenant, "kassetyper/AL")), { navn: "Alukasse" });
      await set(ref(db, t(tenant, "reolpladser/p1")), plads);
      await set(ref(db, t(tenant, "reolpladser/p2")), { ...plads, plads: "2" });
      await set(ref(db, t(tenant, "kasser/MDT-101")), unit());
      await set(ref(db, t(tenant, "unitbevaegelser/op-seed-12345678")), {
        operationId: "op-seed-12345678", unitId: "MDT-101", art: "flytning",
        fraPladsId: "p1", tilPladsId: "p2", kilde: tenant === KUN_WAREHOUSE ? "warehouse" : "unitbooking",
        tidspunktMs: 1789000000000, udfoertAf: "seed",
      });
      await set(ref(db, t(tenant, "unitbookingImporter/import-1")), {
        id: "import-1", status: "gennemgang", materialeHash: "syntetisk", oprettetMs: 1789000000000,
        original: { art: "tekst", tekst: "Kunde: Syntetisk" },
      });
    }
  });
});

after(async () => miljoe?.cleanup());

describe("samme unitregister i begge moduler", () => {
  it("UNIT-only kan læse og registrere en unit", async () => {
    const db = som(KUN_UNIT);
    await assertSucceeds(get(ref(db, t(KUN_UNIT, "kasser/MDT-101"))));
    await assertSucceeds(set(ref(db, t(KUN_UNIT, "kasser/MDT-102")), unit()));
  });

  it("WAREHOUSE-only kan læse og registrere samme kassetype, id og lokation", async () => {
    const db = som(KUN_WAREHOUSE);
    await assertSucceeds(get(ref(db, t(KUN_WAREHOUSE, "kasser/MDT-101"))));
    await assertSucceeds(set(ref(db, t(KUN_WAREHOUSE, "kasser/WH-102")), unit()));
    await assertSucceeds(set(ref(db, t(KUN_WAREHOUSE, "kassetyper/TR")), { navn: "Trækasse" }));
  });

  it("tillader valgfri hjemplads, men ikke direkte ændring af aktuel placering", async () => {
    const db = som(KUN_UNIT);
    await assertSucceeds(set(ref(db, t(KUN_UNIT, "kasser/MDT-UDEN-HJEM")), unit({ hjemPladsId: null })));
    await assertFails(set(ref(db, t(KUN_UNIT, "kasser/MDT-101")), unit({ pladsId: "p2" })));
    await assertSucceeds(set(ref(db, t(KUN_UNIT, "kasser/MDT-101")), unit({ note: "Stamdata kan fortsat rettes" })));
  });

  it("afviser en bruger uden operationel/stamdatarettighed", async () => {
    const db = som(KUN_UNIT, "chauffoer");
    await assertFails(set(ref(db, t(KUN_UNIT, "kasser/MDT-103")), unit()));
  });

  it("afviser læsning på en anden tenant", async () => {
    const db = som(KUN_UNIT);
    await assertFails(get(ref(db, t(ANDEN, "kasser/MDT-101"))));
  });
});

describe("målsemantik", () => {
  it("accepterer separate udvendige og indvendige mål", async () => {
    await assertSucceeds(set(ref(som(KUN_UNIT), t(KUN_UNIT, "kasser/MDT-MAAL")), unit()));
  });

  it("afviser delvise indvendige mål og ukendt betydning", async () => {
    await assertFails(set(ref(som(KUN_UNIT), t(KUN_UNIT, "kasser/MDT-DEL")), unit({ indvendigHoejdeMm: null })));
    await assertFails(set(ref(som(KUN_UNIT), t(KUN_UNIT, "kasser/MDT-FEJL")), unit({ maalBetydning: "indvendig" })));
  });
});

describe("fælles historik og beskyttet import", () => {
  it("UNIT-only, WAREHOUSE-only og begge kan læse samme bevægelsesform", async () => {
    for (const tenant of [KUN_UNIT, KUN_WAREHOUSE, BEGGE]) {
      await assertSucceeds(get(ref(som(tenant), t(tenant, "unitbevaegelser"))));
    }
  });

  it("ingen klient kan skrive en fysisk bevægelse direkte", async () => {
    await assertFails(set(ref(som(BEGGE), t(BEGGE, "unitbevaegelser/op-klient-1234")), {
      operationId: "op-klient-1234", unitId: "MDT-101", art: "flytning",
      fraPladsId: "p1", tilPladsId: "p2", kilde: "unitbooking",
      tidspunktMs: 1789000000001, udfoertAf: "u",
    }));
  });

  it("kun UNIT med kasseudlaan.skriv kan læse originalmaterialet", async () => {
    await assertSucceeds(get(ref(som(KUN_UNIT), t(KUN_UNIT, "unitbookingImporter/import-1"))));
    await assertFails(get(ref(som(KUN_WAREHOUSE), t(KUN_WAREHOUSE, "unitbookingImporter/import-1"))));
    await assertFails(get(ref(som(KUN_UNIT, "chauffoer"), t(KUN_UNIT, "unitbookingImporter/import-1"))));
  });

  it("ingen klient kan ændre importudkast eller dubletindeks direkte", async () => {
    const db = som(KUN_UNIT);
    await assertFails(set(ref(db, t(KUN_UNIT, "unitbookingImporter/import-2")), { status: "bekraeftet" }));
    await assertFails(set(ref(db, t(KUN_UNIT, "unitbookingImportHashes/x")), "import-1"));
  });
});
