/* test/kpi-aggregering.test.mjs
 * KPI-aggregeringen — beslutning 6.
 *
 * De to prøver der betyder mest: at et felt uden kilde er `null` og ikke nul,
 * og at en periodeafvigelse er `null` ved første kørsel. Begge er den samme
 * regel: vi skriver ikke et tal der ligner et svar.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  UDEN_DIVISION, KILDER_DER_MANGLER, iDivision, udenKilde,
  kundetal, ikkeFaktureretOere, disponeringstal,
  deltaPct, deltaPoint, beregnKpi,
} from "../src/fleet/kpi-aggregering.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";

const NU = Date.UTC(2026, 7, 18);
const DAG = 86400000;

/* ---- Divisionen -------------------------------------------------------- */

test("⚠ EN POST UDEN DIVISION HØRER TIL BEGGE — ikke til ingen", () => {
  /* Samme regel som divisionsfilteret i useListe. Da beslutning 19 fjernede
     feltet fra bilerne, ville en kopi uden det her led have vist en tom
     biltabel i BÅDE Gods og Bus, uden at nogen havde slettet en bil. */
  assert.equal(iDivision({ division: "gods" }, "gods"), true);
  assert.equal(iDivision({ division: "bus" }, "gods"), false);
  assert.equal(iDivision({ division: "faelles" }, "gods"), true);
  assert.equal(iDivision({}, "gods"), true, "en post uden division forsvandt");
  assert.equal(iDivision({}, "bus"), true);
});

test("⚠ LISTEN OVER KILDER UDEN DIVISION ER MÅLT", () => {
  /* Talt op mod den udrullede base: 0 af 16 køretøjer og 0 af 80 kompetencer
     har feltet, mens 14 af 14 kunder og 8 af 8 etaper har det. Flytter nogen
     en division ned på stamdata, bryder de beslutning 19 — og så skal den her
     liste rettes bevidst. */
  for (const n of ["koeretoejer", "personale", "kompetencer"]) {
    assert.ok(UDEN_DIVISION.includes(n), `${n} mangler paa listen`);
  }
  for (const n of ["kunder", "etaper"]) {
    assert.ok(!UDEN_DIVISION.includes(n), `${n} baerer en division og skal ikke staa der`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   DEN VIGTIGSTE
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ ET FELT UDEN KILDE ER null — IKKE NUL", () => {
  /* `opgaver`, `indkoeb` og `facility` findes ikke som noder. Skrev vi 0,
     ville skærmen sige "0 åbne ordrer" — en tom liste, ikke et ubesvaret
     spørgsmål. */
  const tomme = udenKilde();
  for (const [domaene, felter] of Object.entries(tomme)) {
    for (const [felt, vaerdi] of Object.entries(felter)) {
      assert.equal(vaerdi, null, `${domaene}.${felt} er ${vaerdi} og ikke null`);
    }
  }
});

test("felterne UDELADES ikke — de står med null", () => {
  /* Udelades de, får skærmen `undefined` og samme streg — men så står
     spørgsmålet ingen steder, og ingen kan se af noden hvad der mangler. */
  const k = beregnKpi({ division: "gods", nu: NU });
  assert.ok("forsinkede" in k.opgaver, "opgaver.forsinkede er udeladt");
  assert.ok("aktiver" in k.facility);
  assert.ok("aabneOrdrer" in k.indkoeb);
  assert.ok("aktive" in k.flaade, "flaade.aktive er udeladt");
});

test("⚠ FLÅDEN OG BEMANDINGEN KAN IKKE DELES PÅ DIVISION", () => {
  /* Et køretøj er ikke gods eller bus; det er en lastbil. At udlede
     divisionen af ARTEN ville være et gæt: en varevogn kan køre for
     busafdelingen. */
  const gods = beregnKpi({ division: "gods", nu: NU });
  const bus = beregnKpi({ division: "bus", nu: NU });
  assert.equal(gods.flaade.aktive, null);
  assert.equal(bus.flaade.aktive, null);
  assert.equal(gods.bemanding.disponeret, null);
});

test("⚠ HVER KILDE DER MANGLER, ER NAVNGIVET", () => {
  /* Så efterslæbet kan tælles frem for at blive opdaget felt for felt. */
  for (const n of ["indkoeb", "facility"]) {
    assert.ok(KILDER_DER_MANGLER.includes(n));
  }
  /* ⚠ opgaver STÅR IKKE LÆNGERE PÅ LISTEN. Noden havde regler og ingen data;
     nu seedes den, og de elleve felter regnes. Listen er en optælling af
     efterslæbet, ikke en fast tekst. */
  assert.ok(!KILDER_DER_MANGLER.includes("opgaver"),
    "opgaver har en kilde nu og skal ikke staa som savnet");
  const antal = Object.values(udenKilde()).reduce((s, o) => s + Object.keys(o).length, 0);
  assert.ok(antal >= 40, `kun ${antal} felter uden kilde — er noget begyndt at gaette?`);
});

/* ---- Det der kan regnes ------------------------------------------------ */

test("kunder tælles pr. division, og fælles tæller i begge", () => {
  const kunder = [
    { aktiv: true, division: "gods" },
    { aktiv: true, division: "bus" },
    { aktiv: true, division: "faelles" },
    { aktiv: false, division: "gods" },
  ];
  assert.equal(kundetal(kunder, "gods", NU).aktive, 2);
  assert.equal(kundetal(kunder, "bus", NU).aktive, 2);
});

test("en aftale der udløber inden 30 dage, tælles — en der er udløbet, gør ikke", () => {
  const kunder = [
    { aktiv: true, division: "gods", aftaleUdloeberMs: NU + 10 * DAG },
    { aktiv: true, division: "gods", aftaleUdloeberMs: NU + 90 * DAG },
    { aktiv: true, division: "gods", aftaleUdloeberMs: NU - 1 * DAG },
  ];
  assert.equal(kundetal(kunder, "gods", NU).aftalerUdloeber, 1);
});

test("⚠ tilbud ER null — noden findes ikke", () => {
  /* Formen er ikke besluttet, og et tilbud kan gå til et EMNE der ikke er
     kunde endnu. Se demo-kunder.js. */
  assert.equal(kundetal([], "gods", NU).tilbud, null);
});

/* ---- ikkeFaktureretOere ------------------------------------------------- */

const etape = (o) => ({ division: "gods", tilstand: "udfoert", ...o });

test("⚠ UDFØRT ARBEJDE UDEN ET LÅST GRUNDLAG", () => {
  /* Beslutning 25. Godkendt er ikke nok — et godkendt grundlag kan stadig
     erstattes. */
  const r = ikkeFaktureretOere(
    [etape({ bookingId: "bk-1" }), etape({ bookingId: "bk-2" })],
    [
      { bookingId: "bk-1", tilstand: "laast", beloebOere: 10000 },
      { bookingId: "bk-2", tilstand: "godkendt", beloebOere: 25000 },
    ], "gods");
  assert.equal(r.oere, 25000, "det laaste forloeb blev talt med");
  assert.equal(r.forloeb, 1);
});

test("⚠ ET ERSTATTET GRUNDLAG TÆLLER IKKE SOM LÅST", () => {
  /* Regnede vi det med, ville en rettelse pynte på tallet. */
  const r = ikkeFaktureretOere(
    [etape({ bookingId: "bk-1" })],
    [
      { bookingId: "bk-1", tilstand: "laast", beloebOere: 10000, erstattetAfId: "g2" },
      { bookingId: "bk-1", tilstand: "godkendt", beloebOere: 12000 },
    ], "gods");
  assert.equal(r.oere, 12000, "det erstattede grundlag lukkede forloebet");
});

test("⚠ ET FORLØB UDEN PRIS GØR HELE SUMMEN null", () => {
  /* En etape bærer ingen pris. Kan vi ikke se hvad et forløb er værd, kan vi
     ikke lægge det til — og en sum der mangler noget, ser ud som en sum. */
  const r = ikkeFaktureretOere([etape({ bookingId: "bk-9" })], [], "gods");
  assert.equal(r.oere, null);
  assert.equal(r.forloeb, 1, "antallet skal stadig kunne ses");
  assert.equal(r.udenPris, true);
});

test("kun udførte etaper tæller — en reserveret er ikke kørt", () => {
  const r = ikkeFaktureretOere(
    [etape({ bookingId: "bk-1", tilstand: "reserveret" })], [], "gods");
  assert.equal(r.oere, 0);
  assert.equal(r.forloeb, 0);
});

test("to etaper på samme forløb tælles én gang", () => {
  const r = ikkeFaktureretOere(
    [etape({ bookingId: "bk-1" }), etape({ bookingId: "bk-1" })],
    [{ bookingId: "bk-1", tilstand: "kladde", beloebOere: 5000 }], "gods");
  assert.equal(r.oere, 5000, "forloebet blev talt to gange");
});

/* ---- Deltaerne --------------------------------------------------------- */

test("⚠ EN DELTA ER null VED FØRSTE KØRSEL", () => {
  /* Der er ingen forrige at måle imod, og 0 % ville betyde "uændret" — en
     påstand vi ikke kan bakke op. */
  const k = beregnKpi({ division: "gods", kunder: [{ aktiv: true }], forrige: null, nu: NU });
  assert.equal(k.kunder.aktiveDeltaPct, null);
  assert.equal(k.oekonomi.ikkeFaktureretDeltaPct, null);
});

test("anden kørsel giver en delta", () => {
  const forrige = beregnKpi({ division: "gods", kunder: [{ aktiv: true }], nu: NU });
  const nyt = beregnKpi({
    division: "gods", kunder: [{ aktiv: true }, { aktiv: true }], forrige, nu: NU,
  });
  assert.equal(nyt.kunder.aktiveDeltaPct, 100);
});

test("⚠ EN STIGNING FRA NUL ER IKKE EN PROCENT", () => {
  assert.equal(deltaPct(5, 0), null);
  assert.equal(deltaPct(0, 0), null);
});

test("⚠ PROCENT OG PROCENTPOINT ER TO REGNESTYKKER", () => {
  /* 68 % der bliver til 72 % er +4 POINT, ikke +5,9 %. Blandes de to, er
     tallet rigtigt på den ene læsning og forkert på den anden. */
  assert.equal(deltaPoint(72, 68), 4);
  assert.equal(deltaPct(72, 68), 5.9);
});

test("en delta mod et manglende tal er null, ikke en fejl", () => {
  assert.equal(deltaPct(5, null), null);
  assert.equal(deltaPoint(5, undefined), null);
});

/* ---- Formen ------------------------------------------------------------ */

test("⚠ AFVIGELSER ER EN TOM LISTE, IKKE null", () => {
  /* Findes der ingen afvigelser, er svaret en tom liste — og det ER et svar.
     null ville betyde "ikke beregnet". */
  const k = beregnKpi({ division: "gods", nu: NU });
  assert.deepEqual(k.afvigelser, []);
});

test("de beregnede domæner findes også i demo-sættet", () => {
  /* demo-kpi.js ER nodens form. Skriver aggregeringen et domæne demo ikke
     kender, ville skærmen ikke læse det — og omvendt. */
  const k = beregnKpi({ division: "gods", nu: NU });
  for (const domaene of ["kunder", "oekonomi", "disponering", "flaade", "bemanding"]) {
    assert.ok(domaene in DEMO_KPI.gods, `demo-kpi mangler ${domaene}`);
    assert.ok(domaene in k, `aggregeringen mangler ${domaene}`);
  }
});

/* ---- Jobbet ------------------------------------------------------------ */

const kilde = readFileSync("functions/index.js", "utf8");
const blok = kilde.slice(kilde.indexOf("export const kpiaggregering"));

test("⚠ REGNESTYKKET LIGGER IKKE I JOBBET", () => {
  /* beregnKpi() er ren og kan prøves uden en emulator. Regnede jobbet selv,
     kunne det kun prøves ved at køre det. */
  assert.ok(blok.includes("beregnKpi({"), "jobbet kalder ikke den delte beregning");
  assert.ok(!/\.filter\(\(k\) =>|\.reduce\(/.test(blok), "jobbet regner selv");
  assert.ok(DELTE_FILER.includes("kpi-aggregering.js"), "filen kopieres ikke til delt/");
});

test("⚠ FORRIGE KØRSEL GEMMES — deltaernes eneste kilde", () => {
  assert.ok(blok.includes('sti.child("current")'), "den forrige laeses ikke");
  assert.ok(blok.includes("opdatering.forrige = forrige"), "den arkiveres ikke");
  /* ⚠ ÉN SKRIVNING. Ellers kunne en delta blive regnet mod et arkiv der ikke
     svarer til den current den afløste. */
  assert.ok(blok.includes("await sti.update(opdatering)"));
});

test("begge divisioner skrives", () => {
  /* Konstanten staar FOER funktionen, saa den soeges i hele filen. */
  assert.ok(kilde.includes("KPI_DIVISIONER = "), "divisionerne staar ikke som en konstant");
  assert.ok(kilde.includes("gods") && kilde.includes("bus"));
  assert.ok(blok.includes("of KPI_DIVISIONER"), "jobbet loeber ikke begge igennem");
});

test("tenantlisten kommer fra udbyder/kunder", () => {
  assert.ok(blok.includes('db.ref("udbyder/kunder")'));
});
