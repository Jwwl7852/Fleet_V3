/* test/prioritet.test.mjs
 * Ét katalog for "hvor travlt er der med det her".
 *
 * ⚠ HVORFOR FILEN FINDES. Ordet stod tre steder, da Fleet fik brug for det
 * fjerde: reservationernes kilderangorden (40/30/20/10/5), supportsagens
 * firetrins alvor, og Warehouses plukordre. De to første er noget ANDET —
 * det er skrevet ud i prioritet.js — men plukordrens tre trin er nøjagtig
 * samme spørgsmål som en driftsopgaves, og et fjerde katalog ville være to
 * ordlister der ikke kan summeres på to skærme der viser den samme kø.
 *
 * Prøven holder fast i tre ting der hver især er billige at bryde: at værdien
 * og labelet ikke gøres ens, at en manglende prioritet ikke bliver til
 * "Mellem", og at Warehouse og Fleet stadig deler ét objekt.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PRIORITET, ALLE_PRIORITETER, prioritetFor, harPrioritet, prioritetVaegt,
} from "../src/fleet/prioritet.js";
import * as warehouse from "../src/fleet/warehouse.js";
import { plukkoe } from "../src/fleet/warehouse.js";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import { DEMO_INDBERETNINGER } from "../src/fleet/demo-indberetninger.js";
import { FELT, harFelt, opgaveMangler, ALLE_OPGAVE_ARTER } from "../src/fleet/opgaver.js";

describe("kataloget", () => {
  it("har præcis tre trin", () => {
    assert.deepEqual(ALLE_PRIORITETER, ["lav", "normal", "hoej"]);
  });

  it("⚠ VÆRDIEN ER normal, LABELET ER Mellem — de gøres ikke ens", () => {
    /* At omdøbe værdien til `mellem` for at få den til at passe med labelet,
       ville være en datamigrering for et ord: `normal` står i
       firebase.rules.json og på hver plukordre der måtte være oprettet, og
       hvor mange de er i den udrullede base, kan vi ikke måle herfra.
       Samme grænse som `flaade` mod "Fleet". */
    assert.equal(PRIORITET.normal.prioritet, "normal");
    assert.equal(PRIORITET.normal.label, "Mellem");
    assert.equal(PRIORITET.lav.label, "Lav");
    assert.equal(PRIORITET.hoej.label, "Høj");
  });

  it("⚠ REKKEFØLGEN ER lav → normal → hoej, og den fylder en dropdown", () => {
    /* ALLE_PRIORITETER er Object.keys, og Pluk.jsx bygger sin vælger af den.
       Vendte man kataloget om for at få "Høj" øverst i en tabel, ville
       dropdownen skifte rækkefølge et helt andet sted. Sorteringen hører i
       vaegt, ikke i nøglernes orden. */
    assert.deepEqual(Object.keys(PRIORITET), ["lav", "normal", "hoej"]);
  });

  it("er læsbar på farven alene", () => {
    /* Tre trin i to farver er to trin man skal LÆSE for at skelne, i en kø
       hvor man scanner tredive rækker. `lav` og `normal` stod begge som
       "info" i warehouse.js. */
    const toner = ALLE_PRIORITETER.map((p) => PRIORITET[p].pill);
    assert.equal(new Set(toner).size, 3, `tre trin, ${new Set(toner).size} farver`);
  });
});

describe("⚠ EN MANGLENDE PRIORITET ER IKKE MELLEM", () => {
  /* Hele grunden til at prioritetFor() findes frem for et opslag i PRIORITET
     med en fallback. Samme regel som den manglende momssats: et system der
     gætter rigtigt ni gange ud af ti, lærer brugeren at stole på det tiende. */

  it("svarer null — ikke PRIORITET.normal", () => {
    assert.equal(prioritetFor({}), null);
    assert.equal(prioritetFor(null), null);
    assert.equal(prioritetFor({ prioritet: null }), null);
    assert.equal(prioritetFor(undefined), null);
  });

  it("⚠ OG EN UKENDT VÆRDI ER OGSÅ null, IKKE ET LAVT TRIN", () => {
    /* "mellem" er præcis det ord skærmen viser. En udvikler der skriver
       værdien af efter labelet, rammer det — og en fallback til `lav` ville
       have gjort posten usynlig i stedet for forkert. */
    assert.equal(prioritetFor({ prioritet: "mellem" }), null);
    assert.equal(prioritetFor({ prioritet: "kritisk" }), null);
    assert.equal(harPrioritet({ prioritet: "mellem" }), false);
  });

  it("⚠ DE UVURDEREDE SORTERES OP, IKKE NED", () => {
    /* En post ingen har taget stilling til, ville blive liggende nederst
       netop fordi ingen havde taget stilling til den. 1,5 lægger den mellem
       høj og mellem, hvor den bliver set. */
    assert.equal(prioritetVaegt({ prioritet: "hoej" }), 1);
    assert.equal(prioritetVaegt({}), 1.5);
    assert.equal(prioritetVaegt({ prioritet: "normal" }), 2);
    assert.equal(prioritetVaegt({ prioritet: "lav" }), 3);

    const koe = [{ prioritet: "lav" }, {}, { prioritet: "hoej" }, { prioritet: "normal" }];
    assert.deepEqual(
      [...koe].sort((a, b) => prioritetVaegt(a) - prioritetVaegt(b)).map((o) => o.prioritet),
      ["hoej", undefined, "normal", "lav"]);
  });
});

describe("Warehouse og Fleet deler ÉT objekt", () => {
  it("warehouse.js geneksporterer det samme katalog", () => {
    /* Ikke "de har samme indhold" — SAMME OBJEKT. En kopi med samme værdier
       ville bestå en indholdstest og drive ved første rettelse. */
    assert.equal(warehouse.PRIORITET, PRIORITET);
    assert.deepEqual(warehouse.ALLE_PRIORITETER, ALLE_PRIORITETER);
  });

  it("plukkøen sorterer stadig høj først", () => {
    /* vaegt-tallene er uændrede (1/2/3), så plukkoe() er urørt af flytningen.
       Skiftede nogen dem for at få en anden rækkefølge i Fleet, ville
       lagerets kø skifte med. */
    const ordre = (id, prioritet, afgangMs) => ({
      id, prioritet, afgangMs, tilstand: "frigivet",
      linjer: [{ vareId: "v1", antal: 1 }],
    });
    const koe = plukkoe([
      ordre("a", "lav", 1000), ordre("b", "hoej", 9000), ordre("c", "normal", 5000),
    ]);
    assert.deepEqual(koe.map((o) => o.id), ["b", "c", "a"]);
  });
});

describe("opgavekataloget kender feltet", () => {
  it("prioritet er et FÆLLES felt — begge arter har det", () => {
    for (const a of ALLE_OPGAVE_ARTER) {
      assert.equal(harFelt(a, FELT.prioritet), true, `${a} mangler prioritet`);
    }
  });

  it("⚠ opgaveMangler SIGER TIL VED EN UKENDT VÆRDI — ikke ved en manglende", () => {
    const basis = { art: "vaerksted", koeretoejId: "kt-012" };
    assert.deepEqual(opgaveMangler(basis), [], "en opgave uden prioritet er gyldig");
    assert.deepEqual(opgaveMangler({ ...basis, prioritet: "hoej" }), []);
    assert.deepEqual(opgaveMangler({ ...basis, prioritet: "mellem" }),
      ["prioritet (ukendt værdi)"]);
  });
});

describe("demo-sættene", () => {
  const alle = [...DEMO_OPGAVER, ...DEMO_INDBERETNINGER];

  it("bruger kun de tre trin", () => {
    for (const post of alle) {
      if (post.prioritet == null) continue;
      assert.ok(ALLE_PRIORITETER.includes(post.prioritet),
        `${post.id} har prioritet "${post.prioritet}"`);
    }
  });

  it("⚠ HVER NODE HAR MINDST ÉN UVURDERET POST", () => {
    /* Ellers kan tallet "ikke vurderet" på Driftskalenderen kun give 0 — og
       en tælling der kun kan give 0, kan ikke tage fejl på en måde nogen
       opdager. Femte gang mønstret dukker op i de her datasæt: den åbne
       indkøbsordre, den planlagte facility-opgave, den nye indberetning. */
    for (const [navn, saet] of [["opgaver", DEMO_OPGAVER], ["indberetninger", DEMO_INDBERETNINGER]]) {
      assert.ok(saet.some((p) => p.prioritet == null),
        `${navn} har en prioritet på hver post — "ikke vurderet" kan kun give 0`);
    }
  });

  it("⚠ OG MINDST ÉN AF HVERT TRIN — ellers kan farven ikke ses virke", () => {
    for (const trin of ALLE_PRIORITETER) {
      assert.ok(alle.some((p) => p.prioritet === trin),
        `intet demo-eksempel med prioritet "${trin}"`);
    }
  });

  it("den uvurderede er den der lige er kommet ind", () => {
    /* Prioriteten sættes i TRIAGEN, ikke af den der melder fejlen. Sættene
       skal vise netop det, ellers er "ikke vurderet" bare et hul. */
    const opgave = DEMO_OPGAVER.find((o) => o.prioritet == null);
    assert.equal(opgave.status, "indberettet");
    const ind = DEMO_INDBERETNINGER.find((i) => i.prioritet == null);
    assert.equal(ind.forloeb, "ny");
  });
});
