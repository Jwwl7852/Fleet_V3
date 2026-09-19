import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  activeLeave, addLocalDays, deduplicateShifts, intervalOverlaps, LEAVE_TYPES, localDateTimeMs,
  plannedMinutes, shiftMinutes, startOfWeek, toLocalDateKey,
} from "../domain/workforceDomain.js";
import {
  addLocalMonths, addLocalYears, calendarCategoryId, daysInPeriod, filterCalendarEmployees,
  isoWeekInfo, monthCalendarDays, movePeriod, periodForView, periodLabel, reconcilePersonIds,
  weeksIntersectingMonth,
} from "../domain/workforceCalendar.js";
import { Card, Field, formatDate, formatHours, formatTime, Modal, Notice, PageHeader } from "./Shared.jsx";

const VIEW_LABELS = { day: "Dag", week: "Uge", month: "Måned", year: "År" };
const DAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const MONTH_NAMES = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat("da-DK", { month: "long" }).format(new Date(2026, month, 1)));

function normalizeCategories(calendarCategories = []) {
  return calendarCategories.filter((item) => item.aktiv !== false).map((item) => ({
    id: item.id, label: item.navn || item.label || item.id, color: item.farve || item.color || null,
  }));
}

export function SchedulePage({ state, repository, actor, run, busy, navigate, calendarCategories = [] }) {
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(Date.now());
  const [filters, setFilters] = useState({ departments: [], people: [], categories: [] });
  const [editing, setEditing] = useState(null);
  const [viewingShift, setViewingShift] = useState(null);
  const [viewingLeave, setViewingLeave] = useState(null);
  const [copying, setCopying] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const period = periodForView(view, anchor);
  const week = startOfWeek(anchor);
  const weekEnd = addLocalDays(week, 7);
  const canEditShifts = actor.permissions.includes("workforce.shift.write");
  const categories = useMemo(() => normalizeCategories(calendarCategories), [calendarCategories]);
  const categoryLabels = useMemo(() => new Map(categories.map((item) => [item.id, item.label])), [categories]);
  const departments = useMemo(() => [...new Set(state.employees.filter((item) => item.status !== "terminated").map((item) => item.department || item.workplace).filter(Boolean))].sort((a, b) => a.localeCompare(b, "da")), [state.employees]);
  const departmentEmployees = useMemo(() => filterCalendarEmployees(state.employees, { departments: filters.departments }), [state.employees, filters.departments]);
  const employees = useMemo(() => filterCalendarEmployees(state.employees, filters), [state.employees, filters]);
  const allShifts = useMemo(() => deduplicateShifts(state.shifts).filter((item) => item.status !== "cancelled"), [state.shifts]);
  const visibleShifts = useMemo(() => allShifts.filter((item) => intervalOverlaps(item, { startMs: period.startMs, endMs: period.endMs })), [allShifts, period.startMs, period.endMs]);
  const visibleLeaves = useMemo(() => state.leaves.filter((item) => activeLeave(item)
    && intervalOverlaps(item, { startMs: period.startMs, endMs: period.endMs })
    && (filters.categories.length === 0 || filters.categories.includes(calendarCategoryId(item, state.sensitiveLeave)))), [state.leaves, state.sensitiveLeave, filters.categories, period.startMs, period.endMs]);
  const filteredLeaves = useMemo(() => state.leaves.filter((item) => activeLeave(item)
    && (filters.categories.length === 0 || filters.categories.includes(calendarCategoryId(item, state.sensitiveLeave)))), [state.leaves, state.sensitiveLeave, filters.categories]);
  const drafts = allShifts.filter((item) => item.status === "draft" && item.startMs >= week && item.startMs < weekEnd).length;

  useEffect(() => {
    setFilters((current) => {
      const people = reconcilePersonIds(current.people, state.employees, current.departments);
      return people.length === current.people.length ? current : { ...current, people };
    });
  }, [state.employees, filters.departments]);

  const updateFilter = (key, values) => setFilters((current) => ({ ...current, [key]: values }));
  const resetFilters = () => setFilters({ departments: [], people: [], categories: [] });
  const hasFilters = filters.departments.length + filters.people.length + filters.categories.length > 0;
  const openShift = (shift) => canEditShifts ? setEditing(shift) : setViewingShift(shift);
  const createShift = (employee, dayStart) => {
    if (!canEditShifts) return;
    setEditing({ employeeId: employee.id, date: toLocalDateKey(dayStart), start: "08:00", end: "16:00", breakMinutes: 30, status: "draft", workplace: employee.workplace });
  };
  const changeView = (next) => { setView(next); setPickerOpen(false); };

  return <>
    <PageHeader title="Kalender" subtitle="Vagter, bemanding og fravær i samme kalender" actions={<>
      <button className="wf-btn" onClick={() => setCopying(true)}>Kopiér uge</button>
      <button className="wf-btn wf-btn--primary" disabled={!drafts || busy || !canEditShifts} onClick={() => run(() => repository.publishWeek(actor, week))}>Offentliggør {drafts || ""}</button>
    </>} />
    <Card className="wf-calendar-card">
      <div className="wf-calendar-toolbar">
        <div className="wf-view-switch" aria-label="Kalendervisning">{Object.entries(VIEW_LABELS).map(([key, label]) => <button type="button" key={key} className={view === key ? "active" : ""} aria-pressed={view === key} onClick={() => changeView(key)}>{label}</button>)}</div>
        <div className="wf-period-nav">
          <button className="wf-btn wf-icon-period" aria-label={`Forrige ${VIEW_LABELS[view].toLocaleLowerCase("da")}`} onClick={() => setAnchor((current) => movePeriod(view, current, -1))}>‹</button>
          <button className="wf-btn" onClick={() => setAnchor(Date.now())}>I dag</button>
          <PeriodPicker view={view} anchor={anchor} open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setAnchor} />
          <button className="wf-btn wf-icon-period" aria-label={`Næste ${VIEW_LABELS[view].toLocaleLowerCase("da")}`} onClick={() => setAnchor((current) => movePeriod(view, current, 1))}>›</button>
        </div>
      </div>
      <div className="wf-calendar-filters">
        <MultiFilter label="Afdelinger" options={departments.map((value) => ({ id: value, label: value }))} values={filters.departments} onChange={(values) => updateFilter("departments", values)} />
        <MultiFilter label="Personer" options={departmentEmployees.map((employee) => ({ id: employee.id, label: employee.name }))} values={filters.people} onChange={(values) => updateFilter("people", values)} />
        <MultiFilter label="Kategorier" options={categories} values={filters.categories} onChange={(values) => updateFilter("categories", values)} emptyLabel="Ingen kalenderkategorier er oprettet i Opsætning" />
        <button className="wf-btn wf-filter-reset" disabled={!hasFilters} onClick={resetFilters}>Nulstil</button>
      </div>
      {hasFilters && <div className="wf-active-filters" aria-live="polite">
        <strong>Aktive filtre:</strong>
        {filters.departments.map((value) => <span key={`d-${value}`}>Afdeling: {value}</span>)}
        {filters.people.map((value) => <span key={`p-${value}`}>Person: {state.employees.find((item) => item.id === value)?.name || value}</span>)}
        {filters.categories.map((value) => <span key={`c-${value}`}>Kategori: {categoryLabels.get(value) || value}</span>)}
      </div>}
      <div className="wf-plan-legend"><span><i className="wf-legend wf-legend--published" /> Offentliggjort vagt</span><span><i className="wf-legend wf-legend--draft" /> Kladde</span><span><i className="wf-legend wf-legend--leave" /> Fravær</span></div>
      {employees.length === 0 ? <div className="wf-empty"><strong>Ingen medarbejdere matcher filtrene.</strong><br />Nulstil filtrene eller vælg en anden afdeling/person.</div>
        : view === "year" ? <YearOverview anchor={anchor} employees={employees} shifts={allShifts} leaves={filteredLeaves} onOpenMonth={(month) => { setAnchor(month); setView("month"); }} />
          : <CalendarGrid view={view} anchor={anchor} employees={employees} shifts={visibleShifts} leaves={visibleLeaves} state={state} categories={categoryLabels} canEdit={canEditShifts} onCreateShift={createShift} onOpenShift={openShift} onOpenLeave={setViewingLeave} />}
    </Card>
    {editing && <ShiftForm value={editing} state={state} busy={busy} onClose={() => setEditing(null)} onSave={async (shift, repeatWeeks) => { await run(() => repository.saveShift(actor, shift, { repeatWeeks })); setEditing(null); }} onCancel={editing.id ? async (reason) => { await run(() => repository.cancelShift(actor, editing.id, reason)); setEditing(null); } : null} />}
    {viewingShift && <ShiftSummary shift={viewingShift} employee={state.employees.find((item) => item.id === viewingShift.employeeId)} onClose={() => setViewingShift(null)} />}
    {viewingLeave && <LeaveSummary leave={viewingLeave} state={state} categories={categoryLabels} onClose={() => setViewingLeave(null)} onOpen={() => { setViewingLeave(null); navigate?.("leave"); }} />}
    {copying && <CopyWeek week={week} busy={busy} onClose={() => setCopying(false)} onCopy={async (target) => { await run(() => repository.copyWeek(actor, week, target)); setAnchor(startOfWeek(target)); setView("week"); setCopying(false); }} />}
  </>;
}

function MultiFilter({ label, options, values, onChange, emptyLabel = "Ingen valgmuligheder" }) {
  const toggle = (id) => onChange(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  return <details className="wf-multi-filter"><summary>{label}<span>{values.length ? values.length : "Alle"}</span></summary><div className="wf-multi-menu" role="group" aria-label={label}>
    {options.length ? options.map((option) => <label key={option.id}><input type="checkbox" checked={values.includes(option.id)} onChange={() => toggle(option.id)} /> <span>{option.label}</span></label>) : <p>{emptyLabel}</p>}
    {values.length > 0 && <button type="button" className="wf-link-button" onClick={() => onChange([])}>Ryd valg</button>}
  </div></details>;
}

function PeriodPicker({ view, anchor, open, onOpenChange, onSelect }) {
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const [browse, setBrowse] = useState(anchor);
  useEffect(() => { if (open) setBrowse(anchor); }, [open, anchor]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); onOpenChange(false); triggerRef.current?.focus(); } };
    const onPointer = (event) => { if (!wrapperRef.current?.contains(event.target)) { onOpenChange(false); triggerRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    requestAnimationFrame(() => wrapperRef.current?.querySelector(".wf-period-popover button")?.focus());
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [open, onOpenChange]);
  const choose = (value) => { onSelect(value); onOpenChange(false); requestAnimationFrame(() => triggerRef.current?.focus()); };
  return <div className="wf-period-picker" ref={wrapperRef}>
    <button ref={triggerRef} type="button" className="wf-btn wf-period-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => onOpenChange(!open)}>{periodLabel(view, anchor)} <span aria-hidden="true">▾</span></button>
    {open && <div className="wf-period-popover" role="dialog" aria-label={`Vælg ${VIEW_LABELS[view].toLocaleLowerCase("da")}`}>
      <PickerHeading view={view} browse={browse} setBrowse={setBrowse} />
      {view === "day" && <DayPicker browse={browse} selected={anchor} onSelect={choose} />}
      {view === "week" && <WeekPicker browse={browse} selected={anchor} onSelect={choose} />}
      {view === "month" && <MonthPicker browse={browse} selected={anchor} onSelect={choose} />}
      {view === "year" && <YearPicker browse={browse} selected={anchor} onSelect={choose} />}
    </div>}
  </div>;
}

function PickerHeading({ view, browse, setBrowse }) {
  const step = view === "day" || view === "week" ? (value, direction) => addLocalMonths(value, direction) : (value, direction) => addLocalYears(value, direction);
  const label = view === "day" || view === "week" ? new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric" }).format(browse) : String(new Date(browse).getFullYear());
  return <header><button type="button" aria-label="Forrige" onClick={() => setBrowse((current) => step(current, -1))}>‹</button><strong>{label}</strong><button type="button" aria-label="Næste" onClick={() => setBrowse((current) => step(current, 1))}>›</button></header>;
}

function DayPicker({ browse, selected, onSelect }) {
  const today = toLocalDateKey(Date.now()); const selectedKey = toLocalDateKey(selected); const month = new Date(browse).getMonth();
  return <><div className="wf-picker-weekdays">{DAY_LABELS.map((day) => <span key={day}>{day}</span>)}</div><div className="wf-day-picker">{monthCalendarDays(browse).map((day) => { const key = toLocalDateKey(day); return <button type="button" key={key} className={`${new Date(day).getMonth() !== month ? "outside" : ""} ${key === selectedKey ? "selected" : ""} ${key === today ? "today" : ""}`} aria-label={new Intl.DateTimeFormat("da-DK", { dateStyle: "full" }).format(day)} onClick={() => onSelect(day)}>{new Date(day).getDate()}</button>; })}</div></>;
}

function WeekPicker({ browse, selected, onSelect }) {
  const selectedWeek = startOfWeek(selected);
  return <div className="wf-week-picker">{weeksIntersectingMonth(browse).map((item) => <button type="button" key={`${item.year}-${item.week}`} className={item.startMs === selectedWeek ? "selected" : ""} onClick={() => onSelect(item.startMs)}><strong>Uge {item.week}</strong><span>{formatDate(item.startMs)}–{formatDate(addLocalDays(item.startMs, 6), { year: true })}</span></button>)}</div>;
}

function MonthPicker({ browse, selected, onSelect }) {
  const selectedDate = new Date(selected); const browseYear = new Date(browse).getFullYear();
  return <div className="wf-month-picker">{MONTH_NAMES.map((name, month) => <button type="button" key={name} className={selectedDate.getFullYear() === browseYear && selectedDate.getMonth() === month ? "selected" : ""} onClick={() => onSelect(new Date(browseYear, month, Math.min(selectedDate.getDate(), new Date(browseYear, month + 1, 0).getDate())).getTime())}>{name}</button>)}</div>;
}

function YearPicker({ browse, selected, onSelect }) {
  const browseYear = new Date(browse).getFullYear(); const first = browseYear - (browseYear % 12); const selectedYear = new Date(selected).getFullYear();
  return <div className="wf-year-picker">{Array.from({ length: 12 }, (_, index) => first + index).map((year) => <button type="button" key={year} className={year === selectedYear ? "selected" : ""} onClick={() => onSelect(new Date(year, new Date(selected).getMonth(), new Date(selected).getDate()).getTime())}>{year}</button>)}</div>;
}

function CalendarGrid({ view, anchor, employees, shifts, leaves, state, categories, canEdit, onCreateShift, onOpenShift, onOpenLeave }) {
  const days = daysInPeriod(view, anchor);
  const gridStyle = { "--wf-calendar-days": days.length };
  const period = periodForView(view, anchor);
  return <div className={`wf-schedule-wrap wf-calendar-grid-wrap wf-calendar-grid-wrap--${view}`}><div className="wf-calendar-grid" style={gridStyle}>
    <div className="wf-schedule-corner">Medarbejder</div>{days.map((day) => <div className="wf-day-head" key={day}><strong>{DAY_LABELS[(new Date(day).getDay() + 6) % 7]}</strong><span>{formatDate(day)}</span>{view === "month" && <small>Uge {isoWeekInfo(day).week}</small>}</div>)}<div className="wf-hours-head">Timer</div>
    {employees.map((employee) => <Fragment key={employee.id}><div className="wf-employee-cell"><strong>{employee.name}</strong><span>{employee.functions.join(" · ")}</span><small>{employee.department || employee.workplace}</small></div>
      {days.map((dayStart) => { const dayEnd = addLocalDays(dayStart, 1); const dayShifts = shifts.filter((shift) => shift.employeeId === employee.id && intervalOverlaps(shift, { startMs: dayStart, endMs: dayEnd })); const dayLeaves = leaves.filter((leave) => leave.employeeId === employee.id && intervalOverlaps(leave, { startMs: dayStart, endMs: dayEnd }));
        return <div className={`wf-shift-cell ${dayLeaves.length ? "has-leave" : ""}`} key={dayStart}>
          {dayLeaves.map((leave) => { const categoryId = calendarCategoryId(leave, state.sensitiveLeave); const label = categories.get(categoryId) || LEAVE_TYPES[categoryId] || "Fravær"; return <button type="button" key={leave.id} className="wf-leave-band" onClick={() => onOpenLeave(leave)} title={`${label} · ${formatDate(leave.fromMs)}–${formatDate(leave.toMs - 1)}`}><span aria-hidden="true">●</span> {label}</button>; })}
          {dayShifts.map((shift) => <button type="button" key={shift.id} className={`wf-shift wf-shift--${shift.status}`} onClick={() => onOpenShift(shift)} title={`${formatTime(shift.startMs)}–${formatTime(shift.endMs)}`}><strong>{formatTime(shift.startMs)}–{formatTime(shift.endMs)}</strong><small>{formatHours(shiftMinutes(shift))} · {shift.status === "draft" ? "Kladde" : "Offentliggjort"}</small></button>)}
          {!dayShifts.length && !dayLeaves.length && canEdit && <button type="button" className="wf-add-shift" aria-label={`Opret vagt for ${employee.name} ${formatDate(dayStart, { year: true })}`} onClick={() => onCreateShift(employee, dayStart)}>＋</button>}
        </div>; })}
      <div className="wf-hours-cell"><strong>{formatHours(plannedMinutes(shifts, employee.id, period.startMs, period.endMs))}</strong><small>planlagt</small></div></Fragment>)}
  </div></div>;
}

function YearOverview({ anchor, employees, shifts, leaves, onOpenMonth }) {
  const year = new Date(anchor).getFullYear();
  return <div className="wf-year-overview">{MONTH_NAMES.map((name, month) => { const start = new Date(year, month, 1).getTime(); const end = addLocalMonths(start, 1); const employeeIds = new Set(employees.map((item) => item.id)); const shiftCount = shifts.filter((item) => employeeIds.has(item.employeeId) && item.status !== "cancelled" && intervalOverlaps(item, { startMs: start, endMs: end })).length; const leaveCount = leaves.filter((item) => employeeIds.has(item.employeeId) && activeLeave(item) && intervalOverlaps(item, { startMs: start, endMs: end })).length; return <button type="button" key={name} onClick={() => onOpenMonth(start)}><strong>{name}</strong><span>{shiftCount} vagter</span><span>{leaveCount} fravær</span><small>Åbn måned ›</small></button>; })}</div>;
}

function ShiftSummary({ shift, employee, onClose }) {
  return <Modal title="Vagt" onClose={onClose}><div className="wf-detail-list"><div><span>Medarbejder</span><strong>{employee?.name || "Ukendt medarbejder"}</strong></div><div><span>Periode</span><strong>{formatDate(shift.startMs, { year: true })} · {formatTime(shift.startMs)}–{formatTime(shift.endMs)}</strong></div><div><span>Status</span><strong>{shift.status === "draft" ? "Kladde" : "Offentliggjort"}</strong></div><div><span>Arbejdssted</span><strong>{shift.workplace || "Ikke angivet"}</strong></div></div></Modal>;
}

function LeaveSummary({ leave, state, categories, onClose, onOpen }) {
  const employee = state.employees.find((item) => item.id === leave.employeeId); const categoryId = calendarCategoryId(leave, state.sensitiveLeave); const label = categories.get(categoryId) || LEAVE_TYPES[categoryId] || "Fravær";
  return <Modal title={label} onClose={onClose}><div className="wf-detail-list"><div><span>Medarbejder</span><strong>{employee?.name || "Ukendt medarbejder"}</strong></div><div><span>Periode</span><strong>{formatDate(leave.fromMs, { year: true })}–{formatDate(leave.toMs - 1, { year: true })}</strong></div><div><span>Kategori</span><strong>{label}</strong></div></div><div className="wf-modal-actions"><span className="wf-spacer" /><button className="wf-btn" onClick={onClose}>Luk</button><button className="wf-btn wf-btn--primary" onClick={onOpen}>Åbn i Ferie & fravær</button></div></Modal>;
}

function ShiftForm({ value, state, busy, onClose, onSave, onCancel }) {
  const existing = Boolean(value.id); const initialDate = existing ? toLocalDateKey(value.startMs) : value.date; const initialEndDate = existing ? toLocalDateKey(value.endMs) : initialDate;
  const [form, setForm] = useState({ employeeId: value.employeeId, date: initialDate, start: existing ? formatTime(value.startMs).replace(".", ":") : value.start, endDate: initialEndDate, end: existing ? formatTime(value.endMs).replace(".", ":") : value.end, breakMinutes: value.breakMinutes, status: value.status, workplace: value.workplace || "", repeatWeeks: 0 });
  const [cancelReason, setCancelReason] = useState(""); const update = (key, next) => setForm((current) => ({ ...current, [key]: next }));
  const employee = state.employees.find((item) => item.id === form.employeeId);
  const save = () => { const startMs = localDateTimeMs(form.date, form.start); let endMs = localDateTimeMs(form.endDate, form.end); if (endMs <= startMs && form.endDate === form.date) endMs = addLocalDays(endMs, 1); onSave({ ...value, employeeId: form.employeeId, startMs, endMs, breakMinutes: Number(form.breakMinutes), status: form.status, workplace: form.workplace }, existing ? 0 : Number(form.repeatWeeks)); };
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
