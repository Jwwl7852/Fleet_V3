/* src/fleet/opgaver.js
 * Opgaver som entitet. BESLUTNING 21 — art styrer feltskemaet.
 *
 * ⚠ ÉN IMPORT, OG REGLEN ER IKKE "INGEN IMPORTS". Her stod netop det, og
 * formuleringen var upræcis på samme måde som i kopier-delt.mjs: kravet er at
 * listen er LUKKET UNDER IMPORT. Den Cloud Function der validerer en opgave,
 * skal bruge nøjagtig samme katalog som skærmen, og `functions/`-mappen er det
 * eneste der deployes — så alt hvad filen henter, skal med samme sted.
 * `prioritet.js` er importfri og står i DELTE_FILER.
 *
 * ⚠ ARTEN ER `vaerksted` | `facility` — IKKE `vaerksted` | `langtur`.
 *
 * Det rettede en modstrid. README sagde i lang tid at opgaver skulle have en
 * art `vaerksted | langtur`, men den formulering er ældre end beslutning 16.
 * Da etaper kom som egen node, blev `langtur` en DUBLET: hvert eneste felt en
 * langtur har brug for, står allerede på etapen —
 *
 *     fraSted, tilSted, koeretoejId, personId, maengde, senestMs,
 *     forslag[], valgtForslagId
 *
 * — og matchAabneEtaper() finder åbne ture med
 * orderByChild("tilstand").equalTo("aaben") PÅ ETAPER. Lå langturen også i
 * opgaver, ville matchningen enten overse den eller finde to poster for én tur.
 *
 * Den afgørende grund er en fejl beslutning 16 allerede lukkede. Prototypen
 * viste DE-QR 777 med afgang 28/6 i reservationstabellen og DE-KL 404 den 24/6
 * i timelinen — ikke en tastefejl, men to poster for samme tildeling. Svaret
 * var: der må ikke være to steder at være uenige. En langtur som både opgave
 * og etape genåbner præcis det, for koeretoejId og personId ville stå begge
 * steder.
 *
 * DE TO NODER FORBLIVER TO. Beslutning 16 begrundede det med statsmaskineriet:
 * opgaver.status (indberettet → planlagt → igang → udfoert) er et andet
 * maskineri end etapens tilstand (kladde → afventerPlan → afventerKoord →
 * reserveret). Ét status-felt med to betydninger er beslutning 11 og 14 om
 * igen. `art` ændrer ikke det argument.
 *
 * DISPONERING LÆSER BEGGE NODER:
 *   dagsvisning   opgaver med art 'vaerksted' — varighed i timer
 *   ugesvisning   etaper — ETA over døgngrænser, grænseovergange, køre-hviletid
 */

import { ALLE_PRIORITETER } from "./prioritet.js";

/**
 * Hvad arbejdet udføres PÅ. Det er den ægte artsforskel i noden: en
 * værkstedsopgave hænger på et køretøj, en facility-opgave på et aktiv eller
 * en lokation, og de to har ikke de samme felter.
 */
export const OPGAVE_ART = {
  vaerksted: { label: "Værksted", ressource: "koeretoej" },
  facility:  { label: "Facility", ressource: "facilityAktiv" },
};

export const ALLE_OPGAVE_ARTER = Object.keys(OPGAVE_ART);

/* Opgavens eget statsmaskineri. IKKE etapens — se noten i toppen.
   `afventer` er ikke det samme som etapens `aaben`: her venter arbejdet på en
   reservedel eller en leverandør, dér venter godset på en passende tur. */
export const OPGAVE_STATUS = {
  indberettet: { label: "Indberettet", pill: "warn" },
  planlagt:    { label: "Planlagt",    pill: "info" },
  /* ⚠ warn, IKKE ok. "I gang" og "Udført" stod begge som ok — altså i samme
     grønne — og de to er netop dem man skal kunne skelne på en kalender uden
     at læse teksten: den ene betyder at bilen STADIG står på værkstedet.
     Samme fejl som lav og normal begge i blåt i prioritetskataloget.
     Mockuppens signaturforklaring siger det samme: Planlagt blå, I gang
     ravgul, Fuldført grøn. */
  igang:       { label: "I gang",      pill: "warn" },
  afventer:    { label: "Afventer",    pill: "warn" },
  udfoert:     { label: "Udført",      pill: "ok"   },
  annulleret:  { label: "Annulleret",  pill: "bad"  },
};

export const ALLE_OPGAVE_STATUS = Object.keys(OPGAVE_STATUS);

/* ---- Hvilken slags arbejde ------------------------------------------- */

/**
 * ⚠ arbejdstype, IKKE type. Og det er ikke pedanteri.
 *
 * Noden har allerede `art` (vaerksted|facility). Et felt ved siden af der hed
 * `type`, ville vaere praecis den forveksling der allerede har kostet os to
 * gange: `indberetninger`' indeks navngav "type", mens hver post baerer "art",
 * og `opgaver`' indeks navngav "dato", som ingen post har. Begge dele
 * overlevede fordi et forkert feltnavn ikke FEJLER — RTDB henter hele noden
 * ned og filtrerer i klienten, med en advarsel i konsollen og en regning i
 * stilhed. Et navn der ikke kan forveksles med `art`, kan ikke laves om til
 * den fejl.
 *
 * ⚠ OG DET ER SAMME ORDLISTE SOM INDKOEBETS OMKOSTNINGSTYPE. Det er ikke et
 * sammenfald: naar vaerkstedet fakturerer et serviceeftersyn, ER omkostningens
 * type det arbejde der blev udfoert. Laa der to lister, ville det hedde "Dæk"
 * paa opgaven og "Dækskifte" paa indkoebet — og saa kan de ikke summeres i en
 * rapport. Kataloget laa i demo-vaerksted.js, altsaa i en DEMO-fil, hvor et
 * modul ikke kunne naa det uden at lave sin egen kopi.
 */
export const ARBEJDSTYPE = {
  service: "Serviceeftersyn",
  reparation: "Reparation",
  daek: "Dæk",
  syn: "Syn og godkendelse",
  reservedele: "Reservedele",
  skade: "Skade",
};

export const ALLE_ARBEJDSTYPER = Object.keys(ARBEJDSTYPE);

/* ---- Art styrer feltskemaet ------------------------------------------ */

/**
 * ⚠ ET FELT ARTEN IKKE HAR, ER IKKE ET TOMT FELT. Samme regel som på flåden:
 * en facility-opgave har ingen kilometerstand og intet køretøj, og vises det
 * som "—", ligner det en mangel nogen bør udfylde. Brug harFelt() til at
 * udelade rækken helt.
 */
/**
 * ⚠ KATALOGET NAVNGAV FELTER INGEN OPGAVE HAR.
 *
 * Her stod `dato`, `varighedMin` og `estimatOere`. Noden bærer `startMs`,
 * `estimeretMin` og `beloebOere` — og det er nodens navne der gælder: de står
 * i `firebase.rules.json`, i `.indexOn` og på hver eneste post.
 *
 * ⚠ OG DET VAR ANDEN HALVDEL AF EN FEJL JEG ALLEREDE HAR RETTET ÉN GANG.
 * `opgaver`s indeks navngav `dato`, som ingen post har; jeg rettede indekset
 * til `startMs` og opdagede ikke at MODULET sagde det samme forkerte.
 * Et katalog der ikke matcher dataene, er værre end intet katalog: skærmene
 * spørger `harFelt()` og får ja til et felt der er tomt.
 */
export const FELT = {
  /* Fælles */
  startMs: "startMs",
  /* ⚠ TRE TRIN, OG DE ER IKKE FLEETS EGNE. Kataloget staar i prioritet.js og
     deles med Warehouses plukordrer — samme spoergsmaal, samme ordliste.
     Vaerdien er lav|normal|hoej; labelet paa den midterste er "Mellem". */
  prioritet: "prioritet",
  beskrivelse: "beskrivelse",
  personId: "personId",                 // hvem der UDFØRER — ikke uid
  sted: "sted",
  status: "status",
  beloebOere: "beloebOere",             // opgavens OMKOSTNING, ikke en indtægt
  /* vaerksted */
  koeretoejId: "koeretoejId",
  arbejdstype: "arbejdstype",           // service | reparation | daek | …
  /* ⚠ ET ID, IKKE ET NAVN. Vaerkstedet stod som fritekst i tre filer med hver
     sin stavemaade at drive med, foer leverandoerer/ blev kilden. */
  leverandoerId: "leverandoerId",
  estimeretMin: "estimeretMin",         // dagsvisningen er timer, ikke døgn
  faktiskMin: "faktiskMin",             // hvad der FAKTISK gik — se udenTidsregistrering
  besoegId: "besoegId",                 // værkstedsbesøget i kalenderen
  /* facility */
  aktivId: "aktivId",
  lokationId: "lokationId",
  /* ⚠ SAGEN — OG DEN STOD PÅ POSTERNE, IKKE I KATALOGET.
     Målt: 18 værkstedsopgaver og 9 facility-opgaver i demo-sættet bærer
     `sagId`, og regelfilens `.validate` fik feltet ved beslutning 45. Kun
     kataloget manglede det.
     ⚠ Den er FÆLLES og ikke facilitys egen: begge arter kan komme fra en sag.
     `besoegId` er noget andet — det er værkstedsbesøget i kalenderen, altså
     hvor opgaven blev PLANLAGT, ikke hvad den handler om. */
  sagId: "sagId",
};

const FAELLES = [
  FELT.startMs, FELT.beskrivelse, FELT.personId, FELT.sted,
  FELT.status, FELT.prioritet, FELT.beloebOere, FELT.sagId,
];

/* Rækkefølgen her er visningsrækkefølgen. Ét sted, så to skærme ikke lister
   de samme felter forskelligt. */
const ALLE_FELTER = [
  FELT.startMs, FELT.beskrivelse, FELT.sted, FELT.status, FELT.prioritet,
  FELT.koeretoejId, FELT.aktivId, FELT.lokationId,
  FELT.arbejdstype, FELT.leverandoerId,
  FELT.estimeretMin, FELT.faktiskMin, FELT.personId, FELT.besoegId,
  FELT.sagId, FELT.beloebOere,
];

/**
 * ⚠ FACILITY-SKEMAET LOVEDE MINDRE END POSTERNE BAR — OG PRØVEN SÅ DET IKKE.
 *
 * Her stod `facility: [...FAELLES, aktivId, lokationId]`, og en prøve slog
 * fast at `harFelt("facility", "estimeretMin")` var FALSK med begrundelsen
 * "dagsvisningen er timer, ikke døgn — varigheden hører på
 * værkstedsopgaven". Målt i demo-sættet: **alle ni** facility-opgaver bærer
 * `estimeretMin`, seks bærer `leverandoerId`, og Servicekalenderen regner
 * hver eneste blok af `slutter(o)`, som læser netop estimatet.
 *
 * Værre: `reservationFraOpgave()` KASTER uden det, uanset art — et
 * servicebesøg uden varighed kan ikke spærre sit anlæg. Et felt reservationen
 * regnes af, kan ikke stå uden for artens skema.
 *
 * ⚠ OG PRØVEN VAR ENSRETTET. Den holdt kataloget op mod en VÆRKSTEDSOPGAVE og
 * spurgte kun "lover kataloget noget ingen post har". Den modsatte retning —
 * "bærer posterne noget kataloget ikke lover" — fandtes for flåden
 * (demo-flaade.js) og ikke for opgaver. Begge retninger prøves nu, for begge
 * arter.
 *
 * ⚠ `arbejdstype` BLEV UDENFOR, og det er ikke en forglemmelse. Ingen af de
 * ni facility-opgaver bærer den, ordlisten er værkstedets og deles med
 * Procures omkostningstype (service, reparation, dæk, syn …), og et felt der
 * blev tilføjet fordi det KUNNE give mening, er et gæt. Kataloget beskriver
 * hvad posterne har.
 */
export const ART_FELTER = {
  vaerksted: [...FAELLES, FELT.koeretoejId, FELT.arbejdstype, FELT.leverandoerId,
              FELT.estimeretMin, FELT.faktiskMin, FELT.besoegId],
  facility: [...FAELLES, FELT.aktivId, FELT.lokationId, FELT.leverandoerId,
             FELT.estimeretMin, FELT.faktiskMin],
};

export const harFelt = (art, felt) => (ART_FELTER[art] || []).includes(felt);

export const felterFor = (art) => ALLE_FELTER.filter((f) => harFelt(art, f));

/** Hvilken ressourcetype opgaven binder. Bruges når opgaven skal reservere:
 *  en værkstedsopgave optager et køretøj, en facility-opgave et aktiv. */
export const ressourceFor = (art) => OPGAVE_ART[art]?.ressource ?? null;

/** Ressource-id'et på en konkret opgave, uanset art. Så en kalender kan lægge
 *  begge arter i samme gitter uden at kende arten. */
export function ressourceId(opgave) {
  if (!opgave) return null;
  if (opgave.art === "vaerksted") return opgave.koeretoejId ?? null;
  if (opgave.art === "facility") return opgave.aktivId ?? opgave.lokationId ?? null;
  return null;
}

/**
 * reservationFraOpgave(opgave) → posten reserver() skal skrive.
 *
 * BYGGER, SKRIVER IKKE — samme mønster som reservationFraFravaer() og
 * reservationFraAftale().
 *
 * Den lå som en lokal kopi i Vaerkstedskalender.jsx, indtil Disponering fik
 * brug for den samme. To skærme med hver sin kopi er den fejl vi fangede i
 * Bookingopsætnings divisionsfilter — usynlig indtil den ene drev.
 *
 * Kilden følger arten: en værkstedsopgave spærrer et køretøj (prioritet 40 —
 * en bil på værksted kan ikke køre), en facility-opgave optager et aktiv
 * (prioritet 20). Prioriteten selv står i reservations.js og skrives ikke her.
 *
 * ⚠ DEN KUNNE ALDRIG KALDES PÅ EN RIGTIG OPGAVE.
 *
 * Den krævede `fra` og `til`. Noden bærer `startMs` og `estimeretMin`, og
 * hver eneste opgave kastede derfor. At funktionen alligevel virkede, skyldtes
 * at alle tre kaldsteder fodrer den med et BESØG — som tilfældigvis har
 * `fra`/`til`. Resultatet: en værkstedsopgave på vores egen lift spærrede
 * ingenting, og `etapeskift` kunne disponere bilen mens den stod der.
 *
 * ⚠ VINDUET REGNES AF ESTIMATET, og det er en PLAN — ikke en måling.
 * `faktiskMin` er hvad der gik; `estimeretMin` er hvad vi tror. En
 * reservation er et krav på fremtiden, så estimatet er det rigtige grundlag.
 *
 * ⚠ OG ET MANGLENDE ESTIMAT GÆTTES IKKE. Uden varighed er der intet vindue,
 * og en standardlængde ville spærre bilen i et tidsrum ingen har besluttet.
 * Samme regel som `koerselMin` på en langtur: den SPÆRRES frem for at blive
 * gættet.
 */
export function reservationFraOpgave(opgave) {
  const art = OPGAVE_ART[opgave?.art];
  if (!art) throw new Error(`reservationFraOpgave: ukendt art "${opgave?.art}".`);
  const id = ressourceId(opgave);
  if (!id) throw new Error(`reservationFraOpgave: opgaven mangler sin ressource.`);

  /* Et BESØG bærer sit vindue direkte; en OPGAVE bærer sin start og sit
     estimat. Begge former tages imod — de beskriver det samme krav. */
  const fra = Number.isFinite(opgave.fra) ? opgave.fra : opgave.startMs;
  const til = Number.isFinite(opgave.til)
    ? opgave.til
    : (Number.isFinite(fra) && Number.isFinite(opgave.estimeretMin)
      ? fra + opgave.estimeretMin * 60000
      : undefined);

  if (!Number.isFinite(fra)) {
    throw new Error(
      "reservationFraOpgave: opgaven mangler et starttidspunkt (fra eller startMs)."
    );
  }
  if (!Number.isFinite(til) || til <= fra) {
    throw new Error(
      "reservationFraOpgave: uden til eller estimeretMin er der intet vindue at " +
      "reservere. En standardlængde ville spærre ressourcen i et tidsrum ingen " +
      "har besluttet."
    );
  }
  /* ⚠ En facility-opgave binder ENTEN et anlæg ELLER et helt sted, og de er
     to forskellige ressourcetyper. Lukker man hallen, er alle porte i den
     også optaget — derfor kan lokationen ikke bare være "aktivet uden id".
     Ternæret står her frem for et import: filen har ingen imports, og
     ressourceTypeForFacility() i facility.js siger det samme for skærmene. */
  const ressourceType = opgave.art === "facility"
    ? (opgave.aktivId ? "facilityAktiv" : "lokation")
    : art.ressource;

  return {
    ressourceType,
    ressourceId: id,
    fra,
    til,
    kilde: {
      type: opgave.art === "vaerksted" ? "vaerksted" : "facilitySag",
      id: opgave.id,
      reference: null,
    },
    maengde: null,
    note: null,
  };
}

/**
 * Er posten gyldig efter reglernes krav? Til UI-feedback — reglerne er
 * kontrollen. Fejler lukket: en ukendt art giver falsk.
 *
 * ⚠ HER STOD AT division ER PÅKRÆVET og ikke kan arves fra køretøjet. Feltet
 * er fjernet helt i beslutning 70 — og netop den sætning var oplysningen: et
 * felt der er påkrævet og hverken kan arves eller udledes, skal tastes af et
 * menneske hver gang, og det menneske vidste allerede hvilken forretning han
 * arbejdede i.
 * Skriveren skal sætte den selv.
 */
export function opgaveMangler(opgave = {}) {
  const mangler = [];
  if (!OPGAVE_ART[opgave.art]) mangler.push("art");
  if (opgave.art && !ressourceId(opgave)) {
    mangler.push(opgave.art === "vaerksted" ? "koeretoejId" : "aktivId eller lokationId");
  }
  /* ⚠ EN MANGLENDE PRIORITET ER IKKE EN MANGEL — EN UKENDT ER.
     Feltet er valgfrit med vilje: en indberetning kommer fra en chauffoer i
     marken, og prioriteten saettes af den vaerkfoerer der triagerer. "Ikke
     vurderet" er et svar, og det staar paa skaermen som sit eget tal.
     Havde vi krævet feltet, ville den der opretter, skulle gaette — og saa
     ville alt vaere "Mellem" og tallet ubrugeligt.
     En vaerdi UDEN FOR de tre trin er derimod en fejl: den kan ikke tegnes,
     den kan ikke sorteres, og reglerne afviser den alligevel. */
  if (opgave.prioritet != null && !ALLE_PRIORITETER.includes(opgave.prioritet)) {
    mangler.push("prioritet (ukendt værdi)");
  }
  /* Samme skel som paa prioriteten: en MANGLENDE arbejdstype er lovlig — en
     facility-opgave har ingen — men en UKENDT er en vaerdi der hverken kan
     tegnes eller summeres mod indkoebet. */
  if (opgave.arbejdstype != null && !ALLE_ARBEJDSTYPER.includes(opgave.arbejdstype)) {
    mangler.push("arbejdstype (ukendt værdi)");
  }
  return mangler;
}

/* ---- Hvor arbejdet ligger --------------------------------------------- *
 * Fordel stop paa sted, flest foerst. Ren funktion og i en .js-fil, saa den
 * kan proeves — samme grund som regnestykket i gitter.js ligger uden React.
 * Laa den i Stopoversigt.jsx, kunne node ikke importere den.
 *
 * Sekundaer sortering er alfabetisk: to steder med lige mange opgaver skal
 * staa i samme raekkefoelge hver gang, ellers hopper listen mellem renders.
 */
export function fordelPaaSted(stop = []) {
  const efterSted = new Map();
  for (const s of stop) {
    const sted = s.sted || "Ukendt";
    if (!efterSted.has(sted)) efterSted.set(sted, { sted, antal: 0, toner: [] });
    const p = efterSted.get(sted);
    p.antal += 1;
    p.toner.push(s.tone || "info");
  }
  return [...efterSted.values()].sort(
    (a, b) => b.antal - a.antal || a.sted.localeCompare(b.sted, "da")
  );
}
