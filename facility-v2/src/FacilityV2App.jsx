import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { PlatformShell } from './components/platform/PlatformShell';
import { OverviewPage } from './components/overview/OverviewPage';
import { FacilityDataProvider, useFacilityData } from './data/FacilityDataContext';
import { DisconnectedAreaPage } from './routes/DisconnectedAreaPage';
import { facilityNavigation } from './routes/navigation';
import { PlaceholderPage } from './routes/PlaceholderPage';
import { PropertiesPage } from './routes/PropertiesPage';
import { PropertyProfilePage } from './routes/PropertyProfilePage';
import { InstallationsPage } from './routes/InstallationsPage';
import { InstallationProfilePage } from './routes/InstallationProfilePage';
import { ReportsPage } from './routes/ReportsPage';
import { WorkQueuePage } from './routes/WorkQueuePage';
import { TasksPage } from './routes/TasksPage';
import { TaskPage } from './routes/TaskPage';
import { CasePage } from './routes/CasePage';
import { CalendarPage } from './routes/CalendarPage';
import { ServicePage } from './routes/ServicePage';
import { DocumentsPage } from './routes/DocumentsPage';
import { MobileReportPage } from './routes/MobileReportPage';
import { PropertyMapPage } from './routes/PropertyMapPage';
import { EconomyPage } from './routes/EconomyPage';
import {
  FACILITY_STANDALONE_ROUTE_PREFIX,
  FacilityRouteProvider,
  facilityPathForBase,
} from './routing/FacilityRouting';

function AppRoutes({ basePath, embedded }) {
  const { dataset } = useFacilityData();
  if (!dataset) {
    return <main className="app-loading" role="status" aria-live="polite">Indlæser FACILITY-data …</main>;
  }
  const route = (path) => {
    const mapped = facilityPathForBase(path, basePath);
    if (!embedded) return mapped;
    return mapped.slice(basePath.length).replace(/^\//, '');
  };
  return (
    <Routes>
      <Route element={embedded ? <Outlet /> : <PlatformShell customerName={dataset?.customerName ?? 'Veyro Demo Ejendomme A/S'} />}>
        <Route path={route('/facility')} element={<OverviewPage />} />
        <Route path={route('/facility/ejendomme')} element={<PropertiesPage />} />
        <Route path={route('/facility/ejendomme/:propertyId')} element={<PropertyProfilePage />} />
        <Route path={route('/facility/installationer')} element={<InstallationsPage />} />
        <Route path={route('/facility/installationer/:installationId')} element={<InstallationProfilePage />} />
        <Route path={route('/facility/indberetninger')} element={<ReportsPage />} />
        <Route path={route('/facility/arbejdsko')} element={<WorkQueuePage />} />
        <Route path={route('/facility/sager/:caseId')} element={<CasePage />} />
        <Route path={route('/facility/opgaver')} element={<TasksPage />} />
        <Route path={route('/facility/opgaver/:taskId')} element={<TaskPage />} />
        <Route path={route('/facility/kalender')} element={<CalendarPage />} />
        <Route path={route('/facility/service')} element={<ServicePage />} />
        <Route path={route('/facility/ejendomskort')} element={<PropertyMapPage />} />
        <Route path={route('/facility/dokumenter')} element={<DocumentsPage />} />
        <Route path={route('/facility/mobil-indberetning')} element={<MobileReportPage />} />
        <Route path={route('/facility/oekonomi')} element={<EconomyPage />} />
        {facilityNavigation.filter((page) => !['/facility', '/facility/ejendomme', '/facility/installationer', '/facility/indberetninger', '/facility/arbejdsko', '/facility/opgaver', '/facility/kalender', '/facility/service', '/facility/ejendomskort', '/facility/dokumenter', '/facility/mobil-indberetning', '/facility/oekonomi'].includes(page.path)).map((page) => (
          <Route key={page.path} path={route(page.path)} element={<PlaceholderPage page={page} />} />
        ))}
        {!embedded && <Route path="/platform" element={<DisconnectedAreaPage area="platform" />} />}
        {!embedded && <Route path="/fakturacenter" element={<DisconnectedAreaPage area="invoice" />} />}
        {!embedded && <Route path="/fleet" element={<DisconnectedAreaPage area="fleet" />} />}
        {!embedded && <Route path="/" element={<Navigate to={basePath} replace />} />}
        {!embedded && <Route path="*" element={<Navigate to={basePath} replace />} />}
      </Route>
    </Routes>
  );
}

export function FacilityV2App({
  basePath = FACILITY_STANDALONE_ROUTE_PREFIX,
  embedded = false,
  repository,
}) {
  return (
    <FacilityRouteProvider basePath={basePath}>
      <FacilityDataProvider repository={repository}>
        <div className="veyro-module--facility">
          <AppRoutes basePath={basePath} embedded={embedded} />
        </div>
      </FacilityDataProvider>
    </FacilityRouteProvider>
  );
}
