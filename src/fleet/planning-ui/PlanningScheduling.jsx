import { useEffect, useMemo, useState } from "react";
import {
  PLANSTATUS, fjernPlacering, markerPlanlagtOgTilfoejBesked,
  placerForeloebigt, registrerAendringOensket,
} from "../planning-scheduling/index.js";
import PlanningWorkPanel from "./PlanningWorkPanel.jsx";
import PlanningFlexibleScheduling from "./PlanningFlexibleScheduling.jsx";

const DAYS = [
  ["2032-09-13", "Mandag", "13. sep."], ["2032-09-14", "Tirsdag", "14. sep."], ["2032-09-15", "Onsdag", "15. sep."],
  ["2032-09-16", "Torsdag", "16. sep."], ["2032-09-17", "Fredag", "17. sep."], ["2032-09-18", "Lørdag", "18. sep."], ["2032-09-19", "Søndag", "19. sep."],
];
const VIEW_LABELS = { rute: "Ruter", medarbejder: "Medarbejdere", koeretoej: "Køretøjer" };
const STATUS_LABELS = { I_KOE: "I kø", FORELOEBIG: "Foreløbig", PLANLAGT: "Planlagt", AENDRING_OENSKET: "Ændring ønsket" };
const MONTHS = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
const shiftDate = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const shortDate = (value) => {
  const [, month, day] = value.split("-").map(Number);
  return `${day}. ${MONTHS[month - 1]}`;
};
const formatEndTime = (startTime, durationMin) => {
  const [hours, minutes] = startTime.split(":").map(Number);
  const total = hours * 60 + minutes + durationMin;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

function PlacementPicker({ pending, task, findings, onChange, onCancel, onDismiss, onConfirm }) {
  return <section className="ps-time-picker" aria-label="Vælg tidspunkt for foreløbig placering">
    <header><div><span className="pu-eyebrow">{pending.placementId ? "Redigér placering" : "Foreløbig placering"}</span><h3>{task.name}</h3></div><button type="button" aria-label="Luk tidsvælger" onClick={onDismiss}>×</button></header>
    <div className="ps-picker-grid"><label>Dato<input type="date" value={pending.date} onChange={(event) => onChange({ ...pending, date: event.target.value })}/></label><label>Starttid<input type="time" value={pending.startTime} onChange={(event) => onChange({ ...pending, startTime: event.target.value })}/></label><label>Varighed<input type="number" min="5" step="5" value={pending.durationMin} onChange={(event) => onChange({ ...pending, durationMin: Number(event.target.value) })}/></label><label>Ressource<input value={pending.resourceLabel} readOnly/></label></div>
    {findings.length > 0 && <div className="ps-findings" role="alert">{findings.map((finding) => <span key={finding.code}>{finding.text}</span>)}</div>}
    <footer><button type="button" className="pu-btn pu-btn-quiet" onClick={onCancel}>Annuller</button><button type="button" className="pu-btn pu-btn-primary" onClick={onConfirm}>{pending.placementId ? "Gem ny placering" : "Placér foreløbigt"}</button></footer>
  </section>;
}

function TaskWorkspace({ task, placement, pending, pickerOpen, findings, activeTab, onTabChange, onClose, onOpenNewTab, onPlanned, onChangeRequest, onMove, onRemove, onPendingChange, onCancelPending, onDismissPicker, onResumePicker, onConfirm }) {
  return <section className="ps-task-workspace" data-active-task-id={task.id} aria-label={`Opgaveområde for ${task.name}`}>
    <header className="ps-task-workspace-heading"><div><span className="pu-eyebrow">Aktiv opgave · {task.id}</span><h2>{task.name}</h2><p>{task.customer} · {task.stopCount} stop</p></div><div><button type="button" className="pu-btn pu-btn-quiet" onClick={onOpenNewTab}>Åbn i ny fane</button><button type="button" className="pu-btn pu-btn-quiet" onClick={onClose}>Luk opgave ×</button></div></header>
    <div className="ps-task-tabs" role="tablist" aria-label="Opgaveområde">
      {[['placering', 'Placering'], ['detaljer', 'Opgavedetaljer'], ['traad', 'Bestillingstråd']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => onTabChange(id)}>{label}</button>)}
    </div>
    <div className="ps-task-tab-content">
      {activeTab === "placering" && <section role="tabpanel" className="ps-placement-tab">
        {placement ? <article className="ps-current-placement" data-warning={placement.warning}><strong>{placement.final ? "Planlagt tid" : placement.warning ? "Tidligere, ikke-endelig reservation" : "Foreløbig reservation"}</strong><span>{placement.date} · {placement.startTime} · {placement.durationMin} min. + {placement.returnTravelMin} min. returkørsel</span></article> : <p className="pu-help">Opgaven er ikke placeret. Vælg opgaven og klik i den ønskede dato- og ressourcecelle.</p>}
        {pending?.taskId === task.id && pickerOpen && <PlacementPicker pending={pending} task={task} findings={findings} onChange={onPendingChange} onCancel={onCancelPending} onDismiss={onDismissPicker} onConfirm={onConfirm}/>} 
        {pending?.taskId === task.id && !pickerOpen && <div className="ps-placement-draft"><div><strong>Placering er under redigering</strong><span>{pending.date} · {pending.startTime} · {pending.resourceLabel}</span></div><button type="button" className="pu-btn pu-btn-quiet" onClick={onResumePicker}>Fortsæt placering</button></div>}
        <div className="ps-inline-actions"><button type="button" className="pu-btn pu-btn-quiet" disabled={!placement} onClick={onRemove}>Fjern fra kalender</button><button type="button" className="pu-btn pu-btn-quiet" disabled={!placement} onClick={onMove}>Flyt placering</button><button type="button" className="pu-btn pu-btn-primary" disabled={!placement || placement.final} onClick={onPlanned}>Markér planlagt og send besked</button></div>
      </section>}
      {activeTab === "detaljer" && <section role="tabpanel" className="ps-task-details"><div className="ps-task-summary"><span className="pu-badge" data-tone={task.status === PLANSTATUS.AENDRING_OENSKET ? "warn" : "neutral"}>{STATUS_LABELS[task.status]}</span><dl><div><dt>Bestiller</dt><dd>{task.customer}</dd></div><div><dt>Tilladt periode</dt><dd>{task.allowedFrom} – {task.allowedTo}</dd></div><div><dt>Tidsvindue</dt><dd>{task.timeWindow ? `${task.timeWindow.from}–${task.timeWindow.to}` : "Fleksibelt"}</dd></div><div><dt>Varighed</dt><dd>{task.durationMin} min.</dd></div></dl></div><div className="ps-task-stops"><h3>Stop i opgaven</h3>{task.stops.map((stop) => <article key={stop.id}><b>{stop.order}</b><div><strong>{stop.name}</strong><small>{stop.id} · {stop.type}</small></div></article>)}</div></section>}
      {activeTab === "traad" && <section role="tabpanel"><section className="ps-thread"><h3>Samlet lokal bestillingstråd</h3>{task.thread.map((entry) => <article key={entry.id} data-kind={entry.kind}><small>{entry.timestamp} · {entry.kind.replaceAll("_", " ")}</small><p>{entry.text}</p></article>)}</section><div className="ps-inline-actions"><button type="button" className="pu-btn pu-btn-quiet" onClick={onChangeRequest}>Simulér ændringsønske</button><button type="button" className="pu-btn pu-btn-primary" disabled={!placement || placement.final} onClick={onPlanned}>Markér planlagt og send besked</button></div><p className="pu-help">Lokal prototype: intet sendes eksternt. Rigtig afsendelse skal senere bruge den kanal, bestillingen kom fra.</p></section>}
    </div>
  </section>;
}

function MultiDayPanel({ route, onClose, onLive }) {
  return <PlanningWorkPanel title={route.name} eyebrow="Samlet ugeprogram" onClose={onClose} actions={<button type="button" className="pu-btn pu-btn-primary" onClick={onLive}>Gå til dagens del i Livekalenderen</button>}>
    <div className="ps-multiday-summary"><strong>{route.completedStops} af {route.totalStops} stop udført</strong><span>Næste stop: {route.nextStop}</span><span>Afvigelse: +{route.delayMin} min.</span><span>{route.vehicle} · {route.crew}</span></div>
    <div className="ps-week-program">{route.days.map((day) => <section key={day.date}><header><strong>{day.date}</strong><span>{day.overnight}</span></header>{day.stops.map((stop) => <article key={stop.id} data-status={stop.status}><b>{stop.order}</b><div><strong>{stop.name}</strong><small>Planlagt {stop.planned}{stop.actual ? ` · faktisk ${stop.actual}` : ""}</small></div><span>{stop.status}</span></article>)}</section>)}</div>
  </PlanningWorkPanel>;
}

export function LegacyPlanningScheduling({ state, setState, onOpenLive, calendarOnly = false }) {
  const [view, setView] = useState("rute");
  const [weekOffset, setWeekOffset] = useState(0);
  const queryTaskId = useMemo(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("taskId"), []);
  const [activeTaskId, setActiveTaskId] = useState(() => queryTaskId || state.selectedTaskId || null);
  const [activeTaskTab, setActiveTaskTab] = useState(queryTaskId ? "detaljer" : "placering");
  const [placementDrafts, setPlacementDrafts] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [findings, setFindings] = useState([]);
  const [multiDayId, setMultiDayId] = useState(null);
  const [filter, setFilter] = useState({ type: "ALLE", resource: "ALLE", flexible: "ALLE", status: "ALLE" });
  const [message, setMessage] = useState(calendarOnly ? "Separat lokal kalender · synkroniseret uden server" : "");
  const weekDays = useMemo(() => DAYS.map(([, day], index) => {
    const date = shiftDate("2032-09-13", weekOffset * 7 + index);
    return [date, day, shortDate(date)];
  }), [weekOffset]);
  const resources = state.resources.filter((resource) => resource.type === view);
  const queue = state.tasks.filter((task) => task.status === PLANSTATUS.I_KOE || task.status === PLANSTATUS.AENDRING_OENSKET).filter((task) => filter.type === "ALLE" || task.type === filter.type).filter((task) => filter.flexible === "ALLE" || String(task.flexible) === filter.flexible).filter((task) => filter.status === "ALLE" || task.status === filter.status).filter((task) => filter.resource === "ALLE" || task.requiredSkill === filter.resource || task.requiredVehicleType === filter.resource);
  const activeTask = state.tasks.find((task) => task.id === activeTaskId);
  const activePlacement = state.placements.find((placement) => placement.taskId === activeTaskId);
  const pending = activeTaskId ? placementDrafts[activeTaskId] || null : null;
  const multiDay = state.multiDayRoutes.find((route) => route.id === multiDayId);
  const update = (next) => { setState(typeof next === "function" ? next : () => next); };
  const selectTask = (taskId) => {
    setActiveTaskId(taskId);
    update((current) => current.selectedTaskId === taskId ? current : { ...current, selectedTaskId: taskId, revision: current.revision + 1 });
  };
  const openTaskWorkspace = (taskId, tab = "detaljer") => {
    selectTask(taskId);
    setMultiDayId(null);
    setActiveTaskTab(tab);
    setFindings([]);
  };
  const openMultiDayPanel = (routeId) => {
    setActiveTaskId(null);
    update((current) => current.selectedTaskId == null ? current : { ...current, selectedTaskId: null, revision: current.revision + 1 });
    setMultiDayId(routeId);
  };
  useEffect(() => {
    if (state.selectedTaskId !== activeTaskId) setActiveTaskId(state.selectedTaskId || null);
  }, [state.selectedTaskId]);
  useEffect(() => {
    const closeWithEscape = (event) => {
      if (event.key !== "Escape" || multiDayId) return;
      if (pickerOpen) { setPickerOpen(false); return; }
      if (activeTaskId) {
        setActiveTaskId(null);
        update((current) => ({ ...current, selectedTaskId: null, revision: current.revision + 1 }));
      }
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [activeTaskId, pickerOpen, multiDayId]);
  const beginPlacement = (taskId, date, resource) => {
    const task = state.tasks.find((item) => item.id === taskId); if (!task) return;
    const existing = state.placements.find((item) => item.taskId === taskId);
    const draft = { taskId, date, resourceType: resource.type, resourceId: resource.id, resourceLabel: resource.label, startTime: existing?.startTime || task.timeWindow?.from || "09:00", durationMin: existing?.durationMin || task.durationMin, ...(existing ? { placementId: existing.id } : {}) };
    openTaskWorkspace(taskId, "placering"); setPickerOpen(true); setPlacementDrafts((current) => ({ ...current, [taskId]: draft }));
  };
  const confirmPlacement = () => {
    const usedIds = new Set(state.placements.map((item) => item.id));
    let nextNumber = 1;
    while (usedIds.has(`week-placement-${nextNumber}`)) nextNumber += 1;
    const result = placerForeloebigt(state, pending, { placementId: pending.placementId || `week-placement-${nextNumber}`, timestamp: "13.09.2032 · 09:42" });
    if (!result.ok) { setFindings(result.findings); return; }
    update(result.state); setActiveTaskId(pending.taskId); setActiveTaskTab("placering"); setPlacementDrafts((current) => { const next = { ...current }; delete next[pending.taskId]; return next; }); setPickerOpen(false); setFindings([]); setMessage(pending.placementId ? "Placeringen er flyttet lokalt og er igen foreløbig." : "Opgaven er placeret foreløbigt i den lokale ugeplan.");
  };
  const openWindow = (query) => {
    const destination = new URL("planning-demo.html", window.location.href);
    destination.search = query;
    const opened = window.open(destination.href, "_blank");
    if (opened) opened.opener = null;
    setMessage(opened ? "Den lokale Planning-visning blev åbnet i en ny fane eller et nyt vindue." : "Browseren blokerede åbningen. Tillad lokale popups og prøv igen.");
  };
  const markPlanned = () => {
    if (!activePlacement || !activeTask) return;
    const result = markerPlanlagtOgTilfoejBesked(state, activePlacement.id, { timestamp: "13.09.2032 · 10:05", messageId: `thread-plan-${activeTask.id}` });
    if (result.ok) { update(result.state); setMessage("Planlagt lokalt · intet er sendt eksternt."); }
  };
  const requestChange = () => {
    if (!activeTask) return;
    const result = registrerAendringOensket(state, activeTask.id, { timestamp: "13.09.2032 · 10:16", messageId: `thread-change-${activeTask.id}`, text: "Tidspunktet passer ikke. Kan det blive torsdag efter kl. 13?" });
    if (result.ok) { update(result.state); setMessage("Ændringsønske tilføjet lokalt. Den tidligere reservation er ikke endelig."); }
  };
  const movePlacement = () => {
    if (!activePlacement) return;
    const resource = state.resources.find((item) => item.id === activePlacement.resourceId && item.type === activePlacement.resourceType);
    setPlacementDrafts((current) => ({ ...current, [activeTask.id]: { ...activePlacement, placementId: activePlacement.id, resourceLabel: resource?.label || activePlacement.resourceId } }));
    setFindings([]); setPickerOpen(true); setActiveTaskTab("placering"); setMessage("Vælg en ny dato, ressource eller tid, og bekræft flytningen.");
  };
  const removePlacement = () => {
    if (!activePlacement) return;
    update(fjernPlacering(state, activePlacement.id)); setPlacementDrafts((current) => { const next = { ...current }; delete next[activeTask.id]; return next; }); setPickerOpen(false); setMessage("Placeringen er fjernet. Opgaven er tilbage i planlægningskøen.");
  };
  const closeTaskWorkspace = () => {
    setActiveTaskId(null);
    update((current) => current.selectedTaskId == null ? current : { ...current, selectedTaskId: null, revision: current.revision + 1 });
  };
  const placementsForCell = (date, resource) => state.placements.filter((placement) => placement.date === date && placement.resourceId === resource.id && placement.resourceType === resource.type).sort((left, right) => left.startTime.localeCompare(right.startTime) || left.id.localeCompare(right.id));
  const counts = useMemo(() => ({ queue: queue.length, placed: state.placements.length, planned: state.placements.filter((item) => item.final).length }), [queue.length, state.placements]);
  return <div className={`pu-view ps-view${calendarOnly ? " ps-calendar-only" : ""}`} data-view="planlaegning">
    <header className="ps-heading"><div><span className="pu-eyebrow">Fremtidig disponering · lokal prototype</span><h1>Planlægning</h1><p>Uge 38 · 13.–19. september 2032 · ingen backend eller ekstern kommunikation</p></div><div className="ps-heading-actions"><button type="button" className="pu-btn pu-btn-quiet" onClick={() => openWindow("view=planlaegning&calendarOnly=1")}>Åbn kalender i nyt vindue</button><button type="button" className="pu-btn pu-btn-quiet" onClick={() => update(state => ({ ...state, placements: [], tasks: state.tasks.map((task) => ({ ...task, status: PLANSTATUS.I_KOE })), revision: state.revision + 1 }))}>Nulstil ugeplan</button></div></header>
    {message && <div className="ps-local-message" role="status">{message}</div>}
    <div className="ps-summary"><span><strong>{counts.queue}</strong> i kø</span><span><strong>{counts.placed}</strong> placeret</span><span><strong>{counts.planned}</strong> planlagt</span><span>Syntetiske ugefixtures</span></div>
    <div className="ps-layout">
      {!calendarOnly && <aside className="ps-queue" aria-label="Planlægningskø"><header><div><h2>Planlægningskø</h2><span>{queue.length} opgaver</span></div><div className="ps-filters"><label>Type<select value={filter.type} onChange={(event) => setFilter({ ...filter, type: event.target.value })}><option>ALLE</option><option>SERVICE</option><option>BESOEG</option><option>TRANSPORT</option><option>LEVERING</option></select></label><label>Ressource<select value={filter.resource} onChange={(event) => setFilter({ ...filter, resource: event.target.value })}><option>ALLE</option><option>SERVICE</option><option>PLEJE</option><option>VAREBIL</option><option>LASTBIL</option></select></label><label>Fleksibilitet<select value={filter.flexible} onChange={(event) => setFilter({ ...filter, flexible: event.target.value })}><option value="ALLE">Alle</option><option value="true">Fleksibel</option><option value="false">Fast periode</option></select></label><label>Status<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="ALLE">Alle</option><option value={PLANSTATUS.I_KOE}>I kø</option><option value={PLANSTATUS.AENDRING_OENSKET}>Ændring ønsket</option></select></label></div></header><div className="ps-queue-list">{queue.map((task) => <article key={task.id} className="ps-task-card" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)} data-selected={activeTaskId === task.id} data-warning={task.status === PLANSTATUS.AENDRING_OENSKET} tabIndex="0" role="button" onClick={() => openTaskWorkspace(task.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTaskWorkspace(task.id); } }}><div><span className="pu-badge" data-tone={task.status === PLANSTATUS.AENDRING_OENSKET ? "warn" : "neutral"}>{STATUS_LABELS[task.status]}</span><strong>{task.name}</strong><small>{task.customer} · {task.stopCount} stop</small></div><dl><div><dt>Periode</dt><dd>{task.allowedFrom.slice(5)}–{task.allowedTo.slice(5)}</dd></div><div><dt>Varighed</dt><dd>{task.durationMin} min.</dd></div><div><dt>Krav</dt><dd>{task.requiredSkill || task.requiredVehicleType || "Ingen"}</dd></div><div><dt>Prioritet</dt><dd>{task.priority}</dd></div></dl><button type="button" className="pu-btn pu-btn-quiet" onClick={(event) => { event.stopPropagation(); openTaskWorkspace(task.id, "placering"); setMessage("Opgave valgt. Klik i den ønskede dato- og ressourcecelle."); }}>Planlæg</button></article>)}</div></aside>}
      <section className="ps-calendar"><header className="ps-calendar-toolbar"><div><button type="button" aria-label="Forrige uge" onClick={() => setWeekOffset((value) => value - 1)}>‹</button><strong>Uge {38 + weekOffset}<small>{weekDays[0][2]}–{weekDays[6][2]} 2032</small></strong><button type="button" aria-label="Næste uge" onClick={() => setWeekOffset((value) => value + 1)}>›</button><button type="button" onClick={() => setWeekOffset(0)}>I dag</button></div><div className="pr-segments">{Object.entries(VIEW_LABELS).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div></header>
        {calendarOnly && activeTask && <div className="ps-selected-task" role="status"><strong>Opgave valgt</strong><span>{activeTask.name} · klik i den ønskede dato- og ressourcecelle</span></div>}
        <div className="ps-week-scroll" aria-label="Ugekalender med vandret rulning"><div className="ps-week-grid" style={{ "--ps-resource-count": resources.length }}><div className="ps-grid-corner">{VIEW_LABELS[view]}</div>{weekDays.map(([date, day, label], index) => <div key={date} className="ps-day-head" data-weekend={index > 4}><strong>{day}</strong><span>{label}</span></div>)}{resources.map((resource) => <div className="ps-resource-row" key={resource.id}><div className="ps-resource-name"><strong>{resource.label}</strong><small>{resource.type}</small></div>{weekDays.map(([date], index) => <div key={date} className="ps-drop-cell" data-weekend={index > 4} data-selected={pending?.date === date && pending?.resourceId === resource.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain"); if (taskId) beginPlacement(taskId, date, resource); }}>{placementsForCell(date, resource).map((placement) => <button type="button" key={placement.id} className="ps-placement" data-status={placement.status} data-warning={placement.warning} data-active={activeTaskId === placement.taskId} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const taskId = event.dataTransfer.getData("text/plain"); if (taskId) beginPlacement(taskId, date, resource); }} onClick={(event) => { event.stopPropagation(); openTaskWorkspace(placement.taskId, "placering"); }}><strong>{placement.startTime}–{formatEndTime(placement.startTime, placement.durationMin)}</strong><span>{placement.taskName}</span><small>{placement.final ? "Planlagt" : placement.warning ? "Ændring ønsket" : "Foreløbig"}</small></button>)}<button type="button" className="ps-drop-action" disabled={!activeTaskId} onClick={(event) => { event.stopPropagation(); if (activeTaskId) beginPlacement(activeTaskId, date, resource); }}>+ Placér opgave</button></div>)}</div>)}</div></div>
        {activeTask && <TaskWorkspace task={activeTask} placement={activePlacement} pending={pending} pickerOpen={pickerOpen} findings={findings} activeTab={activeTaskTab} onTabChange={setActiveTaskTab} onClose={closeTaskWorkspace} onOpenNewTab={() => openWindow(`view=planlaegning&taskId=${encodeURIComponent(activeTask.id)}`)} onPlanned={markPlanned} onChangeRequest={requestChange} onMove={movePlacement} onRemove={removePlacement} onPendingChange={(next) => { setPlacementDrafts((current) => ({ ...current, [activeTask.id]: next })); setFindings([]); }} onCancelPending={() => { setPlacementDrafts((current) => { const next = { ...current }; delete next[activeTask.id]; return next; }); setPickerOpen(false); setFindings([]); }} onDismissPicker={() => setPickerOpen(false)} onResumePicker={() => setPickerOpen(true)} onConfirm={confirmPlacement}/>} 
        <section className="ps-multiday"><header><div><span className="pu-eyebrow">Særskilt ugeforløb</span><h2>Flerdagsruter</h2></div><span>Vises ikke som almindelige dagsopgaver</span></header>{state.multiDayRoutes.map((route) => <div className="ps-multiday-route" key={route.id}><button type="button" className="ps-multiday-bar" onClick={() => openMultiDayPanel(route.id)}><span>Flerdagsrute</span><strong>{route.name}</strong><small>{route.startDate} – {route.endDate} · {route.vehicle} · {route.completedStops}/{route.totalStops} stop</small><b>+{route.delayMin} min.</b></button><div className="ps-multiday-days">{weekDays.map(([date, day]) => { const program = route.days.find((item) => item.date === date); return <div key={date} data-active={Boolean(program)}><small>{day}</small>{program ? <button type="button" onClick={() => openMultiDayPanel(route.id)}><strong>{program.stops.length} stop</strong><span>{program.stops.map((stop) => stop.name).join(" · ")}</span></button> : <span>—</span>}</div>; })}</div></div>)}</section>
      </section>
    </div>
    {multiDay && <MultiDayPanel route={multiDay} onClose={() => setMultiDayId(null)} onLive={() => onOpenLive(multiDay.id)}/>} 
  </div>;
}

export default PlanningFlexibleScheduling;
