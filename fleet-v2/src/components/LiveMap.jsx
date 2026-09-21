import { useEffect, useMemo, useRef, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { filterPositionUnits, positionForUnit, positionFreshness } from "../data/positionWorkflow";
import {
  LIVE_MAP_TIME_ZONE, LIVE_STATUS_LABELS, createSyntheticHistory, deriveTripsAndStops,
  historyCsv, historyInPeriod, latestValidMeasurement, liveOperationalStatus,
  localDateTime, localTime, routeSegments,
} from "../data/liveMapHistory";
import { modelLabel, typeLabel } from "../data/unitSelectors";
import { unitTypeKey } from "../data/unitTypeRegistry";
import { GeoMap } from "./GeoMap";
import { Icon } from "./Icon";

const DEFAULT_FROM = "2026-09-21T08:00";
const DEFAULT_TO = "2026-09-21T16:00";
const STATUS_ORDER = ["moving", "holding", "offline"];
const toIso = (value) => new Date(value).toISOString();
const durationLabel = (value) => value >= 60 ? `${Math.floor(value / 60)} t ${value % 60} min` : `${value} min`;

function SelectFilter({ label, value, onChange, children, allLabel = "Alle" }) {
  return <label className="live-filter"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{children}</select></label>;
}

function downloadText(contents, fileName, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}

function operationalPositions(units, stored, now) {
  const anchors = [[55.6761, 12.5683, "København"], [55.6295, 12.6492, "Amager"], [55.6471, 12.4756, "Hvidovre"], [55.6611, 12.5160, "Valby"], [55.7314, 12.3633, "Ballerup"], [55.5830, 12.3006, "Greve"]];
  return units.map((unit, index) => {
    const existing = stored.find((position) => position.unitId === unit.id);
    if (existing) {
      return {
        ...existing,
        heading: Number.isFinite(Number(existing.heading)) ? Number(existing.heading) : null,
        source: existing.source || "existing-position-source",
        demo: existing.demo !== false,
      };
    }
    const [latitude, longitude, label] = anchors[index % anchors.length];
    const status = index % 6 === 3 ? "offline" : index % 3 === 0 ? "moving" : "holding";
    const age = status === "offline" ? 190 : 1 + index * 2;
    const measuredAt = new Date(Date.parse(now) - age * 60000).toISOString();
    return { id: `synthetic-live-${unit.id}`, unitId: unit.id,
      latitude: latitude + (index % 4) * 0.008, longitude: longitude + (index % 3) * 0.006,
      label, measuredAt, receivedAt: measuredAt, lastContactAt: measuredAt,
      movementState: status === "moving" ? "moving" : status === "holding" ? "stationary" : "unknown",
      connectionStatus: status === "offline" ? "offline" : "online", speedKph: status === "moving" ? 36 + index : status === "holding" ? 0 : null,
      heading: (index * 43) % 360, accuracyMeters: 8, source: "synthetic-live-map-fixture", demo: true,
      alarms: status === "offline" ? [{ code: "connection_lost", label: "Intet signal" }] : [] };
  });
}

function PeriodPicker({ from, to, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from, to });
  const rootRef = useRef(null); const buttonRef = useRef(null);
  useEffect(() => setDraft({ from, to }), [from, to]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "mousedown" && rootRef.current?.contains(event.target)) return;
      setOpen(false); if (event.type === "keydown") buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return <div className="history-period-picker" ref={rootRef}>
    <button className="history-period-button" type="button" ref={buttonRef} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}><Icon name="clock" size={16} /><span><small>Valgt periode</small>{localDateTime(toIso(from))} – {localTime(toIso(to))}</span><Icon name="down" size={14} /></button>
    {open ? <section className="history-period-popup" role="dialog" aria-label="Vælg historikperiode"><header><strong>Vælg periode</strong><span>{LIVE_MAP_TIME_ZONE}</span></header><label>Fra<input type="datetime-local" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} /></label><label>Til<input type="datetime-local" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} /></label><button className="primary-button" type="button" disabled={!draft.from || !draft.to || draft.from > draft.to} onClick={() => { onApply(draft); setOpen(false); buttonRef.current?.focus(); }}>Anvend periode</button></section> : null}
  </div>;
}

function ExportMenu({ packets, unit, from, to }) {
  const rows = historyInPeriod(packets, from, to);
  const csv = () => downloadText(historyCsv(packets, unit, from, to), `livekort-${unit.number}-positioner.csv`, "text/csv;charset=utf-8");
  const excel = () => {
    const table = `<html><meta charset="utf-8"><body><h1>Livekort · ${unit.number}</h1><p>Periode: ${localDateTime(from)} – ${localDateTime(to)} · ${LIVE_MAP_TIME_ZONE}</p><table><tr><th>Enhed</th><th>Tid (${LIVE_MAP_TIME_ZONE})</th><th>Adresse</th><th>Hastighed km/t</th><th>Tænding</th><th>Kilometer</th></tr>${rows.map((row) => `<tr><td>${unit.number}</td><td>${localDateTime(row.measuredAt, { seconds: true })}</td><td>${row.address}</td><td>${row.speedKph ?? ""}</td><td>${row.ignition ? "Til" : "Fra"}</td><td>${row.odometerKm ?? ""}</td></tr>`).join("")}</table></body></html>`;
    downloadText(table, `livekort-${unit.number}-positioner.xls`, "application/vnd.ms-excel;charset=utf-8");
  };
  return <details className="history-export"><summary className="secondary-button"><Icon name="download" size={16} />Eksportér <Icon name="down" size={13} /></summary><div><button type="button" onClick={csv}>CSV</button><button type="button" onClick={excel}>Excel</button><button type="button" onClick={() => window.print()}>PDF / udskriv</button><small>{rows.length} registreringer · {LIVE_MAP_TIME_ZONE}</small></div></details>;
}

function LiveUnitRow({ unit, position, selected, now, onSelect, onFind, onHistory }) {
  const state = liveOperationalStatus(position, now); const freshness = positionFreshness(position, now);
  return <article className={`live-unit-card${selected ? " is-selected" : ""}`}><button className="live-unit-main" type="button" onClick={onSelect} aria-pressed={selected}><span className={`live-status-dot ${state}`} aria-hidden="true" /><span><strong>{unit.number} · {typeLabel(unit)}</strong><small>{LIVE_STATUS_LABELS[state]}{position?.speedKph != null && state === "moving" ? ` · ${position.speedKph} km/t` : ""}</small><small><Icon name="pin" size={12} />{position?.label || "Ingen position"}</small><em>{freshness.stale ? `Sidst set · ${freshness.label}` : freshness.label}</em></span></button><div><button type="button" onClick={onFind}><Icon name="pin" size={14} />Find på kort</button><button type="button" onClick={onHistory}><Icon name="clock" size={14} />Historik</button></div></article>;
}

function LiveOverview({ units, resourceOptions, storedPositions, filters, setFilters, selectedUnitId, setSelectedUnitId, setMode, setMobileView, mobileView }) {
  const [listOpen, setListOpen] = useState(true); const [focusUnitId, setFocusUnitId] = useState(null); const [followUnitId, setFollowUnitId] = useState(null); const now = useMemo(() => new Date().toISOString(), []);
  const positions = useMemo(() => operationalPositions(units, storedPositions, now), [now, storedPositions, units]);
  const departments = useMemo(() => [...new Set(units.map((unit) => unit.department).filter(Boolean))].sort(), [units]);
  const types = useMemo(() => {
    const configured = (resourceOptions?.categories || []).map((type) => ({ id: type.id, label: `${type.navn}${type.aktiv === false ? " (inaktiv)" : ""}` }));
    const configuredIds = new Set(configured.map((type) => type.id));
    const legacy = units.filter((unit) => !configuredIds.has(unitTypeKey(unit))).map((unit) => ({ id: unitTypeKey(unit), label: typeLabel(unit) }));
    return [...configured, ...legacy.filter((type, index, all) => all.findIndex((item) => item.id === type.id) === index)].sort((a, b) => a.label.localeCompare(b.label, "da"));
  }, [resourceOptions?.categories, units]);
  const filteredUnits = useMemo(() => filterPositionUnits(units, positions, filters).filter((unit) => !filters.status || liveOperationalStatus(positionForUnit({ positions }, unit.id), now) === filters.status), [filters, now, positions, units]);
  const filteredIds = useMemo(() => new Set(filteredUnits.map((unit) => unit.id)), [filteredUnits]);
  const filteredPositions = positions.filter((position) => filteredIds.has(position.unitId));
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, units.filter((unit) => liveOperationalStatus(positionForUnit({ positions }, unit.id), now) === status).length]));
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const select = (unitId) => { setSelectedUnitId(unitId); setMobileView("map"); };
  const findOnMap = (unitId) => { select(unitId); setFocusUnitId(unitId); };
  const toggleFollow = (unitId) => { select(unitId); setFollowUnitId((current) => current === unitId ? null : unitId); };
  useEffect(() => { if (!selectedUnitId || !filteredIds.has(selectedUnitId)) setSelectedUnitId(filteredUnits[0]?.id || ""); }, [filteredIds, filteredUnits, selectedUnitId, setSelectedUnitId]);
  return <><section className="live-map-toolbar"><label className="live-search"><Icon name="search" size={17} /><span className="sr-only">Søg enhed eller nummerplade</span><input placeholder="Søg enhed eller nummerplade" value={filters.query} onChange={(event) => setFilter("query", event.target.value)} /></label><SelectFilter label="Afdeling" value={filters.department} onChange={(value) => setFilter("department", value)} allLabel="Alle afdelinger">{departments.map((value) => <option key={value} value={value}>{value}</option>)}</SelectFilter><SelectFilter label="Enhedstype" value={filters.type} onChange={(value) => setFilter("type", value)} allLabel="Alle enhedstyper">{types.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</SelectFilter><button className="primary-button" type="button" onClick={() => setFilters({ query: "", department: "", type: "", status: "" })}>Vis alle</button></section><div className="live-mobile-switch" role="group" aria-label="Mobil visning"><button className={mobileView === "map" ? "is-active" : ""} type="button" onClick={() => setMobileView("map")}><Icon name="map" size={16} />Kort</button><button className={mobileView === "list" ? "is-active" : ""} type="button" onClick={() => setMobileView("list")}><Icon name="unit" size={16} />Enheder</button></div><section className={`live-overview-shell${listOpen ? "" : " list-collapsed"}`}><div className="live-overview-map"><GeoMap positions={filteredPositions} units={units} selectedUnitId={selectedUnitId} popupUnitId={selectedUnitId} focusUnitId={focusUnitId} followUnitId={followUnitId} onSelect={setSelectedUnitId} onToggleFollow={toggleFollow} now={now} ariaLabel="Livekort med syntetiske enhedspositioner" /><div className="live-map-legend"><span><i className="moving" />Kører</span><span><i className="holding" />Holder</span><span><i className="offline" />Intet signal</span>{followUnitId ? <b>Følger valgt enhed</b> : null}</div></div><aside className="live-unit-panel" aria-label="Enhedsoversigt"><button className="live-list-toggle" type="button" aria-label={listOpen ? "Skjul enhedsoversigt" : "Vis enhedsoversigt"} onClick={() => setListOpen((value) => !value)}><Icon name="chevron" size={16} /></button><div className="live-status-tabs" role="group" aria-label="Filtrér efter status"><button className={!filters.status ? "is-active" : ""} type="button" onClick={() => setFilter("status", "")}>Alle {units.length}</button>{STATUS_ORDER.map((status) => <button className={filters.status === status ? `is-active ${status}` : status} type="button" key={status} onClick={() => setFilter("status", status)}><i />{LIVE_STATUS_LABELS[status]} {counts[status]}</button>)}</div><div className="live-unit-scroll">{filteredUnits.length ? filteredUnits.map((unit) => <LiveUnitRow key={unit.id} unit={unit} position={positionForUnit({ positions }, unit.id)} selected={selectedUnitId === unit.id} now={now} onSelect={() => select(unit.id)} onFind={() => findOnMap(unit.id)} onHistory={() => { setSelectedUnitId(unit.id); setMode("history"); }} />) : <div className="live-empty compact"><Icon name="search" size={24} /><strong>Ingen enheder matcher</strong><p>Nulstil filtrene eller vælg en anden status.</p></div>}</div></aside></section></>;
}

function TripList({ events, selectedPacket, onSelectTrip }) {
  let tripNumber = 0;
  return <aside className="history-events"><h2>Ture og stop</h2>{events.map((event) => { if (event.kind === "trip") tripNumber += 1; return event.kind === "trip" ? <button key={event.id} type="button" onClick={() => onSelectTrip(event)}><span className="history-event-number">{tripNumber}</span><span><strong>{localTime(event.from)} – {localTime(event.to)} · {event.distanceKm.toLocaleString("da-DK", { maximumFractionDigits: 1 })} km</strong><small>{event.fromLabel} → {event.toLabel}</small></span><Icon name="chevron" size={14} /></button> : event.kind === "stop" ? <article className="history-stop" key={event.id}><i /><span><strong>{localTime(event.from)} – {localTime(event.to)} · Stop</strong><small>{durationLabel(Math.round(event.durationMinutes))} · {event.label}</small></span></article> : <article className="history-gap" key={event.id}><i /><span><strong>Ingen positionsdata</strong><small>{localTime(event.from)} – {localTime(event.to)}</small></span></article>; })}<section className="history-selected-summary"><h3>Valgt tidspunkt · {localTime(selectedPacket?.measuredAt, true)}</h3><dl><div><dt>Hastighed</dt><dd>{selectedPacket?.speedKph ?? "–"} km/t</dd></div><div><dt>Tænding</dt><dd>{selectedPacket?.ignition ? "Til" : "Fra"}</dd></div><div><dt>GPS registreret</dt><dd>{localTime(selectedPacket?.measuredAt, true)}</dd></div><div><dt>Position</dt><dd>{selectedPacket?.address || "Ikke oplyst"}</dd></div></dl></section></aside>;
}

function Playback({ packets, selectedIndex, setSelectedIndex, playing, setPlaying, speed, setSpeed }) {
  return <div className="history-playback"><button className="history-play" type="button" aria-label={playing ? "Pause" : "Afspil tur"} onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : <Icon name="play" size={18} />}</button><select aria-label="Afspilningshastighed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><span>{localTime(packets[0]?.measuredAt)}</span><div className="history-timeline"><input aria-label="Valgt tidspunkt i turen" type="range" min="0" max={Math.max(0, packets.length - 1)} value={Math.min(selectedIndex, Math.max(0, packets.length - 1))} onChange={(event) => { setPlaying(false); setSelectedIndex(Number(event.target.value)); }} />{packets.map((packet, index) => packet.gapBefore ? <i aria-label={`Databrud før ${localTime(packet.measuredAt, true)}`} key={packet.id} style={{ left: `${packets.length <= 1 ? 0 : index / (packets.length - 1) * 100}%` }} title={`Ingen positionsdata før ${localTime(packet.measuredAt, true)}`} /> : null)}</div><span>{localTime(packets.at(-1)?.measuredAt)}</span><output>{localTime(packets[selectedIndex]?.measuredAt, true)}</output></div>;
}

function HistoryMap({ packets, unit, selectedIndex, setSelectedIndex, playing, setPlaying, speed, setSpeed }) {
  const events = deriveTripsAndStops(packets); const selectedPacket = packets[selectedIndex] || packets[0];
  const gaps = packets.flatMap((packet, index) => packet.gapBefore && index ? [[packets[index - 1], packet]] : []);
  return <div className="history-map-layout"><section className="history-map-card"><GeoMap positions={packets} units={[unit]} selectedUnitId={unit.id} showMarkers={false} routeSegments={routeSegments(packets)} routeGaps={gaps} routeCursor={selectedPacket} ariaLabel={`Historisk rute for ${unit.number}`} /><Playback packets={packets} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} /></section><TripList events={events} selectedPacket={selectedPacket} onSelectTrip={(event) => setSelectedIndex(Math.max(0, packets.findIndex((packet) => packet.measuredAt === event.from)))} /></div>;
}

const COLUMN_LABELS = { time: "Tidspunkt", address: "Adresse", speed: "Hastighed", ignition: "Tænding", status: "Datastatus" };
function PositionTable({ packets, unit, selectedIndex, setSelectedIndex, onShowOnMap }) {
  const [query, setQuery] = useState(""); const [columns, setColumns] = useState(["time", "address", "speed", "ignition", "status"]); const [page, setPage] = useState(0); const pageSize = 25;
  const filtered = packets.filter((packet) => !query || packet.address.toLocaleLowerCase("da").includes(query.toLocaleLowerCase("da"))); const selected = packets[selectedIndex] || packets[0];
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)); const visibleRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => { setPage(0); }, [query, packets]);
  const toggle = (key) => setColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  return <div className="history-position-layout"><section className="history-table-card"><header><h2>Positioner · {filtered.length} registreringer</h2><label className="live-search"><Icon name="search" size={15} /><span className="sr-only">Søg adresse</span><input value={query} placeholder="Søg adresse" onChange={(event) => setQuery(event.target.value)} /></label><details className="history-columns"><summary className="secondary-button">Kolonner</summary><div>{Object.entries(COLUMN_LABELS).map(([key, label]) => <label key={key}><input type="checkbox" checked={columns.includes(key)} onChange={() => toggle(key)} />{label}</label>)}</div></details></header><div className="history-table-scroll"><table><thead><tr>{columns.map((key) => <th key={key}>{COLUMN_LABELS[key]}</th>)}</tr></thead><tbody>{visibleRows.map((packet) => <tr className={selected?.id === packet.id ? "is-selected" : ""} key={packet.id} tabIndex="0" onClick={() => setSelectedIndex(packets.findIndex((item) => item.id === packet.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedIndex(packets.findIndex((item) => item.id === packet.id)); } }}>{columns.map((key) => <td key={key}>{key === "time" ? localTime(packet.measuredAt, true) : key === "address" ? packet.address : key === "speed" ? `${packet.speedKph ?? "–"} km/t` : key === "ignition" ? packet.ignition ? "Til" : "Fra" : <><i className={packet.gapBefore ? "incomplete" : "received"} />{packet.gapBefore ? "Ufuldstændig" : "Modtaget"}</>}</td>)}</tr>)}</tbody></table></div><footer className="history-pagination"><span>{filtered.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} af ${filtered.length}` : "0 registreringer"}</span><button type="button" aria-label="Forrige side" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>‹</button><button type="button" aria-label="Næste side" disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>›</button></footer></section><aside className="history-position-detail"><h2>Position · {localTime(selected?.measuredAt, true)}</h2>{selected ? <><div className="history-mini-map"><GeoMap positions={[{ ...selected, connectionStatus: "online", movementState: selected.speedKph > 2 ? "moving" : "stationary", label: selected.address }]} units={[unit]} selectedUnitId={unit.id} compact controls={false} /></div><button className="secondary-button history-show-map" type="button" onClick={onShowOnMap}><Icon name="map" size={14} />Vis på kort</button><dl><div><dt>Hastighed</dt><dd>{selected.speedKph ?? "–"} km/t</dd></div><div><dt>Kilometerstand</dt><dd>{selected.odometerKm == null ? "Ikke tilgængelig" : `${selected.odometerKm.toLocaleString("da-DK")} km`}</dd></div><div><dt>Drivbatteri</dt><dd>{selected.driveBatteryPct == null ? "Ikke tilgængelig" : `${selected.driveBatteryPct} %`}</dd></div><div><dt>Trackerbatteri</dt><dd>{selected.trackerBatteryPct == null ? "Ikke tilgængelig" : `${selected.trackerBatteryPct} %`}</dd></div><div><dt>Tænding</dt><dd>{selected.ignition ? "Til" : "Fra"}</dd></div></dl><details className="history-technical"><summary>Tekniske data</summary><dl><div><dt>Koordinater</dt><dd>{selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}</dd></div><div><dt>Modtaget</dt><dd>{localDateTime(selected.receivedAt, { seconds: true })}</dd></div><div><dt>Kilde</dt><dd>{selected.synthetic ? "Syntetisk testadapter" : selected.source || "Ikke oplyst"}</dd></div></dl></details><small>Kun understøttede målinger vises. 0 er en registreret værdi; manglende data vises særskilt.</small></> : null}</aside></div>;
}

function MetricChart({ title, unit, values, colorClass }) {
  const valid = values.filter((item) => item.value !== null && item.value !== undefined); const max = Math.max(1, ...valid.map((item) => Number(item.value)));
  const segments = []; let current = [];
  values.forEach((item, index) => {
    if (item.gapBefore || item.value === null || item.value === undefined) { if (current.length) segments.push(current); current = []; }
    if (item.value !== null && item.value !== undefined) current.push(`${values.length === 1 ? 0 : index / (values.length - 1) * 100},${42 - Number(item.value) / max * 36}`);
  });
  if (current.length) segments.push(current);
  return <article className="metric-chart"><header><span><strong>{title}</strong><small>{unit}</small></span><b>{valid.at(-1)?.value ?? "–"} {valid.length ? unit : ""}</b></header><svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-label={`${title} over tid`}><line x1="0" y1="42" x2="100" y2="42" />{segments.map((points, index) => <polyline className={colorClass} key={`${colorClass}-${index}`} points={points.join(" ")} />)}</svg>{valid.length ? <small>{localTime(valid[0].measuredAt)} – {localTime(valid.at(-1).measuredAt)} · huller forbindes ikke</small> : <p>Ingen understøttede målinger i perioden.</p>}</article>;
}

function Measurements({ packets, selectedPacket }) {
  const selectedAt = selectedPacket?.measuredAt || packets.at(-1)?.measuredAt;
  const metrics = [["Hastighed", "km/t", "speedKph", "speed"], ["Signal", "%", "signalPercent", "signal"], ["Trackerbatteri", "%", "trackerBatteryPct", "battery"], ["Drivbatteri", "%", "driveBatteryPct", "drive"]];
  return <div className="history-measurements"><section className="history-metric-summary"><h2>Målinger ved {localTime(selectedAt, true)}</h2>{metrics.map(([label, unit, field]) => { const value = latestValidMeasurement(packets, field, selectedAt); return <div key={field}><span>{label}</span><strong>{value ? `${value.value} ${unit}` : "Ikke tilgængelig"}</strong><small>{value ? value.ageMinutes ? `Seneste gyldige · ${value.ageMinutes} min. gammel` : "Målt på valgt tidspunkt" : "Providerfelt ikke registreret"}</small></div>; })}</section><section className="history-chart-grid">{metrics.map(([label, unit, field, color]) => <MetricChart key={field} title={label} unit={unit} colorClass={color} values={packets.map((packet) => ({ measuredAt: packet.measuredAt, value: packet[field] }))} />)}</section></div>;
}

function HistoryWorkspace({ units, selectedUnitId, setSelectedUnitId, from, to, setPeriod }) {
  const [tab, setTab] = useState("map"); const [selectedIndex, setSelectedIndex] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(1);
  const unit = units.find((item) => item.id === selectedUnitId) || units[0];
  const allPackets = useMemo(() => unit ? createSyntheticHistory(unit.id, { electric: unit.energy === "electric" }) : [], [unit]);
  const packets = useMemo(() => historyInPeriod(allPackets, toIso(from), toIso(to)), [allPackets, from, to]);
  useEffect(() => { setSelectedIndex(0); setPlaying(false); }, [from, selectedUnitId, to]);
  useEffect(() => { if (!playing || packets.length < 2) return undefined; const timer = window.setInterval(() => setSelectedIndex((current) => current >= packets.length - 1 ? 0 : current + 1), 900 / speed); return () => window.clearInterval(timer); }, [packets.length, playing, speed]);
  if (!unit) return <div className="live-empty"><h2>Ingen enheder</h2><p>Opret en enhed for at åbne historik.</p></div>;
  const selectedPacket = packets[selectedIndex] || packets[0];
  return <><section className="history-toolbar"><SelectFilter label="Historikenhed" value={unit.id} onChange={setSelectedUnitId} allLabel="Vælg enhed">{units.map((item) => <option key={item.id} value={item.id}>{item.number} · {modelLabel(item)}</option>)}</SelectFilter><PeriodPicker from={from} to={to} onApply={({ from: nextFrom, to: nextTo }) => setPeriod({ from: nextFrom, to: nextTo })} /><button className="primary-button" type="button" onClick={() => setPeriod({ from, to })}><Icon name="play" size={15} />Vis historik</button><ExportMenu packets={allPackets} unit={unit} from={toIso(from)} to={toIso(to)} /></section><nav className="history-tabs" aria-label="Historikvisning">{[["map", "Kort"], ["positions", "Positioner"], ["measurements", "Målinger"]].map(([key, label]) => <button role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} type="button" key={key} onClick={() => setTab(key)}>{label}</button>)}</nav>{!packets.length ? <div className="history-empty"><Icon name="map" size={30} /><h2>Ingen positionsdata i perioden</h2><p>Vælg 21. september 2026 kl. 08.00–16.00 for at se det syntetiske testforløb.</p></div> : tab === "map" ? <HistoryMap packets={packets} unit={unit} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} /> : tab === "positions" ? <PositionTable packets={packets} unit={unit} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex} onShowOnMap={() => setTab("map")} /> : <Measurements packets={packets} selectedPacket={selectedPacket} />}</>;
}

export function LiveMap({ initialViewState, onViewStateChange }) {
  const { units, relations, resourceOptions, loading } = useFleetData(); const queryUnit = new URLSearchParams(window.location.search).get("unit");
  const [mode, setMode] = useState(initialViewState?.mode || "live"); const [filters, setFilters] = useState(initialViewState?.filters || { query: "", department: "", type: "", status: "" });
  const [selectedUnitId, setSelectedUnitId] = useState(queryUnit || initialViewState?.selectedUnitId || ""); const [mobileView, setMobileView] = useState(initialViewState?.mobileView || "map"); const [period, setPeriod] = useState(initialViewState?.period || { from: DEFAULT_FROM, to: DEFAULT_TO });
  useEffect(() => { if (!selectedUnitId && units.length) setSelectedUnitId(units[0].id); }, [selectedUnitId, units]);
  useEffect(() => { onViewStateChange?.({ mode, filters, selectedUnitId, mobileView, period }); }, [filters, mobileView, mode, onViewStateChange, period, selectedUnitId]);
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser Livekort …</p></main>;
  return <main className={`workspace-page live-map-page-v2 mobile-${mobileView}`} id="main-content"><header className="live-map-header"><div><h2 className="sr-only">Livekort</h2><span>DEMO · Syntetiske data</span></div><div className="live-mode-switch" role="group" aria-label="Vælg Live eller Historik"><button className={mode === "live" ? "is-active" : ""} type="button" onClick={() => setMode("live")}><i />Live</button><button className={mode === "history" ? "is-active" : ""} type="button" onClick={() => setMode("history")}>Historik</button></div></header>{mode === "live" ? <LiveOverview units={units} resourceOptions={resourceOptions} storedPositions={relations.positions || []} filters={filters} setFilters={setFilters} selectedUnitId={selectedUnitId} setSelectedUnitId={setSelectedUnitId} setMode={setMode} mobileView={mobileView} setMobileView={setMobileView} /> : <HistoryWorkspace units={units} selectedUnitId={selectedUnitId} setSelectedUnitId={setSelectedUnitId} from={period.from} to={period.to} setPeriod={setPeriod} />}</main>;
}
