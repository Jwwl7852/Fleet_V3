/* test/navne.test.mjs
 * De gamle modulnavne må ikke stå tilbage i det brugeren SER.
 *
 * ⚠ HVORFOR DEN HER FINDES: FORDI JEG ERKLÆREDE MIG FÆRDIG TO GANGE FOR
 * TIDLIGT.
 *
 * Seks omdøbninger blev lavet i træk — Flåde→Fleet, Indkøb→Procure,
 * Turtlebooking→Unitbooking, Booking & Opgaver→Planning, Bemanding→Workforce,
 * Værkstedskalender→Driftskalender, og køretøj→enhed oveni. Hver gang
 * fandt jeg forekomsterne med et grep, rettede dem, og sagde færdig.
 *
 * Grep'et var forkert. For at sortere IDENTIFIKATORER fra udelukkede jeg
 * linjer der indeholdt `koeretoej` — og labelet stod på præcis de linjer:
 *
 *     { key: "koeretoejIder", label: "Køretøj", ... }
 *
 * Filteret spiste det jeg ledte efter. Ti strenge stod tilbage i fem filer,
 * heriblandt kolonnen i Forslag, feltet i Indkøb og **CSV-eksportens
 * "Pr. køretøj"** i prislisten. De blev fundet ved at klikke skærmen — den
 * dyreste måde — og ikke af en prøve.
 *
 * ⚠ FORSKELLEN PÅ EN KOMMENTAR OG EN STRENG ER HELE POINTEN.
 *
 * Kommentarerne beholder med vilje de gamle ord: de står ved siden af
 * `src/moduler/flaade/`, noden `koeretoejer` og feltet `koeretoejId`, og en
 * kommentar der sagde "Fleet" om en mappe der hedder `flaade`, ville pege
 * forkert. Et grep kan ikke se den forskel. Derfor STRIPPER prøven
 * kommentarerne først — blok, linje og JSX — og læser kun resten.
 *
 * Identifikatorerne er uberørte og skal blive det: noden `koeretoejer`,
 * `koeretoejId`, `koeretoejIder`, `KOERETOEJ_STATUS`, arten
 * `koeretoejsskade`, aksen `koeretoej` og prisfeltet `prKoeretoejOere`. De
 * står i reglerne, i `.indexOn`, i udstedte tokens og i to prislister som et
 * låst fakturagrundlag peger på. Prøven leder derfor efter de DANSKE ord med
 * æ/ø/å — dem der kun kan stå i en visningsstreng.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Kilden uden kommentarer, med linjenumrene bevaret.
 *
 * ⚠ STRENGE SKAL OVERLEVE. `"Indkøb → Fakturaer"` er en visningsstreng og
 * skal fanges; `/* Indkøb → Fakturaer *\/` er en kommentar og skal ikke.
 * Derfor er den her en rigtig lille scanner og ikke en regex: en regex der
 * fjerner `/* … *\/` fjerner også indholdet af en streng der rummer `/*`.
 */
export function udenKommentarer(kilde) {
  let ud = "";
  let i = 0;
  const n = kilde.length;
  let iStreng = null;
  let iSkabelon = false;

  while (i < n) {
    const c = kilde[i];
    const to = kilde.slice(i, i + 2);

    if (iStreng) {
      if (c === "\\") { ud += "  "; i += 2; continue; }
      if (c === iStreng) iStreng = null;
      ud += c; i += 1; continue;
    }
    if (iSkabelon) {
      if (c === "\\") { ud += "  "; i += 2; continue; }
      if (c === "`") iSkabelon = false;
      ud += c; i += 1; continue;
    }
    if (to === "/*") {
      const slut = kilde.indexOf("*/", i + 2);
      const stop = slut < 0 ? n : slut + 2;
      /* Erstat med mellemrum, ikke ingenting — ellers flytter linjenumrene
         sig, og en fejlmelding peger på den forkerte linje. */
      for (let j = i; j < stop; j += 1) ud += kilde[j] === "\n" ? "\n" : " ";
      i = stop; continue;
    }
    if (to === "//") {
      while (i < n && kilde[i] !== "\n") { ud += " "; i += 1; }
      continue;
    }
    if (c === '"' || c === "'") { iStreng = c; ud += c; i += 1; continue; }
    if (c === "`") { iSkabelon = true; ud += c; i += 1; continue; }
    ud += c; i += 1;
  }
  return ud;
}

/* De gamle navne, som de ville stå i en visningsstreng. */
const FORAELDEDE = [
  "Turtlebooking",
  "Booking & Opgaver",
  "Værkstedskalender",
  "Køretøj",
  "køretøj",
];

/**
 * ⚠ UNDTAGELSERNE ER NAVNGIVNE, IKKE ET MØNSTER.
 *
 * En regel der undtog "alt i demo-filer" ville også undtage en skærm der
 * læste et demosæt. Hver undtagelse står med fil, ord og grund — og en ny
 * kræver at man skriver grunden ned.
 */
const UNDTAGET = [
  {
    fil: "src/fleet/demo-etaper.js", ord: "køretøj",
    hvorfor: "console.warn til en udvikler, ved siden af `koeretoejId`. "
      + "Dev-beskeder følger kodens navne, ikke skærmens.",
  },
];

/**
 * ⚠ `Flåde` STÅR IKKE PÅ FORAELDEDE-LISTEN, OG DET ER MED VILJE.
 *
 * "Flåden er ikke en liste af biler" står stadig på Fleet-skærmen, fordi
 * sætningen handler om FLÅDEN — det almindelige danske ord — og ikke om
 * modulet. Samme skel som "et indkøb" under Procure og "Bemandingsplan"
 * under Workforce. Sætter man `Flåde` på listen, tvinger man en undtagelse
 * pr. sætning, og så holder listen op med at betyde noget.
 *
 * Første udgave af denne prøve HAVDE en undtagelse for netop den fil — og
 * prøven nedenfor væltede den, fordi ordet ikke stod der uden for en
 * kommentar. Det var undtagelseslisten der virkede.
 */


const erUndtaget = (fil, linje) =>
  UNDTAGET.some((u) => fil === u.fil && linje.includes(u.ord));

function kildefiler() {
  return execSync("git ls-files src", { encoding: "utf8" })
    .trim().split("\n").filter((f) => /\.(js|jsx)$/.test(f));
}

describe("De gamle navne står ikke i det brugeren ser", () => {
  it("⚠ HAR INGEN FORÆLDET VISNINGSSTRENG UDEN FOR EN KOMMENTAR", () => {
    const fund = [];
    for (const fil of kildefiler()) {
      const linjer = udenKommentarer(readFileSync(fil, "utf8")).split("\n");
      linjer.forEach((linje, nr) => {
        if (erUndtaget(fil, linje)) return;
        for (const ord of FORAELDEDE) {
          if (linje.includes(ord)) {
            fund.push(`${fil}:${nr + 1}  ${ord}  →  ${linje.trim().slice(0, 90)}`);
            return;
          }
        }
      });
    }
    assert.deepEqual(fund, [],
      "Forældede visningsnavne tilbage:\n" + fund.join("\n")
      + "\n\nEr det en kommentar, står den ikke her — prøven stripper dem."
      + "\nEr det med vilje, skal den i UNDTAGET med en grund.");
  });

  /* Prøven skal kunne fejle. Kan den ikke se en streng den ser på, siger den
     grønt om et grep der ikke leder. */
  it("⚠ KAN SE EN STRENG OG OVERSER EN KOMMENTAR", () => {
    const medStreng = 'const a = { label: "Køretøj" };';
    assert.ok(udenKommentarer(medStreng).includes("Køretøj"),
      "en visningsstreng skal overleve strippet");

    for (const k of ['/* Køretøj */', '// Køretøj', '/* fler\n   Køretøj\n*/']) {
      assert.ok(!udenKommentarer(k).includes("Køretøj"), `kommentar slap igennem: ${k}`);
    }
  });

  it("bevarer linjenumrene gennem strippet", () => {
    const kilde = 'a\n/* to\n   linjer */\n{ label: "Køretøj" }\n';
    const linjer = udenKommentarer(kilde).split("\n");
    assert.equal(linjer.length, 5);
    assert.ok(linjer[3].includes("Køretøj"), "labelet skal stå på linje 4");
  });

  /* Identifikatorerne er dyre og må ikke omdøbes ved et uheld. Står de ikke
     længere, er der sket en omdøbning ingen har målt konsekvensen af. */
  it("⚠ RØRER IKKE IDENTIFIKATORERNE", () => {
    const kilde = kildefiler().map((f) => readFileSync(f, "utf8")).join("\n");
    for (const id of [
      "koeretoejer", "koeretoejId", "koeretoejIder", "KOERETOEJ_STATUS",
      "koeretoejsskade", "prKoeretoejOere",
    ]) {
      assert.ok(kilde.includes(id), `identifikatoren ${id} findes ikke længere`);
    }
  });

  /* Hver undtagelse skal pege på en fil der findes, og faktisk indeholde
     ordet. Ellers bliver listen et sted hvor gamle aftaler samler sig. */
  it("har ingen undtagelse der er blevet overflødig", () => {
    const filer = new Set(kildefiler());
    for (const u of UNDTAGET) {
      assert.ok(filer.has(u.fil), `UNDTAGET peger på ${u.fil}, som ikke findes`);
      assert.ok(u.hvorfor && u.hvorfor.length > 20, `${u.fil} mangler en grund`);
      const tekst = udenKommentarer(readFileSync(u.fil, "utf8"));
      assert.ok(tekst.includes(u.ord),
        `${u.fil} indeholder ikke længere "${u.ord}" — fjern undtagelsen`);
    }
  });
});
