import { useMemo, useState } from 'react';
import { useFacilityData } from '../../data/FacilityDataContext';
import { getDescendantIds, getLocationPath, LOCATION_TYPES } from '../../domain/facilityDomain';
import { EntityDialog, Field, FormFeedback } from './EntityDialog';

export function LocationForm({ propertyId, parentId = null, node, onClose }) {
  const { dataset, runMutation } = useFacilityData();
  const initial = useMemo(() => node ? { ...node, reason: '' } : { propertyId, parentId: parentId ?? '', type: parentId ? 'room' : 'building', name: '', number: '', description: '', reason: '' }, [node, parentId, propertyId]);
  const [form, setForm] = useState(initial); const [dirty, setDirty] = useState(false); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const excluded = new Set(node ? [node.id, ...getDescendantIds(dataset, node.id)] : []);
  const nodes = dataset.locationNodes.filter((item) => item.propertyId === propertyId && !item.archivedAt && !excluded.has(item.id));
  const change = (field) => (event) => { setForm((value) => ({ ...value, [field]: event.target.value })); setDirty(true); setError(null); };
  async function submit(event) { event.preventDefault(); setBusy(true); setError(null); try { node ? await runMutation('updateLocationNode', node.id, node.revision, form) : await runMutation('createLocationNode', form); setDirty(false); onClose(); } catch (reason) { setError(reason); } finally { setBusy(false); } }
  const fieldError = (name) => error?.fieldErrors?.[name];
  return <EntityDialog title={node ? 'Rediger eller flyt lokationspost' : 'Tilføj underpost'} description="Flytning foregår inden for samme ejendom og bevarer postens interne ID." onClose={onClose} dirty={dirty}><form className="entity-form" onSubmit={submit}><FormFeedback error={error} /><div className="form-grid">
    <Field label="Type" required error={fieldError('type')}><select value={form.type} onChange={change('type')}>{Object.entries(LOCATION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="Navn" required error={fieldError('name')}><input value={form.name} onChange={change('name')} autoFocus /></Field>
    <Field label="Synligt nummer"><input value={form.number} onChange={change('number')} /></Field>
    <Field label="Forælder" error={fieldError('parentId')}><select value={form.parentId ?? ''} onChange={change('parentId')}><option value="">Ejendommen (øverste niveau)</option>{nodes.map((item) => <option key={item.id} value={item.id}>{getLocationPath(dataset, propertyId, item.id)}</option>)}</select></Field>
    <Field label="Beskrivelse eller bemærkning"><textarea rows="3" value={form.description} onChange={change('description')} /></Field>
    {node && node.parentId !== form.parentId && <Field label="Bemærkning til flytning"><input value={form.reason} onChange={change('reason')} placeholder="Valgfri i denne etape" /></Field>}
  </div><footer className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuller</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Gemmer …' : 'Gem lokation'}</button></footer></form></EntityDialog>;
}
