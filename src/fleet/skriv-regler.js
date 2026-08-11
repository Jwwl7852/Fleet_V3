/* src/fleet/skriv-regler.js
 * Hvad en fejlet skrivning BETYDER — som ren logik, uden transport.
 *
 * ⚠ DELT I TO AF SAMME GRUND SOM audit.js OG audit-regler.js.
 *
 * `skriv.js` importerer `firebase.js`, som læser `import.meta.env` og derfor
 * kun kan indlæses af Vite. Lå tolkningen dér, kunne den ikke prøves i Node —
 * og prøvesuiten kører i Node. Politikken hører altså i en fil uden imports,
 * transporten i en anden. Det er samme opdeling som permissions.js og
 * personale.js har, og af samme grund.
 *
 * ---------------------------------------------------------------------------
 * ⚠ EN AFVIST SKRIVNING ER IKKE EN NETVÆRKSFEJL
 *
 * `permission-denied` betyder at reglerne VIRKER. Oversættes den til "kunne
 * ikke gemme, prøv igen", får brugeren at vide at systemet er i stykker — og
 * han prøver igen, og igen. Det er samme skelnen som dataTilstand() laver på
 * læsesiden, og den skal holdes her.
 */
import { erAfvist } from "./datatilstand.js";

/** Hvorfor en skrivning ikke lykkedes. Ikke en tekst — en tilstand. */
export const SKRIV = {
  ok: "ok",
  /* Reglerne afviste. Systemet virker; brugeren må ikke det her. */
  naegtet: "naegtet",
  /* Databasen kunne ikke nås. "Prøv igen" giver mening. */
  forbindelse: "forbindelse",
  /* Serveren afviste FORMEN — et felt manglede eller havde forkert type.
     Det er en programfejl hos os, ikke hos brugeren, og teksten skal sige
     det frem for at bede ham rette noget han ikke kan se. */
  ugyldig: "ugyldig",
  /* Ingen database. Demo-mode: skærmene virker, men intet gemmes. */
  demo: "demo",
};

const BESKED = {
  [SKRIV.naegtet]:
    "Din rolle må ikke gemme det her. Serveren afviste — det er ikke en fejl.",
  [SKRIV.forbindelse]:
    "Kunne ikke nå databasen. Ændringen er ikke gemt. Prøv igen.",
  [SKRIV.ugyldig]:
    "Serveren afviste formen på det der blev sendt. Det er en fejl hos os — " +
    "ændringen er ikke gemt, og den bliver det ikke ved at prøve igen.",
  [SKRIV.demo]:
    "Demo-tilstand: der er ingen database, så intet blev gemt.",
};

export const skrivBesked = (art) => BESKED[art] || null;

/**
 * Oversætter en RTDB-fejl til en tilstand.
 *
 * ⚠ RTDB SKELNER IKKE. `permission-denied` dækker BÅDE en afvist permission og
 * en fejlet `.validate` — koden er den samme. Vi kan derfor ikke afgøre hvilken
 * det var ud fra fejlen alene, og det er præcis derfor kaldere sender
 * `formentligGyldig`: har vi selv tjekket formen først, er en afvisning næsten
 * altid adgang. Har vi ikke, er den næsten altid formen.
 */
export function tolkFejl(fejl, { formentligGyldig = true } = {}) {
  if (!fejl) return SKRIV.ok;
  if (erAfvist(fejl)) return formentligGyldig ? SKRIV.naegtet : SKRIV.ugyldig;
  return SKRIV.forbindelse;
}

/**
 * nyId(praefiks) — en databasenøgle til en ny post.
 *
 * ⚠ IKKE ET NUMMER. Forretningsnumre (booking, sag, faktura) har formatet
 * PRÆFIKS-ÅÅÅÅ-NNNNN og kommer fra en counter i en transaction — beslutning 8
 * — og den ligger i en Cloud Function. Det her er kun en nøgle, og den må
 * aldrig vises som et nummer til brugeren.
 */
export const nyId = (praefiks) =>
  `${praefiks}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
