import { useMemo, useState } from "react";
import { EMPLOYEE_STATUS, futureAssignmentsForTermination, localDateTimeMs, toLocalDateKey } from "../domain/workforceDomain.js";
import { Card, Empty, Field, Modal, Notice, PageHeader, Pill } from "./Shared.jsx";

const EMPTY = { name: "", status: "active", employment: "Fastansat", functions: [], workplace: "", team: "", department: "", managerId: "", phone: "", email: "" };
const FUNCTION_OPTIONS = ["Chauffør", "Buschauffør", "Mekaniker", "Lagermedarbejder", "Terminalmedarbejder", "Disponent", "Administration"];

export function EmployeesPage({ state, repository, actor, run, busy }) {
  const [search, setSearch] = useState(""); const [showFormer, setShowFormer] = useState(false); const [editing, setEditing] = useState(null); const [terminating, setTerminating] = useState(null);
  const employees = useMemo(() => state.employees.filter((item) => (showFormer || item.status !== "terminated")
    && `${item.name} ${item.functions.join(" ")} ${item.workplace} ${item.team}`.toLowerCase().includes(search.toLowerCase())), [state, search, showFormer]);
  return <>
    <PageHeader title="Medarbejdere" subtitle="Ét fælles medarbejderregister på tværs af Veyro" actions={<button className="wf-btn wf-btn--primary" onClick={() => setEditing(EMPTY)}>Ny medarbejder</button>} />
    <Card><div className="wf-toolbar"><input aria-label="Søg medarbejdere" placeholder="Søg navn, funktion, team eller arbejdssted" value={search} onChange={(event) => setSearch(event.target.value)} /><label className="wf-check"><input type="checkbox" checked={showFormer} onChange={(event) => setShowFormer(event.target.checked)} /> Vis fratrådte</label></div>
      <div className="wf-table-wrap"><table><thead><tr><th>Medarbejder</th><th>Funktioner</th><th>Organisation</th><th>Ansættelse</th><th>Login</th><th /></tr></thead><tbody>
        {employees.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.email || item.phone || "Ingen kontaktoplysninger"}</small></td><td>{item.functions.join(", ")}</td><td>{item.team || "Intet team"}<small>{item.department || "Ingen afdeling"} · {item.workplace}</small></td><td><Pill tone={item.status === "active" ? "ok" : item.status === "leave" ? "warn" : "bad"}>{EMPLOYEE_STATUS[item.status]}</Pill><small>{item.employment}</small></td><td>{item.userId ? <Pill tone="info">Tilknyttet</Pill> : <Pill>Uden login</Pill>}</td><td><div className="wf-actions"><button className="wf-btn" onClick={() => setEditing(item)}>Åbn</button>{item.status !== "terminated" && <button className="wf-btn" onClick={() => setTerminating(item)}>Fratræd</button>}</div></td></tr>)}
      </tbody></table></div>{!employees.length && <Empty>Ingen medarbejdere matcher filtrene.</Empty>}
    </Card>
    {editing && <EmployeeForm employee={editing} state={state} busy={busy} onClose={() => setEditing(null)} onSave={async (employee) => { await run(() => repository.saveEmployee(actor, employee)); setEditing(null); }} />}
    {terminating && <TerminationForm employee={terminating} state={state} busy={busy} onClose={() => setTerminating(null)} onSave={async (date, reason) => { await run(() => repository.terminateEmployee(actor, terminating.id, localDateTimeMs(date, "00:00"), reason)); setTerminating(null); }} />}
  </>;
}

function EmployeeForm({ employee, state, busy, onClose, onSave }) {
  const [form, setForm] = useState({ ...employee, functions: [...employee.functions] }); const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const skills = state.skills.filter((item) => item.employeeId === employee.id); const shifts = state.shifts.filter((item) => item.employeeId === employee.id && item.status !== "cancelled");
  const leaves = state.leaves.filter((item) => item.employeeId === employee.id);
  return <Modal title={employee.id ? employee.name : "Ny medarbejder"} onClose={onClose} wide><div className="wf-profile-summary"><div><strong>{form.name || "Ny medarbejder"}</strong><span>{form.functions.join(" · ") || "Vælg funktioner"}</span></div><Pill tone={form.userId ? "info" : "neutral"}>{form.userId ? "Login tilknyttet" : "Ingen brugerkonto"}</Pill></div>
    <form onSubmit={(event) => { event.preventDefault(); onSave(form); }}><div className="wf-form-grid">
      <Field label="Navn"><input required value={form.name} onChange={(event) => update("name", event.target.value)} /></Field><Field label="Ansættelsesform"><select value={form.employment} onChange={(event) => update("employment", event.target.value)}><option>Fastansat</option><option>Vikar</option><option>Ekstern</option></select></Field>
      <Field label="Arbejdssted"><input required value={form.workplace} onChange={(event) => update("workplace", event.target.value)} /></Field><Field label="Team"><input value={form.team} onChange={(event) => update("team", event.target.value)} /></Field>
      <Field label="Afdeling"><input value={form.department} onChange={(event) => update("department", event.target.value)} /></Field><Field label="Leder"><select value={form.managerId || ""} onChange={(event) => update("managerId", event.target.value)}><option value="">Ingen valgt</option>{state.employees.filter((item) => item.id !== form.id && item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Telefon"><input value={form.phone || ""} onChange={(event) => update("phone", event.target.value)} /></Field><Field label="E-mail"><input type="email" value={form.email || ""} onChange={(event) => update("email", event.target.value)} /></Field>
    </div><fieldset className="wf-functions"><legend>Funktioner</legend>{FUNCTION_OPTIONS.map((option) => <label key={option}><input type="checkbox" checked={form.functions.includes(option)} onChange={(event) => update("functions", event.target.checked ? [...form.functions, option] : form.functions.filter((item) => item !== option))} /> {option}</label>)}</fieldset>
    {employee.id && <div className="wf-profile-links"><span><strong>{skills.length}</strong> kompetencer</span><span><strong>{shifts.length}</strong> vagter</span><span><strong>{leaves.length}</strong> fraværsperioder</span></div>}
    <footer className="wf-modal-actions"><button type="button" className="wf-btn" onClick={onClose}>Annuller</button><button disabled={busy || !form.functions.length} className="wf-btn wf-btn--primary">Gem medarbejder</button></footer></form>
  </Modal>;
}

function TerminationForm({ employee, state, busy, onClose, onSave }) {
  const [date, setDate] = useState(toLocalDateKey(Date.now())); const [reason, setReason] = useState("");
  const future = futureAssignmentsForTermination(state, employee.id, localDateTimeMs(date, "00:00"));
  return <Modal title={`Registrér fratrædelse · ${employee.name}`} onClose={onClose}><Notice tone={future.shifts.length || future.assignments.length ? "warn" : "info"}>{future.shifts.length + future.assignments.length ? `${future.shifts.length} fremtidige vagter og ${future.assignments.length} opgaver skal håndteres. De fjernes ikke automatisk.` : "Ingen fremtidige tildelinger er fundet."}</Notice>
    <Field label="Sidste ansættelsesdag"><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="Begrundelse"><textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
    <div className="wf-modal-actions"><button className="wf-btn" onClick={onClose}>Annuller</button><button disabled={busy || !reason.trim()} className="wf-btn wf-btn--danger" onClick={() => onSave(date, reason)}>Registrér fratrædelse</button></div>
  </Modal>;
}
