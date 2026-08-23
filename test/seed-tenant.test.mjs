/* test/seed-tenant.test.mjs
 * Provisioneren kan pege på en kundes tenant — beslutning 72.
 *
 * ⚠ HVORFOR DEN KAN DET. `nordvest` (Nordvest Transport ApS) stod tom: kun
 * `_findes`, `moduler` og `virksomhed`. Skærmene skrev *"Nøgletallene er ikke
 * aggregeret for den her virksomhed endnu"* — rigtigt, men uden data er der
 * heller ikke noget at aggregere, og man kan hverken se om tallene passer
 * eller hvordan designet ser ud med indhold i.
 *
 * ⚠ OG TO TING SKAL VÆRE ANDERLEDES END I DEV. Der oprettes ingen brugere —
 * DEV-konti med kendte adgangskoder hører ikke i en kundes tenant — og seedet
 * FØLGER KUNDENS MODULER.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { modulForNode, SEED } from "../scripts/provisioner-dev.mjs";
import { NODE_MODUL } from "../src/fleet/moduler.js";

const REGLER = readFileSync("firebase.rules.json", "utf8");
const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const KILDE = udenKommentarer(readFileSync("scripts/provisioner-dev.mjs", "utf8"));

describe("Modulet læses ud af reglerne", () => {
  /**
   * ⚠ IKKE EN LISTE I SCRIPTET. Reglens `.read` bærer allerede klausulen
   * `moduler').child('<modul>')`, og en liste her ville være den samme
   * kendsgerning to steder — den ene ville drive. Det er nøjagtig den fejl
   * beslutning 70 fjernede en hel akse for.
   */
  test("⚠ MAPPINGEN LÆSES, DEN SKRIVES IKKE AF", () => {
    for (const [node, modul] of [
      ["koeretoejer", "flaade"],
      ["bookinger", "booking"],
      ["kasser", "unitbooking"],
      ["varer", "warehouse"],
      ["fravaer", "bemanding"],
      ["indkoeb", "indkoeb"],
      ["kunder", "kunder"],
      /* ⚠ `beholdning` STOD IKKE HER, OG DET KOSTEDE SEKS POSTER.
         Opslaget fandt før `"<node>": {` som TEKST og tog det FØRSTE træf —
         og `"beholdning"` findes to steder i regelfilen: som node under
         tenanten, og som et FELT i `forbrugsvarer`
         (`"beholdning": { ".validate": "newData.isNumber()" }`). Feltet står
         først, har ingen `.read`, og svaret blev `null` — altså "hører til
         alle". DEV-kunden `nordvest` har ikke Warehouse og fik alligevel
         seks beholdningsposter seedet.

         Et anker der findes to steder, for sjette gang i dette repo — denne
         gang i den funktion der skulle beskytte mod netop den slags.
         Reglerne læses nu som JSON. Se beslutning 100. */
      ["beholdning", "warehouse"],
      ["enheder", "warehouse"],
      ["plukordrer", "warehouse"],
      ["optaellinger", "warehouse"],
    ]) {
      assert.equal(modulForNode(node, REGLER), modul, `${node} spærres ikke af ${modul}`);
    }
  });

  /**
   * ⚠ OG EN UNDERSTI ARVER SIN FORÆLDERS KLAUSUL.
   *
   * `facility/lokationer` har ingen egen `.read`; den er dækket af
   * `facility`s. En `.read` kaskaderer NED i RTDB — et barn kan tilføje
   * adgang, aldrig fjerne den — så nærmeste `.read` opad er svaret.
   */
  test("⚠ facility/lokationer ARVER facility", () => {
    assert.equal(modulForNode("facility/lokationer", REGLER), "facility");
    assert.equal(modulForNode("facility/aktiver", REGLER), "facility");
  });

  /**
   * ⚠ TABELLEN OG REGLERNE SKAL SIGE DET SAMME.
   *
   * `NODE_MODUL` i moduler.js er sandheden reglerne følger
   * (rules.moduler.test.mjs), og provisioneren læser reglerne. Er de to
   * uenige, seeder vi noget kunden ikke kan læse — eller springer noget over
   * han har betalt for. Uenigheden var netop `beholdning`.
   */
  test("⚠ PROVISIONERENS OPSLAG ER ENIGT MED NODE_MODUL", () => {
    const uenige = [];
    for (const [node, modul] of Object.entries(NODE_MODUL)) {
      const fraRegler = modulForNode(node, REGLER);
      const forventet = Array.isArray(modul) ? modul : [modul];
      if (!forventet.includes(fraRegler)) {
        uenige.push(`${node}: tabellen siger ${forventet.join("/")}, reglerne ${fraRegler}`);
      }
    }
    assert.deepEqual(uenige, [],
      "provisioneren og NODE_MODUL er uenige om hvem der ejer en node:\n  "
      + uenige.join("\n  "));
  });

  /**
   * ⚠ NOGLE NODER HØRER TIL ALLE, OG DET ER MED VILJE.
   *
   * `personale` deles mellem Fleet og Workforce; `opgaver` spænder flere
   * moduler — samme carve-out som KPI-domænerne `opgaver` og `afvigelser`
   * (beslutning 33). Fik de en modulklausul, ville en kunde med kun Facility
   * ikke kunne se sine egne servicebesøg.
   */
  test("⚠ personale OG opgaver HØRER TIL ALLE", () => {
    assert.equal(modulForNode("personale", REGLER), null);
    assert.equal(modulForNode("opgaver", REGLER), null);
  });

  test("en node der ikke findes i reglerne, giver null frem for at kaste", () => {
    assert.equal(modulForNode("findesIkke", REGLER), null);
  });

  /**
   * ⚠ HVER SEEDET NODE SKAL KUNNE SLÅS OP. Kan en node ikke findes i
   * regelfilen, er den enten ikke reguleret — hvilket ville være et hul —
   * eller stavet forkert her, og så ville den blive seedet til enhver kunde.
   */
  test("⚠ HVER NODE I SEED STÅR I REGELFILEN", () => {
    const ukendte = [];
    for (const { node } of SEED) {
      const rod = node.split("/")[0];
      if (!new RegExp(`"${rod}":\\s*\\{`).test(REGLER)) ukendte.push(node);
    }
    assert.deepEqual(ukendte, [],
      "en seedet node står ikke i firebase.rules.json — enten et hul i reglerne "
      + "eller en stavefejl der seeder den til enhver kunde");
  });
});

describe("En kundes tenant behandles anderledes end dev's", () => {
  /**
   * ⚠ INGEN BRUGERE. DEV-brugerne har kendte adgangskoder fra `.env.local` og
   * findes for at prøve claims-kæden i en browser. Oprettedes de i en kundes
   * tenant, ville kunden have syv konti han ikke kender — med fulde perms.
   */
  test("⚠ DER OPRETTES INGEN BRUGERE PÅ EN KUNDES TENANT", () => {
    assert.match(KILDE, /for \(const b of erDev \?/,
      "brugerløkken kører uanset hvilken tenant der provisioneres");
  });

  /**
   * ⚠ SEEDET MÅ IKKE OPRETTE EN TENANT. `kundeopret` skriver også posten i
   * `udbyder/kunder`, som natjobbet henter sin tenantliste fra. En tenant
   * oprettet af et seed ville få data og ALDRIG få nøgletal — og det ville
   * ligne en fejl i aggregeringen.
   */
  test("⚠ EN UKENDT TENANT AFVISES FREM FOR AT BLIVE OPRETTET", () => {
    assert.match(KILDE, /findes ikke\. Opret den med kundeopret/,
      "seedet opretter en tenant uden om kundeopret");
  });

  test("⚠ SEEDET FØLGER KUNDENS MODULER", () => {
    assert.match(KILDE, /if \(!harModulet\(node\)\) \{/,
      "seedet skriver noder kunden ikke kan læse");
    /* Og udeladelsen rapporteres — en udeladelse man kan se, er et valg. */
    assert.match(KILDE, /sprunget over — kunden har ikke modulet/);
  });

  /**
   * ⚠ OG DE AFLEDTE POSTER FØLGER MED.
   *
   * Målt på nordvest, ikke antaget: første kørsel skrev **13 reservationer
   * med `kilde.type: "booking"`** — på etaper der ikke var seedet, fordi
   * kunden ikke har Booking-modulet. Tretten enheder så OPTAGET ud af en tur
   * ingen kunne slå op. Dertil en bookingtæller på 318 hos en kunde uden
   * bookinger: hans første booking ville hedde BKG-2026-00319, som om der lå
   * tre hundrede før den.
   *
   * **En afledt post arver ikke sit modulfilter af sig selv.**
   */
  test("⚠ RESERVATIONER OG TÆLLER FØLGER OGSÅ MODULET", () => {
    assert.match(KILDE, /harModulet\("etaper"\) \? DEMO_ETAPER : \[\]/,
      "etapernes reservationer skrives uanset om etaperne blev seedet");
    /* ⚠ MÅLT PÅ LØKKEN, IKKE PÅ ÉN SERIE. Her stod
       `harModulet("bookinger") ? DEMO_BOOKINGER : []` ord for ord, og prøven
       faldt da Procure fik sin egen serie og de to blev til ét regnestykke
       over en tabel — den sagde "bookingtælleren sættes uanset modulet",
       hvilket ikke var sandt. Det den skal vogte, er at HVER serie er
       modulspærret, ikke hvordan den ene er skrevet. */
    assert.match(KILDE, /harModulet\(modul\) \? poster : \[\]/,
      "tællerne sættes uanset om kunden har modulet");
  });

  /**
   * ⚠ OG HVER NUMMERSERIE SKAL STÅ I TABELLEN.
   *
   * Tælleren er en TÆLLER, ikke en optælling (beslutning 8) — men den skal
   * kende det højeste nummer der allerede er udstedt, ellers begynder serien
   * forfra under numre der findes. Det gjaldt bookingerne, og det gælder
   * bestillingerne: demo-ordrerne bærer BST-2026-00040 og opefter.
   *
   * En serie der seedes uden at komme i tabellen, opdages først den dag nogen
   * opretter den første rigtige post — og så er nummeret allerede udstedt.
   */
  test("⚠ HVER SEEDET NUMMERSERIE HAR EN TÆLLER", () => {
    const serier = KILDE.slice(KILDE.indexOf("const SERIER = ["),
      KILDE.indexOf("];", KILDE.indexOf("const SERIER = [")));
    assert.match(serier, /praefiks: "BKG"/, "bookingserien står ikke i tabellen");
    assert.match(serier, /praefiks: ORDRE_PRAEFIKS/,
      "bestillingsserien står ikke i tabellen — BST-numrene begynder forfra");
  });
});

describe("Beskeden om manglende nøgletal er ikke forældet", () => {
  const UI = readFileSync("src/fleet/ui.jsx", "utf8");

  /**
   * ⚠ DEN SAGDE *"en aggregering der endnu ikke er bygget"* — og den ER
   * bygget: `kpiaggregering` kører hver nat, og `beregnKpi()` regner 44
   * felters værd. Beskeden stod på den skærm en ny kunde ser FØRST, og den
   * fortalte ham at systemet manglede noget der fandtes.
   */
  test("⚠ DEN PÅSTÅR IKKE AT AGGREGERINGEN MANGLER", () => {
    assert.ok(!/aggregering der endnu ikke er bygget/.test(UI),
      "beskeden siger stadig at aggregeringen ikke er bygget");
    assert.match(UI, /beregnes <b>hver nat<\/b>/,
      "beskeden siger ikke hvornår tallene så kommer");
  });

  /**
   * ⚠ OG DEN SIGER STADIG HVORFOR DET IKKE ER NUL. Det er hele grunden til at
   * tilstanden findes: "0 aktive enheder" ville være en PÅSTAND om at kunden
   * ingen har, og en ny kunde med fjorten ville tro systemet var i stykker.
   *
   * ⚠ OG DET HEDDER ENHEDER, IKKE KØRETØJER. Første udgave af den her tekst
   * skrev "0 aktive køretøjer" — og `test/navne.test.mjs` fangede det med det
   * samme. Fleets ting er en ENHED; ordet blev skiftet 37 steder, og en ny
   * streng må ikke lægge det tilbage.
   */
  test("den forklarer stadig hvorfor nul ville være forkert", () => {
    assert.match(UI, /ville være en påstand om at virksomheden ingen har/);
    assert.ok(!/0 aktive køretøjer/.test(UI), "det hedder enheder");
  });
});
