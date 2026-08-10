/* src/fleet/steder.js
 * Vognmandens lokationer. ÉT katalog.
 *
 * INGEN IMPORTS — som personale.js og permissions.js. Den Cloud Function der
 * provisionerer en tenant, skal kunne bruge samme liste.
 *
 * ---------------------------------------------------------------------------
 * HVORFOR FILEN FINDES
 *
 * Et sted stod to steder: personale.stationeret var fritekst på hver person,
 * og da køretøjerne skulle have et hjemsted, var den nærliggende løsning at
 * skrive fritekst dér også. Så havde vi haft to stedlister der ikke kendte
 * hinanden, og en bil i "Ålborg" ville ikke stå samme sted som en chauffør i
 * "Aalborg" — uden at nogen kunne se det. Det er Bil 104 med to nummerplader,
 * denne gang på et depot.
 *
 * Mockuppen bad om Greve, Ballerup, Roskilde og Køge. De findes ikke. Et
 * opdigtet stednavn opdages først når nogen leder efter Greve — se noten ved
 * stationeringerFor() i personale.js, hvor den samme fælde stod.
 * ---------------------------------------------------------------------------
 */

export const STED = {
  kolding: "Kolding",
  aalborg: "Aalborg",
  vejle: "Vejle",
  odense: "Odense",
};

export const ALLE_STEDER = Object.values(STED);

export const erSted = (navn) => ALLE_STEDER.includes(navn);

/**
 * Sortér stednavne dansk. Aa sorterer SIDST — Kolding kommer før Aalborg.
 *
 * Den står her frem for i hver forbruger, fordi den er blevet skrevet forkert
 * to gange: en almindelig `.sort()` giver Aalborg først, og det ser rigtigt ud
 * lige indtil nogen leder efter Vejle nederst i en liste hvor den står i
 * midten.
 */
export const sorterSteder = (steder = []) =>
  [...steder].sort((a, b) => a.localeCompare(b, "da"));

/**
 * De steder en samling poster faktisk står på — uden dubletter, i dansk orden.
 *
 * `vaelg` henter feltet, fordi en person hedder `stationeret` og et køretøj
 * hedder `hjemsted`. Det er samme spørgsmål stillet til to slags poster, og
 * derfor samme funktion.
 */
export function stederI(poster = [], vaelg = (p) => p?.hjemsted) {
  const set = new Set();
  for (const p of poster) {
    const s = vaelg(p);
    if (s) set.add(s);
  }
  return sorterSteder([...set]);
}
