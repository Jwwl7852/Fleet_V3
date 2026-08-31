/* src/moduler/leverandoerportal/LeverandoerLogin.jsx
 * Loginskærmen for eksterne leverandørportal-brugere.
 *
 * ⚠ IKKE Login.jsx MED ET FLAG. Den interne Login.jsx's fejlbesked for
 * "logget ind, men uden tenant-claim" ("Kontoen er ikke provisioneret...")
 * er PRÆCIS forkert for en ekstern bruger — han skal ALDRIG have et
 * tenant-claim, det er ikke en fejltilstand for ham. Se App.jsx's egen
 * note ved leverandørportal-grenen for hvorfor de to veje er adskilt hele
 * vejen ned, ikke kun i denne skærm.
 *
 * ⚠ SAMME auth.signInWithEmailAndPassword SOM DEN INTERNE — det er
 * STADIG Firebase Auth, samme projekt, samme sikre login. Kun det der
 * sker EFTER login (hvilke claims/grants der findes, hvad der tegnes) er
 * forskelligt.
 */
import { useState } from "react";
import { auth, miljoe, projektId } from "../../firebase.js";
import { Knap } from "../../fleet/ui.jsx";

const FEJLTEKST = {
  "auth/invalid-email": "Det ser ikke ud som en e-mailadresse.",
  "auth/user-disabled": "Kontoen er spærret.",
  "auth/too-many-requests":
    "For mange forsøg. Vent et par minutter og prøv igen.",
  "auth/network-request-failed": "Ingen forbindelse.",
};

const GENEREL = "E-mail eller adgangskode passer ikke.";

export default function LeverandoerLogin() {
  const [email, setEmail] = useState("");
  const [kode, setKode] = useState("");
  const [fejl, setFejl] = useState(null);
  const [sender, setSender] = useState(false);

  async function logInd(e) {
    e.preventDefault();
    if (!auth) return;
    setSender(true);
    setFejl(null);
    try {
      await auth.signInWithEmailAndPassword(email.trim(), kode);
      /* Ingen navigation her — App.jsx's onAuthStateChanged henter
         sessionen og tegner portalen om, samme greb som Login.jsx. */
    } catch (e2) {
      setFejl(FEJLTEKST[e2?.code] || GENEREL);
      setSender(false);
    }
  }

  return (
    <div className="fc-boot">
      <div className="fc-login">
        <div className="fc-brand fc-login-brand">
          Fleet<b>Control</b>
        </div>
        <p className="fc-hint" style={{ marginTop: -8, marginBottom: 16 }}>Leverandørportal</p>

        <form className="fc-card" onSubmit={logInd}>
          <div className="fc-card-b">
            <div className="fc-felt">
              <label htmlFor="lp-email">E-mail</label>
              <input id="lp-email" type="email" autoComplete="username" required
                     value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="fc-felt">
              <label htmlFor="lp-kode">Adgangskode</label>
              <input id="lp-kode" type="password" autoComplete="current-password" required
                     value={kode} onChange={(e) => setKode(e.target.value)} />
            </div>

            {fejl && <p className="fc-empty-bad" role="alert">{fejl}</p>}

            <Knap variant="primaer" type="submit" disabled={sender}>
              {sender ? "Logger ind…" : "Log ind"}
            </Knap>
            {miljoe === "dev" && (
              <p className="fc-hint">
                Test-konto oprettes fra Opsætning → Leverandører → Portaladgang.
              </p>
            )}
          </div>
        </form>

        <p className="fc-hint fc-login-miljoe">{projektId || "demo-mode"}</p>
      </div>
    </div>
  );
}
