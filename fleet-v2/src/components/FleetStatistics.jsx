import { useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { FLEET_METRICS, buildFleetMeasurements, filterFleetMeasurements, fleetMeasurementCoverage, fleetStatisticsCsv } from "../data/fleetStatistics";
import { modelLabel } from "../data/unitSelectors";
import { Icon } from "./Icon";

const formatValue = (item) => typeof item.value === "number"
  ? `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(item.value)} ${item.unit}`
  : item.value;

export function FleetStatistics({ onNavigate }) {
  const { dataset, units, loading } = useFleetData();
  const [filters, setFilters] = useState({ from: "2024-01-01", to: "2026-12-31", unitId: "", metric: "", source: "" });
  const rows = useMemo(() => dataset ? buildFleetMeasurements(dataset) : [], [dataset]);
  const filtered = useMemo(() => filterFleetMeasurements(rows, filters), [rows, filters]);
  const coverage = useMemo(() => fleetMeasurementCoverage(filtered, units), [filtered, units]);
  const exportCsv = () => {
    const blob = new Blob([fleetStatisticsCsv(filtered, units)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fleet-statistik-maalinger.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser statistik …</p></main>;
  return <main className="workspace-page fleet-statistics-page" id="main-content">
    <header className="page-heading-row"><div><span className="eyebrow">FLEET · målinger og datadækning</span><h1>Køretøjs- og driftsstatistik</h1><p>Visningen bruger kun registrerede målinger og viser kilde og datatype for hver række.</p></div><div className="page-actions"><button className="secondary-button" type="button" onClick={() => onNavigate("/oekonomi")}><Icon name="economy" />Økonomi</button><button className="primary-button" type="button" onClick={exportCsv} disabled={!filtered.length}><Icon name="download" />CSV-eksport</button></div></header>
    <section className={`statistics-connection ${coverage.connectionState}`} role="status"><Icon name="info" /><div><strong>OBD er ikke tilsluttet</strong><p>Der er ingen valideret OBD-kilde i denne version. Syntetiske og manuelle målinger er mærket og må ikke læses som live telematik.</p></div></section>
    <section className="statistics-filterbar"><label>Fra<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label><label>Til<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label><label>Enhed<select value={filters.unitId} onChange={(event) => setFilters({ ...filters, unitId: event.target.value })}><option value="">Alle enheder</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.number} · {modelLabel(unit)}</option>)}</select></label><label>Måling<select value={filters.metric} onChange={(event) => setFilters({ ...filters, metric: event.target.value })}><option value="">Alle understøttede</option>{Object.entries(FLEET_METRICS).map(([key, metric]) => <option key={key} value={key}>{metric.label}</option>)}</select></label><label>Datakilde<select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">Alle kilder</option><option value="synthetic">Syntetiske data</option><option value="local">Lokale / manuelle</option><option value="connected">Tilsluttede kilder</option></select></label></section>
    <section className="statistics-kpis"><article><small>Målinger i udsnittet</small><strong>{coverage.measurementCount}</strong><span>Kun felter med registreret værdi</span></article><article><small>Enheder med data</small><strong>{coverage.unitCount} / {coverage.totalUnits}</strong><span>Manglende data tæller ikke som nul</span></article><article><small>Syntetiske målinger</small><strong>{coverage.syntheticCount}</strong><span>Tydeligt adskilt fra lokale registreringer</span></article><article><small>Tilsluttede målinger</small><strong>{coverage.connectedCount}</strong><span>Ingen OBD-kilde er aktiveret</span></article></section>
    <section className="statistics-source-card"><header><div><h2>Datadækning</h2><p>{coverage.firstObservedAt ? `${coverage.firstObservedAt.slice(0, 10)} – ${coverage.lastObservedAt.slice(0, 10)}` : "Ingen data i den valgte periode"}</p></div><span>{coverage.sources.length ? coverage.sources.join(" · ") : "Ingen kilder"}</span></header></section>
    <section className="economy-table-card statistics-table"><header><div><h2>Registrerede målinger</h2><p>Ikke understøttede målinger opfindes ikke og vises derfor ikke.</p></div><span>{filtered.length} rækker</span></header><div className="table-scroll"><table><thead><tr><th>Tidspunkt</th><th>Enhed</th><th>Måling</th><th>Værdi</th><th>Kilde</th><th>Datatype</th></tr></thead><tbody>{filtered.map((item) => { const unit = units.find((candidate) => candidate.id === item.unitId); return <tr key={item.id}><td>{new Date(item.observedAt).toLocaleString("da-DK")}</td><td><button type="button" onClick={() => onNavigate(`/enheder/${item.unitId}`)}><strong>{unit?.number || "Ukendt"}</strong><small>{unit ? modelLabel(unit) : item.unitId}</small></button></td><td>{FLEET_METRICS[item.metric]?.label || item.metric}</td><td>{formatValue(item)}{item.label ? <small>{item.label}</small> : null}</td><td>{item.sourceLabel}</td><td><span className={`measurement-kind ${item.synthetic ? "synthetic" : item.connected ? "connected" : "local"}`}>{item.synthetic ? "Syntetisk" : item.connected ? "Tilsluttet" : "Lokal / manuel"}</span></td></tr>; })}</tbody></table></div></section>
  </main>;
}
