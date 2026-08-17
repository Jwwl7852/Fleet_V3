/* src/fleet/disponer.js
 * Klientsiden af etapens tilstandsskift. Transport — politikken ligger i
 * `booking-state.js` og `disponering.js`.
 *
 * ⚠ DER SKRIVES INTET HERFRA DIREKTE. `etaper` og `reservationer` er begge
 * `.write: false` for ALLE, også admin, og det er ikke fordi rettigheden
 * mangler — koordinatoren HAR `booking.godkend`. Det er fordi tre ting skal
 * lande sammen:
 *
 *   · tilstandsskiftet, efter ETAPE_OVERGANGE og beslutning 5,
 *   · reservationen på hver af etapens ressourcer,
 *   · bookingens AFLEDTE tilstand, som `forloebstilstand()` regner ud.
 *
 * Skrev klienten dem i tre kald, kunne det lykkes halvt — og så stod der en
 * godkendt etape uden en reservation, eller en booking der påstod noget andet
 * end sine egne etaper. Hele begrundelsen står i functions/index.js.
 *
 * ⚠ OG DE FEM DISPONERINGSTJEK SENDES IKKE MED. Serveren kører dem selv, med
 * `tjekDisponering()` — den samme funktion skærmen viser. Kunne klienten
 * oplyse resultatet, kunne en spærring omgås ved at fortie den.
 *
 * ⚠ BOOKINGEN HAR INGEN EGEN FUNKTION, og det er med vilje. Dens tilstand er
 * afledt af etaperne; der findes ikke et `bookingskift` at kalde. Skal et
 * forløb skifte, skifter man dets etaper.
 */
import { kaldFunktion } from "../firebase.js";
import { LAGERSVAR, tolkLagerfejl } from "./warehouse.js";

/* ⚠ SVARTOLKNINGEN DELES. En afvist skrivning er en afvist skrivning, og
   `permission-denied` betyder det samme her som i lageret — reglerne virker.
   To tolkninger ville betyde to måder at fortælle brugeren det samme på, og
   den ene ville før eller siden kalde en afvisning for en netværksfejl. */
export { LAGERSVAR as DISPONERSVAR, tolkLagerfejl } from "./warehouse.js";

/* Småt navn — en 2. generations funktion bliver en Cloud Run-tjeneste, og et
   tjenestenavn må kun være småt. Navnet SKAL matche functions/index.js. */
export const ETAPEFUNKTION = "etapeskift";

async function kald(data) {
  try {
    const svar = await kaldFunktion(ETAPEFUNKTION, data);
    return { ok: true, art: LAGERSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: LAGERSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev disponeret.",
        data: null,
      };
    }
    return { ok: false, ...tolkLagerfejl(fejl), data: null };
  }
}

/**
 * Skift en etapes tilstand.
 *
 * `valgtForslagId` kræves på vej til `reserveret` — det er dét forslag der
 * siger hvilke enheder og hvilken chauffør der bindes.
 * `begrundelse` kræves hvor overgangen kræver den; serveren afviser uden.
 * `senestMs` er fristen på vej til `aaben` — uden den fyldes lageret med gods
 * ingen henter.
 */
export const skiftEtape = ({ etapeId, tilTilstand, valgtForslagId, begrundelse, senestMs }) =>
  kald({ etapeId, tilTilstand, valgtForslagId, begrundelse, senestMs });
