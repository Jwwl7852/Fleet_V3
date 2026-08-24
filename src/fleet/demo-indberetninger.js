/* src/fleet/demo-indberetninger.js
 * Demo-data til Indberetninger. Beslutning 25 + chaufførappens tre datatyper.
 *
 * ⚠ DATASÆTTET HØRER HER, IKKE I SKÆRMEN. test/demo-kilder.test.mjs fejler på
 * det, og mønstret er dukket op seks gange.
 *
 * Posterne er valgt så hver regel kan SES:
 *
 *   ind-001  Godsskade med chaufførappens tre datatyper på én gang:
 *            tidsregistrering, underskrift og to materialelinjer. Den ene
 *            materialelinje er allerede faktureret, den anden er ikke — så
 *            forskellen mellem "kan blive til en linje" og "er det allerede"
 *            kan ses.
 *   ind-002  Reparation på EGEN bil uden booking → materialet kan ikke
 *            faktureres. Der er ingen kunde at sende den til.
 *   ind-003  Afventer faktura, ingen omkostning registreret → kan ikke
 *            afsluttes. Årsagen står på skærmen.
 *   ind-004  Afsluttet med "ingen omkostning" OG en begrundelse — sådan ser
 *            den lovlige undtagelse ud.
 *   ind-005  Brændstof. To tankninger på samme bil, så km/l kan regnes på
 *            differencen frem for på et felt.
 */

import {
  HAENDELSE_ART, FORLOEB, MAENGDE_SKALA, SENSITIVE_FELTER,
} from "./indberetninger.js";
import { selvkontrol } from "./selvkontrol.js";

const NU = Date.now();
const D = 24 * 60 * 60 * 1000;
const T = 60 * 60 * 1000;

const m = (n) => Math.round(n * MAENGDE_SKALA);

/**
 * ⚠ DE SENSITIVE FELTER LIGGER I EN EGEN NODE, OGSÅ I DEMO-DATA.
 *
 * Ikke fordi demoen har brug for adgangskontrol, men fordi formen på noden er
 * det skærmen bygges imod. Lå de blandet ind i hovedposten her, ville skærmen
 * blive skrevet som om de altid var der — og så skulle den bygges om den dag
 * reglerne kommer. Det er samme grund som at demo-kpi.js har KPI-nodens form.
 *
 * Nøglen er indberetningens id, præcis som sensitive/fravaer.
 */
export const DEMO_INDBERETNINGER_SENSITIVE = {
  "ind-001": {
    skadeBeskrivelse:
      "To paller mejeriprodukter væltet ved opbremsning. Emballage brudt på " +
      "den ene, indhold delvist beskadiget.",
    modpart: { navn: "Preben Sørensen", rolle: "Lagerchef, Bornholms Mejeri" },
    underskrift: {
      navn: "Preben Sørensen",
      billedeSti: "underskrifter/ind-001.png",
      personId: null,
      stedTekst: "Rampe 4, Bornholms Mejeri",
      ms: NU - 2 * D + 9 * T,
    },
  },
  /* ⚠ TOMME OBJEKTER MED VILJE. Findes noden kun når der ER noget at skjule,
     kan man læse af hængelåsen at der skete en skade. Delvis afsløring lækker
     gennem udeladelsen — samme indsigt som ved cargoValue i ARKITEKTUR. */
  /* ⚠ TOMME POSTER ER MENINGEN. Findes noden kun når der ER noget at skjule,
     kan man læse af HÆNGELÅSEN at der skete en skade — uden at have adgang til
     den. Derfor har hver indberetning en post, også de tomme. ind-000 og
     ind-006 manglede deres, og selvkontrollen sagde det ved hver indlæsning;
     advarslen druknede i de falske (beslutning 75). */
  "ind-000": {},
  "ind-002": {},
  "ind-003": {},
  "ind-004": {},
  "ind-005": {},
  "ind-006": {},
};

/* ⚠ TO AF DEM ER CHAUFFØRENS EGNE — beslutning 109.

   `ind-000` (ridse opdaget ved afgangstjek) og `ind-001` (gods forskubbet
   under transport) er observationer fra vejen. De stod med pladsholderen
   `uid-lars`, som `PLADSHOLDER_ROLLE` oversætter til **casehandleren** —
   så chaufførappens "Indberettet" var tom, mens fire indberetninger lå i
   noden. Skærmen var ikke i stykker; den viste rigtigt at han ingen havde.

   ⚠ OG DER ER TO LARS'ER. Pladsholderen `uid-lars` er Lars casehandleren;
   `larsAage` er Lars Aage chaufføren, som chaufførkontoen er koblet til
   (PERSON_FOR_ROLLE i dev-brugere.js). De to har intet med hinanden at
   gøre og ligner hinanden fuldstændig.

   ⚠ LUKKET: `uid-anders` er chaufførens pladsholder, og `demo-procure.js`
   brugte den sammen med `anmoderId: "andersNielsen"` — en medarbejder der
   IKKE stod i DEMO_PERSONALE. Referencen slap igennem, fordi `anmoderId`
   stod i demo-referencernes undtagelsesliste som "et uid, ikke et
   personId" — mens `functions/index.js` og `firebase.rules.json` begge
   kalder feltet et personId. `anmoderId` peger nu på `larsAage`, reglen
   har fået et eksistenstjek mod `personale`, og undtagelsen er væk.
   Se beslutning 111. */
export const DEMO_INDBERETNINGER = [
  /* ⚠ DEN ENESTE MED forloeb: "ny" — OG DEN ER TILFØJET FORDI DEN MANGLEDE.
     Sættet gik fra "afventerFaktura" og opefter, så `flaade.nyeIndberetninger`
     gav 0 i begge divisioner: sandt for de data, men en tælling der kun kan
     give 0, kan ikke tage fejl på en måde nogen opdager. Femte gang mønstret
     dukker op — den åbne indkøbsordre, den planlagte facility-opgave, den
     udførte opgave uden tid og lageret uden døgnsats.

     ⚠ INGEN OMKOSTNING ENDNU, og det er ikke det samme som nul: skaden er
     meldt, ingen har vurderet den. `ingenOmkostning` er heller ikke sat —
     det felt er en BESLUTNING om at der ingen bliver, og den er ikke truffet. */
  {
    /* ⚠ OG DEN ER OGSAA DEN ENESTE UDEN PRIORITET. De to hoerer sammen:
       en indberetning med forloeb "ny" er lige kommet ind fra chaufføren, og
       prioriteten saettes i TRIAGEN af en vaerkfoerer. "Ikke vurderet" er et
       svar og faar sit eget tal paa Driftskalenderen — havde hver post en
       prioritet, ville det tal altid vaere 0.
       Se prioritet.js: prioritetFor() svarer null, ALDRIG PRIORITET.normal. */
    id: "ind-000", art: "koeretoejsskade", forloeb: "ny",
    oprettetAf: "uid-anders", oprettetMs: NU - 2 * T,
    /* ⚠ kt-106, IKKE kt-104. Foerste udgave laa paa kt-104, som allerede
       har en aaben koeretoejsskade — og saa gik test/steder.test.mjs fra 1
       til 2 aabne fejl paa den bil. En NY post maa ikke aendre et tal en
       anden proeve holder fast i, medmindre det ER pointen. */
    koeretoejId: "kt-106", bookingId: null, sagId: null, beskrivelse: "Ridse i venstre sidepanel, opdaget ved afgangstjek",
    omkostningOere: null, indkoebId: null, ingenOmkostning: null,
    tidsregistrering: null, materialelinjer: [],
  },

  {
    id: "ind-001",
    art: "godsskade",
    forloeb: "afventerFaktura",
    prioritet: "hoej",
    oprettetAf: "uid-anders",              /* ⚠ UID: hvem der GJORDE det. */
    oprettetMs: NU - 2 * D + 9 * T,
    koeretoejId: "kt-012",
    bookingId: "bk-2026-00311",          /* → der ER en kunde at fakturere. */
    sagId: "sag-flt-00381",              /* ⚠ HAR en sag. ER ikke en sag. */
    beskrivelse: "Gods forskubbet under transport, Rødby–København",
    omkostningOere: null,
    indkoebId: null,
    ingenOmkostning: null,

    /* 1. Tidsregistrering. Meldt 20 minutter efter ankomsten — tastet på
          stedet, og det er den stærke slags dokumentation. */
    tidsregistrering: {
      ankomstMs: NU - 2 * D + 8 * T,
      afgangMs: NU - 2 * D + 9 * T + 30 * 60000,
      registreretAf: "uid-lars",
      registreretMs: NU - 2 * D + 8 * T + 20 * 60000,
    },

    /* 2. Underskriften ligger i sensitive/ ovenfor — ikke her. */

    /* 3. Materialeforbrug. */
    materialelinjer: [
      {
        vare: "Bobleplast", varenummer: "BP-500",
        maengde: m(12), enhed: "m", lagerId: "lag-kolding",
        /* ⚠ ALLEREDE FAKTURERET. Et nyt forsøg skal afvises frem for at lave
           linje nummer to — se kanFaktureres(). */
        grundlagslinjeId: "grl-004-l4",
        lagertraekId: "lt-2026-0412",
      },
      {
        vare: "Spændebånd 5 m", varenummer: "SB-050",
        maengde: m(4), enhed: "stk", lagerId: "lag-kolding",
        /* Ikke faktureret endnu — den kan blive til en grundlagslinje. */
        grundlagslinjeId: null,
        lagertraekId: "lt-2026-0413",
      },
    ],
  },

  {
    /* ⚠ EGEN BIL, INGEN BOOKING. Materialet kan ikke faktureres — det er en
       driftsudgift, og der er ingen kunde. Uden det tjek kunne det havne på en
       tilfældig kundes regning. */
    id: "ind-002",
    art: "reparation",
    forloeb: "paaVaerksted",
    prioritet: "hoej",
    oprettetAf: "uid-jesper",
    oprettetMs: NU - 5 * D,
    koeretoejId: "kt-078",
    bookingId: null,
    sagId: null,
    beskrivelse: "Bremseslidtage bagaksel, konstateret ved eftersyn",
    kmStand: 412_880,
    omkostningOere: null,
    indkoebId: null,
    ingenOmkostning: null,
    tidsregistrering: null,
    materialelinjer: [
      {
        vare: "Bremseklodser, sæt", varenummer: "BK-441",
        maengde: m(1), enhed: "sæt", lagerId: "lag-kolding",
        grundlagslinjeId: null,
        lagertraekId: null,
      },
    ],
  },

  {
    /* ⚠ KAN IKKE AFSLUTTES. Hverken en omkostning eller en stillingtagen til
       at der ingen var. Skærmen skal skrive hvorfor. */
    id: "ind-003",
    art: "koeretoejsskade",
    forloeb: "afventerFaktura",
    prioritet: "normal",
    oprettetAf: "uid-rene",
    oprettetMs: NU - 9 * D,
    koeretoejId: "kt-104",
    bookingId: null,
    sagId: "sag-flt-00377",
    beskrivelse: "Skade på højre sidespejl ved manøvrering",
    kmStand: 288_140,
    omkostningOere: null,
    indkoebId: null,
    ingenOmkostning: null,
    tidsregistrering: null,
    materialelinjer: [],
  },

  {
    /* Den lovlige undtagelse: ingen omkostning, MED en begrundelse. Uden den
       kunne "dækket af garantien" ikke skelnes fra "vi glemte fakturaen". */
    id: "ind-004",
    art: "reparation",
    forloeb: "afsluttet",
    prioritet: "lav",
    oprettetAf: "uid-jesper",
    oprettetMs: NU - 21 * D,
    koeretoejId: "kt-106",
    bookingId: null,
    sagId: null,
    beskrivelse: "Fejlkode AdBlue-dosering",
    kmStand: 96_400,
    omkostningOere: null,
    indkoebId: null,
    ingenOmkostning: {
      begrundelse: "Dækket af fabriksgarantien. DAF sagsnr. 2026-11884.",
      af: "uid-jorn",
      ms: NU - 18 * D,
    },
    tidsregistrering: null,
    materialelinjer: [],
  },

  {
    /* To tankninger på samme bil, så km/l kan regnes på DIFFERENCEN.
       ⚠ kmStand er TOTALT kilometertal — ikke km siden sidste tankning. */
    id: "ind-005",
    art: "braendstof",
    forloeb: "afsluttet",
    prioritet: "normal",
    oprettetAf: "uid-anders",
    oprettetMs: NU - 1 * D,
    koeretoejId: "kt-012",
    bookingId: null,
    sagId: null,
    beskrivelse: "Tankning, Circle K Køge",
    kmStand: 331_420,
    liter: 412,
    /* ⚠ TÆLLER IKKE MED I km/l. Lagde vi den til, ville forbruget se ~5 %
       bedre ud end det er. */
    adBlueLiter: 18,
    prisPrLiterOere: 1_242,
    omkostningOere: 51_170,
    /* ⚠ HER STOD "ink-2026-0881" — ET ID DER IKKE FANDTES. Indkøbslinjerne
       hedder il-XXX, og feltet slår nu op i `indkoeb`. En hængende reference
       ser LINKET ud og er det ikke; den er allerede talt som afstemt. Tredje
       gang mønstret dukker op efter fakturaens "ik-001". */
    indkoebId: "il-003",
    ingenOmkostning: null,
    tidsregistrering: null,
    materialelinjer: [],
  },

  {
    id: "ind-006",
    art: "braendstof",
    forloeb: "afsluttet",
    prioritet: "lav",
    oprettetAf: "uid-anders",
    oprettetMs: NU - 8 * D,
    koeretoejId: "kt-012",
    bookingId: null,
    sagId: null,
    beskrivelse: "Tankning, Shell Rødby",
    kmStand: 328_960,
    liter: 388,
    adBlueLiter: 16,
    prisPrLiterOere: 1_268,
    omkostningOere: 49_198,
    /* ⚠ `ink-2026-0844` PEGEDE PÅ INGENTING. Indkøbslinjerne hedder `il-001`
       og frem; `ink-…` var en tredje id-konvention opfundet i denne fil. Den
       rigtige linje er `il-003` — Circle K's tankkort på **samme bil**,
       kt-012. Fundet af `demo-referencer.test.mjs`, ikke ved at kigge.
       Se beslutning 92. */
    indkoebId: "il-003",
    ingenOmkostning: null,
    tidsregistrering: null,
    materialelinjer: [],
  },
];

/** Tankningerne på én bil, ordnet. km/l regnes af forbrugKmPrLiter() hos
 *  forbrugeren — ikke gemt. Beslutning 6. */
export const demoTankninger = (koeretoejId) =>
  DEMO_INDBERETNINGER
    .filter((i) => i.art === "braendstof" && i.koeretoejId === koeretoejId)
    .sort((a, b) => a.kmStand - b.kmStand);

/* ---- Selvkontrol ------------------------------------------------------- */

selvkontrol("demo-indberetninger", () => {
  for (const i of DEMO_INDBERETNINGER) {
    if (!HAENDELSE_ART[i.art]) {
      console.warn(`demo-indberetninger: ${i.id} har ukendt art "${i.art}".`);
    }
    if (!FORLOEB[i.forloeb]) {
      console.warn(`demo-indberetninger: ${i.id} har ukendt forløbstilstand "${i.forloeb}".`);
    }
    /* ⚠ oprettetAf ER ET UID, ikke et personId. Bytter man om, holder
       ejerskabstjekket i reglerne op med at virke. */
    if (i.oprettetAf && !String(i.oprettetAf).startsWith("uid-")) {
      console.warn(
        `demo-indberetninger: ${i.id}.oprettetAf er "${i.oprettetAf}". Feltet er et UID ` +
        `— hvem der GJORDE det. Et personId matcher aldrig auth.uid i reglerne.`
      );
    }
    if (!DEMO_INDBERETNINGER_SENSITIVE[i.id]) {
      console.warn(
        `demo-indberetninger: ${i.id} har ingen post i sensitive-noden. Findes noden kun ` +
        `når der ER noget at skjule, kan man læse af hængelåsen at der skete en skade.`
      );
    }

    for (const l of i.materialelinjer || []) {
      if (!Number.isInteger(l.maengde)) {
        console.warn(`demo-indberetninger: ${i.id}/${l.vare} har en mængde der ikke er tusinddele.`);
      }
      /* En faktureret linje UDEN booking ville betyde at noget blev sendt til
         en kunde der ikke findes. */
      if (l.grundlagslinjeId && !i.bookingId) {
        console.warn(
          `demo-indberetninger: ${i.id}/${l.vare} er faktureret, men indberetningen har ` +
          `ingen bookingId — der er ingen kunde at fakturere.`
        );
      }
    }

    if (i.forloeb === "afsluttet") {
      const harPenge = Number.isInteger(i.omkostningOere) || i.indkoebId;
      if (!harPenge && !i.ingenOmkostning?.begrundelse) {
        console.warn(
          `demo-indberetninger: ${i.id} er afsluttet uden hverken omkostning eller en ` +
          `begrundet "ingen omkostning". kanAfslutte() ville have afvist den.`
        );
      }
    }
  }

  /* Underskriften må kun ligge i sensitive-noden. Kom den ind i hovedposten,
     ville skærmen blive skrevet som om den altid var der. */
  for (const i of DEMO_INDBERETNINGER) {
    for (const felt of SENSITIVE_FELTER) {
      if (i[felt] !== undefined) {
        console.warn(
          `demo-indberetninger: ${i.id} har "${felt}" i hovedposten. Feltet er sensitivt ` +
          `og hører i DEMO_INDBERETNINGER_SENSITIVE.`
        );
      }
    }
  }

  if (demoTankninger("kt-012").length < 2) {
    console.warn(
      "demo-indberetninger: der er under to tankninger på kt-012. Så kan km/l ikke " +
      "regnes på differencen, og pointen i beslutning 25 bliver usynlig."
    );
  }
});
