/* src/moduler/DevTesterVaelger.jsx
 * Fuldskærmsvalg af v1-test-rolle for en autoriseret DEV-tester UDEN sin
 * egen tenant.
 *
 * ⚠ HVORFOR KONTOEN INGEN TENANT HAR. `devTester` (scripts/dev-tester.mjs)
 * kan ÉN ting: bede devBrugerSkift (functions/index.js) om et Firebase
 * custom token for en af v1-tests syv kendte rollekonti. Gav vi den også en
 * tenant, ville den have direkte adgang til v1-tests data under SIT EGET
 * claim — og så ville identiteten "må skifte til en test-rolle" og
 * identiteten "ER en test-rolle" være den samme, hvor kun den første er
 * meningen.
 *
 * ⚠ DERFOR EGEN SKÆRM, IKKE App.jsx's ALMINDELIGE "uprovisioneret". Den
 * skærm siger "der er ikke noget du kan gøre her" — og det er forkert for
 * en devTester, som netop SKAL gøre noget her: vælge en rolle. App.jsx
 * fanger derfor devTester-uden-tenant FØR den almindelige harAdgang-gren.
 *
 * ⚠ EAGER, IKKE lazy(). Den tegnes uden for AppShell og dermed uden en
 * Suspense-grænse — samme undtagelse som Login.jsx, se App.jsx's hoved.
 */
import { useEffect, useState } from "react";
import { auth, kaldFunktion, projektId } from "../firebase.js";
import { ROLLE_PERMS } from "../fleet/permissions.js";
import { Knap } from "../fleet/ui.jsx";

/* ⚠ DE SYV KENDTE ROLLER — UDLEDT, IKKE SKREVET I HÅNDEN. Samme katalog
   devBrugerSkift godtager server-side. */
const V1T_ROLLER = Object.keys(ROLLE_PERMS);

/**
 * ⚠ HER LÅ V1-TESTBLOKKEREN: "alle roller giver samme chaufførskærm".
 *
 * App.jsx husker hvilken side man kom fra (`fra`), i browserens EGEN
 * history-state — ikke i React — så EfterLogin kan sende en genindlogget
 * bruger tilbage til den. Det er rigtigt for en session der blev logget af
 * og logger ind som SIG SELV igen.
 *
 * Den her skærm er noget andet: den er en BEVIDST IDENTITETSSKIFTE, og den
 * ligger UDEN FOR <BrowserRouter> (se filens eget hoved) — derfor ændrer den
 * aldrig url'en selv. Var forrige identitet chauffør (sad på /app) da nogen
 * loggede ud, sidder `fra: "/app"` stadig i historikken for den AKTUELLE
 * url ("/login"), fordi den url aldrig blev forladt undervejs. Når
 * BrowserRouter så monterer FØRSTE gang for den NYE rolle, arver den den
 * gamle state — og EfterLogin sender enhver ny rolle til /app, uanset hvem
 * han faktisk lige er blevet.
 *
 * Løsningen er ikke at lukke /app for andre end chauffører — det var en
 * bevidst beslutning, se test/chaufforadgang.test.mjs — men at rydde den
 * forældede "fra" FØR routeren nogensinde ser den. `replaceState` ændrer
 * kun history-OBJEKTET, ikke url'en, og virker uden en Router at være uenig
 * med, fordi ingen er monteret her.
 */
function ryddGammelFra() {
  window.history.replaceState({}, "", window.location.pathname + window.location.search);
}

export default function DevTesterVaelger({ bruger, logUd }) {
  const [skifter, setSkifter] = useState(false);
  const [fejl, setFejl] = useState(null);

  /* ⚠ RYDDES OGSÅ VED MONTERING, IKKE KUN EFTER ET VALG. Skærmen selv
     BEVISER at det forrige "fra" ikke længere betyder noget: er man her,
     hører man ikke til nogen tenant lige nu — uanset hvor en tidligere
     identitet sad. */
  useEffect(() => { ryddGammelFra(); }, []);

  async function vaelg(rolle) {
    if (!auth || !rolle) return;
    setSkifter(true);
    setFejl(null);
    try {
      const svar = await kaldFunktion("devBrugerSkift", { rolle });
      const token = svar?.data?.token;
      if (!token) throw new Error("Intet token modtaget.");
      /* signOut først — samme grund som Brugervaelger.jsx: uden den kan man
         nå at stå med det gamle tokens claims mens det nye login er
         undervejs. */
      await auth.signOut();
      /* ⚠ LIGE FØR signInWithCustomToken — så tæt på skiftet som muligt.
         onAuthStateChanged kan i teorien nå at fyre og udløse en gentegning
         før linjen herunder, men aldrig FØR den her — rækkefølgen inden for
         samme synkrone funktion er garanteret. */
      ryddGammelFra();
      await auth.signInWithCustomToken(token);
      /* Ingen navigation her udover det. onAuthStateChanged i App henter
         det nye bruger-context (nu MED en tenant), og App re-renderer selv
         ind i den rigtige AppShell — uden en forældet "fra" at arve. */
    } catch (e) {
      setFejl(
        e?.code === "functions/permission-denied"
          ? "Denne konto er ikke længere en autoriseret DEV-tester."
          : e?.code === "functions/failed-precondition"
            ? "Findes kun i DEV."
            : e?.message || "Kunne ikke skifte til den rolle."
      );
      setSkifter(false);
    }
  }

  return (
    <div className="fc-boot">
      <div className="fc-login">
        <div className="fc-brand fc-login-brand">
          Fleet<b>Control</b>
        </div>
        <div className="fc-card">
          <div className="fc-card-b">
            <p className="fc-hint" style={{ marginTop: 0 }}>
              {bruger?.email || "Denne konto"} er en autoriseret DEV-tester
              uden sin egen tenant. Vælg en v1-test-rolle for at fortsætte —
              ingen adgangskode sendes til browseren.
            </p>
            <div className="fc-felt">
              <label htmlFor="fc-devrolle">Log ind som</label>
              <select id="fc-devrolle" defaultValue="" disabled={skifter}
                      onChange={(e) => vaelg(e.target.value)}>
                <option value="" disabled>Vælg rolle…</option>
                {V1T_ROLLER.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {fejl && <p className="fc-empty-bad" role="alert">{fejl}</p>}
            {skifter && <p className="fc-hint">Skifter session…</p>}

            <Knap onClick={logUd}>Log ud</Knap>
          </div>
        </div>
        <p className="fc-hint fc-login-miljoe">{projektId || "demo-mode"}</p>
      </div>
    </div>
  );
}
