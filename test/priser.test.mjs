/* test/priser.test.mjs
 * Abonnementsprisen — tre akser, to brugerarter og ÉN afrunding.
 *
 * ⚠ DEN VIGTIGSTE PRØVE HER ER "SUMMEN AF LINJERNE STEMMER MED TOTALEN".
 * Det er den type uoverensstemmelse en revisor finder, og den opstår i det
 * øjeblik nogen lægger rabatten oven på linjebeløbet i stedet for ind i
 * satsen — så afrundes der to gange.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BRUGERART, ALLE_BRUGERARTER, brugerartFor, taelBrugere, taelKoeretoejer,
  AFGAAEDE_STATUS, tomPrisliste, tomPlatform, overFrimaengde, PLATFORM,
  validerPrisliste, gaeldendePrisliste,
  linjerForPeriode, abonnementstotaler, sammenfatMaalinger, maalingsdato, periodeGraenser, maalingerIPeriode, MOMSSATS, rabatFor, GYLDIG_FRA_TIDLIGST,
} from "../src/fleet/priser.js";
import {
  ANTAL_SKALA, linjeBeloebOere, rabatteretSatsOere, BPS_SKALA, pctTilBps,
} from "../src/fleet/beloeb.js";
import { ALLE_ROLLER } from "../src/fleet/permissions.js";
import { VALGFRIE_MODULER } from "../src/fleet/moduler.js";

/* ⚠ BRUGERPRISEN LIGGER PAA PLATFORMEN, ikke paa modulerne. Fakturaen har ÉN
   linje pr. brugerart, og en linje kan kun have ÉN stk.pris — den kan ikke
   vaere summen af fire modulers satser. Se tomPlatform() i priser.js. */
const PRISLISTE = {
  gyldigFraMs: Date.UTC(2026, 0, 1),
  momssats: 25,
  platform: {
    basisOere: 99500,
    prBrugerOere: { chauffoer: 4900, desktop: 14900 },
    /* Tre desktopbrugere er med i prisen. */
    inkluderetBrugere: { chauffoer: 0, desktop: 3 },
  },
  moduler: {
    flaade: { basisOere: 49500, prKoeretoejOere: 2900 },
    bemanding: { basisOere: 29500 },
    booking: { basisOere: 79500 },
  },
};

/** En prisliste uden frimaengde — til de proever hvor den ville forstyrre. */
const UDEN_FRI = {
  ...PRISLISTE,
  platform: { ...PRISLISTE.platform, inkluderetBrugere: { chauffoer: 0, desktop: 0 } },
};

describe("Brugerarten kommer af rollen", () => {
  it("dækker HVER rolle i permissions.js", () => {
    /* ⚠ UDTØMMENDE MED VILJE. En ny rolle uden en art ville lydløst blive
       faktureret som desktop — den dyre af de to. Prøven fælder i stedet. */
    const uden = ALLE_ROLLER.filter((r) => !brugerartFor(r));
    assert.deepEqual(uden, [],
      "roller uden brugerart. De ville blive faktureret som et gæt.");
  });

  it("lægger ingen rolle i to arter", () => {
    for (const r of ALLE_ROLLER) {
      const traef = ALLE_BRUGERARTER.filter((a) => BRUGERART[a].roller.includes(r));
      assert.equal(traef.length, 1, `${r} står i ${traef.length} arter.`);
    }
  });

  it("giver null på en ukendt rolle — ikke desktop", () => {
    /* Fejler man åbent her, fakturerer man for noget man ikke kan gøre rede
       for. Kalderen skal opdage det. */
    assert.equal(brugerartFor("direktoer"), null);
    assert.equal(brugerartFor(undefined), null);
  });
});

describe("Tællingen", () => {
  const brugere = {
    u1: { rolle: "chauffoer" },
    u2: { rolle: "chauffoer" },
    u3: { rolle: "chauffoer", spaerret: true },
    u4: { rolle: "admin" },
    u5: { rolle: "disponent" },
  };

  it("tæller logins, og spærrede tæller ikke med", () => {
    /* ⚠ Et spærret login kan ikke bruges. At fakturere for det ville være at
       tage betaling for en adgang der er lukket — og en kunde der fyrer en
       chauffør SPÆRRER loginnet frem for at slette det, fordi der hænger
       indberetninger på uid'et. */
    const { antal, ukendte } = taelBrugere(brugere);
    assert.deepEqual(antal, { chauffoer: 2, desktop: 2 });
    assert.deepEqual(ukendte, []);
  });

  it("sluger ikke en ukendt rolle", () => {
    const { antal, ukendte } = taelBrugere({ ...brugere, u6: { rolle: "direktoer" } });
    assert.deepEqual(antal, { chauffoer: 2, desktop: 2 }, "den ukendte blev talt med");
    assert.deepEqual(ukendte, ["direktoer"]);
  });

  it("tæller ikke solgte og skrottede køretøjer", () => {
    /* De bliver stående for evigt — en solgt bil hardslettes aldrig. Talte de
       med, ville kundens regning vokse hvert år uden at han fik mere. */
    const flaade = {
      a: { status: "aktiv" }, b: { status: "vaerksted" }, c: { status: "udeAfDrift" },
      d: { status: "solgt" }, e: { status: "skrottet" },
    };
    assert.equal(taelKoeretoejer(flaade), 3);
    assert.deepEqual(AFGAAEDE_STATUS, ["solgt", "skrottet"]);
  });

  it("tæller en trailer som ét køretøj", () => {
    assert.equal(taelKoeretoejer({ a: { art: "trailer", status: "aktiv" } }), 1);
  });
});

describe("Prislisten", () => {
  it("kan laves tom for de moduler der kan sælges", () => {
    const t = tomPrisliste(VALGFRIE_MODULER);
    assert.deepEqual(Object.keys(t).sort(), [...VALGFRIE_MODULER].sort());
    for (const m of VALGFRIE_MODULER) {
      /* ⚠ INGEN prBrugerOere. Den ligger paa platformen nu. */
      assert.deepEqual(Object.keys(t[m]).sort(), ["basisOere", "prKoeretoejOere"]);
    }
  });

  it("har en platform med baade pris og frimaengde", () => {
    const pf = tomPlatform();
    assert.deepEqual(Object.keys(pf.prBrugerOere).sort(), [...ALLE_BRUGERARTER].sort());
    assert.deepEqual(Object.keys(pf.inkluderetBrugere).sort(), [...ALLE_BRUGERARTER].sort());
  });

  it("afviser en brugerpris paa et MODUL", () => {
    /* To steder at saette den ville betyde at fakturaens ene brugerlinje ikke
       kunne sige hvilken der gjaldt. */
    const f = validerPrisliste({
      ...PRISLISTE,
      moduler: { flaade: { basisOere: 1, prBrugerOere: { desktop: 100 } } },
    }, { kendteModuler: VALGFRIE_MODULER });
    assert.ok(f.some((x) => /platformen/.test(x)), "en brugerpris paa modulet blev godtaget");
  });

  it("kraever en platform", () => {
    const f = validerPrisliste({ gyldigFraMs: Date.UTC(2026, 0, 1), momssats: 25, moduler: {} });
    assert.ok(f.some((x) => /latform/.test(x)), "en prisliste uden platform blev godtaget");
  });

  it("GÆTTER IKKE momssatsen", () => {
    /* ⚠ Ikke 25, ikke 0. Samme regel som på kundens fakturagrundlag: et
       system der gætter rigtigt ni gange ud af ti, lærer brugeren at stole
       på det tiende. */
    const fejl = validerPrisliste({ gyldigFraMs: Date.UTC(2026, 0, 1), moduler: {}, platform: {} });
    assert.ok(fejl.some((f) => /moms/i.test(f)), "en prisliste uden momssats blev godtaget.");
    assert.deepEqual(validerPrisliste(PRISLISTE, { kendteModuler: VALGFRIE_MODULER }), []);
  });

  it("kræver hele øre", () => {
    const f = validerPrisliste({
      ...PRISLISTE, moduler: { flaade: { basisOere: 495.5 } },
    });
    assert.ok(f.some((x) => /hele øre/.test(x)));
  });

  it("afviser en ukendt brugerart og et ukendt modul", () => {
    assert.ok(validerPrisliste({
      ...PRISLISTE,
      platform: { ...PRISLISTE.platform, prBrugerOere: { fritter: 100 } },
    }).some((x) => /brugerart/.test(x)));
    assert.ok(validerPrisliste(
      { ...PRISLISTE, moduler: { fritter: {} } }, { kendteModuler: VALGFRIE_MODULER }
    ).some((x) => /Ukendt modul/.test(x)));
  });

  it("finder den liste der GJALDT, ikke den nyeste", () => {
    /* Samme mønster som gyldigFra på en sats: en ny pris er en NY post, og
       den gamle bliver stående. Ingen liste rettes. */
    const lister = {
      a: { gyldigFraMs: 1000, momssats: 25 },
      b: { gyldigFraMs: 3000, momssats: 25 },
      c: { gyldigFraMs: 2000, momssats: 25 },
    };
    assert.equal(gaeldendePrisliste(lister, 2500).id, "c");
    assert.equal(gaeldendePrisliste(lister, 999), null, "ingen liste gjaldt endnu");
    assert.equal(gaeldendePrisliste(lister, 9999).id, "b");
  });
});

describe("Linjerne for en periode", () => {
  const fuld = {
    prisliste: PRISLISTE,
    moduldage: { flaade: 31, bemanding: 31, booking: 31 },
    dageIPerioden: 31,
    antalBrugere: { chauffoer: 12, desktop: 4 },
    antalKoeretoejer: 14,
  };

  it("laver linjerne i FAKTURAENS raekkefoelge", () => {
    /* ⚠ RAEKKEFOELGEN ER EN DEL AF PRODUKTET. Platformsadgang foerst, saa
       modulerne i katalogorden, saa koeretoejer, og til sidst brugerne.
       Sorteres der alfabetisk, flytter linjerne sig den dag et modul doebes
       om — og en faktura der ser anderledes ud hver maaned, bliver laest
       forfra hver gang. */
    const l = linjerForPeriode(fuld);
    assert.deepEqual(
      l.map((x) => `${x.modul}/${x.akse}${x.brugerart ? "/" + x.brugerart : ""}`),
      [
        "platform/platform",
        "booking/basis", "bemanding/basis", "flaade/basis",
        "flaade/koeretoej",
        "platform/bruger/chauffoer", "platform/bruger/desktop",
      ]);
  });

  it("laegger platformsadgangen foerst, med antal 1", () => {
    const l = linjerForPeriode(fuld);
    const pf = l[0];
    assert.equal(pf.akse, "platform");
    assert.equal(pf.enheder, 1);
    assert.equal(pf.antal, ANTAL_SKALA);
    assert.equal(linjeBeloebOere(pf), 99500);
  });

  it("springer en sats på 0 over — den faktureres ikke", () => {
    /* desktop koster 0 i bemanding, chauffoer koster 0 i booking. En linje på
       nul kroner er støj på en faktura. */
    const l = linjerForPeriode(fuld);
    assert.ok(!l.some((x) => x.modul === "bemanding" && x.brugerart === "desktop"));
    assert.ok(!l.some((x) => x.modul === "flaade" && x.akse === "bruger"));
  });

  it("regner en fuld måned som antal = 1000 pr. enhed", () => {
    const l = linjerForPeriode(fuld);
    const basis = l.find((x) => x.modul === "flaade" && x.akse === "basis");
    assert.equal(basis.antal, ANTAL_SKALA);
    assert.equal(linjeBeloebOere(basis), 49500);

    const kt = l.find((x) => x.akse === "koeretoej");
    assert.equal(kt.antal, 14 * ANTAL_SKALA);
    assert.equal(linjeBeloebOere(kt), 14 * 2900);
  });

  it("lægger forholdsmæssigheden i antal, ikke i satsen", () => {
    /* ⚠ Regnede vi en dagspris ud, ville der afrundes PR. DAG, og 31 dage
       ville ikke give en hel måned tilbage. */
    const l = linjerForPeriode({ ...fuld, moduldage: { ...fuld.moduldage, bemanding: 19 } });
    const b = l.find((x) => x.modul === "bemanding" && x.akse === "basis");
    assert.equal(b.satsOere, 29500, "satsen er ændret — forholdet hører i antal");
    assert.equal(b.antal, Math.round((19 / 31) * ANTAL_SKALA));
    assert.equal(b.dage, 19);
  });

  it("udelader et modul kunden ikke havde i perioden", () => {
    const l = linjerForPeriode({ ...fuld, moduldage: { flaade: 31 } });
    const modulLinjer = l.filter((x) => x.modul !== PLATFORM);
    assert.deepEqual([...new Set(modulLinjer.map((x) => x.modul))], ["flaade"]);
  });
});

describe("Rabatten", () => {
  const grund = {
    prisliste: PRISLISTE,
    moduldage: { flaade: 31, bemanding: 31, booking: 31 },
    dageIPerioden: 31,
    antalBrugere: { chauffoer: 12, desktop: 4 },
    antalKoeretoejer: 14,
  };

  it("regnes ind i SATSEN, én gang", () => {
    /* ⚠ Lagde man den oven på linjebeløbet, ville der afrundes TO gange. */
    const l = linjerForPeriode({ ...grund, rabatBps: pctTilBps(15) });
    const basis = l.find((x) => x.modul === "flaade" && x.akse === "basis");
    assert.equal(basis.satsOere, rabatteretSatsOere(49500, 1500));
    assert.equal(basis.satsOere, 42075);
    assert.equal(basis.listeprisOere, 49500, "listeprisen mangler som dokumentation");
    assert.equal(basis.rabatBps, 1500);
  });

  it("summen af linjerne stemmer med totalen — med og uden rabat", () => {
    /* ⚠ DEN HER BÆRER KRAVET. Afrundes der to steder, afviger de to med et
       par øre, og så står der et tal på fakturaen der ikke kan genfindes.
       Kunden lægger linjerne sammen i hånden — det er præcis hvad man gør,
       når man er uenig. */
    for (const bps of [0, 1, 999, 1500, 3333, 9999, BPS_SKALA]) {
      const l = linjerForPeriode({ ...grund, rabatBps: bps });
      const t = abonnementstotaler(l);
      const sum = l.reduce((s, x) => s + linjeBeloebOere(x), 0);
      assert.equal(t.beloebOere, sum, `rabat ${bps}: total og linjesum er uenige`);
      const moms = l.reduce((s, x) => s + Math.round((linjeBeloebOere(x) * x.momssats) / 100), 0);
      assert.equal(t.momsOere, moms, `rabat ${bps}: momsen er uenig`);
      assert.equal(t.ialtOere, t.beloebOere + t.momsOere);
    }
  });

  it("100 % rabat giver nul, ikke en manglende linje", () => {
    /* Kunden skal kunne se hvad han IKKE betaler. En linje der forsvinder,
       ligner en fejl i faktureringen. */
    const l = linjerForPeriode({ ...grund, rabatBps: BPS_SKALA });
    assert.ok(l.length > 0);
    assert.equal(abonnementstotaler(l).beloebOere, 0);
  });

  it("klipper en urimelig rabat frem for at fakturere negativt", () => {
    assert.equal(rabatteretSatsOere(10000, 20000), 0, "over 100 % gav en negativ sats");
    assert.equal(rabatteretSatsOere(10000, -500), 10000, "negativ rabat hævede prisen");
  });
});

describe("Momsen gættes heller ikke her", () => {
  it("giver momsOere = null hvis prislisten mangler sin sats", () => {
    const uden = { ...PRISLISTE, momssats: undefined };
    const l = linjerForPeriode({
      prisliste: uden, moduldage: { flaade: 31 }, dageIPerioden: 31,
      antalKoeretoejer: 3,
    });
    assert.ok(l.length > 0);
    assert.equal(abonnementstotaler(l).momsOere, null);
    assert.equal(abonnementstotaler(l).ialtOere, null,
      "ialt blev regnet ud oven på en ukendt moms");
  });
});

describe("Aritmetikken deles med kundefaktureringen", () => {
  it("grundlag.js definerer den ikke selv", () => {
    /* ⚠ TO AFRUNDINGSREGLER I ÉT REPO er den fejl der bliver ved. grundlag.js
       importerer booking-state.js og kan ikke kopieres til functions/delt/,
       så aritmetikken blev flyttet til beloeb.js — som begge kan nå. */
    const kilde = readFileSync(new URL("../src/fleet/grundlag.js", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(kilde, /export const ANTAL_SKALA =/,
      "grundlag.js definerer ANTAL_SKALA igen.");
    assert.doesNotMatch(kilde, /export const linjeBeloebOere = /,
      "grundlag.js definerer linjeBeloebOere igen.");
    assert.match(kilde, /from "\.\/beloeb\.js"/);
  });
});

describe("Målingerne — højeste antal for perioden", () => {
  const maaling = (b, kt, moduler, status) => ({
    ms: 1, status, brugere: b, koeretoejer: kt, moduler,
  });
  const MOD = { flaade: true, bemanding: true };

  it("tager toppen, ikke slutantallet", () => {
    /* ⚠ HELE GRUNDEN TIL AT DER MAALES DAGLIGT. En kunde med 30 chauffører
       den 3. og 8 den 31. ville med et slutantal blive faktureret for 8. */
    const s = sammenfatMaalinger({
      "2026-08-03": maaling({ chauffoer: 30, desktop: 4 }, 20, MOD),
      "2026-08-17": maaling({ chauffoer: 12, desktop: 6 }, 14, MOD),
      "2026-08-31": maaling({ chauffoer: 8, desktop: 5 }, 12, MOD),
    });
    assert.equal(s.brugere.chauffoer, 30);
    assert.equal(s.koeretoejer, 20);
  });

  it("tager toppen PR. BRUGERART for sig", () => {
    /* De to toppe var aldrig der samtidig, og begge faktureres. Reglen står
       skrevet i sammenfatMaalinger() — alternativet ville give to kunder med
       samme forbrug forskellig pris afhængigt af rækkefølgen. */
    const s = sammenfatMaalinger({
      "2026-08-03": maaling({ chauffoer: 30, desktop: 1 }, 1, MOD),
      "2026-08-27": maaling({ chauffoer: 1, desktop: 9 }, 1, MOD),
    });
    assert.equal(s.brugere.chauffoer, 30);
    assert.equal(s.brugere.desktop, 9);
  });

  it("tæller moduldage som dage hvor modulet var slået til", () => {
    const s = sammenfatMaalinger({
      "2026-08-01": maaling({}, 0, { flaade: true }),
      "2026-08-02": maaling({}, 0, { flaade: true, bemanding: true }),
      "2026-08-03": maaling({}, 0, { bemanding: true }),
    });
    assert.deepEqual(s.moduldage, { flaade: 2, bemanding: 2 });
  });

  it("fakturerer ikke dage på pause", () => {
    /* ⚠ HER BLIVER PAUSE KOMMERCIEL. Beslutning 32 gjorde den teknisk. En
       pause der ikke fjerner en dag fra regningen, er ikke en pause. */
    const s = sammenfatMaalinger({
      "2026-08-01": maaling({ chauffoer: 5 }, 5, MOD, "aktiv"),
      "2026-08-02": maaling({ chauffoer: 99 }, 99, MOD, "paused"),
      "2026-08-03": maaling({ chauffoer: 5 }, 5, MOD, "opsagt"),
    });
    assert.equal(s.dageMaalt, 3);
    assert.equal(s.dageFaktureres, 1);
    assert.equal(s.brugere.chauffoer, 5, "en pauset dags top blev faktureret");
    assert.deepEqual(s.moduldage, { flaade: 1, bemanding: 1 });
  });

  it("behandler en manglende status som aktiv", () => {
    /* Samme retning som erAktiv() i abonnement.js — og som harModul(). */
    const s = sammenfatMaalinger({ "2026-08-01": maaling({ chauffoer: 3 }, 2, MOD) });
    assert.equal(s.dageFaktureres, 1);
  });

  it("tæller kun dage der ER målt", () => {
    /* ⚠ En kunde oprettet den 12. har ingen målinger før den 12. og skal
       ikke faktureres for dem. En dag hvor funktionen ikke kørte, ser ens ud
       — derfor returneres dageMaalt, saa forskellen kan SES. */
    const s = sammenfatMaalinger({
      "2026-08-12": maaling({ chauffoer: 2 }, 1, MOD),
      "2026-08-13": maaling({ chauffoer: 2 }, 1, MOD),
    });
    assert.equal(s.dageMaalt, 2);
    assert.equal(s.foersteDag, "2026-08-12");
    assert.equal(s.sidsteDag, "2026-08-13");
  });

  it("giver nul på ingen målinger — ikke en fejl", () => {
    const s = sammenfatMaalinger({});
    assert.equal(s.dageMaalt, 0);
    assert.deepEqual(s.moduldage, {});
    assert.equal(s.foersteDag, null);
  });

  it("datoen er UTC, som auditloggens partitioner", () => {
    assert.equal(maalingsdato(Date.UTC(2026, 7, 5, 23, 59)), "2026-08-05");
    assert.equal(maalingsdato(Date.UTC(2026, 0, 1, 0, 0)), "2026-01-01");
  });
});

describe("Fra målinger til linjer", () => {
  it("hænger sammen hele vejen", () => {
    const s = sammenfatMaalinger({
      "2026-08-01": { status: "aktiv", brugere: { chauffoer: 12, desktop: 4 },
                      koeretoejer: 14, moduler: { flaade: true, bemanding: true } },
      "2026-08-02": { status: "aktiv", brugere: { chauffoer: 15, desktop: 4 },
                      koeretoejer: 14, moduler: { flaade: true } },
    });
    const linjer = linjerForPeriode({
      prisliste: PRISLISTE,
      moduldage: s.moduldage,
      dageIPerioden: 31,
      antalBrugere: s.brugere,
      antalKoeretoejer: s.koeretoejer,
      rabatBps: 1000,
    });
    /* Flaade to dage, bemanding én — og chaufførtoppen er 15, ikke 12. */
    const ch = linjer.find((l) => l.akse === "bruger" && l.brugerart === "chauffoer");
    assert.equal(ch.enheder, 15);
    const bem = linjer.find((l) => l.modul === "bemanding" && l.akse === "basis");
    assert.equal(bem.dage, 1);
    const fl = linjer.find((l) => l.modul === "flaade" && l.akse === "basis");
    assert.equal(fl.dage, 2);

    const t = abonnementstotaler(linjer);
    const sum = linjer.reduce((x, l) => x + linjeBeloebOere(l), 0);
    assert.equal(t.beloebOere, sum);
  });
});

describe("Perioden", () => {
  it("regner UTC-graenser og laengde", () => {
    /* ⚠ UTC HELE VEJEN, som målingernes datoer. En blanding af UTC og lokal
       tid ville give 30 eller 32 dage i en måned med sommertidsskifte, og
       forholdsmæssigheden ville være forkert i netop de to måneder om året
       hvor ingen leder efter fejlen. */
    const p = periodeGraenser("2026-08");
    assert.equal(p.dage, 31);
    assert.equal(new Date(p.fra).toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(new Date(p.til).toISOString(), "2026-08-31T23:59:59.999Z");
  });

  it("kender februar og skudår", () => {
    assert.equal(periodeGraenser("2026-02").dage, 28);
    assert.equal(periodeGraenser("2028-02").dage, 29);
  });

  it("har 31 dage i marts og oktober — også med sommertidsskifte", () => {
    assert.equal(periodeGraenser("2026-03").dage, 31);
    assert.equal(periodeGraenser("2026-10").dage, 31);
  });

  it("afviser noget der ikke er en periode", () => {
    for (const p of ["2026", "2026-13", "august", "", null, "2026-8"]) {
      assert.equal(periodeGraenser(p), null, `${p} blev godtaget`);
    }
  });

  it("plukker kun periodens målinger ud", () => {
    const alle = {
      "2026-07-31": { ms: 1 }, "2026-08-01": { ms: 2 },
      "2026-08-31": { ms: 3 }, "2026-09-01": { ms: 4 },
    };
    assert.deepEqual(Object.keys(maalingerIPeriode(alle, "2026-08")),
      ["2026-08-01", "2026-08-31"]);
  });
});

describe("Momssatsen på abonnementet", () => {
  it("er fast 25 og står ÉT sted", () => {
    /* ⚠ DET SER UD SOM ET BRUD PÅ EN REGEL, OG DET ER DET IKKE.
       CLAUDE.md forbyder at gætte en momssats — men den regel gælder KUNDENS
       fakturagrundlag, hvor satsen faktisk varierer (udlandskørsel, omvendt
       betalingspligt, momsfri persontransport). Det her er FleetControls egen
       faktura til en dansk vognmand: 25 % hver gang.

       ⚠ FORUDSÆTNINGEN ER AT ALLE KUNDER ER DANSKE. Kommer den første
       udenlandske, skal satsen på KUNDEN — og så er det den her ene
       konstant der skal findes. */
    assert.equal(MOMSSATS, 25);
    const server = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
    assert.match(server, /momssats: MOMSSATS,/,
      "prislisteopret tager momssatsen fra nyttelasten i stedet for kataloget.");
    assert.doesNotMatch(server, /Number\(d\.momssats\)/,
      "momssatsen kan stadig sendes med fra klienten.");
  });

  it("valideres stadig som et tal mellem 0 og 100", () => {
    /* Datamodellen behøver ikke ændres den dag en udenlandsk kunde kommer. */
    assert.deepEqual(validerPrisliste(
      { gyldigFraMs: Date.UTC(2026, 0, 1), momssats: MOMSSATS, moduler: {}, platform: {} }), []);
    assert.ok(validerPrisliste({ gyldigFraMs: Date.UTC(2026, 0, 1), momssats: 120, moduler: {}, platform: {} }).length);
  });
});

describe("En gældende prisliste gælder fremad", () => {
  it("bliver ved indtil en NYERE tager over", () => {
    /* En liste lagt 1. januar gælder hele året, hvis der ikke kommer en ny. */
    const jan = Date.UTC(2026, 0, 1);
    const lister = { a: { gyldigFraMs: jan, momssats: 25 } };
    for (const m of [0, 3, 6, 11]) {
      const naar = Date.UTC(2026, m, 15);
      assert.equal(gaeldendePrisliste(lister, naar)?.id, "a",
        `listen gjaldt ikke i måned ${m + 1}`);
    }
    /* Og året efter. Den udløber ikke af sig selv. */
    assert.equal(gaeldendePrisliste(lister, Date.UTC(2028, 5, 1))?.id, "a");
  });

  it("viger for en nyere fra dens dato — ikke før", () => {
    const lister = {
      a: { gyldigFraMs: Date.UTC(2026, 0, 1), momssats: 25 },
      b: { gyldigFraMs: Date.UTC(2026, 6, 1), momssats: 25 },
    };
    assert.equal(gaeldendePrisliste(lister, Date.UTC(2026, 5, 30))?.id, "a");
    assert.equal(gaeldendePrisliste(lister, Date.UTC(2026, 6, 1))?.id, "b");
  });

  it("kender ingen slutdato — den regnes af naboen", () => {
    /* ⚠ Et gemt "gælder til" ville drive fra den næste liste. Skærmen regner
       den af rækkefølgen; feltet findes ikke, og må ikke komme til. */
    const regler = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
    assert.doesNotMatch(regler, /gyldigTilMs|gaelderTil/,
      "prislisten har fået en slutdato som felt — den skal regnes af naboen.");
  });
});

describe("Rabat pr. modul — og hvad der overruler hvad", () => {
  it("bruger modulets rabat når der ingen generel er", () => {
    assert.equal(rabatFor("flaade", { rabatBps: 0, rabatModulBps: { flaade: 1000 } }), 1000);
    assert.equal(rabatFor("bemanding", { rabatBps: 0, rabatModulBps: { flaade: 1000 } }), 0);
  });

  it("lader den GENERELLE overrule modulernes", () => {
    /* ⚠ REGLEN STÅR ÉT STED. Skrev skærmen sin egen udgave, ville den vise ét
       tal og serveren fakturere et andet — og det ville først blive opdaget
       når kunden lagde linjerne sammen. */
    const a = { rabatBps: 1500, rabatModulBps: { flaade: 500, bemanding: 9000 } };
    assert.equal(rabatFor("flaade", a), 1500);
    assert.equal(rabatFor("bemanding", a), 1500, "en STØRRE modulrabat vandt over den generelle");
    assert.equal(rabatFor("kunder", a), 1500);
  });

  it("lader modulerne træde i kraft igen når den generelle sættes til nul", () => {
    /* Modulrabatterne bliver stående. Det er forskellen på et tomt felt og et
       felt med et nul i, og den skal kunne mærkes. */
    const modul = { flaade: 500 };
    assert.equal(rabatFor("flaade", { rabatBps: 1500, rabatModulBps: modul }), 1500);
    assert.equal(rabatFor("flaade", { rabatBps: 0, rabatModulBps: modul }), 500);
  });

  it("slår igennem på linjerne", () => {
    const grund = {
      prisliste: PRISLISTE,
      moduldage: { flaade: 31, bemanding: 31 },
      dageIPerioden: 31,
      antalBrugere: { chauffoer: 10, desktop: 2 },
      antalKoeretoejer: 5,
    };
    const l = linjerForPeriode({ ...grund, rabatModulBps: { flaade: 2000 } });
    const fl = l.find((x) => x.modul === "flaade" && x.akse === "basis");
    const be = l.find((x) => x.modul === "bemanding" && x.akse === "basis");
    assert.equal(fl.rabatBps, 2000, "flåde fik ikke sin egen rabat");
    assert.equal(fl.satsOere, rabatteretSatsOere(49500, 2000));
    assert.equal(be.rabatBps, 0, "bemanding fik en rabat den ikke havde");
    assert.equal(be.satsOere, 29500);
  });

  it("holder linjesum og total sammen også med blandede rabatter", () => {
    /* Den vigtigste prøve i filen, nu med to satser i spil. */
    const l = linjerForPeriode({
      prisliste: PRISLISTE,
      moduldage: { flaade: 31, bemanding: 19, booking: 31 },
      dageIPerioden: 31,
      antalBrugere: { chauffoer: 13, desktop: 7 },
      antalKoeretoejer: 11,
      rabatModulBps: { flaade: 1234, booking: 777 },
    });
    const t = abonnementstotaler(l);
    assert.equal(t.beloebOere, l.reduce((s, x) => s + linjeBeloebOere(x), 0));
    /* Og linjerne bærer HVER sin sats — ikke én fælles. */
    assert.equal(new Set(l.map((x) => x.rabatBps)).size, 3);
  });

  it("ignorerer en rabat på et modul kunden ikke har", () => {
    /* Modulet er ikke i moduldage, så der er ingen linje at give rabat på.
       Aftalen bliver stående og træder i kraft den dag modulet tilvælges. */
    const l = linjerForPeriode({
      prisliste: PRISLISTE, moduldage: { flaade: 31 }, dageIPerioden: 31,
      antalKoeretoejer: 2, rabatModulBps: { bemanding: 5000 },
    });
    assert.ok(!l.some((x) => x.modul === "bemanding"));
  });
});

describe("gyldigFraMs skal være en dato, ikke bare et tal", () => {
  it("afviser 0 — det er 1. januar 1970", () => {
    /* ⚠ FUNDET AF MIN EGEN PROBE. Jeg kaldte prislisteopret med
       { gyldigFraMs: 0 } for at se om funktionen var åben, og den OPRETTEDE
       en prisliste. Number.isFinite(0) er sandt, og tjekket spurgte kun om
       værdien var et tal.

       En liste fra 1970 vinder over ingenting og står først i enhver
       sortering — den ville have været den gældende for enhver periode uden
       en nyere. */
    const f = validerPrisliste({ gyldigFraMs: 0, momssats: MOMSSATS, moduler: {}, platform: {} });
    assert.ok(f.some((x) => /dato/i.test(x)), "0 blev godtaget som en dato");
  });

  it("afviser en dato før FleetControl fandtes og langt ude i fremtiden", () => {
    for (const ms of [Date.UTC(2019, 11, 31), Date.UTC(2101, 0, 1), -1]) {
      assert.ok(
        validerPrisliste({ gyldigFraMs: ms, momssats: MOMSSATS, moduler: {}, platform: {} })
          .some((x) => /dato/i.test(x)),
        `${new Date(ms).toISOString()} blev godtaget`);
    }
  });

  it("godtager en rigtig dato", () => {
    assert.deepEqual(
      validerPrisliste({ gyldigFraMs: Date.UTC(2026, 8, 1), momssats: MOMSSATS, moduler: {}, platform: {} }),
      []);
  });
});

describe("Frimængden — og hvorfor nul-linjen bliver stående", () => {
  const grund = {
    prisliste: PRISLISTE,
    moduldage: { flaade: 31 },
    dageIPerioden: 31,
    antalKoeretoejer: 0,
  };

  it("fakturerer kun det der ligger UD OVER frimængden", () => {
    /* 5 desktopbrugere, 3 inkluderet → der betales for 2. */
    const l = linjerForPeriode({ ...grund, antalBrugere: { chauffoer: 0, desktop: 5 } });
    const d = l.find((x) => x.brugerart === "desktop");
    assert.equal(d.enheder, 5, "det målte antal er ikke bevaret");
    assert.equal(d.inkluderet, 3);
    assert.equal(d.fakturerbare, 2);
    assert.equal(linjeBeloebOere(d), 2 * 14900);
  });

  it("giver 0 kr. når antallet ligger inden for frimængden", () => {
    const l = linjerForPeriode({ ...grund, antalBrugere: { chauffoer: 0, desktop: 1 } });
    const d = l.find((x) => x.brugerart === "desktop");
    assert.equal(d.enheder, 1);
    assert.equal(d.inkluderet, 3);
    assert.equal(linjeBeloebOere(d), 0);
  });

  it("VISER linjen selv om den er nul — beslutning 36", () => {
    /* ⚠ DEN HER VENDER EN TIDLIGERE BESLUTNING. Nul-linjer blev sprunget over
       som støj. Men "1 · 3 inkluderet" til 0 kr. DOKUMENTERER at der blev
       målt — uden linjen kan kunden ikke se forskel på at målingen var nul og
       at den manglede. */
    for (const antal of [0, 1, 3]) {
      const l = linjerForPeriode({ ...grund, antalBrugere: { chauffoer: 0, desktop: antal } });
      const d = l.find((x) => x.brugerart === "desktop");
      assert.ok(d, `linjen forsvandt ved ${antal} brugere`);
      assert.equal(linjeBeloebOere(d), 0);
    }
  });

  it("viser også en brugerart uden frimængde og uden brugere", () => {
    const l = linjerForPeriode({ ...grund, antalBrugere: { chauffoer: 0, desktop: 0 } });
    const c = l.find((x) => x.brugerart === "chauffoer");
    assert.ok(c, "chaufførlinjen forsvandt — så kan man ikke se at der blev målt");
    assert.equal(c.enheder, 0);
    assert.equal(linjeBeloebOere(c), 0);
  });

  it("regner rabatten på det der faktisk faktureres", () => {
    /* Rabatten sidder i SATSEN; frimængden i antallet. De to må ikke
       forveksles — ellers ville en rabat give penge tilbage for en gratis
       bruger. */
    const l = linjerForPeriode({
      ...grund, antalBrugere: { chauffoer: 0, desktop: 5 }, rabatBps: 1000,
    });
    const d = l.find((x) => x.brugerart === "desktop");
    assert.equal(d.satsOere, rabatteretSatsOere(14900, 1000));
    assert.equal(linjeBeloebOere(d), 2 * rabatteretSatsOere(14900, 1000));
  });

  it("overFrimaengde går aldrig under nul", () => {
    assert.equal(overFrimaengde(1, 3), 0);
    assert.equal(overFrimaengde(5, 3), 2);
    assert.equal(overFrimaengde(0, 0), 0);
  });

  it("holder linjesum og total sammen — også med nul-linjer", () => {
    const l = linjerForPeriode({
      ...grund, antalBrugere: { chauffoer: 2, desktop: 1 }, rabatBps: 1500,
    });
    const t = abonnementstotaler(l);
    assert.equal(t.beloebOere, l.reduce((s, x) => s + linjeBeloebOere(x), 0));
    assert.ok(l.some((x) => linjeBeloebOere(x) === 0), "der er ingen nul-linje at prøve på");
  });
});

describe("Platformsadgangen er ikke dashboard-modulet", () => {
  it("har sit eget id, som ikke er et modul", () => {
    /* ⚠ Et katalogpunkt der både er en skærmsektion og en prislinje, er én
       ting med to betydninger. Se noten ved PLATFORM. */
    assert.equal(PLATFORM, "platform");
    assert.ok(!VALGFRIE_MODULER.includes(PLATFORM));
  });

  it("kan ikke få en modulrabat — kun den generelle", () => {
    /* rabatModulBps valideres mod modulkataloget, så "platform" kan ikke stå
       der. Den generelle rammer den som alt andet. */
    assert.equal(rabatFor(PLATFORM, { rabatBps: 0, rabatModulBps: { platform: 5000 } }), 5000,
      "rabatFor kender ikke forskel — men reglerne afviser nøglen, se rules-prøven");
    assert.equal(rabatFor(PLATFORM, { rabatBps: 1500, rabatModulBps: {} }), 1500);
  });
});
