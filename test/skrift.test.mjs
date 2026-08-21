/* test/skrift.test.mjs
 * Skriftstørrelser er beslutninger, ikke tal.
 *
 * HVORFOR FILEN FINDES. `fleet.css` havde 24 forskellige størrelser på 119
 * steder, otte af dem med halve pixels: 8,5 · 9,5 · 10,5 · 11,5 · 12,5 · 13,5
 * · 14,5. Ingen havde besluttet en skala — hver skærm valgte et tal der så
 * rigtigt ud dér, og forskellen mellem 12 og 12,5 px er ikke en beslutning
 * nogen har truffet, det er en der er gledet ind.
 *
 * Det er samme fejl som rå farver var før beslutning 10, og den løses på
 * samme måde: ét sted, med et navn. Beslutning 48.
 *
 * ⚠ OG DEN VAR IKKE KUN GRIM. 68 % af tegnene på dashboardet stod på 13 px
 * eller mindre, 37 % på 12,5 eller mindre — og `.fc-table th`, hver eneste
 * tabeloverskrift i programmet, stod på 10,5.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CSS = new URL("../src/fleet/fleet.css", import.meta.url);

/** Kommentarerne væk, linjeskiftene bliver — så linjenumre stadig passer. */
const udenKommentarer = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) || []).length));

/**
 * De regler der MED VILJE har et rå tal, og hvorfor.
 *
 * Som FORVENTEDE_RAA_FARVER i designtokenprøven: listen er ikke en
 * undtagelsesliste man føjer til for at få grønt lys — den er en påstand om
 * at hver enkelt er efterprøvet. Kan du ikke skrive begrundelsen, hører
 * størrelsen i skalaen.
 */
const UDEN_FOR_SKALAEN = [
  /* ⚠ MÆRKATET ER 100 × 200 mm PÅ EN ZEBRA 420, og modulbredden er afledt af
     203 dpi — se beslutning 46. Skriften dér er ikke en skærmstørrelse man
     kan skalere; den er tilpasset en etiket der findes fysisk. Vokser den,
     falder teksten ud over kanten, og det opdages først på papiret. */
  ".fc-maerkat",
  ".fc-stregkode-tal",
  /* ⚠ DET ER IKKE PIXELS. Donutens to tekster står inde i en SVG med en
     viewBox på 42 enheder, så `font-size: 6` betyder seks FIGURENHEDER og
     skalerer med figuren. Sætter man et px-token ind, bliver tallet pludselig
     dobbelt så stort som hele donuten. */
  ".fc-donut-tal",
  ".fc-donut-note",
];

/** Selektoren er det der står efter sidste kommentar. */
const rensSel = (raa) =>
  raa.replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " ");

/** Hver regel med en rå font-size i px, med linjenummer. */
function raaStoerrelser(css) {
  const fund = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = rensSel(m[1]);
    for (const t of m[2].matchAll(/font-size:\s*([\d.]+)px/g)) {
      const linje = css.slice(0, m.index + m[0].length).split("\n").length;
      fund.push({ sel, px: parseFloat(t[1]), linje });
    }
  }
  return fund;
}

test("Skriftstørrelser er tokens, ikke tal spredt i filen", () => {
  const css = udenKommentarer(readFileSync(CSS, "utf8"));
  /* :root er hvor skalaen bor — den skal netop have tallene. */
  const udenRod = css.replace(/:root\{[\s\S]*?\n\}/, "");

  const syndere = raaStoerrelser(udenRod)
    .filter((f) => !UDEN_FOR_SKALAEN.some((p) => f.sel.startsWith(p)))
    .map((f) => `${f.sel} — ${f.px}px (linje ${f.linje})`);

  assert.deepEqual(
    syndere, [],
    "En rå font-size uden for :root. Filen havde 24 forskellige størrelser " +
    "på 119 steder, fordi hver skærm valgte et tal der så rigtigt ud dér — " +
    "og så er 12 og 12,5 px to lejligheder til at være uenige om det samme. " +
    "Brug et trin i skalaen (--fc-t-xs … --fc-t-4xl). Hører størrelsen " +
    "virkelig uden for skalaen, så skriv reglen på UDEN_FOR_SKALAEN med " +
    "begrundelsen:\n  " + syndere.join("\n  ")
  );
});

test("Skalaen har de trin beslutning 48 kender", () => {
  const css = readFileSync(CSS, "utf8");
  const rod = css.match(/:root\{[\s\S]*?\n\}/)[0];
  const trin = Object.fromEntries(
    [...rod.matchAll(/--fc-t-([\w-]+):\s*([\d.]+)px/g)].map((m) => [m[1], parseFloat(m[2])])
  );
  assert.deepEqual(trin, {
    tight: 11, xs: 12, s: 13, m: 14, l: 15, xl: 17, "2xl": 21, "3xl": 25, "4xl": 34,
  });
});

test("⚠ INTET TRIN HAR HALVE PIXELS", () => {
  /* Otte af de gamle størrelser havde det. En halv pixel er ikke en
     beslutning — det er et tal nogen har justeret til det så rigtigt ud på
     én skærm, og den næste skærm afrunder den anden vej. */
  const css = readFileSync(CSS, "utf8");
  const rod = css.match(/:root\{[\s\S]*?\n\}/)[0];
  for (const m of rod.matchAll(/--fc-t-([\w-]+):\s*([\d.]+)px/g)) {
    assert.equal(parseFloat(m[2]) % 1, 0, `--fc-t-${m[1]} har en halv pixel`);
  }
});

test("⚠ INTET TRIN GÅR UNDER 11 px", () => {
  /* Gulvet er en påstand: under det er tekst ikke længere noget man læser,
     det er noget man gætter. 11 er forbeholdt de steder hvor bredden er
     fysisk låst — gitterets kolonner — og står derfor alene i `tight`. */
  const css = readFileSync(CSS, "utf8");
  const rod = css.match(/:root\{[\s\S]*?\n\}/)[0];
  const alle = [...rod.matchAll(/--fc-t-[\w-]+:\s*([\d.]+)px/g)].map((m) => parseFloat(m[1]));
  assert.equal(Math.min(...alle), 11);
});

test("⚠ BRØDTEKSTEN ER 14, IKKE 13", () => {
  /* Det er hele grunden til at etapen findes. Tabelceller, knapper og
     inputfelter hænger på --fc-t-m; skrider den tilbage til 13, er de 119
     steder rettet uden at problemet er løst. */
  const css = udenKommentarer(readFileSync(CSS, "utf8"));
  const rod = css.match(/:root\{[\s\S]*?\n\}/)[0];
  assert.match(rod, /--fc-t-m:\s*14px/);

  /* ⚠ SAMME PARSER SOM OVENFOR, ikke en regex på navnet. Første forsøg søgte
     efter `.fc-btn … {` i hele filen og fandt en LÆNGERE selektor der
     tilfældigvis endte på det samme — og påstod så at knappen manglede sit
     trin, mens den stod helt rigtigt. En prøve der leder det forkerte sted,
     er værre end ingen. */
  const blokke = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) blokke[rensSel(m[1])] = m[2];

  for (const sel of [".fc-table td", ".fc-btn", ".fc-a"]) {
    const krop = blokke[sel];
    assert.ok(krop !== undefined, `${sel} findes ikke som egen regel længere`);
    assert.doesNotMatch(krop, /font-size:\s*[\d.]+px/, `${sel} har stadig et råt tal`);
    assert.match(krop, /font-size:var\(--fc-t-m\)/,
      `${sel} skal stå på brødtekstens trin`);
  }
});
