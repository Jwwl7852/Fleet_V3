import { useMemo, useState } from 'react';
import { useFacilityData } from '../../data/FacilityDataContext';
import { EntityDialog, Field, FormFeedback } from '../facility/EntityDialog';
import { DocumentVersionPicker } from './WorkflowShared';

export function TaskForm({ caseRecord, task, onClose, onSaved }) {
  const { dataset, runMutation } = useFacilityData();
  const initial = useMemo(() => ({
    caseId: caseRecord?.id ?? task?.caseId ?? '', title: task?.title ?? caseRecord?.title ?? '',
    description: task?.description ?? caseRecord?.description ?? '', assignmentType: task?.assignmentType ?? 'internal',
    resourceId: task?.resourceId ?? '', supplierId: task?.supplierId ?? '', contactId: task?.contactId ?? '',
    dueDate: task?.dueDate ?? caseRecord?.dueDate ?? '', priority: task?.priority ?? caseRecord?.priority ?? 'normal',
    amountType: task?.amountType ?? 'estimate', amount: task?.amount ?? '', attachmentVersionIds: task?.attachmentVersionIds ?? [],
    manualWithoutMail: task?.manualWithoutMail ?? false, manualWithoutMailReason: task?.manualWithoutMailReason ?? '',
    checklistText: task?.checklist?.map((item) => item.label).join('\n') ?? 'Kontrollér sikker afspærring\nDokumentér udført arbejde',
  }), [caseRecord, task]);
  const [form, setForm] = useState(initial); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const change = (name) => (event) => setForm((value) => ({ ...value, [name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const payload = { ...form, checklist: form.checklistText.split('\n').map((item) => item.trim()).filter(Boolean) };
      const result = task ? await runMutation('updateTask', task.id, task.revision, payload) : await runMutation('createTask', payload);
      onSaved?.(result.entity); onClose();
    } catch (reason) { setError(reason); } finally { setBusy(false); }
  }
  const supplier = dataset.suppliers.find((item) => item.id === form.supplierId);
  return <EntityDialog title={task ? 'Rediger opgave' : 'Opret opgave'} description="Opgave-ID, sagsreference og eventuelt bestillingsnummer er separate, stabile identiteter." onClose={onClose} dirty wide><form className="entity-form" onSubmit={submit}><FormFeedback error={error} /><div className="form-grid two-columns">
    <Field label="Titel" required className="span-two"><input value={form.title} onChange={change('title')} autoFocus /></Field>
    <Field label="Beskrivelse" className="span-two"><textarea rows="3" value={form.description} onChange={change('description')} /></Field>
    <Field label="Tildeling"><select value={form.assignmentType} onChange={change('assignmentType')}><option value="internal">Intern tekniker</option><option value="external">Ekstern leverandør</option></select></Field>
    {form.assignmentType === 'internal' ? <Field label="Intern ressource" required><select value={form.resourceId} onChange={change('resourceId')}><option value="">Vælg ressource</option>{dataset.resources.filter((item) => item.type === 'internal').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : <>
      <Field label="Leverandør" required><select value={form.supplierId} onChange={change('supplierId')}><option value="">Vælg leverandør</option>{dataset.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Kontakt"><select value={form.contactId} onChange={change('contactId')}><option value="">Vælg kontakt</option>{(supplier?.contacts ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></Field>
      <Field label="Manuel håndtering uden mail" className="span-two"><label className="check-row"><input type="checkbox" checked={form.manualWithoutMail} onChange={(event) => setForm((value) => ({ ...value, manualWithoutMail: event.target.checked }))} /> Bestillingen håndteres uden mail fra FACILITY</label></Field>
      {form.manualWithoutMail && <Field label="Begrundelse" required className="span-two"><textarea rows="2" value={form.manualWithoutMailReason} onChange={change('manualWithoutMailReason')} placeholder="Fx telefonisk aftale eller eksisterende leverandørportal" /></Field>}
    </>}
    <Field label="Ønsket dato / frist"><input type="date" value={form.dueDate} onChange={change('dueDate')} /></Field>
    <Field label="Prioritet"><select value={form.priority} onChange={change('priority')}><option value="acute">Akut</option><option value="high">Høj</option><option value="normal">Normal</option><option value="low">Lav</option></select></Field>
    <Field label="Beløbstype"><select value={form.amountType} onChange={change('amountType')}><option value="estimate">Estimat</option><option value="quote">Tilbud</option></select></Field>
    <Field label="Beløb ekskl. moms (DKK)"><input type="number" min="0" step="0.01" value={form.amount} onChange={change('amount')} /></Field>
    <Field label="Tjekliste – én linje pr. punkt" className="span-two"><textarea rows="3" value={form.checklistText} onChange={change('checklistText')} /></Field>
    <Field label="Dokumentversioner" className="span-two"><DocumentVersionPicker dataset={dataset} selected={form.attachmentVersionIds} onChange={(attachmentVersionIds) => setForm((value) => ({ ...value, attachmentVersionIds }))} /></Field>
  </div><footer className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuller</button><button className="primary-button" disabled={busy}>{busy ? 'Gemmer …' : 'Gem opgave'}</button></footer></form></EntityDialog>;
}
