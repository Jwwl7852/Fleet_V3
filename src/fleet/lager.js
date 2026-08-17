/* src/fleet/lager.js
 * Klientsiden af lagerbevægelsen. Transport — politikken ligger i
 * `warehouse.js`.
 *
 * ⚠ DER SKRIVES INTET HERFRA DIREKTE. `bevaegelser` og `beholdning` er begge
 * `.write: false`, og det er ikke fordi rettigheden mangler —
 * lagermedarbejderen HAR `bevaegelser.skriv`. Det er fordi en bevægelse
 * ændrer to til tre poster der skal lande sammen, og fordi et lagertal der
 * kan rettes i hånden, gør en optælling meningsløs. Hele begrundelsen står i
 * functions/index.js.
 *
 * ⚠ KUNDEN SENDES IKKE MED. Serveren læser den af varen. Kunne klienten
 * oplyse den, kunne en bevægelse afregnes til en anden kunde end den varen
 * tilhører.
 */
import { kaldFunktion } from "../firebase.js";
import { LAGERSVAR, tolkLagerfejl } from "./warehouse.js";

export { LAGERSVAR, lagerBesked, tolkLagerfejl } from "./warehouse.js";

/* Småt navn — en 2. generations funktion bliver en Cloud Run-tjeneste, og et
   tjenestenavn må kun være småt. Navnet SKAL matche functions/index.js. */
export const LAGERFUNKTION = "bevaegelseskriv";
export const AFSENDFUNKTION = "plukordreafsend";
export const OPTAELFUNKTION = "optaellingskriv";

async function kald(data, navn = LAGERFUNKTION) {
  try {
    const svar = await kaldFunktion(navn, data);
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
 * Registrér en bevægelse.
 *
 * `antal` er SKALERET med MAENGDE_SKALA — brug `maengdeFraTal()` fra
 * warehouse.js. Et utilsigtet uskaleret tal ville blive registreret som
 * en tusindedel.
 */
export const skrivBevaegelse = ({
  art, vareId, antal, fraCarrierId, tilCarrierId,
  carrierId, tilPladsId,
  batch, serienummer, reference, note,
}) =>
  kald({
    art,
    /* ⚠ FELTER DER IKKE HØRER TIL ARTEN, SENDES SLET IKKE. `undefined` bliver
       til `null` på vejen gennem en callable, og `null` er en VÆRDI — en
       placering ville komme til at bære en mængde den ikke har. */
    vareId: vareId || undefined,
    antal: Number.isFinite(antal) ? antal : undefined,
    /* Godsbevægelsen flytter mellem BEHOLDERE (etape 12) … */
    fraCarrierId: fraCarrierId || undefined,
    tilCarrierId: tilCarrierId || undefined,
    /* … mens en placering flytter selve beholderen hen på en hylde. De to
       sæt felter udelukker hinanden, og serveren afviser en blanding. */
    carrierId: carrierId || undefined,
    tilPladsId: tilPladsId || undefined,
    batch: batch || undefined,
    serienummer: serienummer || undefined,
    reference: reference || undefined,
    note: note || undefined,
  });

/**
 * Afsend en plukordre.
 *
 * ⚠ DER SENDES INGEN LINJER MED. Serveren afsender det der FAKTISK er plukket,
 * læst af bevægelserne — ikke det klienten tror står på pladsen. Kunne
 * mængderne oplyses, kunne en ordre lukkes med tal der ikke svarede til
 * hylden.
 */
export const afsendPlukordre = ({ ordreId }) =>
  kald({ ordreId }, AFSENDFUNKTION);

/**
 * Registrér en optælling.
 *
 * ⚠ FORVENTNINGEN SENDES IKKE MED. Serveren læser saldoen i det øjeblik der
 * tælles og regner selv afvigelsen. Kunne klienten oplyse den, ville
 * afvigelsen være forskellen mellem hvad brugeren TROEDE der stod og hvad han
 * talte — og så måler den ingenting.
 */
export const skrivOptaelling = ({ carrierId, vareId, batch, taeltAntal, aarsag, note }) =>
  kald({
    carrierId, vareId, taeltAntal,
    batch: batch || undefined,
    aarsag: aarsag || undefined,
    note: note || undefined,
  }, OPTAELFUNKTION);
