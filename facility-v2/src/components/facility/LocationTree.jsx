import { useState } from 'react';
import { useFacilityData } from '../../data/FacilityDataContext';
import { LOCATION_TYPES } from '../../domain/facilityDomain';
import { Icon } from '../shared/Icon';
import { FormFeedback } from './EntityDialog';
import { LocationForm } from './LocationForm';
import { ReasonDialog } from './ReasonDialog';

function typeIcon(type) {
  return ['building', 'floor', 'room', 'commonArea'].includes(type) ? 'building' : type === 'outdoorArea' ? 'map' : 'installation';
}

function TreeNode({ node, nodes, level, expanded, toggle, selectedId, select }) {
  const children = nodes.filter((item) => item.parentId === node.id);
  const open = expanded.has(node.id);
  return <li><div className={`tree-row${selectedId === node.id ? ' is-selected' : ''}${node.archivedAt ? ' is-archived' : ''}`} style={{ '--tree-level': level }}><button type="button" className="tree-toggle" onClick={() => toggle(node.id)} aria-label={open ? 'Fold sammen' : 'Fold ud'} disabled={!children.length}><Icon name="chevron" size={14} /></button><button type="button" className="tree-select" onClick={() => select(node.id)}><Icon name={typeIcon(node.type)} size={17} /><span><strong>{node.name}</strong><small>{LOCATION_TYPES[node.type]}{node.number ? ` · ${node.number}` : ''}</small></span>{node.archivedAt && <b className="archive-badge">Arkiveret</b>}</button></div>{open && children.length > 0 && <ul>{children.map((child) => <TreeNode key={child.id} node={child} nodes={nodes} level={level + 1} expanded={expanded} toggle={toggle} selectedId={selectedId} select={select} />)}</ul>}</li>;
}

export function LocationTree({ property, includeArchived = true, onSelectNode }) {
  const { dataset, runMutation } = useFacilityData(); const allNodes = dataset.locationNodes.filter((item) => item.propertyId === property.id); const nodes = includeArchived ? allNodes : allNodes.filter((item) => !item.archivedAt);
  const [expanded, setExpanded] = useState(() => new Set(nodes.filter((item) => !item.parentId || item.type === 'building').map((item) => item.id))); const [selectedId, setSelectedId] = useState(null); const [form, setForm] = useState(null); const [archiveNode, setArchiveNode] = useState(null); const [error, setError] = useState(null);
  const selected = allNodes.find((item) => item.id === selectedId);
  const toggle = (id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const select = (id) => { setSelectedId(id); onSelectNode?.(id); setError(null); };
  async function restore(node) { setError(null); try { await runMutation('restoreLocationNode', node.id, node.revision); } catch (reason) { setError(reason); } }
  return <section className="location-tree-panel"><div className="section-heading"><div><h2>Bygningsstruktur</h2><p>Fleksibelt hierarki med stabile interne ID’er</p></div><button type="button" className="secondary-button" onClick={() => setForm({ mode: 'create', parentId: null })}>+ Tilføj øverst</button></div><FormFeedback error={error} />
    {nodes.length ? <ul className="location-tree">{nodes.filter((item) => !item.parentId).map((node) => <TreeNode key={node.id} node={node} nodes={nodes} level={0} expanded={expanded} toggle={toggle} selectedId={selectedId} select={select} />)}</ul> : <div className="empty-state compact"><strong>Ingen bygningsstruktur endnu</strong><span>Tilføj fx en bygning eller et udendørsareal.</span></div>}
    {selected && <div className="tree-actions"><div><strong>{selected.name}</strong><span>{LOCATION_TYPES[selected.type]}{selected.archivedAt ? ' · Arkiveret' : ''}</span></div>{!selected.archivedAt ? <><button type="button" className="secondary-button" onClick={() => setForm({ mode: 'create', parentId: selected.id })}>Tilføj underpost</button><button type="button" className="secondary-button" onClick={() => setForm({ mode: 'edit', node: selected })}>Rediger/flyt</button><button type="button" className="text-danger-button" onClick={() => setArchiveNode(selected)}>Arkivér</button></> : <button type="button" className="secondary-button" onClick={() => restore(selected)}>Gendan</button>}</div>}
    {form && <LocationForm propertyId={property.id} parentId={form.parentId} node={form.node} onClose={() => setForm(null)} />}
    {archiveNode && <ReasonDialog title={`Arkivér ${archiveNode.name}`} description="Posten arkiveres kun, hvis den ikke har aktive underposter eller installationsrelationer." onClose={() => setArchiveNode(null)} onConfirm={(reason) => runMutation('archiveLocationNode', archiveNode.id, archiveNode.revision, reason)} />}
  </section>;
}
