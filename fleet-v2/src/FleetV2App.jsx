import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fleetDemo } from "./demoData";
import { Icon } from "./components/Icon";
import { Overview } from "./components/Overview";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { UnitCatalog } from "./components/UnitCatalog";
import { UnitProfile } from "./components/UnitProfile";
import { ReportWizard } from "./components/ReportWizard";
import { ReportTriage } from "./components/ReportTriage";
import { WorkQueue } from "./components/WorkQueue";
import { WorkshopOverview } from "./components/WorkshopOverview";
import { WorkshopTaskDetail } from "./components/WorkshopTaskDetail";
import { WorkshopCalendar } from "./components/WorkshopCalendar";
import { CaseFolder } from "./components/CaseFolder";
import { WorkshopAssignment } from "./components/WorkshopAssignment";
import { ServiceOverview } from "./components/ServiceOverview";
import { LiveMap } from "./components/LiveMap";
import { DocumentsOverview } from "./components/DocumentsOverview";
import { LeasingOverview } from "./components/LeasingOverview";
import { LeasingDetail } from "./components/LeasingDetail";
import { LeaseDeliveryCase } from "./components/LeaseDeliveryCase";
import { LeaseContractReview } from "./components/LeaseContractReview";
import { MobileReporting } from "./components/MobileReporting";
import { FleetEconomy } from "./components/FleetEconomy";
import { FleetStatistics } from "./components/FleetStatistics";
import { FleetDataProvider } from "./data/FleetDataContext";
import { afgoerRetur, opretReturtilstand } from "./data/navigationHistory";

export const routeFromPath = (pathname, basePath = "") => {
  const absolute = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const normalizedBase = basePath.replace(/\/+$/, "");
  const clean = normalizedBase && (absolute === normalizedBase || absolute.startsWith(`${normalizedBase}/`))
    ? absolute.slice(normalizedBase.length) || "/"
    : absolute;
  if (clean === "/enheder") return { page: "units", kind: "catalog" };
  if (clean.startsWith("/enheder/")) return { page: "units", kind: "profile", unitId: decodeURIComponent(clean.slice("/enheder/".length)) };
  if (clean === "/indberetninger/ny") return { page: "reports", kind: "new-report" };
  if (clean === "/indberetninger") return { page: "reports", kind: "triage" };
  if (clean.startsWith("/indberetninger/")) return { page: "reports", kind: "triage", reportId: decodeURIComponent(clean.slice("/indberetninger/".length)) };
  if (clean === "/arbejdsko") return { page: "queue", kind: "queue" };
  if (clean.startsWith("/arbejdsko/")) return { page: "queue", kind: "queue", caseId: decodeURIComponent(clean.slice("/arbejdsko/".length)) };
  if (clean === "/vaerksted/kalender") return { page: "workshop", kind: "workshop-calendar" };
  if (clean === "/vaerksted") return { page: "workshop", kind: "workshop-overview" };
  if (clean.startsWith("/vaerksted/")) return { page: "workshop", kind: "workshop-task", taskId: decodeURIComponent(clean.slice("/vaerksted/".length)) };
  if (clean === "/service") return { page: "service", kind: "service-overview" };
  if (clean === "/livekort") return { page: "map", kind: "live-map" };
  if (clean === "/dokumenter") return { page: "documents", kind: "documents-overview" };
  if (clean.startsWith("/dokumenter/")) return { page: "documents", kind: "documents-overview", documentId: decodeURIComponent(clean.slice("/dokumenter/".length)) };
  if (clean === "/leasing") return { page: "leasing", kind: "leasing-overview" };
  if (clean.match(/^\/leasing\/[^/]+\/kontraktgennemgang$/)) return { page: "leasing", kind: "lease-contract-review", leaseId: decodeURIComponent(clean.split("/")[2]) };
  if (clean.match(/^\/leasing\/[^/]+\/aflevering$/)) return { page: "leasing", kind: "lease-delivery", leaseId: decodeURIComponent(clean.split("/")[2]) };
  if (clean.match(/^\/leasing\/[^/]+\/kilometer$/)) return { page: "leasing", kind: "lease-detail", leaseId: decodeURIComponent(clean.split("/")[2]), view: "kilometres" };
  if (clean.match(/^\/leasing\/[^/]+\/vilkaar$/)) return { page: "leasing", kind: "lease-detail", leaseId: decodeURIComponent(clean.split("/")[2]), view: "terms" };
  if (clean.match(/^\/leasing\/[^/]+\/dokumenter$/)) return { page: "leasing", kind: "lease-detail", leaseId: decodeURIComponent(clean.split("/")[2]), view: "documents" };
  if (clean.match(/^\/leasing\/[^/]+\/historik$/)) return { page: "leasing", kind: "lease-detail", leaseId: decodeURIComponent(clean.split("/")[2]), view: "history" };
  if (clean.startsWith("/leasing/")) return { page: "leasing", kind: "lease-detail", leaseId: decodeURIComponent(clean.slice("/leasing/".length)), view: "overview" };
  if (clean === "/mobil/ny") return { page: "mobile", kind: "mobile", view: "new" };
  if (clean === "/mobil/kladder") return { page: "mobile", kind: "mobile", view: "drafts" };
  if (clean === "/mobil/mine") return { page: "mobile", kind: "mobile", view: "mine" };
  if (clean.startsWith("/mobil/mine/")) return { page: "mobile", kind: "mobile", view: "detail", reportId: decodeURIComponent(clean.slice("/mobil/mine/".length)) };
  if (clean === "/mobil") return { page: "mobile", kind: "mobile", view: "home" };
  if (clean === "/oekonomi") return { page: "economy", kind: "economy" };
  if (clean === "/statistik") return { page: "statistics", kind: "statistics" };
  if (clean.match(/^\/sager\/[^/]+\/bestilling$/)) return { page: "queue", kind: "workshop-assignment", caseId: decodeURIComponent(clean.split("/")[2]) };
  if (clean.startsWith("/sager/")) return { page: "queue", kind: "case-folder", caseId: decodeURIComponent(clean.slice("/sager/".length)) };
  return { page: "overview", kind: "overview" };
};

const absoluteFleetPath = (basePath, path) => {
  const normalizedBase = basePath.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedBase ? `${normalizedBase}${normalizedPath === "/" ? "" : normalizedPath}` : normalizedPath;
};

export function FleetV2App({
  actor,
  basePath = "",
  canCreateSupplier = false,
  embedded = false,
  imageProcessor,
  navigationState,
  onBack,
  onCreateSupplier,
  onNavigate,
  pathname,
  repository,
  serviceBackend,
  vehicleLookup,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const controlled = typeof pathname === "string" && typeof onNavigate === "function";
  const [localPathname, setLocalPathname] = useState(() => `${window.location.pathname}${window.location.search}`);
  const activePathname = controlled ? pathname : localPathname;
  const route = useMemo(() => routeFromPath(activePathname, basePath), [activePathname, basePath]);
  const statusFilter = new URLSearchParams(activePathname.split("?")[1] || "").get("status") || "";
  const selectedSupplierId = new URLSearchParams(activePathname.split("?")[1] || "").get("leverandoer") || "";
  const katalogvisning = useRef(null);
  const koevisning = useRef(null);
  const triagevisning = useRef(null);
  const profilvisninger = useRef(new Map());
  const afventetScroll = useRef(null);

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
    if (controlled) return undefined;
    const handlePopState = () => setLocalPathname(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [controlled]);

  useEffect(() => {
    if (controlled || afventetScroll.current == null) return undefined;
    const scrollY = afventetScroll.current;
    afventetScroll.current = null;
    const foerste = window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
    }));
    return () => window.cancelAnimationFrame(foerste);
  }, [activePathname, controlled]);

  const navigate = (path, options = {}) => {
    const target = absoluteFleetPath(basePath, path);
    if (controlled) {
      onNavigate(target, options);
      return;
    }
    if (`${window.location.pathname}${window.location.search}` !== target) {
      const historyState = {
        ...(options.state || {}),
        ...opretReturtilstand(activePathname, window.scrollY),
      };
      if (options.replace) window.history.replaceState(historyState, "", target);
      else window.history.pushState(historyState, "", target);
    }
    setLocalPathname(target);
  };

  const back = (fallback) => {
    const target = absoluteFleetPath(basePath, fallback);
    if (onBack) { onBack(target); return; }
    const retur = afgoerRetur({
      tilstand: navigationState || window.history.state,
      fallback: target,
      tilladteRodstier: [basePath || "/"],
    });
    if (retur.handling === "historik") {
      afventetScroll.current = retur.scrollY;
      window.history.back();
    }
    else navigate(retur.sti, { replace: true });
  };
  const huskKatalogvisning = useCallback((visning) => { katalogvisning.current = visning; }, []);
  const huskKoevisning = useCallback((visning) => { koevisning.current = visning; }, []);
  const huskTriagevisning = useCallback((visning) => { triagevisning.current = visning; }, []);
  const huskProfilvisning = useCallback((unitId, visning) => { profilvisninger.current.set(unitId, visning); }, []);

  let content;
  if (route.kind === "catalog") content = <UnitCatalog initialStatus={statusFilter} initialViewState={katalogvisning.current} onViewStateChange={huskKatalogvisning} onNavigate={navigate} onNotice={setNotice} vehicleLookup={vehicleLookup} imageProcessor={imageProcessor} />;
  else if (route.kind === "profile") content = <UnitProfile unitId={route.unitId} initialViewState={profilvisninger.current.get(route.unitId)} onViewStateChange={huskProfilvisning} onBack={back} onNavigate={navigate} onNotice={setNotice} vehicleLookup={vehicleLookup} imageProcessor={imageProcessor} />;
  else if (route.kind === "new-report") content = <ReportWizard onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "triage") content = <ReportTriage reportId={route.reportId} initialViewState={triagevisning.current} onViewStateChange={huskTriagevisning} onBack={back} onNavigate={navigate} />;
  else if (route.kind === "queue") content = <WorkQueue caseId={route.caseId} initialViewState={koevisning.current} onViewStateChange={huskKoevisning} onBack={back} onNavigate={navigate} />;
  else if (route.kind === "workshop-overview") content = <WorkshopOverview onNavigate={navigate} />;
  else if (route.kind === "workshop-calendar") content = <WorkshopCalendar onNavigate={navigate} />;
  else if (route.kind === "workshop-task") content = <WorkshopTaskDetail taskId={route.taskId} onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "case-folder") content = <CaseFolder caseId={route.caseId} onBack={back} onNavigate={navigate} />;
  else if (route.kind === "workshop-assignment") content = <WorkshopAssignment caseId={route.caseId} canCreateSupplier={canCreateSupplier} onCreateSupplier={onCreateSupplier ? () => onCreateSupplier(absoluteFleetPath(basePath, `/sager/${encodeURIComponent(route.caseId)}/bestilling`)) : undefined} onBack={back} onNavigate={navigate} selectedSupplierId={selectedSupplierId} />;
  else if (route.kind === "service-overview") content = <ServiceOverview onNavigate={navigate} />;
  else if (route.kind === "live-map") content = <LiveMap onNavigate={navigate} />;
  else if (route.kind === "documents-overview") content = <DocumentsOverview documentId={route.documentId} onBack={back} onNavigate={navigate} />;
  else if (route.kind === "leasing-overview") content = <LeasingOverview onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "lease-detail") content = <LeasingDetail leaseId={route.leaseId} view={route.view} onBack={back} onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "lease-delivery") content = <LeaseDeliveryCase leaseId={route.leaseId} onBack={back} onNavigate={navigate} />;
  else if (route.kind === "lease-contract-review") content = <LeaseContractReview leaseId={route.leaseId} onBack={back} onNavigate={navigate} />;
  else if (route.kind === "mobile") content = <MobileReporting view={route.view} reportId={route.reportId} onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "economy") content = <FleetEconomy onNavigate={navigate} />;
  else if (route.kind === "statistics") content = <FleetStatistics onNavigate={navigate} />;
  else content = <Overview onUnavailable={showUnavailable} onNavigate={navigate} />;

  return (
    <FleetDataProvider actor={actor} repository={repository} serviceBackend={serviceBackend}>
      <div className="veyro-module--fleet">
        <div className={embedded ? "fleet-v2-embedded" : "fleet-v2-shell"}>
        <a className="skip-link" href="#main-content">Gå til indhold</a>
        {!embedded ? <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onUnavailable={showUnavailable} onNavigate={navigate} activePage={route.page} /> : null}
        {!embedded && sidebarOpen ? <button className="sidebar-scrim" aria-label="Luk menu" onClick={() => setSidebarOpen(false)} type="button" /> : null}
        {!embedded ? <Topbar meta={fleetDemo.meta} onMenu={() => setSidebarOpen((value) => !value)} onUnavailable={showUnavailable} /> : null}
        {content}
        {notice ? (
          <div className="stage-notice" role="status">
            <Icon name="info" size={18} />
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="Luk besked"><Icon name="close" size={15} /></button>
          </div>
        ) : null}
        </div>
      </div>
    </FleetDataProvider>
  );
}
