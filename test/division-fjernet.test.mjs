/* test/division-fjernet.test.mjs
 * Gods/Bus-aksen er fjernet — beslutning 70, etape 1.
 *
 * ⚠ HVORFOR EN PRØVE OG IKKE BARE EN SLETNING. En akse der fjernes, kommer
 * tilbage stykkevis: en skærm der "lige" skal filtrere, en indstilling der
 * genindføres fordi et kaldsted havde brug for den. Hver af dem er lille og
 * rimelig; tilsammen er de aksen igen, og så står vi med to måder at dele
 * data på — moduler OG division — hvor den ene er halvt implementeret.
 *
 * ⚠ OG DET VAR MULIGT AT FJERNE HELE FILTERET UDEN AT ÉN PRØVE FALDT.
 * `divisionsfilter()` og 146 kaldstedsindstillinger blev slettet, og suiten
 * stod grøn. `test/useliste.test.mjs` nævnte ikke `division` med ét ord — det
 * ene sted CLAUDE.md kræver filteret skal bo, og hvis "en post UDEN division
 * vises i BEGGE" var det led beslutning 19 hvilede på. **Den regel havde
 * ingen prøve i hele sin levetid.** Den her fil findes så det ikke gælder for
 * fjernelsen også.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

const SRC = filer("src");

describe("Filteret er væk og kommer ikke tilbage stykkevis", () => {
  /**
   * ⚠ FUNKTIONEN SELV. Genindføres den, er aksen tilbage — også selv om
   * shellen ikke har en vælger, for så filtrerer den på en tilstand ingen
   * kan se og ingen kan ændre.
   */
  test("⚠ divisionsfilter() FINDES IKKE", () => {
    const fundet = SRC.filter((f) => udenKommentarer(readFileSync(f, "utf8"))
      .includes("divisionsfilter"));
    assert.deepEqual(fundet, [],
      "divisionsfilter er genindført — aksen er tilbage");
  });

  /**
   * ⚠ INDSTILLINGEN PÅ useListe. Den hed `division` og tog "shell" | "alle",
   * og **141 af 158 kaldsteder sendte "alle"** — altså fravalgte filteret.
   * En indstilling der er slået fra 89 % af de steder den gælder, deler ikke
   * noget; den er en ting man skal huske at skrive.
   */
  test("⚠ INGEN useListe-INDSTILLING DER HEDDER division", () => {
    const fundet = [];
    for (const f of SRC) {
      const s = udenKommentarer(readFileSync(f, "utf8"));
      if (/\bdivision:\s*"(?:alle|shell)"/.test(s)) fundet.push(f);
    }
    assert.deepEqual(fundet, [], "division-indstillingen er genindført");
  });

  /**
   * ⚠ OG useListe SIGER DET HØJLYDT. Et kaldsted der stadig sender den, ville
   * ellers filtrere ingenting — tavst. Det er samme klasse fejl som den der
   * blev fundet i NyForespoergsel: indstillingen hed `division` og tog
   * "shell" | "alle", men fik VÆRDIEN "gods". Alt der ikke er "alle",
   * opfører sig som "shell", så den virkede ved et tilfælde — og en tastefejl
   * i navnet ville have givet nøjagtig samme opførsel.
   */
  test("⚠ useListe AFVISER EN UKENDT INDSTILLING", () => {
    const s = udenKommentarer(readFileSync("src/fleet/useListe.js", "utf8"));
    assert.match(s, /\.\.\.ukendte/,
      "useListe samler ikke ukendte indstillinger op");
    assert.match(s, /ukendte indstillinger/,
      "useListe fejler ikke på en ukendt indstilling");
  });
});

describe("Shellen har ingen vælger", () => {
  const shell = udenKommentarer(readFileSync("src/fleet/AppShell.jsx", "utf8"));

  test("⚠ INGEN GODS/BUS-KNAPPER", () => {
    assert.ok(!/setDivision/.test(shell), "vælgeren er tilbage i shellen");
    assert.ok(!/"Gods"|"Bus"/.test(shell), "knapperne er tilbage");
    assert.ok(!/fc-div\b/.test(shell), "vælgerens element står endnu");
  });

  /**
   * ⚠ OG FLAGET DER SLOG DEN FRA, ER OGSÅ VÆK. `udenDivision` i nav.js var
   * det FØRSTE sted maskineriet gav efter: Fleets skærme kunne ikke bære
   * aksen, fordi beslutning 19 forbød feltet på deres noder. En undtagelse
   * der bliver nødvendig for et helt modul, er ikke en undtagelse — det er
   * en oplysning om at reglen er forkert. Den slags er værd at se, før man
   * bygger undtagelse nummer to.
   */
  test("⚠ udenDivision-FLAGET FINDES IKKE LÆNGERE", () => {
    const nav = udenKommentarer(readFileSync("src/fleet/nav.js", "utf8"));
    assert.ok(!/udenDivision/.test(nav),
      "flaget er tilbage — så er der noget at slå fra igen");
  });
});

describe("Konteksten har ingen tilstand at skifte", () => {
  const ctx = udenKommentarer(readFileSync("src/fleet/FleetContext.jsx", "utf8"));

  /**
   * ⚠ EN SETTER DER FINDES, BLIVER KALDT. Det er den samme begrundelse som
   * bag at der ikke findes en `slet()` i `skriv.js`.
   */
  test("⚠ INGEN setDivision", () => {
    assert.ok(!/setDivision/.test(ctx), "setteren er tilbage");
    assert.ok(!/useState\([^)]*division/i.test(ctx), "division er en tilstand igen");
  });

  /**
   * ⚠ VÆRDIEN ER DER ENDNU, OG DET ER MED VILJE — men kun indtil etape 3.
   *
   * `division` er stadig et PÅKRÆVET felt på syv noder i de udrullede regler.
   * Fjernede vi værdien nu, ville hver skærm der opretter en booking, skrive
   * en post reglen afviser. Feltet og reglen forlader systemet i SAMME
   * ombæring — et af delene alene lukker skrivningen.
   */
  test("⚠ VÆRDIEN ER EN KONSTANT, IKKE ET VALG", () => {
    assert.match(ctx, /const division = "gods";/,
      "division er ikke længere en konstant — er etape 3 kørt, skal prøven "
      + "skrives om, og så skal feltet også være væk af reglerne");
  });

  test("den gemmes ikke i localStorage", () => {
    assert.ok(!/JSON\.stringify\(\{[^}]*division/.test(ctx),
      "en gemt division ville blive læst tilbage som et valg nogen havde truffet");
  });
});
