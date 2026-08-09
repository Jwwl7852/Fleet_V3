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
 * ⚠ FORSLAG HØRER PÅ ETAPEN i modellen — her ligger de på bookingen, fordi
 * demo-forløbene har én etape hver på nær ét, og skærmen viser forslag pr.
 * booking. Den dag Forslag-skærmen skal håndtere et flerbenet forløb, flytter
 * de med. Formen er `forslag[]` + `valgtForslagId`, som på etapen.
 */
import { DEMO_KUNDER } from "./demo-kunder.js";
import { DEMO_ETAPER } from "./demo-etaper.js";
import { DEMO_KOERETOEJER } from "./demo-flaade.js";
import { DEMO_PERSONALE } from "./demo-personale.js";
import { forloebstilstand, TILSTAND } from "./booking-state.js";

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
export const TRANSPORTTYPE = {
  fuldlast: "Fuldlast (FTL)",
  delparti: "Delparti (LTL)",
  temperatur: "Temperaturreguleret",
  farligtGods: "Farligt gods (ADR)",
  kombi: "Kombineret transport",
};

export const RUTEPRAEFERENCE = {
  hurtigst: "Hurtigste rute",
  billigst: "Billigste rute",
  undgaaFaerge: "Undgå færger",
  kunMotorvej: "Kun motorvej",
};

/** Hvor meget afhentning og levering må rykke sig. Uden fleksibilitet kan
 *  matchningen ikke lægge to forsendelser sammen. */
export const FLEKSIBILITET = {
  fast: "Fast tidspunkt",
  timer2: "± 2 timer",
  halvdag: "± en halv dag",
  dag1: "± en dag",
};

/* ---- Bookinger --------------------------------------------------------- */

export const DEMO_BOOKINGER = [
  {
    id: "bk-2026-00311", nummer: "BKG-2026-00311", kundeId: "nordiskFragt",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Hamburg",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: dag(-6), oprettetAf: "Mette Kjær",
    omsaetningOere: 1845000,
    onsketAfhentningMs: dag(0, 5), afhentningFleks: "timer2",
    onsketLeveringMs: dag(0, 16), leveringFleks: "halvdag",
    krav: ["Bagsmæklift", "Palleløfter"], kundekrav: "Ring 30 min. før ankomst",
    forslag: [], valgtForslagId: null,
  },
  {
    id: "bk-2026-00312", nummer: "BKG-2026-00312", kundeId: "koldingKommune",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Berlin",
    transporttype: "delparti", rutepraeference: "billigst",
    oprettetMs: dag(-5), oprettetAf: "Mette Kjær",
    omsaetningOere: 2260000,
    onsketAfhentningMs: dag(1, 4), afhentningFleks: "halvdag",
    onsketLeveringMs: dag(1, 19), leveringFleks: "dag1",
    krav: [], kundekrav: "Leveringsadresse har smal indkørsel",
    forslag: [], valgtForslagId: null,
  },
  {
    id: "bk-2026-00313", nummer: "BKG-2026-00313", kundeId: "nordiskFragt",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Amsterdam",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: dag(-4), oprettetAf: "Søren Dahl",
    omsaetningOere: 3120000,
    onsketAfhentningMs: dag(2, 3), afhentningFleks: "timer2",
    onsketLeveringMs: dag(3, 14), leveringFleks: "halvdag",
    krav: ["Tolddokumenter"], kundekrav: "",
    forslag: [], valgtForslagId: null,
  },
  {
    /* ⚠ DEN VIGTIGE. afventerKoord med tre forslag — det er her beslutning 5
       bliver synlig: disponenten har lavet forslagene og må ikke godkende dem.
       Se Forslag-skærmen. */
    id: "bk-2026-00314", nummer: "BKG-2026-00314", kundeId: "fynKoel",
    tilstand: "afventerKoord", division: "gods",
    fraSted: "København", tilSted: "Paris",
    transporttype: "temperatur", rutepraeference: "hurtigst",
    oprettetMs: dag(-3), oprettetAf: "Mette Kjær",
    omsaetningOere: 4180000,
    onsketAfhentningMs: dag(3, 2), afhentningFleks: "fast",
    onsketLeveringMs: dag(4, 18), leveringFleks: "timer2",
    krav: ["Køl 2–6 °C", "Temperaturlog"], kundekrav: "Fransk kvittering påkrævet",
    forslag: [
      { id: "fs-a", nr: 1, koeretoejId: "kt-104", personId: "anneKrogh",
        afhentningMs: dag(3, 2), leveringMs: dag(4, 18), transitTimer: 40,
        estimatOere: 3640000,
        note: "Direkte kørsel med skift i Padborg. Køleaggregat efterset i sidste uge." },
      { id: "fs-b", nr: 2, koeretoejId: "kt-155", personId: "henrikVestergaard",
        afhentningMs: dag(3, 6), leveringMs: dag(5, 8), transitTimer: 50,
        estimatOere: 3280000,
        note: "Billigere, men leverer en halv dag senere end ønsket." },
      { id: "fs-c", nr: 3, koeretoejId: "kt-034", personId: "jesperRiis",
        afhentningMs: dag(3, 2), leveringMs: dag(4, 14), transitTimer: 36,
        estimatOere: 4020000,
        note: "Hurtigst. Kræver to chauffører på strækningen syd for Hamburg." },
    ],
    valgtForslagId: null,
  },
  {
    id: "bk-2026-00315", nummer: "BKG-2026-00315", kundeId: "koldingKommune",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "München",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: dag(-2), oprettetAf: "Søren Dahl",
    omsaetningOere: 3480000,
    onsketAfhentningMs: dag(4, 4), afhentningFleks: "timer2",
    onsketLeveringMs: dag(5, 17), leveringFleks: "halvdag",
    krav: [], kundekrav: "",
    forslag: [], valgtForslagId: null,
  },
  {
    id: "bk-2026-00316", nummer: "BKG-2026-00316", kundeId: "aalborgIndustri",
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Aalborg",
    transporttype: "delparti", rutepraeference: "billigst",
    oprettetMs: dag(-2), oprettetAf: "Mette Kjær",
    omsaetningOere: 780000,
    onsketAfhentningMs: dag(1, 6), afhentningFleks: "dag1",
    onsketLeveringMs: dag(1, 15), leveringFleks: "dag1",
    krav: [], kundekrav: "",
    forslag: [], valgtForslagId: null,
  },
  {
    /* DELVIST: nr. 1 er udført, nr. 2 venter stadig på en tur.
       Tilstanden herunder er AFLEDT — selvkontrollen efterprøver den. */
    id: "bk-2026-00317", nummer: "BKG-2026-00317", kundeId: "nordiskFragt",
    tilstand: "delvist", division: "gods",
    fraSted: "København", tilSted: "Hamburg t/r",
    transporttype: "kombi", rutepraeference: "billigst",
    oprettetMs: dag(-8), oprettetAf: "Søren Dahl",
    omsaetningOere: 2940000,
    onsketAfhentningMs: dag(-3, 5), afhentningFleks: "halvdag",
    onsketLeveringMs: dag(9, 12), leveringFleks: "dag1",
    krav: ["Returlast"], kundekrav: "Returgods afhentes samme uge",
    forslag: [], valgtForslagId: null,
  },
  {
    /* En forespørgsel der endnu ikke er sendt til planlægning. Uden den kan
       Ny forespørgsel ikke vise hvad byggSkifte() ville skrive. */
    id: "bk-2026-00318", nummer: "BKG-2026-00318", kundeId: "koldingStaal",
    tilstand: "kladde", division: "gods",
    fraSted: "Odense", tilSted: "Rotterdam",
    transporttype: "farligtGods", rutepraeference: "undgaaFaerge",
    oprettetMs: dag(0, 9), oprettetAf: "Mette Kjær",
    omsaetningOere: 3960000,
    onsketAfhentningMs: dag(6, 6), afhentningFleks: "timer2",
    onsketLeveringMs: dag(7, 16), leveringFleks: "halvdag",
    krav: ["ADR-klasse 3", "Følgeseddel på engelsk"],
    kundekrav: "Chauffør skal have gyldigt ADR-bevis",
    forslag: [], valgtForslagId: null,
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
  const bilIder = new Set(DEMO_KOERETOEJER.map((b) => b.id));
  const folkIder = new Set(DEMO_PERSONALE.map((p) => p.id));

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

    /* Forslag: 1-3, og de skal pege på biler og folk der findes. */
    if (b.tilstand === "afventerKoord" && !(b.forslag?.length >= 1)) {
      console.warn(`demo-bookinger: ${b.nummer} afventer koordinator uden et eneste forslag.`);
    }
    if (b.forslag?.length > 3) {
      console.warn(`demo-bookinger: ${b.nummer} har ${b.forslag.length} forslag. Mockuppen viser 1-3.`);
    }
    for (const f of b.forslag || []) {
      if (!bilIder.has(f.koeretoejId)) {
        console.warn(`demo-bookinger: forslag ${f.id} på ${b.nummer} peger på ukendt bil.`);
      }
      if (!folkIder.has(f.personId)) {
        console.warn(`demo-bookinger: forslag ${f.id} på ${b.nummer} peger på ukendt person.`);
      }
      if (!(f.leveringMs > f.afhentningMs)) {
        console.warn(`demo-bookinger: forslag ${f.id} leverer før det henter.`);
      }
    }

    /* valgtForslagId skal pege på et forslag der findes — ellers ville
       kanSkifte() godkende noget der ikke er der. */
    if (b.valgtForslagId && !(b.forslag || []).some((f) => f.id === b.valgtForslagId)) {
      console.warn(`demo-bookinger: ${b.nummer} har valgtForslagId der ikke findes blandt forslagene.`);
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
