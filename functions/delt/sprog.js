/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/sprog.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/sprog.js
 * Sprog for udgående leverandørmail — Skive 4D.
 *
 * ⚠ ÉT KATALOG, IKKE TO. `leverandoerer.js` (standard pr. leverandør) og
 * `procure.js` (mailindhold pr. sprog, override pr. afsendelse) skal begge
 * kende PRÆCIS de samme tre sprog — deler de ikke kilde, driver de fra
 * hinanden første gang ét sted får et fjerde. Samme grund som
 * `prioritet.js` er sin egen lille fil, importeret hvor det bruges.
 *
 * ⚠ INGEN "BROWSER-SPROG". Standarden er en EKSPLICIT beslutning
 * (`STANDARD_SPROG`), ikke `navigator.language` — en leverandør i Sverige
 * skal ikke få svensk mail bare fordi den der taster ordren, sidder med en
 * dansk browser, og omvendt.
 */
export const SPROG = {
  da: "Dansk",
  sv: "Svensk",
  en: "Engelsk",
};

export const ALLE_SPROG = Object.keys(SPROG);

/* ⚠ DANSK, IKKE "FØRSTE I OBJEKTET". Værdien er skrevet ud, ikke afledt af
 * rækkefølgen i SPROG — den overlever selv hvis kataloget en dag omordnes. */
export const STANDARD_SPROG = "da";

export const erGyldigtSprog = (s) => typeof s === "string" && SPROG[s] !== undefined;
