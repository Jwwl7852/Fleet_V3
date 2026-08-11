/* test/moduler.test.mjs
 * Modulafkrydsningen — og hvad den IKKE er.
 *
 * ⚠ EN KOMMERCIEL KONTROL, IKKE EN SIKKERHEDSKONTROL.
 *
 * Det er værd at fastholde mekanisk, fordi de to bliver blandet sammen: man
 * skjuler et menupunkt og tror man har lukket noget. En kunde uden Facility
 * der taster /facility, ser SIN EGEN tomme facility-node — en salgsflade,
 * ikke et databrud. At kunder ikke kan nå HINANDENS data er en anden
 * mekanisme, prøvet i rules.tenant.test.mjs og rules.udbyder.test.mjs.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MODUL, ALLE_MODULER, VALGFRIE_MODULER, OBLIGATORISKE_MODULER,
  harModul, modulsaet, ukendteModuler,
} from "../src/fleet/moduler.js";
import { NAV } from "../src/fleet/nav.js";

describe("modulkataloget svarer til menuen", () => {
  it("hvert modul peger på et navKey der findes", () => {
    /* Ellers filtrerer AppShell på et navn ingen menupunkt har, og modulet
       kan hverken skjules eller vises. */
    const navKeys = new Set(NAV.map((m) => m.key));
    for (const m of ALLE_MODULER) {
      assert.ok(navKeys.has(MODUL[m].navKey), `${m} peger på "${MODUL[m].navKey}"`);
    }
  });

  it("hvert menupunkt har et modul", () => {
    /* Et menupunkt uden modul kan ikke sælges — og kan heller ikke skjules
       for den kunde der ikke har købt det. */
    const modulNav = new Set(ALLE_MODULER.map((m) => MODUL[m].navKey));
    for (const m of NAV) {
      assert.ok(modulNav.has(m.key), `menupunktet "${m.key}" har intet modul`);
    }
  });
});

describe("de obligatoriske moduler kan ikke fravælges", () => {
  it("dashboard, support og opsætning er altid med", () => {
    /* Et system uden forside er ikke et system, og en kunde der har fravalgt
       Opsætning kan ikke se sine egne brugere. */
    for (const m of ["dashboard", "support", "opsaetning"]) {
      assert.equal(MODUL[m].altid, true, m);
      assert.ok(OBLIGATORISKE_MODULER.includes(m));
      assert.ok(!VALGFRIE_MODULER.includes(m));
    }
  });

  it("harModul siger ja til dem selv når modullisten siger nej", () => {
    assert.equal(harModul({ dashboard: false }, "dashboard"), true);
    assert.equal(harModul({}, "opsaetning"), true);
  });

  it("modulsaet tager dem altid med", () => {
    const s = modulsaet(["flaade"]);
    for (const m of OBLIGATORISKE_MODULER) assert.equal(s[m], true, m);
    assert.equal(s.flaade, true);
    assert.equal(s.facility, undefined);
  });
});

describe("harModul fejler ÅBENT — modsat permissions", () => {
  it("en manglende modulliste giver alt", () => {
    /* ⚠ MED VILJE, og forskellen på de to er hvad et hul BETYDER.
       En manglende permission betyder "du må ikke" — fejler den åbent,
       giver man adgang til noget nogen skulle have stoppet.
       En manglende modulliste betyder "vi ved ikke hvad kunden har købt",
       typisk fordi noden ikke er skrevet endnu. Fejler den lukket, står en
       betalende kunde med en tom sidebar og tror systemet er væk. */
    assert.equal(harModul(null, "facility"), true);
    assert.equal(harModul(undefined, "flaade"), true);
  });

  it("men en liste der findes, gælder", () => {
    const kun = { dashboard: true, flaade: true };
    assert.equal(harModul(kun, "flaade"), true);
    assert.equal(harModul(kun, "facility"), false);
    assert.equal(harModul(kun, "indkoeb"), false);
  });

  it("et ukendt modulnavn er ikke købt", () => {
    assert.equal(harModul({ flaade: true }, "rumfart"), false);
  });
});

describe("ukendte moduler afvises ved oprettelse", () => {
  it("navngiver dem der ikke findes", () => {
    assert.deepEqual(ukendteModuler(["flaade", "rumfart", "facility"]), ["rumfart"]);
    assert.deepEqual(ukendteModuler([]), []);
  });

  it("modulsaet tager kun dem der findes med", () => {
    /* Ellers ville en tastefejl i --moduler lande i basen som et modul
       ingen skærm kender, og det ville se ud som om kunden havde købt det. */
    const s = modulsaet(["flaade", "rumfart"]);
    assert.equal(s.rumfart, undefined);
    assert.equal(s.flaade, true);
  });
});

describe("moduler.js kan deles", () => {
  it("har ingen imports", () => {
    /* Som permissions.js og steder.js: baade klienten, provisioneren og en
       fremtidig udbyderfunktion skal bruge samme katalog, og en delt fil med
       imports kan ikke kopieres ind i functions/. */
    const kilde = readFileSync(new URL("../src/fleet/moduler.js", import.meta.url), "utf8");
    assert.doesNotMatch(kilde, /^\s*import\s/m, "moduler.js har et import");
  });
});
