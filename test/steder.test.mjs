/* test/steder.test.mjs
 * Stedkataloget, og de to slags poster der står på et sted.
 *
 * Ingen emulator herinde — filen tester KATALOGET og DEMO-DATA.
 *
 * HVORFOR DEN FINDES. Et sted stod to steder: personale.stationeret var
 * fritekst, og køretøjernes hjemsted var lige ved at blive det samme. Så havde
 * en bil i "Ålborg" ikke stået samme sted som en chauffør i "Aalborg", og
 * ingen kunne se det. Testen her er den mekaniske udgave af den aftale.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import { STED, ALLE_STEDER, erSted, sorterSteder, stederI } from "../src/fleet/steder.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";
import { DEMO_PERSONALE } from "../src/fleet/demo-personale.js";
import { nedetidMs, nedetidDage, ikonForArt, ALLE_ARTER } from "../src/fleet/flaade.js";
import { DEMO_BESOEG } from "../src/fleet/demo-vaerksted.js";
import { aabneFejlFor } from "../src/fleet/indberetninger.js";
import { DEMO_INDBERETNINGER } from "../src/fleet/demo-indberetninger.js";

test("Stedkataloget er ét katalog", async (t) => {
  await t.test("hvert køretøjs hjemsted står i kataloget", () => {
    for (const e of DEMO_KOERETOEJER) {
      assert.ok(e.hjemsted, `${e.id} mangler hjemsted`);
      assert.ok(erSted(e.hjemsted),
        `${e.id} står i "${e.hjemsted}", som ikke er i STED. Et opdigtet stednavn ` +
        `opdages først når nogen leder efter det — se noten i steder.js.`);
    }
  });

  await t.test("hver medarbejders stationering står i SAMME katalog", () => {
    /* ⚠ DET ER HELE POINTEN MED FILEN. Falder den her, står folk og biler på
       to forskellige stedlister, og "hvem og hvad er i Vejle" har to svar. */
    for (const p of DEMO_PERSONALE) {
      if (!p.stationeret) continue;
      assert.ok(erSted(p.stationeret),
        `${p.id} er stationeret i "${p.stationeret}", som ikke er i STED.`);
    }
  });

  await t.test("sorterer dansk — Aa sorterer SIDST", () => {
    /* Kolding FØR Aalborg. En almindelig .sort() giver det modsatte, og det
       ser rigtigt ud lige indtil nogen leder efter Vejle nederst i en liste
       hvor den står i midten. Forventningen er skrevet forkert to gange før. */
    assert.deepEqual(
      sorterSteder(["Aalborg", "Vejle", "Kolding", "Odense"]),
      [STED.kolding, STED.odense, STED.vejle, STED.aalborg]
    );
  });

  await t.test("stederI stiller samme spørgsmål til biler og folk", () => {
    const bilSteder = stederI(DEMO_KOERETOEJER);
    const folkSteder = stederI(DEMO_PERSONALE, (p) => p.stationeret);
    for (const s of [...bilSteder, ...folkSteder]) assert.ok(ALLE_STEDER.includes(s));
    /* Ingen dubletter, uanset hvor mange biler der står samme sted. */
    assert.equal(new Set(bilSteder).size, bilSteder.length);
  });
});

test("Nedetid er afledt af værkstedsbesøgene", async (t) => {
  const D = 86400000;
  const nu = 1000 * D;

  await t.test("summerer overlappet med vinduet", () => {
    const b = [{ koeretoejId: "a", status: "udfoert", fra: nu - 2 * D, til: nu - 1 * D }];
    assert.equal(nedetidDage(b, "a", nu - 30 * D, nu), 1);
  });

  await t.test("klipper ved vinduets kant", () => {
    /* Et besøg der rækker ud over perioden, tæller kun sin del af den.
       Uden klipningen ville en tre ugers reparation give tre ugers nedetid
       i en uge der kun har syv dage. */
    const b = [{ koeretoejId: "a", status: "igang", fra: nu - 10 * D, til: nu + 10 * D }];
    assert.equal(nedetidDage(b, "a", nu - 2 * D, nu), 2);
  });

  await t.test("et PLANLAGT besøg er ikke nedetid", () => {
    /* Bilen kører stadig. Talte det med, ville en bil have to dages nedetid
       i næste uge — og en beslutning om at udskifte den ville se bedre
       begrundet ud end den er. */
    const b = [{ koeretoejId: "a", status: "planlagt", fra: nu + 1 * D, til: nu + 3 * D }];
    assert.equal(nedetidMs(b, "a", nu, nu + 30 * D), 0);
  });

  await t.test("et besøg uden tider tæller ikke", () => {
    /* vb-005 får sine tider fra en sag. Uden tider er det ikke et besøg af
       nul længde — det er et besøg vi ikke kender længden på. */
    const b = [{ koeretoejId: "a", status: "igang", fra: null, til: null }];
    assert.equal(nedetidMs(b, "a", nu, nu + 30 * D), 0);
  });

  await t.test("et tomt vindue giver nul, ikke et negativt tal", () => {
    const b = [{ koeretoejId: "a", status: "udfoert", fra: nu - 2 * D, til: nu }];
    assert.equal(nedetidMs(b, "a", nu, nu - 5 * D), 0);
  });

  await t.test("demo-besøgene giver et tal på hver bil uden at kaste", () => {
    for (const e of DEMO_KOERETOEJER) {
      const d = nedetidDage(DEMO_BESOEG, e.id, nu - 365 * D, nu + 365 * D);
      assert.ok(Number.isFinite(d) && d >= 0, `${e.id} gav ${d}`);
    }
  });
});

test("Åbne fejl er afledt af indberetningerne", async (t) => {
  await t.test("en tankning er ikke en fejl", () => {
    /* Talte brændstof med, ville den bil der kører mest, også være den med
       flest "fejl". */
    const i = [{ koeretoejId: "a", art: "braendstof", forloeb: "ny" }];
    assert.equal(aabneFejlFor(i, "a"), 0);
  });

  await t.test("en godsskade er ikke en fejl PÅ BILEN", () => {
    /* HAENDELSE_ART siger det selv med paaKoeretoej: false. Skaden sad på
       godset; bilen fejler ingenting. */
    const i = [{ koeretoejId: "a", art: "godsskade", forloeb: "ny" }];
    assert.equal(aabneFejlFor(i, "a"), 0);
  });

  await t.test("afventerFaktura tæller stadig som åben", () => {
    /* Bilen kører igen, men sagen er ikke lukket. En huskeliste der glemmer
       den, er ikke en huskeliste. */
    const i = [{ koeretoejId: "a", art: "reparation", forloeb: "afventerFaktura" }];
    assert.equal(aabneFejlFor(i, "a"), 1);
  });

  await t.test("afsluttet tæller ikke", () => {
    const i = [{ koeretoejId: "a", art: "reparation", forloeb: "afsluttet" }];
    assert.equal(aabneFejlFor(i, "a"), 0);
  });

  await t.test("demo-sættet giver de forventede tal", () => {
    /* kt-078 har en reparation på værkstedet; kt-104 en køretøjsskade der
       afventer faktura; kt-012 har kun en godsskade og to tankninger. */
    assert.equal(aabneFejlFor(DEMO_INDBERETNINGER, "kt-078"), 1);
    assert.equal(aabneFejlFor(DEMO_INDBERETNINGER, "kt-104"), 1);
    assert.equal(aabneFejlFor(DEMO_INDBERETNINGER, "kt-012"), 0);
  });
});

test("Hver art har et ikon", () => {
  /* Falder den, tegner tabellen et hul i typekolonnen for netop den art —
     og det opdages kun hvis nogen tilfældigt har en scooter i listen. */
  for (const a of ALLE_ARTER) {
    assert.ok(ikonForArt(a), `${a} har intet ikon`);
  }
});
