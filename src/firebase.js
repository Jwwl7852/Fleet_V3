/* src/firebase.js
 * ÉN Firebase-initialisering i hele platformen. Modulerne importerer db
 * herfra — de kalder aldrig initializeApp selv.
 *
 * Nøglerne kommer fra .env.local (se .env.example). Mangler de, kører
 * appen i demo-mode med datasættet i useKpi.js i stedet for at vise
 * hvide skærme.
 */
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/database";

const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FB_DB_URL,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const demoMode = !cfg.apiKey || !cfg.databaseURL;

/* PRODUKTIONSPROJEKTET, skrevet ind i koden med vilje.
 *
 * Miljøet udledes af det projekt-id nøglerne faktisk peger på — ikke af en
 * VITE_FB_MILJOE-variabel. En variabel kan sige "dev" mens nøglerne peger på
 * produktion, og så advarer indikatoren om det stik modsatte af virkeligheden.
 * Det her kan ikke sættes forkert uden at pege et andet sted hen. */
const PROD_PROJEKT = "fleetcontrol-98e11";

export const projektId = cfg.projectId || null;

/** "demo" | "dev" | "prod" */
export const miljoe = demoMode ? "demo" : projektId === PROD_PROJEKT ? "prod" : "dev";

/* Kører vi på en udviklermaskine? Et deployet Netlify-site har aldrig
   localhost som vært. Bruges til den farlige kombination: PRODUKTIONSNØGLER
   på en laptop. */
export const paaLokalMaskine =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local)$/.test(window.location.hostname);

let _db = null;
let _auth = null;

if (!demoMode) {
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    _db = firebase.database();
    _auth = firebase.auth();
  } catch (e) {
    console.warn("Firebase kunne ikke starte. Kører demo-mode.", e);
  }
}

export const db = _db;
export const auth = _auth;
export { firebase };

/* Tenant kommer fra et custom claim, ikke fra klienten. Se ARKITEKTUR.md.
   Efter rolleskift skal serveren kalde revokeRefreshTokens, ellers har
   brugeren stadig det gamle claim indtil token udløber. */
export async function hentBrugerContext(user) {
  if (!user) return null;
  const token = await user.getIdTokenResult(true);
  return {
    uid: user.uid,
    email: user.email,
    navn: user.displayName || user.email,
    tenant: token.claims.tenant || null,
    rolle: token.claims.rolle || "casehandler",
  };
}
