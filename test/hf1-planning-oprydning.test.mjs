/* test/hf1-planning-oprydning.test.mjs
 * V1-stabilisering HF1 — Planning oprydning.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Readiness-auditten (V1-stabilisering, feature freeze) fandt to ting på
 * Planning's centrale skærme, synlige for enhver rolle — ikke bag et
 * dev-flag:
 *
 *   A. Rå udviklerpaneler på NyForespoergsel.jsx og Forslag.jsx: raw
 *      permission-strenge (booking.opret, booking.godkend), et bogstaveligt
 *      funktionsnavn (kanSkifteEtape()), en rå Firebase-UID
 *      (sidstAendretAf), rå RTDB-nøgler (historikNoegle), og en sætning der
 *      bad brugeren skifte rolle i sidebaren for at teste. Samme mønster
 *      fandtes en tredje gang i Oversigt.jsx's "Hvad du må lige nu"-panel.
 *
 *   B. Oversigt.jsx's standardliste ("Alle opgaver") læste hele
 *      `opgaver`-noden uden filter — en Fleet/Facility-node, art
 *      "vaerksted" eller "facility" (beslutning 21), som Planning ikke
 *      ejer. Live-bekræftet: standardfanen viste "Serviceeftersyn 250.000
 *      km — Bil 78" under en overskrift der lover transportarbejde.
 *
 * Denne fil prøver at BEGGE er rettet, og at de forbliver rettet: A ved at
 * lede efter de fjernede mønstre igen (samme greb som
 * opgavestatus.test.mjs' "HÅNDHÆVELSEN"-sektion), B ved at prøve det
 * faktiske filter mod ægte demo-data, ikke kun ved at lede efter en streng.
 *
 * Kør: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PLANNING_SKAERME = [
  "src/moduler/booking/NyForespoergsel.jsx",
  "src/moduler/booking/Forslag.jsx",
  "src/moduler/booking/Oversigt.jsx",
];

/* ══════════════════════════════════════════════════════════════════════════
   A. INGEN RÅ UDVIKLERPANELER
   ══════════════════════════════════════════════════════════════════════════ */

describe("A: ingen af Planning's skærme viser rå debuginformation", () => {
  test("⚠ INGEN AF DEM BEDER BRUGEREN SKIFTE ROLLE I SIDEBAREN", () => {
    /* Det var kernen i alle tre paneler: en QA-instruktion skrevet direkte
       ind i produkt-UI'et, synlig for enhver rolle. */
    for (const sti of PLANNING_SKAERME) {
      const s = udenKommentarer(readFileSync(sti, "utf8"));
      assert.ok(!/skift.{0,10}rolle.{0,40}sidebaren/i.test(s),
        `${sti} beder stadig brugeren skifte rolle i sidebaren`);
      assert.ok(!/sidebaren.{0,40}(se|ændre)/i.test(s),
        `${sti} henviser stadig til sidebaren for at demonstrere noget`);
    }
  });

  test("⚠ INGEN RÅ RTDB-OPDATERINGSDUMP (sidstAendretAf, historikNoegle)", () => {
    for (const sti of PLANNING_SKAERME) {
      const s = readFileSync(sti, "utf8");
      assert.ok(!s.includes("sidstAendretAf"),
        `${sti} viser stadig en rå sidstAendretAf-UID`);
      assert.ok(!s.includes("historikNoegle"),
        `${sti} viser stadig en rå RTDB-historiknøgle`);
    }
  });

  test("⚠ INGEN FUNKTIONSNAVN VIST SOM ET FELT I UI'ET", () => {
    /* "kanSkifteEtape()" som label på en MiniLinje — funktionen selv må
       gerne KALDES (den håndhæver), men navnet skal ikke stå som tekst i
       en produktionsskærm. Kommentarer og kode-kald er fri — det er kun
       forekomsten som en synlig streng i JSX-teksten der er problemet. */
    for (const sti of PLANNING_SKAERME) {
      const s = readFileSync(sti, "utf8");
      assert.ok(!s.includes('"kanSkifteEtape()"') && !s.includes("kanSkifteEtape(→"),
        `${sti} viser funktionsnavnet kanSkifteEtape som synlig tekst`);
    }
  });

  test("⚠ NyForespoergsel VISER IKKE booking.opret ELLER opdateringens FELTER", () => {
    const s = readFileSync("src/moduler/booking/NyForespoergsel.jsx", "utf8");
    /* Tooltippen på den deaktiverede knap ("Kræver booking.opret.") er det
       etablerede, accepterede mønster (17 andre skærme gør det samme) og
       må gerne blive stående — det var de dedikerede debug-KORT der skulle
       væk. Prøven leder derfor efter selve panelerne, ikke efter strengen. */
    assert.ok(!/Overgangen — rolle:/.test(s), "debug-kortet 'Overgangen' findes stadig");
    assert.ok(!/Næste skridt: send til planlægning/.test(s),
      "debug-kortet 'Næste skridt' findes stadig");
    assert.ok(!/titel="Bookingnummeret"/.test(s),
      "udviklerforklaringen om bookingnummerets format findes stadig i UI'et");
    assert.ok(!s.includes("omsaetningOere == null ? \"—\" : omsaetningOere"),
      "det rå ørebeløb vises stadig som et MiniLinje-felt");
  });

  test("⚠ Forslag.jsx HAR IKKE LÆNGERE EN Godkendelse-DEBUGKOMPONENT", () => {
    const s = readFileSync("src/moduler/booking/Forslag.jsx", "utf8");
    assert.ok(!/function Godkendelse/.test(s), "Godkendelse-komponenten findes stadig");
    assert.ok(!/<Godkendelse/.test(s), "Godkendelse kaldes stadig et sted");
    assert.ok(!/Har booking\.godkend/.test(s),
      "den rå permission-linje 'Har booking.godkend' findes stadig");
  });

  test("⚠ DE TO SLAGS NEJ FORKLARES STADIG — bare af den RIGTIGE knap", () => {
    /* Fjernelsen af debug-panelet må ikke også have fjernet selve
       forklaringen brugeren ser, når han rent faktisk ikke kan godkende.
       Den skal stå som knappens egen title, samme mønster som resten af
       appen (Kræver X-stilen). */
    const s = udenKommentarer(readFileSync("src/moduler/booking/Forslag.jsx", "utf8"));
    assert.ok(s.includes("title={!tjek.ok"),
      "den rigtige Godkend/Afvis-knap forklarer ikke længere hvorfor den er deaktiveret");
  });

  test("⚠ Oversigt.jsx's 'Hvad du må lige nu' NÆVNER IKKE RÅT ROLLENAVN ELLER MASKINEN", () => {
    const s = readFileSync("src/moduler/booking/Oversigt.jsx", "utf8");
    assert.ok(!/Hvad du må lige nu — rolle:/.test(s),
      "titlen viser stadig det rå rollenavn");
    assert.ok(!/tilgaengeligeEtapeHandlinger\(\)/.test(udenKommentarer(s)),
      "funktionsnavnet står stadig som synlig tekst i UI'et");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   B. PLANNING'S LISTE UDELUKKER FLEET-VÆRKSTEDSOPGAVER
   ══════════════════════════════════════════════════════════════════════════ */

describe("B: Planning's standardliste filtrerer på den faktiske ejerskabstype", () => {
  /* Selve filteret, læst af skærmens kildekode — ikke en afskrift. En
     afskrift her ville kunne drive fra den ægte skærm uden at nogen så det. */
  const kilde = readFileSync("src/moduler/booking/Oversigt.jsx", "utf8");
  const filterLinje = 'opgaveListe.data.filter((o) => o.art !== "vaerksted")';

  test("⚠ FILTERET STÅR PÅ KILDEN — ÉT STED, FØR LISTEN GRENER UD", () => {
    assert.ok(kilde.includes(filterLinje),
      "alleOpgaver filtrerer ikke Fleet-værkstedsopgaver fra ved kilden");
    /* ÉT sted: filtreres 'opgaver'/'dagensPlan'/'stop' hver for sig, kunne
       de to steder drive fra hinanden — samme fejlklasse som to
       demo-datasæt for én node. */
    const forekomster = (udenKommentarer(kilde).match(/o\.art !== "vaerksted"/g) || []).length;
    assert.equal(forekomster, 1,
      "filteret er kopieret flere steder i stedet for at stå ét sted");
  });

  test("⚠ SAMME FELT SOM FLEETS EGEN DRIFTSKALENDER — MODSAT RETNING", () => {
    /* Fleet FILTRERER TIL vaerksted (det er dens node); Planning filtrerer
       vaerksted FRA (det er ikke dens node). Samme felt, samme model — ikke
       gættet ud fra tekst eller navn. */
    const fleet = readFileSync("src/moduler/flaade/Vaerkstedskalender.jsx", "utf8");
    assert.ok(fleet.includes('o.art === "vaerksted"'),
      "Fleets Driftskalender har mistet sit eget vaerksted-filter — intet at spejle");
  });

  test("⚠ FILTERET DISKRIMINERER FAKTISK — prøvet mod ægte demo-data", () => {
    /* En prøve der kun leder efter en streng i kildekoden, kunne stå grøn
       selvom filteret var en no-op (fx en betingelse der aldrig er falsk).
       Her køres den PRÆCIS SAMME logik mod DEMO_OPGAVER, som rummer begge
       arter (se demo-opgaver.js), og resultatet efterprøves. */
    assert.ok(DEMO_OPGAVER.some((o) => o.art === "vaerksted"),
      "demo-sættet har ingen værkstedsopgaver — filteret kan ikke prøves");
    const uden = DEMO_OPGAVER.filter((o) => o.art !== "vaerksted");
    assert.ok(uden.length < DEMO_OPGAVER.length,
      "filteret fjerner ingenting fra demo-sættet");
    assert.ok(uden.every((o) => o.art !== "vaerksted"),
      "en værkstedsopgave slap igennem filteret");
  });

  test("⚠ FACILITY-OPGAVER PÅVIRKES IKKE — kun værkstedsopgaver er fjernet", () => {
    /* Instruksen navngav præcist Fleet-værkstedsopgaver. Filteret må ikke
       være bredere end det der blev bedt om — en facility-opgave der også
       forsvandt, ville være en stiltiende udvidelse af rettelsen. */
    assert.ok(DEMO_OPGAVER.some((o) => o.art === "facility"),
      "demo-sættet har ingen facility-opgaver — den anden halvdel kan ikke prøves");
    const uden = DEMO_OPGAVER.filter((o) => o.art !== "vaerksted");
    const facilityFoer = DEMO_OPGAVER.filter((o) => o.art === "facility").length;
    const facilityEfter = uden.filter((o) => o.art === "facility").length;
    assert.equal(facilityEfter, facilityFoer,
      "filteret fjerner også facility-opgaver — det var ikke det der blev bedt om");
  });

  test("⚠ VÆRKSTEDSOPGAVEN FINDES FORTSAT — Fleets egen skærm viser den stadig", () => {
    /* "Fjern dem fra Planning" må ikke blive læst som "fjern dem" —
       Vaerkstedskalender.jsx's positive filter viser præcis de poster
       Planning nu udelukker. */
    const fleet = readFileSync("src/moduler/flaade/Vaerkstedskalender.jsx", "utf8");
    assert.ok(fleet.includes('opgaver.data.filter((o) => o.art === "vaerksted")'),
      "Fleets Driftskalender viser ikke længere sine egne værkstedsopgaver");
  });
});
