import { OperationalOverview, OverviewStatus } from '../../../../src/fleet/OperationalOverview.jsx';
import { useFacilityData } from '../../data/FacilityDataContext';
import { selectOverview } from '../../data/overviewSelectors';
import { DEMO_USER_ID } from '../../data/fixtures';
import { useFacilityNavigate } from '../../routing/FacilityRouting';

const date = (value) => value ? new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : '—';
const priorityLabel = { acute: 'Akut', high: 'Høj', normal: 'Normal', medium: 'Middel', low: 'Lav' };
const statusLabel = { new: 'Ny', triage: 'Under vurdering', ready: 'Klar til udførelse', inProgress: 'Under udførelse', awaitingInvoice: 'Afventer faktura', planned: 'Planlagt' };

export function OverviewPage() {
  const { dataset, error } = useFacilityData();
  const navigate = useFacilityNavigate();
  if (error) return <section className="state-page error"><h1>Data kunne ikke indlæses</h1><p>{error.message}</p></section>;
  if (!dataset) return <section className="state-page"><span className="loading-dot" /><h1>FACILITY indlæses</h1></section>;
  const overview = selectOverview(dataset, DEMO_USER_ID);
  const properties = new Map(dataset.properties.map((item) => [item.id, item]));
  const resources = new Map(dataset.resources.map((item) => [item.id, item]));
  const rank = { acute: 0, high: 1, normal: 2, medium: 2, low: 3 };
  const allOpenTasks = dataset.tasks.filter((item) => item.status !== 'completed');
  const openTasks = [...allOpenTasks].sort((left, right) => (rank[left.priority] ?? 9) - (rank[right.priority] ?? 9) || String(left.dueDate || '9999').localeCompare(String(right.dueDate || '9999'))).slice(0, 5);
  const service = overview.upcomingService.slice(0, 5);
  return <OperationalOverview
    module="FACILITY" title="FACILITY – overblik"
    period={`Næste 30 dage fra ${date(dataset.referenceDate)} · Europe/Copenhagen`}
    source="FACILITY-repository"
    testData
    kpis={[
      { label: 'Ejendomme', value: overview.propertyCount, note: 'aktive ejendomme i fælles datasæt', icon: '⌂', onClick: () => navigate('/facility/ejendomme') },
      { label: 'Åbne opgaver', value: allOpenTasks.length, note: 'ikke afsluttede opgaver', icon: '⚒', tone: 'warn', onClick: () => navigate('/facility/opgaver') },
      { label: 'Eftersyn snart', value: overview.upcomingServiceCount, note: 'planlagt inden for 30 dage', icon: '▦', tone: 'warn', onClick: () => navigate('/facility/service') },
    ]}
    action={{ label: 'Opret opgave', onClick: () => navigate('/facility/arbejdsko') }}
    tables={[
      { id: 'facility-service', title: 'Kommende eftersyn', note: 'Nærmeste frist først · højst 5', onAll: () => navigate('/facility/service'), rows: service, onRow: () => navigate('/facility/service'), columns: [
        { key: 'date', label: 'Dato', render: (row) => date(row.dueDate) }, { key: 'property', label: 'Ejendom', render: (row) => <strong>{row.property?.name || row.propertyId}</strong> }, { key: 'installation', label: 'Installation', render: (row) => row.installation?.name || 'Ejendomsniveau' }, { key: 'type', label: 'Eftersynstype', render: (row) => row.activity }, { key: 'supplier', label: 'Leverandør' }, { key: 'status', label: 'Status', render: () => <OverviewStatus tone="warn">Snart</OverviewStatus> }, { key: 'action', label: 'Handling', render: () => <span className="fc-overview-link">Se detaljer →</span> },
      ], empty: 'Der er ingen planlagte eftersyn i den viste 30-dagesperiode.' },
      { id: 'facility-tasks', title: 'Åbne opgaver', note: 'Akut/høj prioritet først, derefter nærmeste frist · højst 5', onAll: () => navigate('/facility/opgaver'), rows: openTasks, onRow: (row) => navigate(`/facility/opgaver/${row.id}`), columns: [
        { key: 'number', label: 'Opgavenr.', render: (row) => <strong>{row.taskNumber || row.id}</strong> }, { key: 'date', label: 'Dato', render: (row) => date(row.dueDate) }, { key: 'property', label: 'Ejendom', render: (row) => properties.get(row.propertyId)?.name || row.propertyId }, { key: 'subject', label: 'Emne', render: (row) => row.title }, { key: 'priority', label: 'Prioritet', render: (row) => priorityLabel[row.priority] || row.priority }, { key: 'status', label: 'Status', render: (row) => <OverviewStatus tone={row.status === 'ready' ? 'info' : 'warn'}>{statusLabel[row.status] || row.status}</OverviewStatus> }, { key: 'owner', label: 'Ansvarlig', render: (row) => resources.get(row.resourceId)?.name || 'Ikke tildelt' }, { key: 'action', label: 'Handling', render: () => <span className="fc-overview-link">Se opgave →</span> },
      ], empty: 'Der er ingen åbne FACILITY-opgaver.' },
    ]}
  />;
}
