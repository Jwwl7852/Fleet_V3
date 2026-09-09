import { useMemo, useRef, useState } from "react";
import { CONNECTION_STATES, MOVEMENT_STATES, hasValidCoordinates, positionFreshness } from "../data/positionWorkflow";
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

function clusterMarkers(markers) {
  const groups = [];
  markers.forEach((marker) => {
    const group = groups.find((item) => Math.hypot(item.x - marker.x, item.y - marker.y) < 38);
    if (group) {
      group.items.push(marker);
      group.x = group.items.reduce((sum, item) => sum + item.x, 0) / group.items.length;
      group.y = group.items.reduce((sum, item) => sum + item.y, 0) / group.items.length;
    } else groups.push({ x: marker.x, y: marker.y, items: [marker] });
  });
  return groups;
}

export function GeoMap({ positions = [], units = [], selectedUnitId, onSelect, compact = false, controls = true, now = new Date().toISOString(), ariaLabel = "Geografisk kort med demopositioner" }) {
  const initial = useMemo(() => fitView(positions, compact ? 480 : 820, compact ? 240 : 520), []); // Positionsopdateringer må ikke flytte brugerens udsnit.
  const [center, setCenter] = useState(initial.center);
  const [zoom, setZoom] = useState(initial.zoom);
  const [tilesFailed, setTilesFailed] = useState(false);
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
  const groups = clusterMarkers(markers);

  return <div
    aria-label={ariaLabel}
    className={`geo-map${compact ? " compact" : ""}${tilesFailed ? " fallback" : ""}`}
    onKeyDown={(event) => {
      const steps = { ArrowLeft: [-90, 0], ArrowRight: [90, 0], ArrowUp: [0, -90], ArrowDown: [0, 90] };
      if (steps[event.key]) { event.preventDefault(); moveBy(...steps[event.key]); }
      else if (event.key === "+" || event.key === "=") changeZoom(1);
      else if (event.key === "-") changeZoom(-1);
    }}
    onPointerDown={(event) => { if (event.button !== 0) return; dragRef.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
    onPointerMove={(event) => { if (!dragRef.current) return; const dx = dragRef.current.x - event.clientX; const dy = dragRef.current.y - event.clientY; dragRef.current = { x: event.clientX, y: event.clientY }; moveBy(dx, dy); }}
    onPointerUp={() => { dragRef.current = null; }}
    ref={measure}
    role="application"
    tabIndex={0}
  >
    {!tilesFailed ? <div className="map-tiles" aria-hidden="true">{tiles.map((tile) => <img alt="" draggable="false" key={tile.key} onError={() => setTilesFailed(true)} src={tile.url} style={{ left: tile.x, top: tile.y }} />)}</div> : <div className="map-fallback" aria-label="Lokalt reservekort"><svg viewBox="0 0 800 520" preserveAspectRatio="none"><defs><pattern id="geo-grid" width="80" height="52" patternUnits="userSpaceOnUse"><path d="M80 0H0v52" fill="none" stroke="currentColor" strokeOpacity=".18" /></pattern></defs><rect width="800" height="520" fill="currentColor" opacity=".06" /><rect width="800" height="520" fill="url(#geo-grid)" /><path d="M300 0v520M0 260h800" stroke="currentColor" strokeOpacity=".2" strokeDasharray="7 7" /></svg><span>Lokalt reservekort · geografisk koordinatgitter</span></div>}
    <div className="map-markers">{groups.map((group) => {
      if (group.items.length > 1) return <button aria-label={`${group.items.length} enheder tæt på hinanden`} className="geo-cluster" key={group.items.map((item) => item.position.unitId).join("-")} onClick={() => { setCenter({ latitude: group.items[0].position.latitude, longitude: group.items[0].position.longitude }); changeZoom(1); }} style={{ left: group.x, top: group.y }} type="button">{group.items.length}</button>;
      const position = group.items[0].position;
      const unit = units.find((item) => item.id === position.unitId);
      const freshness = positionFreshness(position, now);
      return <button aria-label={`${unit?.number || "Ukendt enhed"}, ${CONNECTION_STATES[position.connectionStatus]}, ${MOVEMENT_STATES[position.movementState]}, ${freshness.label}`} className={`geo-marker ${position.connectionStatus}${freshness.stale ? " stale" : ""}${selectedUnitId === position.unitId ? " selected" : ""}`} key={position.unitId} onClick={() => onSelect?.(position.unitId)} style={{ left: group.x, top: group.y }} title={`${unit?.number || position.unitId} · ${position.label}`} type="button"><Icon name={position.movementState === "moving" ? "unit" : "pin"} size={compact ? 13 : 15} /><span>{unit?.number}</span></button>;
    })}</div>
    {controls ? <div className="geo-map-controls"><button aria-label="Zoom ind" onClick={() => changeZoom(1)} type="button">+</button><button aria-label="Zoom ud" onClick={() => changeZoom(-1)} type="button">−</button><button aria-label="Vis alle filtrerede positioner" onClick={showAll} type="button"><Icon name="map" size={16} /></button></div> : null}
    <span className="geo-map-demo-label">Demopositioner – ikke live</span>
    {!tilesFailed ? <a className="map-attribution" href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">© OpenStreetMap-bidragsydere</a> : <span className="map-attribution">Lokalt reservekort</span>}
  </div>;
}
