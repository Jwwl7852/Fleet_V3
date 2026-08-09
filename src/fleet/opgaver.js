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
export const FELT = {
  /* Fælles */
  dato: "dato",
  beskrivelse: "beskrivelse",
  personId: "personId",                 // hvem der UDFØRER — ikke uid
  alvor: "alvor",
  estimatOere: "estimatOere",
  leverandoer: "leverandoer",
  /* vaerksted */
  koeretoejId: "koeretoejId",
  varighedMin: "varighedMin",           // dagsvisningen er timer, ikke døgn
  omkostningstype: "omkostningstype",
  besoegId: "besoegId",                 // værkstedsbesøget i kalenderen
  /* facility */
  aktivId: "aktivId",
  lokationId: "lokationId",
};

const FAELLES = [
  FELT.dato, FELT.beskrivelse, FELT.personId, FELT.alvor,
  FELT.estimatOere, FELT.leverandoer,
];

/* Rækkefølgen her er visningsrækkefølgen. Ét sted, så to skærme ikke lister
   de samme felter forskelligt. */
const ALLE_FELTER = [
  FELT.dato, FELT.beskrivelse, FELT.koeretoejId, FELT.aktivId, FELT.lokationId,
  FELT.varighedMin, FELT.personId, FELT.leverandoer, FELT.omkostningstype,
  FELT.besoegId, FELT.alvor, FELT.estimatOere,
];

export const ART_FELTER = {
  vaerksted: [...FAELLES, FELT.koeretoejId, FELT.varighedMin, FELT.omkostningstype, FELT.besoegId],
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
 */
export function reservationFraOpgave(opgave) {
  const art = OPGAVE_ART[opgave?.art];
  if (!art) throw new Error(`reservationFraOpgave: ukendt art "${opgave?.art}".`);
  const id = ressourceId(opgave);
  if (!id) throw new Error(`reservationFraOpgave: opgaven mangler sin ressource.`);
  if (!Number.isFinite(opgave.fra) || !Number.isFinite(opgave.til) || opgave.til <= opgave.fra) {
    throw new Error("reservationFraOpgave: fra og til skal være konkrete tidspunkter med til > fra.");
  }
  return {
    ressourceType: art.ressource,
    ressourceId: id,
    fra: opgave.fra,
    til: opgave.til,
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
