import { OperationalOverview, OverviewStatus } from "../../../src/fleet/OperationalOverview.jsx";
import { useFleetData } from "../data/FleetDataContext";
import { CASE_PRIORITIES, CASE_STATUSES, isOpenCase } from "../data/caseWorkflow";
import { deriveOverview } from "../data/unitSelectors";
import { demoMode } from "../../../src/firebase.js";

const date = (value) => value ? new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Copenhagen" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : "—";
const caseTone = (status) => ["new", "assessing"].includes(status) ? "warn" : status === "ready" ? "info" : "neutral";

export function Overview({ onNavigate }) {
  const { units, relations, loading, error } = useFleetData();
  if (loading) return <main className="dashboard loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser FLEET-data …</p></main>;
  if (error) return <main className="dashboard loading-state" id="main-content"><p role="alert">FLEET-data kunne ikke indlæses. Eksempeldata vises ikke ved fejl.</p></main>;

  const derived = deriveOverview(units, relations);
  const openCases = (relations.cases || []).filter(isOpenCase);
  const reportById = new Map((relations.reports || []).map((item) => [item.id, item]));
  const unitById = new Map(units.map((item) => [item.id, item]));
  const priorityRank = { critical: 0, high: 1, normal: 2, low: 3 };
  const caseRows = [...openCases].sort((left, right) => (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) || String(left.dueDate || "9999").localeCompare(String(right.dueDate || "9999"))).slice(0, 5);
  const serviceRows = derived.serviceItems.slice(0, 5).map((item, index) => ({ ...item, id: `service-${index}` }));

  return <OperationalOverview
    module="FLEET"
    title="FLEET – overblik"
    period="Aktuelle åbne poster · datoer vist i Europe/Copenhagen"
    source="Fælles enheds-, service- og sagsgrundlag"
    testData={demoMode}
    kpis={[
      { label: "Enheder", value: derived.totals.units, note: "aktive poster i enhedsregisteret", icon: "▣", tone: "neutral", onClick: () => onNavigate("/enheder") },
      { label: "Åbne sager", value: openCases.length, note: "afsluttede og afviste er udeladt", icon: "⚒", tone: "warn", onClick: () => onNavigate("/arbejdsko") },
      { label: "Service snart", value: derived.totals.upcomingService, note: "overskredet, kommende eller planlagt", icon: "▦", tone: "warn", onClick: () => onNavigate("/service") },
    ]}
    action={{ label: "Opret sag", onClick: () => onNavigate("/indberetninger/ny") }}
    tables={[
      { id: "fleet-service", title: "Kommende service", note: "Kritisk/overskredet først, derefter nærmeste frist · højst 5", onAll: () => onNavigate("/service"), rows: serviceRows, onRow: () => onNavigate("/service"), columns: [
        { key: "date", label: "Dato" }, { key: "unit", label: "Enhed", render: (row) => <strong>{row.unit}</strong> }, { key: "type", label: "Type" }, { key: "interval", label: "Interval", render: () => "Se serviceplan" }, { key: "meter", label: "Kilometer / timer" }, { key: "status", label: "Status", render: (row) => <OverviewStatus tone={row.status === "Overskredet" ? "bad" : "warn"}>{row.status}</OverviewStatus> }, { key: "action", label: "Handling", render: () => <span className="fc-overview-link">Se detaljer →</span> },
      ], empty: "Der er ingen aktive servicekrav, som kræver handling." },
      { id: "fleet-cases", title: "Åbne sager", note: "Kritisk/høj prioritet først, derefter nærmeste frist · højst 5", onAll: () => onNavigate("/arbejdsko"), rows: caseRows, onRow: (row) => onNavigate(`/sager/${row.id}`), columns: [
        { key: "number", label: "Sagsnummer", render: (row) => <strong>{row.number}</strong> }, { key: "date", label: "Dato", render: (row) => date(row.createdAt) }, { key: "unit", label: "Enhed", render: (row) => unitById.get(row.unitId)?.number || row.unitId }, { key: "subject", label: "Emne", render: (row) => reportById.get(row.reportId)?.title || row.nextAction }, { key: "priority", label: "Prioritet", render: (row) => CASE_PRIORITIES[row.priority] || row.priority }, { key: "status", label: "Status", render: (row) => <OverviewStatus tone={caseTone(row.status)}>{CASE_STATUSES[row.status] || row.status}</OverviewStatus> }, { key: "owner", label: "Ansvarlig", render: (row) => row.assigneeId || "Ikke tildelt" }, { key: "action", label: "Handling", render: () => <span className="fc-overview-link">Se sag →</span> },
      ], empty: "Der er ingen åbne FLEET-sager." },
    ]}
  />;
}
