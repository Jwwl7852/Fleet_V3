import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loadMobileDraft, resolveQrLabel, saveMobileDraft, submitMobileDraftPart } from "./procure-v2-adapter.js";
import { formatUnitQuantity, orderUnitSummary, unitLabel, validateOrderUnit } from "./procure-v2-domain.js";

const kr = (oere = 0) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(oere / 100);
const todayPlus = (days) => {
  const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10);
};
const newSubmissionId = () => globalThis.crypto?.randomUUID?.() || `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emptyDraft = () => ({ submissionId: newSubmissionId(), items: {}, custom: [], submitQuantities: {}, department: "Lager", departmentId: "lager", deliveryLocation: "Hovedlager", wantedDate: todayPlus(7), asSoonAsPossible: false, updatedAt: Date.now() });
const clientDraft = (value) => ({ ...emptyDraft(), ...(value || {}), custom: Array.isArray(value?.custom) ? value.custom : Object.values(value?.custom || {}), submitQuantities: value?.submitQuantities || {} });
const statusLabel = (status) => ({
  "pending-approval": "Afventer godkendelse", afventerGodkendelse: "Afventer godkendelse",
  approved: "Klar til afsendelse", godkendt: "Klar til afsendelse",
  sent: "Sendt til leverandør", sendt: "Sendt til leverandør",
  "part-received": "Delvist modtaget", modtaget: "Fuldt modtaget", afsluttet: "Afsluttet",
}[status] || "Indsendt behov");
const receiptHeading = (status) => ["approved", "godkendt"].includes(status)
  ? "Godkendt – klar til bestilling"
  : "Sendt til godkendelse";

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

function Quantity({ value = 0, onChange, label, step = 1, minimum = 0 }) {
  return <div className="procure-mobile-qty" aria-label={`Antal ${label}`}>
    <button type="button" aria-label={`Fjern ${step} ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - step))}>−</button>
    <input aria-label={`Antal ${label}`} inputMode="numeric" pattern="[0-9]*" min={minimum} step={step} type="number" value={value || ""} placeholder="0" onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} />
    <button type="button" aria-label={`Tilføj ${step} ${label}`} onClick={() => onChange(value > 0 ? value + step : Math.max(minimum, step))}>＋</button>
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

const draftSignature = (draft = {}) => JSON.stringify({
  items: draft.items || {}, custom: Array.isArray(draft.custom) ? draft.custom : Object.values(draft.custom || {}),
  departmentId: draft.departmentId || "", department: draft.department || "",
  deliveryLocationId: draft.deliveryLocationId || "", deliveryLocation: draft.deliveryLocation || "",
  wantedDate: draft.wantedDate || "", asSoonAsPossible: Boolean(draft.asSoonAsPossible),
});
const hasDraftLines = (draft = {}) => Object.keys(draft.items || {}).length > 0 || (Array.isArray(draft.custom) ? draft.custom.length : Object.keys(draft.custom || {}).length) > 0;

function mergeConcurrentDraft(base = {}, local = {}, remote = {}) {
  const itemIds = new Set([...Object.keys(base.items || {}), ...Object.keys(local.items || {}), ...Object.keys(remote.items || {})]);
  const items = {};
  for (const id of itemIds) {
    const merged = Math.max(0, Number(remote.items?.[id] || 0) + Number(local.items?.[id] || 0) - Number(base.items?.[id] || 0));
    if (merged > 0) items[id] = merged;
  }
  const customById = (rows = []) => Object.fromEntries(rows.map((row) => [row.id, row]));
  const baseCustom = customById(base.customItems); const localCustom = customById(local.customItems); const remoteCustom = customById(remote.customItems);
  const customItems = [...new Set([...Object.keys(baseCustom), ...Object.keys(localCustom), ...Object.keys(remoteCustom)])].map((id) => {
    const row = localCustom[id] || remoteCustom[id] || baseCustom[id];
    const quantity = Math.max(0, Number(remoteCustom[id]?.quantity || 0) + Number(localCustom[id]?.quantity || 0) - Number(baseCustom[id]?.quantity || 0));
    return { ...row, quantity };
  }).filter((row) => row.quantity > 0);
  const pick = (field) => local[field] !== base[field] ? local[field] : remote[field];
  return { ...remote, ...local, items, customItems,
    departmentId: pick("departmentId"), department: pick("department"),
    deliveryLocationId: pick("deliveryLocationId"), deliveryLocation: pick("deliveryLocation"),
    wantedDate: pick("wantedDate"), asSoonAsPossible: pick("asSoonAsPossible"), updatedAt: Date.now() };
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
  const receiptKey = `veyro:procure:mobile-receipt:v1:${scope}`;
  const [draft, setDraft] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(draftKey)); return saved ? { ...saved, submissionId: saved.submissionId || newSubmissionId() } : emptyDraft(); } catch { return emptyDraft(); }
  });
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(historyKey)) || []; } catch { return []; }
  });
  const [lastReceipt, setLastReceipt] = useState(() => {
    try { return JSON.parse(localStorage.getItem(receiptKey)) || null; } catch { return null; }
  });
  const [saveStatus, setSaveStatus] = useState("Gemt på denne enhed");
  const [serverHydrated, setServerHydrated] = useState(demo);
  const serverRevisionRef = useRef(0);
  const lastServerSignatureRef = useRef("");
  const lastServerDraftRef = useRef({});
  const savingSignatureRef = useRef("");
  const latestDraftRef = useRef(draft);
  const [saveEpoch, setSaveEpoch] = useState(0);
  latestDraftRef.current = draft;
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
  const activeDepartments = useMemo(() => Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false), [state.setup]);
  const activeDeliveryLocations = useMemo(() => Object.values(state.setup?.leveringssteder || {}).filter((row) => row.active !== false), [state.setup]);
  useEffect(() => {
    if (demo) return undefined;
    let active = true;
    loadMobileDraft().then((result) => {
      if (!active) return;
      if (result.ok && result.data?.draft) {
        const remote = result.data.draft;
        serverRevisionRef.current = Number(remote.revision || 0);
        lastServerSignatureRef.current = draftSignature(remote);
        lastServerDraftRef.current = remote;
        setDraft((local) => hasDraftLines(remote) && !hasDraftLines(local)
          ? clientDraft(remote)
          : Number(remote.updatedAt || 0) >= Number(local?.updatedAt || 0) ? clientDraft(remote) : local);
        setSaveStatus("Synkroniseret");
      }
      setServerHydrated(true);
    });
    return () => { active = false; };
  }, [demo]);
  useEffect(() => {
    if (!draft || !serverHydrated) return undefined;
    const signature = draftSignature(draft);
    try { localStorage.setItem(draftKey, JSON.stringify(draft)); }
    catch { setSaveStatus("Kunne ikke gemme kladden"); }
    if (demo) { lastServerSignatureRef.current = signature; setSaveStatus("Gemt på denne enhed"); return undefined; }
    if (!hasDraftLines(draft) && serverRevisionRef.current === 0) {
      setSaveStatus("Klar til at samle varer"); return undefined;
    }
    if (signature === lastServerSignatureRef.current || signature === savingSignatureRef.current) return undefined;
    setSaveStatus("Gemmer …");
    const timer = setTimeout(async () => {
      savingSignatureRef.current = signature;
      const snapshot = { ...draft, updatedAt: Date.now() };
      try { localStorage.setItem(draftKey, JSON.stringify(snapshot)); }
      catch { setSaveStatus("Kunne ikke gemme kladden"); }
      if (!online) { savingSignatureRef.current = ""; setSaveStatus("Afventer forbindelse"); return; }
      const result = await saveMobileDraft({ draft: snapshot, expectedRevision: serverRevisionRef.current, mutationId: newSubmissionId() });
      if (result.ok) {
        const saved = result.data?.draft || snapshot;
        serverRevisionRef.current = Number(saved.revision || serverRevisionRef.current); lastServerSignatureRef.current = signature; lastServerDraftRef.current = saved; savingSignatureRef.current = ""; setSaveStatus("Synkroniseret");
        if (draftSignature(latestDraftRef.current) !== signature) setSaveEpoch((value) => value + 1);
        return;
      }
      if (result.kind === "conflict" && result.current) {
        const merged = mergeConcurrentDraft(lastServerDraftRef.current, latestDraftRef.current, result.current);
        serverRevisionRef.current = Number(result.current.revision || 0); lastServerSignatureRef.current = draftSignature(result.current); lastServerDraftRef.current = result.current; savingSignatureRef.current = ""; setDraft(clientDraft(merged));
      }
      savingSignatureRef.current = "";
      setSaveStatus(result.kind === "conflict" ? "Synkroniseret" : "Afventer forbindelse");
    }, 180);
    return () => clearTimeout(timer);
  }, [draft, draftKey, demo, online, serverHydrated, saveEpoch]);
  useEffect(() => {
    if (!customOpen) return undefined;
    const close = (event) => { if (event.key === "Escape") { setCustomOpen(false); customButtonRef.current?.focus(); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [customOpen]);
  useEffect(() => {
    if (!draft || !activeDepartments.length || !activeDeliveryLocations.length) return;
    setDraft((current) => {
      const department = activeDepartments.find((row) => row.id === current.departmentId) || activeDepartments[0];
      const delivery = activeDeliveryLocations.find((row) => row.id === current.deliveryLocationId) || activeDeliveryLocations[0];
      if (current.departmentId === department.id && current.department === department.label && current.deliveryLocationId === delivery.id && current.deliveryLocation === delivery.label) return current;
      return { ...current, departmentId: department.id, department: department.label, deliveryLocationId: delivery.id, deliveryLocation: delivery.label };
    });
  }, [activeDepartments, activeDeliveryLocations, draft?.departmentId, draft?.deliveryLocationId]);
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
        item: { id: row.vare.id, sku: row.vare.varenummer || row.vare.id, name: row.vare.navn, category: row.vare.varegruppe || "Ukategoriseret", supplierId: row.vare.leverandoerId || null, unit: row.vare.bestillingsenhed || row.vare.enhed || "stk.", orderUnit: row.vare.bestillingsenhed || row.vare.enhed || "stk.", baseUnit: row.vare.grundenhed || row.vare.enhed || "stk.", unitsPerOrder: Number(row.vare.antalPrBestillingsenhed || 1), packageSize: row.vare.pakningsstoerrelse || row.vare.enhed || "stk.", unitPriceOere: Number(row.vare.indkoebsprisOere || 0), orderPriceOere: Number(row.vare.bestillingsprisOere || row.vare.indkoebsprisOere || 0), minimumOrderQuantity: Number(row.vare.minimumsantal || 1), orderStep: Number(row.vare.bestillingstrin || 1), visual: row.vare.billedeType || "other" },
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
  const total = selected.reduce((sum, item) => sum + orderUnitSummary(item, item.quantity).totalOere, 0);
  const submissionQuantity = (item) => Math.min(item.quantity, Math.max(0, Number(draft.submitQuantities?.[item.id] ?? 0)));
  const submitLines = selected.map((item) => ({ ...item, submitQuantity: submissionQuantity(item) })).filter((item) => item.submitQuantity > 0);
  const submissionTotal = submitLines.reduce((sum, item) => sum + orderUnitSummary(item, item.submitQuantity).totalOere, 0);
  const categories = ["Alle", "Favoritter", "Tidligere køb", ...new Set(state.catalog.map((item) => item.category))];
  const shown = state.catalog.filter((item) => {
    const search = `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(query.toLowerCase());
    const tab = filter === "Alle" || filter === item.category || (filter === "Favoritter" && item.favorite) || (filter === "Tidligere køb" && item.boughtBefore);
    return search && tab;
  });
  const quantity = (id) => Number(draft?.items?.[id] || 0);
  const setQuantity = (id, value) => setDraft((current) => ({ ...current, items: { ...current.items, [id]: value } }));
  const setSubmissionQuantity = (id, value, maximum) => setDraft((current) => ({ ...current, submitQuantities: { ...(current.submitQuantities || {}), [id]: Math.min(maximum, Math.max(0, Number(value) || 0)) } }));
  const saveHistory = (items) => { setHistory(items); localStorage.setItem(historyKey, JSON.stringify(items)); };
  const saveReceipt = (receipt) => { setLastReceipt(receipt); localStorage.setItem(receiptKey, JSON.stringify(receipt)); };
  const addScanned = () => {
    if (!scanned?.item || !validateOrderUnit(scanned.item, scanQuantity).ok) return;
    const current = quantity(scanned.item.id);
    setQuantity(scanned.item.id, current + scanQuantity);
    navigate("/indkoeb/mobil/scan", { state: { added: `${scanQuantity} × ${scanned.item.name}` } });
  };

  const submit = async () => {
    if (!canWrite || submitting || submittingRef.current || !submitLines.length || !online) return;
    submittingRef.current = true; setSubmitting(true); setMessage("");
    if (demo) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const groups = new Map();
      submitLines.forEach((item) => {
        const key = item.supplierId || "mangler-leverandoer";
        groups.set(key, [...(groups.get(key) || []), item]);
      });
      const stamp = Date.now(); const createdAt = new Date(stamp).toISOString();
      const year = new Date(stamp).getFullYear();
      const reference = `IND-${year}-${String(stamp).slice(-6)}`;
      const outcomeStatus = total > 500000 ? "pending-approval" : "approved";
      const references = [...groups.entries()].map(([supplierId, lines], index) => ({
        id: `mobile-${stamp}-${index}`, reference,
        poNumber: outcomeStatus === "approved" ? `PO-${year}-${String(stamp).slice(-6)}-${index + 1}` : null,
        supplierId, status: outcomeStatus, createdAt,
        lines: lines.map((item) => ({ id: item.id, sourceLineId: item.id, name: item.name, quantity: item.submitQuantity, requestedQuantity: item.quantity, unit: item.orderUnit || item.unit, unitPriceOere: orderUnitSummary(item, 1).orderPriceOere, baseUnit: item.baseUnit || item.unit, unitsPerOrder: item.unitsPerOrder || 1, categorySnapshot: item.category || "Ukategoriseret" })),
      }));
      setState((current) => ({ ...current, orders: [...references.filter((item) => item.poNumber), ...current.orders] }));
      saveHistory([...references, ...history]);
      saveReceipt({
        reference, status: outcomeStatus, createdAt,
        submittedLineCount: submitLines.length,
        remainingLineCount: selected.filter((item) => submissionQuantity(item) < item.quantity).length,
        supplierOrders: references.map((item) => ({ poNumber: item.poNumber, supplierId: item.supplierId, lineCount: item.lines.length, status: item.status })),
      });
      setDraft((current) => ({ ...current,
        items: Object.fromEntries(Object.entries(current.items).map(([id, value]) => [id, Math.max(0, value - Number(current.submitQuantities?.[id] ?? 0))]).filter(([, value]) => value > 0)),
        custom: current.custom.map((row) => ({ ...row, quantity: Math.max(0, row.quantity - Number(current.submitQuantities?.[row.id] ?? 0)) })).filter((row) => row.quantity > 0), submitQuantities: {}, updatedAt: Date.now(),
      }));
      navigate("/indkoeb/mobil/mine?kvittering=1", { replace: true }); submittingRef.current = false; setSubmitting(false); return;
    }
    const result = await submitMobileDraftPart({ selections: submitLines.map((item) => ({ id: item.id, quantity: item.submitQuantity })), expectedRevision: serverRevisionRef.current, requestId: draft.submissionId });
    if (!result.ok) { setMessage(result.message); submittingRef.current = false; setSubmitting(false); return; }
    const reference = { id: result.data.approvalId, reference: result.data.reference, status: result.data.status || "pending-approval", createdAt: new Date().toISOString(), lines: submitLines,
      submittedLineCount: submitLines.length, remainingLineCount: Math.max(0, lineCount - submitLines.filter((item) => item.submitQuantity >= item.quantity).length) };
    saveHistory([reference, ...history]);
    saveReceipt({ reference: reference.reference, status: reference.status, createdAt: reference.createdAt,
      submittedLineCount: reference.submittedLineCount, remainingLineCount: reference.remainingLineCount,
      supplierOrders: (result.data.orders || []).map((item) => ({ poNumber: item.poNumber || item.nummer, supplierId: item.supplierId || item.leverandoerId, lineCount: item.lineCount || Object.keys(item.linjer || {}).length, status: item.status })) });
    const returnedDraft = result.data.draft || {};
    serverRevisionRef.current = Number(returnedDraft.revision || serverRevisionRef.current);
    lastServerDraftRef.current = returnedDraft; lastServerSignatureRef.current = draftSignature(returnedDraft);
    setDraft(clientDraft({ ...returnedDraft, submissionId: newSubmissionId(), submitQuantities: {} }));
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
        <ProductGlyph type={item.visual} /><div className="procure-mobile-product-copy"><small>{item.category} · {item.sku}</small><h2>{item.name}</h2><p><b>{orderUnitSummary(item, 1).label}</b> · {kr(orderUnitSummary(item, 1).orderPriceOere)} pr. {unitLabel(item.orderUnit || item.unit, 1)}</p>{quantity(item.id) > 0 && <small>{orderUnitSummary(item, quantity(item.id)).label}</small>}</div>
        <Quantity label={item.orderUnit || item.unit || item.name} value={quantity(item.id)} step={item.orderStep || 1} minimum={item.minimumOrderQuantity || 1} onChange={(value) => setQuantity(item.id, value)} />
      </article>)}</div>
      {!shown.length && <div className="procure-mobile-empty"><b>Ingen varer matcher</b><span>Prøv en anden søgning, eller beskriv varen nedenfor.</span></div>}
      <button ref={customButtonRef} className="procure-mobile-missing" onClick={() => setCustomOpen(true)}>＋ Beskriv en vare, der mangler</button>
    </>}

    {mode === "scan" && !scanId && <QrScanner onResult={(id) => navigate(`/indkoeb/mobil/scan/${encodeURIComponent(id)}`)} canManage={canWrite} added={location.state?.added} />}
    {mode === "scan" && scanId && <div className="procure-mobile-scan-result">
      {scanState === "loading" && <div className="procure-mobile-empty"><b>Henter varen …</b><span>Aktuelle oplysninger læses sikkert.</span></div>}
      {scanState === "ready" && scanned && <article className="procure-qr-product">
        <ProductGlyph type={scanned.item.visual} />
        <div className="procure-mobile-product-copy"><small>{scanned.item.sku} · {scanned.label.location}</small><h2>{scanned.item.name}</h2><p>Bestillingsenhed: <b>{orderUnitSummary(scanned.item, 1).label}</b></p><p>{kr(orderUnitSummary(scanned.item, 1).orderPriceOere)} pr. {unitLabel(scanned.item.orderUnit || scanned.item.unit, 1)}</p></div>
        <div className="procure-qr-existing">Allerede i kurven til {draft.deliveryLocation}: <b>{formatUnitQuantity(quantity(scanned.item.id), scanned.item.orderUnit || scanned.item.unit)}</b></div>
        <label className="procure-qr-add-label">Tilføj antal<Quantity label={scanned.item.orderUnit || scanned.item.unit} value={scanQuantity} step={scanned.item.orderStep || 1} minimum={scanned.item.minimumOrderQuantity || 1} onChange={setScanQuantity} /></label>
        <p className="procure-qr-existing">Der tilføjes: <b>{orderUnitSummary(scanned.item, scanQuantity).label}</b></p>
        <button type="button" className="procure-mobile-submit" disabled={scanQuantity <= 0} onClick={addScanned}>Tilføj og scan næste</button>
        <p className="procure-mobile-submit-note">Dette lægger kun varen i din gemte kurv. Indsendelse sker senere fra kurven.</p>
      </article>}
      {["not-found", "inactive", "denied", "error"].includes(scanState) && <div className="procure-mobile-empty"><b>{scanState === "inactive" ? "Mærkatet er deaktiveret" : scanState === "denied" ? "Ingen adgang" : "QR-koden kan ikke bruges"}</b><span>{message || (scanState === "inactive" ? "Mærkatet eller varen er deaktiveret. Brug varesøgning eller kontakt en indkøbsansvarlig." : "Mærkatet er ukendt eller tilhører en anden kunde.")}</span><Link to="/indkoeb/mobil/scan">Scan en anden kode</Link><Link to="/indkoeb/mobil">Søg efter varen</Link></div>}
    </div>}

    {mode === "cart" && <div className="procure-mobile-cart">
      {!lineCount ? <div className="procure-mobile-empty"><b>Kurven er tom</b><span>Tilføj varer, mens du går hylderne igennem.</span><Link to="/indkoeb/mobil">Find varer</Link></div> : <>
        <div className="procure-mobile-section-head"><span>{lineCount} varelinjer</span><b>{kr(total)} ekskl. moms</b></div>
        {selected.map((item) => { const sendNow = submissionQuantity(item); const chosen = sendNow > 0; const unit = item.orderUnit || item.unit || "enhed"; return <article className="procure-mobile-cartline" key={item.id}><div><small>{state.suppliers.find((supplier) => supplier.id === item.supplierId)?.name || "Leverandør afklares"}</small><h2>{item.name}</h2><p><b>På listen</b> {formatUnitQuantity(item.quantity, unit)}</p></div><Quantity label={unit} value={item.quantity} step={item.orderStep || 1} minimum={item.minimumOrderQuantity || 1} onChange={(value) => item.custom ? setDraft((current) => ({ ...current, custom: current.custom.map((row) => row.id === item.id ? { ...row, quantity: value } : row).filter((row) => row.quantity > 0) })) : setQuantity(item.id, value)} /><div className={`procure-mobile-send-part ${chosen ? "selected" : ""}`}><label className="procure-mobile-send-toggle"><input type="checkbox" checked={chosen} onChange={(event) => setSubmissionQuantity(item.id, event.target.checked ? item.quantity : 0, item.quantity)} /><span>Send denne linje videre</span></label>{chosen && <><span>Send nu</span><Quantity label={`send ${unit}`} value={sendNow} step={item.orderStep || 1} minimum={item.minimumOrderQuantity || 1} onChange={(value) => setSubmissionQuantity(item.id, value, item.quantity)} /></>}<small><b>Bliver på listen</b> {formatUnitQuantity(item.quantity - sendNow, unit)}</small></div></article>; })}
        <article className="procure-mobile-delivery"><h2>Levering</h2><label>Afdeling<select value={draft.departmentId || ""} disabled={!activeDepartments.length} onChange={(event) => { const row = activeDepartments.find((item) => item.id === event.target.value); setDraft({ ...draft, departmentId: row?.id || "", department: row?.label || "" }); }}>{!activeDepartments.length && <option value="">Ingen aktive afdelinger · kontakt administrator</option>}{activeDepartments.map((row) => <option value={row.id} key={row.id}>{row.label}</option>)}</select></label><label>Leveringssted<select value={draft.deliveryLocationId || ""} disabled={!activeDeliveryLocations.length} onChange={(event) => { const row = activeDeliveryLocations.find((item) => item.id === event.target.value); setDraft({ ...draft, deliveryLocationId: row?.id || "", deliveryLocation: row?.label || "" }); }}>{!activeDeliveryLocations.length && <option value="">Ingen aktive leveringssteder · kontakt administrator</option>}{activeDeliveryLocations.map((row) => <option value={row.id} key={row.id}>{row.label}</option>)}</select></label><fieldset className="procure-mobile-delivery-choice"><legend>Ønsket levering</legend><label><input type="radio" name="delivery-time" checked={Boolean(draft.asSoonAsPossible)} onChange={() => setDraft({ ...draft, asSoonAsPossible: true })} /> Hurtigst muligt</label><label><input type="radio" name="delivery-time" checked={!draft.asSoonAsPossible} onChange={() => setDraft({ ...draft, asSoonAsPossible: false })} /> På en bestemt dato</label>{!draft.asSoonAsPossible && <input aria-label="Ønsket leveringsdato" type="date" value={draft.wantedDate || ""} onChange={(event) => setDraft({ ...draft, wantedDate: event.target.value })} />}</fieldset></article>
        <div className="procure-mobile-review"><h2>Kompakt overblik</h2><p><span>Sendes nu</span><b>{submitLines.length} af {lineCount} varelinjer · {kr(submissionTotal)}</b></p><p><span>Bliver på listen</span><b>{selected.filter((item) => submissionQuantity(item) < item.quantity).length} varelinjer</b></p><p><span>Leverandører</span><b>{new Set(submitLines.map((item) => item.supplierId).filter(Boolean)).size || "Afklares"}</b></p><p><span>Levering</span><b>{draft.deliveryLocation} · {draft.asSoonAsPossible ? "Hurtigst muligt" : draft.wantedDate || "Dato mangler"}</b></p><small>Godkendelsesgrundlaget beregnes af hele listen før deling. Kun aktivt godkendte mængder kan danne leverandørordrer.</small></div>
        <button className="procure-mobile-submit" disabled={!canWrite || submitting || !online || !submitLines.length || !draft.departmentId || !draft.deliveryLocationId || (!draft.asSoonAsPossible && !draft.wantedDate)} onClick={submit}>{submitting ? "Indsender sikkert …" : canApprove ? "Send valgte til godkendelse" : "Indsend valgte behov"}</button>
        <p className="procure-mobile-submit-note">Mail og PDF dannes efter godkendelse. Leverandøren modtager intet, før en bruger aktivt vælger Send bestilling.</p>
      </>}
    </div>}

    {mode === "mine" && <div className="procure-mobile-mine">
      {new URLSearchParams(location.search).get("kvittering") === "1" && (lastReceipt || history[0]) && (() => { const receipt = lastReceipt || history[0]; const supplierOrders = receipt.supplierOrders || []; return <article className="procure-mobile-receipt"><span>✓</span><div><small>Kvittering</small><h2>{receiptHeading(receipt.status)}</h2><p>Reference <b>{receipt.reference}</b></p><b>{receipt.submittedLineCount ?? receipt.lines?.length ?? 0} linjer sendt · {receipt.remainingLineCount ?? 0} linjer bliver på listen</b>{supplierOrders.length > 0 && <div className="procure-mobile-receipt-orders"><small>{supplierOrders.length} leverandørordrer fra denne indsendelse</small>{supplierOrders.map((item, index) => <span key={`${item.supplierId}-${index}`}><b>{item.poNumber || "PO dannes efter godkendelse"}</b> · {state.suppliers.find((supplier) => supplier.id === item.supplierId)?.name || "Leverandør afklares"} · {item.lineCount} varelinjer</span>)}</div>}<p>Faktisk status: {statusLabel(receipt.status)}. Leverandøren har endnu ikke modtaget bestillingen; afsendelse kræver en særskilt aktiv handling.</p></div></article>; })()}
      <h2 className="procure-mobile-list-title">Seneste indkøb</h2>
      {[...history, ...state.orders.filter((order) => !history.some((item) => item.id === order.id))].slice(0, 12).map((order) => { const supplierNames = [...new Set((order.lines || []).map((line) => state.suppliers.find((supplier) => supplier.id === (line.supplierId || order.supplierId))?.name).filter(Boolean))]; const supplierLabel = supplierNames.length > 1 ? "Flere leverandører" : supplierNames[0] || (order.supplierId ? state.suppliers.find((supplier) => supplier.id === order.supplierId)?.name : "Leverandør afklares"); return <article className="procure-mobile-purchase" key={order.id}><div><small>{order.poNumber || order.reference || "Behov"}</small><h3>{supplierLabel}</h3><p>{order.lines?.length || 1} varelinjer</p></div><strong>{statusLabel(order.status)}</strong></article>; })}
      {!history.length && !state.orders.length && <div className="procure-mobile-empty"><b>Ingen indkøb endnu</b><span>Dine indsendte behov og bestillinger vises her.</span></div>}
    </div>}

    {["products", "scan"].includes(mode) && lineCount > 0 && <Link className="procure-mobile-cart-cta" to="/indkoeb/mobil/kurv"><span>Se kurv · {lineCount} varelinjer</span><b>{kr(total)} ›</b></Link>}
    <nav className="procure-mobile-nav" aria-label="Mobilbestilling"><Link className={["products", "scan"].includes(mode) ? "active" : ""} to="/indkoeb/mobil"><span>▦</span>Varer</Link><Link className={mode === "cart" ? "active" : ""} to="/indkoeb/mobil/kurv"><span>▣</span>Kurv{lineCount > 0 && <i>{lineCount}</i>}</Link><Link className={mode === "mine" ? "active" : ""} to="/indkoeb/mobil/mine"><span>◎</span>Mine indkøb</Link></nav>

    {customOpen && <div className="procure-mobile-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="mobile-custom-title"><button aria-label="Luk" onClick={() => setCustomOpen(false)}>×</button><h2 id="mobile-custom-title">Vare uden for katalog</h2><p>Beskriv varen kort. Indkøbsteamet afklarer leverandør og pris.</p><label>Varebeskrivelse<textarea autoFocus maxLength="200" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Fx genopfyldning til særlig sæbedispenser" /></label><button className="procure-mobile-submit" disabled={!customName.trim()} onClick={addCustom}>Læg i kurven</button></section></div>}
  </section>;
}
