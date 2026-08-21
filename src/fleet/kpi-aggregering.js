/* src/fleet/kpi-aggregering.js
 * Nøgletallene, regnet ud af noderne. Beslutning 6.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ ET FELT UDEN KILDE ER `null` — IKKE NUL.
 *
 * `kpi/` har været seedet fra demo-sættet, og hvert felt har derfor haft en
 * værdi. Aggregeringen kan ikke det. `opgaver`, `indkoeb`, `fakturaer`,
 * `leverandoerer` og `facility` er kommet til siden; `lagre` mangler stadig,
 * og flåden og bemandingen venter på et svar frem for på en node.
 *
 * Skrev vi 0, ville skærmen sige "0 åbne ordrer" — en tom liste, ikke et
 * ubesvaret spørgsmål. `num()` skriver nu `INTET` for null netop derfor; se
 * format.js. Feltet SKAL med i objektet, så man kan se af noden hvad der
 * mangler — udelades det, får skærmen `undefined` og samme streg, men
 * spørgsmålet står ingen steder.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ OG NOGET KAN SLET IKKE DELES PÅ DIVISION.
 *
 * Beslutning 15: division er et FELT. Beslutning 19: stamdata har ikke et.
 * Målt på den udrullede base bærer `kunder`, `etaper`, `bookinger`,
 * `grundlag` og `omkostninger` en division — mens `koeretoejer`, `personale`,
 * `fravaer`, `carriers`, `varer` og `kompetencer` ikke gør.
 *
 * `kpi/gods/flaade.aktive` kan derfor ikke regnes. Et køretøj er ikke gods
 * eller bus; det er en lastbil. At udlede divisionen af ARTEN — bus og
 * minibus er bus, resten er gods — ville være et gæt: en varevogn kan køre
 * for busafdelingen, og en minibus kan køre kurér. Se `UDEN_DIVISION` og
 * det åbne spørgsmål i README.
 *
 * Filen er ren: den kender ingen database og skriver ingenting. Jobbet i
 * functions/index.js henter noderne og kalder den — så kan hele regnestykket
 * prøves uden en emulator.
 *
 * ⚠ FILEN ER IKKE LÆNGERE IMPORTFRI. Den henter MINDSTE_GRUNDLAG,
 * indkoebBeloebOere() og leveringspraecision() fra leverandoerer.js, fordi
 * indkøbets regnestykker allerede stod der og bruges af Indkøb-skærmene.
 * En afskrift her ville betyde at skærmen og noden kunne blive uenige om hvad
 * "til tiden" er. leverandoerer.js står derfor også i functions/delt/ — og
 * dens egen import, format.js, gjorde det i forvejen. Lukning under import.
 */
import {
  MINDSTE_GRUNDLAG, indkoebBeloebOere, leveringspraecision,
  prisPaa, leverandoerFraDb, AFTALETYPE,
  PRISAFVIGELSE_GRAENSE_FAST_PCT, PRISAFVIGELSE_GRAENSE_SPOT_PCT,
} from "./leverandoerer.js";
/* ⚠ DE FEM TJEK KOM MED — OG DE VAR ALLEREDE DELT.
   `disponering.konflikter` skal svare det SAMME som skærmen og `etapeskift`,
   og en afskrift her ville være et tredje sted reglerne stod. Begge filer er
   i forvejen i functions/delt/, så lukningen under import holder. */
import { tjekDisponering } from "./disponering.js";
import { reservationerFraEtape, enhedsIder, straekningFraEtape } from "./etaper.js";

/**
 * Kilder der IKKE bærer en division, og derfor ikke kan deles.
 *
 * ⚠ LISTEN ER MÅLT, IKKE GÆTTET. Den blev talt op mod den udrullede base:
 * 0 af 16 køretøjer, 0 af 35 medarbejdere og 0 af 80 kompetencer har feltet,
 * mens 14 af 14 kunder og 8 af 8 etaper har det.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * KPI-DOMÆNERNE OG DERES MODUL — grundlaget for at `kpi/` kan deles
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ HVORFOR DEN HER LISTE FINDES.
 *
 * `kpi/` var læsbar for ENHVER indlogget bruger i tenanten — ingen
 * permission, ingen modulklausul. En chauffør kunne læse
 * `tenants/<id>/kpi/gods/current/oekonomi` direkte, uanset hvad hans forside
 * viste, og en kunde uden Økonomi-modulet kunne læse det tal han ikke havde
 * købt adgang til at se en skærm for.
 *
 * Det var skrevet ned i `dashboardvisning.js` som en KENDT begrænsning:
 *
 *   "En afkrydsning her SKJULER et dashboard; den spærrer det ikke. Vil man
 *    have den rigtige spærring, er det `kpi/` der skal deles op — pr. domæne,
 *    med en permission eller en modulklausul på hver."
 *
 * Det er dét der sker her.
 *
 * ⚠ DOMÆNET HEDDER DET SAMME SOM MODULET — og det er ikke et tilfælde, det
 * er nyttigt: reglen kan ikke slå op i et katalog, men den kan skrive
 * `moduler.child($domaene)`. Syv af ti klarer sig med den ene linje.
 *
 * ⚠ TO DOMÆNER HAR INTET MODUL, og det er den samme carve-out som beslutning
 * 33 lavede for noderne `opgaver`, `satser` og `fakturaer`: de spænder over
 * FLERE moduler, og en klausul på ét af dem ville lukke tallet for en kunde
 * der har det andet.
 *
 *   opgaver      værkstedsopgaver (flaade) OG facility-opgaver
 *   afvigelser   indkøbsprisafvigelse (indkoeb) OG salgsprisafvigelse
 *                (kunder/oekonomi) — se beslutning 14
 *
 * ⚠ OG ÉT HEDDER NOGET ANDET END SIT MODUL. `disponering` hører til
 * `booking`; domænet er opkaldt efter skærmen, modulet efter forretningen.
 */
export const KPI_DOMAENE = {
  opgaver: null,
  flaade: "flaade",
  bemanding: "bemanding",
  facility: "facility",
  indkoeb: "indkoeb",
  kunder: "kunder",
  oekonomi: "oekonomi",
  afvigelser: null,
  warehouse: "warehouse",
  disponering: "booking",
};

export const ALLE_KPI_DOMAENER = Object.keys(KPI_DOMAENE);

/** Domæner uden modulklausul — læsbare for enhver i tenanten. */
export const KPI_UDEN_MODUL = ALLE_KPI_DOMAENER.filter((d) => !KPI_DOMAENE[d]);

/**
 * ══════════════════════════════════════════════════════════════════════════
 * HVAD HVERT DOMÆNE ER REGNET AF — og hvorfor det afgør hvem der må se det
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ ET NØGLETAL ER IKKE MILDERE END SIT GRUNDLAG. Må en bruger ikke læse
 * `kunder/`, skal han heller ikke kunne læse ANTALLET af kunder ad bagvejen.
 * Et aggregat er stadig kundens data — det er bare talt op.
 *
 * Beslutning 44 lukkede `kpi/` pr. modul. Det gælder TENANTEN. Det her led
 * gælder BRUGEREN: domænet kræver de samme læse-permissions som de noder det
 * er regnet af.
 *
 * ⚠ LISTEN ER EN KENDSGERNING OM `beregnKpi()`, ikke en hensigt. Den er læst
 * ud af funktionen nedenfor, og en prøve holder de to sammen: får et domæne
 * en ny kilde, skal listen med — ellers ville nøgletallet blive regnet af
 * noget brugeren ikke må se, uden at nogen opdagede det.
 *
 * ⚠ TRE DOMÆNER HAR INGEN KILDE. `bemanding`, `warehouse` og `afvigelser`
 * står med `null` eller en tom liste. Det er ikke en forglemmelse — flåden og
 * bemandingen venter på divisionsspørgsmålet, og de to andre på en node. Et
 * tomt grundlag kræver ingen permission, og det ville være en påstand at give
 * det en.
 */
export const KPI_KILDER = {
  opgaver: ["opgaver", "etaper", "grundlag"],
  /* ⚠ IKKE `koeretoejer`. Kun ét flaadefelt kan regnes, og det kommer fra
     INDKØBET — brændstoffet er en indkøbslinje, og den bærer en division
     hvor bilen ikke gør. Resten er null. */
  flaade: ["fakturaer", "indkoeb", "indberetninger"],
  bemanding: [],
  facility: ["facility", "opgaver", "leverandoerer"],
  indkoeb: ["indkoeb", "fakturaer", "leverandoerer"],
  kunder: ["kunder"],
  oekonomi: ["etaper", "grundlag"],
  afvigelser: [],
  warehouse: [],
  disponering: ["etaper"],
};

/**
 * Den læse-permission et domæne kræver — eller `null`.
 *
 * ⚠ KUN ÉN I DAG, og det er selve pointen med at skrive listen ned. Af de
 * noder aggregeringen læser, er `kunder` den eneste der kræver en
 * læse-permission; `etaper`, `grundlag`, `opgaver`, `indkoeb`, `fakturaer`,
 * `leverandoerer`, `facility` og `indberetninger` kræver kun tenant-medlemskab.
 *
 * Det ændrer altså **ingenting i dag** — alle syv roller har `kunder.laes`.
 * Værdien ligger i at leddet ER der: den dag en læse-permission strammes,
 * følger nøgletallet med af sig selv, i stedet for at blive husket.
 *
 * `test/rules.kpi.test.mjs` udleder tabellen her af REGLERNE for hver kilde og
 * fejler hvis de to er uenige. Får `flaade` en dag `koeretoejer` som kilde,
 * bliver prøven rød indtil `koeretoejer.laes` står her og i regelfilen.
 */
export const KPI_PERM = {
  kunder: "kunder.laes",
};

/**
 * De domæner en bruger overhovedet kan læse — modul OG permission.
 *
 * ⚠ SAMME FUNKTION I SKÆRMEN OG I PRØVEN. `useKpi()` henter kun dem der står
 * her — ellers ville hver eneste sideindlæsning bede om noget reglerne
 * afviser, og en `permission-denied` ville stå i konsollen på hver tur.
 * En afvisning skal betyde noget.
 */
export const laesbareDomaener = (harModulFn = () => true, harPermFn = () => true) =>
  ALLE_KPI_DOMAENER.filter((d) =>
    (!KPI_DOMAENE[d] || harModulFn(KPI_DOMAENE[d]))
    && (!KPI_PERM[d] || harPermFn(KPI_PERM[d])));

export const UDEN_DIVISION = [
  "koeretoejer", "personale", "fravaer", "carriers", "varer", "kompetencer",
];

/* ⚠ FACILITY VAR PÅ VEJ IND I LISTEN OVENFOR — OG DET VAR FORKERT.
 *
 * Det er rigtigt at aktiver, lokationer og fejl ikke MÅ bære en division;
 * reglerne siger `"division": {".validate": false}` på alle tre. Men deraf
 * følger IKKE at tallene er ubesvarlige, og det var den slutning jeg tog.
 *
 * demo-facility.js har svaret skrevet i sit hoved: **"FACILITY ER FÆLLES.
 * Aktiverne er de samme uanset division, og kpi.facility er derfor identisk
 * under gods og bus."** demo-kpi bekræfter det: 287 aktiver og 24 åbne fejl i
 * BEGGE divisioner — mens flåden står med 42 mod 18 og bemandingen 58 mod 26.
 *
 * Demo-sættene skelner altså allerede mellem to slags "ingen division":
 *
 *   FLÅDEN og BEMANDINGEN skal DELES, og feltet findes ikke → ubesvarligt.
 *   FACILITY er FÆLLES, og feltet er forbudt fordi delingen ikke giver
 *   mening → svaret er hele basen, vist begge steder.
 *
 * Det er samme regel som iDivision(): en post uden division hører til BEGGE,
 * ikke til ingen. At skrive null for facility ville have været at stille et
 * spørgsmål der allerede var besvaret — og at holde tolv felter tomme for at
 * få dem til at ligne flåden. */

/** Kilder der endnu ikke findes som node. Deres felter bliver `null`. */
export const KILDER_DER_MANGLER = [
  /* ⚠ `indkoeb` STOD HER. Noden havde regler, et indeks og en validering af
     hver eneste feltform — og ingen data. Den holdt 9 af de 13 indkøbsfelter
     på null. Det var ikke en manglende beslutning; det var et seed.
     `fakturaer` blev seedet i samme omgang, fordi indkøbets nøgletal ikke kan
     regnes uden dem: en faktura er den anden halvdel af et indkøb. */
  /* ⚠ `leverandoerer` STOD HER, og den fandtes ikke engang i
     firebase.rules.json — selv om BÅDE indkoeb og fakturaer har indekseret
     leverandoerId siden de blev skrevet. Uden den var der ingen AFTALT pris
     at måle en betalt pris imod, og prisafvigelserne var derfor null. */
  /* ⚠ `facility` STOD HER — den manglede DATA, og de er seedet nu.
     Jeg gættede først at det kun ville låse to felter op, fordi reglerne
     FORBYDER `division` på aktiver, lokationer og fejl. Det var en forkert
     slutning: facility er FÆLLES, og et fælles tal skal vises begge steder,
     ikke skjules begge steder. Se den lange note ved UDEN_DIVISION. */
  /* ⚠ LISTEN ER TOM. Alle fem noder der stod her — opgaver, indkoeb,
     fakturaer, leverandoerer og facility — er bygget eller seedet, og 
     var den sidste. Konstanten bliver staaende: den er formen for det
     naeste hul, og en tom liste er et SVAR — der er ingen node uden data.

     De 16 felter der stadig er null i udenKilde(), venter ikke paa et seed.
     De venter paa et SVAR: kan flaaden og bemandingen deles paa division? */
];

const DAG = 86400000;

/**
 * Hører posten til divisionen?
 *
 * ⚠ EN POST UDEN DIVISION HØRER TIL BEGGE — ikke til ingen. Det er samme
 * regel som divisionsfilteret i `useListe`, og den er ikke en detalje: da
 * beslutning 19 fjernede feltet fra bilerne, ville en kopi uden det her led
 * have vist en tom biltabel i både Gods og Bus, uden at nogen havde slettet
 * en bil.
 */
export const iDivision = (post, division) =>
  !post?.division || post.division === division || post.division === "faelles";

/**
 * Felterne der ikke kan regnes, med `null` og et navn.
 *
 * De står her og ikke som spredte `null` ude i beregningen, så man kan SE
 * hvor mange der venter — og så et felt der får en kilde, fjernes ét sted.
 */
export function udenKilde() {
  return {
    /* ⚠ FACILITY STÅR IKKE LÆNGERE HER. Noden er seedet, og felterne
       regnes af facilitytal() — også de tre der stadig er null
       (klimaalarmerIDag og aabneSager). De er null INDE i
       regnestykket, med grunden ved sig: et null med en grund hører hos
       beregningen, og kun de HELT ukendte kilder samles her.

       ⚠ facilityOmkostningOere ER FJERNET HELT — ikke sat til null. Den var
       summen af facility/omkostnings fem komponenter, altså et AFLEDT tal,
       gemt. bygningsomkostningOere() regner den hos forbrugeren, og ingen
       skærm læste kpi-feltet. Se "Skal UD af aggregeringen" i README. */
    /* ⚠ indkoeb STÅR IKKE LÆNGERE HER — se indkoebstal(). De to felter der
       stadig er null (prisafvigelserne) er null INDE i den funktion, med
       begrundelsen ved sig: de kræver leverandørens prisliste, og
       leverandoerer/ findes ikke som node. Et null med en grund hører hos
       regnestykket; det er kun de HELT ukendte kilder der samles her. */
    /* ⚠ FLÅDEN OG BEMANDINGEN KAN IKKE DELES PÅ DIVISION — se hovedet.
       Felterne står med null frem for at blive udeladt: så kan man se af
       noden at spørgsmålet er stillet og ikke besvaret. */
    flaade: {
      /* ⚠ ikkeLinkedeFakturaer OG braendstofOere STÅR IKKE HER.
         De BEREGNES — se beregnKpi() — og stod de med null her, ville de
         tælle med i efterslæbet. udenKilde() ER optællingen; er den to for
         høj, holder man op med at tro på tallet. Felterne kommer på objektet
         i beregnKpi(), og feltniveau-prøven mod demo-kpi holder dem der. */
      aktive: null, udeAfDrift: null, paaVaerksted: null, serviceInden30: null,
      omkostningPrKmOere: null, omkostningPrKmDeltaOere: null,
      nedetidPct: null,
      /* nyeIndberetninger STÅR IKKE HER LÆNGERE — se beregnKpi(). */
      /* Nedetidens periodeafvigelse. Kræver både nedetiden selv — som venter
         på divisionsspørgsmålet — og en forrige kørsel. Stod hardkodet som
         deviation(-0.6, …). */
      nedetidDeltaPoint: null,
    },
    bemanding: {
      planlagt: null, disponeret: null, ledig: null, underbemandede: null,
      chauffoerPlanlagt: null, chauffoerDisponeret: null,
      kompetencerUdloeber: null, medarbejdereAktive: null, fravaerIDag: null,
    },
  };
}

/* ---- Det der KAN regnes ------------------------------------------------ */

/**
 * Kunder i divisionen.
 *
 * ⚠ `tilbud` ER null OG IKKE NUL. Der findes ingen `tilbud`-node — formen er
 * ikke besluttet, og et tilbud kan gå til et EMNE der ikke er kunde endnu.
 * Se demo-kunder.js.
 */
export function kundetal(kunder = [], division, nu = Date.now()) {
  const mine = kunder.filter((k) => iDivision(k, division));
  return {
    aktive: mine.filter((k) => k.aktiv !== false).length,
    aftalerUdloeber: mine.filter(
      (k) => Number.isFinite(k.aftaleUdloeberMs)
        && k.aftaleUdloeberMs > nu
        && k.aftaleUdloeberMs - nu <= 30 * DAG).length,
    tilbud: null,
    tilbudKraeverOpfoelgning: null,
    daekningsbidragOere: null,
    aktiveDeltaPct: null,
    daekningsbidragDeltaPct: null,
  };
}

/**
 * ⚠ `ikkeFaktureretOere` ER UDFØRT ARBEJDE UDEN ET LÅST GRUNDLAG.
 *
 * Ikke "ufaktureret omsætning", og ikke summen af åbne bookinger. Beslutning
 * 25 skærpede betydningen: en etape der er kørt, tæller først som faktureret
 * når det grundlag den ligger på, er LÅST — godkendt er ikke nok, for et
 * godkendt grundlag kan stadig erstattes.
 *
 * ⚠ OG ET ERSTATTET GRUNDLAG TÆLLER IKKE. `erstattetAfId` gør det ugyldigt;
 * regnede vi det med, ville en rettelse pynte på tallet.
 *
 * ⚠ BELØBET KOMMER FRA GRUNDLAGET, IKKE FRA ETAPEN. En etape bærer ingen
 * pris. Kan vi ikke se hvad et forløb er værd, kan vi ikke lægge det til — og
 * så er svaret `null` for HELE feltet frem for en sum der mangler noget.
 * `forloeb` står ved siden af, så man kan se hvor meget der ikke kunne
 * prissættes.
 */
export function ikkeFaktureretOere(etaper = [], grundlag = [], division) {
  const laasteForloeb = new Set(
    grundlag
      .filter((g) => g.tilstand === "laast" && !g.erstattetAfId && g.bookingId)
      .map((g) => g.bookingId));

  const udfoerte = etaper.filter(
    (e) => iDivision(e, division) && e.tilstand === "udfoert" && e.bookingId);

  const ufaktureret = [
    ...new Set(udfoerte.filter((e) => !laasteForloeb.has(e.bookingId)).map((e) => e.bookingId)),
  ];

  let sum = 0;
  for (const bookingId of ufaktureret) {
    const g = grundlag.find(
      (x) => x.bookingId === bookingId && !x.erstattetAfId
        && Number.isFinite(x.beloebOere));
    if (!g) return { oere: null, forloeb: ufaktureret.length, udenPris: true };
    sum += g.beloebOere;
  }
  return { oere: sum, forloeb: ufaktureret.length, udenPris: false };
}

/**
 * Opgaverne i divisionen.
 *
 * ⚠ KUN DET VOKABULARET BÆRER. `OPGAVE_STATUS` har seks værdier, og de fem
 * tælles direkte. Resten er `null` med hver sin grund:
 *
 *   `forsinkede`     kræver en FRIST, og en opgave har ingen. Etapen har
 *                    `senestMs`; opgaven har `startMs`, som er hvornår den
 *                    begynder — ikke hvornår den skal være færdig. At regne
 *                    "startet før i dag og ikke udført" som forsinket ville
 *                    gøre enhver flerdagsopgave forsinket på dag to.
 *   `udenTidsfrist`  samme grund, spejlvendt: uden et fristfelt er ALLE uden
 *                    frist, og tallet ville være antallet af opgaver.
 *   `nyeBookinger`   hører til `bookinger`, ikke til opgaver. Feltet står
 *                    under `opgaver` i demo-sættet, og det er en fejl i
 *                    formen — men at flytte det er en skærmændring, ikke en
 *                    aggregering. Noteret.
 *
 * ⚠ `aabne` ER IKKE "IKKE UDFØRT". En annulleret opgave er heller ikke åben.
 * Regnede vi komplementet, ville en oprydning i annullerede se ud som nyt
 * arbejde.
 */
export function opgavetal(opgaver = [], division, nu = Date.now(), {
  /* ⚠ BOOKINGERNE KOM MED FOR `nyeBookinger`. Feltet tæller bookinger, ikke
     opgaver — det står i `opgaver`-domænet fordi det er ARBEJDE der kommer
     ind, og det er den skærm der spørger. */
  bookinger = [], forrige = null,
} = {}) {
  const mine = opgaver.filter((o) => iDivision(o, division));
  const medStatus = (s) => mine.filter((o) => o.status === s).length;
  const AABNE = ["indberettet", "planlagt", "igang", "afventer"];

  const startetIDag = (o) => {
    if (!Number.isFinite(o.startMs)) return false;
    const d = new Date(nu);
    const fra = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return o.startMs >= fra && o.startMs < fra + DAG;
  };

  return {
    aabne: mine.filter((o) => AABNE.includes(o.status)).length,
    indberettet: medStatus("indberettet"),
    planlagt: medStatus("planlagt"),
    igang: medStatus("igang"),
    afventer: medStatus("afventer"),
    udfoert: medStatus("udfoert"),
    annulleret: medStatus("annulleret"),
    /* Indberettet = set, men ikke planlagt endnu. Det ER uplanlagt. */
    uplanlagte: medStatus("indberettet"),
    igangIDag: mine.filter((o) => o.status === "igang" && startetIDag(o)).length,

    /* ⚠ TIDSREGISTRERINGEN ER `faktiskMin`. En udført opgave uden den er
       netop den række Booking-oversigten beder om: omkostningen er stadig et
       estimat. Kun UDFØRTE tæller — en opgave der er i gang, mangler ikke
       sin tid, den er ikke færdig med at bruge den. */
    udenTidsregistrering: mine.filter(
      (o) => o.status === "udfoert" && !Number.isFinite(o.faktiskMin)).length,

    /* ⚠ IKKE DET SAMME SOM `udfoert`. Det tal er en OPTÆLLING AF NODEN:
       hvor mange opgaver står som udførte lige nu. `udfoerteOpgaver` er en
       PERIODESUM — demo har 9 mod 214. Perioden er ikke besluttet, og et
       tal der løb fra sidste nul-stilling, kan ikke udledes af en node hvor
       de udførte opgaver bliver liggende. */
    udfoerteOpgaver: null,

    /**
     * ⚠ TRE BARE NULLER STOD HER UDEN EN ENESTE LINJE.
     *
     * `udfoerteOpgaver` ovenfor havde sin grund skrevet ned; de her tre havde
     * ingenting. Et null uden en begrundelse kan ikke skelnes fra et felt
     * nogen har glemt — og to af dem havde en kilde hele tiden.
     */

    /**
     * ⚠ FORSINKET ER "SKULLE VÆRE FÆRDIG NU" — ikke "startede for sent".
     *
     * Opgaven bærer `startMs` og `estimeretMin`, og summen er hvad planen
     * sagde. Er den passeret, og opgaven hverken udført eller annulleret, er
     * arbejdet forsinket. En opgave der ikke er begyndt endnu, er ikke
     * forsinket — den er planlagt.
     *
     * ⚠ OG EN OPGAVE UDEN ESTIMAT TÆLLES IKKE MED. Den har ingen slutning at
     * være forsinket i forhold til, og et gæt på en standardlængde ville
     * gøre den forsinket på et tidspunkt ingen har besluttet — samme regel
     * som `reservationFraOpgave()` nægter at gætte et vindue.
     */
    forsinkede: mine.filter((o) => {
      if (o.status === "udfoert" || o.status === "annulleret") return false;
      if (!Number.isFinite(o.startMs) || !Number.isFinite(o.estimeretMin)) return false;
      return o.startMs + o.estimeretMin * 60000 < nu;
    }).length,

    /**
     * ⚠ DEN BLIVER STÅENDE — OG NU MED EN GRUND.
     *
     * "Uden tidsfrist" har ikke et felt i noden. En opgave bærer `startMs`
     * (hvornår den er planlagt) og `estimeretMin` (hvor længe den tager) —
     * ingen af dem er en FRIST. Den nærmeste udlægning, "opgaver uden et
     * planlagt tidspunkt", tælles allerede som `uplanlagte`, og to felter
     * med samme tal under hvert sit navn er beslutning 6 brudt.
     *
     * Feltet venter altså på et FELT eller på et andet spørgsmål — ikke på et
     * seed. Se beslutning 61.
     */
    udenTidsfrist: null,

    /**
     * ⚠ NYE SIDEN FORRIGE BEREGNING — samme periode som deltaerne.
     *
     * Der er ikke en "periode" i noden at tælle i, og det er samme problem som
     * `udfoerteOpgaver` har. Men der ER et tidspunkt at måle fra:
     * `forrige.beregnetMs`, som deltaerne allerede regner imod. Jobbet kører
     * natligt, så tallet er "kommet ind siden i går".
     *
     * ⚠ OG null VED FØRSTE KØRSEL, ikke nul. Der er ingen forrige at måle fra,
     * og 0 ville betyde "ingen nye bookinger" — en påstand vi ikke kan bakke
     * op. Præcis samme regel som `deltaPct()`.
     */
    nyeBookinger: Number.isFinite(forrige?.beregnetMs)
      ? bookinger.filter(
          (b) => iDivision(b, division) && Number.isFinite(b.oprettetMs)
            && b.oprettetMs > forrige.beregnetMs).length
      : null,
  };
}

/** Disponeringen, af etaperne. */
/**
 * ⚠ TO AF DE TRE NULL-FELTER HAVDE EN KILDE — DEN BLEV BARE IKKE SPURGT.
 *
 * `forsinkelsesrisiko` og `konflikter` stod som null med begrundelsen "ingen
 * kilde". Etaperne bærer både `etaMs` og `senestMs`, og de fem tjek er en ren
 * funktion der kun mangler sine lister. Det tredje —
 * `ledigKapacitetPct` — er en anden slags: se nedenfor.
 */
export function disponeringstal(etaper = [], division, {
  koeretoejer = [], personale = [], kompetencer = [], reservationer = {},
} = {}) {
  const mine = etaper.filter((e) => iDivision(e, division));

  /* ⚠ KUN DE AKTIVE. En udført eller annulleret etape kan ikke blive forsinket,
     og talte de med, ville tallet vokse med historikken frem for med
     problemerne. */
  const aktive = mine.filter((e) => e.tilstand !== "udfoert" && e.tilstand !== "annulleret");

  return {
    planlagteOpgaver: mine.filter((e) => e.tilstand === "reserveret").length,
    aabneEtaper: mine.filter((e) => e.tilstand === "aaben").length,

    /**
     * ⚠ LEDIG KAPACITET ER IKKE EN MÅLING — DET ER EN DEFINITION DER MANGLER.
     *
     * Ledig kapacitet i HVILKEN periode, og målt i HVAD? Vogntimer, m³, kg
     * eller antal enheder uden en reservation lige nu? De fire tal peger
     * forskellige veje: en flåde hvor hver bil kører én time om dagen, er
     * 96 % ledig i timer og 0 % ledig i enheder.
     *
     * Feltet står derfor med null og en begrundelse — ikke fordi dataene
     * mangler, men fordi spørgsmålet ikke er stillet færdigt. Samme holdning
     * som den manglende momssats: vi gætter ikke, og et tal der ser ud som en
     * måling, er værre end en streg.
     */
    ledigKapacitetPct: null,

    /**
     * ⚠ EN ETA EFTER FRISTEN — ikke "en frist der er overskredet".
     *
     * De to er forskellige spørgsmål: det ene er en RISIKO man kan nå at gøre
     * noget ved, det andet er en kendsgerning. Feltet hedder risiko, og det
     * er derfor ETA'en der sammenlignes med `senestMs`.
     *
     * ⚠ OG EN ETAPE UDEN ETA ELLER UDEN FRIST TÆLLES IKKE MED. Den kan ikke
     * vurderes, og et gæt ville lægge sig oveni tallet som en måling — samme
     * grund som `opgaver.udenTidsregistrering` tæller hullet frem for at
     * fylde det ud. Hullet står i `udenEtaEllerFrist` ved siden af, så det
     * kan ses hvor stort grundlaget er.
     */
    forsinkelsesrisiko: aktive.filter(
      (e) => Number.isFinite(e.etaMs) && Number.isFinite(e.senestMs) && e.etaMs > e.senestMs
    ).length,

    udenEtaEllerFrist: aktive.filter(
      (e) => !Number.isFinite(e.etaMs) || !Number.isFinite(e.senestMs)
    ).length,

    /**
     * ⚠ SAMME FUNKTION SOM SKÆRMEN OG SERVEREN — `tjekDisponering()`.
     *
     * Disponering regner det samme på det VISTE VINDUE og skriver eksplicit
     * at de to udsnit er forskellige. Tallet her er hele platformen, og det er
     * hele grunden til at det hører i `kpi/`: Dashboardet henter hverken
     * etaper, biler eller reservationer, så det kan ikke regne det selv.
     *
     * ⚠ EN ETAPE MED TRE SPÆRRINGER TÆLLER ÉN GANG. Det man skal handle på,
     * er turen — ikke bemærkningerne. Talte vi rækkerne, ville en enkelt
     * umulig disponering se ud som tre problemer.
     *
     * ⚠ OG UDEN LISTERNE ER SVARET null, IKKE NUL. En aggregering der ikke
     * fik sine biler, ved ikke at der er nul konflikter — den ved ingenting,
     * og nul ville se ud som et rent hus.
     */
    konflikter: koeretoejer.length
      ? aktive.filter((e) => {
          const enheder = enhedsIder(e).map(
            (id) => koeretoejer.find((k) => k.id === id)).filter(Boolean);
          if (!enheder.length) return false;
          const person = personale.find((x) => x.id === e.personId) || null;
          if (!person) return false;
          const raekker = tjekDisponering({
            reservationerForEtapen: reservationerFraEtape(e),
            enheder,
            person,
            kompetencer: kompetencer.filter((c) => c.personId === person.id),
            reservationer,
            straekninger: etaper
              .filter((x) => x.personId === person.id)
              .map(straekningFraEtape),
            gods: e.maengde || {},
          });
          return raekker.some((r) => r.tone === "bad");
        }).length
      : null,
  };
}

/* ---- Deltaerne --------------------------------------------------------- */

/**
 * Periodeafvigelse i PROCENT — eller `null`.
 *
 * ⚠ NULL VED FØRSTE KØRSEL. Der er ingen forrige at måle imod, og 0 % ville
 * betyde "uændret" — en påstand vi ikke kan bakke op.
 *
 * ⚠ OG NULL NÅR GRUNDLAGET VAR NUL. En stigning fra 0 til 5 er ikke
 * "uendelig procent"; den er ikke en procent. Antallet står ved siden af.
 */
export const deltaPct = (nyt, gammelt) => {
  if (!Number.isFinite(nyt) || !Number.isFinite(gammelt) || gammelt === 0) return null;
  return Math.round(((nyt - gammelt) / gammelt) * 1000) / 10;
};


/**
 * Indkøbets nøgletal for én division — og fakturaernes.
 *
 * `indkoeb` er LINJER (det vi bestilte), `fakturaer` er hvad leverandøren
 * sendte. De to er ikke hinandens spejl, og det er hele grunden til at der
 * er noget at afstemme.
 *
 * ⚠ EN FAKTURA HAR INGEN DIVISION. Den arver den fra den indkøbslinje den
 * er matchet mod. En faktura der IKKE er matchet, har derfor ingen — og
 * hører dermed til BEGGE divisioner, efter samme regel som iDivision().
 * Det er ikke en teknikalitet: en umatchet faktura hører til begge, fordi
 * ingen endnu ved hvem der skal betale den. Det er netop derfor den skal ses.
 */
export function indkoebstal(indkoeb = [], fakturaer = [], leverandoerer = [], division, nu = Date.now()) {
  const mine = indkoeb.filter((i) => iDivision(i, division));
  const linje = new Map(indkoeb.map((i) => [i.id, i]));

  /* Fakturaens division kommer fra dens linje; er der ingen linje, er der
     ingen division — og posten hører til begge. */
  const mineFakturaer = fakturaer.filter(
    (f) => iDivision(linje.get(f?.indkoebId) || null, division));

  /* ⚠ MÅNEDEN ER KALENDERMÅNEDEN OMKRING `nu`, i UTC — samme døgngrænse som
     opgavetal() bruger. Ikke "de sidste 30 dage": et forbrug der skal holdes
     op mod et budget, skal følge den periode budgettet er lagt i. */
  const d = new Date(nu);
  const maanedFra = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const maanedTil = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const iMaaneden = (ms) => Number.isFinite(ms) && ms >= maanedFra && ms < maanedTil;

  /* ⚠ EN ORDRE ER IKKE EN LINJE. `reference` er leverandørens eget
     ordrenummer, og én ordre kan bære flere linjer — tæller vi linjer, stiger
     tallet fordi nogen bestilte to ting på samme ordre. Linjer uden reference
     tæller for sig selv; de ER hver sin bestilling.
     Åben = ikke leveret. Der er ingen ordrestatus i modellen, og der skal
     ikke opfindes en: `leveretMs` ER svaret på om varen er kommet. */
  const aabne = mine.filter((i) => !Number.isFinite(i.leveretMs));
  const aabneOrdrer = new Set(aabne.map((i) => i.reference || i.id)).size;

  /* ⚠ GODKENDT ER LINJENS EGEN GODKENDELSE, IKKE FAKTURAENS. `godkendtAf`
     står på linjer hvis fakturastatus er både "modtaget" og "bogfoert" —
     altså er det ikke fakturaen der er godkendt, men indkøbet. Varer der er
     kommet ind som ingen har skrevet under på, er den huskeliste kortet viser. */
  const varerTilGodkendelse = mine.filter(
    (i) => Number.isFinite(i.leveretMs) && !Number.isFinite(i.godkendtMs)).length;

  const levering = leveringspraecision(mine);
  const afvig = prisafvigelser(indkoeb, leverandoerer, division);

  return {
    aabneOrdrer,
    varerTilGodkendelse,

    /* ⚠ TO FORSKELLIGE SPØRGSMÅL, SAMME ORD.
       Her: linjer hvis EGEN fakturastatus er "mangler" — registratorens
       udsagn om at fakturaen ikke er kommet.
       beregnNoegletal().manglendeFakturaer er noget andet: linjer som ingen
       fakturapost peger på. Det er afstemningen, og den kan kun stilles pr.
       leverandør, hvor man ved at man har alle fakturaerne. På hele noden
       ville den tælle enhver linje hvis faktura ligger i et andet system. */
    manglerFaktura: mine.filter((i) => i.fakturastatus === "mangler").length,

    godkendtDenneMaaned: mine.filter((i) => iMaaneden(i.godkendtMs)).length,
    maanedensForbrugOere: mine
      .filter((i) => iMaaneden(i.dato))
      .reduce((sum, i) => sum + indkoebBeloebOere(i), 0),

    /* ⚠ null UNDER GRUNDLAGET, IKKE 0 %. "50 % til tiden" ved to leveringer
       og ved to hundrede ser ens ud i et nøgletalskort. Samme grænse som
       leverandørens eget tal — den er importeret, ikke skrevet af. */
    leveranceTilTidenPct:
      levering.grundlag >= MINDSTE_GRUNDLAG ? levering.pct : null,

    fakturaerTilGodkendelse: mineFakturaer.filter((f) => f.status === "modtaget").length,

    /* ⚠ HER STOD null, MED "leverandoerer/ findes ikke som node" SOM GRUND.
       Nu findes den, og det er den SAMME prisPaa() beregnNoegletal() bruger
       pr. leverandør — som noten lovede. De to kan derfor ikke blive uenige
       om hvad en afvigelse er.
       Stadig null hvis intet kunne måles: en leverandør uden prisliste har
       ingen aftale at afvige fra, og 0 ville lyde som "ingen afveg". */
    indkoebsprisafvigelser: afvig.antal,
    indkoebsprisafvigelseSnitPct: afvig.snitPct,
  };
}

/** Servicevinduet: 30 dage frem, og alt der er overskredet. */
export const SERVICE_VINDUE_DAGE = 30;

/**
 * Indberetninger i tilstanden `ny` for divisionen.
 *
 * ⚠ "NY" ER FORLØBETS FØRSTE TILSTAND, ikke "oprettet for nylig". Feltet
 * hedder `nyeIndberetninger` og kunne læses som en tidsafgrænsning — men
 * FORLOEB i indberetninger.js har seks tilstande, og `ny` betyder "meldt,
 * ikke vurderet endnu". Det er den huskeliste kortet skal vise: en skade der
 * er tre uger gammel og stadig ikke vurderet, hører ØVERST på den, ikke af.
 *
 * ⚠ DEN STOD SOM ET HARDKODET 3 i Dashboard.jsx og sagde det samme i hver
 * eneste tenant. Noden har haft regler og et indeks hele tiden — den var bare
 * tom, og fordi feltet kun blokerede ét kort, stod den ikke på nogen liste.
 */
export function indberetningstal(indberetninger = [], division) {
  return {
    nyeIndberetninger: indberetninger.filter(
      (i) => iDivision(i, division) && i.forloeb === "ny").length,
  };
}

/**
 * Facilitys nøgletal.
 *
 * ⚠ DE FLESTE ER ENS I BEGGE DIVISIONER, OG DET ER SVARET — ikke en fejl.
 * Facility er fælles: aktiverne er de samme uanset division, og reglerne
 * FORBYDER feltet på lokationer, aktiver og fejl. En port i Hal B er ikke
 * gods eller bus; det er en port, og begge afdelinger kører ind ad den.
 * Se den lange note ved UDEN_DIVISION.
 *
 * ⚠ TO FELTER ER ALLIGEVEL DELT — og forskellen er værd at forstå:
 * `planlagtVedligehold` kommer fra `opgaver` og `eksterneLeverandoerer` fra
 * `leverandoerer`, og de to noder BÆRER en division. Aktivet er GENSTANDEN og
 * kan ikke deles; ARBEJDET på det er planlagt af en afdeling og kan.
 */
export function facilitytal({
  aktiver = [], fejl = [], sensorer = [], opgaver = [], leverandoerer = [],
  division, nu = Date.now(),
} = {}) {
  const mineOpgaver = opgaver.filter((o) => iDivision(o, division));

  /* ⚠ OVERSKREDET TÆLLER MED. "Forfalder" er ikke "forfalder snart" — en
     service der skulle have været lavet for en måned siden, er ikke holdt op
     med at forfalde. Vinduet er de samme 30 dage som serviceTone() farver
     efter og som flaade.serviceInden30 bruger; to vinduer for samme slags
     spørgsmål ville give to tal der begge så rigtige ud. */
  const graense = nu + SERVICE_VINDUE_DAGE * DAG;

  const prArt = {};
  for (const a of aktiver) {
    if (!a?.art) continue;
    prArt[a.art] = (prArt[a.art] || 0) + 1;
  }

  /* ⚠ ÉT SÆT, TO TAL. `planlagtVedligehold` og `anslaaetServiceOere` skal
     beskrive de SAMME besøg — står de ved siden af hinanden på skærmen, er
     summen divideret med antallet ellers en pris pr. besøg der ikke findes.
     Listen bygges derfor én gang her. */
  const planlagteBesoeg = mineOpgaver.filter(
    (o) => o.art === "facility" && o.status === "planlagt");

  return {
    aktiver: aktiver.length,

    servicepunkterForfalder: aktiver.filter(
      (a) => Number.isFinite(a.naesteServiceMs) && a.naesteServiceMs <= graense).length,

    /* ⚠ ALT DER IKKE ER UDBEDRET. Ikke "ny" alene: en fejl der er planlagt
       eller i gang, er stadig en fejl der ikke er væk. Samme regel som
       demoAabneFejl() i demo-facility.js. */
    aabneFejl: fejl.filter((f) => f.status !== "udbedret").length,

    /* ⚠ EN SENSOR ER AKTIV NÅR DEN LEVERER. Tælles hele listen, tæller man
       også den der er holdt op med at sende — og så ser overvågningen hel ud
       netop dér hvor den er gået i stykker. */
    sensorerAktive: sensorer.filter((s) => Number.isFinite(s?.aktuel?.ms)).length,

    /* ⚠ ET OBJEKT, IKKE ET TAL — arter mod antal, til donutten. Summen SKAL
       være `aktiver`, og fordi begge tælles af den SAMME liste her, kan de
       ikke drive fra hinanden. Det var netop dét mockuppen tog fejl af. */
    aktiverPrArt: prArt,

    /* ⚠ PLANLAGT VEDLIGEHOLD ER EN OPGAVE MED art: "facility" — ikke et
       aktiv med en fremtidig service. Opgaven er ARBEJDET, aktivet er
       GENSTANDEN. Talte vi aktiver, ville "planlagt vedligehold" stige hver
       gang nogen købte en port. */
    planlagtVedligehold: planlagteBesoeg.length,

    /* ⚠ EKSTERNE — altså leverandører i facility-kategorien, ikke vores egne
       folk. `aktiv` skal med: en leverandør vi er holdt op med at bruge, er
       ikke en vi kan ringe til. */
    eksterneLeverandoerer: leverandoerer.filter(
      (l) => l.aktiv !== false && l.kategori === "facility"
        && iDivision(l, division)).length,

    /* ⚠ KRÆVER HISTORIK, ikke en tilstand. "Alarmer udløst I DAG" er noget
       andet end "alarmer der er aktive NU" — det sidste er AFLEDT af måling
       plus zonens grænse og holdes bevidst ude af kpi/. Døgnets udløsninger
       skal læses af `facility/sensorer/<zone>/maalinger`, og den node er tom:
       ingen skriver målinger endnu. */
    klimaalarmerIDag: null,

    /* `sager/` findes ikke — beslutning 20 er fase 0, kun visning. */
    aabneSager: null,

    /**
     * ⚠ HER STOD `null` MED EN FORÆLDET GRUND: "servicebesøgene har ingen
     * node. De ligger i demo-facility.js med `estimatOere`."
     *
     * Begge dele holdt op med at være sandt ved beslutning 49: besøgene ER
     * `opgaver` med art `facility`, feltet hedder `beloebOere`, og
     * Servicekalenderen læser noden. Kilden har altså ligget der siden — og et
     * felt der får en kilde, skal ud af efterslæbet, ikke blive stående med en
     * begrundelse der peger på en fil ingen læser mere.
     *
     * ⚠ SAMME SÆT SOM `planlagtVedligehold`, OG DET ER IKKE dovenskab: de to
     * tal står ved siden af hinanden på skærmen. Talte det ene også
     * `afventer`, ville "anslået omkostning divideret med planlagte besøg"
     * være en pris pr. besøg der ikke findes.
     *
     * ⚠ ET BESØG UDEN BELØB TÆLLER SOM NUL, ikke som et gæt. Formularen
     * spørger ikke om prisen — den kendes sjældent når arbejdet bestilles —
     * og et estimat opfundet her ville se ud som en måling.
     */
    anslaaetServiceOere: planlagteBesoeg.reduce(
      (sum, o) => sum + (Number.isFinite(o.beloebOere) ? o.beloebOere : 0), 0),
  };
}

/**
 * Prisafvigelserne: hvad vi BETALTE, målt mod hvad vi AFTALTE.
 *
 * ⚠ MOD DEN PRIS DER GJALDT DA VI KØBTE — ikke mod dagens. Havde leverandøren
 * en prisregulering i april, ville en faktura fra marts pludselig se forkert
 * ud målt mod "aftalen", og afvigelsen ville pege på leverandøren frem for på
 * os. prisPaa() slår derfor op PÅ INDKØBETS DATO.
 *
 * ⚠ OG EN LINJE UDEN AFTALT PRIS TÆLLER SLET IKKE MED — hverken som afvigelse
 * eller som "ingen afvigelse". Et spotkøb af en vare der ikke står i
 * prislisten, har ingen aftale at afvige fra. Talte vi den med som 0 %, ville
 * gennemsnittet blive trukket mod nul af netop de køb ingen har forhandlet.
 *
 * ⚠ GRÆNSEN AFHÆNGER AF AFTALEFORMEN. En fastaftale der afviger 4 %, er et
 * brud på aftalen; et spotkøb der gør det, er markedet. Samme tal, to
 * betydninger — og en optælling der brugte én grænse, ville enten drukne
 * brudene eller melde markedet som brud. Det er samme skel som
 * prisafvigelseTone() bruger på skærmen, og de to læser de samme to
 * konstanter.
 *
 * Returnerer `{antal, snitPct}`, begge `null` hvis intet kunne måles.
 */
export function prisafvigelser(indkoeb = [], leverandoerer = [], division) {
  const kartotek = new Map(
    leverandoerer.map((l) => [l.id, leverandoerFraDb(l, l.id)]));

  const maalte = [];
  for (const i of indkoeb) {
    if (!iDivision(i, division)) continue;
    const lev = kartotek.get(i.leverandoerId);
    if (!lev) continue;
    const aftalt = prisPaa(lev, i.varenummer, i.dato);
    if (!aftalt || !Number.isInteger(aftalt.prisOere) || aftalt.prisOere === 0) continue;
    if (!Number.isInteger(i.prisPrEnhedOere)) continue;

    const pct = ((i.prisPrEnhedOere - aftalt.prisOere) / aftalt.prisOere) * 100;
    const fast = AFTALETYPE[lev.aftale?.type]?.forventerFastPris;
    const graense = fast
      ? PRISAFVIGELSE_GRAENSE_FAST_PCT
      : PRISAFVIGELSE_GRAENSE_SPOT_PCT;
    maalte.push({ pct, over: Math.abs(pct) > graense });
  }

  /* ⚠ null OG IKKE 0 NÅR INTET KUNNE MÅLES. "Ingen afvigelser" og "vi har
     ikke aftalen at måle mod" er to forskellige beskeder, og den ene beder om
     ingenting mens den anden beder om en prisliste. */
  if (!maalte.length) return { antal: null, snitPct: null };

  const sum = maalte.reduce((s, m) => s + m.pct, 0);
  return {
    antal: maalte.filter((m) => m.over).length,
    snitPct: Math.round((sum / maalte.length) * 10) / 10,
  };
}

/**
 * Fakturaer der ikke er koblet til et indkøb. Står under `flaade`, fordi det
 * er Værkstedskalenderen der skal reagere på dem.
 *
 * ⚠ BÅDE DEN TOMME OG DEN HÆNGENDE REFERENCE TÆLLER MED. En faktura uden
 * `indkoebId` er åbenlyst ulinket; en med et id der ikke findes, SER linket
 * ud og er det ikke. Demoen havde netop sådan en — "ik-001", hvor alle
 * linjer hedder il-XXX. Tæller man kun de tomme, er den hængende usynlig,
 * og det er den farligste af de to: den er allerede talt som afstemt.
 *
 * Ingen division: en ulinket faktura har ingen linje at arve den fra, og
 * derfor tæller den i begge. Se noten i indkoebstal().
 */
export function ikkeLinkedeFakturaer(fakturaer = [], indkoeb = []) {
  const findes = new Set(indkoeb.map((i) => i.id));
  return fakturaer.filter((f) => !f?.indkoebId || !findes.has(f.indkoebId)).length;
}


/**
 * Varenumre der ligger i kategorien `braendstof`, men IKKE er brændstof.
 *
 * ⚠ ADBLUE ER ET ADDITIV, IKKE ET BRÆNDSTOF. Kravet står i README ved
 * `flaade.braendstofOere`: lagt med i forbruget ville tallet se ~5 % bedre
 * ud end det er, og et forbrugstal der er for godt, bliver ikke undersøgt.
 *
 * ⚠ OG DET ER EN LAP, IKKE EN MODEL. Den rigtige plads er `kategori`, som er
 * en lukket ordliste i firebase.rules.json — men den har ingen værdi for et
 * additiv, og AdBlue-linjerne bærer derfor "braendstof". Indtil ordlisten får
 * en, er varenummeret det eneste sted forskellen står. Listen ligger her og
 * ikke som en `if` inde i regnestykket, så den kan læses og udvides ét sted:
 * den næste AdBlue er urea under et andet handelsnavn.
 */
export const IKKE_BRAENDSTOF = ["ADBLUE"];

/**
 * Månedens brændstofkøb for divisionen, i øre.
 *
 * ⚠ KATEGORIEN, IKKE VARENAVNET. `kategori` er en lukket ordliste i
 * firebase.rules.json — "braendstof" er en af syv tilladte værdier. En
 * søgning på "diesel" i varenavnet ville tage "Dieselfilter" med, og det er
 * en reservedel. Undtagelsen er additiverne ovenfor, som kategorien ikke kan
 * skelne fra brændstof.
 *
 * Samme måned som maanedensForbrugOere: brændstof er en delmængde af den,
 * og to forskellige perioder ville gøre andelen umulig at regne.
 */
export function braendstofOere(indkoeb = [], division, nu = Date.now()) {
  const d = new Date(nu);
  const fra = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const til = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return indkoeb
    .filter((i) => iDivision(i, division) && i.kategori === "braendstof")
    .filter((i) => !IKKE_BRAENDSTOF.includes(i.varenummer))
    .filter((i) => Number.isFinite(i.dato) && i.dato >= fra && i.dato < til)
    .reduce((sum, i) => sum + indkoebBeloebOere(i), 0);
}

/**
 * Nodens FULDE form, med `null` i hvert eneste blad.
 *
 * ⚠ RTDB GEMMER IKKE null. Et felt der skrives som null, BLIVER SLETTET — og
 * er hele domænet null, forsvinder domænet. Målt på den udrullede base efter
 * første rigtige aggregering: `bemanding` fandtes overhovedet ikke i noden,
 * fordi alle ni felter var null. `afvigelser: []` forsvandt af samme grund.
 *
 * Det slår hovedet i denne fil ihjel som teknik: "Feltet SKAL med i objektet,
 * så man kan se af noden hvad der mangler" kan databasen ikke levere.
 * Bemanding-skærmen læste `k.bemanding.disponeret` og blev HVID.
 *
 * ⚠ SKELETTET UDLEDES AF beregnKpi() SELV, ikke skrevet af. En håndskreven
 * liste ville være et andet sted formen stod, og den ville drive fra
 * beregningen første gang nogen tilføjede et felt. Her kan den ikke:
 * skelettet ER beregningens svar, med bladene nulstillet.
 *
 * Brugt af useKpi() til at lægge under det hentede, så en skærm altid får
 * hvert domæne og hvert felt — og `num()` skriver INTET for dem der mangler,
 * i stedet for at skærmen kaster.
 */
export function kpiSkelet(division = "gods") {
  const fuld = beregnKpi({ division });
  const ud = {};
  for (const [domaene, vaerdi] of Object.entries(fuld)) {
    if (Array.isArray(vaerdi)) { ud[domaene] = []; continue; }
    if (!vaerdi || typeof vaerdi !== "object") { ud[domaene] = null; continue; }
    ud[domaene] = Object.fromEntries(Object.keys(vaerdi).map((f) => [f, null]));
  }
  return ud;
}

/**
 * Det hentede lagt oven på skelettet — ét domæne ad gangen.
 *
 * ⚠ IKKE EN DYB FLETNING. Formen er præcis to niveauer: domæne → felt. En
 * generisk deep merge ville også flette `aktiverPrArt`s arter og `afvigelser`s
 * poster sammen med et tomt skelet, og så ville en tom fordeling arve nøgler
 * der ikke var i svaret.
 */
export function medFuldForm(hentet, division = "gods") {
  if (!hentet) return null;
  const skelet = kpiSkelet(division);
  const ud = { ...skelet, ...hentet };
  for (const [domaene, felter] of Object.entries(skelet)) {
    if (!felter || typeof felter !== "object" || Array.isArray(felter)) continue;
    ud[domaene] = { ...felter, ...(hentet[domaene] || {}) };
  }
  return ud;
}

/**
 * Periodeafvigelse i PROCENTPOINT — eller `null`.
 *
 * ⚠ IKKE DET SAMME SOM deltaPct. 68 % der bliver til 72 % er +4 POINT, ikke
 * +5,9 %. Feltnavnet siger hvilket, og blandes de to, er tallet rigtigt på
 * den ene læsning og forkert på den anden — uden at nogen kan se hvilken.
 */
export const deltaPoint = (nyt, gammelt) => {
  if (!Number.isFinite(nyt) || !Number.isFinite(gammelt)) return null;
  return Math.round((nyt - gammelt) * 10) / 10;
};

/**
 * Hele nøgletalsobjektet for én division.
 *
 * `forrige` er sidste kørsels objekt for samme division, eller null. Deltaer
 * regnes af den; første kørsel giver `null` overalt.
 */
export function beregnKpi({
  division, kunder = [], etaper = [], grundlag = [], opgaver = [],
  /* ⚠ DE FIRE KOM TIL FOR `disponering.konflikter`. De fem tjek er en REN
     funktion, men den skal have sine lister — og uden dem svarer feltet null
     frem for nul: en aggregering der ikke fik sine biler, ved ikke at der er
     nul konflikter. */
  koeretoejer = [], personale = [], kompetencer = [], reservationer = {},
  indkoeb = [], fakturaer = [], leverandoerer = [], indberetninger = [],
  /* ⚠ FACILITY ER TRE LISTER, IKKE ÉN. Noden har børn — aktiver, fejl og
     sensorer — og de tælles hver for sig. Ét samlet argument ville have
     skjult hvilke af dem der faktisk blev læst. */
  facilityAktiver = [], facilityFejl = [], facilitySensorer = [],
  /* ⚠ BOOKINGERNE KOM MED FOR `opgaver.nyeBookinger` — arbejde der er kommet
     ind siden forrige beregning. Feltet tæller bookinger, ikke opgaver; det
     står i opgaver-domænet fordi det er ARBEJDE der kommer ind. */
  bookinger = [],
  forrige = null, nu = Date.now(),
}) {
  const tomme = udenKilde();
  const kunde = kundetal(kunder, division, nu);
  const ikkeFakt = ikkeFaktureretOere(etaper, grundlag, division);
  const disp = disponeringstal(etaper, division, {
    koeretoejer, personale, kompetencer, reservationer,
  });
  const opg = opgavetal(opgaver, division, nu, { bookinger, forrige });
  const ind = indkoebstal(indkoeb, fakturaer, leverandoerer, division, nu);
  const fac = facilitytal({
    aktiver: facilityAktiver, fejl: facilityFejl, sensorer: facilitySensorer,
    opgaver, leverandoerer, division, nu,
  });

  return {
    ...tomme,
    beregnetMs: nu,
    facility: {
      ...fac,
      /* ⚠ aktiverDeltaPct ER PROCENT; DE TRE ANDRE ER ANTAL.
         Feltnavnene siger hvilket. To planlagte vedligehold der bliver til
         fire, er +2 — en procent af et lille tal er støj, og aktivbasen er
         det eneste af de fire der er stort nok til at en procent betyder
         noget. Se noten i demo-kpi.js. */
      aktiverDeltaPct: deltaPct(fac.aktiver, forrige?.facility?.aktiver),
      servicepunkterDelta: deltaPoint(
        fac.servicepunkterForfalder, forrige?.facility?.servicepunkterForfalder),
      planlagtVedligeholdDelta: deltaPoint(
        fac.planlagtVedligehold, forrige?.facility?.planlagtVedligehold),
      /* `sager/` findes ikke, så basen er null — og en delta af to null er
         ikke 0, den er stadig ubesvaret. */
      aabneSagerDelta: deltaPoint(
        fac.aabneSager, forrige?.facility?.aabneSager),
    },
    opgaver: {
      ...opg,
      aabneDeltaPct: deltaPct(opg.aabne, forrige?.opgaver?.aabne),
      /* ⚠ SAMME TAL SOM oekonomi.ikkeFaktureretForloeb, MED VILJE.
         Booking-oversigten kalder det "forløb klar til fakturering" og
         Økonomi kalder det "ikke faktureret" — det er samme spørgsmål:
         afsluttede bookinger uden et låst grundlag. Regnede de to felter
         hver sin gæng, ville to skærme kunne vise hver sit tal for den
         samme liste, og ingen kunne se hvilken der løj. ÉN beregning,
         to navne — og navnene bliver, fordi skærmene læser dem. */
      klarTilFakturering: ikkeFakt.forloeb,
    },
    indkoeb: {
      ...ind,
      aabneOrdrerDeltaPct: deltaPct(ind.aabneOrdrer, forrige?.indkoeb?.aabneOrdrer),
      fakturaerTilGodkendelseDeltaPct: deltaPct(
        ind.fakturaerTilGodkendelse, forrige?.indkoeb?.fakturaerTilGodkendelse),
      /* ⚠ PROCENTPOINT. 92 % der bliver til 97 % er +5 point. Feltnavnet
         siger hvilket — se noten i demo-kpi.js. */
      leveranceTilTidenDeltaPoint: deltaPoint(
        ind.leveranceTilTidenPct, forrige?.indkoeb?.leveranceTilTidenPct),
      /* ⚠ ANTAL, IKKE PROCENT — feltnavnet siger det. Nye afvigelser mod
         forrige periode. */
      prisafvigelserDelta: deltaPct(
        ind.indkoebsprisafvigelser, forrige?.indkoeb?.indkoebsprisafvigelser),
    },
    kunder: {
      ...kunde,
      aktiveDeltaPct: deltaPct(kunde.aktive, forrige?.kunder?.aktive),
    },
    oekonomi: {
      /* ⚠ BESLUTNING 25's BETYDNING. Se ikkeFaktureretOere(). */
      ikkeFaktureretOere: ikkeFakt.oere,
      ikkeFaktureretForloeb: ikkeFakt.forloeb,
      ikkeFaktureretDeltaPct: deltaPct(ikkeFakt.oere, forrige?.oekonomi?.ikkeFaktureretOere),
      /* Uden `indkoeb` er der ingen driftsomkostninger at lægge sammen. */
      driftsomkostningerOere: null,
      driftsomkostningerDeltaPct: null,
      budgetOere: null,
      daekningsgradPct: null,
      maalDaekningsgradPct: null,
      daekningsgradDeltaPoint: null,
      driftstimer: null,
      planlagtPct: null,
      akutPct: null,
      /* ⚠ KAN IKKE UDLEDES AF `opgaver`. En opgave har `art`
         (vaerksted | facility) og en status — men intet felt der siger om
         arbejdet var PLANLAGT eller AKUT. At kalde art=vaerksted for akut
         ville være et gæt, og Dashboardet regner `100 - x` af tallet: et
         gæt her bliver til to tal der ser ud til at supplere hinanden.
         Dashboardet læser feltet i dag og fik `undefined` — og undefined er
         værre end null: 100 - undefined er NaN. */
      planlagtVedligeholdPct: null,
    },
    disponering: {
      ...disp,
      planlagteOpgaverDeltaPct: deltaPct(
        disp.planlagteOpgaver, forrige?.disponering?.planlagteOpgaver),
    },
    /* ⚠ ET ENESTE FELT UNDER `flaade` KAN REGNES — og det er ikke et hul i
       det åbne divisionsspørgsmål. De øvrige flaadefelter mangler fordi
       KØRETØJET ikke bærer en division; en ulinket faktura mangler ikke en
       division, den HAR ingen, og skal derfor ses i begge. De to slags null
       ligner hinanden i noden og er ikke det samme spørgsmål. */
    flaade: {
      ...tomme.flaade,
      ikkeLinkedeFakturaer: ikkeLinkedeFakturaer(fakturaer, indkoeb),
      /* ⚠ BRÆNDSTOFFET KOMMER FRA INDKØBET, IKKE FRA BILERNE. Derfor kan
         det regnes selv om resten af `flaade` ikke kan: det er
         indkøbslinjens division der spørges om, og den BÆRER en. Bilen gør
         ikke, og det er hele forskellen. */
      braendstofOere: braendstofOere(indkoeb, division, nu),
      ...indberetningstal(indberetninger, division),
    },

    /* ⚠ TOM LISTE, IKKE null. Afvigelserne er en LISTE — findes der ingen,
       er svaret en tom liste, og det er et svar. Se demo-kpi.js. */
    afvigelser: [],
    warehouse: { carriereUdenLokationDelta: null },
  };
}
