import { useEffect, useState } from "react";
import { fleetDemo } from "./demoData";
import { Icon } from "./components/Icon";
import { Overview } from "./components/Overview";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { UnitCatalog } from "./components/UnitCatalog";
import { UnitProfile } from "./components/UnitProfile";
import { FleetDataProvider } from "./data/FleetDataContext";

const routeFromPath = (pathname) => {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/enheder") return { page: "units", kind: "catalog" };
  if (clean.startsWith("/enheder/")) return { page: "units", kind: "profile", unitId: decodeURIComponent(clean.slice("/enheder/".length)) };
  return { page: "overview", kind: "overview" };
};

export function FleetV2App({ repository }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));

  const showUnavailable = (label) => {
    setNotice(`${label}: Ikke implementeret i denne etape`);
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path) => {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setRoute(routeFromPath(path));
  };

  const content = route.kind === "catalog"
    ? <UnitCatalog onNavigate={navigate} onNotice={setNotice} />
    : route.kind === "profile"
      ? <UnitProfile unitId={route.unitId} onNavigate={navigate} onNotice={setNotice} />
      : <Overview onUnavailable={showUnavailable} />;

  return (
    <FleetDataProvider repository={repository}>
      <div className="fleet-v2-shell">
        <a className="skip-link" href="#main-content">Gå til indhold</a>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onUnavailable={showUnavailable} onNavigate={navigate} activePage={route.page} />
        {sidebarOpen ? <button className="sidebar-scrim" aria-label="Luk menu" onClick={() => setSidebarOpen(false)} type="button" /> : null}
        <Topbar meta={fleetDemo.meta} onMenu={() => setSidebarOpen((value) => !value)} onUnavailable={showUnavailable} />
        {content}
        {notice ? (
          <div className="stage-notice" role="status">
            <Icon name="info" size={18} />
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="Luk besked"><Icon name="close" size={15} /></button>
          </div>
        ) : null}
      </div>
    </FleetDataProvider>
  );
}
