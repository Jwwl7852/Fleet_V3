/* src/moduler/Login.jsx
 * Login. Ligger UDEN FOR AppShell — shellen har sidebar, tenant-vælger og
 * periodevælger, og ingen af dem giver mening uden en session.
 *
 * ⚠ TO FEJLTILSTANDE DER LIGNER HINANDEN OG IKKE ER DET SAMME:
 *
 *   forkert kode      brugeren skal prøve igen
 *   uprovisioneret    kontoen findes og koden passer, men der er intet
 *                     tenant-claim. Brugeren kan ikke gøre noget ved det,
 *                     og "forkert adgangskode" ville sende dem i gang med
 *                     at nulstille en kode der virker.
 *
 * Den anden er den, der faktisk sker: den opstår hver gang provisioneringen
 * kun er kørt halvt. Se beslutning 27.
 *
 * Firebase samler i nyere SDK'er "ukendt bruger" og "forkert kode" til
 * auth/invalid-credential, og det er med vilje fra deres side — ellers kan
 * en fremmed bruge login-skærmen til at finde ud af hvilke adresser der
 * findes. Vi udstiller derfor heller ikke forskellen.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { auth, miljoe, projektId } from "../firebase.js";
import { Knap } from "../fleet/ui.jsx";

const FEJLTEKST = {
  "auth/invalid-email": "Det ser ikke ud som en e-mailadresse.",
  "auth/user-disabled": "Kontoen er spærret. Kontakt din administrator.",
  "auth/too-many-requests":
    "For mange forsøg. Firebase har midlertidigt spærret adgangen fra denne maskine — vent et par minutter.",
  "auth/network-request-failed": "Ingen forbindelse til Firebase.",
};

const GENEREL = "E-mail eller adgangskode passer ikke.";

export default function Login({ uprovisioneret = false }) {
  const [email, setEmail] = useState("");
  const [kode, setKode] = useState("");
  const [fejl, setFejl] = useState(null);
  const [sender, setSender] = useState(false);
  const fra = useLocation().state?.fra;

  async function logInd(e) {
    e.preventDefault();
    if (!auth) return;
    setSender(true);
    setFejl(null);
    try {
      await auth.signInWithEmailAndPassword(email.trim(), kode);
      /* Ingen navigation her. onAuthStateChanged i App henter claims og
         bytter hele rutetræet ud — navigerer vi også, kappes der om det. */
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

        {uprovisioneret ? (
          /* Logget ind, men uden tenant-claim. Fejler lukket: der er ikke en
             halv adgang at give, og brugeren skal ikke gætte. */
          <div className="fc-card">
            <div className="fc-card-b">
              <p className="fc-empty-bad" style={{ marginTop: 0 }}>
                Kontoen er ikke provisioneret.
              </p>
              <p className="fc-hint">
                Du er logget ind, men brugeren har intet tenant-claim, og så må den
                ingenting. Det er ikke noget du kan rette her.
              </p>
              {miljoe === "dev" && (
                <p className="fc-hint">Kør <code>npm run provisioner:dev</code> og log ind igen.</p>
              )}
              <Knap onClick={() => auth?.signOut()}>Log ud</Knap>
            </div>
          </div>
        ) : (
          <form className="fc-card" onSubmit={logInd}>
            <div className="fc-card-b">
              <div className="fc-felt">
                <label htmlFor="fc-email">E-mail</label>
                <input id="fc-email" type="email" autoComplete="username" required
                       value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="fc-felt">
                <label htmlFor="fc-kode">Adgangskode</label>
                <input id="fc-kode" type="password" autoComplete="current-password" required
                       value={kode} onChange={(e) => setKode(e.target.value)} />
              </div>

              {/* role="alert", så en skærmlæser får beskeden. En fejl man kun
                  kan se, findes ikke for alle. */}
              {fejl && <p className="fc-empty-bad" role="alert">{fejl}</p>}

              <Knap variant="primaer" type="submit" disabled={sender}>
                {sender ? "Logger ind…" : "Log ind"}
              </Knap>

              {fra && (
                <p className="fc-hint">Du sendes videre til <code>{fra}</code> bagefter.</p>
              )}
            </div>
          </form>
        )}

        {/* Hvilket projekt man er ved at logge ind PÅ. Samme grund som
            miljøbjælken: den farlige situation er at tro man er et andet
            sted, end man er. */}
        <p className="fc-hint fc-login-miljoe">{projektId || "demo-mode"}</p>
      </div>
    </div>
  );
}
