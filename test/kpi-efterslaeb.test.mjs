/* test/kpi-efterslaeb.test.mjs
 * Efterslæbets tal, læst UD af koden — beslutning 68.
 *
 * ⚠ HVORFOR FILEN FINDES. Antallet af felter uden kilde stod **fire steder**,
 * skrevet i hånden, og var forkert **tre** af gangene:
 *
 *     CLAUDE.md          51
 *     README.md          16  (to steder)
 *     kodekommentaren    16
 *     udenKilde()        17  ← det eneste der talte
 *
 * CLAUDE.md var 34 for høj. Og det værste: README beskriver **præcis den
 * drift** et afsnit længere oppe — *"det stod på 38 længe efter at fire felter
 * havde fået en kilde"* — så fejlen var kendt, og svaret var at rette tallet i
 * hånden. Så drev det igen.
 *
 * ⚠ ET FOR HØJT EFTERSLÆB ER IKKE EN HARMLØS AFRUNDING. Tallet er det eneste
 * der siger hvor meget der mangler. Står der 51 hvor der er 17, ser opgaven
 * tre gange så stor ud som den er — og en opgave der ser uoverkommelig ud,
 * bliver ikke taget. Den forkerte retning er lige så slem: står der 16 hvor
 * der er 17, er der et felt ingen leder efter.
 *
 * ⚠ OG SÅ VISTE TALLET SIG AT VÆRE DET FORKERTE TAL.
 *
 * Dagen efter fik flåden og bemandingen deres kilde (beslutning 69), og
 * `udenKilde()` gik fra 17 til **0**. Men kun ni af de sytten blev BESVARET;
 * de øvrige otte flyttede ind i `flaadetal()` og `bemandingstal()`, hvor de
 * står som null med hver sin grund.
 *
 * **Et efterslæb der bliver mindre af at et null flytter sig, er ikke blevet
 * mindre.** Og README kaldte `udenKilde()` "optællingen" — den var aldrig
 * det: målt på det færdige objekt med rigtige data og en forrige kørsel står
 * der **31** null, mod 17 på samlestedets højeste.
 *
 * Prøven tæller derfor nu på det objekt `beregnKpi()` faktisk returnerer.
 * Samme greb som `test/rules.tenant.test.mjs`, hvor nodelisten læses ud af
 * regelfilen: tallet har ÉN kilde, og dokumentationen holdes op mod den.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { beregnKpi, udenKilde, KILDER_DER_MANGLER } from "../src/fleet/kpi-aggregering.js";

/**
 * Sandheden: null-felterne i det objekt der faktisk skrives i noden.
 *
 * ⚠ IKKE `udenKilde()`. Den er ét SAMLESTED for én slags null — de helt
 * ukendte kilder — og den er tom i dag. Et null inde i et regnestykke tæller
 * lige så meget for den der venter på tallet.
 */
const nullFelter = (o, sti = "") => {
  const ud = [];
  for (const [k, v] of Object.entries(o || {})) {
    const s = sti ? `${sti}.${k}` : k;
    if (v === null) ud.push(s);
    else if (v && typeof v === "object" && !Array.isArray(v)) ud.push(...nullFelter(v, s));
  }
  return ud;
};

/* ⚠ UDEN INDDATA. Så er tallet en EGENSKAB ved koden og ikke ved en base:
   det kan regnes af enhver der kører prøven, og det ændrer sig kun når nogen
   lægger et felt i noden eller giver et felt en kilde. */
const FELTER = nullFelter(beregnKpi({ nu: 1_800_000_000_000 })).length;

/**
 * De fire steder tallet står, med den formulering hver af dem bruger.
 *
 * ⚠ EN OMFORMULERING SKAL FÅ PRØVEN TIL AT FEJLE. Det er ikke en skavank —
 * det er hele pointen: skriver nogen sætningen om, skal de også se tallet, og
 * en prøve der stiltiende holdt op med at kigge, ville være værre end ingen.
 * Det var netop sådan de tre forkerte tal overlevede.
 */
const STEDER = [
  { fil: "CLAUDE.md",
    moenster: /`null` for de \*\*(\d+)\*\* felter der ikke kan regnes/ },
  { fil: "README.md",
    moenster: /står \*\*(\d+)\*\* felter som null i noden/ },
];

describe("Efterslæbets tal har én kilde", () => {
  test("⚠ TALLET LÆSES AF NODEN, IKKE AF SAMLESTEDET", () => {
    assert.ok(FELTER > 0, "efterslæbet er tomt — så skal teksterne skrives om, ikke tælles");

    /**
     * ⚠ udenKilde() MÅ GERNE VÆRE TOM — men den må ikke være OPTÆLLINGEN.
     * Da flåden fik sin kilde, gik den fra 17 til 0 mens otte af felterne blot
     * flyttede ind i en funktion. Havde tallet stået på samlestedet, ville
     * efterslæbet have set lukket ud.
     */
    const paaSamlestedet = Object.values(udenKilde())
      .reduce((n, d) => n + Object.keys(d).length, 0);
    assert.ok(FELTER > paaSamlestedet,
      "samlestedet rummer lige så meget som noden — så er et null flyttet "
      + "tilbage, eller optællingen er begyndt at læse det forkerte sted");
  });

  /**
   * ⚠ TALLET STÅR FIRE STEDER, OG DE SKAL VÆRE ENIGE. Det er ikke pedanteri:
   * CLAUDE.md er den fil der overstyrer hvordan der arbejdes i repoet, og
   * dens tal var 34 for højt. En forkert instruktion er værre end ingen.
   */
  for (const { fil, moenster } of STEDER) {
    test(`${fil} siger det samme som udenKilde() — ${moenster.source.slice(0, 34)}…`, () => {
      const tekst = readFileSync(fil, "utf8");
      const m = tekst.match(moenster);
      assert.ok(m, `${fil}: sætningen er skrevet om. Find tallet og ret prøven `
        + `— den er skrevet så en omformulering IKKE glider forbi.`);
      assert.equal(Number(m[1]), FELTER,
        `${fil} siger ${m[1]}, udenKilde() siger ${FELTER}`);
    });
  }

  /**
   * ⚠ OG DER MÅ IKKE STÅ ET GAMMELT TAL VED SIDEN AF. De tre forkerte tal
   * stod ikke alene — de stod i sætninger der lignede de rigtige. En prøve der
   * kun tjekker de kendte steder, fanger ikke et nyt sted nummer fem.
   */
  test("⚠ INTET ANDET TAL STÅR SOM ET ANTAL FELTER UDEN KILDE", () => {
    const fundet = [];
    for (const fil of ["CLAUDE.md", "README.md"]) {
      const tekst = readFileSync(fil, "utf8");
      for (const m of tekst.matchAll(/(\d+) felter (?:dér )?venter på en kilde/g)) {
        if (Number(m[1]) !== FELTER) fundet.push(`${fil}: "${m[0]}"`);
      }
    }
    assert.deepEqual(fundet, [],
      `et andet antal står som ventende felter. Sandheden er ${FELTER}.`);
  });
});

describe("KILDER_DER_MANGLER er stadig tom — og det er et svar", () => {
  /**
   * ⚠ EN TOM LISTE ER ET SVAR, IKKE EN GLEMT LISTE. Konstanten bliver stående
   * som formen for det næste hul. Bliver den ikke-tom igen, er teksten
   * "der er ikke flere noder uden data" forkert — og så skal den rettes i
   * samme ombæring, ikke opdages et halvt år senere.
   */
  test("⚠ ER DEN IKKE TOM, ER README's PÅSTAND FORKERT", () => {
    const readme = readFileSync("README.md", "utf8");
    /* ⚠ TÅLER EN OMBRYDNING OG ET INDSKUD. Sætningen står i løbende tekst, så
       "er tom", "er\ntom" og "er fortsat tom" er den SAMME påstand. En prøve
       der faldt på et linjeskift, ville blive slået fra frem for forstået —
       og så var vagten væk uden at nogen havde besluttet det. */
    const paastaar =
      /`KILDER_DER_MANGLER`\s+er\s+(?:fortsat\s+|stadig\s+)?tom/.test(readme);
    if (KILDER_DER_MANGLER.length) {
      assert.ok(!paastaar,
        "KILDER_DER_MANGLER har fået poster igen, men README siger stadig den er tom: "
        + JSON.stringify(KILDER_DER_MANGLER));
    } else {
      assert.ok(paastaar, "listen er tom, men README siger det ikke længere");
    }
  });
});
