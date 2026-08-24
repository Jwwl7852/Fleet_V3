/* src/fleet/meldingskoe.js
 * Den lokale kø for statusmeldinger uden forbindelse.
 *
 * Beslutning 103 byggede modellen til det uden at bygge køen selv:
 * *"Køen er ikke bygget — appen er ikke offline — men modellen skal kunne
 * bære den, ellers skulle en kø opfinde feltet senere, og den gamle og den
 * nye model kunne ikke lægges sammen."* Feltet er `klientId` — skrivningen
 * er `statushaendelser/<etapeId>/<klientId>`, ikke et `push()`, så en
 * gensendelse med samme klientId lander som SAMME post, ikke en ny.
 *
 * Denne fil er ren bogføring: læg i kø, tag ud af kø, læs køen. Selve
 * afsendelsen (kaldFunktion) hører i skærmen, som denne fil ikke kender —
 * samme adskillelse som resten af fleet/: politik uden firebase.
 */

const NOEGLE = "fc-meldingskoe-v1";

function laesRaat() {
  try {
    const raa = localStorage.getItem(NOEGLE);
    const v = raa ? JSON.parse(raa) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    /* Ugyldigt JSON, eller localStorage findes ikke i dette vindue. En tom
       kø er den sikre fejl her — ikke en kastet undtagelse midt i en
       melding chaufføren lige har trykket på. */
    return [];
  }
}

function skrivRaat(koe) {
  try {
    localStorage.setItem(NOEGLE, JSON.stringify(koe));
  } catch {
    /* localStorage kan være fuldt eller blokeret (privat vindue). Meldingen
       tabes så på samme måde som den gjorde FØR køen fandtes — ikke værre,
       og en kastet undtagelse her ville tabe den lige så vist. */
  }
}

/** Alt hvad køen indeholder, i den rækkefølge de skal (gen)sendes. */
export function koeIndhold() {
  return laesRaat();
}

/**
 * Lægger en melding i køen. Idempotent på klientId — trykker chaufføren to
 * gange fordi han ikke så nogen reaktion, skal det ikke blive til to
 * ventende poster.
 */
export function laegIKoe({ etapeId, melding }) {
  const koe = laesRaat();
  if (koe.some((p) => p.melding.klientId === melding.klientId)) return;
  koe.push({ etapeId, melding });
  skrivRaat(koe);
}

export function fjernFraKoe(klientId) {
  skrivRaat(laesRaat().filter((p) => p.melding.klientId !== klientId));
}

/**
 * ⚠ SERVERENS EGNE AFVISNINGER ER IKKE ET FORBINDELSESPROBLEM.
 *
 * Disse koder betyder at meldingen NÅEDE serveren, og den vurderede den og
 * sagde nej — et ugyldigt stopId, ingen adgang, etapen findes ikke. En
 * gensendelse ville få nøjagtig samme svar igen, og en kø der bliver ved med
 * at prøve noget der aldrig kan lykkes, er ikke en kø — det er en løkke.
 *
 * Alt andet — ingen kode overhovedet, "internal", "unavailable",
 * "deadline-exceeded" — er hvad en afbrudt forbindelse ser ud som herfra.
 * Det er den tilstand køen findes for.
 */
const SERVER_AFVIST = new Set([
  "functions/invalid-argument", "functions/permission-denied",
  "functions/not-found", "functions/failed-precondition",
  "functions/unauthenticated", "functions/already-exists",
  "functions/resource-exhausted", "functions/out-of-range",
  "functions/unimplemented", "functions/data-loss",
]);

export const erForbindelsesfejl = (e) =>
  typeof navigator === "undefined" || !navigator.onLine || !SERVER_AFVIST.has(e?.code);
