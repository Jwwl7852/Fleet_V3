/* src/fleet/demo-bookinger.js
 * Demo-bookinger og deres forslag.
 *
 * Kunder fra demo-kunder.js, etaper fra demo-etaper.js, biler og folk fra
 * flåden og personalet. Der opfindes ingenting her.
 *
 * ⚠ BOOKINGENS `tilstand` ER AFLEDT AF ETAPERNE (beslutning 16).
 * Feltet står på posten, fordi RTDB skal kunne forespørge på det, men det
 * skrives af PRÆCIS én ting: den Cloud Function der skifter en etapetilstand,
 * i samme transaktion. Klienten kan altid genberegne med forloebstilstand() —
 * og selvkontrollen nedenfor GØR det, så et denormaliseret felt der er drevet
 * fra sit grundlag, siger til.
 *
 * `delvist` er den værdi der findes fordi et halvfærdigt forløb hverken må
 * læses som færdigt eller være usynligt. bk-2026-00317 har en udført nr. 1 og
 * en åben nr. 2 og er derfor delvist.
 *
 * ⚠ FORSLAGENE ER FLYTTET — BESLUTNING 40.
 *
 * Hovedet her sagde selv at de HØRTE på etapen, og at de skulle flytte "den
 * dag Forslag-skærmen skal håndtere et flerbenet forløb". Imens lå de begge
 * steder: her med tid, pris og transittid, på etapen med enheder og chauffør.
 * For et forløb med én etape var det det samme løfte skrevet to steder — det
 * mønster der har kostet mest i dette repo, og som `test/demo-kilder.test.mjs`
 * findes for at fange.
 *
 * Det man disponerer, er en etape (beslutning 16). Forslaget ligger nu dér
 * med ALLE sine felter, og bookingen har ingen. Se `et-004` i demo-etaper.js.
 */
import { DEMO_KUNDER } from "./demo-kunder.js";
import { DEMO_ETAPER } from "./demo-etaper.js";
import {
  forloebstilstand, TILSTAND, TRANSPORTTYPE, RUTEPRAEFERENCE, FLEKSIBILITET,
} from "./booking-state.js";

const DAG = 86400000;
const T = 3600000;

const iDag = new Date();
iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();
const dag = (n, time = 0) => D0 + n * DAG + time * T;

/* ---- Transporttyper ---------------------------------------------------- */

/* Vokabular ét sted. Skriver hver formular sine egne, hedder det "Stykgods"
   på den ene skærm og "Stykgods/parti" på den næste — og så kan de ikke
   tælles sammen. */
/* ⚠ TRANSPORTTYPE, RUTEPRAEFERENCE OG FLEKSIBILITET STOD HER — OG DE ER
   FLYTTET TIL `booking-state.js`.

   De er KATALOGER, ikke demodata: skærmene tegner deres vælgere af dem, og
   `valideBooking()` prøver imod dem. Præcis samme sted som `ARBEJDSTYPE` lå,
   før den flyttede til `opgaver.js` — et modul kunne ikke nå dem uden at
   importere et demosæt, og den der ikke ville det, ville lave sin egen kopi.

   ⚠ OG SERVEREN KUNNE SLET IKKE NÅ DEM. `functions/` deployer kun sin egen
   mappe, og et demosæt hører ikke i `delt/`. Så længe kataloget lå her, kunne
   `bookingopret` ikke prøve en transporttype mod den liste skærmen tegnede.

   Der er med vilje ingen re-eksport herfra: to importstier til ét katalog er
   to steder at være uenige om hvor det bor. */

/* ---- Bookinger --------------------------------------------------------- */

export const DEMO_BOOKINGER = [
  {
    id: "bk-2026-00311", nummer: "BKG-2026-00311", kundeId: "nordiskFragt",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Hamburg",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    /* ⚠ ET uid, IKKE ET NAVN. Her stod "Mette Kjær" på alle otte poster —
       mens demo-indberetninger.js skriver "uid-lars". `oprettetAf` er hvem
       der GJORDE noget, og det er et uid (CLAUDE.md). `bookingopret` skriver
       auth.uid, så et navn her ville betyde at demosættet og noden bar to
       forskellige slags værdi i samme felt — og Forslag-skærmen ville vise et
       pænt navn i demo og et råt uid i drift. */
    oprettetMs: dag(-6), oprettetAf: "uid-mette",
    omsaetningOere: 1845000,
    onsketAfhentningMs: dag(0, 5), afhentningFleks: "timer2",
    onsketLeveringMs: dag(0, 16), leveringFleks: "halvdag",
    krav: ["Bagsmæklift", "Palleløfter"], kundekrav: "Ring 30 min. før ankomst",
  },
  {
    id: "bk-2026-00312", nummer: "BKG-2026-00312", kundeId: "koldingKommune",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Berlin",
    transporttype: "delparti", rutepraeference: "billigst",
    oprettetMs: dag(-5), oprettetAf: "uid-mette",
    omsaetningOere: 2260000,
    onsketAfhentningMs: dag(1, 4), afhentningFleks: "halvdag",
    onsketLeveringMs: dag(1, 19), leveringFleks: "dag1",
    krav: [], kundekrav: "Leveringsadresse har smal indkørsel",
  },
  {
    id: "bk-2026-00313", nummer: "BKG-2026-00313", kundeId: "nordiskFragt",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Amsterdam",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: dag(-4), oprettetAf: "uid-soeren",
    omsaetningOere: 3120000,
    onsketAfhentningMs: dag(2, 3), afhentningFleks: "timer2",
    onsketLeveringMs: dag(3, 14), leveringFleks: "halvdag",
    krav: ["Tolddokumenter"], kundekrav: "",
  },
  {
    /* ⚠ DEN VIGTIGE. afventerKoord med tre forslag — det er her beslutning 5
       bliver synlig: disponenten har lavet forslagene og må ikke godkende dem.
       Se Forslag-skærmen. */
    id: "bk-2026-00314", nummer: "BKG-2026-00314", kundeId: "fynKoel",
    tilstand: "afventerKoord", division: "gods",
    fraSted: "København", tilSted: "Paris",
    transporttype: "temperatur", rutepraeference: "hurtigst",
    oprettetMs: dag(-3), oprettetAf: "uid-mette",
    omsaetningOere: 4180000,
    onsketAfhentningMs: dag(3, 2), afhentningFleks: "fast",
    onsketLeveringMs: dag(4, 18), leveringFleks: "timer2",
    krav: ["Køl 2–6 °C", "Temperaturlog"], kundekrav: "Fransk kvittering påkrævet",
    /* ⚠ INGEN forslag HER — BESLUTNING 40. De lå både her og på etapen,
       med hver sine felter: her tid og pris, dér enheder og chauffør. For et
       forløb med én etape var det det samme løfte skrevet to steder. Det man
       disponerer, er en etape (beslutning 16), så forslaget hører dér — med
       alle sine felter. Se et-004 i demo-etaper.js. */
  },
  {
    id: "bk-2026-00315", nummer: "BKG-2026-00315", kundeId: "koldingKommune",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "München",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: dag(-2), oprettetAf: "uid-soeren",
    omsaetningOere: 3480000,
    onsketAfhentningMs: dag(4, 4), afhentningFleks: "timer2",
    onsketLeveringMs: dag(5, 17), leveringFleks: "halvdag",
    krav: [], kundekrav: "",
  },
  {
    id: "bk-2026-00316", nummer: "BKG-2026-00316", kundeId: "aalborgIndustri",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Aalborg",
    transporttype: "delparti", rutepraeference: "billigst",
    oprettetMs: dag(-2), oprettetAf: "uid-mette",
    omsaetningOere: 780000,
    onsketAfhentningMs: dag(1, 6), afhentningFleks: "dag1",
    onsketLeveringMs: dag(1, 15), leveringFleks: "dag1",
    krav: [], kundekrav: "",
  },
  {
    /* DELVIST: nr. 1 er udført, nr. 2 venter stadig på en tur.
       Tilstanden herunder er AFLEDT — selvkontrollen efterprøver den. */
    id: "bk-2026-00317", nummer: "BKG-2026-00317", kundeId: "nordiskFragt",
    /* Kundens eget rekvisitionsnummer. Det står på transportlabelen, fordi
       modtageren søger på DET og ikke på vores bookingnummer. */
    kundeRef: "REF-88421",
    tilstand: "delvist", division: "gods",
    fraSted: "København", tilSted: "Hamburg t/r",
    transporttype: "kombi", rutepraeference: "billigst",
    oprettetMs: dag(-8), oprettetAf: "uid-soeren",
    omsaetningOere: 2940000,
    onsketAfhentningMs: dag(-3, 5), afhentningFleks: "halvdag",
    onsketLeveringMs: dag(9, 12), leveringFleks: "dag1",
    krav: ["Returlast"], kundekrav: "Returgods afhentes samme uge",
  },
  {
    /* En forespørgsel der endnu ikke er sendt til planlægning. Uden den kan
       Ny forespørgsel ikke vise hvad byggSkifte() ville skrive. */
    id: "bk-2026-00318", nummer: "BKG-2026-00318", kundeId: "koldingStaal",
    tilstand: "kladde", division: "gods",
    fraSted: "Odense", tilSted: "Rotterdam",
    transporttype: "farligtGods", rutepraeference: "undgaaFaerge",
    oprettetMs: dag(0, 9), oprettetAf: "uid-mette",
    omsaetningOere: 3960000,
    onsketAfhentningMs: dag(6, 6), afhentningFleks: "timer2",
    onsketLeveringMs: dag(7, 16), leveringFleks: "halvdag",
    krav: ["ADR-klasse 3", "Følgeseddel på engelsk"],
    kundekrav: "Chauffør skal have gyldigt ADR-bevis",
  },
];

/* ---- Opslag ------------------------------------------------------------ */

export const demoBooking = (id) => DEMO_BOOKINGER.find((b) => b.id === id) || null;

export const demoEtaperPaa = (bookingId) =>
  DEMO_ETAPER.filter((e) => e.bookingId === bookingId).sort((a, b) => a.nr - b.nr);

/** Tilstanden GENBEREGNET af etaperne. Skærmen bruger den frem for det
 *  lagrede felt, så et drevet felt bliver synligt frem for at blive troet. */
export const beregnetTilstand = (booking) =>
  forloebstilstand(demoEtaperPaa(booking.id));

/* ---- Selvkontrol ------------------------------------------------------- */

if (import.meta.env?.DEV) {
  const kundeIder = new Set(DEMO_KUNDER.map((k) => k.id));
  /* ⚠ HER STOD OGSÅ `bilIder` og `folkIder`, og de blev aldrig brugt.
     De er levn fra dengang køretøjs- og personkontrollen lå her. Den flyttede
     til demo-etaper.js sammen med data (beslutning 40) — se noten om
     forslagene nedenfor — men sættene blev stående og lignede en kontrol der
     fandtes. Fundet af no-unused-vars. */

  for (const b of DEMO_BOOKINGER) {
    if (!kundeIder.has(b.kundeId)) {
      console.warn(`demo-bookinger: ${b.nummer} peger på ukendt kunde "${b.kundeId}".`);
    }
    if (!TILSTAND[b.tilstand]) {
      console.warn(`demo-bookinger: ${b.nummer} har ukendt tilstand "${b.tilstand}".`);
    }
    if (!TRANSPORTTYPE[b.transporttype]) {
      console.warn(`demo-bookinger: ${b.nummer} har ukendt transporttype "${b.transporttype}".`);
    }
    if (!RUTEPRAEFERENCE[b.rutepraeference]) {
      console.warn(`demo-bookinger: ${b.nummer} har ukendt rutepræference "${b.rutepraeference}".`);
    }
    /* ⚠ FLEKSIBILITETEN BLEV ALDRIG KONTROLLERET. Selvkontrollen prøvede
       tilstand, transporttype og rutepræference — men ikke de to felter
       matchningen står og falder med. `valideBooking()` kræver dem nu, og et
       demosæt der ikke ville kunne oprettes gennem skærmen, er et sæt der
       viser noget systemet ikke kan lave. */
    for (const felt of ["afhentningFleks", "leveringFleks"]) {
      if (!FLEKSIBILITET[b[felt]]) {
        console.warn(`demo-bookinger: ${b.nummer} har ukendt ${felt} "${b[felt]}".`);
      }
    }
    if (!b.division) {
      console.warn(`demo-bookinger: ${b.nummer} mangler division.`);
    }

    /* ⚠ DET DENORMALISEREDE FELT MOD SIT GRUNDLAG.
       Bookingens tilstand er afledt af etaperne. Er de to uenige, er feltet
       drevet — og det er præcis den fejltilstand beslutning 16 advarer om:
       den ser ud som om den lykkedes. En kladde har endnu ingen etaper og
       undtages. */
    const etaper = demoEtaperPaa(b.id);
    if (etaper.length) {
      const afledt = forloebstilstand(etaper).tilstand;
      if (afledt !== b.tilstand) {
        console.warn(
          `demo-bookinger: ${b.nummer} står som "${b.tilstand}", men etaperne giver ` +
          `"${afledt}". Det denormaliserede felt er drevet fra sit grundlag.`
        );
      }
    } else if (b.tilstand !== "kladde") {
      console.warn(
        `demo-bookinger: ${b.nummer} er "${b.tilstand}" uden en eneste etape. ` +
        `Det man disponerer, er en etape (beslutning 16).`
      );
    }

    /* ⚠ FORSLAGENE KONTROLLERES I demo-etaper.js. De ligger på etapen efter
       beslutning 40, og kontrollen fulgte med — den skal stå dér hvor data
       står, ellers går de to fra hinanden næste gang nogen retter det ene. */

    /* ⚠ EN BOOKING DER AFVENTER KOORDINATOR, SKAL HAVE EN ETAPE MED FORSLAG.
       Uden det led kan Forslag-skærmen ikke vise beslutning 5 — og tabellen
       ville være tom uden at nogen kunne se hvorfor. */
    if (b.tilstand === "afventerKoord") {
      const medForslag = DEMO_ETAPER.filter(
        (e) => e.bookingId === b.id && (e.forslag?.length || 0) > 0);
      if (!medForslag.length) {
        console.warn(
          `demo-bookinger: ${b.nummer} afventer koordinator, men ingen af dens ` +
          `etaper har et forslag.`);
      }
    }
  }

  /* Uden et delvist forløb kan beslutning 16's vigtigste værdi ikke ses. */
  if (!DEMO_BOOKINGER.some((b) => beregnetTilstand(b).tilstand === "delvist")) {
    console.warn(
      `demo-bookinger: intet forløb er "delvist". Så kan man ikke se at et halvfærdigt ` +
      `forløb hverken læses som færdigt eller er usynligt.`
    );
  }

  /* Og uden en booking i afventerKoord kan Forslag-skærmen ikke vise
     beslutning 5 — disponenten der ikke må godkende sit eget forslag. */
  if (!DEMO_BOOKINGER.some((b) => b.tilstand === "afventerKoord" && b.forslag?.length)) {
    console.warn(
      `demo-bookinger: ingen booking afventer koordinator med forslag. Forslag-skærmen ` +
      `kan ikke vise beslutning 5.`
    );
  }

  /* Hver etape skal høre til en booking der findes. */
  const bookingIder = new Set(DEMO_BOOKINGER.map((b) => b.id));
  for (const e of DEMO_ETAPER) {
    if (!bookingIder.has(e.bookingId)) {
      console.warn(`demo-bookinger: etape ${e.id} peger på ukendt booking "${e.bookingId}".`);
    }
  }
}
