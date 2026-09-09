import { Link } from 'react-router-dom';
import { useFacilityData } from '../data/FacilityDataContext';
import { EntityPath, PageTitle, TaskBadge } from '../components/workflow/WorkflowShared';

export function TasksPage() {
  const { dataset } = useFacilityData();
  return <main className="workflow-page"><PageTitle title="Opgaver" description="Interne og eksterne opgaver med stabile opgave- og bestillingsnumre." /><section className="card workflow-section"><div className="table-scroll"><table><thead><tr><th>Opgave</th><th>Sag</th><th>Ejendom og installation</th><th>Tildelt</th><th>Frist</th><th>Status</th><th></th></tr></thead><tbody>{dataset.tasks.map((item) => { const caseRecord = dataset.cases.find((value) => value.id === item.caseId); return <tr key={item.id}><td><strong>{item.taskNumber ?? item.id}</strong><small>{item.title}</small></td><td>{caseRecord ? <Link className="row-link" to={`/facility/sager/${caseRecord.id}`}>{caseRecord.reference}</Link> : '—'}</td><td><EntityPath dataset={dataset} record={item} /></td><td>{item.assignmentType === 'external' ? dataset.suppliers.find((s) => s.id === item.supplierId)?.name : dataset.resources.find((r) => r.id === item.resourceId)?.name}</td><td>{item.dueDate || '—'}</td><td><TaskBadge value={item.status} /></td><td><Link className="row-link" to={`/facility/opgaver/${item.id}`}>Åbn opgave</Link></td></tr>; })}</tbody></table></div></section></main>;
}
