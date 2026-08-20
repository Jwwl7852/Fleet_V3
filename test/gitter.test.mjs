/* test/gitter.test.mjs
 * Gitterets regnestykke — uden React, så det kan prøves.
 *
 * ⚠ FILEN FANDTES IKKE. gitter.js blev prøvet indirekte gennem
 * driftskalender- og disponeringsprøverne, og de spørger om deres egne
 * spørgsmål. Grupperingen er gitterets eget, og den hører her.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  slots, grupperSlots, maanedNoegle, ugeNoegle, slotDele, UGEDAG_KORT,
} from "../src/fleet/gitter.js";

describe("grupperede kolonneoverskrifter", () => {
  /* ⚠ ET VINDUE PÅ FIRE UGER GIVER OTTEOGTYVE KOLONNER, og datoen i hver
     bliver ulæselig — sådan så Unitbookings kalender ud. Grupperingen flytter
     det man sjældent skifter op i sin egen række. Se planchen i
     UNITBOOKING.md 6.8. */
  const aug25 = new Date(2026, 7, 25).getTime();
  const sep8 = new Date(2026, 8, 8).getTime();
  const liste = slots(aug25, sep8);

  it("slår naboslots med samme nøgle sammen", () => {
    const m = grupperSlots(liste, maanedNoegle);
    assert.equal(m.length, 2);
    assert.equal(m[0].antal + m[1].antal, liste.length);
  });

  it("⚠ KUN NABOER — samme nøgle to steder giver TO spænd", () => {
    /* Ellers ville ét august-spænd strække sig henover september og dække
       kolonner der ikke er august. Nøglen her er "A" i begge ender og "B" i
       midten — netop det tilfælde.

       ⚠ Første udgave af prøven brugte lige/ulige dato og forventede ét spænd
       pr. slot. Den var forkert: 31. august og 1. september er BEGGE ulige og
       er naboer, så de to blev ét spænd — helt som de skulle. Prøven fejlede
       på sin egen præmis, ikke på koden. */
    const noegle = (s) => {
      const i = liste.findIndex((x) => x.fra === s.fra);
      return i === 0 || i === liste.length - 1 ? "A" : "B";
    };
    const g = grupperSlots(liste, noegle);
    assert.deepEqual(g.map((x) => x.noegle), ["A", "B", "A"]);
    assert.deepEqual(g.map((x) => x.antal), [1, liste.length - 2, 1]);
  });

  it("spændene dækker præcis alle kolonner", () => {
    for (const noegle of [maanedNoegle, ugeNoegle]) {
      const sum = grupperSlots(liste, noegle).reduce((s, g) => s + g.antal, 0);
      assert.equal(sum, liste.length);
    }
  });

  it("uger grupperes på ugenummer", () => {
    const u = grupperSlots(liste, ugeNoegle);
    assert.ok(u.length >= 2);
    assert.match(u[0].noegle, /^Uge \d+$/);
  });

  it("tåler en tom liste og en manglende nøgle", () => {
    assert.deepEqual(grupperSlots([], maanedNoegle), []);
    assert.deepEqual(grupperSlots(liste, null), []);
    assert.deepEqual(grupperSlots(liste), []);
  });
});

describe("kolonneoverskriften i to linjer", () => {
  /* ⚠ "ons 19.08" på én linje bliver til "ons 19…" så snart vinduet er langt
     — altså mister man netop datoen. To linjer koster højde ÉN gang i hovedet
     og giver plads i hver eneste kolonne. */
  const dag = (aar, m, d) => ({ fra: new Date(aar, m, d).getTime() });

  it("ugedagen står over datoen, med to bogstaver", () => {
    assert.deepEqual(slotDele(dag(2026, 7, 19)), { over: "On", under: "19.08" });
    assert.deepEqual(slotDele(dag(2026, 7, 22)), { over: "Lø", under: "22.08" });
    assert.deepEqual(slotDele(dag(2026, 7, 23)), { over: "Sø", under: "23.08" });
  });

  it("⚠ TIRSDAG OG TORSDAG SKILLES AF DET ANDET BOGSTAV", () => {
    /* Begge begynder på T. Ét bogstav ville gøre de to dage til den samme. */
    assert.equal(slotDele(dag(2026, 7, 18)).over, "Ti");
    assert.equal(slotDele(dag(2026, 7, 20)).over, "To");
  });

  it("⚠ UGEDAGENE ER SKREVET UD, IKKE SKÅRET AF EN LOKALSTRENG", () => {
    /* toLocaleDateString gav "man.", "tir." — et .slice(0,2) på den er en
       antagelse om et format vi ikke ejer. Listen er vores egen, indekseret
       med getDay(), og søndag er nul. */
    assert.equal(UGEDAG_KORT.length, 7);
    assert.equal(UGEDAG_KORT[0], "Sø");
    assert.equal(new Set(UGEDAG_KORT).size, 7, "alle syv skal være entydige");
    for (const d of UGEDAG_KORT) assert.equal(d.length, 2);
  });

  it("⚠ DATOEN BEHOLDER SIN MÅNED", () => {
    /* Planchen viser kun dagens tal, fordi den har en måned-række over sig.
       Fleets kalender har ikke, og en uge kan gå over et månedsskifte. */
    assert.equal(slotDele(dag(2026, 7, 31)).under, "31.08");
    assert.equal(slotDele(dag(2026, 8, 1)).under, "01.09");
  });

  it("timer har ingen ugedag over sig", () => {
    const t = { fra: new Date(2026, 7, 19, 9, 0).getTime() };
    const d = slotDele(t, "time");
    assert.equal(d.over, null);
    assert.match(d.under, /^\d{2}[.:]\d{2}$/);
  });
});
