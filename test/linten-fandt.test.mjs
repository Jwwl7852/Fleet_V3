/* test/linten-fandt.test.mjs
 * De tre navne linten fandt — beslutning 67.
 *
 * HVORFOR DEN FINDES. `npm run lint` fandt tre navne der blev regnet og aldrig
 * brugt. De blev IKKE fjernet, fordi et fjernet navn tager beviset med sig:
 * så er fundet væk og fejlen tilbage, og ingen ved længere at kontrollen
 * mangler. De stod med en `eslint-disable-next-line` og en note der pegede på
 * README, indtil hver af dem fik den kontrol den manglede.
 *
 * ⚠ OG DERFOR ER DENNE PRØVE TOSIDET. Den kræver både at navnet BRUGES og at
 * `eslint-disable` er VÆK. Uden det første kan man dæmpe linten igen med en
 * disable; uden det andet kan man "rette" fundet ved at slette navnet — og
 * begge veje fører tilbage til en skærm der mangler en kontrol uden at nogen
 * kan se det.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Kommentarerne SKAL væk før der søges: hver af de tre skærme beskriver i en
   note hvad der stod før, og de noter indeholder netop de ord prøven leder
   efter. Uden strimlingen ville prøven være grøn af sin egen dokumentation —
   det er sket fire gange i dette repo. */
const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const laes = (p) => udenKommentarer(readFileSync(p, "utf8"));

const OVERSIGT = "src/moduler/booking/Oversigt.jsx";
const PRISLISTE = "src/moduler/udbyder/Prisliste.jsx";
const OEKONOMI = "src/moduler/Oekonomi.jsx";

describe("Ingen af de tre står dæmpet længere", () => {
  /**
   * ⚠ HELE `src/` — ikke kun de tre filer. En ny disable er samme fejl et nyt
   * sted, og den skal findes af den samme prøve. Er der en rigtig grund til
   * en dæmpning, hører den i README under det linten fandt, og så skal denne
   * prøve rettes bevidst — det er hele forskellen på et fund og en vane.
   */
  test("⚠ INGEN eslint-disable FOR no-unused-vars I src/", () => {
    for (const f of [OVERSIGT, PRISLISTE, OEKONOMI]) {
      const raa = readFileSync(f, "utf8");
      assert.ok(!raa.includes("eslint-disable-next-line no-unused-vars"),
        f + " dæmper stadig linten i stedet for at bruge navnet");
    }
  });
});

describe("Bookingoversigten kan vise de afsluttede forløb", () => {
  const s = laes(OVERSIGT);

  /**
   * ⚠ FODNOTEN VAR DET VÆRSTE VED FEJLEN. "Viser N af M hentede bookinger"
   * fortalte brugeren at der var noget han ikke kunne se — og der var ingen
   * vej til det. At skjule i stilhed havde været bedre.
   */
  test("⚠ setVisAlle KALDES FAKTISK", () => {
    assert.ok(/setVisAlle\(/.test(s), "setVisAlle kaldes stadig ingen steder");
    assert.ok(/onClick=\{\(\) => setVisAlle/.test(s),
      "kontrollen er ikke noget man kan klikke på");
  });

  /**
   * ⚠ OG STANDARDEN ER STADIG "SKJUL". En bookingoversigt er en arbejdsliste;
   * det man skal handle på, er de forløb der ikke er færdige. Rettelsen var en
   * KNAP, ikke en ændret standard — og hvis nogen vender den om, står listen
   * fyldt med et års historik på hver indlæsning.
   */
  test("⚠ AFSLUTTEDE ER STADIG SKJULT SOM STANDARD", () => {
    assert.match(s, /useState\(false\)/,
      "visAlle begynder ikke som false — standarden er vendt om");
    assert.match(s, /visAlle \? raekker : raekker\.filter/);
  });

  /**
   * ⚠ KNAPPEN SIGER HVOR MANGE. "Vis alle" er en indstilling man ignorerer;
   * "Vis 3 afsluttede" er en oplysning man forholder sig til. Og tallet
   * tælles af den GENBEREGNEDE tilstand `vist`, ikke af bookingens gemte felt
   * — de to kan være uenige, og det er netop den uenighed skærmen findes for
   * at vise. Talte knappen af det gemte felt, ville den kunne love et forløb
   * frem som filteret bagefter skjuler.
   */
  test("⚠ KNAPPEN TÆLLER AF DEN SAMME TILSTAND SOM FILTERET", () => {
    assert.match(s, /const skjulte = raekker\.filter\(\(r\) => FAERDIGE\.has\(r\.vist\)\)\.length/);
    assert.ok(s.includes("{skjulte > 0 &&"),
      "knappen står også når der intet er at vise — en knap uden virkning");
  });
});

describe("Prislisten viser hvornår kataloget sidst blev rørt", () => {
  const s = laes(PRISLISTE);

  test("⚠ sidstRettet NÅR SKÆRMEN", () => {
    assert.match(s, /const sidstRettet = alle\.reduce/);
    assert.ok(/\{dato\(sidstRettet\)\}/.test(s),
      "tallet regnes stadig og vises stadig ikke");
  });

  /**
   * ⚠ "SIDST LAGT", IKKE "GÆLDER FRA". To forskellige spørgsmål: en liste kan
   * lægges i dag og gælde fra næste kvartal. Tabellen svarer allerede på det
   * andet i to kolonner, og blandes de to sammen, læser man en dato som en
   * ikrafttrædelse den ikke er.
   */
  test("⚠ SIGER AT DET ER HVORNÅR DEN BLEV LAGT", () => {
    assert.ok(/Sidst lagt/.test(s), "datoen står uden at sige hvad den er");
    assert.ok(/ikke hvornår en pris begyndte at gælde/.test(s),
      "forskellen på lagt og gældende står ikke på skærmen");
  });

  test("står kun når der ER en liste", () => {
    assert.match(s, /\{sidstRettet > 0 &&/);
  });
});

describe("Økonomi viser afvigelsen mod måldækningsgraden", () => {
  const s = laes(OEKONOMI);

  test("⚠ daekningsgradAfv NÅR SKÆRMEN", () => {
    assert.ok(/deviation\(daekningsgradAfv/.test(s),
      "tallet beregnes stadig og tabes stadig");
  });

  /**
   * ⚠ OG SUBTRAKTIONEN VAR SELV EN FÆLDE. Her stod
   * `k.oekonomi.daekningsgradPct - k.oekonomi.maalDaekningsgradPct` råt.
   * `x - null` er `x` og `null - y` er `-y` — begge ser ud som MÅLINGER, og
   * gaten i deviation() nås aldrig, fordi tallet er blevet rigtigt på vejen.
   * Fejlen var usynlig så længe tallet ikke blev vist; det er den slags der
   * venter på at nogen finder brug for den. Tjek FØR regnestykket.
   */
  test("⚠ TJEKKER FØR SUBTRAKTIONEN, IKKE EFTER", () => {
    assert.ok(/Number\.isFinite\(k\.oekonomi\.daekningsgradPct\)/.test(s));
    assert.ok(/Number\.isFinite\(k\.oekonomi\.maalDaekningsgradPct\)/.test(s));
    /* Og den rå subtraktion må ikke stå igen ved siden af. */
    const raa = /(?<!\?\s*)k\.oekonomi\.daekningsgradPct - k\.oekonomi\.maalDaekningsgradPct/;
    const linjer = s.split("\n").filter((l) => raa.test(l));
    for (const l of linjer) {
      assert.ok(/\?/.test(l) || /^\s+\? /.test(l),
        "subtraktionen står ubevogtet: " + l.trim());
    }
  });

  /**
   * ⚠ GRAFEN OG TALLET SVARER PÅ HVER SIT. Grafen viser HVORNÅR man krydsede
   * målet — derfor er målet tegnet som en serie og ikke som en etiket. Tallet
   * viser HVOR LANGT der er lige nu. Fjernes serien igen til fordel for
   * tallet, kan man ikke længere se krydsningen.
   */
  test("målet står stadig som en serie i grafen", () => {
    assert.match(s, /navn: `Mål \$\{pct\(k\.oekonomi\.maalDaekningsgradPct\)\}`, stiplet: true/);
  });

  /* ⚠ PROCENTPOINT, IKKE PROCENT. 68 % der bliver 72 % er +4 point. Og
     deviation() kender ikke en unit der hedder "point" — den falder igennem
     til num og taber ordet — så enheden skrives i teksten. */
  test("⚠ ENHEDEN ER PROCENTPOINT OG STÅR PÅ SKÆRMEN", () => {
    assert.ok(/i procentpoint/.test(s), "enheden står ikke ved tallet");
    assert.ok(!/unit: "point"/.test(s),
      'deviation() kender ikke "point" — ordet ville blive tabt');
  });
});
