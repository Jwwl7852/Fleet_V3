import { useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { formatCurrency, formatMeter, formatNumber, meterUnit, modelLabel, relationsForUnit, statusMeta, typeLabel, unitCost } from "../data/unitSelectors";
import { Icon } from "./Icon";
import { UnitFormDialog } from "./UnitFormDialog";
import { UnitThumbnail } from "./UnitThumbnail";

const TABS = [
  ["overview", "Overblik"], ["history", "Historik"], ["service", "Servicebog"],
  ["damages", "Skader"], ["documents", "Dokumenter"], ["economy", "Økonomi"], ["gps", "GPS"],
];

const dateTime = (value) => new Date(value).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "—";

function EmptyTab({ title, text }) {
  return <div className="profile-empty"><Icon name="document" size={30} /><h2>{title}</h2><p>{text}</p></div>;
}

function DetailList({ unit }) {
  const details = [
    ["Registreringsnummer", unit.registration || "Ikke oplyst"],
    ["VIN / serienummer", unit.serialNumber || "Ikke oplyst"],
    ["Mærke / model", modelLabel(unit)],
    ["Type", typeLabel(unit)],
    ["Produktionsår", unit.year || "Ikke oplyst"],
    ["Afdeling", unit.department],
    ["Målerart", unit.meterType === "hours" ? "Driftstimer" : "Kilometer"],
    ["Aktuel målerstand", formatMeter(unit)],
  ];
  return <dl className="profile-detail-list">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function ActivityTimeline({ items }) {
  if (!items.length) return <EmptyTab title="Ingen aktivitet endnu" text="Når enheden ændres eller indgår i et FLEET-forløb, vises hændelserne her." />;
  return <div className="activity-timeline">{items.map((item) => <article key={item.id}><time>{dateTime(item.at).replace(",", " ·")}</time><span className={`timeline-icon ${item.tone}`}><Icon name={item.category === "Service" ? "service" : item.category === "GPS" ? "pin" : item.category === "Økonomi" ? "economy" : "report"} size={17} /></span><div><strong>{item.title}</strong><p>{item.text}</p></div><span className={`relation-chip ${item.tone}`}>{item.category}</span></article>)}</div>;
}

function OverviewTab({ unit, related, onNotice }) {
  const gps = related.gps?.[0];
  const meta = statusMeta(unit);
  return (
    <div className="profile-overview-grid">
      <section className="profile-panel"><header><h2>Enhedsoplysninger</h2></header><DetailList unit={unit} /></section>
      <section className="profile-panel timeline-panel"><header><h2>Aktivitetstidslinje</h2><button type="button" onClick={() => onNotice("Alle hændelser: Ikke implementeret i denne etape")}>Alle hændelser <Icon name="down" size={13} /></button></header><ActivityTimeline items={related.activities || []} /></section>
      <aside className="profile-side-column">
        <section className="profile-panel status-panel"><header><h2>Status</h2></header><div className={`profile-status ${meta.tone}`}><span><Icon name={unit.status === "workshop" ? "wrench" : unit.status === "operation" ? "check" : "warning"} size={22} /></span><div><strong>{meta.label}</strong><small>Siden {dateTime(unit.updatedAt)}</small></div></div><dl><div><dt>Bemærkning</dt><dd>{unit.notes || "Ingen bemærkning"}</dd></div><div><dt>Næste service</dt><dd>{dateOnly(unit.nextServiceDate)}</dd></div><div><dt>Internt ID</dt><dd>{unit.id}</dd></div></dl><button className="secondary-button full" type="button" onClick={() => onNotice("Relateret arbejdsforløb: Ikke implementeret i denne etape")}>Se relateret forløb <Icon name="external" size={14} /></button></section>
        <section className="profile-panel location-panel"><header><h2>Seneste placering</h2></header>{gps ? <><div className="profile-mini-map"><span style={{ left: `${35 + ((gps.longitude * 10) % 35)}%`, top: `${35 + ((gps.latitude * 10) % 30)}%` }}><Icon name="pin" size={19} /></span><em>Demokort · ikke live</em></div><div className="location-copy"><strong>{gps.label}</strong><p>Fiktiv position uden rute- eller planlægningsdata.</p><small>Opdateret {dateTime(gps.updatedAt)}</small></div></> : <EmptyTab title="Ingen GPS-position" text="Der er ikke registreret en position for denne enhed." />}</section>
      </aside>
    </div>
  );
}

function RecordsTab({ kind, related, unit, onNotice }) {
  const config = {
    history: { title: "Historik", items: related.activities || [], empty: "Der er ingen historik for enheden." },
    service: { title: "Servicebog", items: related.service || [], empty: "Der er ingen serviceposter for enheden." },
    damages: { title: "Skader", items: related.damages || [], empty: "Der er ingen registrerede skader." },
    documents: { title: "Dokumenter", items: related.documents || [], empty: "Der er ingen dokumenter knyttet til enheden." },
  }[kind];
  if (!config.items.length) return <section className="profile-tab-card"><EmptyTab title={`Tom ${config.title.toLocaleLowerCase("da")}`} text={config.empty} /></section>;
  return (
    <section className="profile-tab-card">
      <header><div><span className="eyebrow">Knyttet via {unit.id}</span><h2>{config.title}</h2></div><button className="secondary-button" type="button" onClick={() => onNotice(`${config.title}: Komplet modul ikke implementeret i denne etape`)}><Icon name="plus" size={16} />Tilføj</button></header>
      <div className="record-list">{config.items.map((item) => <article key={item.id}><span className={`record-icon ${kind}`}><Icon name={kind === "service" ? "service" : kind === "damages" ? "warning" : kind === "documents" ? "document" : "clock"} size={19} /></span><div><strong>{item.title}</strong><p>{item.text || item.category || item.result || item.status}</p></div><span>{item.at ? dateTime(item.at) : dateOnly(item.date)}</span>{item.cost != null ? <b>{formatCurrency.format(item.cost)}</b> : null}</article>)}</div>
    </section>
  );
}

function EconomyTab({ related, unit }) {
  const costs = related.costs || [];
  if (!costs.length) return <section className="profile-tab-card"><EmptyTab title="Ingen omkostninger" text="Der er endnu ingen FLEET-omkostninger registreret på enheden." /></section>;
  const byCategory = Object.entries(costs.reduce((result, item) => ({ ...result, [item.category]: (result[item.category] || 0) + item.amount }), {}));
  return <section className="profile-tab-card economy-tab"><header><div><span className="eyebrow">FLEET-omkostninger · ingen fakturabehandling</span><h2>Økonomi for {unit.number}</h2></div><strong>{formatCurrency.format(costs.reduce((sum, item) => sum + item.amount, 0))}</strong></header><div className="economy-summary">{byCategory.map(([category, amount]) => <article key={category}><span>{category}</span><strong>{formatCurrency.format(amount)}</strong><i style={{ width: `${Math.max(18, amount / Math.max(...byCategory.map((entry) => entry[1])) * 100)}%` }} /></article>)}</div></section>;
}

function GpsTab({ related, unit }) {
  const gps = related.gps?.[0];
  if (!gps) return <section className="profile-tab-card"><EmptyTab title="Ingen GPS-position" text="Enheden har ingen senest kendte position." /></section>;
  return <section className="profile-tab-card gps-tab"><header><div><span className="eyebrow">Fiktiv position · ikke live</span><h2>Senest kendte position</h2></div></header><div className="gps-detail"><div className="large-demo-map"><span><Icon name="pin" size={24} /></span><em>Ingen ruter, opgaver eller chaufførplanlægning</em></div><dl><div><dt>Enhed</dt><dd>{unit.number}</dd></div><div><dt>Position</dt><dd>{gps.label}</dd></div><div><dt>Koordinater</dt><dd>{gps.latitude.toFixed(4)}, {gps.longitude.toFixed(4)}</dd></div><div><dt>Seneste signal</dt><dd>{dateTime(gps.updatedAt)}</dd></div><div><dt>Datakilde</dt><dd>Lokal fiktiv testpost</dd></div></dl></div></section>;
}

export function UnitProfile({ unitId, onNavigate, onNotice }) {
  const { units, relations, loading, saveUnit, tenantId } = useFleetData();
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const unit = units.find((item) => item.id === unitId);
  const related = useMemo(() => relationsForUnit(relations, unitId), [relations, unitId]);

  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser enhedsprofil …</p></main>;
  if (!unit) return <main className="workspace-page not-found-state" id="main-content"><Icon name="warning" size={38} /><span className="eyebrow">FLEET v2 · lokal prototype</span><h1>Enheden findes ikke</h1><p>ID’et <code>{unitId}</code> findes ikke i det lokale testdatasæt.</p><button className="primary-button" type="button" onClick={() => onNavigate("/enheder")}>Tilbage til Enhedskartotek</button></main>;

  const meta = statusMeta(unit);
  const gps = related.gps?.[0];
  const save = async (next) => { await saveUnit(next); onNotice(`${next.number} er gemt lokalt i prototypen`); };
  return (
    <main className="workspace-page profile-page" id="main-content">
      <div className="profile-breadcrumb"><button type="button" onClick={() => onNavigate("/enheder")}>Enheder</button><Icon name="chevron" size={13} /><span>{unit.number}</span><em>Fiktive demodata</em></div>
      <header className="profile-hero">
        <UnitThumbnail unit={unit} large />
        <div className="profile-title"><span className="title-line"><h1>{unit.number}</h1><span className={`status-badge ${meta.tone}`}><i />{meta.label}</span></span><p>{modelLabel(unit)} · {typeLabel(unit)}</p><div><span>{unit.energy === "electric" ? "EL" : unit.meterType === "hours" ? "Driftstimer" : "FLEET"}</span>{unit.registration ? <span>{unit.registration}</span> : null}<span>{unit.department}</span></div></div>
        <div className="profile-actions"><button className="icon-button" type="button" onClick={() => onNotice("Flere handlinger: Ikke implementeret i denne etape")} aria-label="Flere handlinger"><Icon name="more" /></button><button className="secondary-button" type="button" onClick={() => onNotice("Del enhed: Ikke implementeret i denne etape")}><Icon name="external" size={16} />Del enhed</button><button className="dark-button" type="button" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Redigér</button><small>Senest opdateret<br />{dateTime(unit.updatedAt)}</small></div>
      </header>

      <section className="profile-kpis">
        <article><Icon name="user" /><span>Aktuel relation<small>{unit.assignee || "Ikke tildelt"}</small></span></article>
        <article><Icon name="odometer" /><span>{unit.meterType === "hours" ? "Driftstimer" : "Kilometertal"}<strong>{formatNumber.format(unit.meter)} {meterUnit(unit)}</strong></span></article>
        {unit.energy === "electric" ? <article><Icon name="battery" /><span>Batteri<strong>{unit.batteryPct ?? "—"} %</strong><small>{unit.rangeKm ? `ca. ${unit.rangeKm} km rækkevidde` : "Rækkevidde ikke oplyst"}</small></span></article> : unit.fuelPct != null ? <article><Icon name="fuel" /><span>Brændstof<strong>{unit.fuelPct} %</strong></span></article> : <article><Icon name="service" /><span>Næste service<strong>{dateOnly(unit.nextServiceDate)}</strong></span></article>}
        <article><Icon name="pin" /><span>Placering<strong>{gps?.label || "Ikke oplyst"}</strong><small>Fiktiv · ikke live</small></span></article>
        <article><Icon name="document" /><span>Dokumenter<strong>{related.documents?.length || 0}</strong></span></article>
        <article><Icon name="economy" /><span>Samlede omkostninger<strong>{formatCurrency.format(unitCost(unit.id, relations.costs || []))}</strong><small>Lokale FLEET-poster</small></span></article>
      </section>

      <div className="profile-tabs" role="tablist" aria-label="Enhedsprofilfaner">{TABS.map(([key, label]) => <button role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} type="button" key={key} onClick={() => setTab(key)}>{label}</button>)}</div>
      <section className="profile-tab-content">
        {tab === "overview" ? <OverviewTab unit={unit} related={related} onNotice={onNotice} /> : null}
        {["history", "service", "damages", "documents"].includes(tab) ? <RecordsTab kind={tab} related={related} unit={unit} onNotice={onNotice} /> : null}
        {tab === "economy" ? <EconomyTab related={related} unit={unit} /> : null}
        {tab === "gps" ? <GpsTab related={related} unit={unit} /> : null}
      </section>
      {editing ? <UnitFormDialog unit={unit} units={units} tenantId={tenantId} onClose={() => setEditing(false)} onSave={save} /> : null}
    </main>
  );
}
