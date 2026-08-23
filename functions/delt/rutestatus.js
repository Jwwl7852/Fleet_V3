/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/rutestatus.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/rutestatus.js
 * Rute & status. BESLUTNING 22 — INGEN GPS.
 *
 * ⚠ HER STOD "INGEN IMPORTS". Filen importerer nu  — beslutning 110 —
 * fordi ruten har ÉN kilde: de eksplicitte stop når etapen har dem, og de
 * udledte ellers. To svar på hvor turen går, ville lade en statusmelding pege
 * på et stop den ene kendte og den anden ikke.
 *
 *  er selv importfri, og den står på DELTE_FILER — listen er lukket
 * under import, og en manglende kopi fejler ved DEPLOY, ikke ved test.
 *
 * ⚠ SKÆRMEN HED "LIVE-KORT", OG DET NAVN LOVEDE NOGET VI IKKE HAR.
 *
 * Der er ingen sporing: ingen GPS-boks, ingen chaufførapp, ingen position.
 * Et kort med prikker der bevæger sig, ville kræve en datakilde der ikke
 * findes — og et kort UDEN prikker er et kort der ser i stykker ud.
 *
 * Rute & status viser i stedet det vi faktisk ved:
 *
 *   den planlagte rute        fra etapen
 *   afsluttede stop           fra chaufførens statushændelser
 *   næste stop                udledt
 *   forventede tidspunkter    fra etapens etaMs og planen
 *
 * GPS bliver en DATAKILDE SENERE, ikke et fundament. Bygger man skærmen
 * omkring positioner, kan den ikke vise noget før sporingen findes — og
 * kommer sporingen aldrig, står man med en tom skærm man ikke kan sælge.
 * Bygger man den omkring planen og chaufførens meldinger, virker den i dag,
 * og en position bliver en ekstra kolonne.
 *
 * ⚠ EN STATUSHÆNDELSE ER NOGET ET MENNESKE HAR MELDT. Den er ikke en måling,
 * og den kan være forkert eller mangle. Skærmen skal derfor kunne vise "vi har
 * ikke hørt noget siden kl. 11.40" — ikke gætte en position ud af en plan.
 */

/* ⚠ ÉN KILDE TIL RUTEN. Se planlagteStop() — de eksplicitte stop vinder,
   og de udledte er faldbakken for etaper fra før beslutning 110. */
import { stopListe } from "./stop.js";

/** Hvad chaufføren melder. Fast vokabular: fritekst gør en tidslinje
 *  usøgbar, og så bliver den aldrig brugt til det den er lavet til. */
export const HAENDELSE = {
  afgang:          { label: "Afgang",              stop: true,  pill: "info" },
  ankomstLaesning: { label: "Ankommet, læsser",    stop: true,  pill: "warn" },
  afgangLaesning:  { label: "Læsset, kører",       stop: true,  pill: "info" },
  graense:         { label: "Grænse passeret",     stop: false, pill: "info" },
  pause:           { label: "Pause",               stop: false, pill: "warn" },
  ankomstLosning:  { label: "Ankommet, losser",    stop: true,  pill: "warn" },
  afsluttet:       { label: "Aflæsset, afsluttet", stop: true,  pill: "ok"   },
  forsinkelse:     { label: "Melder forsinkelse",  stop: false, pill: "bad"  },
};

export const ALLE_HAENDELSER = Object.keys(HAENDELSE);

/** Hændelser der afslutter etapen. */
const AFSLUTTER = new Set(["afsluttet"]);

/**
 * Den planlagte rute som en liste af stop. Udledt af etapen — den gemmes ikke
 * som sin egen node, for så ville den kunne drive fra fraSted og tilSted.
 */
export function planlagteStop(etape) {
  if (!etape) return [];

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ ÉT SVAR, IKKE TO — BESLUTNING 110
     ══════════════════════════════════════════════════════════════════════

     Etapen kan nu bære EKSPLICITTE stop med adresse, tidsvindue, kontakt og
     ordrelinjer (`stop.js`). Lå de ved siden af den udledte rute, ville der
     være to svar på hvor turen går — og `statushaendelser.stopId` prøves mod
     NETOP denne funktion (beslutning 103). En melding kunne så pege på et
     stop den ene kendte og den anden ikke.

     Funktionen svarer derfor med de eksplicitte når etapen har dem, og
     udleder ellers som før. De gamle etaper virker uændret.

     ⚠ GRÆNSEOVERGANGENE KOMMER MED BEGGE VEJE. En grænse er ikke et stop man
     laver noget ved — den har hverken ordrer eller kontakt — men den ER et
     punkt chaufføren melder passeret, og `naesteStop()` skal kunne finde den.
     Den udledes derfor stadig af `graenseovergange` og flettes ind. */
  const eksplicitte = stopListe(etape);
  if (eksplicitte.length) {
    const ud = [];
    for (const s of eksplicitte) {
      ud.push({
        id: s.id,
        sted: s.navn,
        rolle: s.art,
        planlagtMs: Number.isFinite(s.fraMs) ? s.fraMs : null,
        stop: s,
      });
      /* Grænserne ligger mellem afhentning og levering — altså efter det
         første stop. Med mere end to stop er det et gæt hvor de hører, og
         derfor lægges de kun ind når ruten ER A→B. */
      if (s.nr === 1 && eksplicitte.length === 2) {
        for (const g of etape.graenseovergange || []) {
          ud.push({ id: `graense-${g}`, sted: g, rolle: "graense", planlagtMs: null });
        }
      }
    }
    return ud;
  }

  const ud = [{ id: "start", sted: etape.fraSted, rolle: "afhentning", planlagtMs: etape.fra }];
  for (const g of etape.graenseovergange || []) {
    ud.push({ id: `graense-${g}`, sted: g, rolle: "graense", planlagtMs: null });
  }
  ud.push({ id: "slut", sted: etape.tilSted, rolle: "levering", planlagtMs: etape.etaMs ?? etape.til });
  return ud;
}

/**
 * seneste(haendelser) → den nyeste melding, eller null.
 *
 * Rækkefølgen afgøres af `ms` og ikke af listens orden: meldinger kan komme
 * ind i en anden rækkefølge end de skete, hvis chaufføren har været uden
 * dækning.
 */
export const seneste = (haendelser = []) =>
  [...haendelser].filter((h) => Number.isFinite(h?.ms)).sort((a, b) => b.ms - a.ms)[0] || null;

/** Er etapen meldt afsluttet? Udledt af meldingerne, ikke af et gemt flag. */
export const erAfsluttet = (haendelser = []) =>
  haendelser.some((h) => AFSLUTTER.has(h.type));

/**
 * naesteStop(etape, haendelser) → { stop, index } | null
 *
 * Det første planlagte stop der endnu ikke er meldt passeret. Er alt meldt,
 * er der intet næste — og det er ikke det samme som at etapen er afsluttet.
 */
export function naesteStop(etape, haendelser = []) {
  const stop = planlagteStop(etape);
  const naaede = new Set(haendelser.filter((h) => h.stopId).map((h) => h.stopId));
  const index = stop.findIndex((s) => !naaede.has(s.id));
  if (index < 0) return null;
  return { stop: stop[index], index };
}

/**
 * afvigelseFraPlan(etape, haendelser, nu) → minutter, positivt = forsinket
 *
 * BEREGNET af den seneste melding mod planen — aldrig gemt. Et lagret
 * forsinkelsestal ville drive i det sekund planen flyttes.
 *
 * Returnerer null når vi ikke kan vide det. At vise "0 min." fordi der ikke er
 * nogen melding, er at påstå at turen er i tide.
 */
export function afvigelseFraPlan(etape, haendelser = [], nu = Date.now()) {
  const sidst = seneste(haendelser);
  if (!sidst || !etape) return null;

  const meldt = haendelser.find((h) => h.type === "forsinkelse" && Number.isFinite(h.forsinketMin));
  if (meldt) return meldt.forsinketMin;

  /* Er etapen afsluttet, måler vi mod den faktiske afslutning. */
  const slut = haendelser.find((h) => h.type === "afsluttet");
  const planlagtSlut = etape.etaMs ?? etape.til;
  if (slut && Number.isFinite(planlagtSlut)) {
    return Math.round((slut.ms - planlagtSlut) / 60000);
  }
  return null;
}

/**
 * Hvor længe siden vi hørte fra chaufføren. Det er den ærlige erstatning for
 * en position: vi ved ikke hvor bilen er, men vi ved hvornår vi sidst hørte
 * noget.
 */
export function stilhedMin(haendelser = [], nu = Date.now()) {
  const sidst = seneste(haendelser);
  return sidst ? Math.round((nu - sidst.ms) / 60000) : null;
}

/** Tre trin, som serviceTone. Over fire timers stilhed på en igangværende tur
 *  er noget nogen skal reagere på. */
export function stilhedTone(minutter) {
  if (minutter == null) return { tone: "bad", tekst: "Ingen meldinger" };
  if (minutter > 240) return { tone: "bad", tekst: `${Math.round(minutter / 60)} t siden` };
  if (minutter > 90) return { tone: "warn", tekst: `${minutter} min. siden` };
  return { tone: "ok", tekst: `${minutter} min. siden` };
}

/* ══════════════════════════════════════════════════════════════════════════
   AT MELDE — chaufførappens ene skrivning. Beslutning 103.
   ══════════════════════════════════════════════════════════════════════════

   Alt ovenfor LÆSER meldinger. Indtil nu var der ingen der skrev dem: noden
   fandtes hverken i `firebase.rules.json` eller i seedet, og Rute & status
   stod med "Ingen meldinger" på hver eneste tur, for alle.

   ⚠ EN MELDING ER IKKE ET TILSTANDSSKIFT. Etapens tilstand skiftes af
   `etapeskift` og kun dér (beslutning 40). En chauffør der melder "aflæsset",
   fortæller hvad han har gjort — han afslutter ikke turen i systemets
   forstand. Blandede vi de to, kunne en melding fra en telefon uden dækning
   lande fire timer for sent og flytte en booking der allerede var faktureret.

   ⚠ TIDSPUNKTET KOMMER FRA TELEFONEN, IKKE FRA SERVEREN.
   Det er det modsatte af `udleveretMs` på et kasseudlån, og forskellen er
   forbindelsen: et kasseudlån skiftes af et menneske foran en skærm, mens en
   melding sendes fra en lastbil hvor signalet kan være væk. Sattes tiden på
   serveren, ville en melding sendt kl. 14 stå kl. 16 fordi det var da
   dækningen kom igen — og `stilhedMin()` ville sige at vi lige havde hørt fra
   ham.

   Prisen er at telefonens ur kan være forkert. Den betaler vi: et forkert ur
   er sjældent, og en tidslinje der springer, er synlig. Et serverstempel er
   altid forkert præcis når det betyder noget.

   ⚠ `klientId` GØR EN GENSENDELSE UFARLIG. Appen sender ikke i kø endnu
   (valgt fra i denne omgang), men modellen skal kunne bære det: sender
   telefonen den samme melding to gange, skal den anden være den samme post og
   ikke en post mere. Uden feltet skulle en kø opfinde et — og så ville den
   gamle og den nye model ikke kunne lægges sammen. */

/** Felter en melding må bære. `$andet: false` i reglen siger det samme. */
export const MELDING_FELTER = [
  "type", "ms", "uid", "klientId", "stopId", "forsinketMin", "note",
];

/**
 * Er meldingen gyldig? Liste af fejl — tom betyder ja.
 *
 * ⚠ HÅNDHÆVES I FUNKTIONEN, IKKE AF REGLEN ALENE. Noden er `.write: false`,
 * så en klient kan ikke nå `.validate`, og Admin SDK går uden om den. Samme
 * arbejdsdeling som `valideOpgaveplan()` (beslutning 45).
 *
 * ⚠ `uid` PRØVES IKKE HER. Den sættes af serveren ud fra tokenet — en klient
 * der måtte skrive sit eget, kunne melde i en kollegas navn. Det er `uid` og
 * ikke `personId`: en melding er hvem der GJORDE noget.
 */
export function valideMelding(melding, { etape = null } = {}) {
  const fejl = [];
  const m = melding || {};

  if (!HAENDELSE[m.type]) {
    fejl.push(`Ukendt meldingstype "${m.type}".`);
    return fejl;
  }
  if (!Number.isFinite(m.ms)) fejl.push("Meldingen mangler et tidspunkt.");
  if (typeof m.klientId !== "string" || !m.klientId) {
    fejl.push("Meldingen mangler et klientId.");
  }

  for (const felt of Object.keys(m)) {
    if (!MELDING_FELTER.includes(felt)) fejl.push(`Ukendt felt: ${felt}`);
  }

  /* ⚠ ET stopId SKAL PEGE PÅ ET PLANLAGT STOP. Et frit id ville lade en
     melding "nå" et sted der ikke er på ruten — og `naesteStop()` ville
     springe et rigtigt stop over uden at nogen kunne se hvorfor. */
  if (m.stopId != null) {
    const kendte = planlagteStop(etape).map((s) => s.id);
    if (!kendte.includes(m.stopId)) {
      fejl.push(`Stoppet "${m.stopId}" står ikke på etapens rute.`);
    }
  }

  /* En forsinkelse UDEN minutter er en melding om at noget er galt, uden at
     sige hvor galt. Den er tilladt — chaufføren ved det måske ikke endnu —
     men et tal skal være et tal. */
  if (m.forsinketMin != null && !Number.isInteger(m.forsinketMin)) {
    fejl.push("Forsinkelsen skal være hele minutter.");
  }
  if (m.note != null && (typeof m.note !== "string" || m.note.length > 200)) {
    fejl.push("Noten skal være tekst på højst 200 tegn.");
  }
  return fejl;
}

/**
 * Meldingen som den skal skrives — uden `uid`, som serveren sætter.
 *
 * ⚠ TOMME FELTER UDELADES. RTDB sletter et `null` ved skrivning, og en post
 * hvor halvdelen af felterne er forsvundet, ligner en post der er blevet
 * rettet. Se `medFuldForm()` i kpi-aggregering.js om den anden side af det.
 */
export function byggMelding({ type, ms, klientId, stopId, forsinketMin, note }) {
  const ud = { type, ms, klientId };
  if (stopId) ud.stopId = stopId;
  if (Number.isInteger(forsinketMin)) ud.forsinketMin = forsinketMin;
  if (note?.trim()) ud.note = note.trim();
  return ud;
}

/**
 * De meldinger en chauffør med rimelighed kan sende nu.
 *
 * ⚠ IKKE EN TILSTANDSMASKINE. En chauffør melder hvad der SKETE, og
 * virkeligheden kommer ikke altid i rækkefølge — han kan holde pause før
 * afgang eller melde forsinkelse tre gange. Listen er derfor en SORTERING,
 * ikke en spærring: det sandsynlige først, resten stadig tilgængeligt.
 *
 * En knap der er væk, tvinger chaufføren til at lyve om hvad der skete.
 */
export function foreslaaedeMeldinger(haendelser = []) {
  const meldt = new Set(haendelser.map((h) => h.type));
  const raekkefoelge = [
    "afgang", "ankomstLaesning", "afgangLaesning", "graense",
    "ankomstLosning", "afsluttet",
  ];
  const naeste = raekkefoelge.find((t) => !meldt.has(t));
  const resten = ALLE_HAENDELSER.filter((t) => t !== naeste);
  return naeste ? [naeste, ...resten] : ALLE_HAENDELSER;
}

/**
 * Meldingerne for én etape, sorteret i tid — fra nodens egen form.
 *
 * ⚠ DET ENE STED FORMEN OVERSÆTTES. Noden er nøglet på meldingens `klientId`,
 * for RTDB har ingen arrays, og en gensendelse skal ramme den SAMME post. En
 * skærm der skrev `Object.values()` selv, ville før eller siden skrive
 * `.length` på objektet i stedet — det er `forslag.length` fra beslutning 76,
 * hvor tre overgange var lukkede i produktion mens de virkede i demo.
 *
 * ⚠ POSTEN BÆRER OGSÅ ET `id`. `useListe` sætter etapens id på posten, og
 * `HAENDELSE[...]`-tjekket nedenfor er det der holder det ude af listen: en
 * nøgle hvis værdi ikke er en kendt melding, er ikke en melding.
 */
export function meldingerFor(post) {
  if (!post || typeof post !== "object") return [];
  return Object.entries(post)
    .filter(([, v]) => v && typeof v === "object" && HAENDELSE[v.type]
      && Number.isFinite(v.ms))
    .map(([noegle, v]) => ({ ...v, id: v.klientId || noegle }))
    .sort((a, b) => a.ms - b.ms);
}
