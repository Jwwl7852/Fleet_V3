/* eslint.config.js
 * ÉN fejlklasse, ikke en stilgennemgang.
 *
 * ⚠ HVORFOR DEN HER FINDES.
 *
 * `npm run build` er GRØN når en underkomponent læser en variabel der ikke
 * findes i dens scope. Vite oversætter filen fint — fejlen sker først når
 * React render'er komponenten, og så er skærmen hvid. Det er sket **fem
 * gange**, hver gang i en underkomponent langt nede i en fil der ellers
 * virkede:
 *
 *     KILDER      i Leverandoerer.jsx
 *     sensitivt   i Indberetninger.jsx
 *     useListe    i Vaerkstedskalender.jsx
 *     etaper      i Uplanlagte.jsx
 *     biler       i Forslagstabel
 *
 * Hver eneste blev fundet ved at KLIKKE skærmen. Prøverne så dem ikke —
 * de prøver domænelogikken, ikke JSX'en — og buildet så dem ikke. Det er den
 * dyreste måde at finde en fejl på, og den finder kun det man kommer forbi.
 *
 * `no-undef` afgør det statisk, på under et sekund, for hele træet.
 *
 * ---------------------------------------------------------------------------
 * ⚠ OG DERFOR STÅR DER SÅ FÅ REGLER.
 *
 * Fristelsen er at slå `eslint:recommended` til og rette 400 ting. Det ville
 * være en anden opgave: repoet har egne konventioner, der er skrevet ned og
 * begrundet i BESLUTNINGER.md, og en regelpakke der er uenig med dem, ville
 * enten blive slået fra igen eller stille ændre koden efter en mening ingen
 * har taget stilling til.
 *
 * En linter man slår fra, fanger ingenting. Reglerne her er dem der svarer på
 * et spørgsmål med et ja eller nej — findes navnet, eller findes det ikke —
 * og ikke dem der har en holdning.
 *
 * Koer: npm run lint
 */
import globals from "globals";

/* Filer der ikke er vores at rette. */
const IGNORERET = [
  "dist/**",
  "node_modules/**",
  /* ⚠ KOPI, lagt af `npm run delt:kopier`. En fejl her er en fejl i
     src/fleet/ — og retter man kopien, filtrerer klienten mod én allowliste
     og serveren mod en anden. Se CLAUDE.md. */
  "functions/delt/**",
];

const SPROG = {
  ecmaVersion: "latest",
  sourceType: "module",
  parserOptions: { ecmaFeatures: { jsx: true } },
};

/**
 * ⚠ `no-unused-vars` ER SAT TIL KUN AT SE PÅ IMPORTS OG LOKALE VARIABLE,
 * ikke på argumenter.
 *
 * En ubrugt parameter er tit meningen — en render-funktion der får
 * `(raekke, indeks)` og kun bruger den ene. Klagede linten over dem, ville
 * man tilføje `_` foran halvdelen af koden for at gøre den tilfreds, og så
 * har værktøjet ændret koden uden at finde en fejl.
 *
 * En ubrugt IMPORT er derimod altid værd at vide: enten er den glemt efter en
 * omskrivning, eller også bruges den under et andet navn end man tror.
 */
const REGLER = {
  "no-undef": "error",
  "no-unused-vars": ["error", {
    args: "none",
    caughtErrors: "none",
    ignoreRestSiblings: true,
  }],
  /* ⚠ `no-use-before-define` STOD HER OG BLEV FJERNET IGEN.
     Den gav ni fund og NUL fejl. Alle ni var samme mønster: en
     `const`-pilfunktion kaldt inde i en anden funktions krop —
     `demoLeverandoer` der slår op i `DEMO_LEVERANDOERER` længere nede,
     `datoTid` der kalder `klokke`, en `render`-callback i en tabel der
     kalder `timer`. Referencen udføres længe efter modulet er indlæst;
     der er ingen TDZ at falde i.
     Reglen kan ikke se forskel på "kaldes senere" og "læses nu", og en
     regel der kun råber forkert, bliver slået fra — og så fanger den heller
     ikke den ene gang den havde ret. Hellere ikke have den. */
  /* En dublet-nøgle i et objekt taber stille den ene værdi. Det er præcis
     hvordan `Bil 104` fik to nummerplader. */
  "no-dupe-keys": "error",
  "no-dupe-class-members": "error",
  "no-unsafe-negation": "error",
  "no-unreachable": "error",
};

export default [
  { ignores: IGNORERET },

  /* Klienten: browser-globals, JSX. */
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ...SPROG,
      globals: { ...globals.browser },
    },
    rules: REGLER,
  },

  /* Serveren, provisioneringen og prøverne: node-globals. */
  {
    files: ["functions/*.js", "scripts/**/*.mjs", "test/**/*.mjs", "*.config.js"],
    languageOptions: {
      ...SPROG,
      globals: { ...globals.node },
    },
    rules: REGLER,
  },

  /* Prøverne bruger node:test's describe/it via import — men også
     `process` og `console`. Dækket af globals.node ovenfor. */
];
