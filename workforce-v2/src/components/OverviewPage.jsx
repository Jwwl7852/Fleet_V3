import { OperationalOverview, OverviewStatus } from '../../../src/fleet/OperationalOverview.jsx';
import { addLocalDays, staffingSnapshot, startOfLocalDay } from '../domain/workforceDomain.js';
import { employeeName } from './Shared.jsx';

const date = (value) => Number.isFinite(value) ? new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' }).format(value) : '—';

export function OverviewPage({ actor, state, navigate }) {
  const now = Date.now(); const dayStart = startOfLocalDay(now); const dayEnd = addLocalDays(dayStart, 1); const inThirty = addLocalDays(now, 30);
  const staffing = staffingSnapshot(state, dayStart, dayEnd, now);
  const clocked = new Set(staffing.currentlyClockedEmployeeIds);
  const todayLeave = state.leaves.filter((item) => item.status === 'approved' && item.fromMs < dayEnd && item.toMs > dayStart);
  const awaitingTime = state.timeEntries.filter((item) => Number.isFinite(item.outMs) && !item.approvedAtMs);
  const awaitingHours = awaitingTime.reduce((sum, item) => sum + Math.max(0, (item.outMs - item.inMs) / 3600000 - (item.breakMinutes || 0) / 60), 0);
  const upcoming = [
    ...state.leaves.filter((item) => item.status === 'approved' && item.toMs >= dayStart).map((item) => ({ id: `leave-${item.id}`, dateMs: item.fromMs, employeeId: item.employeeId, department: state.employees.find((employee) => employee.id === item.employeeId)?.department, event: 'Fravær', period: `${date(item.fromMs)} – ${date(item.toMs - 1)}`, status: 'Godkendt', tone: 'ok', target: 'leave' })),
    ...state.skills.filter((item) => Number.isFinite(item.validUntilMs) && item.validUntilMs >= now && item.validUntilMs <= inThirty).map((item) => ({ id: `skill-${item.id}`, dateMs: item.validUntilMs, employeeId: item.employeeId, department: state.employees.find((employee) => employee.id === item.employeeId)?.department, event: `${item.type} udløber`, period: date(item.validUntilMs), status: 'Udløber snart', tone: 'warn', target: 'skills' })),
  ].sort((left, right) => left.dateMs - right.dateMs).slice(0, 5);
  const registrations = [
    ...state.leaves.filter((item) => item.status === 'pending').map((item) => ({ id: `leave-${item.id}`, dateMs: item.requestedAtMs || item.fromMs, employeeId: item.employeeId, department: state.employees.find((employee) => employee.id === item.employeeId)?.department, registration: 'Fraværsanmodning', hours: '—', status: 'Afventer godkendelse', tone: 'warn', target: 'leave' })),
    ...awaitingTime.map((item) => ({ id: `time-${item.id}`, dateMs: item.inMs, employeeId: item.employeeId, department: state.employees.find((employee) => employee.id === item.employeeId)?.department, registration: 'Tidsregistrering', hours: `${Math.max(0, (item.outMs - item.inMs) / 3600000 - (item.breakMinutes || 0) / 60).toLocaleString('da-DK', { maximumFractionDigits: 2 })} t`, status: 'Til behandling', tone: 'info', target: 'time' })),
  ].sort((left, right) => left.dateMs - right.dateMs).slice(0, 5);
  const privacyNote = actor.permissions.includes('workforce.leave.sensitive') ? 'fraværstype vises på fraværssiden' : 'følsom fraværstype er skjult';

  return <OperationalOverview
    module="WORKFORCE" title="WORKFORCE – overblik"
    period="I dag og kommende 30 dage · Europe/Copenhagen" source={`WORKFORCE-repository · ${privacyNote}`} testData
    kpis={[
      { label: 'På arbejde i dag', value: clocked.size, note: 'faktisk indstemplet lige nu', icon: '♟', tone: 'info', onClick: () => navigate('time') },
      { label: 'Fravær i dag', value: todayLeave.length, note: 'godkendt fravær, aktivt i dag', icon: '▦', tone: 'warn', onClick: () => navigate('leave') },
      { label: 'Timer til godkendelse', value: `${awaitingHours.toLocaleString('da-DK', { maximumFractionDigits: 2 })} t`, note: `${awaitingTime.length} afsluttede registreringer uden godkendelse`, icon: '◷', tone: 'warn', onClick: () => navigate('time') },
    ]}
    action={{ label: 'Registrér fravær', onClick: () => navigate('leave') }}
    tables={[
      { id: 'workforce-upcoming', title: 'Kommende fravær og certifikatudløb', note: 'Nærmeste dato først · højst 5 · følsomme årsager vises ikke', onAll: () => navigate('leave'), rows: upcoming, onRow: (row) => navigate(row.target), columns: [
        { key: 'date', label: 'Dato', render: (row) => date(row.dateMs) }, { key: 'employee', label: 'Medarbejder', render: (row) => <strong>{employeeName(state, row.employeeId)}</strong> }, { key: 'department', label: 'Afdeling' }, { key: 'event', label: 'Hændelse' }, { key: 'period', label: 'Periode / frist' }, { key: 'status', label: 'Status', render: (row) => <OverviewStatus tone={row.tone}>{row.status}</OverviewStatus> }, { key: 'action', label: 'Handling', render: () => <span className="fc-overview-link">Se detaljer →</span> },
      ], empty: 'Der er ingen godkendte fravær eller certifikatudløb i perioden.' },
      { id: 'workforce-process', title: 'Registreringer til behandling', note: 'Ældste afventende registrering først · højst 5', onAll: () => navigate('time'), rows: registrations, onRow: (row) => navigate(row.target), columns: [
        { key: 'date', label: 'Dato', render: (row) => date(row.dateMs) }, { key: 'employee', label: 'Medarbejder', render: (row) => <strong>{employeeName(state, row.employeeId)}</strong> }, { key: 'department', label: 'Afdeling' }, { key: 'registration', label: 'Registrering' }, { key: 'hours', label: 'Timer' }, { key: 'status', label: 'Status', render: (row) => <OverviewStatus tone={row.tone}>{row.status}</OverviewStatus> }, { key: 'owner', label: 'Ansvarlig', render: () => actor.name || 'Leder' }, { key: 'action', label: 'Handling', render: () => <span className="fc-overview-link">Se registrering →</span> },
      ], empty: 'Der er ingen afventende fraværs- eller tidsregistreringer.' },
    ]}
  />;
}
