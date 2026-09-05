/* test/driftskalender.test.mjs
 * Driftskalenderens fem tal, dens vinduer og dens kø.
 *
 * ⚠ HVORFOR TALLENE PRØVES OG IKKE BARE VISES. De ligger ikke i kpi/ — de er
 * afledt hos forbrugeren, fordi "Kommende" afhænger af et vindue brugeren selv
 * sætter. Undtagelsen er den rigtige (se CLAUDE.md), men den koster: et
 * aggregeret tal har en aggregering med sin egen prøve, mens et afledt tal kun
 * har den her fil. Tre af de fem overlapper hinanden med vilje, og det er
 * netop dér to tal der begge lyder som totaler, plejer at opstå.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  VISNING, ALLE_VISNINGER, FREMAD, STANDARD_FREMAD,
  vindueFor, flyt, slutter, driftstal, prioritetsfordeling, sorterKoe,
  raekkerIVindue,
} from "../src/fleet/driftskalender.js";
import { slots, MAX_SLOTS } from "../src/fleet/gitter.js";
import { ALLE_PRIORITETER } from "../src/fleet/prioritet.js";

const MIN = 60000;
const DAG = 86400000;

/* Fast tidspunkt: onsdag 12. august 2026 kl. 10.00. Ingen Date.now() — et
   datasæt der flytter sig, kan ikke sammenlignes med sig selv i morgen. */
const NU = new Date(2026, 7, 12, 10, 0).getTime();

const opg = (id, o = {}) => ({
  id, art: "vaerksted", koeretoejId: "kt-1",
  status: "planlagt", startMs: NU + DAG, estimeretMin: 120, ...o,
});

describe("vinduerne", () => {
  it("begynder ved døgnets start, ikke ved klokkeslættet", () => {
    /* Et gitter der begyndte kl. 10.00, ville have en første kolonne på 14
       timer — og blokkene ville stå forskudt i forhold til datoerne over dem. */
    const v = vindueFor("uge", NU);
    assert.equal(new Date(v.fra).getHours(), 0);
    assert.equal(new Date(v.fra).getMinutes(), 0);
  });

  it("dag er ét døgn i timer, uge er syv dage, måned er fem hele uger", () => {
    assert.equal(VISNING.dag.dage, 1);
    assert.equal(VISNING.dag.enhed, "time");
    assert.equal(VISNING.uge.dage, 7);
    /* ⚠ 35, IKKE 30. Gitteret begynder på vinduets første dag, og en måned der
       starter en torsdag, ville ellers slutte midt i den sidste uge. */
    assert.equal(VISNING.maaned.dage, 35);
  });

  it("⚠ INGEN VISNING SPRÆNGER GITTERETS LOFT", () => {
    /* MAX_SLOTS er 200, og slots() KASTER over det — den afkorter ikke i
       stilhed. En måned i TIMER ville være 840 kolonner, og det er ikke et
       gitter, det er en liste. Prøven her er grunden til at dagsvisningen er
       den eneste i timer. */
    for (const key of ALLE_VISNINGER) {
      const v = vindueFor(key, NU);
      const liste = slots(v.fra, v.til, v.enhed);
      assert.ok(liste.length <= MAX_SLOTS,
        `${key} giver ${liste.length} kolonner — loftet er ${MAX_SLOTS}`);
      assert.ok(liste.length > 0, `${key} gav ingen kolonner`);
    }
    assert.equal(slots(vindueFor("dag", NU).fra, vindueFor("dag", NU).til, "time").length, 24);
    assert.equal(slots(vindueFor("uge", NU).fra, vindueFor("uge", NU).til, "dag").length, 7);
  });

  it("flytter et helt spring ad gangen", () => {
    const v = vindueFor("uge", NU);
    const naeste = vindueFor("uge", flyt("uge", NU, 1));
    /* Præcis kant mod kant: det gamle vindues slutning ER det nye vindues
       start. Et spring på seks dage ville vise mandagen to gange; et på otte
       ville springe en dag over, og ingen af delene ses ved at kigge. */
    assert.equal(naeste.fra, v.til);
    const forrige = vindueFor("uge", flyt("uge", NU, -1));
    assert.equal(forrige.til, v.fra);
  });
});

describe("⚠ EN OPGAVE UDEN ESTIMAT HAR INGEN SLUTNING", () => {
  it("slutter() svarer null — ikke startMs", () => {
    /* Regnede vi videre med startMs, ville hver eneste opgave uden estimat stå
       som FORSINKET i det øjeblik den blev oprettet. Det ville se ud som en
       måling. Gaten er Number.isFinite() FØR regnestykket. */
    assert.equal(slutter({ startMs: NU }), null);
    assert.equal(slutter({ startMs: NU, estimeretMin: null }), null);
    assert.equal(slutter({ startMs: NU, estimeretMin: 0 }), null);
    assert.equal(slutter({ estimeretMin: 60 }), null);
    assert.equal(slutter(null), null);
    assert.equal(slutter({ startMs: NU, estimeretMin: 90 }), NU + 90 * MIN);
  });

  it("den er HVERKEN forsinket ELLER rettidig", () => {
    const t = driftstal({
      opgaver: [
        opg("a", { startMs: NU - 5 * DAG, estimeretMin: null }),
        opg("b", { startMs: NU - 5 * DAG, estimeretMin: 60 }),
      ],
      nu: NU,
    });
    assert.deepEqual(t.forsinkede.poster.map((o) => o.id), ["b"]);
    assert.deepEqual(t.udenVarighed.poster.map((o) => o.id), ["a"]);
    /* Det afgørende: den er IKKE talt som rettidig ved at være udeladt af
       forsinkede. Den har sit eget tal, og skærmen skriver det ud. */
    assert.equal(t.udenVarighed.antal, 1);
  });
});

describe("de fem tal", () => {
  const opgaver = [
    opg("plan-frem", { status: "planlagt", startMs: NU + 3 * DAG }),
    opg("plan-langt-frem", { status: "planlagt", startMs: NU + 60 * DAG }),
    opg("igang", { status: "igang", startMs: NU - 2 * 60 * MIN, estimeretMin: 600 }),
    opg("forsinket", { status: "planlagt", startMs: NU - 4 * DAG, estimeretMin: 120 }),
    opg("afventer-1", { status: "afventer" }),
    opg("afventer-2", { status: "indberettet" }),
    opg("udfoert", { status: "udfoert", startMs: NU - 9 * DAG }),
    opg("annulleret", { status: "annulleret", startMs: NU - 9 * DAG }),
  ];
  const indberetninger = [
    { id: "i1", forloeb: "ny", prioritet: "hoej" },
    { id: "i2", forloeb: "ny" },
    { id: "i3", forloeb: "afsluttet", prioritet: "lav" },
    { id: "i4", forloeb: "vurderet", prioritet: "hoej" },
    { id: "i5", forloeb: "planlagt", prioritet: "normal" },
  ];
  const t = driftstal({ opgaver, indberetninger, nu: NU, fremDage: 14 });

  it("nye er indberetninger med forløb ny — ikke opgaver", () => {
    assert.deepEqual(t.nye.poster.map((i) => i.id), ["i1", "i2"]);
  });

  /* ⚠ TILFØJET 2026-09-05 — "afventer planlægning", produktejerens
     triageflow. EGEN KASSE: en indberetning har et forløb og en art, en
     opgave har en status og et tidspunkt — samme kilde-skel som `nye`. */
  it("⚠ VURDERET ER INDBERETNINGER, IKKE OPGAVER — og ikke slået sammen med afventer", () => {
    assert.deepEqual(t.vurderet.poster.map((i) => i.id), ["i4"]);
    /* i5 er allerede "planlagt" — den skal IKKE stå i vurderet. Det er
       netop pointen: opgaveplanlaeg sætter forløbet atomisk, og en
       indberetning falder automatisk ud af kassen den dag den planlægges. */
    assert.ok(!t.vurderet.poster.some((i) => i.id === "i5"));
    /* Og den blander sig ikke med opgave-bunken lige nedenfor. */
    assert.ok(!t.afventer.poster.some((p) => p.id === "i4"));
  });

  it("⚠ AFVENTER ER EN TILSTAND, IKKE ET MANGLENDE TIDSPUNKT", () => {
    /* Noden KRÆVER startMs (hasChildren i firebase.rules.json), så en opgave
       uden tidspunkt kan slet ikke gemmes. "Ikke planlagt" måtte derfor blive
       en status — og posterne HAR et tidspunkt, som er en pladsholder. */
    assert.deepEqual(t.afventer.poster.map((o) => o.id).sort(),
      ["afventer-1", "afventer-2"]);
    for (const o of t.afventer.poster) {
      assert.ok(Number.isFinite(o.startMs),
        "en afventende opgave har alligevel et tidspunkt — det er en pladsholder");
    }
  });

  it("planlagt er planlagte OG igangværende — ikke udførte eller annullerede", () => {
    assert.deepEqual(t.planlagt.poster.map((o) => o.id).sort(),
      ["forsinket", "igang", "plan-frem", "plan-langt-frem"]);
  });

  it("⚠ KOMMENDE OG FORSINKEDE ER UDSNIT AF PLANLAGT, ikke tal ved siden af", () => {
    /* Skærmen skriver "heraf". To tal der begge lyder som totaler, er
       beslutning 11 og 14 om igen — og her ville 4 planlagte, 1 kommende og 1
       forsinket ellers se ud som 6 opgaver. */
    const planlagte = new Set(t.planlagt.poster.map((o) => o.id));
    for (const o of t.kommende.poster) assert.ok(planlagte.has(o.id), o.id);
    for (const o of t.forsinkede.poster) assert.ok(planlagte.has(o.id), o.id);
  });

  it("kommende følger det valgte vindue", () => {
    assert.deepEqual(t.kommende.poster.map((o) => o.id), ["plan-frem"]);
    /* ⚠ SAMME DATA, ANDET VINDUE, ANDET TAL. Det er hele grunden til at tallet
       ikke kan aggregeres: et gemt tal ville være regnet på ét vindue og stå
       forkert i de tre andre. */
    const bredere = driftstal({ opgaver, indberetninger, nu: NU, fremDage: 90 });
    assert.deepEqual(bredere.kommende.poster.map((o) => o.id).sort(),
      ["plan-frem", "plan-langt-frem"]);
  });

  it("forsinket er dem hvis SLUTNING ligger bag os", () => {
    /* `igang` startede for to timer siden med et estimat på ti timer — den er
       i gang, ikke forsinket. Målte vi på STARTEN, ville hver igangværende
       opgave være forsinket fra første minut. */
    assert.deepEqual(t.forsinkede.poster.map((o) => o.id), ["forsinket"]);
  });

  it("hvert tal bærer den liste det talte", () => {
    /* ⚠ DET ER KONTRAKTEN MED ARBEJDSKØEN. Kortet siger 4 og køen viser
       listen — de kan ikke komme ud af trit, fordi det er samme array. */
    for (const n of ["nye", "vurderet", "afventer", "planlagt", "kommende", "forsinkede", "udenVarighed"]) {
      assert.equal(t[n].antal, t[n].poster.length, n);
    }
  });

  it("tåler tomme lister", () => {
    const tom = driftstal({});
    for (const n of ["nye", "vurderet", "afventer", "planlagt", "kommende"]) {
      assert.equal(tom[n].antal, 0, n);
    }
  });
});

describe("prioritetsfordelingen", () => {
  it("⚠ TÆLLER DE UVURDEREDE FOR SIG — de er ikke lavt prioriterede", () => {
    const f = prioritetsfordeling([
      { prioritet: "hoej" }, { prioritet: "hoej" }, { prioritet: "lav" },
      {}, { prioritet: "mellem" },   // "mellem" er LABELET, ikke værdien
    ]);
    assert.deepEqual(f, { lav: 1, normal: 0, hoej: 2, uvurderet: 2 });
  });

  it("de fire tal summer til totalen", () => {
    /* Ellers ser tre tal der summer til mindre end totalen, ud som en
       regnefejl — og så holder man op med at stole på kassen. */
    const poster = [{ prioritet: "lav" }, {}, { prioritet: "hoej" }, { prioritet: "normal" }];
    const f = prioritetsfordeling(poster);
    assert.equal(f.lav + f.normal + f.hoej + f.uvurderet, poster.length);
  });
});

describe("køen", () => {
  it("⚠ DE UVURDEREDE LIGGER MELLEM HØJ OG MELLEM — ikke nederst", () => {
    /* En post ingen har taget stilling til, ville blive liggende nederst
       netop fordi ingen havde taget stilling til den. */
    const koe = sorterKoe([
      { id: "d", prioritet: "lav", startMs: 1 },
      { id: "a", prioritet: "hoej", startMs: 1 },
      { id: "b", startMs: 1 },
      { id: "c", prioritet: "normal", startMs: 1 },
    ]);
    assert.deepEqual(koe.map((o) => o.id), ["a", "b", "c", "d"]);
  });

  it("sorterer på tid inden for samme prioritet, og på id inden for samme tid", () => {
    /* To poster med samme prioritet og samme tidspunkt skal stå i samme
       rækkefølge ved hver render, ellers hopper listen. */
    const koe = sorterKoe([
      { id: "z", prioritet: "hoej", startMs: 5 },
      { id: "a", prioritet: "hoej", startMs: 5 },
      { id: "m", prioritet: "hoej", startMs: 1 },
    ]);
    assert.deepEqual(koe.map((o) => o.id), ["m", "a", "z"]);
  });

  it("rører ikke listen den fik", () => {
    const ind = [{ id: "b", prioritet: "lav" }, { id: "a", prioritet: "hoej" }];
    sorterKoe(ind);
    assert.deepEqual(ind.map((o) => o.id), ["b", "a"], "sorterKoe muterede sit argument");
  });

  it("bruger indberetningens oprettelsestid når der ikke er en start", () => {
    /* En indberetning har ingen startMs — den har oprettetMs. Faldt vi tilbage
       på 0, ville hver indberetning stå øverst i sin prioritetsgruppe. */
    const koe = sorterKoe([
      { id: "sen", prioritet: "hoej", oprettetMs: 900 },
      { id: "tidlig", prioritet: "hoej", oprettetMs: 100 },
    ]);
    assert.deepEqual(koe.map((o) => o.id), ["tidlig", "sen"]);
  });
});

describe("gitterets rækker", () => {
  const enheder = [{ id: "kt-1" }, { id: "kt-2" }, { id: "kt-3" }];

  it("⚠ KUN RESSOURCER MED NOGET I VINDUET", () => {
    /* Et gitter med tredive rækker hvoraf femogtyve er tomme, skjuler de fem
       der betyder noget — og med lodret scroll bliver de fem usynlige frem for
       bare små. */
    const r = raekkerIVindue(
      [opg("a", { koeretoejId: "kt-2", startMs: NU, estimeretMin: 60 })],
      NU - DAG, NU + DAG, enheder);
    assert.deepEqual(r.map((x) => x.id), ["kt-2"]);
  });

  it("tager en opgave der KRYDSER vinduet med", () => {
    /* Et treugers værkstedsbesøg der begyndte før vinduet, spærrer stadig
       enheden. Blev rækken udeladt, ville enheden se fri ud. */
    const r = raekkerIVindue(
      [opg("a", { koeretoejId: "kt-3", startMs: NU - 20 * DAG, estimeretMin: 40 * 24 * 60 })],
      NU - DAG, NU + DAG, enheder);
    assert.deepEqual(r.map((x) => x.id), ["kt-3"]);
  });

  it("beholder enhedernes egen rækkefølge", () => {
    const r = raekkerIVindue(
      [opg("a", { koeretoejId: "kt-3", startMs: NU }),
       opg("b", { koeretoejId: "kt-1", startMs: NU })],
      NU - DAG, NU + DAG, enheder);
    assert.deepEqual(r.map((x) => x.id), ["kt-1", "kt-3"]);
  });
});

describe("⚠ ÉT ORDFORRÅD PÅ TVÆRS AF KATALOG OG KØ", () => {
  /* ⚠ FLEET TARGET (produktejer-review 2026-09-01) FJERNEDE DET TREDJE
     ORDFORRÅD. Driftskalenderens fem "kasser" (et separat KASSER-katalog i
     Vaerkstedskalender.jsx) flyttede til Overblik.jsx, som IKKE har sit eget
     katalog — det ER Arbejdskoe.jsx's UDSNIT, importeret direkte
     (ArbejdskoeIndhold). Der er derfor kun ÉT ordforråd tilbage at holde i
     synk: UDSNIT's nøgler mod driftstal()'s egne feltnavne — ikke to
     tekstlæste kataloger mod hinanden. Skrev UDSNIT en nøgle driftstal()
     ikke kender, ville `tal[vis].antal` i ArbejdskoeIndhold være
     `undefined`, og et tal der læses som "0" i stedet for at fejle synligt,
     er netop den slags drift denne fil findes for at fange. */
  it("UDSNIT's nøgler er driftstal()'s kategorier", () => {
    const koe = readFileSync(
      new URL("../src/moduler/flaade/Arbejdskoe.jsx", import.meta.url), "utf8");
    const udsnitBlok = koe.slice(koe.indexOf("const UDSNIT = {"), koe.indexOf("\n};"));
    const fraKoe = [...udsnitBlok.matchAll(/^ {2}([a-z]+): \{/gm)].map((m) => m[1]);

    /* `udenVarighed` er et meta-felt (opgaver uden estimat), ikke en af de
       fem kategorier en bruger vælger imellem — se driftstal()'s eget hoved. */
    const fraDriftstal = Object.keys(driftstal({})).filter((k) => k !== "udenVarighed");

    assert.deepEqual(fraKoe.sort(), fraDriftstal.sort(),
      "UDSNIT i Arbejdskoe.jsx og driftstal()'s kategorier er ikke længere de samme nøgler");
  });

  it("køens vinduer er FREMAD-kataloget, ikke en afskrift", () => {
    const koe = readFileSync(
      new URL("../src/moduler/flaade/Arbejdskoe.jsx", import.meta.url), "utf8");
    assert.match(koe, /FREMAD/, "Arbejdskøen bygger sine egne vinduesknapper");
    assert.ok(FREMAD.some((f) => f.dage === STANDARD_FREMAD),
      "standardvinduet står ikke i FREMAD — knapperækken ville starte uden et valgt trin");
  });

  it("prioritetsfiltret bruger katalogets tre trin", () => {
    const koe = readFileSync(
      new URL("../src/moduler/flaade/Arbejdskoe.jsx", import.meta.url), "utf8");
    assert.match(koe, /ALLE_PRIORITETER/,
      "Arbejdskøen lister prioriteterne selv i stedet for at læse kataloget");
    assert.equal(ALLE_PRIORITETER.length, 3);
  });
});
