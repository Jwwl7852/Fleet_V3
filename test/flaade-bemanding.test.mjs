/* test/flaade-bemanding.test.mjs
 * Flådens og bemandingens nøgletal — beslutning 69.
 *
 * ⚠ HVORFOR DE OVERHOVEDET KUNNE REGNES. De sytten felter stod som null med
 * begrundelsen "kan flåden og bemandingen deles på division?" — et åbent
 * spørgsmål. Svaret stod i beslutning 19's FØRSTE SÆTNING hele tiden:
 *
 *   "Ingen abonnent har både gods og bus; en busvognmand har kun ét sæt tal,
 *    så der var aldrig noget at dele op."
 *
 * Der var altså ikke et spørgsmål om hvordan man deler — der var et spørgsmål
 * om man skal, og svaret var nej. Ni felter kunne regnes med det samme.
 *
 * ⚠ OG DE TRE UDLEDNINGER BLEV MÅLT, IKKE VURDERET, på den udrullede DEV-base:
 *   - efter BRUGEN: 15 af 16 køretøjer og 29 af 35 medarbejdere har aldrig
 *     været på en etape. Ikke svært — dødt.
 *   - efter HJEMSTED: Kolding har fire trækkere OG en buschauffør. En garage,
 *     ikke en afdeling.
 *   - efter ARTEN: kun et gæt hvis man tvinger det til at være binært — men
 *     der er ingen grund til at gætte, når svaret er at de ikke deles.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { flaadetal, bemandingstal } from "../src/fleet/kpi-aggregering.js";

const DAG = 86400000;
/* Fast tidspunkt: et nøgletal der afhænger af hvornår prøven køres, er ikke
   en prøve. Samme grund som Date.now() er forbudt i workflow-scripts. */
const NU = new Date(2026, 7, 20, 12).getTime();

describe("Flådens tal", () => {
  test("tæller status for status", () => {
    const f = flaadetal([
      { status: "aktiv" }, { status: "aktiv" },
      { status: "vaerksted" }, { status: "udeAfDrift" },
      { status: "solgt" }, { status: "skrottet" },
    ], NU);
    assert.equal(f.aktive, 2);
    assert.equal(f.paaVaerksted, 1);
    assert.equal(f.udeAfDrift, 1);
  });

  /**
   * ⚠ SOLGT OG SKROTTET ER HVERKEN AKTIVE ELLER UDE AF DRIFT.
   *
   * "Ude af drift" er en bil vi HAR, som ikke kan køre — den koster penge og
   * skal på benene igen. En solgt bil er ikke vores. Talte de med, ville
   * flåden se ud til at have et voksende problem hver gang nogen solgte en
   * gammel lastbil, og tallet ville aldrig kunne blive bedre.
   */
  test("⚠ EN SOLGT BIL ER IKKE UDE AF DRIFT — DEN ER IKKE VORES", () => {
    const f = flaadetal([{ status: "solgt" }, { status: "skrottet" }], NU);
    assert.equal(f.aktive, 0);
    assert.equal(f.udeAfDrift, 0, "en solgt bil tælles som et driftsproblem");
    assert.equal(f.paaVaerksted, 0);
  });

  /**
   * ⚠ KUN FREMAD. Et serviceinterval der ligger BAGUD, er overskredet — et
   * andet og værre tal. Talt med i "inden 30 dage" ville en bil der skulle
   * have været til syn i marts, se ud som noget man har god tid til.
   */
  test("⚠ EN OVERSKREDET SERVICE ER IKKE 'INDEN 30 DAGE'", () => {
    const f = flaadetal([
      { status: "aktiv", naesteServiceMs: NU - 5 * DAG },   // overskredet
      { status: "aktiv", naesteServiceMs: NU + 10 * DAG },  // tæller
      { status: "aktiv", naesteServiceMs: NU + 40 * DAG },  // for langt ude
      { status: "aktiv" },                                   // intet interval
    ], NU);
    assert.equal(f.serviceInden30, 1);
  });

  /**
   * ⚠ driftPrKmOere ER EN SATS, IKKE EN MÅLING — og derfor er
   * omkostningPrKmOere null selv om feltet står på hver eneste bil.
   *
   * Lagde vi satserne sammen, kunne tallet aldrig afvige fra budgettet, fordi
   * det ER budgettet. Det ville se ud som en måling og være en gentagelse af
   * vores eget gæt. Prøven findes fordi feltet ER der og frister.
   */
  test("⚠ SATSEN PÅ BILEN GØR IKKE OMKOSTNINGEN PR. KM TIL EN MÅLING", () => {
    const f = flaadetal([
      { status: "aktiv", driftPrKmOere: 340, kmStand: 250000 },
      { status: "aktiv", driftPrKmOere: 410, kmStand: 180000 },
    ], NU);
    assert.equal(f.omkostningPrKmOere, null,
      "satsen er begyndt at blive brugt som en måling");
    assert.equal(f.omkostningPrKmDeltaOere, null);
  });

  /**
   * ⚠ NEDETID KRÆVER EN VARIGHED. `status: "vaerksted"` siger at bilen er ude
   * NU. `paaVaerksted / aktive` ville være et ØJEBLIKSBILLEDE klædt ud som en
   * periode — to biler på liften ud af elleve er ikke "18 % nedetid", det er
   * 18 % lige nu, og tallet ville hoppe med hver kørsel af jobbet uden at
   * driften havde ændret sig.
   */
  test("⚠ NEDETID REGNES IKKE AF ET ØJEBLIKSBILLEDE", () => {
    const f = flaadetal([
      { status: "vaerksted" }, { status: "vaerksted" },
      ...Array.from({ length: 9 }, () => ({ status: "aktiv" })),
    ], NU);
    assert.equal(f.paaVaerksted, 2, "forudsætningen for prøven holder ikke");
    assert.equal(f.nedetidPct, null, "nedetiden er regnet af et øjebliksbillede");
    assert.equal(f.nedetidDeltaPoint, null);
  });

  test("en tom flåde er nul, ikke null", () => {
    const f = flaadetal([], NU);
    assert.equal(f.aktive, 0, "ingen biler er et SVAR — nul, ikke ubesvaret");
  });
});

describe("Bemandingens tal", () => {
  const PERSONALE = [
    { id: "p1", status: "aktiv", funktioner: { chauffoer: true } },
    { id: "p2", status: "aktiv", funktioner: { buschauffoer: true } },
    { id: "p3", status: "aktiv", funktioner: { mekaniker: true } },
    { id: "p4", status: "orlov", funktioner: { chauffoer: true } },
    { id: "p5", status: "fratraadt", funktioner: { chauffoer: true } },
  ];

  test("tæller de aktive og ikke de fratrådte", () => {
    const b = bemandingstal(PERSONALE, [], [], [], NU);
    assert.equal(b.medarbejdereAktive, 3);
  });

  /**
   * ⚠ FRAVÆRET ER EN PERIODE, IKKE EN DAG. Talte man dem der BEGYNDER i dag,
   * ville en sygemelding på tre uger tælle med på dag ét og være væk på dag
   * to — og bemandingen ville se hel ud mens en tredjedel var hjemme.
   */
  test("⚠ EN SYGEMELDING PÅ TRE UGER TÆLLER MED PÅ DAG TI", () => {
    const b = bemandingstal(PERSONALE, [], [
      { personId: "p1", fra: NU - 10 * DAG, til: NU + 11 * DAG },  // midt i
      { personId: "p2", fra: NU + 2 * DAG, til: NU + 5 * DAG },    // først senere
      { personId: "p3", fra: NU - 20 * DAG, til: NU - 2 * DAG },   // ovre
    ], [], NU);
    assert.equal(b.fravaerIDag, 1);
  });

  /**
   * ⚠ DISPONERET ER PERSONER, IKKE ETAPER. En chauffør med tre ture i dag er
   * ÉN disponeret person. Talte vi etaper, kunne tallet overstige antallet af
   * ansatte — og det står ved siden af "aktive medarbejdere", hvor det ville
   * læses som en andel.
   */
  test("⚠ TRE TURE PÅ ÉN CHAUFFØR ER ÉN DISPONERET", () => {
    const etaper = [
      { personId: "p1", fra: NU - 3600000, til: NU + 3600000 },
      { personId: "p1", fra: NU, til: NU + 7200000 },
      { personId: "p1", fra: NU + 7200000, til: NU + 10800000 },
    ];
    const b = bemandingstal(PERSONALE, [], [], etaper, NU);
    assert.equal(b.disponeret, 1);
    assert.ok(b.disponeret <= b.medarbejdereAktive,
      "flere disponerede end ansatte — så tælles der etaper");
  });

  /**
   * ⚠ EN BUSCHAUFFØR ER OGSÅ EN CHAUFFØR. De to funktioner er forskellige
   * fordi kørekortet er det, men i tallet "chauffører disponeret" hører de
   * begge — ellers ville en busvognmands chauffører tælle nul.
   */
  test("⚠ chauffoerDisponeret TÆLLER BEGGE SLAGS CHAUFFØR", () => {
    const b = bemandingstal(PERSONALE, [], [], [
      { personId: "p1", fra: NU - 100, til: NU + 100 },   // chauffoer
      { personId: "p2", fra: NU - 100, til: NU + 100 },   // buschauffoer
      { personId: "p3", fra: NU - 100, til: NU + 100 },   // mekaniker
    ], NU);
    assert.equal(b.disponeret, 3);
    assert.equal(b.chauffoerDisponeret, 2, "buschaufføren er talt fra");
  });

  /* ⚠ KUN FREMAD, som serviceintervallet. En kompetence der ALLEREDE er
     udløbet, BLOKERER en disponering — den er ikke en advarsel om noget der
     kommer, og lagt sammen ville de to skjule hinanden. */
  test("⚠ EN UDLØBET KOMPETENCE ER IKKE EN DER 'UDLØBER SNART'", () => {
    const b = bemandingstal(PERSONALE, [
      { personId: "p1", udloeberMs: NU - DAG },
      { personId: "p2", udloeberMs: NU + 10 * DAG },
      { personId: "p3", udloeberMs: NU + 90 * DAG },
    ], [], [], NU);
    assert.equal(b.kompetencerUdloeber, 1);
  });

  /**
   * ⚠ "PLANLAGT" ER IKKE "ANSAT", og der findes ingen vagtplan.
   *
   * Sattes det lig med medarbejdereAktive, ville tallet påstå at hver ansat er
   * på arbejde hver dag — ferie, orlov, deltid og weekend forsvandt i ét tal,
   * og "disponeret af planlagt" ville blive en kapacitetsprocent der aldrig
   * kunne nå 100.
   */
  test("⚠ VAGTPLANEN FINDES IKKE — planlagt SÆTTES IKKE LIG ANSAT", () => {
    const b = bemandingstal(PERSONALE, [], [], [], NU);
    assert.equal(b.planlagt, null, "planlagt er sat lig antallet af ansatte");
    assert.equal(b.chauffoerPlanlagt, null);
    assert.equal(b.underbemandede, null,
      "underbemandet er regnet uden et behov at måle imod");
  });

  /**
   * ⚠ ledig ER UDE AF kpi/ — beslutning 71.
   *
   * Den var præcis `planlagt − disponeret`, altså et gemt afledt tal, og
   * husets navngivne eksempel på fejlen. Nu regnes den af `ledig()` i
   * dashboards.js, hos forbrugeren.
   *
   * ⚠ PRØVEN KRÆVER undefined OG IKKE null. Et `ledig: null` ville betyde
   * "vi prøvede og kunne ikke" — og feltet ville stå i noden som et
   * ubesvaret spørgsmål. Det er ikke ubesvaret; det hører ikke hjemme.
   */
  test("⚠ ledig SKRIVES IKKE — den hører hos forbrugeren", () => {
    const b = bemandingstal(PERSONALE, [], [], [
      { personId: "p1", fra: NU - 100, til: NU + 100 },
    ], NU);
    assert.ok(!("ledig" in b),
      "ledig er tilbage i kpi/ — et gemt afledt tal driver fra sit grundlag");
  });
});

describe("De to deles ikke på division", () => {
  /**
   * ⚠ FUNKTIONERNE TAGER SLET INGEN division-PARAMETER, og det er selve
   * beslutningen — ikke en forglemmelse.
   *
   * Feltet er FORBUDT på `koeretoejer` og `personale` (beslutning 19,
   * håndhævet med `.validate: false`). En parameter der ikke kunne bruges til
   * noget, ville få den næste til at tro at den kunne — og så ville nogen
   * filtrere på et felt der aldrig står der, og få nul biler i begge
   * divisioner uden at noget fejlede.
   */
  test("⚠ INGEN AF DE TO TAGER EN DIVISION", () => {
    /* ⚠ IKKE Function.length — den tæller kun parametrene FØR den første med
       en standardværdi, og begge funktioners første har én. Tallet ville være
       0 for begge og prøven grøn uanset hvad. Signaturen læses derfor som
       tekst; det er den eneste måde spørgsmålet faktisk bliver stillet. */
    const sig = (f) => f.toString().slice(0, f.toString().indexOf(")") + 1);
    for (const f of [flaadetal, bemandingstal]) {
      assert.ok(!/\bdivision\b/.test(sig(f)),
        `${f.name} har fået en division-parameter — feltet er forbudt på `
        + "stamdata, så den kunne kun bruges til at filtrere på noget der "
        + "aldrig står der");
    }
    /* Og heller ikke i kroppen: et opslag ville være samme fejl et niveau ind. */
    for (const f of [flaadetal, bemandingstal]) {
      assert.ok(!/iDivision\(/.test(f.toString()),
        `${f.name} filtrerer på division inde i kroppen`);
    }
  });
});
