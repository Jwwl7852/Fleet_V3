/* src/fleet/stop.js
 * Etapens stop — hvor bilen skal hen, og hvad der skal af og på.
 * BESLUTNING 110.
 *
 * INGEN FIREBASE-IMPORT. Ren kerne — `bookingopret` bygger stoppene, skærmen
 * viser dem, og transportmærkatet trykker adressen. De skal være enige om
 * formen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ TO FELTER FOR ÉT SPØRGSMÅL, OG DET ENE BLEV SKREVET AF INGENTING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Målt i den udrullede base før beslutningen — otte etaper:
 *
 *   `fraSted` / `tilSted`       8 af 8. Et NAVN ("København"). Læst af TI
 *                               filer: prissætning, disponering, mærkater,
 *                               rutestatus. **Står ikke i regelfilens
 *                               feltliste overhovedet.**
 *
 *   `fraAdresse` / `tilAdresse` 2 af 8. STRUKTURERET — {navn, gade, postnr} —
 *                               med en `.validate` på hvert led. Læst af ÉN
 *                               fil. **Skrevet af ingenting.**
 *
 * Den strukturerede adresse var altså designet, valideret og aldrig taget i
 * brug, mens et fritekstfelt reglerne ikke kender, bar hele driften. Det
 * kunne ligge sådan uden at nogen så det, fordi `etaper` er `.write: false`:
 * kun Cloud Functions skriver, og Admin-SDK'et går uden om `.validate`.
 *
 * ⚠ ET STOP ERSTATTER IKKE `fraSted`. Stedet er et NAVN til prissætning og
 * ruteopslag; stoppet er en ADRESSE man kan køre til, med et tidsvindue, en
 * kontakt og det gods der skal af og på. De svarer på hvert sit spørgsmål, og
 * derfor bliver begge.
 *
 * Det der forsvinder, er `fraAdresse` som halvt udfyldt tredje form. Den er
 * `.validate: false` i reglerne — **forbudt, ikke fjernet**, som `division` i
 * beslutning 70: en manglende regel ville TILLADE den, og så kunne den vende
 * tilbage som data uden at nogen havde besluttet det.
 */

/**
 * ⚠ TO ARTER, IKKE FLERE. En grænseovergang er ikke et stop man laver noget
 * ved — den udledes stadig af `graenseovergange` og har hverken ordrer,
 * kontakt eller tidsvindue. Blev den en art her, skulle hver skærm huske at
 * et "stop" måske ikke er et sted man standser.
 */
export const STOP_ART = {
  afhentning: { label: "Afhentning", pill: "ok" },
  levering:   { label: "Levering",   pill: "info" },
};

export const ALLE_STOP_ARTER = Object.keys(STOP_ART);

/** Felter på et stop. Reglens `$andet: false` siger det samme. */
export const STOP_FELTER = [
  "art", "fraMs", "tilMs", "navn", "gade", "postnr", "by", "telefon", "ordrer",
];

/** Felter på en ordrelinje under et stop. */
export const ORDRE_FELTER = ["kundeId", "nummer", "kolli", "kg", "gods"];

/**
 * Stoppene på en etape, i rækkefølge.
 *
 * ⚠ NØGLET, IKKE EN ARRAY. RTDB har ingen arrays, og `forslag` kostede tre
 * lukkede overgange i produktion netop fordi demo brugte arrays mens noden var
 * nøglet (beslutning 76). Rækkefølgen kommer af NØGLEN som tal — ikke af
 * objektets iterationsorden, som RTDB ikke lover noget om.
 */
export function stopListe(etape) {
  const raa = etape?.stop;
  if (!raa || typeof raa !== "object") return [];
  return Object.entries(raa)
    .filter(([, s]) => s && typeof s === "object" && STOP_ART[s.art])
    .map(([nr, s]) => ({ ...s, id: `stop-${nr}`, nr: Number(nr) }))
    .filter((s) => Number.isFinite(s.nr))
    .sort((a, b) => a.nr - b.nr);
}

/** Ordrelinjerne på ét stop. */
export const ordreListe = (stop) =>
  Object.entries(stop?.ordrer || {})
    .filter(([, o]) => o && typeof o === "object")
    .map(([id, o]) => ({ ...o, id }));

/**
 * Adressen som én linje: "Transportvej 1, 8000 Aarhus C".
 *
 * ⚠ TOMME LED UDELADES, OG DER SÆTTES IKKE KOMMA FOR DEM. En adresse der
 * skriver ", 8000 " fordi gaden mangler, ser ud som en fejl i dataene — og
 * chaufføren kan ikke se om det er adressen eller skærmen der er gal.
 */
export const adresselinje = (s) =>
  [s?.gade, [s?.postnr, s?.by].filter(Boolean).join(" ")]
    .map((d) => (d || "").trim())
    .filter(Boolean)
    .join(", ");

/**
 * Hvor meget der skal HÅNDTERES — ikke hvor meget gods der findes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ DE SAMME TOLV PALLER OP OG AF ER TOLV PALLER OG TOOGTYVE LØFT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * En A→B-tur henter 12 paller og leverer de samme 12. Lægges begge stop
 * sammen, står der 24 — og det er ikke forkert, men det er ikke *paller*.
 * Det er **kolli at håndtere**, og det er dét en chauffør planlægger sin dag
 * efter: hvor mange gange han skal på og af med en palleløfter.
 *
 * Navnet på skærmen skal derfor sige `håndteringer` og ikke `paller`. Stod
 * der "24 paller" om en tur med 12, ville tallet være forkert på en måde
 * ingen kan se — og en chauffør der læssede efter det, ville stå med for
 * lidt plads.
 *
 * ⚠ ALTERNATIVET ER FRAVALGT: at summere kun afhentninger giver 0 på en
 * distributionsdag, hvor alt er leveringer. Der findes ikke ét tal der er
 * både "hvad der er med" og "hvad der skal gøres"; vi har valgt det sidste,
 * fordi det er det chaufføren bruger.
 *
 * ⚠ `null` NÅR ET TAL MANGLER, IKKE 0. En sum lagt af halvdelen af
 * ordrelinjerne er forkert på en måde ingen kan se — samme regel som
 * `mindst()` i format.js.
 */
export function summerOrdrer(stop = []) {
  let kolli = 0;
  let kg = 0;
  let helt = true;
  for (const s of stop) {
    for (const o of ordreListe(s)) {
      if (Number.isFinite(o.kolli)) kolli += o.kolli; else helt = false;
      if (Number.isFinite(o.kg)) kg += o.kg; else helt = false;
    }
  }
  return { kolli: helt ? kolli : null, kg: helt ? kg : null, helt };
}

/**
 * Er stoppet meldt nået?
 *
 * ⚠ UDLEDT AF MELDINGERNE, IKKE ET FLAG PÅ STOPPET. Skærmbilledet siger
 * *"Afhentning mangler scan"*, og det spørgsmål er allerede besvaret af
 * `statushaendelser`: en melding med et `stopId` (beslutning 103). Et
 * `scannetMs` på stoppet ville være den samme kendsgerning gemt to steder, og
 * de to ville drive fra hinanden første gang en melding blev sendt igen.
 *
 * En stregkodescanning er en anden MÅDE at sende den melding på — ikke et
 * andet felt.
 */
export const erNaaet = (stop, meldinger = []) =>
  meldinger.some((m) => m.stopId === stop?.id);

/** Hvor mange stop der er nået, og hvor mange der mangler. */
export function stopstatus(stop = [], meldinger = []) {
  const naaet = stop.filter((s) => erNaaet(s, meldinger)).length;
  return { naaet, tilbage: stop.length - naaet, i_alt: stop.length };
}

/**
 * Fejl ved et stop — tom liste betyder gyldigt.
 *
 * ⚠ HÅNDHÆVES OGSÅ I REGLEN. Her svares hurtigt; reglen afgør. En
 * klientvalidering der ikke også står i `firebase.rules.json`, tillader før
 * eller siden noget serveren skulle have stoppet.
 */
export function valideStop(s) {
  const fejl = [];
  const p = s || {};

  if (!STOP_ART[p.art]) fejl.push(`Ukendt stoptype "${p.art}".`);
  if (!p.navn || typeof p.navn !== "string") fejl.push("Stoppet mangler et navn.");

  for (const felt of Object.keys(p)) {
    if (!STOP_FELTER.includes(felt) && felt !== "id" && felt !== "nr") {
      fejl.push(`Ukendt felt: ${felt}`);
    }
  }

  /* ⚠ ET TIDSVINDUE ER TO TAL ELLER INGEN. Ét alene er ikke et vindue: "fra
     kl. 08" uden et til ville blive tegnet som et punkt, hvor det i
     virkeligheden er en åben ende. */
  const harFra = Number.isFinite(p.fraMs);
  const harTil = Number.isFinite(p.tilMs);
  if (harFra !== harTil) fejl.push("Et tidsvindue skal have både en start og en slutning.");
  else if (harFra && p.tilMs < p.fraMs) fejl.push("Vinduet slutter før det begynder.");

  for (const o of ordreListe(p)) {
    for (const felt of Object.keys(o)) {
      if (!ORDRE_FELTER.includes(felt) && felt !== "id") {
        fejl.push(`Ukendt felt på ordren: ${felt}`);
      }
    }
    /* ⚠ KOLLI OG KG ER HELE TAL. Et halvt kolli findes ikke, og et kg med
       decimaler ville lægge sig sammen til en vægt der ser præcis ud. */
    for (const f of ["kolli", "kg"]) {
      if (o[f] != null && !Number.isInteger(o[f])) {
        fejl.push(`${f} skal være et helt tal.`);
      }
    }
  }
  return fejl;
}

/**
 * De to stop en A→B-etape altid har.
 *
 * ⚠ DE BYGGES VED OPRETTELSEN, IKKE VED VISNINGEN. Et stop der først opstod
 * når skærmen tegnede det, kunne ikke bære en ordrelinje eller en kontakt — og
 * så var vi tilbage ved en udledt rute. Det var netop dét der gik galt med
 * `fraAdresse`: en form uden en skrivevej.
 *
 * ⚠ OG NAVNET ER STEDET, indtil nogen taster en adresse. Vi finder ikke på en
 * gade: en gættet adresse sender chaufføren det forkerte sted hen, og det er
 * værre end en adresse der mangler. Samme regel som den gættede momssats.
 */
export function stopFraStraekning({ fraSted, tilSted, fra, senestMs }) {
  const stop = {
    1: { art: "afhentning", navn: fraSted || "" },
    2: { art: "levering", navn: tilSted || "" },
  };
  /* ⚠ VINDUET ER KUNDENS ØNSKE, ikke et interval nogen har planlagt. Derfor
     fra = til: ét ønsket tidspunkt, ikke et spænd vi har fundet på.
     Disponenten sætter det rigtige vindue når turen bindes. */
  if (Number.isFinite(fra)) { stop[1].fraMs = fra; stop[1].tilMs = fra; }
  if (Number.isFinite(senestMs)) { stop[2].fraMs = senestMs; stop[2].tilMs = senestMs; }
  return stop;
}
