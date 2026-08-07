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
