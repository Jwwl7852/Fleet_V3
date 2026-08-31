/* src/fleet/indberetninger.js
 * Indberetninger. BESLUTNING 25.
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV. Forløbet nedenfor er
 * hvordan vi TROR en reparation bevæger sig hos en vognmand. Det skal
 * efterprøves hos første kunde.
 *
 * INGEN FIREBASE-IMPORT. Ren kerne — den Cloud Function der afslutter en
 * indberetning, skal bruge samme regler som skærmen.
 *
 * ---------------------------------------------------------------------------
 * ÉN GENERISK MOTOR, FIRE FELTSKEMAER — samme mønster som arterne i flaade.js.
 * Fire skærme til fire indberetningstyper ville drive fra hinanden, og den
 * femte type ville få sin egen igen.
 *
 * ⚠ INDBERETNINGEN *HAR* EN SAG — DEN *ER* IKKE EN SAG.
 * Det var en rettelse undervejs: at skrive "indberetningen er en sag" ville
 * kollidere to tilstandsmaskiner. Sagen har sin egen (åben / afventer svar /
 * afsluttet, se sager.js) og handler om KOMMUNIKATIONEN med værkstedet.
 * Indberetningen har sin egen og handler om ARBEJDET. En mail kan være besvaret
 * uden at bilen er repareret, og bilen kan være repareret uden at nogen har
 * svaret. Slår man dem sammen, kan man ikke udtrykke nogen af delene.
 * Forbindelsen er ét felt: sagId.
 * ---------------------------------------------------------------------------
 */

import { ANTAL_SKALA, LINJE_ART } from "./grundlag.js";

/* ---- Arter ------------------------------------------------------------ */

/**
 * ⚠ TO KLASSER, OG DE ER IKKE TO NIVEAUER — beslutning 106.
 *
 * README har beskrevet skellet siden Flåde → Indberetninger blev bygget:
 *
 *   driftshændelser  (reparation, skade, dæk, service, andet) STARTER ET FORLØB
 *   udgiftsregistreringer (tankning, parkering, truckwash, kvittering) GØR IKKE
 *
 * Koden havde **fire arter i én klasse**. En tankning fik derfor et forløb med
 * seks tilstande — "Ny", "Vurderet", "På værksted" — om et beløb der bare skal
 * bogføres. Feltet var påkrævet i reglen, så der stod altid noget, og "Ny" på
 * en kvittering betyder ingenting.
 *
 * ⚠ FORSKELLEN ER OM DER ER ET ARBEJDE AT FØLGE. En revnet rude bevæger sig:
 * nogen vurderer den, planlægger den, bilen kommer på værksted, fakturaen
 * kommer. En parkeringsbillet er et beløb og en dato. En tilstandsmaskine på
 * den anden ville være seks knapper der alle betyder "gemt".
 */
export const KLASSE = { drift: "drift", udgift: "udgift" };

export const HAENDELSE_ART = {
  /* ---- Driftshændelser: der er et arbejde at følge ------------------- */
  reparation:      { art: "reparation",      label: "Reparation",  klasse: KLASSE.drift,  paaKoeretoej: true,  sensitiv: false },
  koeretoejsskade: { art: "koeretoejsskade", label: "Enhedsskade", klasse: KLASSE.drift,  paaKoeretoej: true,  sensitiv: true  },
  godsskade:       { art: "godsskade",       label: "Godsskade",   klasse: KLASSE.drift,  paaKoeretoej: false, sensitiv: true  },
  daek:            { art: "daek",            label: "Dæk",         klasse: KLASSE.drift,  paaKoeretoej: true,  sensitiv: false },
  service:         { art: "service",         label: "Service",     klasse: KLASSE.drift,  paaKoeretoej: true,  sensitiv: false },
  /* ⚠ `andet` ER EN DRIFTSHÆNDELSE, ikke en udgift. En chauffør der ikke kan
     sætte navn på det han ser, har set noget der skal VURDERES — og det er
     præcis et forløb. Var den en udgift, ville "jeg ved ikke hvad det er"
     ende som en post ingen kigger på igen. */
  andet:           { art: "andet",           label: "Andet",       klasse: KLASSE.drift,  paaKoeretoej: true,  sensitiv: false },

  /* ---- Udgiftsregistreringer: et beløb og en dato -------------------- */
  /* ⚠ NØGLEN BLIVER `braendstof`. Appen kalder den "Tankning", som er hvad
     chaufføren gør; noden hedder det den altid har heddet. En omdøbning ville
     være en datamigrering af hver eneste post for et ord på en knap — samme
     grund som Flåde hedder Fleet uden at `flaade` skifter (README). */
  braendstof:      { art: "braendstof",      label: "Tankning",    klasse: KLASSE.udgift, paaKoeretoej: true,  sensitiv: false },
  parkering:       { art: "parkering",       label: "Parkering",   klasse: KLASSE.udgift, paaKoeretoej: true,  sensitiv: false },
  truckwash:       { art: "truckwash",       label: "Truckwash",   klasse: KLASSE.udgift, paaKoeretoej: true,  sensitiv: false },
  /* ⚠ INGEN FLISE I APPEN, og det er et valg. En chauffør der fotograferer en
     kvittering, gør det ALTID for noget — en tankning, en vask, en parkering —
     og en flise der hed "Kvittering" ville konkurrere med de tre og gøre
     dataene dårligere: halvdelen af tankningerne ville lande som kvitteringer
     uden liter. Arten findes til kontoret, som modtager bilag der ikke passer
     i de tre. Se APP_FLISER. */
  kvittering:      { art: "kvittering",      label: "Kvittering",  klasse: KLASSE.udgift, paaKoeretoej: false, sensitiv: false },
};

export const ALLE_ARTER = Object.keys(HAENDELSE_ART);

/** Er arten en udgiftsregistrering? Så har den intet forløb. */
export const erUdgift = (art) => HAENDELSE_ART[art]?.klasse === KLASSE.udgift;

/**
 * ⚠ ET FORLØB HØRER KUN TIL EN DRIFTSHÆNDELSE. Reglen kræver feltet af netop
 * de arter der har et, og `test/indberetningsarter.test.mjs` holder de to
 * ordlister sammen — regelfilen kan ikke importere kataloget, så listen står
 * to steder, og en prøve er det eneste der forhindrer at de driver.
 */
export const kraeverForloeb = (art) => !erUdgift(art);

export const arterAf = (klasse) =>
  ALLE_ARTER.filter((a) => HAENDELSE_ART[a].klasse === klasse);

export const FELT = {
  kmStand: "kmStand",
  liter: "liter",
  adBlueLiter: "adBlueLiter",
  prisPrLiterOere: "prisPrLiterOere",
  /* Sensitive — se noten ved SENSITIVE_FELTER. */
  skadeBeskrivelse: "skadeBeskrivelse",
  modpart: "modpart",
  /* Chaufførappen, beslutning 25's tillæg. */
  tidsregistrering: "tidsregistrering",
  underskrift: "underskrift",
  materialelinjer: "materialelinjer",
};

/* Chaufførappens tre datatyper kan hænge på ENHVER art. En chauffør der skifter
   en rude på vejen, bruger materialer på en reparation; en der afleverer gods,
   får en underskrift. At binde dem til én art ville betyde at appen skulle
   vælge art før den vidste hvad der skete. */
const APP_FELTER = [FELT.tidsregistrering, FELT.underskrift, FELT.materialelinjer];

const ART_FELTER = {
  reparation:      [FELT.kmStand, ...APP_FELTER],
  koeretoejsskade: [FELT.kmStand, FELT.skadeBeskrivelse, FELT.modpart, ...APP_FELTER],
  godsskade:       [FELT.skadeBeskrivelse, FELT.modpart, ...APP_FELTER],
  /* ⚠ DÆK OG SERVICE BÆRER kmStand, og det er ikke pynt: et dæk skiftes efter
     kilometer, og et serviceinterval måles i dem. Uden feltet kan ingen se om
     det næste ligger om en uge eller om et halvt år. */
  daek:            [FELT.kmStand, ...APP_FELTER],
  service:         [FELT.kmStand, ...APP_FELTER],
  /* `andet` har intet eget skema — chaufføren ved ikke hvad det er, og et
     tomt felt han skal udfylde, ville blive udfyldt med fiktion.
     Beskrivelsen står i `beskrivelse`, som alle arter har. */
  andet:           [...APP_FELTER],

  /* ---- Udgiftsregistreringer ----------------------------------------- */
  /* ⚠ V1-BRUGERTEST "BRÆNDSTOFMATCH" — `prisPrLiterOere` STOD HER OG ER
     FJERNET FRA FORMULARET. Den faktiske pris er leverandørfakturaens, ikke
     chaufførens gæt fra standeren, og matchmotoren bruger den aldrig — kun
     `koeretoejId` + `dato` + `liter`. Feltet selv (og dets validering i
     firebase.rules.json) er BEVARET for historiske poster; kun formularen
     og dermed NYE poster har mistet det. Se rules.json's egen note ved
     `prisPrLiterOere` og Indberetning.jsx. */
  braendstof:      [FELT.kmStand, FELT.liter, FELT.adBlueLiter],
  /* ⚠ DE TRE HAR INTET EGET FELT — beløbet står i `omkostningOere`, som
     noden allerede bar. Et `beloebOere` ved siden af ville være det samme tal
     to steder, og så skulle hver rapport vælge hvilket. */
  parkering:       [],
  truckwash:       [],
  kvittering:      [],
};

export const felterFor = (art) => ART_FELTER[art] || [];
export const harFelt = (art, felt) => felterFor(art).includes(felt);

/**
 * ⚠ HVAD DER HØRER I sensitive/indberetninger/<id>.
 *
 * En skadebeskrivelse rummer navne på modparter, vidner og skadelidte, og ofte
 * en vurdering af hvem der havde skylden. Det er personoplysninger om nogen der
 * ikke er vores medarbejder, og det skal ikke kunne læses af enhver disponent
 * — samme grund som fraværsårsagen i beslutning 25's forgænger.
 *
 * UNDERSKRIFTEN LIGGER HER OGSÅ. Den er både en personoplysning (navn plus et
 * billede af en håndskrift) og et bevis. Se byggUnderskrift().
 *
 * ⚠ AT ET FELT ER SKJULT, ER I SIG SELV EN OPLYSNING. Skjuler vi kun
 * skadebeskrivelsen når der ER en skade, kan man læse af hængelåsen at der
 * skete noget. Derfor findes noden for ALLE arter — de fleste med et tomt
 * objekt. Det er samme indsigt som ved cargoValue i ARKITEKTUR: delvis
 * afsløring lækker gennem udeladelsen.
 */
export const SENSITIVE_FELTER = [FELT.skadeBeskrivelse, FELT.modpart, FELT.underskrift];

/* ⚠ DEN OMBÆRING ER SKET. Her stod at permissionen og sensitive-noden ikke
   fandtes endnu. Begge dele findes nu — se PERM.indberetningerSensitiveLaes
   i permissions.js og "sensitive": { "indberetninger": {...} } i
   firebase.rules.json — og navnet her er blevet det faktiske. */
export const PERM_SENSITIVE_LAES_PLANLAGT = "indberetninger.sensitiveLaes";

/* ---- Forløbet --------------------------------------------------------- */

/**
 * Seks tilstande. Rækkefølgen er fast, og der springes ikke.
 *
 * Bemærk at `afventerFaktura` er en EGEN tilstand frem for en variant af
 * `paaVaerksted`. Bilen er tilbage i drift, arbejdet er gjort — men pengesiden
 * er ikke lukket. Uden den tilstand ville indberetningen enten stå som "på
 * værksted" med en bil der kører, eller som "afsluttet" med en faktura der
 * aldrig kom. Begge dele gør listen ubrugelig som huskeliste.
 */
/**
 * ⚠ `chauffoer` ER SAMME TILSTAND SET FRA VEJEN — beslutning 109.
 *
 * Kontorets ord er kontorets arbejdsliste: "Ny" betyder at ingen har vurderet
 * den endnu. For chaufføren, der SELV sendte den, betyder det noget andet: vi
 * har modtaget den. Og "Afventer faktura" er en oplysning om vores bogholderi,
 * ikke om hans bil — for ham er arbejdet udført.
 *
 * ⚠ MEN DET ER ÉT KATALOG, IKKE TO. Feltet står HER, ved siden af den tilstand
 * det oversætter. Skrev chaufførappen sin egen tabel, ville vi have to
 * vokabularer for én tilstandsmaskine — og den dag et forløb fik et trin mere,
 * ville appen vise nøglen råt uden at nogen opdagede det.
 *
 * Mangler `chauffoer`, bruges `label`. En ny tilstand skal ikke tvinges til at
 * have to navne bare fordi feltet findes.
 */
export const FORLOEB = {
  ny:              { label: "Ny",               chauffoer: "Indberettet",   pill: "info", naeste: ["vurderet", "afsluttet"] },
  vurderet:        { label: "Vurderet",         chauffoer: "Set af driften", pill: "info", naeste: ["planlagt", "afsluttet"] },
  planlagt:        { label: "Planlagt",         pill: "warn", naeste: ["paaVaerksted", "afsluttet"] },
  paaVaerksted:    { label: "På værksted",      pill: "warn", naeste: ["afventerFaktura", "afsluttet"] },
  afventerFaktura: { label: "Afventer faktura", chauffoer: "Udført",        pill: "warn", naeste: ["afsluttet"] },
  afsluttet:       { label: "Afsluttet",        chauffoer: "Udført",        pill: "ok",   naeste: [] },
};

/** Forløbets navn set fra vejen. Falder tilbage på kontorets. */
export const forloebLabelFor = (f, tilChauffoer = false) =>
  (tilChauffoer && FORLOEB[f]?.chauffoer) || FORLOEB[f]?.label || f;

export const ALLE_FORLOEB = Object.keys(FORLOEB);

/* ---- Prioritet -------------------------------------------------------- *
 * ⚠ DEN LIGGER IKKE HER, OG DET ER MED VILJE. Kataloget staar i
 * `prioritet.js` og deles med Fleets driftsopgaver og Warehouses plukordrer:
 * tre trin, sat af et menneske, paa et stykke arbejde. Et fjerde katalog
 * ville vaere to ordlister der ikke kan summeres paa to skaerme der viser
 * den samme koe.
 *
 * ⚠ OG DEN STAAR IKKE I `FELT`. Det katalog er ART-specifikt — kmStand paa en
 * reparation, liter paa en tankning — og `harFelt()` bruges til at UDELADE en
 * raekke arten ikke har. Prioriteten hoerer paa alle fire arter, praecis som
 * `forloeb` og `division`, og de staar heller ikke der. Laa den i FELT, skulle
 * den skrives fire gange for altid at vaere sand.
 *
 * ⚠ FELTET ER VALGFRIT. En indberetning kommer fra en CHAUFFOER i marken;
 * prioriteten saettes af den vaerkfoerer der triagerer. "Ikke vurderet" er et
 * svar og taelles for sig paa Driftskalenderen — havde vi krævet feltet ved
 * oprettelsen, ville chaufføren gætte, og så ville alt være "Mellem".
 * `prioritetFor()` returnerer null for en post uden, ALDRIG PRIORITET.normal.
 */

/**
 * FEJLER LUKKET. En ukendt tilstand giver ingen lovlige skift — den åbner ikke
 * for alle. Samme regel som booking-state og som en ukendt rolle i
 * permissions.js.
 */
export const kanSkifteTil = (fra, til) => (FORLOEB[fra]?.naeste || []).includes(til);

/* ---- Afslutning ------------------------------------------------------- */

/**
 * kanAfslutte(indberetning) → { ok, aarsager }
 *
 * ⚠ EN INDBERETNING KAN IKKE AFSLUTTES UDEN AT PENGESIDEN ER AFKLARET.
 *
 * Enten er der registreret en omkostning — et indkøb, en faktura, et beløb —
 * eller også har nogen udtrykkeligt sagt at der ingen var, OG skrevet hvorfor.
 *
 * Grunden til at det andet ben kræver en begrundelse: uden den bliver "ingen
 * omkostning" den nemme vej ud, og så er den ubrugelig som oplysning. Med en
 * begrundelse kan man bagefter se forskel på "dækket af garantien", "kørt på
 * eget værksted" og "vi glemte at få fakturaen". Kun den sidste er et problem,
 * og den kan ikke findes hvis alle tre ser ens ud.
 *
 * Det er samme mønster som overrides i personale.js: en undtagelse må gerne
 * være mulig, men den skal koste en sætning.
 */
export function kanAfslutte(indberetning) {
  const aarsager = [];
  if (!indberetning) return { ok: false, aarsager: ["Indberetningen findes ikke."] };

  if (indberetning.forloeb === "afsluttet") {
    aarsager.push("Indberetningen er allerede afsluttet.");
  }

  const harOmkostning =
    Number.isInteger(indberetning.omkostningOere) && indberetning.omkostningOere > 0;
  const harIndkoeb = Boolean(indberetning.indkoebId);
  const ingen = indberetning.ingenOmkostning;

  if (!harOmkostning && !harIndkoeb) {
    if (!ingen) {
      aarsager.push(
        "Der er hverken registreret en omkostning eller taget stilling til at der ingen var."
      );
    } else if (!ingen.begrundelse?.trim()) {
      aarsager.push(
        '"Ingen omkostning" kræver en begrundelse — ellers kan en glemt faktura ikke ' +
        "skelnes fra en garantisag."
      );
    }
  }

  /* En underskrift der er påbegyndt men mangler navn, er ikke et bevis. Se
     byggUnderskrift(). */
  if (indberetning.underskrift && !indberetning.underskrift.navn?.trim()) {
    aarsager.push("Underskriften mangler navnet på den der skrev under.");
  }

  return { ok: !aarsager.length, aarsager };
}

/* ---- Chaufførappen: 1. Tidsregistrering -------------------------------- */

/**
 * byggTidsregistrering({ ankomstMs, afgangMs, registreretAf }, nu)
 *
 * ⚠ DER ER TO SLAGS TIDSPUNKTER HER, OG DE MÅ IKKE SLÅS SAMMEN.
 *
 *   ankomstMs / afgangMs   HVORNÅR DET SKETE. Chaufførens oplysning.
 *   registreretMs          HVORNÅR DET BLEV TASTET. Systemets iagttagelse.
 *
 * En chauffør der taster ankomsten på stedet, og en der taster den om aftenen
 * hjemmefra, afgiver to forskellige slags oplysning. Den første er en
 * iagttagelse, den anden er en erindring. Gemmer vi kun ét tidspunkt, kan
 * ingen bagefter se hvilken slags man har med at gøre — og det er præcis det
 * spørgsmål der kommer, når kunden bestrider ventetiden på fakturaen.
 *
 * `registreretAf` er et UID: hvem der GJORDE noget. Chaufføren som person står
 * på etapen som personId. Se noten i personale.js.
 */
export function byggTidsregistrering({ ankomstMs, afgangMs, registreretAf }, nu = Date.now()) {
  if (!Number.isFinite(ankomstMs)) throw new Error("byggTidsregistrering: ankomstMs mangler.");
  if (Number.isFinite(afgangMs) && afgangMs < ankomstMs) {
    throw new Error("byggTidsregistrering: afgang kan ikke ligge før ankomst.");
  }
  return {
    ankomstMs,
    afgangMs: Number.isFinite(afgangMs) ? afgangMs : null,
    registreretAf: registreretAf ?? null,
    registreretMs: nu,
  };
}

/** Minutter på stedet. BEREGNET — beslutning 6. Et gemt varighedsfelt driver
 *  fra sine to endepunkter, første gang nogen retter et klokkeslæt. */
export const tidPaaStedetMin = (t) =>
  t && Number.isFinite(t.ankomstMs) && Number.isFinite(t.afgangMs)
    ? Math.max(0, Math.round((t.afgangMs - t.ankomstMs) / 60000))
    : null;

/**
 * Hvor længe efter hændelsen blev der tastet? BEREGNET.
 *
 * Skærmen bruger den til at sige "meldt 4 timer senere" ved siden af
 * tidspunktet. Ikke for at mistænkeliggøre chaufføren, men fordi en ventetid
 * der er tastet dagen efter, er svagere dokumentation end en der er tastet på
 * stedet — og den der skal forsvare fakturaen, skal kunne se det.
 */
export const forsinkelseMin = (t) =>
  t && Number.isFinite(t.registreretMs) && Number.isFinite(t.ankomstMs)
    ? Math.max(0, Math.round((t.registreretMs - t.ankomstMs) / 60000))
    : null;

/* ---- Chaufførappen: 2. Underskrift ------------------------------------- */

/**
 * ⚠ UNDERSKRIFTEN SKRIVES ÉN GANG OG KAN IKKE ÆNDRES.
 *
 * Det er ikke en konvention — det er en regel i firebase.rules.json:
 *
 *     "underskrift": { ".write": "!data.exists()" }
 *
 * En underskrift er et BEVIS. Kan den redigeres bagefter, beviser den
 * ingenting, og så er der ingen grund til at indsamle den. Og den er en
 * PERSONOPLYSNING om en der ikke er vores medarbejder — modtageren på
 * lossepladsen har ikke sagt ja til noget som helst hos os. Derfor ligger den i
 * sensitive/.
 *
 * EN RETTELSE ER ET TILLÆG, IKKE EN REDIGERING. Blev der skrevet under af den
 * forkerte, eller er navnet stavet galt, laves der en NY indberetningspost der
 * henviser til den gamle. Præcis som et låst fakturagrundlag erstattes frem
 * for at rettes. Begge steder er begrundelsen den samme: dokumentet er allerede
 * blevet vist til nogen udenfor.
 *
 * ⚠ NAVNET ER PÅKRÆVET. En krusedulle uden et navn kan ikke bruges til noget —
 * man kan ikke spørge "skrev du under på det her?" uden at vide hvem man
 * spørger.
 */
export function byggUnderskrift({ navn, billedeSti, personId, stedTekst }, nu = Date.now()) {
  if (!navn?.trim()) {
    throw new Error("byggUnderskrift: navnet på den der skrev under er påkrævet.");
  }
  return {
    navn: navn.trim(),
    /* Selve billedet ligger i Storage. Her står kun stien — en base64-streng i
       databasen ville blive læst med hver eneste liste-forespørgsel. */
    billedeSti: billedeSti ?? null,
    /* Sat HVIS modtageren tilfældigvis er en af vores egne. Oftest null: en
       kundes lagerchef har intet personId hos os. */
    personId: personId ?? null,
    stedTekst: stedTekst ?? null,
    ms: nu,
  };
}

/** Må den overskrives? Aldrig. Funktionen findes for at kunne SPØRGES — en
 *  skærm skal kunne vise at feltet er låst frem for at fejle ved gem. */
export const maaOverskriveUnderskrift = () => false;

/* ---- Chaufførappen: 3. Materialeforbrug -------------------------------- */

/**
 * ⚠ MÆNGDEN ER I TUSINDDELE, SAMME SKALA SOM FAKTURAGRUNDLAGET.
 *
 * 2,0 m bobleplast er 2000. Det er ikke pænhed: mængden skal kunne blive til et
 * `antal` på en grundlagslinje uden omregning, og to forskellige skalaer ville
 * fakturere enten tusind gange for meget eller tusind gange for lidt. Fejlen
 * ville være for stor til at overses og for sen til at rette — den opdages på
 * fakturaen.
 *
 * Konstanten importeres fra grundlag.js frem for at blive gentaget her. Står
 * tallet to steder, kan de to komme ud af trit, og så er hele koblingen forkert
 * uden at nogen har ændret noget der lignede en fejl.
 */
export const MAENGDE_SKALA = ANTAL_SKALA;

export function byggMateriallinje({ vare, varenummer, maengde, enhed, lagerId }) {
  if (!vare?.trim()) throw new Error("byggMateriallinje: vare mangler.");
  if (!Number.isInteger(maengde) || maengde <= 0) {
    throw new Error("byggMateriallinje: mængden skal være et positivt heltal i tusinddele.");
  }
  if (!enhed?.trim()) throw new Error("byggMateriallinje: enhed mangler.");
  return {
    vare: vare.trim(),
    varenummer: varenummer ?? null,
    maengde,
    enhed: enhed.trim(),
    lagerId: lagerId ?? null,
    /* ⚠ TO POSTERINGER, HVER SIN REFERENCE. Se noten nedenfor. Begge er null
       indtil de er gennemført, og de sættes hver især ÉN gang. */
    grundlagslinjeId: null,
    lagertraekId: null,
  };
}

/**
 * ---------------------------------------------------------------------------
 * ⚠ ÉN HÆNDELSE, TO POSTERINGER — OG DE MÅ IKKE BLIVE TIL ÉN ELLER TRE.
 *
 * At chaufføren brugte 2 m bobleplast, giver anledning til to forskellige ting:
 *
 *   SALGET   en linje på fakturagrundlaget — hvad KUNDEN skal betale
 *   FORBRUGET et lagertræk i Indkøb — hvad DET KOSTEDE OS
 *
 * De to har forskellige beløb (der skal være en avance), forskellige modtagere
 * og forskellige tidspunkter. Slår man dem sammen til ét tal, fakturerer man
 * enten til kostpris eller bogfører sin salgspris som en omkostning — og
 * dækningsgraden bliver forkert uden at noget ser forkert ud. Det er
 * beslutning 11 om igen.
 *
 * Derfor bærer linjen to referencer. De er OGSÅ værnet mod at gøre det samme
 * to gange: er `grundlagslinjeId` sat, er materialet allerede faktureret, og et
 * nyt kald skal afvises frem for at lave linje nummer to. Samme princip som
 * to-vejs-referencen på grundlaget — en gentagelse må ikke blive en fordobling.
 * ---------------------------------------------------------------------------
 */

/**
 * kanFaktureres(indberetning, linje) → { ok, aarsag }
 *
 * ⚠ IKKE ALT MATERIALEFORBRUG KAN FAKTURERES, og det er ikke et valg — det
 * afhænger af hvem arbejdet blev udført for.
 *
 * Bruger en chauffør materialer på KUNDENS gods, kan det viderefaktureres.
 * Bruger en mekaniker materialer på VORES EGEN lastbil, er det en driftsudgift,
 * og der er ingen at sende den til. En indberetning uden bookingId har ingen
 * kunde, og så findes der ikke et fakturagrundlag at lægge linjen på.
 *
 * Uden dette tjek ville en reparation på egen bil kunne blive til en linje på
 * en tilfældig kundes regning — den slags opdages af kunden, ikke af os.
 */
export function kanFaktureres(indberetning, linje) {
  if (!linje) return { ok: false, aarsag: "Linjen findes ikke." };
  if (linje.grundlagslinjeId) {
    return { ok: false, aarsag: "Materialet er allerede lagt på et fakturagrundlag." };
  }
  if (!indberetning?.bookingId) {
    return {
      ok: false,
      aarsag: "Indberetningen hører ikke til en booking — der er ingen kunde at fakturere.",
    };
  }
  return { ok: true, aarsag: null };
}

/**
 * grundlagslinjeFraMateriale(indberetning, linje, { satsOere, momssats })
 *   → en linje klar til grundlag.js
 *
 * ⚠ SALGSPRISEN GÆTTES IKKE, OG DEN ER IKKE KOSTPRISEN.
 *
 * Det ville være nemt at bruge indkøbsprisen som sats — den står lige der. Men
 * så fakturerer vi til kostpris og taber avancen på hver eneste materialelinje,
 * uden at noget ser forkert ud: tallene stemmer, fakturaen går igennem, og
 * dækningsgraden falder af grunde ingen kan pege på. Satsen kommer fra kundens
 * prisaftale, og mangler den, skal et menneske tage stilling.
 *
 * Samme regel som momssatsen på grundlaget: et system der gætter rigtigt ni
 * gange ud af ti, lærer brugeren at stole på det tiende gæt.
 *
 * Momssatsen føres med og gættes heller ikke — mangler den, blokerer eksporten
 * længere fremme. Den blokerer ikke HER, for man skal kunne skrive grundlaget
 * færdigt og spørge bogholderen bagefter.
 */
export function grundlagslinjeFraMateriale(indberetning, linje, { satsOere, momssats } = {}) {
  const tjek = kanFaktureres(indberetning, linje);
  if (!tjek.ok) throw new Error(`grundlagslinjeFraMateriale: ${tjek.aarsag}`);
  if (!Number.isInteger(satsOere)) {
    throw new Error(
      "grundlagslinjeFraMateriale: satsOere mangler. Salgsprisen kommer fra kundens " +
      "prisaftale — den er ikke kostprisen, og den gættes ikke."
    );
  }
  return {
    art: LINJE_ART.materiale.art,
    tekst: linje.varenummer ? `${linje.vare} (${linje.varenummer})` : linje.vare,
    /* ⚠ SAMME SKALA, INGEN OMREGNING. Se noten ved MAENGDE_SKALA. */
    antal: linje.maengde,
    enhed: linje.enhed,
    satsOere,
    momssats: Number.isFinite(momssats) ? momssats : null,
    /* LINJE_ART.materiale.kraeverKilde er true, og kilden er indberetningen.
       Uden den kan en linje på fakturaen ikke føres tilbage til hvem der brugte
       hvad hvornår — og det er netop det spørgsmål kunden stiller. */
    kilde: { type: "indberetning", id: indberetning.id, materialeVare: linje.vare },
  };
}

/**
 * lagertraekFraMateriale(indberetning, linje) → posten til Indkøb.
 *
 * Den ANDEN postering. Bemærk at der ikke står en pris her: hvad materialet
 * kostede, ved lageret — ikke chaufføren. Skrev vi en pris med, ville vi have
 * to kilder til kostprisen, og den her ville være den dårligste.
 */
export function lagertraekFraMateriale(indberetning, linje) {
  if (linje?.lagertraekId) {
    throw new Error("lagertraekFraMateriale: materialet er allerede trukket fra lageret.");
  }
  return {
    vare: linje.vare,
    varenummer: linje.varenummer ?? null,
    maengde: linje.maengde,
    enhed: linje.enhed,
    lagerId: linje.lagerId ?? null,
    kilde: { type: "indberetning", id: indberetning.id },
  };
}

/* ---- Brændstof -------------------------------------------------------- */

/**
 * ⚠ km/l REGNES PÅ DIFFERENCEN MELLEM TO MÅLERSTANDE — ikke på et felt.
 *
 * kmStand er TOTALT kilometertal, ikke km siden sidste tankning. Det er den
 * eneste af de to en chauffør kan aflæse uden at regne, og et felt hvor
 * brugeren skal regne, bliver forkert udfyldt.
 *
 * ⚠ AdBlue TÆLLER IKKE MED I km/l. Det er ikke brændstof, det er et
 * additiv til udstødningen, og lægges det til literantallet, ser forbruget
 * bedre ud end det er — cirka 5 % bedre, hvilket er lige lidt nok til at ingen
 * opdager det og lige meget nok til at en sammenligning mellem to biler bliver
 * forkert.
 */
export function forbrugKmPrLiter(tankninger = []) {
  const sorterede = tankninger
    .filter((t) => Number.isFinite(t?.kmStand) && Number.isFinite(t?.liter))
    .sort((a, b) => a.kmStand - b.kmStand);
  if (sorterede.length < 2) return null;

  const perioder = [];
  for (let i = 1; i < sorterede.length; i++) {
    const km = sorterede[i].kmStand - sorterede[i - 1].kmStand;
    /* Literne på DENNE tankning fyldte det der blev kørt SIDEN den forrige. */
    const liter = sorterede[i].liter;
    if (km > 0 && liter > 0) perioder.push({ km, liter });
  }
  if (!perioder.length) return null;

  const km = perioder.reduce((s, p) => s + p.km, 0);
  const liter = perioder.reduce((s, p) => s + p.liter, 0);
  return km / liter;
}

/* ---- Åbne fejl pr. køretøj -------------------------------------------- */

/**
 * aabneFejlFor(indberetninger, koeretoejId) → antal
 *
 * ⚠ AFLEDT, OG DET SKAL DEN BLIVE. Tallet hører ikke i kpi/: det er udregnet
 * af data forbrugeren allerede har, og et gemt afledt tal driver fra sit
 * grundlag. Undtagelsen i CLAUDE.md gælder præcis den her slags.
 *
 * TO AFGRÆNSNINGER, og begge er meningsbærende:
 *
 *  1. `braendstof` er ikke en fejl. En tankning er en registrering, og talte
 *     den med, ville den bil der kører mest også være den med flest "fejl".
 *  2. `godsskade` er ikke en fejl PÅ BILEN — HAENDELSE_ART siger det selv med
 *     paaKoeretoej: false. Skaden sad på godset; bilen fejler ingenting.
 *
 * Alt der ikke er `afsluttet`, er åbent. `afventerFaktura` tæller med: bilen
 * kører igen, men sagen er ikke lukket, og en huskeliste der glemmer den er
 * ikke en huskeliste.
 */
export function aabneFejlFor(indberetninger = [], koeretoejId) {
  let n = 0;
  for (const i of indberetninger) {
    if (!i || i.koeretoejId !== koeretoejId) continue;
    if (i.forloeb === "afsluttet") continue;
    const art = HAENDELSE_ART[i.art];
    if (!art?.paaKoeretoej || i.art === "braendstof") continue;
    n++;
  }
  return n;
}

/* ══════════════════════════════════════════════════════════════════════════
   CHAUFFØRAPPENS FLISER — beslutning 106
   ══════════════════════════════════════════════════════════════════════════

   ⚠ FLISERNE ER IKKE ARTERNE. Otte fliser, ti arter, og forskellen er med
   vilje: noden skal være præcis, knappen skal være hurtig.

   `Skade` er den ene der ikke er én til én. En chauffør der har ramt en
   rampe, og en der har væltet en palle, melder begge "skade" — men det er to
   arter (`koeretoejsskade` og `godsskade`), de har hvert sit feltskema, og de
   er BEGGE sensitive. Flisen spørger derfor ét spørgsmål mere frem for at
   gætte. Gættede vi, ville halvdelen af godsskaderne stå som enhedsskader, og
   det er den slags fejl der først opdages når forsikringen spørger.

   ⚠ OG DEN OMVENDTE VEJ: `kvittering` har ingen flise. Se noten ved arten. */

export const APP_FLISER = [
  { key: "reparation", ikon: "🔧", label: "Reparation", art: "reparation" },
  /* Ingen `art` — flisen fører til et valg. */
  { key: "skade",      ikon: "💥", label: "Skade",      vaelgMellem: ["koeretoejsskade", "godsskade"] },
  { key: "daek",       ikon: "🛞", label: "Dæk",        art: "daek" },
  { key: "service",    ikon: "🛠️", label: "Service",    art: "service" },
  { key: "truckwash",  ikon: "🚿", label: "Truckwash",  art: "truckwash" },
  { key: "tankning",   ikon: "⛽", label: "Tankning",   art: "braendstof" },
  { key: "parkering",  ikon: "🅿️", label: "Parkering",  art: "parkering" },
  { key: "andet",      ikon: "📋", label: "Andet",      art: "andet" },
];

/**
 * Hvad en flise fører til: en art, eller et valg mellem to.
 *
 * ⚠ RÆKKEFØLGEN I `vaelgMellem` ER IKKE TILFÆLDIG. Enhedsskaden står først
 * fordi den er den hyppigste for en chauffør — men BEGGE skal trykkes, og der
 * er ingen standard. Et forvalg ville blive stående hos den der har travlt.
 */
export function arterForFlise(key) {
  const flise = APP_FLISER.find((f) => f.key === key);
  if (!flise) return [];
  return flise.art ? [flise.art] : (flise.vaelgMellem || []);
}
