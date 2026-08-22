/* test/procure.test.mjs
 * Procures form — beslutning 78.
 *
 * ⚠ HVORFOR FORMEN PRØVES HER OG IKKE I REGLERNE. `indkoebsbehov` og
 * `indkoebsordrer` er `.write: false`, så `.validate`-blokken kan ikke nås af
 * en klient. Et forsøg på at prøve den med `withSecurityRulesDisabled` slår
 * ALLE regler fra, også `.validate` — og seks prøver målte derfor ingenting,
 * mens de så grundige ud.
 *
 * CLAUDE.md skrev det ned om `opgaver` i forvejen: *"Skriv ikke en regelprøve
 * der 'afviser' en opgave — den ville være grøn fordi skrivningen er lukket,
 * ikke fordi posten var forkert."*
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  valideBehov, valideOrdre, linjeListe, ordreSumOere, behovTilLinje,
  ALLE_BEHOVKILDER, ORDRENUMMER,
} from "../src/fleet/procure.js";

const BEHOV = {
  vare: "Træplader 22 mm", kilde: "snedkeri", status: "nyt",
  oprettetMs: 1786000000000, oprettetAf: "uid-anders",
};
const ORDRE = {
  nummer: "BST-2026-00001", leverandoerId: "lv-stark", status: "kladde",
  oprettetMs: 1786000000000, oprettetAf: "uid-jens",
  linjer: { l1: { vare: "Motorolie 10W-40", antal: 5, prisPrEnhedOere: 25000 } },
};

describe("Behovet", () => {
  test("et gyldigt behov tages imod", () => {
    assert.equal(valideBehov(BEHOV).ok, true, JSON.stringify(valideBehov(BEHOV).fejl));
  });

  test("⚠ HVERT PÅKRÆVET FELT AFVISES NÅR DET MANGLER", () => {
    for (const felt of ["vare", "kilde", "status", "oprettetMs", "oprettetAf"]) {
      const uden = { ...BEHOV };
      delete uden[felt];
      const r = valideBehov(uden);
      assert.equal(r.ok, false, `et behov uden ${felt} blev taget imod`);
      assert.ok(r.fejl[felt], `fejlen er ikke nøglet på "${felt}" — så kan `
        + "formularen ikke sætte beskeden det rigtige sted");
    }
  });

  /**
   * ⚠ KILDEN ER ET KATALOG, IKKE EN FRI STRENG. Indbakken grupperes på den,
   * og en femte stavemåde ville lave en gruppe mere som ingen har besluttet
   * og ingen skærm tegner en overskrift til.
   */
  test("⚠ KILDEN ER FIRE VÆRDIER", () => {
    for (const k of ALLE_BEHOVKILDER) {
      assert.equal(valideBehov({ ...BEHOV, kilde: k }).ok, true, `kilden "${k}" blev afvist`);
    }
    for (const k of ["Snedkeri", "vaerksted", "", null, "andet"]) {
      assert.equal(valideBehov({ ...BEHOV, kilde: k }).ok, false,
        `kilden "${k}" blev taget imod`);
    }
  });

  /**
   * ⚠ ANTALLET ER VALGFRIT, OG DET ER EN BESLUTNING. Den der melder ind, ved
   * ofte hvad han mangler og ikke hvor meget der er i en pakke. Et krævet felt
   * ville blive udfyldt med et gæt af den der ikke ved det — og gættet ville
   * gå med i en bestilling.
   */
  test("⚠ ET BEHOV UDEN ANTAL ER GYLDIGT", () => {
    assert.equal(valideBehov(BEHOV).ok, true);
    assert.equal(valideBehov({ ...BEHOV, antal: 10 }).ok, true);
  });

  test("⚠ MEN ER DET SAT, SKAL DET VÆRE OVER NUL", () => {
    for (const a of [0, -3, "ti", NaN]) {
      assert.equal(valideBehov({ ...BEHOV, antal: a }).ok, false,
        `antallet ${a} blev taget imod`);
    }
  });

  /* ⚠ Aksen er fjernet i beslutning 70, og reglen afviser feltet — så en
     formular der satte det, ville få skrivningen nægtet af serveren. */
  test("⚠ EN NY NODE MÅ IKKE GENINDFØRE division", () => {
    assert.equal(valideBehov({ ...BEHOV, division: "gods" }).ok, false);
  });
});

describe("Ordren", () => {
  test("en gyldig ordre tages imod", () => {
    assert.equal(valideOrdre(ORDRE).ok, true, JSON.stringify(valideOrdre(ORDRE).fejl));
  });

  /**
   * ⚠ NUMMERET HAR ET FORMAT. Kan en post komme ind i serien med et andet
   * mønster, kan man ikke længere se af nummeret at det ER et
   * bestillingsnummer — og `naesteNummer()` regner videre på en serie den ikke
   * kender alle medlemmerne af.
   */
  test("⚠ NUMMERET ER BST-ÅÅÅÅ-NNNNN", () => {
    assert.ok(ORDRENUMMER.test("BST-2026-00001"));
    for (const n of ["BST-2026-1", "PO-2026-00001", "BST-26-00001", "2026-00001", "", null]) {
      assert.equal(valideOrdre({ ...ORDRE, nummer: n }).ok, false,
        `nummeret "${n}" blev taget imod`);
    }
  });

  /* ⚠ EN ORDRE UDEN LINJER ER IKKE EN ORDRE. */
  test("⚠ MINDST ÉN LINJE", () => {
    const r = valideOrdre({ ...ORDRE, linjer: undefined });
    assert.equal(r.ok, false);
    assert.match(r.fejl.linjer, /mindst én linje/);
  });

  /**
   * ⚠ HELE ØRE SOM INTEGER, ekskl. moms. 18,50 kr er 1850, aldrig 18.5. En
   * float fakturerer forkert, og fejlen ses først på en faktura hos kunden.
   */
  test("⚠ PRISEN ER HELE ØRE — en float afvises", () => {
    for (const p of [1250.5, -100, "1250", null]) {
      const r = valideOrdre({
        ...ORDRE, linjer: { l1: { vare: "Dæk", antal: 4, prisPrEnhedOere: p } },
      });
      assert.equal(r.ok, false, `prisen ${p} blev taget imod`);
    }
  });

  test("en linje uden vare eller antal afvises", () => {
    for (const felt of ["vare", "antal"]) {
      const l = { vare: "Dæk", antal: 4, prisPrEnhedOere: 90000 };
      delete l[felt];
      assert.equal(valideOrdre({ ...ORDRE, linjer: { l1: l } }).ok, false,
        `en linje uden ${felt} blev taget imod`);
    }
  });
});

describe("Linjerne er nøglet, ikke en array", () => {
  /**
   * ⚠ DEN FÆLDE ER FANGET ÉN GANG FØR. `kanSkifteEtape()` talte forslag med
   * `.length` på et nøglet objekt — `undefined > 0` er falsk — så en
   * disponent med tre forslag fik "der skal være mindst ét forslag", og tre
   * overgange var lukkede i produktion (beslutning 76).
   *
   * `linjeListe()` er det ene sted formen oversættes, som `forslagListe()`.
   */
  test("⚠ DEN TÅLER BEGGE FORMER", () => {
    const noegler = { linjer: { a: { vare: "X", antal: 1, prisPrEnhedOere: 100 } } };
    const array = { linjer: [{ vare: "X", antal: 1, prisPrEnhedOere: 100 }] };
    assert.equal(linjeListe(noegler).length, 1);
    assert.equal(linjeListe(array).length, 1);
    assert.deepEqual(linjeListe({}), []);
    assert.deepEqual(linjeListe(null), []);
  });

  test("⚠ NØGLEN BLIVER LINJENS id", () => {
    const [l] = linjeListe({ linjer: { "l-7": { vare: "X", antal: 1, prisPrEnhedOere: 1 } } });
    assert.equal(l.id, "l-7");
  });
});

describe("Summen regnes, den gemmes ikke", () => {
  /**
   * ⚠ ET GEMT TOTALBELØB DRIVER FRA SINE LINJER første gang nogen retter et
   * antal — fejlen i `bemanding.ledig` (beslutning 71), og den koster mere
   * her, hvor tallet er penge.
   */
  test("summen er antal × pris, i hele øre", () => {
    assert.equal(ordreSumOere(ORDRE), 5 * 25000);
    assert.equal(ordreSumOere({
      linjer: { a: { vare: "X", antal: 2, prisPrEnhedOere: 150 },
                b: { vare: "Y", antal: 3, prisPrEnhedOere: 100 } },
    }), 600);
  });

  /* ⚠ EN UGYLDIG LINJE TÆLLER IKKE MED FREM FOR AT GØRE SUMMEN TIL NaN.
     En sum der er NaN, vises som "—" og ligner et ubesvaret felt; en sum der
     mangler en linje, er forkert på en måde ingen kan se. Begge er dårlige —
     men valideOrdre() har allerede afvist posten, så det her er en bagstopper. */
  test("en ugyldig linje gør ikke summen til NaN", () => {
    const s = ordreSumOere({ linjer: { a: { vare: "X", antal: "to", prisPrEnhedOere: 100 } } });
    assert.equal(Number.isFinite(s), true);
    assert.equal(s, 0);
  });

  test("en ordre uden linjer summer til nul, ikke null", () => {
    assert.equal(ordreSumOere({}), 0);
  });
});

describe("Behovet bliver til en linje", () => {
  const medAntal = { ...BEHOV, id: "b-1", antal: 10, enhed: "stk" };

  test("linjen bærer sporet tilbage til behovet", () => {
    const l = behovTilLinje(medAntal, { prisPrEnhedOere: 12500 });
    assert.equal(l.behovId, "b-1");
    assert.equal(l.vare, "Træplader 22 mm");
    assert.equal(l.antal, 10);
    assert.equal(l.enhed, "stk");
  });

  /**
   * ⚠ DEN GÆTTER IKKE ET ANTAL. En bestilling på "1 stk." fordi ingen skrev
   * noget, er et tal nogen kommer til at stole på — og det bliver købt. Samme
   * holdning som `reservationFraOpgave()` har til en opgave uden estimat, og
   * som momssatsen der ikke gættes.
   */
  test("⚠ ET BEHOV UDEN ANTAL KASTER FREM FOR AT GÆTTE 1", () => {
    assert.throws(() => behovTilLinje({ ...BEHOV, id: "b-2" }, { prisPrEnhedOere: 100 }),
      /intet antal/);
  });

  test("⚠ OG PRISEN SKAL VÆRE HELE ØRE", () => {
    assert.throws(() => behovTilLinje(medAntal, { prisPrEnhedOere: 125.5 }), /hele øre/);
    assert.throws(() => behovTilLinje(medAntal, { prisPrEnhedOere: -1 }), /hele øre/);
  });

  test("et behov uden vare kaster", () => {
    assert.throws(() => behovTilLinje({ id: "b-3" }, { prisPrEnhedOere: 100 }), /ingen vare/);
  });
});
