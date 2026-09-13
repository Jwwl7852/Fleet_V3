import { activeLeave, addLocalDays, conflictsForLeave, staffingSnapshot, startOfLocalDay } from "../domain/workforceDomain.js";
import { Card, employeeName, formatDate, formatTime, LeaveStatus, PageHeader, Pill, ShiftStatus } from "./Shared.jsx";

export function OverviewPage({ state, navigate }) {
  const now = Date.now(); const dayStart = startOfLocalDay(now); const dayEnd = addLocalDays(dayStart, 1); const inThirty = addLocalDays(now, 30);
  const pending = state.leaves.filter((item) => item.status === "pending");
  const staffing = staffingSnapshot(state, dayStart, dayEnd, now);
  const clocked = new Set(staffing.currentlyClockedEmployeeIds);
  const expiring = state.skills.filter((item) => Number.isFinite(item.validUntilMs) && item.validUntilMs >= now && item.validUntilMs <= inThirty);
  const conflictLeaves = state.leaves.filter(activeLeave).map((leave) => ({ leave, conflicts: conflictsForLeave(state, leave) }))
    .filter((item) => item.conflicts.shifts.length || item.conflicts.assignments.length);
  return <>
    <PageHeader title="Overblik" subtitle="Det, der kræver handling i WORKFORCE lige nu" />
    <div className="wf-kpis wf-kpis--six">
      <button onClick={() => navigate("leave")}><span>Afventende anmodninger</span><strong>{pending.length}</strong><small>skal behandles</small></button>
      <button onClick={() => navigate("schedule")}><span>Offentliggjort i dag</span><strong>{staffing.publishedEmployeeCount}</strong><small>medarbejdere på offentliggjorte vagter</small></button>
      <button onClick={() => navigate("schedule")}><span>Kladder i dag</span><strong>{staffing.draftEmployeeCount}</strong><small>ikke synlige for medarbejderne</small></button>
      <button onClick={() => navigate("time")}><span>Faktisk indstemplet</span><strong>{clocked.size}</strong><small>uafhængigt af planstatus</small></button>
      <button onClick={() => navigate("leave")}><span>Konflikter</span><strong>{conflictLeaves.length}</strong><small>vagter eller opgaver berørt</small></button>
      <button onClick={() => navigate("skills")}><span>Udløber inden 30 dage</span><strong>{expiring.length}</strong><small>kompetencer at følge op på</small></button>
    </div>
    <div className="wf-two-col">
      <Card title="Dagens bemanding"><div className="wf-list">
        {staffing.publishedShifts.length > 0 && <h3 className="wf-list-heading">Offentliggjorte vagter</h3>}
        {staffing.publishedShifts.slice(0, 6).map((shift) => <button className="wf-list-row" key={shift.id} onClick={() => navigate("schedule")}>
          <span><strong>{employeeName(state, shift.employeeId)}</strong><small>{formatTime(shift.startMs)}–{formatTime(shift.endMs)} · {shift.workplace}</small></span>
          <span className="wf-row-status"><ShiftStatus value={shift.status} />{clocked.has(shift.employeeId) ? <Pill tone="ok">Indstemplet</Pill> : <Pill>Ikke indstemplet</Pill>}</span>
        </button>)}
        {staffing.draftShifts.length > 0 && <h3 className="wf-list-heading">Kladder</h3>}
        {staffing.draftShifts.slice(0, 6).map((shift) => <button className="wf-list-row" key={shift.id} onClick={() => navigate("schedule")}>
          <span><strong>{employeeName(state, shift.employeeId)}</strong><small>{formatTime(shift.startMs)}–{formatTime(shift.endMs)} · {shift.workplace}</small></span>
          <span className="wf-row-status"><ShiftStatus value={shift.status} /></span>
        </button>)}{!staffing.publishedShifts.length && !staffing.draftShifts.length && <p className="wf-muted">Ingen vagter er planlagt i dag.</p>}
      </div></Card>
      <Card title="Kræver opmærksomhed"><div className="wf-list">
        {pending.map((leave) => <button className="wf-list-row" key={leave.id} onClick={() => navigate("leave")}><span><strong>{employeeName(state, leave.employeeId)}</strong><small>{formatDate(leave.fromMs, { year: true })} · frihedsanmodning</small></span><LeaveStatus value={leave.status} /></button>)}
        {expiring.map((skill) => <button className="wf-list-row" key={skill.id} onClick={() => navigate("skills")}><span><strong>{skill.type}</strong><small>{employeeName(state, skill.employeeId)} · udløber {formatDate(skill.validUntilMs, { year: true })}</small></span><Pill tone="warn">Udløber snart</Pill></button>)}
        {!pending.length && !expiring.length && <p className="wf-muted">Ingen aktuelle opfølgninger.</p>}
      </div></Card>
    </div>
  </>;
}
