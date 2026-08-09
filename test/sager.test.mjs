/* test/sager.test.mjs
 * Beslutning 20: sagsbaseret mail i Fleet og Facility.
 *
 * Ingen emulator herinde — filen tester POLITIKKEN, ikke reglerne. Den kører
 * alligevel med `npm test`, fordi node --test tager hele test/.
 *
 * HVORFOR DEN FINDES. Indgående mail er uautentificeret input fra internettet,
 * og sagsnummeret er fortløbende og dermed gætbart. Det eneste der står mellem
 * en fremmed og en sagstråd, er sagsnummerFraEmne() og vurderAfsender(). To
 * funktioner man kan læse igennem og tro på — og det var præcis også tilfældet
 * med firebase.rules.json, som lå ugyldig fra fundamentet i månedsvis. Derfor
 * køres de her frem for at blive gennemlæst.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SAG_ART, AFSENDER_STATUS, VEDHAEFTNING_STATUS, FANER,
  sagsnummerFraEmne, emneMedNummer, vurderAfsender, frigivKarantaene,
  maaHentes, reservationFraAftale,
} from "../src/fleet/sager.js";
import { DEMO_SAGER, DEMO_EGNE_DOMAENER, demoSag, demoSagerFor } from "../src/fleet/demo-sag.js";

const PARTER = ["service@mercedes-greve.dk"];
const vurder = (envelopeAfsender, dmarc = "pass", ekstra = {}) =>
  vurderAfsender({ envelopeAfsender, dmarc, parter: PARTER, egneDomaener: DEMO_EGNE_DOMAENER, ...ekstra });

describe("Sagsnummer i emnefeltet", () => {
  it("genkender FLT og FAC og udleder arten", () => {
    assert.deepEqual(sagsnummerFraEmne("[FLT-2026-00381] Bil 104"),
      { nummer: "FLT-2026-00381", art: "fleet" });
    assert.deepEqual(sagsnummerFraEmne("[FAC-2026-00127] Port 3"),
      { nummer: "FAC-2026-00127", art: "facility" });
  });

  /* Hele mekanismen hviler på dette ene: modtageren gør ingenting anderledes.
     Holder det ikke, er der ingen funktion. */
  it("overlever Re:, SV:, VS: og Fwd: — også i kæde", () => {
    for (const praefiks of ["Re: ", "SV: ", "VS: ", "Fwd: ", "SV: Fwd: Re: ", "RE: Re: "]) {
      assert.equal(
        sagsnummerFraEmne(`${praefiks}[FLT-2026-00381] Bil 104`)?.nummer,
        "FLT-2026-00381",
        `"${praefiks}" tabte nummeret`
      );
    }
  });

  it("finder nummeret uanset hvor i emnet det står", () => {
    assert.equal(sagsnummerFraEmne("Bil 104 – sag FLT-2026-00381 – svar")?.nummer, "FLT-2026-00381");
    assert.equal(sagsnummerFraEmne("FLT-2026-00381")?.nummer, "FLT-2026-00381");
  });

  it("er ligeglad med små bogstaver, men ikke med grænser", () => {
    assert.equal(sagsnummerFraEmne("re: [flt-2026-00381] bil 104")?.nummer, "FLT-2026-00381");
    /* Klistret ind i et ord er ikke et sagsnummer. Ellers ville en tilfældig
       streng i en signatur kunne route en mail. */
    assert.equal(sagsnummerFraEmne("XFLT-2026-00381"), null);
    assert.equal(sagsnummerFraEmne("FLT-2026-003812"), null);
    assert.equal(sagsnummerFraEmne("FLT-26-00381"), null);
  });

  it("giver null uden nummer", () => {
    assert.equal(sagsnummerFraEmne("Tilbud på dæk"), null);
    assert.equal(sagsnummerFraEmne(""), null);
    assert.equal(sagsnummerFraEmne(null), null);
  });

  /* To forskellige numre = ingen rigtig modtager. At gætte ville lægge
     beskeden på en tilfældig af de to sager. */
  it("afviser to FORSKELLIGE numre, men accepterer det samme gentaget", () => {
    assert.equal(sagsnummerFraEmne("Re: FLT-2026-00381 og FLT-2026-00382"), null);
    assert.equal(sagsnummerFraEmne("Re: FLT-2026-00381 / FAC-2026-00127"), null);
    assert.equal(
      sagsnummerFraEmne("[FLT-2026-00381] Re: [FLT-2026-00381] Bil 104")?.nummer,
      "FLT-2026-00381"
    );
  });

  it("sætter nummeret først i en udgående emnelinje", () => {
    assert.equal(emneMedNummer("FLT-2026-00381", "Bil 104"), "[FLT-2026-00381] Bil 104");
    assert.equal(sagsnummerFraEmne(emneMedNummer("FAC-2026-00127", "Port 3"))?.nummer, "FAC-2026-00127");
  });
});

describe("Afsendervurdering", () => {
  it("lægger en kendt part på tråden", () => {
    assert.equal(vurder("service@mercedes-greve.dk").status, AFSENDER_STATUS.kendt);
  });

  it("er ligeglad med store bogstaver og mellemrum i adressen", () => {
    assert.equal(vurder("  Service@Mercedes-Greve.DK ").status, AFSENDER_STATUS.kendt);
  });

  it("accepterer vores eget domæne uden at det står som part", () => {
    assert.equal(vurder("drift@nordvest-transport.dk").status, AFSENDER_STATUS.kendt);
  });

  /* DMARC beviser at afsenderen ejer det domæne han skriver FRA. Det er ikke
     det samme som at han er den rigtige part — og det er hele grunden til at
     karantænen findes. */
  it("sætter et lookalike-domæne i karantæne selv med DMARC pass", () => {
    const r = vurder("faktura@mercedes-greve-service.dk");
    assert.equal(r.status, AFSENDER_STATUS.karantaene);
    assert.match(r.aarsag, /står ikke som part/);
  });

  /* Kaldes uden om vurder()-hjælperen: dens default ville selv sætte "pass"
     og dermed teste det stik modsatte af det der står i navnet. */
  it("afviser alt der ikke er DMARC pass — også en kendt part", () => {
    for (const dmarc of ["fail", "none", undefined, "", "PASS"]) {
      assert.equal(
        vurderAfsender({ envelopeAfsender: "service@mercedes-greve.dk", dmarc, parter: PARTER }).status,
        AFSENDER_STATUS.afvist,
        `dmarc="${dmarc}" burde afvises`
      );
    }
  });

  it("afviser en tom afsender", () => {
    assert.equal(vurder("").status, AFSENDER_STATUS.afvist);
    assert.equal(vurder(null).status, AFSENDER_STATUS.afvist);
  });

  it("kender ingen når sagen ingen parter har", () => {
    assert.equal(
      vurderAfsender({ envelopeAfsender: "hvemsomhelst@example.com", dmarc: "pass" }).status,
      AFSENDER_STATUS.karantaene
    );
  });

  /* Rækkevidden af en fejl skal svare til rækkevidden af beslutningen. */
  it("frigiver kun til DENNE sag", () => {
    const sag = { id: "s1", parter: [...PARTER] };
    const opdatering = frigivKarantaene(sag, "Faktura@Mercedes-Greve-Service.DK");
    assert.deepEqual(opdatering.parter, [...PARTER, "faktura@mercedes-greve-service.dk"]);
    /* Den oprindelige sag er urørt — og ingen anden sag er nævnt. */
    assert.deepEqual(sag.parter, PARTER);
    assert.deepEqual(Object.keys(opdatering), ["parter"]);
  });

  it("gør en frigivet adresse kendt bagefter", () => {
    const sag = { id: "s1", parter: [...PARTER] };
    const efter = frigivKarantaene(sag, "faktura@mercedes-greve-service.dk");
    assert.equal(
      vurderAfsender({
        envelopeAfsender: "faktura@mercedes-greve-service.dk",
        dmarc: "pass", parter: efter.parter,
      }).status,
      AFSENDER_STATUS.kendt
    );
  });
});

describe("Vedhæftninger fejler lukket", () => {
  it("kan kun hentes når den er scannet ren", () => {
    assert.equal(maaHentes({ status: VEDHAEFTNING_STATUS.ren }), true);
    assert.equal(maaHentes({ status: VEDHAEFTNING_STATUS.afventerScan }), false);
    assert.equal(maaHentes({ status: VEDHAEFTNING_STATUS.blokeret }), false);
  });

  /* En manglende, ukendt eller udeladt status må aldrig læses som "nok ren".
     Er scanneren nede, skal systemet være ubrugeligt — ikke utroværdigt. */
  it("nægter ved manglende eller ukendt status", () => {
    for (const v of [{}, { status: null }, { status: "ok" }, { status: "" }, null, undefined]) {
      assert.equal(maaHentes(v), false, `${JSON.stringify(v)} burde nægtes`);
    }
  });
});

describe("Aftale bliver til en reservation", () => {
  const sag = { id: "sag-1", nummer: "FLT-2026-00381", art: "fleet" };
  const aftale = {
    tilstand: "aftalt", fra: 1, til: 2,
    ressourceType: "koeretoej", ressourceId: "kt-104",
  };

  /* Det er et VÆRKSTEDSBESØG. Fik det sin egen lave prioritet, ville en
     bekræftet værkstedsaftale tabe til en booking — og en bil på værksted kan
     ikke køre, uanset hvad disponenten har lovet. */
  it("får kilde vaerksted på en fleet-sag, ikke en egen mail-kilde", () => {
    const r = reservationFraAftale(sag, aftale);
    assert.equal(r.kilde.type, "vaerksted");
    assert.equal(r.kilde.reference, "FLT-2026-00381");
  });

  it("får kilde facilitySag på en facility-sag", () => {
    assert.equal(
      reservationFraAftale({ ...sag, art: "facility", nummer: "FAC-2026-00127" }, aftale).kilde.type,
      "facilitySag"
    );
  });

  it("bevarer sporet tilbage til sagen", () => {
    assert.equal(reservationFraAftale(sag, aftale).kilde.viaSagId, "sag-1");
  });

  /* Mennesket bekræfter først. Automatikken skriver aldrig selv — samme regel
     som matchAabneEtaper(). */
  it("nægter at bygge en reservation af et ubekræftet forslag", () => {
    for (const tilstand of ["forslag", "afvist", undefined]) {
      assert.throws(
        () => reservationFraAftale(sag, { ...aftale, tilstand }),
        /kun en bekræftet aftale/,
        `tilstand="${tilstand}" burde afvises`
      );
    }
  });
});

describe("Nummerserier og arter", () => {
  it("har adskilte countere for FLT og FAC", () => {
    assert.equal(SAG_ART.fleet.praefiks, "FLT");
    assert.equal(SAG_ART.facility.praefiks, "FAC");
    assert.notEqual(SAG_ART.fleet.serie, SAG_ART.facility.serie);
  });

  it("har fire faner i den aftalte rækkefølge", () => {
    assert.deepEqual(FANER.map((f) => f.key),
      ["oversigt", "kommunikation", "dokumenter", "aktiviteter"]);
  });
});

/* Demo-sættet skal BEVISE politikken, ikke illustrere den. Samme kontrol som
   dev-selvtjekket i demo-sag.js — her som en test, så den også fanges af
   .githooks/pre-commit og ikke kun af en udvikler der har konsollen åben. */
describe("Demo-sagerne overholder deres egen politik", () => {
  it("har begge arter repræsenteret", () => {
    assert.ok(demoSag("FLT-2026-00381"));
    assert.ok(demoSag("FAC-2026-00127"));
    assert.equal(demoSagerFor("flaade").length, 1);
    assert.equal(demoSagerFor("facility").length, 1);
  });

  for (const sag of DEMO_SAGER) {
    const ctx = { parter: sag.parter, egneDomaener: DEMO_EGNE_DOMAENER };

    it(`${sag.nummer}: alt i tråden er fra en kendt afsender`, () => {
      for (const b of sag.beskeder) {
        assert.equal(
          vurderAfsender({ envelopeAfsender: b.afsender, dmarc: b.dmarc, ...ctx }).status,
          AFSENDER_STATUS.kendt,
          `${b.id} ligger i beskeder[] men er ikke kendt`
        );
      }
    });

    it(`${sag.nummer}: hver besked ville faktisk lande på sagen`, () => {
      for (const b of sag.beskeder) {
        assert.equal(sagsnummerFraEmne(b.emne)?.nummer, sag.nummer, `${b.id} har et emne der ikke peger på sagen`);
      }
    });

    it(`${sag.nummer}: intet i karantæne er i virkeligheden kendt`, () => {
      for (const k of sag.karantaene) {
        assert.equal(
          vurderAfsender({ envelopeAfsender: k.afsender, dmarc: k.dmarc, ...ctx }).status,
          AFSENDER_STATUS.karantaene,
          `${k.id} står i karantæne uden grund — så bliver karantænen støj`
        );
      }
    });

    /* Karantænen må ikke også ligge i tråden. Det er hele kontrollen. */
    it(`${sag.nummer}: karantæne og tråd er disjunkte`, () => {
      const iTraaden = new Set(sag.beskeder.map((b) => b.id));
      for (const k of sag.karantaene) assert.ok(!iTraaden.has(k.id));
      const adresser = new Set(sag.beskeder.map((b) => b.afsender));
      for (const k of sag.karantaene) {
        assert.ok(!adresser.has(k.afsender), `${k.afsender} er både i tråden og i karantæne`);
      }
    });

    it(`${sag.nummer}: tællerne i general matcher indholdet i sensitive`, () => {
      assert.equal(sag.antalBeskeder, sag.beskeder.length);
      assert.equal(sag.antalKarantaene, sag.karantaene.length);
      assert.equal(sag.harAftale, Boolean(sag.aftale));
    });

    /* general må ikke bære fritekst fra en mail. Gør den det, kan den ikke
       ligge uden for sensitive/ — og så falder hele beslutning 20's opdeling. */
    it(`${sag.nummer}: general bærer ingen brødtekst`, () => {
      for (const felt of ["tekst", "beskedTekst", "udtrukketSaetning"]) {
        assert.equal(sag[felt], undefined, `sag.${felt} hører i sensitive/`);
      }
      if (sag.aftale) assert.ok(sag.aftale.udtrukketSaetning, "aftalen mangler den sætning den blev læst ud af");
    });
  }

  it("FLT-sagens aftale peger på en besked der findes", () => {
    const flt = demoSag("FLT-2026-00381");
    assert.ok(flt.beskeder.some((b) => b.id === flt.aftale.udtrukketFra));
    /* Sætningen skal stå ordret i beskeden. Ellers viser skærmen et citat
       ingen har sagt. */
    const kilde = flt.beskeder.find((b) => b.id === flt.aftale.udtrukketFra);
    assert.ok(kilde.tekst.includes(flt.aftale.udtrukketSaetning));
  });

  it("FLT-sagen viser begge kanttilfælde", () => {
    const flt = demoSag("FLT-2026-00381");
    assert.equal(flt.karantaene.length, 1, "demo-sættet skal vise en karantæne");
    const filer = flt.beskeder.flatMap((b) => b.vedhaeftninger);
    assert.ok(filer.some((v) => v.status === VEDHAEFTNING_STATUS.ren));
    assert.ok(filer.some((v) => !maaHentes(v)), "demo-sættet skal vise en fil der ikke kan hentes");
  });
});
