/* src/fleet/AppShell.jsx
 * V1-skallen ejer navigation, sidetitel, visningsvalg og brugerfunktioner.
 * Navigationen er flydende og bruger fortsat NAV som eneste informationskilde.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useFleet } from "./FleetContext.jsx";
import { findModul, findHovedmodul, NAV, GRUPPE_ORDEN, GRUPPE_LABEL, modulNavnFor } from "./nav.js";
import { harModul } from "./moduler.js";
import { harPerm } from "./permissions.js";
import { usePost } from "./usePost.js";
import { erSkjultVedNavvisning } from "./navvisning.js";
import VeyroLogo from "./VeyroLogo.jsx";
import { miljoe, projektId, paaLokalMaskine, netlifyKontekst, erProduktionsdeploy } from "../firebase.js";
import { useVisningsvalg } from "./useVisningsvalg.js";
import { begraensZoom } from "./visningsvalg.js";
import { brugerInitialer } from "./brugerinitialer.js";

function MiljoeBjaelke() {
  const udvikling = paaLokalMaskine || import.meta.env.DEV;
  const forkertKontekst = netlifyKontekst !== null && !erProduktionsdeploy;
  if (miljoe === "prod" && (udvikling || forkertKontekst)) {
    return <div className="fc-miljoe fc-miljoe-fare" role="alert"><b>Produktion</b><span>
      Du kører mod <b>{projektId}</b> {udvikling ? "fra en udviklermaskine" : `i en ${netlifyKontekst}`}.
      Alt du gør, rammer rigtige kunders data.
    </span></div>;
  }
  if (miljoe === "dev") {
    return <div className="fc-miljoe fc-miljoe-dev" role="status"><b>TEST{netlifyKontekst && !erProduktionsdeploy ? ` · ${netlifyKontekst}` : ""}</b>
      <span>Syntetiske testdata i {projektId}. Ingen eksterne handlinger.</span></div>;
  }
  if (miljoe === "demo") {
    return <div className="fc-miljoe fc-miljoe-demo" role="status"><b>Demo</b>
      <span>Syntetiske testdata. Handlinger påvirker ikke kundedata eller eksterne leverandører.</span></div>;
  }
  return null;
}

const ICO = {
  dashboard: "M3 11 12 3l9 8M5 10v10h14V10",
  ressourcer: "M4 7h16v13H4zM8 7V4h8v3M8 12h8M8 16h5",
  booking: "M7 3v4m10-4v4M3 9h18M5 5h14v16H5z",
  bemanding: "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  flaade: "M3 16V7h11v9M14 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4m11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  facility: "M4 21V5l8-3v19M12 21h8V9l-8-3M7 9h1m-1 4h1m-1 4h1",
  indkoeb: "M3 4h2l2.5 11h10L21 7H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2m8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
  unitbooking: "M3 4h18v16H3zM3 10h18M3 15h18M8 4v6M15 10v5M11 15v5",
  warehouse: "M3 21V9l9-6 9 6v12M3 21h18M9 21v-6h6v6M6 12h3m6 0h3",
  oekonomi: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  kunderOversigt: "M2 10l10-7 10 7M4 10V21h16V10M9 21v-6h6v6",
  fakturacenter: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h3",
  leverandoerer: "M3 16V6a1 1 0 0 1 1-1h9v11M14 9h4l3 3v4h-2M3 16h2m9 0h5M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  support: "M12 18h.01M12 14a2.5 2.5 0 1 0-2.5-2.5M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
  opsaetning: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9a2 2 0 1 1 0 4",
};

function Navigationsikon({ navn }) {
  return <span className="fc-nav-ikon" data-ikon={navn} aria-hidden="true">
    <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d={ICO[navn]} /></svg>
  </span>;
}

export default function AppShell() {
  const { tenant, tenantId, bruger, logUd, moduler } = useFleet();
  const location = useLocation();
  const { pathname } = location;
  const modul = findModul(pathname);
  const hoved = findHovedmodul(pathname);
  const ressourceSide = pathname === "/ressourcer" || pathname.startsWith("/ressourcer/")
    || pathname === "/facility-v2/ejendomme" || pathname === "/fleet-v2/leasing"
    || pathname === "/fleet-v2/dokumenter" || pathname === "/opsaetning/ressourcer/varer";
  const modulePage = ["flaade", "facility", "booking", "indkoeb", "warehouse", "unitbooking", "bemanding"].includes(hoved.key);
  const modulePageTitle = modulePage
    ? `${String(hoved.label || hoved.titel).toLocaleUpperCase("da-DK")} – ${modul.label || modul.titel}`
    : modul.titel;
  const pageTitle = pathname.startsWith("/oekonomi/fakturacenter")
    ? "Fakturacenter" : ressourceSide ? (modul.label || modul.titel) : modulePageTitle;
  const erFacilityIndberetninger = pathname === "/facility-v2/indberetninger";
  const erFleetIndberetninger = pathname === "/fleet-v2/indberetninger"
    || pathname.startsWith("/fleet-v2/indberetninger/");
  const erIndberetningsside = erFacilityIndberetninger || erFleetIndberetninger;
  const initialer = brugerInitialer(bruger?.navn, bruger?.email);
  const visningsKontekst = tenantId || tenant?.id || "ingen-tenant";
  const [zoom, setZoom, nulstilZoom] = useVisningsvalg({
    brugerId: bruger?.uid, kontekst: visningsKontekst, skaerm: pathname, egenskab: "zoom", standard: 100,
  });
  const [menuAaben, setMenuAaben] = useState(false);
  const [valgtMenuModul, setValgtMenuModul] = useState(null);
  const [mobilUndermenu, setMobilUndermenu] = useState(false);
  const [fakturacenterAntal, setFakturacenterAntal] = useState({});
  const menuKnap = useRef(null);
  const menuPanel = useRef(null);
  const visningDetaljer = useRef(null);
  const { post: navvisning } = usePost("navvisning", bruger?.uid || null);

  const skiftZoom = (retning) => setZoom((aktuel) => begraensZoom(Number(aktuel) + retning));
  const nulstilVisning = () => {
    nulstilZoom();
    window.dispatchEvent(new CustomEvent("veyro:nulstil-visning", { detail: { skaerm: pathname } }));
  };
  const synligeBorn = (m) => (m.born || [])
    .filter((b) => !b.skjulINav)
    .filter((b) => !b.kraeverModul || harModul(moduler, b.kraeverModul))
    .filter((b) => !b.kraeverEtAfModuler || b.kraeverEtAfModuler.some((navn) => harModul(moduler, navn)))
    .filter((b) => !b.kraeverPerm || harPerm(bruger?.perms, b.kraeverPerm));
  const synligeUnderpunkter = (b) => (b.underpunkter || [])
    .filter((u) => !u.skjulINav)
    .filter((u) => !u.kraeverModul || harModul(moduler, u.kraeverModul))
    .filter((u) => !u.kraeverEtAfModuler || u.kraeverEtAfModuler.some((navn) => harModul(moduler, navn)))
    .filter((u) => !u.kraeverPerm || harPerm(bruger?.perms, u.kraeverPerm));
  const synligeToppunkter = NAV
    .filter((m) => { const n = modulNavnFor(m); return !n || harModul(moduler, n); })
    .filter((m) => !m.kraeverEtAfModuler || m.kraeverEtAfModuler.some((navn) => harModul(moduler, navn)))
    .filter((m) => !m.kraeverPerm || harPerm(bruger?.perms, m.kraeverPerm))
    .filter((m) => !m.born?.length || synligeBorn(m).length)
    .filter((m) => !erSkjultVedNavvisning(m.key, navvisning));
  const harUndermenu = (m) => synligeBorn(m).length > 0 || (m.fakturacenterSektioner || []).length > 0;
  const aktivtToppunkt = synligeToppunkter.find((m) => m.key === hoved.key) || null;
  const valgtToppunkt = synligeToppunkter.find((m) => m.key === valgtMenuModul) || null;
  const aktivFakturacenterSektion = new URLSearchParams(location.search).get("sektion");

  const lukMenu = ({ fokus = true } = {}) => {
    setMenuAaben(false);
    setMobilUndermenu(false);
    if (fokus) window.requestAnimationFrame(() => menuKnap.current?.focus());
  };
  const aabnMenu = () => {
    if (document.querySelector('[aria-modal="true"], .fleet-dialog-backdrop, .procure-modal-layer, .procure-inventory-dialog-backdrop')) return;
    setValgtMenuModul(aktivtToppunkt && harUndermenu(aktivtToppunkt) ? aktivtToppunkt.key : null);
    setMobilUndermenu(false);
    setMenuAaben(true);
  };
  const vaelgToppunkt = (m) => {
    setValgtMenuModul(m.key);
    if (window.matchMedia("(max-width: 720px)").matches) setMobilUndermenu(true);
  };
  const navigerFraMenu = () => lukMenu({ fokus: false });

  useEffect(() => {
    if (!pathname.startsWith("/support")) window.sessionStorage.setItem("veyro:support:seneste-side", `${pathname}${location.search}`);
  }, [pathname, location.search]);

  useEffect(() => {
    const lukVisningVedKlikUdenfor = (event) => {
      const detaljer = visningDetaljer.current;
      if (!detaljer?.open || detaljer.contains(event.target)) return;
      detaljer.open = false;
    };
    const lukVisningVedEscape = (event) => {
      const detaljer = visningDetaljer.current;
      if (event.key !== "Escape" || !detaljer?.open) return;
      detaljer.open = false;
      detaljer.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", lukVisningVedKlikUdenfor, true);
    document.addEventListener("keydown", lukVisningVedEscape);
    return () => {
      document.removeEventListener("pointerdown", lukVisningVedKlikUdenfor, true);
      document.removeEventListener("keydown", lukVisningVedEscape);
    };
  }, []);

  useEffect(() => {
    if (!menuAaben) return undefined;
    document.body.classList.add("fc-flydende-menu-aaben");
    const fokusTimer = window.requestAnimationFrame(() => {
      const aktiv = menuPanel.current?.querySelector('[aria-current="page"], [aria-pressed="true"]');
      (aktiv || menuPanel.current?.querySelector("button, a"))?.focus();
    });
    const tastatur = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        lukMenu();
        return;
      }
      if (event.key !== "Tab" || !menuPanel.current) return;
      const fokuspunkter = [...menuPanel.current.querySelectorAll('a[href], button:not([disabled]), summary')]
        .filter((element) => element.offsetParent !== null);
      if (!fokuspunkter.length) return;
      const foerste = fokuspunkter[0];
      const sidste = fokuspunkter.at(-1);
      if (event.shiftKey && document.activeElement === foerste) {
        event.preventDefault();
        sidste.focus();
      } else if (!event.shiftKey && document.activeElement === sidste) {
        event.preventDefault();
        foerste.focus();
      }
    };
    document.addEventListener("keydown", tastatur);
    return () => {
      window.cancelAnimationFrame(fokusTimer);
      document.body.classList.remove("fc-flydende-menu-aaben");
      document.removeEventListener("keydown", tastatur);
    };
  }, [menuAaben]);

  useEffect(() => {
    setMenuAaben(false);
    setMobilUndermenu(false);
  }, [pathname, location.search]);

  const renderUndermenu = (m) => {
    if (!m) return null;
    const sektioner = (m.fakturacenterSektioner || [])
      .filter((sektion) => !sektion.betinget || fakturacenterAntal.__ekstraKontrolAktiv);
    if (sektioner.length) {
      const aktivSektion = sektioner.some((sektion) => sektion.id === aktivFakturacenterSektion)
        ? aktivFakturacenterSektion : sektioner[0]?.id;
      return sektioner.map((sektion) => {
        const antal = fakturacenterAntal[sektion.id];
        const erAktiv = hoved.key === m.key && aktivSektion === sektion.id;
        return <Link key={sektion.id} to={`${m.sti}?sektion=${sektion.id}`} onClick={navigerFraMenu}
          className={erAktiv ? "fc-flydende-subitem fc-on" : "fc-flydende-subitem"}
          aria-current={erAktiv ? "page" : undefined}>
          <span>{sektion.label}</span>
          {Number.isInteger(antal) && <span className="fc-sub-count" aria-label={`${antal} poster`}>{antal}</span>}
        </Link>;
      });
    }
    return synligeBorn(m).map((b) => {
      const underpunkter = synligeUnderpunkter(b);
      const erAktiv = modul.key === b.key;
      return <div key={b.key} className="fc-flydende-subgruppe">
        <NavLink to={b.sti} end onClick={navigerFraMenu}
          className={erAktiv ? "fc-flydende-subitem fc-on" : "fc-flydende-subitem"}
          aria-current={erAktiv ? "page" : undefined}><span>{b.label}</span></NavLink>
        {underpunkter.length > 0 && <div className="fc-flydende-underpunkter" aria-label={`${b.label} – underpunkter`}>
          {underpunkter.map((u) => {
            const underAktiv = modul.key === u.key;
            return <NavLink key={u.key} to={u.sti} end onClick={navigerFraMenu}
              className={underAktiv ? "fc-flydende-underitem fc-on" : "fc-flydende-underitem"}
              aria-current={underAktiv ? "page" : undefined}>{u.label}</NavLink>;
          })}
        </div>}
      </div>;
    });
  };

  return <>
    <MiljoeBjaelke />
    <div className="fc-app fc-app--flydende-menu">
      <div className={`fc-main fc-main--shared-page-top${modulePage ? " fc-main--module-title" : ""}${erIndberetningsside ? " fc-main--indberetninger" : ""}`}>
        <header className="fc-top">
          <div className="fc-shell-start">
            <button ref={menuKnap} type="button" className="fc-menu-knap" aria-haspopup="true"
              aria-controls="fc-flydende-navigation" aria-expanded={menuAaben}
              onClick={() => menuAaben ? lukMenu() : aabnMenu()}>
              <span className="fc-menu-knap-ikon" aria-hidden="true"><i /><i /><i /></span><span>Menu</span>
            </button>
            <div className="fc-shell-logo"><VeyroLogo variant="header" /></div>
          </div>
          <div className="fc-top-h">
            <p className="fc-top-kontekst"><strong>{hoved.label || hoved.titel}</strong><span aria-hidden="true"> / </span>{modul.label || modul.titel}</p>
          </div>
          <div className="fc-shell-brugerfunktioner">
            <details ref={visningDetaljer} className="fc-visning fc-visning--top">
              <summary><span className="fc-visning-ikon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M3 5h18v12H3zM8 21h8M12 17v4" /></svg>
              </span><span className="fc-visning-label">Visning</span><span className="fc-visning-chevron" aria-hidden="true">⌄</span></summary>
              <div className="fc-visning-panel" aria-label="Visningsindstillinger">
                <span className="fc-visning-panel-label">Zoom</span>
                <div className="fc-zoomkontroller" role="group" aria-label="Arbejdsområdezoom">
                  <button type="button" onClick={() => skiftZoom(-5)} aria-label="Zoom ud">−</button>
                  <output aria-live="polite">{begraensZoom(zoom)} %</output>
                  <button type="button" onClick={() => skiftZoom(5)} aria-label="Zoom ind">+</button>
                </div>
                <button type="button" className="fc-nulstil-visning" onClick={nulstilVisning}>Nulstil visning</button>
              </div>
            </details>
            <div className="fc-who fc-who--top" title={bruger?.navn || bruger?.email || "Ikke logget ind"}>
              <div className="fc-av">{initialer}</div><div className="fc-who-n">{bruger?.navn || "Ikke logget ind"}</div>
            </div>
            <button type="button" className="fc-top-logud" onClick={logUd}>Log ud</button>
          </div>

          {menuAaben && <>
            <div className="fc-menu-skaerm" aria-hidden="true" onPointerDown={(event) => {
              event.preventDefault(); event.stopPropagation(); lukMenu();
            }} />
            <nav ref={menuPanel} id="fc-flydende-navigation"
              className={`fc-flydende-nav${mobilUndermenu ? " fc-mobil-undermenu" : ""}`} aria-label="Hovednavigation">
              <section className="fc-flydende-moduler" aria-label="Moduler">
                <header className="fc-flydende-mobilhoved"><strong>Menu</strong>
                  <button type="button" onClick={() => lukMenu()} aria-label="Luk menu">×</button></header>
                <div className="fc-flydende-scroll">
                  {GRUPPE_ORDEN.map((gruppe) => {
                    const punkter = synligeToppunkter.filter((m) => m.gruppe === gruppe);
                    if (!punkter.length) return null;
                    return <div key={gruppe} className="fc-flydende-gruppe">
                      {GRUPPE_LABEL[gruppe] && <h2>{GRUPPE_LABEL[gruppe]}</h2>}
                      {punkter.map((m) => {
                        const aktiv = hoved.key === m.key;
                        const valgt = valgtMenuModul === m.key;
                        return harUndermenu(m) ? <button key={m.key} type="button"
                          className={aktiv ? "fc-flydende-modul fc-on" : "fc-flydende-modul"}
                          aria-pressed={valgt} onClick={() => vaelgToppunkt(m)}>
                          <Navigationsikon navn={m.key} /><span>{m.label}</span><span className="fc-flydende-pil" aria-hidden="true">›</span>
                        </button> : <NavLink key={m.key} to={m.sti} end={m.sti === "/"} onClick={navigerFraMenu}
                          className={aktiv ? "fc-flydende-modul fc-on" : "fc-flydende-modul"}
                          aria-current={aktiv ? "page" : undefined}>
                          <Navigationsikon navn={m.key} /><span>{m.label}</span>
                        </NavLink>;
                      })}
                    </div>;
                  })}
                </div>
              </section>
              {valgtToppunkt && harUndermenu(valgtToppunkt) && <section className="fc-flydende-undermenu" aria-label={`${valgtToppunkt.label} – sider`}>
                <header><button type="button" className="fc-flydende-tilbage" onClick={() => setMobilUndermenu(false)}>
                  <span aria-hidden="true">‹</span> Tilbage</button><strong>{valgtToppunkt.label}</strong>
                  <button type="button" className="fc-flydende-luk" onClick={() => lukMenu()} aria-label="Luk menu">×</button></header>
                <div className="fc-flydende-scroll">{renderUndermenu(valgtToppunkt)}</div>
              </section>}
            </nav>
          </>}
        </header>
        <div className="fc-sidehoved">
          <h1>{pageTitle}</h1>
          {erFacilityIndberetninger && <button type="button" className="fc-btn fc-btn-primaer"
            onClick={() => window.dispatchEvent(new CustomEvent("veyro:opret-facility-indberetning"))}>
            + Ny indberetning
          </button>}
          {erFleetIndberetninger && <Link className="fc-btn fc-btn-primaer" to="/fleet-v2/indberetninger/ny">
            + Ny indberetning
          </Link>}
        </div>
        <main className="fc-slot" onWheel={(event) => {
          if (!event.shiftKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          skiftZoom(event.deltaY > 0 ? -5 : 5);
        }}>
          <div className="fc-workspace-zoom" style={{ "--fc-workspace-zoom": begraensZoom(zoom) / 100 }}>
            <Suspense fallback={<div className="fc-empty">Henter skærmen …</div>}>
              <Outlet context={{ setFakturacenterAntal }} />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  </>;
}
