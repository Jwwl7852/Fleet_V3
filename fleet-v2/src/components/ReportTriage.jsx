import { useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { CASE_PRIORITIES, CASE_STATUSES, REPORT_TYPES, SEVERITIES, USABILITY, filterAndSortCases } from "../data/caseWorkflow";
import { formatMeter, modelLabel } from "../data/unitSelectors";
import { CaseActionPanel } from "./CaseActionPanel";
import { Icon } from "./Icon";
import { ReportImage } from "./ReportImage";
import { UnitThumbnail } from "./UnitThumbnail";

const dateTime = (value) => new Date(value).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function ReportTriage({ reportId, onNavigate }) {
  const { units, relations, loading, updateCase } = useFleetData();
  const [filters, setFilters] = useState({ query: "", status: "", severity: "", type: "", department: "", unitId: "" });
  const [mobileDetail, setMobileDetail] = useState(Boolean(reportId));
  const [lightbox, setLightbox] = useState(null);
  const reports = relations.reports || [];
  const cases = relations.cases || [];
  const filteredCases = useMemo(() => filterAndSortCases(cases, reports, units, { ...filters, sort: "created" }).filter((item) => reports.some((report) => report.id === item.reportId)), [cases, reports, units, filters]);
  const selectedReport = reports.find((item) => item.id === reportId) || reports.find((item) => item.id === filteredCases[0]?.reportId);
  const selectedCase = cases.find((item) => item.reportId === selectedReport?.id);
  const unit = units.find((item) => item.id === selectedReport?.unitId);
  const events = (relations.caseEvents || []).filter((item) => item.caseId === selectedCase?.id).sort((a,b) => b.at.localeCompare(a.at));
  const select = (report) => { onNavigate(`/indberetninger/${report.id}`); setMobileDetail(true); };
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser indberetninger …</p></main>;
  if (reportId && !reports.some((item) => item.id === reportId)) return <main className="workspace-page not-found-state" id="main-content"><Icon name="warning" size={38} /><span className="eyebrow">FLEET v2 · lokal prototype</span><h1>Indberetningen findes ikke</h1><p>ID’et <code>{reportId}</code> findes ikke i det lokale testdatasæt.</p><button className="primary-button" type="button" onClick={() => onNavigate("/indberetninger")}>Tilbage til Indberetninger</button></main>;

  return <main className={`workspace-page triage-page${mobileDetail ? " mobile-detail" : ""}`} id="main-content">
    <header className="page-heading-row"><div><span className="eyebrow">FLEET v2 · Fiktive demodata</span><h1>Indberetninger og triage</h1><p>Gennemgå, vurder og forbind den oprindelige indberetning med samme sag i Arbejdskø.</p></div><button className="primary-button" type="button" onClick={() => onNavigate("/indberetninger/ny")}><Icon name="plus" size={17} />Ny indberetning</button></header>
    <section className="triage-filters">
      <label className="input-with-icon"><Icon name="search" size={16} /><input aria-label="Søg i indberetninger" value={filters.query} onChange={(event) => setFilters({...filters,query:event.target.value})} placeholder="Søg i indberetninger …" /></label>
      <select aria-label="Statusfilter" value={filters.status} onChange={(event) => setFilters({...filters,status:event.target.value})}><option value="">Alle statusser</option>{Object.entries(CASE_STATUSES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="Alvorlighedsfilter" value={filters.severity} onChange={(event) => setFilters({...filters,severity:event.target.value})}><option value="">Al alvorlighed</option>{Object.entries(SEVERITIES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="Typefilter" value={filters.type} onChange={(event) => setFilters({...filters,type:event.target.value})}><option value="">Alle typer</option>{Object.entries(REPORT_TYPES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="Afdelingsfilter" value={filters.department} onChange={(event) => setFilters({...filters,department:event.target.value})}><option value="">Alle afdelinger</option>{[...new Set(units.map((item) => item.department))].sort().map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Enhedsfilter" value={filters.unitId} onChange={(event) => setFilters({...filters,unitId:event.target.value})}><option value="">Alle enheder</option>{units.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select>
    </section>
    <section className="triage-layout">
      <aside className="triage-list-panel"><header><div><h2>Indberetninger</h2><span>{filteredCases.length} fundet</span></div></header><div className="triage-list">{filteredCases.map((caseItem) => { const report = reports.find((entry) => entry.id === caseItem.reportId); const relatedUnit = units.find((entry) => entry.id === caseItem.unitId); return <button type="button" className={selectedReport?.id === report?.id ? "is-selected" : ""} key={caseItem.id} onClick={() => select(report)}><span className={`severity-mark ${report.severity}`}><Icon name={report.type === "service" ? "service" : "warning"} size={17} /></span><span><strong>{report.title}</strong><small>{relatedUnit?.number} · {REPORT_TYPES[report.type]}</small><em>{report.number} · {dateTime(report.createdAt)}</em></span><span className={`status-badge ${caseItem.status}`}><i />{CASE_STATUSES[caseItem.status]}</span></button>; })}{!filteredCases.length ? <div className="empty-inline"><h3>Ingen indberetninger matcher</h3><p>Tilpas filtrene eller opret en ny indberetning.</p></div> : null}</div></aside>
      <section className="triage-detail-panel">{selectedReport && unit ? <>
        <button className="mobile-back" type="button" onClick={() => setMobileDetail(false)}><Icon name="chevron" size={15} />Tilbage til listen</button>
        <header><div><span className="eyebrow">{selectedReport.number} · {CASE_STATUSES[selectedCase.status]}</span><h2>{selectedReport.title}</h2><p>{unit.number} · {modelLabel(unit)} · {unit.department}</p>{selectedReport.origin === "service_automation" ? <span className="integration-badge">Automatisk oprettet fra Service</span> : null}</div><span className={`priority-pill ${selectedCase.priority}`}>{CASE_PRIORITIES[selectedCase.priority]} prioritet</span></header>
        <div className="report-unit-summary"><UnitThumbnail unit={unit} /><div><strong>{unit.number}</strong><span>{modelLabel(unit)}</span><small>{formatMeter(unit)}</small></div><div className="inline-actions"><button type="button" onClick={() => onNavigate(`/enheder/${unit.id}`)}>Åbn enhed</button><button type="button" onClick={() => onNavigate(`/sager/${selectedCase.id}`)}>Sagsmappe <Icon name="external" size={13} /></button></div></div>
        <div className="original-report"><span className="eyebrow">Oprindelig indberetning · {selectedReport.reporterName}</span><p>{selectedReport.description}</p><dl><div><dt>Type</dt><dd>{REPORT_TYPES[selectedReport.type]}</dd></div><div><dt>Kategori</dt><dd>{selectedReport.category}</dd></div><div><dt>Oplevet alvorlighed</dt><dd>{SEVERITIES[selectedReport.severity]}</dd></div><div><dt>Oplevet anvendelighed</dt><dd>{USABILITY[selectedReport.usability]}</dd></div><div><dt>Målerobservation</dt><dd>{selectedReport.meterObservation?.value?.toLocaleString("da-DK")} {selectedReport.meterObservation?.unit === "hours" ? "t" : "km"}</dd></div></dl></div>
        <section className="report-gallery"><h3>Vedhæftede billeder ({selectedReport.images?.length || 0})</h3>{selectedReport.images?.length ? <div>{selectedReport.images.map((image,index) => <ReportImage image={image} alt={`Billede ${index + 1} til ${selectedReport.number}`} key={image.id} onClick={setLightbox} />)}</div> : <p>Ingen billeder vedhæftet.</p>}</section>
        <section className="case-timeline"><h3>Fælles tidslinje</h3>{events.map((event) => <article key={event.id}><span><Icon name={event.type === "note" ? "document" : "clock"} size={15} /></span><div><strong>{event.title}</strong><p>{event.text}</p><small>{dateTime(event.at)} · {event.actorName}</small></div></article>)}</section>
      </> : <div className="empty-inline"><h2>Vælg en indberetning</h2><p>Detaljer og historik vises her.</p></div>}</section>
      <CaseActionPanel caseItem={selectedCase} report={selectedReport} onUpdate={updateCase} />
    </section>
    {lightbox ? <div className="lightbox" role="dialog" aria-label="Billedvisning"><button type="button" aria-label="Luk billede" onClick={() => setLightbox(null)}><Icon name="close" /></button><ReportImage image={lightbox} alt="Forstørret dokumentationsbillede" /></div> : null}
  </main>;
}
