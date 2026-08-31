/* src/fleet/demo-indkoeb.js
 * Leverandører, indkøbslinjer, fakturaer og afstemning. Én fil, begge
 * Indkøb-skærme.
 *
 * ⚠ LEVERANDØRERNE ER KILDEN. De stod som fritekst i demo-vaerksted og
 * demo-facility — "Mercedes Greve", "Crawford Døre & Porte" — og hver fil
 * havde sin egen stavemåde at drive med. Nu peger de på et id herfra, og der
 * er en test der fastholder at hvert id kan slås op.
 *
 * ⚠ PRISER I ØRE. Mockuppens 18,50 kr/stk er 1850 øre. `prisPrEnhedOere` er
 * altid ekskl. moms, og linjens beløb beregnes — det gemmes ikke, så det ikke
 * kan drive fra antal × pris.
 *
 * ⚠ DIVISION ER PÅKRÆVET PÅ ET INDKØB. Reglerne validerer
 * ⚠ HER STOD AT REGLEN KRÆVEDE hasChildren(['division']). Feltet er forbudt
 * siden beslutning 70. Værdien kunne i øvrigt aldrig arves fra
 * køretøjet (beslutning 19) — den skal sættes af den der registrerer.
 *
 * ⚠ INGEN GEMTE TOTALER. Afstemningens tre summer regnes af listerne, og de
 * to afvigelser af summerne. Et gemt total ville kunne drive fra sine linjer,
 * og så mangler en post uden at nogen ser det.
 */
import { DEMO_KPI } from "./demo-kpi.js";
import {
  LEVERANDOER_KATEGORI, AFTALETYPE, FAKTURASTATUS,
  afstem, parterFraLeverandoer,
} from "./leverandoerer.js";
import { selvkontrol } from "./selvkontrol.js";
import { iDagIsoLokal, isoPlusDage, isoTilMs } from "./format.js";

const DAG = 86400000;
const iDag = new Date();
iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();
const dag = (n) => D0 + n * DAG;

/* ⚠ G.2 — SAMME to LOKALE FUNKTIONER SOM demo-indberetninger.js's
   il-014-il-016-modparter (ind-007 til ind-010) BRUGER — se noten der.
   `dag()` ovenfor er lokal-midnat-ankret, men msTilIso() (som
   braendstofmatch.js læser dato-feltet igennem) er UTC — de to kan derfor
   IKKE garanteres at lande på samme kalenderdag i alle tidszoner.
   isoTilMs(isoPlusDage(...)) er middags-ankret og undgår det helt. */
const dagBraendstof = (n) => isoTilMs(isoPlusDage(iDagIsoLokal(), n));

/* ---- Leverandører ------------------------------------------------------ */

/**
 * `division` beskriver LEVERANDØRENS forretning, ikke vores organisation —
 * se prøven i leverandoerer.js. Crawford leverer porte til begge slags
 * vognmænd og er derfor `faelles`; Mercedes Greve er et lastbilværksted.
 *
 * `kontaktEmail` bliver startlisten af parter på en sag (beslutning 20).
 */
/* ⚠ IKKE EKSPORTERET. Den eksporterede DEMO_LEVERANDOERER samles nederst i
   filen, med prislisten påsat — se noten dér. Listen her er kun det der er
   SKREVET i hånden; nodens form er den samlede. */
const LEVERANDOERER_BASIS = [
  { id: "lv-mercedes", navn: "Mercedes Greve", cvr: "18447291", kategori: "vaerksted",
    aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-400) },
    kontaktEmail: "service@mercedes-greve.dk", kontaktTelefon: "43 90 22 10" },
  { id: "lv-scania", navn: "Scania Kolding", cvr: "27118804", kategori: "vaerksted",
    aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-720) },
    kontaktEmail: "kolding@scania.dk", kontaktTelefon: "76 33 41 00" },
  { id: "lv-daf", navn: "DAF Trucks Fredericia", cvr: "30556612", kategori: "vaerksted",
    aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "service@daf-fredericia.dk", kontaktTelefon: "75 92 18 40" },
  { id: "lv-man", navn: "MAN Truck Center Horsens", cvr: "29844170", kategori: "vaerksted",
    aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-300) },
    kontaktEmail: "horsens@mantruck.dk", kontaktTelefon: "75 61 90 20" },
  { id: "lv-schmitz", navn: "Schmitz Service Padborg", cvr: "31220945", kategori: "vaerksted",
    aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "service@schmitz-padborg.dk", kontaktTelefon: "74 67 30 55" },
  { id: "lv-daekteam", navn: "Dækteam Vejle", cvr: "26719038", kategori: "daek",
    aktiv: true, aftale: { type: "fastaftale", gyldigFra: dag(-540), rabatPct: 12 },
    kontaktEmail: "salg@daekteam-vejle.dk", kontaktTelefon: "75 82 66 14" },
  { id: "lv-applus", navn: "Applus Bilsyn Kolding", cvr: "30104786", kategori: "vaerksted",
    aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "kolding@applusbilsyn.dk", kontaktTelefon: "70 22 21 20" },
  { id: "lv-scooter", navn: "Scootercenter Kolding", cvr: "33918822", kategori: "vaerksted",
    aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "vaerksted@scootercenter-kolding.dk", kontaktTelefon: "75 50 12 88" },
  { id: "lv-crawford", navn: "Crawford Døre & Porte", cvr: "19477320", kategori: "facility",
    aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-620) },
    kontaktEmail: "service@crawford.dk", kontaktTelefon: "70 15 30 40" },
  { id: "lv-koelecenter", navn: "Kølecenter Syd", cvr: "28660314", kategori: "facility",
    aktiv: true, aftale: { type: "fastaftale", gyldigFra: dag(-380), rabatPct: 8 },
    kontaktEmail: "service@koelecentersyd.dk", kontaktTelefon: "74 52 88 90" },
  { id: "lv-wash", navn: "Wash Systems A/S", cvr: "25901147", kategori: "facility",
    aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "support@washsystems.dk", kontaktTelefon: "86 12 44 70" },
  { id: "lv-gulv", navn: "Dansk Gulvteknik", cvr: "32770158", kategori: "facility",
    aktiv: true, aftale: { type: "spot" },
    kontaktEmail: "info@danskgulvteknik.dk", kontaktTelefon: "70 26 11 05" },
  { id: "lv-clever", navn: "Clever Service", cvr: "33251290", kategori: "facility",
    aktiv: true, aftale: { type: "rammeaftale", gyldigFra: dag(-210) },
    kontaktEmail: "erhverv@clever.dk", kontaktTelefon: "82 30 30 30" },
  { id: "lv-hydra", navn: "Hydra-Grene Kolding", cvr: "17293355", kategori: "reservedele",
    aktiv: true, aftale: { type: "fastaftale", gyldigFra: dag(-800), rabatPct: 15 },
    kontaktEmail: "kolding@hydra-grene.dk", kontaktTelefon: "97 35 05 00" },
  { id: "lv-circlek", navn: "Circle K Erhverv", cvr: "26147847", kategori: "braendstof",
    aktiv: true, aftale: { type: "fastaftale", gyldigFra: dag(-900) },
    kontaktEmail: "erhverv@circlek.dk", kontaktTelefon: "70 10 20 30" },
  { id: "lv-kontorland", navn: "Kontorland A/S", cvr: "21883016", kategori: "kontor",
    aktiv: false, aftale: { type: "spot" },
    kontaktEmail: "salg@kontorland.dk", kontaktTelefon: "86 44 12 00" },
];

/* ---- Indkøbslinjer ----------------------------------------------------- */

/**
 * `prisPrEnhedOere` er ekskl. moms. Linjens beløb BEREGNES af antal × pris —
 * gemte vi det, kunne de to drive fra hinanden.
 *
 * Mockuppens 18,50 kr/stk står som 1850. En float her ville ende som 1849,999
 * i en sum over hundrede linjer.
 */
/**
 * Tolv måneders indkøb af de tre varer der købes hver måned.
 *
 * Priserne er DETERMINISTISKE — ingen Math.random(). To kørsler skal give
 * samme graf, ellers kan man ikke se om en ændring i koden flyttede noget.
 * Kurven er et jævnt stigende dieselforløb med et enkelt dyk, som virkelige
 * brændstofpriser opfører sig.
 *
 * `m` er antal måneder tilbage: 0 er indeværende, 11 er for et år siden.
 */
const MAANEDSVARER = [
  { vare: "Diesel B7", varenummer: "DIESEL-B7", kategori: "braendstof", enhed: "liter",
    leverandoerId: "lv-circlek", antal: 4200, koeretoejId: null,
    /* øre pr. liter, ældst først */
    priser: [1048, 1061, 1039, 1072, 1085, 1094, 1088, 1103, 1118, 1126, 1135, 1142] },
  { vare: "AdBlue", varenummer: "ADBLUE", kategori: "braendstof", enhed: "liter",
    leverandoerId: "lv-circlek", antal: 820, koeretoejId: null,
    priser: [612, 618, 624, 631, 629, 640, 648, 655, 661, 668, 674, 682] },
  { vare: "Dæk 315/70 R22.5", varenummer: "DAEK-31570", kategori: "daek", enhed: "stk",
    leverandoerId: "lv-daekteam", antal: 4, koeretoejId: null,
    priser: [398000, 399500, 401000, 402500, 404000, 405500, 407000, 408500,
             410000, 411000, 412000, 412500] },
];

function maanedligeIndkoeb() {
  const linjer = [];
  for (const v of MAANEDSVARER) {
    v.priser.forEach((prisOere, i) => {
      /* i = 0 er tolv måneder siden. 30 dage pr. måned er rigeligt præcist
         til en snitpris pr. måned og gør datoen forudsigelig. */
      const m = v.priser.length - 1 - i;
      const d = dag(-(m * 30) - 15);
      linjer.push({
        id: `il-h-${v.varenummer}-${m}`,
        dato: d, aftaltLeveringMs: d, leveretMs: d,
        leverandoerId: v.leverandoerId,
        reference: `HIST-${v.varenummer}-${m}`,
        vare: v.vare, varenummer: v.varenummer, kategori: v.kategori,
        antal: v.antal, enhed: v.enhed, prisPrEnhedOere: prisOere,
        lokationId: "lok-kolding", koeretoejId: v.koeretoejId,
        formaal: "Løbende forbrug",
        /* Historikken er afsluttet. Stod den som `mangler`, ville
           huskelisten "mangler faktura" vokse med et år bagud. */
        fakturastatus: "bogfoert", godkendtAf: "Anne Bøgh", godkendtMs: d,
        historisk: true,
      });
    });
  }
  return linjer;
}

/**
 * ⚠ `reference` ER LEVERANDØRENS NUMMER, ikke vores. Det er dét man slår op i,
 * når man ringer og spørger hvor varen bliver af, og det er dét der står på
 * fakturaen der skal matches. Vores eget id (`il-001`) duer ikke til nogen af
 * delene — leverandøren kender det ikke.
 *
 * ⚠ ET INDKØB ER KØBT TIL NOGET. `koeretoejId` eller `lokationId` siger hvad,
 * og `formaal` siger hvorfor. Uden dem er en linje et beløb uden ærinde, og så
 * kan ingen svare på om den hørte til. Begge er valgfrie: kontorartikler er
 * hverken en bil eller en bygning.
 */
export const DEMO_INDKOEBSLINJER = [
  { id: "il-001", dato: dag(-2), aftaltLeveringMs: dag(0), leveretMs: dag(0), leverandoerId: "lv-hydra", reference: "HYD-450078912",
    vare: "Hydraulikslange 3/8\"", varenummer: "HYD-38", kategori: "reservedele", antal: 12, enhed: "stk",
    prisPrEnhedOere: 1850, lokationId: "lok-kolding",
    koeretoejId: "kt-104", formaal: "Reparation — hydraulikslange, tipkasse",
    fakturastatus: "modtaget", godkendtAf: "Søren Dahl", godkendtMs: dag(-1) },
  /* ⚠ ET KONTANTKØB ER EN INDKØBSLINJE — IKKE EN NODE VED SIDEN AF.
     `indkoeb` ER det vi har købt; et kontant køb er nøjagtig det, bare
     betalt på en anden måde. En egen node ville være den samme
     kendsgerning to steder, og leverandørernes nøgletal, varelageret og
     hvert beløb i modulet skulle huske at lægge de to sammen.

     ⚠ OG DEN HAR INGEN `fakturastatus`. Der KOMMER ingen faktura;
     "mangler" ville lade købet stå i hver optælling af det vi venter på,
     og listen over manglende bilag kunne aldrig tømmes.

     ⚠ `bilagId` MANGLER MED VILJE. Der er ingen fillagring endnu, og
     manglen TÆLLES af `kontantUdenBilag()` frem for at spærre — uden et
     eksempel kan den tælling ikke ses virke. */
  { id: "il-kontant-1", dato: dag(-5), leverandoerId: "lv-kontorland",
    vare: "Arbejdshandsker str. 10", varenummer: "AH10-12", kategori: "kontor",
    antal: 12, enhed: "par", prisPrEnhedOere: 1600, momsOere: 4800,
    betalingsform: "kontant", udlaegAf: "uid-michael", oprettetAf: "uid-mette",
    oprettetMs: dag(-5),
    formaal: "Købt lokalt — lageret løb tør." },

  { id: "il-002", dato: dag(-3), aftaltLeveringMs: dag(-1), leveretMs: dag(-1), leverandoerId: "lv-daekteam", reference: "DT-2026-77812",
    vare: "Dæk 315/70 R22.5", varenummer: "DAEK-31570", kategori: "daek", antal: 4, enhed: "stk",
    prisPrEnhedOere: 412500, lokationId: "lok-kolding",
    koeretoejId: "kt-b16", formaal: "Dækskifte foraksel og bogie",
    fakturastatus: "modtaget", godkendtAf: null, godkendtMs: null },
  { id: "il-003", dato: dag(-4), aftaltLeveringMs: dag(-2), leveretMs: dag(-2), leverandoerId: "lv-circlek", reference: "CK-2026-55640",
    vare: "Diesel B7", varenummer: "DIESEL-B7", kategori: "braendstof", antal: 4820, enhed: "liter",
    prisPrEnhedOere: 1142, lokationId: "lok-kolding",
    koeretoejId: "kt-012", formaal: "Tankkort — periodens tankninger",
    fakturastatus: "bogfoert", godkendtAf: "Anne Bøgh", godkendtMs: dag(-3) },
  { id: "il-004", dato: dag(-5), aftaltLeveringMs: dag(-3), leveretMs: dag(0), leverandoerId: "lv-hydra", reference: "HYD-450079140",
    vare: "Bremseklods, aksel 2", varenummer: "BRK-A2", kategori: "reservedele", antal: 8, enhed: "sæt",
    prisPrEnhedOere: 78500, lokationId: "lok-halb",
    koeretoejId: "kt-078", formaal: "Bremseslidtage bagaksel — se indberetning",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },
  { id: "il-005", dato: dag(-6), aftaltLeveringMs: dag(-4), leveretMs: dag(-4), leverandoerId: "lv-crawford", reference: "CRW-119988",
    vare: "Portmotor, reservedel", kategori: "facility", antal: 1, enhed: "stk",
    prisPrEnhedOere: 1284000, lokationId: "lok-halb",
    formaal: "Port 3 — udskiftning af portmotor",
    fakturastatus: "modtaget", godkendtAf: "Benjamin Holm", godkendtMs: dag(-5) },
  { id: "il-006", dato: dag(-7), aftaltLeveringMs: dag(-5), leveretMs: dag(-5), leverandoerId: "lv-koelecenter", reference: "KC-88214",
    vare: "Kølemiddel R452A", kategori: "facility", antal: 25, enhed: "kg",
    prisPrEnhedOere: 34800, lokationId: "lok-halb",
    formaal: "Fryseanlæg — halvårligt serviceeftersyn",
    fakturastatus: "godkendt", godkendtAf: "Benjamin Holm", godkendtMs: dag(-6) },
  { id: "il-007", dato: dag(-8), aftaltLeveringMs: dag(-6), leveretMs: dag(-6), leverandoerId: "lv-circlek", reference: "CK-2026-55402",
    vare: "AdBlue", varenummer: "ADBLUE", kategori: "braendstof", antal: 900, enhed: "liter",
    prisPrEnhedOere: 682, lokationId: "lok-aalborg",
    koeretoejId: "kt-b12", formaal: "Påfyldning, depot Aalborg",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },
  { id: "il-008", dato: dag(-9), aftaltLeveringMs: dag(-7), leveretMs: dag(-4), leverandoerId: "lv-hydra", reference: "HYD-450078455",
    vare: "Luftfilter", varenummer: "LUF-01", kategori: "reservedele", antal: 6, enhed: "stk",
    prisPrEnhedOere: 24900, lokationId: "lok-kolding",
    koeretoejId: "kt-106", formaal: "Serviceeftersyn — filterskift",
    fakturastatus: "bogfoert", godkendtAf: "Søren Dahl", godkendtMs: dag(-8) },
  { id: "il-009", dato: dag(-11), aftaltLeveringMs: dag(-9), leveretMs: dag(-9), leverandoerId: "lv-daekteam", reference: "DT-2026-77440",
    vare: "Dæk 385/65 R22.5", varenummer: "DAEK-38565", kategori: "daek", antal: 2, enhed: "stk",
    prisPrEnhedOere: 498000, lokationId: "lok-kolding",
    koeretoejId: "kt-034", formaal: "Dækskifte foraksel",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },
  { id: "il-010", dato: dag(-13), aftaltLeveringMs: dag(-11), leveretMs: dag(-11), leverandoerId: "lv-kontorland", reference: "KL-2026-0412",
    vare: "Kontorartikler, diverse", kategori: "kontor", antal: 1, enhed: "pk",
    prisPrEnhedOere: 184500, lokationId: "lok-kolding",
    formaal: "Hovedkontor — kvartalets forbrugsartikler",
    fakturastatus: "afvist", godkendtAf: null, godkendtMs: null },

  /* --- Værkstedsbesøgenes indkøb --------------------------------------
     ⚠ DE HER FIRE LÅ I demo-vaerksted.js SOM ET EGET DATASÆT, `DEMO_INDKOEB`.
     To demo-datasæt for den SAMME node — syvende gang mønstret dukker op, og
     den dyreste af dem: `fa-9001` pegede på `indkoebId: "ik-001"`, og fordi
     linjen ikke fandtes HER, satte jeg feltet til null med en note om at "en
     hængende reference er værre end ingen". Linjen fandtes. Den lå bare i den
     anden fil, og blev aldrig seedet.

     ⚠ OG DE TO SÆT DELTE IKKE FORM. Det gamle bar `beloebOere` direkte —
     som reglerne FORBYDER på `indkoeb`, fordi beløbet beregnes af antal ×
     pris. Et værkstedsbesøg er én ydelse til én pris: `antal: 1`.

     ⚠ `besoegId` ER SPORET TILBAGE. Uden det kan man ikke se hvilket besøg
     regningen hørte til, og Værkstedskalenderen kunne ikke vise sine egne
     omkostninger uden sit eget datasæt — altså præcis den kopi vi lige
     fjernede. Feltet er tilladt i firebase.rules.json. */
  { id: "il-vb-001", dato: dag(-22), aftaltLeveringMs: dag(-22), leveretMs: dag(-22),
    leverandoerId: "lv-scania", besoegId: "vb-001",
    reference: "SK-2026-4471",
    vare: "Serviceeftersyn 30.000 km", kategori: "vaerksted", antal: 1, enhed: "stk",
    prisPrEnhedOere: 1842500, momsOere: 460625,
    koeretoejId: "kt-078", formaal: "Planlagt service — værkstedsbesøg",
    fakturastatus: "bogfoert", godkendtAf: "Søren Dahl", godkendtMs: dag(-21) },
  { id: "il-vb-002", dato: dag(-9), aftaltLeveringMs: dag(-9), leveretMs: dag(-9),
    leverandoerId: "lv-daekteam", besoegId: "vb-002",
    reference: "DV-88213",
    vare: "Dækskifte, 4 stk.", kategori: "daek", antal: 1, enhed: "sæt",
    prisPrEnhedOere: 2960000, momsOere: 740000,
    koeretoejId: "kt-b16", formaal: "Dækskifte — værkstedsbesøg",
    fakturastatus: "modtaget", godkendtAf: null, godkendtMs: null },
  { id: "il-vb-003", dato: dag(-1), aftaltLeveringMs: dag(-1), leveretMs: dag(-1),
    leverandoerId: "lv-daf", besoegId: "vb-003",
    reference: "DAF-2026-1188",
    vare: "Reparation, kobling", kategori: "vaerksted", antal: 1, enhed: "stk",
    prisPrEnhedOere: 1215000, momsOere: 303750,
    koeretoejId: "kt-106", formaal: "Reparation — værkstedsbesøg",
    fakturastatus: "modtaget", godkendtAf: null, godkendtMs: null },
  { id: "il-vb-004", dato: dag(0), aftaltLeveringMs: dag(0), leveretMs: dag(0),
    leverandoerId: "lv-schmitz", besoegId: "vb-004",
    reference: "SSP-70412",
    vare: "Reparation, trailerbund", kategori: "vaerksted", antal: 1, enhed: "stk",
    prisPrEnhedOere: 3480000, momsOere: 870000,
    koeretoejId: "kt-tr42", formaal: "Reparation — værkstedsbesøg",
    fakturastatus: "modtaget", godkendtAf: null, godkendtMs: null },

  /* --- To BESTILTE, endnu ikke leverede -------------------------------
     ⚠ UDEN DEM VAR ALLE 46 LINJER LEVERET, og `indkoeb.aabneOrdrer` gav 0
     i både gods og bus. Nul var det rigtige svar på de data — og derfor
     kunne tællingen ikke tage fejl på en måde nogen kunne se. En form der
     aldrig viser den tilstand den skal kunne vise, er ikke formen.

     De to deler ÉN `reference`: det er samme bestilling hos samme
     leverandør, med to varelinjer. Én åben ORDRE, ikke to — og det er
     netop den forskel tællingen skal kunne holde.

     Ingen `leveretMs`, ingen `godkendtMs`: man godkender ikke en vare der
     ikke er kommet. `aftaltLeveringMs` ligger frem i tiden, så de heller
     ikke tæller som forsinkede — en ordre er ikke for sent leveret før
     terminen er passeret. */
  { id: "il-011", dato: dag(-2), aftaltLeveringMs: dag(5), leveretMs: null, leverandoerId: "lv-hydra", reference: "HYD-450079880",
    vare: "Bremseklods, akselsæt", varenummer: "BRK-22", kategori: "reservedele", antal: 4, enhed: "sæt",
    prisPrEnhedOere: 89500, lokationId: "lok-kolding",
    koeretoejId: "kt-078", formaal: "Planlagt bremseeftersyn",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },
  { id: "il-012", dato: dag(-2), aftaltLeveringMs: dag(5), leveretMs: null, leverandoerId: "lv-hydra", reference: "HYD-450079880",
    vare: "Bremsevæske DOT 4", varenummer: "BRV-04", kategori: "reservedele", antal: 5, enhed: "liter",
    prisPrEnhedOere: 7400, lokationId: "lok-kolding",
    koeretoejId: "kt-078", formaal: "Planlagt bremseeftersyn — samme ordre",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },
  { id: "il-013", dato: dag(-1), aftaltLeveringMs: dag(9), leveretMs: null, leverandoerId: "lv-schmitz", reference: "SSP-70590",
    vare: "Sideruder, sæt", varenummer: "RUD-12", kategori: "reservedele", antal: 2, enhed: "sæt",
    prisPrEnhedOere: 142000, lokationId: "lok-aalborg",
    koeretoejId: "kt-b16", formaal: "Rudeskade, bus 16",
    fakturastatus: "mangler", godkendtAf: null, godkendtMs: null },

  /* ════════════════════════════════════════════════════════════════════
     G.2 — BRÆNDSTOFMATCH-DEMOEN. Modparterne til ind-007–ind-010 i
     demo-indberetninger.js (se noten der). INGEN af de fire bærer
     koeretoejId — en leverandørs tankkort-udtræk kender sjældent
     FleetControls eget id, og det er netop DÉT matchet skal afgøre.
     Ingen af dem er "bogfoert"/"afvist" endnu, så alle fire vises som
     uafklarede på Procure → Match & kontantkøb.

     il-014  Modpart til ind-007 — samme dato, næsten samme literantal.
             Ét utvetydigt forslag → braendstofAutomatch bekræfter den.
     il-015  Modpart til ind-008 — to dage fra hinanden, literantal tæt
             nok til et forslag, men for langt fra en automatisk match.
     il-016  Modpart til BÅDE ind-009 og ind-010 — samme dato som begge,
             literantal tæt nok på begge til at kvalificere til
             automatch hver for sig. To kvalificerende forslag er per
             definition tvetydigt (se afgørAutomatch()) — kræver et
             menneskes valg.
     ════════════════════════════════════════════════════════════════════ */
  { id: "il-014", dato: dagBraendstof(-2), aftaltLeveringMs: null, leveretMs: dagBraendstof(-2),
    leverandoerId: "lv-circlek", reference: "CK-2026-56011",
    vare: "Diesel B7", varenummer: "DIESEL-B7", kategori: "braendstof", antal: 62.6, enhed: "liter",
    prisPrEnhedOere: 1188, lokationId: "lok-kolding",
    formaal: "Tankning — afventer match mod chaufførens registrering",
    fakturastatus: "modtaget", godkendtAf: null, godkendtMs: null },
  { id: "il-015", dato: dagBraendstof(-2), aftaltLeveringMs: null, leveretMs: dagBraendstof(-2),
    leverandoerId: "lv-circlek", reference: "CK-2026-56012",
    vare: "Diesel B7", varenummer: "DIESEL-B7", kategori: "braendstof", antal: 88.6, enhed: "liter",
    prisPrEnhedOere: 1188, lokationId: "lok-kolding",
    formaal: "Tankning — afventer match mod chaufførens registrering",
    fakturastatus: "modtaget", godkendtAf: null, godkendtMs: null },
  { id: "il-016", dato: dagBraendstof(-3), aftaltLeveringMs: null, leveretMs: dagBraendstof(-3),
    leverandoerId: "lv-circlek", reference: "CK-2026-56013",
    vare: "Diesel B7", varenummer: "DIESEL-B7", kategori: "braendstof", antal: 51.0, enhed: "liter",
    prisPrEnhedOere: 1188, lokationId: "lok-kolding",
    formaal: "Tankning — afventer match mod chaufførens registrering",
    fakturastatus: "modtaget", godkendtAf: null, godkendtMs: null },

  /* --- Historik: tolv måneder tilbage ---------------------------------
     ⚠ DE HER LINJER ER PRISUDVIKLINGENS GRUNDLAG, og de ligger derfor HER
     og ikke i et separat DEMO_PRISHISTORIK. En snitpris ER et gennemsnit af
     indkøb; havde den sin egen tabel, ville de to kunne sige hver sit om
     samme måned — og det er nøjagtig fejlen fra to demo-datasæt.

     Linjerne genereres, fordi tolv måneder × tre varer er 36 poster hvor
     kun datoen og prisen varierer. Skrevet i hånden ville de være 36
     steder at lave en tastefejl. */
  ...maanedligeIndkoeb(),
];

/* ⚠ HER STOD EN TREDJE linjeBeloebOere.
   Regnestykket hedder indkoebBeloebOere() og staar i leverandoerer.js — det
   er domaenemodulet, ikke demofilen. Kopien her regnede raa antal x pris,
   mens beloeb.js' funktion af samme navn dividerer med ANTAL_SKALA. To
   funktioner med samme navn og forskellig skala i ét repo er 1000x-fejlen,
   og skaermene importerede den fra en DEMO-fil — den fil der forsvinder den
   dag noden er rigtig. test/priser.test.mjs faelder nu paa navnet her ogsaa. */

/* ---- Fakturaer --------------------------------------------------------- */

/**
 * `beloebOere` er ALTID ekskl. moms; `momsOere` er et separat felt. Mockuppen
 * viste ét beløb inkl. moms, og blandes de, lægges inkl.-tal sammen med
 * ekskl.-tal i en rapport (beslutning 2).
 *
 * `sagsnummer` er beslutning 20: en faktura der kom ind på en sag, skal kunne
 * spores tilbage til den tråd der aftalte arbejdet.
 */
export const DEMO_FAKTURAER = [
  { id: "fa-9001", leverandoerId: "lv-scania", fakturanummer: "SK-2026-4471",
    fakturadatoMs: dag(-22), forfaldMs: dag(8), status: "bogfoert",
    beloebOere: 1842500, momsOere: 460625,
    /* ⚠ HER STOD indkoebId: "ik-001", OG JEG SATTE DET TIL null.
       Begrundelsen var at "der er slet ingen scania-linje at pege paa" — og
       den var forkert. Linjen fandtes; den lå i demo-vaerksted.js som et
       ANDET datasæt for den samme node, og blev aldrig seedet. Symptomet blev
       behandlet, årsagen stod tilbage. Linjen hedder nu il-vb-001 og ligger
       hvor den hører hjemme. */
    indkoebId: "il-vb-001", sagsnummer: null },
  { id: "fa-9002", leverandoerId: "lv-daekteam", fakturanummer: "DV-88213",
    fakturadatoMs: dag(-9), forfaldMs: dag(21), status: "modtaget",
    /* ⚠ PEGEDE PÅ il-002 — DÆKTEAMS ANDEN LINJE, til 16.500 kr. Fakturaen er
       på 29.600, og de to var derfor uenige med 13.100 kr uden at nogen kunne
       se hvorfor. Jeg læste det som afstemningsmateriale; det var en forkert
       reference, fordi den RIGTIGE linje lå i den anden demofil. */
    beloebOere: 2960000, momsOere: 740000, indkoebId: "il-vb-002", sagsnummer: null },
  { id: "fa-9003", leverandoerId: "lv-daf", fakturanummer: "DAF-2026-1188",
    fakturadatoMs: dag(-1), forfaldMs: dag(29), status: "modtaget",
    beloebOere: 1215000, momsOere: 303750, indkoebId: "il-vb-003", sagsnummer: null },
  { id: "fa-9004", leverandoerId: "lv-crawford", fakturanummer: "CR-551204",
    fakturadatoMs: dag(-4), forfaldMs: dag(26), status: "modtaget",
    beloebOere: 1284000, momsOere: 321000, indkoebId: "il-005",
    /* Kom ind på en sag — se demo-sag.js og Værkstedskalenders sagsvisning. */
    sagsnummer: "FAC-2026-00127" },
  { id: "fa-9005", leverandoerId: "lv-circlek", fakturanummer: "CK-2026-77120",
    fakturadatoMs: dag(-3), forfaldMs: dag(12), status: "godkendt",
    beloebOere: 5504440, momsOere: 1376110, indkoebId: "il-003", sagsnummer: null },
  { id: "fa-9006", leverandoerId: "lv-koelecenter", fakturanummer: "KS-4412",
    fakturadatoMs: dag(-6), forfaldMs: dag(24), status: "godkendt",
    beloebOere: 870000, momsOere: 217500, indkoebId: "il-006", sagsnummer: null },
  { id: "fa-9007", leverandoerId: "lv-kontorland", fakturanummer: "KL-9982",
    fakturadatoMs: dag(-12), forfaldMs: dag(18), status: "afvist",
    beloebOere: 184500, momsOere: 46125, indkoebId: "il-010", sagsnummer: null },
  /* ⚠ DEN HER BÆRER VORES BESTILLINGSNUMMER, og det er hele grunden til at
     mailudkastet beder om det (beslutning 81): med nummeret er matchet 100 %
     og uden er det en slutning. Uden ét eksempel i sættet kan forskellen
     mellem de to ikke ses på skærmen.

     ⚠ OG BESTILLINGEN AFVENTER STADIG GODKENDELSE. Det er ikke en opdigtet
     tilstand: leverandøren sender når han har leveret, ikke når vi er blevet
     enige internt. Systemet spærrer ikke matchet — det viser bestillingens
     tilstand ved siden af, så den der godkender regningen, kan se det. */
  { id: "fa-9008", leverandoerId: "lv-schmitz", fakturanummer: "SSP-70412",
    fakturadatoMs: dag(0), forfaldMs: dag(30), status: "modtaget",
    reference: "BST-2026-00045",
    beloebOere: 3480000, momsOere: 870000, indkoebId: "il-vb-004", sagsnummer: null },

  /* ⚠ DEN ENESTE UDEN MATCH — OG DEN ER TILFØJET FORDI DEN MANGLEDE.
     Da værkstedsindkøbene kom ind i noden, fik ALLE otte fakturaer en linje
     at pege på, og `demoUdenMatch()` gav en tom liste. To prøver blev røde
     med netop den besked: "uden en faktura uden match kan tallet ikke ses
     virke". Sjette gang det mønster har været nødvendigt.

     ⚠ OG DET ER IKKE EN OPFUNDET TILSTAND. En leverandørfaktura der kommer
     ind uden at nogen har registreret købet, er hele grunden til at der
     afstemmes: enten har nogen glemt registreringen, eller også er fakturaen
     ikke vores. Begge dele skal ses, og ingen af dem må bogføres af sig selv.
     `indkoebId: null` her betyder "ikke matchet endnu" — modsat den hængende
     reference, som betyder "matchet mod noget der ikke findes". */
  { id: "fa-9009", leverandoerId: "lv-mercedes", fakturanummer: "MG-2026-3310",
    fakturadatoMs: dag(-2), forfaldMs: dag(28), status: "modtaget", kilde: "mail",
    beloebOere: 946000, momsOere: 236500, indkoebId: null, sagsnummer: null },

  /* ══════════════════════════════════════════════════════════════════
     FAKTURACENTERETS TRE ANDRE DESTINATIONER (beslutning 86)

     Uden dem kan skærmen kun vise Procure-destinationen — og hele pointen
     er at ÉN faktura kan høre til en Fleet-sag, en Facility-sag, en
     Procure-ordre eller en lagervare. Et demo-sæt hvor fire ud af fem
     arter aldrig forekommer, kan ikke vise at destinationen er fælles.
     ══════════════════════════════════════════════════════════════════ */

  /* ⚠ ET STÆRKT FLEET-MATCH: bilens kaldenavn OG nummerplade står på
     fakturaen, leverandøren er værkstedet, og datoen ligger efter arbejdet.
     Det er sådan en rigtig værkstedsfaktura ser ud — leverandøren skriver
     "Bil 78", ikke vores interne id. */
  { id: "fa-9012", leverandoerId: "lv-scania", fakturanummer: "SC-2026-8841",
    fakturadatoMs: dag(-6), forfaldMs: dag(24), status: "modtaget", kilde: "mail",
    reference: "Bil 78 / DE 78 901 — reparation",
    /* ⚠ PLACERET, ikke bare foreslået. Uden mindst én placeret faktura pr.
       art kan modulernes egne linser ikke ses virke — de ville stå tomme og
       ligne en fejl frem for et tomt udsnit. */
    destinationArt: "fleet", destinationId: "vb-001",
    matchetAf: "uid-jens", matchetMs: dag(-5),
    beloebOere: 1247500, momsOere: 311875, indkoebId: null, sagsnummer: null },

  /* ⚠ ET FACILITY-MATCH PÅ ANLÆGGETS NAVN. Crawford leverer porte, og
     porten står i fakturateksten. */
  { id: "fa-9013", leverandoerId: "lv-crawford", fakturanummer: "CR-551318",
    fakturadatoMs: dag(-1), forfaldMs: dag(29), status: "modtaget", kilde: "upload",
    reference: "Serviceeftersyn Port 3",
    destinationArt: "facility", destinationId: "fs-001",
    matchetAf: "uid-jens", matchetMs: dag(0),
    beloebOere: 1840000, momsOere: 460000, indkoebId: null, sagsnummer: null },

  /* ⚠ EN LAGERFAKTURA. Varenummeret på vores egen forbrugsvare står på
     bilaget — det er dét der gør den til en lagerdestination og ikke bare
     et indkøb. */
  { id: "fa-9014", leverandoerId: "lv-kontorland", fakturanummer: "KL-10233",
    fakturadatoMs: dag(-4), forfaldMs: dag(26), status: "modtaget", kilde: "mobil",
    reference: "AH10-12 arbejdshandsker",
    beloebOere: 19200, momsOere: 4800, indkoebId: null, sagsnummer: null },

  /* ══════════════════════════════════════════════════════════════════
     MATCHETS TRE TILSTANDE (beslutning 83, planche 1)

     Uden alle tre kan skærmen kun ses virke i det tilfælde der tilfældigvis
     står i sættet — og "manglende match" er den eneste af dem der ikke er
     en afgørelse. En liste hvor hver post mangler noget, holder man op med
     at kigge på; det er hele grunden til at de to andre findes.
     ══════════════════════════════════════════════════════════════════ */

  /* ⚠ MATCHET — og BOGFØRT, så den låste tilstand også kan ses. En bogført
     faktura kan hverken matches om eller godkendes igen: posten er sendt
     til regnskabet, og en ændring bagefter gør en afstemning der stemte,
     til en der ikke gør. Beløbet er ordrens sum ekskl. moms — de to SKAL
     være ens i den ende, ellers er afvigelsen 25 % og systematisk. */
  { id: "fa-9010", leverandoerId: "lv-mercedes", fakturanummer: "MG-2026-3298",
    fakturadatoMs: dag(-15), forfaldMs: dag(15), status: "bogfoert",
    beloebOere: 276000, momsOere: 69000, indkoebId: null, sagsnummer: null,
    kilde: "mail",
    reference: "BST-2026-00040", destinationArt: "procure", destinationId: "ord-003",
    matchetAf: "uid-jens", matchetMs: dag(-14), bogfoertMs: dag(-13) },

  /* ⚠ IKKE MATCHBAR — MED SIN GRUND. "Ingen af forslagene passer" er et
     SVAR, ikke en tom tilstand; uden flaget står fakturaen for evigt på
     listen over dem der mangler et match. Og uden grunden begynder den
     næste forfra på det samme opslag. */
  { id: "fa-9011", leverandoerId: "lv-wash", fakturanummer: "WS-2026-114",
    fakturadatoMs: dag(-8), forfaldMs: dag(22), status: "godkendt",
    beloebOere: 248000, momsOere: 62000, indkoebId: null, sagsnummer: null,
    /* ⚠ HER STOD `ikkeMatchbar: true`. Feltet er afløst af
       `destinationArt: "ingen"` (beslutning 86): "ingen destination" er ét
       svar blandt fem, ikke et flag ved siden af. To felter for ét svar
       driver — og Procure-skærmen ville læse det gamle mens Fakturacenteret
       skrev det nye. */
    kilde: "mail", destinationArt: "ingen",
    destinationGrund: "Abonnement på vaskehallen — der er ingen bestilling bag, og der kommer en hver måned." },
];

/* ---- Afstemning: TRE TOTALER, TO AFVIGELSER ---------------------------- */

/**
 * ⚠ TRE PERIODEOPGØRELSER — IKKE SUMMER AF LISTERNE OVENFOR.
 *
 * Linjerne og fakturaerne i denne fil er et UDSNIT på ti og otte poster, som
 * alle andre demo-sæt. Afstemningen dækker hele perioden, og de tre tal kommer
 * hver sit sted fra:
 *
 *   registrerede   vores egne indkøbsregistreringer
 *   modtagne       leverandørernes fakturaer
 *   bogførte       regnskabssystemets opgørelse — IKKE afledt af de to andre
 *
 * At bogført er en selvstændig kilde er hele grunden til at de tre kan være
 * uenige. Beregnede vi den af de andre, ville afstemningen altid gå op, og så
 * var der intet at afstemme.
 *
 * Tallene er mockuppens, så rekonstruktionen kan efterprøves:
 *   9.842.250 − 9.781.625 = 60.625 kr manglende fakturaer
 *   9.781.625 − 9.765.125 = 16.500 kr ikke bogført
 */
export const DEMO_AFSTEMNING = {
  registreredeIndkoebOere: 984225000,
  modtagneFakturaerOere: 978162500,
  bogfoertOere: 976512500,
};

/** Afvigelserne beregnes. Se afstem() for hvorfor de har hvert sit navn. */
export const demoAfstemning = () => afstem(DEMO_AFSTEMNING);

/* ---- Opslag ------------------------------------------------------------ */

export const demoLeverandoer = (id) => DEMO_LEVERANDOERER.find((l) => l.id === id) || null;

export const demoFakturaerFor = (leverandoerId) =>
  DEMO_FAKTURAER.filter((f) => f.leverandoerId === leverandoerId);

/** Fakturaer uden match mod et registreret indkøb. Det er dem "manglende
 *  match" tæller — BEREGNET af listen, ikke gemt. */
export const demoUdenMatch = () => DEMO_FAKTURAER.filter((f) => !f.indkoebId && f.status !== "afvist");

/* ---- Prislister. BESLUTNING 25 ---------------------------------------- */

/**
 * ⚠ PRISLISTEN LIGGER FOR SIG, IKKE PÅ LEVERANDØREN.
 *
 * Ikke af pænhed: en prisliste kan have hundredvis af rækker med flere års
 * historik, og den skal IKKE hentes med hver eneste leverandøroversigt.
 * Formen her svarer til den node den bliver — `prislister/<leverandoerId>` —
 * så skærmen bygges mod det rigtige og ikke skal laves om.
 *
 * ⚠ EN SATS OVERSKRIVES ALDRIG. Ny post med gyldigFra. BESLUTNING 7.
 * Bemærk Mercedes' motorolie: tre rækker for samme vare. Den ældste gjaldt da
 * vi købte i marts, og det er DEN en marts-faktura skal måles mod. Den nyeste
 * træder først i kraft til oktober og må gerne stå der allerede — det er hele
 * grunden til at kommendePriser() findes.
 *
 * ⚠ VARENUMMERET ER NØGLEN, IKKE VARENAVNET. En prisliste kan ikke matches på
 * fritekst: "Motorolie 5W30", "Motorolie 5w-30" og "Olie 5W30" er samme vare
 * for et menneske og tre for en maskine. Det er Bil 104 med to nummerplader,
 * denne gang på en oliedunk.
 */
export const DEMO_PRISLISTER = {
  "lv-mercedes": [
    { id: "pl-olie-1", varenummer: "OLIE-5W30", vare: "Motorolie 5W30", enhed: "l", prisOere: 4200, gyldigFra: dag(-160) },
    { id: "pl-olie-2", varenummer: "OLIE-5W30", vare: "Motorolie 5W30", enhed: "l", prisOere: 4600, gyldigFra: dag(-70) },
    /* Kommende regulering — gælder ikke endnu, men kan ses. */
    { id: "pl-olie-3", varenummer: "OLIE-5W30", vare: "Motorolie 5W30", enhed: "l", prisOere: 4900, gyldigFra: dag(53) },
    { id: "pl-time-1", varenummer: "TIME-MEK", vare: "Mekanikertime", enhed: "time", prisOere: 79500, gyldigFra: dag(-400) },
    { id: "pl-time-2", varenummer: "TIME-MEK", vare: "Mekanikertime", enhed: "time", prisOere: 84500, gyldigFra: dag(-35) },
  ],
  "lv-hydra": [
    { id: "pl-hyd-1", varenummer: "HYD-38", vare: "Hydraulikslange 3/8\"", enhed: "stk", prisOere: 1750, gyldigFra: dag(-800) },
    { id: "pl-brk-1", varenummer: "BRK-A2", vare: "Bremseklods, aksel 2", enhed: "sæt", prisOere: 78500, gyldigFra: dag(-800) },
  ],
  "lv-daekteam": [
    { id: "pl-daek-1", varenummer: "DAEK-31570", vare: "Dæk 315/70 R22.5", enhed: "stk", prisOere: 398000, gyldigFra: dag(-540) },
  ],
  "lv-circlek": [
    { id: "pl-diesel-1", varenummer: "DIESEL-B7", vare: "Diesel B7", enhed: "liter", prisOere: 1118, gyldigFra: dag(-90) },
    { id: "pl-diesel-2", varenummer: "DIESEL-B7", vare: "Diesel B7", enhed: "liter", prisOere: 1142, gyldigFra: dag(-30) },
  ],
};

/**
 * Leverandørerne, som noden ser ud: entiteten MED sin prisliste.
 *
 * ⚠ HER STOD medPrisliste(), OG SKÆRMEN SKULLE HUSKE AT KALDE DEN. Prislisten
 * lå i sin egen tabel, og den der glemte fletningen, fik en leverandør uden
 * priser — hvilket ser ud som en leverandør vi ikke har en aftale med. Det er
 * samme fejl som to demo-datasæt: to steder der beskriver den samme
 * leverandør, hvor kun det ene bliver læst.
 *
 * Nu er de ét objekt, fordi det er ét objekt i `leverandoerer/<id>`:
 * prislisten er et BARN af leverandøren, ikke en tabel ved siden af. Den
 * authored del står stadig for sig i DEMO_PRISLISTER — det er læsbarheden,
 * ikke formen.
 */
export const DEMO_LEVERANDOERER = LEVERANDOERER_BASIS.map((l) => ({
  ...l,
  prisliste: DEMO_PRISLISTER[l.id] || [],
}));

/**
 * Sager pr. leverandør, til svartiden. Kun det de seks nøgletal skal bruge —
 * den fulde sagsmodel ligger i demo-sag.js.
 *
 * ⚠ DEN SIDSTE ER UBESVARET MED VILJE. En ubesvaret sag har ingen svartid, den
 * har en alder; regnede vi den med som en meget lang svartid, ville tallet
 * blande "de svarer langsomt" med "de har ikke svaret".
 *
 * ⚠ INGEN SKÆRM LÆSER DEN LÆNGERE — OG DET ER MENINGEN. Den blev fodret ind i
 * `beregnNoegletal()` ved siden af kundens RIGTIGE indkøb og fakturaer, på en
 * skærm der rangerer leverandører. Begrundelsen — *"et tomt array ville vise
 * nul reklamationer"* — holdt ikke: `maal(0, 0)` giver `null`. Svartiden står
 * nu som *"kilden findes ikke"*, fordi `sager/` ikke er i regelfilen.
 *
 * Sættet bliver stående som **nodens form**, på samme måde som `demo-kpi.js`
 * er formen på `kpi/`: når `sager/` bygges (beslutning 20), er det de felter
 * svartiden skal bruge — `oprettetMs` og `foersteSvarMs` — og så hører det som
 * `demo:`-faldbakke i `useListe`. Se beslutning 91.
 */
export const DEMO_LEVERANDOERSAGER = [
  { id: "ls-1", leverandoerId: "lv-mercedes", oprettetMs: dag(-20), foersteSvarMs: dag(-20) + 3 * 3600000 },
  { id: "ls-2", leverandoerId: "lv-mercedes", oprettetMs: dag(-14), foersteSvarMs: dag(-14) + 5 * 3600000 },
  { id: "ls-3", leverandoerId: "lv-mercedes", oprettetMs: dag(-6), foersteSvarMs: dag(-6) + 2 * 3600000 },
  { id: "ls-4", leverandoerId: "lv-mercedes", oprettetMs: dag(-40), foersteSvarMs: null },
  { id: "ls-5", leverandoerId: "lv-crawford", oprettetMs: dag(-11), foersteSvarMs: dag(-11) + 26 * 3600000 },
  { id: "ls-6", leverandoerId: "lv-daekteam", oprettetMs: dag(-9), foersteSvarMs: dag(-9) + 1 * 3600000 },
];

/* ---- Selvkontrol -------------------------------------------------------
 *
 * ⚠ DEN STÅR NEDERST, OG DET ER IKKE KOSMETIK. Blokken læser
 * DEMO_LEVERANDOERER, som nu SAMLES af LEVERANDOERER_BASIS og
 * DEMO_PRISLISTER længere nede i filen. Står kontrollen før, kaster den
 * "Cannot access 'DEMO_LEVERANDOERER' before initialization" ved import —
 * og hele modulet fejler, ikke bare kontrollen.
 *
 * ⚠ OG npm test VAR GRØN MENS APPEN VAR HVID. Blokken kører kun under
 * `import.meta.env?.DEV`, som er undefined i node — så suiten sprang den
 * over, og fejlen viste sig først i browseren. En selvkontrol prøverne ikke
 * kan nå, er en kontrol der selv er uden kontrol. Det er en pris ved formen,
 * ikke en fejl i den her fil; men den skal stå skrevet, så den næste ikke
 * tror at grønne prøver betyder at demo-sættet er læst.
 */

selvkontrol("demo-indkoeb", () => {
  /* ⚠ VAERKSTEDSINDKOEBENES KONTROL, FLYTTET MED DATASAETTET.
     De fire il-vb-00N laa i demo-vaerksted.js som DEMO_INDKOEB, og deres
     kontrol laa dér med dem. Datasaettet er flyttet hertil; kontrollen skal
     med, ellers er den taalt vaek i samme ombaering som den blev unoedvendig
     — og det er praecis saadan en kontrol forsvinder uden at nogen ser det. */
  for (const i of DEMO_INDKOEBSLINJER.filter((x) => x.besoegId)) {
    if (!Number.isInteger(i.momsOere)) {
      console.warn(`demo-indkoeb: ${i.id} har moms der ikke er hele oere.`);
    }
    if (i.momsOere !== Math.round(i.antal * i.prisPrEnhedOere * 0.25)) {
      console.warn(
        `demo-indkoeb: ${i.id} har moms der ikke er 25 % af beloebet. ` +
        `Er de to byttet om?`
      );
    }
    if ("beloebOere" in i) {
      console.warn(
        `demo-indkoeb: ${i.id} baerer et GEMT beloeb. Reglerne forbyder det — ` +
        `det beregnes af antal x pris, og to kilder kan drive fra hinanden.`
      );
    }
  }

  const lvIder = new Set(DEMO_LEVERANDOERER.map((l) => l.id));
  const linjeIder = new Set(DEMO_INDKOEBSLINJER.map((l) => l.id));

  for (const l of DEMO_LEVERANDOERER) {
    if (!LEVERANDOER_KATEGORI[l.kategori]) {
      console.warn(`demo-indkoeb: ${l.id} har ukendt kategori "${l.kategori}".`);
    }
    if (!AFTALETYPE[l.aftale?.type]) {
      console.warn(`demo-indkoeb: ${l.id} har ukendt aftaletype "${l.aftale?.type}".`);
    }
    /* E-mailen bliver sagens startliste af parter (beslutning 20). Mangler
       den, kan en sag på leverandøren ikke tage imod svar. */
    if (!parterFraLeverandoer(l).length) {
      console.warn(
        `demo-indkoeb: ${l.id} har ingen kontaktEmail. En sag på leverandøren ville ` +
        `have en tom parter[] og sætte hvert svar i karantæne.`
      );
    }
  }

  for (const l of DEMO_INDKOEBSLINJER) {
    if (!lvIder.has(l.leverandoerId)) {
      console.warn(`demo-indkoeb: linje ${l.id} peger på ukendt leverandør "${l.leverandoerId}".`);
    }
    /* ⚠ HER STOD EN KONTROL AF `division`. Feltet er FORBUDT nu (beslutning
       70), og kontrollen er vendt om: bærer en demolinje det, ville reglen
       afvise skrivningen — og seedet fejlede præcis sådan, med
       "value argument contains undefined in property … .division". */
    if (l.division !== undefined) {
      console.warn(
        `demo-indkoeb: linje ${l.id} bærer division. Feltet er forbudt på ` +
        `indkoeb/ siden beslutning 70, og reglen afviser skrivningen.`
      );
    }
    if (!Number.isInteger(l.prisPrEnhedOere) || l.prisPrEnhedOere < 0) {
      console.warn(
        `demo-indkoeb: linje ${l.id} har prisPrEnhedOere=${l.prisPrEnhedOere}. ` +
        `Hele øre som integer — 18,50 kr er 1850, aldrig 18.5.`
      );
    }
    if (!FAKTURASTATUS[l.fakturastatus]) {
      console.warn(`demo-indkoeb: linje ${l.id} har ukendt fakturastatus "${l.fakturastatus}".`);
    }
    if ("beloebOere" in l) {
      console.warn(
        `demo-indkoeb: linje ${l.id} har et GEMT beløb. Det beregnes af antal × pris ` +
        `— to kilder kan drive fra hinanden.`
      );
    }
  }

  for (const f of DEMO_FAKTURAER) {
    if (!lvIder.has(f.leverandoerId)) {
      console.warn(`demo-indkoeb: faktura ${f.id} peger på ukendt leverandør.`);
    }
    if (!FAKTURASTATUS[f.status]) {
      console.warn(`demo-indkoeb: faktura ${f.id} har ukendt status "${f.status}".`);
    }
    if (!Number.isInteger(f.beloebOere) || !Number.isInteger(f.momsOere)) {
      console.warn(`demo-indkoeb: faktura ${f.id} har beløb der ikke er hele øre.`);
    }
    if ("totalOere" in f || "beloebInklMoms" in f) {
      console.warn(
        `demo-indkoeb: faktura ${f.id} har en gemt total. beloebOere er ekskl. moms, ` +
        `momsOere står for sig, og totalen beregnes (beslutning 2).`
      );
    }
    /* Momsen skal svare til 25 % — fanger et beløb hvor moms og beløb er
       byttet om, eller hvor nogen har gemt inkl.-tallet i beloebOere. */
    if (f.momsOere !== Math.round(f.beloebOere * 0.25)) {
      console.warn(`demo-indkoeb: faktura ${f.id} har moms der ikke er 25 % af beløbet.`);
    }
    if (f.indkoebId && !linjeIder.has(f.indkoebId) && !f.indkoebId.startsWith("ik-")) {
      console.warn(`demo-indkoeb: faktura ${f.id} matcher et indkøb der ikke findes.`);
    }
  }

  /* Uden en faktura uden match kan "manglende match" ikke ses virke. */
  if (!demoUdenMatch().length) {
    console.warn(`demo-indkoeb: ingen faktura mangler match — tallet kan ikke ses virke.`);
  }
  /* Og uden en sagsmærket faktura kan sporet til beslutning 20 ikke ses. */
  if (!DEMO_FAKTURAER.some((f) => f.sagsnummer)) {
    console.warn(`demo-indkoeb: ingen faktura bærer et sagsnummer.`);
  }

  /* Afvigelsen der stod i mockuppen. Holder rekonstruktionen ikke, er noten
     i afstem() forkert. */
  const a = demoAfstemning();
  if (a.ikkeBogfoertOere <= 0 || a.manglendeFakturaerOere <= 0) {
    console.warn(
      `demo-indkoeb: afstemningen giver ${a.manglendeFakturaerOere} og ${a.ikkeBogfoertOere}. ` +
      `Begge afvigelser skal være positive, ellers kan de to handlinger ikke vises.`
    );
  }

  /* Loft mod kpi/, som de øvrige demo-sæt. */
  const iAlt = DEMO_KPI?.indkoeb?.aabneOrdrer || 0;
  if (DEMO_INDKOEBSLINJER.length > iAlt) {
    console.warn(
      `demo-indkoeb: ${DEMO_INDKOEBSLINJER.length} linjer i demo, men kpi/ siger ${iAlt} ` +
      `åbne ordrer i alt. Et udsnit kan ikke være større end totalen.`
    );
  }
});
