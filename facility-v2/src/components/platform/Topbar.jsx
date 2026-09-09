import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../shared/Icon';
import { useFacilityData } from '../../data/FacilityDataContext';

export function Topbar({ customerName, packageId, packages, onPackageChange, onOpenMobile }) {
  const { dataset } = useFacilityData(); const navigate = useNavigate(); const [query, setQuery] = useState('');
  function search(event) {
    event.preventDefault(); const needle = query.trim().toLocaleLowerCase('da-DK'); if (!needle) return;
    const property = dataset.properties.find((item) => `${item.number} ${item.name} ${item.address}`.toLocaleLowerCase('da-DK').includes(needle));
    const installation = dataset.installations.find((item) => `${item.number} ${item.name}`.toLocaleLowerCase('da-DK').includes(needle));
    const caseRecord = dataset.cases.find((item) => `${item.reference} ${item.title}`.toLocaleLowerCase('da-DK').includes(needle));
    if (property) navigate(`/facility/ejendomme/${property.id}`); else if (installation) navigate(`/facility/installationer/${installation.id}`); else if (caseRecord) navigate(`/facility/sager/${caseRecord.id}`); else navigate(`/facility/indberetninger?q=${encodeURIComponent(query.trim())}`);
  }
  return (
    <header className="topbar">
      <div className="topbar-customer">
        <button className="icon-button mobile-menu-button" aria-label="Åbn menu" onClick={onOpenMobile}><Icon name="menu" /></button>
        <span>{customerName}</span>
      </div>
      <form className="topbar-search" role="search" onSubmit={search}>
        <Icon name="search" size={18} />
        <input aria-label="Søg i FACILITY" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg i ejendomme, installationer og sager …" />
      </form>
      <div className="topbar-actions">
        <label className="demo-switcher">
          <span>Demovisning · ikke adgangskontrol</span>
          <select aria-label="Vælg produktpakke" value={packageId} onChange={(event) => onPackageChange(event.target.value)}>
            {Object.values(packages).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button className="icon-button notification-button" aria-label="Notifikationer er ikke tilsluttet i prototypen" title="Ikke tilsluttet i prototypen" disabled><Icon name="bell" /></button>
        <div className="user-chip" aria-label="Demobruger"><span>DC</span><strong>Dennis</strong></div>
      </div>
    </header>
  );
}
