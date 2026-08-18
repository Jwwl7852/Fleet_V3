/* src/fleet/opgaver.js
 * Opgaver som entitet. BESLUTNING 21 — art styrer feltskemaet.
 *
 * INGEN IMPORTS — samme grund som permissions.js og flaade.js: den Cloud
 * Function der validerer en opgave, skal kunne bruge nøjagtig samme katalog.
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
  igang:       { label: "I gang",      pill: "ok"   },
  afventer:    { label: "Afventer",    pill: "warn" },
  udfoert:     { label: "Udført",      pill: "ok"   },
  annulleret:  { label: "Annulleret",  pill: "bad"  },
};

export const ALLE_OPGAVE_STATUS = Object.keys(OPGAVE_STATUS);

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
  beskrivelse: "beskrivelse",
  personId: "personId",                 // hvem der UDFØRER — ikke uid
  sted: "sted",
  status: "status",
  beloebOere: "beloebOere",             // opgavens OMKOSTNING, ikke en indtægt
  /* vaerksted */
  koeretoejId: "koeretoejId",
  estimeretMin: "estimeretMin",         // dagsvisningen er timer, ikke døgn
  faktiskMin: "faktiskMin",             // hvad der FAKTISK gik — se udenTidsregistrering
  besoegId: "besoegId",                 // værkstedsbesøget i kalenderen
  /* facility */
  aktivId: "aktivId",
  lokationId: "lokationId",
};

const FAELLES = [
  FELT.startMs, FELT.beskrivelse, FELT.personId, FELT.sted,
  FELT.status, FELT.beloebOere,
];

/* Rækkefølgen her er visningsrækkefølgen. Ét sted, så to skærme ikke lister
   de samme felter forskelligt. */
const ALLE_FELTER = [
  FELT.startMs, FELT.beskrivelse, FELT.sted, FELT.status,
  FELT.koeretoejId, FELT.aktivId, FELT.lokationId,
  FELT.estimeretMin, FELT.faktiskMin, FELT.personId, FELT.besoegId,
  FELT.beloebOere,
];

export const ART_FELTER = {
  vaerksted: [...FAELLES, FELT.koeretoejId, FELT.estimeretMin, FELT.faktiskMin, FELT.besoegId],
  facility: [...FAELLES, FELT.aktivId, FELT.lokationId],
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
 * ⚠ division er PÅKRÆVET og kan ikke arves fra køretøjet (beslutning 19).
 * Skriveren skal sætte den selv.
 */
export function opgaveMangler(opgave = {}) {
  const mangler = [];
  if (!OPGAVE_ART[opgave.art]) mangler.push("art");
  if (!["gods", "bus", "faelles"].includes(opgave.division)) mangler.push("division");
  if (opgave.art && !ressourceId(opgave)) {
    mangler.push(opgave.art === "vaerksted" ? "koeretoejId" : "aktivId eller lokationId");
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
