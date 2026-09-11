import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getReceiptAttachment, registerReceipt } from "./procure-v2-adapter.js";
import { acceptedQuantityForLine, remainingQuantity } from "./procure-v2-domain.js";

const today = () => new Date().toISOString().slice(0, 10);
const newRequestId = () => globalThis.crypto?.randomUUID?.() || `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;

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
  const [openingAttachment, setOpeningAttachment] = useState("");
  const requestIdRef = useRef(newRequestId());
  const previews = useMemo(() => files.map((file) => ({ file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null })), [files]);
  useEffect(() => () => previews.forEach((preview) => preview.url && URL.revokeObjectURL(preview.url)), [previews]);
  useEffect(() => {
    if (!order) return;
    setRows(Object.fromEntries(order.lines.map((line) => [line.id, { deliveredQuantity: remainingQuantity(order, receipts, line.id), damagedQuantity: 0, rejectedQuantity: 0 }])));
  }, [order?.id]);
  const update = (lineId, key, value) => setRows((current) => ({ ...current, [lineId]: { ...current[lineId], [key]: Math.max(0, Number(value) || 0) } }));
  const accepted = (line) => Math.max(0, Number(rows[line.id]?.deliveredQuantity || 0) - Number(rows[line.id]?.damagedQuantity || 0) - Number(rows[line.id]?.rejectedQuantity || 0));
  const confirm = async () => {
    if (!order || saving) return;
    setSaving(true); setMessage("");
    const input = {
      id: requestIdRef.current, requestId: requestIdRef.current, receivedDate,
      receivedBy: user?.navn || user?.uid || "Aktuel bruger", deliveryNote,
      attachments: files,
      lines: rows,
    };
    const result = await registerReceipt({ order, receipts, input, actorId: user?.uid, demo });
    if (!result.ok) {
      setMessage(result.errors ? Object.values(result.errors).join(" ") : result.message || "Modtagelsen kunne ikke gemmes. Din kladde er bevaret.");
      setSaving(false); return;
    }
    if (demo) setState((current) => ({ ...current, receipts: [...current.receipts, { ...result.receipt, attachments: files.map((file) => ({ name: file.name, status: "aktiv", testOnly: true })) }] }));
    setRegisteredStatus(result.receipt?.ordreStatus || order.status);
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

  return <section className="procure-v2 procure-mobile-order procure-mobile-receiving">
    <header className="procure-mobile-head"><Link to="/indkoeb/modtagelser" className="procure-mobile-close" aria-label="Tilbage">←</Link><div><small>PROCURE · varemodtagelse</small><h1>Modtag varer</h1></div><span className="procure-mobile-save">Servervalideret</span></header>
    {message && <div className="procure-mobile-offline" role="alert">{message}</div>}
    {!order && <div className="procure-mobile-receipt-search"><h2>Find bestilling</h2><p>Søg på PO-nummer, leverandørordre eller scan modtagelses-QR fra ordre-PDF'en.</p><form onSubmit={(event) => { event.preventDefault(); setReference(query.trim()); navigate(`/indkoeb/mobil/modtag/${encodeURIComponent(query.trim())}`, { replace: true }); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Fx PO-2026-0142" autoFocus /><button className="procure-mobile-submit">Find bestilling</button></form>{reference && <div className="procure-mobile-empty"><b>Bestillingen blev ikke fundet</b><span>Kontrollér referencen og din adgang til kundens data.</span></div>}</div>}
    {order && step !== "done" && <>
      <article className="procure-mobile-receipt-order"><small>{order.poNumber}</small><h2>{order.title}</h2><p>{state.suppliers.find((supplier) => supplier.id === order.supplierId)?.name} · {order.deliveryLocation}</p></article>
      {receipts.length > 0 && <article className="procure-mobile-receipt-history"><h2>Tidligere modtagelser</h2><p>Genåbnet fra den servergemte bestilling. Bilag kræver fortsat din aktuelle adgang.</p>{receipts.map((receipt) => { const acceptedTotal = receipt.lines.reduce((sum, line) => sum + Number(line.acceptedQuantity || 0), 0); const damagedTotal = receipt.lines.reduce((sum, line) => sum + Number(line.damagedQuantity || 0), 0); const rejectedTotal = receipt.lines.reduce((sum, line) => sum + Number(line.rejectedQuantity || 0), 0); return <section key={receipt.id}><div><b>{receipt.receivedDate} · {receipt.deliveryNote || "Ingen følgeseddelreference"}</b><small>{acceptedTotal} godkendt · {damagedTotal} beskadiget · {rejectedTotal} afvist</small></div>{receipt.attachments?.length > 0 && <div className="procure-mobile-receipt-files">{receipt.attachments.map((attachment) => <button type="button" key={attachment.id || attachment.name} disabled={openingAttachment === attachment.id} onClick={() => openAttachment(receipt, attachment)}>▧ {openingAttachment === attachment.id ? "Åbner …" : attachment.name}</button>)}</div>}</section>; })}</article>}
      {order.lines.map((line) => <article className="procure-mobile-receipt-line" key={line.id}><div><small>{line.sku || line.categorySnapshot}</small><h2>{line.name}</h2><p>Bestilt {line.quantity} · godkendt modtaget {acceptedQuantityForLine(receipts, line.id)} · rest {remainingQuantity(order, receipts, line.id)} {line.unit}</p></div><div className="procure-mobile-receipt-fields"><label>Leveret<input inputMode="decimal" type="number" min="0" max={remainingQuantity(order, receipts, line.id)} value={rows[line.id]?.deliveredQuantity ?? ""} onChange={(event) => update(line.id, "deliveredQuantity", event.target.value)} /></label><label>Beskadiget<input inputMode="decimal" type="number" min="0" value={rows[line.id]?.damagedQuantity ?? ""} onChange={(event) => update(line.id, "damagedQuantity", event.target.value)} /></label><label>Afvist<input inputMode="decimal" type="number" min="0" value={rows[line.id]?.rejectedQuantity ?? ""} onChange={(event) => update(line.id, "rejectedQuantity", event.target.value)} /></label></div><strong>Godkendt modtagelse: {accepted(line)} {line.unit}</strong></article>)}
      <article className="procure-mobile-receipt-meta"><label>Modtagelsesdato<input type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></label><label>Følgeseddel<input value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder="Nummer eller reference" /></label></article>
      <article className="procure-mobile-attachments"><h2>Følgeseddel og billeder</h2><p>Filer er kun kladder, indtil serveren har kontrolleret dem og modtagelsen er bekræftet.</p><label className="procure-mobile-file">＋ Tilføj billeder eller PDF<input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={addFiles} /></label><div>{previews.map(({ file, url }) => <article key={fileKey(file)}>{url ? <img src={url} alt={`Forhåndsvisning af ${file.name}`} /> : <span>PDF</span>}<div><b>{file.name}</b><small>Kladde · afventer upload og serverkontrol</small></div><button type="button" aria-label={`Fjern ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => fileKey(item) !== fileKey(file)))}>×</button></article>)}</div></article>
      {step === "edit" ? <button className="procure-mobile-submit" disabled={!canWrite} onClick={() => setStep("review")}>Gennemgå modtagelse</button> : <article className="procure-mobile-receipt-review"><h2>Kontrollér før bekræftelse</h2>{order.lines.map((line) => <p key={line.id}><span>{line.name}</span><b>{accepted(line)} {line.unit} godkendes</b></p>)}<p><span>Vedhæftninger</span><b>{files.length}</b></p><button className="procure-mobile-submit" disabled={!canWrite || saving} onClick={confirm}>{saving ? "Uploader og validerer …" : "Bekræft modtagelse"}</button><button className="procure-camera-stop" onClick={() => setStep("edit")}>Tilbage og ret</button></article>}
    </>}
    {order && step === "done" && <article className="procure-mobile-receipt procure-mobile-receipt-done"><span>✓</span><div><small>Kvittering</small><h2>Modtagelsen er registreret</h2><p>{order.poNumber} · {requestIdRef.current}</p><b>Godkendte mængder tæller nu med. Beskadigede og afviste varer gør ikke.</b><p>Lagerstatus: {registeredStatus === "modtaget" ? "Afsluttet" : "Delvist modtaget"} · Økonomisk opfølgning: {order.paymentStatus || "Afventer dokumentation"}</p><Link to={`/indkoeb/bestillinger/${order.id}`}>Åbn bestillingen</Link></div></article>}
  </section>;
}
