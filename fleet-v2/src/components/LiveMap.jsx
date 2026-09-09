import { useEffect, useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { CONNECTION_STATES, MOVEMENT_STATES, filterPositionUnits, positionForUnit, positionFreshness } from "../data/positionWorkflow";
import { modelLabel, typeLabel } from "../data/unitSelectors";
import { GeoMap } from "./GeoMap";
import { Icon } from "./Icon";

const dateTime = (value) => value
  ? new Date(value).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "Ikke oplyst";

const demoNow = () => {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
};

function SelectFilter({ label, value, onChange, children }) {
  return <label className="live-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Alle</option>{children}</select></label>;
}

function UnitPositionRow({ unit, position, selected, now, onSelect }) {
  const freshness = positionFreshness(position, now);
  return <button className={`position-unit-row${selected ? " is-selected" : ""}`} type="button" onClick={onSelect} aria-pressed={selected}>
    <span className={`position-dot ${position?.connectionStatus || "missing"}`} aria-hidden="true" />
    <span className="position-unit-copy"><strong>{unit.number}</strong><small>{modelLabel(unit)}</small></span>
    <span className="position-unit-state"><b>{position ? CONNECTION_STATES[position.connectionStatus] : "Ingen position"}</b><small>{freshness.label}</small></span>
  </button>;
}

function PositionDetails({ unit, position, now, onNavigate }) {
  if (!unit) return <aside className="live-detail-panel"><div className="live-empty"><Icon name="map" size={30} /><h2>Vælg en enhed</h2><p>Vælg en enhed i listen eller på kortet.</p></div></aside>;
  const freshness = positionFreshness(position, now);
  return <aside className="live-detail-panel">
    <header className="live-detail-heading"><span className={`position-dot ${position?.connectionStatus || "missing"}`} /><div><span className="eyebrow">Valgt enhed</span><h2>{unit.number}</h2><p>{modelLabel(unit)} · {typeLabel(unit)}</p></div></header>
    <div className="live-detail-badges"><span className={`status-badge ${position?.connectionStatus === "offline" ? "danger" : position?.connectionStatus === "degraded" ? "warning" : "success"}`}>{position ? CONNECTION_STATES[position.connectionStatus] : "Ingen positionsdata"}</span>{position ? <span className={`freshness-badge ${freshness.key}`}>{freshness.label}</span> : null}</div>
    <dl className="live-position-details">
      <div><dt>Enhedstype</dt><dd>{typeLabel(unit)}</dd></div>
      <div><dt>Registrering</dt><dd>{unit.registration || "Ikke oplyst"}</dd></div>
      <div><dt>Senest kendte position</dt><dd>{position?.label || "Ingen position registreret"}</dd></div>
      <div><dt>Positionsmåling</dt><dd>{dateTime(position?.measuredAt)}</dd></div>
      <div><dt>Seneste kontakt</dt><dd>{dateTime(position?.lastContactAt)}</dd></div>
      <div><dt>Bevægelse</dt><dd>{position ? MOVEMENT_STATES[position.movementState] : "Ukendt bevægelse"}{position?.speedKph != null ? ` · ${position.speedKph} km/t` : ""}</dd></div>
      <div><dt>Forbindelse</dt><dd>{position ? CONNECTION_STATES[position.connectionStatus] : "Ukendt forbindelse"}</dd></div>
      <div><dt>Nøjagtighed</dt><dd>{position?.accuracyMeters != null ? `± ${position.accuracyMeters} m` : "Ikke oplyst"}</dd></div>
      <div><dt>Datakilde</dt><dd>{position?.source || "Ingen"}</dd></div>
    </dl>
    {position?.alarms?.length ? <section className="position-alarms" aria-label="Positionsalarmer"><h3>GPS- og forbindelsesalarmer</h3>{position.alarms.map((alarm) => <p key={alarm.code}><Icon name="warning" size={16} />{alarm.label}</p>)}</section> : null}
    {!position ? <p className="live-info-message"><Icon name="info" size={16} />Enheden kan findes i registeret, men har ingen fiktiv positionspost.</p> : freshness.stale ? <p className="live-warning-message"><Icon name="warning" size={16} />Positionen er forældet og må ikke læses som en aktuel bevægelse.</p> : null}
    <button className="primary-button full" type="button" onClick={() => onNavigate(`/enheder/${unit.id}`)}>Åbn enhedsprofil <Icon name="external" size={15} /></button>
  </aside>;
}

export function LiveMap({ onNavigate }) {
  const { units, relations, loading, runPositionDemo } = useFleetData();
  const positions = relations.positions || [];
  const queryUnit = new URLSearchParams(window.location.search).get("unit");
  const [filters, setFilters] = useState({ query: "", department: "", type: "", movement: "", connection: "" });
  const [selectedUnitId, setSelectedUnitId] = useState(queryUnit || "");
  const [mobileView, setMobileView] = useState("map");
  const [demoOpen, setDemoOpen] = useState(false);
  const [demo, setDemo] = useState({ unitId: queryUnit || "", scenario: "move", now: demoNow() });
  const [demoStatus, setDemoStatus] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);
  const departments = useMemo(() => [...new Set(units.map((unit) => unit.department))].sort(), [units]);
  const types = useMemo(() => [...new Set(units.map((unit) => unit.type))].sort(), [units]);
  const filteredUnits = useMemo(() => filterPositionUnits(units, positions, filters), [filters, positions, units]);
  const filteredIds = useMemo(() => new Set(filteredUnits.map((unit) => unit.id)), [filteredUnits]);
  const filteredPositions = useMemo(() => positions.filter((position) => filteredIds.has(position.unitId)), [filteredIds, positions]);

  useEffect(() => {
    if (!units.length) return;
    if (selectedUnitId && filteredIds.has(selectedUnitId)) return;
    setSelectedUnitId(filteredUnits[0]?.id || "");
  }, [filteredIds, filteredUnits, selectedUnitId, units.length]);
  useEffect(() => {
    if (!demo.unitId && units.length) setDemo((current) => ({ ...current, unitId: units.find((unit) => positionForUnit(relations, unit.id))?.id || "" }));
  }, [demo.unitId, relations, units]);

  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
  const selectedPosition = positionForUnit(relations, selectedUnitId);
  const now = new Date().toISOString();
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => setFilters({ query: "", department: "", type: "", movement: "", connection: "" });
  const runDemo = async (event) => {
    event.preventDefault();
    setDemoBusy(true); setDemoStatus("");
    try {
      await runPositionDemo({ ...demo, now: new Date(demo.now).toISOString() });
      setSelectedUnitId(demo.unitId);
      setDemoStatus("Demopositionen er opdateret lokalt. Kortudsnit og valg er bevaret.");
    } catch (error) { setDemoStatus(error.message); }
    finally { setDemoBusy(false); }
  };

  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser demopositioner …</p></main>;
  return <main className={`workspace-page live-map-page mobile-${mobileView}`} id="main-content">
    <header className="workspace-heading live-map-title"><div><span className="eyebrow">FLEET v2 · lokal prototype</span><h1>Livekort</h1><p>Se senest kendte position og aktualitet for flådens enheder.</p></div><div><span className="live-demo-badge">Demopositioner – ikke live</span><button className="secondary-button" type="button" onClick={() => setDemoOpen((value) => !value)}><Icon name="service" size={16} />Demokontrol</button></div></header>
    {demoOpen ? <form className="position-demo-control" onSubmit={runDemo}><div><strong>Afprøv lokal positionsændring</strong><small>Påvirker kun Livekortets demopositioner.</small></div><label><span>Enhed</span><select value={demo.unitId} onChange={(event) => setDemo((current) => ({ ...current, unitId: event.target.value }))}>{units.filter((unit) => positionForUnit(relations, unit.id)).map((unit) => <option key={unit.id} value={unit.id}>{unit.number}</option>)}</select></label><label><span>Situation</span><select value={demo.scenario} onChange={(event) => setDemo((current) => ({ ...current, scenario: event.target.value }))}><option value="move">Flyt og sæt i bevægelse</option><option value="stop">Sæt i stilstand</option><option value="degraded">Ustabil forbindelse</option><option value="offline">Mistet forbindelse</option><option value="restore">Gendan forbindelse</option></select></label><label><span>Demotid</span><input type="datetime-local" value={demo.now} onChange={(event) => setDemo((current) => ({ ...current, now: event.target.value }))} /></label><button className="primary-button" disabled={demoBusy || !demo.unitId} type="submit">{demoBusy ? "Opdaterer …" : "Kør demo"}</button>{demoStatus ? <p role="status">{demoStatus}</p> : null}</form> : null}
    <div className="live-mobile-switch" role="group" aria-label="Mobil visning"><button className={mobileView === "map" ? "is-active" : ""} type="button" onClick={() => setMobileView("map")}><Icon name="map" size={16} />Kort</button><button className={mobileView === "list" ? "is-active" : ""} type="button" onClick={() => setMobileView("list")}><Icon name="unit" size={16} />Liste</button></div>
    <section className="live-map-shell">
      <aside className="live-map-list-panel">
        <header><div><h2>Enheder</h2><span>{filteredUnits.length} af {units.length}</span></div><button className="link-button" type="button" onClick={clearFilters}>Nulstil filtre</button></header>
        <label className="live-search"><Icon name="search" size={17} /><span className="sr-only">Søg efter enhed</span><input placeholder="Søg nummer, registrering, mærke …" value={filters.query} onChange={(event) => setFilter("query", event.target.value)} /></label>
        <div className="live-filter-grid"><SelectFilter label="Afdeling" value={filters.department} onChange={(value) => setFilter("department", value)}>{departments.map((value) => <option key={value} value={value}>{value}</option>)}</SelectFilter><SelectFilter label="Enhedstype" value={filters.type} onChange={(value) => setFilter("type", value)}>{types.map((value) => <option key={value} value={value}>{typeLabel({ type: value })}</option>)}</SelectFilter><SelectFilter label="Bevægelse" value={filters.movement} onChange={(value) => setFilter("movement", value)}>{Object.entries(MOVEMENT_STATES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</SelectFilter><SelectFilter label="Forbindelse" value={filters.connection} onChange={(value) => setFilter("connection", value)}>{Object.entries(CONNECTION_STATES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</SelectFilter></div>
        <div className="position-unit-list">{filteredUnits.length ? filteredUnits.map((unit) => <UnitPositionRow key={unit.id} unit={unit} position={positionForUnit(relations, unit.id)} selected={selectedUnitId === unit.id} now={now} onSelect={() => { setSelectedUnitId(unit.id); setMobileView("map"); }} />) : <div className="live-empty compact"><Icon name="search" size={25} /><strong>Ingen enheder matcher</strong><p>Nulstil filtrene eller prøv en anden søgning.</p></div>}</div>
      </aside>
      <section className="live-map-map-panel"><GeoMap positions={filteredPositions} units={units} selectedUnitId={selectedUnitId} onSelect={setSelectedUnitId} now={now} /><div className="live-map-legend"><span><i className="online" />Online</span><span><i className="degraded" />Ustabil</span><span><i className="offline" />Offline</span><span><i className="missing" />Uden position</span></div></section>
      <PositionDetails unit={selectedUnit} position={selectedPosition} now={now} onNavigate={onNavigate} />
    </section>
  </main>;
}
