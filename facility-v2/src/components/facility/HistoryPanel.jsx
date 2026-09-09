import { Icon } from '../shared/Icon';
import { EntityDialog } from './EntityDialog';

const FIELD_LABELS = { number: 'Nummer', name: 'Navn', type: 'Type', address: 'Adresse', city: 'By', administrativeStatus: 'Administrativ status', registeredArea: 'Registreret areal', placementPath: 'Placering', physicalLocation: 'Fysisk placering', servedAreaIds: 'Betjener', functionStatus: 'Funktion' };

export function HistoryPanel({ entityType, entityId, history, onClose }) {
  const events = history.filter((item) => item.entityType === entityType && item.entityId === entityId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return (
    <EntityDialog title="Historik" description="Gemte hændelser ændres ikke ved senere omdøbning eller flytning." onClose={onClose} wide>
      <div className="history-list">
        {events.length ? events.map((event) => (
          <article key={event.id}><span className="history-marker"><Icon name="tasks" size={15} /></span><div><header><strong>{event.action}</strong><time>{new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.timestamp))}</time></header><p>{event.snapshot?.name}{event.snapshot?.path ? ` · ${event.snapshot.path}` : ''}</p>{event.changes?.length > 0 && <ul>{event.changes.map((change, index) => <li key={`${change.field}-${index}`}><b>{FIELD_LABELS[change.field] ?? change.field}:</b> {change.before} → {change.after}</li>)}</ul>}{event.reason && <p><b>Begrundelse:</b> {event.reason}</p>}<small>{event.actor.name} · ikke verificeret identitet</small></div></article>
        )) : <div className="empty-state"><strong>Ingen registreret historik</strong><span>Etape 1-data har ikke fået opfundet fortidige hændelser.</span></div>}
      </div>
      <footer className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Luk</button></footer>
    </EntityDialog>
  );
}
