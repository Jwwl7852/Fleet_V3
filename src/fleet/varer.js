/* src/fleet/varer.js
 * Den globale varemaster — Procure TARGET, trin 2 (produktejer-review
 * 2026-09-02).
 *
 * TO NODER, OG DE KAN IKKE SLÅS SAMMEN (samme mønster som facility.js's fire
 * — se dens hoved):
 *
 *   varer/<vareId>                 ÉN vare, tenant-fælles: navn, kategori,
 *                                  standardenhed. Ikke bundet til én
 *                                  leverandør.
 *   leverandoervarer/<relationId>  PRISRELATIONEN: hvilken leverandør
 *                                  sælger hvilken vare, til hvilken pris.
 *
 * En vare kan have flere leverandører — samme "Bobleplast 50 cm" hos tre
 * firmaer til tre priser — og en leverandør sælger typisk flere varer. Det
 * er derfor en flad relation FOR SIG, ikke en liste indlejret i hverken
 * varen eller leverandøren (modsat `leverandoerer/$id/prisliste`, som er
 * PR.-LEVERANDØR og ikke kender en normaliseret vare — se noten nedenfor).
 *
 * ⚠ INGEN AUTOMATISK MIGRERING FRA EKSISTERENDE DATA, OG DET ER BEVIDST.
 * `indkoeb`-linjernes `vare`/`varenummer` er fritekst, og
 * `leverandoerer/$id/prisliste` er en pr.-leverandør pristabel keyet på det
 * SAMME fritekst-varenummer — der findes ingen entydig måde at slå to
 * strenge sammen til ét kanonisk `vareId` uden at gætte. Et gæt her er
 * samme fejl som en gættet momssats: det ser ud som data og er en påstand.
 * Denne fil bygger derfor et FRISKT katalog, oprettet fremadrettet — der er
 * IKKE bygget en kobling fra en eksisterende indkøbslinje eller
 * prislistepost til et `vareId`. `evidensForVare()` nedenfor genbruger
 * `foreslaaLeverandoer()` fra procure.js til at VISE hvad historikken
 * antyder, som REFERENCE når en relation oprettes — den kobler aldrig
 * automatisk, og skriver aldrig noget.
 */
import { LEVERANDOER_KATEGORI } from "./leverandoerer.js";
import { foreslaaLeverandoer } from "./procure.js";

export { LEVERANDOER_KATEGORI as VARE_KATEGORI };

export const GRAENSE_VARE = {
  navn: 120,
  standardenhed: 20,
  leverandoerVarenummer: 60,
};

export const VALUTA = { DKK: "DKK", EUR: "EUR", USD: "USD" };
export const ALLE_VALUTAER = Object.keys(VALUTA);

const tekst = (v, maks) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= maks;

/**
 * valideVare(post) → { [felt]: tekst }
 *
 * ⚠ SPEJLER firebase.rules.json. Afgør ingenting — se facility.js's egen
 * note om samme forhold.
 */
export function valideVare(post = {}) {
  const f = {};
  if (!tekst(post.navn, GRAENSE_VARE.navn)) f.navn = "Skriv varens navn.";
  if (!LEVERANDOER_KATEGORI[post.kategori]) f.kategori = "Vælg en kategori.";
  if (!tekst(post.standardenhed, GRAENSE_VARE.standardenhed)) {
    f.standardenhed = "Skriv en standardenhed, fx \"stk\".";
  }
  if (typeof post.aktiv !== "boolean") f.aktiv = "Vælg om varen er aktiv.";
  return f;
}

export function byggVare(post) {
  return {
    navn: post.navn.trim(),
    kategori: post.kategori,
    standardenhed: post.standardenhed.trim(),
    aktiv: post.aktiv !== false,
  };
}

/**
 * valideLeverandoerVare(post, { varer, leverandoerer }) → { [felt]: tekst }
 *
 * Referencerne tjekkes mod de lister skærmen HAR — reglerne tjekker dem
 * igen mod databasen. Samme dobbelttjek som `valideAktiv()` i facility.js.
 */
export function valideLeverandoerVare(post = {}, { varer = [], leverandoerer = [] } = {}) {
  const f = {};
  if (!post.indkoebsVareId) f.indkoebsVareId = "Vælg en vare.";
  else if (!varer.some((v) => v.id === post.indkoebsVareId)) f.indkoebsVareId = "Varen findes ikke.";

  if (!post.leverandoerId) f.leverandoerId = "Vælg en leverandør.";
  else if (!leverandoerer.some((l) => l.id === post.leverandoerId)) {
    f.leverandoerId = "Leverandøren findes ikke.";
  }

  if (post.leverandoerVarenummer && String(post.leverandoerVarenummer).length > GRAENSE_VARE.leverandoerVarenummer) {
    f.leverandoerVarenummer = `Højst ${GRAENSE_VARE.leverandoerVarenummer} tegn.`;
  }

  /* ⚠ HELE ØRE SOM INTEGER, EKSKL. MOMS — som alle beløb (beslutning 2). */
  if (!Number.isInteger(post.prisOere) || post.prisOere < 0) {
    f.prisOere = "Prisen skal være i hele øre.";
  }
  if (!ALLE_VALUTAER.includes(post.valuta)) f.valuta = "Vælg en valuta.";
  if (post.mindsteantal !== undefined && post.mindsteantal !== null) {
    if (!Number.isFinite(post.mindsteantal) || post.mindsteantal <= 0) {
      f.mindsteantal = "Mindsteantallet skal være større end nul.";
    }
  }
  if (!Number.isFinite(post.gyldigFra) || post.gyldigFra <= 0) {
    f.gyldigFra = "Sæt datoen prisen gælder fra.";
  }
  if (typeof post.aktiv !== "boolean") f.aktiv = "Vælg om relationen er aktiv.";

  return f;
}

export function byggLeverandoerVare(post) {
  const ud = {
    indkoebsVareId: post.indkoebsVareId,
    leverandoerId: post.leverandoerId,
    prisOere: post.prisOere,
    valuta: post.valuta || VALUTA.DKK,
    gyldigFra: post.gyldigFra,
    aktiv: post.aktiv !== false,
  };
  if (post.leverandoerVarenummer) ud.leverandoerVarenummer = String(post.leverandoerVarenummer).trim();
  if (Number.isFinite(post.mindsteantal)) ud.mindsteantal = post.mindsteantal;
  return ud;
}

/**
 * gaeldendeRelationer(indkoebsVareId, leverandoervarer, paaMs) → én pr. leverandør
 *
 * Samme mønster som leverandoerer.js's `gaeldendePrisliste()`: nyeste
 * `gyldigFra` der ikke ligger i fremtiden, én række pr. leverandør.
 */
export function gaeldendeRelationer(indkoebsVareId, leverandoervarer = [], paaMs = Date.now()) {
  const mine = leverandoervarer.filter((r) => r.indkoebsVareId === indkoebsVareId && r.aktiv !== false);
  const leverandoerIder = [...new Set(mine.map((r) => r.leverandoerId))];
  return leverandoerIder
    .map((lid) => mine
      .filter((r) => r.leverandoerId === lid && Number.isFinite(r.gyldigFra) && r.gyldigFra <= paaMs)
      .sort((a, b) => b.gyldigFra - a.gyldigFra)[0])
    .filter(Boolean)
    .sort((a, b) => a.prisOere - b.prisOere);
}

/**
 * evidensForVare(vare, indkoebslinjer) → forslag | null
 *
 * ⚠ REFERENCE, IKKE EN KOBLING. Genbruger `foreslaaLeverandoer()` fra
 * procure.js — samme opslag Bestillinger allerede viser for et behov. Den
 * skriver ingenting og opretter ingen relation; den viser blot hvad
 * indkøbshistorikken antyder, så den der opretter en `leverandoervarer`-
 * relation, kan se om prisen han taster, stemmer med hvad der faktisk er
 * betalt før.
 */
export function evidensForVare(vare, indkoebslinjer = []) {
  return foreslaaLeverandoer(vare?.navn, indkoebslinjer, {});
}
