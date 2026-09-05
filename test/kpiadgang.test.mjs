/* test/kpiadgang.test.mjs
 * Et nøgletal der ikke blev hentet, må ikke se ud som et der ikke kan regnes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `medFuldForm()` lægger skelettet tilbage, så ingen skærm bliver hvid når et
 * domæne mangler — og hvert felt bliver `null`, som `num()` skriver som **—**.
 *
 * Den streg betyder *ikke beregnet*: aggregeringen kunne ikke svare. Efter
 * beslutning 104 betyder den også *ikke hentet*: vi spurgte ikke, fordi
 * brugeren ikke må se grundlaget. **To kendsgerninger, ét tegn.**
 *
 * Målt: en chauffør mistede **fire af ti domæner** på forsiden, og der stod
 * ikke ét sted hvorfor. Det er den samme skelnen som `TILSTAND.modulMangler`
 * mod `naegtet` (beslutning 95) og som `MAALING_AARSAG` (91) — og den manglede
 * for nøgletal.
 *
 * Se beslutning 105.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

import {
  ALLE_KPI_DOMAENER, KPI_DOMAENE, KPI_PERM,
  laesbareDomaener, utilgaengeligeDomaener, DOMAENE_AARSAG, medFuldForm,
} from "../src/fleet/kpi-aggregering.js";

const udenKommentarer = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const alt = () => true;
const intet = () => false;

describe("utilgaengeligeDomaener er komplementet til laesbareDomaener", () => {
  /**
   * ⚠ DE TO SKAL DÆKKE HINANDEN PRÆCIST. Var der et domæne i ingen af dem,
   * ville det forsvinde uden en grund — og det er netop fejlen filen findes
   * for. Var der et i begge, ville skærmen både hente det og sige at den ikke
   * kunne.
   */
  it("⚠ HVERT DOMÆNE ER ENTEN LÆSBART ELLER HAR EN GRUND", () => {
    const kombinationer = [
      [alt, alt], [alt, intet], [intet, alt], [intet, intet],
      [(m) => m === "flaade", (p) => p === "indkoeb.laes"],
    ];
    for (const [hm, hp] of kombinationer) {
      const kan = laesbareDomaener(hm, hp);
      const kan_ikke = Object.keys(utilgaengeligeDomaener(hm, hp));
      assert.deepEqual([...kan, ...kan_ikke].sort(), [...ALLE_KPI_DOMAENER].sort());
      assert.equal(kan.filter((d) => kan_ikke.includes(d)).length, 0,
        "et domæne står som både læsbart og utilgængeligt");
    }
  });

  it("med alt er der ingen utilgængelige", () => {
    assert.deepEqual(utilgaengeligeDomaener(alt, alt), {});
  });
});

describe("De to grunde peger på hver sin handling", () => {
  /**
   * ⚠ MODULET FØRST. Har kunden ikke købt modulet, er permissionen et
   * spørgsmål der aldrig blev stillet. "Du mangler en rettighed" ville sende
   * brugeren til sin administrator over noget der skal KØBES — og det er
   * samme skelnen som `modulMangler` mod `naegtet` i beslutning 95: en
   * afvisning betyder at nogen skal se på rettighederne, et manglende modul
   * at nogen skal ringe til os.
   */
  it("⚠ ET DOMÆNE UDEN MODUL SIGER modul, IKKE perm", () => {
    /* `indkoeb` mangler både modulet og permissionen. */
    const u = utilgaengeligeDomaener(intet, intet);
    assert.equal(u.indkoeb, DOMAENE_AARSAG.modul);
  });

  it("⚠ OG MED MODULET, MEN UDEN PERMISSIONEN, SIGER DET perm", () => {
    const u = utilgaengeligeDomaener(alt, intet);
    for (const d of Object.keys(KPI_PERM)) {
      assert.equal(u[d], DOMAENE_AARSAG.perm, `${d} fik forkert grund`);
    }
  });

  it("et domæne uden både modul og permission er altid læsbart", () => {
    /* `afvigelser` er den ene af ti der er fri i begge akser — se
       beslutning 104. Kan den blive utilgængelig, er noget gået galt. */
    assert.ok(!KPI_DOMAENE.afvigelser && !KPI_PERM.afvigelser);
    assert.ok(!utilgaengeligeDomaener(intet, intet).afvigelser);
  });

  it("⚠ EN BRUGER MED KUN kunder.laes MISTER SEKS DOMÆNER — og de er alle perm, ikke modul", () => {
    /* Kunden har modulerne; brugeren mangler permissionerne. Sagde skærmen
       "virksomheden har ikke modulet", ville han ringe til os om noget der
       skal ordnes i hans egen opsætning.
       ⚠ BESLUTNING 121 UDVIDEDE FRA FIRE TIL SEKS. `opgaver` og
       `disponering` fik hver `etaper.laes` som krav, da `etaper` fik sin
       første læse-permission (KPI_KILDER/KPI_PERM). Den rigtige chauffør
       mister ingen af de to i praksis — han har etaper.laes som standard
       (BASIS_LAES) — men denne prøve simulerer en bruger med KUN
       kunder.laes, ikke chaufførens faktiske sæt. */
    const u = utilgaengeligeDomaener(alt, (p) => p === "kunder.laes");
    assert.deepEqual(Object.keys(u).sort(),
      ["disponering", "facility", "flaade", "indkoeb", "oekonomi", "opgaver"]);
    for (const grund of Object.values(u)) {
      assert.equal(grund, DOMAENE_AARSAG.perm);
    }
  });
});

describe("Formen overlever et manglende domæne", () => {
  /**
   * ⚠ INGEN HVID SKÆRM. Det var `bemanding` der forsvandt ud af noden og gav
   * en hvid Bemanding-skærm; `medFuldForm()` findes af den grund. Den skal
   * blive ved med at virke, også når domænet mangler fordi det ikke blev
   * HENTET frem for fordi det ikke blev SKREVET.
   */
  it("⚠ ET UHENTET DOMÆNE HAR STADIG SINE FELTER", () => {
    const k = medFuldForm({ kunder: { antal: 4 } });
    for (const d of ALLE_KPI_DOMAENER) {
      assert.ok(k[d] !== undefined, `${d} mangler helt — skærmen ville kaste`);
    }
    assert.equal(k.oekonomi.ikkeFaktureretForloeb, null);
  });
});

describe("useKpi svarer HVORFOR, ikke bare hvad", () => {
  const KILDE = udenKommentarer(readFileSync("src/fleet/useKpi.js", "utf8"));

  it("den returnerer utilgaengelige", () => {
    assert.match(KILDE, /utilgaengelige/);
    assert.match(KILDE, /return \{[^}]*utilgaengelige[^}]*\}/);
  });

  /**
   * ⚠ BÆLTET VINDER. `afviste` er dem serveren sagde nej til, selv om vi
   * troede vi måtte få dem — modullisten kan være forældet. Står den sidst i
   * objektliteralet, overskriver den en `modul`- eller `perm`-grund vi selv
   * havde udledt, og det er den rigtige rækkefølge: serveren har ret.
   */
  it("⚠ EN SERVERAFVISNING OVERSKRIVER VORES EGEN UDLEDNING", () => {
    const i = KILDE.indexOf("utilgaengeligeDomaener(");
    const j = KILDE.indexOf("DOMAENE_AARSAG.afvist");
    assert.ok(i > 0 && j > i,
      "afviste skal spredes ind SIDST, ellers vinder vores egen gætning");
  });
});

describe("Skærmene siger det", () => {
  const filer = [];
  const gaa = (d) => {
    for (const f of readdirSync(d)) {
      const s = `${d}/${f}`;
      if (statSync(s).isDirectory()) gaa(s);
      else if (f.endsWith(".jsx")) filer.push(s);
    }
  };
  gaa("src/moduler");

  /** De domæner en skærm læser ud af `k`. */
  const domaenerI = (fil) => {
    const t = udenKommentarer(readFileSync(fil, "utf8"));
    if (!/useKpi\(\)/.test(t)) return [];
    return [...new Set([...t.matchAll(/\bk\.([a-z]+)\./g)].map((m) => m[1]))]
      .filter((d) => ALLE_KPI_DOMAENER.includes(d));
  };

  /**
   * ⚠ KRAVET. En skærm der viser et domæne som KAN blive utilgængeligt, skal
   * kunne sige hvorfor det mangler. Ellers står der streger, og en streg
   * betyder noget andet.
   */
  it("⚠ HVER SKÆRM MED ET SPÆRBART DOMÆNE TEGNER <Kpiadgang>", () => {
    const mangler = [];
    for (const f of filer) {
      const d = domaenerI(f);
      const spaerbare = d.filter((x) => KPI_PERM[x] || KPI_DOMAENE[x]);
      if (!spaerbare.length) continue;
      const t = readFileSync(f, "utf8");
      if (!/<Kpiadgang /.test(t)) {
        mangler.push(`${f.replace("src/moduler/", "")} (${spaerbare.join(", ")})`);
      }
    }
    assert.deepEqual(mangler, [],
      "skærme der viser et domæne som kan mangle, uden at kunne sige hvorfor. "
      + "Tilføj <Kpiadgang utilgaengelige={utilgaengelige} /> øverst:\n  "
      + mangler.join("\n  "));
  });

  it("⚠ OG DEN FÅR SIN VÆRDI FRA useKpi, IKKE FRA EN LOKAL VARIABEL", () => {
    /* ⚠ SKIVE 2C.1-UNDTAGELSE: Dashboard.jsx. Reglen findes for at
       forhindre en skærm i stille at opfinde eller udelade en advarsel
       Kpiadgang skulle have vist. Dashboard er den ENESTE skærm der
       aggregerer på tværs af ALLE domæner samtidig, filtreret gennem en
       PER-BRUGER synlighed (navvisning/dashboardvisning) ingen anden
       skærm har — en advarsel om "Økonomi & Rapporter" er støj for en
       lagermedarbejder hvis navvisning aldrig viser arbejdsområdet
       "oekonomi". Undtagelsen kræver stadig at værdien er UDLEDT af
       useKpi's egen `utilgaengelige` ved et `Object.entries(utilgaengelige)`
       — ikke opdigtet eller tavst tømt. Se Dashboard.jsx's egen kommentar
       ved `kpiadgangRelevant`. */
    const DASHBOARD_UNDTAGET = "src/moduler/Dashboard.jsx";
    for (const f of filer) {
      const t = readFileSync(f, "utf8");
      if (!/<Kpiadgang /.test(t)) continue;
      assert.match(udenKommentarer(t), /= useKpi\(\)/);
      if (f === DASHBOARD_UNDTAGET) {
        assert.match(t, /<Kpiadgang utilgaengelige=\{kpiadgangRelevant\} \/>/,
          `${f}: forventede den dokumenterede Skive 2C.1-filtrering`);
        assert.match(udenKommentarer(t),
          /kpiadgangRelevant = Object\.fromEntries\(\s*Object\.entries\(utilgaengelige\)/,
          `${f}: kpiadgangRelevant skal udledes af utilgaengelige, ikke opfindes`);
        continue;
      }
      assert.match(t, /<Kpiadgang utilgaengelige=\{utilgaengelige\} \/>/,
        `${f} sender noget andet end useKpi's svar`);
    }
  });

  it("den findes som komponent i ui.jsx", () => {
    const ui = readFileSync("src/fleet/ui.jsx", "utf8");
    assert.match(ui, /export const Kpiadgang = /);
    /* ⚠ INTET AT SIGE → INGENTING. En tom kasse på hver skærm ville være støj,
       og støj bliver slået fra. */
    assert.match(udenKommentarer(ui), /if \(!poster\.length\) return null;/);
  });
});
