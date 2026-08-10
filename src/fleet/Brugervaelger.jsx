/* src/fleet/Brugervaelger.jsx
 * Skift DEV-bruger fra sidebaren. KUN i dev.
 *
 * ⚠ DEN AFLØSTE EN ROLLEVÆLGER, OG FORSKELLEN ER HELE POINTEN.
 *
 * Rollevælgeren skrev en anden rolle ind i `effektivBruger` og tegnede UI'et
 * om. Men perms kommer fra tokenets claims, og en klient kan ikke ændre sit
 * eget token — så den kunne pr. definition ikke ændre adgang, kun udseendet.
 * Med et rigtigt token viste den knapper serveren afviser, og det er den
 * fejltilstand hele permissions-modellen er bygget for at undgå.
 *
 * Den her skifter SESSION: log ud, log ind som en anden seedet bruger, hent
 * nyt token. Så skifter perms fordi TOKENET skifter — og det er præcis dér
 * man kan se om UI og regler er enige. Se beslutning 28.
 *
 * Kontiene oprettes af scripts/provisioner-dev.mjs. Listen er den samme
 * (fleet/dev-brugere.js): to lister ville drive, og fejlen ville se ud som en
 * login-fejl.
 */
import { useState } from "react";
import { auth } from "../firebase.js";
import { DEV_BRUGERE, ejerkonto } from "./dev-brugere.js";

/* Alle seks konti deler én kode. Den står i .env.local, som er gitignored —
   e-mailadresser er ikke hemmeligheder, en adgangskode er. */
const KODE = import.meta.env?.VITE_DEV_BRUGER_KODE || "";

/* Ejerkontoen staar foerst, hvis der er sat en. Den er en almindelig konto med
   admin-claims — se ejerkonto() — ikke en genvej uden om noget. */
let EJER = null;
try { EJER = ejerkonto(import.meta.env?.VITE_DEV_EJER_MAIL); } catch { EJER = null; }
const KONTI = EJER ? [EJER, ...DEV_BRUGERE] : DEV_BRUGERE;

export default function Brugervaelger({ email }) {
  const [skifter, setSkifter] = useState(false);
  const [fejl, setFejl] = useState(null);

  async function skift(nyEmail) {
    if (!auth || nyEmail === email) return;
    setSkifter(true);
    setFejl(null);
    try {
      /* signOut først. Uden det kan man nå at stå med det gamle tokens claims
         mens det nye login er undervejs, og så ser man en adgang der hverken
         er den gamle eller den nye. */
      await auth.signOut();
      await auth.signInWithEmailAndPassword(nyEmail, KODE);
    } catch (e) {
      setFejl(
        e?.code === "auth/invalid-credential" || e?.code === "auth/wrong-password"
          ? "Koden passer ikke. Kør provisioner:dev, eller ret VITE_DEV_BRUGER_KODE."
          : e?.code === "auth/user-not-found"
            ? "Kontoen findes ikke. Kør npm run provisioner:dev."
            : e?.message || "Kunne ikke skifte bruger."
      );
      setSkifter(false);
    }
  }

  if (!KODE) {
    return (
      <div className="fc-demo-rolle">
        <label>Skift bruger</label>
        <span>VITE_DEV_BRUGER_KODE mangler i .env.local. Se README.</span>
      </div>
    );
  }

  return (
    <div className="fc-demo-rolle">
      <label htmlFor="fc-devbruger">Log ind som</label>
      <select id="fc-devbruger" value={email || ""} disabled={skifter}
              onChange={(e) => skift(e.target.value)}>
        {/* Er man logget ind som noget uden for listen — fx en rigtig konto —
            skal den stå der, ellers ser det ud som om man er en anden. */}
        {!KONTI.some((b) => b.email === email) && (
          <option value={email || ""}>{email || "—"}</option>
        )}
        {KONTI.map((b) => (
          <option key={b.email} value={b.email}>{b === EJER ? `${b.rolle} (dig)` : b.rolle}</option>
        ))}
      </select>
      <span>
        {fejl
          || (skifter ? "Skifter session…"
            : "Du bliver faktisk en anden bruger. Nyt token, nye claims — serveren behandler dig som den rolle.")}
      </span>
    </div>
  );
}
