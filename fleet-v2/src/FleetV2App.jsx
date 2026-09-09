import { useEffect, useState } from "react";
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
import { FleetDataProvider } from "./data/FleetDataContext";

const routeFromPath = (pathname) => {
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
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
  if (clean.match(/^\/sager\/[^/]+\/bestilling$/)) return { page: "queue", kind: "workshop-assignment", caseId: decodeURIComponent(clean.split("/")[2]) };
  if (clean.startsWith("/sager/")) return { page: "queue", kind: "case-folder", caseId: decodeURIComponent(clean.slice("/sager/".length)) };
  return { page: "overview", kind: "overview" };
};

export function FleetV2App({ repository, vehicleLookup, imageProcessor }) {
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

  let content;
  if (route.kind === "catalog") content = <UnitCatalog onNavigate={navigate} onNotice={setNotice} vehicleLookup={vehicleLookup} imageProcessor={imageProcessor} />;
  else if (route.kind === "profile") content = <UnitProfile unitId={route.unitId} onNavigate={navigate} onNotice={setNotice} vehicleLookup={vehicleLookup} imageProcessor={imageProcessor} />;
  else if (route.kind === "new-report") content = <ReportWizard onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "triage") content = <ReportTriage reportId={route.reportId} onNavigate={navigate} />;
  else if (route.kind === "queue") content = <WorkQueue caseId={route.caseId} onNavigate={navigate} />;
  else if (route.kind === "workshop-overview") content = <WorkshopOverview onNavigate={navigate} />;
  else if (route.kind === "workshop-calendar") content = <WorkshopCalendar onNavigate={navigate} />;
  else if (route.kind === "workshop-task") content = <WorkshopTaskDetail taskId={route.taskId} onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "case-folder") content = <CaseFolder caseId={route.caseId} onNavigate={navigate} />;
  else if (route.kind === "workshop-assignment") content = <WorkshopAssignment caseId={route.caseId} onNavigate={navigate} />;
  else if (route.kind === "service-overview") content = <ServiceOverview onNavigate={navigate} />;
  else if (route.kind === "live-map") content = <LiveMap onNavigate={navigate} />;
  else if (route.kind === "documents-overview") content = <DocumentsOverview documentId={route.documentId} onNavigate={navigate} />;
  else if (route.kind === "leasing-overview") content = <LeasingOverview onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "lease-detail") content = <LeasingDetail leaseId={route.leaseId} view={route.view} onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "lease-delivery") content = <LeaseDeliveryCase leaseId={route.leaseId} onNavigate={navigate} />;
  else if (route.kind === "lease-contract-review") content = <LeaseContractReview leaseId={route.leaseId} onNavigate={navigate} />;
  else if (route.kind === "mobile") content = <MobileReporting view={route.view} reportId={route.reportId} onNavigate={navigate} imageProcessor={imageProcessor} />;
  else if (route.kind === "economy") content = <FleetEconomy onNavigate={navigate} />;
  else content = <Overview onUnavailable={showUnavailable} onNavigate={navigate} />;

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
