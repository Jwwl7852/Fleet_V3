import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { createQrLabel, listQrLabels, setQrLabelActive } from "./procure-v2-adapter.js";

const requestId = () => globalThis.crypto?.randomUUID?.() || `qr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const qrUrl = (id) => `${window.location.origin}/indkoeb/mobil/scan/${encodeURIComponent(id)}`;

function LabelPreview({ label, item }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(qrUrl(label.id), { errorCorrectionLevel: "M", margin: 1, width: 232 })
      .then((url) => { if (alive) setSrc(url); });
    return () => { alive = false; };
  }, [label.id]);
  return <article className="procure-qr-label">
    {src ? <img src={src} alt={`QR-kode til ${item?.name || label.id}`} /> : <span className="procure-qr-placeholder">Danner QR …</span>}
    <div><small>VEYRO PROCURE</small><h2>{item?.name || "Vare ikke længere tilgængelig"}</h2><p>{item?.sku || label.itemId}</p><b>{item?.packageSize || item?.unit || "Enhed mangler"}</b><strong>{label.location}</strong></div>
  </article>;
}

export default function QrLabelScreen({ state, setState, demo, canWrite, busy, error }) {
  const [itemId, setItemId] = useState(state.catalog[0]?.id || "");
  const [location, setLocation] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [liveLabels, setLiveLabels] = useState([]);
  const [labelsBusy, setLabelsBusy] = useState(!demo);
  const locationRef = useRef(null);
  useEffect(() => {
    let alive = true;
    if (demo) return undefined;
    listQrLabels().then((result) => {
      if (!alive) return;
      if (result.ok) setLiveLabels(result.data.maerkater || []); else setMessage(result.message);
      setLabelsBusy(false);
    });
    return () => { alive = false; };
  }, [demo]);
  const labels = demo ? (state.qrLabels || []) : liveLabels;
  const rows = useMemo(() => labels.map((label) => ({
    ...label, item: state.catalog.find((item) => item.id === label.itemId),
  })), [labels, state.catalog]);
  const printable = rows.filter((row) => selected.has(row.id));

  const create = async (event) => {
    event.preventDefault();
    if (!canWrite || saving || !itemId || !location.trim()) return;
    setSaving(true); setMessage("");
    if (demo) {
      const label = { id: `qr-demo-${Date.now()}`, itemId, location: location.trim(), active: true };
      setState((current) => ({ ...current, qrLabels: [label, ...(current.qrLabels || [])] }));
      setSelected(new Set([label.id])); setLocation(""); setMessage("QR-mærkatet er oprettet og klar til udskrift.");
    } else {
      const result = await createQrLabel({ itemId, location: location.trim(), requestId: requestId() });
      if (result.ok) { setLiveLabels((current) => [{ id: result.data.maerkatId, itemId, location: location.trim(), active: true }, ...current]); setSelected(new Set([result.data.maerkatId])); setLocation(""); setMessage("QR-mærkatet er oprettet og klar til udskrift."); }
      else setMessage(result.message);
    }
    setSaving(false); locationRef.current?.focus();
  };

  const toggleActive = async (row) => {
    if (!canWrite) return;
    if (demo) setState((current) => ({ ...current, qrLabels: current.qrLabels.map((label) => label.id === row.id ? { ...label, active: !label.active } : label) }));
    else {
      const result = await setQrLabelActive({ labelId: row.id, active: !row.active });
      if (!result.ok) setMessage(result.message); else setLiveLabels((current) => current.map((label) => label.id === row.id ? { ...label, active: !row.active } : label));
    }
  };

  return <section className="procure-v2 procure-qr-admin">
    <header className="procure-mobile-head">
      <Link to="/indkoeb/mobil" className="procure-mobile-close" aria-label="Tilbage til varer">←</Link>
      <div><small>PROCURE · mobilbestilling</small><h1>QR-hyldemærkater</h1></div>
      <Link className="procure-qr-scan-link" to="/indkoeb/mobil/scan">Scan QR</Link>
    </header>
    {message && <div className="procure-mobile-offline" role="status">{message}</div>}
    {error && <div className="procure-mobile-offline" role="alert">Mærkaterne kunne ikke indlæses. Prøv igen.</div>}
    <form className="procure-qr-create" onSubmit={create}>
      <div><small>Stabil reference</small><h2>Opret mærkat til en placering</h2><p>Navn, pris og bestillingsenhed hentes altid aktuelt ved scanning. Samme vare kan mærkes på flere hylder.</p></div>
      <label>Vare<select value={itemId} onChange={(event) => setItemId(event.target.value)} required>{state.catalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.packageSize}</option>)}</select></label>
      <label>Hylde eller placering<input ref={locationRef} value={location} onChange={(event) => setLocation(event.target.value)} maxLength="120" placeholder="Fx Reol A · Hylde 3" required /></label>
      <button className="procure-mobile-submit" disabled={!canWrite || saving || !state.catalog.length}>{saving ? "Opretter …" : "Opret QR-mærkat"}</button>
      {!canWrite && <p className="procure-mobile-submit-note">Du kan se og udskrive mærkater, men din rolle kan ikke oprette eller deaktivere dem.</p>}
    </form>
    <div className="procure-qr-toolbar">
      <div><h2>Eksisterende mærkater</h2><span>{selected.size} valgt</span></div>
      <button type="button" disabled={!selected.size} onClick={() => window.print()}>Udskriv valgte</button>
    </div>
    {busy || labelsBusy ? <div className="procure-mobile-empty"><b>Indlæser mærkater …</b></div> : <div className="procure-qr-list">
      {rows.map((row) => <article key={row.id} className={!row.active ? "inactive" : ""}>
        <label className="procure-qr-check"><input type="checkbox" checked={selected.has(row.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next; })} /><span /></label>
        <div><small>{row.item?.sku || row.itemId}</small><h3>{row.item?.name || "Vare mangler"}</h3><p>{row.location} · {row.item?.packageSize || row.item?.unit || "Enhed mangler"}</p></div>
        <strong>{row.active ? "Aktiv" : "Deaktiveret"}</strong>
        {canWrite && <button type="button" onClick={() => toggleActive(row)}>{row.active ? "Deaktivér" : "Aktivér"}</button>}
      </article>)}
      {!rows.length && <div className="procure-mobile-empty"><b>Ingen QR-mærkater endnu</b><span>Opret det første mærkat ovenfor.</span></div>}
    </div>}
    <div className="procure-qr-print" aria-hidden="true">{printable.map((row) => <LabelPreview key={row.id} label={row} item={row.item} />)}</div>
  </section>;
}
