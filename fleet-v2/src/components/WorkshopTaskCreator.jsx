import { useRef, useState } from "react";
import { DEMO_ACTORS } from "../data/caseWorkflow";
import { ACTIVE_WORKSHOP_STATUSES } from "../data/workshopWorkflow";
import { Icon } from "./Icon";

export function WorkshopTaskCreator({ caseItem, report, relations, onCreate, onClose, onNavigate }) {
  const existing = (relations.workshopTasks || []).find((item) => item.caseId === caseItem.id && ACTIVE_WORKSHOP_STATUSES.has(item.status));
  const [values, setValues] = useState({
    title: report?.title || "Værkstedsbehandling",
    workshopId: relations.workshops?.[0]?.id || "",
    assigneeId: "demo-sara",
    workDescription: report?.description || "",
    checklistText: "Kontrollér det meldte problem\nDokumentér udført arbejde\nAfslut med sikkerhedsvurdering",
    expectedCompletionAt: "",
    expectedCost: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!values.title.trim() || !values.workshopId || !values.workDescription.trim()) { setError("Udfyld titel, værksted og arbejdsbeskrivelse."); return; }
    submitting.current = true; setBusy(true); setError("");
    try {
      const result = await onCreate(caseItem.id, { ...values, checklist: values.checklistText.split("\n").filter((text) => text.trim()).map((text) => ({ text })) }, DEMO_ACTORS[2]);
      onNavigate(`/vaerksted/${result.task.id}`);
    } catch (cause) {
      setError(cause.message || "Værkstedsopgaven kunne ikke oprettes.");
      submitting.current = false;
      setBusy(false);
    }
  };
  if (existing) return <div className="modal-backdrop"><section className="workshop-dialog compact" role="dialog" aria-modal="true" aria-labelledby="existing-workshop-title"><button className="dialog-close" onClick={onClose} type="button" aria-label="Luk"><Icon name="close" /></button><h2 id="existing-workshop-title">Aktiv værkstedsopgave findes</h2><p>Sagen er allerede knyttet til {existing.number}. Der oprettes ikke en dublet.</p><button className="primary-button full" type="button" onClick={() => onNavigate(`/vaerksted/${existing.id}`)}>Åbn {existing.number}</button></section></div>;
  return <div className="modal-backdrop"><form className="workshop-dialog" role="dialog" aria-modal="true" aria-labelledby="create-workshop-title" onSubmit={submit}>
    <header><div><span className="eyebrow">{caseItem.number} · lokal prototype</span><h2 id="create-workshop-title">Opret værkstedsopgave</h2><p>Oplysninger og billeder følger automatisk den eksisterende sag.</p></div><button className="dialog-close" onClick={onClose} type="button" aria-label="Luk"><Icon name="close" /></button></header>
    <div className="workshop-form-grid">
      <label>Titel<input aria-label="Opgavetitel" value={values.title} onChange={(event) => set("title", event.target.value)} /></label>
      <label>Værksted<select aria-label="Vælg værksted" value={values.workshopId} onChange={(event) => set("workshopId", event.target.value)}>{(relations.workshops || []).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.kind === "internal" ? "Internt" : "Eksternt"}</option>)}</select></label>
      <label>Ansvarlig<select aria-label="Værkstedsansvarlig" value={values.assigneeId} onChange={(event) => set("assigneeId", event.target.value)}>{DEMO_ACTORS.slice(1).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Forventet færdig<input aria-label="Forventet færdig" type="datetime-local" value={values.expectedCompletionAt} onChange={(event) => set("expectedCompletionAt", event.target.value)} /></label>
      <label className="span-2">Arbejdsbeskrivelse<textarea aria-label="Arbejdsbeskrivelse" rows="4" value={values.workDescription} onChange={(event) => set("workDescription", event.target.value)} /></label>
      <label>Tjekliste, én linje pr. punkt<textarea aria-label="Tjekliste" rows="4" value={values.checklistText} onChange={(event) => set("checklistText", event.target.value)} /></label>
      <label>Forventet omkostning ekskl. moms<input aria-label="Forventet omkostning" inputMode="decimal" value={values.expectedCost} onChange={(event) => set("expectedCost", event.target.value.replace(",", "."))} placeholder="Ukendt" /></label>
    </div>
    {error ? <div className="form-alert danger" role="alert">{error}</div> : null}
    <footer><button className="secondary-button" type="button" onClick={onClose}>Annuller</button><button className="primary-button" type="submit" disabled={busy}><Icon name="plus" size={16} />{busy ? "Opretter …" : "Opret opgave"}</button></footer>
  </form></div>;
}
