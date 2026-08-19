/* src/fleet/brugere.js
 * Klientsiden af brugeradministrationen.
 *
 * ⚠ DER SKRIVES INTET HERFRA. Alle FIRE handlinger er Cloud Functions, fordi
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

/* ⚠ SAMME FUNKTIONER SOM SERVEREN. valideRolleperms() og laaserUde() ligger i
   permissions.js, som står i DELTE_FILER — skærmen svarer HURTIGT, serveren
   AFGØR, og de siger det samme fordi det er den samme kode. En
   klientvalidering der ikke også står på serveren, er en pæn knap; her ville
   den pæne knap kunne koste kunden adgangen til sit eget system. */
export {
  permsForTenant, valideRolleperms, laaserUde, NOEGLEPERM,
} from "./permissions.js";

/* Funktionsnavnene er små bogstaver. Det er ikke smag: en 2. generations
   funktion bliver til en Cloud Run-tjeneste, og et tjenestenavn må kun være
   småt. Navnene her SKAL matche functions/index.js. */
export const FUNKTION = {
  opret: "opretbruger",
  skiftRolle: "skiftrolle",
  spaerLogin: "spaerlogin",
  /* ⚠ REDIGERER EN ROLLES INDHOLD, ikke en brugers rolle. De to ligner
     hinanden i navnet og er vidt forskellige: skiftrolle flytter ÉN bruger
     mellem roller, rolleskriv ændrer hvad en rolle BETYDER — og rammer
     dermed hver bruger der har den. Se beslutning 31b. */
  rolleSkriv: "rolleskriv",
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

/**
 * Skriv en rolles permissions. BESLUTNING 31b.
 *
 * ⚠ ÉN ÆNDRING RAMMER HVER BRUGER MED ROLLEN. Serveren minter claims om for
 * dem alle og kalder revokeRefreshTokens — uden det virker den gamle adgang
 * indtil tokenet udløber af sig selv, og det er den værste fejltilstand,
 * fordi den SER UD som om den lykkedes.
 *
 * Svaret bærer derfor `{ ramte, fornyet, fejlede }`. En ændring der lykkedes
 * for otte ud af ni, er ikke en ændring der lykkedes, og skærmen skal kunne
 * sige det.
 *
 * ⚠ ROLLENAVNET ER FAST. Man redigerer hvad en rolle indeholder; man
 * opfinder ikke en ottende — det er stadig en ændring i koden, med en
 * brugerart i priser.js. Serveren afviser et ukendt navn.
 */
export const skrivRolle = ({ rolle, perms }) =>
  kald(FUNKTION.rolleSkriv, { rolle, perms });
