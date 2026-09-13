import { activeLeave, addLocalDays, conflictsForLeave, intervalOverlaps, startOfLocalDay } from "../domain/workforceDomain.js";
import { Card, employeeName, formatDate, formatTime, LeaveStatus, PageHeader, Pill, ShiftStatus } from "./Shared.jsx";

export function OverviewPage({ state, navigate }) {
  const now = Date.now(); const dayStart = startOfLocalDay(now); const dayEnd = addLocalDays(dayStart, 1); const inThirty = addLocalDays(now, 30);
  const pending = state.leaves.filter((item) => item.status === "pending");
  const todayShifts = state.shifts.filter((item) => item.status !== "cancelled" && intervalOverlaps(item, { startMs: dayStart, endMs: dayEnd }));
  const clocked = new Set(state.timeEntries.filter((item) => item.inMs >= dayStart && item.inMs < dayEnd).map((item) => item.employeeId));
  const expiring = state.skills.filter((item) => Number.isFinite(item.validUntilMs) && item.validUntilMs >= now && item.validUntilMs <= inThirty);
  const conflictLeaves = state.leaves.filter(activeLeave).map((leave) => ({ leave, conflicts: conflictsForLeave(state, leave) }))
    .filter((item) => item.conflicts.shifts.length || item.conflicts.assignments.length);
  return <>
    <PageHeader title="Overblik" subtitle="Det, der kræver handling i WORKFORCE lige nu" />
    <div className="wf-kpis">
      <button onClick={() => navigate("leave")}><span>Afventende anmodninger</span><strong>{pending.length}</strong><small>skal behandles</small></button>
      <button onClick={() => navigate("schedule")}><span>Planlagt på arbejde i dag</span><strong>{todayShifts.length}</strong><small>{clocked.size} faktisk indstemplet</small></button>
      <button onClick={() => navigate("leave")}><span>Konflikter</span><strong>{conflictLeaves.length}</strong><small>vagter eller opgaver berørt</small></button>
      <button onClick={() => navigate("skills")}><span>Udløber inden 30 dage</span><strong>{expiring.length}</strong><small>kompetencer at følge op på</small></button>
    </div>
    <div className="wf-two-col">
      <Card title="Dagens bemanding"><div className="wf-list">
        {todayShifts.slice(0, 6).map((shift) => <button className="wf-list-row" key={shift.id} onClick={() => navigate("schedule")}>
          <span><strong>{employeeName(state, shift.employeeId)}</strong><small>{formatTime(shift.startMs)}–{formatTime(shift.endMs)} · {shift.workplace}</small></span>
          <span className="wf-row-status"><ShiftStatus value={shift.status} />{clocked.has(shift.employeeId) ? <Pill tone="ok">Indstemplet</Pill> : <Pill>Ikke indstemplet</Pill>}</span>
        </button>)}{!todayShifts.length && <p className="wf-muted">Ingen vagter er planlagt i dag.</p>}
      </div></Card>
      <Card title="Kræver opmærksomhed"><div className="wf-list">
        {pending.map((leave) => <button className="wf-list-row" key={leave.id} onClick={() => navigate("leave")}><span><strong>{employeeName(state, leave.employeeId)}</strong><small>{formatDate(leave.fromMs, { year: true })} · frihedsanmodning</small></span><LeaveStatus value={leave.status} /></button>)}
        {expiring.map((skill) => <button className="wf-list-row" key={skill.id} onClick={() => navigate("skills")}><span><strong>{skill.type}</strong><small>{employeeName(state, skill.employeeId)} · udløber {formatDate(skill.validUntilMs, { year: true })}</small></span><Pill tone="warn">Udløber snart</Pill></button>)}
        {!pending.length && !expiring.length && <p className="wf-muted">Ingen aktuelle opfølgninger.</p>}
      </div></Card>
    </div>
  </>;
}
