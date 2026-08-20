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
  slots, grupperSlots, maanedNoegle, ugeNoegle,
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
