/* src/fleet/stregkode128.js
 * Code 128 subset B — den rigtige, ikke en der ligner.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR FILEN FINDES
 *
 * Transportlabelen skrev sin stregkode som TEKST. Et menneske kan læse den, og
 * det var derfor fejlen overlevede: mærkatet så komplet ud. En scanner kan
 * ikke, og et mærkat der ikke kan scannes, er hele grunden til at der er et
 * mærkat. Det er samme slags fejl som en tom tabel der ligner et tomt lager —
 * den ser rigtig ud dér hvor man kigger.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR CODE 128 OG IKKE NOGET SIMPLERE
 *
 * Koden er `BKG-2026-00317-CRR-100248` — 25 tegn. Code 39 kan de tegn, men
 * bruger ni elementer pr. tegn mod Code 128's elleve pr. PAR af cifre; koden
 * ville blive godt dobbelt så bred og ikke kunne være på et mærkat. Code 128
 * er desuden det fragtbranchen scanner i forvejen (GS1).
 *
 * Subset B alene, ikke C. C komprimerer cifferpar, men koden her skifter
 * mellem bogstaver og cifre hele vejen, så et skift frem og tilbage ville
 * koste mere end det sparer — og hvert skift er et sted at tage fejl.
 *
 * ---------------------------------------------------------------------------
 * ⚠ TABELLEN ER PRØVET MED EN FREMMED AFKODER
 *
 * En tabel skrevet af efter standarden kan være internt konsistent og alligevel
 * forkert — og så ville en prøve, der afkoder med MIN egen tabel, være grøn af
 * den forkerte grund. Derfor er outputtet afkodet med zxing, en uafhængig
 * implementering, og sammenlignet med inputtet. Se test/stregkode128.test.mjs.
 *
 * INGEN IMPORTS. Som reolplads.js og transportlabel.js.
 * ---------------------------------------------------------------------------
 */

/**
 * Standardens 107 mønstre. Hvert tal er bredden af et element, og de veksler
 * bjælke, mellemrum, bjælke, … med start på en BJÆLKE. Alle er elleve moduler
 * brede undtagen stoppet, som er tretten.
 */
const MOENSTRE = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

export const START_B = 104;
export const STOP = 106;

/** Subset B dækker ASCII 32–126. Alt andet kan ikke kodes — og gættes ikke. */
export const kanKodes = (tekst) =>
  typeof tekst === "string" && tekst.length > 0 &&
  [...tekst].every((t) => t.charCodeAt(0) >= 32 && t.charCodeAt(0) <= 126);

/**
 * Kontrolcifret. `(start + Σ værdi × plads) mod 103`, hvor pladsen tælles fra
 * 1 og starttegnet ikke tæller med som plads.
 *
 * ⚠ EN FORKERT VÆGT GIVER EN KODE DER SER RIGTIG UD. Scanneren afviser den
 * tavst, og så tror man at scanneren er i stykker.
 *
 * ⚠ OG DEN FÅR IKKE SIN GODKENDELSE AF ET TAL SKREVET AF. Første udgave af
 * hovedet her henviste til "standardens eksempel PJJ123C → 54" — et tal jeg
 * huskede, ikke et jeg havde slået op, og funktionen svarer 55. Beviset er i
 * stedet, at zxing AFKODER outputtet: afkoderen efterprøver selv kontrolcifret
 * og afviser koden, hvis det er forkert.
 */
export function kontrolciffer(tekst) {
  let sum = START_B;
  [...tekst].forEach((t, i) => {
    sum += (t.charCodeAt(0) - 32) * (i + 1);
  });
  return sum % 103;
}

/** Kodeværdierne: start, tegnene, kontrolciffer, stop. */
export function vaerdier(tekst) {
  if (!kanKodes(tekst)) return null;
  return [
    START_B,
    ...[...tekst].map((t) => t.charCodeAt(0) - 32),
    kontrolciffer(tekst),
    STOP,
  ];
}

/**
 * Modulerne som en streng af 1 (bjælke) og 0 (mellemrum).
 *
 * ⚠ DEN STILLE ZONE ER IKKE MED. Den er hvidt papir omkring koden — mindst ti
 * moduler i hver ende — og hører til i det der TEGNER koden, ikke i koden selv.
 * Uden den kan en scanner ikke finde begyndelsen. Se svgFor().
 */
export function moduler(tekst) {
  const koder = vaerdier(tekst);
  if (!koder) return null;

  let ud = "";
  for (const kode of koder) {
    const moenster = MOENSTRE[kode];
    [...moenster].forEach((bredde, i) => {
      /* Lige indeks er bjælke, ulige er mellemrum — hvert mønster starter på
         en bjælke. */
      ud += (i % 2 === 0 ? "1" : "0").repeat(Number(bredde));
    });
  }
  return ud;
}

/** Bjælkerne som {fra, bredde} i moduler — det SVG'et tegner. */
export function bjaelker(tekst) {
  const m = moduler(tekst);
  if (!m) return null;

  const ud = [];
  let i = 0;
  while (i < m.length) {
    if (m[i] === "0") { i += 1; continue; }
    let bredde = 0;
    while (i + bredde < m.length && m[i + bredde] === "1") bredde += 1;
    ud.push({ fra: i, bredde });
    i += bredde;
  }
  return ud;
}

/** Stille zone i moduler, i hver ende. Standarden siger mindst ti. */
export const STILLE_ZONE = 10;

/**
 * Kodens bredde i moduler, stille zone inklusive — så den der tegner den, kan
 * regne et viewBox uden at kende mønstrene.
 */
export function bredde(tekst) {
  const m = moduler(tekst);
  return m ? m.length + STILLE_ZONE * 2 : null;
}
