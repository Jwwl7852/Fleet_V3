import { Icon } from '../components/shared/Icon';

export function PlaceholderPage({ page }) {
  return (
    <div className="placeholder-page">
      <div className="page-heading"><div><span className="eyebrow">FACILITY</span><h1>{page.label}</h1><p>{page.description}</p></div></div>
      <section className="placeholder-card card">
        <span className="placeholder-icon"><Icon name={page.icon} size={30} /></span>
        <div><span className="stage-badge">Planlagt til etape {page.stage}</span><h2>{page.label} kommer i en senere etape</h2><p>Menupunkt og direkte rute er etableret. Funktionelle resultater vises først, når det tilhørende domæne og datagrundlag er implementeret og godkendt.</p></div>
      </section>
    </div>
  );
}
