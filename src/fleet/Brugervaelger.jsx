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
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ TO VEJE IND, ÉN GRUND TIL AT DE IKKE MÅ VÆRE DEN SAMME.
 *
 * VITE_* bages ALTID ind i klientbundtet ved build — det er ikke en
 * konfigurationsfejl, det er hvordan Vite virker. Lokalt (`npm run dev`) er
 * bundtet kun på udviklerens egen maskine, og VITE_DEV_BRUGER_KODE er derfor
 * en bekvemmelighed. På en hostet Hosting-URL er DET SAMME bundt offentligt
 * tilgængeligt, og en adgangskode dér ville enhver besøgende kunne læse ud af
 * koden — og se den forudfyldt, uden engang at åbne devtools.
 *
 * Den hostede DEV-build sætter derfor ALDRIG VITE_DEV_BRUGER_KODE (se
 * .env.production.local i Hosting-udrulningen). Uden den falder komponenten
 * tilbage på en FJERN vej: en Cloud Function (devBrugerSkift) der kræver at
 * DENNE session allerede er en eksplicit autoriseret DEV-tester
 * (devTester-claimet, sat med scripts/dev-tester.mjs — se den fils eget
 * hoved for hvorfor det ikke er `udbyder`), og som svarer med et Firebase
 * custom token for den ØNSKEDE v1-test-rolle. Klienten sender kun
 * rollenavnet; ingen adgangskode eller uid rejser nogensinde til browseren.
 * Se functions/index.js's eget hoved for den fulde begrundelse.
 *
 * Kontiene lokalt oprettes af scripts/provisioner-dev.mjs (fleet/dev-brugere.js
 * er listen). De fjerne kontiene oprettes af
 * scripts/provisioner-v1-test-brugere.mjs, og deres domæne — V1T_DOMAENE —
 * kommer fra SAMME fil som den her importerer det fra, af samme grund: to
 * lister ville drive, og fejlen ville se ud som en login-fejl.
 * ══════════════════════════════════════════════════════════════════════════
 */
import { useState } from "react";
import { auth, kaldFunktion } from "../firebase.js";
import { DEV_BRUGERE, ejerkonto, V1T_DOMAENE } from "./dev-brugere.js";
import { ROLLE_PERMS } from "./permissions.js";

/* Alle seks lokale konti deler én kode. Den står i .env.local, som er
   gitignored — e-mailadresser er ikke hemmeligheder, en adgangskode er. */
const KODE = import.meta.env?.VITE_DEV_BRUGER_KODE || "";

/* Ejerkontoen staar foerst, hvis der er sat en. Den er en almindelig konto med
   admin-claims — se ejerkonto() — ikke en genvej uden om noget. */
let EJER = null;
try { EJER = ejerkonto(import.meta.env?.VITE_DEV_EJER_MAIL); } catch { EJER = null; }
const KONTI = EJER ? [EJER, ...DEV_BRUGERE] : DEV_BRUGERE;

/* ⚠ DE SYV KENDTE v1-test-ROLLER — UDLEDT, IKKE SKREVET I HÅNDEN. Samme
   katalog devBrugerSkift godtager server-side; ROLLE_PERMS er fælles
   sandhed for begge, så en ny rolle i presettet ikke kan mangle her. */
const V1T_ROLLER = Object.keys(ROLLE_PERMS);

export default function Brugervaelger({ email, devTester = false }) {
  const [skifter, setSkifter] = useState(false);
  const [fejl, setFejl] = useState(null);

  /* Den lokale vej — uændret. Kun mulig når KODE findes, altså aldrig i en
     hostet build. */
  async function skiftLokalt(nyEmail) {
    if (!auth || !nyEmail || nyEmail === email) return;
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

  /* Den fjerne vej — se hovedet. Sender kun en rollenøgle; serveren afgør
     resten og udsteder tokenet. */
  async function skiftRemote(rolle) {
    if (!auth || !rolle) return;
    setSkifter(true);
    setFejl(null);
    try {
      const svar = await kaldFunktion("devBrugerSkift", { rolle });
      const token = svar?.data?.token;
      if (!token) throw new Error("Intet token modtaget.");
      await auth.signOut();
      await auth.signInWithCustomToken(token);
    } catch (e) {
      setFejl(
        e?.code === "functions/permission-denied"
          ? "Denne konto er ikke en autoriseret DEV-tester."
          : e?.code === "functions/failed-precondition"
            ? "Findes kun i DEV."
            : e?.message || "Kunne ikke skifte bruger."
      );
      setSkifter(false);
    }
  }

  /* ⚠ SAMME TO VEJE SOM SERVEREN GODTAGER — se devBrugerSkift's eget hoved.
     devTester er vejen IND; er man ALLEREDE en af v1-tests seks roller (fordi
     man kom ind via devTester, eller lokalt via den delte adgangskode), må
     man fortsætte med at skifte. Uden det andet led ville widgetten vise
     "VITE_DEV_BRUGER_KODE mangler" i det øjeblik man var blevet admin —
     man kunne komme IND, men aldrig skifte VIDERE til en anden rolle. */
  const erV1TestKonto = email?.endsWith(`@${V1T_DOMAENE}`) || false;

  if (!KODE && !devTester && !erV1TestKonto) {
    return (
      <div className="fc-demo-rolle">
        <label>Skift bruger</label>
        <span>VITE_DEV_BRUGER_KODE mangler i .env.local. Se README.</span>
      </div>
    );
  }

  /* ⚠ EN HOSTET BUILD HAR ALDRIG KODE — se hovedet. Rækkefølgen her betyder
     derfor intet i praksis, men den fjerne vej vindes først, fordi det er
     den der gælder når begge teoretisk kunne. */
  if (!KODE && (devTester || erV1TestKonto)) {
    /* Forvalgt til den rolle man rent faktisk er, hvis kontoen matcher
       v1-tests domæne — samme genkendelse som den lokale vælger giver. */
    const nuvaerendeRolle = erV1TestKonto
      ? email.slice(0, -(V1T_DOMAENE.length + 1))
      : "";
    return (
      <div className="fc-demo-rolle">
        <label htmlFor="fc-devbruger">Log ind som</label>
        <select id="fc-devbruger" value={nuvaerendeRolle} disabled={skifter}
                onChange={(e) => skiftRemote(e.target.value)}>
          {!nuvaerendeRolle && <option value="" disabled>Vælg rolle…</option>}
          {V1T_ROLLER.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <span>
          {fejl
            || (skifter ? "Skifter session…"
              : "Fjernskifte til v1-test — ingen adgangskode i browseren.")}
        </span>
      </div>
    );
  }

  return (
    <div className="fc-demo-rolle">
      <label htmlFor="fc-devbruger">Log ind som</label>
      <select id="fc-devbruger" value={email || ""} disabled={skifter}
              onChange={(e) => skiftLokalt(e.target.value)}>
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
