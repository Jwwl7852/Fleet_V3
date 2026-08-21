/* src/fleet/fakturering.js
 * Klientsiden af fakturagrundlaget. Transport — politikken ligger i
 * `grundlag.js`.
 *
 * ⚠ DER SKRIVES INTET HERFRA DIREKTE. `grundlag` er `.write: false` for
 * ALLE, også admin, og det er ikke fordi rettigheden mangler. Tre ting kan
 * ikke håndhæves af en klient:
 *
 *   · nummeret kommer fra en counter i en transaction (beslutning 8),
 *   · tilstandsskiftet følger kanGodkende() — en åben etape spærrer,
 *   · et LÅST grundlag må aldrig kunne ændres.
 *
 * Hele begrundelsen står i functions/index.js ved `grundlagskriv`.
 *
 * ⚠ OG ETAPERNE SENDES IKKE MED. Serveren læser dem selv. Kunne klienten
 * oplyse dem, kunne et grundlag godkendes ved at fortie den åbne etape — og
 * det er præcis den kontrol der spærrer.
 */
import { kaldFunktion } from "../firebase.js";
import { LAGERSVAR, tolkLagerfejl } from "./warehouse.js";

/* ⚠ SVARTOLKNINGEN DELES MED LAGERET, og det er med vilje: en afvist
   skrivning er en afvist skrivning, og `permission-denied` betyder det samme
   her som dér — reglerne virker. To tolkninger ville betyde to måder at
   fortælle brugeren det samme på, og den ene ville før eller siden kalde en
   afvisning for en netværksfejl. Se datatilstand.js. */
export { LAGERSVAR as GRUNDLAGSVAR, tolkLagerfejl } from "./warehouse.js";

/* Småt navn — en 2. generations funktion bliver en Cloud Run-tjeneste, og et
   tjenestenavn må kun være småt. Navnet SKAL matche functions/index.js. */
export const GRUNDLAGFUNKTION = "grundlagskriv";

async function kald(data) {
  try {
    const svar = await kaldFunktion(GRUNDLAGFUNKTION, data);
    return { ok: true, art: LAGERSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: LAGERSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev registreret.",
        data: null,
      };
    }
    return { ok: false, ...tolkLagerfejl(fejl), data: null };
  }
}

/**
 * Opret et grundlag.
 *
 * ⚠ ENTEN et `bookingId` ELLER en periode — aldrig begge. En tur faktureres
 * pr. forløb; en lagerafregning gør en periode op. Serveren afviser begge
 * dele og ingen af delene; se byggGrundlag().
 *
 * ⚠ NUMMERET SENDES IKKE MED. Det kommer fra counteren, server-side.
 */
export const opretGrundlag = ({ kundeId, bookingId, periode, linjer }) =>
  kald({
    handling: "opret",
    kundeId,
    bookingId: bookingId || undefined,
    periodeFra: periode?.fra ?? undefined,
    periodeTil: periode?.til ?? undefined,
    linjer,
  });

/** Godkend. Serveren læser etaperne selv — se hovedet. */
export const godkendGrundlag = ({ id }) => kald({ handling: "godkend", id });

/**
 * Lås et grundlag mod en eksportreference.
 *
 * ⚠ REFERENCEN ER PÅKRÆVET, og serveren afviser uden. En låsning uden
 * reference er en påstand: den siger at bilaget er eksporteret, uden at nogen
 * kan finde det igen i regnskabet.
 */
export const laasGrundlag = ({ id, reference }) =>
  kald({ handling: "laas", id, reference });

/**
 * Afregningslinjer → grundlagslinjer.
 *
 * ⚠ OVERSÆTTELSEN STÅR HER, ÉT STED. De to har hver sin form: afregningen
 * tæller hændelser pr. ydelse, grundlaget bærer fakturalinjer. Lå
 * oversættelsen i skærmen, ville den næste skærm lave sin egen — og så ville
 * to fakturaer for det samme lager kunne se forskellige ud.
 *
 * ⚠ MOMSSATSEN SÆTTES IKKE. Afregningen kender den ikke, og vi gætter ikke
 * 25 %. Linjen kommer med uden, og eksporten er så spærret indtil en
 * bogholder har svaret — præcis som beslutning 25 kræver.
 *
 * ⚠ EN LINJE UDEN SATS KOMMER IKKE MED. Den kan ikke faktureres, og et
 * grundlag med en linje på null ville ikke kunne gøres op. Skærmen skal sige
 * hvor mange der blev udeladt — en tavs udeladelse er en for lav faktura.
 */
export function grundlagslinjer(afregning = []) {
  return afregning
    .filter((l) => l.satsOere != null)
    .map((l, i) => ({
      id: `l${i + 1}`,
      art: "lager",
      tekst: l.label,
      antal: l.antal,
      satsOere: l.satsOere,
      enhed: l.enhed || "stk",
    }));
}
