import { FacilityLink as Link } from '../../routing/FacilityRouting';
import { CASE_STATUSES, PRIORITIES, TASK_STATUSES } from '../../domain/workflowDomain';
import { getLocationPath } from '../../domain/facilityDomain';

export function PageTitle({ eyebrow = 'FACILITY', title, description, action }) {
  return <div className="page-heading workflow-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function CaseBadge({ value }) { return <span className={`workflow-badge case-${value}`}>{CASE_STATUSES[value] ?? value}</span>; }
export function PriorityBadge({ value }) { return <span className={`workflow-badge priority-${value}`}>{PRIORITIES[value] ?? value}</span>; }
export function TaskBadge({ value }) { return <span className={`workflow-badge task-${value}`}>{TASK_STATUSES[value] ?? value}</span>; }

export function EntityPath({ dataset, record }) {
  const property = dataset.properties.find((item) => item.id === record.propertyId);
  const installation = dataset.installations.find((item) => item.id === record.installationId);
  return <span>{property?.number} · {property?.name}{record.locationId ? ` · ${getLocationPath(dataset, record.propertyId, record.locationId)}` : ''}{installation ? ` · ${installation.number}` : ''}</span>;
}

export function Empty({ title, text }) { return <div className="empty-state"><strong>{title}</strong>{text && <span>{text}</span>}</div>; }

export function RelatedDocuments({ dataset, versionIds = [] }) {
  const rows = versionIds.map((id) => {
    const document = dataset.documents.find((item) => item.versions.some((version) => version.id === id));
    const version = document?.versions.find((item) => item.id === id); return document && version ? { document, version } : null;
  }).filter(Boolean);
  if (!rows.length) return <Empty title="Ingen bilag" text="Bilag og dokumentversioner vises her." />;
  return <ul className="attachment-list">{rows.map(({ document, version }) => <li key={version.id}><span><strong>{document.title}</strong><small>Version {version.number} · {(version.size / 1024).toFixed(0)} KB</small></span><Link to={`/facility/dokumenter?document=${document.id}&version=${version.id}`}>Åbn</Link></li>)}</ul>;
}

export function DocumentVersionPicker({ dataset, selected, onChange }) {
  const versions = dataset.documents.filter((item) => !item.archivedAt).map((document) => ({ document, version: document.versions.find((item) => item.id === document.currentVersionId) })).filter((item) => item.version);
  if (!versions.length) return <p className="muted-copy">Ingen dokumentversioner er tilgængelige. Upload dokumenter i Dokumenter først.</p>;
  return <div className="checkbox-grid compact-checks">{versions.map(({ document, version }) => <label key={version.id}><input type="checkbox" checked={selected.includes(version.id)} onChange={() => onChange(selected.includes(version.id) ? selected.filter((id) => id !== version.id) : [...selected, version.id])} /> {document.title} <small>v{version.number}</small></label>)}</div>;
}
