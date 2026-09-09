import { FacilityLink as Link } from '../routing/FacilityRouting';
import { Icon } from '../components/shared/Icon';

const content = {
  platform: { title: 'Platformoverblik', icon: 'dashboard', text: 'Denne etape demonstrerer FACILITYs appskal og produktpakkevisning. Et fælles platformoverblik er ikke tilsluttet prototypen.' },
  invoice: { title: 'Fakturacenter', icon: 'invoice', text: 'Fakturacenter er et separat platformområde og indgår i begge viste produktpakker. Teknisk integration, fakturamodtagelse og fakturakontrol er ikke tilsluttet denne prototype.' },
  fleet: { title: 'FLEET', icon: 'fleet', text: 'Produktpakken viser adgang til FLEET, men FLEET-appen er ikke importeret eller integreret i denne FACILITY-prototype.' },
};

export function DisconnectedAreaPage({ area }) {
  const item = content[area];
  return (
    <div className="placeholder-page">
      <div className="page-heading"><div><span className="eyebrow">VEYRO PLATFORM</span><h1>{item.title}</h1><p>Separat platformområde</p></div></div>
      <section className="placeholder-card card"><span className="placeholder-icon"><Icon name={item.icon} size={30} /></span><div><span className="stage-badge neutral">Ikke tilsluttet</span><h2>Området er vist ærligt som integrationstilstand</h2><p>{item.text}</p><Link className="primary-button" to="/facility">Tilbage til FACILITY</Link></div></section>
    </div>
  );
}
