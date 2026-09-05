/* test/rules.warehouse.test.mjs
 * Warehouse etape 2: reglerne på varer, bevægelser, beholdning — og på den
 * DELTE reolplads.
 *
 * ⚠ DEN VIGTIGSTE PRØVE I FILEN ER "en kunde med KUN Warehouse".
 * `reolpladser` blev bygget til Unitbooking og gates i dag af det modul.
 * Blev klausulen ikke udvidet, ville en WMS-kunde uden Unitbooking få en
 * tom liste og en afvist skrivning — og skærmen ville bare sige "ingen
 * reolpladser". Ingen ville gætte at det var modulafkrydsningen.
 *
 * Kør:  npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "./rules-test-claims.mjs";
import { get, ref, set, update } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import { MAENGDE_SKALA, beholdningsNoegle } from "../src/fleet/warehouse.js";

/* Tre tenanter, fordi det er modulkombinationen der prøves. */
const BEGGE = "wmsBegge";      /* unitbooking + warehouse */
const KUN_WMS = "wmsKun";      /* kun warehouse */
const KUN_TB = "wmsTb";        /* kun unitbooking */
let miljoe;

const som = (tenant, rolle = "lagermedarbejder") =>
  miljoe.authenticatedContext(`u-${tenant}-${rolle}`, {
    tenant, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const t = (tenant, sti) => `tenants/${tenant}/${sti}`;

const vare = (x = {}) => ({
  kundeId: "k1", varenummer: "ST-1002", navn: "Leje 6205 2RS",
  enhed: "stk", sporing: "ingen", ...x,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-warehouse",
    database: {
      host: "127.0.0.1", port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    const moduler = {
      [BEGGE]: { unitbooking: true, warehouse: true },
      [KUN_WMS]: { warehouse: true, unitbooking: false },
      [KUN_TB]: { unitbooking: true, warehouse: false },
    };
    for (const [id, m] of Object.entries(moduler)) {
      await set(ref(db, t(id, "_findes")), true);
      await set(ref(db, t(id, "moduler")), m);
      await set(ref(db, t(id, "kunder/k1")), { navn: "Kunde 1" });
      await set(ref(db, t(id, "reolpladser/p1")), {
        hal: "Hal 1", reol: "1", fag: "1", hylde: "6", plads: "1",
      });
      await set(ref(db, t(id, "reolpladser/p2")), {
        hal: "Hal 1", reol: "1", fag: "1", hylde: "7", plads: "1",
      });
      await set(ref(db, t(id, "varer/v1")), vare());
    }
  });
});

after(async () => { await miljoe?.cleanup(); });

describe("den delte reolplads", () => {
  const plads = { hal: "Hal 2", reol: "3", fag: "1", hylde: "2", plads: "1" };

  it("⚠ EN KUNDE MED KUN WAREHOUSE KAN BRUGE HYLDERNE", async () => {
    /* Hele grunden til at klausulen blev et ELLER. Uden det ville WMS-kunden
       have et lager han ikke kunne se. */
    const db = som(KUN_WMS);
    await assertSucceeds(set(ref(db, t(KUN_WMS, "reolpladser/ny")), plads));
    await assertSucceeds(get(ref(db, t(KUN_WMS, "reolpladser"))));
  });

  it("en kunde med kun Unitbooking kan det stadig", async () => {
    /* Den anden retning: udvidelsen må ikke have lukket den oprindelige ude. */
    const db = som(KUN_TB);
    await assertSucceeds(set(ref(db, t(KUN_TB, "reolpladser/ny")), plads));
  });

  it("kræver reolpladser.skriv — ikke kasser.skriv", async () => {
    /* En node to moduler deler, kan ikke gates af det ene moduls rettighed. */
    const db = som(BEGGE, "disponent");
    await assertFails(set(ref(db, t(BEGGE, "reolpladser/nej")), plads));
  });

  it("tager de nye lagerfelter — og afviser en ukendt værdi", async () => {
    const db = som(BEGGE);
    await assertSucceeds(set(ref(db, t(BEGGE, "reolpladser/p3")), {
      ...plads, zone: "Zone A", type: "gulvplads", status: "karantaene",
      temperatur: 4.2,
    }));
    await assertFails(set(ref(db, t(BEGGE, "reolpladser/p4")), {
      ...plads, type: "reol",
    }));
    await assertFails(set(ref(db, t(BEGGE, "reolpladser/p5")), {
      ...plads, temperatur: 200,
    }));
  });

  it("accepterer stadig en plads helt uden dem", async () => {
    /* ⚠ ELLERS GÅR UNITBOOKING I STYKKER. */
    const db = som(BEGGE);
    await assertSucceeds(set(ref(db, t(BEGGE, "reolpladser/p6")), plads));
  });

  it("⚠ EN RETTELSE FRA DEN ENE SKÆRM SLETTER IKKE DEN ANDENS FELTER", async () => {
    /* Den her prøve findes fordi fejlen ALLEREDE var indført: Unitbookings
       formular sender kun hal/reol/fag/hylde/plads, og gem() skrev med
       .set(). En lagermedarbejder der rettede et hyldenummer, ville have
       nulstillet temperaturen og taget hylden ud af karantæne — i tavshed.

       Rettelsen er `flet: true` i skriv.js, som bruger update(). Prøven her
       er den adfærd, ikke koden: skriv WMS-felterne, ret så kun
       Unitbookings, og se at de første står. */
    const db = som(BEGGE);
    const sti = t(BEGGE, "reolpladser/delt");
    await assertSucceeds(set(ref(db, sti), {
      ...plads, zone: "Zone A", type: "hylde", status: "karantaene", temperatur: 4.2,
    }));
    await assertSucceeds(update(ref(db, sti), {
      hal: "Hal 3", reol: "9", fag: "1", hylde: "2", plads: "1",
    }));
    const efter = (await get(ref(db, sti))).val();
    assert.equal(efter.hal, "Hal 3", "rettelsen slog ikke igennem");
    assert.equal(efter.status, "karantaene", "karantænen forsvandt");
    assert.equal(efter.temperatur, 4.2, "temperaturen forsvandt");
    assert.equal(efter.zone, "Zone A", "zonen forsvandt");
  });
});

describe("varekartoteket", () => {
  it("kan skrives med varer.skriv", async () => {
    const db = som(BEGGE);
    await assertSucceeds(set(ref(db, t(BEGGE, "varer/v2")), vare()));
  });

  it("nægtes en rolle uden permissionen", async () => {
    const db = som(BEGGE, "disponent");
    await assertFails(set(ref(db, t(BEGGE, "varer/v3")), vare()));
  });

  it("⚠ NÆGTES HELT UDEN MODULET", async () => {
    const db = som(KUN_TB);
    await assertFails(set(ref(db, t(KUN_TB, "varer/v4")), vare()));
    await assertFails(get(ref(db, t(KUN_TB, "varer"))));
  });

  it("kræver en kunde der findes", async () => {
    /* 3PL: uden en gyldig modpart kan bevægelsen ikke afregnes. */
    const db = som(BEGGE);
    await assertFails(set(ref(db, t(BEGGE, "varer/v5")), vare({ kundeId: "spoegelse" })));
  });

  it("afviser en enhed og en sporing der ikke findes", async () => {
    const db = som(BEGGE);
    await assertFails(set(ref(db, t(BEGGE, "varer/v6")), vare({ enhed: "styk" })));
    await assertFails(set(ref(db, t(BEGGE, "varer/v7")), vare({ sporing: "lot" })));
  });

  it("afviser et mål der ikke er et helt antal millimeter", async () => {
    const db = som(BEGGE);
    await assertFails(set(ref(db, t(BEGGE, "varer/v8")), vare({ laengdeMm: 120.5 })));
    await assertSucceeds(set(ref(db, t(BEGGE, "varer/v9")), vare({ laengdeMm: 1200 })));
  });

  it("afviser et felt der ikke står i modellen", async () => {
    const db = som(BEGGE);
    await assertFails(set(ref(db, t(BEGGE, "varer/v10")), vare({ kostpris: 100 })));
  });
});

describe("bevægelser og beholdning skrives kun af serveren", () => {
  const bev = {
    art: "modtag", vareId: "v1", kundeId: "k1",
    antal: 2 * MAENGDE_SKALA, tilCarrierId: "c1", tidspunktMs: 1786000000000,
  };

  it("nægter en lagermedarbejder at skrive en bevægelse", async () => {
    /* ⚠ HAN HAR PERMISSIONEN. `bevaegelser.skriv` står i hans rolle og bruges
       af den Cloud Function der skriver for ham. Det er VEJEN der er lukket:
       bevægelsen og beholdningen skal skrives sammen eller slet ikke. */
    const db = som(BEGGE);
    await assertFails(set(ref(db, t(BEGGE, "bevaegelser/b1")), bev));
  });

  it("nægter også en admin", async () => {
    const db = som(BEGGE, "admin");
    await assertFails(set(ref(db, t(BEGGE, "bevaegelser/b2")), bev));
  });

  it("nægter enhver at røre beholdningen", async () => {
    /* ⚠ ET LAGERTAL DER KAN RETTES I HÅNDEN, BEVISER INGENTING. Så er
       cycle count en formalitet. */
    const db = som(BEGGE, "admin");
    const noegle = beholdningsNoegle("c1", "v1", null);
    await assertFails(set(ref(db, t(BEGGE, `beholdning/${noegle}`)), {
      carrierId: "c1", vareId: "v1", antal: 5000,
    }));
    await assertFails(
      update(ref(db, t(BEGGE, `beholdning/${noegle}`)), { antal: 99000 }));
  });

  it("lader dem læse begge — listen er ikke hemmelig", async () => {
    const db = som(BEGGE);
    await assertSucceeds(get(ref(db, t(BEGGE, "bevaegelser"))));
    await assertSucceeds(get(ref(db, t(BEGGE, "beholdning"))));
  });

  it("⚠ NÆGTER LÆSNING UDEN MODULET", async () => {
    const db = som(KUN_TB);
    await assertFails(get(ref(db, t(KUN_TB, "bevaegelser"))));
    await assertFails(get(ref(db, t(KUN_TB, "beholdning"))));
  });
});

describe("modellen og reglerne siger det samme", () => {
  const regler = readFileSync("firebase.rules.json", "utf8");

  /**
   * ⚠ SLÅ OP I ÉN NODE, IKKE I HELE FILEN.
   *
   * Prøverne herunder søgte med `regler.indexOf('"beholdning": {')` og med
   * `find(l => l.includes('"art"'))` — på HELE regelfilen. Det virkede
   * indtil Procure fik sit eget varelager (beslutning 85): `forbrugsvarer`
   * har også et `beholdning`-felt og en `art`-regel med `modtaget`, og de
   * står TIDLIGERE i filen. Prøverne målte derfor den forkerte node og
   * sagde at warehouse-modellen var brudt.
   *
   * ⚠ ET ANKER DER FINDES TO STEDER, ER IKKE ET ANKER. Samme fælde som
   * beslutning 82 og 83 fandt i patch-scripts — her ramte den en prøve.
   * `blok()` afgrænser til nodens egen krop.
   */
  const blok = (navn) => {
    const start = regler.indexOf(`\n        "${navn}": {`);
    if (start < 0) throw new Error(`noden ${navn} findes ikke i regelfilen`);
    const slut = regler.indexOf('\n        "', start + 1);
    return regler.slice(start, slut < 0 ? regler.length : slut);
  };

  it("kender de otte arter og ikke flere", async () => {
    const linje = blok("bevaegelser").split(/\r?\n/).find((l) =>
      l.includes('"art"') && l.includes("modtag"));
    assert.ok(linje, "fandt ikke artreglen");
    for (const a of ["modtag", "putaway", "flyt", "pluk", "afsend", "retur",
                     "optael", "justering"]) {
      assert.ok(linje.includes(a), `artreglen mangler ${a}`);
    }
  });

  it("afviser en negativ beholdning", () => {
    /* ⚠ EN HYLDE KAN IKKE RUMME MINUS TOLV PALLER. En beholdning der kan gå i
       minus, skjuler den bevægelse der manglede. */
    const krop = blok("beholdning");
    const antal = krop.split(/\r?\n/).find((l) => l.includes('"antal"'));
    assert.ok(antal.includes(">= 0"), "beholdningen kan gå i minus");
  });

  it("⚠ BEHOLDNINGEN HÆNGER PÅ EN BEHOLDER, IKKE PÅ EN HYLDE", () => {
    /* Etape 12. Bar posten OGSÅ en pladsId, ville de to drive fra hinanden
       første gang nogen flyttede beholderen — og hylden ville vise varer der
       fysisk stod et andet sted. */
    const krop = blok("beholdning");
    assert.ok(krop.includes("hasChildren(['carrierId', 'vareId', 'antal'])"),
      "beholdningen kræver ikke en beholder");
    assert.ok(!krop.includes('"pladsId"'),
      "beholdningsposten bærer stadig en hylde");
    assert.ok(krop.includes("child('carriers').child(newData.val()).exists()"),
      "beholderen prøves ikke mod carriers-noden");
  });

  it("⚠ EN PLACERING HAR HVERKEN VARE ELLER ANTAL", () => {
    /* To slags bevægelser deler noden: en godsbevægelse har vare, kunde og
       antal; en placering flytter selve beholderen. Krydsreglen holder dem
       adskilt, så en placering ikke kan bære et antal ingen kan forklare. */
    const krop = blok("bevaegelser");
    assert.ok(krop.includes("newData.child('art').val() === 'putaway'"),
      "reglerne skelner ikke de to slags bevægelser");
    assert.ok(krop.includes("!newData.hasChild('vareId')"),
      "en placering kan bære en vare");
    assert.ok(krop.includes("!newData.hasChild('tilPladsId')"),
      "en godsbevægelse kan bære en hylde");
  });
});
