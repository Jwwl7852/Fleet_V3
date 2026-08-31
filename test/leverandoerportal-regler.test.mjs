/* test/leverandoerportal-regler.test.mjs
 * Leverandørportalens egen, snævre regelmaskine — adskilt fra
 * OPGAVE_OVERGANGE. Se leverandoerportal-regler.js's eget hoved.
 *
 * Kør: npm test
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  LEVERANDOER_TILLADTE_SKIFT, kanLeverandoerSkifte,
  LEV_PORTAL_AKTIVE, LEV_PORTAL_AFSLUTTEDE,
  leverandoerSynligOpgave, fordelPortalOpgaver,
} from "../src/fleet/leverandoerportal-regler.js";
import { ALLE_OPGAVE_STATUS } from "../src/fleet/opgaver.js";

describe("⚠ EN LEVERANDØR KAN ALDRIG LUKKE OPGAVEN SELV", () => {
  test("udfoert er IKKE mål for noget som helst kildetrin", () => {
    /* Tillægskravets §11: leverandøren melder kun sin del af arbejdet
       færdig, aldrig den interne sag. */
    for (const [, maal] of Object.entries(LEVERANDOER_TILLADTE_SKIFT)) {
      assert.ok(!maal.includes("udfoert"), "udfoert er tilladt et sted den ikke må");
    }
  });

  test("annulleret er IKKE mål for noget som helst kildetrin", () => {
    for (const [, maal] of Object.entries(LEVERANDOER_TILLADTE_SKIFT)) {
      assert.ok(!maal.includes("annulleret"), "annulleret er tilladt et sted den ikke må");
    }
  });

  test("⚠ OG DEN GÆLDER FOR ETHVERT KENDT KILDETRIN, IKKE KUN DE TRE NÆVNTE", () => {
    for (const status of ALLE_OPGAVE_STATUS) {
      assert.equal(kanLeverandoerSkifte(status, "udfoert"), false, `${status} -> udfoert`);
      assert.equal(kanLeverandoerSkifte(status, "annulleret"), false, `${status} -> annulleret`);
    }
  });
});

describe("de tilladte skift", () => {
  test("planlagt og afventer kan begge blive til igang (\"arbejde påbegyndt\")", () => {
    assert.equal(kanLeverandoerSkifte("planlagt", "igang"), true);
    assert.equal(kanLeverandoerSkifte("afventer", "igang"), true);
  });

  test("igang kan blive til klar_til_afhentning", () => {
    assert.equal(kanLeverandoerSkifte("igang", "klar_til_afhentning"), true);
  });

  test("⚠ KLAR_TIL_AFHENTNING ER EN ENDESTATION FOR PORTALEN — ingen vej videre herfra", () => {
    assert.deepEqual(LEVERANDOER_TILLADTE_SKIFT.klar_til_afhentning, undefined);
    assert.equal(kanLeverandoerSkifte("klar_til_afhentning", "udfoert"), false);
    assert.equal(kanLeverandoerSkifte("klar_til_afhentning", "igang"), false);
  });

  test("indberettet har intet tilladt skift — det er ikke engang planlagt endnu", () => {
    assert.equal(kanLeverandoerSkifte("indberettet", "igang"), false);
  });

  test("en ukendt eller manglende kildestatus giver aldrig et tilladt skift", () => {
    assert.equal(kanLeverandoerSkifte("noget-der-ikke-findes", "igang"), false);
    assert.equal(kanLeverandoerSkifte(undefined, "igang"), false);
  });
});

describe("aktive/afsluttede-inddelingen", () => {
  test("hver kendt status er i højst én af de to lister — ingen står i begge", () => {
    for (const s of ALLE_OPGAVE_STATUS) {
      assert.ok(!(LEV_PORTAL_AKTIVE.has(s) && LEV_PORTAL_AFSLUTTEDE.has(s)),
        `"${s}" er i begge lister`);
    }
  });

  test("⚠ indberettet ER MED VILJE I INGEN AF DEM — §5: kun synlig i en relevant status", () => {
    /* En opgave der endnu ikke er planlagt, har intet konkret at vise en
       leverandør endnu — den forsvinder stille fra begge portalfaner
       fremfor at stå i "aktive" uden noget han kan handle på. */
    assert.equal(LEV_PORTAL_AKTIVE.has("indberettet"), false);
    assert.equal(LEV_PORTAL_AFSLUTTEDE.has("indberettet"), false);
  });

  test("de resterende fem kendte statusser er hver i netop én af listerne", () => {
    const resten = ALLE_OPGAVE_STATUS.filter((s) => s !== "indberettet");
    for (const s of resten) {
      const iAktive = LEV_PORTAL_AKTIVE.has(s);
      const iAfsluttede = LEV_PORTAL_AFSLUTTEDE.has(s);
      assert.notEqual(iAktive, iAfsluttede, `"${s}" er i begge eller ingen af listerne`);
    }
  });
});

describe("leverandoerSynligOpgave", () => {
  const KOERETOEJER = { "kt-104": { kaldenavn: "Bil 104", registrering: "AB 12 345" } };

  test("⚠ INGEN TEKNISKE FELTER LÆKKER MED", () => {
    const raa = {
      koeretoejId: "kt-104", status: "igang", arbejdstype: "service",
      beskrivelse: "Bremseklodser", startMs: 1786912716050, prioritet: "hoej",
      /* Interne felter der IKKE må stå i det portalen returnerer. */
      oprettetAf: "uid-intern-1", oprettetMs: 1, sagId: "sag-1", indberetningId: "ind-1",
    };
    const ud = leverandoerSynligOpgave("op-1", raa, KOERETOEJER);
    assert.deepEqual(Object.keys(ud).sort(), [
      "arbejdstype", "beskrivelse", "id", "koeretoejNavn", "koeretoejRegistrering",
      "prioritet", "startMs", "status", "tilbud",
    ].sort());
    assert.equal(ud.koeretoejNavn, "Bil 104");
    assert.equal(ud.koeretoejRegistrering, "AB 12 345");
  });

  test("et ukendt eller manglende køretøj giver null-navne, ikke en fejl", () => {
    const ud = leverandoerSynligOpgave("op-2", { status: "planlagt" }, {});
    assert.equal(ud.koeretoejNavn, null);
    assert.equal(ud.koeretoejRegistrering, null);
  });

  test("⚠ TILBUD ER HELE HISTORIKKEN, SORTERET ÆLDST FØRST", () => {
    const raa = {
      koeretoejId: "kt-104", status: "igang",
      leverandoertilbud: {
        b: { beloebOere: 500000, valuta: "DKK", indsendtMs: 200, status: "afventer" },
        a: { beloebOere: 450000, valuta: "DKK", indsendtMs: 100, status: "afvist" },
      },
    };
    const ud = leverandoerSynligOpgave("op-3", raa, KOERETOEJER);
    assert.deepEqual(ud.tilbud.map((t) => t.id), ["a", "b"]);
    assert.equal(ud.tilbud[0].status, "afvist");
    assert.equal(ud.tilbud[1].status, "afventer");
  });

  test("ingen tilbud giver en tom liste, ikke undefined", () => {
    const ud = leverandoerSynligOpgave("op-4", { koeretoejId: "kt-104", status: "planlagt" }, KOERETOEJER);
    assert.deepEqual(ud.tilbud, []);
  });
});

describe("fordelPortalOpgaver", () => {
  const KOERETOEJER = {};
  const OPGAVER = [
    ["op-min-aktiv", { leverandoerId: "lv-1", status: "igang", koeretoejId: null }],
    ["op-min-afsluttet", { leverandoerId: "lv-1", status: "udfoert", koeretoejId: null }],
    ["op-anden-leverandoer", { leverandoerId: "lv-2", status: "igang", koeretoejId: null }],
    ["op-ingen-leverandoer", { status: "igang", koeretoejId: null }],
  ];

  test("⚠ KUN DEN EGNE leverandoerId — INTET ANDET FILTER KAN NÅS UDEFRA", () => {
    const { aktive, afsluttede } = fordelPortalOpgaver(OPGAVER, "lv-1", KOERETOEJER);
    assert.deepEqual(aktive.map((o) => o.id), ["op-min-aktiv"]);
    assert.deepEqual(afsluttede.map((o) => o.id), ["op-min-afsluttet"]);
  });

  test("en leverandør uden nogen tildelte opgaver får to tomme lister, ikke en fejl", () => {
    const { aktive, afsluttede } = fordelPortalOpgaver(OPGAVER, "lv-uden-noget", KOERETOEJER);
    assert.deepEqual(aktive, []);
    assert.deepEqual(afsluttede, []);
  });

  test("⚠ EN indberettet OPGAVE FORSVINDER STILLE FRA BEGGE LISTER", () => {
    const medEnUplanlagt = [
      ...OPGAVER,
      ["op-ikke-planlagt", { leverandoerId: "lv-1", status: "indberettet", koeretoejId: null }],
    ];
    const { aktive, afsluttede } = fordelPortalOpgaver(medEnUplanlagt, "lv-1", KOERETOEJER);
    assert.ok(!aktive.some((o) => o.id === "op-ikke-planlagt"));
    assert.ok(!afsluttede.some((o) => o.id === "op-ikke-planlagt"));
  });
});
