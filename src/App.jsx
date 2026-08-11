/* src/App.jsx
 * Alle ruter på ét sted. Rækkefølgen følger nav.js, så sidebar og ruter
 * ikke kan komme ud af sync.
 */
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { FleetProvider } from "./fleet/FleetContext.jsx";
import AppShell from "./fleet/AppShell.jsx";
import { REDIRECTS } from "./fleet/nav.js";
import { auth, db, demoMode, miljoe, hentBrugerContext } from "./firebase.js";

import Dashboard from "./moduler/Dashboard.jsx";
import BookingOversigt from "./moduler/booking/Oversigt.jsx";
import NyForespoergsel from "./moduler/booking/NyForespoergsel.jsx";
import Forslag from "./moduler/booking/Forslag.jsx";
import Disponering from "./moduler/booking/Disponering.jsx";
import LiveKort from "./moduler/booking/LiveKort.jsx";
import Bookingopsaetning from "./moduler/booking/Bookingopsaetning.jsx";
import Bemanding from "./moduler/Bemanding.jsx";
import Medarbejdere from "./moduler/Medarbejdere.jsx";
import Kompetencer from "./moduler/Kompetencer.jsx";
import Fravaer from "./moduler/Fravaer.jsx";
import FlaadeOversigt from "./moduler/flaade/Oversigt.jsx";
import Vaerkstedskalender from "./moduler/flaade/Vaerkstedskalender.jsx";
import Indberetninger from "./moduler/flaade/Indberetninger.jsx";
import FacilityOversigt from "./moduler/facility/Oversigt.jsx";
import Servicekalender from "./moduler/facility/Servicekalender.jsx";
import Klima from "./moduler/facility/Klima.jsx";
import IndkoebOversigt from "./moduler/indkoeb/Oversigt.jsx";
import Fakturaer from "./moduler/indkoeb/Fakturaer.jsx";
import Leverandoerer from "./moduler/indkoeb/Leverandoerer.jsx";
import Kunder from "./moduler/Kunder.jsx";
import Oekonomi from "./moduler/Oekonomi.jsx";
import Fakturering from "./moduler/Fakturering.jsx";
import Generelt from "./moduler/opsaetning/Generelt.jsx";
import Brugere from "./moduler/opsaetning/Brugere.jsx";
import Integrationer from "./moduler/opsaetning/Integrationer.jsx";
import Hjaelp from "./moduler/support/Hjaelp.jsx";
import Supportoverblik from "./moduler/support/Overblik.jsx";
import Supportsag from "./moduler/support/Sag.jsx";
import Login from "./moduler/Login.jsx";
import { permStrengFraRolle } from "./fleet/permissions.js";

/* ⚠ KUN TIL DEMO-MODE. Uden database findes der ingen tenant at hente, og
   sidebaren skal stadig kunne skrive et navn. I dev og produktion kommer
   navnet fra tenants/<id>/virksomhed — se noten i App(). */
const DEMO_TENANT = { id: "demo", navn: "DEMO Transport ApS", kort: "DEMO Transport" };

/* perms udledes af rollen via presettet — den skrives ikke i hånden her.
   Ellers ville demo-brugeren kunne have en anden adgang end en rigtig admin,
   og så tester man noget andet end det man leverer. */
const DEMO_BRUGER = {
  uid: "demo", navn: "Dennis Christensen", email: "dch@fleetcontrol.dk",
  rolle: "admin", rolleLabel: "Administrator", tenant: "demo",
  perms: permStrengFraRolle("admin"),
};

/* Gemmer hvor man var på vej hen, så et dybt link ikke koster en ekstra
   navigation efter login. */
function TilLogin() {
  const l = useLocation();
  return <Navigate to="/login" replace state={{ fra: l.pathname + l.search }} />;
}

/* Er man logget ind og lander på /login — typisk lige efter et login — så
   videre til det man kom fra. */
function EfterLogin() {
  const l = useLocation();
  return <Navigate to={l.state?.fra || "/"} replace />;
}

export default function App() {
  const [bruger, setBruger] = useState(demoMode ? DEMO_BRUGER : null);
  const [klar, setKlar] = useState(demoMode);
  /**
   * ⚠ TENANTEN KOMMER FRA BRUGERENS CLAIM, IKKE FRA EN KONSTANT.
   *
   * TENANTS var hardkodet til ét element, og så hed hver eneste kunde "DEMO
   * Transport ApS" i sidebaren. Navnet ligger nu i tenants/<id>/virksomhed —
   * ét sted, som kunden selv læser og udbyderen kan vise i en kundeliste.
   *
   * Der hentes KUN den tenant claim'et peger på. Der findes ingen liste at
   * vælge fra: reglerne sammenligner auth.token.tenant === $tenantId, så en
   * vælger kunne alligevel ikke skifte noget. Skal man se en anden kunde,
   * logger man ind som en bruger der hører til den — beslutning 28's model,
   * nu med to rigtige tenants at prøve den på.
   */
  const [virksomhed, setVirksomhed] = useState(null);
  const [moduler, setModuler] = useState(null);

  useEffect(() => {
    if (demoMode || !auth) return;
    return auth.onAuthStateChanged(async (u) => {
      setBruger(u ? await hentBrugerContext(u) : null);
      setKlar(true);
    });
  }, []);

  useEffect(() => {
    const t = bruger?.tenant;
    if (demoMode || !db || !t) { setVirksomhed(null); setModuler(null); return; }
    let aktiv = true;
    (async () => {
      try {
        const [v, m] = await Promise.all([
          db.ref(`tenants/${t}/virksomhed`).once("value"),
          db.ref(`tenants/${t}/moduler`).once("value"),
        ]);
        if (!aktiv) return;
        setVirksomhed(v.val());
        /* null = "ved ikke endnu". harModul() behandler det som ALT — en
           betalende kunde med tom sidebar er værre end en salgsflade der
           står åben. Se noten i moduler.js om hvorfor den fejler åbent. */
        setModuler(m.val());
      } catch {
        /* En afvist eller fejlet læsning må ikke tømme menuen. Kunden er
           logget korrekt ind; det er os der ikke kunne svare. */
        if (aktiv) { setVirksomhed(null); setModuler(null); }
      }
    })();
    return () => { aktiv = false; };
  }, [bruger?.tenant]);

  if (!klar) return <div className="fc-boot">Henter…</div>;

  /**
   * ⚠ MILJØUAFHÆNGIG. RØR IKKE DEN BETINGELSE.
   *
   * Adgang kræver et tenant-claim — ikke "en bruger", og ikke "ikke
   * produktion". En bruger uden claim må ingenting (se hentBrugerContext:
   * perms er tom streng, ikke udledt af rollen), så at lukke den ind i
   * shellen ville give en app hvor hver eneste læsning bliver afvist.
   *
   * Der er med vilje ikke en dev-variant og en prod-variant af den her gren.
   * Det er præcis den slags forskel der får en spærring til at gælde alle
   * andre steder end dér hvor den betyder noget. Den eneste tilbageværende
   * miljøafhængighed i adgangsvejen er om brugervælgeren TEGNES.
   */
  const harAdgang = Boolean(bruger?.tenant);

  /* Én tenant — den claim'et peger på. Navnet kommer fra basen; falder
     læsningen ud, bruges tenant-id'et, så sidebaren aldrig står tom. */
  const tenantListe = demoMode
    ? [DEMO_TENANT]
    : bruger?.tenant
      ? [{
          id: bruger.tenant,
          navn: virksomhed?.navn || bruger.tenant,
          kort: virksomhed?.navn || bruger.tenant,
        }]
      : [];

  return (
    /* rolleskifte er nu KUN demo. Klientside-overstyringen af perms er
       meningsløs alle andre steder: claims kommer fra tokenet, og klienten
       kan ikke ændre sit eget token. I dev skifter man bruger i stedet — se
       Brugervaelger og beslutning 28. */
    <FleetProvider tenants={tenantListe} moduler={moduler} bruger={bruger}
                   rolleskifte={miljoe === "demo"}
                   logUd={() => auth?.signOut()}>
      <BrowserRouter>
        <Routes>
          {!harAdgang && (
            <>
              {/* Logget ind uden tenant-claim er en ANDEN fejl end forkert
                  kode, og skærmen siger noget andet. Se Login.jsx. */}
              <Route path="/login" element={<Login uprovisioneret={Boolean(bruger)} />} />
              <Route path="*" element={<TilLogin />} />
            </>
          )}
          {harAdgang && <Route path="/login" element={<EfterLogin />} />}
          {harAdgang && (
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />

            <Route path="booking" element={<BookingOversigt />} />
            <Route path="booking/ny" element={<NyForespoergsel />} />
            <Route path="booking/forslag/:id" element={<Forslag />} />
            <Route path="booking/disponering" element={<Disponering />} />
            <Route path="booking/live-kort" element={<LiveKort />} />
            <Route path="booking/opsaetning" element={<Bookingopsaetning />} />

            <Route path="bemanding" element={<Bemanding />} />
            <Route path="bemanding/medarbejdere" element={<Medarbejdere />} />
            <Route path="bemanding/kompetencer" element={<Kompetencer />} />
            <Route path="bemanding/fravaer" element={<Fravaer />} />

            <Route path="flaade" element={<FlaadeOversigt />} />
            <Route path="flaade/vaerksted" element={<Vaerkstedskalender />} />
            <Route path="flaade/indberetninger" element={<Indberetninger />} />

            <Route path="facility" element={<FacilityOversigt />} />
            <Route path="facility/servicekalender" element={<Servicekalender />} />
            <Route path="facility/klima" element={<Klima />} />

            <Route path="indkoeb" element={<IndkoebOversigt />} />
            <Route path="indkoeb/fakturaer" element={<Fakturaer />} />
            <Route path="indkoeb/leverandoerer" element={<Leverandoerer />} />

            <Route path="kunder" element={<Kunder />} />

            <Route path="oekonomi" element={<Oekonomi />} />
            <Route path="oekonomi/fakturering" element={<Fakturering />} />

            <Route path="support" element={<Hjaelp />} />
            <Route path="support/overblik" element={<Supportoverblik />} />
            <Route path="support/sag/:id" element={<Supportsag />} />

            <Route path="opsaetning" element={<Generelt />} />
            <Route path="opsaetning/brugere" element={<Brugere />} />
            <Route path="opsaetning/integrationer" element={<Integrationer />} />

            {/* v1.4-stier holdes i live, så gamle links og bogmærker virker */}
            {REDIRECTS.map((r) => (
              <Route key={r.fra} path={r.fra.slice(1)} element={<Navigate to={r.til} replace />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          )}
        </Routes>
      </BrowserRouter>
    </FleetProvider>
  );
}
