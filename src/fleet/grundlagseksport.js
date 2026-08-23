/* src/fleet/grundlagseksport.js
 * Adaptere: den neutrale model → en fil et regnskabssystem kan tage imod.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR EN NEUTRAL MODEL MED ADAPTERE, OG IKKE ET FORMAT.
 *
 * Beslutning 22: FleetControl laver **ikke** den juridiske faktura. Vi
 * producerer et godkendt, låst grundlag der eksporteres, og fakturaen dannes i
 * kundens eget regnskabssystem. Der er fire på listen — e-conomic, Dinero,
 * Business Central og CSV — og en vognmand har præcis ét af dem.
 *
 * `eksporter()` i grundlag.js er den ENE model. Alt herunder er oversættelser
 * af den. Skrev hver adapter sit eget udtræk direkte fra grundlaget, ville
 * felterne drive: den ene ville runde pr. linje og den anden pr. total, og
 * ingen kunne se hvilken der var rigtig.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVAD DER *IKKE* STÅR HER, OG HVORFOR.
 *
 * Der er **ingen e-conomic-, Dinero- eller Business Central-adapter**. Ikke
 * fordi de er svære — fordi jeg ikke kender deres importskemaer, og et gæt
 * ville være samme fejl som at gætte en momssats: en fil der ser rigtig ud,
 * fejler i bogholderens system, og i værste fald importerer den HALVT.
 *
 * Hvad der skal til for at bygge en: kolonnenavnene og deres rækkefølge fra
 * systemets egen importvejledning, eller en eksempelfil fra en konto. Se
 * README's liste over uafklarede spørgsmål.
 *
 * CSV'en herunder er derimod VORES egen at definere, og den kan importeres i
 * alle tre ved at mappe kolonner. Den er ikke en nødløsning; den er den
 * fællesnævner en bogholder faktisk arbejder i.
 * ---------------------------------------------------------------------------
 *
 * INGEN IMPORTS ud over eksport.js og beloeb.js — begge står i
 * `functions/delt/`, så en Cloud Function kan lave nøjagtig samme fil.
 */

import { csv, csvOere, filnavn } from "./eksport.js";

/**
 * Én linje pr. LINJE, aldrig en totalrække.
 *
 * ⚠ EN TOTALRÆKKE I EN IMPORTFIL BLIVER TIL EN FAKTURALINJE. Systemet i den
 * anden ende læser rækker; det ved ikke at den sidste er en sum. Resultatet er
 * en faktura på det dobbelte, og fejlen ser ud som en pris.
 *
 * Bogholderen kan lægge sammen — det er præcis dét et regnskabssystem gør — og
 * de frosne totaler står i JSON-udgaven til afstemning.
 *
 * ⚠ BELØB I KRONER MED KOMMA, ikke i øre. Filen er til et regneark og et
 * andet system; øre-heltal er vores interne form, og en importør der læser
 * `1240000` som kroner, fakturerer 1,24 millioner. `csvOere()` er
 * oversættelsen, og den findes ét sted.
 */
const KOLONNER = [
  { navn: "Bilag", hent: ({ e }) => e.nummer || "" },
  /* Bilagsdatoen er GODKENDELSEN — se noten i eksporter(). Er den ikke sat,
     står feltet tomt frem for at låne udarbejdelsesdatoen: en dato der er
     gættet, kan ikke skelnes fra en der er rigtig. */
  { navn: "Bilagsdato", hent: ({ e }) => isoDato(e.godkendtMs) },
  { navn: "Kunde", hent: ({ e }) => e.kundeId || "" },
  { navn: "Forløb", hent: ({ e }) => e.bookingId || "" },
  { navn: "Periode fra", hent: ({ e }) => isoDato(e.periode?.fra) },
  { navn: "Periode til", hent: ({ e }) => isoDato(e.periode?.til) },
  { navn: "Art", hent: ({ l }) => l.art },
  { navn: "Tekst", hent: ({ l }) => l.tekst },
  { navn: "Antal", hent: ({ l }) => antalTekst(l.antal) },
  { navn: "Enhed", hent: ({ l }) => l.enhed || "" },
  { navn: "Stk.pris", hent: ({ l }) => csvOere(l.satsOere) },
  { navn: "Beløb ekskl. moms", hent: ({ l }) => csvOere(l.beloebOere) },
  { navn: "Momssats", hent: ({ l }) => (Number.isFinite(l.momssats) ? l.momssats : "") },
  { navn: "Moms", hent: ({ l }) => csvOere(l.momsOere) },
  /* ⚠ KILDEN SKAL MED. Ringer kunden om en linje, er spørgsmålet altid
     "hvilken tur var det?" — og svaret står i etapen. Uden den kolonne skal
     nogen finde det i vores system, mens de har bogholderens fil åben. */
  { navn: "Kilde", hent: ({ l }) => (l.kilde ? `${l.kilde.type}:${l.kilde.id}` : "") },
];

/** YYYY-MM-DD i UTC. Samme døgngrænse som resten af platformen. */
function isoDato(ms) {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Antal er TUSINDDELE i modellen (beslutning 25). En kolonne der viste 1000
 * hvor der menes 1, ville blive ganget med tusind af den der importerer.
 * Komma som decimaltegn — dansk Excel, se eksport.js.
 */
function antalTekst(antal) {
  if (!Number.isFinite(antal)) return "";
  return String(antal / 1000).replace(".", ",");
}

/** Den neutrale models linjer, hver med sit grundlag ved siden af. */
const raekker = (eksporteret) =>
  (eksporteret?.linjer || []).map((l) => ({ e: eksporteret, l }));

/**
 * Adapterne.
 *
 * `byg(eksporteret)` → filens indhold som streng. Ingen af dem må røre
 * databasen eller regne et beløb om: de OVERSÆTTER, og tallene er allerede
 * frosset af `eksporter()`.
 */
export const ADAPTER = {
  neutral: {
    id: "neutral",
    label: "Neutral (JSON)",
    hvad: "Grundlaget som det står, med formatVersion. Til afstemning og til "
      + "et system der selv kan læse JSON.",
    endelse: "json",
    mime: "application/json;charset=utf-8",
    byg: (e) => JSON.stringify(e, null, 2),
  },
  csv: {
    id: "csv",
    label: "Regneark (CSV)",
    hvad: "Én række pr. linje, semikolon og komma-decimal. Kan importeres i "
      + "e-conomic, Dinero og Business Central ved at mappe kolonner.",
    endelse: "csv",
    mime: "text/csv;charset=utf-8",
    byg: (e) => csv(raekker(e), KOLONNER),
  },
};

export const ALLE_ADAPTERE = Object.keys(ADAPTER);

/**
 * Filnavnet for ét grundlag i ét format.
 *
 * ⚠ DATOEN ER GRUNDLAGETS, IKKE DAGENS. Henter bogholderen den samme fil om
 * to uger, skal den hedde det samme — ellers ligger der to filer i mappen
 * Overførsler, og kun den ene er den han allerede har bogført.
 */
export const eksportfilnavn = (eksporteret, adapterId) =>
  filnavn(
    `grundlag-${eksporteret?.nummer || "uden-nummer"}`,
    eksporteret?.godkendtMs ?? eksporteret?.udarbejdetMs ?? null,
    ADAPTER[adapterId]?.endelse || "txt",
  );

/**
 * Byg filen.
 *
 * ⚠ KASTER PÅ EN UKENDT ADAPTER frem for at falde tilbage på JSON. En
 * bogholder der bad om CSV og fik JSON, opdager det når filen ikke kan
 * importeres — og leder efter fejlen i sit eget system.
 */
export function byggEksport(eksporteret, adapterId) {
  const a = ADAPTER[adapterId];
  if (!a) throw new Error(`byggEksport: ukendt adapter "${adapterId}".`);
  return { indhold: a.byg(eksporteret), navn: eksportfilnavn(eksporteret, adapterId), mime: a.mime };
}
