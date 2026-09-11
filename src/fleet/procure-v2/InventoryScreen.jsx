import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { registerInventoryMovement, registerPhysicalReturn } from "./procure-v2-adapter.js";
import {
  INVENTORY_TYPES, applyInventoryMovement, applyInventoryTransfer,
  inventoryCsv, inventoryPeriodSummary, stockQuantityForOrderLine,
} from "./procure-inventory-domain.js";
import { acceptedQuantityForLine, remainingQuantity, unitLabel } from "./procure-v2-domain.js";
import { gemForbrugsvare } from "../varelager.js";

const requestId = () => globalThis.crypto?.randomUUID?.() || `lager-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const number = (value) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: 3 }).format(Number(value || 0));
const date = (value) => Number.isFinite(Number(value)) ? new Intl.DateTimeFormat("da-DK").format(new Date(Number(value))) : "Aldrig";
const isoToday = () => new Date().toISOString().slice(0, 10);

const toDomainItem = (item) => ({
  ...item, navn: item.name, varenummer: item.sku, enhed: item.baseUnit || item.unit,
  grundenhed: item.baseUnit || item.unit, bestillingsenhed: item.orderUnit || item.unit,
  antalPrBestillingsenhed: item.unitsPerOrder || 1, lagerfoert: item.stocked === true,
  lagerplaceringer: Object.fromEntries(Object.entries(item.inventoryLocations || {}).map(([key, row]) => [key, {
    lagerId: row.warehouseId, lager: row.warehouse, placeringId: row.locationId, placering: row.location,
    beholdning: row.quantity, enhed: row.unit, revision: row.revision,
    senestOptaltMs: row.lastCountedAt, senestBevaegetMs: row.lastMovedAt,
  }])),
});

const fromDomainItem = (source, item) => ({
  ...source, stocked: item.lagerfoert === true,
  inventoryLocations: Object.fromEntries(Object.entries(item.lagerplaceringer || {}).map(([key, row]) => [key, {
    warehouseId: row.lagerId, warehouse: row.lager, locationId: row.placeringId, location: row.placering,
    quantity: row.beholdning, unit: row.enhed, revision: row.revision,
    lastCountedAt: row.senestOptaltMs, lastMovedAt: row.senestBevaegetMs,
  }])),
});

const download = (filename, content) => {
  const url = URL.createObjectURL(new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

function InventoryDialog({ row, mode, state, demo, user, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(mode === "optaelling" && Number.isFinite(row?.quantity) ? String(row.quantity) : "");
  const [reason, setReason] = useState("");
  const [orderLineKey, setOrderLineKey] = useState("");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const closeButton = useRef(null);
  useEffect(() => { closeButton.current?.focus(); const key = (event) => { if (event.key === "Escape" && !saving) onClose(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose, saving]);
  const placements = Object.values(state.setup?.lagerplaceringer || {}).filter((item) => item.active !== false);
  const candidateOrders = state.orders.flatMap((order) => order.lines.filter((line) => line.itemId === row.item.id).map((line) => ({ order, line })))
    .filter(({ order, line }) => ["sent", "sendt", "received", "modtaget"].includes(order.status) && acceptedQuantityForLine(state.receipts.filter((receipt) => receipt.orderId === order.id), line.id) > 0);
  const selectedOrder = candidateOrders.find(({ order, line }) => `${order.id}|${line.id}` === orderLineKey);
  const selectedDestination = placements.find((item) => `${item.lagerId}|${item.id}` === destination);
  const submit = async () => {
    if (saving) return;
    setSaving(true); setMessage("");
    const id = requestId();
    if (mode === "retur") {
      if (!selectedOrder) { setMessage("Vælg den oprindelige bestilling og varelinje."); setSaving(false); return; }
      const input = { ordreId: selectedOrder.order.id, ordreRevision: selectedOrder.order.revision,
        returneringId: id, returnDate: isoToday(), reason, lines: [{ orderLineId: selectedOrder.line.id,
          quantity: Number(quantity), warehouseId: row.warehouseId, warehouse: row.warehouse,
          locationId: row.locationId, location: row.location }] };
      if (!demo) {
        const result = await registerPhysicalReturn(input);
        if (!result.ok) { setMessage(result.message); setSaving(false); return; }
        onSaved("Returen og lagerbevægelsen er gemt på serveren."); return;
      }
      const converted = stockQuantityForOrderLine(toDomainItem(row.item), selectedOrder.line, Number(quantity));
      if (!converted.ok) { setMessage(converted.message); setSaving(false); return; }
      const built = applyInventoryMovement(toDomainItem(row.item), { type: "retur", quantity: converted.quantity,
        unit: converted.unit, requestId: id, warehouseId: row.warehouseId, warehouse: row.warehouse,
        locationId: row.locationId, location: row.location, expectedRevision: row.revision,
        orderId: selectedOrder.order.id, reason }, { uid: user?.uid, actorName: user?.navn || "Mette Rasmussen" });
      if (!built.ok) { setMessage(Object.values(built.errors)[0]); setSaving(false); return; }
      onSaved("Returen er gemt i den syntetiske preview.", built); return;
    }

    const base = { type: mode, quantity: Number(quantity), unit: row.unit, requestId: id,
      warehouseId: row.warehouseId, warehouse: row.warehouse, locationId: row.locationId,
      location: row.location, expectedRevision: row.revision, reason };
    if (mode === "korrektion") { base.delta = Number(quantity); delete base.quantity; }
    let local;
    let payload = { ...base, forbrugsvareId: row.item.id };
    if (mode === "flytning") {
      if (!selectedDestination) { setMessage("Vælg placeringen, varen skal flyttes til."); setSaving(false); return; }
      payload = { type: "flytning", requestId: id, forbrugsvareId: row.item.id, quantity: Number(quantity), unit: row.unit,
        fromWarehouseId: row.warehouseId, fromWarehouse: row.warehouse, fromLocationId: row.locationId,
        fromLocation: row.location, expectedFromRevision: row.revision,
        toWarehouseId: selectedDestination.lagerId, toWarehouse: state.setup?.lagre?.[selectedDestination.lagerId]?.label || selectedDestination.lager,
        toLocationId: selectedDestination.id, toLocation: selectedDestination.label,
        expectedToRevision: Number(row.item.inventoryLocations?.[Object.keys(row.item.inventoryLocations || {}).find((key) => row.item.inventoryLocations[key].warehouseId === selectedDestination.lagerId && row.item.inventoryLocations[key].locationId === selectedDestination.id)]?.revision || 0) };
      if (demo) local = applyInventoryTransfer(toDomainItem(row.item), payload, { uid: user?.uid, actorName: user?.navn || "Mette Rasmussen" });
    } else if (demo) local = applyInventoryMovement(toDomainItem(row.item), base, { uid: user?.uid, actorName: user?.navn || "Mette Rasmussen" });
    if (demo) {
      if (!local.ok) { setMessage(Object.values(local.errors)[0]); setSaving(false); return; }
      onSaved("Gemt i den syntetiske preview.", local); return;
    }
    const result = await registerInventoryMovement(payload);
    if (!result.ok) { setMessage(result.message); setSaving(false); return; }
    onSaved(result.data.already ? "Bevægelsen var allerede gemt; der er ikke registreret en dublet." : "Gemt på serveren.");
  };
  const titles = { startbeholdning: "Registrér startbeholdning", forbrug: "Registrér forbrug", optaelling: "Optæl lager", korrektion: "Lagerkorrektion", flytning: "Flyt mellem placeringer", retur: "Retur til leverandør" };
  const computed = mode === "optaelling" && quantity !== "" && Number.isFinite(row.quantity) ? Number(quantity) - row.quantity : null;
  return <div className="procure-inventory-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="procure-inventory-dialog" role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title">
    <button ref={closeButton} className="procure-inventory-dialog-close" aria-label="Luk" onClick={onClose}>×</button>
    <h2 id="inventory-dialog-title">{titles[mode]}</h2><p>{row.item.name} · {row.warehouse} · {row.location}</p>
    <div className="procure-inventory-calculation"><span>Beregnet beholdning</span><b>{Number.isFinite(row.quantity) ? `${number(row.quantity)} ${unitLabel(row.unit, row.quantity)}` : "Ukendt"}</b></div>
    {mode === "retur" && <label>Oprindelig bestilling<select value={orderLineKey} onChange={(event) => setOrderLineKey(event.target.value)}><option value="">Vælg bestilling</option>{candidateOrders.map(({ order, line }) => <option key={`${order.id}|${line.id}`} value={`${order.id}|${line.id}`}>{order.poNumber} · {line.name}</option>)}</select></label>}
    {mode === "flytning" && <label>Flyt til<select value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Vælg placering</option>{placements.filter((place) => !(place.lagerId === row.warehouseId && place.id === row.locationId)).map((place) => <option key={`${place.lagerId}|${place.id}`} value={`${place.lagerId}|${place.id}`}>{state.setup?.lagre?.[place.lagerId]?.label || place.lagerId} · {place.label}</option>)}</select></label>}
    <label>{mode === "optaelling" || mode === "startbeholdning" ? "Faktisk antal på hylden" : mode === "korrektion" ? "Korrektion (+/−)" : "Antal"}<span className="procure-inventory-unit-input"><input inputMode="decimal" type="number" {...(mode === "korrektion" ? {} : { min: "0" })} step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><b>{row.unit}</b></span></label>
    {computed !== null && <div className={`procure-inventory-difference ${computed === 0 ? "ok" : "warn"}`}><span>{computed === 0 ? "Optællingen stemmer" : "Forskel"}</span><b>{computed > 0 ? "+" : ""}{number(computed)} {row.unit}</b></div>}
    {(mode === "korrektion" || mode === "retur" || (mode === "optaelling" && computed !== 0)) && <label>Begrundelse<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Beskriv årsagen" /></label>}
    {message && <div className="procure-alert warn" role="alert"><span>{message}</span></div>}
    <button className="procure-button block" disabled={saving || quantity === ""} onClick={submit}>{saving ? "Gemmer på serveren …" : "Bekræft og gem"}</button>
    <small>Vises først som gemt, når serveren har bekræftet registreringen.</small>
  </section></div>;
}

export default function InventoryScreen({ state, setState, demo, tenant, canWrite, busy, error, user }) {
  const [search, setSearch] = useState(""); const [warehouse, setWarehouse] = useState(""); const [location, setLocation] = useState(""); const [below, setBelow] = useState(false);
  const [selectedKey, setSelectedKey] = useState(""); const [mode, setMode] = useState(""); const [message, setMessage] = useState(""); const [year, setYear] = useState("2026");
  const [stockCandidate, setStockCandidate] = useState(""); const [marking, setMarking] = useState(false);
  const openerRef = useRef(null);
  const rows = useMemo(() => state.catalog.filter((item) => item.stocked).flatMap((item) => {
    const locations = Object.entries(item.inventoryLocations || {});
    if (!locations.length) {
      const place = Object.values(state.setup?.lagerplaceringer || {}).find((candidate) => candidate.active !== false);
      const warehouseName = state.setup?.lagre?.[place?.lagerId]?.label || place?.lagerId || "Ikke placeret";
      return [{ key: `${item.id}|unknown`, item, warehouseId: place?.lagerId || "", warehouse: warehouseName,
        locationId: place?.id || "", location: place?.label || "Ikke placeret", quantity: null,
        unit: item.baseUnit || item.unit, revision: 0, lastCountedAt: null }];
    }
    return locations.map(([key, row]) => ({ key: `${item.id}|${key}`, item, ...row }));
  }).map((row) => {
    const onOrder = state.orders.reduce((sum, order) => sum + order.lines.filter((line) => line.itemId === row.item.id).reduce((lineSum, line) => {
      if (!["sent", "sendt", "received", "modtaget"].includes(order.status)) return lineSum;
      const remaining = remainingQuantity(order, state.receipts.filter((receipt) => receipt.orderId === order.id), line.id);
      const converted = stockQuantityForOrderLine(toDomainItem(row.item), line, remaining);
      return lineSum + (converted.ok ? converted.quantity : 0);
    }, 0), 0);
    return { ...row, onOrder };
  }), [state.catalog, state.orders, state.receipts, state.setup]);
  const visible = rows.filter((row) => !search || `${row.item.name} ${row.item.sku}`.toLowerCase().includes(search.toLowerCase()))
    .filter((row) => !warehouse || row.warehouseId === warehouse).filter((row) => !location || row.locationId === location)
    .filter((row) => !below || (Number.isFinite(row.quantity) && Number.isFinite(row.item.minimumStock) && row.quantity < row.item.minimumStock));
  const selected = rows.find((row) => row.key === selectedKey) || visible[0] || null;
  const selectedMovements = state.inventoryMovements.filter((movement) => selected && movement.forbrugsvareId === selected.item.id && movement.lagerId === selected.warehouseId && movement.placeringId === selected.locationId).sort((a, b) => Number(b.ms) - Number(a.ms));
  const warehouses = [...new Map(rows.filter((row) => row.warehouseId).map((row) => [row.warehouseId, row.warehouse])).entries()];
  const locations = [...new Map(rows.filter((row) => row.locationId).map((row) => [row.locationId, row.location])).entries()];
  const fromMs = Date.parse(`${year}-01-01T00:00:00Z`); const toMs = Date.parse(`${year}-12-31T23:59:59Z`);
  const periodRows = inventoryPeriodSummary(state.catalog.map(toDomainItem), state.inventoryMovements, { fromMs, toMs, groupBy: "warehouse" });
  const open = (nextMode, row = selected, opener = document.activeElement) => { if (!row?.warehouseId && nextMode !== "startbeholdning") { setMessage("Vælg eller opret en lagerplacering først."); return; } openerRef.current = opener; setSelectedKey(row.key); setMode(nextMode); setMessage(""); };
  const closeDialog = () => { setMode(""); requestAnimationFrame(() => openerRef.current?.focus()); };
  const saved = (text, local) => {
    if (demo && local?.item) setState((current) => ({ ...current,
      catalog: current.catalog.map((item) => item.id === local.item.id ? fromDomainItem(item, local.item) : item),
      inventoryMovements: [...current.inventoryMovements, ...(local.movements || [local.movement]).filter(Boolean).map((movement, index) => ({ id: `${movement.anmodningsnoegle || Date.now()}-${index}`, ...movement }))],
    }));
    closeDialog(); setMessage(text);
  };
  const markStocked = async () => {
    const item = state.catalog.find((candidate) => candidate.id === stockCandidate);
    if (!item || marking || !canWrite) return;
    setMarking(true); setMessage("");
    if (demo) {
      setState((current) => ({ ...current, catalog: current.catalog.map((candidate) => candidate.id === item.id
        ? { ...candidate, stocked: true, baseUnit: candidate.baseUnit || candidate.unit,
          orderUnit: candidate.orderUnit || candidate.unit, unitsPerOrder: Number(candidate.unitsPerOrder || 1) }
        : candidate) }));
      setMessage(`${item.name} er markeret som lagerført. Registrér nu en startbeholdning.`);
    } else {
      const result = await gemForbrugsvare({ id: item.id, navn: item.name, varenummer: item.sku,
        enhed: item.unit, leverandoerId: item.supplierId, lagerfoert: true,
        grundenhed: item.baseUnit || item.unit, bestillingsenhed: item.orderUnit || item.unit,
        antalPrBestillingsenhed: Number(item.unitsPerOrder || 1), minimumBeholdning: item.minimumStock });
      setMessage(result.ok ? `${item.name} er markeret som lagerført. Registrér nu en startbeholdning.` : result.besked);
    }
    setStockCandidate(""); setMarking(false);
  };
  if (busy) return <section className="procure-v2"><div className="procure-loading">Indlæser lageret …</div></section>;
  if (error) return <section className="procure-v2"><div className="procure-error">Lageret kunne ikke indlæses. Prøv igen.</div></section>;
  return <section className="procure-v2 procure-inventory">
    <header className="procure-pagehead"><div><h1>Lager</h1><p>Beholdning, optællinger og sporbare bevægelser</p></div><div className="procure-head-actions"><Link className="procure-button secondary" to="/indkoeb/mobil/modtag">Modtag varer</Link><button className="procure-button secondary" disabled={!selected || !canWrite} onClick={(event) => open("forbrug", selected, event.currentTarget)}>Registrér forbrug</button><button className="procure-button" disabled={!selected || !canWrite} onClick={(event) => open(Number.isFinite(selected?.quantity) ? "optaelling" : "startbeholdning", selected, event.currentTarget)}>Optæl lager</button></div>{demo && <span className="procure-demo">Syntetiske testdata · {tenant?.navn || "demo"}</span>}</header>
    {message && <div className="procure-alert info" role="status"><span>{message}</span></div>}
    <div className="procure-inventory-stock-toggle"><label>Tilføj katalogvare til lager<select value={stockCandidate} onChange={(event) => setStockCandidate(event.target.value)}><option value="">Vælg ikke-lagerført vare</option>{state.catalog.filter((item) => !item.stocked).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku || "uden varenummer"}</option>)}</select></label><button className="procure-button secondary" disabled={!stockCandidate || !canWrite || marking} onClick={markStocked}>{marking ? "Gemmer …" : "Markér som lagerført"}</button></div>
    <div className="procure-inventory-mobile-actions"><Link to="/indkoeb/mobil/modtag">Modtag varer</Link><button disabled={!selected || !canWrite} onClick={(event) => open("forbrug", selected, event.currentTarget)}>Registrér forbrug</button><button disabled={!selected || !canWrite} onClick={(event) => open(Number.isFinite(selected?.quantity) ? "optaelling" : "startbeholdning", selected, event.currentTarget)}>Optæl lager</button></div>
    <div className="procure-inventory-filters"><label className="procure-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søg vare eller varenummer" /></label><select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}><option value="">Alle lagre</option>{warehouses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="">Alle placeringer</option>{locations.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="procure-inventory-under"><input type="checkbox" checked={below} onChange={(event) => setBelow(event.target.checked)} /> Under minimum</label></div>
    <article className="procure-card procure-inventory-list"><div className="procure-table-wrap"><table><thead><tr><th>Vare</th><th>Lager og placering</th><th>Beholdning</th><th>Minimum</th><th>Bestilt, ikke modtaget</th><th>Senest optalt</th></tr></thead><tbody>{visible.map((row) => <tr key={row.key} className={selected?.key === row.key ? "selected" : ""} onClick={() => setSelectedKey(row.key)}><td><b>{row.item.name}</b><small>{row.item.sku || "Uden varenummer"}</small></td><td>{row.warehouse}<small>{row.location}</small></td><td><b>{Number.isFinite(row.quantity) ? `${number(row.quantity)} ${unitLabel(row.unit, row.quantity)}` : "Ukendt"}</b></td><td>{Number.isFinite(row.item.minimumStock) ? `${number(row.item.minimumStock)} ${row.unit}` : "Ikke sat"}</td><td>{number(row.onOrder)} {row.unit}</td><td>{date(row.lastCountedAt)}</td></tr>)}</tbody></table></div>{!visible.length && <p className="procure-empty">Ingen lagerførte varer matcher filtrene.</p>}</article>
    {selected && <article className="procure-card procure-inventory-detail"><div className="procure-inventory-detail-head"><div><h2>{selected.item.name} · {selected.warehouse} · {selected.location}</h2><p>{Number.isFinite(selected.quantity) ? `${number(selected.quantity)} ${unitLabel(selected.unit, selected.quantity)} registreret` : "Beholdningen er endnu ikke optalt"}</p></div><div><button className="procure-button secondary small" disabled={!canWrite || !Number.isFinite(selected.quantity)} onClick={(event) => open("flytning", selected, event.currentTarget)}>Flyt</button><button className="procure-button secondary small" disabled={!canWrite || !Number.isFinite(selected.quantity)} onClick={(event) => open("retur", selected, event.currentTarget)}>Retur</button><button className="procure-button secondary small" disabled={!canWrite || !Number.isFinite(selected.quantity)} onClick={(event) => open("korrektion", selected, event.currentTarget)}>Korrektion</button></div></div><div className="procure-detail-tabs"><button className="active">Bevægelser</button><span>Bestillinger</span><span>Optællinger</span></div><div className="procure-table-wrap"><table><thead><tr><th>Hændelse</th><th>Ændring</th><th>Beholdning</th><th>Medarbejder</th><th>Tidspunkt</th></tr></thead><tbody>{selectedMovements.map((movement) => <tr key={movement.id}><td><b>{INVENTORY_TYPES[movement.art]?.label || movement.art}</b>{movement.ordreId && <small>{state.orders.find((order) => order.id === movement.ordreId)?.poNumber || movement.ordreId}</small>}{movement.note && <small>{movement.note}</small>}</td><td className={Number(movement.delta) < 0 ? "negative" : "positive"}>{Number(movement.delta) > 0 ? "+" : ""}{number(movement.delta)} {movement.enhed}</td><td>{Number.isFinite(Number(movement.efter)) ? `${number(movement.efter)} ${movement.enhed}` : "Ukendt"}</td><td>{movement.medarbejderNavn || "Medarbejder"}</td><td>{date(movement.ms)}</td></tr>)}</tbody></table></div>{!selectedMovements.length && <p className="procure-empty">Ingen bevægelser på denne placering.</p>}</article>}
    <article className="procure-card procure-inventory-period"><div className="procure-cardhead"><div><h2>Årsoversigt og intern kontrol</h2><p>Historiske tal beregnes af bevægelserne, ikke af dagens beholdning.</p></div><div><select aria-label="År" value={year} onChange={(event) => setYear(event.target.value)}><option>2026</option><option>2025</option></select><button className="procure-button secondary small" onClick={() => download(`procure-lager-${year}.csv`, inventoryCsv(periodRows))}>Eksportér CSV</button></div></div><div className="procure-table-wrap"><table><thead><tr><th>Vare og lager</th><th>Primo</th><th>Modtagelser</th><th>Forbrug</th><th>Retur</th><th>± korrektion</th><th>Nettoflytning</th><th>Ultimo</th><th>Optællinger</th></tr></thead><tbody>{periodRows.map((row) => <tr key={row.key}><td><b>{row.item.navn}</b><small>{row.movements[0]?.lager || row.warehouseId} · alle placeringer</small></td><td>{row.opening ?? "Ukendt"}</td><td>{number(row.receipts)}</td><td>{number(row.consumption)}</td><td>{number(row.returns)}</td><td>{row.corrections > 0 ? "+" : ""}{number(row.corrections)}</td><td>{row.transfers > 0 ? "+" : ""}{number(row.transfers)}</td><td><b>{row.closing ?? "Ukendt"} {row.item.grundenhed || row.item.enhed}</b></td><td>{row.counts} · afvigelse {number(row.countDeviation)}</td></tr>)}</tbody></table></div></article>
    {mode && selected && <InventoryDialog row={selected} mode={mode} state={state} demo={demo} user={user} onClose={closeDialog} onSaved={saved} />}
  </section>;
}
