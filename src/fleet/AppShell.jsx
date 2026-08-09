/* src/fleet/AppShell.jsx
 * Layout-rute: sidebar + topbar + <Outlet/>.
 * Modulerne har ikke egen sidebar, tenant-vælger eller periodevælger.
 * Skifter du periode her, ser alle moduler det via useFleet().
 */
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useFleet, PERIODER } from "./FleetContext.jsx";
import { findModul, findHovedmodul, NAV } from "./nav.js";
import { klokke } from "./format.js";
import { miljoe, projektId, paaLokalMaskine, netlifyKontekst, erProduktionsdeploy } from "../firebase.js";

/**
 * Miljøbjælke — over hele bredden, over sidebaren, umulig at overse.
 *
 * Den farlige situation er ikke "jeg troede jeg var på prod". Det er
 * "jeg troede jeg var på dev" — og så skriver man testdata ind i rigtige
 * kunders base. Derfor råber den højest ved PRODUKTIONSNØGLER ET STED DE
 * IKKE HØRER HJEMME, ikke ved dev.
 *
 * To sådanne steder, og begge fanges:
 *   1. en udviklermaskine        (localhost eller vite dev)
 *   2. en deploy-preview eller branch-deploy
 *
 * Nr. 2 kan kun ses, fordi netlify.toml mapper Netlifys CONTEXT ned i en
 * VITE_-variabel. Uden den ligner en preview et helt almindeligt
 * produktionsdeploy — samme netlify.app-domæne, samme alt.
 *
 * Produktion fra et bekræftet produktionsdeploy viser INGEN bjælke. En
 * advarsel man ser hele tiden, holder man op med at se.
 */
function MiljoeBjaelke() {
  const udvikling = paaLokalMaskine || import.meta.env.DEV;
  /* Bemærk: kun hvis konteksten er KENDT og ikke er produktion. Er den ukendt
     — et build hostet et sted vi ikke kender — falder vi tilbage på
     localhost-tjekket frem for at give falsk alarm på det rigtige site. */
  const forkertKontekst = netlifyKontekst !== null && !erProduktionsdeploy;

  if (miljoe === "prod" && (udvikling || forkertKontekst)) {
    return (
      <div className="fc-miljoe fc-miljoe-fare" role="alert">
        <b>Produktion</b>
        <span>
          Du kører mod <b>{projektId}</b>{" "}
          {udvikling ? "fra en udviklermaskine" : `i en ${netlifyKontekst}`}.
          Alt du gør, rammer rigtige kunders data.
        </span>
      </div>
    );
  }
  if (miljoe === "dev") {
    return (
      <div className="fc-miljoe fc-miljoe-dev" role="status">
        <b>Dev{netlifyKontekst && !erProduktionsdeploy ? ` · ${netlifyKontekst}` : ""}</b>
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
  const { tenant, tenants, tenantId, setTenantId, dage, setDage, division, setDivision, bruger, logUd, demo, demoRolle, saetDemoRolle } = useFleet();
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
            {/* ⚠ ALT UNDTAGEN PRODUKTION. Vælgeren gør adgangsmodellen synlig:
                skifter man rolle, ændrer knapperne sig på HVER skærm, fordi de
                alle spørger efter en permission og ikke efter en rolle.
                Den ændrer intet claim og intet på serveren.

                Den gatede først på demoMode alene, og så var den usynlig i dev
                — hvor en udvikler normalt kører. I produktion må den ikke
                findes: dér ville den ligne en rettighedsændring.
                saetDemoRolle er en no-op uden flaget; se FleetContext. */}
            {demo && (
              <div className="fc-demo-rolle">
                <label htmlFor="fc-rolle">Se platformen som</label>
                <select id="fc-rolle" value={demoRolle || bruger?.rolle || "admin"}
                        onChange={(e) => saetDemoRolle(e.target.value)}>
                  {DEMO_ROLLER.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <span>
                  {miljoe === "demo"
                    ? "Ændrer kun hvad UI'et viser. Der er ingen server at spørge."
                    : "Ændrer kun UI'et. Dit rigtige claim er urørt, så serveren afviser stadig det rollen ikke må — og det er meningen: sådan kan du se at UI og regler er enige."}
                </span>
              </div>
            )}
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
