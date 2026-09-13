import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { sendOrdreMail } from "../godkendelse.js";
import { ordreMailIndhold } from "../procure.js";
import { canSendOrder, orderTotalOere } from "./procure-v2-domain.js";
import { getOrderPdf, getWebshopCredential, registerWebshopOrder } from "./procure-v2-adapter.js";
import { createOrderPdfBytes } from "./procure-pdf.js";

const kr = (oere = 0) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(oere / 100);
const requestId = () => globalThis.crypto?.randomUUID?.() || `procure-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const supplierFor = (state, id) => state.suppliers.find((item) => item.id === id);
const formatDate = (value) => value ? new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "";
const deliveryText = (order) => order?.asSoonAsPossible ? "Hurtigst muligt" : `Senest ${formatDate(order?.wantedDate)}`;
const mailOrder = (order) => ({
  nummer: order?.poNumber, hurtigstMuligt: order?.asSoonAsPossible, oensketDato: order?.wantedDate,
  faktureringsInstruktioner: order?.invoiceInstructions || order?.faktureringsInstruktioner,
  linjer: (order?.lines || []).map((line) => ({ vare: line.name, antal: Number(line.quantity), enhed: line.unit })),
});

export default function SendOrderScreenV2({ state, setState, demo, tenant, canWrite }) {
  const location = useLocation(); const navigate = useNavigate();
  const orderId = location.pathname.split("/").filter(Boolean)[2];
  const order = state.orders.find((item) => item.id === orderId || item.poNumber?.toLowerCase() === orderId?.toLowerCase());
  const supplier = supplierFor(state, order?.supplierId);
  const mailTenant = demo ? { ...(tenant || {}), fakturaModtagelse: tenant?.fakturaModtagelse || "faktura@fjordholm.example" } : (tenant || {});
  const mailProposal = order ? ordreMailIndhold(mailOrder(order), {
    leverandoer: { navn: supplier?.name, ordreEmail: supplier?.orderEmail }, sprog: "da", virksomhed: mailTenant,
  }).brodtekst : "";
  const available = supplier?.orderMethod === "both" ? ["mail", "webshop"] : supplier?.orderMethod === "webshop" ? ["webshop"] : ["mail"];
  const [method, setMethod] = useState(order?.orderMethod === "webshop" ? "webshop" : available[0] || "mail");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(order ? `Bestilling ${order.poNumber} – ${order.title}` : "");
  const [body, setBody] = useState(mailProposal);
  const initializedBodyForOrder = useRef(mailTenant?.fakturaModtagelse || mailTenant?.fakturaEmail || mailTenant?.invoiceEmail ? order?.id : null);
  const [pdfInfo, setPdfInfo] = useState(null); const [message, setMessage] = useState(null); const [busy, setBusy] = useState(false);
  const sendRequest = useRef(requestId()); const webshopRequest = useRef(requestId());
  const [credential, setCredential] = useState(null); const credentialTimer = useRef(null);
  const [webshop, setWebshop] = useState({ externalOrderNumber: "", amountKr: order ? String((orderTotalOere(order) / 100).toFixed(2)).replace(".", ",") : "", paymentMethod: "faktura", confirmationReference: "", paymentDate: new Date().toISOString().slice(0, 10), paymentReference: "", documentId: "" });
  useEffect(() => () => clearTimeout(credentialTimer.current), []);
  useEffect(() => {
    const invoiceEmail = mailTenant?.fakturaModtagelse || mailTenant?.fakturaEmail || mailTenant?.invoiceEmail;
    if (!order?.id || !invoiceEmail || initializedBodyForOrder.current === order.id) return;
    setBody(mailProposal);
    initializedBodyForOrder.current = order.id;
  }, [mailProposal, mailTenant?.fakturaModtagelse, mailTenant?.fakturaEmail, mailTenant?.invoiceEmail, order?.id]);
  useEffect(() => {
    let active = true; let objectUrl = null;
    if (!order) return undefined;
    (async () => {
      try {
        if (demo) {
          const demoOrder = { ...order, oprettetMs: Date.parse("2026-09-11T09:00:00Z"), bestillerNavn: order.contact, bestillerEmail: "indkoeb@fjordholm.example", leveringsadresse: order.deliveryAddress || "Lagervej 8", leveringspostnr: order.deliveryPostalCode || "8000", leveringsby: order.deliveryCity || "Aarhus C" };
          const demoTenant = { ...(tenant || {}), navn: tenant?.navn || "Fjordholm Drift A/S", adresse: tenant?.adresse || "Havnevej 14", postnr: tenant?.postnr || "8000", by: tenant?.by || "Aarhus C", fakturaModtagelse: tenant?.fakturaModtagelse || "faktura@fjordholm.example" };
          const bytes = createOrderPdfBytes(demoOrder, supplier, demoTenant);
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          if (active) setPdfInfo({ url: objectUrl, sha256: [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join(""), revision: order.revision, stoerrelse: bytes.length, demo: true });
        } else {
          const response = await getOrderPdf(order.id); if (active) setPdfInfo(response);
        }
      } catch (error) { if (active) setMessage({ tone: "bad", text: error?.message || "Ordre-PDF'en kunne ikke hentes fra den godkendte revision." }); }
    })();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [order?.id, order?.revision, demo]);
  if (!order) return <section className="procure-v2"><header className="procure-pagehead"><div><button className="procure-back" onClick={() => navigate(-1)}>← Tilbage</button><h1>Gennemse og send bestilling</h1><p>Bestillingen findes ikke.</p></div></header></section>;
  const permission = canSendOrder(order);
  const clearCredential = () => { setCredential(null); clearTimeout(credentialTimer.current); };
  const revealCredential = async () => {
    clearCredential(); setBusy(true); setMessage(null);
    if (demo) setCredential({ username: "syntetisk-bruger", password: "syntetisk-adgang", expiresAtMs: Date.now() + 60_000 });
    else {
      const result = await getWebshopCredential(supplier.id);
      if (!result.ok) setMessage({ tone: "bad", text: result.message }); else setCredential(result.data);
    }
    credentialTimer.current = setTimeout(clearCredential, 60_000); setBusy(false);
  };
  const sendMail = async () => {
    if (busy || !canWrite || !permission.ok || !pdfInfo) return;
    setBusy(true); setMessage(null);
    if (demo) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      setState((current) => ({ ...current, orders: current.orders.map((item) => item.id === order.id ? { ...item, status: "sent", sendStatus: "accepted", supplierConfirmationStatus: "pending", sentAt: new Date().toISOString(), sentMail: { to: supplier.orderEmail, cc, subject, body, sendRequestId: sendRequest.current, revision: order.revision, pdfSha256: pdfInfo.sha256, result: "test-accepted" } } : item) }));
      setMessage({ tone: "ok", text: `Kontrolleret testtransport accepterede mail og PDF ${pdfInfo.sha256.slice(0, 12)}…. Leverandørbekræftelse afventes.` }); setBusy(false); return;
    }
    const result = await sendOrdreMail({ ordreId: order.id, sendRequestId: sendRequest.current, sprog: "da", cc, emne: subject, ledsagetekst: body });
    setMessage({ tone: result.ok ? "ok" : "bad", text: result.ok ? `Mailudbyderen accepterede samme PDF (${result.data?.pdfSha256?.slice(0, 12)}…). Leverandørbekræftelse afventes.` : result.besked }); setBusy(false);
  };
  const register = async () => {
    if (busy || !canWrite || !permission.ok || !webshop.externalOrderNumber.trim()) return;
    const amountOere = Math.round(Number(webshop.amountKr.replace(",", ".")) * 100);
    if (!Number.isInteger(amountOere) || amountOere < 0) { setMessage({ tone: "bad", text: "Angiv det endelige beløb." }); return; }
    setBusy(true); setMessage(null); clearCredential();
    if (demo) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      setState((current) => ({ ...current, orders: current.orders.map((item) => item.id === order.id ? { ...item, status: "sent", sendStatus: "webshop-registered", supplierConfirmationStatus: "pending", orderMethod: "webshop", webshopOrder: { ...webshop, amountOere, requestId: webshopRequest.current, revision: order.revision }, paymentStatus: webshop.paymentMethod === "firmakort" ? "Afventer dokumentation" : "Faktura afventes" } : item) }));
      setMessage({ tone: "ok", text: "Webshopkøbet er registreret i den lokale preview. Åbning af webshoppen alene ændrede ingen status; leverandørbekræftelse afventes." }); setBusy(false); return;
    }
    const result = await registerWebshopOrder({ ordreId: order.id, requestId: webshopRequest.current, eksternOrdrenummer: webshop.externalOrderNumber, beloebOere: amountOere, betalingsmetode: webshop.paymentMethod, bekraeftelsesreference: webshop.confirmationReference, betalingsdato: webshop.paymentDate, betalingsreference: webshop.paymentReference, dokumentId: webshop.documentId });
    setMessage({ tone: result.ok ? "ok" : "bad", text: result.ok ? "Webshopbestillingen er registreret. Leverandørbekræftelse og økonomistatus følges separat." : result.message }); setBusy(false);
  };

  return <section className="procure-v2"><header className="procure-pagehead"><div><button className="procure-back" onClick={() => navigate(-1)}>← Tilbage</button><h1>Gennemse og send bestilling</h1><p>{order.poNumber} · godkendt og klar til brugerens aktive afsendelse</p></div><div className="procure-head-actions">{demo && <span className="procure-demo">Kontrolleret testtransport</span>}</div></header>
    {message && <div className={`procure-toast ${message.tone}`} role={message.tone === "bad" ? "alert" : "status"}><span>{message.text}</span><button onClick={() => setMessage(null)}>×</button></div>}
    <div className="procure-detail-tabs" role="tablist" aria-label="Bestillingsmetode">{available.map((value) => <button type="button" role="tab" aria-selected={method === value} className={method === value ? "active" : ""} key={value} disabled={order.sendStatus !== "draft" && method !== value} onClick={() => setMethod(value)}>{value === "mail" ? "Bestillingsmail" : "Leverandørwebshop"}</button>)}</div>
    <div className="procure-send-grid"><article className="procure-card">
      {method === "mail" ? <><div className="procure-detail-title"><h2>Mail til leverandør</h2><span className="procure-status ok">✓ Indkøb godkendt</span></div>{!supplier?.orderEmail && <div className="procure-alert warn"><b>Mailafsendelse er ikke tilsluttet</b><span>Leverandøren mangler en bestillingsadresse. Bestillingen registreres ikke som sendt.</span></div>}<div className="procure-mail-fields"><label><span>Fra</span><input readOnly value={tenant?.navn || "Kundens konfigurerede afsender"} /></label><label><span>Til</span><input readOnly value={supplier?.orderEmail || "Bestillingsadresse mangler"} /></label><label><span>Cc</span><input value={cc} onChange={(event) => setCc(event.target.value)} /></label><label><span>Emne</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label></div><textarea aria-label="Redigerbar ledsagetekst" className="procure-mail-body" value={body} onChange={(event) => setBody(event.target.value)} /></> : <><div className="procure-detail-title"><h2>Bestil i leverandørens webshop</h2><span className="procure-status warn">Status ændres først ved registrering</span></div><div className="procure-alert info"><b>Åbning bestiller intet</b><span>Gennemfør købet i webshoppen, vend tilbage og registrér leverandørens ordrenummer og slutbeløb.</span></div><div className="procure-webshop-actions"><button className="procure-button secondary" disabled={!supplier?.webshopUrl} onClick={() => window.open(supplier.webshopUrl, "_blank", "noopener,noreferrer")}>Åbn leverandørwebshop ↗</button><button className="procure-button secondary" disabled={busy} onClick={credential ? clearCredential : revealCredential}>{credential ? "Skjul login" : "Vis login i 60 sekunder"}</button></div>{credential && <div className="procure-webshop-secret" role="status"><b>Midlertidig visning · gemmes ikke i browseren</b><label>Brugernavn<input readOnly value={credential.username} /></label><label>Adgangskode<input readOnly type="text" value={credential.password} /></label></div>}<div className="procure-form-grid"><label className="procure-field"><span>Leverandørens ordrenummer</span><input value={webshop.externalOrderNumber} onChange={(event) => setWebshop({ ...webshop, externalOrderNumber: event.target.value })} /></label><label className="procure-field"><span>Endeligt beløb ekskl. moms</span><input inputMode="decimal" value={webshop.amountKr} onChange={(event) => setWebshop({ ...webshop, amountKr: event.target.value })} /></label><label className="procure-field"><span>Betalingsmetode</span><select value={webshop.paymentMethod} onChange={(event) => setWebshop({ ...webshop, paymentMethod: event.target.value })}><option value="faktura">Faktura</option><option value="firmakort">Firmakort</option></select></label><label className="procure-field"><span>Bekræftelsesreference</span><input value={webshop.confirmationReference} onChange={(event) => setWebshop({ ...webshop, confirmationReference: event.target.value })} /></label>{webshop.paymentMethod === "firmakort" && <><label className="procure-field"><span>Betalingsdato</span><input type="date" value={webshop.paymentDate} onChange={(event) => setWebshop({ ...webshop, paymentDate: event.target.value })} /></label><label className="procure-field"><span>Betalingsreference</span><input value={webshop.paymentReference} onChange={(event) => setWebshop({ ...webshop, paymentReference: event.target.value })} /></label><label className="procure-field"><span>Købsdokument-reference</span><input value={webshop.documentId} onChange={(event) => setWebshop({ ...webshop, documentId: event.target.value })} /></label><p className="procure-hint">Der gemmes aldrig kortnummer eller CVV. Status er brugerregistreret, indtil en bankkilde bekræfter den.</p></>}</div></>}
      <button className="procure-pdf-row" disabled={!pdfInfo} onClick={() => pdfInfo && window.open(pdfInfo.url, "_blank", "noopener,noreferrer")}><span>▧</span><b>{order.poNumber}.pdf <small>Godkendt ordre-PDF · samme fil ved forhåndsvisning, afsendelse og arkiv</small></b><span>Forhåndsvis ↗</span></button>
    </article><aside><article className="procure-card"><h2>Bestillingen</h2><dl className="procure-order-summary"><dt>Leverandør</dt><dd>{supplier?.name}</dd><dt>Leveringssted</dt><dd>{order.deliveryLocation}</dd><dt>Ønsket levering</dt><dd>{deliveryText(order)}<small>Mellem 7.00-15.00 · lagerets åbningstider</small></dd><dt>Kundenummer</dt><dd>{supplier?.customerNumber || "Ikke registreret"}</dd></dl><div className="procure-total"><span>Godkendt total · kun internt</span><strong>{kr(orderTotalOere(order))}</strong></div></article>{!permission.ok && <div className="procure-alert warn"><b>Bestillingen kan ikke sendes</b><span>{permission.reason}</span></div>}<div className="procure-send-actions"><button className="procure-button secondary" onClick={() => navigate(-1)}>← Tilbage</button>{method === "mail" ? <button className="procure-button" disabled={!permission.ok || !canWrite || busy || !supplier?.orderEmail || !pdfInfo} onClick={sendMail}>{busy ? "Sender …" : "➤ Send bestilling"}</button> : <button className="procure-button" disabled={!permission.ok || !canWrite || busy || !webshop.externalOrderNumber.trim()} onClick={register}>{busy ? "Registrerer …" : "Registrér webshopbestilling"}</button>}</div><div className="procure-alert info"><b>Tre separate statusser</b><span>Bestilling: {order.status}. Leverandørbekræftelse: {order.supplierConfirmationStatus || "afventer"}. Betaling/økonomi: {order.paymentStatus || "ikke registreret"}.</span></div></aside></div>
  </section>;
}
