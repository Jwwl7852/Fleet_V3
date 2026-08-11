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
  AFGAAEDE_STATUS, tomPrisliste, validerPrisliste, gaeldendePrisliste,
  linjerForPeriode, abonnementstotaler,
} from "../src/fleet/priser.js";
import {
  ANTAL_SKALA, linjeBeloebOere, rabatteretSatsOere, BPS_SKALA, pctTilBps,
} from "../src/fleet/beloeb.js";
import { ALLE_ROLLER } from "../src/fleet/permissions.js";
import { VALGFRIE_MODULER } from "../src/fleet/moduler.js";

const PRISLISTE = {
  gyldigFraMs: 1767225600000,
  momssats: 25,
  moduler: {
    flaade: { basisOere: 49500, prKoeretoejOere: 2900, prBrugerOere: {} },
    bemanding: { basisOere: 29500, prBrugerOere: { chauffoer: 4900, desktop: 0 } },
    booking: { basisOere: 79500, prBrugerOere: { chauffoer: 0, desktop: 14900 } },
  },
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
      assert.deepEqual(Object.keys(t[m].prBrugerOere).sort(), [...ALLE_BRUGERARTER].sort());
    }
  });

  it("GÆTTER IKKE momssatsen", () => {
    /* ⚠ Ikke 25, ikke 0. Samme regel som på kundens fakturagrundlag: et
       system der gætter rigtigt ni gange ud af ti, lærer brugeren at stole
       på det tiende. */
    const fejl = validerPrisliste({ gyldigFraMs: 1, moduler: {} });
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
      ...PRISLISTE, moduler: { flaade: { prBrugerOere: { fritter: 100 } } },
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

  it("laver én linje pr. akse der har en sats", () => {
    const l = linjerForPeriode(fuld);
    const nøgler = l.map((x) => `${x.modul}/${x.akse}${x.brugerart ? "/" + x.brugerart : ""}`);
    assert.deepEqual(nøgler.sort(), [
      "bemanding/basis", "bemanding/bruger/chauffoer",
      "booking/basis", "booking/bruger/desktop",
      "flaade/basis", "flaade/koeretoej",
    ]);
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
    assert.deepEqual([...new Set(l.map((x) => x.modul))], ["flaade"]);
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
