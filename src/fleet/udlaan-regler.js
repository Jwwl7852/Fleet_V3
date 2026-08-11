/* src/fleet/udlaan-regler.js
 * Hvordan et svar fra `kasseudlaanskriv` skal forstås.
 *
 * ⚠ POLITIK, IKKE TRANSPORT — femte gang efter samme mønster (audit-regler,
 * skriv-regler, brugere-regler, udbyder-regler). Filen importerer intet, og
 * derfor kan den prøves i Node. `udlaan.js` ved siden af importerer
 * firebase.js, som kun Vite kan indlæse.
 *
 * ⚠ DEN VIGTIGSTE FORSKEL FRA DE ANDRE FEJLTOLKNINGER STÅR I `konflikt`.
 * Når serveren siger nej til en booking, ER begrundelsen svaret: *hvilken*
 * sag kassen allerede er lovet væk til, og hvornår. En generisk tekst som
 * "kunne ikke gemmes" ville lade brugeren prøve igen med samme datoer, og
 * han ville aldrig få at vide hvad der stod i vejen. Serverens besked
 * beholdes derfor ordret.
 */

export const UDLAANSSVAR = {
  ok: "ok",
  /* Kassen er lovet væk. Systemet virker — det er svaret. */
  konflikt: "konflikt",
  /* Rollen må ikke, abonnementet er på pause, eller modulet er fravalgt.
     ⚠ IKKE en netværksfejl. "Prøv igen" ville lære brugeren at systemet er
     i stykker. */
  naegtet: "naegtet",
  /* Formen var forkert. En fejl hos os, ikke hos brugeren. */
  ugyldig: "ugyldig",
  /* En anden nåede først, og transaktionen gav op. Her giver "prøv igen"
     rent faktisk mening — det er det ENESTE sted i filen hvor det gør. */
  optaget: "optaget",
  forbindelse: "forbindelse",
  demo: "demo",
};

const BESKED = {
  [UDLAANSSVAR.naegtet]:
    "Du må ikke skrive udlån her. Serveren afviste — det er ikke en fejl.",
  [UDLAANSSVAR.ugyldig]:
    "Serveren afviste formen på det der blev sendt. Det er en fejl hos os, " +
    "og den bliver ikke bedre af at prøve igen.",
  [UDLAANSSVAR.optaget]:
    "En anden skrev på den samme kasse i samme sekund. Intet blev ændret — prøv igen.",
  [UDLAANSSVAR.forbindelse]:
    "Kunne ikke nå serveren. Intet blev ændret. Prøv igen.",
  [UDLAANSSVAR.demo]:
    "Demo-tilstand: der er ingen server, så intet blev gemt.",
};

export const udlaansBesked = (art) => BESKED[art] || null;

export function tolkUdlaansfejl(fejl) {
  const kode = String(fejl?.code || "").replace(/^functions\//, "");
  const besked = fejl?.message || null;

  if (kode === "permission-denied" || kode === "unauthenticated") {
    return { art: UDLAANSSVAR.naegtet, besked: besked || BESKED[UDLAANSSVAR.naegtet] };
  }
  if (kode === "failed-precondition") {
    /* ⚠ SERVERENS EGEN TEKST. Den navngiver sagen og perioden — se hovedet. */
    return { art: UDLAANSSVAR.konflikt, besked };
  }
  if (kode === "aborted") {
    return { art: UDLAANSSVAR.optaget, besked: BESKED[UDLAANSSVAR.optaget] };
  }
  if (kode === "invalid-argument" || kode === "not-found") {
    return { art: UDLAANSSVAR.ugyldig, besked: besked || BESKED[UDLAANSSVAR.ugyldig] };
  }
  return { art: UDLAANSSVAR.forbindelse, besked: BESKED[UDLAANSSVAR.forbindelse] };
}
