import { FacilityLink as Link } from '../../routing/FacilityRouting';
import { DEMO_USER_ID } from '../../data/fixtures';
import { useFacilityData } from '../../data/FacilityDataContext';
import { formatMoney, selectOverview } from '../../data/overviewSelectors';
import { Icon } from '../shared/Icon';
import { CostChart } from './CostChart';
import { PropertyIllustration } from './PropertyIllustration';
import { ProfileImage } from '../facility/ImageGallery';

const dateFormatter = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function formatDate(value) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function KpiCard({ icon, value, title, note, href }) {
  return (
    <Link className="kpi-card" to={href}>
      <span className="kpi-icon"><Icon name={icon} size={25} /></span>
      <span className="kpi-copy"><strong>{value}</strong><b>{title}</b><small>{note}</small></span>
      <Icon name="chevron" size={19} className="kpi-arrow" />
    </Link>
  );
}

function LoadingState() {
  return <section className="state-page"><span className="loading-dot" /><h1>FACILITY indlæses</h1><p>Den lokale database åbnes.</p></section>;
}

export function OverviewPage() {
  const { dataset, error } = useFacilityData();
  if (error) return <section className="state-page error"><Icon name="info" size={28} /><h1>Data kunne ikke indlæses</h1><p>{error.message}</p></section>;
  if (!dataset) return <LoadingState />;
  const overview = selectOverview(dataset, DEMO_USER_ID);

  return (
    <div className="overview-page">
      <div className="page-heading">
        <div><span className="eyebrow">FACILITY</span><h1>Overblik</h1><p>Et samlet overblik over ejendomme, sager, service og registrerede demoomkostninger.</p></div>
        <div className="reference-date"><Icon name="calendar" size={18} /><span><small>Fast demo-reference</small>{formatDate(dataset.referenceDate)}</span></div>
      </div>

      <section className="kpi-grid" aria-label="Nøgletal">
        <KpiCard icon="building" value={overview.propertyCount} title="Ejendomme" note="I demoporteføljen" href="/facility/ejendomme" />
        <KpiCard icon="report" value={overview.openCaseCount} title="Åbne sager" note="Kræver fortsat handling" href="/facility/arbejdsko" />
        <KpiCard icon="service" value={overview.upcomingServiceCount} title="Kommende service" note="Næste 30 dage" href="/facility/service" />
        <KpiCard icon="chart" value={formatMoney(overview.registeredCostTotal, dataset.financialPeriod.currency)} title="Registrerede demoomkostninger" note={`${dataset.financialPeriod.label} · ${dataset.financialPeriod.vatBasis}`} href="/facility/oekonomi" />
      </section>

      <section className="overview-primary-grid">
        <article className="card recent-properties-card">
          <div className="card-header"><div><h2>Seneste ejendomme</h2><p>Senest registreret i datasættet</p></div><Link to="/facility/ejendomme">Se alle <Icon name="chevron" size={15} /></Link></div>
          {overview.recentProperties.length ? (
            <div className="property-list">
              {overview.recentProperties.map((property) => (
                <Link to={`/facility/ejendomme/${property.id}`} className="property-tile" key={property.id}>
                  <ProfileImage entity={property} variant={property.illustration} fallback={(variant) => <PropertyIllustration variant={variant} />} />
                  <small>{property.number}</small><strong>{property.name}</strong><span>{property.postalCode} {property.city}</span>
                </Link>
              ))}
            </div>
          ) : <div className="empty-state"><strong>Ingen ejendomme endnu</strong><span>Ejendomme bliver vist her, når datasættet indeholder dem.</span></div>}
        </article>

        <article className="card cost-card">
          <div className="card-header"><div><h2>Registrerede demoomkostninger</h2><p>{dataset.financialPeriod.label} · {dataset.financialPeriod.currency}</p></div><span className="legend"><i /> Registreret</span></div>
          <CostChart values={overview.monthlyCosts} currency={dataset.financialPeriod.currency} hasData={overview.costHasData} />
          <p className="data-disclaimer"><Icon name="info" size={15} /> Ikke fakturakontrollerede beløb. Budgetter og estimater indgår ikke.</p>
        </article>

        <article className="card task-card">
          <div className="card-header"><div><h2>Mine opgaver</h2><p>Tildelt demobrugeren Dennis</p></div><Link to="/facility/opgaver">Se alle <Icon name="chevron" size={15} /></Link></div>
          {overview.myTasks.length ? <ul className="task-list">{overview.myTasks.slice(0, 5).map((task) => (
            <li key={task.id}><span className={`priority-dot ${task.priority}`} /><div><strong>{task.caseRecord?.reference ? `${task.caseRecord.reference} · ` : ''}{task.title}</strong><small>{task.property?.number} · {task.installation?.number ?? 'Bygningsopgave'}</small></div><span className={`priority-badge ${task.priority}`}>{task.priority === 'high' ? 'Høj' : task.priority === 'medium' ? 'Middel' : 'Lav'}</span><time dateTime={task.dueDate}>{formatDate(task.dueDate)}</time></li>
          ))}</ul> : <div className="empty-state compact"><strong>Ingen åbne opgaver</strong><span>Opgaver tildelt demobrugeren vises her.</span></div>}
        </article>
      </section>

      <section className="card service-card">
        <div className="card-header"><div><h2>Kommende service og eftersyn</h2><p>Planlagte aktiviteter de næste 30 dage</p></div><Link to="/facility/service">Se service <Icon name="chevron" size={15} /></Link></div>
        {overview.serviceHasData ? <div className="table-scroll"><table><thead><tr><th>Dato</th><th>Ejendom</th><th>Installation</th><th>Placering</th><th>Aktivitet</th><th>Leverandør</th><th>Status</th></tr></thead><tbody>{overview.upcomingService.map((item) => (
          <tr key={item.id}><td>{formatDate(item.dueDate)}</td><td><strong>{item.property?.number}</strong> {item.property?.name}</td><td>{item.installation?.number ?? '—'}</td><td>{item.installation?.locationLabel ?? 'Ejendom'}</td><td>{item.activity}</td><td>{item.supplier}</td><td><span className="status-badge">Planlagt</span></td></tr>
        ))}</tbody></table></div> : <div className="empty-state"><strong>Ingen planlagte aktiviteter i perioden</strong><span>Næste 30 dage regnes fra den faste demo-reference.</span></div>}
      </section>
    </div>
  );
}
