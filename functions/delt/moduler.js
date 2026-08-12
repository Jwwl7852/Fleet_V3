/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/moduler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/moduler.js
 * Hvilke moduler en kunde har købt.
 *
 * INGEN IMPORTS — som permissions.js og steder.js. Både klienten, reglerne
 * (gennem provisioneren) og en fremtidig udbyderkonsol skal bruge samme
 * katalog, og en delt fil med imports kan ikke kopieres ind i functions/.
 *
 * ---------------------------------------------------------------------------
 * ⚠ MODULAFKRYDSNINGEN HÅNDHÆVES NU I REGLERNE — beslutning 34.
 *
 * Her stod indtil videre at afkrydsningen var en KOMMERCIEL kontrol og ikke
 * en sikkerhedskontrol: en kunde uden Facility der tastede /facility, så sin
 * egen tomme node, og det var en salgsflade frem for et databrud.
 *
 * Det holdt så længe modullisten kun tegnede en sidebar. Det holder ikke, når
 * ejerkonsollen kan FRATAGE et modul: gjorde vi kun det, havde kunden stadig
 * sine data og sit API, og modulet var ikke solgt — det var foreslået.
 * `NODE_MODUL` nedenfor er tabellen reglerne følger, og håndhævelsen rammer
 * BÅDE læsning og skrivning.
 *
 * ⚠ DET FRITAGER IKKE TENANT-ISOLATIONEN. At kunder ikke kan nå HINANDENS
 * data er en helt anden mekanisme — `auth.token.tenant === $tenantId` i hver
 * eneste regel, prøvet på hver node i begge retninger
 * (test/rules.tenant.test.mjs, punkt 1 i den låste rækkefølge). De to må ikke
 * blandes sammen, og modulspærringen må aldrig bruges som argument for at
 * isolationen er i orden.
 *
 * ⚠ EN KUNDE DER FÅR ET MODUL FRATAGET, KAN IKKE HENTE SINE EGNE DATA UD.
 * De ligger der — intet slettes — men eneste vej til dem går gennem
 * servicekontoen. Et fravalg skal derfor aftales, ikke bare klikkes, og en
 * eksport hører FØR fravalget. Se EJERKONSOL.md.
 * ---------------------------------------------------------------------------
 *
 * ⚠ DASHBOARD OG OPSÆTNING KAN IKKE FRAVÆLGES. Et system uden forside er
 * ikke et system, og en kunde der har fravalgt Opsætning kan ikke se sine
 * egne brugere. De står derfor som `altid: true` og kan ikke slås fra —
 * hverken her eller i konsollen.
 */

export const MODUL = {
  dashboard: {
    navKey: "dashboard",
    label: "Dashboard",
    hvad: "Forsiden med nøgletal og det der kræver handling.",
    altid: true,
  },
  booking: {
    navKey: "booking",
    label: "Booking & Opgaver",
    hvad: "Forespørgsler, forslag, disponering og ruteoverblik.",
  },
  bemanding: {
    navKey: "bemanding",
    label: "Bemanding",
    hvad: "Vagtplan, medarbejdere, kompetencer og fravær.",
  },
  flaade: {
    navKey: "flaade",
    label: "Flåde",
    hvad: "Køretøjer, værkstedskalender og indberetninger.",
  },
  facility: {
    navKey: "facility",
    label: "Facility",
    hvad: "Bygninger, anlæg, klima og servicekalender.",
  },
  indkoeb: {
    navKey: "indkoeb",
    label: "Indkøb",
    hvad: "Indkøb, fakturaafstemning og leverandører.",
  },
  /**
   * ⚠ MODULET HED `warehouse` INDTIL ETAPE 6 VAR INDE, OG NAVNET BLEV
   * FRIGJORT MED VILJE.
   *
   * `warehouse` er **reserveret** til et andet modul, der er på vej: blandede
   * varer ind og ud af et lager, med afregning for håndtering ind, opbevaring
   * og håndtering ud. Det er en anden forretning end at leje transportkasser
   * ud pr. sag — andre noder, andre priser, andre skærme.
   *
   * Havde de to delt navn, ville vi have haft to ting der hedder det samme
   * for tredje gang: `lagre` mod `lager`, `bookinger` mod `bookings`, og nu
   * `warehouse` mod `warehouse`. Det er beslutning 11 og 14, og det er den
   * fejl der har kostet mest i dette repo. Omdøbningen kostede en eftermiddag
   * NU, fordi der endnu ikke fandtes en eneste kunde med modulet krydset af —
   * ingen tenant, ingen prisliste og intet fakturagrundlag nævnte det. Om et
   * halvt år ville den samme omdøbning have været en datamigrering af
   * frosne regnskabsdokumenter.
   *
   * ⚠ TAG DERFOR IKKE `warehouse` TIL NOGET ANDET. Navnet er ikke ledigt —
   * det er optaget af noget der ikke er bygget endnu.
   */
  turtlebooking: {
    navKey: "turtlebooking",
    label: "Turtlebooking",
    hvad: "Udlejning af transportkasser: kasser, reolpladser og udlån pr. sag.",
  },
  /**
   * ⚠ DET ER 3PL, IKKE VORES EGET LAGER. Warehouse opbevarer KUNDENS gods og
   * afregner for håndtering ind, opbevaring og håndtering ud. Hver vare bærer
   * en `kundeId`, og hver bevægelse er en fakturerbar hændelse.
   *
   * ⚠ FORVEKSL DEN IKKE MED `lagre`. Den node er reservedelslageret under
   * Indkøb — VORES egne dele, hvor forbruget er en omkostning på en bil. Her
   * er varen kundens, og bevægelsen er en indtægt. To forskellige ting, og
   * derfor to noder frem for én med et flag. Se WAREHOUSE.md punkt 3.1.
   */
  warehouse: {
    navKey: "warehouse",
    label: "Warehouse",
    hvad: "Lagerhotel: kundens varer, lokationer, bevægelser og afregning.",
  },
  kunder: {
    navKey: "kunder",
    label: "Kunder & Priser",
    hvad: "Kundekartotek, aftaler, prisgrupper og tilbud.",
  },
  oekonomi: {
    navKey: "oekonomi",
    label: "Økonomi & Rapporter",
    hvad: "Driftsomkostninger, budget, dækningsgrad og fakturagrundlag.",
  },
  support: {
    navKey: "support",
    label: "Support",
    hvad: "Hjælp og sager med FleetControl.",
    altid: true,
  },
  opsaetning: {
    navKey: "opsaetning",
    label: "Opsætning",
    hvad: "Virksomhed, brugere og roller.",
    altid: true,
  },
};

export const ALLE_MODULER = Object.keys(MODUL);

/** De moduler en kunde kan vælge til og fra. */
export const VALGFRIE_MODULER = ALLE_MODULER.filter((m) => !MODUL[m].altid);

/**
 * Moduler der er i kataloget, men endnu ikke har en skærm.
 *
 * ⚠ ET MODUL UDEN SKÆRM MÅ IKKE TEGNES I SIDEBAREN. Et menupunkt der fører
 * til ingenting, lover noget produktet ikke kan — og det er værre end at
 * modulet mangler, for kunden opdager det først når han klikker.
 *
 * Listen er en UNDTAGELSE, og den skal tømmes. Så længe et navn står her,
 * kan modulet sælges og prissættes, men ikke bruges. Prøven
 * `modulkataloget svarer til menuen` kræver et navKey for alle ANDRE — så
 * en glemt menupost fanges stadig.
 *
 * turtlebooking: etape 1 og 2 er datamodel og regler. Nav-punktet kommer med
 * etape 3, hvor kasser og reolpladser kan ses. Se TURTLEBOOKING.md.
 */
/* turtlebooking stod her mellem etape 1 og 3: modulet kunne saelges og
 * prissaettes, men havde ingen skaerm, og et menupunkt der foerer til
 * ingenting lover noget produktet ikke kan. Nu findes skaermene, og navnet
 * er fjernet igen.
 *
 * ⚠ warehouse staar her NU, af samme grund. Modulet findes i kataloget og
 * kan krydses af og prissaettes — men datamodellen er ikke bygget, og der er
 * ingen skaerm at gaa til. Fjern navnet naar der ER en (se WAREHOUSE.md,
 * etape 3), ikke foer. */
export const UDEN_SKAERM = ["warehouse"];

/** De moduler enhver kunde altid har. */
export const OBLIGATORISKE_MODULER = ALLE_MODULER.filter((m) => MODUL[m].altid);

/* ══════════════════════════════════════════════════════════════════════════
   HVILKE NODER ET MODUL EJER — og hvorfor tre af dem ikke ejes af nogen
   ══════════════════════════════════════════════════════════════════════════

   ⚠ TABELLEN ER SANDHEDEN, OG REGLERNE SKAL FØLGE DEN.
   `test/rules.moduler.test.mjs` udleder sig af den: hver node herunder SKAL
   have modulklausulen i `firebase.rules.json`, og hver node der IKKE står her
   må ikke have den. Tilføjer nogen en node uden at tage stilling, fejler
   prøven — det er samme greb som nodelisten i rules.tenant.test.mjs.

   ⚠ TRE NODER STÅR MED VILJE UDEN FOR: opgaver, satser og fakturaer. De
   hører hver til TO moduler:

     opgaver    art er `vaerksted` | `facility` (beslutning 21)
     satser     prisgrupper hører til Kunder, kalkulationsprisen til Booking
     fakturaer  ligger i Indkøb, men Økonomi læser dem

   En node der hører til to moduler, kan ikke gates af det ene uden at det
   andet går i stykker. Alternativet — "har mindst ét af modulerne" — er en
   regel ingen kan læse sig til bagefter, og den slags regler bliver forkert
   ændret. De står derfor i BASEN.

   ⚠ personale, kompetencer og kpi er heller ikke gatede. personale ligger i
   basen fordi enhver abonnementskombination har medarbejdere (se
   permissions.js). kpi er ét aggregat — et modul man ikke har, har ingen tal.

   ⚠ oekonomi og kunder ejer ingen node hver for sig ud over kunder/. Økonomi
   læser kpi, fakturaer og satser, som alle er base. Modulet styrer altså kun
   om SKÆRMEN findes. Det er ikke en fejl i tabellen — det er hvad der er. */

/** Node → modul. Kun de noder et modul EJER alene. */
export const NODE_MODUL = {
  koeretoejer: "flaade",
  "sensitive/koeretoejer": "flaade",
  indberetninger: "flaade",

  facility: "facility",

  indkoeb: "indkoeb",
  lagre: "indkoeb",

  bookinger: "booking",
  "sensitive/bookinger": "booking",
  "vaerdi/bookinger": "booking",
  etaper: "booking",
  reservationer: "booking",

  fravaer: "bemanding",
  "sensitive/fravaer": "bemanding",
  kompetencer: "bemanding",

  kunder: "kunder",
  "sensitive/kunder": "kunder",

  /* ⚠ IKKE lagre. Den node er reservedelslageret under Indkøb. Kasser er
     transportkasser der lejes ud — se noten i turtlebooking.js om de tre navne
     der allerede var taget. */
  kasser: "turtlebooking",
  kassetyper: "turtlebooking",
  kasseudlaan: "turtlebooking",

  /* ⚠ DEN FØRSTE NODE DER HØRER TIL TO MODULER, og det er en beslutning og
     ikke en forglemmelse. Turtlebookings transportkasser og Warehouses
     kundegods står på de samme hylder; to reolnoder ville betyde at den
     vognmand der har begge moduler, skulle vedligeholde sit lager to gange —
     og at "Hal 1 · Reol 2" fandtes to steder der kunne blive uenige.

     Modulklausulen skal derfor acceptere BEGGE, og permissionen kan ikke
     hedde `kasser.skriv`: en WMS-medarbejder hos en kunde uden Turtlebooking
     ville ikke kunne oprette en hylde. Se WAREHOUSE.md punkt 3.3. */
  reolpladser: ["turtlebooking", "warehouse"],

  /* Warehouse (WMS) — 3PL. Varen er KUNDENS; se noten ved MODUL.warehouse
     om hvorfor det ikke er det samme som `lagre`. */
  varer: "warehouse",
  bevaegelser: "warehouse",
  beholdning: "warehouse",
};

/**
 * Modulerne en node hører til, altid som en liste.
 *
 * ⚠ FINDES FORDI TABELLEN NU KAN BÆRE BEGGE DELE. Læste hver forbruger selv
 * værdien, ville halvdelen behandle `["turtlebooking", "warehouse"]` som en
 * streng — og en sammenligning mod et array giver ikke en fejl, den giver
 * bare `false`. Så ville modulklausulen lydløst holde op med at matche.
 */
export const modulerFor = (node) => {
  const v = NODE_MODUL[node];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

/** Modul → dets noder. Udledt, så de to ikke kan komme ud af sync. */
export const MODUL_NODER = Object.keys(NODE_MODUL).reduce((ud, node) => {
  /* En node der hører til to moduler, står under begge. */
  for (const modul of modulerFor(node)) (ud[modul] ||= []).push(node);
  return ud;
}, {});

/**
 * Har tenanten det her modul?
 *
 * ⚠ FEJLER ÅBENT, OG DET ER MED VILJE — modsat permissions.js, som fejler
 * lukket. Forskellen er hvad en manglende oplysning betyder:
 *
 *   En manglende PERMISSION betyder "du må ikke". Fejler den åbent, giver
 *   man adgang til noget nogen skulle have stoppet.
 *   En manglende MODULLISTE betyder "vi ved ikke hvad kunden har købt" —
 *   typisk fordi noden ikke er skrevet endnu. Fejler den lukket, står en
 *   betalende kunde med en tom sidebar og tror systemet er væk.
 *
 * Det er derfor det ikke er en sikkerhedskontrol: den forkerte fejlretning
 * er en salgsflade, ikke et databrud.
 */
export function harModul(moduler, modul) {
  if (MODUL[modul]?.altid) return true;
  if (!moduler) return true;
  return moduler[modul] === true;
}

/** Modulsættet til en ny kunde: de obligatoriske plus de valgte. */
export function modulsaet(valgte = []) {
  const ud = {};
  for (const m of OBLIGATORISKE_MODULER) ud[m] = true;
  for (const m of valgte) {
    if (MODUL[m]) ud[m] = true;
  }
  return ud;
}

/** Navnene på de moduler der IKKE findes i kataloget. Til validering. */
export const ukendteModuler = (valgte = []) => valgte.filter((m) => !MODUL[m]);
