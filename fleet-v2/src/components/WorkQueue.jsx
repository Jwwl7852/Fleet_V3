import { useEffect, useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { CASE_PRIORITIES, CASE_STATUSES, DEMO_ACTORS, REPORT_TYPES, filterAndSortCases } from "../data/caseWorkflow";
import { modelLabel } from "../data/unitSelectors";
import { CaseActionPanel } from "./CaseActionPanel";
import { Icon } from "./Icon";
import { ManualCaseDialog } from "./ManualCaseDialog";
import { CaseStatusConfirmDialog, needsBackToNewConfirmation } from "./CaseStatusConfirmDialog";
import { CaseFolder } from "./CaseFolder";
import { DraggableDialog } from "./DraggableDialog";

const columns = Object.keys(CASE_STATUSES);
const actorName = (id) => DEMO_ACTORS.find((item) => item.id === id)?.name || "Ikke tildelt";
const dateOnly = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "Ingen frist";
function CaseCard({ item, report, unit, onOpen }) {
  return <article className={`queue-card priority-${item.priority}`}>
    <button className="queue-card-main" type="button" onClick={onOpen}><span><Icon name="unit" size={15} />{item.number}</span><strong>{report?.title || item.title || "Manuel sag"}</strong><small>{unit?.number} · {modelLabel(unit || {})}</small><div><span className={`priority-pill ${item.priority}`}>{CASE_PRIORITIES[item.priority]}</span><span>{item.readOnly ? "Serverstyret" : actorName(item.assigneeId)}</span></div><footer><span><Icon name="clock" size={12} />{dateOnly(item.dueDate)}</span><span>{report ? REPORT_TYPES[report.type] : item.serviceRequirementId ? "Servicekrav" : "Manuel sag"}</span></footer></button>
  </article>;
}

export function WorkQueue({ caseId, onNavigate }) {
  const { units, relations, loading, updateCase, createManualCase, serverProjectionError } = useFleetData();
  const [view, setView] = useState("kanban");
  const [filters, setFilters] = useState({ query: "", status: "", priority: "", assigneeId: "", sort: "priority" });
  const [quickError, setQuickError] = useState("");
  const [creatingManual, setCreatingManual] = useState(false);
  const [pendingBackToNew, setPendingBackToNew] = useState(null);
  const [dialogDirty, setDialogDirty] = useState(false);
  useEffect(() => setDialogDirty(false), [caseId]);
  const reports = relations.reports || [];
  const cases = relations.cases || [];
  const filtered = useMemo(() => filterAndSortCases(cases, reports, units, filters), [cases, reports, units, filters]);
  const selected = cases.find((item) => item.id === caseId);
  const selectedReport = reports.find((item) => item.id === selected?.reportId);
  const quickMove = async (item, status) => {
    if (status === item.status) return;
    if (needsBackToNewConfirmation(item, status)) { setPendingBackToNew(item); return; }
    setQuickError("");
    try {
      if (["completed", "rejected"].includes(status) || ["completed", "rejected"].includes(item.status)) throw new Error("Afslutning, afvisning og genåbning kræver detaljer. Åbn sagen.");
      await updateCase(item.id, { status, expectedStatus: item.status }, DEMO_ACTORS[1]);
    } catch (error) { setQuickError(error.message); }
  };
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser Arbejdskø …</p></main>;
  if (caseId && !selected) return <main className="workspace-page not-found-state" id="main-content"><Icon name="warning" size={38} /><span className="eyebrow">FLEET v2</span><h1>Sagen findes ikke</h1><p>ID’et <code>{caseId}</code> findes ikke i de tilgængelige data.</p><button className="primary-button" type="button" onClick={() => onNavigate("/arbejdsko")}>Tilbage til Arbejdskø</button></main>;
  return <main className="workspace-page queue-page" id="main-content">
    <header className="page-heading-row"><div><span className="eyebrow">FLEET v2 · fælles sager og servicevarsler</span><h1>Arbejdskø</h1><p>Vedligeholdelsessager fra indberetning til endelig lukning i sagsmappen.</p></div><div className="page-actions"><button className="secondary-button" type="button" onClick={() => setCreatingManual(true)}><Icon name="plus" size={15} />Manuel sag</button><div className="view-switch"><button aria-pressed={view === "kanban"} onClick={() => setView("kanban")} type="button"><Icon name="grid" size={16} />Kanban</button><button aria-pressed={view === "table"} onClick={() => setView("table")} type="button"><Icon name="table" size={16} />Tabel</button></div></div></header>
    {serverProjectionError ? <div className="form-alert danger" role="alert">Serverens servicesager kunne ikke indlæses. Lokale sager vises fortsat adskilt.</div> : null}
    <section className="queue-kpis"><article><span>Samlede sager</span><strong>{cases.length}</strong></article><article><span>Kræver handling</span><strong>{cases.filter((item) => ["new","assessing"].includes(item.status)).length}</strong></article><article><span>Klar til værksted</span><strong>{cases.filter((item) => item.status === "ready").length}</strong></article><article><span>Spærrede enheder</span><strong>{reports.filter((report) => report.usability === "blocked" && !cases.find((item) => item.reportId === report.id)?.blockReleasedAt).length}</strong></article></section>
    <section className="queue-toolbar"><label className="input-with-icon"><Icon name="search" size={16} /><input aria-label="Søg i sager" value={filters.query} onChange={(event) => setFilters({...filters,query:event.target.value})} placeholder="Søg i sager …" /></label><select aria-label="Køstatus" value={filters.status} onChange={(event) => setFilters({...filters,status:event.target.value})}><option value="">Alle statusser</option>{Object.entries(CASE_STATUSES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Køprioritet" value={filters.priority} onChange={(event) => setFilters({...filters,priority:event.target.value})}><option value="">Alle prioriteter</option>{Object.entries(CASE_PRIORITIES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Køansvarlig" value={filters.assigneeId} onChange={(event) => setFilters({...filters,assigneeId:event.target.value})}><option value="">Alle ansvarlige</option>{DEMO_ACTORS.slice(1).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Sortering af sager" value={filters.sort} onChange={(event) => setFilters({...filters,sort:event.target.value})}><option value="priority">Prioritet</option><option value="created">Oprettet</option><option value="due">Frist</option></select></section>
    {quickError ? <div className="form-alert warning" role="status">{quickError}</div> : null}
    {view === "kanban" ? <section className="kanban-board" aria-label="Kanbanvisning">{columns.map((status) => <section className={`kanban-column status-${status}`} key={status}><header><h2>{CASE_STATUSES[status]}</h2><span>{filtered.filter((item) => item.status === status).length}</span></header><div>{filtered.filter((item) => item.status === status).map((item) => <CaseCard key={item.id} item={item} report={reports.find((entry) => entry.id === item.reportId)} unit={units.find((entry) => entry.id === item.unitId)} onOpen={() => onNavigate(`/arbejdsko/${item.id}`)} />)}</div></section>)}</section> : <section className="queue-table-shell"><table><thead><tr><th>Sag</th><th>Enhed</th><th>Problem</th><th>Prioritet</th><th>Status</th><th>Ansvarlig</th><th>Frist</th><th>Handling</th></tr></thead><tbody>{filtered.map((item) => { const report = reports.find((entry) => entry.id === item.reportId); const unit = units.find((entry) => entry.id === item.unitId); return <tr key={item.id}><td><button type="button" onClick={() => onNavigate(`/arbejdsko/${item.id}`)}>{item.number}</button></td><td>{unit?.number}</td><td>{report?.title || item.title || "Manuel sag"}</td><td>{CASE_PRIORITIES[item.priority]}</td><td>{CASE_STATUSES[item.status]}</td><td>{item.readOnly ? "Serverstyret" : actorName(item.assigneeId)}</td><td>{dateOnly(item.dueDate)}</td><td>{item.readOnly ? <span className="integration-badge">Serverstyret</span> : <select aria-label={`Flyt ${item.number}`} value={item.status} onChange={(event) => quickMove(item,event.target.value)}>{columns.map((status) => <option key={status} value={status}>{CASE_STATUSES[status]}</option>)}</select>}</td></tr>; })}</tbody></table></section>}
    {selected && selected.status === "new" ? <DraggableDialog title={`${selected.number} · ${selectedReport?.title || selected.title || "Ny indberetning"}`} description={`${units.find((item) => item.id === selected.unitId)?.number} · ${CASE_STATUSES[selected.status]}`} draggable confirmClose={dialogDirty} onClose={() => onNavigate("/arbejdsko")}>
      <div className="queue-report-dialog-grid"><section className="folder-card queue-report-summary"><span className="eyebrow">{selectedReport?.number || "Manuel sag"}</span><h3>{selectedReport?.title || selected.title || "Ny indberetning"}</h3><p>{selectedReport?.description || selected.description || "Ingen beskrivelse."}</p><dl className="detail-list"><div><dt>Enhed</dt><dd>{units.find((item) => item.id === selected.unitId)?.number}</dd></div><div><dt>Type</dt><dd>{selectedReport ? REPORT_TYPES[selectedReport.type] : "Manuel sag"}</dd></div><div><dt>Næste handling</dt><dd>{selected.nextAction}</dd></div></dl><div className="case-workflow-actions"><button className="secondary-button" type="button" onClick={() => onNavigate(`/sager/${selected.id}`)}>Åbn samlet sagsmappe</button>{selected.reportId ? <button className="secondary-button" type="button" onClick={() => onNavigate(`/indberetninger/${selected.reportId}`)}>Åbn oprindelig indberetning</button> : null}</div></section><CaseActionPanel caseItem={selected} report={selectedReport} onUpdate={updateCase} compact onDirtyChange={setDialogDirty} /></div>
    </DraggableDialog> : null}
    {selected && selected.status !== "new" ? <DraggableDialog title={`${selected.reference} · ${selected.number}`} description={selectedReport?.title || selected.title || "Sagsmappe"} wide confirmClose={dialogDirty} onClose={() => onNavigate("/arbejdsko")}><CaseFolder caseId={selected.id} onNavigate={onNavigate} dialog onDirtyChange={setDialogDirty} /></DraggableDialog> : null}
    {creatingManual ? <ManualCaseDialog units={units} onCreate={createManualCase} onClose={() => setCreatingManual(false)} onNavigate={onNavigate} /> : null}
    {pendingBackToNew ? <CaseStatusConfirmDialog caseItem={pendingBackToNew} onCancel={() => setPendingBackToNew(null)} onConfirm={async () => { try { setQuickError(""); await updateCase(pendingBackToNew.id, { status: "new", expectedStatus: "assessing" }, DEMO_ACTORS[1]); setPendingBackToNew(null); } catch (error) { setQuickError(error.message); setPendingBackToNew(null); } }} /> : null}
  </main>;
}
