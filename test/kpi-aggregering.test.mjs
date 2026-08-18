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
  indkoebstal, ikkeLinkedeFakturaer, braendstofOere, IKKE_BRAENDSTOF,
  deltaPct, deltaPoint, beregnKpi,
} from "../src/fleet/kpi-aggregering.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { DEMO_INDKOEBSLINJER } from "../src/fleet/demo-indkoeb.js";

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
  /* ⚠ STADIG PÅ OBJEKTET — men nu med et TAL. Feltet skal med uanset
     hvad; udelades det, får skærmen undefined og tegner samme streg som ved
     null, uden at spørgsmålet står nogen steder. */
  assert.ok("aabneOrdrer" in k.indkoeb);
  assert.equal(typeof k.indkoeb.aabneOrdrer, "number");
  assert.equal(k.indkoeb.indkoebsprisafvigelser, null,
    "prisafvigelser kræver leverandørens prisliste — den node findes ikke");
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
  for (const n of ["facility", "lagre"]) {
    assert.ok(KILDER_DER_MANGLER.includes(n));
  }
  /* ⚠ LISTEN ER EN OPTÆLLING AF EFTERSLÆBET, IKKE EN FAST TEKST.
     `opgaver` faldt af den da noden blev seedet; `indkoeb` fulgte efter,
     sammen med `fakturaer`. Begge havde regler, indeks og validering — og
     ingen data. Bliver et navn hængende her efter at kilden findes, er
     efterslæbet større på papiret end i virkeligheden, og så holder man op
     med at tro på tallet. */
  for (const n of ["opgaver", "indkoeb"]) {
    assert.ok(!KILDER_DER_MANGLER.includes(n),
      `${n} har en kilde nu og skal ikke staa som savnet`);
  }
  const antal = Object.values(udenKilde()).reduce((s, o) => s + Object.keys(o).length, 0);
  assert.ok(antal >= 25, `kun ${antal} felter uden kilde — er noget begyndt at gaette?`);
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

test("⚠ HVERT FELT I demo-kpi SKRIVES OGSÅ AF AGGREGERINGEN", () => {
  /* ⚠ DEN HER PRØVE STOD KUN PÅ DOMÆNENIVEAU, og seks felter gemte sig
     under den: opgaver.udenTidsregistrering, opgaver.klarTilFakturering,
     opgaver.udfoerteOpgaver, flaade.braendstofOere, facility.aktiverPrArt og
     oekonomi.planlagtVedligeholdPct. Alle seks bliver LÆST af en skærm.

     Et felt aggregeringen ikke skriver, giver `undefined` — og undefined er
     værre end null. null er et svar formatterne kender: num(null) skriver
     INTET. undefined slipper igennem regnestykker: Dashboardet regner
     `100 - k.oekonomi.planlagtVedligeholdPct` og fik NaN.

     Derfor på FELTNIVEAU. En kilde der mangler, skal stå i noden som null
     med et navn — ikke være fraværende. */
  const k = beregnKpi({ division: "gods", nu: NU });
  const mangler = [];
  for (const [domaene, felter] of Object.entries(DEMO_KPI.gods)) {
    if (!felter || typeof felter !== "object" || Array.isArray(felter)) continue;
    for (const felt of Object.keys(felter)) {
      if (!(felt in (k[domaene] || {}))) mangler.push(`${domaene}.${felt}`);
    }
  }
  assert.deepEqual(mangler, [],
    "felter demo-kpi lover, men aggregeringen ikke skriver — skærmen får undefined");
});


/* ---- Indkøbet --------------------------------------------------------- */

const DAGE = 86400000;

/** En indkøbslinje med det der skal til, og resten valgfrit. */
const linje = (o = {}) => ({
  id: o.id || "il-x", division: "gods", dato: NU - DAGE,
  aftaltLeveringMs: NU - DAGE, leveretMs: NU - DAGE,
  leverandoerId: "lv-1", vare: "Ting", kategori: "reservedele",
  antal: 1, enhed: "stk", prisPrEnhedOere: 10000, fakturastatus: "bogfoert",
  ...o,
});

test("⚠ ÉN ORDRE MED TO LINJER ER ÉN ÅBEN ORDRE", () => {
  /* `reference` er leverandørens ordrenummer. Tæller vi linjer, stiger tallet
     fordi nogen bestilte to ting på samme ordre — og indkøberen skal ringe
     én gang, ikke to. */
  const t = indkoebstal([
    linje({ id: "a", reference: "ORD-1", leveretMs: null }),
    linje({ id: "b", reference: "ORD-1", leveretMs: null }),
    linje({ id: "c", reference: "ORD-2", leveretMs: null }),
  ], [], "gods", NU);
  assert.equal(t.aabneOrdrer, 2);
});

test("⚠ EN LINJE UDEN REFERENCE TÆLLER FOR SIG SELV", () => {
  /* Ellers ville tre referenceløse linjer smelte sammen til én ordre — og
     det er den modsatte fejl: tre bestillinger der ser ud som én. */
  const t = indkoebstal([
    linje({ id: "a", leveretMs: null }),
    linje({ id: "b", leveretMs: null }),
  ], [], "gods", NU);
  assert.equal(t.aabneOrdrer, 2);
});

test("en leveret linje er ikke åben", () => {
  const t = indkoebstal([linje({ id: "a", reference: "ORD-1" })], [], "gods", NU);
  assert.equal(t.aabneOrdrer, 0);
});

test("⚠ TIL TIDEN ER PÅ SEKUNDET, IKKE PÅ DAGEN", () => {
  /* Terminen ER aftalen. En levering samme dag men to timer for sent er for
     sent — rundede vi til døgn, ville halvdelen af forsinkelserne forsvinde. */
  const t = indkoebstal([
    linje({ id: "a", aftaltLeveringMs: NU, leveretMs: NU }),
    linje({ id: "b", aftaltLeveringMs: NU, leveretMs: NU + 1 }),
    linje({ id: "c", aftaltLeveringMs: NU, leveretMs: NU - 1 }),
  ], [], "gods", NU);
  assert.equal(t.leveranceTilTidenPct, 67);
});

test("⚠ EN LINJE UDEN AFTALT TERMIN KAN IKKE VÆRE FORSINKET", () => {
  /* Og den må heller ikke tælle som "til tiden" — så ville tallet stige hver
     gang nogen glemte at skrive terminen på. Her er der ÉN linje med termin,
     og én er under MINDSTE_GRUNDLAG. */
  const t = indkoebstal([
    linje({ id: "a", aftaltLeveringMs: NU, leveretMs: NU }),
    linje({ id: "b", aftaltLeveringMs: null }),
    linje({ id: "c", aftaltLeveringMs: null }),
    linje({ id: "d", aftaltLeveringMs: null }),
  ], [], "gods", NU);
  assert.equal(t.leveranceTilTidenPct, null,
    "én måling er ikke et grundlag — og 100 % ville se ud som en måling");
});

test("⚠ MANGLER FAKTURA ER LINJENS EGET UDSAGN", () => {
  /* Ikke "ingen fakturapost peger på linjen" — det spørgsmål kan kun stilles
     pr. leverandør, hvor man ved at man har alle fakturaerne. På hele noden
     ville det tælle enhver linje hvis faktura ligger i et andet system. */
  const t = indkoebstal([
    linje({ id: "a", fakturastatus: "mangler" }),
    linje({ id: "b", fakturastatus: "bogfoert" }),
  ], [], "gods", NU);
  assert.equal(t.manglerFaktura, 1);
});

test("⚠ EN ULINKET FAKTURA TÆLLER I BEGGE DIVISIONER", () => {
  /* Fakturaen arver divisionen af den linje den er matchet mod. Er den ikke
     matchet, HAR den ingen — og skal ses begge steder, fordi ingen endnu ved
     hvem der skal betale den. Skjulte vi den begge steder, ville en ubetalt
     regning ligge uden at nogen havde den på sit kort. */
  const ind = [linje({ id: "g", division: "gods" }), linje({ id: "b", division: "bus" })];
  const fak = [
    { id: "f1", status: "modtaget", indkoebId: "g" },
    { id: "f2", status: "modtaget", indkoebId: null },
  ];
  assert.equal(indkoebstal(ind, fak, "gods", NU).fakturaerTilGodkendelse, 2);
  assert.equal(indkoebstal(ind, fak, "bus", NU).fakturaerTilGodkendelse, 1);
});

test("⚠ EN HÆNGENDE REFERENCE ER ULINKET", () => {
  /* Den SER linket ud og er det ikke — og det er den farligste af de to,
     fordi den allerede er talt som afstemt. Demoen havde netop sådan en:
     indkoebId "ik-001", hvor alle linjer hedder il-XXX. */
  const ind = [linje({ id: "il-001" })];
  const fak = [
    { id: "f1", indkoebId: "il-001" },
    { id: "f2", indkoebId: "ik-001" },
    { id: "f3", indkoebId: null },
  ];
  assert.equal(ikkeLinkedeFakturaer(fak, ind), 2);
});

test("⚠ MÅNEDENS FORBRUG ER KALENDERMÅNEDEN", () => {
  /* Ikke "de sidste 30 dage". Et forbrug der skal holdes op mod et budget,
     skal følge den periode budgettet er lagt i. NU er 18. august. */
  const t = indkoebstal([
    linje({ id: "a", dato: Date.UTC(2026, 7, 1), antal: 2, prisPrEnhedOere: 5000 }),
    linje({ id: "b", dato: Date.UTC(2026, 6, 31), antal: 9, prisPrEnhedOere: 5000 }),
  ], [], "gods", NU);
  assert.equal(t.maanedensForbrugOere, 10000, "juli-linjen skal ikke med");
});

test("⚠ PRISAFVIGELSER ER null, IKKE 0", () => {
  /* En afvigelse kræver en aftalt pris at afvige fra, og den står i
     leverandørens prisliste — `leverandoerer/` findes ikke som node. 0 ville
     betyde "ingen afveg", og det er en helt anden besked end "vi har ikke
     aftalen at måle mod". */
  const t = indkoebstal([linje()], [], "gods", NU);
  assert.equal(t.indkoebsprisafvigelser, null);
  assert.equal(t.indkoebsprisafvigelseSnitPct, null);
});

test("⚠ BRÆNDSTOF SØGES PÅ KATEGORIEN, IKKE PÅ VARENAVNET", () => {
  /* "Dieselfilter" er en reservedel. En søgning på varenavnet ville tage den
     med. `kategori` er en lukket ordliste i firebase.rules.json. */
  const oere = braendstofOere([
    linje({ id: "a", kategori: "braendstof", varenummer: "DIESEL-B7", dato: NU, antal: 100, prisPrEnhedOere: 1000 }),
    linje({ id: "b", kategori: "reservedele", vare: "Dieselfilter", dato: NU, antal: 1, prisPrEnhedOere: 999900 }),
  ], "gods", NU);
  assert.equal(oere, 100000);
});

test("⚠ ADBLUE TÆLLER IKKE MED — DET ER ET ADDITIV", () => {
  /* Kravet står i README ved `flaade.braendstofOere`: lagt med ville
     forbruget se ~5 % bedre ud end det er, og et forbrugstal der er for godt,
     bliver ikke undersøgt.

     ⚠ KATEGORIEN KAN IKKE SKELNE DEM. AdBlue-linjerne bærer "braendstof",
     fordi ordlisten i firebase.rules.json ikke har en værdi for et additiv.
     Varenummeret er indtil videre det eneste sted forskellen står — og det er
     netop derfor prøven findes: en filtrering der kun står i kategorien, ser
     rigtig ud og tæller AdBlue med. */
  const oere = braendstofOere([
    linje({ id: "a", kategori: "braendstof", varenummer: "DIESEL-B7", dato: NU, antal: 100, prisPrEnhedOere: 1000 }),
    linje({ id: "b", kategori: "braendstof", varenummer: "ADBLUE", dato: NU, antal: 900, prisPrEnhedOere: 682 }),
  ], "gods", NU);
  assert.equal(oere, 100000, "AdBlue skal ikke tælle med i brændstoffet");
  assert.ok(IKKE_BRAENDSTOF.includes("ADBLUE"));
});

test("⚠ DEMO-SÆTTET HAR FAKTISK ADBLUE UNDER braendstof", () => {
  /* Uden den her prøve kunne undtagelsen ovenfor blive skrevet mod et
     problem der ikke findes i de rigtige data — og så ville nogen fjerne den
     som overflødig. Den ER nødvendig: 13 af demo-sættets brændstoflinjer er
     AdBlue. */
  const adblue = DEMO_INDKOEBSLINJER.filter(
    (l) => l.kategori === "braendstof" && IKKE_BRAENDSTOF.includes(l.varenummer));
  assert.ok(adblue.length > 0,
    "ingen AdBlue under braendstof — er kategorien blevet rettet? så kan undtagelsen ryge");
});

test("⚠ klarTilFakturering OG ikkeFaktureretForloeb ER SAMME TAL", () => {
  /* To skærme, to navne, ét spørgsmål: afsluttede bookinger uden et låst
     grundlag. Regnede de hver sin gæng, kunne de vise hver sit tal for den
     samme liste — og ingen kunne se hvilken der løj. */
  const etaper = [
    { id: "e1", division: "gods", tilstand: "udfoert", bookingId: "BKG-1" },
    { id: "e2", division: "gods", tilstand: "udfoert", bookingId: "BKG-2" },
  ];
  const grundlag = [{ id: "g1", bookingId: "BKG-1", tilstand: "laast", beloebOere: 1000 }];
  const k = beregnKpi({ division: "gods", etaper, grundlag, nu: NU });
  assert.equal(k.opgaver.klarTilFakturering, k.oekonomi.ikkeFaktureretForloeb);
  assert.equal(k.opgaver.klarTilFakturering, 1);
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
