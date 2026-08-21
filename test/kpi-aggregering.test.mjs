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
  UDEN_DIVISION, KILDER_DER_MANGLER, udenKilde,
  kundetal, ikkeFaktureretOere,
  indkoebstal, ikkeLinkedeFakturaer, braendstofOere, IKKE_BRAENDSTOF,
  prisafvigelser, facilitytal, SERVICE_VINDUE_DAGE,
  kpiSkelet, medFuldForm,
  deltaPct, deltaPoint, beregnKpi, opgavetal, disponeringstal,
} from "../src/fleet/kpi-aggregering.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { DEMO_INDKOEBSLINJER } from "../src/fleet/demo-indkoeb.js";

const NU = Date.UTC(2026, 7, 18);
const DAG = 86400000;

/* ---- Divisionen -------------------------------------------------------- */

/* ⚠ HER STOD TO PRØVER OM AKSEN, og begge er nu historik:

   "EN POST UDEN DIVISION HØRER TIL BEGGE — ikke til ingen" prøvede
   iDivision(). Funktionen findes ikke længere (beslutning 70), og dens
   vigtigste led var selv oplysningen: "vis den i begge" er svaret man giver
   når aksen ikke passer på dataene, og det svar gjaldt til sidst stamdata,
   facility, flåden og bemandingen.

   "LISTEN OVER KILDER UDEN DIVISION ER MÅLT" krævede at kunder og etaper
   IKKE stod på listen over kilder uden division. Nu står alle noder der, og
   listen har ingen modstykke at afgrænse sig mod.

   At aksen holdes ude, prøves ét sted: test/division-fjernet.test.mjs for
   klienten og test/rules.division.test.mjs for reglerne. */

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
  const k = beregnKpi({ nu: NU });
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

/**
 * ⚠ HER STOD "KAN IKKE DELES PÅ DIVISION", og prøven krævede at felterne var
 * null. Spørgsmålet er nu besvaret (beslutning 69) og svaret var ikke en
 * udledning: **ingen abonnent har både gods og bus** — beslutning 19's egen
 * første sætning. Der var aldrig noget at dele op.
 *
 * ⚠ DE DELES ALTSÅ IKKE — DE REGNES ÉN GANG. Og prøven vender: hvor den før
 * krævede null, kræver den nu at gods og bus giver det SAMME tal. Bliver de
 * forskellige, har nogen udledt en division af arten eller af brugen, og det
 * er netop det gæt beslutning 19 forbyder.
 */
test("⚠ FLÅDEN OG BEMANDINGEN DELES IKKE — SAMME TAL I BEGGE DIVISIONER", () => {
  const ind = {
    koeretoejer: [
      { status: "aktiv", art: "traekker" },
      { status: "aktiv", art: "bus" },
      { status: "vaerksted", art: "lastbil" },
    ],
    personale: [
      { id: "p1", status: "aktiv", funktioner: { chauffoer: true } },
      { id: "p2", status: "aktiv", funktioner: { buschauffoer: true } },
    ],
    nu: NU,
  };
  const gods = beregnKpi({ ...ind });
  const bus = beregnKpi({ ...ind });

  assert.equal(gods.flaade.aktive, 2, "de to aktive tælles begge");
  assert.equal(bus.flaade.aktive, gods.flaade.aktive,
    "flåden er delt på division — et køretøj bærer ikke feltet (beslutning 19)");
  assert.equal(bus.bemanding.medarbejdereAktive, gods.bemanding.medarbejdereAktive,
    "bemandingen er delt på division");

  /* ⚠ OG BUSSEN TÆLLER MED I GODS. Det ser forkert ud og er rigtigt: en
     abonnent har kun den ene forretning, så "gods" er hele flåden hos en
     godsvognmand. Sorterede vi bussen fra her, havde vi udledt divisionen af
     arten — og så ville en varevogn i busafdelingen forsvinde ud af begge. */
  assert.equal(gods.flaade.aktive, 2, "bussen er sorteret fra efter art");
});

/**
 * ⚠ DET DER STADIG ER null, ER DET AF EN ANDEN GRUND END FØR — og de to
 * grunde ligner hinanden i noden uden at være det samme (beslutning 62).
 */
test("⚠ DE OTTE DER BLIVER, HAR HVER SIN SLAGS GRUND", () => {
  const k = beregnKpi({ nu: NU });

  /* INGEN KILDE: tallet kunne regnes, hvis nogen førte data. */
  for (const f of ["omkostningPrKmOere", "nedetidPct"]) {
    assert.equal(k.flaade[f], null, `flaade.${f} er begyndt at gætte`);
  }
  /* INTET SPØRGSMÅL: der er ingen entitet at tælle på. */
  for (const f of ["planlagt", "underbemandede"]) {
    assert.equal(k.bemanding[f], null, `bemanding.${f} er begyndt at gætte`);
  }

  /* ⚠ OG ledig ER DEN TREDJE SLAGS: den er AFLEDT og skal helt UD af kpi/.
     Den står endnu, fordi den er en widget i kataloget og valideLayout()
     afviser ukendte nøgler — fjernelsen er en migrering. Se beslutning 69. */
  assert.equal(k.bemanding.ledig, null,
    "ledig er begyndt at blive regnet — den er afledt og hører hos forbrugeren");
});

test("⚠ HVER KILDE DER MANGLER, ER NAVNGIVET", () => {
  /* Så efterslæbet kan tælles frem for at blive opdaget felt for felt. */
  /* ⚠ LISTEN ER TOM NU, OG DET ER PROEVENS SVAR.
     Fem noder har staaet her: opgaver, indkoeb, fakturaer, leverandoerer og
     facility — og `lagre` var den sidste. Der er ingen node uden data
     tilbage. Bliver listen ikke-tom igen, er det fordi nogen har fundet et
     nyt hul, og saa skal det navngives her frem for at blive opdaget felt
     for felt. */
  assert.deepEqual(KILDER_DER_MANGLER, [],
    `endnu en kilde uden data: ${KILDER_DER_MANGLER.join(", ")}`);
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
  /* ⚠ `facility` FALDT AF LISTEN AF EN ANDEN GRUND END DE TO ANDRE.
     Noden manglede ikke en form eller en beslutning — den manglede DATA, og
     de er seedet. Men det låste kun to felter op: resten kan ikke deles på
     division, og det er et andet spørgsmål end en manglende kilde. Et felt
     der står som "mangler kilde" mens det i virkeligheden venter på et svar,
     bliver ikke stillet til nogen. */
  assert.ok(!KILDER_DER_MANGLER.includes("facility"),
    "facility er seedet");

  /* ⚠ OG FACILITY HØRER HELLER IKKE I UDEN_DIVISION.
     Jeg lagde den der først, fordi reglerne FORBYDER `division` på aktiver,
     lokationer og fejl — og sluttede deraf at tallene var ubesvarlige som
     flådens. Det var forkert: demo-facility.js har svaret i sit hoved
     ("FACILITY ER FÆLLES"), og demo-kpi viser 287 aktiver i BEGGE divisioner,
     mens flåden står 42 mod 18. To slags "ingen division", to svar. */
  for (const n of ["facility/lokationer", "facility/aktiver", "facility/fejl"]) {
    assert.ok(!UDEN_DIVISION.includes(n),
      `${n} står som ubesvarlig — men facility er fælles, ikke udelt`);
  }
  /**
   * ⚠ udenKilde() ER TOM NU — OG DET ER IKKE DET SAMME SOM AT EFTERSLÆBET ER
   * LUKKET.
   *
   * Her stod `antal >= 12` med teksten "er noget begyndt at gætte?", og lige
   * under: "udenKilde() ER optællingen". **Det var den aldrig.** Målt på det
   * FULDE objekt med rigtige data og en forrige kørsel: 31 felter er null,
   * mens udenKilde() på sit højeste rummede 17. Resten stod null INDE i
   * regnestykkerne, hver med sin grund — og de tæller lige så meget.
   *
   * ⚠ DA FLÅDEN OG BEMANDINGEN FIK DERES KILDE, GIK udenKilde() FRA 17 TIL 0
   * — men kun otte af de sytten blev BESVARET. De øvrige otte flyttede ind i
   * flaadetal() og bemandingstal(). **Et efterslæb der bliver mindre af at et
   * null flytter sig, er ikke blevet mindre.** Derfor tæller prøven nedenfor
   * på det færdige objekt og ikke på samlestedet.
   */
  assert.deepEqual(udenKilde(), {},
    "udenKilde() har fået poster igen — så skal teksterne om efterslæbet med");
});

/**
 * ⚠ OPTÆLLINGEN LIGGER PÅ DET FÆRDIGE OBJEKT, ikke på et samlested.
 *
 * Det er hele lærestykket fra beslutning 68 og 69: et tal om hvor meget der
 * mangler, skal læses ud af det der faktisk skrives i noden. Ellers kan
 * efterslæbet gøres mindre ved at flytte et null.
 */
test("⚠ EFTERSLÆBET TÆLLES PÅ NODEN, IKKE PÅ udenKilde()", () => {
  const nuller = (o, sti = "") => {
    const ud = [];
    for (const [k, v] of Object.entries(o || {})) {
      const s = sti ? `${sti}.${k}` : k;
      if (v === null) ud.push(s);
      else if (v && typeof v === "object" && !Array.isArray(v)) ud.push(...nuller(v, s));
    }
    return ud;
  };
  const tomme = nuller(beregnKpi({ nu: NU }));

  /* ⚠ ET LOFT, IKKE ET FACIT. Tallet svinger med hvad der fodres ind — uden
     data er alt null. Prøven findes for at fange at det VOKSER: et nyt felt
     der lægges i noden uden en kilde, skal ses. */
  assert.ok(tomme.length <= 50,
    `${tomme.length} null-felter uden data — noget er lagt i noden uden kilde`);
  assert.ok(tomme.length >= 8,
    "der er næsten ingen null tilbage — så skal README's efterslæb skrives om");

  /* De otte i flåde og bemanding er navngivet, så et nyt ikke glider ind. */
  const iDeTo = tomme.filter((f) => f.startsWith("flaade.") || f.startsWith("bemanding."));
  assert.deepEqual(iDeTo.sort(), [
    "bemanding.chauffoerPlanlagt", "bemanding.ledig",
    "bemanding.planlagt", "bemanding.underbemandede",
    "flaade.nedetidDeltaPoint", "flaade.nedetidPct",
    "flaade.omkostningPrKmDeltaOere", "flaade.omkostningPrKmOere",
  ], "flåden eller bemandingen har fået et null der ikke er begrundet");
});

/* ---- Det der kan regnes ------------------------------------------------ */

/* ⚠ HER STOD "kunder tælles pr. division, og fælles tæller i begge".
   Aksen er fjernet (beslutning 70) — og prøven havde selv svaret i sit navn:
   det den målte, var at "fælles" tællede med begge steder, altså at
   opdelingen ikke delte de poster den handlede om. */
test("aktive kunder tælles, inaktive gør ikke", () => {
  const kunder = [
    { aktiv: true }, { aktiv: true }, { aktiv: true }, { aktiv: false },
  ];
  assert.equal(kundetal(kunder, NU).aktive, 3);
});

test("en aftale der udløber inden 30 dage, tælles — en der er udløbet, gør ikke", () => {
  const kunder = [
    { aktiv: true, aftaleUdloeberMs: NU + 10 * DAG },
    { aktiv: true, aftaleUdloeberMs: NU + 90 * DAG },
    { aktiv: true, aftaleUdloeberMs: NU - 1 * DAG },
  ];
  assert.equal(kundetal(kunder, NU).aftalerUdloeber, 1);
});

test("⚠ tilbud ER null — noden findes ikke", () => {
  /* Formen er ikke besluttet, og et tilbud kan gå til et EMNE der ikke er
     kunde endnu. Se demo-kunder.js. */
  assert.equal(kundetal([], NU).tilbud, null);
});

/* ---- ikkeFaktureretOere ------------------------------------------------- */

const etape = (o) => ({ tilstand: "udfoert", ...o });

test("⚠ UDFØRT ARBEJDE UDEN ET LÅST GRUNDLAG", () => {
  /* Beslutning 25. Godkendt er ikke nok — et godkendt grundlag kan stadig
     erstattes. */
  const r = ikkeFaktureretOere(
    [etape({ bookingId: "bk-1" }), etape({ bookingId: "bk-2" })],
    [
      { bookingId: "bk-1", tilstand: "laast", beloebOere: 10000 },
      { bookingId: "bk-2", tilstand: "godkendt", beloebOere: 25000 },
    ]);
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
    ]);
  assert.equal(r.oere, 12000, "det erstattede grundlag lukkede forloebet");
});

test("⚠ ET FORLØB UDEN PRIS GØR HELE SUMMEN null", () => {
  /* En etape bærer ingen pris. Kan vi ikke se hvad et forløb er værd, kan vi
     ikke lægge det til — og en sum der mangler noget, ser ud som en sum. */
  const r = ikkeFaktureretOere([etape({ bookingId: "bk-9" })], []);
  assert.equal(r.oere, null);
  assert.equal(r.forloeb, 1, "antallet skal stadig kunne ses");
  assert.equal(r.udenPris, true);
});

test("kun udførte etaper tæller — en reserveret er ikke kørt", () => {
  const r = ikkeFaktureretOere(
    [etape({ bookingId: "bk-1", tilstand: "reserveret" })], []);
  assert.equal(r.oere, 0);
  assert.equal(r.forloeb, 0);
});

test("to etaper på samme forløb tælles én gang", () => {
  const r = ikkeFaktureretOere(
    [etape({ bookingId: "bk-1" }), etape({ bookingId: "bk-1" })],
    [{ bookingId: "bk-1", tilstand: "kladde", beloebOere: 5000 }]);
  assert.equal(r.oere, 5000, "forloebet blev talt to gange");
});

/* ---- Deltaerne --------------------------------------------------------- */

test("⚠ EN DELTA ER null VED FØRSTE KØRSEL", () => {
  /* Der er ingen forrige at måle imod, og 0 % ville betyde "uændret" — en
     påstand vi ikke kan bakke op. */
  const k = beregnKpi({ kunder: [{ aktiv: true }], forrige: null, nu: NU });
  assert.equal(k.kunder.aktiveDeltaPct, null);
  assert.equal(k.oekonomi.ikkeFaktureretDeltaPct, null);
});

test("anden kørsel giver en delta", () => {
  const forrige = beregnKpi({ kunder: [{ aktiv: true }], nu: NU });
  const nyt = beregnKpi({
    kunder: [{ aktiv: true }, { aktiv: true }], forrige, nu: NU,
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
  const k = beregnKpi({ nu: NU });
  assert.deepEqual(k.afvigelser, []);
});

test("de beregnede domæner findes også i demo-sættet", () => {
  /* demo-kpi.js ER nodens form. Skriver aggregeringen et domæne demo ikke
     kender, ville skærmen ikke læse det — og omvendt. */
  const k = beregnKpi({ nu: NU });
  for (const domaene of ["kunder", "oekonomi", "disponering", "flaade", "bemanding"]) {
    assert.ok(domaene in DEMO_KPI, `demo-kpi mangler ${domaene}`);
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
  const k = beregnKpi({ nu: NU });
  const mangler = [];
  for (const [domaene, felter] of Object.entries(DEMO_KPI)) {
    if (!felter || typeof felter !== "object" || Array.isArray(felter)) continue;
    for (const felt of Object.keys(felter)) {
      if (!(felt in (k[domaene] || {}))) mangler.push(`${domaene}.${felt}`);
    }
  }
  assert.deepEqual(mangler, [],
    "felter demo-kpi lover, men aggregeringen ikke skriver — skærmen får undefined");
});

/**
 * ⚠ OG DEN ANDEN VEJ — DEN MANGLEDE.
 *
 * Prøven ovenfor spørger kun "lover demo-kpi noget aggregeringen ikke
 * skriver". Da `disponering.udenEtaEllerFrist` kom til, gik den derfor
 * igennem: aggregeringen skrev et felt demofilen ikke kendte, og demo-mode
 * ville have vist `undefined` for netop det tal.
 *
 * Det er præcis den ensrettede prøve beslutning 55 fandt for `ART_FELTER` —
 * samme fejl, en anden fil. `demo-kpi.js` **ER nodens form**, og formen skal
 * passe i begge retninger.
 */
/**
 * ⚠ TRE BARE NULLER — TO AF DEM HAVDE EN KILDE.
 *
 * `forsinkede`, `udenTidsfrist` og `nyeBookinger` stod uden en eneste linje
 * begrundelse, mens `udfoerteOpgaver` lige ovenover havde sin skrevet ned. Et
 * null uden en grund kan ikke skelnes fra et felt nogen har glemt.
 */
/**
 * ⚠ DE TRE FELTER I `disponering` — to fik en kilde, ét fik en grund.
 */
test("⚠ forsinkelsesrisiko ER ETA EFTER FRIST — og hullet står ved siden af", () => {
  const e = (x) => ({ tilstand: "reserveret", ...x });
  const r = disponeringstal([
    /* ETA efter fristen: en risiko man kan nå at gøre noget ved. */
    e({ etaMs: 200, senestMs: 100 }),
    /* ETA før fristen: i orden. */
    e({ etaMs: 50, senestMs: 100 }),
    /* ⚠ KAN IKKE VURDERES. Tælles ikke med i risikoen — men skal kunne SES,
       ellers ser et lavt tal ud som et rent hus. */
    e({ etaMs: 200 }),
    e({ senestMs: 100 }),
    /* En udført etape kan ikke blive forsinket. */
    e({ tilstand: "udfoert", etaMs: 200, senestMs: 100 }),
  ]);
  assert.equal(r.forsinkelsesrisiko, 1);
  assert.equal(r.udenEtaEllerFrist, 2);
});

test("⚠ konflikter ER null UDEN LISTERNE, ikke nul", () => {
  /* En aggregering der ikke fik sine biler, VED ikke at der er nul
     konflikter — den ved ingenting. Nul ville se ud som et rent hus. */
  const etaper = [{ id: "e-1", tilstand: "reserveret" }];
  assert.equal(disponeringstal(etaper).konflikter, null);
  assert.equal(
    disponeringstal(etaper, { koeretoejer: [{ id: "kt-1" }] }).konflikter, 0,
    "med listerne skal den kunne svare et tal");
});

test("⚠ ledigKapacitetPct BLIVER STÅENDE — definitionen mangler", () => {
  /* Ikke data der mangler: ledig i hvilken periode, målt i vogntimer, m³
     eller enheder? De tal peger forskellige veje. Se beslutning 60. */
  assert.equal(disponeringstal([]).ledigKapacitetPct, null);
});

test("⚠ forsinkede ER \"SKULLE VÆRE FÆRDIG NU\", ikke \"startede for sent\"", () => {
  const nu = Date.UTC(2026, 8, 1, 12, 0, 0);
  const T = 3600000;
  const o = (x) => ({ ...x });
  const r = opgavetal([
    /* Planen sagde kl. 11 — den er forsinket. */
    o({ status: "planlagt", startMs: nu - 2 * T, estimeretMin: 60 }),
    /* Begynder først om en time. Ikke forsinket — planlagt. */
    o({ status: "planlagt", startMs: nu + T, estimeretMin: 60 }),
    /* Udført og annulleret kan ikke være forsinkede. */
    o({ status: "udfoert", startMs: nu - 5 * T, estimeretMin: 60 }),
    o({ status: "annulleret", startMs: nu - 5 * T, estimeretMin: 60 }),
    /* ⚠ UDEN ESTIMAT: ingen slutning at være forsinket i forhold til. Et gæt
       på en standardlængde ville gøre den forsinket på et tidspunkt ingen har
       besluttet. */
    o({ status: "planlagt", startMs: nu - 5 * T }),
  ], nu);
  assert.equal(r.forsinkede, 1);
});

test("⚠ nyeBookinger ER null VED FØRSTE KØRSEL, ikke nul", () => {
  const bookinger = [
    { oprettetMs: 900 },
    { oprettetMs: 1200 },
    { oprettetMs: 1200 },
  ];
  /* Uden en forrige er der intet at måle fra — og 0 ville betyde "ingen nye
     bookinger", en påstand vi ikke kan bakke op. Samme regel som deltaPct(). */
  assert.equal(opgavetal([], 2000, { bookinger }).nyeBookinger, null);
  assert.equal(
    opgavetal([], 2000, { bookinger, forrige: { beregnetMs: 1000 } }).nyeBookinger,
    2, "tæller ikke fra forrige beregning");
});

test("⚠ udenTidsfrist BLIVER STÅENDE — noden har ikke feltet", () => {
  /* Og det er ikke et manglende seed: en opgave bærer startMs og
     estimeretMin, og ingen af dem er en FRIST. Den nærmeste udlægning tælles
     allerede som `uplanlagte`, og to felter med samme tal under hvert sit
     navn er beslutning 6 brudt. Se beslutning 61. */
  assert.equal(opgavetal([], 1).udenTidsfrist, null);
});

test("⚠ OG HVERT FELT AGGREGERINGEN SKRIVER, STÅR I demo-kpi", () => {
  const k = beregnKpi({ nu: NU });
  const ukendte = [];
  for (const [domaene, felter] of Object.entries(k)) {
    if (!felter || typeof felter !== "object" || Array.isArray(felter)) continue;
    /* Kun de domæner demofilen overhovedet beskriver — et helt nyt domæne
       fanges af prøven ovenfor. */
    if (!(domaene in DEMO_KPI)) continue;
    for (const felt of Object.keys(felter)) {
      if (!(felt in DEMO_KPI[domaene])) ukendte.push(`${domaene}.${felt}`);
    }
  }
  assert.deepEqual(ukendte, [],
    "aggregeringen skriver felter demo-kpi ikke kender — demo-mode viser undefined");
});

/* ---- Indkøbet --------------------------------------------------------- */

const DAGE = 86400000;

/** En indkøbslinje med det der skal til, og resten valgfrit. */
const linje = (o = {}) => ({
  id: o.id || "il-x", dato: NU - DAGE,
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
  ], [], [], NU);
  assert.equal(t.aabneOrdrer, 2);
});

test("⚠ EN LINJE UDEN REFERENCE TÆLLER FOR SIG SELV", () => {
  /* Ellers ville tre referenceløse linjer smelte sammen til én ordre — og
     det er den modsatte fejl: tre bestillinger der ser ud som én. */
  const t = indkoebstal([
    linje({ id: "a", leveretMs: null }),
    linje({ id: "b", leveretMs: null }),
  ], [], [], NU);
  assert.equal(t.aabneOrdrer, 2);
});

test("en leveret linje er ikke åben", () => {
  const t = indkoebstal([linje({ id: "a", reference: "ORD-1" })], [], [], NU);
  assert.equal(t.aabneOrdrer, 0);
});

test("⚠ TIL TIDEN ER PÅ SEKUNDET, IKKE PÅ DAGEN", () => {
  /* Terminen ER aftalen. En levering samme dag men to timer for sent er for
     sent — rundede vi til døgn, ville halvdelen af forsinkelserne forsvinde. */
  const t = indkoebstal([
    linje({ id: "a", aftaltLeveringMs: NU, leveretMs: NU }),
    linje({ id: "b", aftaltLeveringMs: NU, leveretMs: NU + 1 }),
    linje({ id: "c", aftaltLeveringMs: NU, leveretMs: NU - 1 }),
  ], [], [], NU);
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
  ], [], [], NU);
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
  ], [], [], NU);
  assert.equal(t.manglerFaktura, 1);
});

test("⚠ EN ULINKET FAKTURA TÆLLER I BEGGE DIVISIONER", () => {
  /* Fakturaen arver divisionen af den linje den er matchet mod. Er den ikke
     matchet, HAR den ingen — og skal ses begge steder, fordi ingen endnu ved
     hvem der skal betale den. Skjulte vi den begge steder, ville en ubetalt
     regning ligge uden at nogen havde den på sit kort. */
  const ind = [linje({ id: "g" }), linje({ id: "b" })];
  const fak = [
    { id: "f1", status: "modtaget", indkoebId: "g" },
    { id: "f2", status: "modtaget", indkoebId: null },
  ];
  /* ⚠ HER STOD TO PÅSTANDE — én pr. division — og den ulinkede faktura
     tællede i begge. Det var oplysningen: en faktura uden linje HAR ingen
     division, og den skulle derfor ses af alle. Nu er der ét svar. */
  assert.equal(indkoebstal(ind, fak, [], NU).fakturaerTilGodkendelse, 2);
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
  ], [], [], NU);
  assert.equal(t.maanedensForbrugOere, 10000, "juli-linjen skal ikke med");
});

test("⚠ PRISAFVIGELSER ER null NÅR INTET KAN MÅLES", () => {
  /* En afvigelse kræver en aftalt pris at afvige fra. Uden et kartotek er der
     ingen — og 0 ville betyde "ingen afveg", som er en helt anden besked end
     "vi har ikke aftalen at måle mod". */
  const t = indkoebstal([linje()], [], [], NU);
  assert.equal(t.indkoebsprisafvigelser, null);
  assert.equal(t.indkoebsprisafvigelseSnitPct, null);
});

/* ---- Prisafvigelserne -------------------------------------------------- */

/** En leverandør med én pris på VARE-1, gyldig fra tidernes morgen. */
const lev = (o = {}) => ({
  id: o.id || "lv-1", navn: "Leverandør", kategori: "reservedele",
  aftale: { type: o.aftaletype || "fastaftale" },
  prisliste: o.prisliste || [
    { id: "p1", varenummer: "VARE-1", prisOere: 10000, gyldigFra: 0 },
  ],
});

test("⚠ MÅLT MOD DEN PRIS DER GJALDT DA VI KØBTE", () => {
  /* Havde leverandøren en regulering i juli, må en faktura fra juni ikke
     pludselig se forkert ud målt mod "aftalen" — så ville afvigelsen pege på
     leverandøren frem for på os. prisPaa() slår op PÅ INDKØBETS DATO. */
  const juni = Date.UTC(2026, 5, 15);
  const juli = Date.UTC(2026, 6, 1);
  const leverandoerer = [lev({
    prisliste: [
      { id: "p1", varenummer: "VARE-1", prisOere: 10000, gyldigFra: 0 },
      { id: "p2", varenummer: "VARE-1", prisOere: 20000, gyldigFra: juli },
    ],
  })];
  /* Købt i juni til 10000 — præcis den pris der gjaldt DA. Ingen afvigelse,
     selv om dagens pris er den dobbelte. */
  const iJuni = prisafvigelser(
    [linje({ id: "a", leverandoerId: "lv-1", varenummer: "VARE-1", dato: juni, prisPrEnhedOere: 10000 })],
    leverandoerer);
  assert.equal(iJuni.snitPct, 0, "juni-købet skal måles mod juni-prisen");

  /* Samme beløb købt i august er derimod 50 % UNDER den nye aftale. */
  const iAugust = prisafvigelser(
    [linje({ id: "b", leverandoerId: "lv-1", varenummer: "VARE-1", dato: NU, prisPrEnhedOere: 10000 })],
    leverandoerer);
  assert.equal(iAugust.snitPct, -50);
});

test("⚠ EN LINJE UDEN AFTALT PRIS TÆLLER SLET IKKE MED", () => {
  /* Hverken som afvigelse eller som "ingen afvigelse". Et spotkøb af en vare
     der ikke står i prislisten, har ingen aftale at afvige fra — talte vi den
     med som 0 %, ville gennemsnittet blive trukket mod nul af netop de køb
     ingen har forhandlet. */
  const leverandoerer = [lev()];
  const t = prisafvigelser([
    linje({ id: "a", leverandoerId: "lv-1", varenummer: "VARE-1", dato: NU, prisPrEnhedOere: 12000 }),
    linje({ id: "b", leverandoerId: "lv-1", varenummer: "UKENDT", dato: NU, prisPrEnhedOere: 99999 }),
  ], leverandoerer);
  assert.equal(t.snitPct, 20, "kun VARE-1 kan måles — 12000 mod 10000 er +20 %");
});

test("⚠ GRÆNSEN AFHÆNGER AF AFTALEFORMEN", () => {
  /* En fastaftale der afviger 4 %, er et brud på aftalen; et spotkøb der gør
     det, er markedet. Samme tal, to betydninger — én fælles grænse ville
     enten drukne brudene eller melde markedet som brud. */
  const koeb = (id) => linje({
    id, leverandoerId: "lv-1", varenummer: "VARE-1", dato: NU, prisPrEnhedOere: 10400,
  });
  const fast = prisafvigelser([koeb("a")], [lev({ aftaletype: "fastaftale" })]);
  const spot = prisafvigelser([koeb("a")], [lev({ aftaletype: "spot" })]);
  assert.equal(fast.snitPct, 4);
  assert.equal(spot.snitPct, 4, "samme tal");
  assert.equal(fast.antal, 1, "4 % er over grænsen på en fastaftale");
  assert.equal(spot.antal, 0, "4 % er under grænsen på et spotkøb");
});

test("⚠ EN AFVIGELSE NEDAD ER OGSÅ EN AFVIGELSE", () => {
  /* Betalte vi 10 % MINDRE end aftalt, er noget galt med enten prislisten
     eller fakturaen. En optælling der kun så opad, ville kalde en forkert
     prisliste for en god handel. */
  const t = prisafvigelser(
    [linje({ id: "a", leverandoerId: "lv-1", varenummer: "VARE-1", dato: NU, prisPrEnhedOere: 9000 })],
    [lev()]);
  assert.equal(t.antal, 1);
  assert.equal(t.snitPct, -10);
});

test("en linje fra en ukendt leverandør kan ikke måles", () => {
  const t = prisafvigelser(
    [linje({ id: "a", leverandoerId: "lv-fantom", varenummer: "VARE-1", dato: NU })],
    [lev()]);
  assert.equal(t.antal, null);
  assert.equal(t.snitPct, null);
});

test("⚠ PRISLISTEN MÅ KOMME FRA BASEN SOM ET OBJEKT", () => {
  /* RTDB har ingen arrays. Kom prislisten ind som {prisId: post} og blev den
     ikke oversat, kastede prisPaa() ".filter is not a function" midt i
     aggregeringen — og jobbet ville fejle for hele tenanten, ikke bare for
     ét felt. */
  const fraBasen = {
    id: "lv-1", navn: "Leverandør", kategori: "reservedele",
    aftale: { type: "fastaftale" },
    prisliste: { p1: { varenummer: "VARE-1", prisOere: 10000, gyldigFra: 0 } },
  };
  const t = prisafvigelser(
    [linje({ id: "a", leverandoerId: "lv-1", varenummer: "VARE-1", dato: NU, prisPrEnhedOere: 11000 })],
    [fraBasen]);
  assert.equal(t.snitPct, 10);
});

test("⚠ BRÆNDSTOF SØGES PÅ KATEGORIEN, IKKE PÅ VARENAVNET", () => {
  /* "Dieselfilter" er en reservedel. En søgning på varenavnet ville tage den
     med. `kategori` er en lukket ordliste i firebase.rules.json. */
  const oere = braendstofOere([
    linje({ id: "a", kategori: "braendstof", varenummer: "DIESEL-B7", dato: NU, antal: 100, prisPrEnhedOere: 1000 }),
    linje({ id: "b", kategori: "reservedele", vare: "Dieselfilter", dato: NU, antal: 1, prisPrEnhedOere: 999900 }),
  ], NU);
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
  ], NU);
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
    { id: "e1", tilstand: "udfoert", bookingId: "BKG-1" },
    { id: "e2", tilstand: "udfoert", bookingId: "BKG-2" },
  ];
  const grundlag = [{ id: "g1", bookingId: "BKG-1", tilstand: "laast", beloebOere: 1000 }];
  const k = beregnKpi({ etaper, grundlag, nu: NU });
  assert.equal(k.opgaver.klarTilFakturering, k.oekonomi.ikkeFaktureretForloeb);
  assert.equal(k.opgaver.klarTilFakturering, 1);
});

/* ---- Facility ---------------------------------------------------------- */

const aktiv = (o = {}) => ({
  id: o.id || "fa-x", navn: "Port", art: "port",
  lokationId: "lok-1", status: "idrift", ...o,
});

test("⚠ FACILITY ER FÆLLES — SAMME TAL I BEGGE DIVISIONER", () => {
  /* Aktiverne er de samme uanset division, og reglerne FORBYDER `division`
     på dem. En port i Hal B er ikke gods eller bus; det er en port, og begge
     afdelinger kører ind ad den.

     ⚠ IKKE null. Det var min første udgave — jeg lagde facility i
     UDEN_DIVISION ved siden af flåden. Men de to er ikke samme spørgsmål:
     demo-kpi har 287 aktiver i BEGGE divisioner og flåden 42 mod 18. Facility
     er FÆLLES, flåden skal DELES. At skjule et fælles tal begge steder er at
     stille et spørgsmål der allerede er besvaret. */
  const aktiver = [aktiv({ id: "a" }), aktiv({ id: "b" }), aktiv({ id: "c" })];
  const gods = facilitytal({ aktiver, nu: NU });
  const bus = facilitytal({ aktiver, nu: NU });
  assert.equal(gods.aktiver, 3);
  assert.deepEqual(gods.aktiver, bus.aktiver);
});

test("⚠ EN OVERSKREDET SERVICE TÆLLER STADIG SOM FORFALDEN", () => {
  /* "Forfalder" er ikke "forfalder snart". En service der skulle have været
     lavet for en måned siden, er ikke holdt op med at forfalde — og et tal
     der talte den fra, ville falde netop når den blev mest presserende. */
  const t = facilitytal({
    aktiver: [
      aktiv({ id: "over", naesteServiceMs: NU - 30 * DAGE }),
      aktiv({ id: "snart", naesteServiceMs: NU + 5 * DAGE }),
      aktiv({ id: "kant", naesteServiceMs: NU + SERVICE_VINDUE_DAGE * DAGE }),
      aktiv({ id: "senere", naesteServiceMs: NU + (SERVICE_VINDUE_DAGE + 1) * DAGE }),
      aktiv({ id: "uden" }),
    ],
    nu: NU,
  });
  assert.equal(t.servicepunkterForfalder, 3,
    "overskredet, snart og på kanten tæller — senere og uden dato gør ikke");
});

test("⚠ EN FEJL DER ER PLANLAGT, ER STADIG ÅBEN", () => {
  /* Kun `udbedret` lukker den. En fejl der er planlagt eller i gang, er ikke
     væk — den er bare ikke overraskende længere. */
  const t = facilitytal({
    fejl: [
      { id: "1", status: "ny" },
      { id: "2", status: "planlagt" },
      { id: "3", status: "igang" },
      { id: "4", status: "udbedret" },
    ],
    nu: NU,
  });
  assert.equal(t.aabneFejl, 3);
});

test("⚠ EN SENSOR UDEN MÅLING ER IKKE AKTIV", () => {
  /* Tælles hele listen, tæller man også den der er holdt op med at sende — og
     så ser overvågningen hel ud netop dér hvor den er gået i stykker. */
  const t = facilitytal({
    sensorer: [
      { id: "zo-1", aktuel: { tempC: -19.8, ms: NU } },
      { id: "zo-2", aktuel: { tempC: 4.1, ms: NU - 3600000 } },
      { id: "zo-3" },
      { id: "zo-4", aktuel: { tempC: 2 } },
    ],
    nu: NU,
  });
  assert.equal(t.sensorerAktive, 2, "en måling uden tidsstempel er ingen måling");
});

test("⚠ aktiverPrArt SUMMERER TIL aktiver", () => {
  /* Donutten og nøgletallet over den skal beskrive den SAMME base. Det var
     netop dét mockuppen tog fejl af — og fordi begge tælles af den samme
     liste her, kan de ikke drive fra hinanden. */
  const t = facilitytal({
    aktiver: [
      aktiv({ id: "a", art: "port" }),
      aktiv({ id: "b", art: "port" }),
      aktiv({ id: "c", art: "koeleanlaeg" }),
      aktiv({ id: "d", art: "alarm" }),
    ],
    nu: NU,
  });
  const sum = Object.values(t.aktiverPrArt).reduce((s, n) => s + n, 0);
  assert.equal(sum, t.aktiver);
  assert.deepEqual(t.aktiverPrArt, { port: 2, koeleanlaeg: 1, alarm: 1 });
});

test("⚠ PLANLAGT VEDLIGEHOLD ER EN OPGAVE, IKKE ET AKTIV", () => {
  /* Opgaven er ARBEJDET, aktivet er GENSTANDEN. Talte vi aktiver med en
     fremtidig service, ville "planlagt vedligehold" stige hver gang nogen
     købte en port — og det er ikke arbejde nogen har planlagt.

     Og DERFOR kan feltet deles på division, selv om aktivet ikke kan:
     opgaven bærer en. */
  const opgaver = [
    { id: "o1", art: "facility", status: "planlagt" },
    { id: "o2", art: "facility", status: "planlagt" },
    { id: "o3", art: "facility", status: "afventer" },
    { id: "o4", art: "vaerksted", status: "planlagt" },
  ];
  const aktiver = [aktiv({ id: "a", naesteServiceMs: NU + DAGE })];
  assert.equal(facilitytal({ aktiver, opgaver, nu: NU }).planlagtVedligehold, 2,
    "de to planlagte facility-opgaver tælles ikke længere begge");
});

test("⚠ EN UDGÅET LEVERANDØR ER IKKE EN VI KAN RINGE TIL", () => {
  const leverandoerer = [
    { id: "l1", kategori: "facility", aktiv: true },
    { id: "l2", kategori: "facility", aktiv: false },
    { id: "l3", kategori: "daek", aktiv: true },
  ];
  const t = facilitytal({ leverandoerer, nu: NU });
  assert.equal(t.eksterneLeverandoerer, 1);
});

test("⚠ TO FACILITY-FELTER ER STADIG null, MED HVER SIN GRUND", () => {
  /* klimaalarmerIDag kræver HISTORIK — og er noget andet end "alarmer der er
     aktive nu", som er afledt og bevidst holdes ude af kpi/.
     aabneSager venter på `sager/`, som ikke findes (beslutning 20, fase 0). */
  const t = facilitytal({ aktiver: [aktiv()], nu: NU });
  assert.equal(t.klimaalarmerIDag, null);
  assert.equal(t.aabneSager, null);
});

/**
 * ⚠ DET TREDJE FELT FIK SIN KILDE — OG HAVDE HAFT DEN LÆNGE.
 *
 * `anslaaetServiceOere` stod som null med begrundelsen "servicebesøgene har
 * ingen node; de ligger i demo-facility.js med `estimatOere`". Begge dele
 * holdt op med at være sandt ved beslutning 49: besøgene ER `opgaver` med art
 * `facility`, feltet hedder `beloebOere`, og Servicekalenderen læser noden.
 *
 * Et felt der får en kilde, skal ud af efterslæbet — ellers tæller optællingen
 * ting der kunne regnes, og så holder man op med at tro på tallet.
 */
test("⚠ anslaaetServiceOere REGNES AF NODEN — samme sæt som planlagtVedligehold", () => {
  const opgaver = [
    { art: "facility", status: "planlagt", beloebOere: 120000 },
    { art: "facility", status: "planlagt", beloebOere: 80000 },
    /* Afventer tælles IKKE: de to tal skal beskrive det samme sæt, ellers er
       summen divideret med antallet en pris pr. besøg der ikke findes. */
    { art: "facility", status: "afventer", beloebOere: 999000 },
    /* En værkstedsopgave hører til Fleets egne tal. */
    { art: "vaerksted", status: "planlagt", beloebOere: 999000 },
    /* Et besøg UDEN beløb tæller som nul, ikke som et gæt. */
    { art: "facility", status: "planlagt" },
  ];
  const t = facilitytal({ aktiver: [aktiv()], opgaver, nu: NU });
  assert.equal(t.planlagtVedligehold, 3);
  assert.equal(t.anslaaetServiceOere, 200000);
});

/* ---- Formen overlever ikke turen gennem RTDB --------------------------- */

/** Det RTDB gør ved et objekt på vej ind: null forsvinder, tomt forsvinder. */
const somRtdbGemmer = (v) => {
  if (Array.isArray(v)) return v.length ? v : undefined;
  if (!v || typeof v !== "object") return v === null ? undefined : v;
  const ud = {};
  for (const [k, x] of Object.entries(v)) {
    const gemt = somRtdbGemmer(x);
    if (gemt !== undefined) ud[k] = gemt;
  }
  return Object.keys(ud).length ? ud : undefined;
};

test("⚠ ET HELT DOMÆNE KAN FORSVINDE UD AF NODEN", () => {
  /* Hovedet i kpi-aggregering.js lovede at "feltet SKAL med i objektet, så man
     kan se af noden hvad der mangler". Det kan databasen ikke levere: RTDB
     GEMMER IKKE null. Er hele domænet null, findes domænet ikke bagefter.

     Målt på den udrullede base efter første rigtige aggregering: `bemanding`
     var der overhovedet ikke, og Bemanding-skærmen læste
     `k.bemanding.disponeret` og blev HVID. Det var ikke skærmens fejl — den
     læste et felt aggregeringen havde skrevet. */
  const beregnet = beregnKpi({ nu: NU });
  assert.ok("bemanding" in beregnet, "aggregeringen skriver bemanding");

  const iNoden = somRtdbGemmer(beregnet);

  /**
   * ⚠ PRØVEN SAGDE SELV HVAD DER SKULLE SKE: *"eller bemanding har fået en
   * kilde, og så skal prøven skrives om"*. Det er sket (beslutning 69), og
   * domænet forsvinder ikke længere — det har rigtige tal.
   *
   * ⚠ MEN KENDSGERNINGEN SKAL STADIG PRØVES, for den er ikke gået væk: er
   * HVERT felt i et domæne null, findes domænet ikke i noden. Uden data er
   * `warehouse` netop sådan et domæne, og den prøver reglen nu — ellers
   * ville medFuldForm()'s grund til at findes forsvinde ud af prøverne
   * sammen med bemandingen.
   */
  assert.ok(iNoden.bemanding, "bemanding har rigtige tal nu og skal blive i noden");
  assert.equal(iNoden.bemanding.ledig, undefined,
    "et enkelt null-felt forsvinder stadig, også når domænet bliver");
  assert.equal(iNoden.warehouse, undefined,
    "et domæne hvor ALT er null, forsvinder — det er hele grunden til medFuldForm()");
  assert.equal(iNoden.afvigelser, undefined, "en tom liste forsvinder også");
});

test("⚠ medFuldForm() GIVER DOMÆNET TILBAGE", () => {
  /* Oversættelsen hører ét sted — i useKpi — af samme grund som fraDb() i
     grundlag.js: tyve skærme ville lave tyve varianter, og den næste ville
     glemme den. */
  const iNoden = somRtdbGemmer(beregnKpi({ nu: NU }));
  const k = medFuldForm(iNoden);

  assert.ok(k.warehouse, "domænet skal være der igen");
  assert.equal(k.warehouse.carriereUdenLokationDelta, null,
    "null, ikke undefined og ikke 0");
  /* ⚠ OG FELTET INDE I ET DOMÆNE DER OVERLEVEDE. bemanding bliver nu i noden,
     men `ledig` forsvinder — skelettet skal lægge netop det felt tilbage,
     ellers bliver skærmen hvid på k.bemanding.ledig i stedet for på
     k.bemanding. Samme fejl, ét niveau dybere. */
  assert.ok(k.bemanding, "domænet skal være der");
  assert.equal(k.bemanding.ledig, null, "det enkelte null-felt kom ikke tilbage");
  assert.deepEqual(k.afvigelser, [], "en tom liste er et svar");
});

test("⚠ DET HENTEDE VINDER OVER SKELETTET", () => {
  /* Skelettet må aldrig overskrive et rigtigt tal. Nul er en gyldig værdi —
     "0 åbne fejl" er et svar — og en fletning der tog skelettet sidst, ville
     gøre hvert nul til et hul. */
  const k = medFuldForm(
    { opgaver: { aabne: 0 }, flaade: { braendstofOere: 100 } });
  assert.equal(k.opgaver.aabne, 0, "nul er et svar, ikke et manglende tal");
  assert.equal(k.flaade.braendstofOere, 100);
  assert.equal(k.flaade.aktive, null, "det der ikke stod i noden, er null");
});

test("⚠ SKELETTET UDLEDES AF beregnKpi(), IKKE SKREVET AF", () => {
  /* En håndskreven liste ville være et andet sted formen stod, og den ville
     drive første gang nogen tilføjede et felt. Her kan den ikke: skelettet ER
     beregningens svar, med bladene nulstillet. */
  const beregnet = beregnKpi({ nu: NU });
  const skelet = kpiSkelet("gods");
  assert.deepEqual(Object.keys(skelet).sort(), Object.keys(beregnet).sort());
  for (const [domaene, felter] of Object.entries(beregnet)) {
    if (!felter || typeof felter !== "object" || Array.isArray(felter)) continue;
    assert.deepEqual(
      Object.keys(skelet[domaene]).sort(), Object.keys(felter).sort(),
      `${domaene} har ikke samme felter i skelettet`);
  }
});

test("medFuldForm(null) er null — en afvisning bærer ingen form", () => {
  /* Ingen tal oven på en afvisning. Se datatilstand.js og beslutning 26. */
  assert.equal(medFuldForm(null), null);
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

/**
 * ⚠ HER STOD "begge divisioner skrives", og proeven kraevede en konstant
 * KPI_DIVISIONER = ["gods", "bus"] og en loekke over den.
 *
 * Aksen er fjernet i beslutning 70: ingen abonnent har baade gods og bus, saa
 * den ene af de to grene beskrev en forretning kunden ikke havde — og for
 * flaaden, bemandingen og facility stod der de SAMME tal i begge.
 */
test("⚠ ÉT SAET SKRIVES, IKKE ET PR. DIVISION", () => {
  assert.ok(!kilde.includes("KPI_DIVISIONER"),
    "divisionsloekken er tilbage i jobbet");
  assert.ok(blok.includes('rod.child("kpi")'),
    "jobbet skriver ikke til kpi/ direkte");
  /* Og stien har ét niveau mindre — samme form som reglen. */
  assert.ok(!/kpi\/\$\{division\}/.test(blok), "den gamle sti staar endnu");
});

test("tenantlisten kommer fra udbyder/kunder", () => {
  assert.ok(blok.includes('db.ref("udbyder/kunder")'));
});


/* ══════════════════════════════════════════════════════════════════════════
   HVERT null SKAL HAVE EN GRUND — beslutning 62
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ HVORFOR PRØVEN FINDES.
 *
 * Beslutning 60 og 61 fandt det samme to gange: felter der stod som `null`
 * uden en linje begrundelse — og hvor kilden havde ligget der hele tiden.
 * `forsinkelsesrisiko`, `konflikter` og `forsinkede` kunne alle regnes; de
 * stod som null fordi ingen havde spurgt.
 *
 * ⚠ ET null UDEN EN BEGRUNDELSE KAN IKKE SKELNES FRA ET FELT NOGEN HAR GLEMT.
 * Og de tre slags null ligner hinanden i noden:
 *
 *   · ingen KILDE      — noden findes ikke (`sager/`, `tilbud/`)
 *   · intet SPØRGSMÅL  — definitionen mangler (`ledigKapacitetPct`)
 *   · ingen FORRIGE    — deltaen venter på i nat
 *
 * Prøven kræver ikke at man vælger den rigtige — kun at man skriver hvilken.
 * Den kan ikke afgøre om begrundelsen er SAND; den kan afgøre om nogen har
 * taget stilling. Det er forskellen på en liste man læser og en man holder op
 * med at læse.
 */
test("⚠ HVERT null-FELT I AGGREGERINGEN HAR EN BEGRUNDELSE", () => {
  const linjer = readFileSync("src/fleet/kpi-aggregering.js", "utf8")
    .replace(/\r\n/g, "\n").split("\n");

  /* ⚠ KPI_DOMAENE ER IKKE NØGLETAL. Den er domæne → modul, og `null` dér
     betyder "hører ikke til et modul" — ikke "kunne ikke regnes". */
  const start = linjer.findIndex((l) => l.includes("export const KPI_DOMAENE"));
  const slut = linjer.findIndex((l, i) => i > start && l.trim() === "};");

  /** En linje der KUN sætter null-felter — også flere på samme linje. */
  const erNullLinje = (l) => {
    const t = l.trim();
    if (!t) return false;
    return /^([A-Za-z][\w]*: null,\s*)+$/.test(t) || /^[A-Za-z][\w]*: null,?$/.test(t);
  };
  const erKommentar = (l) => /(\*\/|^\s*\/\/|^\s*\*|\/\*)/.test(l);

  const uden = [];
  for (let i = 0; i < linjer.length; i++) {
    if (i >= start && i <= slut) continue;
    if (!erNullLinje(linjer[i])) continue;
    /* Er vi midt i et løb, er begrundelsen givet ved løbets begyndelse. */
    let j = i - 1;
    while (j >= 0 && linjer[j].trim() === "") j--;
    if (j >= 0 && erNullLinje(linjer[j])) continue;
    if (j >= 0 && erKommentar(linjer[j])) continue;
    uden.push(`linje ${i + 1}: ${linjer[i].trim()}`);
  }

  assert.deepEqual(uden, [],
    "null-felter uden en begrundelse. Skriv HVILKEN slags null det er — ingen "
    + "kilde, intet spørgsmål, eller ingen forrige kørsel. Se beslutning 62.");
});
