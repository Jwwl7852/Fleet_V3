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
  indberetninger: { i1: { art: "braendstof", forloeb: "afsluttet",
    oprettetAf: "u-x", oprettetMs: 1786000000000 } },
  /* ⚠ lokationId SKAL pege paa en lokation der findes — reglen slaar den op.
     Uden lokationer her fejler skrivningen paa VALIDERING og ligner en
     modulspaerring. Prøven ville sige det rigtige af den forkerte grund. */
  facility: {
    lokationer: { l1: { navn: "Depot Kolding", type: "depot" } },
    aktiver: { fa1: { navn: "Port 3", art: "port", status: "idrift", lokationId: "l1" } },
  },
  /* ⚠ SAMME GRUND SOM lokationId OVENFOR: indkoeb.leverandoerId slaar op i
     leverandoerer/, og uden en post her ville skrivningen fejle paa
     VALIDERING og ligne en modulspaerring. */
  leverandoerer: { lev1: { navn: "Leverandoer", kategori: "braendstof", aktiv: true } },
  indkoeb: { i1: { dato: "2026-08-01", leverandoerId: "lev1", vare: "Diesel", antal: 1000, prisPrEnhedOere: 1200, fakturastatus: "modtaget" } },
  lagre: { l1: { navn: "Hovedlager" } },
  bookinger: { b1: { tilstand: "kladde" } },
  etaper: { e1: { tilstand: "aaben" } },
  reservationer: { r1: { fra: 1, til: 2 } },
  fravaer: { f1: { personId: "p1", fra: 1, til: 2 } },
  kompetencer: { k1: { personId: "p1", art: "adr" } },
  kunder: { k1: { navn: "Kunde", aktiv: true } },
};

/* Tenant-grenen af regelfilen, til at se om en node er en BEHOLDER. */
const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules.tenants.$tenantId;

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
         Unitbooking og Warehouse, fordi transportkasser og kundegods står
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
       personale, ville en kunde uden Bemanding ikke kunne se sine egne
       medarbejdere — og det er base, ikke et modul.

       ⚠ ÉN UNDTAGELSE, OG DEN ER IKKE EN LEMPELSE. `kpi` er ikke ÉT moduls
       ejendom — den er en beholder hvis BØRN hver har sit modul, og reglen
       slår modulet op DYNAMISK med `child($domaene)`. Et opslag på en
       wildcard gater altså ikke noden; det gater hvert domæne for sig, og
       de to domæner uden modul (`opgaver`, `afvigelser`) står undtaget i
       selve udtrykket. Se beslutning 44 og KPI_DOMAENE i kpi-aggregering.js.

       En klausul på et FAST modulnavn ville stadig være en fejl — også på
       kpi — og den fanges nedenfor. */
    const forkert = [];
    for (const r of alleRegler()) {
      if (typeof r.udtryk !== "string") continue;
      if (modulerFor(grundsti(r.sti)).length) continue;
      if (!/child\('moduler'\)/.test(r.udtryk)) continue;
      if (r.udtryk.includes("auth.token.udbyder")) continue;
      /* Slår den modulet op på en wildcard, er det en beholder der gater sine
         børn hver for sig — ikke noden der er gatet. */
      const dynamisk = /child\('moduler'\)\.child\(\$[A-Za-z]+\)/.test(r.udtryk);
      if (dynamisk && r.sti.startsWith("kpi")) continue;
      forkert.push(`${r.sti}/${r.felt}`);
    }
    assert.deepEqual(forkert, [], "noder uden for tabellen har en modulklausul.");
  });

  it("de FIRE tvetydige noder står i basen", () => {
    /* opgaver har to arter, satser to forbrugere, fakturaer to skærme.
       Står de her, er det fordi nogen har besluttet det. */
    /* ⚠ `grundlag` kom til med fakturagrundlagets node. Det roeres af
       BOOKING (turen), WAREHOUSE (lagerafregningen) og OEKONOMI (skaermen) —
       en klausul paa eet af dem ville spaerre de to andre. */
    /* ⚠ `reservationer` KOM TIL I BESLUTNING 92, og den var den dyreste af
       dem: fire kilder mødes i noden (beslutning 4), og den stod som
       BOOKINGENS. Målt på DEV-kunden `nordvest` — Fleet, Facility,
       Bemanding, Procure, ingen Planning — 37 reservationer, og ikke én
       fra en booking: 18 værksted, 9 facility-sag, 10 fravær. Alle låst
       for ham, mens `opgaveplanlaeg` skrev dem med admin-SDK. */
    for (const node of ["opgaver", "satser", "fakturaer", "grundlag", "reservationer",
                        "personale", "kompetencer", "kpi"]) {
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

      /**
       * ⚠ EN BEHOLDER LÆSES ÉT NIVEAU NEDE — beslutning 107.
       *
       * `stemplinger` har ingen egen `.read`: den ville kaskadere og lade
       * enhver chauffør se hver kollegas timer, så klausulen står på
       * `$personId`. Et opslag på beholderen afvises derfor for ALLE, også
       * admin — præcis som `kpi/` (beslutning 44).
       *
       * Prøven springer den ikke over; den spørger på det niveau der KAN
       * læses. En beholder der blev sprunget over, ville være en node ingen
       * prøvede.
       */
      const regel = REGLER[node];
      const wildcard = Object.keys(regel || {}).find((k) => k.startsWith("$"));
      const sti = (!regel?.[".read"] && wildcard)
        ? `${node}/enPerson` : node;
      await assertSucceeds(get(ref(db, `tenants/${INGEN}/${sti}`)));
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
      set(ref(db, `tenants/${UDEN}/kunder/k9`), { navn: "Ny", aktiv: true })
    );
  });

  it("lader BASEN være i fred", async () => {
    /* ⚠ personale, opgaver, satser og fakturaer er ikke et moduls ejendom.
       Lukkede de med, ville en kunde der kun har Dashboard ikke kunne se sine
       egne medarbejdere. */
    const db = somAdmin(UDEN);
    for (const node of ["personale", "opgaver", "satser", "fakturaer", "brugere",
                        "reservationer"]) {
      await assertSucceeds(get(ref(db, `tenants/${UDEN}/${node}`)));
    }
  });

  /**
   * ⚠ OG DEN HER ER DEN DER BÆRER BESLUTNING 92.
   *
   * `reservationer` stod som bookingens, og en kunde med Fleet og Facility
   * men uden Planning kunne derfor ikke læse ÉN eneste af sine egne
   * reservationer — heller ikke dem hans værksted og hans facility-sager
   * havde skrevet. Hele Driftskalenderen og Servicekalenderen fik
   * permission-denied på data hans egne moduler producerede.
   *
   * Prøven ovenfor siger at noden er læsbar. Den her siger hvorfor det
   * betyder noget: den lægger en VÆRKSTEDSRESERVATION ind og kræver at han
   * kan se den.
   */
  it("⚠ EN VÆRKSTEDSRESERVATION ER LÆSBAR UDEN PLANNING-MODULET", async () => {
    await miljoe.withSecurityRulesDisabled(async (ctx) => {
      await set(
        ref(ctx.database(), `tenants/${UDEN}/reservationer/koeretoej/kt-1/res-1`),
        { fra: 1e12, til: 1e12 + 3600000, kilde: { type: "vaerksted", id: "o-1" } });
    });
    const db = somAdmin(UDEN);
    await assertSucceeds(get(ref(db, `tenants/${UDEN}/reservationer/koeretoej/kt-1`)));
  });

  it("⚠ kpi ER IKKE LÆNGERE ÉN NODE — basen er de to domæner uden modul", async () => {
    /* `kpi` stod i listen ovenfor, og den kan ikke længere læses som node:
       .read ligger på domænet med sin modulklausul (beslutning 44). Basen er
       ikke væk — den er blevet PRÆCIS. `opgaver` og `afvigelser` spænder
       flere moduler og er derfor åbne for enhver i tenanten; resten følger
       modulet. */
    const db = somAdmin(UDEN);
    await assertFails(get(ref(db, `tenants/${UDEN}/kpi`)));
    for (const d of ["opgaver", "afvigelser"]) {
      await assertSucceeds(get(ref(db, `tenants/${UDEN}/kpi/current/${d}`)));
    }
    await assertFails(get(ref(db, `tenants/${UDEN}/kpi/current/oekonomi`)));
  });

  it("giver stadig ikke adgang til en ANDEN tenant", async () => {
    /* En ny klausul i 27 regler er præcis den slags ændring der kan komme
       til at løsne noget andet. Punkt 1 i den låste rækkefølge står fast. */
    const db = somAdmin(UDEN);
    await assertFails(get(ref(db, `tenants/${MED}/koeretoejer`)));
    await assertFails(get(ref(db, `tenants/${MED}/personale`)));
  });
});
