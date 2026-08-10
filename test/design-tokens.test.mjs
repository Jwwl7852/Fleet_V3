/* test/design-tokens.test.mjs
 * Tokens i fleet.css er den eneste farvekilde — og deres værdier er en
 * beslutning, ikke en konvention.
 *
 * ⚠ HVORFOR DEN HER TEST FINDES: fordi disciplinen har holdt.
 *
 * Da testen blev skrevet, lå der 60 farveværdier i src/, og alle 60 stod i
 * fleet.css. På tværs af 33 modulfiler og 282 inline styles var der ikke én
 * hardkodet farve. Det er den tilstand man vil fastholde — og indtil nu blev
 * den kun holdt oppe af CLAUDE.md og af at nogen huskede det. Der var ingen
 * mekanik. Det første udslip ville ikke fejle noget sted.
 *
 * Testen dækker to slags drift, og den anden er den sandsynlige:
 *
 *   1. Nogen skriver #3a7bd5 i en komponent. Det er den man kommer i tanke
 *      om — og den mindst sandsynlige, fordi mønstret i repoet er så tydeligt.
 *   2. Nogen tilføjer --bc-accent-2 til fleet.css, eller retter --bc-accent
 *      fra #125bec til noget der ligner. Begge dele er lovlige efter en test
 *      der kun forbyder hex uden for fleet.css — og den anden er præcis den
 *      ændring BESLUTNINGER.md nr. 10 findes for at forhindre.
 *
 * Derfor snapshotter testen selve tokenblokken. Ændrer man en værdi, fejler
 * den med en besked om at beslutningen skal opdateres først. Så beskytter den
 * beslutningen og ikke kun konventionen.
 *
 * Testen er en LINT, ikke en enhedstest. Den læser filerne som tekst — samme
 * form som demo-kilder.test.mjs, og af samme grund.
 *
 * Afgrænsning, som er bevidst:
 *   - I js/jsx scannes STRENGLITERALER, ikke rå kildetekst. En farve kan kun
 *     stå i en streng, og afgrænsningen holder falske positiver ude:
 *     "Reserveret fra sag #1245" i Servicekalender.jsx er et sagsnummer, og
 *     #1245 er samtidig en gyldig 4-cifret CSS-hexfarve. En lint der brokker
 *     sig over et sagsnummer, bliver slået fra — og en lint man ikke kan
 *     stole på, er værre end ingen.
 *   - Den fanger ikke en farve der kommer ud af en beregning eller et import
 *     fra en fil uden for src/. Det er en anden og sjældnere drift.
 *
 * Koer: npm run test:design   (eller npm test, som koerer alt)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const TOKENFIL = join("src", "fleet", "fleet.css");

/* ------------------------------------------------------------------ *
 * Hvad der tæller som en farve
 * ------------------------------------------------------------------ */

/* Hele CSS-listen, ikke et udvalg. En delvis liste giver falsk tryghed:
   den der skriver "white" bliver fanget, den der skriver "snow" slipper. */
const NAVNGIVNE = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson
cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink
indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta
maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen`.split(/\s+/).filter(Boolean);

/* `transparent`, `currentColor`, `inherit` og `none` er IKKE farver i den her
   forstand — de udtrykker "ingen egen farve", og det er netop det man vil.
   Derfor står de ikke på listen.

   Bemærk lookarounds på de navngivne: uden dem matcher `navy` inde i
   `--fc-navy` og i `var(--fc-navy)`, og så fejler testen på den rigtige
   løsning i stedet for på den forkerte. */
/* Funktionsnotationen tages MED sine argumenter — ikke bare `rgba(`. Ellers
   kan snapshottet nedenfor ikke se forskel på to striber med hver sin farve.
   Ét niveau af indre parenteser er nok til calc() og color-mix(). */
const FARVE = new RegExp(
  "#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b" +
    "|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)" +
    "\\((?:[^()]|\\([^()]*\\))*\\)" +
    "|(?<![\\w-])(?:" + NAVNGIVNE.join("|") + ")(?![\\w-])",
  "gi"
);

/* ------------------------------------------------------------------ *
 * Filer og tekst
 * ------------------------------------------------------------------ */

function alleFiler(mappe, endelser) {
  const ud = [];
  for (const navn of readdirSync(mappe)) {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) ud.push(...alleFiler(sti, endelser));
    else if (endelser.test(navn)) ud.push(sti);
  }
  return ud;
}

const udenJsKommentarer = (tekst) =>
  tekst.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const udenCssKommentarer = (tekst) => tekst.replace(/\/\*[\s\S]*?\*\//g, "");

/* Streng- og skabelonliteraler. Grupperne er "..." , '...' og `...`. */
const STRENGE =
  /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

/* ------------------------------------------------------------------ *
 * Snapshots
 * ------------------------------------------------------------------ */

/**
 * Tokenblokken i fleet.css, præcis som den ser ud.
 *
 * Retter du en værdi her uden at rette BESLUTNINGER.md, har du flyttet en
 * beslutning i en testfil. Rækkefølgen er ligegyldig — navn og værdi er ikke.
 */
const FORVENTEDE_TOKENS = {
  "--bc-accent": "#125bec", // beslutning 10 — logoets blå. Var #1f5eff i v1.4.
  "--bc-card": "#fff",
  "--bc-line": "#e3e6ea",
  "--bc-text": "#1f2733",
  "--bc-muted": "#6b7684",
  "--bc-ok": "#1f9d55",
  "--bc-warn": "#c77700",
  "--bc-block": "#d64545",
  "--fc-navy": "#101a30",
  "--fc-navy-2": "#18243f",
  "--fc-navy-3": "#22314f",
  "--fc-accent-soft": "#e8f0ff",
  "--fc-bg": "#f5f7fa",
  "--fc-ok-bg": "#dcfce7",
  "--fc-warn-bg": "#fef3c7",
  "--fc-bad-bg": "#fee2e2",
  "--fc-info": "#2563eb",
  "--fc-info-bg": "#dbeafe",
  /* Kategoripalet, beslutning 30. Adskilt fra statusfarverne med vilje:
     genbruges de, betyder rød både "kritisk" og "den femte kategori". */
  "--fc-serie-1": "var(--bc-accent)",
  "--fc-serie-2": "#eb6834",
  "--fc-serie-3": "#1baf7a",
  "--fc-serie-4": "#eda100",
  "--fc-serie-5": "#e87ba4",
  /* Ikonaccenter, beslutning 30 — en tredje palet, adskilt fra serierne
     fordi farven her er forstærkning og ikke encoding. */
  "--fc-ikon-1": "#e34948",
  "--fc-ikon-2": "#eb6834",
  "--fc-ikon-3": "#eda100",
  "--fc-ikon-4": "#4a3aa7",
  "--fc-ikon-5": "var(--bc-accent)",
  "--fc-ikon-1-bg": "color-mix(in srgb, #e34948 13%, #fff)",
  "--fc-ikon-2-bg": "color-mix(in srgb, #eb6834 13%, #fff)",
  "--fc-ikon-3-bg": "color-mix(in srgb, #eda100 15%, #fff)",
  "--fc-ikon-4-bg": "color-mix(in srgb, #4a3aa7 12%, #fff)",
  "--fc-ikon-5-bg": "var(--fc-accent-soft)",
  "--fc-r": "12px",
  "--fc-sidebar": "216px",
  "--fc-shadow": "0 1px 2px rgba(16,26,48,.06), 0 1px 3px rgba(16,26,48,.04)",
};

/**
 * De rå farver der stadig står i fleet.css UDEN FOR :root.
 *
 * De findes, og testen lyver ikke om det: 18 unikke værdier i 42 forekomster.
 * Det er hvide tekstfarver på mørk bund, fire-fem grå til dæmpet tekst,
 * kantfarver til pillerne og nogle rgba() i striber og skygger.
 *
 * Listen er ikke en tilladelse til flere — den er en lås om dem der er. Vil du
 * tilføje en farve til fleet.css, hører den i :root som et token. Er der en
 * grund til at den ikke gør, så skriv den her sammen med grunden.
 *
 * Det er også listen over hvad der skal tokeniseres, den dag nogen tager den
 * oprydning. Den kræver en beslutning om navngivning, og den er ikke taget.
 */
const FORVENTEDE_RAA_FARVER = [
  "#bbe8cd", // kant på .fc-gk-ok
  "#c3ccda", // sidebarens linktekst
  "#c3d9fb", // kant på .fc-gk-info
  "#c9dbff", // kant på .fc-besked-ud og .fc-gk-brand
  "#cbd5e1", // sidebarens tenantnavn og knaptekst
  "#f2ddab", // kant på .fc-gk-warn
  "#f3bcbc", // kant på karantæne og .fc-gk-bad
  "#fafbfd", // hover på tabelrække og .fc-btn
  "#fff", // tekst på mørk bund og på accent
  "#8b97a8", // dæmpet tekst: stempel, tabelhoved, kalenderkolonner
  "#94a3b8", // sidebarens inaktive divisionsknap og rolletekst
  "#9aa7b8", // sidebarens underlinks og drop-feltets tekst
  "rgba(0,0,0,.16)", // striber i miljøbjælkens fare-tilstand
  "rgba(0,0,0,0)",
  "rgba(139,151,168,.05)", // striber i .fc-gk-drop
  "rgba(139,151,168,0)",
  "rgba(214,69,69,.14)", // striber i .fc-gk-konflikt
  "rgba(214,69,69,0)",
];

/* ------------------------------------------------------------------ *
 * Testene
 * ------------------------------------------------------------------ */

describe("Designtokens er den eneste farvekilde", () => {
  it("har ingen farveværdi i en js- eller jsx-fil", () => {
    const fund = [];
    for (const sti of alleFiler(SRC, /\.(js|jsx)$/)) {
      const tekst = udenJsKommentarer(readFileSync(sti, "utf8"));
      for (const s of tekst.matchAll(STRENGE)) {
        const vaerdi = s[1] ?? s[2] ?? s[3] ?? "";
        const traef = vaerdi.match(FARVE);
        if (traef) fund.push(`${sti}: ${traef.join(", ")}  i  ${JSON.stringify(vaerdi.slice(0, 60))}`);
      }
    }
    assert.deepEqual(
      fund, [],
      "En farve i en komponent kan ikke rettes ét sted, og den driver fra resten uden at " +
      "nogen ser det. Brug et token fra src/fleet/fleet.css: style={{ color: \"var(--bc-muted)\" }}.\n" +
      fund.join("\n")
    );
  });

  it("har ingen anden CSS-fil end fleet.css der sætter farver eller tokens", () => {
    const fund = [];
    for (const sti of alleFiler(SRC, /\.css$/)) {
      if (sti === TOKENFIL) continue;
      const tekst = udenCssKommentarer(readFileSync(sti, "utf8"));
      const farver = tekst.match(FARVE);
      if (farver) fund.push(`${sti}: farveværdier — ${[...new Set(farver)].join(", ")}`);
      const egne = [...tekst.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
      if (egne.length) fund.push(`${sti}: egne tokens — ${[...new Set(egne)].join(", ")}`);
    }
    assert.deepEqual(
      fund, [],
      "En ny CSS-fil er en åben dør: to filer der begge definerer designet, driver fra " +
      "hinanden, og den ene bliver ikke læst. Farver og tokens hører i " + TOKENFIL + ".\n" +
      fund.join("\n")
    );
  });

  it("har præcis ét :root i fleet.css", () => {
    const tekst = udenCssKommentarer(readFileSync(TOKENFIL, "utf8"));
    const antal = [...tekst.matchAll(/:root\s*\{/g)].length;
    assert.equal(
      antal, 1,
      `fandt ${antal} :root-blokke i ${TOKENFIL}. To tokenblokke i samme fil betyder at ` +
      "den sidste vinder, og det er ikke til at se hvilken det er."
    );
  });

  it("har præcis de tokens beslutningerne kender", () => {
    const tekst = udenCssKommentarer(readFileSync(TOKENFIL, "utf8"));
    const blok = tekst.match(/:root\s*\{([\s\S]*?)\}/);
    assert.ok(blok, `fandt ingen :root-blok i ${TOKENFIL}`);

    const faktiske = {};
    for (const d of blok[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      faktiske[d[1]] = d[2].trim().replace(/\s+/g, " ");
    }

    const tilfoejet = Object.keys(faktiske).filter((k) => !(k in FORVENTEDE_TOKENS));
    const fjernet = Object.keys(FORVENTEDE_TOKENS).filter((k) => !(k in faktiske));
    const aendret = Object.keys(FORVENTEDE_TOKENS)
      .filter((k) => k in faktiske && faktiske[k] !== FORVENTEDE_TOKENS[k])
      .map((k) => `${k}: ${FORVENTEDE_TOKENS[k]} → ${faktiske[k]}`);

    const besked = [
      "Tokenblokken i " + TOKENFIL + " er ændret.",
      "",
      tilfoejet.length ? "  TILFØJET: " + tilfoejet.join(", ") : "",
      fjernet.length ? "  FJERNET:  " + fjernet.join(", ") : "",
      aendret.length ? "  ÆNDRET:   " + aendret.join("\n            ") : "",
      "",
      "Et token er en truffet beslutning, ikke en indstilling. Accenten er",
      "beslutning 10 i BESLUTNINGER.md, og resten af paletten hænger på den.",
      "",
      "Er ændringen bevidst: ret BESLUTNINGER.md FØRST, og ret så snapshottet",
      "i denne fil. Rækkefølgen er pointen — ellers er beslutningen flyttet",
      "ind i en testfil, hvor ingen leder efter den.",
      "",
      "Mangler en skærm en farve, er svaret som regel et eksisterende token.",
    ].filter((l) => l !== "").join("\n");

    assert.deepEqual(faktiske, FORVENTEDE_TOKENS, besked);
  });

  it("har ingen ny rå farve i fleet.css uden for :root", () => {
    const tekst = udenCssKommentarer(readFileSync(TOKENFIL, "utf8"));
    const blok = tekst.match(/:root\s*\{[\s\S]*?\}/);
    const uden = tekst.slice(0, blok.index) + tekst.slice(blok.index + blok[0].length);

    const faktiske = [...new Set(uden.match(FARVE) ?? [])].sort();
    const forventede = [...new Set(FORVENTEDE_RAA_FARVER)].sort();

    const nye = faktiske.filter((f) => !forventede.includes(f));
    const vaek = forventede.filter((f) => !faktiske.includes(f));

    assert.deepEqual(
      faktiske, forventede,
      [
        "De rå farver i " + TOKENFIL + " uden for :root er ændret.",
        "",
        nye.length ? "  NY:      " + nye.join(", ") : "",
        vaek.length ? "  VÆK:     " + vaek.join(", ") : "",
        "",
        "En ny farve hører i :root som et token, så den kan genbruges og rettes",
        "ét sted. Er der en grund til at den ikke kan, så skriv den på",
        "FORVENTEDE_RAA_FARVER sammen med grunden.",
        "",
        "Er en farve forsvundet, fordi den er blevet til et token: godt. Fjern",
        "den fra listen i samme commit.",
      ].filter((l) => l !== "").join("\n")
    );
  });
});
