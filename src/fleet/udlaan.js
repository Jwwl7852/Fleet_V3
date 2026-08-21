/* src/fleet/udlaan.js
 * Klientsiden af kasseudlånet. Transport — politikken ligger i
 * `udlaan-regler.js` og i `unitbooking.js`.
 *
 * ⚠ DER SKRIVES INTET HERFRA DIREKTE. `kasseudlaan` er `.write: false`, og
 * det er ikke fordi lagermedarbejderen mangler en rettighed — han HAR
 * `kasseudlaan.skriv`. Det er fordi handlingen ikke kan udføres rigtigt fra
 * en klient: udlånet og kassen skal skrives sammen eller slet ikke, perioden
 * skal prøves mod de andre udlån, og to lagermænd kan ramme samme sekund.
 * Hele begrundelsen står i functions/index.js.
 *
 * ⚠ DERFOR ER DER HELLER INGEN gem() HER. `skriv.js` er vejen ind i
 * databasen for det klienten må skrive — kasser og reolpladser. Udlånet går
 * gennem serveren, og de to veje skal ikke blandes sammen.
 */
import { kaldFunktion } from "../firebase.js";
import { UDLAANSSVAR, tolkUdlaansfejl } from "./udlaan-regler.js";

export {
  UDLAANSSVAR, udlaansBesked, tolkUdlaansfejl,
} from "./udlaan-regler.js";

/* Småt navn — en 2. generations funktion bliver en Cloud Run-tjeneste, og et
   tjenestenavn må kun være småt. Navnet SKAL matche functions/index.js. */
export const UDLAANSFUNKTION = "kasseudlaanskriv";

async function kald(data) {
  try {
    const svar = await kaldFunktion(UDLAANSFUNKTION, data);
    return { ok: true, art: UDLAANSSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: UDLAANSSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev gemt.",
        data: null,
      };
    }
    return { ok: false, ...tolkUdlaansfejl(fejl), data: null };
  }
}

/**
 * Reservér en kasse i en periode.
 *
 * ⚠ TILSTANDEN SENDES IKKE MED. Et nyt udlån er `booket`, og serveren sætter
 * det selv — ellers kunne klargøringen springes over ved at oprette udlånet
 * direkte som udlånt.
 */
export const opretUdlaan = ({
  kasseId, sagsnummer, kundeId, beskrivelse, fra, til, klargoerSenest,
}) =>
  kald({
    handling: "opret",
    kasseId, sagsnummer,
    kundeId: kundeId || undefined,
    beskrivelse: beskrivelse || undefined,
    fra, til,
    /* ⚠ VALGFRI — se noten på `klargoerSenest` i firebase.rules.json.
       `undefined` UDELADER feltet, og et udlån uden den falder uden for
       "Klargøres snart" — som tæller dem uden dato FOR SIG, frem for at lade
       som om tallet er en fuld optælling. */
    klargoerSenest: Number.isFinite(klargoerSenest) ? klargoerSenest : undefined,
  });

/** Klargør, udlever, modtag retur, annullér. */
export const skiftUdlaan = ({ udlaanId, til }) =>
  kald({ handling: "skift", udlaanId, til });

/** Ret sagsnummer, periode eller beskrivelse — kun mens den er booket. */
export const retUdlaan = ({
  udlaanId, sagsnummer, kundeId, beskrivelse, fra, til, klargoerSenest,
}) =>
  kald({
    handling: "ret",
    udlaanId, sagsnummer,
    kundeId: kundeId || undefined,
    beskrivelse: beskrivelse || undefined,
    fra, til,
    /* ⚠ HER ER `null` OG `undefined` IKKE DET SAMME, og det er ikke pedanteri:
       serveren spreder den GAMLE post ind over den nye, så et udeladt felt
       ARVES. Skal datoen kunne ryddes igen, skal det siges eksplicit — ellers
       ville en rettelse hvor man tømmer feltet, lade den gamle dato stå. */
    klargoerSenest: Number.isFinite(klargoerSenest) ? klargoerSenest : null,
  });
