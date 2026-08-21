/* test/gitter-uge.test.mjs
 * Ugekolonner — beslutning 65.
 *
 * HVORFOR DE FINDES. Planchen har en Dag/Uge/Måned-vælger ved siden af
 * interval-vælgeren. To kontroller der begge handler om tid, tvinger brugeren
 * til at forstå forskellen på "hvor langt" og "hvor fint" før han kan bruge
 * nogen af dem. Granulariteten er derfor en FØLGE af længden: 1 og 2 uger
 * tegnes med dage, 4 uger med uger.
 *
 * ⚠ OG PRISEN ER RIGTIG. En ugekolonne kan ikke skelne et 3-dages udlån fra et
 * 7-dages. Det står på skærmen, fordi en visning der ser præcis ud uden at
 * være det, er værre end en grov visning der siger det.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ENHED, slots, slotLabel, slotDele, laegUd, erNu, MAX_SLOTS,
} from "../src/fleet/gitter.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Ugekolonner", () => {
  /**
   * ⚠ UGEN BEGYNDER MANDAG. `getDay()` giver 0 for søndag, så søndag skal syv
   * dage tilbage og ikke nul. En uge der begyndte om søndagen, ville lægge
   * fredag og lørdag i hver sin kolonne — og en tur hen over weekenden ville
   * se ud som to.
   */
  test("⚠ HVER KOLONNE BEGYNDER MANDAG — også når vinduet gør det midt på ugen", () => {
    /* 20. august 2026 er en torsdag. */
    for (const startdag of [17, 18, 19, 20, 21, 22, 23]) {
      const fra = new Date(2026, 7, startdag, 9, 30).getTime();
      const u = slots(fra, fra + 28 * 86400000, ENHED.uge);
      for (const s of u) {
        assert.equal(new Date(s.fra).getDay(), 1,
          `kolonnen begynder ikke mandag (start ${startdag}/8)`);
        assert.equal(new Date(s.fra).getHours(), 0, "kolonnen begynder ikke ved midnat");
      }
    }
  });

  test("fire uger giver fem kolonner, ikke otteogtyve", () => {
    const fra = new Date(2026, 7, 20).getTime();
    const dage = slots(fra, fra + 28 * 86400000, ENHED.dag);
    const uger = slots(fra, fra + 28 * 86400000, ENHED.uge);
    assert.equal(dage.length, 28);
    /* Fem, fordi vinduet begynder midt i en uge: den første kolonne dækker
       også de dage der ligger før vinduet. Det er den rigtige afvejning —
       en halv kolonne ville være en uge der ikke er en uge. */
    assert.equal(uger.length, 5);
  });

  /**
   * ⚠ ET DØGN ER IKKE ALTID 24 TIMER, og en uge er ikke altid 7 × 24.
   * Ved sommertidsskiftet er den 167 eller 169 timer. Bygges kolonnerne med
   * addition af millisekunder, glider de en time — og en blok lander i den
   * forkerte uge.
   */
  test("⚠ EN UGE OVER SOMMERTIDSSKIFTET ER STADIG EN UGE", () => {
    /* Sommertiden slutter sidste søndag i oktober. */
    const fra = new Date(2026, 9, 19).getTime();
    const u = slots(fra, fra + 21 * 86400000, ENHED.uge);
    for (const s of u) {
      assert.equal(new Date(s.fra).getDay(), 1);
      assert.equal(new Date(s.fra).getHours(), 0,
        "kolonnen er gledet en time over sommertidsskiftet");
    }
  });

  test("labels er ugenumre, og delene er nummer over mandagens dato", () => {
    const fra = new Date(2026, 7, 20).getTime();
    const [foerste] = slots(fra, fra + 14 * 86400000, ENHED.uge);
    assert.match(slotLabel(foerste, ENHED.uge), /^Uge \d+$/);
    const dele = slotDele(foerste, ENHED.uge);
    assert.match(dele.over, /^Uge \d+$/);
    assert.match(dele.under, /^\d{2}\.\d{2}$/);
  });

  test("erNu virker uændret på en ugekolonne", () => {
    const nu = new Date(2026, 7, 20, 12).getTime();
    const u = slots(nu - 3 * 86400000, nu + 10 * 86400000, ENHED.uge);
    assert.equal(u.filter((s) => erNu(s, nu)).length, 1, "nu ligger i præcis én uge");
  });

  /**
   * ⚠ PRISEN, MÅLT. Et 3-dages og et 7-dages udlån i samme uge lægges ud på
   * NØJAGTIG de samme kolonner. Det er ikke en fejl i udlægningen — det er
   * hvad en ugekolonne er — og derfor står det på skærmen.
   */
  test("⚠ ET 3-DAGES OG ET 7-DAGES UDLÅN SER ENS UD PÅ UGEKOLONNER", () => {
    const mandag = new Date(2026, 7, 17).getTime();
    const uger = slots(mandag, mandag + 14 * 86400000, ENHED.uge);
    const kort = laegUd([{ id: "a", raekkeId: "r", fra: mandag, til: mandag + 3 * 86400000 }], uger);
    const lang = laegUd([{ id: "b", raekkeId: "r", fra: mandag, til: mandag + 7 * 86400000 }], uger);
    assert.equal(kort[0].start, lang[0].start);
    assert.equal(kort[0].slut, lang[0].slut, "de to fylder ikke det samme — så er noten forkert");
  });

  test("loftet på kolonner gælder også uger", () => {
    const fra = new Date(2026, 0, 1).getTime();
    assert.throws(() => slots(fra, fra + (MAX_SLOTS + 10) * 7 * 86400000, ENHED.uge),
      /kolonner/);
  });
});

describe("Kalenderen vælger ikke granulariteten ved siden af intervallet", () => {
  const kal = udenKommentarer(
    readFileSync("src/moduler/unitbooking/Kalender.jsx", "utf8"));

  test("⚠ ENHEDEN ER EN FØLGE AF LÆNGDEN", () => {
    assert.match(kal, /uger: 4, label: "4 uger", enhed: ENHED\.uge/);
    assert.match(kal, /uger: 1, label: "1 uge", enhed: ENHED\.dag/);
    /* Ingen selvstændig vælger: der må ikke være to kontroller om tid. */
    assert.ok(!/Dag.*Uge.*M[åa]ned/.test(kal), "der er kommet en granularitetsvælger");
    assert.ok(kal.includes("enhed={enhed}"), "gitteret får ikke den valgte enhed");
  });

  /* ⚠ OG PRISEN SKAL STÅ PÅ SKÆRMEN. Uden noten ser fire ugers visning ud som
     en præcis kalender. */
  test("⚠ SIGER DET NÅR KOLONNERNE ER UGER", () => {
    assert.ok(kal.includes("enhed === ENHED.uge"),
      "skærmen siger ikke at kolonnerne er uger");
  });

  /**
   * ⚠ FILTERET LIGGER PÅ RÆKKERNE, IKKE PÅ BLOKKENE. "Fremhæv art" gør noget
   * andet: den fremhæver inde i rækken. Et filter der fjernede blokke, ville
   * lade rækken stå tom og se ud som en ledig kasse.
   */
  test("⚠ FILTRE-KNAPPEN FILTRERER RÆKKERNE PÅ TYPE OG UNDERTYPE", () => {
    assert.ok(kal.includes("undertyperFor("),
      "undertyperne kommer ikke fra det samme katalog som Kasser-skærmen");
    assert.match(kal, /k\.type === type/);
    assert.match(kal, /k\.undertype === undertype/);
    /* Og undertypen nulstilles når typen skifter — ellers filtrerer den alt
       væk og ligner en tom kalender. */
    assert.match(kal, /setType\(e\.target\.value\); setUndertype\(""\)/);
  });
});
