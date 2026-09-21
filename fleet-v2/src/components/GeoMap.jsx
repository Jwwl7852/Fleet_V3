import { useEffect, useMemo, useRef, useState } from "react";
import { CONNECTION_STATES, MOVEMENT_STATES, hasValidCoordinates, positionFreshness } from "../data/positionWorkflow";
import { LIVE_STATUS_LABELS, liveOperationalStatus, localDateTime } from "../data/liveMapHistory";
import { Icon } from "./Icon";

const TILE_SIZE = 256;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrap = (value, total) => ((value % total) + total) % total;

function project(latitude, longitude, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = clamp(latitude, -85.0511, 85.0511) * Math.PI / 180;
  return {
    x: (longitude + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * scale,
  };
}

function unproject(x, y, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = x / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / scale;
  return { latitude: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), longitude };
}

function fitView(positions, width, height) {
  const valid = positions.filter(hasValidCoordinates);
  if (!valid.length) return { center: { latitude: 55.6761, longitude: 12.5683 }, zoom: 9 };
  const bounds = valid.reduce((result, item) => ({
    minLat: Math.min(result.minLat, item.latitude), maxLat: Math.max(result.maxLat, item.latitude),
    minLng: Math.min(result.minLng, item.longitude), maxLng: Math.max(result.maxLng, item.longitude),
  }), { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 });
  const center = { latitude: (bounds.minLat + bounds.maxLat) / 2, longitude: (bounds.minLng + bounds.maxLng) / 2 };
  let zoom = 14;
  while (zoom > 5) {
    const first = project(bounds.maxLat, bounds.minLng, zoom);
    const second = project(bounds.minLat, bounds.maxLng, zoom);
    if (Math.abs(second.x - first.x) <= width * 0.72 && Math.abs(second.y - first.y) <= height * 0.7) break;
    zoom -= 1;
  }
  return { center, zoom };
}

function clusterMarkers(markers, isolatedUnitId = null) {
  const groups = [];
  markers.forEach((marker) => {
    if (marker.position.unitId === isolatedUnitId) {
      groups.push({ x: marker.x, y: marker.y, items: [marker], isolated: true });
      return;
    }
    const group = groups.find((item) => !item.isolated && Math.hypot(item.x - marker.x, item.y - marker.y) < 38);
    if (group) {
      group.items.push(marker);
      group.x = group.items.reduce((sum, item) => sum + item.x, 0) / group.items.length;
      group.y = group.items.reduce((sum, item) => sum + item.y, 0) / group.items.length;
    } else groups.push({ x: marker.x, y: marker.y, items: [marker] });
  });
  return groups;
}

export function GeoMap({ positions = [], units = [], selectedUnitId, popupUnitId = null, focusUnitId = null, focusRequestId = 0, followUnitId = null, onSelect, onOpenUnit, onToggleFollow, compact = false, controls = true, now = new Date().toISOString(), ariaLabel = "Geografisk kort med demopositioner", routeSegments = [], routeGaps = [], routeCursor = null, showMarkers = true }) {
  const initial = useMemo(() => fitView(positions, compact ? 480 : 820, compact ? 240 : 520), []); // Positionsopdateringer må ikke flytte brugerens udsnit.
  const [center, setCenter] = useState(initial.center);
  const [zoom, setZoom] = useState(initial.zoom);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [activeCluster, setActiveCluster] = useState(null);
  const [activeUnitId, setActiveUnitId] = useState(null);
  const [dismissedUnitId, setDismissedUnitId] = useState(null);
  const [highlightedUnitId, setHighlightedUnitId] = useState(null);
  const [size, setSize] = useState({ width: compact ? 480 : 820, height: compact ? 240 : 520 });
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const centerWorld = project(center.latitude, center.longitude, zoom);

  const measure = (node) => {
    mapRef.current = node;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (Math.abs(rect.width - size.width) > 2 || Math.abs(rect.height - size.height) > 2)) setSize({ width: rect.width, height: rect.height });
  };
  const moveBy = (x, y) => {
    const next = unproject(centerWorld.x + x, centerWorld.y + y, zoom);
    setCenter({ latitude: clamp(next.latitude, -85, 85), longitude: wrap(next.longitude + 180, 360) - 180 });
  };
  const changeZoom = (delta) => setZoom((value) => clamp(value + delta, 5, 18));
  const showAll = () => { const fitted = fitView(positions, size.width, size.height); setCenter(fitted.center); setZoom(fitted.zoom); };
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const handleWheel = (event) => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      setZoom((value) => clamp(value + (event.deltaY < 0 ? 1 : -1), 5, 18));
    };
    map.addEventListener("wheel", handleWheel, { passive: false });
    return () => map.removeEventListener("wheel", handleWheel);
  }, []);
  useEffect(() => {
    if (!focusUnitId) return undefined;
    const position = positions.find((item) => item.unitId === focusUnitId && hasValidCoordinates(item));
    if (!position) return undefined;
    setCenter({ latitude: position.latitude, longitude: position.longitude });
    setZoom((value) => Math.max(value, 14));
    setActiveUnitId(focusUnitId);
    setDismissedUnitId(null);
    setActiveCluster(null);
    setHighlightedUnitId(focusUnitId);
    const timer = window.setTimeout(() => setHighlightedUnitId((current) => current === focusUnitId ? null : current), 1800);
    return () => window.clearTimeout(timer);
  }, [focusRequestId, focusUnitId, positions]);
  useEffect(() => {
    if (!followUnitId) return;
    const position = positions.find((item) => item.unitId === followUnitId && hasValidCoordinates(item));
    if (!position) return;
    setCenter({ latitude: position.latitude, longitude: position.longitude });
    setActiveUnitId(followUnitId);
    setDismissedUnitId(null);
  }, [followUnitId, positions]);
  const tiles = useMemo(() => {
    const count = 2 ** zoom;
    const left = centerWorld.x - size.width / 2;
    const top = centerWorld.y - size.height / 2;
    const right = centerWorld.x + size.width / 2;
    const bottom = centerWorld.y + size.height / 2;
    const result = [];
    for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor(right / TILE_SIZE); x += 1) {
      for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor(bottom / TILE_SIZE); y += 1) {
        if (y < 0 || y >= count) continue;
        result.push({ key: `${zoom}-${x}-${y}`, x: x * TILE_SIZE - left, y: y * TILE_SIZE - top, url: `https://tile.openstreetmap.org/${zoom}/${wrap(x, count)}/${y}.png` });
      }
    }
    return result;
  }, [centerWorld.x, centerWorld.y, size.width, size.height, zoom]);
  const markers = positions.filter(hasValidCoordinates).map((position) => {
    const point = project(position.latitude, position.longitude, zoom);
    let deltaX = point.x - centerWorld.x;
    const world = TILE_SIZE * 2 ** zoom;
    if (deltaX > world / 2) deltaX -= world;
    if (deltaX < -world / 2) deltaX += world;
    return { position, x: size.width / 2 + deltaX, y: size.height / 2 + point.y - centerWorld.y };
  }).filter((item) => item.x > -50 && item.x < size.width + 50 && item.y > -50 && item.y < size.height + 50);
  const groups = clusterMarkers(markers, focusUnitId);
  const visiblePopupUnitId = activeUnitId || (popupUnitId !== dismissedUnitId ? popupUnitId : null) || focusUnitId;
  const activeMarker = markers.find((item) => item.position.unitId === visiblePopupUnitId);
  const activeUnit = units.find((item) => item.id === visiblePopupUnitId);
  const activeFreshness = activeMarker ? positionFreshness(activeMarker.position, now) : null;
  const screenPoint = (position) => {
    const point = project(position.latitude, position.longitude, zoom);
    let deltaX = point.x - centerWorld.x;
    const world = TILE_SIZE * 2 ** zoom;
    if (deltaX > world / 2) deltaX -= world;
    if (deltaX < -world / 2) deltaX += world;
    return { x: size.width / 2 + deltaX, y: size.height / 2 + point.y - centerWorld.y };
  };
  const routeLines = routeSegments.map((segment) => segment.map(screenPoint));
  const gapLines = routeGaps.map((segment) => segment.map(screenPoint));
  const cursorPoint = routeCursor && hasValidCoordinates(routeCursor) ? screenPoint(routeCursor) : null;

  return <div
    aria-label={ariaLabel}
    className={`geo-map${compact ? " compact" : ""}${tilesFailed ? " fallback" : ""}`}
    onKeyDown={(event) => {
      const steps = { ArrowLeft: [-90, 0], ArrowRight: [90, 0], ArrowUp: [0, -90], ArrowDown: [0, 90] };
      if (steps[event.key]) { event.preventDefault(); moveBy(...steps[event.key]); }
      else if (event.key === "+" || event.key === "=") changeZoom(1);
      else if (event.key === "-") changeZoom(-1);
      else if (event.key === "Escape") { setActiveCluster(null); setActiveUnitId(null); }
    }}
    onPointerDown={(event) => { if (event.button !== 0 || event.target.closest("button, a")) return; setActiveCluster(null); setActiveUnitId(null); dragRef.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
    onPointerMove={(event) => { if (!dragRef.current) return; const dx = dragRef.current.x - event.clientX; const dy = dragRef.current.y - event.clientY; dragRef.current = { x: event.clientX, y: event.clientY }; moveBy(dx, dy); }}
    onPointerUp={() => { dragRef.current = null; }}
    ref={measure}
    role="application"
    tabIndex={0}
  >
    {!tilesFailed ? <div className="map-tiles" aria-hidden="true">{tiles.map((tile) => <img alt="" draggable="false" key={tile.key} onError={() => setTilesFailed(true)} src={tile.url} style={{ left: tile.x, top: tile.y }} />)}</div> : <div className="map-fallback" aria-label="Lokalt reservekort"><svg viewBox="0 0 800 520" preserveAspectRatio="none"><defs><pattern id="geo-grid" width="80" height="52" patternUnits="userSpaceOnUse"><path d="M80 0H0v52" fill="none" stroke="currentColor" strokeOpacity=".18" /></pattern></defs><rect width="800" height="520" fill="currentColor" opacity=".06" /><rect width="800" height="520" fill="url(#geo-grid)" /><path d="M300 0v520M0 260h800" stroke="currentColor" strokeOpacity=".2" strokeDasharray="7 7" /></svg><span>Lokalt reservekort · geografisk koordinatgitter</span></div>}
    {routeLines.length || gapLines.length ? <svg className="geo-route-overlay" aria-hidden="true" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">{routeLines.map((line, index) => <g key={`route-${index}`}><polyline points={line.map((point) => `${point.x},${point.y}`).join(" ")} />{line.map((point, pointIndex) => {
      if (!pointIndex || pointIndex % 5 !== 0) return null;
      const previous = line[pointIndex - 1]; const angle = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
      return <path className="geo-route-arrow" d="M-4 -3L4 0 -4 3Z" key={`${point.x}-${point.y}`} transform={`translate(${point.x} ${point.y}) rotate(${angle})`} />;
    })}</g>)}{gapLines.map((line, index) => <polyline className="geo-route-gap" key={`gap-${index}`} points={line.map((point) => `${point.x},${point.y}`).join(" ")} />)}</svg> : null}
    {cursorPoint ? <span className="geo-route-cursor" aria-hidden="true" style={{ left: cursorPoint.x, top: cursorPoint.y, transform: `translate(-50%, -50%) rotate(${Number(routeCursor.heading) || 0}deg)` }}><Icon name="unit" size={16} /></span> : null}
    {showMarkers ? <div className="map-markers">{groups.map((group) => {
      if (group.items.length > 1) {
        const key = group.items.map((item) => item.position.unitId).join("-");
        return <button aria-expanded={activeCluster?.key === key} aria-label={`${group.items.length} enheder tæt på hinanden`} className="geo-cluster" key={key} onClick={() => setActiveCluster((current) => current?.key === key ? null : { key, x: group.x, y: group.y, items: group.items })} style={{ left: group.x, top: group.y }} type="button">{group.items.length}</button>;
      }
      const position = group.items[0].position;
      const unit = units.find((item) => item.id === position.unitId);
      const freshness = positionFreshness(position, now);
      const liveStatus = liveOperationalStatus(position, now);
      const hasHeading = position.heading !== null && position.heading !== undefined && position.heading !== "" && Number.isFinite(Number(position.heading));
      const unitName = [unit?.make, unit?.model].filter(Boolean).join(" ") || unit?.categoryName || "Navn ikke oplyst";
      const tooltipId = `geo-marker-tooltip-${position.unitId}`;
      return <button aria-describedby={tooltipId} aria-label={`${unit?.number || "Ukendt enhed"}, ${unitName}, ${LIVE_STATUS_LABELS[liveStatus]}, ${freshness.label}`} className={`geo-marker ${liveStatus}${freshness.stale ? " stale" : ""}${selectedUnitId === position.unitId ? " selected" : ""}${highlightedUnitId === position.unitId ? " located" : ""}`} key={position.unitId} onClick={() => { setActiveUnitId(position.unitId); setActiveCluster(null); onSelect?.(position.unitId); }} style={{ left: group.x, top: group.y }} type="button"><span aria-hidden="true" className={hasHeading ? "geo-direction" : "geo-direction-dot"} style={hasHeading ? { transform: `rotate(${Number(position.heading)}deg)` } : undefined}>{hasHeading ? "▲" : ""}</span><span className="geo-marker-tooltip" id={tooltipId} role="tooltip"><strong>{unit?.number || position.unitId} · {unitName}</strong>{unit?.registration ? <small>Nummerplade: {unit.registration}</small> : null}<small>{LIVE_STATUS_LABELS[liveStatus]} · Seneste position {localDateTime(position.measuredAt)}</small>{freshness.stale ? <em>{freshness.label}</em> : null}</span></button>;
    })}</div> : null}
    {activeMarker && activeUnit ? <section className="geo-unit-popup" aria-label={`Detaljer for ${activeUnit.number}`} style={{ left: clamp(activeMarker.x, 126, Math.max(126, size.width - 126)), top: clamp(activeMarker.y - 18, 116, Math.max(116, size.height - 80)) }}>
      <header><div><span className={`position-dot ${activeMarker.position.connectionStatus}`} /><strong>{activeUnit.number}</strong></div><button type="button" aria-label="Luk enhedsdetaljer" onClick={() => { setActiveUnitId(null); setDismissedUnitId(visiblePopupUnitId); }}>×</button></header>
      <p>{activeUnit.make} {activeUnit.model}</p>
      <dl><div><dt>Position</dt><dd>{activeMarker.position.label}</dd></div><div><dt>Status</dt><dd>{CONNECTION_STATES[activeMarker.position.connectionStatus]} · {MOVEMENT_STATES[activeMarker.position.movementState]}</dd></div><div><dt>Aktualitet</dt><dd>{activeFreshness.label}</dd></div></dl>
      {onOpenUnit ? <button className="geo-unit-popup-link" type="button" onClick={() => onOpenUnit(activeUnit.id)}>Åbn enhedsprofil</button> : null}
      {onToggleFollow ? <button className="geo-unit-popup-link" type="button" aria-pressed={followUnitId === activeUnit.id} onClick={() => onToggleFollow(activeUnit.id)}>{followUnitId === activeUnit.id ? "Stop med at følge" : "Følg enhed"}</button> : null}
    </section> : null}
    {activeCluster ? <section className="geo-cluster-list" aria-label="Vælg enhed i klynge" style={{ left: clamp(activeCluster.x, 92, Math.max(92, size.width - 92)), top: clamp(activeCluster.y + 28, 72, Math.max(72, size.height - 72)) }}>
      <header><strong>{activeCluster.items.length} enheder</strong><button type="button" aria-label="Luk enhedsliste" onClick={() => setActiveCluster(null)}>×</button></header>
      {activeCluster.items.map(({ position }) => {
        const unit = units.find((item) => item.id === position.unitId);
        return <button type="button" key={position.unitId} onClick={() => { setActiveUnitId(position.unitId); onSelect?.(position.unitId); setActiveCluster(null); }}><strong>{unit?.number || position.unitId}</strong><small>{position.label}</small></button>;
      })}
      <button className="geo-cluster-zoom" type="button" onClick={() => { const first = activeCluster.items[0].position; setCenter({ latitude: first.latitude, longitude: first.longitude }); changeZoom(1); setActiveCluster(null); }}>Zoom ind på placeringen</button>
    </section> : null}
    {controls ? <div className="geo-map-controls"><button aria-label="Zoom ind" onClick={() => changeZoom(1)} type="button">+</button><button aria-label="Zoom ud" onClick={() => changeZoom(-1)} type="button">−</button><button aria-label="Vis alle filtrerede positioner" onClick={showAll} type="button"><Icon name="map" size={16} /></button></div> : null}
    <span className="geo-map-demo-label">Demopositioner – ikke live</span>
    {!tilesFailed ? <a className="map-attribution" href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">© OpenStreetMap-bidragsydere</a> : <span className="map-attribution">Lokalt reservekort</span>}
  </div>;
}
