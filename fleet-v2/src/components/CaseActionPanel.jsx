import { useEffect, useMemo, useState } from "react";
import { ALLOWED_TRANSITIONS, CASE_PRIORITIES, CASE_STATUSES, DEMO_ACTORS, validateTransition } from "../data/caseWorkflow";
import { Icon } from "./Icon";
import { CaseStatusConfirmDialog, needsBackToNewConfirmation } from "./CaseStatusConfirmDialog";

export function CaseActionPanel({ caseItem, report, onUpdate, compact = false }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  useEffect(() => setValues({ priority: caseItem?.priority || "normal", assigneeId: caseItem?.assigneeId || "", dueDate: caseItem?.dueDate || "", nextAction: caseItem?.nextAction || "", internalNote: "", status: "", reason: "", resolution: "", releaseBlock: false, releaseReason: "" }), [caseItem]);
  const targetOptions = useMemo(() => caseItem ? ALLOWED_TRANSITIONS[caseItem.status] || [] : [], [caseItem]);
  if (!caseItem) return <section className="case-action-panel empty"><h2>Vælg en sag</h2><p>Vurdering og handling vises her.</p></section>;
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const performSave = async () => {
    const validation = values.status ? validateTransition(caseItem, values.status, values, report) : {};
    if (Object.keys(validation).length) { setError(Object.values(validation)[0]); return; }
    setBusy(true); setError("");
    try { await onUpdate(caseItem.id, { ...values, expectedStatus: caseItem.status }, DEMO_ACTORS[1]); set("internalNote", ""); set("reason", ""); set("resolution", ""); set("releaseReason", ""); set("status", ""); setConfirmBack(false); }
    catch (cause) { setError(cause.message || "Sagen kunne ikke gemmes."); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (needsBackToNewConfirmation(caseItem, values.status)) { setConfirmBack(true); return; }
    performSave();
  };
  const terminal = values.status === "rejected" || values.status === "completed";
  const reopening = ["completed", "rejected"].includes(caseItem.status) && values.status === "assessing";
  return <section className={`case-action-panel${compact ? " compact" : ""}`}>
    <header><div><span className="eyebrow">Lokal prototypelogning</span><h2>Vurdering og handling</h2></div><span className={`status-badge ${caseItem.priority}`}><i />{CASE_PRIORITIES[caseItem.priority]}</span></header>
    <div className="case-action-fields">
      <label>Vurderet prioritet<select aria-label="Vurderet prioritet" value={values.priority || "normal"} onChange={(event) => set("priority", event.target.value)}>{Object.entries(CASE_PRIORITIES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Ansvarlig<select aria-label="Ansvarlig" value={values.assigneeId || ""} onChange={(event) => set("assigneeId", event.target.value)}><option value="">Ikke tildelt</option>{DEMO_ACTORS.filter((item) => item.id !== "demo-mette").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>
      <label>Frist<input aria-label="Frist" type="date" value={values.dueDate || ""} onChange={(event) => set("dueDate", event.target.value)} /></label>
      <label>Næste handling<input aria-label="Næste handling" value={values.nextAction || ""} onChange={(event) => set("nextAction", event.target.value)} /></label>
      <label>Intern note<textarea aria-label="Intern note" rows="3" value={values.internalNote || ""} onChange={(event) => set("internalNote", event.target.value)} placeholder="Tilføjes til den fælles tidslinje" /></label>
      <label>Flyt status<select aria-label="Flyt status" value={values.status || ""} onChange={(event) => set("status", event.target.value)}><option value="">Behold {CASE_STATUSES[caseItem.status]}</option>{targetOptions.map((status) => <option value={status} key={status}>{CASE_STATUSES[status]}</option>)}</select></label>
      {values.status === "rejected" || reopening ? <label>{reopening ? "Begrundelse for genåbning" : "Begrundelse for afvisning"}<textarea aria-label="Begrundelse" rows="3" value={values.reason || ""} onChange={(event) => set("reason", event.target.value)} /></label> : null}
      {values.status === "completed" ? <label>Beskrivelse af løsning<textarea aria-label="Beskrivelse af løsning" rows="3" value={values.resolution || ""} onChange={(event) => set("resolution", event.target.value)} /></label> : null}
      {terminal && report?.usability === "blocked" ? <fieldset><legend>Enhedsspærring</legend><label className="radio-line"><input type="checkbox" checked={values.releaseBlock || false} onChange={(event) => set("releaseBlock", event.target.checked)} />Ophæv spærring efter eksplicit vurdering</label>{values.releaseBlock ? <label>Begrundelse<input aria-label="Begrundelse for ophævelse" value={values.releaseReason || ""} onChange={(event) => set("releaseReason", event.target.value)} /></label> : <small>Spærringen forbliver aktiv, selv om sagen afsluttes.</small>}</fieldset> : null}
      {error ? <div className="form-alert danger" role="alert">{error}</div> : null}
      <button className="primary-button full" type="button" onClick={save} disabled={busy}><Icon name="check" size={16} />{busy ? "Gemmer …" : "Gem vurdering"}</button>
      <small className="prototype-note">Handlinger gemmes lokalt og er ikke et produktionssikret auditspor.</small>
    </div>
    {confirmBack ? <CaseStatusConfirmDialog caseItem={caseItem} busy={busy} onCancel={() => { setConfirmBack(false); set("status", ""); }} onConfirm={performSave} /> : null}
  </section>;
}
