import { Navigate, Route, Routes } from 'react-router-dom';
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

function AppRoutes() {
  const { dataset } = useFacilityData();
  if (!dataset) {
    return <main className="app-loading" role="status" aria-live="polite">Indlæser FACILITY-data …</main>;
  }
  return (
    <Routes>
      <Route element={<PlatformShell customerName={dataset?.customerName ?? 'Veyro Demo Ejendomme A/S'} />}>
        <Route path="/facility" element={<OverviewPage />} />
        <Route path="/facility/ejendomme" element={<PropertiesPage />} />
        <Route path="/facility/ejendomme/:propertyId" element={<PropertyProfilePage />} />
        <Route path="/facility/installationer" element={<InstallationsPage />} />
        <Route path="/facility/installationer/:installationId" element={<InstallationProfilePage />} />
        <Route path="/facility/indberetninger" element={<ReportsPage />} />
        <Route path="/facility/arbejdsko" element={<WorkQueuePage />} />
        <Route path="/facility/sager/:caseId" element={<CasePage />} />
        <Route path="/facility/opgaver" element={<TasksPage />} />
        <Route path="/facility/opgaver/:taskId" element={<TaskPage />} />
        <Route path="/facility/kalender" element={<CalendarPage />} />
        <Route path="/facility/service" element={<ServicePage />} />
        <Route path="/facility/ejendomskort" element={<PropertyMapPage />} />
        <Route path="/facility/dokumenter" element={<DocumentsPage />} />
        <Route path="/facility/mobil-indberetning" element={<MobileReportPage />} />
        <Route path="/facility/oekonomi" element={<EconomyPage />} />
        {facilityNavigation.filter((page) => !['/facility', '/facility/ejendomme', '/facility/installationer', '/facility/indberetninger', '/facility/arbejdsko', '/facility/opgaver', '/facility/kalender', '/facility/service', '/facility/ejendomskort', '/facility/dokumenter', '/facility/mobil-indberetning', '/facility/oekonomi'].includes(page.path)).map((page) => (
          <Route key={page.path} path={page.path} element={<PlaceholderPage page={page} />} />
        ))}
        <Route path="/platform" element={<DisconnectedAreaPage area="platform" />} />
        <Route path="/fakturacenter" element={<DisconnectedAreaPage area="invoice" />} />
        <Route path="/fleet" element={<DisconnectedAreaPage area="fleet" />} />
        <Route path="/" element={<Navigate to="/facility" replace />} />
        <Route path="*" element={<Navigate to="/facility" replace />} />
      </Route>
    </Routes>
  );
}

export function FacilityV2App({ repository }) {
  return <FacilityDataProvider repository={repository}><AppRoutes /></FacilityDataProvider>;
}
