/* src/fleet/AppShell.jsx
 * Layout-rute: sidebar + topbar + <Outlet/>.
 * Modulerne har ikke egen sidebar, tenant-vælger eller periodevælger.
 * Skifter du periode her, ser alle moduler det via useFleet().
 */
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useFleet, PERIODER } from "./FleetContext.jsx";
import { findModul, findHovedmodul, NAV } from "./nav.js";
import { klokke } from "./format.js";
import { miljoe, projektId, paaLokalMaskine } from "../firebase.js";

/**
 * Miljøbjælke — over hele bredden, over sidebaren, umulig at overse.
 *
 * Den farlige situation er ikke "jeg troede jeg var på prod". Det er
 * "jeg troede jeg var på dev" — og så skriver man testdata ind i rigtige
 * kunders base. Derfor råber den højest ved PRODUKTIONSNØGLER PÅ EN
 * UDVIKLERMASKINE, ikke ved dev.
 *
 * Produktion fra et deployet site viser INGEN bjælke. En advarsel man ser
 * hele tiden, holder man op med at se.
 *
 * Kendt hul: en Netlify deploy-preview er ikke localhost, så prod-nøgler i
 * en preview fanges ikke her. Derfor skal previews have DEV-værdier — se
 * netlify.toml.
 */
function MiljoeBjaelke() {
  const udvikling = paaLokalMaskine || import.meta.env.DEV;

  if (miljoe === "prod" && udvikling) {
    return (
      <div className="fc-miljoe fc-miljoe-fare" role="alert">
        <b>Produktion</b>
        <span>
          Du kører mod <b>{projektId}</b> fra en udviklermaskine. Alt du gør,
          rammer rigtige kunders data.
        </span>
      </div>
    );
  }
  if (miljoe === "dev") {
    return (
      <div className="fc-miljoe fc-miljoe-dev" role="status">
        <b>Dev</b>
        <span>{projektId} — data her er til at smide væk.</span>
      </div>
    );
  }
  if (miljoe === "demo") {
    return (
      <div className="fc-miljoe fc-miljoe-demo" role="status">
        <b>Demo</b>
        <span>Ingen databaseforbindelse. Tallene kommer fra datasættet i useKpi.js.</span>
      </div>
    );
  }
  return null;
}

const ICO = {
  dashboard: "M3 11 12 3l9 8M5 10v10h14V10",
  booking: "M7 3v4m10-4v4M3 9h18M5 5h14v16H5z",
  bemanding: "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  flaade: "M3 16V7h11v9M14 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4m11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  facility: "M4 21V5l8-3v19M12 21h8V9l-8-3M7 9h1m-1 4h1m-1 4h1",
  indkoeb: "M3 4h2l2.5 11h10L21 7H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2m8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
  kunder: "M17 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 8v6m3-3h-6",
  oekonomi: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  opsaetning: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9a2 2 0 1 1 0 4",
};

export default function AppShell() {
  const { tenant, tenants, tenantId, setTenantId, dage, setDage, division, setDivision, bruger, logUd } = useFleet();
  const { pathname } = useLocation();
  const modul = findModul(pathname);
  const hoved = findHovedmodul(pathname);
  const initialer = (bruger?.navn || bruger?.email || "?")
    .split(/[ .@]/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase();

  return (
    <>
      <MiljoeBjaelke />
      <div className="fc-app">
        <aside className="fc-side">
          <div className="fc-brand">Fleet<b>Control</b></div>
          <div className="fc-ver">version 3.0</div>
          <div className="fc-tenant">{tenant?.kort || tenant?.navn || "—"}</div>

          {/* Gods/Bus lå kun på Økonomi-skærmen i v2.0-mockupsene. Her gælder
              den hele platformen, som i v1.4. */}
          <div className="fc-div" role="group" aria-label="Forretningsområde">
            {[["gods", "Gods"], ["bus", "Bus"]].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={division === v} onClick={() => setDivision(v)}>{l}</button>
            ))}
          </div>

          <nav className="fc-nav" aria-label="Moduler">
            {NAV.map((m) => {
              const aktiv = hoved.key === m.key;
              const born = (m.born || []).filter((b) => !b.skjulINav);
              return (
                <div key={m.key}>
                  <NavLink to={m.sti} end={m.sti === "/"} className={aktiv ? "fc-link fc-on" : "fc-link"}>
                    <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={ICO[m.key]} />
                    </svg>
                    <span>{m.label}</span>
                  </NavLink>
                  {aktiv && born.length > 1 && (
                    <div className="fc-sub">
                      {born.map((b) => (
                        <NavLink key={b.key} to={b.sti} end
                                 className={modul.key === b.key ? "fc-sublink fc-on" : "fc-sublink"}>
                          {b.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="fc-foot">
            <div className="fc-who">
              <div className="fc-av">{initialer}</div>
              <div className="fc-who-txt">
                <div className="fc-who-n">{bruger?.navn || "Ikke logget ind"}</div>
                <div className="fc-who-r">{bruger?.rolleLabel || bruger?.email || "—"}</div>
              </div>
            </div>
            <button type="button" className="fc-side-btn" onClick={logUd}>Log ud</button>
          </div>
        </aside>

        <div className="fc-main">
          <header className="fc-top">
            <div className="fc-top-h">
              <h1>{modul.titel}</h1>
              <p>{modul.under}</p>
            </div>
            <div className="fc-top-ctl">
              <select className="fc-ctl" aria-label="Virksomhed" value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.navn}</option>)}
              </select>
              <select className="fc-ctl" aria-label="Periode" value={dage}
                      onChange={(e) => setDage(Number(e.target.value))}>
                {PERIODER.map((p) => <option key={p.dage} value={p.dage}>{p.label}</option>)}
              </select>
              <span className="fc-stamp">Opdateret {klokke(Date.now())}</span>
            </div>
          </header>
          <main className="fc-slot"><Outlet /></main>
        </div>
      </div>
    </>
  );
}
