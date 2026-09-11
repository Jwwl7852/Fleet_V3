import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getReceiptAttachment, registerInventoryMovement, registerReceipt } from "./procure-v2-adapter.js";
import { acceptedQuantityForLine, remainingQuantity, unitLabel } from "./procure-v2-domain.js";
import { applyInventoryMovement, stockQuantityForOrderLine } from "./procure-inventory-domain.js";

const today = () => new Date().toISOString().slice(0, 10);
const newRequestId = () => globalThis.crypto?.randomUUID?.() || `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;
const effectKey = (effect) => `${effect.itemId}|${effect.lagerId}|${effect.placeringId}`;
const domainItem = (item) => ({ ...item, navn: item.name, enhed: item.baseUnit || item.unit,
  grundenhed: item.baseUnit || item.unit, bestillingsenhed: item.orderUnit || item.unit,
  antalPrBestillingsenhed: item.unitsPerOrder || 1, lagerfoert: item.stocked === true,
  lagerplaceringer: Object.fromEntries(Object.entries(item.inventoryLocations || {}).map(([key, row]) => [key, {
    lagerId: row.warehouseId, lager: row.warehouse, placeringId: row.locationId, placering: row.location,
    beholdning: row.quantity, enhed: row.unit, revision: row.revision,
    senestOptaltMs: row.lastCountedAt, senestBevaegetMs: row.lastMovedAt,
  }])) });
const stateItem = (source, item) => ({ ...source, inventoryLocations: Object.fromEntries(Object.entries(item.lagerplaceringer || {}).map(([key, row]) => [key, {
  warehouseId: row.lagerId, warehouse: row.lager, locationId: row.placeringId, location: row.placering,
  quantity: row.beholdning, unit: row.enhed, revision: row.revision,
  lastCountedAt: row.senestOptaltMs, lastMovedAt: row.senestBevaegetMs,
}])) });

export default function MobileReceiptScreen({ state, setState, demo, user, canWrite }) {
  const location = useLocation();
  const navigate = useNavigate();
  const rawReference = decodeURIComponent(location.pathname.split("/").filter(Boolean)[3] || "");
  const [query, setQuery] = useState(rawReference);
  const [reference, setReference] = useState(rawReference);
  const order = state.orders.find((item) => item.id === reference || item.poNumber?.toLowerCase() === reference.toLowerCase());
  const receipts = state.receipts.filter((item) => item.orderId === order?.id);
  const [rows, setRows] = useState({});
  const [files, setFiles] = useState([]);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [receivedDate, setReceivedDate] = useState(today());
  const [step, setStep] = useState("edit");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [registeredStatus, setRegisteredStatus] = useState("");
  const [inventoryEffects, setInventoryEffects] = useState([]);
  const [counted, setCounted] = useState({});
  const [countReasons, setCountReasons] = useState({});
  const [openingAttachment, setOpeningAttachment] = useState("");
  const requestIdRef = useRef(newRequestId());
  const countRequestIdsRef = useRef({});
  const previews = useMemo(() => files.map((file) => ({ file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null })), [files]);
  useEffect(() => () => previews.forEach((preview) => preview.url && URL.revokeObjectURL(preview.url)), [previews]);
  useEffect(() => {
    if (!order) return;
    setRows(Object.fromEntries(order.lines.map((line) => {
      const item = state.catalog.find((candidate) => candidate.id === line.itemId);
      const stockLocation = Object.values(item?.inventoryLocations || {})[0];
      const fallbackPlace = Object.values(state.setup?.lagerplaceringer || {}).find((place) => place.active !== false);
      const warehouseId = stockLocation?.warehouseId || fallbackPlace?.lagerId || "";
      const locationId = stockLocation?.locationId || fallbackPlace?.id || "";
      return [line.id, { deliveredQuantity: remainingQuantity(order, receipts, line.id), damagedQuantity: 0, rejectedQuantity: 0,
        warehouseId, warehouse: stockLocation?.warehouse || state.setup?.lagre?.[warehouseId]?.label || "",
        locationId, location: stockLocation?.location || fallbackPlace?.label || "" }];
    })));
  }, [order?.id]);
  const update = (lineId, key, value) => setRows((current) => ({ ...current, [lineId]: { ...current[lineId], [key]: Math.max(0, Number(value) || 0) } }));
  const accepted = (line) => Math.max(0, Number(rows[line.id]?.deliveredQuantity || 0) - Number(rows[line.id]?.damagedQuantity || 0) - Number(rows[line.id]?.rejectedQuantity || 0));
  const confirm = async () => {
    if (!order || saving) return;
    setSaving(true); setMessage("");
    const input = {
      id: requestIdRef.current, requestId: requestIdRef.current, receivedDate,
      receivedBy: user?.navn || user?.email || "Aktuel bruger", deliveryNote,
      attachments: files,
      lines: rows,
    };
    const result = await registerReceipt({ order, receipts, input, actorId: user?.uid, demo });
    if (!result.ok) {
      setMessage(result.errors ? Object.values(result.errors).join(" ") : result.message || "Modtagelsen kunne ikke gemmes. Din kladde er bevaret.");
      setSaving(false); return;
    }
    let effects = result.server?.inventoryEffects || [];
    if (demo) {
      let catalog = [...state.catalog]; const movements = []; effects = [];
      for (const line of order.lines) {
        const acceptedQuantity = accepted(line);
        const itemIndex = catalog.findIndex((item) => item.id === line.itemId && item.stocked);
        if (acceptedQuantity <= 0 || itemIndex < 0) continue;
        const item = catalog[itemIndex]; const converted = stockQuantityForOrderLine(domainItem(item), line, acceptedQuantity);
        if (!converted.ok) { setMessage(converted.message); setSaving(false); return; }
        const row = rows[line.id]; const currentLocation = Object.values(item.inventoryLocations || {}).find((place) => place.warehouseId === row.warehouseId && place.locationId === row.locationId);
        const built = applyInventoryMovement(domainItem(item), { type: "modtaget", quantity: converted.quantity,
          unit: converted.unit, requestId: `${requestIdRef.current}-${line.id}`, warehouseId: row.warehouseId,
          warehouse: row.warehouse, locationId: row.locationId, location: row.location,
          expectedRevision: Number(currentLocation?.revision || 0), orderId: order.id,
          receiptId: requestIdRef.current, orderLineId: line.id },
        { uid: user?.uid, actorName: user?.navn || "Mette Rasmussen" });
        if (!built.ok) { setMessage(Object.values(built.errors)[0]); setSaving(false); return; }
        catalog[itemIndex] = stateItem(item, built.item); movements.push({ id: `${requestIdRef.current}-${line.id}`, ...built.movement });
        effects.push({ itemId: item.id, itemName: item.name, before: built.movement.foer,
          received: converted.quantity, after: built.movement.efter, ...built.location });
      }
      setState((current) => ({ ...current, catalog, inventoryMovements: [...current.inventoryMovements, ...movements],
        receipts: [...current.receipts, { ...result.receipt, id: requestIdRef.current, orderId: order.id,
          attachments: files.map((file) => ({ name: file.name, status: "aktiv", testOnly: true })) }] }));
    }
    setInventoryEffects(effects);
    setCounted(Object.fromEntries(effects.map((effect) => [effectKey(effect), String(effect.after)])));
    setRegisteredStatus(result.server?.ordreStatus || order.status);
    setStep("done"); setSaving(false);
  };
  const addFiles = (event) => {
    const incoming = [...event.target.files].filter((file) => ["application/pdf", "image/jpeg", "image/png"].includes(file.type) && file.size <= 25 * 1024 * 1024);
    setFiles((current) => [...current, ...incoming.filter((file) => !current.some((old) => fileKey(old) === fileKey(file)))]);
    if (incoming.length !== event.target.files.length) setMessage("Kun PDF, JPEG og PNG på højst 25 MB kan vedhæftes.");
    event.target.value = "";
  };
  const openAttachment = async (receipt, attachment) => {
    if (openingAttachment || !order) return;
    setOpeningAttachment(attachment.id); setMessage("");
    try {
      if (demo) { setMessage("Det syntetiske bilag har ingen ekstern fil."); return; }
      const response = await getReceiptAttachment({ orderId: order.id, receiptId: receipt.id, attachmentId: attachment.id });
      window.open(response.url, "_blank", "noopener,noreferrer");
      setMessage(`${attachment.name} er åbnet via et nyt tenantkontrolleret link.`);
    } catch {
      setMessage("Bilaget kunne ikke åbnes. Kontrollér din adgang og prøv igen.");
    } finally { setOpeningAttachment(""); }
  };
  const placements = Object.values(state.setup?.lagerplaceringer || {}).filter((place) => place.active !== false);
  const openOrders = state.orders.filter((candidate) => ["sent", "sendt", "received", "modtaget"].includes(candidate.status)
    && candidate.lines.some((line) => remainingQuantity(candidate, state.receipts.filter((receipt) => receipt.orderId === candidate.id), line.id) > 0))
    .filter((candidate) => !query.trim() || `${candidate.poNumber} ${candidate.title} ${state.suppliers.find((supplier) => supplier.id === candidate.supplierId)?.name || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const receiveAll = () => setRows((current) => Object.fromEntries(order.lines.map((line) => [line.id, {
    ...current[line.id], deliveredQuantity: remainingQuantity(order, receipts, line.id), damagedQuantity: 0, rejectedQuantity: 0,
  }])));
  const saveCounts = async () => {
    if (saving || !inventoryEffects.length) return;
    setSaving(true); setMessage("");
    let catalog = [...state.catalog]; const movements = [];
    for (const effect of inventoryEffects) {
      const key = effectKey(effect);
      const actual = Number(counted[key]); const difference = actual - Number(effect.after);
      const reason = countReasons[key] || "";
      if (!Number.isFinite(actual) || actual < 0 || (difference !== 0 && !reason.trim())) {
        setMessage(difference !== 0 ? "Begrund forskellen før optællingen gemmes." : "Angiv et gyldigt faktisk antal."); setSaving(false); return;
      }
      const actionId = countRequestIdsRef.current[key] || newRequestId();
      countRequestIdsRef.current[key] = actionId;
      const payload = { forbrugsvareId: effect.itemId, type: "optaelling", requestId: actionId,
        quantity: actual, unit: effect.enhed, warehouseId: effect.lagerId, warehouse: effect.lager,
        locationId: effect.placeringId, location: effect.placering, expectedRevision: effect.revision, reason };
      if (demo) {
        const index = catalog.findIndex((item) => item.id === effect.itemId);
        const built = applyInventoryMovement(domainItem(catalog[index]), payload, { uid: user?.uid, actorName: user?.navn || "Mette Rasmussen" });
        if (!built.ok) { setMessage(Object.values(built.errors)[0]); setSaving(false); return; }
        catalog[index] = stateItem(catalog[index], built.item); movements.push({ id: actionId, ...built.movement });
      } else {
        const result = await registerInventoryMovement(payload);
        if (!result.ok) { setMessage(result.message); setSaving(false); return; }
      }
    }
    if (demo) setState((current) => ({ ...current, catalog, inventoryMovements: [...current.inventoryMovements, ...movements] }));
    setStep("done-counted"); setSaving(false); setMessage("Optællingen er gemt med medarbejder og servertidspunkt.");
  };

  return <section className="procure-v2 procure-mobile-order procure-mobile-receiving">
    <header className="procure-mobile-head"><Link to="/indkoeb/modtagelser" className="procure-mobile-close" aria-label="Tilbage">←</Link><div><small>PROCURE · varemodtagelse</small><h1>Modtag varer</h1></div><span className="procure-mobile-save">Servervalideret</span></header>
    {message && <div className="procure-mobile-offline" role="alert">{message}</div>}
    {!order && <div className="procure-mobile-receipt-search"><h2>Find bestilling</h2><p>Søg på bestillingsnummer eller leverandør. Følgesedlen behøver ikke have en QR-kode.</p><form onSubmit={(event) => { event.preventDefault(); const exact = openOrders.find((candidate) => candidate.poNumber.toLowerCase() === query.trim().toLowerCase()); if (exact) { setReference(exact.id); navigate(`/indkoeb/mobil/modtag/${encodeURIComponent(exact.id)}`, { replace: true }); } }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bestillingsnr. eller leverandør" autoFocus /><button className="procure-mobile-submit">Søg</button></form><div className="procure-mobile-open-orders">{openOrders.map((candidate) => <button type="button" key={candidate.id} onClick={() => { setReference(candidate.id); navigate(`/indkoeb/mobil/modtag/${encodeURIComponent(candidate.id)}`, { replace: true }); }}><b>{candidate.poNumber}</b><span>{state.suppliers.find((supplier) => supplier.id === candidate.supplierId)?.name}</span><small>{candidate.wantedDate || "Ingen leveringsdato"} · {candidate.lines.map((line) => line.name).join(", ")} · {candidate.deliveryLocation}</small></button>)}</div>{query && !openOrders.length && <div className="procure-mobile-empty"><b>Ingen åbne bestillinger fundet</b><span>Kontrollér søgningen og din adgang til kundens data.</span></div>}</div>}
    {order && ["edit", "review"].includes(step) && <>
      <article className="procure-mobile-receipt-order"><small>{order.poNumber}</small><h2>{order.title}</h2><p>{state.suppliers.find((supplier) => supplier.id === order.supplierId)?.name} · {order.deliveryLocation}</p></article>
      {receipts.length > 0 && <article className="procure-mobile-receipt-history"><h2>Tidligere modtagelser</h2><p>Genåbnet fra den servergemte bestilling. Bilag kræver fortsat din aktuelle adgang.</p>{receipts.map((receipt) => { const acceptedTotal = receipt.lines.reduce((sum, line) => sum + Number(line.acceptedQuantity || 0), 0); const damagedTotal = receipt.lines.reduce((sum, line) => sum + Number(line.damagedQuantity || 0), 0); const rejectedTotal = receipt.lines.reduce((sum, line) => sum + Number(line.rejectedQuantity || 0), 0); return <section key={receipt.id}><div><b>{receipt.receivedDate} · {receipt.deliveryNote || "Ingen følgeseddelreference"}</b><small>{acceptedTotal} godkendt · {damagedTotal} beskadiget · {rejectedTotal} afvist</small></div>{receipt.attachments?.length > 0 && <div className="procure-mobile-receipt-files">{receipt.attachments.map((attachment) => <button type="button" key={attachment.id || attachment.name} disabled={openingAttachment === attachment.id} onClick={() => openAttachment(receipt, attachment)}>▧ {openingAttachment === attachment.id ? "Åbner …" : attachment.name}</button>)}</div>}</section>; })}</article>}
      <button type="button" className="procure-camera-stop" onClick={receiveAll}>Modtag alle resterende varer</button>
      {order.lines.map((line) => { const item = state.catalog.find((candidate) => candidate.id === line.itemId); const packageInfo = item?.orderUnit && item.orderUnit !== (item.baseUnit || item.unit) ? `${item.unitsPerOrder} ${unitLabel(item.baseUnit || item.unit, item.unitsPerOrder)} pr. ${unitLabel(item.orderUnit, 1)}` : "Samme enhed ved bestilling og på lager"; return <article className="procure-mobile-receipt-line" key={line.id}><div><small>{line.sku || line.categorySnapshot}</small><h2>{line.name}</h2><p>Bestilt {line.quantity} · godkendt modtaget {acceptedQuantityForLine(receipts, line.id)} · rest {remainingQuantity(order, receipts, line.id)} {line.unit}</p></div><div className="procure-mobile-receipt-fields"><label>Leveret<input inputMode="decimal" type="number" min="0" max={remainingQuantity(order, receipts, line.id)} value={rows[line.id]?.deliveredQuantity ?? ""} onChange={(event) => update(line.id, "deliveredQuantity", event.target.value)} /></label><label>Beskadiget<input inputMode="decimal" type="number" min="0" value={rows[line.id]?.damagedQuantity ?? ""} onChange={(event) => update(line.id, "damagedQuantity", event.target.value)} /></label><label>Afvist<input inputMode="decimal" type="number" min="0" value={rows[line.id]?.rejectedQuantity ?? ""} onChange={(event) => update(line.id, "rejectedQuantity", event.target.value)} /></label></div>{item?.stocked && <label className="procure-mobile-stock-location">Lager og hyldeplacering<select value={`${rows[line.id]?.warehouseId || ""}|${rows[line.id]?.locationId || ""}`} onChange={(event) => { const [warehouseId, locationId] = event.target.value.split("|"); const place = placements.find((candidate) => candidate.id === locationId && candidate.lagerId === warehouseId); setRows((current) => ({ ...current, [line.id]: { ...current[line.id], warehouseId, warehouse: state.setup?.lagre?.[warehouseId]?.label || warehouseId, locationId, location: place?.label || locationId } })); }}><option value="|">Vælg placering</option>{placements.map((place) => <option key={`${place.lagerId}|${place.id}`} value={`${place.lagerId}|${place.id}`}>{state.setup?.lagre?.[place.lagerId]?.label || place.lagerId} · {place.label}</option>)}</select><small>Beholdningen føres i {unitLabel(item.baseUnit || item.unit, 2)}; {packageInfo}.</small></label>}<strong>Godkendt modtagelse: {accepted(line)} {line.unit}</strong></article>; })}
      <article className="procure-mobile-receipt-meta"><label>Modtagelsesdato<input type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></label><label>Følgeseddel<input value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder="Nummer eller reference" /></label></article>
      <article className="procure-mobile-attachments"><h2>Følgeseddel og billeder</h2><p>Filer er kun kladder, indtil serveren har kontrolleret dem og modtagelsen er bekræftet.</p><label className="procure-mobile-file">＋ Tilføj billeder eller PDF<input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={addFiles} /></label><div>{previews.map(({ file, url }) => <article key={fileKey(file)}>{url ? <img src={url} alt={`Forhåndsvisning af ${file.name}`} /> : <span>PDF</span>}<div><b>{file.name}</b><small>Kladde · afventer upload og serverkontrol</small></div><button type="button" aria-label={`Fjern ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => fileKey(item) !== fileKey(file)))}>×</button></article>)}</div></article>
      {step === "edit" ? <button className="procure-mobile-submit" disabled={!canWrite} onClick={() => setStep("review")}>Gennemgå modtagelse</button> : <article className="procure-mobile-receipt-review"><h2>Kontrollér før bekræftelse</h2>{order.lines.map((line) => <p key={line.id}><span>{line.name}</span><b>{accepted(line)} {line.unit} godkendes</b></p>)}<p><span>Vedhæftninger</span><b>{files.length}</b></p><button className="procure-mobile-submit" disabled={!canWrite || saving} onClick={confirm}>{saving ? "Uploader og validerer …" : "Bekræft modtagelse"}</button><button className="procure-camera-stop" onClick={() => setStep("edit")}>Tilbage og ret</button></article>}
    </>}
    {order && step === "done" && <article className="procure-mobile-receipt-done-card"><div className="procure-mobile-receipt"><span>✓</span><div><small>Kvittering</small><h2>Varerne er modtaget</h2><p>{order.poNumber} · {requestIdRef.current}</p><b>Godkendte mængder er registreret én gang. Beskadigede og afviste varer øger ikke lageret.</b><p>Lagerstatus: {registeredStatus === "modtaget" ? "Afsluttet" : "Delvist modtaget"} · Økonomisk opfølgning: {order.paymentStatus || "Afventer dokumentation"}</p></div></div>{inventoryEffects.map((effect) => <div className="procure-mobile-stock-result" key={effectKey(effect)}><b>{effect.itemName} · {effect.placering}</b><span>Før modtagelse: {effect.before} {effect.enhed}</span><span>Modtaget: +{effect.received} {effect.enhed}</span><strong>Beregnet beholdning: {effect.after} {effect.enhed}</strong></div>)}{inventoryEffects.length > 0 && <button className="procure-mobile-submit" onClick={() => setStep("count")}>Optæl og opdater lagerstatus</button>}<button className="procure-camera-stop" onClick={() => setStep("done-counted")}>Færdig uden optælling</button></article>}
    {order && step === "count" && <article className="procure-mobile-count"><h2>Optæl lager</h2><p>Kontrollér den faktiske beholdning, når varerne er sat på hylden.</p>{inventoryEffects.map((effect) => { const key = effectKey(effect); const actual = Number(counted[key]); const difference = actual - Number(effect.after); return <section key={key}><h3>{effect.itemName}</h3><small>{effect.lager} · {effect.placering}</small><div className="procure-inventory-calculation"><span>Beregnet beholdning</span><b>{effect.after} {effect.enhed}</b></div><label>Faktisk antal på hylden<span className="procure-inventory-unit-input"><input inputMode="decimal" type="number" min="0" step="any" value={counted[key] ?? ""} onChange={(event) => setCounted((current) => ({ ...current, [key]: event.target.value }))} /><b>{effect.enhed}</b></span></label><div className={`procure-inventory-difference ${difference === 0 ? "ok" : "warn"}`}><span>{difference === 0 ? "Optællingen stemmer" : "Korrektion"}</span><b>{difference > 0 ? "+" : ""}{difference} {effect.enhed}</b></div>{difference !== 0 && <label>Begrundelse<textarea value={countReasons[key] || ""} onChange={(event) => setCountReasons((current) => ({ ...current, [key]: event.target.value }))} placeholder="Fx afvigelse ved optælling" /></label>}</section>; })}<button className="procure-mobile-submit" disabled={saving} onClick={saveCounts}>{saving ? "Gemmer på serveren …" : "Bekræft optælling"}</button><button className="procure-camera-stop" disabled={saving} onClick={() => setStep("done")}>Tilbage</button></article>}
    {order && step === "done-counted" && <article className="procure-mobile-receipt procure-mobile-receipt-done"><span>✓</span><div><small>Afsluttet</small><h2>{inventoryEffects.length ? "Lagerstatus er opdateret" : "Modtagelsen er registreret"}</h2><p>Seneste optællingsdato ændres kun, hvis en optælling blev bekræftet.</p><Link to="/indkoeb/lager">Åbn lageroversigten</Link> · <Link to={`/indkoeb/bestillinger/${order.id}`}>Åbn bestillingen</Link></div></article>}
  </section>;
}
