import { Fragment, useState } from "react";
import { activeLeave, addLocalDays, deduplicateShifts, intervalOverlaps, localDateTimeMs, plannedMinutes, shiftMinutes, shiftsStartingInPeriod, startOfWeek, toLocalDateKey } from "../domain/workforceDomain.js";
import { Card, Field, formatDate, formatHours, formatTime, Modal, Notice, PageHeader } from "./Shared.jsx";

const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

export function SchedulePage({ state, repository, actor, run, busy }) {
  const [week, setWeek] = useState(startOfWeek()); const [workplace, setWorkplace] = useState("all"); const [editing, setEditing] = useState(null); const [copying, setCopying] = useState(false);
  const weekEnd = addLocalDays(week, 7); const employees = state.employees.filter((item) => item.status !== "terminated" && (workplace === "all" || item.workplace === workplace));
  const shifts = deduplicateShifts(state.shifts).filter((item) => item.startMs >= week && item.startMs < weekEnd && item.status !== "cancelled");
  const workplaces = [...new Set(state.employees.map((item) => item.workplace))].sort();
  const weekLabel = `${formatDate(week, { year: true })} – ${formatDate(addLocalDays(week, 6), { year: true })}`;
  const drafts = shifts.filter((item) => item.status === "draft").length;
  return <>
    <PageHeader title="Bemanding" subtitle="Ugeplan for arbejdstider og vagter" actions={<><button className="wf-btn" onClick={() => setCopying(true)}>Kopiér uge</button><button className="wf-btn wf-btn--primary" disabled={!drafts || busy} onClick={() => run(() => repository.publishWeek(actor, week))}>Offentliggør {drafts || ""}</button></>} />
    <Card><div className="wf-schedule-toolbar"><div className="wf-week-nav"><button className="wf-btn" aria-label="Forrige uge" onClick={() => setWeek(addLocalDays(week, -7))}>←</button><button className="wf-btn" onClick={() => setWeek(startOfWeek())}>Denne uge</button><button className="wf-btn" aria-label="Næste uge" onClick={() => setWeek(addLocalDays(week, 7))}>→</button><strong>{weekLabel}</strong></div><select aria-label="Arbejdssted" value={workplace} onChange={(event) => setWorkplace(event.target.value)}><option value="all">Alle arbejdssteder</option>{workplaces.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="wf-plan-legend"><span><i className="wf-legend wf-legend--published" /> Offentliggjort</span><span><i className="wf-legend wf-legend--draft" /> Kladde</span><span><i className="wf-legend wf-legend--leave" /> Fravær</span></div>
      <div className="wf-schedule-wrap"><div className="wf-schedule-grid">
        <div className="wf-schedule-corner">Medarbejder</div>{DAYS.map((day, index) => <div className="wf-day-head" key={day}><strong>{day}</strong><span>{formatDate(addLocalDays(week, index))}</span></div>)}<div className="wf-hours-head">Timer</div>
        {employees.map((employee) => <Fragment key={employee.id}><div className="wf-employee-cell"><strong>{employee.name}</strong><span>{employee.functions.join(" · ")}</span><small>{employee.workplace}</small></div>
          {DAYS.map((_, index) => { const dayStart = addLocalDays(week, index); const dayEnd = addLocalDays(dayStart, 1); const dayShifts = shiftsStartingInPeriod(shifts, employee.id, dayStart, dayEnd); const leave = state.leaves.find((item) => item.employeeId === employee.id && activeLeave(item) && intervalOverlaps(item, { startMs: dayStart, endMs: dayEnd }));
            return <button className={`wf-shift-cell ${leave ? "has-leave" : ""}`} key={index} onClick={() => setEditing({ employeeId: employee.id, date: toLocalDateKey(dayStart), start: "08:00", end: "16:00", breakMinutes: 30, status: "draft", workplace: employee.workplace })}>{leave && <span className="wf-leave-band">Fravær</span>}{dayShifts.map((shift) => <span key={shift.id} className={`wf-shift wf-shift--${shift.status}`} onClick={(event) => { event.stopPropagation(); setEditing(shift); }}><strong>{formatTime(shift.startMs)}–{formatTime(shift.endMs)}</strong><small>{formatHours(shiftMinutes(shift))} · {shift.status === "draft" ? "Kladde" : "Offentliggjort"}</small></span>)}{!dayShifts.length && !leave && <span className="wf-add-shift">＋</span>}</button>; })}
          <div className="wf-hours-cell"><strong>{formatHours(plannedMinutes(shifts, employee.id, week, weekEnd))}</strong><small>planlagt</small></div></Fragment>)}
      </div></div>
    </Card>
    {editing && <ShiftForm value={editing} state={state} busy={busy} onClose={() => setEditing(null)} onSave={async (shift, repeatWeeks) => { await run(() => repository.saveShift(actor, shift, { repeatWeeks })); setEditing(null); }} onCancel={editing.id ? async (reason) => { await run(() => repository.cancelShift(actor, editing.id, reason)); setEditing(null); } : null} />}
    {copying && <CopyWeek week={week} busy={busy} onClose={() => setCopying(false)} onCopy={async (target) => { await run(() => repository.copyWeek(actor, week, target)); setWeek(startOfWeek(target)); setCopying(false); }} />}
  </>;
}

function ShiftForm({ value, state, busy, onClose, onSave, onCancel }) {
  const existing = Boolean(value.id); const initialDate = existing ? toLocalDateKey(value.startMs) : value.date; const initialEndDate = existing ? toLocalDateKey(value.endMs) : initialDate;
  const [form, setForm] = useState({ employeeId: value.employeeId, date: initialDate, start: existing ? formatTime(value.startMs).replace(".", ":") : value.start, endDate: initialEndDate, end: existing ? formatTime(value.endMs).replace(".", ":") : value.end, breakMinutes: value.breakMinutes, status: value.status, workplace: value.workplace || "", repeatWeeks: 0 });
  const [cancelReason, setCancelReason] = useState(""); const update = (key, next) => setForm((current) => ({ ...current, [key]: next }));
  const employee = state.employees.find((item) => item.id === form.employeeId);
  const save = () => { let startMs = localDateTimeMs(form.date, form.start); let endMs = localDateTimeMs(form.endDate, form.end); if (endMs <= startMs && form.endDate === form.date) endMs = addLocalDays(endMs, 1); onSave({ ...value, employeeId: form.employeeId, startMs, endMs, breakMinutes: Number(form.breakMinutes), status: form.status, workplace: form.workplace }, existing ? 0 : Number(form.repeatWeeks)); };
  return <Modal title={existing ? "Redigér denne vagt" : "Opret vagt"} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); save(); }}><div className="wf-form-grid">
    <Field label="Medarbejder"><select value={form.employeeId} onChange={(event) => update("employeeId", event.target.value)}>{state.employees.filter((item) => item.status !== "terminated").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Arbejdssted"><input required value={form.workplace} onChange={(event) => update("workplace", event.target.value)} /></Field>
    <Field label="Startdato"><input type="date" required value={form.date} onChange={(event) => update("date", event.target.value)} /></Field><Field label="Start"><input type="time" required value={form.start} onChange={(event) => update("start", event.target.value)} /></Field>
    <Field label="Slutdato"><input type="date" required value={form.endDate} onChange={(event) => update("endDate", event.target.value)} /></Field><Field label="Slut"><input type="time" required value={form.end} onChange={(event) => update("end", event.target.value)} /></Field>
    <Field label="Pause i minutter"><input type="number" min="0" max="240" value={form.breakMinutes} onChange={(event) => update("breakMinutes", event.target.value)} /></Field><Field label="Planstatus"><select value={form.status} onChange={(event) => update("status", event.target.value)}><option value="draft">Kladde</option><option value="published">Offentliggjort</option></select></Field>
    {!existing && <Field label="Gentag arbejdsmønster"><select value={form.repeatWeeks} onChange={(event) => update("repeatWeeks", event.target.value)}><option value="0">Kun denne vagt</option><option value="1">I 2 uger</option><option value="3">I 4 uger</option><option value="7">I 8 uger</option></select></Field>}
  </div>{existing && value.seriesId && <Notice>Kun denne forekomst ændres. De øvrige vagter i serien berøres ikke.</Notice>}
  {employee?.status === "leave" && <Notice tone="warn">Medarbejderen er registreret på orlov.</Notice>}
  {onCancel && <Field label="Begrundelse ved annullering"><input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Udfyld kun hvis vagten skal annulleres" /></Field>}
  <footer className="wf-modal-actions">{onCancel && <button type="button" disabled={!cancelReason.trim() || busy} className="wf-btn wf-btn--danger" onClick={() => onCancel(cancelReason)}>Annullér vagt</button>}<span className="wf-spacer" /><button type="button" className="wf-btn" onClick={onClose}>Luk</button><button disabled={busy} className="wf-btn wf-btn--primary">Gem vagt</button></footer></form></Modal>;
}

function CopyWeek({ week, busy, onClose, onCopy }) {
  const [target, setTarget] = useState(toLocalDateKey(addLocalDays(week, 7)));
  return <Modal title="Kopiér ugeplan" onClose={onClose}><Notice>Vagterne kopieres som kladder. Den eksisterende uge ændres ikke.</Notice><Field label="Mandag i mål-ugen"><input type="date" value={target} onChange={(event) => setTarget(event.target.value)} /></Field><div className="wf-modal-actions"><button className="wf-btn" onClick={onClose}>Annuller</button><button disabled={busy} className="wf-btn wf-btn--primary" onClick={() => onCopy(localDateTimeMs(target, "00:00"))}>Kopiér som kladde</button></div></Modal>;
}
