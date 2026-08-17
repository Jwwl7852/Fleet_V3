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
import {
  METODER, YDELSESKATEGORI, LAGERYDELSER, ALLE_LAGERYDELSER,
  IKKE_FAKTURERBARE_ARTER, ydelseForArt,
  STANDARDGRUPPE, standardPris, valideSats, ydelserForModuler,
  kundeprisSti, valideKundesats, kundeSats, prisFor, PRISKILDE,
  prisydelseForArter, satsopslag, beregnBooking,
} from "../src/fleet/pricing.js";
import {
  ALLE_BEVAEGELSE_ARTER, IKKE_AFREGNEDE_ARTER, afregningslinjer,
} from "../src/fleet/warehouse.js";
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
import { VALGFRIE_MODULER, modulerFor } from "../src/fleet/moduler.js";
import { omkostningsark, valideOmkostning } from "../src/fleet/omkostninger.js";
import { DEMO_OMKOSTNINGER } from "../src/fleet/demo-omkostninger.js";

/* ⚠ BRUGERPRISEN LIGGER PAA PLATFORMEN, ikke paa modulerne. Fakturaen har ÉN
   linje pr. brugerart, og en linje kan kun have ÉN stk.pris — den kan ikke
   vaere summen af fire modulers satser. Se tomPlatform() i priser.js. */
const PRISLISTE = {
  gyldigFraMs: Date.UTC(2026, 0, 1),
  momssats: 25,
  platform: {
    basisOere: 99500,
    /* ⚠ KUN FRIMAENGDEN. Prisen pr. bruger staar paa modulet. */
    inkluderetBrugere: { chauffoer: 0, desktop: 3 },
  },
  moduler: {
    flaade: { basisOere: 49500, prKoeretoejOere: 2900 },
    bemanding: { basisOere: 29500, prBrugerOere: { chauffoer: 4900, desktop: 0 } },
    booking: { basisOere: 79500, prBrugerOere: { chauffoer: 0, desktop: 14900 } },
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
  it("kan laves tom med alle fire satser pr. modul", () => {
    const t = tomPrisliste(VALGFRIE_MODULER);
    assert.deepEqual(Object.keys(t).sort(), [...VALGFRIE_MODULER].sort());
    for (const m of VALGFRIE_MODULER) {
      assert.deepEqual(Object.keys(t[m]).sort(),
        ["basisOere", "prBrugerOere", "prKoeretoejOere"]);
      assert.deepEqual(Object.keys(t[m].prBrugerOere).sort(), [...ALLE_BRUGERARTER].sort());
    }
  });

  it("har en platform med grundbeloeb og frimaengde — men ingen brugerpris", () => {
    /* ⚠ Prisen pr. bruger staar paa MODULET; frimaengden hoerer til
       ABONNEMENTET. Stod prisen begge steder, var der to at rette. */
    const pf = tomPlatform();
    assert.ok(!pf.prBrugerOere, "platformen har faaet en brugerpris igen");
    assert.deepEqual(Object.keys(pf.inkluderetBrugere).sort(), [...ALLE_BRUGERARTER].sort());
  });

  it("afviser en brugerpris paa PLATFORMEN", () => {
    const f = validerPrisliste({
      ...PRISLISTE,
      platform: { ...PRISLISTE.platform, prBrugerOere: { desktop: 100 } },
    }, { kendteModuler: VALGFRIE_MODULER });
    assert.ok(f.some((x) => /modulet/.test(x)), "en brugerpris paa platformen blev godtaget");
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
      moduler: { flaade: { prBrugerOere: { fritter: 100 } } },
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
        "bemanding/bruger/chauffoer", "booking/bruger/desktop",
        "flaade/koeretoej",
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
  /* ⚠ MODULERNE DER BAERER BRUGERPRISEN SKAL VAERE MED. Brugerlinjen hoerer
     nu til det modul der har satsen — bemanding pr. medarbejder, booking pr.
     desktopbruger — saa en fixtur med kun flaade ville proeve noget andet. */
  const grund = {
    prisliste: PRISLISTE,
    moduldage: { flaade: 31, bemanding: 31, booking: 31 },
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

describe("ydelseskataloget — hvad der kan prissættes", () => {
  it("har en metode for hver ydelse, og metoden findes", () => {
    /* ⚠ ELLERS VILLE EN YDELSE HAVE EN PRIS uden at nogen vidste hvad `antal`
       skulle ganges med. Metoden er dét der gør en sats til et beløb. */
    for (const [id, y] of Object.entries(LAGERYDELSER)) {
      assert.ok(METODER[y.metode], `${id} har metoden ${y.metode}, som ikke findes`);
      assert.ok(YDELSESKATEGORI[y.kategori], `${id} har en ukendt kategori`);
      assert.ok(y.navn?.length, `${id} mangler et navn`);
    }
  });

  it("⚠ HÅNDTERING IND OG UD ER TO YDELSER", () => {
    /* De regnes ens, men de koster ikke det samme: at tage imod en palle og
       at sende den ud er to arbejdsgange. Én fælles "håndtering" ville gøre
       det umuligt at prissætte dem forskelligt. */
    assert.notEqual(LAGERYDELSER["lager-handlingInd"], LAGERYDELSER["lager-handlingUd"]);
    assert.deepEqual(LAGERYDELSER["lager-handlingInd"].arter, ["modtag"]);
    assert.deepEqual(LAGERYDELSER["lager-handlingUd"].arter, ["afsend"]);
    assert.equal(LAGERYDELSER["lager-handlingInd"].metode,
                 LAGERYDELSER["lager-handlingUd"].metode);
  });

  it("⚠ AFREGNER IKKE EN OPTÆLLING", () => {
    /* Optælling og justering er vores kontrol af vores eget arbejde. Kunne de
       afregnes, ville en optælling være en indtægt — og så blev der talt af de
       forkerte grunde. */
    for (const art of IKKE_FAKTURERBARE_ARTER) {
      assert.equal(ydelseForArt(art), null, `${art} er blevet fakturerbar`);
    }
    assert.equal(ydelseForArt("modtag"), "lager-handlingInd");
    assert.equal(ydelseForArt("afsend"), "lager-handlingUd");
    assert.equal(ydelseForArt("flyt"), "lager-flytning");
    assert.equal(ydelseForArt("putaway"), "lager-flytning");
    assert.equal(ydelseForArt(null), null);
    assert.equal(ydelseForArt("findes-ikke"), null);
  });

  it("dækker hver bevægelsesart præcis én gang", () => {
    /* ⚠ TO YDELSER PÅ SAMME ART ville betyde at den samme håndtering blev
       faktureret to gange, og hvilken der vandt, ville afhænge af
       rækkefølgen i objektet. */
    const set = new Set();
    for (const [id, y] of Object.entries(LAGERYDELSER)) {
      for (const a of y.arter || []) {
        assert.ok(!set.has(a), `arten ${a} dækkes af mere end én ydelse (${id})`);
        set.add(a);
      }
    }
    /* Og hver art i Warehouse er enten dækket eller eksplicit undtaget. */
    for (const a of ALLE_BEVAEGELSE_ARTER) {
      assert.ok(set.has(a) || IKKE_FAKTURERBARE_ARTER.includes(a),
        `bevægelsesarten ${a} er hverken prissat eller undtaget`);
    }
  });

  it("⚠ OPBEVARINGSYDELSERNE HAR INGEN ARTER", () => {
    /* De regnes ikke af bevægelser, men af hvad der STÅR på lageret pr. døgn
       — og den måling kan ikke laves bagud. */
    assert.equal(LAGERYDELSER["lager-palleplads"].arter, null);
    assert.equal(LAGERYDELSER["lager-kubik"].arter, null);
    assert.equal(METODER[LAGERYDELSER["lager-palleplads"].metode].enhed, "palledøgn");
  });

  it("bruger den samme liste over ikke-fakturerbare arter som Warehouse", () => {
    /* ⚠ TO LISTER VILLE DRIVE. warehouse.js er importfri og kan ikke importere
       pricing.js — så prøven binder dem i stedet, som med MAENGDE_SKALA. */
    assert.deepEqual(IKKE_FAKTURERBARE_ARTER, IKKE_AFREGNEDE_ARTER);
  });
});

describe("standardprisen", () => {
  const D = (d) => Date.UTC(2026, 5, d);
  const NU = D(20);

  it("⚠ LIGGER I `satser`, IKKE I EN NY NODE", () => {
    /* Noden har eksisteret siden beslutning 7 med sit gyldigFra-indeks og sin
       satser.skriv-permission — den har bare aldrig haft noget i sig, fordi
       satsarket stod som en const i Bookingopsaetning.jsx. En ny node ville
       være et fjerde sted priser bor. */
    assert.equal(STANDARDGRUPPE, "standard");
    const regler = readFileSync("firebase.rules.json", "utf8");
    assert.ok(!regler.includes('"standardpriser"'),
      "der er oprettet en standardpriser-node ved siden af satser");
  });

  it("slår prisen op gennem satsPaa()", () => {
    const std = {
      "lager-handlingInd": {
        satser: {
          a: { gyldigFra: D(1), beloebOere: 4500 },
          b: { gyldigFra: D(15), beloebOere: 5000 },
        },
      },
    };
    assert.equal(standardPris(std, "lager-handlingInd", D(10)).beloebOere, 4500);
    assert.equal(standardPris(std, "lager-handlingInd", D(20)).beloebOere, 5000);
  });

  it("⚠ GIVER null NÅR PRISEN MANGLER — ikke 0", () => {
    /* En ydelse uden pris er et ubesvaret spørgsmål, ikke en gratis ydelse.
       Samme regel som momssatsen der mangler. */
    assert.equal(standardPris({}, "lager-pluk", NU), null);
    assert.equal(standardPris({ "lager-pluk": { satser: {} } }, "lager-pluk", NU), null);
    /* Og før den første sats gjaldt der ingen. */
    const std = { "lager-pluk": { satser: { a: { gyldigFra: D(15), beloebOere: 375 } } } };
    assert.equal(standardPris(std, "lager-pluk", D(1)), null);
  });

  it("tager både et array og et objekt af satser", () => {
    /* useListe() giver et array; en rå RTDB-læsning giver et objekt. En
       funktion der kun tålte det ene, ville virke i én skærm og fejle i den
       næste. */
    const somObjekt = { x: { satser: { a: { gyldigFra: D(1), beloebOere: 100 } } } };
    const somArray = { x: { satser: [{ gyldigFra: D(1), beloebOere: 100 }] } };
    assert.equal(standardPris(somObjekt, "x", NU).beloebOere, 100);
    assert.equal(standardPris(somArray, "x", NU).beloebOere, 100);
  });

  it("afviser et beløb der ikke er hele ører", () => {
    assert.ok(valideSats({ gyldigFra: NU, beloebOere: 45.5 }, { nu: NU }).beloebOere);
    assert.ok(valideSats({ gyldigFra: NU, beloebOere: -1 }, { nu: NU }).beloebOere);
    assert.deepEqual(valideSats({ gyldigFra: NU, beloebOere: 4500 }, { nu: NU }), {});
    /* Nul er en gyldig pris — en ydelse KAN være gratis, når nogen har
       besluttet det. Det er den manglende pris der er problemet. */
    assert.deepEqual(valideSats({ gyldigFra: NU, beloebOere: 0 }, { nu: NU }), {});
  });

  it("afviser en dato der ikke giver mening", () => {
    assert.ok(valideSats({ gyldigFra: Date.UTC(1999, 0, 1), beloebOere: 1 }, { nu: NU }).gyldigFra);
    assert.ok(valideSats({ gyldigFra: NU + 20 * 365 * 86400000, beloebOere: 1 }, { nu: NU }).gyldigFra);
    assert.ok(valideSats({ beloebOere: 1 }, { nu: NU }).gyldigFra);
  });

  it("afviser en ukendt metode og en ugyldig valuta", () => {
    assert.ok(valideSats({ gyldigFra: NU, beloebOere: 1, metode: "prTime" }, { nu: NU }).metode);
    assert.ok(valideSats({ gyldigFra: NU, beloebOere: 1, valuta: "dkk" }, { nu: NU }).valuta);
    assert.deepEqual(
      valideSats({ gyldigFra: NU, beloebOere: 1, metode: "prHaandtering", valuta: "DKK" }, { nu: NU }), {});
  });

  it("⚠ VISER KUN YDELSER FRA MODULER KUNDEN HAR", () => {
    /* Prisskærmen ville ellers bede om tal for noget vognmanden ikke har
       købt — og de tal ville stå der og se ud som en aftale. */
    const uden = ydelserForModuler({ booking: true, warehouse: false });
    assert.equal(uden.length, 0, "lagerydelser vises uden Warehouse");
    const med = ydelserForModuler({ warehouse: true });
    assert.equal(med.length, ALLE_LAGERYDELSER.length);
    /* En tenant uden modulliste har alt — samme regel som harModul(). */
    assert.equal(ydelserForModuler(undefined).length, ALLE_LAGERYDELSER.length);
  });
});

describe("kundens afvigelse", () => {
  const D = (d) => Date.UTC(2026, 5, d);
  const NU = D(20);

  /* Standardprisen på pluk: 375,00 kr fra den 1., 400,00 kr fra den 15. */
  const STANDARD = {
    "lager-pluk": {
      satser: {
        a: { gyldigFra: D(1), beloebOere: 37500 },
        b: { gyldigFra: D(15), beloebOere: 40000 },
      },
    },
    "lager-handlingInd": { satser: { a: { gyldigFra: D(1), beloebOere: 4500 } } },
  };

  it("stien bygges ét sted", () => {
    /* ⚠ ET YDELSES-ID ER EN DATABASENOEGLE, og stien skal se ens ud fra
       skærmen og fra en prøve. Bygget af strenge to steder driver den. */
    assert.equal(kundeprisSti("k7", "lager-pluk", "s1"),
      "kunder/k7/priser/lager-pluk/satser/s1");
  });

  it("ingen afvigelse giver standardprisen", () => {
    const r = prisFor({ standard: STANDARD, kunde: {} }, "lager-pluk", NU);
    assert.equal(r.oere, 40000);
    assert.equal(r.kilde, "standard");
  });

  it("kundens egen pris slår standarden", () => {
    const kunde = { "lager-pluk": { satser: { x: { gyldigFra: D(10), beloebOere: 32500 } } } };
    const r = prisFor({ standard: STANDARD, kunde }, "lager-pluk", NU);
    assert.equal(r.oere, 32500);
    assert.equal(r.kilde, "kunde");
    /* Standarden står stadig ved siden af. En pris man ikke kan se
       afvigelsen fra, kan ikke forhandles. */
    assert.equal(r.standardOere, 40000);
  });

  it("rabatten regnes af den standard der gjaldt PÅ TIDSPUNKTET", () => {
    const kunde = { "lager-pluk": { satser: { x: { gyldigFra: D(1), rabatBps: 1500 } } } };
    /* Den 10.: 375,00 − 15 % = 318,75 */
    assert.equal(prisFor({ standard: STANDARD, kunde }, "lager-pluk", D(10)).oere, 31875);
    /* Den 20.: 400,00 − 15 % = 340,00. Samme rabat, ny standard — og det er
       hele pointen med at rabatten er en PROCENT og ikke et beløb. */
    const r = prisFor({ standard: STANDARD, kunde }, "lager-pluk", D(20));
    assert.equal(r.oere, 34000);
    assert.equal(r.kilde, "rabat");
    assert.equal(r.rabatBps, 1500);
  });

  it("rabatten går gennem rabatteretSatsOere() — ikke en egen procentregning", () => {
    /* ⚠ EN PROCENTREGNING MERE VILLE VÆRE EN AFRUNDINGSREGEL MERE.
       Prøven binder de to sammen: ændres afrundingen ét sted, falder den. */
    const kunde = { p: { satser: { x: { gyldigFra: D(1), rabatBps: 3333 } } } };
    const standard = { p: { satser: { a: { gyldigFra: D(1), beloebOere: 9999 } } } };
    assert.equal(prisFor({ standard, kunde }, "p", NU).oere,
      rabatteretSatsOere(9999, 3333));
  });

  it("⚠ EN RABAT PÅ EN PRIS DER IKKE FINDES, ER null — ikke 0", () => {
    /* 15 % af ingenting er ikke nul kroner; det er det samme ubesvarede
       spørgsmål med et tal foran. Regnede vi den til 0, ville en glemt
       standardpris blive til en GRATIS ydelse hos præcis den kunde der havde
       forhandlet sig til en rabat. */
    const kunde = { "lager-flytning": { satser: { x: { gyldigFra: D(1), rabatBps: 1500 } } } };
    assert.equal(prisFor({ standard: STANDARD, kunde }, "lager-flytning", NU), null);
  });

  it("ingen standard og ingen afvigelse giver null", () => {
    assert.equal(prisFor({ standard: {}, kunde: {} }, "lager-pluk", NU), null);
    assert.equal(prisFor(undefined, "lager-pluk", NU), null);
  });

  it("en afvigelse gælder først fra sin egen dato", () => {
    /* Indtil da er det standarden der gælder — ikke ingenting. */
    const kunde = { "lager-pluk": { satser: { x: { gyldigFra: D(18), beloebOere: 1 } } } };
    assert.equal(prisFor({ standard: STANDARD, kunde }, "lager-pluk", D(17)).kilde, "standard");
    assert.equal(prisFor({ standard: STANDARD, kunde }, "lager-pluk", D(18)).kilde, "kunde");
  });

  it("den nyeste afvigelse vinder — den gamle bliver stående", () => {
    /* Beslutning 7 gælder også her: en rettelse er en ny post. */
    const kunde = {
      "lager-pluk": {
        satser: {
          gammel: { gyldigFra: D(1), rabatBps: 1000 },
          ny: { gyldigFra: D(15), beloebOere: 30000 },
        },
      },
    };
    assert.equal(kundeSats(kunde, "lager-pluk", D(10)).rabatBps, 1000);
    assert.equal(prisFor({ standard: STANDARD, kunde }, "lager-pluk", NU).oere, 30000);
  });

  it("tager både et array og et objekt af satser", () => {
    const somArray = { p: { satser: [{ gyldigFra: D(1), beloebOere: 100 }] } };
    assert.equal(kundeSats(somArray, "p", NU).beloebOere, 100);
  });

  it("hver kilde har en label — tallet står aldrig alene", () => {
    /* En pris man ikke kan se oprindelsen af, kan ikke forklares over for
       kunden. Derfor er kilden en del af svaret, ikke noget skærmen gætter. */
    for (const kilde of ["kunde", "rabat", "standard"]) {
      assert.ok(PRISKILDE[kilde]?.label, `kilden "${kilde}" har ingen label`);
    }
  });
});

describe("valideringen af en kundesats", () => {
  const NU = Date.UTC(2026, 5, 20);
  const v = (post) => valideKundesats(post, { nu: NU });

  it("⚠ AFVISER BÅDE EN EGEN PRIS OG EN RABAT PÅ SAMME POST", () => {
    /* To felter der begge kan sætte prisen, er to svar på samme spørgsmål —
       og så bliver det tilfældigt hvilket der vinder. Reglen står også i
       firebase.rules.json; formularen svarer hurtigt, reglerne afgør. */
    assert.ok(v({ gyldigFra: NU, beloebOere: 100, rabatBps: 1500 }).form);
    assert.ok(v({ gyldigFra: NU }).form);
    assert.deepEqual(v({ gyldigFra: NU, beloebOere: 100 }), {});
    assert.deepEqual(v({ gyldigFra: NU, rabatBps: 1500 }), {});
  });

  it("accepterer nul kroner og nul rabat", () => {
    /* Nul er en beslutning om at noget er gratis. Det er den MANGLENDE pris
       der er det ubesvarede spørgsmål. */
    assert.deepEqual(v({ gyldigFra: NU, beloebOere: 0 }), {});
    assert.deepEqual(v({ gyldigFra: NU, rabatBps: 0 }), {});
  });

  it("afviser en rabat uden for 0–100 % og en der ikke er hele basispoint", () => {
    assert.ok(v({ gyldigFra: NU, rabatBps: BPS_SKALA + 1 }).rabatBps);
    assert.ok(v({ gyldigFra: NU, rabatBps: -1 }).rabatBps);
    assert.ok(v({ gyldigFra: NU, rabatBps: 1500.5 }).rabatBps);
    assert.deepEqual(v({ gyldigFra: NU, rabatBps: BPS_SKALA }), {});
  });

  it("arver datoreglerne fra standardprisen", () => {
    assert.ok(v({ beloebOere: 100 }).gyldigFra);
    assert.ok(v({ gyldigFra: Date.UTC(1999, 0, 1), rabatBps: 100 }).gyldigFra);
    assert.ok(v({ gyldigFra: NU + 20 * 365 * 86400000, rabatBps: 100 }).gyldigFra);
  });

  it("afviser et beløb der ikke er hele ører", () => {
    assert.ok(v({ gyldigFra: NU, beloebOere: 45.5 }).beloebOere);
    assert.ok(v({ gyldigFra: NU, beloebOere: -1 }).beloebOere);
  });

  it("15 % skrives som 1500 — samme skala som ejerkonsollen", () => {
    assert.equal(pctTilBps(15), 1500);
    assert.deepEqual(v({ gyldigFra: NU, rabatBps: pctTilBps(15) }), {});
  });
});

describe("ydelses-id'et er en databasenøgle", () => {
  it("⚠ INDEHOLDER HVERKEN PUNKTUM ELLER ANDRE ULOVLIGE TEGN", () => {
    /* Standardprisen ligger på `satser/standard/<ydelseId>/satser/<id>`, og
       RTDB tillader hverken . # $ [ ] eller / i en nøgle. Id'erne hed
       `lager.handlingInd`, og hver eneste skrivning fejlede med "invalid
       path" — et helt andet sted end der hvor navnet blev valgt.

       Fælden står allerede beskrevet ved BATCH_MOENSTER i warehouse.js. Den
       her prøve findes fordi jeg gik i den alligevel, og fordi kun en probe
       mod den udrullede base fandt den: build og prøver var grønne. */
    for (const id of ALLE_LAGERYDELSER) {
      assert.ok(!/[.#$[\]/]/.test(id),
        `ydelses-id'et "${id}" kan ikke være en RTDB-nøgle`);
      assert.ok(id.length > 0 && id.length <= 60, `"${id}" har en urimelig længde`);
    }
  });
});

describe("én opslagsvej — fra afregning til pris", () => {
  const D = (d) => Date.UTC(2026, 5, d);
  const STANDARD = {
    "lager-pluk": { satser: { a: { gyldigFra: D(1), beloebOere: 37500 } } },
    "lager-flytning": { satser: { a: { gyldigFra: D(1), beloebOere: 12000 } } },
    "lager-handlingInd": { satser: { a: { gyldigFra: D(1), beloebOere: 4500 } } },
  };
  /* Afregningskatalogets arter, som warehouse.js kender dem. */
  const ARTER = {
    modtagelse: ["modtag"],
    haandtering: ["putaway", "flyt"],
    pluk: ["pluk"],
    afsendelse: ["afsend"],
    retur: ["retur"],
  };
  const arterFor = (y) => ARTER[y];

  it("⚠ BROEN MELLEM DE TO KATALOGER ER ARTEN, IKKE EN TABEL", () => {
    /* pricing.js siger hvad der kan PRISSÆTTES, warehouse.js hvad der kan
       AFREGNES. De kan ikke importere hinanden, og en håndskrevet
       oversættelse ville være det syvende sted hvor to lister skulle holdes i
       sync i hånden. */
    assert.equal(prisydelseForArter(["modtag"]), "lager-handlingInd");
    assert.equal(prisydelseForArter(["putaway", "flyt"]), "lager-flytning");
    assert.equal(prisydelseForArter(["pluk"]), "lager-pluk");
    assert.equal(prisydelseForArter(["afsend"]), "lager-handlingUd");
  });

  it("⚠ ET TVETYDIGT OPSLAG GIVER INGEN PRIS", () => {
    /* Peger to arter på hver sin prisydelse, kan opslaget ikke afgøre hvilken
       der gælder — og et gæt ville fakturere en pris ingen kan forklare. */
    assert.equal(prisydelseForArter(["modtag", "afsend"]), null);
    assert.equal(prisydelseForArter([]), null);
    /* En art der ikke må afregnes, giver heller ingen ydelse. */
    assert.equal(prisydelseForArter(["optael"]), null);
  });

  it("slår kundens pris op gennem prisFor()", () => {
    const kunde = { "lager-pluk": { satser: { x: { gyldigFra: D(1), rabatBps: 2000 } } } };
    const satsFor = satsopslag({ standard: STANDARD, kunde, arterFor });

    /* Standard hvor der ikke er en aftale … */
    assert.deepEqual(satsFor("haandtering", D(20)), {
      beloebOere: 12000, gyldigFra: D(1), kilde: "standard", ydelseId: "lager-flytning",
    });
    /* … og den rabatterede sats hvor der er. 375,00 − 20 % = 300,00 */
    const p = satsFor("pluk", D(20));
    assert.equal(p.beloebOere, 30000);
    assert.equal(p.kilde, "rabat");
  });

  it("⚠ EN YDELSE UDEN PRIS GIVER null — ikke nul", () => {
    /* Linjen kommer stadig med på afregningen, med satsOere: null. Udelod vi
       den, ville fakturaen se komplet ud mens en ydelse manglede sin pris. */
    const satsFor = satsopslag({ standard: STANDARD, kunde: {}, arterFor });
    assert.equal(satsFor("retur", D(20)), null);
  });

  it("kræver broen — den gætter ikke på arter", () => {
    assert.throws(() => satsopslag({ standard: STANDARD, kunde: {} }),
      /arterFor/);
  });

  it("⚠ KILDEN FØLGER MED PÅ LINJEN", () => {
    /* En pris på en faktura man ikke kan spore, er en pris man ikke kan
       forsvare. `afregningslinjer()` skriver feltet videre — prøven binder de
       to, så et opslag uden kilde ikke lydløst giver en linje uden. */
    const kunde = { "lager-flytning": { satser: { x: { gyldigFra: D(1), beloebOere: 9900 } } } };
    const satsFor = satsopslag({ standard: STANDARD, kunde, arterFor });
    const linjer = afregningslinjer({
      bevaegelser: [
        { art: "flyt", kundeId: "k1", tidspunktMs: D(10), antal: 1000 },
        { art: "putaway", kundeId: "k1", tidspunktMs: D(11) },
      ],
      satsFor, kundeId: "k1", fra: D(1), til: D(30),
    });
    const h = linjer.find((l) => l.ydelse === "haandtering");
    assert.equal(h.satsOere, 9900);
    assert.equal(h.kilde, "kunde");
    assert.equal(h.haendelser, 2, "placeringen tæller som en håndtering");
  });

  it("⚠ EN PLACERING SKAL BÆRE SIN KUNDE FOR AT KUNNE AFREGNES", () => {
    /* afregningslinjer() filtrerer på kundeId. En placering uden ville aldrig
       komme på en faktura — arbejdet ville være gratis uden at nogen havde
       besluttet det. Serveren skriver den af BEHOLDEREN; se functions. */
    const cf = readFileSync("functions/index.js", "utf8");
    const start = cf.indexOf("async function skrivPlacering");
    const blok = cf.slice(start, cf.indexOf("async function logBevaegelse", start));
    assert.ok(blok.includes("kundeId: carrier.kundeId"),
      "placeringen skrives uden en kunde og kan derfor ikke afregnes");
  });
});

describe("omkostningsarket ud af JSX-filen", () => {
  const KT = [
    { id: "kt-012", navn: "Volvo FH 500", registrering: "DE 12 345" },
    { id: "kt-b12", navn: "Volvo 9700 turistbus", registrering: "DE 22 111" },
  ];

  it("⚠ OMKOSTNINGER ER IKKE PRISER — to noder", () => {
    /* `satser` er hvad KUNDEN betaler; `omkostninger` er hvad turen koster
       os. Beslutning 11 findes for den forskel: driftsomkostning pr. km er
       ikke kalkulationspris pr. km. Lå de i samme node, ville en sum blande
       indtægt og udgift, og ingen ville kunne se det på tallet. */
    const regler = readFileSync("firebase.rules.json", "utf8");
    assert.ok(regler.includes('"omkostninger": {'), "noden findes ikke i reglerne");
    assert.deepEqual(modulerFor("omkostninger"), ["booking"]);
    assert.deepEqual(modulerFor("satser"), [], "satser hører ikke til ét modul");
  });

  it("bygger satsarket i den form prismotoren allerede kender", () => {
    /* ⚠ PRISMOTOREN ER IKKE LAVET OM. Formen — biler, poster, agenter — er
       uændret; det er KILDEN der er flyttet. Ændrede vi begge dele på én
       gang, ville en fejl i regnestykket ligne en fejl i flytningen. */
    const ark = omkostningsark(DEMO_OMKOSTNINGER, { koeretoejer: KT });
    assert.ok(ark.biler["kt-012"], "bilen mangler i arket");
    assert.equal(ark.biler["kt-012"].navn, "Volvo FH 500");
    assert.ok(Array.isArray(ark.biler["kt-012"].kmPrisSatser));
    assert.ok(ark.poster["faerge:femern"]);
    assert.ok(ark.agenter.hthHamburg);
  });

  it("⚠ NAVNET KOMMER FRA KØRETØJET, IKKE FRA SATSEN", () => {
    /* Den gamle JSX-fil skrev navn og registrering af fra demo-flaade.js i
       hånden, og dens egen kommentar advarede om at de skulle holdes ens.
       Nu står navnet ét sted. */
    const ark = omkostningsark(DEMO_OMKOSTNINGER, {
      koeretoejer: [{ id: "kt-012", navn: "Omdøbt", registrering: "XX 1" }],
    });
    assert.equal(ark.biler["kt-012"].navn, "Omdøbt");
    assert.equal(ark.biler["kt-012"].registrering, "XX 1");
    assert.ok(valideOmkostning({ id: "bil-kt-012", art: "bil", navn: "Volvo" }).navn,
      "et navn på en bilsats blev accepteret");
  });

  it("⚠ EN SATS UDEN SIT KØRETØJ UDELADES", () => {
    /* Bilen er solgt eller aldrig oprettet. Satsen bliver stående i basen —
       den forklarer gamle beregninger — men den kan ikke bruges til nye, og
       et navn vi selv fandt på, ville stå på en linje i et estimat. */
    const ark = omkostningsark(DEMO_OMKOSTNINGER, { koeretoejer: [] });
    assert.deepEqual(ark.biler, {});
    assert.ok(Object.keys(ark.poster).length > 0, "passagerne skal stadig være der");
  });

  it("⚠ PASSAGERNES ID'ER ER UÆNDREDE", () => {
    /* Etapernes `passager`-kort peger på dem. Et nyt navn ville gøre hver
       eneste etape til en tur uden færge, uden at nogen havde rørt etapen. */
    const ark = omkostningsark(DEMO_OMKOSTNINGER, { koeretoejer: KT });
    for (const id of ["faerge:femern", "bro:storebaelt", "vejafgift:miljoezoner"]) {
      assert.ok(ark.poster[id], `${id} findes ikke længere`);
    }
  });

  it("beregningen giver det samme som før flytningen", () => {
    /* ⚠ TALLENE ER DE SAMME. Flytningen skal kunne efterprøves: giver
       eksemplet et andet resultat, er det flytningen der er gået galt frem
       for prismotoren. */
    const ark = omkostningsark(DEMO_OMKOSTNINGER, { koeretoejer: KT });
    const r = beregnBooking({
      bilId: "kt-012", kmEstimeret: 780, doegnParkering: 1,
      agentId: "hthHamburg",
      passager: { "faerge:femern": 1, "parkering:europa": 1 },
    }, ark, { paaMs: Date.UTC(2026, 5, 1) });
    assert.equal(r.linjer.find((l) => l.id === "bil:kt-012").beloebOere, 780 * 840);
    assert.equal(r.totalOere, 780 * 840 + 215000 + 45000 + 32500 + 125000);
  });

  it("⚠ EN BIL HAR INGEN DIVISION (beslutning 19)", () => {
    /* Et køretøj er defineret ved sin ART, ikke ved en afdeling, og reglerne
       afviser feltet på koeretoejer/. En km-sats må ikke indføre det ad
       bagvejen. */
    assert.ok(valideOmkostning({ id: "bil-kt-012", art: "bil", division: "gods" }).division);
    assert.deepEqual(valideOmkostning({ id: "bil-kt-012", art: "bil" },
      { koeretoejer: ["kt-012"] }), {});
  });

  it("afviser en bilsats der peger på et køretøj der ikke findes", () => {
    assert.ok(valideOmkostning({ id: "bil-kt-999", art: "bil" },
      { koeretoejer: ["kt-012"] }).id);
    /* Og et id uden præfikset er ikke en bilsats. */
    assert.ok(valideOmkostning({ id: "kt-012", art: "bil" }, { koeretoejer: ["kt-012"] }).id);
  });

  it("⚠ KOLON ER TILLADT I EN RTDB-NØGLE — PUNKTUM ER IKKE", () => {
    /* Derfor kan `faerge:femern` blive stående. Punktummet var fejlen i
       etape 2, hvor hver eneste skrivning fejlede med "invalid path". */
    assert.deepEqual(valideOmkostning({ id: "faerge:femern", art: "passage", navn: "Femern" }), {});
    assert.ok(valideOmkostning({ id: "faerge.femern", art: "passage", navn: "Femern" }).id);
  });

  it("skærmen bygger ikke satsarket selv længere", () => {
    const skaerm = readFileSync("src/moduler/booking/Bookingopsaetning.jsx", "utf8");
    assert.ok(!/const SATSARK\s*=/.test(skaerm), "satsarket står stadig i JSX-filen");
    assert.ok(skaerm.includes('useListe("omkostninger"'), "skærmen læser ikke noden");
    /* Og den gentager ikke divisionsfilteret — useListe ejer reglen. */
    assert.ok(!/const iDivision/.test(skaerm), "skærmen har sin egen kopi af divisionsfilteret");
  });
});
