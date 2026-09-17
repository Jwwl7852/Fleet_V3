import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useFacilityNavigate as useNavigate } from '../routing/FacilityRouting';
import { PropertyForm } from '../components/facility/PropertyForm';
import { useFacilityData } from '../data/FacilityDataContext';
import { Icon } from '../components/shared/Icon';

function countFor(dataset, propertyId) {
  return {
    installations: dataset.installations.filter((item) => item.propertyId === propertyId && !item.archivedAt).length,
    cases: dataset.cases.filter((item) => item.propertyId === propertyId && item.status !== 'closed').length,
  };
}

const collator = new Intl.Collator('da-DK', { numeric: true, sensitivity: 'base' });

export function PropertiesPage() {
  const { dataset } = useFacilityData();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const search = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const city = params.get('city') ?? '';
  const archive = params.get('archive') ?? 'active';
  const sort = params.get('sort') ?? 'number';
  const direction = params.get('dir') === 'desc' ? -1 : 1;
  const set = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next);
  };
  const cities = [...new Set(dataset.properties.map((item) => item.city).filter(Boolean))].sort(collator.compare);
  const types = [...new Set(dataset.properties.map((item) => item.type).filter(Boolean))].sort(collator.compare);
  const rows = useMemo(() => dataset.properties.filter((property) => {
    const haystack = [property.number, property.name, property.address, property.city].join(' ').toLocaleLowerCase('da-DK');
    return (!search || haystack.includes(search.toLocaleLowerCase('da-DK')))
      && (!type || property.type === type)
      && (!status || property.administrativeStatus === status)
      && (!city || property.city === city)
      && (archive === 'all' || (archive === 'archived' ? property.archivedAt : !property.archivedAt));
  }).sort((a, b) => {
    const value = (item) => sort === 'address' ? `${item.address} ${item.city}`
      : sort === 'status' ? item.administrativeStatus
      : sort === 'type' ? item.type : item[sort];
    return collator.compare(String(value(a) ?? ''), String(value(b) ?? '')) * direction;
  }), [archive, city, dataset.properties, direction, search, sort, status, type]);
  const openProperty = (property) => navigate(`/facility/ejendomme/${property.id}`, {
    state: { from: `${location.pathname}${location.search}` },
  });
  const changeSort = (field) => {
    const next = new URLSearchParams(params);
    next.set('sort', field);
    next.set('dir', sort === field && direction === 1 ? 'desc' : 'asc');
    setParams(next);
  };
  const reset = () => setParams({});

  return <div className="directory-page">
    <div className="page-heading">
      <div><span className="eyebrow">FACILITY</span><h1>Ejendomme</h1></div>
      <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>+ Tilføj ejendom</button>
    </div>
    <section className="directory-layout directory-layout-single">
      <article className="card directory-main">
        <div className="filter-bar">
          <label className="filter-search"><Icon name="search" size={17} /><input aria-label="Søg i ejendomme" value={search} onChange={(event) => set('q', event.target.value)} placeholder="Søg nummer, navn, adresse eller by" /></label>
          <select aria-label="Ejendomstype" value={type} onChange={(event) => set('type', event.target.value)}><option value="">Alle typer</option>{types.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Administrativ status" value={status} onChange={(event) => set('status', event.target.value)}><option value="">Alle administrative statusser</option><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select>
          <select aria-label="By" value={city} onChange={(event) => set('city', event.target.value)}><option value="">Alle byer</option>{cities.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Arkivering" value={archive} onChange={(event) => set('archive', event.target.value)}><option value="active">Aktive poster</option><option value="archived">Arkiverede poster</option><option value="all">Alle poster</option></select>
          <button className="secondary-button" type="button" onClick={reset}>Nulstil filtre</button>
        </div>
        <div className="result-count">Viser <strong>{rows.length}</strong> af {dataset.properties.length} ejendomme</div>
        {rows.length ? <div className="table-scroll"><table className="directory-table">
          <thead><tr><th><button onClick={() => changeSort('number')}>Ejendomsnr.</button></th><th><button onClick={() => changeSort('name')}>Navn</button></th><th><button onClick={() => changeSort('address')}>Adresse og by</button></th><th><button onClick={() => changeSort('type')}>Type</button></th><th><button onClick={() => changeSort('status')}>Administrativ status</button></th><th>Installationer</th><th>Åbne sager</th><th /></tr></thead>
          <tbody>{rows.map((property) => {
            const counts = countFor(dataset, property.id);
            return <tr key={property.id} role="link" tabIndex="0" aria-label={`Åbn ${property.number} ${property.name}`} onClick={() => openProperty(property)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openProperty(property); } }} className={property.archivedAt ? 'is-archived' : ''}>
              <td><strong>{property.number}</strong></td><td><strong>{property.name}</strong>{property.archivedAt && <span className="archive-badge">Arkiveret</span>}</td><td>{property.address || '—'}<small>{property.postalCode} {property.city}</small></td><td>{property.type || 'Ikke angivet'}</td><td><span className={`status-badge ${property.administrativeStatus}`}>{property.administrativeStatus === 'active' ? 'Aktiv' : 'Inaktiv'}</span></td><td>{counts.installations}</td><td>{counts.cases}</td><td><span className="row-link" aria-hidden="true">Åbn <Icon name="chevron" size={14} /></span></td>
            </tr>;
          })}</tbody>
        </table></div> : <div className="empty-state"><strong>Ingen ejendomme matcher filtrene</strong><span>Nulstil filtrene eller medtag arkiverede poster.</span></div>}
      </article>
    </section>
    {showCreate && <PropertyForm onClose={() => setShowCreate(false)} onSaved={(property) => navigate(`/facility/ejendomme/${property.id}`, { state: { from: `${location.pathname}${location.search}` } })} />}
  </div>;
}
