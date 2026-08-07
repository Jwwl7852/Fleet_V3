/* src/App.jsx
 * Alle ruter på ét sted. Rækkefølgen følger nav.js, så sidebar og ruter
 * ikke kan komme ud af sync.
 */
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FleetProvider } from "./fleet/FleetContext.jsx";
import AppShell from "./fleet/AppShell.jsx";
import { REDIRECTS } from "./fleet/nav.js";
import { auth, demoMode, hentBrugerContext } from "./firebase.js";

import Dashboard from "./moduler/Dashboard.jsx";
import BookingOversigt from "./moduler/booking/Oversigt.jsx";
import NyForespoergsel from "./moduler/booking/NyForespoergsel.jsx";
import Forslag from "./moduler/booking/Forslag.jsx";
import Disponering from "./moduler/booking/Disponering.jsx";
import LiveKort from "./moduler/booking/LiveKort.jsx";
import Bookingopsaetning from "./moduler/booking/Bookingopsaetning.jsx";
import Bemanding from "./moduler/Bemanding.jsx";
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
import Idebank from "./moduler/opsaetning/Idebank.jsx";
import { permStrengFraRolle } from "./fleet/permissions.js";

const TENANTS = [{ id: "demo", navn: "DEMO Transport ApS", kort: "DEMO Transport" }];

/* perms udledes af rollen via presettet — den skrives ikke i hånden her.
   Ellers ville demo-brugeren kunne have en anden adgang end en rigtig admin,
   og så tester man noget andet end det man leverer. */
const DEMO_BRUGER = {
  uid: "demo", navn: "Dennis Christensen", email: "dch@fleetcontrol.dk",
  rolle: "admin", rolleLabel: "Administrator", tenant: "demo",
  perms: permStrengFraRolle("admin"),
};

export default function App() {
  const [bruger, setBruger] = useState(demoMode ? DEMO_BRUGER : null);
  const [klar, setKlar] = useState(demoMode);

  useEffect(() => {
    if (demoMode || !auth) return;
    return auth.onAuthStateChanged(async (u) => {
      setBruger(u ? await hentBrugerContext(u) : null);
      setKlar(true);
    });
  }, []);

  if (!klar) return <div className="fc-boot">Henter…</div>;

  return (
    <FleetProvider tenants={TENANTS} bruger={bruger} logUd={() => auth?.signOut()}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />

            <Route path="booking" element={<BookingOversigt />} />
            <Route path="booking/ny" element={<NyForespoergsel />} />
            <Route path="booking/forslag/:id" element={<Forslag />} />
            <Route path="booking/disponering" element={<Disponering />} />
            <Route path="booking/live-kort" element={<LiveKort />} />
            <Route path="booking/opsaetning" element={<Bookingopsaetning />} />

            <Route path="bemanding" element={<Bemanding />} />
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

            <Route path="opsaetning" element={<Generelt />} />
            <Route path="opsaetning/brugere" element={<Brugere />} />
            <Route path="opsaetning/integrationer" element={<Integrationer />} />
            <Route path="opsaetning/idebank" element={<Idebank />} />

            {/* v1.4-stier holdes i live, så gamle links og bogmærker virker */}
            {REDIRECTS.map((r) => (
              <Route key={r.fra} path={r.fra.slice(1)} element={<Navigate to={r.til} replace />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </FleetProvider>
  );
}
