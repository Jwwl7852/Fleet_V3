import { useMemo, useState } from 'react';
import { useFacilityData } from '../../data/FacilityDataContext';
import { suggestPropertyNumber } from '../../domain/facilityDomain';
import { EntityDialog, Field, FormFeedback } from './EntityDialog';

const emptyProperty = { number: '', name: '', type: '', address: '', postalCode: '', city: '', country: 'Danmark', administrativeStatus: 'active', registeredArea: '', constructionYear: '', energyLabel: '', managerName: '', managerEmail: '', managerPhone: '', description: '', notes: '', latitude: '', longitude: '' };

export function PropertyForm({ property, onClose, onSaved }) {
  const { dataset, runMutation } = useFacilityData();
  const initial = useMemo(() => property ? { ...emptyProperty, ...property, registeredArea: property.registeredArea === null ? '' : String(property.registeredArea).replace('.', ','), constructionYear: property.constructionYear ?? '' } : { ...emptyProperty, number: suggestPropertyNumber(dataset.properties) }, [dataset.properties, property]);
  const [form, setForm] = useState(initial); const [baseRevision] = useState(property?.revision); const [dirty, setDirty] = useState(false); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const change = (field) => (event) => { setForm((value) => ({ ...value, [field]: event.target.value })); setDirty(true); setError(null); };
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null);
    try { const result = property ? await runMutation('updateProperty', property.id, baseRevision, form) : await runMutation('createProperty', form); setDirty(false); onSaved?.(result.entity); onClose(); } catch (reason) { setError(reason); } finally { setBusy(false); }
  }
  const fieldError = (name) => error?.fieldErrors?.[name];
  return <EntityDialog title={property ? 'Rediger ejendom' : 'Tilføj ejendom'} description="Kun ejendomsnummer og navn er påkrævet. Oplysningerne er manuelt registrerede." onClose={onClose} dirty={dirty} wide><form onSubmit={submit} className="entity-form"><FormFeedback error={error} /><div className="form-grid two-columns">
    <Field label="Ejendomsnummer" required error={fieldError('number')}><input value={form.number} onChange={change('number')} autoFocus /></Field>
    <Field label="Navn" required error={fieldError('name')}><input value={form.name} onChange={change('name')} /></Field>
    <Field label="Ejendomstype"><select value={form.type} onChange={change('type')}><option value="">Ikke angivet</option><option>Kontor</option><option>Lager</option><option>Bolig</option><option>Blandet erhverv</option><option>Andet</option></select></Field>
    <Field label="Administrativ status" error={fieldError('administrativeStatus')}><select value={form.administrativeStatus} onChange={change('administrativeStatus')}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select></Field>
    <Field label="Adresse"><input value={form.address} onChange={change('address')} /></Field>
    <div className="form-grid postal-grid"><Field label="Postnummer"><input value={form.postalCode} onChange={change('postalCode')} /></Field><Field label="By"><input value={form.city} onChange={change('city')} /></Field></div>
    <Field label="Land"><input value={form.country} onChange={change('country')} /></Field>
    <Field label="Registreret areal (m²)" error={fieldError('registeredArea')} hint="Manuelt registreret; dansk decimalkomma understøttes."><input inputMode="decimal" value={form.registeredArea} onChange={change('registeredArea')} placeholder="Fx 1.250,5" /></Field>
    <Field label="Opførelsesår" error={fieldError('constructionYear')}><input inputMode="numeric" value={form.constructionYear} onChange={change('constructionYear')} /></Field>
    <Field label="Energimærke (valgfrit)"><input value={form.energyLabel} onChange={change('energyLabel')} /></Field>
    <Field label="Ejendomsansvarlig"><input value={form.managerName} onChange={change('managerName')} /></Field>
    <Field label="E-mail"><input type="email" value={form.managerEmail} onChange={change('managerEmail')} /></Field>
    <Field label="Telefon"><input value={form.managerPhone} onChange={change('managerPhone')} /></Field>
    <Field label="Breddegrad" error={fieldError('latitude')} hint="Manuelt registreret placering."><input inputMode="decimal" value={form.latitude ?? ''} onChange={change('latitude')} placeholder="Fx 56,1715" /></Field>
    <Field label="Længdegrad" error={fieldError('longitude')} hint="Ingen automatisk geokodning."><input inputMode="decimal" value={form.longitude ?? ''} onChange={change('longitude')} placeholder="Fx 10,1882" /></Field>
    <Field label="Beskrivelse" className="span-two"><textarea rows="3" value={form.description} onChange={change('description')} /></Field>
    <Field label="Bemærkninger" className="span-two"><textarea rows="3" value={form.notes} onChange={change('notes')} /></Field>
  </div><footer className="dialog-actions"><button type="button" className="secondary-button" onClick={() => { if (!dirty || window.confirm('Vil du annullere uden at gemme?')) onClose(); }}>Annuller</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Gemmer …' : 'Gem ejendom'}</button></footer></form></EntityDialog>;
}
