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
    label: "Planning",
    hvad: "Forespørgsler, forslag, disponering og ruteoverblik.",
  },
  bemanding: {
    navKey: "bemanding",
    label: "Workforce",
    hvad: "Vagtplan, medarbejdere, kompetencer og fravær.",
  },
  flaade: {
    navKey: "flaade",
    label: "Fleet",
    hvad: "Enheder, driftskalender og indberetninger.",
  },
  facility: {
    navKey: "facility",
    label: "Facility",
    hvad: "Bygninger, anlæg, klima og servicekalender.",
  },
  indkoeb: {
    navKey: "indkoeb",
    label: "Procure",
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
  unitbooking: {
    navKey: "unitbooking",
    label: "Unitbooking",
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
  /**
   * ⚠ DET FØRSTE MODUL UDEN ET TOPNIVEAUPUNKT — og det er ikke et hul.
   *
   * Kundekartoteket og de to prisskærme er STAMDATA, og stamdata samles under
   * Opsætning (samme snit som Enheder). Modulet findes uændret: noderne,
   * permissionerne og prisen er de samme, og de fire menupunkter bærer
   * `kraeverModul: "kunder"`, fordi Opsætning er `altid: true` og ikke kan
   * fravælges. Uden det led ville en kunde der aldrig har købt modulet, få et
   * menupunkt i sin egen opsætning der åbner en afvist læsning.
   *
   * `navKey` betyder derfor "mindst ÉT menupunkt", ikke "et menupunkt øverst".
   * Kravet er stadig at det findes: et modul hvis navKey ikke peger på noget,
   * kan hverken vises eller skjules, og fejlen kaster ikke — punktet
   * forsvinder bare, for alle, uden at nogen ser hvornår det skete.
   */
  kunder: {
    navKey: "kunderOversigt",
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
    hvad: "Stamdata, brugere, roller og integrationer.",
    altid: true,
  },
};

export const ALLE_MODULER = Object.keys(MODUL);

/* ⚠ ALLE_MODULER STÅR FØR KRAVBLOKKEN MED VILJE. `manglendeKrav()` læser
   den, og en konstant der bruges før sin egen erklæring, kaster
   "Cannot access before initialization" ved IMPORT — altså hele modulet,
   ikke bare funktionen. Samme fælde som selvkontrollen i demo-indkoeb.js. */
/* ══════════════════════════════════════════════════════════════════════════
   HVAD ET MODUL KRÆVER FOR OVERHOVEDET AT VIRKE — beslutning 93
   ══════════════════════════════════════════════════════════════════════════

   ⚠ IKKE EN SMAGSSAG. Kravene er UDLEDT af `firebase.rules.json`: et modul M
   kræver modul N, hvis en node M ejer har et **påkrævet** felt der peger på
   en node N ejer.

     bookinger  hasChildren(['kundeId', …])  → kunder
     varer      hasChildren(['kundeId', …])  → kunder
     enheder    hasChildren(['kundeId', …])  → kunder
     plukordrer hasChildren(['kundeId', …])  → kunder

   Sælges Planning uden Kunder, kan kunden **ikke oprette én eneste
   booking**: reglen kræver et `kundeId`, og noden det peger på er lukket for
   ham. Han har betalt for et modul der afviser hver skrivning.

   ⚠ OG DET ER IKKE ET SKÆRMSPØRGSMÅL. Nav-punkternes `kraeverModul` skjuler
   et MENUPUNKT; det her er om modulet kan bruges. En skjult menu ville bare
   gøre et ubrugeligt modul usynligt.

   ⚠ DER TILFØJES IKKE AUTOMATISK. Et manglende modul er noget kunden ikke
   har købt, og at slå det til for ham ville være at give noget væk — eller
   at fakturere for noget han ikke bad om. `kundemoduler` AFVISER og siger
   hvad der mangler. Samme retning som momssatsen: vi gætter ikke.

   ⚠ TALLET ER TO, OG DET SKAL BLIVE VED AT VÆRE UDLEDT.
   `test/modulkrav.test.mjs` regner listen ud af regelfilen igen og fejler
   hvis den ikke passer med tabellen her. Får en node et nyt påkrævet felt
   der krydser en modulgrænse, bliver prøven rød — og så skal nogen tage
   stilling, frem for at opdage det hos en kunde. */
export const MODUL_KRAEVER = {
  booking: ["kunder"],
  warehouse: ["kunder"],
};

/**
 * Hvilke moduler mangler, hvis kunden får præcis `valgte`?
 *
 * → `[{ modul, kraever }]`, tom når alt er i orden.
 *
 * ⚠ DE OBLIGATORISKE TÆLLER MED. `dashboard`, `support` og `opsaetning` er
 * `altid: true` og står sjældent i en nyttelast — men de ER der, og et krav
 * til dem skal ikke kunne fælde et gyldigt valg.
 */
export function manglendeKrav(valgte = []) {
  const har = new Set([...valgte, ...ALLE_MODULER.filter((m) => MODUL[m].altid)]);
  const mangler = [];
  for (const modul of har) {
    for (const kraever of MODUL_KRAEVER[modul] || []) {
      if (!har.has(kraever)) mangler.push({ modul, kraever });
    }
  }
  return mangler;
}

/** Sætningen brugeren skal læse. Ét sted — konsollen og serveren siger det samme. */
export const kravtekst = (mangler = []) =>
  mangler
    .map(({ modul, kraever }) =>
      `${MODUL[modul]?.label || modul} kræver ${MODUL[kraever]?.label || kraever}`)
    .join(", ");


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
 * ⚠ TOM IGEN — OG DET ER MENINGEN AT DEN SKAL VÆRE DET.
 *
 * Begge de nye moduler har stået her og er fjernet igen, hvert på sin tur:
 * `unitbooking` mellem etape 1 og 3, `warehouse` mellem etape 1 og 3. I
 * begge tilfælde kunne modulet sælges og prissættes, mens der endnu ikke var
 * en skærm at gå til — og listen var det der holdt menupunktet borte imens.
 *
 * Sæt et navn ind når et modul kommer i kataloget uden skærm, og fjern det
 * igen SAMME dag skærmen findes. En liste der aldrig tømmes, holder op med at
 * betyde noget.
 */
export const UDEN_SKAERM = [];

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

   ⚠ FEM NODER STÅR MED VILJE UDEN FOR: opgaver, satser, fakturaer,
   reservationer og sager. De hører hver til FLERE moduler:

     opgaver        art er `vaerksted` | `facility` (beslutning 21)
     satser         prisgrupper hører til Kunder, kalkulationsprisen til Booking
     fakturaer      ligger i Indkøb, men Økonomi læser dem
     reservationer  FIRE kilder mødes i den (beslutning 4)
     sager          art er `fleet` | `facility` — samme snit som opgaver,
                    og en værkstedssag hænger typisk på netop en opgave
                    (beslutning 20/112)

   En node der hører til to moduler, kan ikke gates af det ene uden at det
   andet går i stykker. Alternativet — "har mindst ét af modulerne" — er en
   regel ingen kan læse sig til bagefter, og den slags regler bliver forkert
   ændret. De står derfor i BASEN.

   ⚠ RESERVATIONER STOD SOM BOOKINGENS, OG DET VAR MÅLBART FORKERT.
   Noden er hele pointen i beslutning 4: booking, værksted, facility-sag og
   fravær skriver til den SAMME node, så de fire kan se hinanden. Gates den
   på `booking`, kan en kunde med Fleet og Facility men uden Planning ikke
   læse én eneste af sine egne reservationer — heller ikke dem hans egne
   moduler har skrevet.

   Målt på DEV-kunden `nordvest` (Fleet, Facility, Bemanding, Procure — ingen
   Planning): **37 reservationer, og ikke én af dem kommer fra en booking.**
   18 værksted, 9 facility-sag, 10 fravær. Hele Driftskalenderen,
   Servicekalenderen og enhver ledighedsvisning stod med en afvist læsning
   på data hans egne moduler havde skrevet.

   ⚠ Og `opgaveplanlaeg`, `facilityplanlaeg`, `opgaveflyt` og `opgavestatus`
   SKRIVER den for ham — med admin-SDK, som går uden om reglerne. Han kunne
   altså oprette et værkstedsbesøg og aldrig se det igen. Se beslutning 92.

   ⚠ personale, kompetencer og kpi er heller ikke gatede. personale ligger i
   basen fordi enhver abonnementskombination har medarbejdere (se
   permissions.js). kpi er ét aggregat — et modul man ikke har, har ingen tal.

   ⚠ oekonomi og kunder ejer ingen node hver for sig ud over kunder/. Økonomi
   læser kpi, fakturaer og satser, som alle er base. Modulet styrer altså kun
   om SKÆRMEN findes. Det er ikke en fejl i tabellen — det er hvad der er.

   ⚠ SKIVE 4B — leverandoerer ER OGSÅ FLYTTET UD, Model B (Korrektion 3,
   `04_DATA_AND_PERMISSION_IMPACT.md` §28). Stod tidligere som "indkoeb"
   her, med begrundelsen at kun Procure rørte den — men elleve skærme uden
   for Procure (Disponering, Servicekalender, Arbejdskøen,
   Værkstedskalender m.fl.) læste den allerede, og fik en afvist læsning
   hos enhver tenant uden Procure. Samme figur som `fakturaer` i beslutning
   86: gates den på ÉT modul, spærres de andre forbrugere. Adgangen styres
   nu udelukkende af `leverandoerer.laes`/`.skriv` i permissions.js —
   IKKE af en inline modul-OR (reolpladser-mønstret, Model A), som
   `04_DATA_AND_PERMISSION_IMPACT.md` eksplicit fravalgte. */

/** Node → modul. Kun de noder et modul EJER alene. */
export const NODE_MODUL = {
  koeretoejer: "flaade",
  "sensitive/koeretoejer": "flaade",
  /* ⚠ KOM MED SENSITIVE-NODEN.  har hele tiden staaet her;
     dens klassificerede satellit fandtes bare ikke i regelfilen — selv om
     CLAUDE.md beskrev underskriftens write-once-regel som gaeldende. */
  "sensitive/indberetninger": "flaade",
  indberetninger: "flaade",

  facility: "facility",

  indkoeb: "indkoeb",
  lagre: "indkoeb",
  /* ⚠ TRIN 1 OG 2 I PROCURES PROCES — beslutning 78. Et BEHOV er ikke en
     ordre, og en ordre er ikke en indkoebslinje: `indkoeb` er linjer der
     allerede ER koebt, altsaa en registrering bagud. De to nye baerer
     processen FOER koebet, og de hoerer til det samme modul: en kunde uden
     Procure har hverken behov at melde ind eller ordrer at sende. */
  indkoebsbehov: "indkoeb",
  indkoebsordrer: "indkoeb",
  godkendelsesregler: "indkoeb",
  forbrugsvarer: "indkoeb",
  forbrugsvarebevaegelser: "indkoeb",

  bookinger: "booking",
  /* ⚠ OMKOSTNINGER ER IKKE PRISER. `satser` er hvad KUNDEN betaler;
     `omkostninger` er hvad turen koster os — km, færge, bro, agentparkering.
     Beslutning 11 findes for den forskel. Noden hører til booking, fordi det
     er bookingens estimat den bærer. */
  omkostninger: "booking",
  "sensitive/bookinger": "booking",
  "vaerdi/bookinger": "booking",
  etaper: "booking",
  /* ⚠ MELDINGERNE FØLGER ETAPEN. En melding uden sin tur er en række uden
     betydning, og en kunde uden Planning har ingen ture at melde på.
     Se beslutning 103. */
  statushaendelser: "booking",
  /* ⚠ `reservationer` STOD HER, OG DEN ER FLYTTET I BASEN — beslutning 92.
     Fire kilder mødes i noden, og tre af dem hører til andre moduler. Se
     forklaringen i hovedet. Sæt den ikke tilbage: prøven udleder reglerne af
     tabellen, så en linje her lukker straks en kunde ude af sine egne
     værksteds- og fraværsreservationer. */

  fravaer: "bemanding",
  "sensitive/fravaer": "bemanding",
  kompetencer: "bemanding",
  /* ⚠ TIMEREGISTRERING ER EN WORKFORCE-FUNKTION — beslutning 107. Den står
     hos `fravaer` og `kompetencer` og ikke i basen: kun ÉT modul ejer den, og
     basen er for de noder FLERE moduler skriver til (beslutning 92).
     En kunde uden Workforce får ikke kortet i chaufførappen — `useListe`
     springer forespørgslen over og svarer `modulMangler`. */
  stemplinger: "bemanding",

  kunder: "kunder",
  "sensitive/kunder": "kunder",

  /* ⚠ IKKE lagre. Den node er reservedelslageret under Indkøb. Kasser er
     transportkasser der lejes ud — se noten i unitbooking.js om de tre navne
     der allerede var taget. */
  kasser: "unitbooking",
  kassetyper: "unitbooking",
  kasseudlaan: "unitbooking",

  /* ⚠ DEN FØRSTE NODE DER HØRER TIL TO MODULER, og det er en beslutning og
     ikke en forglemmelse. Unitbookings transportkasser og Warehouses
     kundegods står på de samme hylder; to reolnoder ville betyde at den
     vognmand der har begge moduler, skulle vedligeholde sit lager to gange —
     og at "Hal 1 · Reol 2" fandtes to steder der kunne blive uenige.

     Modulklausulen skal derfor acceptere BEGGE, og permissionen kan ikke
     hedde `kasser.skriv`: en WMS-medarbejder hos en kunde uden Unitbooking
     ville ikke kunne oprette en hylde. Se WAREHOUSE.md punkt 3.3. */
  reolpladser: ["unitbooking", "warehouse"],

  /* Warehouse (WMS) — 3PL. Varen er KUNDENS; se noten ved MODUL.warehouse
     om hvorfor det ikke er det samme som `lagre`. */
  varer: "warehouse",
  bevaegelser: "warehouse",
  beholdning: "warehouse",
  plukordrer: "warehouse",
  optaellinger: "warehouse",

  /* ⚠ IKKE `kasser`, og ikke sammen med den. En carrier og en transportkasse
     er fysisk den samme slags beholder, men de bærer hver sin forretning:
     kassen udlejes pr. sag, carrieren bærer kundens gods. De to noder står
     derfor på HVER SIT modul — mens `reolpladser`, som de begge står på,
     hører til begge. Se WAREHOUSE.md punkt 6.2. */
  carriers: "warehouse",

  /* ⚠ ENHEDEN — ét stykke gods med sit eget serienummer (etape 9). Den hører
     KUN til Warehouse: en transportkasse har et kassenummer og ikke et
     serienummer på sit indhold, fordi indholdet ikke er vores. */
  enheder: "warehouse",
};

/**
 * Modulerne en node hører til, altid som en liste.
 *
 * ⚠ FINDES FORDI TABELLEN NU KAN BÆRE BEGGE DELE. Læste hver forbruger selv
 * værdien, ville halvdelen behandle `["unitbooking", "warehouse"]` som en
 * streng — og en sammenligning mod et array giver ikke en fejl, den giver
 * bare `false`. Så ville modulklausulen lydløst holde op med at matche.
 */
export const modulerFor = (node) => {
  /* ⚠ ET BARN ARVER SIN FORAELDERS MODUL, og det er ikke en bekvemmelighed.
     `facility` staar i tabellen; `facility/lokationer` gør ikke — men den
     ligger UNDER den, og et modul er en spærring for et helt træ.

     Det blev synligt da .write flyttede fra `facility` ned på hver af de seks
     børns postniveau (beslutning 53). Uden arven ville prøven i
     rules.moduler.test.mjs sige at seks nye regler bar en klausul for en node
     "uden for tabellen" — og den rigtige rettelse ville se ud som at fjerne
     klausulen. Alternativet, at skrive hvert barn ind i tabellen, ville være
     seks nye steder at glemme et. */
  for (let sti = node; sti; sti = sti.includes("/") ? sti.slice(0, sti.lastIndexOf("/")) : "") {
    const v = NODE_MODUL[sti];
    if (v) return Array.isArray(v) ? v : [v];
  }
  return [];
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

/**
 * Hvilke moduler ejer den node en sti peger på? → liste, eller `null` for basen.
 *
 * ⚠ STIEN, IKKE KUN NODENAVNET. Skærmene læser `facility/lokationer` og
 * `sensitive/indberetninger`, mens tabellen har `facility` og
 * `sensitive/indberetninger`. Slog vi kun det fulde navn op, ville
 * `facility/lokationer` se ud som en base-node — og så ville en kunde uden
 * Facility sende en forespørgsel der er sikker på at blive afvist.
 *
 * Længste træffer vinder: `sensitive/indberetninger` skal ikke afgøres af
 * `sensitive`. Se beslutning 94.
 */
export function modulerForNode(sti) {
  if (!sti) return null;
  const dele = String(sti).split("/");
  for (let i = dele.length; i > 0; i--) {
    const m = NODE_MODUL[dele.slice(0, i).join("/")];
    if (m) return Array.isArray(m) ? m : [m];
  }
  return null;
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
