/* test/transportlabel.test.mjs
 * Mærkatet der følger godset. WAREHOUSE.md etape 15.
 *
 * ⚠ FILEN FINDES FORDI EN HALV LABEL ER VÆRRE END INGEN. Et slutmål der ikke
 * kendes, må ikke blive til en tom streng eller til afsenderadressen: godset
 * kører efter det der står på mærkatet, og fejlen opdages på rampen i Hamburg.
 * Derfor svarer `byggLabel()` med `mangler` og `kanTrykkes`, som `satsOpslag()`
 * svarer med `mangler`.
 *
 * ⚠ OG STREGKODEN ER DEN ANDEN HALVDEL. Planchens `BK-2026-0513-C-000245`
 * indeholder to opfindelser — et femte nummerformat og et løbenummer ved siden
 * af beholderens id. Prøverne her fastholder at koden bygges af de to id'er der
 * findes i forvejen, og at den kan opløses igen uden at bookingnummerets egne
 * bindestreger river den midt over.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LABELTYPE, ALLE_LABELTYPER, labeltypeFor, byggLabel, RUTELOGIK,
  godsLinjer, MAKS_GODSLINJER,
  stregkode, laesStregkode, sorteretKaede,
} from "../src/fleet/transportlabel.js";

/* Formen er nodens: etaper som i demo-etaper.js, carrier som i demo-lager.js. */
const ETAPE_1 = { id: "et-008", bookingId: "bk-2026-00317", nr: 1, fraSted: "København", tilSted: "Hamburg" };
const ETAPE_2 = { id: "et-007", bookingId: "bk-2026-00317", nr: 2, fraSted: "Hamburg", tilSted: "Aalborg" };

const BOOKING = { id: "bk-2026-00317", nummer: "BKG-2026-00317" };
const KUNDE = { id: "nordiskFragt", navn: "Nordisk Fragt A/S" };
const PLADS = { id: "p-a-01-02", navn: "Zone A · A-01-02" };

const paaHylden = { id: "CRR-100245", etapeId: "et-007", pladsId: "p-a-01-02", status: "paaLager" };
const iTransit = { id: "CRR-100248", etapeId: "et-007", status: "iTransit" };

describe("de tre typer", () => {
  it("ét led er direkte — godset rører aldrig lageret", () => {
    const r = labeltypeFor({ carrier: { id: "CRR-1", etapeId: "et-008" }, etaper: [ETAPE_1] });
    assert.equal(r.type, "direkte");
    assert.equal(r.mangler, null);
  });

  it("flere led uden hylde er via transit", () => {
    const r = labeltypeFor({ carrier: iTransit, etaper: [ETAPE_1, ETAPE_2] });
    assert.equal(r.type, "viaTransit");
  });

  it("flere led MED hylde er storage — forskellen er pladsId, ikke en status", () => {
    const r = labeltypeFor({ carrier: paaHylden, etaper: [ETAPE_1, ETAPE_2] });
    assert.equal(r.type, "storage");
  });

  it("en beholder der HAR stået på hylden og er kørt videre, kan oplyses med placeret", () => {
    /* Historikken (en putaway i bevaegelser) er det eneste sted det står, når
       pladsId er væk igen. */
    const r = labeltypeFor({ carrier: iTransit, etaper: [ETAPE_1, ETAPE_2], placeret: true });
    assert.equal(r.type, "storage");
  });

  it("kæden afgør typen — den står ikke som et felt på carrieren", () => {
    /* Samme beholder, samme plads: én etape gør den direkte, to gør den til
       storage. Var typen skrevet på beholderen, ville den drive fra kæden
       første gang bookingen fik en etape mere. */
    const carrier = { id: "CRR-100245", etapeId: "et-008", pladsId: "p-a-01-02" };
    assert.equal(labeltypeFor({ carrier, etaper: [ETAPE_1] }).type, "direkte");
    assert.equal(labeltypeFor({ carrier, etaper: [ETAPE_1, ETAPE_2] }).type, "storage");
  });

  it("uden etapen gættes der ikke", () => {
    assert.equal(labeltypeFor({ carrier: iTransit, etaper: [] }).type, null);
    assert.equal(labeltypeFor({ carrier: iTransit, etaper: [] }).mangler, "etape");
    assert.equal(labeltypeFor({ carrier: { id: "CRR-9" }, etaper: [ETAPE_1] }).mangler, "etapeId");
    assert.equal(labeltypeFor({}).mangler, "carrier");
  });

  it("en carrier der peger på en etape uden for kæden, er ikke på den transport", () => {
    const fremmed = { id: "CRR-9", etapeId: "et-001" };
    assert.equal(labeltypeFor({ carrier: fremmed, etaper: [ETAPE_1, ETAPE_2] }).type, null);
  });

  it("kæden sorteres på nr, ikke på rækkefølgen den kom i", () => {
    assert.deepEqual(sorteretKaede([ETAPE_2, ETAPE_1]).map((e) => e.id), ["et-008", "et-007"]);
  });

  it("alle tre typer har label og beskrivelse", () => {
    assert.deepEqual(ALLE_LABELTYPER, ["direkte", "viaTransit", "storage"]);
    for (const n of ALLE_LABELTYPER) {
      assert.ok(LABELTYPE[n].label.length > 0, n);
      assert.ok(LABELTYPE[n].beskrivelse.length > 0, n);
    }
  });
});

describe("stregkoden", () => {
  it("bygges af de to id'er der findes i forvejen", () => {
    assert.equal(stregkode("BKG-2026-00317", "CRR-100245"), "BKG-2026-00317-CRR-100245");
  });

  it("opfinder ingenting når en halvdel mangler", () => {
    assert.equal(stregkode(null, "CRR-100245"), null);
    assert.equal(stregkode("BKG-2026-00317", null), null);
  });

  it("kan opløses igen — og bookingnummerets egne bindestreger river den ikke over", () => {
    /* ⚠ REGRESSION. Et split på den SIDSTE bindestreg ville give
       bookingNummer "BKG-2026-00317-CRR" og carrierId "100245". */
    const kode = stregkode("BKG-2026-00317", "CRR-100245");
    assert.deepEqual(laesStregkode(kode), {
      bookingNummer: "BKG-2026-00317",
      carrierId: "CRR-100245",
    });
  });

  it("svarer null på noget der ikke er en kode", () => {
    assert.equal(laesStregkode("BKG-2026-00317"), null);
    assert.equal(laesStregkode(""), null);
    assert.equal(laesStregkode(null), null);
  });
});

describe("labelen", () => {
  it("en storage-label bærer alle planchens felter", () => {
    const l = byggLabel({
      carrier: paaHylden, etaper: [ETAPE_1, ETAPE_2],
      booking: BOOKING, kunde: KUNDE, plads: PLADS,
    });
    assert.equal(l.type, "storage");
    assert.equal(l.kanTrykkes, true);
    assert.deepEqual(l.mangler, []);
    /* De felter der SPÆRRER trykket. Resten af planchens felter — ref.nr.,
       kolli, vægt, mål, sporing, godsbeskrivelse — er med i etape 16 og
       spærrer IKKE: en beholder uden vægt er stadig et mærkat man kan sætte
       på pallen, hvor et manglende slutmål ikke er. */
    assert.equal(l.felter.bookingNummer, "BKG-2026-00317");
    assert.equal(l.felter.carrierId, "CRR-100245");
    assert.equal(l.felter.kunde, "Nordisk Fragt A/S");
    assert.equal(l.felter.fraSted, "København");
    assert.equal(l.felter.transitSted, "Hamburg");
    assert.equal(l.felter.slutmaal, "Aalborg");
    assert.equal(l.felter.lokation, "Zone A · A-01-02");
    assert.equal(l.felter.stregkode, "BKG-2026-00317-CRR-100245");
    assert.equal(l.rutelogik, RUTELOGIK.storage);
  });

  it("transitten er første leds ende — ikke et felt for sig", () => {
    const l = byggLabel({
      carrier: iTransit, etaper: [ETAPE_1, ETAPE_2],
      booking: BOOKING, kunde: KUNDE,
    });
    assert.equal(l.felter.transitSted, "Hamburg");
    assert.equal(l.felter.slutmaal, "Aalborg");
  });

  it("en direkte label har hverken transit eller lokation", () => {
    const l = byggLabel({
      carrier: { id: "CRR-1", etapeId: "et-008" }, etaper: [ETAPE_1],
      booking: BOOKING, kunde: KUNDE,
    });
    assert.equal(l.type, "direkte");
    assert.equal(l.felter.transit, null);
    assert.equal(l.felter.lokation, null);
    assert.equal(l.kanTrykkes, true);
  });

  it("et manglende slutmål spærrer trykket — det bliver ikke til en tom streng", () => {
    const uden = { ...ETAPE_2, tilSted: "" };
    const l = byggLabel({
      carrier: iTransit, etaper: [ETAPE_1, uden], booking: BOOKING, kunde: KUNDE,
    });
    assert.equal(l.kanTrykkes, false);
    assert.ok(l.mangler.includes("slutmaal"));
    assert.equal(l.felter.slutmaal, null);
  });

  it("en storage-label uden hylde kan ikke trykkes", () => {
    /* Beholderen står på lageret; står der ingen adresse på mærkatet, kan den
       ikke findes igen. */
    const l = byggLabel({
      carrier: paaHylden, etaper: [ETAPE_1, ETAPE_2], booking: BOOKING, kunde: KUNDE,
    });
    assert.equal(l.kanTrykkes, false);
    assert.ok(l.mangler.includes("lokation"));
  });

  it("bookingens NUMMER, ikke dens nøgle", () => {
    /* `bk-2026-00317` er en databasenøgle. Scannes den, kan den ikke slås op
       på et fragtbrev eller i en mail. */
    const l = byggLabel({
      carrier: paaHylden, etaper: [ETAPE_1, ETAPE_2],
      booking: { id: "bk-2026-00317" }, kunde: KUNDE, plads: PLADS,
    });
    assert.equal(l.kanTrykkes, false);
    assert.ok(l.mangler.includes("bookingNummer"));
    assert.equal(l.felter.stregkode, null);
  });

  it("uden kæden er der ingen type — og labelen spærres", () => {
    const l = byggLabel({ carrier: paaHylden, etaper: [], booking: BOOKING, kunde: KUNDE });
    assert.equal(l.type, null);
    assert.equal(l.kanTrykkes, false);
    assert.ok(l.mangler.includes("etape"));
  });
});

describe("hvad der er plads til på arket", () => {
  /* ⚠ TALLENE ER MÅLT, IKKE VALGT. På det færdige mærkat i browseren:
     4 linjer = 182,8 mm, og hver linje derefter koster 4,6 mm.
     7 linjer = 196,5 mm og passer på 200; 8 = 201,1 mm og løber over. */
  it("syv linjer passer, otte gør ikke", () => {
    const linje = "Kølegods i isolerede kasser.";
    const syv = Array(7).fill(linje).join("\n");
    const otte = Array(8).fill(linje).join("\n");
    assert.equal(godsLinjer(syv), 7);
    assert.equal(godsLinjer(otte), 8);
    assert.ok(MAKS_GODSLINJER === 7);
  });

  it("ombrydning tæller med — en lang linje er flere", () => {
    /* Beskrivelsen ombrydes ved 61 tegn med små bogstaver; 55 er sat som
       grænse, fordi brede tegn ombryder tidligere. */
    assert.equal(godsLinjer("x".repeat(54)), 1);
    assert.equal(godsLinjer("x".repeat(56)), 2);
    assert.equal(godsLinjer("x".repeat(111)), 3);
    assert.equal(godsLinjer(""), 0);
    assert.equal(godsLinjer(null), 0);
  });

  it("⚠ EN FOR LANG BESKRIVELSE SPÆRRER TRYKKET — den klippes ikke", () => {
    /* En beskrivelse der forkortes i tavshed, er værre end en der spærrer:
       "Må ikke vendes" kan stå i den linje der forsvandt. */
    const carrier = {
      ...paaHylden,
      godsbeskrivelse: Array(9).fill("Kølegods i isolerede kasser.").join("\n"),
    };
    const l = byggLabel({
      carrier, etaper: [ETAPE_1, ETAPE_2],
      booking: BOOKING, kunde: KUNDE, plads: PLADS,
    });
    assert.equal(l.kanTrykkes, false);
    assert.ok(l.mangler.includes("godsbeskrivelse"));
    /* Teksten er der stadig — hele vejen. Det er trykket der er lukket. */
    assert.equal(l.felter.godsbeskrivelse, carrier.godsbeskrivelse);
    assert.equal(l.felter.godsLinjer, 9);
  });

  it("en beskrivelse der passer, spærrer ikke", () => {
    const carrier = {
      ...paaHylden,
      godsbeskrivelse: Array(7).fill("Kølegods i isolerede kasser.").join("\n"),
    };
    const l = byggLabel({
      carrier, etaper: [ETAPE_1, ETAPE_2],
      booking: BOOKING, kunde: KUNDE, plads: PLADS,
    });
    assert.equal(l.kanTrykkes, true);
  });
});
