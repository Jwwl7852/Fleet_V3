import { useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { CASE_PRIORITIES, DEMO_ACTORS } from "../data/caseWorkflow";
import { WORKSHOP_TASK_STATUSES } from "../data/workshopWorkflow";
import { formatCurrency, modelLabel } from "../data/unitSelectors";
import { Icon } from "./Icon";
import { WorkshopTaskCreator } from "./WorkshopTaskCreator";

const dateTime = (value) => value ? new Date(value).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Ikke booket";
const actorName = (id) => DEMO_ACTORS.find((item) => item.id === id)?.name || "Ikke tildelt";

export function WorkshopOverview({ onNavigate }) {
  const { units, relations, loading, createWorkshopTask } = useFleetData();
  const [filters, setFilters] = useState({ query: "", status: "", workshopId: "", unitId: "", priority: "" });
  const [createFor, setCreateFor] = useState(null);
  const tasks = relations.workshopTasks || [];
  const bookings = relations.bookings || [];
  const reports = relations.reports || [];
  const cases = relations.cases || [];
  const filtered = useMemo(() => tasks.filter((task) => {
    const unit = units.find((item) => item.id === task.unitId);
    const report = reports.find((item) => item.id === task.reportId);
    const query = filters.query.trim().toLocaleLowerCase("da-DK");
    const haystack = [task.number, task.title, unit?.number, unit?.make, unit?.model, report?.title].filter(Boolean).join(" ").toLocaleLowerCase("da-DK");
    return (!query || haystack.includes(query)) && (!filters.status || task.status === filters.status) && (!filters.workshopId || task.workshopId === filters.workshopId) && (!filters.unitId || task.unitId === filters.unitId) && (!filters.priority || task.priority === filters.priority);
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [tasks, units, reports, filters]);
  const readyCases = cases.filter((item) => item.status === "ready" && !tasks.some((task) => task.caseId === item.id && !["completed", "cancelled"].includes(task.status)));
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser Værksted …</p></main>;
  const selectedCase = cases.find((item) => item.id === createFor);
  return <main className="workspace-page workshop-page" id="main-content">
    <header className="page-heading-row"><div><span className="eyebrow">FLEET v2 · lokale værkstedsdata</span><h1>Værksted</h1><p>Følg opgaver fra klar sag til udført arbejde og registrerede omkostninger.</p></div><div className="page-actions"><button className="secondary-button" type="button" onClick={() => onNavigate("/vaerksted/kalender")}><Icon name="service" size={17} />Værkstedskalender</button>{readyCases.length ? <button className="primary-button" type="button" onClick={() => setCreateFor(readyCases[0].id)}><Icon name="plus" size={17} />Ny værkstedsopgave</button> : null}</div></header>
    <section className="workshop-kpis">
      <article><span>Aktive opgaver</span><strong>{tasks.filter((item) => !["completed", "cancelled"].includes(item.status)).length}</strong><small>lokale opgaver</small></article>
      <article><span>Booket</span><strong>{tasks.filter((item) => item.status === "booked").length}</strong><small>kommende tider</small></article>
      <article><span>I arbejde</span><strong>{tasks.filter((item) => ["in_progress", "waiting_parts"].includes(item.status)).length}</strong><small>fysisk på værksted</small></article>
      <article><span>Faktisk omkostning</span><strong>{formatCurrency.format(tasks.reduce((sum, item) => sum + (item.actualCost || 0), 0))}</strong><small>ekskl. moms · ikke estimater</small></article>
    </section>
    <section className="workshop-toolbar"><label className="input-with-icon"><Icon name="search" size={16} /><input aria-label="Søg værkstedsopgaver" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Søg opgave, enhed eller problem …" /></label><select aria-label="Opgavestatus" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Alle statusser</option>{Object.entries(WORKSHOP_TASK_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Værkstedsfilter" value={filters.workshopId} onChange={(event) => setFilters({ ...filters, workshopId: event.target.value })}><option value="">Alle værksteder</option>{(relations.workshops || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Enhedsfilter værksted" value={filters.unitId} onChange={(event) => setFilters({ ...filters, unitId: event.target.value })}><option value="">Alle enheder</option>{units.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select><select aria-label="Prioritetsfilter værksted" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="">Alle prioriteter</option>{Object.entries(CASE_PRIORITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></section>
    {readyCases.length ? <section className="ready-case-strip"><div><Icon name="queue" /><span><strong>{readyCases.length} {readyCases.length === 1 ? "sag er" : "sager er"} klar til værksted</strong><small>Oprettelse sker altid som en eksplicit handling.</small></span></div><select aria-label="Vælg klar sag" value={createFor || ""} onChange={(event) => setCreateFor(event.target.value)}><option value="">Vælg sag …</option>{readyCases.map((item) => <option key={item.id} value={item.id}>{item.number} · {reports.find((report) => report.id === item.reportId)?.title}</option>)}</select></section> : null}
    <section className="workshop-table-shell"><table><thead><tr><th>Opgave</th><th>Enhed</th><th>Sag</th><th>Værksted</th><th>Ansvarlig</th><th>Prioritet</th><th>Status</th><th>Booket tid</th><th>Forventet / faktisk</th></tr></thead><tbody>{filtered.map((task) => { const unit = units.find((item) => item.id === task.unitId); const caseItem = cases.find((item) => item.id === task.caseId); const workshop = relations.workshops.find((item) => item.id === task.workshopId); const booking = bookings.find((item) => item.id === task.bookingId && item.status !== "cancelled"); return <tr key={task.id} onClick={() => onNavigate(`/vaerksted/${task.id}`)}><td><button type="button" onClick={() => onNavigate(`/vaerksted/${task.id}`)}><strong>{task.number}</strong><small>{task.title}</small></button></td><td><strong>{unit?.number}</strong><small>{modelLabel(unit || {})}</small></td><td>{caseItem?.number || "—"}</td><td><strong>{workshop?.name}</strong><small>{workshop?.kind === "internal" ? "Internt" : "Eksternt · lokalt registreret"}</small></td><td>{actorName(task.assigneeId)}</td><td><span className={`priority-pill ${task.priority}`}>{CASE_PRIORITIES[task.priority]}</span></td><td><span className={`workshop-status ${task.status}`}>{WORKSHOP_TASK_STATUSES[task.status]}</span></td><td>{dateTime(booking?.startAt)}<small>{booking ? (booking.status === "confirmed" ? "Bekræftet" : "Ønsket tid") : ""}</small></td><td><span>Est. {task.expectedCost == null ? "Ukendt" : formatCurrency.format(task.expectedCost)}</span><small>Faktisk {task.actualCost == null ? "Ukendt" : formatCurrency.format(task.actualCost)}</small></td></tr>; })}</tbody></table>{!filtered.length ? <div className="empty-list-state"><Icon name="workshop" size={30} /><h2>Ingen opgaver matcher</h2><p>Juster filtrene eller opret en værkstedsopgave fra en sag, der er klar.</p></div> : null}</section>
    {selectedCase ? <WorkshopTaskCreator caseItem={selectedCase} report={reports.find((item) => item.id === selectedCase.reportId)} relations={relations} onCreate={createWorkshopTask} onClose={() => setCreateFor(null)} onNavigate={onNavigate} /> : null}
  </main>;
}
