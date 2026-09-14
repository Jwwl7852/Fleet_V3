/* Godkendt loginforslag E. Firebase-flow, claims og permissions er fortsat
 * ejet af firebase.js og App.jsx; dette er alene loginbrugerfladen. */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { auth, miljoe, offentligLoginKontekstUrl, projektId } from "../firebase.js";
import { Knap } from "../fleet/ui.jsx";
import VeyroLogo from "../fleet/VeyroLogo.jsx";
import {
  loginBillederForModuler,
  loginSenesteBilledeNøgle,
  vaelgLoginBillede,
} from "../fleet/login-billeder.js";
import { hentOffentligLoginKontekst } from "../fleet/login-kundekonfiguration.js";
import { INAKTIVITET_LOGOUT_BESKED_NOGLE } from "../fleet/inaktivitet.js";

const FEJLTEKST = {
  "auth/invalid-email": "Det ser ikke ud som en e-mailadresse.",
  "auth/user-disabled": "Kontoen er spærret. Kontakt din administrator.",
  "auth/too-many-requests": "For mange forsøg. Vent et par minutter, og prøv igen.",
  "auth/network-request-failed": "Der er ikke forbindelse til login-tjenesten.",
};
const GENEREL = "E-mail eller adgangskode passer ikke.";

const DEV_UDFYLD = miljoe === "dev"
  ? {
      email: import.meta.env?.VITE_DEV_EJER_MAIL || "admin@dev.fleetcontrol.invalid",
      kode: import.meta.env?.VITE_DEV_BRUGER_KODE || "",
    }
  : null;

export default function LoginE({ uprovisioneret = false, hentLoginKontekst = hentOffentligLoginKontekst }) {
  const [email, setEmail] = useState(DEV_UDFYLD?.email || "");
  const [kode, setKode] = useState(DEV_UDFYLD?.kode || "");
  const [visKode, setVisKode] = useState(false);
  const [fejl, setFejl] = useState(null);
  const [sender, setSender] = useState(false);
  const [nulstiller, setNulstiller] = useState(false);
  const [nulstilSvar, setNulstilSvar] = useState(null);
  const [billede, setBillede] = useState(null);
  const [billedeKlar, setBilledeKlar] = useState(false);
  const [billedeFejl, setBilledeFejl] = useState(false);
  const [inaktivitetsbesked] = useState(
    () => window.sessionStorage.getItem(INAKTIVITET_LOGOUT_BESKED_NOGLE) === "inaktivitet",
  );
  const fra = useLocation().state?.fra;

  useEffect(() => {
    const controller = new AbortController();
    let aktiv = true;
    hentLoginKontekst({ url: offentligLoginKontekstUrl, signal: controller.signal }).then((kontekst) => {
      if (!aktiv || kontekst?.status !== "kendt") return;
      const billeder = loginBillederForModuler(kontekst.moduler);
      const nøgle = loginSenesteBilledeNøgle(kontekst.contextId);
      const valgt = vaelgLoginBillede({ billeder, forrigeId: window.localStorage.getItem(nøgle) });
      if (!valgt) return;
      window.localStorage.setItem(nøgle, valgt.id);
      setBillede(valgt);
    });
    return () => { aktiv = false; controller.abort(); };
  }, [hentLoginKontekst]);

  useEffect(() => {
    window.sessionStorage.removeItem(INAKTIVITET_LOGOUT_BESKED_NOGLE);
  }, []);

  async function logInd(event) {
    event.preventDefault();
    if (!auth) {
      setFejl("Login kræver forbindelse til den konfigurerede backend.");
      return;
    }
    setSender(true);
    setFejl(null);
    try {
      await auth.signInWithEmailAndPassword(email.trim(), kode);
    } catch (error) {
      setFejl(FEJLTEKST[error?.code] || GENEREL);
      setSender(false);
    }
  }

  async function sendNulstilling() {
    const adresse = email.trim();
    setNulstilSvar(null);
    if (!adresse) {
      setNulstilSvar({ fejl: true, tekst: "Indtast din e-mailadresse først." });
      return;
    }
    if (!auth) {
      setNulstilSvar({ fejl: true, tekst: "Nulstilling kræver forbindelse til login-tjenesten." });
      return;
    }
    setNulstiller(true);
    try {
      await auth.sendPasswordResetEmail(adresse);
      setNulstilSvar({
        fejl: false,
        tekst: "Hvis adressen er registreret, modtager du en e-mail med næste trin.",
      });
    } catch (error) {
      const tekst = FEJLTEKST[error?.code]
        || "Nulstillingen kunne ikke startes. Prøv igen senere.";
      setNulstilSvar({ fejl: true, tekst });
    } finally {
      setNulstiller(false);
    }
  }

  return (
    <div className="fc-login-side">
      <section className={`fc-login-hero${billede && !billedeFejl ? " har-billede" : ""}${billedeKlar ? " er-klar" : ""}${billedeFejl ? " har-fejl" : ""}`} aria-label="Veyro Systems">
        {billede && !billedeFejl && (
          <img
            className="fc-login-hero-billede"
            src={billede.src}
            alt=""
            aria-hidden="true"
            style={{ objectPosition: billede.fokus }}
            onLoad={() => setBilledeKlar(true)}
            onError={() => setBilledeFejl(true)}
          />
        )}
        <div className="fc-login-hero-toning" aria-hidden="true" />
        <div className="fc-login-logo-felt"><VeyroLogo variant="login-hero" /></div>
        {billede && !billedeFejl && <div className="fc-login-motiv">
          <p className="fc-login-motiv-navn">{billede.motiv}</p>
          <p>{billede.tekst}</p>
          <small>AI-genereret illustration</small>
        </div>}
      </section>

      <main className="fc-login-panel">
        <div className="fc-login">
          <header className="fc-login-intro">
            <p className="fc-login-overlinje">Veyro Systems</p>
            <h1>Velkommen tilbage</h1>
            <p>Log ind på din arbejdsplads</p>
          </header>

          {inaktivitetsbesked && (
            <p className="fc-login-sessionbesked" role="status">
              Du er blevet logget ud efter 45 minutters inaktivitet.
            </p>
          )}

          {uprovisioneret ? (
            <div className="fc-login-kort">
              <p className="fc-empty-bad" role="alert">Kontoen er ikke provisioneret.</p>
              <p className="fc-hint">
                Du er logget ind, men brugeren har intet tenant-claim. Kontakt din administrator.
              </p>
              {miljoe === "dev" && (
                <p className="fc-hint">Kør <code>npm run provisioner:dev</code> og log ind igen.</p>
              )}
              <Knap onClick={() => auth?.signOut()}>Log ud</Knap>
            </div>
          ) : (
            <form className="fc-login-form" onSubmit={logInd}>
              <div className="fc-felt">
                <label htmlFor="fc-email">E-mail</label>
                <input
                  id="fc-email" type="email" inputMode="email"
                  autoComplete={DEV_UDFYLD ? "off" : "username"} required
                  value={email} onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="fc-felt">
                <label htmlFor="fc-kode">Adgangskode</label>
                <div className="fc-login-kodefelt">
                  <input
                    id="fc-kode" type={visKode ? "text" : "password"}
                    autoComplete={DEV_UDFYLD ? "new-password" : "current-password"} required
                    value={kode} onChange={(event) => setKode(event.target.value)}
                  />
                  <button
                    type="button" className="fc-login-vis-kode"
                    aria-pressed={visKode} aria-label={visKode ? "Skjul adgangskode" : "Vis adgangskode"}
                    onClick={() => setVisKode((værdi) => !værdi)}
                  >{visKode ? "Skjul" : "Vis"}</button>
                </div>
              </div>

              <div className="fc-login-hjælpelinje">
                <button type="button" className="fc-login-link" onClick={sendNulstilling} disabled={nulstiller}>
                  {nulstiller ? "Sender…" : "Glemt adgangskode?"}
                </button>
              </div>

              {nulstilSvar && (
                <p className={nulstilSvar.fejl ? "fc-empty-bad" : "fc-login-ok"} role={nulstilSvar.fejl ? "alert" : "status"}>
                  {nulstilSvar.tekst}
                </p>
              )}
              {fejl && <p className="fc-empty-bad" role="alert">{fejl}</p>}

              <Knap variant="primaer" type="submit" disabled={sender}>
                {sender ? "Logger ind…" : "Log ind"}
              </Knap>

              {DEV_UDFYLD && <p className="fc-hint">Udfyldt fra .env.local — kun i dev.</p>}
              {fra && <p className="fc-hint">Efter login åbnes den side, du kom fra.</p>}
            </form>
          )}

          <footer className="fc-login-footer">
            <p>Har du brug for hjælp? <a href="mailto:info@veyrosystems.com">Kontakt Veyro Support</a></p>
            <p className="fc-login-miljoe">{projektId || "demo-mode"}</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
