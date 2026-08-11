/* src/fleet/eksport.js
 * CSV til regneark. ÉT sted, fordi et separatortegn der er valgt to gange,
 * bliver valgt forskelligt.
 *
 * ---------------------------------------------------------------------------
 * ⚠ DANSK EXCEL ER IKKE ENGELSK EXCEL.
 *
 * Excel læser CSV efter maskinens regionsindstilling, ikke efter filen. På en
 * dansk maskine er listeseparatoren SEMIKOLON og decimaltegnet KOMMA. Skriver
 * man `1,234.50` med komma som tusindtalsskilletegn, læser dansk Excel det som
 * fire kolonner — og beløbene bliver til noget andet uden en fejlmeddelelse.
 *
 * Derfor: `;` mellem felter, `,` som decimal, og INTET tusindtalsskilletegn.
 *
 * ⚠ BOM'EN ER IKKE PYNT. Uden `﻿` i starten gætter Excel på Windows-1252,
 * og så bliver Køretøj til KÃ¸retÃ¸j. Filen ser rigtig ud i enhver anden
 * editor, og forkert i den ene der skal bruge den.
 *
 * ⚠ CRLF. Excel på Windows klarer LF, men Notepad og en del ældre importører
 * gør ikke — og en fil der ser ud som én lang linje, bliver meldt som ødelagt.
 *
 * ---------------------------------------------------------------------------
 * ⚠ FORMLER I DATA. En celle der begynder med = + - eller @ udføres af Excel
 * som en FORMEL når filen åbnes. Et virksomhedsnavn er fritekst fra en
 * formular, og `=HYPERLINK(...)` i et kundenavn er ikke en teoretisk fare —
 * det er den klassiske CSV-injection. Vi sætter en apostrof foran; Excel viser
 * teksten og udfører den ikke.
 *
 * INGEN IMPORTS, så den kan kopieres til functions/delt/ når en funktion skal
 * lave samme fil. Klienten og serveren må ikke skrive to forskellige CSV'er.
 */

export const CSV_SEP = ";";
export const CSV_NL = "\r\n";
export const CSV_BOM = "﻿";

const FARLIG_START = /^[=+\-@\t\r]/;

/** Ét felt, klar til at stå i en linje. */
export function csvFelt(vaerdi) {
  if (vaerdi === null || vaerdi === undefined) return "";

  if (typeof vaerdi === "number") {
    if (!Number.isFinite(vaerdi)) return "";
    /* ⚠ KOMMA SOM DECIMAL, og aldrig et tusindtalsskilletegn. Se noten. */
    return String(vaerdi).replace(".", ",");
  }
  if (typeof vaerdi === "boolean") return vaerdi ? "ja" : "nej";

  let s = String(vaerdi);
  if (FARLIG_START.test(s)) s = `'${s}`;

  if (s.includes(CSV_SEP) || s.includes('"') || /[\r\n]/.test(s)) {
    return `"${s.split('"').join('""')}"`;
  }
  return s;
}

/**
 * Beløb i øre → kroner med to decimaler, som et regneark kan regne på.
 *
 * ⚠ IKKE kr() FRA format.js. Den skriver "1.530,00 kr" til et menneske, og
 * både enheden og tusindtalsskilletegnet gør cellen til tekst i Excel. Her
 * skal der stå et TAL.
 */
export const csvOere = (oere) =>
  Number.isFinite(oere) ? (oere / 100).toFixed(2).replace(".", ",") : "";

/**
 * Rækker + kolonner → CSV.
 *
 * @param kolonner [{ navn, hent(raekke) }]
 */
export function csv(raekker = [], kolonner = []) {
  const linjer = [kolonner.map((k) => csvFelt(k.navn)).join(CSV_SEP)];
  for (const r of raekker) {
    linjer.push(kolonner.map((k) => csvFelt(k.hent(r))).join(CSV_SEP));
  }
  return CSV_BOM + linjer.join(CSV_NL) + CSV_NL;
}

/**
 * Filnavn med dato, så to udtræk ikke hedder det samme i mappen Overførsler.
 * ⚠ Kun tegn et filsystem tåler — æøå og kolon giver problemer nok steder til
 * at det ikke er værd at prøve.
 */
export function filnavn(hvad, naar = null) {
  const d = naar ? new Date(naar) : new Date();
  const dato = d.toISOString().slice(0, 10);
  const rent = String(hvad)
    .toLowerCase()
    .replace(/[æä]/g, "ae").replace(/[øö]/g, "oe").replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `fleetcontrol-${rent}-${dato}.csv`;
}
