/* src/fleet/opgaveplan-regler.js
 * Hvornår en driftsopgave kan planlægges, FLYTTES og SKIFTE STATUS, og hvordan
 * et nej skal forstås.
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
  OPGAVE_ART, ALLE_ARBEJDSTYPER, ALLE_OPGAVE_STATUS, OPGAVE_STATUS,
  opgaveMangler, reservationFraOpgave,
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
 * Vinduet — de to felter reservationen regnes af.
 *
 * ⚠ DEN STÅR FOR SIG FORDI TO FUNKTIONER SPØRGER OM DET SAMME. En opgave man
 * PLANLÆGGER og en opgave man FLYTTER skal begge have et starttidspunkt og en
 * varighed, og sætningen skal være den samme begge steder — ellers får
 * brugeren to forklaringer på én spærring, alt efter hvordan han kom til den.
 * Det er samme grund som `tjekDisponering()` ligger ét sted.
 */
function tidsfelter(post, f) {
  if (!Number.isFinite(post.startMs)) {
    f.startMs = "Vælg en startdato og et klokkeslæt.";
  }

  /* ⚠ VARIGHEDEN ER PÅKRÆVET, OG DEN GÆTTES IKKE.
     Uden `estimeretMin` har opgaven ingen slutning: reservationFraOpgave()
     kaster, ressourcen bliver ikke spærret, og den ser FRI ud i
     disponeringen — værre end en spærring man kan se. En standardlængde ville
     spærre den i et tidsrum ingen har besluttet. Samme holdning som den
     manglende momssats. */
  if (!Number.isFinite(post.estimeretMin) || post.estimeretMin <= 0) {
    f.estimeretMin = "Angiv hvor længe enheden er optaget. Uden det bliver den ikke spærret.";
  } else if (post.estimeretMin > MAKS_MINUTTER) {
    f.estimeretMin =
      `Højst ${MAKS_MINUTTER / (60 * 24)} døgn. Er arbejdet længere, er det flere opgaver.`;
  }
}

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

  tidsfelter(post, f);

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

/* ══════════════════════════════════════════════════════════════════════════
   AT PLANLÆGGE ET SERVICEBESØG — den sidste lukkede vej

   ⚠ HVORFOR DET IKKE ER ET FLAG PÅ valideOpgaveplan().

   `art` er ikke en variant af den samme post — den er FELTSKEMAET
   (beslutning 21). En værkstedsopgave hænger på et køretøj og har en
   arbejdstype; et servicebesøg hænger på et anlæg eller en hel lokation og
   har ingen. En funktion med et art-flag ville skulle bære begge skemaer, og
   så er der ingenting tilbage af den spærring `art !== "vaerksted"` er:
   Driftskalenderen kunne oprette facilitys poster og omvendt.

   ⚠ OG DET GÆLDER OGSÅ SERVEREN. `facilityplanlaeg` SÆTTER `art: "facility"`
   ligesom `opgaveplanlaeg` sætter `vaerksted`. Kom arten udefra, ville
   modulspærringen kunne omgås: en kunde uden Fleet kunne oprette en
   værkstedsopgave gennem Facilitys dør.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * valideFacilityopgave(post, { aktiver, lokationer, leverandoerer }) → { ok, fejl }
 *
 * Samme form og samme svar som `valideOpgaveplan()`, og de deler `tidsfelter()`
 * — et servicebesøg og et værkstedsbesøg spærrer hver sin ressource på præcis
 * samme måde, og sætningen om en manglende varighed skal være den samme.
 */
export function valideFacilityopgave(
  post = {}, { aktiver = null, lokationer = null, leverandoerer = null } = {}
) {
  const f = {};

  /* ⚠ KUN FACILITY HERFRA — modstykket til `art !== "vaerksted"` ovenfor. */
  if (post.art !== "facility") {
    f.art = "Servicekalenderen planlægger facility-opgaver. Værkstedet har sin egen skærm.";
  }

  /* ⚠ ENTEN ET ANLÆG ELLER ET STED — IKKE BEGGE.
     `ressourceId()` foretrækker `aktivId`, så en post med begge felter
     reserverer ANLÆGGET og lader lokationen stå som en påstand ingen læser.
     Og anlæggets lokation står allerede på anlægget: to steder til samme
     kendsgerning driver fra hinanden første gang nogen flytter porten til en
     anden hal. Det er samme regel som at en enhed ikke får en `pladsId`.
     ⚠ MÅLT: fem af de ni facility-opgaver i demo-sættet bar begge felter. */
  if (post.aktivId && post.lokationId) {
    f.aktivId =
      "Vælg enten et anlæg eller hele lokationen — ikke begge. Anlæggets " +
      "lokation står på anlægget.";
  } else if (!post.aktivId && !post.lokationId) {
    f.aktivId = "Vælg hvilket anlæg besøget står på — eller hele lokationen.";
  } else if (post.aktivId && aktiver && !aktiver.includes(post.aktivId)) {
    f.aktivId = "Ukendt anlæg.";
  } else if (post.lokationId && lokationer && !lokationer.includes(post.lokationId)) {
    f.lokationId = "Ukendt lokation.";
  }

  /* ⚠ DIVISIONEN SÆTTES IKKE TIL `faelles` AF SIG SELV.
     Skærmen reagerer ikke på Gods/Bus — anlæggene er de samme uanset hvem der
     kører gennem porten — men opgaven bærer stadig HVEM DER BETALER, og det
     er ikke altid fælles. Målt: `op-013`, eftersynet af busladestanderne i
     Aalborg, står som `bus`. Låste funktionen feltet til `faelles`, ville den
     post ikke kunne oprettes gennem skærmen der viser den. */
  if (!["gods", "bus", "faelles"].includes(post.division)) {
    f.division = "Vælg hvilken division der bærer omkostningen.";
  }

  if (!PLANLAEGBAR_STATUS.includes(post.status)) {
    f.status = "Et besøg man planlægger, er planlagt eller afventende — ikke i gang eller udført.";
  }

  /* ⚠ INGEN ARBEJDSTYPE. Arten HAR ikke feltet (se ART_FELTER), og ordlisten
     er værkstedets. Et felt arten ikke har, er ikke et tomt felt — det er en
     post der ikke passer på sit eget skema. */
  if (post.arbejdstype) {
    f.arbejdstype = "Et servicebesøg har ingen arbejdstype — ordlisten er værkstedets.";
  }

  if (post.leverandoerId && leverandoerer && !leverandoerer.includes(post.leverandoerId)) {
    f.leverandoerId = "Ukendt leverandør.";
  }

  if (post.prioritet != null && !ALLE_PRIORITETER.includes(post.prioritet)) {
    f.prioritet = "Ukendt prioritet.";
  }

  tidsfelter(post, f);

  if (typeof post.beskrivelse === "string" && post.beskrivelse.length > 500) {
    f.beskrivelse = "Højst 500 tegn.";
  }
  if (!post.beskrivelse?.trim()) {
    f.beskrivelse = "Skriv hvad der skal laves.";
  }

  /* Nodens eget katalog til sidst — samme greb som i valideOpgaveplan().
     ⚠ NODEN NAVNGIVER RESSOURCEN "aktivId eller lokationId", og det er ikke
     et feltnavn. Uden oversættelsen ville den manglende ressource stå BÅDE
     ved feltet og som en nodefejl nederst — to sætninger om én mangel. */
  const NODENOEGLE = { "aktivId eller lokationId": "aktivId" };
  for (const mangel of opgaveMangler(post)) {
    const noegle = NODENOEGLE[mangel] || mangel;
    if (!f[noegle]) f._node = `Noden afviser posten: ${mangel}.`;
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/* ══════════════════════════════════════════════════════════════════════════
   AT FLYTTE EN OPGAVE — beslutning 49

   ⚠ EN FLYTNING ER IKKE EN OPRETTELSE, OG DEN ER HELLER IKKE TO SKRIVNINGER.
   Opgaven bærer sit vindue (`startMs` + `estimeretMin`) og sin ressource;
   reservationen bærer NØJAGTIG DET SAMME som et krav på fremtiden. Flyttes kun
   den ene, står de to og påstår hver sit — og den ene af de to påstande, en
   opgave uden en dækkende reservation, ser FRI ud i disponeringen. Det er
   beslutning 4's fejl og beslutning 45's begrundelse, nu for en ændring frem
   for en oprettelse.

   ⚠ DERFOR LIGGER REGNESTYKKET HER OG IKKE I FUNKTIONEN. `flytOpdatering()`
   er ren og kender ingen database, så de to fælder nedenfor kan prøves uden en
   emulator — samme grund som `beregnKpi()` ikke regnes i jobbet.

   ⚠ ARTEN FLYTTES IKKE MED. `opgaveplanlaeg` SÆTTER `art: "vaerksted"`, fordi
   den opretter. Her BEVARES opgavens egen: en flytning laver ingen ny post, og
   en funktion der kunne skifte arten, ville kunne lave en værkstedsopgave om
   til en facility-opgave — to feltskemaer, én post, og ingen af dem ville
   passe bagefter.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ SAMME VÆRDIER SOM `PLANLAEGBAR_STATUS`, MEN IKKE SAMME KONSTANT.
 *
 * De to svarer på hvert sit spørgsmål: den ene på hvad man må OPRETTE, den
 * anden på hvad man må FLYTTE. At de er ens i dag er et sammenfald, ikke en
 * kendsgerning — og den dag nogen vil kunne forlænge et estimat på en opgave
 * der er `igang`, skal kun den ene liste ændre sig. Slog vi dem sammen, ville
 * den ændring også åbne for at OPRETTE en opgave der allerede er i gang.
 *
 * ⚠ OG `igang` ER DET INTERESSANTE NEJ. En opgave der er i gang, betyder at
 * enheden står på liften NU. At flytte dens starttidspunkt bagud er at skrive
 * historien om; at flytte den frem er at påstå at arbejdet ikke er begyndt.
 * `udfoert` og `annulleret` er endestationer — samme regel som at der ingen vej
 * er tilbage fra `returneret` på et kasseudlån.
 */
export const FLYTBAR_STATUS = ["planlagt", "afventer"];

/**
 * Hvilke ressourcetyper hver art kan hænge på.
 *
 * ⚠ EN FACILITY-OPGAVE HAR TO. Et besøg på et anlæg spærrer anlægget; et besøg
 * UDEN anlæg spærrer hele lokationen — lukker man hallen, er alle porte i den
 * også optaget. De er hver sin ressourcetype i reservationsnoden, og derfor er
 * det ikke nok at kende rækkens id: skærmen skal sige HVILKEN slags række der
 * blev sluppet på. Se reservationFraOpgave().
 */
export const FLYTBARE_TYPER = {
  vaerksted: ["koeretoej"],
  facility: ["facilityAktiv", "lokation"],
};

/**
 * Opgaven som den ser ud EFTER flytningen. Bygger, skriver ikke.
 *
 * `aendring` er `{ startMs, estimeretMin, ressourceType, ressourceId }` —
 * gitterets eget sprog: en række og et vindue.
 *
 * ⚠ AT FLYTTE TIL EN LOKATION RYDDER `aktivId`. `ressourceId()` foretrækker
 * anlægget, så bliver feltet stående, peger reservationen stadig på porten
 * mens brugeren har sluppet blokken på hallen. Feltet er ikke bare uaktuelt —
 * det AFGØR hvad der spærres.
 */
export function flytEfter(foer = {}, aendring = {}) {
  const efter = { ...foer };
  if (Number.isFinite(aendring.startMs)) efter.startMs = aendring.startMs;
  if (Number.isFinite(aendring.estimeretMin)) efter.estimeretMin = aendring.estimeretMin;

  const { ressourceType: type, ressourceId: id } = aendring;
  if (!type || !id) return efter;

  if (foer.art === "vaerksted" && type === "koeretoej") efter.koeretoejId = id;
  if (foer.art === "facility" && type === "facilityAktiv") efter.aktivId = id;
  if (foer.art === "facility" && type === "lokation") {
    efter.lokationId = id;
    efter.aktivId = null;
  }
  return efter;
}

/** Rørte flytningen overhovedet noget? */
export function erFlyttet(foer = {}, efter = {}) {
  return ["startMs", "estimeretMin", "koeretoejId", "aktivId", "lokationId"]
    .some((felt) => (foer[felt] ?? null) !== (efter[felt] ?? null));
}

/**
 * kanFlyttes(opgave) → { ok, felt, aarsag }
 *
 * Kan posten OVERHOVEDET flyttes — uanset hvorhen? Tre ting afgør det, og de
 * kan besvares uden at vide hvor brugeren sigter.
 *
 * ⚠ DEN STÅR FOR SIG, FORDI GITTERET SKAL SPØRGE FØR DER TRÆKKES. En blok der
 * ser ud til at kunne trækkes, og som afvises i det øjeblik man slipper den,
 * er værre end en blok der ikke kan trækkes: den lover noget. Skærmen spørger
 * her og sætter markøren derefter — med den SAMME sætning serveren ville have
 * svaret. To formuleringer af én spærring er to forklaringer på én ting.
 *
 * ⚠ OG ET MANGLENDE ESTIMAT ER DEN VIGTIGE AF DE TRE.
 * Gitteret tegner en opgave uden estimat som ÉN TIME, så den kan ses og
 * klikkes. Regnede skærmen så flytningens nye varighed ud af blokkens egen
 * tegning, ville den time blive til et rigtigt `estimeretMin` — og bilen ville
 * være spærret en time ingen har besluttet, fordi vi engang havde brug for at
 * kunne se blokken. Det er præcis den standardlængde reservationFraOpgave()
 * nægter at gætte.
 */
export function kanFlyttes(opgave) {
  if (!opgave || !OPGAVE_ART[opgave.art]) {
    return { ok: false, felt: "art", aarsag: "Opgaven findes ikke, eller dens art er ukendt." };
  }
  if (!FLYTBAR_STATUS.includes(opgave.status)) {
    const navn = OPGAVE_STATUS[opgave.status]?.label || opgave.status;
    return {
      ok: false, felt: "status",
      aarsag: `Opgaven er "${navn}" og kan ikke flyttes. Arbejdet er enten i gang ` +
              "eller afsluttet — et nyt tidspunkt ville beskrive noget der ikke skete.",
    };
  }
  if (!Number.isFinite(opgave.estimeretMin) || opgave.estimeretMin <= 0) {
    return {
      ok: false, felt: "estimeretMin",
      aarsag: "Opgaven har intet estimat og derfor intet vindue at flytte. " +
              "Gitteret tegner den som én time for at den kan ses — det er ikke " +
              "en varighed nogen har besluttet. Sæt en varighed først.",
    };
  }
  return { ok: true, felt: null, aarsag: null };
}

/**
 * valideOpgaveflyt(foer, aendring, { ressourcer }) → { ok, fejl }
 *
 * `ressourcer` er id'erne på de rækker der findes. Sendes den ikke med,
 * springes eksistenstjekket over — klienten har dem i hånden, serveren slår op
 * i basen, og ingen af de to skal gætte på den andens vegne. Samme snit som
 * `enheder` i valideOpgaveplan().
 */
export function valideOpgaveflyt(foer, aendring = {}, { ressourcer = null } = {}) {
  const f = {};

  const kan = kanFlyttes(foer);
  if (!kan.ok) {
    f[kan.felt] = kan.aarsag;
    if (kan.felt === "art") return { ok: false, fejl: f };
  }

  const { ressourceType: type, ressourceId: id } = aendring;
  if (type || id) {
    if (!FLYTBARE_TYPER[foer.art].includes(type)) {
      f.ressourceType =
        `En opgave med art "${foer.art}" kan ikke hænge på en ` +
        `${type || "ukendt ressource"}. Arten flyttes ikke med.`;
    } else if (!id) {
      f.ressourceId = "Der blev ikke sagt hvilken række opgaven blev sluppet på.";
    } else if (ressourcer && !ressourcer.includes(id)) {
      f.ressourceId = "Ukendt ressource.";
    }
  }

  const efter = flytEfter(foer, aendring);

  /* ⚠ DEN FØRSTE SÆTNING VINDER, OG DET ER IKKE VILKÅRLIGT.
     `tidsfelter()` siger "Angiv hvor længe enheden er optaget" — rigtigt når
     man UDFYLDER en formular. `kanFlyttes()` siger hvorfor blokken ikke kan
     trækkes: at gitteret tegner den som én time, og at den time ikke er en
     varighed nogen har besluttet. Det er den sætning der hører til det man
     lige har gjort. Skrev tidsfelter() oven i den, ville skærmen vise det ene
     og serveren afvise med det andet — to forklaringer på én spærring. */
  const tid = {};
  tidsfelter(efter, tid);
  for (const [felt, tekst] of Object.entries(tid)) if (!f[felt]) f[felt] = tekst;

  /* ⚠ NODENS EGET KATALOG TIL SIDST. `opgaveMangler()` fanger det formularen
     ikke har — en facility-opgave hvor både anlæg og lokation blev ryddet, har
     ingen ressource at hænge på, og reservationFraOpgave() ville kaste. */
  for (const mangel of opgaveMangler(efter)) {
    if (!f[mangel]) f._node = `Noden afviser posten: ${mangel}.`;
  }

  /* ⚠ EN FLYTNING DER IKKE FLYTTER NOGET, ER IKKE EN FEJL — MEN DEN ER HELLER
     IKKE EN SKRIVNING. Slipper man blokken hvor den lå, skal der ikke stå i
     auditloggen at opgaven blev flyttet. En log der siger noget skete, når
     intet skete, gør resten af loggen mindre værd. */
  if (!Object.keys(f).length && !erFlyttet(foer, efter)) {
    f._intet = "Opgaven ligger allerede dér. Der er ikke noget at flytte.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * flytOpdatering(opgaveId, foer, aendring, { uid, nu }) → { opdatering, ny, … }
 *
 * Den ENE multi-path-opdatering: opgavens ændrede felter, den gamle
 * reservation væk og den nye på plads. Ren — den kender ingen database.
 *
 * ⚠ FÆLDE 1: SAMME RESSOURCE ER SAMME NØGLE.
 * Flytter man en opgave to timer frem på den SAMME bil, er den gamle og den
 * nye reservationssti det samme felt. Et objekt har kun én værdi pr. nøgle, så
 * "sæt den gamle til null og skriv den nye" bliver til én af delene — og
 * rækkefølgen i kildeteksten afgør hvilken. Landede `null` sidst, forsvandt
 * reservationen, og bilen så FRI ud mens den stod på liften. Derfor: nulstil
 * kun når stien FAKTISK skifter.
 *
 * ⚠ FÆLDE 2: OPGAVEN KONFLIKTER MED SIG SELV.
 * `tjekLedigMod()` filtrerer på `r.id !== ny.id`, og reservationen fra
 * `reservationFraOpgave()` bærer intet id. Uden det her ville opgavens EGEN
 * gamle reservation blive meldt som konflikt, og en flytning på to timer på
 * samme bil ville altid blive afvist — af opgaven selv. Derfor bærer `ny` sit
 * udledte id, som i `opgaveplanlaeg` og `etapeskift`.
 *
 * ⚠ OG EN OPGAVE UDEN ESTIMAT HAR INGEN GAMMEL RESERVATION AT FRIGIVE.
 * `reservationFraOpgave()` kaster på et manglende vindue frem for at gætte et,
 * så posten fik aldrig en reservation. Der er intet at nulstille — og en sti
 * bygget på et gættet vindue ville slette en ANDEN opgaves reservation.
 */
export function flytOpdatering(opgaveId, foer, aendring, { uid, nu }) {
  const efter = flytEfter(foer, aendring);

  const resId = `res-${opgaveId}`;
  const sti = (r) => `reservationer/${r.ressourceType}/${r.ressourceId}/${resId}`;

  let gammelSti = null;
  try {
    gammelSti = sti(reservationFraOpgave({ ...foer, id: opgaveId }));
  } catch {
    /* Uden vindue blev der aldrig skrevet en. Se hovedet. */
  }

  const nyRes = { ...reservationFraOpgave({ ...efter, id: opgaveId }), id: resId };
  const nySti = sti(nyRes);

  const opdatering = {};
  for (const felt of ["startMs", "estimeretMin", "koeretoejId", "aktivId", "lokationId"]) {
    if ((foer[felt] ?? null) !== (efter[felt] ?? null)) {
      opdatering[`opgaver/${opgaveId}/${felt}`] = efter[felt] ?? null;
    }
  }

  /* ⚠ INTET `aendretAf` PÅ POSTEN. Hvem der flyttede den, og hvornår, står i
     auditloggen — append-only, og det er dér "hvem gjorde hvad" hører hjemme.
     Et felt på posten ville være den samme kendsgerning et sted til, og det
     ene af de to steder kan overskrives. */

  if (gammelSti && gammelSti !== nySti) opdatering[gammelSti] = null;
  opdatering[nySti] = {
    fra: nyRes.fra, til: nyRes.til, kilde: nyRes.kilde,
    oprettetAf: uid, oprettetMs: nu,
  };

  return { opdatering, efter, ny: nyRes, gammelSti, nySti };
}

/* ══════════════════════════════════════════════════════════════════════════
   AT SKIFTE EN OPGAVES STATUS — beslutning 50

   ⚠ MASKINEN HAVDE SEKS TILSTANDE OG NUL VEJE IMELLEM DEM.
   `opgaveplanlaeg` opretter som `planlagt` eller `afventer`, `opgaveflyt`
   rører ikke `status`, og `opgaver` er `.write: false`. En værkstedsopgave
   kunne altså oprettes og flyttes, men aldrig meldes i gang eller udført —
   mens Arbejdskøen og Driftskalenderen viste statusser og talte dem op.

   ⚠ OG ET STATUSSKIFTE RØRER RESERVATIONEN. Det er hele grunden til at det
   ikke bare er et felt en klient kan sætte: en annulleret opgave skal give
   bilen fri igen, og en udført skal holde op med at spærre den. Landede kun
   den ene halvdel, ville bilen enten se optaget ud i timer hvor den er fri,
   eller fri mens den stod på liften. Beslutning 45's begrundelse, tredje gang.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Hvilke skift der findes. Samme form som ETAPE_OVERGANGE og UDLAAN_SKIFT.
 *
 * ⚠ `udfoert` OG `annulleret` ER ENDESTATIONER. Der er ingen vej tilbage —
 * samme regel som at en returneret kasse ikke kan sendes ud igen: skal
 * arbejdet gøres om, er det en NY opgave. En vej tilbage ville betyde at et
 * afsluttet forløb kunne genåbnes, og så er "udført" ikke et svar man kan
 * regne på.
 *
 * ⚠ OG DER ER INGEN VEJ FRA `igang` TILBAGE TIL `planlagt`.
 * Man kan ikke af-starte et stykke arbejde. Bilen HAR været på liften, og en
 * status der sagde andet, ville beskrive noget der ikke skete. Er den sat i
 * gang ved en fejl, er svaret `annulleret` med en begrundelse — ikke en
 * fortrydelse der ikke efterlader spor.
 *
 * `afventer` går BEGGE veje mod `igang`: arbejdet kan stoppe fordi en
 * reservedel mangler, og fortsætte når den kommer.
 */
export const OPGAVE_OVERGANGE = {
  indberettet: ["planlagt", "annulleret"],
  planlagt: ["igang", "afventer", "annulleret"],
  afventer: ["planlagt", "igang", "annulleret"],
  igang: ["afventer", "udfoert", "annulleret"],
  udfoert: [],
  annulleret: [],
};

/** Hvad der sker med reservationen ved hvert skift. Se noterne nedenfor. */
export const RESERVATION_VED = {
  planlagt: "uaendret",
  igang: "uaendret",
  afventer: "uaendret",
  /* Bilen er kørt fra værkstedet. Se afkortTil(). */
  udfoert: "afkort",
  /* Arbejdet skete aldrig. Samme regel som etapeskift: EN ANNULLERET TUR SKAL
     GIVE BILEN FRI IGEN — bliver reservationen stående, leder den næste
     disponent efter en bil der står lige der. */
  annulleret: "frigiv",
};

/**
 * kanSkifteOpgave(opgave, tilStatus) → { ok, aarsag }
 *
 * Svarer, afgør ikke. Skærmen tegner knapperne efter den; serveren afviser med
 * den. To formuleringer af én spærring er to forklaringer på én ting.
 */
export function kanSkifteOpgave(opgave, tilStatus) {
  if (!opgave || !OPGAVE_ART[opgave.art]) {
    return { ok: false, aarsag: "Opgaven findes ikke, eller dens art er ukendt." };
  }
  const fra = opgave.status;
  if (!OPGAVE_OVERGANGE[fra]) {
    return { ok: false, aarsag: `Ukendt status "${fra}".` };
  }
  if (fra === tilStatus) {
    return { ok: false, aarsag: "Opgaven står allerede der." };
  }
  if (!ALLE_OPGAVE_STATUS.includes(tilStatus)) {
    return { ok: false, aarsag: `Ukendt status "${tilStatus}".` };
  }
  if (!OPGAVE_OVERGANGE[fra].includes(tilStatus)) {
    const navn = (s) => OPGAVE_STATUS[s]?.label || s;
    /* ⚠ ENDESTATIONERNE FÅR DERES EGEN SÆTNING. "Udført kan ikke blive til
       planlagt" forklarer ingenting; "et afsluttet forløb genåbnes ikke"
       siger hvorfor, og hvad man så gør i stedet. */
    if (!OPGAVE_OVERGANGE[fra].length) {
      return {
        ok: false,
        aarsag: `Opgaven er "${navn(fra)}", og det er en endestation. Et afsluttet ` +
                "forløb genåbnes ikke — skal arbejdet gøres om, er det en ny opgave.",
      };
    }
    return {
      ok: false,
      aarsag: `"${navn(fra)}" kan ikke blive til "${navn(tilStatus)}". ` +
              `Herfra kan den blive: ${OPGAVE_OVERGANGE[fra].map(navn).join(", ")}.`,
    };
  }
  return { ok: true, aarsag: null };
}

/**
 * afkortTil(reservation, nu) → nyt `til`, eller null hvis den skal fjernes
 *
 * ⚠ EN UDFØRT OPGAVE SKAL HOLDE OP MED AT SPÆRRE. Meldes et besøg færdigt kl.
 * 11, mens reservationen løb til 16, ser bilen optaget ud i fem timer hvor den
 * er fri — og så leder den næste disponent efter en bil der står lige der.
 *
 * ⚠ MEN DEN FORLÆNGES ALDRIG. Løb arbejdet OVER sin tid, er "afkort til nu" i
 * virkeligheden en UDVIDELSE — og fremtiden er måske allerede givet væk: en
 * booking kan lovligt være startet da reservationen udløb. En udvidelse ville
 * lave et overlap datamodellen afviser, og gitteret tegner det som en konflikt
 * der ikke er nogens skyld. Overskridelsen kan i stedet ses på opgaven, hvor
 * `faktiskMin` er større end `estimeretMin`.
 *
 * ⚠ OG MELDES DEN FÆRDIG FØR DEN BEGYNDTE, spærrede den aldrig noget. Et
 * vindue med `til <= fra` findes ikke i modellen, så reservationen fjernes
 * frem for at blive et tomt interval ingen kan tolke.
 */
export function afkortTil(reservation, nu) {
  if (!reservation) return null;
  const { fra, til } = reservation;
  if (!Number.isFinite(fra) || !Number.isFinite(til)) return null;
  if (nu <= fra) return null;
  return Math.min(til, nu);
}

/**
 * statusOpdatering(opgaveId, foer, tilStatus, { faktiskMin, uid, nu })
 *   → { opdatering, efter, reservationssti }
 *
 * Statussen OG reservationens følge, i ÉN multi-path-opdatering. Ren — den
 * kender ingen database, så følgerne kan prøves uden en emulator.
 *
 * ⚠ TRE TAL, TRE BETYDNINGER, OG DE MÅ IKKE UDLEDES AF HINANDEN:
 *
 *   estimeretMin        hvad vi TROEDE arbejdet ville tage. Reservationens
 *                       grundlag, fordi et krav på fremtiden kun kan bygge på
 *                       en forventning.
 *   reservationens til  hvor længe RESSOURCEN var optaget. Efter et afkort er
 *                       det en måling, ikke en plan.
 *   faktiskMin          hvor længe ARBEJDET tog. En bil kan stå på liften i
 *                       seks timer og blive arbejdet på i to, fordi en
 *                       reservedel manglede.
 *
 * Regnede vi `faktiskMin` af det afkortede vindue, ville de fire ventetimer
 * blive til arbejdstid — og tallet bruges til at vurdere estimater. Det er
 * derfor mennesket angiver det, og derfor `kpi.opgaver.udenTidsregistrering`
 * TÆLLER dem der mangler frem for at spærre skiftet.
 */
export function statusOpdatering(opgaveId, foer, tilStatus, { faktiskMin, uid, nu }) {
  const efter = { ...foer, status: tilStatus };
  const opdatering = { [`opgaver/${opgaveId}/status`]: tilStatus };

  /* ⚠ VALGFRIT, OG null ER ET SVAR. En værkfører der lukker ti opgaver, ved
     ikke nødvendigvis hvor længe hver af dem tog, og et krævet felt ville
     blive udfyldt med fiktion. `udenTidsregistrering` gør hullet synligt —
     se kpi-aggregering.js. */
  if (tilStatus === "udfoert" && Number.isFinite(faktiskMin) && faktiskMin >= 0) {
    opdatering[`opgaver/${opgaveId}/faktiskMin`] = faktiskMin;
    efter.faktiskMin = faktiskMin;
  }

  /* ---- Reservationens følge ------------------------------------------ */
  let sti = null;
  let res = null;
  try {
    res = reservationFraOpgave({ ...foer, id: opgaveId });
    sti = `reservationer/${res.ressourceType}/${res.ressourceId}/res-${opgaveId}`;
  } catch {
    /* Uden vindue blev der aldrig skrevet en reservation. Der er intet at
       røre — og en sti bygget på et gættet vindue ville ramme en anden
       opgaves post. Samme forbehold som i flytOpdatering(). */
  }

  if (sti) {
    const virkning = RESERVATION_VED[tilStatus];
    if (virkning === "frigiv") {
      opdatering[sti] = null;
    } else if (virkning === "afkort") {
      const nyTil = afkortTil(res, nu);
      /* ⚠ HELE POSTEN SKRIVES, IKKE KUN `til`. En multi-path-opdatering med
         `…/res-x/til` ville lade de andre felter stå — men fjernes posten
         senere, er det ÉN nøgle der skal nulstilles, og to skrivemåder for
         den samme post er to steder at være uenige om dens form. */
      if (nyTil === null) opdatering[sti] = null;
      else if (nyTil < res.til) {
        opdatering[sti] = {
          fra: res.fra, til: nyTil, kilde: res.kilde,
          oprettetAf: uid, oprettetMs: nu,
          /* ⚠ FLAGET ER VIGTIGERE END TALLET — samme regel som dageUde() i
             Unitbooking. Uden det læses "til kl. 11" som en plan der altid
             sagde 11, og man kan ikke se forskel på et besøg der VAR kort og
             et der SLUTTEDE tidligt. Hvad planen sagde, står stadig på
             opgaven: startMs + estimeretMin. Ingen dublet. */
          afkortet: true,
        };
      }
      /* nyTil === res.til: arbejdet løb tiden ud. Intet at rette. */
    }
  }

  return { opdatering, efter, reservationssti: sti };
}
