/* test/laengdebaand.test.mjs
 * Længdebånd på en sats — trin 3 af beslutning 18.
 *
 * ⚠ HVORFOR DEN FINDES. `laengdeMm` stod på hvert eneste køretøj, blev
 * valideret som millimeter-integer med en kommentar om at "9,998 mod 10,002
 * afgør prisen" — og INTET læste feltet. Færgen kostede det samme for en
 * kassevogn og for et modulvogntog.
 *
 * Rødby–Puttgarden: 1.338 kr for 10 m, 2.530 kr for 18 m. Forskellen er
 * 1.192 kr pr. overfart, og den gik den forkerte vej — estimatet var for
 * lavt på præcis de ture hvor der er mindst luft i prisen.
 *
 * Prøven holder tre ting, og de to sidste er de vigtigste:
 *   1. at grænsen ligger hvor rederiet siger den ligger
 *   2. at en manglende takst ikke bliver til nul
 *   3. at en længde uden for båndene ikke bliver til det nærmeste bånd
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  satsOpslag, satsPaa, iLaengdebaand, harLaengdebaand, baandLabel,
  baandOverlap, valideSats, MANGLERTEKST, beregnBooking,
} from "../src/fleet/pricing.js";
import { DEMO_OMKOSTNINGER } from "../src/fleet/demo-omkostninger.js";
import { omkostningsark } from "../src/fleet/omkostninger.js";
import { samletLaengdeMm } from "../src/fleet/flaade.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";

const NU = Date.UTC(2026, 0, 1);
const SENERE = Date.UTC(2026, 6, 1);

/** Femerns to bånd, som de står i demo-sættet. */
const FEMERN = [
  { gyldigFra: NU, beloebOere: 133800, metode: "prPassage", laengdeTilMm: 10000 },
  { gyldigFra: NU, beloebOere: 253000, metode: "prPassage", laengdeFraMm: 10000, laengdeTilMm: 18000 },
];

describe("Grænsen ligger hvor rederiet siger den ligger", () => {
  it("⚠ (fra, til] — ØVRE GRÆNSE INKLUSIV", () => {
    /* Rederierne udgiver taksten som "indtil 10 m". Et vogntog på præcis
       10.000 mm hører derfor i det BILLIGE bånd. Læste vi det som
       [fra, til), ville nøjagtig 10 m koste 1.192 kr for meget — og det er
       netop den grænse længden gemmes i millimeter for. */
    const oere = (mm) => satsOpslag(FEMERN, NU, { laengdeMm: mm }).sats?.beloebOere ?? null;
    assert.equal(oere(9998), 133800);
    assert.equal(oere(10000), 133800, "præcis 10 m er INDTIL 10 m");
    assert.equal(oere(10002), 253000);
    assert.equal(oere(18000), 253000, "præcis 18 m er stadig inde i båndet");
  });

  it("en sats uden nedre grænse begynder ved nul", () => {
    assert.equal(satsPaa(FEMERN, NU, { laengdeMm: 1 }).beloebOere, 133800);
  });

  it("en sats uden øvre grænse har ingen", () => {
    const uden = [{ gyldigFra: NU, beloebOere: 999, laengdeFraMm: 18000 }];
    assert.equal(satsPaa(uden, NU, { laengdeMm: 40000 }).beloebOere, 999);
    assert.equal(satsPaa(uden, NU, { laengdeMm: 18000 }), null, "18.000 er ikke OVER 18.000");
  });

  it("skriver båndet som et menneske læser det", () => {
    assert.equal(baandLabel(FEMERN[0]), "indtil 10,0 m");
    assert.equal(baandLabel(FEMERN[1]), "over 10,0 m til 18,0 m");
    assert.equal(baandLabel({ laengdeFraMm: 18000 }), "over 18,0 m");
    assert.equal(baandLabel({ beloebOere: 1 }), "alle længder");
  });
});

describe("⚠ EN MANGLENDE TAKST ER IKKE NUL", () => {
  it("uden længde svares der IKKE med en båndsats", () => {
    /* Faldt vi tilbage på den første eller den billigste, ville en tur uden
       valgt bil få en pris der ser rigtig ud. Den fejl kan ikke ses på
       tallet — og en for lav pris er den retning ingen opdager. */
    const r = satsOpslag(FEMERN, NU, {});
    assert.equal(r.sats, null);
    assert.equal(r.mangler, "laengde");
  });

  it("en længde uden for båndene giver ikke det nærmeste bånd", () => {
    /* 19,4 m på en færge hvor vi kun kender taksten til 18 m, er et
       spørgsmål til rederiet. Samme regel som momssatsen der mangler. */
    const r = satsOpslag(FEMERN, NU, { laengdeMm: 19400 });
    assert.equal(r.sats, null);
    assert.equal(r.mangler, "baand");
  });

  it("ingen gyldig sats på datoen er sin EGEN grund", () => {
    /* De tre grunde har hver sin rettelse: opret satsen, oplys længden,
       eller spørg rederiet. Et `null` alene kan ikke skelne dem. */
    assert.equal(satsOpslag(FEMERN, Date.UTC(2025, 0, 1), { laengdeMm: 6200 }).mangler, "sats");
    assert.equal(satsOpslag([], NU, { laengdeMm: 6200 }).mangler, "sats");
    assert.deepEqual(Object.keys(MANGLERTEKST).sort(), ["baand", "laengde", "sats"]);
  });

  it("⚠ EN BÅNDLØS SATS BLIVER IKKE BRUGT SOM FALDBAKKE", () => {
    /* Bærer bare én af postens gyldige satser et bånd, er posten båndopdelt.
       En gammel fast takst ved siden af må ikke redde opslaget — så ville
       indførelsen af bånd gøre prisen forkert i tavshed. */
    const blandet = [...FEMERN, { gyldigFra: NU, beloebOere: 215000 }];
    assert.equal(satsOpslag(blandet, NU, {}).mangler, "laengde");
    assert.equal(satsOpslag(blandet, NU, { laengdeMm: 19400 }).mangler, "baand");
  });
});

describe("Båndet ændrer ikke de kaldsteder der ikke har et", () => {
  it("en satsliste uden bånd opfører sig præcis som før", () => {
    /* satsPaa() bruges otte steder — km-satser, agenter, lagerdøgn,
       håndtering. Ingen af dem har en længde, og ingen af dem må mærke
       forskel. */
    const uden = [
      { gyldigFra: NU, beloebOere: 100 },
      { gyldigFra: SENERE, beloebOere: 200 },
    ];
    assert.equal(satsPaa(uden, NU).beloebOere, 100);
    assert.equal(satsPaa(uden, SENERE).beloebOere, 200, "nyeste gyldige vinder");
    assert.equal(satsPaa(uden, Date.UTC(2025, 0, 1)), null);
  });

  it("aktiv: false springes over, som før", () => {
    const satser = [
      { gyldigFra: SENERE, beloebOere: 999, aktiv: false, laengdeTilMm: 10000 },
      ...FEMERN,
    ];
    assert.equal(satsPaa(satser, SENERE, { laengdeMm: 6200 }).beloebOere, 133800);
  });

  it("⚠ ET BÅND VERSIONERES FOR SIG — beslutning 7", () => {
    /* Stiger taksten for de lange vogntog, lægges en NY post med sin egen
       gyldigFra. Det korte bånd står uændret, og en booking fra i går kan
       stadig forklares. Det var hele grunden til at båndet ligger PÅ satsen
       frem for i et niveau over den. */
    const satser = [
      ...FEMERN,
      { gyldigFra: SENERE, beloebOere: 279000, laengdeFraMm: 10000, laengdeTilMm: 18000 },
    ];
    assert.equal(satsPaa(satser, NU, { laengdeMm: 12000 }).beloebOere, 253000);
    assert.equal(satsPaa(satser, SENERE, { laengdeMm: 12000 }).beloebOere, 279000);
    assert.equal(satsPaa(satser, SENERE, { laengdeMm: 6200 }).beloebOere, 133800,
      "det korte bånd må ikke flytte sig fordi det lange blev rettet");
  });
});

describe("To bånd må ikke dække samme længde", () => {
  it("finder overlappet FØR satsen lægges", () => {
    /* To priser på én tur, og opslaget ville tage det ene uden at nogen
       kunne se hvorfor. En sats overskrives ikke bagefter — derfor skal
       formularen kunne afvise det. */
    assert.equal(baandOverlap(FEMERN).length, 0);
    const daarlig = [
      { gyldigFra: NU, beloebOere: 1, laengdeTilMm: 12000 },
      { gyldigFra: NU, beloebOere: 2, laengdeFraMm: 10000 },
    ];
    assert.equal(baandOverlap(daarlig).length, 1);
  });

  it("to generationer af samme bånd er ikke et overlap", () => {
    const toGenerationer = [
      { gyldigFra: NU, beloebOere: 253000, laengdeFraMm: 10000, laengdeTilMm: 18000 },
      { gyldigFra: SENERE, beloebOere: 279000, laengdeFraMm: 10000, laengdeTilMm: 18000 },
    ];
    assert.deepEqual(baandOverlap(toGenerationer), []);
  });

  it("harLaengdebaand og iLaengdebaand svarer på hver sit", () => {
    assert.equal(harLaengdebaand({ beloebOere: 1 }), false);
    assert.equal(harLaengdebaand({ laengdeTilMm: 10000 }), true);
    /* En sats UDEN bånd dækker alle længder — også en ukendt. */
    assert.equal(iLaengdebaand({ beloebOere: 1 }, null), true);
    assert.equal(iLaengdebaand({ laengdeTilMm: 10000 }, null), false);
  });
});

describe("Valideringen af båndet", () => {
  const basis = { gyldigFra: NU, beloebOere: 100 };

  it("millimeter som helt tal — ikke meter og ikke float", () => {
    assert.deepEqual(valideSats({ ...basis, laengdeTilMm: 10000 }, { nu: NU }), {});
    assert.ok(valideSats({ ...basis, laengdeTilMm: 10.5 }, { nu: NU }).laengdeTilMm);
    assert.ok(valideSats({ ...basis, laengdeFraMm: -1 }, { nu: NU }).laengdeFraMm);
  });

  it("⚠ ET TOMT BÅND ER VÆRRE END INTET BÅND", () => {
    /* Det kan aldrig rammes, men gør posten båndopdelt — så hver eneste tur
       får "ingen takst for den længde" uden at nogen kan se hvorfor. */
    assert.ok(valideSats({ ...basis, laengdeFraMm: 18000, laengdeTilMm: 10000 }, { nu: NU }).laengdeTilMm);
    assert.ok(valideSats({ ...basis, laengdeFraMm: 10000, laengdeTilMm: 10000 }, { nu: NU }).laengdeTilMm);
  });

  it("en sats uden bånd valideres som før", () => {
    assert.deepEqual(valideSats(basis, { nu: NU }), {});
  });
});

describe("Reglerne kender de to felter", () => {
  it("⚠ BEGGE STEDER — omkostninger OG kundepriser", () => {
    /* `$andet: false` staar begge steder, saa uden feltet ville skrivningen
       blive afvist af serveren og godtaget af formularen. Og formen er ÉN:
       videresælger vognmanden færgen, er det samme spørgsmål om kajmeter. */
    const regler = readFileSync("firebase.rules.json", "utf8");
    const fra = regler.match(/"laengdeFraMm"/g) || [];
    const til = regler.match(/"laengdeTilMm"/g) || [];
    assert.equal(fra.length, 2, "laengdeFraMm staar ikke begge steder");
    assert.equal(til.length, 2, "laengdeTilMm staar ikke begge steder");
  });
});

describe("Demo-sættet bruger båndet", () => {
  it("Femern har to bånd og intet overlap", () => {
    const femern = DEMO_OMKOSTNINGER.find((o) => o.id === "faerge:femern");
    const satser = Object.values(femern.satser);
    assert.equal(satser.length, 2);
    assert.deepEqual(baandOverlap(satser), []);
    assert.equal(satser.filter(harLaengdebaand).length, 2);
  });

  it("⚠ ET VOGNTOG PÅ 19,8 M KAN IKKE PRISSÆTTES — OG DET ER MENINGEN", () => {
    /* et-001 er 19.820 mm. Vi kender ikke Femerns takst over 18 m, og det
       nærmeste bånd er ikke svaret. En synlig mangel bliver rettet; en
       usynlig pris der er 1.192 kr for lav, gør ikke. */
    const ark = omkostningsark(DEMO_OMKOSTNINGER, { koeretoejer: DEMO_KOERETOEJER });
    const kt = Object.fromEntries(DEMO_KOERETOEJER.map((k) => [k.id, k]));
    const laengdeMm = samletLaengdeMm([kt["kt-012"], kt["kt-tr41"]]);
    assert.ok(laengdeMm > 18000, "demo-vogntoget er ikke længere end båndet");

    const r = beregnBooking({ laengdeMm, passager: { "faerge:femern": 1 } },
                            ark, { paaMs: Date.UTC(2026, 5, 1) });
    const faerge = r.linjer.find((l) => l.id === "post:faerge:femern");
    assert.equal(faerge.mangler, "baand");
    assert.equal(r.totalOere, null);
  });

  it("⚠ TRÆKKER PLUS TRAILER — ikke bare trækkeren", () => {
    /* Med bilens eget felt ville traileren være gratis på færgen, og et
       vogntog ville ryge i det billige bånd. Samme fejl som ét
       `koeretoejId` på en etape. */
    const kt = Object.fromEntries(DEMO_KOERETOEJER.map((k) => [k.id, k]));
    const alene = samletLaengdeMm([kt["kt-012"]]);
    const medTrailer = samletLaengdeMm([kt["kt-012"], kt["kt-tr41"]]);
    assert.ok(medTrailer > alene);
    assert.equal(satsOpslag(FEMERN, NU, { laengdeMm: alene }).sats.beloebOere, 133800);
    assert.equal(satsOpslag(FEMERN, NU, { laengdeMm: medTrailer }).mangler, "baand");
  });
});

describe("Skærmen viser længden og siger fra", () => {
  it("eksemplet sender en længde til prismotoren", () => {
    const skaerm = readFileSync("src/moduler/booking/Bookingopsaetning.jsx", "utf8");
    assert.match(skaerm, /samletLaengdeMm/,
      "skærmen regner ikke længden — så får hver færgelinje 'ikke oplyst'");
    assert.match(skaerm, /laengdeMm/);
  });

  it("⚠ EN LINJE UDEN TAKST SKRIVER IKKE '0 kr.'", () => {
    /* `kr()` skelner med vilje ikke mellem null og nul — kun kalderen ved om
       nul er et svar. Her er det ikke: færgen sejler, vi kender bare ikke
       prisen. Skriver skærmen kr(null), står der "0 kr." på en overfart. */
    const skaerm = readFileSync("src/moduler/booking/Bookingopsaetning.jsx", "utf8");
    assert.match(skaerm, /manglerSats\s*\?\s*<b className="fc-bad">\{INTET\}<\/b>/,
      "linjen skriver ikke INTET når taksten mangler");
    assert.match(skaerm, /totalOere === null \? INTET/,
      "summen skriver ikke INTET når et led er ubesvaret");
  });
});
