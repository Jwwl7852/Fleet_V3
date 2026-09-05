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
import { laveVarer, udenGraense } from "./forbrugsvarer.js";
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
 * `tenants/<id>/kpi/current/oekonomi` direkte, uanset hvad hans forside
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
  /* ⚠ IKKE LÆNGERE `grundlag` — beslutning 104. Domænets eneste
     grundlagsfelt var `klarTilFakturering`, og det lå dobbelt: samme tal som
     `oekonomi.ikkeFaktureretForloeb`. Feltet er samlet i økonomidomænet, og
     kilden fulgte med. Ellers ville en disponent miste seksten driftstal for
     at blive nægtet ét faktureringstal. */
  opgaver: ["opgaver", "etaper"],
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
 * ⚠ HER STOD "KUN ÉN I DAG", og sætningen fortsatte: *"værdien ligger i at
 * leddet ER der: den dag en læse-permission strammes, følger nøgletallet med
 * af sig selv, i stedet for at blive husket."*
 *
 * **Den dag er beslutning 104.** `grundlag`, `satser` og de otte Procure-noder
 * fik hver en læse-permission, og fem domæner fulgte med — uden at nogen
 * skrev dem her i hånden. `test/rules.kpi.test.mjs` udledte listen af
 * kildernes egne regler og fortalte præcis hvilke fem der manglede.
 *
 * Det er hele grunden til at tabellen findes frem for at stå i en `if`:
 *
 *   opgaver   ← grundlag       hvad turen blev faktureret til
 *   oekonomi  ← grundlag       samme
 *   flaade    ← indkoeb        hvad reservedelene kostede
 *   facility  ← leverandoerer  hvem der servicerer anlægget
 *   indkoeb   ← indkoeb        hele modulets nøgletal
 *
 * ⚠ SKIVE 4B — leverandoerer.laes ERSTATTER indkoeb.laes PÅ facility, OG
 * FØJES TIL indkoeb'S LISTE. `leverandoerer` mistede sin indkoeb-klausul og
 * fik sin egen permission (Model B) — begge domæner der har noden som kilde
 * følger med, samme mekanisme som fakturaer i Skive 4A.
 *
 * ⚠ EN CHAUFFØR MISTER DERMED FEM AF TI DOMÆNER PÅ FORSIDEN — og det er ikke
 * en fejl der skal rettes: de fem er regnet af tal han ikke må se. `useKpi()`
 * spørger kun om dem `laesbareDomaener()` siger ja til, så han får ingen
 * `permission-denied`; kortene er der bare ikke.
 *
 * ⚠ ÉT DOMÆNE BÆRER SINE KILDERS PERMISSIONS — ALLE SAMMEN, IKKE ÉN VALGT.
 * Prøven kræver det udtrykkeligt: får et domæne kilder med to forskellige,
 * bliver værdien en LISTE af dem begge, ikke den ene. Det var beslutning
 * bag denne kommentar engang at reglen "kun kan bære ét led" — men Skive 4A
 * viste at et domæne kan have to ægte kilder med to ægte permissions
 * (flaade og indkoeb regnes begge delvist af `fakturaer`, som fik sin egen
 * permission adskilt fra `indkoeb.laes`). Formen blev derfor ændret til at
 * kræve HELE listen, i stedet for at vælge én og håbe de altid følges ad.
 */
export const KPI_PERM = {
  kunder: "kunder.laes",
  /* ⚠ BESLUTNING 121 — TO KILDER, TO PERMISSIONS. `etaper` fik sin første
     læse-permission, og `oekonomi` er regnet af BÅDE `etaper` og `grundlag`
     (se KPI_KILDER) — samme mønster som `flaade`/`indkoeb` med to kilder. */
  oekonomi: ["etaper.laes", "grundlag.laes"],
  flaade: ["indkoeb.laes", "fakturaer.laes"],
  facility: "leverandoerer.laes",
  indkoeb: ["indkoeb.laes", "fakturaer.laes", "leverandoerer.laes"],
  /* ⚠ BESLUTNING 121 — NYE, FORDI etaper ER DERES ENESTE KILDE. */
  opgaver: "etaper.laes",
  disponering: "etaper.laes",
};

/**
 * De domæner en bruger overhovedet kan læse — modul OG permission.
 *
 * ⚠ SAMME FUNKTION I SKÆRMEN OG I PRØVEN. `useKpi()` henter kun dem der står
 * her — ellers ville hver eneste sideindlæsning bede om noget reglerne
 * afviser, og en `permission-denied` ville stå i konsollen på hver tur.
 * En afvisning skal betyde noget.
 */
/** KPI_PERM[d] er enten én permission, en liste af dem, eller fraværende. */
const harKravene = (harPermFn, krav) =>
  !krav || (Array.isArray(krav) ? krav.every(harPermFn) : harPermFn(krav));

export const laesbareDomaener = (harModulFn = () => true, harPermFn = () => true) =>
  ALLE_KPI_DOMAENER.filter((d) =>
    (!KPI_DOMAENE[d] || harModulFn(KPI_DOMAENE[d]))
    && harKravene(harPermFn, KPI_PERM[d]));

/**
 * Hvorfor et domæne IKKE blev hentet — beslutning 105.
 *
 * ⚠ ET UHENTET DOMÆNE SÅ UD SOM ET UBEREGNET. `medFuldForm()` lægger
 * skelettet tilbage, så ingen skærm bliver hvid — og hvert felt bliver
 * `null`, som `num()` skriver som **—**. Den streg betyder *ikke beregnet*,
 * og her betyder den *må ikke ses*. To forskellige kendsgerninger, ét tegn.
 *
 * Det er den samme skelnen som `TILSTAND.modulMangler` mod `naegtet`
 * (beslutning 95) og som `MAALING_AARSAG` (91), og den manglede for nøgletal:
 * en chauffør så fire af ti domæner som streger på forsiden og kunne tro at
 * systemet ingen tal havde.
 *
 * ⚠ TO GRUNDE, TO HANDLINGER. `modul` betyder at nogen skal ringe til os;
 * `perm` at nogen skal se på rettighederne. `laesbareDomaener()` blander dem
 * med vilje — den skal kun svare JA eller NEJ — så de skilles her.
 *
 * @returns {{[domaene: string]: "modul"|"perm"}} kun de utilgængelige
 */
export const DOMAENE_AARSAG = { modul: "modul", perm: "perm", afvist: "afvist" };

export function utilgaengeligeDomaener(harModulFn = () => true, harPermFn = () => true) {
  const ud = {};
  for (const d of ALLE_KPI_DOMAENER) {
    /* ⚠ MODULET FØRST. Har kunden ikke købt modulet, er permissionen et
       spørgsmål der aldrig blev stillet — og "du mangler en rettighed" ville
       sende brugeren til sin administrator over noget der skal købes. */
    if (KPI_DOMAENE[d] && !harModulFn(KPI_DOMAENE[d])) ud[d] = DOMAENE_AARSAG.modul;
    else if (!harKravene(harPermFn, KPI_PERM[d])) ud[d] = DOMAENE_AARSAG.perm;
  }
  return ud;
}

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
 * Det var samme regel som iDivision() bar, dengang der var en akse: en post
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

     ⚠ OG udenKilde() ER SELV TOM NU. Flaaden og bemandingen fik deres kilde
     i beslutning 69 — spoergsmaalet "kan de deles paa division" var besvaret
     hele tiden i beslutning 19's foerste saetning: ingen abonnent har baade
     gods og bus. Det der stadig er null, staar INDE i regnestykkerne med hver
     sin grund; optaellingen ligger paa noden og ikke her. */
];

const DAG = 86400000;

/* ⚠ HER LÅ iDivision(post, division) — fjernet i beslutning 70.

   Reglen var: en post UDEN division hører til BEGGE, ikke til ingen. Det led
   var det vigtigste i funktionen — uden det ville beslutning 19's fjernelse af
   feltet fra bilerne have tømt biltabellen i begge divisioner, uden at nogen
   havde slettet en bil.

   ⚠ OG DET LED VAR SELV OPLYSNINGEN. "Vis den i begge" er svaret man giver,
   når aksen ikke passer på dataene — og det svar gjaldt til sidst stamdata
   (19), facility, flåden og bemandingen (69). En opdeling hvor svaret oftest
   er "begge", deler ikke noget.

   ⚠ OG DEN MÅ IKKE KOMME TILBAGE SOM ET FILTER PÅ null. En `iDivision(post,
   null)` der svarer true på alt, ville se harmløs ud og være en akse der
   ligger og venter: det næste kaldsted sender en rigtig værdi, og så er
   halvdelen af tallene væk uden at noget fejler. Der er ikke et filter der
   slipper alt igennem — der er intet filter. */

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
    /* ⚠ FLÅDEN OG BEMANDINGEN STÅR IKKE LÆNGERE HER — se flaadetal() og
       bemandingstal(). Divisionsspørgsmålet er besvaret (beslutning 69):
       ingen abonnent har både gods og bus, så der er ikke noget at dele op,
       og felterne kunne regnes.

       ⚠ DE SYV DER STADIG ER null, ER null INDE I DE TO FUNKTIONER, hver med
       sin skrevne grund ved siden af regnestykket — og grundene er af TO
       slags: nedetiden og omkostningen pr. km har en KILDE vi ikke fører,
       mens vagtplanen og "underbemandet" ikke har et SPØRGSMÅL der er stillet
       færdigt. De to ser ens ud i noden og er det ikke.

       Kun de HELT ukendte kilder samles her — og der er ingen tilbage. */
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
export function kundetal(kunder = [], nu = Date.now()) {
  return {
    aktive: kunder.filter((k) => k.aktiv !== false).length,
    aftalerUdloeber: kunder.filter(
      (k) => Number.isFinite(k.aftaleUdloeberMs)
        && k.aftaleUdloeberMs > nu
        && k.aftaleUdloeberMs - nu <= 30 * DAG).length,
    /**
     * ⚠ ET TILBUD ER IKKE EN BOOKING, OG DER ER INGEN NODE TIL DET.
     *
     * Bookingen er AFTALEN; tilbuddet er det der kom før — og som måske aldrig
     * blev til noget. At tælle bookinger som tilbud ville gøre hitraten til
     * 100 % pr. definition. Feltet venter altså på en ENTITET, ikke på et
     * seed: `tilbud/` findes hverken i `firebase.rules.json` eller i
     * ARKITEKTUR.md.
     */
    tilbud: null,
    tilbudKraeverOpfoelgning: null,

    /**
     * ⚠ HALVDELEN AF ET DÆKNINGSBIDRAG ER ET MISVISENDE TAL.
     *
     * Omsætningen findes nu — bookingen bærer `omsaetningOere` (beslutning
     * 55). Omkostningen pr. KUNDE gør ikke: en indkøbslinje hører til en
     * leverandør og en division, en opgave til en enhed. Ingen af dem peger
     * på den kunde turen blev kørt for.
     *
     * Regnede vi bidraget af omsætningen alene, ville hver kunde stå med
     * 100 % margin — et tal der ser ud som en måling og er et regnestykke der
     * mangler sit ene led. Samme grund som `100 - null` er forbudt.
     */
    daekningsbidragOere: null,

    /* ⚠ DELTAERNE ER null FORDI GRUNDLAGET ER DET. `aktive` kan regnes, men
       dens delta kræver en FORRIGE kørsel; `daekningsbidrag` mangler selve
       tallet. To slags null igen — den ene venter på i nat, den anden på en
       kilde. */
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
export function ikkeFaktureretOere(etaper = [], grundlag = []) {
  const laasteForloeb = new Set(
    grundlag
      .filter((g) => g.tilstand === "laast" && !g.erstattetAfId && g.bookingId)
      .map((g) => g.bookingId));

  const udfoerte = etaper.filter(
    (e) => e.tilstand === "udfoert" && e.bookingId);

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
export function opgavetal(opgaver = [], nu = Date.now(), {
  /* ⚠ BOOKINGERNE KOM MED FOR `nyeBookinger`. Feltet tæller bookinger, ikke
     opgaver — det står i `opgaver`-domænet fordi det er ARBEJDE der kommer
     ind, og det er den skærm der spørger. */
  bookinger = [], forrige = null,
} = {}) {
  const medStatus = (s) => opgaver.filter((o) => o.status === s).length;
  const AABNE = ["indberettet", "planlagt", "igang", "afventer"];

  const startetIDag = (o) => {
    if (!Number.isFinite(o.startMs)) return false;
    const d = new Date(nu);
    const fra = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return o.startMs >= fra && o.startMs < fra + DAG;
  };

  return {
    aabne: opgaver.filter((o) => AABNE.includes(o.status)).length,
    indberettet: medStatus("indberettet"),
    planlagt: medStatus("planlagt"),
    igang: medStatus("igang"),
    afventer: medStatus("afventer"),
    udfoert: medStatus("udfoert"),
    annulleret: medStatus("annulleret"),
    /* Indberettet = set, men ikke planlagt endnu. Det ER uplanlagt. */
    uplanlagte: medStatus("indberettet"),
    igangIDag: opgaver.filter((o) => o.status === "igang" && startetIDag(o)).length,

    /* ⚠ TIDSREGISTRERINGEN ER `faktiskMin`. En udført opgave uden den er
       netop den række Booking-oversigten beder om: omkostningen er stadig et
       estimat. Kun UDFØRTE tæller — en opgave der er i gang, mangler ikke
       sin tid, den er ikke færdig med at bruge den. */
    udenTidsregistrering: opgaver.filter(
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
    forsinkede: opgaver.filter((o) => {
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
          (b) => Number.isFinite(b.oprettetMs)
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
export function disponeringstal(etaper = [], {
  koeretoejer = [], personale = [], kompetencer = [], reservationer = {},
} = {}) {

  /* ⚠ KUN DE AKTIVE. En udført eller annulleret etape kan ikke blive forsinket,
     og talte de med, ville tallet vokse med historikken frem for med
     problemerne. */
  const aktive = etaper.filter((e) => e.tilstand !== "udfoert" && e.tilstand !== "annulleret");

  return {
    planlagteOpgaver: etaper.filter((e) => e.tilstand === "reserveret").length,
    aabneEtaper: etaper.filter((e) => e.tilstand === "aaben").length,

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
 * hørte dermed til BEGGE divisioner — og siden beslutning 70 er der kun ét sted.
 * Det er ikke en teknikalitet: en umatchet faktura hører til begge, fordi
 * ingen endnu ved hvem der skal betale den. Det er netop derfor den skal ses.
 */
export function indkoebstal(
  indkoeb = [], fakturaer = [], leverandoerer = [], nu = Date.now(),
  /* ⚠ PROCURES EGET VARELAGER, IKKE WAREHOUSES. `forbrugsvarer` er vores
     handsker og strækfilm; `varer`/`beholdning` er KUNDENS gods. Se
     beslutning 84 og 85. */
  forbrugsvarer = [],
) {
  /* ⚠ HER STOD ET OPSLAG `linje` FRA indkoebId TIL INDKØBSLINJEN, og et filter
     der gav fakturaen sin linjes division. Linten fandt navnet som ubrugt, og
     efter beslutning 67 er spørgsmålet hvorfor det stod der — ikke om det kan
     slettes. Svaret: opslaget fandtes UDELUKKENDE for at arve divisionen. Med
     aksen væk (beslutning 70) er det ægte dødt, og fakturaerne bruges hele.

     ⚠ Noten over funktionen holder stadig: en umatchet faktura skal ses,
     fordi ingen endnu ved hvem der skal betale den. Det var argumentet for at
     lade den slippe gennem filteret — og nu er der ikke et filter at slippe
     igennem. */
  const mineFakturaer = fakturaer;

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
  const aabne = indkoeb.filter((i) => !Number.isFinite(i.leveretMs));
  const aabneOrdrer = new Set(aabne.map((i) => i.reference || i.id)).size;

  /* ⚠ GODKENDT ER LINJENS EGEN GODKENDELSE, IKKE FAKTURAENS. `godkendtAf`
     står på linjer hvis fakturastatus er både "modtaget" og "bogfoert" —
     altså er det ikke fakturaen der er godkendt, men indkøbet. Varer der er
     kommet ind som ingen har skrevet under på, er den huskeliste kortet viser. */
  const varerTilGodkendelse = indkoeb.filter(
    (i) => Number.isFinite(i.leveretMs) && !Number.isFinite(i.godkendtMs)).length;

  const levering = leveringspraecision(indkoeb);
  const afvig = prisafvigelser(indkoeb, leverandoerer);

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
    manglerFaktura: indkoeb.filter((i) => i.fakturastatus === "mangler").length,

    godkendtDenneMaaned: indkoeb.filter((i) => iMaaneden(i.godkendtMs)).length,
    maanedensForbrugOere: indkoeb
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

    /**
     * ⚠ HER STOD null MED "INGEN KILDE" SOM GRUND — og kilden findes nu.
     *
     * Noden er `forbrugsvarer`: Procures EGNE forbrugsvarer. Den blev lagt
     * i beslutning 85 netop fordi det alternativ der lå lige for — at regne
     * kortet af Warehouses `varer`/`beholdning` — ville få Procure til at
     * bede os bestille noget en **kunde** mangler. Det er 3PL-gods med et
     * påkrævet `kundeId`, ikke vores.
     *
     * ⚠ OG KUN VARER MED EN GRÆNSE TÆLLER. En vare uden `minimumBeholdning`
     * har ingen "lav"-tilstand; talte vi den med som lav, ville hver ny
     * vare straks stå på listen, og talte vi den som fyldt op, ville vi
     * påstå noget vi ikke ved. Manglen tælles for sig — se `udenGraense()`
     * — og skærmen viser begge tal, for ellers betyder "0 under minimum"
     * både "alt er fyldt op" og "ingen har sat en grænse".
     */
    lavBeholdning: laveVarer(forbrugsvarer).length,

    /* ⚠ OG DE UDEN GRÆNSE TÆLLES MED. Uden dem er tallet ovenfor tvetydigt.
       Samme greb som `opgaver.udenTidsregistrering` (beslutning 50): hullet
       er synligt frem for spærret. */
    forbrugsvarerUdenGraense: udenGraense(forbrugsvarer).length,
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
export function indberetningstal(indberetninger = []) {
  return {
    nyeIndberetninger: indberetninger.filter(
      (i) => i.forloeb === "ny").length,
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
  nu = Date.now(),
} = {}) {
  const mineOpgaver = opgaver;

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
        ).length,

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
export function prisafvigelser(indkoeb = [], leverandoerer = []) {
  const kartotek = new Map(
    leverandoerer.map((l) => [l.id, leverandoerFraDb(l, l.id)]));

  const maalte = [];
  for (const i of indkoeb) {
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
export function braendstofOere(indkoeb = [], nu = Date.now()) {
  const d = new Date(nu);
  const fra = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const til = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return indkoeb
    .filter((i) => i.kategori === "braendstof")
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
/**
 * ⚠ INGEN division-PARAMETER LÆNGERE. Den blev sendt videre til beregnKpi()
 * alene for at skelettet skulle have samme form som det rigtige tal — og den
 * form er nu den samme for alle, fordi aksen er væk (beslutning 70).
 */
export function kpiSkelet() {
  const fuld = beregnKpi({});
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
export function medFuldForm(hentet) {
  if (!hentet) return null;
  const skelet = kpiSkelet();
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
/* ══════════════════════════════════════════════════════════════════════════
   FLÅDEN OG BEMANDINGEN — beslutning 69
   ══════════════════════════════════════════════════════════════════════════

   ⚠ HER LÅ EFTERSLÆBETS SIDSTE STORE POST, og den ventede ikke på data.

   De 17 felter stod i udenKilde() med begrundelsen "kan flåden og bemandingen
   deles på division?" Spørgsmålet er nu besvaret, og svaret var IKKE en
   udledning: **ingen abonnent har både gods og bus.** Det er beslutning 19's
   egen første sætning, og den holder — en busvognmand har kun ét sæt tal, så
   der var aldrig noget at dele op.

   Derfor deles de ikke. Hver af de to funktioner nedenfor tæller på HELE
   tenantens flåde og personale, og resultatet står med samme værdi under
   begge divisioner i kpi/. Det er ikke en afrunding — det er hvad tallet ER.
   Præcis som bemanding.kompetencerUdloeber allerede gjorde det (beslutning
   19: "ét tal, ikke fem i gods og tre i bus. Summen er uændret").

   ⚠ OG iDivision() BRUGES IKKE HER, med vilje. Den ville give det samme svar
   — en post uden division hører til begge — men den ville få det til at ligne
   et FILTER der tilfældigvis slipper alt igennem. Der er ikke noget at
   filtrere: feltet er FORBUDT på koeretoejer og personale, håndhævet med
   .validate: false i reglerne. Et filter mod et forbudt felt er en linje den
   næste bruger tid på at forstå.

   ⚠ DET DER STADIG ER null, ER null AF EN ANDEN GRUND END FØR. Ikke længere
   "vi ved ikke om det kan deles" — men hver sin skrevne grund, ved siden af
   regnestykket.
*/

/**
 * Flådens nøgletal. Tælles på hele tenantens flåde — se noten ovenfor.
 *
 * ⚠ STATUS ER KILDEN, IKKE OPGAVERNE. En bil er "på værksted" fordi dens
 * status siger det — ikke fordi der findes en værkstedsopgave på den. De to
 * kan være uenige (en opgave kan være planlagt til på fredag), og to kilder
 * til ét tal er den fejl der står skrevet over hele dette repo. Statussen er
 * posten OM bilen; opgaven er et stykke arbejde.
 */
export function flaadetal(koeretoejer = [], nu = Date.now()) {
  const medStatus = (s) => koeretoejer.filter((k) => k?.status === s).length;

  return {
    aktive: medStatus("aktiv"),
    udeAfDrift: medStatus("udeAfDrift"),
    paaVaerksted: medStatus("vaerksted"),

    /* ⚠ KUN FREMAD. Et serviceinterval der ligger BAGUD, er overskredet og
       ikke "inden 30 dage" — det er et andet og værre tal, og lagt sammen med
       de kommende ville det se ud som om der var god tid. Samme afgrænsning
       som kundetal().aftalerUdloeber. */
    serviceInden30: koeretoejer.filter(
      (k) => Number.isFinite(k?.naesteServiceMs)
        && k.naesteServiceMs > nu
        && k.naesteServiceMs - nu <= 30 * DAG).length,

    /**
     * ⚠ INGEN KILDE — og driftPrKmOere er ikke den.
     *
     * Feltet på bilen er en SATS: hvad vi regner med at den koster pr. km.
     * Nøgletallet spørger om noget andet — hvad flåden FAKTISK kostede pr.
     * kørt kilometer. Lagde vi satserne sammen, ville tallet aldrig kunne
     * afvige fra budgettet, fordi det ER budgettet. Det ser ud som en måling
     * og er en gentagelse af vores eget gæt.
     *
     * Det rigtige grundlag er brændstof- og værkstedsomkostninger pr. periode
     * over kørte kilometer. omkostninger/ er ikke det: den er et katalog over
     * satser for agenter, parkering og færger — ikke et driftsregnskab.
     */
    omkostningPrKmOere: null,
    /* Følger af ovenstående: uden tallet er der ingen afvigelse at regne. */
    omkostningPrKmDeltaOere: null,

    /**
     * ⚠ INGEN KILDE — nedetid kræver en VARIGHED, og der registreres kun en
     * tilstand.
     *
     * status: "vaerksted" siger at bilen er ude NU. Nedetid i procent spørger
     * hvor stor en del af perioden den var det, og det kan kun regnes hvis der
     * findes et spor over hvornår statussen skiftede. Der er ingen historik på
     * køretøjet, og opgavens reservation dækker kun de besøg der blev
     * planlagt gennem opgaveplanlaeg — ikke en bil der blev stående.
     *
     * ⚠ AT REGNE DET AF paaVaerksted / aktive VILLE VÆRE ET ØJEBLIKSBILLEDE
     * KLÆDT UD SOM EN PERIODE. To biler på liften i dag ud af elleve er ikke
     * "18 % nedetid" — det er 18 % lige nu, og tallet ville hoppe med hver
     * kørsel af jobbet uden at driften havde ændret sig.
     */
    nedetidPct: null,
    nedetidDeltaPoint: null,
  };
}

/**
 * Bemandingens nøgletal. Tælles på hele tenantens personale — se noten øverst.
 *
 * ⚠ FRAVÆRET ER EN PERIODE, IKKE EN DAG. En post har fra og til, og "fravær i
 * dag" er dem hvis periode SPÆNDER om nu. Talte man dem der begynder i dag,
 * ville en sygemelding på tre uger tælle med på dag ét og være væk på dag to.
 */
export function bemandingstal(personale = [], kompetencer = [], fravaer = [],
                              etaper = [], nu = Date.now()) {
  const aktive = personale.filter((p) => p?.status === "aktiv");

  /* ⚠ DISPONERET ER PERSONER, IKKE ETAPER. En chauffør med tre etaper i dag er
     én disponeret person. Talte vi etaper, ville tallet kunne overstige
     antallet af ansatte — og det står ved siden af "aktive". */
  const iDag = etaper.filter((e) => {
    const fra = e?.fra ?? e?.startMs;
    const til = e?.til ?? e?.slutMs;
    return Number.isFinite(fra) && Number.isFinite(til) && fra <= nu + DAG && til >= nu;
  });
  const disponerede = new Set(iDag.map((e) => e?.personId).filter(Boolean));

  const erChauffoer = (p) =>
    Boolean(p?.funktioner?.chauffoer || p?.funktioner?.buschauffoer);
  const idTilPerson = new Map(personale.map((p) => [p?.id, p]));

  return {
    medarbejdereAktive: aktive.length,

    fravaerIDag: fravaer.filter(
      (f) => Number.isFinite(f?.fra) && Number.isFinite(f?.til)
        && f.fra <= nu && f.til >= nu).length,

    /* ⚠ KUN FREMAD, som serviceintervallet. En kompetence der ALLEREDE er
       udløbet, BLOKERER en disponering (tjekDisponering) og er ikke en
       advarsel om noget der kommer. Lagt sammen ville de to skjule hinanden. */
    kompetencerUdloeber: kompetencer.filter(
      (k) => Number.isFinite(k?.udloeberMs)
        && k.udloeberMs > nu
        && k.udloeberMs - nu <= 30 * DAG).length,

    disponeret: disponerede.size,
    chauffoerDisponeret: [...disponerede]
      .filter((id) => erChauffoer(idTilPerson.get(id))).length,

    /**
     * ⚠ INTET SPØRGSMÅL — der findes ingen VAGTPLAN.
     *
     * "Planlagt" er ikke det samme som "ansat": det er hvor mange der var sat
     * på vagt i dag. Uden en vagtplan er der intet at tælle, og at sætte det
     * lig med medarbejdereAktive ville påstå at hver ansat er på arbejde hver
     * dag — ferie, orlov, deltid og weekend forsvandt i ét tal.
     *
     * ⚠ OG DET ER ET ANDET null END nedetidPct. Nedetiden har en kilde vi ikke
     * fører; vagtplanen har ingen entitet overhovedet. vagter/ står hverken i
     * firebase.rules.json eller i ARKITEKTUR.md.
     */
    planlagt: null,
    chauffoerPlanlagt: null,

    /**
     * ⚠ INTET SPØRGSMÅL — "underbemandet" kræver et BEHOV at måle imod.
     *
     * En vagt er underbemandet når der mangler folk på den. Der er ingen vagt,
     * og der er ingen norm for hvor mange en tur kræver. Tallet kan altså ikke
     * regnes for lidt — det kan slet ikke stilles, før nogen har svaret på
     * hvad en vagt er hos denne kunde.
     */
    underbemandede: null,

    /* ⚠ HER LÅ `ledig` — husets navngivne eksempel på et gemt afledt tal, og
       det lå der stadig mens ni andre steder i koden henviste til det som DEN
       kendte fejl. Det er ude i beslutning 71: tallet er præcis
       `planlagt − disponeret` og regnes af `ledig()` i dashboards.js, hos
       forbrugeren.

       ⚠ OG DET KOSTEDE INGEN MIGRERING. Frygten var at widget-nøglen ville
       blive ugyldig — men nøglen hedder `ledigKapacitet`, ikke feltnavnet, og
       kataloget kunne i forvejen pege på en AFLEDNING i stedet for et felt.
       Prisen var at læse hvad der faktisk stod, ikke at rydde brugernes
       forsider. */
  };
}

export function beregnKpi({
  kunder = [], etaper = [], grundlag = [], opgaver = [],
  /* ⚠ DE FIRE KOM TIL FOR `disponering.konflikter`. De fem tjek er en REN
     funktion, men den skal have sine lister — og uden dem svarer feltet null
     frem for nul: en aggregering der ikke fik sine biler, ved ikke at der er
     nul konflikter. */
  koeretoejer = [], personale = [], kompetencer = [], reservationer = {},
  /* ⚠ FRAVÆRET KOM TIL FOR bemanding.fravaerIDag. Noden bærer ingen division
     (beslutning 19), og posten er en PERIODE med fra/til — ikke en dag. */
  fravaer = [],
  indkoeb = [], fakturaer = [], leverandoerer = [], indberetninger = [],
  /* ⚠ FACILITY ER TRE LISTER, IKKE ÉN. Noden har børn — aktiver, fejl og
     sensorer — og de tælles hver for sig. Ét samlet argument ville have
     skjult hvilke af dem der faktisk blev læst. */
  facilityAktiver = [], facilityFejl = [], facilitySensorer = [],
  /* ⚠ BOOKINGERNE KOM MED FOR `opgaver.nyeBookinger` — arbejde der er kommet
     ind siden forrige beregning. Feltet tæller bookinger, ikke opgaver; det
     står i opgaver-domænet fordi det er ARBEJDE der kommer ind. */
  bookinger = [],
  /* Procures EGET varelager — se indkoebstal(). Ikke Warehouses varer. */
  forbrugsvarer = [],
  forrige = null, nu = Date.now(),
}) {
  const tomme = udenKilde();
  const kunde = kundetal(kunder, nu);
  const ikkeFakt = ikkeFaktureretOere(etaper, grundlag);
  const disp = disponeringstal(etaper, {
    koeretoejer, personale, kompetencer, reservationer,
  });
  const opg = opgavetal(opgaver, nu, { bookinger, forrige });
  const ind = indkoebstal(indkoeb, fakturaer, leverandoerer, nu, forbrugsvarer);
  /* ⚠ INGEN division-PARAMETER TIL DE TO. Det er ikke en forglemmelse: feltet
     er FORBUDT på koeretoejer og personale, og tallet er det samme i begge
     divisioner. En parameter der ikke bruges, ville få den næste til at tro at
     den kunne bruges. Se beslutning 69. */
  const fl = flaadetal(koeretoejer, nu);
  const bem = bemandingstal(personale, kompetencer, fravaer, etaper, nu);
  const fac = facilitytal({
    aktiver: facilityAktiver, fejl: facilityFejl, sensorer: facilitySensorer,
    opgaver, leverandoerer, nu,
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
      /* ⚠ HER STOD `klarTilFakturering`, SOM VAR SAMME TAL SOM
         `oekonomi.ikkeFaktureretForloeb`. Begrundelsen var at ÉN beregning
         med to navne er bedre end to beregninger — og det er den stadig.
         Det der ikke holdt, var at de to navne lå i hver sit DOMÆNE.

         Beslutning 104 gav `grundlag` en læse-permission, og et KPI-domæne
         arver sin kildes. Feltet var det ENESTE i `opgaver` der kom fra
         `grundlag` — så en disponent ville have mistet **seksten**
         driftstal for at blive nægtet **ét** faktureringstal.

         Domænet er ikke bare en mappe: det er den enhed adgangen afgøres
         på. Et tal der hører til fakturering, hører i `oekonomi` — og
         duplikatet var det der gjorde det billigt at overse.

         Begge skærme læser nu `oekonomi.ikkeFaktureretForloeb`. */
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
      /**
       * ⚠ HER STOD "UDEN `indkoeb` ER DER INGEN DRIFTSOMKOSTNINGER AT LÆGGE
       * SAMMEN" — OG `indkoeb` HAR VÆRET DER SIDEN NODEN BLEV SEEDET.
       *
       * Kilden mangler ikke; PERIODEN gør. Driftsomkostninger er et tal man
       * måler mod et budget, og et samlet beløb over hele noden ville vokse
       * med historikken frem for med forbruget. `indkoeb.maanedensForbrugOere`
       * er den ene periode der ER defineret, og den regnes allerede.
       *
       * Samme slags null som `opgaver.udfoerteOpgaver`: en periodesum uden en
       * besluttet periode.
       */
      driftsomkostningerOere: null,
      /* Grundlaget er null, så afvigelsen er det også. */
      driftsomkostningerDeltaPct: null,

      /**
       * ⚠ TO TAL KUNDEN SÆTTER — DE KAN IKKE UDLEDES AF NOGET.
       *
       * Et budget er en beslutning, ikke en måling, og et måltal for
       * dækningsgraden er det samme. De findes i ingen node, og der er ingen
       * formel der kan gætte dem. Feltet venter på en INDTASTNING og på et
       * sted at gemme den — se det åbne spørgsmål i README.
       *
       * ⚠ OG BUDGETAFVIGELSEN MÅ ALDRIG GEMMES. Den udledes af
       * `driftsomkostningerOere − budgetOere` hos forbrugeren; et gemt afledt
       * tal driver fra sit grundlag. Det er fejlen i `bemanding.ledig`.
       */
      budgetOere: null,
      maalDaekningsgradPct: null,

      /**
       * ⚠ DÆKNINGSGRADEN KRÆVER BEGGE LED I SAMME PERIODE.
       *
       * Omsætningen findes nu på bookingen; omkostningen mangler sin periode
       * (se ovenfor). Et tal regnet af det ene led ville være en margin på
       * 100 %.
       */
      daekningsgradPct: null,
      /* Procentpoint mod forrige periode — og grundlaget er null. */
      daekningsgradDeltaPoint: null,

      /**
       * ⚠ HVILKE TIMER? Chaufførens, køretøjets eller værkstedets?
       *
       * `opgaver.faktiskMin` findes, men det er hvor længe der blev ARBEJDET
       * PÅ en enhed — ikke hvor længe den var i drift. De to tal ville hedde
       * det samme og betyde hver sit, og det er beslutning 11 og 14's fejl.
       * Feltet venter på et spørgsmål der er stillet færdigt.
       */
      driftstimer: null,

      /**
       * ⚠ SAMME MANGLENDE FELT SOM `planlagtVedligeholdPct` NEDENFOR.
       *
       * En opgave har `art` (vaerksted | facility), en status og en prioritet
       * — men intet felt der siger om arbejdet var PLANLAGT eller AKUT. At
       * læse `prioritet: hoej` som akut ville være et gæt, og de to tal
       * supplerer hinanden til 100: et gæt i det ene bliver til en løgn i det
       * andet.
       */
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
    /**
     * ⚠ flaade ER DET ENE DOMÆNE DER BLANDER TO SLAGS FELTER, og det er ikke
     * rod — det er hvad flåden er.
     *
     * flaadetal() tæller BILERNE, som ikke bærer en division (beslutning 19),
     * så tallet er det samme i gods og bus. De tre andre kilder spørger om
     * noget andet: en indkøbslinje og en indberetning BÆRER en division, og
     * deres tal er derfor forskellige i de to.
     *
     * Her stod tidligere "ét eneste felt under flaade kan regnes". Det var
     * sandt så længe divisionsspørgsmålet var åbent; nu kan de alle på nær de
     * fire der mangler en kilde. Se beslutning 69.
     */
    flaade: {
      ...fl,
      ikkeLinkedeFakturaer: ikkeLinkedeFakturaer(fakturaer, indkoeb),
      /* ⚠ BRÆNDSTOFFET KOMMER FRA INDKØBET, IKKE FRA BILERNE — og det er
         derfor det er delt på division mens bilerne ikke er: det er
         indkøbslinjens division der spørges om, og den BÆRER en. */
      braendstofOere: braendstofOere(indkoeb, nu),
      ...indberetningstal(indberetninger),
    },

    /**
     * ⚠ bemanding STOD IKKE I RETURSÆTNINGEN FØR — den kom udelukkende fra
     * `...tomme`, altså som ni null. Det er værd at bemærke, fordi det er
     * netop den slags et domæne kan forsvinde på: er hele domænet null, bliver
     * det SLETTET af RTDB ved skrivningen, og skærmen bliver hvid på
     * `k.bemanding.disponeret`. Det skete, og medFuldForm() findes af den
     * grund. Nu har domænet rigtige tal, og formen holder af sig selv.
     */
    bemanding: bem,

    /* ⚠ TOM LISTE, IKKE null. Afvigelserne er en LISTE — findes der ingen,
       er svaret en tom liste, og det er et svar. Se demo-kpi.js. */
    afvigelser: [],
    warehouse: { carriereUdenLokationDelta: null },
  };
}
