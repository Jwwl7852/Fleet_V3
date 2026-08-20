/* test/volumen.test.mjs
 * Volumenkalkulatoren — WAREHOUSE.md etape 8.
 *
 * Prøven der betyder mest, står nederst: at forudsætningerne ALTID følger med
 * tallet. Et beløb der står alene, læses som en pris — og så er det den
 * sælgeren bliver holdt fast på, når kunden viser sig at have 180 paller og
 * ikke 120.
 */
import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAPACITETSGRUNDLAG, ALLE_KAPACITETSGRUNDLAG, TILBUDSHAANDTERINGER,
  DOEGN_PR_MAANED, tilbudsberegning, kubikFraLinjer, maalFraMm, volumenIalt,
} from "../src/fleet/volumen.js";
import { LAGERYDELSER, METODER, ALLE_LAGERYDELSER } from "../src/fleet/pricing.js";
import { ANTAL_SKALA } from "../src/fleet/beloeb.js";

const M = (n) => Math.round(n * ANTAL_SKALA);

/* En prisliste hvor alt koster noget. Beløb i ØRE. */
const PRISER = {
  "lager-palleplads": 250,        /* 2,50 kr. pr. palle pr. døgn */
  "lager-kubik": 90,
  "lager-kvadratmeter": 400,
  "lager-handlingInd": 4500,      /* 45 kr. pr. håndtering */
  "lager-handlingUd": 5000,
  "lager-flytning": 12000,
  "lager-pluk": 3000,
  "lager-retur": 7500,
};
const prisFor = (id) => (PRISER[id] == null ? null : { oere: PRISER[id], kilde: "standard" });
const udenPris = () => null;

/* ---- Kataloget --------------------------------------------------------- */

test("⚠ ALLE TRE GRUNDLAG HAR EN YDELSE I KATALOGET", () => {
  /* Broen skal holde: vælger skærmen m², skal der findes en ydelse at sætte
     en pris på. Uden den ville grundlaget kunne vælges og aldrig kunne
     prissættes — og summen ville altid mangle. */
  for (const k of ALLE_KAPACITETSGRUNDLAG) {
    const id = KAPACITETSGRUNDLAG[k].ydelseId;
    assert.ok(LAGERYDELSER[id], `${k} peger paa ydelsen ${id}, som ikke findes i kataloget`);
    assert.equal(LAGERYDELSER[id].kategori, "lager");
    /* ⚠ INGEN arter. De to — nu tre — opbevaringsydelser regnes ikke af
       bevægelser, men af hvad der STÅR på lageret pr. døgn. */
    assert.equal(LAGERYDELSER[id].arter, null,
      `${id} har faaet bevaegelsesarter — saa ville den blive afregnet to gange`);
  }
});

test("m² kom til med etape 8 — og har sin egen metode", () => {
  /* Gods der ikke kan stables, lægger beslag på GULV uanset højden. Solgtes
     det som m³, ville en vognmand fakturere en tredjedel af hvad pladsen
     koster ham. */
  assert.ok(ALLE_LAGERYDELSER.includes("lager-kvadratmeter"));
  assert.equal(LAGERYDELSER["lager-kvadratmeter"].metode, "prKvadratmeterdoegn");
  assert.ok(METODER.prKvadratmeterdoegn, "metoden findes ikke");
  /* De tre er tre FORSKELLIGE metoder. Delte de én, kunne prisskærmen ikke
     skrive hvad enheden er. */
  const metoder = ALLE_KAPACITETSGRUNDLAG.map((k) => LAGERYDELSER[KAPACITETSGRUNDLAG[k].ydelseId].metode);
  assert.equal(new Set(metoder).size, 3);
});

test("håndteringerne peger alle på en ydelse der findes", () => {
  for (const h of TILBUDSHAANDTERINGER) {
    assert.ok(LAGERYDELSER[h.ydelseId], `${h.ydelseId} findes ikke i kataloget`);
    assert.equal(LAGERYDELSER[h.ydelseId].kategori, "haandtering");
  }
});

test("⚠ OPTÆLLING ER IKKE EN TILBUDSLINJE", () => {
  /* Den er vores kontrol af vores eget arbejde. Kom den med i et tilbud,
     ville kunden betale for at vi tæller efter os selv. */
  assert.ok(!TILBUDSHAANDTERINGER.some((h) => /optael|juster/.test(h.ydelseId)));
});

/* ---- Ét grundlag ------------------------------------------------------- */

test("⚠ MAN VÆLGER ÉT GRUNDLAG — to ville fakturere samme plads to gange", () => {
  /* Modellen tager ét `grundlag`, ikke tre mængder. Det er hele forskellen:
     tre felter ville blive udfyldt. */
  const r = tilbudsberegning({
    grundlag: "palle", maengde: M(120), maaneder: 1, prisFor,
  });
  const lagerlinjer = r.linjer.filter((l) => l.art === "lager");
  assert.equal(lagerlinjer.length, 1, "der er mere end én opbevaringslinje");
  assert.equal(lagerlinjer[0].ydelseId, "lager-palleplads");
});

test("et ukendt grundlag kaster — det er ikke et gæt værd", () => {
  assert.throws(() => tilbudsberegning({ grundlag: "kolli", prisFor }), /ukendt grundlag/);
  assert.throws(() => tilbudsberegning({ prisFor }), /ukendt grundlag/);
});

test("prisFor kræves — beregneren slår ikke op selv", () => {
  /* En kopi af prisopslaget ville være to steder der afgør hvilken sats der
     gjaldt. Beslutning 7. */
  assert.throws(() => tilbudsberegning({ grundlag: "palle" }), /prisFor/);
});

/* ---- Regnestykket ------------------------------------------------------ */

test("opbevaringen er mængde × døgn × sats", () => {
  const r = tilbudsberegning({
    grundlag: "palle", maengde: M(120), maaneder: 1, prisFor,
  });
  assert.equal(r.doegn, DOEGN_PR_MAANED);
  /* 120 paller × 30 døgn × 2,50 kr. = 9.000 kr. */
  assert.equal(r.linjer[0].beloebOere, 120 * 30 * 250);
  assert.equal(r.sum.ialtOere, 900000);
});

test("⚠ EN MÅNED ER 30 DØGN, OG DET ER ET AFTALT TAL", () => {
  /* Opbevaring prissættes pr. døgn. Brugte beregneren den indeværende måneds
     længde, ville det samme gods koste noget andet den 1. marts end den 1.
     juli — og et tilbud kunne ikke regnes efter. */
  assert.equal(DOEGN_PR_MAANED, 30);
  assert.equal(tilbudsberegning({ grundlag: "palle", maengde: M(1), maaneder: 12, prisFor }).doegn, 360);
});

test("håndteringerne ganges op med antallet af måneder", () => {
  const r = tilbudsberegning({
    grundlag: "palle", maengde: M(100), maaneder: 12, prisFor,
    haandteringer: { "lager-handlingInd": M(40) },
  });
  const ind = r.linjer.find((l) => l.ydelseId === "lager-handlingInd");
  assert.equal(ind.antal, M(480), "40 om måneden i 12 måneder");
  assert.equal(ind.beloebOere, 480 * 4500);
});

test("⚠ NUL HÅNDTERINGER GIVER INGEN LINJE", () => {
  /* En linje på 0 kr. i et tilbud ligner en ydelse kunden får gratis — og så
     bliver den bedt om. */
  const r = tilbudsberegning({
    grundlag: "palle", maengde: M(10), maaneder: 1, prisFor,
    haandteringer: { "lager-handlingInd": M(5), "lager-retur": 0 },
  });
  assert.ok(r.linjer.some((l) => l.ydelseId === "lager-handlingInd"));
  assert.ok(!r.linjer.some((l) => l.ydelseId === "lager-retur"));
});

test("månedsprisen er afledt — den gemmes ingen steder", () => {
  /* Beslutning 6: et gemt afledt tal driver fra sit grundlag. */
  const r = tilbudsberegning({ grundlag: "palle", maengde: M(100), maaneder: 6, prisFor });
  assert.equal(r.sum.prMaanedOere, Math.round(r.sum.ialtOere / 6));
});

/* ---- Den manglende pris ------------------------------------------------ */

test("⚠ EN YDELSE UDEN PRIS UDELADES IKKE — og summen kan ikke gøres op", () => {
  /* Udelod vi linjen, ville tilbuddet se komplet ud mens en ydelse manglede
     sin pris, og sælgeren ville give den væk uden at vide det. Samme regel
     som afregningslinjer(). */
  const kun = (id) => (id === "lager-palleplads" ? { oere: 250, kilde: "standard" } : null);
  const r = tilbudsberegning({
    grundlag: "palle", maengde: M(100), maaneder: 1, prisFor: kun,
    haandteringer: { "lager-pluk": M(20) },
  });
  const pluk = r.linjer.find((l) => l.ydelseId === "lager-pluk");
  assert.ok(pluk, "linjen blev udeladt");
  assert.equal(pluk.satsOere, null);
  assert.equal(pluk.beloebOere, null, "et beloeb paa 0 ville ligne en gratis ydelse");
  assert.equal(r.sum.ialtOere, null, "summen blev gjort op alligevel");
  assert.equal(r.sum.prMaanedOere, null);
  assert.equal(r.sum.mangler, 1);
});

test("mangler ALT en pris, er summen stadig null og ikke nul", () => {
  const r = tilbudsberegning({
    grundlag: "kubik", maengde: M(50), maaneder: 1, prisFor: udenPris,
  });
  assert.equal(r.sum.ialtOere, null);
  assert.equal(r.linjer[0].kilde, null);
});

test("kilden følger med hver linje", () => {
  /* Et tilbud til en EKSISTERENDE kunde regner med hans aftale; et tilbud til
     et emne kan kun bruge standardprisen. Forskellen skal kunne ses. */
  const medRabat = (id) => ({ oere: PRISER[id], kilde: id === "lager-pluk" ? "rabat" : "standard" });
  const r = tilbudsberegning({
    grundlag: "palle", maengde: M(10), maaneder: 1, prisFor: medRabat,
    haandteringer: { "lager-pluk": M(5) },
  });
  assert.equal(r.linjer.find((l) => l.ydelseId === "lager-pluk").kilde, "rabat");
  assert.equal(r.linjer[0].kilde, "standard");
});

/* ---- Rumfang ud af varernes mål ---------------------------------------- */

const VARER = [
  { id: "v-1", laengdeMm: 1000, breddeMm: 1000, hoejdeMm: 1000 },   /* 1 m³ */
  { id: "v-2", laengdeMm: 500, breddeMm: 400, hoejdeMm: 300 },      /* 0,06 m³ */
  { id: "v-3" },                                                     /* ingen maal */
];

test("rumfanget regnes af varernes egne mål", () => {
  const { kubik, uden } = kubikFraLinjer(
    [{ vareId: "v-1", antal: M(3) }, { vareId: "v-2", antal: M(10) }], { varer: VARER });
  assert.equal(Math.round(kubik * 1000) / 1000, 3.6);
  assert.deepEqual(uden, []);
});

test("⚠ EN VARE UDEN MÅL TÆLLER IKKE SOM NUL — den rapporteres", () => {
  /* Talte den som nul, ville rumfanget se komplet ud mens en palle manglede.
     Samme regel som en afregningslinje uden sats. */
  const { kubik, uden } = kubikFraLinjer(
    [{ vareId: "v-1", antal: M(1) }, { vareId: "v-3", antal: M(99) }], { varer: VARER });
  assert.equal(kubik, 1);
  assert.deepEqual(uden, ["v-3"]);
});

test("en ukendt vare rapporteres ligeså", () => {
  const { uden } = kubikFraLinjer([{ vareId: "v-findes-ikke", antal: M(1) }], { varer: VARER });
  assert.deepEqual(uden, ["v-findes-ikke"]);
});

test("⚠ MILLIMETER TIL KUBIKMETER ER 1e9 — ikke 1e6", () => {
  /* En faktor 1000 forkert i et tilbud er en pris der er en milliard gange
     forkert. Regnestykket står ét sted af netop den grund. */
  const { kubik } = kubikFraLinjer([{ vareId: "v-1", antal: M(1) }], { varer: VARER });
  assert.equal(kubik, 1, "1000×1000×1000 mm er ÉN kubikmeter");
});

/* ══════════════════════════════════════════════════════════════════════════
   FORBEHOLDET

   Priserne er vores og er rigtige. Mængderne er kundens gæt og er det ikke.
   Et beløb der står alene, læses som en pris.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ FORUDSÆTNINGERNE FØLGER ALTID MED TALLET", () => {
  const r = tilbudsberegning({
    grundlag: "palle", maengde: M(120), maaneder: 12, prisFor,
    haandteringer: { "lager-handlingInd": M(40) },
  });
  assert.ok(Array.isArray(r.forudsaetninger));
  /* Grundlaget, perioden og hver håndtering der blev regnet med. */
  assert.ok(r.forudsaetninger.some((f) => f.hvad === "Grundlag" && /120 palleplads/.test(f.vaerdi)));
  assert.ok(r.forudsaetninger.some((f) => /12 md\. = 360 døgn/.test(f.vaerdi)));
  assert.ok(r.forudsaetninger.some((f) => f.hvad === "Modtagelser"));
  /* ⚠ OG DE SIGER HVEM DER HAR OPLYST DEM. Uden noten ville de læses som
     tal vi har målt. */
  assert.ok(r.forudsaetninger.every((f) => f.note && f.note.length > 5));
  assert.ok(r.forudsaetninger.some((f) => /kunden|oplyst|forventet/i.test(f.note)));
});

test("forudsætningerne nævner kun de håndteringer der faktisk blev regnet med", () => {
  /* En forudsætning om noget der ikke står i beregningen, er støj — og så
     bliver listen ikke læst. */
  const r = tilbudsberegning({
    grundlag: "kubik", maengde: M(40), maaneder: 1, prisFor,
    haandteringer: { "lager-pluk": M(10) },
  });
  assert.ok(r.forudsaetninger.some((f) => f.hvad === "Pluk"));
  assert.ok(!r.forudsaetninger.some((f) => f.hvad === "Returer"));
});

/* ---- Skærmen ----------------------------------------------------------- */

test("⚠ SKÆRMEN VISER FORUDSÆTNINGERNE", () => {
  /* Feltet findes for at blive vist. Vises det ikke, er hele forbeholdet et
     felt i et objekt ingen ser. */
  const s = readFileSync("src/moduler/warehouse/Volumen.jsx", "utf8");
  assert.ok(s.includes("beregning.forudsaetninger.map"),
    "forudsaetningerne tegnes ikke");
  assert.ok(/Et estimat, ikke et tilbud/.test(s),
    "skaermen siger ikke at tallet er et estimat");
});

test("⚠ SKÆRMEN OPRETTER IKKE ET TILBUD", () => {
  /* Nodeformen er ikke besluttet: et tilbud kan gå til et EMNE der ikke er
     kunde endnu, og `tilbud` er ikke en bookingtilstand. En knap der gemte
     tilbuddet, ville afgøre det spørgsmål ved et uheld. */
  const s = readFileSync("src/moduler/warehouse/Volumen.jsx", "utf8");
  assert.ok(!/from "\.\.\/\.\.\/fleet\/(skriv|lager|fakturering)\.js"/.test(s),
    "skaermen importerer en skrivevej");
  assert.ok(!/db\.ref\(|\.set\(|\.update\(/.test(s), "skaermen skriver til basen");
  assert.ok(s.includes("Der oprettes ikke et tilbud herfra"),
    "skaermen siger ikke hvorfor der ikke gemmes noget");
});

test("skærmen regner ikke selv", () => {
  const s = readFileSync("src/moduler/warehouse/Volumen.jsx", "utf8");
  assert.ok(s.includes("tilbudsberegning({"), "beregningen ligger i skaermen");
  assert.ok(s.includes("prisFor("), "prisen slaas ikke op ad husets ene vej");
  /* ⚠ OG DEN LAVER IKKE SIT EGET KATALOG. Ydelserne kommer fra pricing.js;
     en liste her ville drive fra kataloget. */
  assert.ok(!/const (YDELSER|TILBUDSLINJER)\s*=/.test(s));
});

test("ruten og nav-punktet findes begge steder", () => {
  const nav = readFileSync("src/fleet/nav.js", "utf8");
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(nav.includes('sti: "/warehouse/volumen"'));
  assert.ok(app.includes('path="warehouse/volumen"'));
});

test("⚠ SATSEN VISES MED TO DECIMALER — ellers kan tilbuddet ikke regnes efter", () => {
  /* En palleplads koster 2,50 kr. i døgnet. Vises satsen som "3 kr.", er
     120 × 360 × 3 ikke 108.000 — og sælgeren kan ikke forklare sit eget tal
     over for kunden. Klikket i skærmen fandt det; prøven holder det fast.
     Totalerne står i hele kroner som alle andre steder i huset. */
  const s = readFileSync("src/moduler/warehouse/Volumen.jsx", "utf8");
  assert.ok(/kr\(l\.satsOere, 2\)/.test(s),
    "satsen rundes til hele kroner — saa passer regnestykket ikke");
});

describe("målene på en enkelt ting", () => {
  /* ⚠ TO TAL AF ÉT SÆT MÅL. Planchen for Unitbooking har m² OG m³ som
     indtastede felter pr. kasse; to tal om den samme fysiske kasse kan blive
     uenige. Målene kan de ikke. Se UNITBOOKING.md 6.2. */
  const kasse = { id: "MDT-101", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950 };

  it("regner m² og m³ af millimeter", () => {
    const m = maalFraMm(kasse);
    assert.equal(m.m2, 0.96);
    /* 1200 × 800 × 950 mm³ = 912.000.000 mm³ = 0,912 m³ */
    assert.ok(Math.abs(m.m3 - 0.912) < 1e-9);
  });

  it("⚠ GÆTTER IKKE — et manglende mål giver null, ikke nul", () => {
    /* Et nul ville gøre kassen til den mindste på lageret. */
    assert.equal(maalFraMm({ laengdeMm: 1200, breddeMm: 800 }), null);
    assert.equal(maalFraMm({ ...kasse, hoejdeMm: 0 }), null);
    assert.equal(maalFraMm({ ...kasse, breddeMm: -100 }), null);
    assert.equal(maalFraMm({}), null);
    assert.equal(maalFraMm(), null);
  });

  it("summen rapporterer dem uden mål", () => {
    /* Talte de som nul, ville totalen se komplet ud mens en kasse manglede —
       samme regel som en afregningslinje uden sats. */
    const r = volumenIalt([kasse, { id: "MDT-108" }, { ...kasse, id: "MDT-102" }]);
    assert.ok(Math.abs(r.m2 - 1.92) < 1e-9);
    assert.ok(Math.abs(r.m3 - 1.824) < 1e-9);
    assert.deepEqual(r.uden, ["MDT-108"]);
  });

  it("en tom liste er nul og ingen mangler", () => {
    assert.deepEqual(volumenIalt([]), { m2: 0, m3: 0, uden: [] });
  });

  it("⚠ FELTNAVNENE ER DE SAMME SOM PÅ varer OG carriers", () => {
    /* kubikFraLinjer() regner allerede af varens laengdeMm. Tre noder med tre
       navne for det samme mål ville betyde tre funktioner. */
    const kilde = readFileSync("src/fleet/volumen.js", "utf8");
    for (const felt of ["laengdeMm", "breddeMm", "hoejdeMm"]) {
      assert.ok(kilde.includes(felt), felt);
    }
  });
});
