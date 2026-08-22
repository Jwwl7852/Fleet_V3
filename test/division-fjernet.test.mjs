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
const MODULER = filer("src/moduler");

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

describe("Serveren skriver ikke feltet", () => {
  /**
   * ⚠ DEN FARLIGSTE UDGAVE AF FEJLEN. Admin-SDK'et går uden om ALLE regler —
   * også `.validate` — så en Cloud Function der skriver `division`, lægger
   * feltet i noden **uden at noget siger fra**. En klient ville få en
   * `permission-denied` og opdage det; en funktion får ingenting.
   *
   * Beslutning 70 fejede `src/` og glemte `functions/`: fire funktioner
   * skrev det stadig, og `grundlagskriv` satte det UBETINGET med
   * `|| "faelles"`. Se beslutning 79.
   */
  test("⚠ INGEN CLOUD FUNCTION SKRIVER division", () => {
    const kilde = udenKommentarer(readFileSync("functions/index.js", "utf8"));
    const fundet = [...kilde.matchAll(/^\s*division:.*$/gm)].map((m) => m[0].trim());
    assert.deepEqual(fundet, [],
      "en funktion skriver division. Admin-SDK'et går uden om .validate, så "
      + "feltet lander i noden i tavshed.");
  });

  /**
   * ⚠ OG HELLER IKKE I AUDITLOGGEN. Allowlisten findes for at holde fritekst
   * ude; et felt der ikke kan skrives, hører ikke på den.
   *
   * ⚠ OG PRØVEN SKAL STRIMLE KOMMENTARER FØRST. Første udgave gjorde ikke, og
   * den faldt på **sin egen forklaring** — noten der siger at feltet er
   * fjernet, indeholder ordet. Det er femte gang den fælde dukker op i dette
   * repo: en prøve der læser kilde som tekst, skal fjerne kommentarerne, ellers
   * er den enten grøn af sin egen dokumentation eller rød af den.
   */
  test("⚠ division STÅR IKKE PÅ AUDITLISTEN", () => {
    const kilde = udenKommentarer(readFileSync("src/fleet/audit-regler.js", "utf8"));
    const liste = kilde.slice(kilde.indexOf("LOGBARE_FELTER"));
    assert.ok(!/"division"/.test(liste.slice(0, 1200)),
      "division står på LOGBARE_FELTER, men feltet findes ikke");
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
   * ⚠ HER KRÆVEDE PRØVEN AT VÆRDIEN VAR EN KONSTANT — og noten sagde "men kun
   * indtil etape 3". Etape 3 kørte, feltet blev forbudt overalt, og
   * konstanten blev stående i to måneders arbejde uden at nogen læste den.
   *
   * ⚠ EN PRØVE DER BESKRIVER ET MELLEMSTADIE, SKAL SELV SIGE HVORNÅR DET ER
   * OVRE. Den her gjorde det i en kommentar; kommentaren blev ikke læst, og
   * prøven stod grøn om noget der var færdigt. Nu kræver den det modsatte.
   * Se beslutning 79.
   */
  test("⚠ KONSTANTEN ER OGSÅ VÆK", () => {
    assert.ok(!/const divisions*=/.test(ctx),
      "konstanten er tilbage — en værdi ingen læser, er en akse der ligger og venter");
    assert.ok(!/^s*division,s*$/m.test(ctx),
      "konteksten udstiller stadig en division");
  });

  test("den gemmes ikke i localStorage", () => {
    assert.ok(!/JSON\.stringify\(\{[^}]*division/.test(ctx),
      "en gemt division ville blive læst tilbage som et valg nogen havde truffet");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ LINTEN KIGGEDE ALDRIG I `src/moduler/` — OG DET VAR DER AKSEN LEVEDE
   ══════════════════════════════════════════════════════════════════════════

   Beslutning 70 fjernede aksen; 79 tog de sidste rester i shellen,
   konteksten, `useListe`, Cloud Functions og auditlisten. Prøverne herover
   dækker præcis de steder — og **ingen af dem læste en modulskærm**.

   Målt da Procures overblik blev bygget (beslutning 84): **77 levende
   forekomster i 17 modulfiler**. Ikke kommentarer — kode.

   ⚠ EN LINT DER SPRINGER NOGET OVER, SIGER IKKE NEJ — DEN SIGER INGENTING.
   Samme sætning som `demo-i-skaerm.test.mjs` bærer om `bookinger`
   (beslutning 56), og anden gang mønstret kostede noget.

   ══ HVAD DE 77 FAKTISK VAR ══

   Procure blev ryddet i 84 (−26). Resten i **beslutning 87**, og det var
   ikke kosmetik:

     · `facility/Servicedialog.jsx` havde et **påkrævet Division-felt** på
       `opgaver`, hvis regel har `"division": { ".validate": false }`. Vælger
       man en værdi, afviser serveren; vælger man ingen, klager formularen.
       **Vejen ind var lukket i begge retninger** — nøjagtig samme fejl som
       Procure havde, i et andet modul.
     · `opsaetning/Generelt.jsx` havde et nøgletalskort der sagde
       **"Divisioner: Gods og bus"** — på den ene skærm hvor en kunde læser
       hvad han har købt. En tekst der sælger en funktion produktet ikke har.
     · Fire filtre sammenlignede `x.division === division`, hvor **begge
       sider var `undefined`** — de slap kun igennem fordi
       `undefined === undefined` er sandt.
     · `Kunder.jsx` skrev altid **"aktive i alt i godsafdelingen"**.
     · Værkstedskalenderen sendte `&division=undefined` i en URL **ingen
       læste**, og en `division`-prop til en dialog der ikke nævner den.
     · To variabelnavne løj: `iDivision` og `opgaverIDivision` på lister der
       ikke er delt. **Et navn er en påstand.**

   ⚠ TALLET ER NU NUL, OG DET ER ET FORBUD — IKKE ET LOFT.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ ÉN UNDTAGELSE, OG DEN ER IKKE EN LEMPELSE: en tekst der forklarer at
 * feltet IKKE findes. Den advarer om aksen frem for at bruge den, og **en
 * prøve der råber ad det korrekte, bliver slået fra**. Otte sætninger står
 * tilbage af netop den slags — på Enheder, Medarbejdere, Facility, Procure
 * og Opsætning — og de skal blive: de er det eneste sted en læser får at
 * vide hvorfor der ikke er en gods/bus-vælger.
 */
const FORKLARER_FRAVAERET = /findes ikke|ikke længere|er fjernet|er væk|ingen division|gjorde det heller ikke|ikke divisioner|ikke\s+delt/i;

describe("Aksen findes ikke i modulskærmene — og kommer ikke tilbage", () => {
  test("⚠ INGEN LEVENDE division I src/moduler/ — ET FORBUD", () => {
    const fund = [];
    for (const f of MODULER) {
      const kode = udenKommentarer(readFileSync(f, "utf8"));
      for (const [i, l] of kode.split(/\r?\n/).entries()) {
        if (!/\bdivision(er)?\b|DIVISION/i.test(l)) continue;
        if (FORKLARER_FRAVAERET.test(l)) continue;
        fund.push(`${f}:${i + 1}  ${l.trim().slice(0, 70)}`);
      }
    }
    assert.deepEqual(fund, [],
      "Aksen er fjernet (beslutning 70 og 87). En skærm der filtrerer, viser "
      + "eller KRÆVER `division`, arbejder mod reglerne — feltet er "
      + "`.validate: false` på hver eneste node, så en skrivning bliver afvist "
      + "og et filter sammenligner to `undefined`.\n  " + fund.join("\n  "));
  });

  /**
   * ⚠ OG SHELLEN GIVER DEN IKKE UD LÆNGERE.
   *
   * Alle de fund ovenfor havde én ting til fælles: de læste `division` fra
   * `useFleet()`. Konteksten holdt op med at levere den i beslutning 79 —
   * men **destruktureringen fejler ikke**, den giver bare `undefined`, og
   * det er præcis derfor de kunne blive stående i årevis uden at nogen så
   * noget. En destrukturering af et felt der ikke findes, er tavs.
   */
  test("⚠ INGEN SKÆRM TRÆKKER division UD AF useFleet()", () => {
    const fund = [];
    for (const f of MODULER) {
      const kode = udenKommentarer(readFileSync(f, "utf8"));
      for (const m of kode.matchAll(/const \{([^}]*)\}\s*=\s*useFleet\(\)/g)) {
        if (/\bdivision\b/.test(m[1])) fund.push(`${f}: ${m[1].trim()}`);
      }
    }
    assert.deepEqual(fund, [], "en skærm destrukturerer division ud af shellen — den er `undefined` og har været det siden beslutning 79.\n  " + fund.join("\n  "));
  });
});
