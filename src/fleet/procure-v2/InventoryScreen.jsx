import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { registerInventoryMovement, registerPhysicalReturn } from "./procure-v2-adapter.js";
import {
  INVENTORY_TYPES, applyInventoryMovement, applyInventoryTransfer,
  inventoryCsv, inventoryOverviewRows, inventoryPeriodSummary, stockQuantityForOrderLine,
} from "./procure-inventory-domain.js";
import { acceptedQuantityForLine, remainingQuantity, unitLabel } from "./procure-v2-domain.js";

const requestId = () => globalThis.crypto?.randomUUID?.() || `lager-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const number = (value) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: 3 }).format(Number(value || 0));
const date = (value) => Number.isFinite(Number(value)) ? new Intl.DateTimeFormat("da-DK").format(new Date(Number(value))) : "Aldrig";
const dateTime = (value) => Number.isFinite(Number(value)) ? new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(new Date(Number(value))) : "Ukendt";
const isoToday = () => new Date().toISOString().slice(0, 10);

const toDomainItem = (item) => ({
  ...item, navn: item.name, varenummer: item.sku, enhed: item.baseUnit || item.unit,
  grundenhed: item.baseUnit || item.unit, bestillingsenhed: item.orderUnit || item.unit,
  antalPrBestillingsenhed: item.unitsPerOrder || 1, lagerfoert: item.stocked === true,
  minimumBeholdning: Number.isFinite(item.minimumStock) ? item.minimumStock : null,
  standardAfdelingId: item.defaultDepartmentId || null,
  lagerplaceringer: Object.fromEntries(Object.entries(item.inventoryLocations || {}).map(([key, row]) => [key, {
    lagerId: row.warehouseId, lager: row.warehouse, placeringId: row.locationId, placering: row.location,
    beholdning: row.quantity, enhed: row.unit, revision: row.revision,
    senestOptaltMs: row.lastCountedAt, senestBevaegetMs: row.lastMovedAt,
    afdelingId: row.departmentId || item.defaultDepartmentId || null,
  }])),
});

const fromDomainItem = (source, item) => ({
  ...source, stocked: item.lagerfoert === true,
  inventoryLocations: Object.fromEntries(Object.entries(item.lagerplaceringer || {}).map(([key, row]) => [key, {
    warehouseId: row.lagerId, warehouse: row.lager, locationId: row.placeringId, location: row.placering,
    quantity: row.beholdning, unit: row.enhed, revision: row.revision,
    lastCountedAt: row.senestOptaltMs, lastMovedAt: row.senestBevaegetMs,
    departmentId: row.afdelingId || null,
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
  </section></div>;
}

export default function InventoryScreen({ state, setState, demo, tenant, canWrite, busy, error, user }) {
  const [search, setSearch] = useState(""); const [department, setDepartment] = useState(""); const [below, setBelow] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(""); const [selectedLocationKey, setSelectedLocationKey] = useState("");
  const [detailTab, setDetailTab] = useState("beholdning"); const [mode, setMode] = useState(""); const [message, setMessage] = useState("");
  const [periodFrom, setPeriodFrom] = useState("2026-01-01"); const [periodTo, setPeriodTo] = useState("2026-12-31");
  const openerRef = useRef(null);
  const detailRef = useRef(null);
  const domainItems = useMemo(() => state.catalog.map(toDomainItem), [state.catalog]);
  const summaries = useMemo(() => inventoryOverviewRows(domainItems, state.inventoryMovements, { departmentId: department })
    .map((summary) => {
      const source = state.catalog.find((item) => item.id === summary.item.id) || summary.item;
      const onOrder = state.orders.reduce((sum, order) => sum + (order.lines || []).filter((line) => line.itemId === source.id).reduce((lineSum, line) => {
        if (!["sent", "sendt", "received", "modtaget"].includes(order.status)) return lineSum;
        const remaining = remainingQuantity(order, state.receipts.filter((receipt) => receipt.orderId === order.id), line.id);
        const converted = stockQuantityForOrderLine(toDomainItem(source), line, remaining);
        return lineSum + (converted.ok ? converted.quantity : 0);
      }, 0), 0);
      return { ...summary, item: source, onOrder };
    }), [department, domainItems, state.catalog, state.inventoryMovements, state.orders, state.receipts]);
  const visible = summaries.filter((row) => !search || `${row.item.name} ${row.item.sku}`.toLowerCase().includes(search.toLowerCase()))
    .filter((row) => !below || row.status === "Under genbestillingsniveau");
  const selectedSummary = summaries.find((row) => row.item.id === selectedItemId) || visible[0] || null;
  const selectedLocations = selectedSummary ? Object.entries(selectedSummary.item.inventoryLocations || {}).map(([key, row]) => ({
    key: `${selectedSummary.item.id}|${key}`, item: selectedSummary.item, ...row,
  })).filter((row) => !department || row.departmentId === department) : [];
  const selected = selectedLocations.find((row) => row.key === selectedLocationKey) || selectedLocations[0] || (selectedSummary ? {
    key: `${selectedSummary.item.id}|unknown`, item: selectedSummary.item,
    warehouseId: "", warehouse: "Ikke placeret", locationId: "", location: "Ikke placeret",
    quantity: null, unit: selectedSummary.unit, revision: 0, lastCountedAt: null,
  } : null);
  const selectedMovements = state.inventoryMovements.filter((movement) => selectedSummary && movement.forbrugsvareId === selectedSummary.item.id)
    .sort((a, b) => Number(b.ms) - Number(a.ms));
  const fromMs = Date.parse(`${periodFrom}T00:00:00Z`); const toMs = Date.parse(`${periodTo}T23:59:59.999Z`);
  const periodRows = inventoryPeriodSummary(domainItems, state.inventoryMovements, { fromMs, toMs, groupBy: "warehouse" })
    .filter((row) => !selectedSummary || row.itemId === selectedSummary.item.id);
  const openPeriodDetails = (periodRow) => {
    const target = selectedLocations.find((row) => row.item.id === periodRow.itemId && row.warehouseId === periodRow.warehouseId);
    if (!target) return;
    setSelectedItemId(target.item.id); setSelectedLocationKey(target.key); setDetailTab("bevaegelser");
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const open = (nextMode, row = selected, opener = document.activeElement) => { if (!row?.warehouseId && nextMode !== "startbeholdning") { setMessage("Vælg eller opret en lagerplacering i Varekataloget først."); return; } openerRef.current = opener; setSelectedItemId(row.item.id); setSelectedLocationKey(row.key); setMode(nextMode); setMessage(""); };
  const closeDialog = () => { setMode(""); requestAnimationFrame(() => openerRef.current?.focus()); };
  const saved = (text, local) => {
    if (demo && local?.item) setState((current) => ({ ...current,
      catalog: current.catalog.map((item) => item.id === local.item.id ? fromDomainItem(item, local.item) : item),
      inventoryMovements: [...current.inventoryMovements, ...(local.movements || [local.movement]).filter(Boolean).map((movement, index) => ({ id: `${movement.anmodningsnoegle || Date.now()}-${index}`, ...movement }))],
    }));
    closeDialog(); setMessage(text);
  };
  if (busy) return <section className="procure-v2"><div className="procure-loading">Indlæser lageret …</div></section>;
  if (error) return <section className="procure-v2"><div className="procure-error">Lageret kunne ikke indlæses. Prøv igen.</div></section>;
  return <section className="procure-v2 procure-inventory">
    <header className="procure-pagehead"><div><h1>Varelager</h1><p>Senest kendte beholdning med efterfølgende registrerede bevægelser</p></div><div className="procure-head-actions"><Link className="procure-button secondary" to="/indkoeb/mobil/modtag">Modtag varer</Link><Link className="procure-button secondary" to="/ressourcer/varekatalog?opsaetning=1">Vareopsætning</Link><button className="procure-button" disabled={!selected || !canWrite} onClick={(event) => open(Number.isFinite(selected?.quantity) ? "optaelling" : "startbeholdning", selected, event.currentTarget)}>Optæl lager</button></div>{demo && <span className="procure-demo">Syntetiske testdata · {tenant?.navn || "demo"}</span>}</header>
    {message && <div className="procure-alert info" role="status"><span>{message}</span></div>}
    <div className="procure-inventory-mobile-actions"><Link to="/indkoeb/mobil/modtag">Modtag varer</Link><Link to="/ressourcer/varekatalog?opsaetning=1">Vareopsætning</Link><button disabled={!selected || !canWrite} onClick={(event) => open(Number.isFinite(selected?.quantity) ? "optaelling" : "startbeholdning", selected, event.currentTarget)}>Optæl lager</button></div>
    <div className="procure-inventory-filters simplified"><label className="procure-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søg vare eller varenummer" /></label><select aria-label="Afdeling" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Alle afdelinger</option>{Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select><label className="procure-inventory-under"><input type="checkbox" checked={below} onChange={(event) => setBelow(event.target.checked)} /> Under genbestillingsniveau</label></div>
    {department && <p className="procure-filter-context">Viser kun placeringer tilknyttet <b>{state.setup?.afdelinger?.[department]?.label || department}</b>. Fælles placeringer tilskrives ikke automatisk en afdeling.</p>}
    <article className="procure-card procure-inventory-list"><div className="procure-table-wrap"><table><thead><tr><th>Vare</th><th>Antal på lager</th><th>Genbestillingsniveau</th><th>Seneste status</th><th>Status</th><th>Gns. månedsforbrug</th><th>Årligt forbrug</th></tr></thead><tbody>{visible.map((row) => <tr key={row.item.id} className={selectedSummary?.item.id === row.item.id ? "selected" : ""} onClick={() => { setSelectedItemId(row.item.id); setSelectedLocationKey(""); setDetailTab("beholdning"); }}><td><b>{row.item.name}</b><small>{row.item.sku || "Uden varenummer"}</small></td><td><b>{row.quantity === null ? "Ukendt" : `${number(row.quantity)} ${unitLabel(row.unit, row.quantity)}`}</b><small>{row.locations.length} placering{row.locations.length === 1 ? "" : "er"}</small></td><td>{row.minimum === null ? "Ikke sat" : `${number(row.minimum)} ${row.unit}`}</td><td>{row.neverCounted ? `Ikke optalt alle steder${row.latestCountedAt ? ` · senest ${date(row.latestCountedAt)}` : ""}` : date(row.oldestCountedAt)}</td><td><span className={`procure-status ${row.tone}`}>{row.status}</span></td><td>{row.consumption.monthlyQuantity === null ? "Mangler grundlag" : `${number(row.consumption.monthlyQuantity)} ${row.unit}`}</td><td>{row.consumption.annualQuantity === null ? <span title="Årstal vises kun ved mindst 330 dages måledækning">Mangler helårsdækning</span> : `${number(row.consumption.annualQuantity)} ${row.unit}`}</td></tr>)}</tbody></table></div>{!visible.length && <p className="procure-empty">Ingen lagerførte varer matcher filtrene.</p>}</article>
    {selectedSummary && <article ref={detailRef} className="procure-card procure-inventory-detail"><div className="procure-inventory-detail-head"><div><h2>{selectedSummary.item.name} · {selectedSummary.item.sku || "uden varenummer"}</h2><p>{selectedSummary.quantity === null ? "Beholdningen er ukendt på mindst én placering" : `${number(selectedSummary.quantity)} ${unitLabel(selectedSummary.unit, selectedSummary.quantity)} på ${selectedSummary.locations.length} placering${selectedSummary.locations.length === 1 ? "" : "er"}`}</p></div><div><button className="procure-button" disabled={!canWrite || !selected} onClick={(event) => open(Number.isFinite(selected?.quantity) ? "optaelling" : "startbeholdning", selected, event.currentTarget)}>Optæl valgt placering</button><button className="procure-button secondary small" disabled={!canWrite || !Number.isFinite(selected?.quantity)} onClick={(event) => open("flytning", selected, event.currentTarget)}>Flyt</button><button className="procure-button secondary small" disabled={!canWrite || !Number.isFinite(selected?.quantity)} onClick={(event) => open("retur", selected, event.currentTarget)}>Retur</button><button className="procure-button secondary small" disabled={!canWrite || !Number.isFinite(selected?.quantity)} onClick={(event) => open("korrektion", selected, event.currentTarget)}>Korrektion</button></div></div><div className="procure-detail-tabs" role="tablist">{[["beholdning","Placeringer"],["bevaegelser","Bevægelser"],["optaellinger","Optællinger"],["bestillinger","Bestillinger"],["periode","Periodeafstemning"]].map(([id,label]) => <button key={id} type="button" role="tab" aria-selected={detailTab === id} className={detailTab === id ? "active" : ""} onClick={() => setDetailTab(id)}>{label}</button>)}</div>
      {detailTab === "beholdning" && <div className="procure-location-grid">{selectedLocations.map((row) => <button type="button" key={row.key} className={selected?.key === row.key ? "selected" : ""} onClick={() => setSelectedLocationKey(row.key)}><span><b>{row.warehouse}</b><small>{row.location}{row.departmentId ? ` · ${state.setup?.afdelinger?.[row.departmentId]?.label || row.departmentId}` : " · fælles"}</small></span><strong>{Number.isFinite(row.quantity) ? `${number(row.quantity)} ${unitLabel(row.unit, row.quantity)}` : "Ukendt"}</strong><small>{row.lastCountedAt ? `Optalt ${date(row.lastCountedAt)}` : "Aldrig optalt"}</small></button>)}</div>}
      {detailTab === "bevaegelser" && <><div className="procure-table-wrap"><table><thead><tr><th>Hændelse</th><th>Placering</th><th>Ændring</th><th>Beholdning</th><th>Medarbejder</th><th>Tidspunkt</th></tr></thead><tbody>{selectedMovements.map((movement) => <tr key={movement.id}><td><b>{INVENTORY_TYPES[movement.art]?.label || movement.art}</b>{movement.ordreId && <small>{state.orders.find((order) => order.id === movement.ordreId)?.poNumber || movement.ordreId}</small>}{movement.note && <small>{movement.note}</small>}</td><td>{movement.lager}<small>{movement.placering}</small></td><td className={Number(movement.delta) < 0 ? "negative" : "positive"}>{Number(movement.delta) > 0 ? "+" : ""}{number(movement.delta)} {movement.enhed}</td><td>{Number.isFinite(Number(movement.efter)) ? `${number(movement.efter)} ${movement.enhed}` : "Ukendt"}</td><td>{movement.medarbejderNavn || "Medarbejder"}</td><td>{dateTime(movement.ms)}</td></tr>)}</tbody></table></div>{!selectedMovements.length && <p className="procure-empty">Ingen bevægelser er registreret.</p>}</>}
      {detailTab === "optaellinger" && <div className="procure-table-wrap"><table><thead><tr><th>Placering</th><th>Optalt beholdning</th><th>Afvigelse</th><th>Medarbejder</th><th>Tidspunkt</th></tr></thead><tbody>{selectedMovements.filter((row) => ["startbeholdning","optaelling"].includes(row.art)).map((row) => <tr key={row.id}><td>{row.lager} · {row.placering}</td><td>{number(row.efter)} {row.enhed}</td><td>{row.delta > 0 ? "+" : ""}{number(row.art === "startbeholdning" ? 0 : row.delta)} {row.enhed}</td><td>{row.medarbejderNavn || "Medarbejder"}</td><td>{dateTime(row.ms)}</td></tr>)}</tbody></table></div>}
      {detailTab === "bestillinger" && <div className="procure-table-wrap"><table><thead><tr><th>Reference</th><th>Leverandør</th><th>Antal</th><th>Status</th></tr></thead><tbody>{state.orders.flatMap((order) => (order.lines || []).filter((line) => line.itemId === selectedSummary.item.id).map((line) => <tr key={`${order.id}-${line.id}`}><td><Link to={`/indkoeb/bestillinger?sag=${order.id}`}>{order.poNumber || order.id}</Link></td><td>{state.suppliers.find((supplier) => supplier.id === order.supplierId)?.name || "Afklares"}</td><td>{number(line.quantity)} {line.unit}</td><td>{order.status}</td></tr>))}</tbody></table></div>}
      {detailTab === "periode" && <div className="procure-inventory-period"><div className="procure-cardhead"><div><h3>Periodeoversigt og intern kontrol</h3><p>Valgt periode: {periodFrom} – {periodTo}. Historiske tal beregnes af bevægelserne.</p></div><div className="procure-period-controls"><label>Fra<input aria-label="Fra dato" type="date" value={periodFrom} max={periodTo} onChange={(event) => setPeriodFrom(event.target.value)} /></label><label>Til<input aria-label="Til dato" type="date" value={periodTo} min={periodFrom} onChange={(event) => setPeriodTo(event.target.value)} /></label><button className="procure-button secondary small" onClick={() => download(`procure-varelager-${periodFrom}-${periodTo}.csv`, inventoryCsv(periodRows, { from: periodFrom, to: periodTo }))}>Eksportér CSV</button></div></div><div className="procure-table-wrap"><table><thead><tr><th>Vare og lager</th><th>Primo</th><th>Start i perioden</th><th>Modtagelser</th><th>Registrerede udtag</th><th>Retur</th><th>± korrektion</th><th>Nettoflytning</th><th>Ultimo</th><th>Optællinger</th><th>Grundlag</th></tr></thead><tbody>{periodRows.map((row) => { const unit = row.item.grundenhed || row.item.enhed; return <tr key={row.key}><td><b>{row.item.navn}</b><small>{row.movements[0]?.lager || row.warehouseId} · alle placeringer</small></td><td>{row.opening ?? "Ukendt"} {row.opening === null ? "" : unit}</td><td>{number(row.starts)} {unit}</td><td>{number(row.receipts)} {unit}</td><td>{number(row.consumption)} {unit}</td><td>{number(row.returns)} {unit}</td><td>{row.corrections > 0 ? "+" : ""}{number(row.corrections)} {unit}</td><td>{row.transfers > 0 ? "+" : ""}{number(row.transfers)} {unit}</td><td><b>{row.closing ?? "Ukendt"} {row.closing === null ? "" : unit}</b></td><td>{row.counts} · afvigelse {number(row.countDeviation)} {unit}</td><td><button type="button" className="procure-linkbutton" onClick={() => openPeriodDetails(row)}>Vis bevægelser</button></td></tr>; })}</tbody></table></div></div>}
    </article>}
    {mode && selected && <InventoryDialog row={selected} mode={mode} state={state} demo={demo} user={user} onClose={closeDialog} onSaved={saved} />}
  </section>;
}
