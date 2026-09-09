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
const PLANNING_TOKENFIL = join("src", "fleet", "planning-ui", "planning-demo.css");
const PLANNING_TOKEN_START = "/* VEYRO_PLANNING_TOKENS_START */";
const PLANNING_TOKEN_SLUT = "/* VEYRO_PLANNING_TOKENS_SLUT */";

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
/* ⚠ 4-CIFRET HEX ER UDELADT, OG DET ER EN AFVEJNING.
   #RGBA er en gyldig CSS-farve, men den skrives stort set aldrig i hånden —
   og fire cifre efter en havelåge er derimod HYPPIGT et nummer:
   "Reserveret fra sag #1245", "Faktura #2458 – Hydraulikolie". Begge er
   rigtige strenge i demo-data, og begge blev flaget som farver.
   Prisen: en farve skrevet som #abcd slipper forbi. Den ville i praksis stå i
   fleet.css, hvor snapshottet fanger den alligevel. En lint der brokker sig
   over et fakturanummer, bliver slået fra — og så fanger den heller ikke det
   den findes for. */
const FARVE = new RegExp(
  "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b" +
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

const FORVENTEDE_PLANNING_TOKENS = {
  "--veyro-deep-navy": "#061A2A",
  "--veyro-navy-dark": "#03131F",
  "--veyro-teal": "#087F8F",
  "--veyro-cyan": "#22C2CF",
  "--veyro-teal-light": "#E8F7F8",
  "--veyro-white": "#FFFFFF",
  "--veyro-app-background": "#F5F7F9",
  "--veyro-border": "#DCE3E8",
  "--veyro-primary-text": "#102235",
  "--veyro-secondary-text": "#667687",
  "--veyro-secondary-text-strong": "#5F6F7F",
  "--veyro-success": "#2EAD72",
  "--veyro-warning": "#D99A28",
  "--veyro-danger": "#D95C5C",
  "--veyro-link-accessible": "#087484",
  "--veyro-card-surface": "#F7F8F9",
  "--veyro-success-text": "#176B47",
  "--veyro-warning-text": "#76500B",
  "--veyro-danger-text": "#8E3030",
  "--veyro-success-surface": "color-mix(in srgb, var(--veyro-success) 13%, var(--veyro-white))",
  "--veyro-warning-surface": "color-mix(in srgb, var(--veyro-warning) 16%, var(--veyro-white))",
  "--veyro-danger-surface": "color-mix(in srgb, var(--veyro-danger) 14%, var(--veyro-white))",
  "--bc-accent": "var(--veyro-teal)",
  "--bc-card": "var(--veyro-card-surface)",
  "--bc-line": "var(--veyro-border)",
  "--bc-text": "var(--veyro-primary-text)",
  "--bc-muted": "var(--veyro-secondary-text-strong)",
  "--bc-ok": "var(--veyro-success-text)",
  "--bc-warn": "var(--veyro-warning-text)",
  "--bc-block": "var(--veyro-danger-text)",
  "--fc-stregkode-bund": "var(--veyro-white)",
  "--fc-navy": "var(--veyro-deep-navy)",
  "--fc-navy-2": "var(--veyro-navy-dark)",
  "--fc-navy-3": "var(--veyro-teal)",
  "--fc-accent-soft": "var(--veyro-teal-light)",
  "--fc-bg": "var(--veyro-app-background)",
  "--fc-ok-bg": "var(--veyro-success-surface)",
  "--fc-warn-bg": "var(--veyro-warning-surface)",
  "--fc-bad-bg": "var(--veyro-danger-surface)",
  "--fc-info": "var(--veyro-teal)",
  "--fc-info-bg": "var(--veyro-teal-light)",
  "--fc-shadow": "0 1px 2px var(--veyro-border)",
};

const normaliserTokenVaerdi = (vaerdi) => vaerdi
  .trim()
  .replace(/\s+/g, " ")
  .replace(/#[0-9a-fA-F]{3,8}\b/g, (farve) => farve.toUpperCase());

function analyserPlanningCss(tekst) {
  const fund = [];
  const start = tekst.indexOf(PLANNING_TOKEN_START);
  const slut = tekst.indexOf(PLANNING_TOKEN_SLUT);
  if (start < 0 || slut < 0 || slut <= start) return ["Planning-tokenblokkens entydige markører mangler"];
  if (tekst.indexOf(PLANNING_TOKEN_START, start + 1) >= 0 || tekst.indexOf(PLANNING_TOKEN_SLUT, slut + 1) >= 0) {
    fund.push("Planning-tokenblokken findes mere end én gang");
  }

  const blokSlut = slut + PLANNING_TOKEN_SLUT.length;
  const blok = tekst.slice(start + PLANNING_TOKEN_START.length, slut);
  const root = blok.match(/^\s*:root\s*\{([\s\S]*?)\}\s*$/);
  if (!root) return [...fund, "Planning-tokenblokken skal indeholde præcis én :root-regel"];

  const faktiske = {};
  for (const d of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    faktiske[d[1]] = normaliserTokenVaerdi(d[2]);
  }
  const forventede = Object.fromEntries(Object.entries(FORVENTEDE_PLANNING_TOKENS)
    .map(([navn, vaerdi]) => [navn, normaliserTokenVaerdi(vaerdi)]));
  const tilfoejet = Object.keys(faktiske).filter((navn) => !(navn in forventede));
  const mangler = Object.keys(forventede).filter((navn) => !(navn in faktiske));
  const aendret = Object.keys(forventede).filter((navn) => navn in faktiske && faktiske[navn] !== forventede[navn]);
  if (tilfoejet.length) fund.push(`ekstra Planning-token: ${tilfoejet.join(", ")}`);
  if (mangler.length) fund.push(`manglende Planning-token: ${mangler.join(", ")}`);
  if (aendret.length) fund.push(`ændret Planning-token: ${aendret.join(", ")}`);

  const udenBlok = udenCssKommentarer(tekst.slice(0, start) + tekst.slice(blokSlut));
  const raaFarver = udenBlok.match(FARVE);
  if (raaFarver) fund.push(`rå farve uden for Planning-tokenblokken: ${[...new Set(raaFarver)].join(", ")}`);
  const egneTokens = [...udenBlok.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]);
  if (egneTokens.length) fund.push(`token uden for Planning-tokenblokken: ${[...new Set(egneTokens)].join(", ")}`);
  if (/(@import\s+[^;]*fleet\.css|url\([^)]*fleet\.css)/i.test(tekst)) fund.push("Planning må ikke importere fleet.css");
  return fund;
}

function analyserAndenCss(sti, tekst) {
  const fund = [];
  const udenKommentarer = udenCssKommentarer(tekst);
  const farver = udenKommentarer.match(FARVE);
  if (farver) fund.push(`${sti}: farveværdier — ${[...new Set(farver)].join(", ")}`);
  const egne = [...udenKommentarer.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]);
  if (egne.length) fund.push(`${sti}: egne tokens — ${[...new Set(egne)].join(", ")}`);
  return fund;
}

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
  // Veyro Systems-paletten og de semantiske roller, beslutning 121.
  "--veyro-deep-navy": "#061a2a",
  "--veyro-navy-dark": "#03131f",
  "--veyro-teal": "#087f8f",
  "--veyro-cyan": "#22c2cf",
  "--veyro-teal-light": "#e8f7f8",
  "--veyro-white": "#ffffff",
  "--veyro-app-background": "#f5f7f9",
  "--veyro-border": "#dce3e8",
  "--veyro-primary-text": "#102235",
  "--veyro-secondary-text": "#667687",
  "--veyro-secondary-text-strong": "#5f6f7f",
  "--veyro-success": "#2ead72",
  "--veyro-warning": "#d99a28",
  "--veyro-danger": "#d95c5c",
  "--veyro-link-accessible": "#087484",
  "--veyro-muted-accessible": "#5b6b7b",
  "--veyro-card-surface": "#f7f8f9",
  "--veyro-workspace-surface": "color-mix(in srgb,var(--veyro-app-background) 95%,var(--veyro-deep-navy))",
  "--veyro-border-strong": "#dbe2e7",
  "--veyro-surface": "var(--veyro-card-surface)",
  "--veyro-workspace": "var(--veyro-workspace-surface)",
  "--veyro-text": "var(--veyro-primary-text)",
  "--veyro-text-secondary": "var(--veyro-muted-accessible)",
  "--veyro-nav-bg": "var(--veyro-deep-navy)",
  "--veyro-nav-bg-deep": "var(--veyro-navy-dark)",
  "--veyro-nav-active": "var(--veyro-teal)",
  "--veyro-action": "var(--veyro-link-accessible)",
  "--veyro-action-hover": "color-mix(in srgb, var(--veyro-action) 84%, var(--veyro-navy-dark))",
  "--veyro-link": "var(--veyro-link-accessible)",
  "--veyro-focus": "var(--veyro-cyan)",
  "--veyro-success-text": "#176b47",
  "--veyro-warning-text": "#76500b",
  "--veyro-danger-text": "#8e3030",
  "--veyro-success-bg": "color-mix(in srgb, var(--veyro-success) 13%, var(--veyro-white))",
  "--veyro-warning-bg": "color-mix(in srgb, var(--veyro-warning) 16%, var(--veyro-white))",
  "--veyro-danger-bg": "color-mix(in srgb, var(--veyro-danger) 14%, var(--veyro-white))",
  "--bc-accent": "var(--veyro-action)",
  "--bc-card": "var(--veyro-surface)",
  "--bc-line": "var(--veyro-border-strong)",
  "--bc-text": "var(--veyro-text)",
  "--bc-muted": "var(--veyro-text-secondary)",
  /* ⚠ MØRKNET I BESLUTNING 77. Statusfarven er TEKSTEN i en pille — "Udført",
     "Forsinket", "Afventer" — og lå på 3,1–4,1:1 mod AA's 4,5. Kuløren er
     bevaret; kun lyset er skruet ned, og til den MINDSTE værdi der når kravet
     mod både kortet og pillen. */
  "--bc-ok": "var(--veyro-success-text)",
  "--bc-warn": "var(--veyro-warning-text)",
  "--bc-block": "var(--veyro-danger-text)",
  // Stregkodens sort — et maskinkrav, ikke en designfarve. Beslutning 46:
  // kontrasten er scannerens tærskel, så den må ikke følge et tema.
  "--fc-stregkode": "#000",
  "--fc-stregkode-bund": "#fff",
  "--fc-navy": "var(--veyro-nav-bg)",
  "--fc-navy-2": "var(--veyro-nav-bg-deep)",
  "--fc-navy-3": "color-mix(in srgb, var(--veyro-deep-navy) 76%, var(--veyro-teal))",
  "--fc-accent-soft": "var(--veyro-teal-light)",
  "--fc-bg": "var(--veyro-workspace)",
  "--fc-ok-bg": "var(--veyro-success-bg)",
  "--fc-warn-bg": "var(--veyro-warning-bg)",
  "--fc-bad-bg": "var(--veyro-danger-bg)",
  "--fc-info": "var(--veyro-link)",
  "--fc-info-bg": "var(--veyro-teal-light)",
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
  /* ⚠ MØRKNET I BESLUTNING 77 til 3:1 i deres egen cirkel — kravet for et
     IKKE-tekstligt element (WCAG 1.4.11). Gul lå på 1,80:1, den værste måling
     i hele paletten. Ikke til 4,5: det ville have gjort gul til brun på hvert
     KPI-kort for to rangbadgers skyld.
     ⚠ OG VÆRDIEN ER LØST KOBLET. Den bløde flade er en BLANDING af farven
     selv (13/15 % i kortet), så en mørkning trækker fladen med ned og æder en
     del af sin egen gevinst. Første forsøg regnede mod den GAMLE flade og
     landede på 2,98 og 2,87 — under kravet, efter en rettelse der skulle nå
     det. Målingen fangede det. */
  "--fc-ikon-2": "#d65f2f",
  "--fc-ikon-3": "#af7700",
  "--fc-ikon-4": "#4a3aa7",
  "--fc-ikon-5": "var(--bc-accent)",
  "--fc-ikon-6": "#008300",
  "--fc-ikon-1-bg": "color-mix(in srgb, #e34948 13%, var(--bc-card))",
  /* ⚠ FØLGER MED DERES FARVE. Blandingen er 13/15 % af ikonfarven i kortet,
     så et token der mørknes, trækker sin egen bløde flade med. Blev de stående
     på den gamle farve, ville cirklen og dens indhold komme fra hver sin
     generation — og kontrasten jeg lige har regnet, ville være regnet på noget
     andet end det der tegnes. Se beslutning 77. */
  "--fc-ikon-2-bg": "color-mix(in srgb, #d65f2f 13%, var(--bc-card))",
  "--fc-ikon-3-bg": "color-mix(in srgb, #af7700 15%, var(--bc-card))",
  "--fc-ikon-4-bg": "color-mix(in srgb, #4a3aa7 12%, var(--bc-card))",
  "--fc-ikon-5-bg": "var(--fc-accent-soft)",
  "--fc-ikon-6-bg": "color-mix(in srgb, #008300 12%, var(--bc-card))",
  /* Modal baggrund — en FLADE, ikke en status- eller kategorifarve. Den
     encoder ingenting, saa validatorens gulve gaelder den ikke. Se
     BESLUTNINGER.md, afsnittet "Et fjerde token". */
  "--fc-overlay": "color-mix(in srgb, var(--veyro-deep-navy) 48%, transparent)",
  /* Skriftskalaen — beslutning 48. Ni trin i stedet for 24 tal spredt i
     filen. Vaerdierne staar her af samme grund som farverne: et token er en
     truffet beslutning, og en skala der kan skride er ingen skala. */
  "--fc-t-tight": "11px",
  "--fc-t-xs": "12px",
  "--fc-t-s": "13px",
  "--fc-t-m": "14px",
  "--fc-t-l": "15px",
  "--fc-t-xl": "17px",
  "--fc-t-2xl": "21px",
  "--fc-t-3xl": "25px",
  "--fc-t-4xl": "34px",
  "--fc-r": "12px",
  "--fc-sidebar": "216px",
  "--fc-shadow": "0 1px 2px color-mix(in srgb, var(--veyro-deep-navy) 6%, transparent), 0 1px 3px color-mix(in srgb, var(--veyro-deep-navy) 4%, transparent)",
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
      const tekst = readFileSync(sti, "utf8");
      if (sti === PLANNING_TOKENFIL) fund.push(...analyserPlanningCss(tekst).map((fejl) => `${sti}: ${fejl}`));
      else fund.push(...analyserAndenCss(sti, tekst));
    }
    assert.deepEqual(
      fund, [],
      "En ny CSS-fil er en åben dør: to filer der begge definerer designet, driver fra " +
      "hinanden, og den ene bliver ikke læst. Farver og tokens hører i " + TOKENFIL + ".\n" +
      fund.join("\n")
    );
  });

  it("låser den præcise lokale Planning-tokenblok", () => {
    assert.deepEqual(analyserPlanningCss(readFileSync(PLANNING_TOKENFIL, "utf8")), []);
  });

  it("afviser en ændret Planning-farveværdi", () => {
    const tekst = readFileSync(PLANNING_TOKENFIL, "utf8").replace("#087F8F", "#087F90");
    assert.match(analyserPlanningCss(tekst).join("\n"), /ændret Planning-token/);
  });

  it("afviser et ekstra lokalt Planning-token", () => {
    const tekst = readFileSync(PLANNING_TOKENFIL, "utf8").replace(
      /}\r?\n(?=\/\* VEYRO_PLANNING_TOKENS_SLUT \*\/)/,
      `  --veyro-ekstra: #123456;\n}\n${PLANNING_TOKEN_SLUT}`,
    );
    assert.match(analyserPlanningCss(tekst).join("\n"), /ekstra Planning-token/);
  });

  it("afviser en rå farve uden for Planning-tokenblokken", () => {
    const tekst = readFileSync(PLANNING_TOKENFIL, "utf8") + "\n.proeve{color:#123456}";
    assert.match(analyserPlanningCss(tekst).join("\n"), /rå farve uden for/);
  });

  it("afviser fortsat farver i enhver anden CSS-fil", () => {
    assert.match(analyserAndenCss("src/proeve.css", ".proeve{color:#123456}").join("\n"), /farveværdier/);
  });

  it("afviser import af fleet.css fra Planning", () => {
    const tekst = readFileSync(PLANNING_TOKENFIL, "utf8") + "\n@import '../fleet.css';";
    assert.match(analyserPlanningCss(tekst).join("\n"), /må ikke importere fleet\.css/);
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
