import { useCallback, useEffect, useMemo, useState } from "react";
import { createIndexedDbWorkforceRepository, WORKFORCE_DB_NAME } from "./data/workforceRepository.js";
import { OverviewPage } from "./components/OverviewPage.jsx";
import { EmployeesPage } from "./components/EmployeesPage.jsx";
import { SchedulePage } from "./components/SchedulePage.jsx";
import { LeavePage } from "./components/LeavePage.jsx";
import { SkillsPage } from "./components/SkillsPage.jsx";
import { TimePage } from "./components/TimePage.jsx";
import { SelfServicePage } from "./components/SelfServicePage.jsx";

const PAGES = [
  ["overview", "Overblik"], ["employees", "Medarbejdere"], ["schedule", "Bemanding"],
  ["leave", "Ferie & fravær"], ["skills", "Kompetencer"], ["time", "Timer"], ["self", "Min arbejdsdag"],
];

const MANAGER_ACTOR = { id: "user-manager", tenantId: "demo-transport", employeeId: "emp-dennis", name: "Dennis Christensen",
  permissions: ["workforce.employee.read", "workforce.employee.write", "workforce.shift.write", "workforce.leave.write",
    "workforce.leave.approve", "workforce.leave.sensitive", "workforce.skill.write", "workforce.time.correct", "workforce.self"] };
const EMPLOYEE_ACTOR = { id: "user-anne", tenantId: "demo-transport", employeeId: "emp-anne", name: "Anne Krogh", permissions: ["workforce.self"] };

export function WorkforceV2App({ actor: actorProp, embedded = false, repository: repositoryProp, initialPage, onNavigate, pathname }) {
  const [demoRole, setDemoRole] = useState("manager");
  const actor = actorProp || (demoRole === "manager" ? MANAGER_ACTOR : EMPLOYEE_ACTOR);
  const repository = useMemo(() => repositoryProp || createIndexedDbWorkforceRepository({ databaseName: import.meta.env.VITE_WORKFORCE_DATABASE_NAME || WORKFORCE_DB_NAME, tenantId: actor.tenantId }), [repositoryProp, actor.tenantId]);
  const pageFromUrl = () => initialPage || new URLSearchParams(window.location.search).get("page") || (actor.permissions.includes("workforce.employee.read") ? "overview" : "self");
  const [page, setPage] = useState(pageFromUrl);
  const [state, setState] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try { setState(await repository.getState(actor)); setError(""); } catch (reason) { setError(reason.message); }
  }, [repository, actor]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!pathname || !initialPage) return;
    setPage(initialPage);
  }, [pathname, initialPage]);

  const run = useCallback(async (operation) => {
    setBusy(true); setError("");
    try { const result = await operation(); await reload(); return result; }
    catch (reason) { setError(reason.message); throw reason; }
    finally { setBusy(false); }
  }, [reload]);

  const navigate = (next) => {
    setPage(next);
    if (embedded) onNavigate?.(next);
    else { const url = new URL(window.location.href); url.searchParams.set("page", next); window.history.replaceState({}, "", url); }
  };
  const manager = actor.permissions.includes("workforce.employee.read");
  const pages = manager ? PAGES : PAGES.filter(([key]) => key === "self");
  const shared = { actor, state, repository, run, busy };
  const Component = { overview: OverviewPage, employees: EmployeesPage, schedule: SchedulePage, leave: LeavePage,
    skills: SkillsPage, time: TimePage, self: SelfServicePage }[page] || (manager ? OverviewPage : SelfServicePage);

  return <div className={`wf-app ${embedded ? "wf-app--embedded" : ""}`}>
    {!embedded && <header className="wf-topbar"><div className="wf-brand"><span className="wf-mark">V</span><span>VEYRO <small>SYSTEMS</small></span></div>
      <div className="wf-env"><span className="wf-live-dot" /> Ændringer gemmes automatisk</div>
      {!actorProp && <label className="wf-role">Vis som <select value={demoRole} onChange={(event) => { setDemoRole(event.target.value); navigate(event.target.value === "manager" ? "overview" : "self"); }}><option value="manager">Leder</option><option value="employee">Medarbejder</option></select></label>}
    </header>}
    <div className="wf-workspace">
      {!embedded && <aside className="wf-sidebar"><div className="wf-module-title"><span>WORKFORCE</span><small>Medarbejdere & arbejdstid</small></div>
        <nav aria-label="WORKFORCE-navigation">{pages.map(([key, label]) => <button key={key} className={page === key ? "active" : ""} onClick={() => navigate(key)}>{label}</button>)}</nav>
      </aside>}
      <main className="wf-main">{error && <div className="wf-error" role="alert">{error}<button onClick={() => setError("")}>Luk</button></div>}
        {!state ? <div className="wf-loading">Henter WORKFORCE…</div> : <Component {...shared} navigate={navigate} />}
      </main>
    </div>
  </div>;
}
