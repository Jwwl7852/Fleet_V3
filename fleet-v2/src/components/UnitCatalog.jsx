import { useEffect, useMemo, useState } from "react";
import { UNIT_STATUSES, UNIT_TYPES } from "../data/fleetFixtures";
import { useFleetData } from "../data/FleetDataContext";
import { filterAndSortUnits, formatCurrency, formatMeter, modelLabel, statusMeta, typeLabel, unitCost } from "../data/unitSelectors";
import { Icon } from "./Icon";
import { UnitFormDialog } from "./UnitFormDialog";
import { UnitThumbnail } from "./UnitThumbnail";
import { deriveUnitUsability } from "../data/caseWorkflow";

const PAGE_SIZE = 10;
const initialFilters = { query: "", tab: "all", department: "", type: "", status: "", sort: "number" };

const dateLabel = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "—";
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function StatusBadge({ unit, relations }) {
  const meta = statusMeta(unit);
  const usability = deriveUnitUsability(unit.id, relations.reports || [], relations.cases || [], relations.workshopTasks || []);
  return <span className="catalog-statuses"><span className={`status-badge ${meta.tone}`}><i />{meta.label}</span>{usability.value !== "usable" ? <span className={`usability-chip ${usability.tone}`}>{usability.label}</span> : null}</span>;
}

function exportCsv(units, costs) {
  const rows = [
    ["Enhedsnummer", "Registrering", "Type", "Afdeling", "Målerstand", "Status", "Næste service", "Omkostninger"],
    ...units.map((unit) => [unit.number, unit.registration || "Ikke oplyst", typeLabel(unit), unit.department, formatMeter(unit), statusMeta(unit).label, unit.nextServiceDate || "Ikke oplyst", unitCost(unit.id, costs)]),
  ];
  const blob = new Blob([`\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "veyro-fleet-v2-enheder.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function UnitCatalog({ onNavigate, onNotice, vehicleLookup, imageProcessor }) {
  const { units, relations, loading, error, saveUnit, tenantId } = useFleetData();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [view, setView] = useState("table");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const filtered = useMemo(() => filterAndSortUnits(units, filters), [filters, units]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const departments = [...new Set(units.map((unit) => unit.department))].sort((a, b) => a.localeCompare(b, "da"));

  useEffect(() => setPage(1), [filters]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const setFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const openUnit = (unit) => onNavigate(`/enheder/${unit.id}`);
  const save = async (unit) => {
    const previous = units.find((current) => current.id === unit.id);
    await saveUnit(unit);
    if (!previous) setFilters({ ...initialFilters, query: unit.number });
    else if (filters.query.trim().toLocaleLowerCase("da") === previous.number.toLocaleLowerCase("da")) {
      setFilters((current) => ({ ...current, query: unit.number }));
    }
    onNotice(`${unit.number} er gemt lokalt i prototypen`);
  };

  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser lokale demodata …</p></main>;
  if (error) return <main className="workspace-page empty-state" id="main-content"><Icon name="warning" size={32} /><h1>Lokale data kunne ikke åbnes</h1><p>{error.message}</p></main>;

  const tabEntries = [["all", "Alle"], ...Object.entries(UNIT_TYPES).map(([key, meta]) => [key, meta.plural])];

  return (
    <main className="workspace-page catalog-page" id="main-content">
      <header className="page-heading-row">
        <div><h1>Enhedskartotek</h1><p>Administrér hele jeres flåde – køretøjer, maskiner, udstyr og mere.</p><span className="demo-inline">Fiktive demodata · lokal prototype</span></div>
        <div className="page-actions">
          <button className="secondary-button" type="button" onClick={() => onNotice("Visningen gemmes først i en senere etape")}><Icon name="document" size={17} />Gem visning</button>
          <button className="secondary-button" type="button" onClick={() => exportCsv(filtered, relations.costs || [])}><Icon name="download" size={17} />Eksportér CSV</button>
          <button className="primary-button" type="button" onClick={() => setCreating(true)}><Icon name="plus" size={19} />Opret enhed</button>
        </div>
      </header>

      <div className="unit-tabs" role="tablist" aria-label="Enhedstyper">
        {tabEntries.map(([key, label]) => {
          const count = key === "all" ? units.length : units.filter((unit) => unit.type === key).length;
          return <button role="tab" aria-selected={filters.tab === key} className={filters.tab === key ? "is-active" : ""} key={key} type="button" onClick={() => setFilters((current) => ({ ...current, tab: key }))}>{label} <span>({count})</span></button>;
        })}
      </div>

      <section className="catalog-toolbar" aria-label="Filtrering af enheder">
        <label className="catalog-search"><Icon name="search" size={18} /><input aria-label="Søg i enheder" placeholder="Søg i enheder …" value={filters.query} onChange={setFilter("query")} /></label>
        <label><span className="sr-only">Afdeling</span><select aria-label="Afdeling" value={filters.department} onChange={setFilter("department")}><option value="">Alle afdelinger</option>{departments.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span className="sr-only">Type</span><select aria-label="Type" value={filters.type} onChange={setFilter("type")}><option value="">Alle typer</option>{Object.entries(UNIT_TYPES).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></label>
        <label><span className="sr-only">Status</span><select aria-label="Status" value={filters.status} onChange={setFilter("status")}><option value="">Alle statusser</option>{Object.entries(UNIT_STATUSES).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></label>
        <button className="filter-button" type="button" onClick={() => onNotice("Flere filtre: Ikke implementeret i denne etape")}><Icon name="filter" size={16} />Flere filtre</button>
        <button className="reset-button" type="button" onClick={() => setFilters(initialFilters)}>Nulstil</button>
        <span className="result-count">Viser {filtered.length} af {units.length} enheder</span>
        <label className="sort-select"><span className="sr-only">Sortering</span><select aria-label="Sortering" value={filters.sort} onChange={setFilter("sort")}><option value="number">Sortér: Enhedsnummer</option><option value="model">Sortér: Mærke/model</option><option value="meter-desc">Sortér: Højeste målerstand</option><option value="service">Sortér: Næste service</option></select></label>
        <div className="view-switch" aria-label="Visning"><button aria-label="Tabelvisning" aria-pressed={view === "table"} type="button" onClick={() => setView("table")}><Icon name="table" size={18} /></button><button aria-label="Kortvisning" aria-pressed={view === "cards"} type="button" onClick={() => setView("cards")}><Icon name="grid" size={18} /></button></div>
      </section>

      {filtered.length === 0 ? (
        <section className="catalog-empty"><Icon name="search" size={30} /><h2>Ingen enheder matcher</h2><p>Prøv at ændre søgningen eller nulstille filtrene.</p><button className="secondary-button" type="button" onClick={() => setFilters(initialFilters)}>Nulstil filtre</button></section>
      ) : view === "table" ? (
        <div className="unit-table-shell">
          <table className="unit-table">
            <thead><tr><th>Enhed</th><th>Registrering</th><th>Type</th><th>Afdeling</th><th>Målerstand</th><th>Status</th><th>Næste service</th><th>Omkostning<br /><small>(3 mdr.)</small></th><th>Noter</th><th><span className="sr-only">Handling</span></th></tr></thead>
            <tbody>{visible.map((unit) => (
              <tr key={unit.id} tabIndex="0" onClick={() => openUnit(unit)} onKeyDown={(event) => { if (event.key === "Enter") openUnit(unit); }}>
                <td><span className="unit-cell"><UnitThumbnail unit={unit} /><span><strong>{unit.number}</strong><small>{modelLabel(unit)}</small></span></span></td>
                <td>{unit.registration || <span className="not-provided">Ikke oplyst</span>}</td>
                <td><span className="type-cell"><Icon name="unit" size={16} />{typeLabel(unit)}</span></td>
                <td><span className="department-dot" />{unit.department}</td>
                <td>{formatMeter(unit)}</td>
                <td><StatusBadge unit={unit} relations={relations} /></td>
                <td><span className="service-cell">{dateLabel(unit.nextServiceDate)}<small>{unit.nextServiceMeter == null ? "—" : `(${formatMeter(unit, unit.nextServiceMeter)})`}</small></span></td>
                <td><strong>{formatCurrency.format(unitCost(unit.id, relations.costs || []))}</strong></td>
                <td><span className={`note-pill${unit.noteCount ? " has-notes" : ""}`}><Icon name="report" size={14} />{unit.noteCount || 0}</span></td>
                <td><button className="row-action" type="button" aria-label={`Redigér ${unit.number}`} onClick={(event) => { event.stopPropagation(); setEditing(unit); }}><Icon name="more" size={18} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="unit-card-grid">{visible.map((unit) => <article className="unit-catalog-card" key={unit.id} onClick={() => openUnit(unit)}><UnitThumbnail unit={unit} large /><div><span className="card-unit-top"><strong>{unit.number}</strong><StatusBadge unit={unit} relations={relations} /></span><h2>{modelLabel(unit)}</h2><p>{typeLabel(unit)} · {unit.department}</p><dl><div><dt>Måler</dt><dd>{formatMeter(unit)}</dd></div><div><dt>Næste service</dt><dd>{dateLabel(unit.nextServiceDate)}</dd></div><div><dt>3 mdr.</dt><dd>{formatCurrency.format(unitCost(unit.id, relations.costs || []))}</dd></div></dl><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); setEditing(unit); }}><Icon name="edit" size={15} />Redigér</button></div></article>)}</div>
      )}

      <footer className="catalog-pagination"><span>Vis <strong>{PAGE_SIZE} pr. side</strong></span><span>{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} af ${filtered.length}` : "0 enheder"}</span><div><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} aria-label="Forrige side">‹</button>{Array.from({ length: pageCount }, (_, index) => <button className={page === index + 1 ? "is-active" : ""} type="button" key={index + 1} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button type="button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)} aria-label="Næste side">›</button></div></footer>

      {creating ? <UnitFormDialog units={units} tenantId={tenantId} onClose={() => setCreating(false)} onSave={save} vehicleLookup={vehicleLookup} imageProcessor={imageProcessor} /> : null}
      {editing ? <UnitFormDialog unit={editing} units={units} tenantId={tenantId} onClose={() => setEditing(null)} onSave={save} vehicleLookup={vehicleLookup} imageProcessor={imageProcessor} /> : null}
    </main>
  );
}
