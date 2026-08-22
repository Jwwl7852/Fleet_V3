/* test/forslagform.test.mjs
 * Forslagene er NØGLET, ikke en array — beslutning 58, håndhævet i 76.
 *
 * ⚠ HVORFOR FILEN FINDES. `kanSkifteEtape()` talte forslagene med
 * `post.forslag?.length > 0`. I noden er de nøglet på deres eget id, så
 * `.length` er `undefined` — og `undefined > 0` er falsk.
 *
 * **En disponent med tre forslag på etapen fik "Der skal være mindst ét
 * forslag."** Tre overgange var dermed lukkede i produktion: *Send forslag*,
 * *Foreslå matchet tur* og *Send nye forslag*.
 *
 * ⚠ OG DET VIRKEDE I DEMO. Demo-sættet bærer forslagene som en ARRAY, hvor
 * `.length` giver det rigtige tal. Fejlen kunne derfor ikke ses på den skærm
 * man kigger på først — kun med rigtige data. Det er den farligste form: en
 * fejl der er usynlig præcis dér hvor man leder.
 *
 * ⚠ OG DEN RAMTE SERVEREN. `etapeskift` kalder den SAMME funktion på det den
 * læser af noden. Skærmen og serveren var enige — begge tog fejl.
 *
 * Beslutning 58 skrev fælden ned ordret: *"Brug `forslagListe()`; den er det
 * ene sted formen oversættes."* Den stod der, og koden gjorde noget andet.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { kanSkifteEtape, forslagListe } from "../src/fleet/booking-state.js";
import { permStrengFraRolle } from "../src/fleet/permissions.js";

const DISPONENT = permStrengFraRolle("disponent");

/** Som noden holder dem: nøglet på forslagets eget id. */
const nodeform = { id: "et-1", tilstand: "afventerPlan", forslag: { f1: { nr: 1 }, f2: { nr: 2 } } };
/** Som demo-sættet holder dem. */
const arrayform = { id: "et-1", tilstand: "afventerPlan", forslag: [{ nr: 1 }, { nr: 2 }] };

describe("forslagListe() er det ene sted formen oversættes", () => {
  test("⚠ DEN TÅLER BEGGE FORMER — og giver det samme tal", () => {
    assert.equal(forslagListe(nodeform).length, 2);
    assert.equal(forslagListe(arrayform).length, 2);
  });

  test("en etape uden forslag giver en tom liste, ikke undefined", () => {
    assert.deepEqual(forslagListe({}), []);
    assert.deepEqual(forslagListe({ forslag: null }), []);
    assert.deepEqual(forslagListe(null), []);
  });

  /* ⚠ OG NØGLEN BLIVER TIL ET id. RTDB har ingen arrays, og `$andet: false`
     forbyder et `id` inde i posten — så nøglen ER identiteten. Uden det kan
     `valgtForslagId` ikke pege på noget. */
  test("⚠ NØGLEN BLIVER POSTENS id", () => {
    const [a, b] = forslagListe(nodeform);
    assert.equal(a.id, "f1");
    assert.equal(b.id, "f2");
  });
});

describe("En overgang der kræver et forslag, ser dem i noden", () => {
  /**
   * ⚠ DEN VIGTIGSTE PRØVE I FILEN. Den fejlede før rettelsen — og den fejlede
   * KUN på nodeform, hvilket er hele pointen.
   */
  test("⚠ NODEFORM GODKENDES — den blev afvist før", () => {
    const r = kanSkifteEtape(nodeform, "afventerKoord", DISPONENT, {});
    assert.equal(r.ok, true,
      `nodeform afvises stadig: ${r.aarsag} — se forslagListe() i pruvOvergang()`);
  });

  test("arrayform godkendes stadig — demo-sættet må ikke gå i stykker", () => {
    assert.equal(kanSkifteEtape(arrayform, "afventerKoord", DISPONENT, {}).ok, true);
  });

  /* ⚠ OG KRAVET GÆLDER STADIG. Rettelsen må ikke være at fjerne porten:
     en etape UDEN forslag skal stadig afvises, ellers kunne "Send forslag"
     sende ingenting. */
  test("⚠ EN ETAPE UDEN FORSLAG AFVISES STADIG", () => {
    const r = kanSkifteEtape({ id: "et-1", tilstand: "afventerPlan" },
      "afventerKoord", DISPONENT, {});
    assert.equal(r.ok, false);
    assert.match(r.aarsag, /mindst ét forslag/);
  });
});

describe("Ingen tæller forslag med .length", () => {
  const udenKommentarer = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  const filer = (rod, ud = []) => {
    for (const n of readdirSync(rod)) {
      const p = join(rod, n);
      if (statSync(p).isDirectory()) filer(p, ud);
      else if (/\.(jsx?|mjs)$/.test(n)) ud.push(p);
    }
    return ud;
  };

  /**
   * ⚠ HELE `src/` — ikke kun de fem steder der blev rettet.
   *
   * `.length` på et nøglet objekt er `undefined`, og `undefined > 0`,
   * `undefined || 0` og `!undefined` giver alle sammen noget der ligner et
   * svar. Fejlen siger ikke fra; den svarer bare forkert. Derfor er det
   * MØNSTRET der forbydes, ikke de fem forekomster.
   */
  test("⚠ INGEN .length PÅ ET forslag-FELT I src/", () => {
    /**
     * ⚠ MØNSTRET RAMMER FELTADGANG, IKKE ET VARIABELNAVN.
     *
     * `Forslag.jsx` har en lokal `const forslag = aktiveForslag(etape)` — og
     * DEN er en array, så `forslag.length` er rigtigt dér. Det farlige er
     * `<noget>.forslag.length`, hvor `<noget>` er en etape fra noden.
     *
     * Første udgave af prøven matchede begge og pegede på den rigtige kode.
     * En prøve der råber ad det korrekte, bliver slået fra — og så er vagten
     * væk uden at nogen har besluttet det.
     */
    const fundet = [];
    for (const f of filer("src")) {
      const s = udenKommentarer(readFileSync(f, "utf8"));
      for (const m of s.matchAll(/[.?]\s*forslag\s*\??\.length\b/g)) {
        fundet.push(`${f.replace(/\\/g, "/")}: ${m[0].trim()}`);
      }
    }
    assert.deepEqual(fundet, [],
      ".length på et nøglet objekt er undefined — brug forslagListe(). "
      + "Se beslutning 58 og 76.");
  });

  /* ⚠ OG I FUNKTIONERNE. `etapeskift` kalder kanSkifteEtape() på nodeform,
     så en kopi dér ville lukke overgangen på serveren igen. */
  test("⚠ HELLER IKKE I functions/index.js", () => {
    const s = udenKommentarer(readFileSync("functions/index.js", "utf8"));
    const fundet = [...s.matchAll(/\bforslag\??\.length\b/g)].map((m) => m[0]);
    assert.deepEqual(fundet, []);
  });
});
