import { useEffect, useMemo, useState } from "react";
import { DEMO_ACTORS, CASE_PRIORITIES } from "../data/caseWorkflow";
import { modelLabel } from "../data/unitSelectors";

export function ManualCaseDialog({ units, onCreate, onClose, onNavigate }) {
  const [values, setValues] = useState({ unitId: units[0]?.id || "", title: "", description: "", priority: "normal", nextAction: "Vurder manuel sag", noMailReason: "Aftale håndteres uden mail" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const validation = useMemo(() => ({ unitId: values.unitId ? "" : "Vælg en enhed.", title: values.title.trim() ? "" : "Angiv en sagstitel." }), [values]);
  const dirty = Boolean(values.title.trim() || values.description.trim() || values.priority !== "normal" || values.nextAction !== "Vurder manuel sag");
  const attemptClose = () => { if (!dirty || globalThis.confirm("Dine ugemte ændringer går tabt. Vil du lukke sagen?")) onClose(); };
  useEffect(() => {
    const key = (event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); attemptClose(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const save = async () => {
    if (validation.unitId || validation.title) { setError(validation.unitId || validation.title); return; }
    setBusy(true); setError("");
    try { const result = await onCreate(values, DEMO_ACTORS[1]); onNavigate(`/sager/${result.caseItem.id}`); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="manual-case-title" onMouseDown={(event) => { if (event.target === event.currentTarget) attemptClose(); }}><section className="unit-form-dialog compact-dialog"><header><div><span className="eyebrow">Lokal prototype</span><h2 id="manual-case-title">Ny manuel sag</h2><p>Oprettes uden forudgående indberetning og kan gemmes uden mail.</p></div><button type="button" aria-label="Luk manuel sag" onClick={attemptClose}>×</button></header><div className="form-two-cols"><label className="span-all">Enhed<select value={values.unitId} onChange={(event) => setValues({ ...values, unitId: event.target.value })} aria-invalid={Boolean(validation.unitId)}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.number} · {modelLabel(unit)}</option>)}</select>{error && validation.unitId ? <small className="field-error">{validation.unitId}</small> : null}</label><label className="span-all">Sagstitel<input autoFocus aria-label="Manuel sagstitel" aria-invalid={Boolean(validation.title)} value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} />{error && validation.title ? <small className="field-error">{validation.title}</small> : null}</label><label className="span-all">Beskrivelse<textarea rows="4" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label><label>Prioritet<select value={values.priority} onChange={(event) => setValues({ ...values, priority: event.target.value })}>{Object.entries(CASE_PRIORITIES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Næste handling<input value={values.nextAction} onChange={(event) => setValues({ ...values, nextAction: event.target.value })} /></label></div>{error ? <div className="form-alert danger" role="alert">{error}</div> : null}<footer><button className="secondary-button" onClick={attemptClose} type="button">Annuller</button><button className="primary-button" disabled={busy} onClick={save} type="button">{busy ? "Gemmer …" : "Opret sag"}</button></footer></section></div>;
}
