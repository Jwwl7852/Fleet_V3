/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/opgaveplan-regler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/opgaveplan-regler.js
 * Hvornår en driftsopgave kan planlægges, og hvordan et nej skal forstås.
 *
 * ⚠ POLITIK, IKKE TRANSPORT — sjette gang efter samme mønster (audit-regler,
 * skriv-regler, brugere-regler, udbyder-regler, udlaan-regler). Filen kan
 * prøves i Node; `opgaveplan.js` ved siden af importerer firebase.js, som kun
 * Vite kan indlæse.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ SAMME FIL VALIDERER I SKÆRMEN OG PÅ SERVEREN — OG DET ER IKKE PÆNHED.
 *
 * CLAUDE.md: "Skrive en klientvalidering der ikke også står i
 * firebase.rules.json." Validering i en formular findes for at svare hurtigt,
 * ikke for at afgøre noget. Er de to uenige, er reglerne rigtige — og en
 * kontrol der kun findes i frontend, tillader før eller siden noget serveren
 * skulle have stoppet.
 *
 * Hver regel herunder har derfor sin modpart i regelfilen:
 *
 *   art              matches(/^(vaerksted|facility)$/)
 *   division         matches(/^(gods|bus|faelles)$/)
 *   status           længde ≤ 40, ordlisten i opgaver.js
 *   prioritet        matches(/^(lav|normal|hoej)$/)
 *   arbejdstype      længde ≤ 40, ordlisten i opgaver.js
 *   startMs          isNumber()
 *   estimeretMin     isNumber() && > 0
 *   beskrivelse      længde ≤ 500
 *   koeretoejId      opslag i koeretoejer/
 *   leverandoerId    opslag i leverandoerer/
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  OPGAVE_ART, ALLE_ARBEJDSTYPER, ALLE_OPGAVE_STATUS, opgaveMangler,
} from "./opgaver.js";
import { ALLE_PRIORITETER } from "./prioritet.js";

/* ---- Hvad man må planlægge ------------------------------------------- */

/**
 * ⚠ KUN `planlagt` OG `afventer` KAN OPRETTES HERFRA.
 *
 * En opgave man PLANLÆGGER, er pr. definition ikke i gang og ikke udført. Kunne
 * formularen sætte `udfoert` direkte, kunne et værkstedsbesøg meldes færdigt
 * uden at nogen havde haft bilen på liften — samme fejl som kassens
 * klargøringstrin, hvor genvejen fra `booket` til `udlaant` er lukket med
 * vilje. `indberettet` hører heller ikke til: den kommer fra en chauffør, ikke
 * fra en disponent der planlægger.
 *
 * `afventer` er med, fordi den er et RIGTIGT svar ved oprettelsen: arbejdet er
 * aftalt, men reservedelen er ikke kommet. Se scooteren i demo-sættet.
 */
export const PLANLAEGBAR_STATUS = ["planlagt", "afventer"];

/* ---- Svaret ----------------------------------------------------------- */

export const PLANSVAR = {
  ok: "ok",
  /* ⚠ ENHEDEN ER LOVET VÆK. Systemet virker — det ER svaret. Serverens tekst
     navngiver hvad der spærrer og hvornår, og den beholdes ordret: en generisk
     "kunne ikke gemmes" ville lade disponenten prøve igen med samme dato uden
     nogensinde at få at vide hvad der stod i vejen. */
  konflikt: "konflikt",
  /* Rollen må ikke, abonnementet er på pause, eller Fleet er fravalgt.
     ⚠ IKKE en netværksfejl. "Prøv igen" ville lære brugeren at systemet er i
     stykker — se skriv.js. */
  naegtet: "naegtet",
  /* Formen var forkert. En fejl hos os, ikke hos brugeren. */
  ugyldig: "ugyldig",
  forbindelse: "forbindelse",
  demo: "demo",
};

const BESKED = {
  [PLANSVAR.naegtet]:
    "Du må ikke planlægge driftsopgaver. Serveren afviste — det er ikke en fejl.",
  [PLANSVAR.ugyldig]:
    "Serveren afviste formen på det der blev sendt. Det er en fejl hos os, og " +
    "den bliver ikke bedre af at prøve igen.",
  [PLANSVAR.forbindelse]:
    "Kunne ikke nå serveren. Intet blev ændret. Prøv igen.",
  [PLANSVAR.demo]:
    "Demo-tilstand: der er ingen server, så intet blev gemt.",
};

export const planBesked = (art) => BESKED[art] || null;

/**
 * ⚠ EN AFVIST SKRIVNING ER IKKE EN NETVÆRKSFEJL. `permission-denied` betyder
 * at reglerne VIRKER, og `failed-precondition` at enheden er optaget — begge
 * er svar, ikke nedbrud. Kun `unavailable` og en manglende app er transport.
 */
export function tolkPlanfejl(fejl) {
  const kode = String(fejl?.code || "").replace(/^functions\//, "");
  const besked = fejl?.message || null;

  if (kode === "permission-denied" || kode === "unauthenticated") {
    return { art: PLANSVAR.naegtet, besked: besked || BESKED[PLANSVAR.naegtet] };
  }
  if (kode === "failed-precondition") {
    /* Serverens egen tekst — den navngiver spærringen. Se hovedet. */
    return { art: PLANSVAR.konflikt, besked };
  }
  if (kode === "invalid-argument" || kode === "not-found") {
    return { art: PLANSVAR.ugyldig, besked: besked || BESKED[PLANSVAR.ugyldig] };
  }
  return { art: PLANSVAR.forbindelse, besked: BESKED[PLANSVAR.forbindelse] };
}

/* ---- Validering ------------------------------------------------------- */
/**
 * ⚠ ET LOFT PÅ VARIGHEDEN, OG DET ER IKKE VILKÅRLIGT.
 *
 * 90 døgn. Et værkstedsbesøg der varer længere, er ikke ét besøg — det er en
 * enhed der er taget ud af drift, og den tilstand hører på enheden
 * (`udeAfDrift`), ikke som en tre måneder lang reservation. Uden loftet kunne
 * en tastefejl i minutfeltet spærre en bil i årevis, og fejlen ville kun kunne
 * ses ved at åbne posten.
 */
export const MAKS_MINUTTER = 90 * 24 * 60;


/**
 * valideOpgaveplan(post, { enheder, leverandoerer }) → { ok, fejl }
 *
 * `fejl` er et map felt → sætning, så formularen kan sætte teksten ved det
 * felt der mangler. Serveren kalder den SAMME funktion og afviser med den
 * samme sætning — to formuleringer af én spærring er to forklaringer på én
 * ting.
 *
 * `enheder` og `leverandoerer` er lister af id'er. Sendes de ikke med,
 * springes eksistenstjekket over: klienten har dem i hånden, serveren slår op
 * i basen, og ingen af de to skal gætte på den andens vegne.
 */
export function valideOpgaveplan(post = {}, { enheder = null, leverandoerer = null } = {}) {
  const f = {};

  /* ⚠ KUN VÆRKSTED HERFRA. Facility-opgaver planlægges i Facility →
     Servicekalender, som læser den SAMME node. To formularer til én node
     ville være to steder at være uenige om feltskemaet — beslutning 12's
     fejl i en ny forklædning. */
  if (post.art !== "vaerksted") {
    f.art = "Driftskalenderen planlægger værkstedsopgaver. Facility har sin egen skærm.";
  } else if (!OPGAVE_ART[post.art]) {
    f.art = "Ukendt art.";
  }

  /* ⚠ DIVISION KAN IKKE UDLEDES AF ENHEDEN. Beslutning 19 forbyder feltet på
     koeretoejer/, mens opgaver/ kræver det — værdien skal sættes af den der
     planlægger. Udfyldte formularen den ud fra bilen, ville vi genindføre
     præcis den kobling beslutning 19 fjernede. */
  if (!["gods", "bus", "faelles"].includes(post.division)) {
    f.division = "Vælg hvilken division der bærer opgaven. Den kan ikke udledes af enheden.";
  }

  if (!PLANLAEGBAR_STATUS.includes(post.status)) {
    f.status = "En opgave man planlægger, er planlagt eller afventende — ikke i gang eller udført.";
  } else if (!ALLE_OPGAVE_STATUS.includes(post.status)) {
    f.status = "Ukendt status.";
  }

  if (!post.koeretoejId) {
    f.koeretoejId = "Vælg hvilken enhed opgaven står på.";
  } else if (enheder && !enheder.includes(post.koeretoejId)) {
    f.koeretoejId = "Ukendt enhed.";
  }

  if (!ALLE_ARBEJDSTYPER.includes(post.arbejdstype)) {
    f.arbejdstype = "Vælg hvilken slags arbejde det er.";
  }

  /* ⚠ VALGFRI — MEN IKKE FRITEKST. Ingen leverandør betyder eget værksted; en
     ukendt leverandør er en fejlstavning der ellers ville blive til et
     værksted ingen kan finde igen. */
  if (post.leverandoerId && leverandoerer && !leverandoerer.includes(post.leverandoerId)) {
    f.leverandoerId = "Ukendt leverandør.";
  }

  /* Prioritet er VALGFRI: sættes den ikke, står opgaven som ikke vurderet, og
     det er et svar. En ukendt værdi er derimod en fejl — se prioritet.js. */
  if (post.prioritet != null && !ALLE_PRIORITETER.includes(post.prioritet)) {
    f.prioritet = "Ukendt prioritet.";
  }

  if (!Number.isFinite(post.startMs)) {
    f.startMs = "Vælg en startdato og et klokkeslæt.";
  }

  /* ⚠ VARIGHEDEN ER PÅKRÆVET, OG DEN GÆTTES IKKE.
     Uden `estimeretMin` har opgaven ingen slutning: reservationFraOpgave()
     kaster, enheden bliver ikke spærret, og den ser FRI ud i disponeringen —
     værre end en spærring man kan se. En standardlængde ville spærre enheden i
     et tidsrum ingen har besluttet. Samme holdning som den manglende
     momssats. */
  if (!Number.isFinite(post.estimeretMin) || post.estimeretMin <= 0) {
    f.estimeretMin = "Angiv hvor længe enheden er optaget. Uden det bliver den ikke spærret.";
  } else if (post.estimeretMin > MAKS_MINUTTER) {
    f.estimeretMin =
      `Højst ${MAKS_MINUTTER / (60 * 24)} døgn. Er arbejdet længere, er det flere opgaver.`;
  }

  if (typeof post.beskrivelse === "string" && post.beskrivelse.length > 500) {
    f.beskrivelse = "Højst 500 tegn.";
  }
  if (!post.beskrivelse?.trim()) {
    f.beskrivelse = "Skriv hvad der skal laves.";
  }

  /* ⚠ TIL SIDST: NODENS EGET KATALOG. opgaveMangler() er det samme tjek
     demo-sættene valideres med, og den fanger felter formularen ikke har —
     en art uden ressource, en ukendt arbejdstype. Ligger fejlen kun her,
     ville en post oprettet ad en anden vej slippe forbi. */
  for (const mangel of opgaveMangler(post)) {
    if (!f[mangel]) f._node = `Noden afviser posten: ${mangel}.`;
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}
