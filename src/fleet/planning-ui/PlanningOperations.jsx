import { useState } from "react";
import {
  DAG_SLUT_MIN, DAG_START_MIN, RAEKKEVISNING, afvigelsesniveau,
  grupperKalender, minutTilTid, ruteDatagrundlag, ruteTidsresume,
  tidslinjeSegmenter,
} from "./planning-ui-model.js";

const RUTENAVNE = Object.freeze({
  "ui-rute-nord": "København fast rute",
  "ui-rute-transport": "Service Nord",
  "ui-rute-service": "Kommunal rute 04",
  "ui-rute-renovation": "Syd rute",
  "ui-rute-cykel": "Akutteam",
  "ui-rute-syd": "Vest rute",
  "ui-rute-teknik": "Industrirute",
  "ui-rute-reserve": "Kyst rute",
});

const DEMODATO = "Tirsdag d. 24. september 2024";
const TYPENAVNE = { service: "Service", hjemmepleje: "Kommunal", transport: "Erhverv", renovation: "Facility" };
const VISNINGSLABEL = { [RAEKKEVISNING.RUTE]: "Ruter", [RAEKKEVISNING.MEDARBEJDER]: "Medarbejdere", [RAEKKEVISNING.KOERETOEJ]: "Køretøjer" };
const DEMO_KORTPUNKTER = Object.freeze([
  "120,115 185,130 245,105 315,125 385,90 470,112",
  "90,245 155,212 230,225 290,175 375,190 455,145",
  "185,270 245,240 305,250 350,205 430,220 500,180",
  "75,180 145,160 210,185 278,150 342,165 420,132",
  "145,75 220,96 292,72 350,105 430,85 505,120",
]);

export const referenceRutenavn = (rute) => RUTENAVNE[rute.id] || rute.navn;

function Glyph({ name }) {
  const paths = {
    route: <><circle cx="5" cy="5" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="8" cy="19" r="2"/><path d="M7 5h4c4 0 4 2 4 4v3c0 3-2 5-5 5H8"/></>,
    person: <><circle cx="12" cy="7" r="3"/><path d="M5 21c0-5 3-8 7-8s7 3 7 8"/></>,
    vehicle: <><path d="M3 8h12l3 4h3v6H3z"/><path d="M15 8v4h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    filter: <path d="M4 6h16M7 12h10M10 18h4"/>,
    map: <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2zM8 4v13M16 7v13"/>,
    expand: <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>,
    alert: <><path d="M12 3 2 21h20z"/><path d="M12 9v5M12 18h.01"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    minus: <path d="M5 12h14"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
  };
  return <svg className="pr-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.route}</svg>;
}

function Segmentvalg({ value, onChange }) {
  return <div className="pr-segments" aria-label="Vis drift efter">{Object.values(RAEKKEVISNING).map((mode) => <button type="button" key={mode} aria-pressed={value === mode} onClick={() => onChange(mode)}><Glyph name={mode === RAEKKEVISNING.RUTE ? "route" : mode === RAEKKEVISNING.MEDARBEJDER ? "person" : "vehicle"}/>{VISNINGSLABEL[mode]}</button>)}</div>;
}

function StatusPill({ tone, children }) {
  return <span className="pr-status" data-tone={tone}><i />{children}</span>;
}

function driftStatus(rute, indstillinger) {
  if (rute.id === "ui-rute-service" && rute.afvigelseMin > 0) return { tone: "kritisk", label: `+${rute.afvigelseMin} min` };
  if (rute.id === "ui-rute-transport" && rute.afvigelseMin > 0) return { tone: "advarsel", label: `+${rute.afvigelseMin} min` };
  const tone = afvigelsesniveau(rute, indstillinger);
  if (rute.id === "ui-rute-reserve") return { tone: "neutral", label: "Ikke tildelt" };
  if (rute.id === "ui-rute-cykel") return { tone: "neutral", label: "OBD offline" };
  if (tone === "kritisk" || tone === "konflikt") return { tone: "kritisk", label: `+${rute.afvigelseMin} min` };
  if (tone === "advarsel") return { tone: "advarsel", label: `+${rute.afvigelseMin} min` };
  return { tone: "normal", label: "Efter planen" };
}

function personFor(rute, medarbejdere) { return rute.id === "ui-rute-reserve" ? null : medarbejdere.find((person) => person.id === rute.medarbejderId); }
function bilFor(rute, koeretoejer) { return koeretoejer.find((bil) => bil.id === rute.koeretoejId); }
function initialer(navn = "—") { return navn.split(" ").filter(Boolean).slice(0, 2).map((del) => del[0]).join(""); }

export function filtrerReferenceRuter(ruter, filtre, indstillinger) {
  return ruter.filter((rute) => {
    const status = driftStatus(rute, indstillinger);
    const statusMatcher = filtre.status === "alle"
      || (filtre.status === "handling" ? ["advarsel", "kritisk"].includes(status.tone) || rute.datakonflikt || rute.id === "ui-rute-cykel"
        : filtre.status === "konflikt" ? rute.datakonflikt : status.tone === filtre.status);
    return statusMatcher
      && (!filtre.ruteId || rute.id === filtre.ruteId)
      && (!filtre.medarbejderId || rute.medarbejderId === filtre.medarbejderId)
      && (!filtre.koeretoejId || rute.koeretoejId === filtre.koeretoejId);
  });
}

function Kpi({ label, value, tone, icon, active, onClick }) {
  return <button className="pr-kpi" data-tone={tone} aria-pressed={active} type="button" onClick={onClick}><span className="pr-kpi-icon"><Glyph name={icon}/></span><span><small>{label}</small><strong>{value}</strong></span><Glyph name="chevron"/></button>;
}

function DemoKort({ ruter, selectedRouteId, onRoute }) {
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [visRuter, setVisRuter] = useState(true);
  const valgteRute = ruter.find((rute) => rute.id === selectedRouteId);
  const viste = ruter.slice(0, 8);
  return <section className={`pr-panel pr-map-panel${fullscreen ? " pr-map-fullscreen" : ""}`} aria-label="Rutekort – live demo">
    <header><h2>Rutekort – live</h2><div className="pr-map-tools"><button type="button" className="pr-soft-button" aria-pressed={visRuter} onClick={() => setVisRuter((nu) => !nu)}><Glyph name="route"/>{visRuter ? "Skjul ruter" : "Vis ruter"}</button><button type="button" className="pr-soft-button" onClick={() => setFullscreen((nu) => !nu)}><Glyph name="expand"/>{fullscreen ? "Luk fuld skærm" : "Vis fuld skærm"}</button></div></header>
    <div className="pr-map-canvas">
      <svg viewBox="0 0 720 330" role="img" aria-label="Demo – syntetiske ruter og positioner" style={{ transform: `scale(${zoom})` }}>
        <path className="pr-map-water" d="M430 0c-45 74-7 91-49 142-39 48-96 42-126 97-19 35-8 66-25 91h490V0z"/>
        <g className="pr-map-roads"><path d="M15 250 690 65M55 75l590 205M160 0l110 330M25 160h665M390 0l-72 330"/><path d="M0 290 715 25M80 0l560 330"/></g>
        {visRuter && viste.map((rute, index) => { const punkter = DEMO_KORTPUNKTER[index % DEMO_KORTPUNKTER.length].split(" "); const [slutX, slutY] = punkter.at(-1).split(",").map(Number); return <g key={rute.id} className="pr-map-line" data-tone={driftStatus(rute, { model: "FAELLES", faelles: { advarselMin: 15, kritiskMin: 30 } }).tone} data-selected={selectedRouteId === rute.id} data-muted={Boolean(selectedRouteId && selectedRouteId !== rute.id)} onClick={() => onRoute(rute.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRoute(rute.id); } }} role="button" tabIndex="0">
          <polyline points={DEMO_KORTPUNKTER[index % DEMO_KORTPUNKTER.length]}/>
          <circle cx={slutX} cy={slutY} r="10"/><text x={slutX} y={slutY + 3}>●</text>
        </g>; })}
        <text className="pr-map-city" x="365" y="132">København</text><text className="pr-map-city" x="115" y="208">Roskilde</text><text className="pr-map-city" x="205" y="290">Køge</text>
      </svg>
      {valgteRute && <div className="pr-map-detail" role="status"><button type="button" aria-label="Fjern rutevalg" onClick={() => onRoute(valgteRute.id)}>×</button><strong>{referenceRutenavn(valgteRute)}</strong><span>{valgteRute.stop.length} stop · {driftStatus(valgteRute, { model: "FAELLES", faelles: { advarselMin: 15, kritiskMin: 30 } }).label}</span><small>Valgt lokalt på kort og i driftsoverblikket</small></div>}
      <div className="pr-map-legend"><StatusPill tone="normal">Efter planen</StatusPill><StatusPill tone="advarsel">Forsinket</StatusPill><StatusPill tone="kritisk">Kritisk</StatusPill><StatusPill tone="neutral">Ikke tildelt</StatusPill></div>
      <div className="pr-map-zoom"><button type="button" aria-label="Zoom ind" onClick={() => setZoom((nu) => Math.min(1.35, nu + .1))}><Glyph name="plus"/></button><button type="button" aria-label="Zoom ud" onClick={() => setZoom((nu) => Math.max(.85, nu - .1))}><Glyph name="minus"/></button><button type="button" aria-label="Nulstil kort" onClick={() => { setZoom(1); if (selectedRouteId) onRoute(selectedRouteId); }}>Nulstil</button></div>
      <span className="pr-demo-label">Syntetisk demo – ingen liveforbindelse</span>
    </div>
  </section>;
}

function tabelOverskrifter(mode) {
  if (mode === RAEKKEVISNING.MEDARBEJDER) return ["Medarbejder", "Aktiv rute", "Køretøj", "Fremdrift", "Aktuel aktivitet", "Forventet slut", "Status"];
  if (mode === RAEKKEVISNING.KOERETOEJ) return ["Køretøj", "Identifikation", "Tilknyttet rute", "Medarbejder", "Forbindelse", "Demoposition", "Senest opdateret"];
  return ["Rute", "Medarbejder", "Køretøj", "Fremdrift", "Aktuel aktivitet", "Forventet slut", "Status"];
}

function DriftRow({ rute, mode, medarbejdere, koeretoejer, indstillinger, selected, onSelect, onOpenCalendar, menuOpen, onMenu }) {
  const person = personFor(rute, medarbejdere);
  const bil = bilFor(rute, koeretoejer);
  const status = driftStatus(rute, indstillinger);
  const resume = ruteTidsresume(rute);
  const current = rute.stop[Math.min(rute.gennemfoert, rute.stop.length - 1)];
  const progress = <><strong>{rute.gennemfoert}/{rute.stop.length}</strong><span className="pr-progress"><i style={{ width: `${(rute.gennemfoert / rute.stop.length) * 100}%` }}/></span></>;
  const route = <button type="button" className="pr-route-link" onClick={(event) => { event.stopPropagation(); onSelect(rute.id); }}><i/><span><strong>{referenceRutenavn(rute)}</strong><small>{rute.stop.length} stop · {TYPENAVNE[rute.rutetype]}</small></span></button>;
  const personCell = <span className="pr-person"><i>{initialer(person?.navn)}</i>{person?.navn?.replace("Demo ", "").replace(" Fiktiv", "") || "Ikke tildelt"}</span>;
  const vehicle = <span className="pr-vehicle"><Glyph name="vehicle"/>{bil?.navn.split(" · ")[0] || "—"}</span>;
  let cells;
  if (mode === RAEKKEVISNING.MEDARBEJDER) cells = [personCell, route, vehicle, progress, <><strong>{current?.navn || "—"}</strong><small>Stop {Math.min(rute.gennemfoert + 1, rute.stop.length)} af {rute.stop.length}</small></>, resume.komplet ? minutTilTid(resume.slutMinut + rute.afvigelseMin) : "—", <StatusPill tone={status.tone}>{status.label}</StatusPill>];
  else if (mode === RAEKKEVISNING.KOERETOEJ) cells = [vehicle, bil?.navn.split(" · ")[1] || "Ingen ID", route, personCell, <StatusPill tone={rute.obd === "frisk" ? "normal" : rute.obd === "foraeldet" ? "advarsel" : "neutral"}>{rute.obd === "frisk" ? "OBD live · demo" : rute.obd === "foraeldet" ? "OBD forældet" : "Uden OBD"}</StatusPill>, current?.navn || "Ukendt", rute.obd === "frisk" ? "09:42" : rute.obd === "foraeldet" ? "09:12" : "Mobil/estimat"];
  else cells = [route, personCell, vehicle, progress, <><strong>{current?.navn.replace("Fiktivt stop ", "") || "—"}</strong><small>Stop {Math.min(rute.gennemfoert + 1, rute.stop.length)} af {rute.stop.length}</small></>, resume.komplet ? minutTilTid(resume.slutMinut + rute.afvigelseMin) : "—", <StatusPill tone={status.tone}>{status.label}</StatusPill>];
  return <tr data-tone={status.tone} data-selected={selected} onClick={() => onSelect(rute.id)}>{cells.map((cell, index) => <td key={index}>{cell}</td>)}<td className="pr-row-actions"><button type="button" className="pr-icon-button" aria-expanded={menuOpen} aria-label={`Flere handlinger for ${referenceRutenavn(rute)}`} onClick={(event) => { event.stopPropagation(); onMenu(menuOpen ? null : rute.id); }}><Glyph name="more"/></button>{menuOpen && <div className="pr-row-menu"><button type="button" onClick={() => onSelect(rute.id)}>Fremhæv på kort</button><button type="button" onClick={() => onOpenCalendar(rute.id)}>Åbn i Livekalender</button></div>}</td></tr>;
}

export function DagensDrift({ ruter, medarbejdere, koeretoejer, indstillinger, filtre, setFiltre, raekkevisning, setRaekkevisning, selectedRouteId, onSelectRoute, onOpenCalendar, onProposal }) {
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [menuRouteId, setMenuRouteId] = useState(null);
  const base = filtrerReferenceRuter(ruter, filtre, indstillinger)
    .filter((rute) => `${referenceRutenavn(rute)} ${personFor(rute, medarbejdere)?.navn || ""} ${bilFor(rute, koeretoejer)?.navn || ""}`.toLowerCase().includes(search.toLowerCase()));
  const rows = page === 1 ? base : [...base.slice(page - 1), ...base.slice(0, page - 1)];
  const selectRoute = (id) => onSelectRoute(selectedRouteId === id ? null : id);
  const kpiFilter = (status) => setFiltre((nu) => ({ ...nu, status: nu.status === status ? "alle" : status }));
  const actions = [
    { rute: ruter.find((r) => r.id === "ui-rute-service"), tone: "kritisk", title: "Kommunal rute 04", badge: "+27 min", text: "Forsinket efter længere varighed. 2 efterfølgende stop påvirkes." },
    { rute: ruter.find((r) => r.id === "ui-rute-reserve"), tone: "neutral", title: "Kyst rute", badge: "Ikke tildelt", text: "Ruten mangler tildeling af medarbejder." },
    { rute: ruter.find((r) => r.id === "ui-rute-cykel"), tone: "advarsel", title: "Køretøj DEMO-03", badge: "OBD offline", text: "Ingen data siden 09:12. Forbindelsen kan være midlertidigt nede." },
  ];
  return <div className="pr-page" data-reference-view="dagens-drift">
    <header className="pr-page-heading"><div><div className="pr-title-line"><h1>Dagens drift</h1><span>{DEMODATO}</span><i/><span>Senest opdateret 09:42</span><b aria-label="Status aktiv"/></div></div><Segmentvalg value={raekkevisning} onChange={setRaekkevisning}/></header>
    <div className="pr-kpis"><Kpi label="Aktive ruter" value="18" tone="info" icon="route" active={filtre.status === "alle" && !filtre.ruteId} onClick={() => setFiltre((nu) => ({ ...nu, status: "alle", ruteId: "" }))}/><Kpi label="Kører efter planen" value="14" tone="normal" icon="check" active={filtre.status === "normal"} onClick={() => kpiFilter("normal")}/><Kpi label="Kræver handling" value="3" tone="advarsel" icon="alert" active={filtre.status === "handling"} onClick={() => kpiFilter("handling")}/><Kpi label="Ikke tildelt" value="2" tone="neutral" icon="more" active={filtre.ruteId === "ui-rute-reserve"} onClick={() => setFiltre((nu) => ({ ...nu, status: "alle", ruteId: nu.ruteId === "ui-rute-reserve" ? "" : "ui-rute-reserve" }))}/></div>
    <div className="pr-dashboard-layout">
      <section className="pr-panel pr-live-table"><header><h2>Live overblik</h2><div className="pr-table-tools"><label><Glyph name="search"/><span className="pu-sr-only">Søg i ruter</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søg i ruter ..."/></label><button type="button" className="pr-soft-button" aria-expanded={filterOpen} onClick={() => setFilterOpen((nu) => !nu)}><Glyph name="filter"/>Filtre</button></div></header>{filterOpen && <div className="pr-inline-filter"><label>Status<select value={filtre.status} onChange={(event) => setFiltre((nu) => ({ ...nu, status: event.target.value }))}><option value="alle">Alle</option><option value="normal">Efter planen</option><option value="advarsel">Forsinket</option><option value="kritisk">Kritisk</option><option value="konflikt">Datakonflikt</option></select></label><button type="button" onClick={() => setFiltre({ status: "alle", ruteId: "", medarbejderId: "", koeretoejId: "" })}>Nulstil filtre</button></div>}
        <div className="pr-table-scroll"><table data-mode={raekkevisning}><thead><tr>{tabelOverskrifter(raekkevisning).map((label) => <th key={label}>{label}</th>)}<th><span className="pu-sr-only">Handling</span></th></tr></thead><tbody>{rows.map((rute) => <DriftRow key={rute.id} rute={rute} mode={raekkevisning} medarbejdere={medarbejdere} koeretoejer={koeretoejer} indstillinger={indstillinger} selected={selectedRouteId === rute.id} onSelect={selectRoute} onOpenCalendar={onOpenCalendar} menuOpen={menuRouteId === rute.id} onMenu={setMenuRouteId}/>)}</tbody></table></div>
        <footer><span>Viser 8 af 18 ruter</span><div>{[1, 2, 3].map((nummer) => <button key={nummer} type="button" aria-current={page === nummer ? "page" : undefined} onClick={() => setPage(nummer)}>{nummer}</button>)}</div></footer>
      </section>
      <div className="pr-dashboard-side"><DemoKort ruter={ruter} selectedRouteId={selectedRouteId} onRoute={selectRoute}/><section className="pr-panel pr-actions-panel"><header><h2>Kræver handling <b>3</b></h2><button type="button" className="pr-link-button" onClick={() => setFiltre((nu) => ({ ...nu, status: "handling", ruteId: "" }))}>Se alle</button></header>{actions.map((item) => <article key={item.title} data-tone={item.tone}><span className="pr-action-symbol"><Glyph name={item.tone === "kritisk" ? "alert" : item.tone === "neutral" ? "more" : "vehicle"}/></span><div><strong>{item.title} <StatusPill tone={item.tone}>{item.badge}</StatusPill></strong><p>{item.text}</p></div><button type="button" onClick={() => item.rute && onProposal(item.rute.id)}>Se forslag</button><button type="button" className="pr-icon-button" aria-label={`Flere handlinger for ${item.title}`} onClick={() => item.rute && selectRoute(item.rute.id)}><Glyph name="more"/></button></article>)}</section></div>
    </div>
  </div>;
}

function CalendarLane({ rute, indstillinger, selectedStopId, onOpen }) {
  const total = DAG_SLUT_MIN - DAG_START_MIN;
  const pos = (minut) => `${Math.max(0, Math.min(100, ((minut - DAG_START_MIN) / total) * 100))}%`;
  const status = driftStatus(rute, indstillinger);
  const segments = tidslinjeSegmenter(rute);
  const visteSegmenter = segments.filter((segment, index) => segment.art === "service" || segment.art === "pause" || index === 0 || index === segments.length - 1);
  let visuelMarkoer = segments[0]?.fraMinut || DAG_START_MIN;
  const visuelleSegmenter = visteSegmenter.map((segment) => {
    const faktiskVarighed = Math.max(1, segment.tilMinut - segment.fraMinut);
    const visuelVarighed = Math.max(75, faktiskVarighed);
    const visuel = { ...segment, visuelFra: visuelMarkoer, visuelTil: visuelMarkoer + visuelVarighed, faktiskVarighed };
    visuelMarkoer += visuelVarighed;
    return visuel;
  });
  const data = ruteDatagrundlag(rute);
  return <div className="pr-calendar-lane" data-tone={status.tone} aria-label={`Tidslinje for ${referenceRutenavn(rute)}`}>
    {visuelleSegmenter.map((segment, index) => { const stopNummer = visuelleSegmenter.slice(0, index + 1).filter((post) => post.art === "service").length; const label = segment.art === "koersel" ? "Kørsel" : segment.art === "pause" ? "Pause" : segment.art === "ventetid" ? "Vent" : `${stopNummer}. Stop`; const Component = segment.art === "service" ? "button" : "span"; return <Component type={segment.art === "service" ? "button" : undefined} key={segment.id} className="pr-calendar-block" data-kind={segment.art} data-done={segment.status === "gennemfoert"} data-selected={selectedStopId === segment.stopId} onClick={segment.art === "service" ? () => onOpen(rute.id, segment.stopId) : undefined} style={{ left: pos(segment.visuelFra), width: `${Math.max(3.8, ((segment.visuelTil - segment.visuelFra) / total) * 100)}%` }}><strong>{label}</strong><small>{segment.faktiskVarighed} min</small></Component>; })}
    {rute.afvigelseMin > 5 && <span className="pr-delay" style={{ left: pos(rute.stop[Math.min(rute.gennemfoert, rute.stop.length - 1)].forventetMinut) }}>+{rute.afvigelseMin} min</span>}
    {data.harLiveObd && <i className="pr-obd-position" style={{ left: pos(rute.stop[Math.min(rute.gennemfoert, rute.stop.length - 1)].forventetMinut) }} title="Aktuel position via syntetisk OBD-demo"/>}
    {!data.harLiveObd && <i className="pr-estimated-position" style={{ left: pos(rute.stop[Math.min(rute.gennemfoert, rute.stop.length - 1)].forventetMinut) }} title="Forventet position – estimeret, ikke live"/>}
  </div>;
}

export function LivekalenderReference({ ruter, medarbejdere, koeretoejer, indstillinger, filtre, setFiltre, raekkevisning, setRaekkevisning, selectedRouteId, selectedStopId, onRoute, onProposal, fullscreen, setFullscreen, flerdagsrute = null }) {
  const [dateOffset, setDateOffset] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const grouped = grupperKalender(ruter, raekkevisning, medarbejdere, koeretoejer);
  const ordered = grouped.raekker.flatMap((row) => row.ruter).filter((rute, index, all) => all.findIndex((post) => post.id === rute.id) === index);
  const visibleRoutes = ordered.slice(0, 6);
  const hours = Array.from({ length: 13 }, (_, i) => i + 6);
  const nowPos = `${((9 * 60 + 42 - DAG_START_MIN) / (DAG_SLUT_MIN - DAG_START_MIN)) * 100}%`;
  const flerdagIDag = flerdagsrute?.days?.find((day) => day.date === "2032-09-15") || null;
  const open = (id, stopId = null) => id === "ui-rute-service" ? onProposal(id, stopId) : onRoute(id, stopId);
  return <div className={`pr-page pr-calendar-page${fullscreen ? " pr-calendar-fullscreen" : ""}`} data-reference-view="livekalender">
    <header className="pr-calendar-heading"><div><h1>Livekalender</h1><p>Live overblik over planlagte ruter og faktisk fremdrift via OBD <span>· syntetisk demo</span></p></div><div className="pr-calendar-controls"><div className="pr-date-control"><button type="button" aria-label="Forrige dag" onClick={() => setDateOffset((nu) => nu - 1)}>‹</button><strong>{dateOffset === 0 ? "Tirsdag d. 24. september 2024" : dateOffset < 0 ? "Mandag d. 23. september 2024" : "Onsdag d. 25. september 2024"}</strong><button type="button" aria-label="Næste dag" onClick={() => setDateOffset((nu) => nu + 1)}>›</button></div><button type="button" className="pr-soft-button" onClick={() => setDateOffset(0)}>I dag</button><Segmentvalg value={raekkevisning} onChange={setRaekkevisning}/><button type="button" className="pr-soft-button" aria-expanded={showFilters} onClick={() => setShowFilters((nu) => !nu)}><Glyph name="filter"/>Filtre</button><button type="button" className="pr-soft-button pr-deviation-button" onClick={() => setFiltre((nu) => ({ ...nu, status: nu.status === "kritisk" ? "alle" : "kritisk" }))}><Glyph name="alert"/>Afvigelser <b>3</b></button><button type="button" className="pr-soft-button" aria-pressed={showMap} onClick={() => setShowMap((nu) => !nu)}><Glyph name="map"/>Vis kort</button><button type="button" className="pr-soft-button" onClick={() => setFullscreen(!fullscreen)}><Glyph name="expand"/>{fullscreen ? "Afslut fuld skærm" : "Fuld skærm"}</button></div></header>
    {showFilters && <div className="pr-calendar-filter"><label>Status<select value={filtre.status} onChange={(event) => setFiltre((nu) => ({ ...nu, status: event.target.value }))}><option value="alle">Alle statusser</option><option value="normal">Efter planen</option><option value="advarsel">Forsinket</option><option value="kritisk">Kritisk</option><option value="konflikt">Datakonflikt</option></select></label><button type="button" onClick={() => setFiltre({ status: "alle", ruteId: "", medarbejderId: "", koeretoejId: "" })}>Nulstil</button></div>}
    <div className="pr-calendar-legend"><span><i data-kind="planned"/>Planlagt</span><span><i data-kind="actual"/>Faktisk via OBD</span><span><i data-kind="estimated"/>Forventet position</span><span><i data-kind="position"/>Aktuel position</span><strong><i/>OBD live – demo, opdateret 09:42</strong><b>Afvigelsesregel: Rutetype · Kritisk ved 20 min</b></div>
    {showMap && <div className="pr-calendar-map"><DemoKort ruter={ruter} selectedRouteId={selectedRouteId} onRoute={onRoute}/></div>}
    <section className="pr-calendar-board" aria-label="Livekalender med syntetiske ruter"><div className="pr-calendar-scroll"><div className="pr-calendar-inner"><div className="pr-calendar-fixed-head"><span>Rute</span><span>Medarbejder</span><span>Køretøj</span></div><div className="pr-calendar-time-head">{hours.map((hour) => <span key={hour} style={{ left: `${((hour * 60 - DAG_START_MIN) / (DAG_SLUT_MIN - DAG_START_MIN)) * 100}%` }}>{String(hour).padStart(2, "0")}:00</span>)}<span className="pr-now-marker" data-testid="now-marker" style={{ left: nowPos }}><b>NU · 09:42</b><i/></span></div>{visibleRoutes.map((rute) => { const person = personFor(rute, medarbejdere); const bil = bilFor(rute, koeretoejer); const status = driftStatus(rute, indstillinger); return <div className="pr-calendar-row" key={rute.id} data-tone={status.tone} data-selected={selectedRouteId === rute.id}><div className="pr-calendar-meta"><span><strong>{referenceRutenavn(rute)}</strong><StatusPill tone={status.tone}>{status.label}</StatusPill></span><span>{person?.navn?.replace("Demo ", "").replace(" Fiktiv", "") || "Ikke tildelt"}</span><span>{bil?.navn.split(" · ")[0] || "Intet køretøj"}</span></div><div className="pr-calendar-track"><CalendarLane rute={rute} indstillinger={indstillinger} selectedStopId={selectedRouteId === rute.id ? selectedStopId : null} onOpen={open}/><i className="pr-now-line" data-testid="now-line" style={{ left: nowPos }}/></div></div>; })}{flerdagIDag && <div className="pr-calendar-row pr-multiday-live" data-tone="advarsel"><div className="pr-calendar-meta"><span><strong>{flerdagsrute.name}</strong><StatusPill tone="advarsel">Dagens etape · +{flerdagsrute.delayMin} min</StatusPill></span><span>{flerdagsrute.crew}</span><span>{flerdagsrute.vehicle}</span></div><div className="pr-calendar-track">{flerdagIDag.stops.map((stop, index) => <span key={stop.id} className="pr-calendar-block" data-kind="service" data-done={stop.status === "udfoert"} style={{ left: `${18 + index * 28}%`, width: "22%" }}><strong>{stop.name}</strong><small>{stop.planned} · {stop.status}</small></span>)}<i className="pr-now-line" style={{ left: nowPos }}/></div></div>}</div></div></section>
    <section className="pr-mobile-agenda" aria-label="Livekalender som mobil dagsagenda">{visibleRoutes.map((rute) => { const person = personFor(rute, medarbejdere); const bil = bilFor(rute, koeretoejer); const status = driftStatus(rute, indstillinger); const data = ruteDatagrundlag(rute); const current = rute.stop[Math.min(rute.gennemfoert, rute.stop.length - 1)]; return <button type="button" key={rute.id} data-tone={status.tone} onClick={() => open(rute.id)}><span className="pr-mobile-agenda-time">{minutTilTid(current?.forventetMinut || DAG_START_MIN)}</span><span><strong>{referenceRutenavn(rute)}</strong><small>{person?.navn?.replace("Demo ", "").replace(" Fiktiv", "") || "Ikke tildelt"} · {bil?.navn.split(" · ")[0] || "Intet køretøj"}</small><em>{data.harLiveObd ? "Aktuel position · syntetisk OBD-demo" : "Forventet position · estimeret"}</em></span><StatusPill tone={status.tone}>{status.label}</StatusPill></button>; })}{flerdagIDag && <article className="pr-mobile-multiday"><span>10.00</span><div><strong>{flerdagsrute.name}</strong><small>Dagens etape · {flerdagsrute.completedStops}/{flerdagsrute.totalStops} stop · næste: {flerdagsrute.nextStop}</small></div></article>}</section>
  </div>;
}
