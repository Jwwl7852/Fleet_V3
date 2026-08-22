/* test/demo-i-skaerm.test.mjs
 * En skærm må ikke VISE et demo-datasæt for en node der er seedet.
 *
 * ⚠ HVORFOR DEN HER LINT FINDES, OG HVORFOR DEN ER ET LOFT.
 *
 * `demo-kilder.test.mjs` holder styr på HVOR et demosæt må ligge, og på at to
 * filer ikke beskriver den samme node. Den siger intet om at bruge det.
 *
 * Og brugen er den fejl der bliver ved: da `opgaver`, `indkoeb`, `facility`,
 * `leverandoerer`, `lagre` og `indberetninger` blev seedet én for én, viste
 * skærmene stadig demofilen. Noden havde kundens data; skærmen havde
 * mockuppens. Indkøb → Fakturaer viste ni demo-fakturaer mens
 * `indkoeb.fakturaerTilGodkendelse` blev regnet af de rigtige — to svar på
 * samme spørgsmål, ét klik fra hinanden.
 *
 * ⚠ `demo:`-FALDBAKKEN ER IKKE FEJLEN. `useListe(node, { demo: DEMO_X })`
 * bruger kun sættet når der ingen database er, og det er netop reglen fra
 * beslutning 26: opdigtede tal findes KUN dér. Linten tæller derfor brug
 * UDEN FOR den faldbakke.
 *
 * ⚠ DEN VAR ET LOFT. NU ER DEN ET FORBUD.
 *
 * Den begyndte på 30, og de fleste var navneopslag — `demoBilNavn(id)` på en
 * tabelrække, ikke et tal. Det lød uskyldigt, og det er netop dét der gjorde
 * dem svære at få øje på: hos en rigtig kunde matcher opslaget INGENTING, og
 * en tabel med tomme navne ligner data der mangler frem for et opslag der
 * peger det forkerte sted.
 *
 * 30 → 23 → 20 → 17 → 10 → 0, én skærm ad gangen med et klik bagefter.
 * Loftet er nul, og det kan ikke gå op igen: der er ikke længere en skærm at
 * pege på som undtagelse.
 *
 * ⚠ ET DEMOSÆT MÅ STADIG STÅ SOM `demo:`-FALDBAKKE. Det er hele reglen fra
 * beslutning 26: opdigtede tal findes KUN dér hvor der ingen database er.
 * Linten tæller brug UDEN FOR den faldbakke.
 *
 * ⚠ OG TO SÆT BLIVER LÆST DIREKTE MED VILJE — de er ikke talt med, fordi
 * deres node ikke findes: `DEMO_LEVERANDOERSAGER` (reklamationer) og
 * `demoHaendelser` (chaufførens meldinger). Der ER ingen node at læse, og et
 * tomt array ville se ud som en måling — se beslutning 63 og 64.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SEED } from "../scripts/provisioner-dev.mjs";

const MODULER = "src/moduler";

/* Demo-sæt hvis navn peger entydigt på en node. Er navnet tvetydigt, hører
   sættet ikke hjemme her — så er det `demo-kilder.test.mjs`' ærinde. */
const NODE_FOR = {
  DEMO_KOERETOEJER: "koeretoejer", DEMO_PERSONALE: "personale",
  DEMO_KOMPETENCER: "kompetencer", DEMO_KUNDER: "kunder",
  DEMO_ETAPER: "etaper", DEMO_OPGAVER: "opgaver",
  DEMO_INDBERETNINGER: "indberetninger", DEMO_FRAVAER: "fravaer",
  DEMO_INDKOEBSLINJER: "indkoeb", DEMO_FAKTURAER: "fakturaer",
  DEMO_LEVERANDOERER: "leverandoerer", DEMO_GRUNDLAG: "grundlag",
  DEMO_OMKOSTNINGER: "omkostninger", DEMO_LAGRE: "lagre",
  DEMO_AKTIVER: "facility/aktiver", DEMO_LOKATIONER: "facility/lokationer",
  DEMO_ZONER: "facility/zoner", DEMO_FEJL: "facility/fejl",
  DEMO_VARER: "varer", DEMO_BEHOLDNING: "beholdning", DEMO_CARRIERS: "carriers",
  DEMO_KASSER: "kasser", DEMO_KASSETYPER: "kassetyper",
  DEMO_KASSEUDLAAN: "kasseudlaan", DEMO_REOLPLADSER: "reolpladser",
  DEMO_ENHEDER: "enheder",
  /* ⚠ KOM MED FORDI NODEN BLEV SEEDET. `bookinger` stod ikke i SEED — kun
     `etaper` gjorde — så linten sprang sættet over, og Bookingoversigten
     kunne læse demofilen direkte uden at nogen så det. Se beslutning 56. */
  DEMO_BOOKINGER: "bookinger",
  /* Procures to foerste trin — begge seedes, saa begge hoerer her. */
  DEMO_INDKOEBSBEHOV: "indkoebsbehov", DEMO_INDKOEBSORDRER: "indkoebsordrer",
  DEMO_GODKENDELSESREGLER: "godkendelsesregler",
  DEMO_FORBRUGSVARER: "forbrugsvarer",
  DEMO_FORBRUGSVAREBEVAEGELSER: "forbrugsvarebevaegelser",
};

/* ⚠ MÅLT, IKKE ANSLÅET. Tallet er talt op på den kode der står i dag.
   30 → 23: Disponering læser nu `koeretoejer`, `personale`, `kompetencer`,
   `leverandoerer` og `opgaver` fra noderne. Den byggede begge gitres RÆKKER
   af `DEMO_KOERETOEJER` og filtrerede dem på de id'er kundens etaper peger
   på — hos en rigtig kunde matcher de ingenting, så ugegitteret ville stå
   tomt uden at nogen havde slettet en bil.

   23 → 20: Servicekalenderen læser nu `opgaver`, `facility/aktiver` og
   `facility/lokationer` fra noderne. Den tegnede `DEMO_SERVICEBESOEG` — seks
   poster der IKKE var seedet — mens `kpi.facility.planlagtVedligehold` blev
   regnet af nodens facility-opgaver, som var helt andre. To svar på ét
   spørgsmål, ét klik fra hinanden. Beslutning 49.

   20 → 17: Bookingoversigten og Forslag læser nu `bookinger`, `etaper`,
   `opgaver`, `kunder`, `koeretoejer` og `personale` fra noderne.
   ⚠ OG TALLET VAR FOR LAVT HELE TIDEN. `bookinger` stod ikke i SEED — kun
   `etaper` gjorde — så linten sprang `DEMO_BOOKINGER` over: den tæller kun
   sæt for SEEDEDE noder. Bookingoversigten læste altså demofilen direkte, og
   loftet kunne ikke se det. Noden seedes nu, sættet står i NODE_FOR, og
   skærmene er rettet i samme ombæring. Beslutning 56.

   17 → 10: HELE INDKØB læser nu noderne. Modulet havde seks: to
   navneopslag bygget som MODUL-KONSTANTER af demofilen (`ktNavn`, `lvNavn`),
   to lister sendt til en registreringsformular, og `DEMO_FAKTURAER` brugt som
   grundlag for leverandørernes nøgletal to steder.
   ⚠ Det sidste er det værste: skærmen RANGERER leverandører på tallet, så et
   forkert grundlag er ikke en visningsfejl — det er en anbefaling om hvem man
   skal handle med. Beslutning 63. */
const LOFT = 0;

const jsxFiler = (mappe) => {
  const ud = [];
  for (const navn of readdirSync(mappe)) {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) ud.push(...jsxFiler(sti));
    else if (/\.jsx?$/.test(navn)) ud.push(sti);
  }
  return ud;
};

/** Brug af et demo-sæt uden for `demo:`-faldbakken, pr. fil. */
function direkteBrug() {
  const seedede = new Set(SEED.map((s) => s.node));
  const fund = [];
  for (const fil of jsxFiler(MODULER)) {
    /* Kommentarer ud: en note der NÆVNER DEMO_X er ikke en brug. */
    const kode = readFileSync(fil, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const [navn, node] of Object.entries(NODE_FOR)) {
      if (!seedede.has(node)) continue;
      const alle = [...kode.matchAll(new RegExp(`\\b${navn}\\b`, "g"))].length;
      if (!alle) continue;
      const faldbakke = [...kode.matchAll(new RegExp(`demo:\\s*${navn}\\b`, "g"))].length;
      /* Én forekomst er importlinjen. */
      const direkte = alle - 1 - faldbakke;
      if (direkte > 0) fund.push({ fil, navn, node, direkte });
    }
  }
  return fund;
}

describe("En skærm viser noden, ikke demo-sættet", () => {
  it(`har ${LOFT} direkte brug tilbage — og det er et forbud, ikke et loft`, () => {
    const fund = direkteBrug();
    const antal = fund.reduce((s, f) => s + f.direkte, 0);
    const liste = fund
      .map((f) => `  ${f.fil.replace(/\\/g, "/")}  ${f.navn} → ${f.node} ×${f.direkte}`)
      .join("\n");

    assert.ok(antal <= LOFT,
      `${antal} direkte brug, loftet er ${LOFT}. En skærm der viser demo-sættet ` +
      `for en SEEDET node, viser mockuppens tal frem for kundens.\n${liste}`);

    /* ⚠ VED NUL ER DER INGEN NEDRE GRÆNSE AT HOLDE. Så længe loftet var et
       tal over nul, skulle det følge med ned — ellers holdt det op med at
       betyde noget. Nu er reglen bare: ingen. */
    assert.equal(LOFT, 0,
      "loftet er nul og kan ikke gå op igen — der er ikke længere en skærm at "
      + "pege på som undtagelse.");
  });

  it("⚠ SKÆRMEN FOR EN NODE MÅ IKKE VISE DEMO-SÆTTET FOR NETOP DEN", () => {
    /* Et navneopslag i en anden skærm er en detalje der venter. Men den skærm
       der ER nodens — Fakturaer for `fakturaer`, Indberetninger for
       `indberetninger` — må aldrig vise noget andet end noden. Det var dér de
       to svar på samme spørgsmål opstod. */
    const EJERE = [
      ["indkoeb/Fakturaer.jsx", "DEMO_FAKTURAER"],
      ["indkoeb/Oversigt.jsx", "DEMO_INDKOEBSLINJER"],
      ["indkoeb/Leverandoerer.jsx", "DEMO_LEVERANDOERER"],
      ["flaade/Indberetninger.jsx", "DEMO_INDBERETNINGER"],
      ["flaade/Oversigt.jsx", "DEMO_KOERETOEJER"],
      ["Medarbejdere.jsx", "DEMO_PERSONALE"],
      ["Kompetencer.jsx", "DEMO_KOMPETENCER"],
      ["facility/Oversigt.jsx", "DEMO_AKTIVER"],
      /* ⚠ BOOKINGOVERSIGTEN ER `bookinger`s EGEN SKÆRM, og den læste
         demofilen direkte — usynligt, fordi noden ikke var seedet og linten
         derfor sprang sættet over. Forslag hentede oven i købet ETAPERNE fra
         noden og BOOKINGEN fra demofilen, altså to svar i den samme visning.
         Se beslutning 56. */
      ["booking/Oversigt.jsx", "DEMO_BOOKINGER"],
      ["booking/Forslag.jsx", "DEMO_BOOKINGER"],
    ];
    const syndere = [];
    for (const [fil, navn] of EJERE) {
      const sti = join(MODULER, fil);
      const kode = readFileSync(sti, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const alle = [...kode.matchAll(new RegExp(`\\b${navn}\\b`, "g"))].length;
      const faldbakke = [...kode.matchAll(new RegExp(`demo:\\s*${navn}\\b`, "g"))].length;
      if (alle - 1 - faldbakke > 0) syndere.push(`${fil} viser ${navn}`);
    }
    assert.deepEqual(syndere, [],
      "Nodens egen skærm viser demo-sættet:\n" + syndere.join("\n"));
  });
});
