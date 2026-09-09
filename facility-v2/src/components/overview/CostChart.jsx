import { formatMoney } from '../../data/overviewSelectors';

export function CostChart({ values, currency, hasData }) {
  if (!hasData) return <div className="empty-state compact"><strong>Ingen registrerede demoomkostninger</strong><span>Diagrammet vises, når perioden har registreringer.</span></div>;
  const max = Math.max(...values.map((item) => item.amount), 1);
  return (
    <div className="cost-chart" aria-label="Registrerede demoomkostninger pr. måned">
      <div className="chart-grid" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="chart-bars">
        {values.map((item) => (
          <div className="chart-column" key={item.label} title={`${item.label}: ${formatMoney(item.amount, currency)}`}>
            <div className="chart-bar-track"><div className="chart-bar" style={{ height: `${Math.max(item.amount ? 8 : 0, (item.amount / max) * 100)}%` }} /></div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
