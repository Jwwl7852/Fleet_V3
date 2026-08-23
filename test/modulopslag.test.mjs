/* test/modulopslag.test.mjs
 * En skærm spørger ikke om en node kunden ikke har modulet til.
 *
 * ⚠ HVORFOR FILEN FINDES. Sætningen stod i `useListe` fra begyndelsen:
 *
 *   "En node der er spærret af et fravalgt modul, ville svare
 *    permission-denied, og den afvisning er ikke en fejl brugeren skal se —
 *    den er svaret 'modulet er ikke købt'."
 *
 * Mekanismen var bygget — `hent: false` — og den blev sat **6 steder ud af
 * 36**. De 30 andre spurgte om en node et andet modul ejer, uden at vide om
 * kunden havde det:
 *
 *   Arbejdskøen         → `leverandoerer` (Procure)
 *   Disponering         → `kompetencer` (Workforce), `koeretoejer` (Fleet)
 *   Fakturacenteret     → `indkoebsordrer`, `forbrugsvarer` (Procure)
 *   Udlån               → `kunder` (Kunder & Priser)
 *
 * Beslutning 44 siger hvorfor det ikke går: *"hver sideindlæsning ville
 * udløse en håndfuld permission-denied, og en afvisning skal betyde noget."*
 * `useKpi()` løste det allerede med `laesbareDomaener()`.
 *
 * ⚠ VÆRRE END STØJ: med `auditerSom` sat skrev hver afvisning en **auditpost**
 * om nægtet adgang. En log fuld af hændelser der ikke er hændelser, gør den
 * rigtige afvisning umulig at finde.
 *
 * Rettelsen ligger ÉT sted — i `useListe` — frem for på 30 kaldsteder. Et
 * krav der skal huskes 30 gange, bliver glemt 30 gange; det var jo netop det
 * der skete.
 *
 * Se beslutning 94.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { modulerForNode, harModul, NODE_MODUL } from "../src/fleet/moduler.js";

const USELISTE = readFileSync("src/fleet/useListe.js", "utf8");

describe("Opslaget følger stien, ikke kun nodenavnet", () => {
  it("⚠ EN UNDERSTI ARVER SIT MODUL", () => {
    /* Skærmene læser `facility/lokationer`, mens tabellen har `facility`.
       Slog vi kun det fulde navn op, ville stien se ud som en base-node — og
       så ville en kunde uden Facility sende en forespørgsel der er sikker på
       at blive afvist. */
    assert.deepEqual(modulerForNode("facility/lokationer"), ["facility"]);
    assert.deepEqual(modulerForNode("facility/aktiver"), ["facility"]);
  });

  it("⚠ LÆNGSTE TRÆFFER VINDER", () => {
    /* `sensitive/indberetninger` hører til Fleet og må ikke afgøres af
       `sensitive`, som ikke er nogens. */
    assert.deepEqual(modulerForNode("sensitive/indberetninger"), ["flaade"]);
    assert.deepEqual(modulerForNode("sensitive/fravaer"), ["bemanding"]);
  });

  it("basen svarer null — ikke en tom liste", () => {
    /* `null` betyder "ingen klausul", og `[]` ville betyde "ejet af ingen
       moduler", altså aldrig læsbar. De to må ikke forveksles. */
    for (const node of ["opgaver", "satser", "fakturaer", "reservationer", "personale"]) {
      assert.equal(modulerForNode(node), null, `${node} er base`);
    }
    assert.equal(modulerForNode(""), null);
    assert.equal(modulerForNode(null), null);
  });

  it("en node med to ejere giver dem begge", () => {
    assert.deepEqual(modulerForNode("reolpladser"), ["unitbooking", "warehouse"]);
  });

  it("hver node i tabellen kan slås op på sit eget navn", () => {
    for (const node of Object.keys(NODE_MODUL)) {
      assert.ok(modulerForNode(node)?.length, `${node} kunne ikke slås op`);
    }
  });
});

describe("useListe spørger ikke om det den ikke må", () => {
  it("⚠ TJEKKET LIGGER I HOOKEN, IKKE PÅ KALDSTEDET", () => {
    assert.match(USELISTE, /modulerForNode\(node\)/,
      "useListe slår ikke nodens modul op — så skal hvert kaldsted huske det");
    assert.match(USELISTE, /harModul\(moduler, m\)/);
  });

  it("⚠ OG DEN SPØRGER SLET IKKE — den fanger ikke en afvisning bagefter", () => {
    /* Forskellen er ikke kosmetisk: en fanget afvisning har allerede kostet
       en forespørgsel og en auditpost. Grenen skal ligge FØR hentningen. */
    const i = USELISTE.indexOf("const ejere = modulerForNode(node)");
    const j = USELISTE.indexOf("dataTilstand({ harDb: Boolean(db)");
    assert.ok(i > 0 && j > 0 && i < j,
      "modultjekket ligger efter forespørgslen — så er afvisningen allerede sket");
  });

  it("⚠ `moduler` STÅR I DEPS", () => {
    /* Konteksten henter modulerne asynkront. Uden dem i deps ville hooken
       huske sit svar fra før de var kendt, og kunden ville se en tom liste
       indtil han genindlæste siden. */
    const deps = USELISTE.match(/\}, \[node, ordnPaa[^\]]*\]\);/)?.[0] || "";
    assert.match(deps, /moduler/, "moduler mangler i effektens deps");
  });

  it("en manglende moduler-node betyder ALLE — den fejler åbent", () => {
    /* Samme retning som reglerne: en kunde oprettet før feltet fandtes, skal
       ikke få tomme lister overalt. Tredje gang den fælde nævnes (56, 86, 87). */
    assert.equal(harModul(null, "indkoeb"), true);
    assert.equal(harModul(undefined, "warehouse"), true);
    assert.equal(harModul({}, "indkoeb"), false);
  });
});

/* ---- Kaldstederne ------------------------------------------------------- */

const BS = String.fromCharCode(92);

function jsxFiler(dir) {
  const ud = [];
  for (const navn of readdirSync(dir)) {
    const p = join(dir, navn);
    if (statSync(p).isDirectory()) ud.push(...jsxFiler(p));
    else if (navn.endsWith(".jsx")) ud.push(p);
  }
  return ud;
}

/** Hele kaldet, fra `useListe(` til den matchende parentes. */
function heleKaldet(kode, start) {
  let dybde = 0;
  for (let i = start; i < kode.length; i++) {
    if (kode[i] === "(") dybde += 1;
    else if (kode[i] === ")") {
      dybde -= 1;
      if (dybde === 0) return kode.slice(start, i + 1);
    }
  }
  return kode.slice(start);
}

/** Kommentarer ud — ellers tæller en NOTE om useListe() som et kaldsted. */
const udenKommentarer = (kode) => kode
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * Første led af nodenavnet — fra en streng ELLER en skabelonstreng.
 *
 * ⚠ EN SKABELONSTRENG ER I ORDEN, HVIS FØRSTE LED ER SKREVET.
 * `satser/${STANDARDGRUPPE}` kan slås op: `satser` er leddet der afgør
 * modulet, og resten er en nøgle. Det der ikke går, er `useListe(node)` med
 * hele stien i en variabel — så kan hverken hooken, prøven eller en læser se
 * hvad skærmen spørger om.
 */
const foersteLed = (tekst) =>
  tekst.match(/useListe\(\s*["'`]([a-zA-Z/]+)/)?.[1] || null;

const KALD = jsxFiler("src/moduler").flatMap((f) => {
  const sti = f.split(BS).join("/");
  const kode = udenKommentarer(readFileSync(f, "utf8"));
  return [...kode.matchAll(/useListe\(/g)].map((m) => {
    const tekst = heleKaldet(kode, m.index);
    return { sti, tekst, node: foersteLed(tekst) };
  });
});

describe("Kaldstederne", () => {
  it("der ER kald at prøve", () => {
    assert.ok(KALD.length > 50, `kun ${KALD.length} useListe-kald fundet`);
  });

  /**
   * ⚠ NODEN SKAL VÆRE EN LITERAL.
   *
   * `useListe(node)` med en variabel kan hooken ikke slå op før den kører, og
   * så kan hverken prøven her eller en læser se hvad skærmen spørger om. Det
   * er samme krav som `.indexOn` stiller: en forespørgsel man ikke kan læse
   * sig til, er en forespørgsel ingen kontrollerer.
   */
  it("⚠ HVER useListe KALDES MED ET NODENAVN MAN KAN LÆSE", () => {
    const uden = KALD.filter((k) => !k.node).map((k) => k.sti);
    assert.deepEqual(uden, [],
      "useListe kaldt med en variabel — modulopslaget kan ikke læses:\n  "
      + uden.join("\n  "));
  });

  /**
   * ⚠ OG `hent:` MÅ IKKE BRUGES TIL AT DÆMPE EN AFVISNING.
   *
   * Flaget er til noder kunden ikke har modulet til — og DET klarer hooken nu
   * selv. Står det stadig på et kaldsted, er det enten overflødigt (samme
   * svar som hooken giver) eller noget andet: en betinget hentning skærmen
   * selv styrer. Begge dele er i orden; det der ikke er, er `hent: false` på
   * en node kunden HAR, for det ville skjule en rigtig afvisning
   * (beslutning 26).
   */
  it("⚠ INGEN hent: false PÅ EN NODE I BASEN", () => {
    const mistanke = KALD
      .filter((k) => k.node && !modulerForNode(k.node))
      .filter((k) => /hent\s*:\s*false/.test(k.tekst))
      .map((k) => `${k.sti} → ${k.node}`);
    assert.deepEqual(mistanke, [],
      "hent: false på en node ingen modulklausul dækker. Så er det ikke et "
      + "fravalgt modul der skjules — det er en afvisning:\n  "
      + mistanke.join("\n  "));
  });
});
