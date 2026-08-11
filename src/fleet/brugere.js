/* src/fleet/brugere.js
 * Klientsiden af brugeradministrationen.
 *
 * ⚠ DER SKRIVES INTET HERFRA. Alle tre handlinger er Cloud Functions, fordi
 * Firebase Auth ikke har createUser, updateUser eller setCustomUserClaims på
 * klientsiden. Modulet er transporten og oversættelsen af svaret — ligesom
 * audit.js er det for auditloggen.
 *
 * ⚠ EN AFVIST HANDLING ER IKKE EN NETVÆRKSFEJL. Samme skel som skriv.js og
 * dataTilstand() laver: `permission-denied` betyder at kontrollen VIRKER.
 * Oversættes den til "prøv igen", får brugeren at vide at systemet er i
 * stykker — og han prøver igen, og igen.
 */
import { kaldFunktion } from "../firebase.js";
import { BRUGERSVAR, tolkBrugerfejl } from "./brugere-regler.js";

export {
  MINDSTE_KODE, nytLoesen, valideNyBruger, BRUGERSVAR, tolkBrugerfejl,
} from "./brugere-regler.js";

/* Funktionsnavnene er små bogstaver. Det er ikke smag: en 2. generations
   funktion bliver til en Cloud Run-tjeneste, og et tjenestenavn må kun være
   småt. Navnene her SKAL matche functions/index.js. */
export const FUNKTION = {
  opret: "opretbruger",
  skiftRolle: "skiftrolle",
  spaerLogin: "spaerlogin",
};

async function kald(navn, data) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: BRUGERSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: BRUGERSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev oprettet.",
      };
    }
    const t = tolkBrugerfejl(fejl);
    return { ok: false, ...t, data: null };
  }
}

/**
 * ⚠ TENANTEN SENDES IKKE MED. Funktionen tager den fra kalderens token, og
 * sendte vi den herfra, ville det se ud som om klienten bestemte den. Den
 * gør den ikke — og et felt der ser ud til at betyde noget, men ignoreres,
 * er værre end intet felt.
 */
export const opretBruger = ({ email, rolle, navn, kode }) =>
  kald(FUNKTION.opret, { email: email.trim(), rolle, navn: navn.trim(), kode });

export const skiftRolle = ({ uid, rolle }) => kald(FUNKTION.skiftRolle, { uid, rolle });

export const spaerLogin = ({ uid, spaerret }) => kald(FUNKTION.spaerLogin, { uid, spaerret });
