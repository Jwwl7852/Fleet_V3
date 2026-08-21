/* test/tom-kpi.test.mjs
 * En tom kpi-node må ikke blanke en skærm der har data — beslutning 73.
 *
 * ⚠ HVORFOR FILEN FINDES. En rigtig tenants `kpi`-node stod tom, og **ti
 * skærme så i stykker ud af én manglende node**. Fire af dem havde deres
 * indhold i behold: Workforce med 35 medarbejdere i basen, Planning og
 * Disponering med syv opslag hver, Kunder med sit kartotek. De returnerede på
 * `if (!k)` FØR de tegnede noget.
 *
 * ⚠ OG KRITERIET FANDTES I FORVEJEN. `datatilstand.js` skrev det selv:
 *
 *   "Har skærmen noget under nøgletallene som den læser DIREKTE fra basen?
 *    Har den det — en tabel man kan oprette i — må den ikke blokere."
 *
 * Reglen var rigtig og anvendt forkert. **En regel der er skrevet rigtigt og
 * anvendt forkert, er svær at få øje på — den ser jo begrundet ud.** Derfor
 * regner prøven her kriteriet ud af skærmene selv i stedet for at holde en
 * liste ved lige.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { blokerer, TILSTAND } from "../src/fleet/datatilstand.js";
import { medFuldForm } from "../src/fleet/kpi-aggregering.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const skaerme = (rod, ud = []) => {
  for (const n of readdirSync(rod)) {
    const p = join(rod, n);
    if (statSync(p).isDirectory()) skaerme(p, ud);
    else if (n.endsWith(".jsx")) ud.push(p);
  }
  return ud;
};

/** Skærme der læser nøgletal, med deres to tal: blanker den, og har den lister? */
const KPI_SKAERME = skaerme("src/moduler")
  .map((fil) => {
    const s = udenKommentarer(readFileSync(fil, "utf8"));
    if (!s.includes("useKpi()")) return null;
    return {
      fil: fil.replace(/\\/g, "/").replace("src/moduler/", ""),
      blanker: /if \(!k\) return|if \(!kpi\) return/.test(s),
      lister: (s.match(/useListe\(/g) || []).length,
    };
  })
  .filter(Boolean);

describe("Kriteriet anvendes, ikke bare beskrives", () => {
  test("der ER skærme at prøve", () => {
    assert.ok(KPI_SKAERME.length >= 15, `kun ${KPI_SKAERME.length} skærme læser nøgletal`);
  });

  /**
   * ⚠ DEN VIGTIGSTE PRØVE I FILEN.
   *
   * En skærm med bare ÉT `useListe` har noget under nøgletallene som den
   * læser direkte fra basen — og må derfor ikke blanke. Det var fire skærme
   * der gjorde det, med 1, 1, 6 og 7 opslag.
   */
  test("⚠ EN SKÆRM MED LISTER MÅ IKKE BLANKE PÅ MANGLENDE NØGLETAL", () => {
    const forkerte = KPI_SKAERME
      .filter((s) => s.blanker && s.lister > 0)
      .map((s) => `${s.fil} (${s.lister} useListe-kald)`);
    assert.deepEqual(forkerte, [],
      "skærmen returnerer på !k, men har tabeller den læser direkte fra basen — "
      + "brug blokerer(tilstand), så en tom kpi-node ikke skjuler data der findes");
  });

  /**
   * ⚠ OG DEN MODSATTE VEJ. Dashboard og Økonomi har NUL opslag: uden tallene
   * er der intet tilbage at tegne, og hvert felt skulle sige "ikke
   * aggregeret". Beskeden ÉN gang er det ærlige svar.
   *
   * Holder de op med at blokere, står brugeren med en skærm fuld af streger
   * og ingen forklaring — den anden halvdel af den samme fejl.
   */
  test("⚠ EN SKÆRM UDEN LISTER SKAL BLOKERE — ellers er den fuld af streger", () => {
    const forkerte = KPI_SKAERME
      .filter((s) => !s.blanker && s.lister === 0)
      .map((s) => s.fil);
    assert.deepEqual(forkerte, [],
      "skærmen er bygget af nøgletal alene og tegner alligevel uden dem");
  });

  /* Og de to er navngivet, så en tredje ikke glider ind uden at nogen ser det. */
  test("præcis Dashboard og Økonomi er bygget af nøgletal alene", () => {
    const rene = KPI_SKAERME.filter((s) => s.lister === 0).map((s) => s.fil).sort();
    assert.deepEqual(rene, ["Dashboard.jsx", "Oekonomi.jsx"]);
  });
});

describe("useKpi giver formen frem for null", () => {
  /**
   * ⚠ DET ER DEN ENE ÆNDRING DER GØR DE FIRE SKÆRME MULIGE. Et `null` ville
   * få `k.bemanding.disponeret` til at kaste; formen giver `null` i feltet,
   * og `num()` skriver INTET (—), som den skal.
   */
  test("⚠ medFuldForm({}) GIVER HVERT DOMÆNE MED null-FELTER", () => {
    const k = medFuldForm({});
    assert.ok(k, "en tom node giver ikke en form");
    for (const d of ["bemanding", "flaade", "opgaver", "facility", "indkoeb"]) {
      assert.ok(k[d] && typeof k[d] === "object", `${d} mangler i formen`);
    }
    /* Felterne er null — ikke 0, som ville være en påstand. */
    assert.equal(k.bemanding.disponeret, null);
    assert.equal(k.flaade.aktive, null);
  });

  test("⚠ useKpi SÆTTER FORMEN VED ikkeAggregeret, IKKE null", () => {
    const kilde = udenKommentarer(readFileSync("src/fleet/useKpi.js", "utf8"));
    assert.match(kilde, /TILSTAND\.ikkeAggregeret[\s\S]{0,120}setData\(medFuldForm\(\{\}\)\)/,
      "en tom node giver stadig null — så blanker de fire skærme igen");
  });

  /* ⚠ MEN EN AFVISNING GIVER STADIG null. "Ingen tal oven på en afvisning"
     er hele pointen i beslutning 26: demo-tal må ikke lægges oven på en
     permission-denied, og et skelet ville være det samme i tal-form. */
  test("⚠ EN AFVISNING GIVER STADIG null", () => {
    const kilde = udenKommentarer(readFileSync("src/fleet/useKpi.js", "utf8"));
    assert.match(kilde, /TILSTAND\.naegtet[\s\S]{0,80}setData\(null\)/,
      "en afvist læsning får en form — så ligner den et tomt datasæt");
  });
});

describe("blokerer() skelner de to slags", () => {
  test("⚠ ikkeAggregeret BLOKERER IKKE — det er en oplysning", () => {
    assert.equal(blokerer({ art: TILSTAND.ikkeAggregeret }), false);
    assert.equal(blokerer({ art: TILSTAND.ok }), false);
    assert.equal(blokerer({ art: TILSTAND.demo }), false);
  });

  test("⚠ EN AFVISNING BLOKERER — der er intet at tegne", () => {
    assert.equal(blokerer({ art: TILSTAND.naegtet }), true);
    assert.equal(blokerer({ art: TILSTAND.forbindelse }), true);
    assert.equal(blokerer({ art: TILSTAND.uautentificeret }), true);
  });
});
