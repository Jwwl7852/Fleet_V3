import { useState } from 'react';
import { EntityDialog, Field, FormFeedback } from './EntityDialog';

export function ReasonDialog({ title, description, confirmLabel = 'Arkivér', onClose, onConfirm }) {
  const [reason, setReason] = useState(''); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(null); try { await onConfirm(reason); onClose(); } catch (value) { setError(value); } finally { setBusy(false); } }
  return <EntityDialog title={title} description={description} onClose={onClose} dirty={Boolean(reason)}><form className="entity-form" onSubmit={submit}><FormFeedback error={error} /><Field label="Begrundelse" required error={error?.fieldErrors?.reason}><textarea rows="4" value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></Field><footer className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuller</button><button type="submit" className="danger-button" disabled={busy}>{busy ? 'Behandler …' : confirmLabel}</button></footer></form></EntityDialog>;
}
