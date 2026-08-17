/* src/fleet/demo-etaper.js
 * Demo-etaper: ugesvisningens internationale ture.
 *
 * Biler fra demo-flaade.js, chauffører fra demo-personale.js — der opfindes
 * hverken køretøjer eller navne her.
 *
 * FORMEN ER NODENS: posterne ser ud som tenants/<t>/etaper/<etapeId> i
 * ARKITEKTUR, med transportfelterne fra beslutning 21.
 *
 * ⚠ EN ETAPE ER IKKE EN OPGAVE. Beslutning 21: `langtur` er ikke en art på
 * opgaver, fordi hvert felt en langtur har brug for allerede står her.
 * Dagsvisningen i Disponering læser `opgaver` med art `vaerksted`;
 * ugesvisningen læser denne node. To noder, to statsmaskinerier.
 *
 * ⚠ RUTERNE ER GEOGRAFISK KONSISTENTE, og det er ikke pedanteri.
 * København → Hamburg går ENTEN over Storebælt + Jylland + Padborg ELLER over
 * Femern (Rødby–Puttgarden). Ikke begge. Prismotoren lægger passagerne sammen
 * uden at brokke sig, så en umulig kombination bliver til en pris ingen kan
 * forklare — og en vognmand med Hamburg-kørsel ser fejlen på tre sekunder.
 * Selvkontrollen nedenfor fastholder at de to udelukker hinanden.
 */
import { DEMO_KOERETOEJER } from "./demo-flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "./demo-personale.js";
import {
  GRAENSEOVERGANG, tjekGeografi, krydserGraense, enhedsIder, koerselMinPaakraevet,
} from "./etaper.js";
import { GRAENSE } from "./koerehviletid.js";
import { kanDisponeres, kanBaere } from "./flaade.js";

const DAG = 86400000;
const T = 3600000;

const iDag = new Date();
iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();

/** Midnat n dage fra i dag plus timer. til er EKSKLUSIV, som alt andet. */
const dag = (n, time = 0) => D0 + n * DAG + time * T;

/* Passager der ikke kan optræde sammen. Femern ER alternativet til Storebælt
   på en tur mod syd — man kører den ene vej eller den anden.
   ⚠ Listen dækker kun det denne fil bruger. Det generelle spørgsmål — om
   ruteopslaget skal validere geografien, eller om der skal være et katalog
   over gensidigt udelukkende passager — er åbent og hører sammen med
   HERE-integrationen. Se ARKITEKTUR. */
export const UDELUKKER_HINANDEN = [["bro:storebaelt", "faerge:femern"]];

/* ---- Etaper ------------------------------------------------------------ */

/**
 * `tilstand` er etapens eget maskineri (booking-state.js), ikke opgavens
 * status. `aaben` betyder at etapen venter på en passende tur og bærer en
 * frist i `senestMs`.
 */
export const DEMO_ETAPER = [
  {
    id: "et-001", bookingId: "bk-2026-00311", nr: 1,
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Hamburg",
    fra: dag(0, 5), til: dag(0, 16),
    etaMs: dag(0, 15) + 30 * 60000,
    /* Femern-ruten: Rødby–Puttgarden. IKKE Storebælt — se noten i toppen. */
    graenseovergange: ["roedby"],
    kunDanmark: false,
    passager: { "faerge:femern": 1, "vejafgift:miljoezoner": 1 },
    koeretoejIder: { "kt-012": true, "kt-tr41": true }, personId: "larsAage",
    koerselMin: 540,
    maengde: { m3: 62, kg: 14200 },
    forslag: [], valgtForslagId: null, senestMs: null,
  },
  {
    id: "et-002", bookingId: "bk-2026-00312", nr: 1,
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Berlin",
    fra: dag(1, 4), til: dag(1, 19),
    etaMs: dag(1, 18),
    graenseovergange: ["roedby"],
    kunDanmark: false,
    passager: { "faerge:femern": 1, "vejafgift:miljoezoner": 1, "parkering:europa": 1 },
    koeretoejIder: { "kt-078": true }, personId: "reneThomsen",
    koerselMin: 500,
    maengde: { m3: 58, kg: 11800 },
    forslag: [], valgtForslagId: null, senestMs: null,
  },
  {
    /* Løber over en døgngrænse — ugesvisningens egentlige formål. */
    id: "et-003", bookingId: "bk-2026-00313", nr: 1,
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Amsterdam",
    fra: dag(2, 3), til: dag(3, 14),
    etaMs: dag(3, 13),
    graenseovergange: ["padborg"],
    kunDanmark: false,
    passager: { "bro:storebaelt": 1, "vejafgift:miljoezoner": 1, "parkering:europa": 1 },
    koeretoejIder: { "kt-034": true }, personId: "jesperRiis",
    koerselMin: 520,
    maengde: { m3: 71, kg: 16400 },
    forslag: [], valgtForslagId: null, senestMs: null,
  },
  {
    id: "et-004", bookingId: "bk-2026-00314", nr: 1,
    tilstand: "afventerKoord", division: "gods",
    fraSted: "København", tilSted: "Paris",
    fra: dag(3, 2), til: dag(4, 18),
    etaMs: dag(4, 17),
    graenseovergange: ["padborg"],
    kunDanmark: false,
    passager: { "bro:storebaelt": 1, "vejafgift:miljoezoner": 1, "parkering:europa": 2 },
    koeretoejIder: { "kt-012": true, "kt-tr41": true }, personId: "anneKrogh",
    koerselMin: 530,
    maengde: { m3: 66, kg: 15100 },
    /* ⚠ EN SÆTTEVOGN, IKKE EN SOLOBIL. Turen er 66 m³ og 15,1 t; kt-104
       kan 48 m³ og 12 t. Forslaget stod med den alene, indtil etapeskift
       begyndte at HÅNDHÆVE kanBaere() — serveren afviste demo-sættets eget
       forslag med "Mangler 18 m³ og 3.100 kg". Selvkontrollen nedenfor
       fanger det nu. */
    forslag: [{ id: "f-1", koeretoejIder: { "kt-012": true, "kt-tr41": true }, personId: "anneKrogh" }],
    valgtForslagId: "f-1", senestMs: null,
  },
  {
    id: "et-005", bookingId: "bk-2026-00315", nr: 1,
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "München",
    fra: dag(4, 4), til: dag(5, 17),
    etaMs: dag(5, 16),
    graenseovergange: ["padborg"],
    kunDanmark: false,
    passager: { "bro:storebaelt": 1, "vejafgift:miljoezoner": 1, "parkering:europa": 1 },
    koeretoejIder: { "kt-155": true }, personId: "henrikVestergaard",
    koerselMin: 525,
    maengde: { m3: 69, kg: 15800 },
    forslag: [], valgtForslagId: null, senestMs: null,
  },
  {
    /* ⚠ DET FEMTE HJUL, OG DET ER MED VILJE.
       Uden en indenlandsk tur er `kunDanmark` et felt ingen kan se virke — og
       selvkontrollen kan ikke fastholde modsigelsen mellem flaget og en
       grænseovergang, fordi der aldrig er et tilfælde hvor flaget er sandt. */
    id: "et-006", bookingId: "bk-2026-00316", nr: 1,
    tilstand: "reserveret", division: "gods",
    fraSted: "København", tilSted: "Aalborg",
    fra: dag(1, 6), til: dag(1, 15),
    etaMs: dag(1, 14),
    graenseovergange: [],
    kunDanmark: true,
    passager: { "bro:storebaelt": 1 },
    koeretoejIder: { "kt-106": true }, personId: "dorteEnevoldsen",
    koerselMin: 480,
    maengde: { m3: 44, kg: 9200 },
    forslag: [], valgtForslagId: null, senestMs: null,
  },
  {
    /* ⚠ NR. 1 AF ET FORLØB MED TO ETAPER, OG DEN ER UDFØRT.
       Uden den ville forloebstilstand() aldrig give `delvist` på demo-data,
       og beslutning 16's vigtigste værdi kunne ikke ses: et forløb hvor noget
       er i hus og noget ikke er, må hverken læses som færdigt eller være
       usynligt. Sammen med den åbne nr. 2 nedenfor giver bk-2026-00317
       netop `delvist`. */
    id: "et-008", bookingId: "bk-2026-00317", nr: 1,
    tilstand: "udfoert", division: "gods",
    fraSted: "København", tilSted: "Hamburg",
    fra: dag(-3, 5), til: dag(-3, 17),
    etaMs: dag(-3, 16),
    graenseovergange: ["roedby"],
    kunDanmark: false,
    passager: { "faerge:femern": 1 },
    koeretoejIder: { "kt-012": true }, personId: "larsAage",
    koerselMin: 500,
    maengde: { m3: 38, kg: 8100 },
    forslag: [], valgtForslagId: null, senestMs: null,
  },
  {
    /* Åben etape: venter på en passende tur, og bærer en frist. Uden
       senestMs fyldes lageret med gods ingen henter (beslutning 16). */
    id: "et-007", bookingId: "bk-2026-00317", nr: 2,
    tilstand: "aaben", division: "gods",
    fraSted: "Hamburg", tilSted: "København",
    fra: dag(5, 6), til: dag(5, 18),
    etaMs: null,
    graenseovergange: ["roedby"],
    kunDanmark: false,
    passager: { "faerge:femern": 1 },
    koeretoejIder: null, personId: null,
    koerselMin: 420,
    maengde: { m3: 38, kg: 8100 },
    forslag: [], valgtForslagId: null, senestMs: dag(9, 12),
  },
];

/* ---- Statushændelser: chaufførens meldinger ---------------------------- */

/**
 * BESLUTNING 22 — Rute & status har INGEN GPS.
 *
 * Det her er hvad chaufføren MELDER, ikke hvad en boks måler. En melding kan
 * være forsinket, forkert eller mangle, og skærmen skal kunne sige "vi har
 * ikke hørt noget siden kl. 11.40" frem for at gætte en position.
 *
 * `stopId` binder meldingen til et planlagt stop fra planlagteStop() i
 * rutestatus.js, så "næste stop" kan udledes frem for at blive gemt.
 */
export const DEMO_STATUSHAENDELSER = {
  /* Kbh → Hamburg i dag. Undervejs, meldt til og med grænsen. */
  "et-001": [
    { ms: dag(0, 5), type: "afgang", stopId: "start", sted: "København", note: "Læsset i går aften" },
    { ms: dag(0, 8) + 20 * 60000, type: "pause", sted: "Rastplatz Fehmarn" },
    { ms: dag(0, 9) + 40 * 60000, type: "graense", stopId: "graense-roedby", sted: "Rødby–Puttgarden" },
  ],
  /* Kbh → Berlin i morgen. Endnu ingen meldinger — turen er ikke begyndt. */
  "et-002": [],
  /* Kbh → Amsterdam. Meldt forsinket ved grænsen. */
  "et-003": [
    { ms: dag(2, 3), type: "afgang", stopId: "start", sted: "København" },
    { ms: dag(2, 7), type: "graense", stopId: "graense-padborg", sted: "Padborg" },
    { ms: dag(2, 7) + 15 * 60000, type: "forsinkelse", sted: "Padborg",
      forsinketMin: 75, note: "Kø ved grænsen, tolddokumenter kontrolleret" },
  ],
  /* Afsluttet tur. Meldt hele vejen igennem — det er den der viser hvordan en
     fuld tidslinje ser ud. */
  "et-008": [
    { ms: dag(-3, 5), type: "afgang", stopId: "start", sted: "København" },
    { ms: dag(-3, 9), type: "graense", stopId: "graense-roedby", sted: "Rødby–Puttgarden" },
    { ms: dag(-3, 12), type: "pause", sted: "Rastplatz Neustadt" },
    { ms: dag(-3, 15), type: "ankomstLosning", sted: "Hamburg" },
    { ms: dag(-3, 16) + 40 * 60000, type: "afsluttet", stopId: "slut", sted: "Hamburg",
      note: "Aflæsset, kvittering modtaget" },
  ],
};

export const demoHaendelser = (etapeId) => DEMO_STATUSHAENDELSER[etapeId] || [];

/* ---- Opslag ----------------------------------------------------------- */

export const demoEtaperFor = (koeretoejId) =>
  DEMO_ETAPER.filter((e) => enhedsIder(e).includes(koeretoejId));

export const demoAabneEtaper = () => DEMO_ETAPER.filter((e) => e.tilstand === "aaben");

export const demoEtaperIVindue = (fra, til) =>
  DEMO_ETAPER.filter((e) => e.fra < til && fra < e.til);

/* ---- Selvkontrol ------------------------------------------------------- */

if (import.meta.env?.DEV) {
  const biler = new Set(DEMO_KOERETOEJER.map((k) => k.id));
  const bilEfterId = new Map(DEMO_KOERETOEJER.map((k) => [k.id, k]));
  const folk = new Set(DEMO_PERSONALE.map((p) => p.id));

  for (const e of DEMO_ETAPER) {
    for (const id of enhedsIder(e)) {
      if (!biler.has(id)) {
        console.warn(`demo-etaper: ${e.id} peger på ukendt køretøj "${id}".`);
      }
    }
    /* ⚠ EN TRAILER KAN IKKE KØRE ALENE, og demo-sættet skal ikke vise noget
       kanDisponeres() ville afvise. Sættet er det eneste sted reglen kan
       brydes uden at nogen ser det — reglerne håndhæver den ikke, det gør
       etapeskift. */
    const enheder = enhedsIder(e).map((id) => bilEfterId.get(id)).filter(Boolean);
    const kombi = kanDisponeres(enheder);
    if (enheder.length && !kombi.ok) {
      console.warn(`demo-etaper: ${e.id} — ${kombi.aarsag}`);
    }
    if (e.personId && !folk.has(e.personId)) {
      console.warn(`demo-etaper: ${e.id} peger på ukendt personId "${e.personId}".`);
    }
    if (!(e.til > e.fra)) {
      console.warn(`demo-etaper: ${e.id} har til <= fra.`);
    }
    if (!e.division) {
      console.warn(
        `demo-etaper: ${e.id} mangler division. Reglerne kræver den på etaper/, og ` +
        `den kan ikke kopieres fra køretøjet (beslutning 19).`
      );
    }

    /* kunDanmark mod grænseovergange. Se tjekGeografi(). */
    const geo = tjekGeografi(e);
    if (!geo.ok) console.warn(`demo-etaper: ${e.id} — ${geo.aarsag}`);

    /* En udenlandsk tur UDEN grænseovergang er lige så forkert som det
       omvendte: prismotoren mangler så vejafgiften. */
    if (!e.kunDanmark && !krydserGraense(e)) {
      console.warn(
        `demo-etaper: ${e.id} går til ${e.tilSted} uden en grænseovergang, og er ikke ` +
        `markeret kunDanmark. Enten mangler overgangen, eller også er flaget forkert.`
      );
    }

    /* Geografisk umulige passagekombinationer. Prismotoren lægger dem sammen
       uden at brokke sig — se noten i toppen. */
    for (const par of UDELUKKER_HINANDEN) {
      if (par.every((p) => e.passager?.[p])) {
        console.warn(
          `demo-etaper: ${e.id} har både ${par.join(" og ")} som passage. ` +
          `De udelukker hinanden geografisk — man kører den ene vej eller den anden.`
        );
      }
    }

    /* En åben etape SKAL have en frist, og må ikke have en bil. */
    if (e.tilstand === "aaben") {
      if (!e.senestMs) {
        console.warn(`demo-etaper: ${e.id} er åben uden senestMs. Uden frist fyldes lageret.`);
      }
      if (enhedsIder(e).length || e.personId) {
        console.warn(`demo-etaper: ${e.id} er åben, men har allerede bil eller chauffør.`);
      }
    } else if (!enhedsIder(e).length || !e.personId) {
      console.warn(`demo-etaper: ${e.id} er ${e.tilstand} uden bil eller chauffør.`);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ ET FORSLAG SKAL KUNNE LADE SIG GØRE.

     et-004 foreslog kt-104 alene til 66 m³ og 15,1 t — en bil der kan 48 m³
     og 12 t. Det stod der indtil etapeskift begyndte at HÅNDHÆVE kanBaere(),
     og serveren afviste demo-sættets eget forslag mod den udrullede base.

     Et demo-forslag ingen koordinator kan godkende, er værre end ingen: det
     ser ud som en fejl i koden, første gang nogen trykker. Kontrollen her er
     den samme som serverens — kanDisponeres() og kanBaere() — kørt på
     sættet selv.
     ══════════════════════════════════════════════════════════════════════ */
  for (const e of DEMO_ETAPER) {
    for (const f of e.forslag || []) {
      const enheder = enhedsIder(f).map((id) => bilEfterId.get(id)).filter(Boolean);
      const kombi = kanDisponeres(enheder);
      if (!kombi.ok) {
        console.warn(`demo-etaper: forslag ${f.id} på ${e.id} — ${kombi.aarsag}`);
      }
      const baere = kanBaere(enheder, e.maengde || {});
      if (!baere.ok) {
        console.warn(
          `demo-etaper: forslag ${f.id} på ${e.id} kan ikke bære godset — ` +
          `mangler ${baere.mangler.m3} m³ og ${baere.mangler.kg} kg. ` +
          "Serveren ville afvise det.");
      }
    }
  }
  /* ⚠ EN LANGTUR SKAL BÆRE SIN PLANLAGTE KØRETID.

     tjekKoerehviletid() regner hele vinduet som kørsel hvis koerselMin
     mangler — den strenge antagelse. Den er rigtig for en dagstur og forkert
     for en tur over to døgn, hvor chaufføren sover undervejs. Uden feltet
     ville etapeskift afvise hver eneste langtur med "2400 min.
     sammenhængende kørsel", og det ville lære disponenten at spærringen er
     støj. Se koerselMinPaakraevet() i etaper.js. */
  for (const e of DEMO_ETAPER) {
    if (koerselMinPaakraevet(e, GRAENSE.dagligKoerselMin)) {
      console.warn(
        `demo-etaper: ${e.id} løber over ${GRAENSE.dagligKoerselMin / 60} timer ` +
        "uden koerselMin. Serveren ville afvise en disponering af den.");
    }
  }
  /* Ingen bil på to ture samtidig — det ville være en reservationskonflikt
     modellen selv ville afvise. */
  for (const id of new Set(DEMO_ETAPER.flatMap(enhedsIder))) {
    const mine = demoEtaperFor(id);
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        if (mine[i].fra < mine[j].til && mine[j].fra < mine[i].til) {
          console.warn(`demo-etaper: ${mine[i].id} og ${mine[j].id} overlapper på ${id}.`);
        }
      }
    }
  }

  /* Chaufførerne skal have de kompetencer turene kræver — ellers viser
     Disponerings kompetencetjek en fejl der kommer fra demo-data og ikke fra
     modellen. */
  const harKompetence = new Set(DEMO_KOMPETENCER.map((k) => `${k.personId}:${k.type}`));
  for (const e of DEMO_ETAPER.filter((x) => x.personId)) {
    if (!harKompetence.has(`${e.personId}:c`) && !harKompetence.has(`${e.personId}:ce`)) {
      console.warn(
        `demo-etaper: ${e.id} er tildelt ${e.personId}, som hverken har C eller C/E i ` +
        `demo-kompetencerne. Kompetencetjekket vil melde fejl på demo-data.`
      );
    }
  }
}
