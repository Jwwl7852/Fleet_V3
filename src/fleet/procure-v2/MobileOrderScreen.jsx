import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { meldBehov } from "../behov.js";
import { opretBestilling } from "../bestilling.js";
import { skiftOrdre } from "../godkendelse.js";
import { resolveQrLabel } from "./procure-v2-adapter.js";

const kr = (oere = 0) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(oere / 100);
const todayPlus = (days) => {
  const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10);
};
const newSubmissionId = () => globalThis.crypto?.randomUUID?.() || `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emptyDraft = () => ({ submissionId: newSubmissionId(), items: {}, custom: [], department: "Lager", departmentId: "lager", deliveryLocation: "Hovedlager", wantedDate: todayPlus(7), updatedAt: Date.now() });
const statusLabel = (status) => ({
  "pending-approval": "Afventer godkendelse", afventerGodkendelse: "Afventer godkendelse",
  approved: "Klar til afsendelse", godkendt: "Klar til afsendelse",
  sent: "Sendt til leverandør", sendt: "Sendt til leverandør",
  "part-received": "Delvist modtaget", modtaget: "Modtaget",
}[status] || "Indsendt behov");

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

function ProductGlyph({ type }) {
  return <span className={`procure-mobile-glyph ${type || "other"}`} aria-hidden="true"><i /></span>;
}

function Quantity({ value = 0, onChange, label }) {
  return <div className="procure-mobile-qty" aria-label={`Antal ${label}`}>
    <button type="button" aria-label={`Fjern én ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
    <input aria-label={`Antal ${label}`} inputMode="numeric" pattern="[0-9]*" min="0" type="number" value={value || ""} placeholder="0" onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} />
    <button type="button" aria-label={`Tilføj én ${label}`} onClick={() => onChange(value + 1)}>＋</button>
  </div>;
}

function qrIdFromValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.origin);
    const match = url.pathname.match(/\/indkoeb\/mobil\/scan\/([^/]+)\/?$/);
    if (match) return decodeURIComponent(match[1]);
  } catch { /* En rå mærkatreference prøves nedenfor. */ }
  const id = raw.replace(/^VEYRO-QR:/i, "");
  return /^[a-zA-Z0-9_-]{3,80}$/.test(id) ? id : "";
}

function QrScanner({ onResult, canManage, added }) {
  const videoRef = useRef(null);
  const tracksRef = useRef([]);
  const frameRef = useRef(0);
  const [cameraState, setCameraState] = useState("idle");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    tracksRef.current.forEach((track) => track.stop()); tracksRef.current = [];
    setCameraState((current) => current === "active" ? "idle" : current);
  };
  useEffect(() => stop, []);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.BarcodeDetector) {
      setCameraState("unsupported");
      setError("Kamera-QR er ikke understøttet i denne browser. Indsæt QR-linket eller brug almindelig varesøgning.");
      return;
    }
    try {
      const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      tracksRef.current = stream.getTracks();
      videoRef.current.srcObject = stream; await videoRef.current.play(); setCameraState("active");
      const detect = async () => {
        if (!videoRef.current || !tracksRef.current.length) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const id = qrIdFromValue(codes[0]?.rawValue);
          if (id) { stop(); onResult(id); return; }
          if (codes.length) setError("QR-koden er ikke et gyldigt Veyro-hyldemærkat.");
        } catch { /* Næste kamerabillede prøves. */ }
        frameRef.current = requestAnimationFrame(detect);
      };
      frameRef.current = requestAnimationFrame(detect);
    } catch (cause) {
      stop(); setCameraState("denied");
      setError(cause?.name === "NotAllowedError" ? "Kameraadgang blev afvist. Du kan stadig indsætte koden eller søge efter varen." : "Kameraet kunne ikke startes. Brug manuel kode eller almindelig varesøgning.");
    }
  };
  const submitManual = (event) => {
    event.preventDefault(); const id = qrIdFromValue(manual);
    if (!id) { setError("Indtast et gyldigt Veyro QR-link eller mærkat-id."); return; }
    onResult(id);
  };

  return <div className="procure-mobile-scan">
    {added && <div className="procure-qr-added" role="status">✓ {added} er lagt i kurven. Klar til næste hylde.</div>}
    <section className="procure-camera-card">
      <div className={`procure-camera-frame ${cameraState}`}>
        <video ref={videoRef} playsInline muted aria-label="Kamerabillede til QR-scanning" />
        {cameraState !== "active" && <span aria-hidden="true">⌗</span>}
        {cameraState === "active" && <i aria-hidden="true" />}
      </div>
      <h2>Scan mærkatet på hylden</h2>
      <p>Scanning åbner kun varen. Intet indsendes eller sendes til en leverandør.</p>
      {cameraState === "active" ? <button type="button" className="procure-camera-stop" onClick={stop}>Stop kamera</button> : <button type="button" className="procure-mobile-submit" onClick={start}>Åbn kamera</button>}
      {error && <div className="procure-qr-error" role="alert">{error}</div>}
    </section>
    <form className="procure-qr-manual" onSubmit={submitManual}>
      <label>QR-link eller mærkat-id<input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Fx qr-tape-a1" autoCapitalize="none" /></label>
      <button type="submit">Åbn vare</button>
    </form>
    <Link className="procure-qr-search-fallback" to="/indkoeb/mobil">Søg efter varen i stedet</Link>
    {canManage && <Link className="procure-qr-manage" to="/indkoeb/mobil/qr-maerkater">Opret og udskriv QR-mærkater</Link>}
  </div>;
}

export default function MobileOrderScreen({ state, setState, demo, tenant, user, canWrite, canApprove }) {
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const scanMatch = location.pathname.match(/\/indkoeb\/mobil\/scan\/([^/]+)\/?$/);
  const scanId = scanMatch ? decodeURIComponent(scanMatch[1]) : "";
  const mode = location.pathname.endsWith("/kurv") ? "cart" : location.pathname.endsWith("/mine") ? "mine" : location.pathname.includes("/scan") ? "scan" : "products";
  const scope = `${tenant?.id || tenant?.navn || "tenant"}:${user?.uid || user?.id || user?.navn || "user"}`;
  const draftKey = `veyro:procure:mobile-draft:v1:${scope}`;
  const historyKey = `veyro:procure:mobile-history:v1:${scope}`;
  const [draft, setDraft] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(draftKey)); return saved ? { ...saved, submissionId: saved.submissionId || newSubmissionId() } : emptyDraft(); } catch { return emptyDraft(); }
  });
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(historyKey)) || []; } catch { return []; }
  });
  const [saveStatus, setSaveStatus] = useState("Gemt på denne enhed");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Alle");
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [scanned, setScanned] = useState(null);
  const [scanState, setScanState] = useState(scanId ? "loading" : "idle");
  const [scanQuantity, setScanQuantity] = useState(1);
  const customButtonRef = useRef(null);
  useEffect(() => {
    if (!draft) return undefined;
    setSaveStatus("Gemmer …");
    const timer = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ ...draft, updatedAt: Date.now() })); setSaveStatus("Gemt på denne enhed"); }
      catch { setSaveStatus("Kunne ikke gemme kladden"); }
    }, 180);
    return () => clearTimeout(timer);
  }, [draft, draftKey]);
  useEffect(() => {
    if (!customOpen) return undefined;
    const close = (event) => { if (event.key === "Escape") { setCustomOpen(false); customButtonRef.current?.focus(); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [customOpen]);
  useEffect(() => {
    let alive = true;
    if (!scanId) { setScanned(null); setScanState("idle"); setScanQuantity(1); return undefined; }
    setScanState("loading"); setMessage("");
    const load = async () => {
      if (demo) {
        const label = (state.qrLabels || []).find((row) => row.id === scanId);
        const item = state.catalog.find((row) => row.id === label?.itemId);
        if (!label) { if (alive) { setScanned(null); setScanState("not-found"); } return; }
        if (!label.active || !item) { if (alive) { setScanned(null); setScanState("inactive"); } return; }
        if (alive) { setScanned({ label, item }); setScanState("ready"); setScanQuantity(1); }
        return;
      }
      const result = await resolveQrLabel(scanId);
      if (!alive) return;
      if (!result.ok) { setScanned(null); setScanState(result.kind); setMessage(result.message); return; }
      const row = result.data;
      setScanned({
        label: { id: row.maerkat.id, itemId: row.maerkat.vareId, location: row.maerkat.placering, active: true },
        item: { id: row.vare.id, sku: row.vare.varenummer || row.vare.id, name: row.vare.navn, category: row.vare.varegruppe || "Ukategoriseret", supplierId: row.vare.leverandoerId || null, unit: row.vare.enhed || "stk.", packageSize: row.vare.pakningsstoerrelse || row.vare.enhed || "stk.", unitPriceOere: Number(row.vare.indkoebsprisOere || 0), visual: row.vare.billedeType || "other" },
      });
      setScanState("ready"); setScanQuantity(1);
    };
    load(); return () => { alive = false; };
  }, [scanId, demo, state.catalog, state.qrLabels]);

  const selected = useMemo(() => {
    if (!draft) return [];
    const catalog = state.catalog.filter((item) => Number(draft.items[item.id]) > 0)
      .map((item) => ({ ...item, quantity: Number(draft.items[item.id]) }));
    return [...catalog, ...(draft.custom || []).map((item) => ({ ...item, quantity: Number(item.quantity || 1), custom: true }))];
  }, [draft, state.catalog]);
  const lineCount = selected.length;
  const total = selected.reduce((sum, item) => sum + Number(item.unitPriceOere || 0) * Number(item.quantity), 0);
  const categories = ["Alle", "Favoritter", "Tidligere køb", ...new Set(state.catalog.map((item) => item.category))];
  const shown = state.catalog.filter((item) => {
    const search = `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(query.toLowerCase());
    const tab = filter === "Alle" || filter === item.category || (filter === "Favoritter" && item.favorite) || (filter === "Tidligere køb" && item.boughtBefore);
    return search && tab;
  });
  const quantity = (id) => Number(draft?.items?.[id] || 0);
  const setQuantity = (id, value) => setDraft((current) => ({ ...current, items: { ...current.items, [id]: value } }));
  const saveHistory = (items) => { setHistory(items); localStorage.setItem(historyKey, JSON.stringify(items)); };
  const addScanned = () => {
    if (!scanned?.item || scanQuantity <= 0) return;
    const current = quantity(scanned.item.id);
    setQuantity(scanned.item.id, current + scanQuantity);
    navigate("/indkoeb/mobil/scan", { state: { added: `${scanQuantity} × ${scanned.item.name}` } });
  };

  const submit = async () => {
    if (!canWrite || submitting || submittingRef.current || !lineCount || !online) return;
    submittingRef.current = true; setSubmitting(true); setMessage("");
    if (demo) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const groups = new Map();
      selected.forEach((item) => {
        const key = item.supplierId || "mangler-leverandoer";
        groups.set(key, [...(groups.get(key) || []), item]);
      });
      const stamp = Date.now(); const createdAt = new Date(stamp).toISOString();
      const references = [...groups.entries()].map(([supplierId, lines], index) => ({
        id: `mobile-${stamp}-${index}`, poNumber: supplierId === "mangler-leverandoer" ? null : `PO-2026-${String(150 + history.length + index).padStart(4, "0")}`,
        supplierId, status: total > 500000 ? "pending-approval" : "approved", createdAt,
        lines: lines.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, unitPriceOere: item.unitPriceOere || 0, categorySnapshot: item.category || "Ukategoriseret" })),
      }));
      setState((current) => ({ ...current, orders: [...references.filter((item) => item.poNumber), ...current.orders] }));
      saveHistory([...references, ...history]);
      localStorage.removeItem(draftKey); setDraft(emptyDraft());
      navigate("/indkoeb/mobil/mine?kvittering=1", { replace: true }); submittingRef.current = false; setSubmitting(false); return;
    }
    const needs = [];
    for (const item of selected) {
      const result = await meldBehov({
        vare: item.name, kilde: draft.departmentId, antal: Number(item.quantity), enhed: item.unit || "stk.",
        varenummer: item.sku, leverandoerId: item.supplierId, note: `Mobilbestilling · ${draft.deliveryLocation} · ønsket ${draft.wantedDate}`,
        requestId: `${draft.submissionId}-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40)}`,
      });
      if (!result.ok) { setMessage(result.besked || "Behovet kunne ikke indsendes. Kurven er bevaret."); submittingRef.current = false; setSubmitting(false); return; }
      needs.push({ item, behovId: result.data.id });
    }
    const groups = new Map();
    needs.forEach((entry) => { if (entry.item.supplierId) groups.set(entry.item.supplierId, [...(groups.get(entry.item.supplierId) || []), entry]); });
    const references = [];
    for (const [supplierId, entries] of groups) {
      const order = await opretBestilling({ leverandoerId: supplierId, requestId: `${draft.submissionId}-${String(supplierId).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40)}`, linjer: entries.map(({ item, behovId }) => ({ behovId, antal: item.quantity, prisPrEnhedOere: item.unitPriceOere })) });
      if (!order.ok) { setMessage(`${order.besked} Behovene er bevaret, og kurven er ikke ryddet.`); submittingRef.current = false; setSubmitting(false); return; }
      const moved = await skiftOrdre({ ordreId: order.data.id, til: "afventerGodkendelse" });
      references.push({ id: order.data.id, poNumber: order.data.nummer, supplierId, status: moved.data?.status || "afventerGodkendelse", createdAt: new Date().toISOString() });
    }
    saveHistory([...references, ...history]);
    localStorage.removeItem(draftKey); setDraft(emptyDraft());
    navigate("/indkoeb/mobil/mine?kvittering=1", { replace: true }); submittingRef.current = false; setSubmitting(false);
  };

  const addCustom = () => {
    if (!customName.trim()) return;
    setDraft((current) => ({ ...current, custom: [...(current.custom || []), { id: `custom-${Date.now()}`, name: customName.trim(), unit: "stk.", quantity: 1, category: "Ukategoriseret" }] }));
    setCustomName(""); setCustomOpen(false); customButtonRef.current?.focus();
  };

  return <section className="procure-v2 procure-mobile-order">
    <header className="procure-mobile-head">
      <Link to="/indkoeb" className="procure-mobile-close" aria-label="Luk mobilbestilling">←</Link>
      <div><small>PROCURE · mobilbestilling</small><h1>{mode === "products" ? "Varer" : mode === "cart" ? "Kurv" : mode === "scan" ? "Scan QR" : "Mine indkøb"}</h1></div>
      <span className={`procure-mobile-save ${saveStatus.includes("ikke") ? "bad" : ""}`}>{saveStatus}</span>
    </header>
    {!online && <div className="procure-mobile-offline" role="alert">Offline · kurven er bevaret. Ordren sendes ikke automatisk, når forbindelsen vender tilbage.</div>}
    {message && <div className="procure-mobile-offline" role="alert">{message}</div>}

    {mode === "products" && <>
      <div className="procure-mobile-primary-actions"><Link to="/indkoeb/mobil/scan">⌗ <span>Scan QR</span></Link>{canWrite && <Link to="/indkoeb/mobil/qr-maerkater">QR-mærkater</Link>}</div>
      <div className="procure-mobile-search"><span>⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg vare, varenummer eller varegruppe" /></div>
      <div className="procure-mobile-chips" aria-label="Varefiltre">{categories.map((category) => <button key={category} className={filter === category ? "active" : ""} onClick={() => setFilter(category)}>{category}</button>)}</div>
      <div className="procure-mobile-products">{shown.map((item) => <article key={item.id} className="procure-mobile-product">
        <ProductGlyph type={item.visual} /><div className="procure-mobile-product-copy"><small>{item.category} · {item.sku}</small><h2>{item.name}</h2><p><b>{item.packageSize}</b> · {kr(item.unitPriceOere)} pr. {item.unit}</p></div>
        <Quantity label={item.name} value={quantity(item.id)} onChange={(value) => setQuantity(item.id, value)} />
      </article>)}</div>
      {!shown.length && <div className="procure-mobile-empty"><b>Ingen varer matcher</b><span>Prøv en anden søgning, eller beskriv varen nedenfor.</span></div>}
      <button ref={customButtonRef} className="procure-mobile-missing" onClick={() => setCustomOpen(true)}>＋ Beskriv en vare, der mangler</button>
    </>}

    {mode === "scan" && !scanId && <QrScanner onResult={(id) => navigate(`/indkoeb/mobil/scan/${encodeURIComponent(id)}`)} canManage={canWrite} added={location.state?.added} />}
    {mode === "scan" && scanId && <div className="procure-mobile-scan-result">
      {scanState === "loading" && <div className="procure-mobile-empty"><b>Henter varen …</b><span>Aktuelle oplysninger læses sikkert.</span></div>}
      {scanState === "ready" && scanned && <article className="procure-qr-product">
        <ProductGlyph type={scanned.item.visual} />
        <div className="procure-mobile-product-copy"><small>{scanned.item.sku} · {scanned.label.location}</small><h2>{scanned.item.name}</h2><p>Bestillingsenhed: <b>{scanned.item.packageSize}</b></p><p>{kr(scanned.item.unitPriceOere)} pr. {scanned.item.unit}</p></div>
        <div className="procure-qr-existing">Allerede i kurven til {draft.deliveryLocation}: <b>{quantity(scanned.item.id)}</b></div>
        <label className="procure-qr-add-label">Tilføj antal<Quantity label={scanned.item.name} value={scanQuantity} onChange={setScanQuantity} /></label>
        <button type="button" className="procure-mobile-submit" disabled={scanQuantity <= 0} onClick={addScanned}>Tilføj og scan næste</button>
        <p className="procure-mobile-submit-note">Dette lægger kun varen i din gemte kurv. Indsendelse sker senere fra kurven.</p>
      </article>}
      {["not-found", "inactive", "denied", "error"].includes(scanState) && <div className="procure-mobile-empty"><b>{scanState === "inactive" ? "Mærkatet er deaktiveret" : scanState === "denied" ? "Ingen adgang" : "QR-koden kan ikke bruges"}</b><span>{message || (scanState === "inactive" ? "Mærkatet eller varen er deaktiveret. Brug varesøgning eller kontakt en indkøbsansvarlig." : "Mærkatet er ukendt eller tilhører en anden kunde.")}</span><Link to="/indkoeb/mobil/scan">Scan en anden kode</Link><Link to="/indkoeb/mobil">Søg efter varen</Link></div>}
    </div>}

    {mode === "cart" && <div className="procure-mobile-cart">
      {!lineCount ? <div className="procure-mobile-empty"><b>Kurven er tom</b><span>Tilføj varer, mens du går hylderne igennem.</span><Link to="/indkoeb/mobil">Find varer</Link></div> : <>
        <div className="procure-mobile-section-head"><span>{lineCount} varelinjer</span><b>{kr(total)} ekskl. moms</b></div>
        {selected.map((item) => <article className="procure-mobile-cartline" key={item.id}><div><small>{state.suppliers.find((supplier) => supplier.id === item.supplierId)?.name || "Leverandør afklares"}</small><h2>{item.name}</h2><p>{item.packageSize || item.unit}</p></div><Quantity label={item.name} value={item.quantity} onChange={(value) => item.custom ? setDraft((current) => ({ ...current, custom: current.custom.map((row) => row.id === item.id ? { ...row, quantity: value } : row).filter((row) => row.quantity > 0) })) : setQuantity(item.id, value)} /></article>)}
        <article className="procure-mobile-delivery"><h2>Levering</h2><label>Afdeling<select value={draft.departmentId} onChange={(event) => setDraft({ ...draft, departmentId: event.target.value, department: event.target.options[event.target.selectedIndex].text })}><option value="lager">Lager</option><option value="drift">Drift</option><option value="kontor">Kontor</option><option value="facility">Facility</option></select></label><label>Leveringssted<input value={draft.deliveryLocation} onChange={(event) => setDraft({ ...draft, deliveryLocation: event.target.value })} /></label><label>Ønsket dato<input type="date" value={draft.wantedDate} onChange={(event) => setDraft({ ...draft, wantedDate: event.target.value })} /></label></article>
        <div className="procure-mobile-review"><h2>Kompakt overblik</h2><p><span>Varer</span><b>{lineCount} varelinjer</b></p><p><span>Antal</span><b>{selected.reduce((sum, item) => sum + item.quantity, 0)} enheder/pakker</b></p><p><span>Leverandører</span><b>{new Set(selected.map((item) => item.supplierId).filter(Boolean)).size || "Afklares"}</b></p><p><span>Levering</span><b>{draft.deliveryLocation} · {draft.wantedDate}</b></p><small>Flere leverandører opdeles i separate bestillinger med hvert sit PO-nummer.</small></div>
        <button className="procure-mobile-submit" disabled={!canWrite || submitting || !online} onClick={submit}>{submitting ? "Indsender sikkert …" : canApprove ? "Send til godkendelse" : "Indsend behov"}</button>
        <p className="procure-mobile-submit-note">Mail og PDF dannes efter godkendelse. Leverandøren modtager intet, før en bruger aktivt vælger Send bestilling.</p>
      </>}
    </div>}

    {mode === "mine" && <div className="procure-mobile-mine">
      {new URLSearchParams(location.search).get("kvittering") === "1" && history[0] && <article className="procure-mobile-receipt"><span>✓</span><div><small>Kvittering</small><h2>Indkøbet er modtaget</h2><p>{history.filter((item) => item.createdAt === history[0].createdAt).map((item) => item.poNumber || "Behovsreference").join(" · ")}</p><b>{statusLabel(history[0].status)}</b></div></article>}
      <h2 className="procure-mobile-list-title">Seneste indkøb</h2>
      {[...history, ...state.orders.filter((order) => !history.some((item) => item.id === order.id))].slice(0, 12).map((order) => <article className="procure-mobile-purchase" key={order.id}><div><small>{order.poNumber || order.id}</small><h3>{state.suppliers.find((supplier) => supplier.id === order.supplierId)?.name || "Leverandør afklares"}</h3><p>{order.lines?.length || 1} varelinjer</p></div><strong>{statusLabel(order.status)}</strong></article>)}
      {!history.length && !state.orders.length && <div className="procure-mobile-empty"><b>Ingen indkøb endnu</b><span>Dine indsendte behov og bestillinger vises her.</span></div>}
    </div>}

    {["products", "scan"].includes(mode) && lineCount > 0 && <Link className="procure-mobile-cart-cta" to="/indkoeb/mobil/kurv"><span>Se kurv · {lineCount} varelinjer</span><b>{kr(total)} ›</b></Link>}
    <nav className="procure-mobile-nav" aria-label="Mobilbestilling"><Link className={["products", "scan"].includes(mode) ? "active" : ""} to="/indkoeb/mobil"><span>▦</span>Varer</Link><Link className={mode === "cart" ? "active" : ""} to="/indkoeb/mobil/kurv"><span>▣</span>Kurv{lineCount > 0 && <i>{lineCount}</i>}</Link><Link className={mode === "mine" ? "active" : ""} to="/indkoeb/mobil/mine"><span>◎</span>Mine indkøb</Link></nav>

    {customOpen && <div className="procure-mobile-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="mobile-custom-title"><button aria-label="Luk" onClick={() => setCustomOpen(false)}>×</button><h2 id="mobile-custom-title">Vare uden for katalog</h2><p>Beskriv varen kort. Indkøbsteamet afklarer leverandør og pris.</p><label>Varebeskrivelse<textarea autoFocus maxLength="200" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Fx genopfyldning til særlig sæbedispenser" /></label><button className="procure-mobile-submit" disabled={!customName.trim()} onClick={addCustom}>Læg i kurven</button></section></div>}
  </section>;
}
