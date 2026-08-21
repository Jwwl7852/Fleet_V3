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
import { readFileSync } from "node:fs";

import {
  slots, grupperSlots, maanedNoegle, ugeNoegle, slotDele, UGEDAG_KORT,
  greb, skridt, HAANDTAG_MIN,
  ENHED, traekTil, maaTraekkes, slotUnder,
  niveauErNyttigt, nyttigeNiveauer,
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


describe("rullebjaelken", () => {
  /* ⚠ EN BJAELKE DER PEGER ÉT STED OG RULLER ET ANDET, opdages ikke ved at
     kigge paa den. Derfor ligger regnestykket her og ikke i komponenten. */

  it("haandtaget fylder samme del af banen som det synlige af det hele", () => {
    const g = greb(0, 1773, 4202);
    assert.equal(Math.round(g.del * 1000) / 1000, 0.422);
    assert.equal(g.andel, 0);
    assert.ok(g.kanRulle);
  });

  it("andelen foelger rullepositionen fra kant til kant", () => {
    const skjult = 4202 - 1773;
    assert.equal(greb(0, 1773, 4202).andel, 0);
    assert.equal(greb(skjult, 1773, 4202).andel, 1);
    assert.equal(Math.round(greb(skjult / 2, 1773, 4202).andel * 100), 50);
  });

  it("⚠ PASSER ALT PAA SKAERMEN, ER DER INTET AT TRAEKKE I", () => {
    /* Et haandtag der fylder hele banen er ikke et haandtag — og en kontrol
       man kan gribe fat i uden at der sker noget, er vaerre end ingen. */
    const g = greb(0, 1773, 1773);
    assert.equal(g.kanRulle, false);
    assert.equal(g.vis, false);
    assert.equal(g.del, 1);
    assert.equal(g.andel, 0);
  });

  it("taaler nul og vaerdier uden for kanten", () => {
    assert.equal(greb(0, 0, 0).vis, false);
    assert.equal(greb(-500, 1773, 4202).andel, 0);
    assert.equal(greb(99999, 1773, 4202).andel, 1);
  });

  it("et skridt er fire femtedele af en skaerm, ikke en hel", () => {
    /* En stribe man kender igen fra forrige skaerm er det eneste der binder
       de to sammen. */
    const s = skridt(0, 1000, 4000, 1);
    assert.equal(s.slags, "rul");
    assert.equal(s.til, 800);
  });

  it("skridtet standser ved kanten og gaar ikke udenfor", () => {
    assert.equal(skridt(0, 1000, 4000, -1).til, 0);
    assert.equal(skridt(2900, 1000, 4000, 1).til, 3000);
  });

  it("⚠ VED KANTEN FLYTTER KLIKKET PERIODEN, NAAR KALDEREN KAN DET", () => {
    assert.deepEqual(skridt(3000, 1000, 4000, 1, true), { slags: "skub", til: 1 });
    assert.deepEqual(skridt(0, 1000, 4000, -1, true), { slags: "skub", til: -1 });
    /* Midt i: stadig en rulning. Ellers sprang perioden mens der var mere at se. */
    assert.equal(skridt(1500, 1000, 4000, 1, true).slags, "rul");
  });

  it("⚠ ER DER SLET INTET AT RULLE I, ER HVERT KLIK ET SKUB", () => {
    /* Unitbookings vindue er otteogtyve dage og passer paa en bred skaerm.
       En bjaelke der kun kunne rulle, ville vaere doed netop dér. */
    assert.equal(skridt(0, 1773, 1773, 1, true).slags, "skub");
    assert.equal(skridt(0, 1773, 1773, -1, true).slags, "skub");
  });

  it("kan kalderen ikke flytte perioden, staar man stille ved kanten", () => {
    const s = skridt(0, 1773, 1773, 1, false);
    assert.equal(s.slags, "rul");
    assert.equal(s.til, 0);
  });

  it("haandtaget har et gulv man kan ramme med en mus", () => {
    assert.ok(HAANDTAG_MIN >= 24);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TRÆK — beslutning 49
   ══════════════════════════════════════════════════════════════════════════ */

describe("træk i gitteret", () => {
  const T = 3600000;

  it("varigheden følger med — en blok strækkes ikke af at blive flyttet", () => {
    /* Man flytter et vaerkstedsbesoeg; man forlaenger det ikke ved at traekke
       i det. Skal det vare laengere, er det et andet ESTIMAT. */
    const dag0 = new Date(2026, 7, 24).getTime();
    const liste = slots(dag0, dag0 + 5 * 86400000);
    const blok = { fra: dag0 + 8 * T, til: dag0 + 12 * T };
    const ny = traekTil(blok, liste, 0, 2);
    assert.equal(ny.til - ny.fra, blok.til - blok.fra);
  });

  it("⚠ ET DØGN ER IKKE ALTID 24 TIMER — og et 07-besøg må ikke blive til 08", () => {
    /* Sommertiden begynder søndag den 29. marts 2026. Trak man en blok tre
       dage frem ved at lægge 3 × 86400000 til, ville et værkstedsbesøg der
       begynder kl. 07, begynde kl. 08 efter flytningen — en time ingen har
       besluttet, på en bil der skal være der når værkstedet åbner.

       Prøven er skrevet ved at regne begge veje og se dem være uenige. */
    const start = new Date(2026, 2, 27).getTime();
    const liste = slots(start, new Date(2026, 3, 3).getTime());
    const blok = {
      fra: new Date(2026, 2, 27, 7, 0).getTime(),
      til: new Date(2026, 2, 27, 9, 0).getTime(),
    };

    const ny = traekTil(blok, liste, 0, 3);
    assert.equal(new Date(ny.fra).getHours(), 7);
    assert.equal(new Date(ny.fra).getDate(), 30);

    /* Og det er ikke det samme som en råt tillagt varighed. */
    assert.notEqual(ny.fra, blok.fra + 3 * 86400000);
    assert.equal(new Date(blok.fra + 3 * 86400000).getHours(), 8);
  });

  it("tilbage over skiftet holder også", () => {
    const start = new Date(2026, 2, 27).getTime();
    const liste = slots(start, new Date(2026, 3, 3).getTime());
    const blok = {
      fra: new Date(2026, 2, 30, 7, 0).getTime(),
      til: new Date(2026, 2, 30, 9, 0).getTime(),
    };
    const ny = traekTil(blok, liste, 3, 0);
    assert.equal(new Date(ny.fra).getHours(), 7);
    assert.equal(new Date(ny.fra).getDate(), 27);
  });

  it("en timekolonne flytter i timer", () => {
    const d0 = new Date(2026, 7, 24, 6, 0).getTime();
    const liste = slots(d0, d0 + 12 * T, ENHED.time);
    const blok = { fra: d0 + 30 * 60000, til: d0 + 90 * 60000 };
    const ny = traekTil(blok, liste, 0, 4);
    assert.equal(ny.fra, d0 + 4 * T + 30 * 60000);
  });

  it("uden for kolonnerne flyttes der ingenting", () => {
    const d0 = new Date(2026, 7, 24).getTime();
    const liste = slots(d0, d0 + 3 * 86400000);
    assert.equal(traekTil({ fra: d0, til: d0 + T }, liste, 0, 9), null);
    assert.equal(traekTil({ fra: d0, til: d0 + T }, liste, -1, 1), null);
    assert.equal(traekTil(null, liste, 0, 1), null);
  });

  it("⚠ EN BLOK DER RÆKKER UD OVER VINDUET, KAN IKKE TRÆKKES", () => {
    /* Samme grund som pilene findes for: kan man ikke SE hvor blokken
       begynder, kan man ikke sigte efter hvor den skal hen. Forskellen ville
       være præcis så stor som den del der ligger uden for skærmen. */
    assert.equal(maaTraekkes({ foerVindue: true, efterVindue: false }), false);
    assert.equal(maaTraekkes({ foerVindue: false, efterVindue: true }), false);
    assert.equal(maaTraekkes({ foerVindue: false, efterVindue: false }), true);
    assert.equal(maaTraekkes(null), false);
  });

  it("slotUnder holder sig inden for listen", () => {
    const d0 = new Date(2026, 7, 24).getTime();
    const liste = slots(d0, d0 + 3 * 86400000);
    assert.equal(slotUnder(liste, 0), liste[0]);
    assert.equal(slotUnder(liste, 3), null);
    assert.equal(slotUnder(liste, -1), null);
    assert.equal(slotUnder(liste, 1.5), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   HOVEDRÆKKER DER IKKE HAR NOGET AT VISE
   ══════════════════════════════════════════════════════════════════════════ */

describe("niveauErNyttigt", () => {
  const d = (aar, maaned, dag) => new Date(aar, maaned, dag).getTime();
  const NIVEAUER = [
    { navn: "Måned", noegle: maanedNoegle },
    { navn: "Uge", noegle: ugeNoegle },
  ];

  it("⚠ ÉN UGES VINDUE FÅR HVERKEN MÅNED ELLER UGE", () => {
    /* Begge ville vaere ÉT felt der spaender hele vinduet — to raekker der
       siger det samme som datoen i forvejen goer (slotDele beholder
       maaneden i hver kolonne). Det er praecis det UNITBOOKING.md 6.8
       advarer imod: "en uges visning ville faa en Maaned-raekke med ét felt". */
    const uge = slots(d(2026, 7, 24), d(2026, 7, 31));
    assert.deepEqual(nyttigeNiveauer(uge, NIVEAUER), []);
  });

  it("fire uger hen over et månedsskifte får begge", () => {
    const fire = slots(d(2026, 7, 24), d(2026, 8, 21));
    assert.deepEqual(nyttigeNiveauer(fire, NIVEAUER).map((n) => n.navn),
      ["Måned", "Uge"]);
  });

  it("⚠ FIRE UGER INDEN FOR ÉN MÅNED FÅR KUN UGEN", () => {
    /* Maaneden ville vaere ét felt. Den forsvinder uden tab: datoen i hver
       kolonne baerer maaneden — se noten ved slotDele(). */
    const fire = slots(d(2026, 8, 1), d(2026, 8, 29));
    assert.deepEqual(nyttigeNiveauer(fire, NIVEAUER).map((n) => n.navn), ["Uge"]);
  });

  it("⚠ ET NIVEAU MED ÉN GRUPPE PR. KOLONNE TEGNER DAGSRÆKKEN OM IGEN", () => {
    /* En gruppering hvor hver kolonne bliver sin egen gruppe, siger ikke
       noget nyt — den gentager raekken under sig med andre ord. */
    const fire = slots(d(2026, 7, 24), d(2026, 8, 21));
    const perDag = { navn: "Dag", noegle: (s) => String(s.fra) };
    assert.equal(niveauErNyttigt(fire, perDag), false);
  });

  it("den tåler et tomt vindue og en manglende nøgle", () => {
    assert.equal(niveauErNyttigt([], maanedNoegle), false);
    assert.equal(niveauErNyttigt(slots(d(2026, 7, 24), d(2026, 8, 21)), null), false);
    assert.deepEqual(nyttigeNiveauer([], NIVEAUER), []);
  });

  it("⚠ OG GITTERET BRUGER DEN — ellers ville hver kalder regne det selv", () => {
    /* Uden det ville en interval-vaelger tvinge hver af de fire skaerme til at
       udlede det samme, og den dag en af dem glemte det, ville en uges visning
       faa en tom hovedraekke. */
    const kilde = readFileSync(
      new URL("../src/fleet/Gitterkalender.jsx", import.meta.url), "utf8");
    assert.match(kilde, /nyttigeNiveauer\(slotListe, niveauer\)/);
  });
});
