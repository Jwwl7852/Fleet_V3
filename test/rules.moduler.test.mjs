/* test/rules.moduler.test.mjs
 * Et fravalgt modul lukker sine noder — i reglerne, ikke i sidebaren.
 *
 * ⚠ HVORFOR DEN HER PRØVE FINDES (beslutning 34).
 *
 * Modulafkrydsningen var indtil videre en KOMMERCIEL kontrol: en kunde uden
 * Facility der tastede /facility, så sin egen tomme node. Det holdt så længe
 * listen kun tegnede en sidebar. Det holder ikke, når ejerkonsollen kan
 * FRATAGE et modul — så har kunden stadig sine data og sit API, og modulet er
 * ikke solgt, det er foreslået.
 *
 * ⚠ TABELLEN ER SANDHEDEN. `NODE_MODUL` i moduler.js siger hvilke noder et
 * modul ejer, og prøven udleder sig af den i BEGGE retninger: står en node i
 * tabellen, SKAL reglen have klausulen; står den ikke, må reglen ikke have
 * den. Tilføjer nogen en node uden at tage stilling, fejler prøven.
 *
 * ⚠ TRE NODER STÅR MED VILJE UDEN FOR — opgaver, satser og fakturaer. De
 * hører hver til to moduler, og en node der gates af det ene, går i stykker
 * i det andet. Se noten i moduler.js.
 *
 * ⚠ DEN FEJLER ÅBENT. En tenant uden `moduler`-node har alt. Alternativet var
 * at en kunde oprettet før listen fandtes står med et system der afviser alt.
 * Samme retning som harModul() og som abonnementsklausulen.
 *
 * Koer: npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import {
  NODE_MODUL, MODUL_NODER, VALGFRIE_MODULER, modulerFor,
} from "../src/fleet/moduler.js";

const MED = "modulMed";      /* har alle moduler */
const UDEN = "modulUden";    /* har KUN dashboard — alt valgfrit er fravalgt */
const INGEN = "modulIngenNode"; /* har ingen moduler-node overhovedet */

let miljoe;

/* Data at prøve at nå. Formen er ligegyldig for læsningen; skrivningen
   valideres af reglerne, så den skal være rigtig. */
const TESTDATA = {
  koeretoejer: { kt1: { art: "lastbil", status: "aktiv" } },
  indberetninger: { i1: { art: "tankning", dato: "2026-08-01", forloeb: "afsluttet", oprettetAf: "u-x" } },
  /* ⚠ lokationId SKAL pege paa en lokation der findes — reglen slaar den op.
     Uden lokationer her fejler skrivningen paa VALIDERING og ligner en
     modulspaerring. Prøven ville sige det rigtige af den forkerte grund. */
  facility: {
    lokationer: { l1: { navn: "Depot Kolding", type: "depot" } },
    aktiver: { fa1: { navn: "Port 3", art: "port", status: "idrift", lokationId: "l1" } },
  },
  indkoeb: { i1: { division: "gods", dato: "2026-08-01", leverandoerId: "lev1", vare: "Diesel", antal: 1000, prisPrEnhedOere: 1200, fakturastatus: "modtaget" } },
  lagre: { l1: { navn: "Hovedlager" } },
  bookinger: { b1: { tilstand: "kladde" } },
  etaper: { e1: { tilstand: "aaben" } },
  reservationer: { r1: { fra: 1, til: 2 } },
  fravaer: { f1: { personId: "p1", fra: 1, til: 2 } },
  kompetencer: { k1: { personId: "p1", art: "adr" } },
  kunder: { k1: { navn: "Kunde", division: "gods", aktiv: true } },
};

function alleRegler() {
  const raa = readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const ud = [];
  (function gaa(node, sti) {
    if (typeof node !== "object" || node === null) return;
    for (const [k, v] of Object.entries(node)) {
      if (k === ".read" || k === ".write") ud.push({ sti, felt: k, udtryk: v });
      else if (!k.startsWith(".")) gaa(v, sti ? `${sti}/${k}` : k);
    }
  })(JSON.parse(raa).rules.tenants.$tenantId, "");
  return ud;
}

/** Nodestien uden $wildcard-leddet — koeretoejer/$koeretoejId → koeretoejer. */
const grundsti = (sti) => sti.split("/").filter((d) => !d.startsWith("$")).join("/");

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fleetcontrol-rules-test",
    database: { rules: readFileSync("firebase.rules.json", "utf8") },
  });

  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const t of [MED, UDEN, INGEN]) {
      await set(ref(db, `tenants/${t}/_findes`), true);
      for (const [node, data] of Object.entries(TESTDATA)) {
        await set(ref(db, `tenants/${t}/${node}`), data);
      }
    }
    const alle = {};
    for (const m of VALGFRIE_MODULER) alle[m] = true;
    await set(ref(db, `tenants/${MED}/moduler`), { dashboard: true, ...alle });
    await set(ref(db, `tenants/${UDEN}/moduler`), { dashboard: true });
    /* INGEN faar ingen moduler-node. */
  });
});

after(async () => { await miljoe?.cleanup(); });

const somAdmin = (tenant) =>
  miljoe.authenticatedContext(`u-${tenant}`, {
    tenant, rolle: "admin", perms: permStrengFraRolle("admin"),
  }).database();

describe("Reglerne følger NODE_MODUL — i begge retninger", () => {
  it("hver node i tabellen har klausulen på hver af sine regler", () => {
    /* ⚠ EN ADFAERDSPRØVE KAN KUN SE DE STIER NOGEN HUSKEDE AT SKRIVE NED.
       Den her læser regelfilen, som abonnementslinten — og af samme grund:
       klausulen står 27 steder, og det er repoets kendte fejlmønster. */
    const mangler = [];
    for (const r of alleRegler()) {
      if (typeof r.udtryk !== "string") continue;
      /* ⚠ EN NODE KAN HØRE TIL FLERE MODULER. `reolpladser` deles af
         Turtlebooking og Warehouse, fordi transportkasser og kundegods står
         på de samme hylder — og klausulen er så et ELLER.

         Prøven kræver at HVERT af modulerne står der. Mangler det ene, er
         noden lukket for præcis den kunde der har købt det andet, og det
         ville ingen opdage: skærmen ville bare sige "ingen reolpladser". */
      const moduler = modulerFor(grundsti(r.sti));
      if (!moduler.length) continue;
      for (const modul of moduler) {
        if (!r.udtryk.includes(`child('${modul}').val() === true`)) {
          mangler.push(`${r.sti}/${r.felt} (mangler ${modul})`);
        }
      }
    }
    assert.deepEqual(mangler, [], "noder fra tabellen uden modulklausul — de er åbne for en kunde der ikke har købt modulet.");
  });

  it("ingen node UDEN FOR tabellen har en modulklausul", () => {
    /* ⚠ DEN HER RETNING ER LIGE SÅ VIGTIG. Kom klausulen ved et uheld på
       personale eller kpi, ville en kunde uden Bemanding ikke kunne se sine
       egne medarbejdere — og det er base, ikke et modul. */
    const forkert = [];
    for (const r of alleRegler()) {
      if (typeof r.udtryk !== "string") continue;
      if (modulerFor(grundsti(r.sti)).length) continue;
      if (/child\('moduler'\)/.test(r.udtryk) && !r.udtryk.includes("auth.token.udbyder")) {
        forkert.push(`${r.sti}/${r.felt}`);
      }
    }
    assert.deepEqual(forkert, [], "noder uden for tabellen har en modulklausul.");
  });

  it("de tre tvetydige noder står i basen", () => {
    /* opgaver har to arter, satser to forbrugere, fakturaer to skærme.
       Står de her, er det fordi nogen har besluttet det. */
    /* ⚠ `grundlag` kom til med fakturagrundlagets node. Det roeres af
       BOOKING (turen), WAREHOUSE (lagerafregningen) og OEKONOMI (skaermen) —
       en klausul paa eet af dem ville spaerre de to andre. */
    for (const node of ["opgaver", "satser", "fakturaer", "grundlag", "personale", "kompetencer", "kpi"]) {
      if (node === "kompetencer") continue;  /* kompetencer ER bemanding */
      assert.equal(NODE_MODUL[node], undefined, `${node} er blevet gatet af et modul.`);
    }
  });
});

describe("Et modul kunden HAR, virker som før", () => {
  it("lader ham læse og skrive", async () => {
    const db = somAdmin(MED);
    await assertSucceeds(get(ref(db, `tenants/${MED}/koeretoejer`)));
    await assertSucceeds(get(ref(db, `tenants/${MED}/facility`)));
    await assertSucceeds(
      set(ref(db, `tenants/${MED}/facility/aktiver/fa2`),
          { navn: "Port 4", art: "port", status: "idrift", lokationId: "l1" })
    );
  });
});

describe("En tenant UDEN moduler-node har alt", () => {
  it("fejler åbent", async () => {
    /* En kunde oprettet før listen fandtes skal ikke stå med et system der
       afviser alt — han har betalt. */
    const db = somAdmin(INGEN);
    for (const node of Object.keys(MODUL_NODER).flatMap((m) => MODUL_NODER[m])) {
      if (node.includes("/")) continue;   /* sensitive/* kræver egne perms */
      await assertSucceeds(get(ref(db, `tenants/${INGEN}/${node}`)));
    }
  });
});

describe("Et fravalgt modul lukker sine noder", () => {
  it("afviser LÆSNING på hver node modulet ejer", async () => {
    /* ⚠ BÅDE LÆSNING OG SKRIVNING — beslutning 34. Det betyder at kunden
       ikke kan hente sine egne data ud gennem appen, og det er derfor et
       fravalg skal aftales frem for at klikkes. */
    const db = somAdmin(UDEN);
    const noder = Object.keys(NODE_MODUL).filter((n) => !n.includes("/"));
    assert.ok(noder.length >= 10, `kun ${noder.length} noder at prøve`);
    for (const node of noder) {
      await assertFails(get(ref(db, `tenants/${UDEN}/${node}`)));
    }
  });

  it("afviser SKRIVNING", async () => {
    const db = somAdmin(UDEN);
    await assertFails(
      set(ref(db, `tenants/${UDEN}/facility/aktiver/fa9`),
          { navn: "Port 9", art: "port", status: "idrift", lokationId: "l1" })
    );
    await assertFails(
      set(ref(db, `tenants/${UDEN}/kunder/k9`), { navn: "Ny", division: "gods", aktiv: true })
    );
  });

  it("lader BASEN være i fred", async () => {
    /* ⚠ personale, kpi, opgaver, satser og fakturaer er ikke et moduls
       ejendom. Lukkede de med, ville en kunde der kun har Dashboard ikke
       kunne se sine egne medarbejdere. */
    const db = somAdmin(UDEN);
    for (const node of ["personale", "kpi", "opgaver", "satser", "fakturaer", "brugere", "roller"]) {
      await assertSucceeds(get(ref(db, `tenants/${UDEN}/${node}`)));
    }
  });

  it("giver stadig ikke adgang til en ANDEN tenant", async () => {
    /* En ny klausul i 27 regler er præcis den slags ændring der kan komme
       til at løsne noget andet. Punkt 1 i den låste rækkefølge står fast. */
    const db = somAdmin(UDEN);
    await assertFails(get(ref(db, `tenants/${MED}/koeretoejer`)));
    await assertFails(get(ref(db, `tenants/${MED}/personale`)));
  });
});
