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
 * ⚠ HF1b — DEN FØRSTE RETTELSE AF B VAR FOR BRED. `o.art !== "vaerksted"`
 * lukkede værkstedsopgaver ude, men lod facility-serviceopgaver blive
 * stående — Planning ejer ingen af de to lige meget. Den VERIFICEREDE
 * model (opgaver.js): `ALLE_OPGAVE_ARTER` er nøjagtig ["vaerksted",
 * "facility"], og Planning/transport-ejerskab udtrykkes slet ikke som en
 * værdi af `opgaver.art` — det udtrykkes ved hvilken NODE posten bor i.
 * Transportarbejde bor i `bookinger`/`etaper` og har ikke engang et
 * `art`-felt (se demo-bookinger.js); det har aldrig rørt `opgaver`
 * (beslutning 16, "DE TO NODER FORBLIVER TO"). `PLANNING_OPGAVE_ARTER` i
 * booking-state.js er derfor en ÆGTE tom liste, positivt filtreret — ikke
 * "alt undtagen vaerksted". Oversigt.jsx importerer den; den defineres ikke
 * lokalt, så skærm og prøve altid ser samme konstant.
 *
 * Denne fil prøver at BEGGE dele er rettet, og at de forbliver rettet: A
 * ved at lede efter de fjernede mønstre igen (samme greb som
 * opgavestatus.test.mjs' "HÅNDHÆVELSEN"-sektion), B ved at prøve den
 * ÆGTE PLANNING_OPGAVE_ARTER — importeret, ikke en afskrift — mod ægte
 * demo-data, bookinger OG opgaver.
 *
 * Kør: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import { DEMO_BOOKINGER } from "../src/fleet/demo-bookinger.js";
import { ALLE_OPGAVE_ARTER } from "../src/fleet/opgaver.js";
import { PLANNING_OPGAVE_ARTER } from "../src/fleet/booking-state.js";

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
   B. PLANNING'S LISTE FILTRERER POSITIVT PÅ PLANNING-EJEDE TYPER
   ══════════════════════════════════════════════════════════════════════════ */

describe("B: Planning's standardliste filtrerer positivt, ikke 'alt undtagen vaerksted'", () => {
  const kilde = readFileSync("src/moduler/booking/Oversigt.jsx", "utf8");
  const udenKomm = udenKommentarer(kilde);

  test("⚠ DEN BREDE NEGATIVE FILTRERING ER VÆK", () => {
    /* Den forrige rettelse (o.art !== "vaerksted") lukkede kun værksted ude
       og lod facility blive stående — Planning ejer ingen af de to. */
    assert.ok(!udenKomm.includes('o.art !== "vaerksted"'),
      "den brede 'alt undtagen vaerksted'-filtrering er stadig der");
  });

  test("⚠ FILTERET ER POSITIVT, MOD DEN ÆGTE ALLOWLISTE — ÉT STED", () => {
    assert.ok(kilde.includes("opgaveListe.data.filter((o) => PLANNING_OPGAVE_ARTER.includes(o.art))"),
      "alleOpgaver filtrerer ikke positivt mod PLANNING_OPGAVE_ARTER");
    assert.match(kilde, /import \{[^}]*PLANNING_OPGAVE_ARTER[^}]*\}\s*from "\.\.\/\.\.\/fleet\/booking-state\.js"/,
      "PLANNING_OPGAVE_ARTER importeres ikke fra booking-state.js — en lokal afskrift kan drive");
    /* ÉT sted: filtreres 'opgaver'/'dagensPlan'/'stop' hver for sig, kunne
       de to steder drive fra hinanden — samme fejlklasse som to
       demo-datasæt for én node. */
    const forekomster = (udenKomm.match(/PLANNING_OPGAVE_ARTER\.includes\(o\.art\)/g) || []).length;
    assert.equal(forekomster, 1,
      "filteret er kopieret flere steder i stedet for at stå ét sted");
  });

  test("⚠ ALLOWLISTEN ER VERIFICERET TOM — IKKE GÆTTET ELLER OVERSET", () => {
    /* Den ÆGTE konstant, importeret — ikke en afskrift af dens værdi, som
       kunne drive fra den rigtige. */
    assert.deepEqual(PLANNING_OPGAVE_ARTER, [],
      "PLANNING_OPGAVE_ARTER er ikke tom — verificér om den nye art faktisk er Planning-ejet");
    /* Og selve grunden til at den ER tom: ingen af de arter der faktisk
       findes i opgaver.js, er Planning-ejet. Denne assertion er den der
       fanger det, hvis nogen en dag føjer en art til opgaver.js uden at
       tage stilling til om den hører her. */
    assert.deepEqual(ALLE_OPGAVE_ARTER, ["vaerksted", "facility"],
      "opgaver.js har fået en ny art — tag stilling til om den er Planning-ejet, " +
      "og opdatér PLANNING_OPGAVE_ARTER og denne prøve bevidst");
  });

  /* ⚠ PLANNING-TYPE INKLUDERET. Planning-ejede poster er ikke en art i
     `opgaver` — de er `bookinger`/`etaper`, en helt anden node, som aldrig
     går gennem opgave-filteret. DEMO_BOOKINGER har ikke engang et art-felt
     (se demo-bookinger.js): de kan strukturelt ikke forveksles med en
     opgave. Prøven bekræfter at Planning's EGEN kilde (bookingListe) læses
     uændret og uden om opgave-allowlisten. */
  test("⚠ PLANNING-TYPE (BOOKINGER) INKLUDERES STADIG — UDEN OM OPGAVE-FILTERET", () => {
    assert.ok(DEMO_BOOKINGER.length > 0,
      "demo-sættet har ingen bookinger — Planning-typen kan ikke prøves");
    assert.ok(DEMO_BOOKINGER.every((b) => !("art" in b)),
      "en booking har fået et art-felt — den kan nu forveksles med en opgave");
    assert.ok(udenKomm.includes("const alleBookinger = bookingListe.data;"),
      "bookinger læses ikke længere direkte fra deres egen kilde");
    assert.ok(!/alleBookinger.*PLANNING_OPGAVE_ARTER|bookingListe\.data\.filter/.test(udenKomm),
      "bookinger filtreres nu gennem opgave-allowlisten — de skal aldrig gøre det");
  });

  test("⚠ VAERKSTED EKSKLUDERET — prøvet mod ægte demo-opgaver", () => {
    assert.ok(DEMO_OPGAVER.some((o) => o.art === "vaerksted"),
      "demo-sættet har ingen værkstedsopgaver — filteret kan ikke prøves");
    const inkluderet = DEMO_OPGAVER.filter((o) => PLANNING_OPGAVE_ARTER.includes(o.art));
    assert.ok(inkluderet.every((o) => o.art !== "vaerksted"),
      "en værkstedsopgave slap igennem den positive filtrering");
  });

  test("⚠ FACILITY EKSKLUDERET — prøvet mod ægte demo-opgaver", () => {
    /* Netop den halvdel HF1 overså. */
    assert.ok(DEMO_OPGAVER.some((o) => o.art === "facility"),
      "demo-sættet har ingen facility-opgaver — filteret kan ikke prøves");
    const inkluderet = DEMO_OPGAVER.filter((o) => PLANNING_OPGAVE_ARTER.includes(o.art));
    assert.ok(inkluderet.every((o) => o.art !== "facility"),
      "en facility-opgave slap igennem den positive filtrering");
  });

  test("⚠ RESULTATET AF FILTERET PÅ DET FULDE DEMO-SÆT ER TOMT", () => {
    /* Den direkte konsekvens af at ingen art er Planning-ejet: "Alle
       opgaver"-fanen viser ingen rækker. Det er ikke en fejl — det er
       modellen. Prøven gør konsekvensen eksplicit, så den ikke opdages som
       en overraskelse. */
    const inkluderet = DEMO_OPGAVER.filter((o) => PLANNING_OPGAVE_ARTER.includes(o.art));
    assert.deepEqual(inkluderet, []);
  });

  test("⚠ VÆRKSTEDS- OG FACILITY-OPGAVEN FINDES FORTSAT I DERES EGNE SKÆRME", () => {
    /* "Fjern dem fra Planning" må ikke læses som "fjern dem". Det positive
       filter der VISER værkstedsopgaven i dens eget modul, står uændret. */
    const fleet = readFileSync("src/moduler/flaade/Vaerkstedskalender.jsx", "utf8");
    assert.ok(fleet.includes('opgaver.data.filter((o) => o.art === "vaerksted")'),
      "Fleets Driftskalender viser ikke længere sine egne værkstedsopgaver");
  });
});
