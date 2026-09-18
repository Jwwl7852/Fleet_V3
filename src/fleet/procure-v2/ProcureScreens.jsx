import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { meldBehov } from "../behov.js";
import { sendOrdreMail, skiftOrdre } from "../godkendelse.js";
import { gemForbrugsvare } from "../varelager.js";
import {
  acceptedQuantityForLine, approvalRequirement, buildReceipt, canSendOrder,
  budgetForPeriod, decideApprovalLines, orderTotalOere, quantitiesByItem, receiptValueOere,
  remainingQuantity, spendForPeriod,
} from "./procure-v2-domain.js";
import { decideApprovalLineBatch, getOrderPdf, registerReceipt } from "./procure-v2-adapter.js";
import { createOrderPdfBytes } from "./procure-pdf.js";
import { calculatedConsumptionIntervals, materialConsumptionCsv } from "./procure-inventory-domain.js";
import { OperationalOverview, OverviewStatus } from "../OperationalOverview.jsx";

const kr = (oere = 0) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(oere / 100);
const number = (value) => new Intl.NumberFormat("da-DK").format(value || 0);
const supplierFor = (state, id) => state.suppliers.find((item) => item.id === id);
const orderForPath = (state, pathname) => {
  const parts = pathname.split("/").filter(Boolean);
  const id = parts[1] === "bestillinger" || parts[1] === "modtagelser" ? parts[2] : null;
  return state.orders.find((item) => item.id === id || item.poNumber?.toLowerCase() === id?.toLowerCase()) || state.orders[0];
};

function PageState({ busy, error, empty, emptyText = "Der er endnu ingen poster at vise." }) {
  if (busy) return <div className="procure-state" role="status"><span className="procure-spinner" />Indlæser data …</div>;
  if (error) return <div className="procure-state error" role="alert"><b>Data kunne ikke indlæses.</b><span>Kontrollér forbindelsen og prøv igen. Eksempeldata vises ikke ved en adgangs- eller serverfejl.</span></div>;
  if (empty) return <div className="procure-state"><b>Ingen resultater</b><span>{emptyText}</span></div>;
  return null;
}

function PageHead({ title, subtitle, demo, tenant, actions, back }) {
  const navigate = useNavigate();
  return <header className="procure-pagehead">
    <div>{back && <button className="procure-back" type="button" onClick={() => navigate(-1)}>← Tilbage</button>}<h1>{title}</h1><p>{subtitle}</p></div>
    <div className="procure-head-actions">{demo && <span className="procure-demo">Syntetiske testdata · {tenant?.navn || "demo"}</span>}{actions}</div>
  </header>;
}

function Status({ children, tone = "info" }) { return <span className={`procure-status ${tone}`}>{children}</span>; }

const MetricCard = ({ icon, value, label, hint, to, tone = "info" }) => <Link className="procure-kpi" to={to}>
  <span className={`procure-kpi-icon ${tone}`} aria-hidden="true">{icon}</span><span><strong>{value}</strong><b>{label}</b><small>{hint} →</small></span><span className="procure-chevron" aria-hidden="true">›</span>
</Link>;

function Toast({ message, tone = "info", onClose }) {
  if (!message) return null;
  return <div className={`procure-toast ${tone}`} role={tone === "bad" ? "alert" : "status"}><span>{message}</span><button aria-label="Luk besked" onClick={onClose}>×</button></div>;
}

function Modal({ title, subtitle, children, dirty = false, onClose, onSave, footer, wide = false }) {
  const [confirmClose, setConfirmClose] = useState(false);
  const dialogRef = useRef(null);
  const originRef = useRef(document.activeElement);
  const requestClose = () => dirty ? setConfirmClose(true) : onClose();
  useEffect(() => {
    const handler = (event) => { if (event.key === "Escape") { event.preventDefault(); requestClose(); } };
    window.addEventListener("keydown", handler);
    const first = dialogRef.current?.querySelector("input,select,textarea,button");
    first?.focus();
    return () => { window.removeEventListener("keydown", handler); originRef.current?.focus?.(); };
  });
  return <div className="procure-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={dialogRef} className={`procure-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="procure-modal-title">
      <header><div><h2 id="procure-modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="procure-iconbutton" aria-label="Luk" onClick={requestClose}>×</button></header>
      <div className="procure-modal-body">{children}</div>{footer && <footer>{footer}</footer>}
      {confirmClose && <div className="procure-confirm" role="alertdialog" aria-modal="true"><div><h3>Du har ugemte ændringer</h3><p>Gem eller kassér ændringerne, før du lukker.</p><div><button className="procure-button secondary" onClick={() => setConfirmClose(false)}>Fortsæt redigering</button>{onSave && <button className="procure-button" onClick={onSave}>Gem ændringer</button>}<button className="procure-button danger" onClick={onClose}>Kassér ændringer</button></div></div></div>}
    </section>
  </div>;
}

export function OverviewScreen(props) {
  const { state, demo, tenant, busy, error } = props;
  const navigate = useNavigate();
  if (busy) return <section className="procure-v2"><PageState busy /></section>;
  if (error) return <section className="procure-v2"><PageState error={error} /></section>;
  const closed = new Set(["received", "rejected", "cancelled", "modtaget", "afvist", "annulleret"]);
  const openOrders = state.orders.filter((item) => !closed.has(item.status));
  const pendingApprovals = state.approvals.filter((item) => item.status === "pending");
  const start = new Date(); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 7);
  const deliveries = openOrders.filter((item) => item.wantedDate && new Date(`${item.wantedDate}T12:00:00`).getTime() >= start.getTime() && new Date(`${item.wantedDate}T12:00:00`).getTime() < end.getTime()).sort((left, right) => left.wantedDate.localeCompare(right.wantedDate)).slice(0, 5);
  const needs = state.needs.filter((item) => !["ordered", "rejected", "bestilt", "afvist"].includes(item.status));
  const processRows = [
    ...pendingApprovals.map((item) => ({ id: `approval-${item.id}`, reference: item.poNumber || item.orderId || item.id, date: item.createdAt || item.requestedAt || "", supplier: supplierFor(state, item.supplierId)?.name || "—", buyer: item.requestedBy || "—", amount: item.totalOere, status: "Afventer godkendelse", tone: "warn", to: "/indkoeb/godkendelser" })),
    ...needs.map((item) => ({ id: `need-${item.id}`, reference: item.id, date: item.wantedDate || "", supplier: "Ikke valgt", buyer: item.createdBy || "—", amount: null, status: item.status === "draft" ? "Kladde" : "Til behandling", tone: "info", to: `/indkoeb/bestillinger?behov=${encodeURIComponent(item.id)}` })),
  ].sort((left, right) => String(left.date || "9999").localeCompare(String(right.date || "9999"))).slice(0, 5);
  const statusText = (value) => ({ sent: "Under levering", "part-received": "Delvist modtaget", approved: "Klar til bestilling", draft: "Kladde", sendt: "Under levering", godkendt: "Klar til bestilling" }[value] || value || "Ikke angivet");
  return <section className="procure-v2"><OperationalOverview
    module="PROCURE" title="PROCURE – overblik" period="I dag og kommende 7 dage · Europe/Copenhagen" source="PROCURE-repository" testData={demo}
    kpis={[
      { label: "Åbne bestillinger", value: openOrders.length, note: "afsluttede og annullerede er udeladt", icon: "▤", tone: "warn", onClick: () => navigate("/indkoeb/bestillinger") },
      { label: "Afventer godkendelse", value: pendingApprovals.length, note: "serverens godkendelseskø", icon: "◷", tone: "warn", onClick: () => navigate("/indkoeb/godkendelser") },
      { label: "Leverancer denne uge", value: deliveries.length, note: "ønsket levering de næste 7 dage", icon: "▰", onClick: () => navigate("/indkoeb/modtagelser") },
    ]}
    action={{ label: "Ny bestilling", onClick: () => navigate("/indkoeb/bestillinger?ny=1") }}
    tables={[
      { id: "procure-deliveries", title: "Kommende leverancer", note: "Nærmeste ønskede leveringsdato først · højst 5", onAll: () => navigate("/indkoeb/modtagelser"), rows: deliveries, onRow: (row) => navigate(`/indkoeb/bestillinger/${row.id}`), columns: [
        { key: "date", label: "Leveringsdato", render: (row) => row.wantedDate }, { key: "number", label: "Bestillingsnr.", render: (row) => <strong>{row.poNumber || row.id}</strong> }, { key: "supplier", label: "Leverandør", render: (row) => supplierFor(state, row.supplierId)?.name || row.supplierId }, { key: "place", label: "Leveringssted", render: (row) => row.deliveryLocation || "Ikke angivet" }, { key: "lines", label: "Antal linjer", render: (row) => row.lines?.length || 0 }, { key: "status", label: "Status", render: (row) => <OverviewStatus tone="warn">{statusText(row.status)}</OverviewStatus> }, { key: "action", label: "Handling", render: () => <span className="fc-overview-link">Se detaljer →</span> },
      ], empty: "Der er ingen åbne bestillinger med ønsket levering de næste syv dage." },
      { id: "procure-process", title: "Bestillinger til behandling", note: "Afventende godkendelser og åbne behov · højst 5", onAll: () => navigate("/indkoeb/bestillinger"), rows: processRows, onRow: (row) => navigate(row.to), columns: [
        { key: "reference", label: "Bestillingsnr.", render: (row) => <strong>{row.reference}</strong> }, { key: "date", label: "Dato", render: (row) => row.date || "—" }, { key: "supplier", label: "Leverandør" }, { key: "buyer", label: "Bestiller" }, { key: "amount", label: "Beløb ekskl. moms", render: (row) => Number.isFinite(row.amount) ? kr(row.amount) : "Mangler grundlag" }, { key: "status", label: "Status", render: (row) => <OverviewStatus tone={row.tone}>{row.status}</OverviewStatus> }, { key: "owner", label: "Ansvarlig", render: () => tenant?.navn || "Indkøb" }, { key: "action", label: "Handling", render: () => <span className="fc-overview-link">Se bestilling →</span> },
      ], empty: "Der er ingen bestillinger eller behov, som afventer behandling." },
    ]}
  /></section>;
}

function ProductVisual({ type }) { return <span className={`procure-product-visual ${type || "other"}`} aria-hidden="true"><i /></span>; }

const emptyNeed = (state) => { const department = Object.values(state.setup?.afdelinger || {}).find((row) => row.active !== false); const delivery = Object.values(state.setup?.leveringssteder || {}).find((row) => row.active !== false); return { title: "", department: department?.label || "", departmentId: department?.id || "", deliveryLocation: delivery?.label || "", deliveryLocationId: delivery?.id || "", wantedDate: "", note: "", links: [], lines: [{ id: `line-${Date.now()}`, name: "", quantity: 1, unit: "stk.", departmentId: department?.id || "", department: department?.label || "" }] }; };

export function NeedScreen({ state, setState, demo, tenant, canWrite, busy, error, user }) {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState(null);
  const selectedId = params.get("behov") || state.needs[0]?.id;
  const selected = state.needs.find((item) => item.id === selectedId) || state.needs[0];
  const openNew = params.get("ny") === "1";
  useEffect(() => { if (openNew && !draft) setDraft(emptyNeed(state)); }, [openNew, draft, state]);
  const close = () => { setDraft(null); setDirty(false); params.delete("ny"); setParams(params, { replace: true }); };
  const save = async () => {
    if (!draft.title.trim() || draft.lines.some((line) => !line.name.trim() || Number(line.quantity) <= 0 || !line.departmentId) || !draft.wantedDate) { setMessage({ tone: "bad", text: "Udfyld titel, vare, afdeling, antal og ønsket dato." }); return; }
    if (demo) {
      const id = `BEH-${String(112 + state.needs.length).padStart(4, "0")}`;
      setState((current) => ({ ...current, needs: [{ ...draft, id, status: "new", createdBy: user?.navn || "Demo-bruger" }, ...current.needs] }));
      setMessage({ tone: "ok", text: `${id} er oprettet i den lokale preview.` }); close(); return;
    }
    const line = draft.lines[0];
    const result = await meldBehov({ vare: line.name, kilde: line.departmentId || draft.departmentId, antal: Number(line.quantity), enhed: line.unit, note: draft.note });
    if (result.ok) { setMessage({ tone: "ok", text: "Behovet er oprettet." }); close(); }
    else setMessage({ tone: "bad", text: result.besked || "Behovet kunne ikke oprettes." });
  };
  return <section className="procure-v2">
    <PageHead title="Indkøbsbehov" subtitle="Medarbejdernes behov samlet ét sted" demo={demo} tenant={tenant} actions={<button className="procure-button" disabled={!canWrite} onClick={() => { params.set("ny", "1"); setParams(params); }}>＋ Nyt behov</button>} />
    <Toast message={message?.text} tone={message?.tone} onClose={() => setMessage(null)} /><PageState busy={busy} error={error} empty={!state.needs.length} />
    {!busy && !error && state.needs.length > 0 && <div className="procure-split"><article className="procure-card procure-master"><div className="procure-tabs"><button className="active">Nye <span>{state.needs.filter((item) => item.status === "new").length}</span></button><button>Under behandling</button><button>Bestilt</button></div><div className="procure-filterbar"><select value={params.get("afdeling") || ""} onChange={(e) => { e.target.value ? params.set("afdeling", e.target.value) : params.delete("afdeling"); setParams(params); }}><option value="">Alle afdelinger</option>{Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select><label className="procure-search"><span>⌕</span><input value={params.get("soeg") || ""} onChange={(e) => { e.target.value ? params.set("soeg", e.target.value) : params.delete("soeg"); setParams(params); }} placeholder="Søg i behov …" /></label></div><div className="procure-list">{state.needs.filter((item) => !params.get("afdeling") || item.departmentId === params.get("afdeling") || item.lines?.some((line) => line.departmentId === params.get("afdeling"))).filter((item) => !params.get("soeg") || `${item.id} ${item.title}`.toLowerCase().includes(params.get("soeg").toLowerCase())).map((item) => <button className={item.id === selected?.id ? "selected" : ""} key={item.id} onClick={() => { params.set("behov", item.id); setParams(params); }}><span><b>{item.id}</b><small>{item.title}</small></span><span>{item.department}</span><span>{item.wantedDate || "Dato mangler"}</span><Status>Nyt</Status><i>›</i></button>)}</div><p className="procure-mobile-hint">▯ Kan også oprettes fra mobil</p></article>
      <NeedDetail need={selected} canWrite={canWrite} onEdit={() => { setDraft(structuredClone(selected)); setDirty(false); }} onTreat={() => setMessage({ tone: "info", text: "Behovet er klar til leverandørvalg i Varekataloget." })} /></div>}
    {draft && <Modal title={draft.id ? `Redigér ${draft.id}` : "Nyt indkøbsbehov"} subtitle="Opret varer eller fritekst. Felterne virker også på en smal skærm." dirty={dirty} onClose={close} onSave={save} wide footer={<><button className="procure-button secondary" onClick={close}>Annullér</button><button className="procure-button" onClick={save}>Gem behov</button></>}><NeedForm draft={draft} state={state} setDraft={(next) => { setDraft(next); setDirty(true); }} /></Modal>}
  </section>;
}

function NeedDetail({ need, canWrite, onEdit, onTreat }) {
  if (!need) return null;
  return <article className="procure-card procure-detail"><div className="procure-detail-title"><h2>{need.id} · {need.title}</h2><Status>Nyt</Status></div><div className="procure-facts"><span><small>Oprettet af</small><b>{need.createdBy}</b></span><span><small>Standardafdeling</small><b>{need.department}</b></span><span><small>Leveringssted</small><b>{need.deliveryLocation}</b></span><span><small>Ønsket levering</small><b>{need.wantedDate || "Ikke angivet"}</b></span></div><h3>Varer</h3><div className="procure-table-wrap"><table><thead><tr><th>Vare</th><th>Afdeling</th><th>Antal</th><th>Enhed</th></tr></thead><tbody>{need.lines.map((line) => <tr key={line.id}><td>{line.name}</td><td>{line.department || need.department || "Ikke angivet"}</td><td>{line.quantity}</td><td>{line.unit}</td></tr>)}</tbody></table></div><p className="procure-linkline">＋ Tilføj vare eller fritekst</p><div className="procure-associated"><b>Tilknyttet kontekst (valgfrit)</b>{need.links.length ? need.links.map((link) => <Status key={link}>{link}</Status>) : <span>Ingen enhed, ejendom eller opgave tilknyttet.</span>}</div><label className="procure-field"><span>Bemærkning</span><textarea value={need.note} readOnly /></label><div className="procure-actions"><button className="procure-button secondary" disabled={!canWrite} onClick={onEdit}>Redigér</button><button className="procure-button" disabled={!canWrite} onClick={onTreat}>Behandl behov</button></div></article>;
}

function NeedForm({ draft, state, setDraft }) {
  const departments = Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false);
  const deliveryLocations = Object.values(state.setup?.leveringssteder || {}).filter((row) => row.active !== false);
  const update = (key, value) => setDraft({ ...draft, [key]: value });
  const updateLine = (id, key, value) => update("lines", draft.lines.map((line) => line.id === id ? { ...line, [key]: value } : line));
  return <div className="procure-form"><div className="procure-form-grid"><label className="procure-field span-2"><span>Titel</span><input value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder="Hvad skal indkøbes?" /></label><label className="procure-field"><span>Standardafdeling for nye linjer</span><select value={draft.departmentId} onChange={(e) => { const row = departments.find((item) => item.id === e.target.value); setDraft({ ...draft, departmentId: row?.id || "", department: row?.label || "" }); }}><option value="">Vælg afdeling</option>{departments.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label><label className="procure-field"><span>Leveringssted</span><select value={draft.deliveryLocationId || ""} onChange={(e) => { const row = deliveryLocations.find((item) => item.id === e.target.value); setDraft({ ...draft, deliveryLocationId: row?.id || "", deliveryLocation: row?.label || "" }); }}><option value="">Vælg leveringssted</option>{deliveryLocations.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label><label className="procure-field"><span>Ønsket dato</span><input type="date" value={draft.wantedDate} onInput={(e) => update("wantedDate", e.currentTarget.value)} /></label></div><fieldset className="procure-lines"><legend>Varer eller fritekst</legend>{draft.lines.map((line) => <div className="procure-line-edit" key={line.id}><label className="procure-field"><span>Vare</span><input value={line.name} onChange={(e) => updateLine(line.id, "name", e.target.value)} /></label><label className="procure-field"><span>Antal</span><input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => updateLine(line.id, "quantity", e.target.value)} /></label><label className="procure-field"><span>Enhed</span><select value={line.unit} onChange={(e) => updateLine(line.id, "unit", e.target.value)}><option>stk.</option><option>ruller</option><option>æsker</option><option>liter</option><option>kasser</option></select></label><label className="procure-field"><span>Afdeling</span><select value={line.departmentId || draft.departmentId || ""} onChange={(e) => { const row = departments.find((item) => item.id === e.target.value); update("lines", draft.lines.map((item) => item.id === line.id ? { ...item, departmentId: row?.id || "", department: row?.label || "" } : item)); }}><option value="">Vælg afdeling</option>{departments.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>{draft.lines.length > 1 && <button className="procure-iconbutton" aria-label="Fjern linje" onClick={() => update("lines", draft.lines.filter((item) => item.id !== line.id))}>×</button>}</div>)}<button className="procure-linkbutton" onClick={() => update("lines", [...draft.lines, { id: `line-${Date.now()}`, name: "", quantity: 1, unit: "stk.", departmentId: draft.departmentId, department: draft.department }])}>＋ Tilføj vare eller fritekst</button></fieldset><div className="procure-checks"><label><input type="checkbox" checked={draft.links.includes("FLEET")} onChange={(e) => update("links", e.target.checked ? [...draft.links, "FLEET"] : draft.links.filter((item) => item !== "FLEET"))} /> FLEET-enhed</label><label><input type="checkbox" checked={draft.links.includes("FACILITY")} onChange={(e) => update("links", e.target.checked ? [...draft.links, "FACILITY"] : draft.links.filter((item) => item !== "FACILITY"))} /> FACILITY-ejendom</label><label><input type="checkbox" /> Opgave</label></div><label className="procure-field"><span>Bemærkning</span><textarea maxLength="500" value={draft.note} onChange={(e) => update("note", e.target.value)} /></label></div>;
}

function CatalogItemEditor({ item, state, demo, canWrite, onSaved, onClose }) {
  const departments = Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false);
  const suppliers = state.suppliers.filter((row) => row.active !== false || row.id === item?.supplierId);
  const [draft, setDraft] = useState(() => ({
    id: item?.id || "", name: item?.name || "", sku: item?.sku || "", unit: item?.unit || "stk.",
    orderUnit: item?.orderUnit || item?.unit || "stk.", baseUnit: item?.baseUnit || item?.unit || "stk.",
    unitsPerOrder: Number(item?.unitsPerOrder || 1), category: item?.category || "",
    supplierId: item?.supplierId || "", defaultDepartmentId: item?.defaultDepartmentId || departments[0]?.id || "",
    stocked: item?.stocked === true, minimumStock: item?.minimumStock ?? "", active: item?.active !== false,
  }));
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const chooseItem = (itemId) => {
    const selected = state.catalog.find((row) => row.id === itemId); if (!selected) return;
    setDraft({ id: selected.id, name: selected.name, sku: selected.sku || "", unit: selected.unit || "stk.",
      orderUnit: selected.orderUnit || selected.unit || "stk.", baseUnit: selected.baseUnit || selected.unit || "stk.",
      unitsPerOrder: Number(selected.unitsPerOrder || 1), category: selected.category || "", supplierId: selected.supplierId || "",
      defaultDepartmentId: selected.defaultDepartmentId || departments[0]?.id || "", stocked: selected.stocked === true,
      minimumStock: selected.minimumStock ?? "", active: selected.active !== false });
  };
  const save = async () => {
    if (saving || !canWrite) return;
    if (!draft.name.trim() || !draft.sku.trim() || !draft.unit.trim()) { setMessage("Udfyld navn, varenummer og enhed."); return; }
    if (draft.stocked && (!Number.isFinite(Number(draft.minimumStock)) || Number(draft.minimumStock) < 0)) { setMessage("Angiv et genbestillingsniveau på nul eller derover."); return; }
    setSaving(true); setMessage("");
    const payload = { id: draft.id || undefined, navn: draft.name.trim(), varenummer: draft.sku.trim(), enhed: draft.unit.trim(),
      leverandoerId: draft.supplierId || undefined, varegruppe: draft.category || undefined,
      standardAfdelingId: draft.defaultDepartmentId || undefined, aktiv: draft.active, lagerfoert: draft.stocked,
      grundenhed: draft.baseUnit.trim(), bestillingsenhed: draft.orderUnit.trim(), antalPrBestillingsenhed: Number(draft.unitsPerOrder),
      minimumBeholdning: draft.stocked ? Number(draft.minimumStock) : null };
    if (demo) { onSaved({ ...item, id: item?.id || `vare-${Date.now()}`, name: payload.navn, sku: payload.varenummer,
      unit: payload.enhed, baseUnit: payload.grundenhed, orderUnit: payload.bestillingsenhed, unitsPerOrder: payload.antalPrBestillingsenhed,
      category: payload.varegruppe || "Ukategoriseret", supplierId: payload.leverandoerId || null,
      defaultDepartmentId: payload.standardAfdelingId, active: payload.aktiv, stocked: payload.lagerfoert,
      minimumStock: payload.minimumBeholdning, inventoryLocations: item?.inventoryLocations || {} }, !item?.stocked && payload.lagerfoert); return; }
    const result = await gemForbrugsvare(payload); setSaving(false);
    if (!result.ok) { setMessage(result.besked); return; }
    onSaved(null, !item?.stocked && payload.lagerfoert);
  };
  return <Modal title={item?.id ? `Vareopsætning · ${draft.name}` : "Opret katalogvare"} subtitle="Stamdata gælder nye linjer; historiske køb og bevægelser ændres ikke." onClose={onClose} wide footer={<><button className="procure-button secondary" onClick={onClose}>Annullér</button><button className="procure-button" disabled={!canWrite || saving} onClick={save}>{saving ? "Gemmer …" : "Gem vare"}</button></>}>
    {item?.id && <label className="procure-field"><span>Vælg katalogvare</span><select value={draft.id} onChange={(event) => chooseItem(event.target.value)}>{state.catalog.map((row) => <option value={row.id} key={row.id}>{row.name} · {row.sku}</option>)}</select></label>}
    <div className="procure-form"><div className="procure-form-grid"><label className="procure-field"><span>Navn</span><input value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label className="procure-field"><span>Varenummer</span><input value={draft.sku} onChange={(event) => update("sku", event.target.value)} /></label><label className="procure-field"><span>Varekategori</span><input list="procure-categories" value={draft.category} onChange={(event) => update("category", event.target.value)} /><datalist id="procure-categories">{Object.values(state.setup?.varekategorier || {}).filter((row) => row.active !== false).map((row) => <option key={row.id} value={row.label} />)}</datalist></label><label className="procure-field"><span>Leverandør</span><select value={draft.supplierId} onChange={(event) => update("supplierId", event.target.value)}><option value="">Ingen fast leverandør</option>{suppliers.map((row) => <option value={row.id} key={row.id}>{row.name}{row.active === false ? " (inaktiv)" : ""}</option>)}</select></label><label className="procure-field"><span>Standardafdeling (valgfri)</span><select value={draft.defaultDepartmentId} onChange={(event) => update("defaultDepartmentId", event.target.value)}><option value="">Ingen standardafdeling</option>{departments.map((row) => <option value={row.id} key={row.id}>{row.label}</option>)}</select></label><label className="procure-field"><span>Bestillingsenhed</span><input value={draft.orderUnit} onChange={(event) => update("orderUnit", event.target.value)} placeholder="fx kasse" /></label><label className="procure-field"><span>Lagerenhed</span><input value={draft.baseUnit} onChange={(event) => update("baseUnit", event.target.value)} placeholder="fx stk." /></label><label className="procure-field"><span>Antal lagerenheder pr. bestillingsenhed</span><input type="number" inputMode="decimal" min="0.001" step="any" value={draft.unitsPerOrder} onChange={(event) => update("unitsPerOrder", event.target.value)} /></label><label className="procure-field"><span>Visningens enhed</span><input value={draft.unit} onChange={(event) => update("unit", event.target.value)} /></label></div>
      <div className="procure-item-stock-choice"><label><input type="checkbox" checked={draft.stocked} onChange={(event) => update("stocked", event.target.checked)} /> <span><b>Før lagerstatus / Vis på Varelager</b><small>Beholdningen er ukendt, indtil en startoptælling registreres.</small></span></label>{draft.stocked && <label className="procure-field"><span>Genbestillingsniveau ({draft.baseUnit || draft.unit})</span><input type="number" inputMode="decimal" min="0" step="any" value={draft.minimumStock} onChange={(event) => update("minimumStock", event.target.value)} /></label>}</div>
      <label className="procure-check"><input type="checkbox" checked={draft.active} onChange={(event) => update("active", event.target.checked)} /> Aktiv i nye indkøb</label>{message && <div className="procure-alert warn" role="alert"><span>{message}</span></div>}
    </div>
  </Modal>;
}

function CatalogItemDetails({ item, state, canWrite, onClose, onEdit }) {
  const supplier = supplierFor(state, item.supplierId);
  const department = Object.values(state.setup?.afdelinger || {}).find((row) => row.id === item.defaultDepartmentId);
  return <Modal
    title={item.name}
    subtitle={`Varenr. ${item.sku}`}
    onClose={onClose}
    footer={<><button className="procure-button secondary" type="button" onClick={onClose}>Luk</button>{canWrite && <button className="procure-button" type="button" onClick={onEdit}>Redigér</button>}</>}
  >
    <dl className="procure-resource-details">
      <dt>Kategori</dt><dd>{item.category || "—"}</dd>
      <dt>Leverandør</dt><dd>{supplier?.name || "Ingen fast leverandør"}</dd>
      <dt>Pakning</dt><dd>{item.packageSize || `${item.unitsPerOrder || 1} ${item.baseUnit || item.unit} pr. ${item.orderUnit || item.unit}`}</dd>
      <dt>Pris ekskl. moms</dt><dd>{kr(item.unitPriceOere)} pr. {item.unit}</dd>
      <dt>Bestillingsenhed</dt><dd>{item.orderUnit || item.unit || "—"}</dd>
      <dt>Lagerenhed</dt><dd>{item.baseUnit || item.unit || "—"}</dd>
      <dt>Standardafdeling</dt><dd>{department?.label || "—"}</dd>
      <dt>Lagerføres</dt><dd>{item.stocked ? "Ja" : "Nej"}</dd>
      <dt>Status</dt><dd><Status tone={item.active === false ? "warn" : "ok"}>● {item.active === false ? "Inaktiv" : "Aktiv"}</Status></dd>
    </dl>
  </Modal>;
}

export function ResourceCatalogScreen({ state, setState, demo, canWrite, busy, error }) {
  const [params, setParams] = useSearchParams();
  const [message, setMessage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const search = params.get("soeg") || "";
  const category = params.get("kategori") || "";
  const supplier = params.get("leverandoer") || "";
  const products = state.catalog
    .filter((item) => !search || `${item.name} ${item.sku} ${supplierFor(state, item.supplierId)?.name || ""}`.toLowerCase().includes(search.toLowerCase()))
    .filter((item) => !category || item.category === category)
    .filter((item) => !supplier || item.supplierId === supplier);
  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };
  const closeEditor = () => setEditing(null);
  const itemSaved = (savedItem, newlyStocked) => {
    if (demo && savedItem) setState((current) => ({
      ...current,
      catalog: current.catalog.some((item) => item.id === savedItem.id)
        ? current.catalog.map((item) => item.id === savedItem.id ? savedItem : item)
        : [...current.catalog, savedItem],
    }));
    closeEditor();
    setMessage({ tone: "ok", text: newlyStocked ? "Varen er gemt som lagerført." : "Varen er gemt i det fælles varekartotek." });
  };
  return <section className="procure-v2 resource-directory-page resource-catalog-directory">
    <PageHead title="Varekatalog" actions={<button className="procure-button" disabled={!canWrite} onClick={() => setEditing({})}>＋ Opret vare</button>} />
    <Toast message={message?.text} tone={message?.tone} onClose={() => setMessage(null)} />
    <PageState busy={busy} error={error} />
    {!busy && !error && <section className="resource-register-panel">
      <div className="procure-catalog-filters">
        <label className="procure-search"><span aria-hidden="true">⌕</span><input aria-label="Søg i varekatalog" value={search} onChange={(event) => setParam("soeg", event.target.value)} placeholder="Søg efter vare, varenummer eller leverandør" /></label>
        <label><select aria-label="Kategori" value={category} onChange={(event) => setParam("kategori", event.target.value)}><option value="">Alle kategorier</option>{[...new Set(state.catalog.map((item) => item.category).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><select aria-label="Leverandør" value={supplier} onChange={(event) => setParam("leverandoer", event.target.value)}><option value="">Alle leverandører</option>{state.suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <button className="procure-button secondary" type="button" onClick={() => setParams({})}>Nulstil</button>
      </div>
      <PageState empty={!products.length} emptyText="Ingen varer matcher de valgte filtre." />
      {products.length ? <>
        <div className="procure-table-wrap procure-catalog-table"><table><thead><tr><th>Vare</th><th>Kategori</th><th>Leverandør</th><th>Pakning</th><th>Pris ekskl. moms</th><th>Status</th><th><span className="sr-only">Handling</span></th></tr></thead><tbody>{products.map((item) => {
          const supplierName = supplierFor(state, item.supplierId)?.name || "—";
          return <tr key={item.id} role="button" tabIndex="0" aria-label={`Åbn ${item.name}`} onClick={() => setViewing(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setViewing(item); } }}>
            <td><span className="procure-catalog-item"><ProductVisual type={item.visual} /><span><b className="procure-catalog-ellipsis" title={item.name}>{item.name}</b><small>Varenr. {item.sku}</small></span></span></td>
            <td>{item.category || "—"}</td><td><span className="procure-catalog-ellipsis" title={supplierName}>{supplierName}</span></td><td>{item.packageSize || "—"}</td><td><b>{kr(item.unitPriceOere)}</b><small>pr. {item.unit}</small></td><td><Status tone={item.active === false ? "warn" : "ok"}>● {item.active === false ? "Inaktiv" : "Aktiv"}</Status></td>
            <td><button className="fc-ressource-aabn" type="button" aria-label={`Åbn ${item.name}`} onClick={(event) => { event.stopPropagation(); setViewing(item); }}>Åbn <span aria-hidden="true">›</span></button></td>
          </tr>;
        })}</tbody></table></div>
        <div className="procure-result-count">Viser {products.length} af {state.catalog.length} varer</div>
      </> : null}
    </section>}
    {viewing && <CatalogItemDetails item={viewing} state={state} canWrite={canWrite} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} />}
    {editing !== null && <CatalogItemEditor item={editing?.id ? editing : null} state={state} demo={demo} canWrite={canWrite} onClose={closeEditor} onSaved={itemSaved} />}
  </section>;
}

export function CatalogScreen({ state, setState, demo, tenant, canWrite, busy, error }) {
  const [params, setParams] = useSearchParams();
  const [cart, setCart] = useState(() => ({ tape: 120, film: 80 }));
  const [message, setMessage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [cartDepartments, setCartDepartments] = useState({});
  const [deliveryLocationId, setDeliveryLocationId] = useState("");
  const departments = Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false);
  const deliveryLocations = Object.values(state.setup?.leveringssteder || {}).filter((row) => row.active !== false);
  useEffect(() => { const add = params.get("tilfoej"); if (add && state.catalog.some((item) => item.id === add)) { setCart((current) => ({ ...current, [add]: (current[add] || 0) + 1 })); params.delete("tilfoej"); setParams(params, { replace: true }); } }, [params, setParams, state.catalog]);
  useEffect(() => { if (params.get("opsaetning") === "1" && editing === null && state.catalog[0]) setEditing(state.catalog[0]); }, [editing, params, state.catalog]);
  useEffect(() => {
    if (!deliveryLocationId && deliveryLocations[0]) setDeliveryLocationId(deliveryLocations[0].id);
    setCartDepartments((current) => Object.fromEntries(state.catalog.map((item) => [item.id, current[item.id] || item.defaultDepartmentId || departments[0]?.id || ""])));
  }, [deliveryLocationId, state.catalog, state.setup]);
  const search = params.get("soeg") || ""; const category = params.get("kategori") || ""; const supplier = params.get("leverandoer") || ""; const tab = params.get("fane") || "alle";
  const products = state.catalog.filter((item) => !search || `${item.name} ${item.sku}`.toLowerCase().includes(search.toLowerCase())).filter((item) => !category || item.category === category).filter((item) => !supplier || item.supplierId === supplier).filter((item) => tab === "favoritter" ? item.favorite : tab === "tidligere" ? item.boughtBefore : true);
  const cartLines = Object.entries(cart).filter(([,quantity]) => quantity > 0).map(([id,quantity]) => { const item = state.catalog.find((row) => row.id === id); const departmentId = cartDepartments[id] || item?.defaultDepartmentId || departments[0]?.id || ""; return { ...item, quantity, departmentId, department: departments.find((row) => row.id === departmentId)?.label || "" }; }).filter((item) => item.id);
  const total = cartLines.reduce((sum,item) => sum + item.quantity * item.unitPriceOere, 0);
  const supplierCount = new Set(cartLines.map((item) => item.supplierId)).size;
  const requiredRules = cartLines.map((line) => approvalRequirement({ departmentId: line.departmentId, lines: [line] }, state.rules)).filter(Boolean);
  const rule = requiredRules[0] || null;
  const submit = () => {
    if (!canWrite) return;
    if (!demo) { setMessage({ tone: "info", text: "Katalogkurven kræver den nye serverkontrakt i dette miljø. Ingen bestilling er oprettet." }); return; }
    const id = `app-${Date.now()}`;
    const departmentLabels = [...new Set(cartLines.map((line) => line.department).filter(Boolean))];
    const deliveryLocation = deliveryLocations.find((row) => row.id === deliveryLocationId);
    setState((current) => ({ ...current, approvals: [{ id, title: "Katalogindkøb", requester: "Dennis Christensen", department: departmentLabels.join(", ") || "Ikke angivet", deliveryLocation: deliveryLocation?.label || "Ikke angivet", reason: "Indkøb fra varekatalog", rule: rule ? `Godkendelse kræves efter de valgte linjers afdeling og beløb` : "Ingen godkendelse påkrævet", status: rule ? "pending" : "approved", history: [{ at: new Date().toLocaleString("da-DK"), actor: "Dennis Christensen", action: "Sendte indkøbet til behandling" }], draftLines: cartLines }, ...current.approvals] }));
    setMessage({ tone: "ok", text: rule ? "Indkøbet er sendt til godkendelse i den lokale preview." : "Indkøbet er klar til bestilling." });
  };
  const setParam = (key,value) => { value ? params.set(key,value) : params.delete(key); setParams(params); };
  const closeEditor = () => { setEditing(null); const next = new URLSearchParams(params); next.delete("opsaetning"); setParams(next, { replace: true }); };
  const itemSaved = (savedItem, newlyStocked) => { if (demo && savedItem) setState((current) => ({ ...current, catalog: current.catalog.some((item) => item.id === savedItem.id) ? current.catalog.map((item) => item.id === savedItem.id ? savedItem : item) : [...current.catalog, savedItem] })); closeEditor(); setMessage({ tone: "ok", text: newlyStocked ? "Varen er gemt som lagerført. Registrér en startoptælling, før beholdningen vises som et tal." : "Vareopsætningen er gemt uden at ændre historiske køb." }); };
  return <section className="procure-v2 resource-directory-page"><PageHead title="Varekatalog" actions={<><button className="procure-button secondary" disabled={!canWrite || !state.catalog.length} onClick={() => setEditing(state.catalog[0])}>Vareopsætning</button><button className="procure-button" disabled={!canWrite} onClick={() => setEditing({})}>＋ Opret vare</button></>} /> <Toast message={message?.text} tone={message?.tone} onClose={() => setMessage(null)} /><PageState busy={busy} error={error} />
    {!busy && !error && <div className="procure-catalog-layout"><div><div className="procure-tabs">{[["alle","Alle varer"],["favoritter","Favoritter"],["tidligere","Tidligere købt"]].map(([key,label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setParam("fane",key)}>{label}</button>)}</div><div className="procure-catalog-filters"><label className="procure-search"><span aria-hidden="true">⌕</span><input aria-label="Søg i varekatalog" value={search} onChange={(e) => setParam("soeg",e.target.value)} placeholder="Søg efter vare, varenummer eller leverandør" /></label><label><select aria-label="Kategori" value={category} onChange={(e) => setParam("kategori",e.target.value)}><option value="">Alle kategorier</option>{[...new Set(state.catalog.map((item) => item.category))].map((item) => <option key={item}>{item}</option>)}</select></label><label><select aria-label="Leverandør" value={supplier} onChange={(e) => setParam("leverandoer",e.target.value)}><option value="">Alle leverandører</option>{state.suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="procure-button secondary" type="button" onClick={() => setParams({})}>Nulstil</button></div><PageState empty={!products.length} emptyText="Ingen varer matcher de valgte filtre." />{products.length ? <><div className="procure-table-wrap procure-catalog-table"><table><thead><tr><th>Vare</th><th>Kategori</th><th>Leverandør</th><th>Pakning</th><th>Pris ekskl. moms</th><th>Status</th><th><span className="sr-only">Handlinger</span></th></tr></thead><tbody>{products.map((item) => { const supplierName = supplierFor(state,item.supplierId)?.name || "—"; return <tr key={item.id} role="button" tabIndex="0" aria-label={`Åbn vareopsætning for ${item.name}`} onClick={() => setEditing(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setEditing(item); } }}><td><span className="procure-catalog-item"><ProductVisual type={item.visual} /><span><b className="procure-catalog-ellipsis" title={item.name}>{item.name}</b><small>Varenr. {item.sku}</small></span></span></td><td>{item.category || "—"}</td><td><span className="procure-catalog-ellipsis" title={supplierName}>{supplierName}</span></td><td>{item.packageSize || "—"}</td><td><b>{kr(item.unitPriceOere)}</b><small>pr. {item.unit}</small></td><td><Status tone="ok">● Aftalepris</Status></td><td><span className="procure-catalog-actions"><button className="procure-favorite" type="button" aria-label={item.favorite ? `Fjern ${item.name} fra favoritter` : `Tilføj ${item.name} til favoritter`} onClick={(event) => { event.stopPropagation(); if (demo) setState((current) => ({ ...current, catalog: current.catalog.map((product) => product.id === item.id ? { ...product, favorite: !product.favorite } : product) })); }}>{item.favorite ? "♥" : "♡"}</button><button className="procure-button small" type="button" disabled={!canWrite} onClick={(event) => { event.stopPropagation(); setCart((current) => ({ ...current, [item.id]: (current[item.id] || 0) + 1 })); }}>＋ Tilføj</button></span></td></tr>; })}</tbody></table></div><div className="procure-result-count">Viser {products.length} af {state.catalog.length} varer</div></> : null}</div><aside className="procure-card procure-cart"><div className="procure-cardhead"><div><h2>Dit indkøb · {supplierCount} leverandør{supplierCount === 1 ? "" : "er"}</h2><small>Afdelinger vælges pr. varelinje</small></div><button className="procure-button secondary small" onClick={() => setMessage({ tone: "info", text: "Fritekstlinjen åbnes fra Nyt indkøbsbehov, så varen kan få leverandør og prisgrundlag før bestilling." })}>＋ Vare uden for katalog</button></div>{cartLines.length ? <>{[...new Set(cartLines.map((item) => item.supplierId))].map((supplierId) => <div className="procure-cart-supplier" key={supplierId}><h3>{supplierFor(state,supplierId)?.name}</h3>{cartLines.filter((item) => item.supplierId === supplierId).map((item) => <div className="procure-cart-line" key={item.id}><ProductVisual type={item.visual} /><span><b>{item.name}</b><small>Varenr. {item.sku}</small></span><input aria-label={`Antal ${item.name}`} type="number" min="1" value={item.quantity} onChange={(e) => setCart((current) => ({ ...current, [item.id]: Number(e.target.value) }))} /><span>{item.unit}</span><select aria-label={`Afdeling for ${item.name}`} value={item.departmentId} onChange={(event) => setCartDepartments((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Vælg afdeling</option>{departments.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select><b>{kr(item.quantity * item.unitPriceOere)}</b><button aria-label={`Fjern ${item.name}`} onClick={() => setCart((current) => ({ ...current, [item.id]: 0 }))}>×</button></div>)}</div>)}<div className="procure-cart-fields"><label>Leveringssted<select value={deliveryLocationId} onChange={(event) => setDeliveryLocationId(event.target.value)}><option value="">Vælg leveringssted</option>{deliveryLocations.map((row) => <option value={row.id} key={row.id}>{row.label}</option>)}</select></label></div>{rule && <div className="procure-alert warn"><b>▲ Kræver godkendelse</b><span>Reglen vurderes pr. varelinjes afdeling og beløb.</span></div>}<div className="procure-total"><span>I alt ekskl. moms</span><strong>{kr(total)}</strong></div><button className="procure-button block" disabled={!canWrite || !deliveryLocationId || cartLines.some((line) => !line.departmentId)} onClick={submit}>➤ {rule ? "Send til godkendelse" : "Opret bestilling"}</button><button className="procure-button secondary block" onClick={() => setMessage({ tone: "ok", text: "Kladden er gemt lokalt i denne browservisning." })}>▣ Gem kladde</button>{supplierCount > 1 && <p className="procure-hint">ⓘ Indkøb hos flere leverandører opdeles i hver sin bestilling og får hvert sit PO-nummer.</p>}</> : <PageState empty emptyText="Tilføj en vare fra kataloget eller opret en fritekstvare." />}</aside></div>}
    {editing !== null && <CatalogItemEditor item={editing?.id ? editing : null} state={state} demo={demo} canWrite={canWrite} onClose={closeEditor} onSaved={itemSaved} />}
  </section>;
}

export function ApprovalsScreen({ state, setState, demo, tenant, canApprove, busy, error }) {
  const [params, setParams] = useSearchParams();
  const [comment, setComment] = useState("");
  const [lineDecisions, setLineDecisions] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const tab = params.get("status") || "pending";
  const approvals = state.approvals.filter((item) => tab === "processed" ? item.status !== "pending" : item.status === "pending");
  const selected = state.approvals.find((item) => item.id === params.get("godkendelse")) || approvals[0] || state.approvals[0];
  const order = state.orders.find((item) => item.id === selected?.orderId) || ((selected?.lines || selected?.draftLines) ? { lines: selected.lines || selected.draftLines, department: selected.department, deliveryLocation: selected.deliveryLocation, wantedDate: selected.wantedDate } : null);
  const approvalLines = order?.lines || [];
  const pendingFor = (line) => Math.max(0, Number(line.requestedQuantity ?? line.quantity ?? 0) - Number(line.approvedQuantity || 0) - Number(line.rejectedQuantity || 0));
  const setLineDecision = (lineId, key, value) => setLineDecisions((current) => ({ ...current, [lineId]: { ...(current[lineId] || {}), [key]: value } }));
  const chosenDecisions = approvalLines.filter((line) => lineDecisions[line.id]?.action).map((line) => ({ line, ...lineDecisions[line.id] }));
  const missingDecisionReason = chosenDecisions.some((row) => ["defer", "return", "reject"].includes(row.action) && !String(row.reason || "").trim());
  const onlyApprovals = chosenDecisions.length > 0 && chosenDecisions.every((row) => row.action === "approve");
  const decide = async (decision) => {
    if (!canApprove) return;
    if (["returned", "rejected"].includes(decision) && !comment.trim()) { setMessage({ tone: "bad", text: "Skriv en kommentar, før indkøbet sendes retur eller afvises." }); return; }
    if (!demo && selected?.orderId) {
      const result = await skiftOrdre({ ordreId: selected.orderId, til: decision === "approved" ? "godkendt" : decision === "returned" ? "tilbageTilRettelse" : "afvist", begrundelse: comment });
      if (!result.ok) { setMessage({ tone: "bad", text: result.besked }); return; }
    }
    if (demo) setState((current) => ({ ...current,
      approvals: current.approvals.map((item) => item.id === selected.id ? { ...item, status: decision, history: [...item.history, { at: new Date().toLocaleString("da-DK"), actor: "Dennis Christensen", action: decision === "approved" ? "Godkendte indkøbet" : decision === "returned" ? `Sendte tilbage til rettelse: ${comment}` : `Afviste: ${comment}` }] } : item),
      orders: current.orders.map((item) => item.id === selected.orderId ? { ...item, approvalStatus: decision === "approved" ? "approved" : decision === "returned" ? "returned" : "rejected", approvedRevision: decision === "approved" ? item.revision : null, status: decision === "approved" ? "approved" : decision === "returned" ? "returned" : "rejected" } : item),
    }));
    setMessage({ tone: "ok", text: decision === "approved" ? "Indkøbet er godkendt. Det er ikke sendt til leverandøren." : decision === "returned" ? "Indkøbet er sendt tilbage til rettelse med din begrundelse." : "Indkøbet er afvist og bevaret i historikken." }); setComment("");
  };
  const decideLines = async () => {
    if (!canApprove || saving || !selected) return;
    const chosen = approvalLines.filter((line) => lineDecisions[line.id]?.action).map((line) => ({ lineId: line.id, action: lineDecisions[line.id].action, quantity: Number(lineDecisions[line.id].quantity ?? pendingFor(line)), reason: lineDecisions[line.id].reason || "" }));
    if (!chosen.length) { setMessage({ tone: "bad", text: "Vælg en afgørelse for mindst én linje." }); return; }
    setSaving(true); setMessage(null);
    if (!demo && !selected.orderId) {
      const result = await decideApprovalLineBatch({ approvalId: selected.id, expectedRevision: selected.revision, decisions: chosen, requestId: globalThis.crypto?.randomUUID?.() || `approval-${Date.now()}` });
      setSaving(false);
      if (!result.ok) { setMessage({ tone: "bad", text: result.message }); return; }
      setMessage({ tone: "ok", text: `${result.data.orders?.length || 0} leverandørordre(r) blev oprettet af de godkendte mængder. Ventende og udskudte mængder blev stående.` });
      setLineDecisions({}); return;
    }
    const result = decideApprovalLines({ ...selected, lines: approvalLines }, Object.fromEntries(chosen.map((row) => [row.lineId, row])), { actorId: "demo-approver", now: Date.now() });
    if (!result.ok) { setSaving(false); setMessage({ tone: "bad", text: Object.values(result.errors)[0] }); return; }
    setState((current) => ({ ...current,
      approvals: current.approvals.map((item) => item.id === selected.id ? { ...item, lines: result.lines, draftLines: result.lines, history: result.history, status: result.status === "pending" || result.status === "partially-approved" ? "pending" : "approved" } : item),
      orders: current.orders.map((item) => item.id === selected.orderId && result.approvedOrderLines.length ? { ...item, lines: result.approvedOrderLines, approvalStatus: "approved", approvedRevision: item.revision, status: "approved", approvalBasisOere: result.approvalBasisOere } : item),
    }));
    setSaving(false); setLineDecisions({}); setMessage({ tone: "ok", text: "Kun de valgte, godkendte mængder er gjort klar til leverandørordre. Resten står fortsat med sin afgørelse." });
  };
  return <section className="procure-v2"><PageHead title="Godkendelser" subtitle="Se behov, beløb og begrundelse før bestilling" demo={demo} tenant={tenant} /><Toast message={message?.text} tone={message?.tone} onClose={() => setMessage(null)} /><PageState busy={busy} error={error} />
    {!busy && !error && <div className="procure-split approvals"><article className="procure-card procure-master"><div className="procure-tabs"><button className={tab === "pending" ? "active" : ""} onClick={() => { params.set("status","pending"); setParams(params); }}>Afventer <span>{state.approvals.filter((item) => item.status === "pending").length}</span></button><button className={tab === "processed" ? "active" : ""} onClick={() => { params.set("status","processed"); setParams(params); }}>Behandlede</button></div><label className="procure-field"><span>Vis</span><select><option>Min afdeling</option><option>Alle jeg må godkende</option></select></label><div className="procure-approval-list">{approvals.map((item) => { const itemOrder = state.orders.find((orderItem) => orderItem.id === item.orderId); return <button key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => { params.set("godkendelse",item.id); setParams(params); }}><span className="procure-approval-icon">□</span><span><b>{item.needId} · {item.title}</b><small>{item.department} · {item.requester}</small><small>{item.submittedAt}</small></span><strong>{kr(itemOrder ? orderTotalOere(itemOrder) : (item.draftLines || []).reduce((sum,line) => sum + line.quantity * line.unitPriceOere,0))}</strong><i>›</i></button>; })}</div><PageState empty={!approvals.length} emptyText={tab === "pending" ? "Der er ingen indkøb, som afventer din godkendelse." : "Ingen behandlede indkøb i den valgte visning."} /></article>
      {selected && <article className="procure-card procure-detail"><div className="procure-detail-title"><div><h2>{selected.title}</h2><Status tone={selected.status === "pending" ? "warn" : selected.status === "approved" ? "ok" : "bad"}>{selected.status === "pending" ? "◷ Afventer din godkendelse" : selected.status === "approved" ? "Godkendt" : "Behandlet"}</Status></div></div>{order && <><div className="procure-facts"><span><small>Leverandør</small><b>{order.supplierId ? supplierFor(state,order.supplierId)?.name : "Flere eller afklares pr. linje"}</b></span><span><small>Afdeling</small><b>{order.department || selected.department}</b></span><span><small>Leveringssted</small><b>{order.deliveryLocation || "Ikke angivet"}</b></span><span><small>Ønsket leveringsdato</small><b>{order.wantedDate || "Hurtigst muligt"}</b></span></div><div className="procure-approval-lines">{approvalLines.map((line) => { const pending = pendingFor(line); const row = lineDecisions[line.id] || {}; return <article key={line.id}><div><small>{line.categorySnapshot || "Ukategoriseret"}</small><h3>{line.name}</h3><p>Anmodet {line.requestedQuantity ?? line.quantity} {line.unit} · allerede godkendt {line.approvedQuantity || 0} · venter {pending}</p><b>{kr(line.unitPriceOere)} pr. {line.unit} · {kr(pending * line.unitPriceOere)}</b></div>{selected.status === "pending" && pending > 0 && <div className="procure-line-decision"><label>Afgørelse<select value={row.action || ""} onChange={(event) => setLineDecision(line.id,"action",event.target.value)}><option value="">Ikke behandlet endnu</option><option value="approve">Godkend mængde</option><option value="defer">Udskyd med begrundelse</option><option value="return">Send tilbage til rettelse</option><option value="reject">Afvis linje</option></select></label>{row.action === "approve" && <label>Godkend antal<input type="number" min="1" max={pending} value={row.quantity ?? pending} onChange={(event) => setLineDecision(line.id,"quantity",event.target.value)} /></label>}{["defer","return","reject"].includes(row.action) && <label>Begrundelse <b aria-hidden="true">*</b><textarea required maxLength="500" value={row.reason || ""} onChange={(event) => setLineDecision(line.id,"reason",event.target.value)} /></label>}</div>}</article>; })}</div></>}<div className="procure-reason"><b>Begrundelse</b><p>{selected.reason}</p></div><div className="procure-alert info"><b>ⓘ Aktiv regel: {selected.rule}</b><span>Reglen vurderes på hele listens grundlag før deling. Kun godkendte mængder danner leverandørordrer; udskudte linjer bestilles aldrig automatisk.</span></div>{selected.status === "pending" && (selected.lines || selected.draftLines) ? <><div className="procure-decision-preview" role="status"><b>{chosenDecisions.length ? `${chosenDecisions.length} linjeafgørelse(r) klar` : "Ingen linjer valgt"}</b><span>{chosenDecisions.map((row) => `${row.action === "approve" ? `Godkend ${Number(row.quantity ?? pendingFor(row.line))}` : row.action === "defer" ? "Udskyd" : row.action === "return" ? "Send retur" : "Afvis"}: ${row.line.name}`).join(" · ") || "Vælg en afgørelse på de linjer, du vil behandle nu. Øvrige linjer forbliver ventende."}</span>{missingDecisionReason && <em>Begrundelse mangler på mindst én afgørelse.</em>}</div><div className="procure-actions"><button className="procure-button" disabled={!canApprove || saving || !chosenDecisions.length || missingDecisionReason} onClick={decideLines}>{saving ? "Gemmer beslutninger …" : onlyApprovals ? "Godkend valgte" : "Gem beslutninger"}</button></div></> : selected.status === "pending" && <><label className="procure-field"><span>Kommentar til bestilleren (kræves ved udskydelse, rettelse eller afvisning)</span><textarea maxLength="500" value={comment} onChange={(event) => setComment(event.target.value)} /></label><div className="procure-actions"><button className="procure-button" disabled={!canApprove} onClick={() => decide("approved")}>✓ Godkend indkøb</button><button className="procure-button secondary" disabled={!canApprove || !comment.trim()} onClick={() => decide("returned")}>↩ Send tilbage til rettelse</button><button className="procure-button danger" disabled={!canApprove || !comment.trim()} onClick={() => decide("rejected")}>× Afvis</button></div></>}<div className="procure-history"><h3>Historik</h3>{(selected.history || []).map((event,index) => <p key={`${event.at}-${index}`}><b>{event.action}</b><span>{event.at} · {event.actor}</span></p>)}</div></article>}</div>}
  </section>;
}

function orderTone(order) { return order.status === "sent" ? "info" : order.approvalStatus === "pending" ? "warn" : order.status === "cancelled" ? "bad" : "ok"; }
function orderStatusLabel(order) { if (order.status === "sent") return order.supplierConfirmationStatus === "confirmed" ? "Bekræftet" : "Sendt – afventer bekræftelse"; if (order.approvalStatus === "pending") return "Afventer godkendelse"; if (order.status === "approved") return "Godkendt – ikke sendt"; return order.status || "Kladde"; }

export function OrdersScreen({ state, demo, tenant, busy, error }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const detailId = location.pathname.split("/")[3];
  const order = state.orders.find((item) => item.id === detailId || item.poNumber?.toLowerCase() === detailId?.toLowerCase());
  if (order) return <OrderDetail state={state} order={order} demo={demo} tenant={tenant} />;
  const status = params.get("status") || ""; const search = params.get("soeg") || "";
  const filtered = state.orders.filter((item) => !status || (status === "afsluttet" ? ["received","cancelled"].includes(item.status) : item.status === status)).filter((item) => !search || `${item.poNumber} ${item.title} ${supplierFor(state,item.supplierId)?.name}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="procure-v2"><PageHead title="Bestillinger" subtitle="Følg ordre, leverancer, fakturaer og historik" demo={demo} tenant={tenant} /><PageState busy={busy} error={error} />{!busy && !error && <article className="procure-card"><div className="procure-filterbar"><label className="procure-search"><span>⌕</span><input value={search} onChange={(event) => { event.target.value ? params.set("soeg",event.target.value) : params.delete("soeg"); setParams(params); }} placeholder="Søg PO, leverandør eller vare …" /></label><select value={status} onChange={(event) => { event.target.value ? params.set("status",event.target.value) : params.delete("status"); setParams(params); }}><option value="">Alle statusser</option><option value="pending-approval">Afventer godkendelse</option><option value="approved">Godkendt</option><option value="sent">Sendt</option><option value="afsluttet">Afsluttet</option></select></div><PageState empty={!filtered.length} emptyText="Ingen bestillinger matcher filtrene." /><div className="procure-table-wrap"><table><thead><tr><th>PO-nummer</th><th>Leverandør</th><th>Indkøb</th><th>Ønsket levering</th><th>Beløb</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><b>{item.poNumber}</b></td><td>{supplierFor(state,item.supplierId)?.name}</td><td>{item.title}</td><td>{item.wantedDate}</td><td>{kr(orderTotalOere(item))}</td><td><Status tone={orderTone(item)}>{orderStatusLabel(item)}</Status></td><td><Link to={`/indkoeb/bestillinger/${item.id}`}>Åbn ›</Link></td></tr>)}</tbody></table></div></article>}</section>;
}

function OrderDetail({ state, order, demo, tenant }) {
  const supplier = supplierFor(state,order.supplierId); const receipts = state.receipts.filter((item) => item.orderId === order.id); const invoice = state.invoices.find((item) => item.orderId === order.id); const receivedAll = order.lines.every((line) => remainingQuantity(order,receipts,line.id) === 0);
  return <section className="procure-v2"><PageHead title={order.poNumber} subtitle={`${supplier?.name || "Ukendt leverandør"} · ${order.title}`} demo={demo} tenant={tenant} back actions={<><Link className="procure-button" to={`/indkoeb/modtagelser/${order.id}`}>◇ Registrér modtagelse</Link><button className="procure-button secondary" onClick={() => downloadOrderPdf(order,supplier)}>▤ Hent ordre-PDF</button></>} /><div className="procure-detail-tabs"><a className="active" href="#bestilling">Bestilling</a><a href="#leverancer">Leverancer</a><a href="#fakturaer">Fakturaer</a><a href="#historik">Historik</a></div><div className="procure-order-grid"><div><article className="procure-card" id="bestilling"><h2>Ordreoplysninger</h2><div className="procure-facts"><span><small>Afdeling</small><b>{order.department}</b></span><span><small>Leveringssted</small><b>{order.deliveryLocation}</b></span><span><small>Forventet levering</small><b>{order.wantedDate}</b></span><span><small>Oprindelse</small><Link to={`/indkoeb/behov?behov=${order.needId}`}>{order.needId || "Fritekst"} ↗</Link></span></div><h3>Ordrelinjer</h3><div className="procure-table-wrap"><table><thead><tr><th>Vare</th><th>Bestilt</th><th>Modtaget</th><th>Rest</th><th>Enhedspris</th><th>Beløb</th></tr></thead><tbody>{order.lines.map((line) => <tr key={line.id}><td><b>{line.name}</b><small>{line.categorySnapshot} · {line.priceBasis || "Prisgrundlag mangler"}</small></td><td>{line.quantity} {line.unit}</td><td>{acceptedQuantityForLine(receipts,line.id)} {line.unit}</td><td>{remainingQuantity(order,receipts,line.id)} {line.unit}</td><td>{kr(line.unitPriceOere)}</td><td>{kr(line.quantity * line.unitPriceOere)}</td></tr>)}</tbody><tfoot><tr><th colSpan="5">I alt ekskl. moms</th><th>{kr(orderTotalOere(order))}</th></tr></tfoot></table></div></article><div className="procure-bottom-grid"><article className="procure-card" id="leverancer"><h2>Leverancer</h2>{receipts.length ? receipts.map((receipt) => <p key={receipt.id}><b>{receipt.receivedDate} · {receipt.deliveryNote}</b><span>{kr(receiptValueOere(order,receipt))} godkendt modtaget · {receipt.receivedBy}</span></p>) : <PageState empty emptyText="Ingen modtagelser er registreret." />}</article><article className="procure-card" id="fakturaer"><h2>Fakturaer</h2>{invoice ? <><p><b>{invoice.invoiceNumber}</b><span>Fakturaen åbnes i det fælles Fakturacenter.</span></p><Link to={`/oekonomi/fakturacenter?sektion=arbejdsbord&kilde=procure&po=${encodeURIComponent(order.poNumber)}&retur=${encodeURIComponent(`/indkoeb/bestillinger/${order.id}`)}`}>Åbn Fakturacenter →</Link></> : <><p>Ingen faktura modtaget</p><Link to={`/oekonomi/fakturacenter?kilde=procure&po=${encodeURIComponent(order.poNumber)}`}>Åbn Fakturacenter →</Link></>}</article><article className="procure-card"><h2>Leverandør</h2><Link to="/indkoeb/leverandoerer">{supplier?.name} ↗</Link><p>{supplier?.address}</p></article></div></div><aside className="procure-card procure-timeline" id="historik"><h2>Ordreforløb</h2><TimelineStep done title="Behov oprettet" meta={order.needId} /><TimelineStep done={order.approvalStatus === "approved"} active={order.approvalStatus === "pending"} title={order.approvalStatus === "approved" ? "Indkøb godkendt" : "Godkendelse afventer"} meta={order.approvalStatus === "approved" ? "Godkendt grundlag" : "Afgørelse mangler"} /><TimelineStep done={order.sendStatus === "accepted"} active={order.status === "approved"} title={order.sendStatus === "accepted" ? "Bestilling sendt" : "Klar til afsendelse"} meta={order.sentAt || "Ikke sendt"} /><TimelineStep done={receivedAll} active={receipts.length > 0 && !receivedAll} title={receivedAll ? "Modtagelse afsluttet" : receipts.length ? "Delvist modtaget" : "Modtagelse afventes"} meta={order.wantedDate} />{order.status === "approved" && <Link className="procure-button block" to={`/indkoeb/bestillinger/${order.id}/send`}>Gennemse og send</Link>}<div className="procure-po-box"><small>Leverandørens fakturareference</small><b>{order.poNumber}</b><span>PO-nummeret skal fremgå af fakturaen.</span></div></aside></div></section>;
}

function TimelineStep({ done, active, title, meta }) { return <div className={`procure-timeline-step ${done ? "done" : active ? "active" : ""}`}><i>{done ? "✓" : active ? "●" : ""}</i><span><b>{title}</b><small>{meta}</small></span></div>; }

export function ReceiptScreen({ state, setState, demo, tenant, canWrite, busy, error, user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const order = orderForPath(state,location.pathname);
  const receipts = state.receipts.filter((item) => item.orderId === order?.id);
  const [draft,setDraft] = useState(() => ({ requestId:globalThis.crypto?.randomUUID?.()||`modtagelse-${Date.now()}`, receivedDate: new Date().toISOString().slice(0,10), receivedBy: user?.navn || "Maja Larsen", deliveryNote: "", note: "", attachments: [], lines: {} }));
  const [damage,setDamage] = useState(false); const [message,setMessage] = useState(null); const [saving,setSaving] = useState(false);
  useEffect(() => { if (order && !Object.keys(draft.lines).length) setDraft((current) => ({ ...current, lines: Object.fromEntries(order.lines.map((line) => [line.id,{ deliveredQuantity: remainingQuantity(order,receipts,line.id), damagedQuantity: 0, rejectedQuantity: 0 }])) })); }, [order,receipts,draft.lines]);
  if (!order) return <section className="procure-v2"><PageHead title="Modtagelser" subtitle="Registrér hele og delvise leverancer" demo={demo} tenant={tenant} /><PageState empty emptyText="Der er ingen åbne bestillinger at modtage." /></section>;
  const updateLine = (id,key,value) => setDraft((current) => ({ ...current, lines: { ...current.lines, [id]: { ...current.lines[id], [key]: value } } }));
  const result = buildReceipt(order,receipts,draft,{ actorId:user?.uid }); const preview = result.ok ? result.receipt : null;
  const save = async () => { setSaving(true); const response = await registerReceipt({ order,receipts,input:draft,actorId:user?.uid,demo }); setSaving(false); if (response.ok) { setState((current) => ({ ...current, receipts:[...current.receipts,response.receipt], orders:current.orders.map((item) => item.id === order.id ? { ...item,status:item.lines.every((line) => remainingQuantity(item,[...receipts,response.receipt],line.id) === 0) ? "received" : "part-received" } : item) })); setMessage({ tone:"ok", text:response.kind === "test-adapter" ? "Modtagelsen er gemt i den lokale preview. Ingen eksterne data er ændret." : "Modtagelsen er gemt." }); } else setMessage({ tone:"bad", text:response.message || Object.values(response.errors || {})[0] || "Modtagelsen kunne ikke gemmes." }); };
  return <section className="procure-v2"><PageHead title="Registrér modtagelse" subtitle={`${order.poNumber} · ${supplierFor(state,order.supplierId)?.name}`} demo={demo} tenant={tenant} back /><Toast message={message?.text} tone={message?.tone} onClose={() => setMessage(null)} /><PageState busy={busy} error={error} />{!busy && !error && <div className="procure-receipt-grid"><div><article className="procure-card"><div className="procure-detail-title"><h2>Modtagede varer</h2><Status tone={order.lines.some((line) => remainingQuantity(order,receipts,line.id)>0) ? "warn" : "ok"}>{order.lines.some((line) => remainingQuantity(order,receipts,line.id)>0) ? "● Delvis levering" : "Fuldt modtaget"}</Status></div><div className="procure-table-wrap"><table><thead><tr><th>Vare</th><th>Bestilt</th><th>Tidligere modtaget</th><th>Modtages nu</th><th>Rest efter</th>{damage && <><th>Beskadiget</th><th>Afvist</th></>}</tr></thead><tbody>{order.lines.map((line) => { const previous=acceptedQuantityForLine(receipts,line.id); const accepted=Math.max(0,Number(draft.lines[line.id]?.deliveredQuantity||0)-Number(draft.lines[line.id]?.damagedQuantity||0)-Number(draft.lines[line.id]?.rejectedQuantity||0)); return <tr key={line.id}><td><b>{line.name}</b><small>{line.unit}</small></td><td>{line.quantity}</td><td>{previous}</td><td><input className="procure-qty" type="number" min="0" max={remainingQuantity(order,receipts,line.id)} value={draft.lines[line.id]?.deliveredQuantity ?? ""} onChange={(event) => updateLine(line.id,"deliveredQuantity",event.target.value)} /></td><td>{Math.max(0,remainingQuantity(order,receipts,line.id)-accepted)} {line.unit}</td>{damage && <><td><input className="procure-qty" type="number" min="0" value={draft.lines[line.id]?.damagedQuantity || 0} onChange={(event) => updateLine(line.id,"damagedQuantity",event.target.value)} /></td><td><input className="procure-qty" type="number" min="0" value={draft.lines[line.id]?.rejectedQuantity || 0} onChange={(event) => updateLine(line.id,"rejectedQuantity",event.target.value)} /></td></>}</tr>; })}</tbody></table></div><button className="procure-linkbutton" onClick={() => setDamage(!damage)}>＋ {damage ? "Skjul skade/afvisning" : "Registrér beskadiget eller afvist vare"}</button><span className="procure-hint">ⓘ Kun godkendte varer tæller som modtaget.</span></article><article className="procure-card"><h2>Modtagelsesoplysninger</h2><div className="procure-form-grid"><label className="procure-field"><span>Modtagelsesdato</span><input type="date" value={draft.receivedDate} onChange={(event) => setDraft({ ...draft,receivedDate:event.target.value })} /></label><label className="procure-field"><span>Modtaget af</span><input value={draft.receivedBy} onChange={(event) => setDraft({ ...draft,receivedBy:event.target.value })} /></label><label className="procure-field"><span>Leveringssted</span><input value={order.deliveryLocation} readOnly /></label><label className="procure-field"><span>Følgeseddel</span><input value={draft.deliveryNote} onChange={(event) => setDraft({ ...draft,deliveryNote:event.target.value })} placeholder="Fx FS-4482" /></label><label className="procure-upload"><span>Vedhæft følgeseddel eller foto</span><input type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={(event) => setDraft({ ...draft,attachments:[...event.target.files] })} /><b>Træk en fil hertil, eller klik for at vælge</b><small>PDF, JPG eller PNG (maks. 25 MB)</small>{draft.attachments.map((file) => <em key={file.name}>{file.name} · {Math.ceil(file.size/1024)} KB</em>)}</label><label className="procure-field"><span>Bemærkninger</span><textarea maxLength="500" value={draft.note} onChange={(event) => setDraft({ ...draft,note:event.target.value })} /></label></div></article></div><aside className="procure-card procure-receipt-summary"><h2>Denne modtagelse</h2>{preview?.lines.map((received) => { const line=order.lines.find((item) => item.id===received.orderLineId); return <p key={received.orderLineId}><span>{line?.name}</span><b>{kr(received.acceptedQuantity*line.unitPriceOere)}</b></p>; })}<div className="procure-total"><span>Modtaget værdi</span><strong>{kr(preview ? receiptValueOere(order,preview) : 0)}</strong></div>{order.lines.some((line) => remainingQuantity(order,receipts,line.id) - (preview?.lines.find((item) => item.orderLineId===line.id)?.acceptedQuantity||0) > 0) && <div className="procure-alert warn"><b>! Restvarer mangler</b><span>Bestillingen forbliver åben.</span></div>}<button className="procure-button block" disabled={!canWrite || saving} onClick={save}>{saving ? "Uploader og gemmer …" : "Gem modtagelse"}</button><button className="procure-button secondary block" onClick={() => navigate(-1)}>Annullér</button><div className="procure-alert info"><b>ⓘ Fakturacenter kan kontrollere fakturaen</b><span>Kun de godkendte modtagelsesantal indgår i matchet. Et fejlet upload registreres ikke som vedhæftning.</span></div></aside></div>}</section>;
}

function orderMatchesAnalysisFilters(order, filters = {}) {
  if (filters.departmentId && order.departmentId !== filters.departmentId && !(order.lines || []).some((line) => line.departmentId === filters.departmentId)) return false;
  if (filters.supplierId && order.supplierId !== filters.supplierId) return false;
  if (filters.deliveryLocation && order.deliveryLocation !== filters.deliveryLocation) return false;
  if (filters.unlinkedOnly && (order.projectId || order.taskId || order.propertyId || order.vehicleId)) return false;
  if (filters.categoryId && !(order.lines || []).some((line) => (line.categorySnapshot || line.category) === filters.categoryId)) return false;
  return true;
}

function spendRows(state, filters = {}) {
  const departments = Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false);
  return departments.map((department) => ({
    id:department.id,
    label:department.label,
    spend:spendForPeriod(state.invoices,{ ...filters, departmentId:department.id }),
    open:state.orders.filter((order) => !["received","cancelled","afsluttet"].includes(order.status)).filter((order) => orderMatchesAnalysisFilters(order, { ...filters, departmentId:department.id })).reduce((sum,order) => sum + orderTotalOere(order),0),
  }));
}

function hasDocumentedSpend(invoices = [], { from, to, departmentId, categoryId, supplierId, itemId } = {}) {
  return invoices.some((invoice) => invoice.approvalStatus === "approved"
    && (!from || invoice.approvedAt >= from) && (!to || invoice.approvedAt < to)
    && (!departmentId || invoice.departmentId === departmentId)
    && (!supplierId || invoice.supplierId === supplierId)
    && (invoice.lines || []).some((line) => (!categoryId || line.categorySnapshot === categoryId) && (!itemId || line.itemId === itemId)));
}

function exportMaterialConsumption(rows, period) {
  const [year, month] = period.split("-").map(Number); const from = `${period}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const blob = new Blob(["\ufeff", materialConsumptionCsv(rows, { from, to })], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url;
  anchor.download = `procure-materialeforbrug-${period}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ConsumptionScreen({ state, demo, tenant, busy, error, canAdmin }) {
  const [params, setParams] = useSearchParams();
  const period = params.get("periode") || "2026-09";
  const from = Date.parse(`${period}-01T00:00:00Z`);
  const toDate = new Date(from); toDate.setUTCMonth(toDate.getUTCMonth() + 1); const to = toDate.getTime();
  const filters = { from, to, departmentId: params.get("afdeling") || undefined, categoryId: params.get("varegruppe") || undefined, supplierId: params.get("leverandoer") || undefined, deliveryLocation: params.get("levering") || undefined, unlinkedOnly: params.get("projekt") === "ikke-tilknyttet" };
  const contextualOrders = state.orders.filter((order) => orderMatchesAnalysisFilters(order, filters));
  const contextualOrderIds = new Set(contextualOrders.map((order) => order.id));
  const filteredInvoices = state.invoices.filter((invoice) => (!filters.departmentId || invoice.departmentId === filters.departmentId) && (!filters.supplierId || invoice.supplierId === filters.supplierId) && (!filters.deliveryLocation && !filters.unlinkedOnly || contextualOrderIds.has(invoice.orderId)));
  const analysisState = { ...state, invoices:filteredInvoices, orders:contextualOrders };
  const rows = spendRows(analysisState, { from, to, categoryId:filters.categoryId }).filter((row) => !filters.departmentId || row.id === filters.departmentId);
  const total = spendForPeriod(filteredInvoices, filters);
  const previousFromDate = new Date(from); previousFromDate.setUTCMonth(previousFromDate.getUTCMonth() - 1);
  const previous = spendForPeriod(filteredInvoices, { ...filters, from: previousFromDate.getTime(), to: from });
  const previousHasData = hasDocumentedSpend(filteredInvoices, { ...filters, from: previousFromDate.getTime(), to: from });
  const openOrders = contextualOrders.filter((order) => !["received", "cancelled", "afsluttet"].includes(order.status));
  const notReceived = openOrders.filter((order) => !state.receipts.some((receipt) => receipt.orderId === order.id)).reduce((sum, order) => sum + orderTotalOere(order), 0);
  const receivedUndocumented = openOrders.filter((order) => state.receipts.some((receipt) => receipt.orderId === order.id) && !state.invoices.some((invoice) => invoice.orderId === order.id && invoice.approvalStatus === "approved")).reduce((sum, order) => sum + orderTotalOere(order), 0);
  const deviations = filteredInvoices.filter((item) => item.approvalStatus === "pending").length;
  const delayed = contextualOrders.filter((order) => order.wantedDate && Date.parse(order.wantedDate) < Date.now() && !["received", "afsluttet", "cancelled"].includes(order.status)).length;
  const missingDocumentation = openOrders.filter((order) => !state.invoices.some((invoice) => invoice.orderId === order.id && invoice.approvalStatus === "approved")).length;
  const budgetOere = budgetForPeriod(state.setup, period, filters.departmentId);
  const departmentOptions = Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false);
  const deliveryOptions = Object.values(state.setup?.leveringssteder || {}).filter((row) => row.active !== false);
  const categories = [...new Set([...state.catalog.map((item) => item.category), ...state.invoices.flatMap((invoice) => invoice.lines?.map((line) => line.categorySnapshot) || [])].filter(Boolean))];
  const setParam = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next); };
  const materialQuery = (params.get("vare") || "").trim().toLowerCase();
  const stockRows = state.catalog.filter((item) => item.stocked).flatMap((item) => {
    if (materialQuery && !`${item.name} ${item.sku}`.toLowerCase().includes(materialQuery)) return [];
    const locations = Object.values(item.inventoryLocations || {});
    const allowed = filters.departmentId ? locations.filter((row) => row.departmentId === filters.departmentId) : locations;
    if (filters.departmentId && !allowed.length) return [];
    const locationKeys = new Set(allowed.map((row) => `${row.warehouseId}|${row.locationId}`));
    const itemMovements = state.inventoryMovements.filter((row) => row.forbrugsvareId === item.id && (!filters.departmentId || locationKeys.has(`${row.lagerId}|${row.placeringId}`)));
    const calculation = calculatedConsumptionIntervals({ id: item.id, navn: item.name, enhed: item.baseUnit || item.unit, grundenhed: item.baseUnit || item.unit }, itemMovements, { fromMs: from, toMs: to - 1 });
    const departmentIds = [...new Set(allowed.map((row) => row.departmentId).filter(Boolean))];
    const measuredStart = calculation.measured.length ? Math.min(...calculation.measured.map((row) => row.startMs)) : null;
    const measuredEnd = calculation.measured.length ? Math.max(...calculation.measured.map((row) => row.endMs)) : null;
    return [{ id: `stock-${item.id}`, itemId: item.id, name: item.name, sku: item.sku, stocked: true,
      department: departmentIds.length === 1 ? state.setup?.afdelinger?.[departmentIds[0]]?.label || departmentIds[0] : "Fælles lager / ikke fordelt",
      departmentId: departmentIds.length === 1 ? departmentIds[0] : null, basis: "Beregnet mellem optællinger",
      quantity: calculation.quantity, unit: item.baseUnit || item.unit, partialCoverage: calculation.partialCoverage,
      negative: calculation.negative, measurementPeriod: measuredStart && measuredEnd ? `${new Date(measuredStart).toLocaleDateString("da-DK")} – ${new Date(measuredEnd).toLocaleDateString("da-DK")}` : "",
      calculation }];
  });
  const purchaseGroups = new Map();
  for (const purchase of state.purchases || []) {
    if (Number(purchase.purchaseDate) < from || Number(purchase.purchaseDate) >= to) continue;
    for (const line of purchase.lines || []) {
      if (line.stocked || (filters.departmentId && line.departmentId !== filters.departmentId)) continue;
      if (materialQuery && !`${line.name} ${line.sku}`.toLowerCase().includes(materialQuery)) continue;
      const key = `${line.itemId}|${line.departmentId}|${line.unit}`;
      const current = purchaseGroups.get(key) || { id: `purchase-${key}`, itemId: line.itemId, name: line.name, sku: line.sku, stocked: false,
        department: line.department || state.setup?.afdelinger?.[line.departmentId]?.label || line.departmentId, departmentId: line.departmentId,
        basis: "Indkøbt mængde", quantity: 0, unit: line.unit, partialCoverage: false, purchases: [] };
      current.quantity += Number(line.quantity || 0); current.purchases.push({ purchase, line }); purchaseGroups.set(key, current);
    }
  }
  const materialRows = [...stockRows, ...purchaseGroups.values()];
  const selectedMaterial = materialRows.find((row) => row.itemId === params.get("materiale")) || null;
  const months = Array.from({ length: 6 }, (_, index) => { const start = new Date(from); start.setUTCMonth(start.getUTCMonth() - (5 - index)); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); const monthFilters = { ...filters, from: start.getTime(), to: end.getTime() }; return { label: start.toLocaleDateString("da-DK", { month: "short" }), value: spendForPeriod(filteredInvoices, monthFilters), hasData: hasDocumentedSpend(filteredInvoices, monthFilters) }; });
  const maxMonth = Math.max(...months.map((item) => item.value), 1);
  return <section className="procure-v2"><PageHead title="Forbrug og indkøbsanalyse" subtitle="Materialemængder og økonomi vises med hvert sit tydelige grundlag." demo={demo} tenant={tenant} actions={<>{canAdmin && <Link className="procure-button secondary" to="/indkoeb/opsaetning">⚙ Opsætning og budget</Link>}</>} />
    <article className="procure-card procure-material-report"><div className="procure-cardhead"><div><h2>Materialeforbrug</h2><p>Lagerførte varer beregnes mellem fysiske optællinger. Øvrige varer vises som bekræftet indkøbt mængde.</p></div><button className="procure-button secondary" onClick={() => exportMaterialConsumption(materialRows, period)}>⇩ Eksportér CSV</button></div><label className="procure-search"><span>⌕</span><input type="search" value={params.get("vare") || ""} onChange={(event) => setParam("vare", event.target.value)} placeholder="Søg vare eller varenummer" /></label><div className="procure-table-wrap"><table><thead><tr><th>Vare</th><th>Afdeling</th><th>Forbrugsgrundlag</th><th>Mængde</th><th>Enhed</th><th>Måleperiode</th><th /></tr></thead><tbody>{materialRows.map((row) => <tr key={row.id} className={row.negative ? "procure-row-warning" : ""}><td><b>{row.name}</b><small>{row.sku}</small></td><td>{row.department}</td><td>{row.basis}{row.partialCoverage && <small>Valgt periode er kun delvist dækket; krydsende intervaller er ikke fordelt kunstigt.</small>}</td><td>{row.quantity === null ? "Mangler grundlag" : number(row.quantity)}</td><td>{row.unit}</td><td>{row.measurementPeriod || (row.stocked ? "Mangler to gyldige optællinger" : period)}</td><td><button className="procure-linkbutton" type="button" onClick={() => setParam("materiale", row.itemId)}>Åbn grundlag</button></td></tr>)}</tbody></table></div>{!materialRows.length && <p className="procure-empty">Ingen materialemængder matcher perioden og filtrene.</p>}{selectedMaterial && <div className="procure-material-detail"><div><h3>{selectedMaterial.name}</h3><button type="button" className="procure-iconbutton" aria-label="Luk grundlag" onClick={() => setParam("materiale", "")}>×</button></div>{selectedMaterial.stocked ? <>{selectedMaterial.calculation.intervals.map((interval) => <p key={interval.key}><b>{new Date(interval.startMs).toLocaleDateString("da-DK")} – {new Date(interval.endMs).toLocaleDateString("da-DK")}</b><span>{number(interval.startQuantity)} + {number(interval.receipts)} modtaget + {number(interval.transfers)} nettoflytning − {number(interval.returns)} retur + {number(interval.otherCorrections)} øvrige korrektioner − {number(interval.endQuantity)} = <b>{number(interval.quantity)} {interval.unit}</b>{interval.negative ? " · kræver kontrol" : ""}</span></p>)}</> : selectedMaterial.purchases.map(({ purchase, line }) => <p key={line.id}><b>{purchase.reference}</b><span>{new Date(purchase.purchaseDate).toLocaleDateString("da-DK")} · {number(line.quantity)} {line.unit} · {line.department}</span></p>)}</div>}</article>
    <div className="procure-filterbar consumption procure-analysis-filters"><select value={period} onChange={(e) => setParam("periode", e.target.value)}><option value="2026-09">September 2026</option><option value="2026-08">August 2026</option></select><select value={params.get("afdeling") || ""} onChange={(e) => setParam("afdeling", e.target.value)}><option value="">Alle afdelinger</option>{departmentOptions.map((row) => <option value={row.id} key={row.id}>{row.label}</option>)}</select><select value={params.get("varegruppe") || ""} onChange={(e) => setParam("varegruppe", e.target.value)}><option value="">Alle varegrupper</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><select value={params.get("leverandoer") || ""} onChange={(e) => setParam("leverandoer", e.target.value)}><option value="">Alle leverandører</option>{state.suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={params.get("levering") || ""} onChange={(e) => setParam("levering", e.target.value)}><option value="">Alle leveringssteder</option>{deliveryOptions.map((row) => <option value={row.id} key={row.id}>{row.label}</option>)}</select><select value={params.get("projekt") || ""} onChange={(e) => setParam("projekt", e.target.value)}><option value="">Alle projekter/opgaver</option><option value="ikke-tilknyttet">Ikke tilknyttet</option></select></div>
    <PageState busy={busy} error={error} />{!busy && !error && <><div className="procure-kpis procure-analysis-kpis"><MetricCard icon="▤" value={kr(total)} label="Dokumenterede indkøb" hint={`Ekskl. moms · godkendelsesdato · ${previousHasData ? `forrige periode ${kr(previous)}` : "forrige periode mangler data"}`} to={`/oekonomi/fakturacenter?kilde=procure&fra=${period}`} /><MetricCard icon="▱" value={kr(notReceived)} label="Ikke modtagne bestillinger" hint="Åben bestillingsværdi" to="/indkoeb/bestillinger?fane=ordered" /><MetricCard icon="▣" value={kr(receivedUndocumented)} label="Modtaget uden dokumentation" hint="Holdes uden for fakturaforbrug" to="/indkoeb/bestillinger?fane=ordered" /><MetricCard icon="!" value={deviations} label="Fakturaafvigelser" hint="Kræver afklaring" to="/oekonomi/fakturacenter?sektion=afvigelser&kilde=procure" tone="bad" /><MetricCard icon="◷" value={delayed} label="Overskredet ønsket dato" hint="Internt ønske · ikke leverandørtilsagn" to="/indkoeb/bestillinger?fane=ordered" tone="warn" /><MetricCard icon="◇" value={missingDocumentation} label="Manglende dokumentation" hint="Faktura eller købsdokument" to="/indkoeb/bestillinger?fane=ordered" tone="warn" /><MetricCard icon="↕" value={budgetOere === null ? "Ikke opsat" : kr(total - budgetOere)} label="Budgetafvigelse" hint={budgetOere === null ? "Opsæt periodebudget for at sammenligne" : `Budget ${kr(budgetOere)}`} to="/indkoeb/opsaetning" tone={budgetOere !== null && total > budgetOere ? "warn" : "neutral"} /></div>
      <div className="procure-two-col procure-analysis-charts"><article className="procure-card"><div className="procure-cardhead"><h2>Dokumenterede indkøb pr. måned</h2><span>{budgetOere === null ? "Budget: Ikke opsat" : `Budget ${kr(budgetOere)}`}</span></div><div className="procure-month-chart" aria-label="Dokumenterede indkøb pr. måned">{months.map((month) => <div key={month.label}><b>{month.hasData ? kr(month.value) : "—"}</b><i className={!month.hasData ? "missing" : month.value === 0 ? "zero" : ""} style={{ height: `${month.hasData && month.value > 0 ? month.value / maxMonth * 100 : 0}%` }} /><span>{month.label}</span></div>)}</div>{budgetOere === null && <p className="procure-hint">Budgetafvigelse vises som Ikke opsat, indtil et periodebudget er konfigureret.</p>}</article><article className="procure-card"><h2>Fordeling på varegruppe</h2><div className="procure-bars">{categories.map((category) => { const value = spendForPeriod(filteredInvoices, { ...filters, categoryId: category }); const hasData = hasDocumentedSpend(filteredInvoices, { ...filters, categoryId: category }); return <Link key={category} to={`/indkoeb/forbrug/varegrupper?varegruppe=${encodeURIComponent(category)}&periode=${period}`}><span>{category}</span><i className={!hasData ? "missing" : value === 0 ? "zero" : ""} style={{ width: `${hasData && total ? value / total * 100 : 0}%` }} /><b>{hasData ? kr(value) : "Mangler data"}</b></Link>; })}</div></article></div>
      <div className="procure-two-col"><article className="procure-card"><h2>Forbrug pr. afdeling</h2><div className="procure-table-wrap"><table><thead><tr><th>Afdeling</th><th>Godkendte fakturaer</th><th>Åbne bestillinger</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link to={`/indkoeb/forbrug?periode=${period}&afdeling=${row.id}`}>{row.label}</Link></td><td>{kr(row.spend)}</td><td>{kr(row.open)}</td></tr>)}</tbody></table></div></article><article className="procure-card"><div className="procure-cardhead"><h2>Hyppigt købte varer</h2><Link to="/ressourcer/varekatalog?fane=tidligere">Se alle varer →</Link></div>{state.catalog.filter((item) => item.boughtBefore).slice(0, 4).map((item) => <div className="procure-frequent" key={item.id}><ProductVisual type={item.visual}/><span><b>{item.name}</b><small>{supplierFor(state,item.supplierId)?.name} · {item.orderUnit || item.unit}</small></span><Status>Aftale</Status><Link className="procure-button secondary small" to={`/ressourcer/varekatalog?tilfoej=${item.id}`}>Køb igen</Link></div>)}</article></div>
      <article className="procure-card"><div className="procure-cardhead"><h2>Leverandører og aftaler</h2><Link to="/indkoeb/leverandoerer">Åbn fælles leverandører ↗</Link></div><div className="procure-table-wrap"><table><thead><tr><th>Leverandør</th><th>Bestillingsmetode</th><th>Aftale</th><th>Handling</th></tr></thead><tbody>{state.suppliers.map((supplier) => <tr key={supplier.id}><td>{supplier.name}</td><td>{supplier.orderMethod === "both" ? "Mail og webshop" : supplier.orderMethod === "webshop" ? "Webshop" : "Mail"}</td><td>{supplier.agreement || <span className="procure-bad-text">Ingen prisaftale</span>}</td><td><Link to="/indkoeb/leverandoerer">Se leverandør</Link></td></tr>)}</tbody></table></div><p className="procure-hint">ⓘ Leverandørernes basisdata er fælles stamdata og deles med FLEET og FACILITY.</p></article></>}</section>;
}

export function GroupConsumptionScreen({ state, demo, tenant, busy, error }) {
  const categories=[...new Set([...state.catalog.map((item)=>item.category),"Ukategoriseret"])]; const quantities=quantitiesByItem(state.orders,state.receipts); const currentFrom=Date.parse("2026-09-01"),currentTo=Date.parse("2026-10-01"); const previousFrom=Date.parse("2026-08-01"),previousTo=Date.parse("2026-09-01"); const rows=categories.map((category)=>{const current=spendForPeriod(state.invoices,{from:currentFrom,to:currentTo,categoryId:category});const previous=spendForPeriod(state.invoices,{from:previousFrom,to:previousTo,categoryId:category});return{category,current,previous,change:previous===0?null:(current-previous)/previous*100};}); const selected=rows.find((row)=>row.current>0)||rows[0]; const total=rows.reduce((sum,row)=>sum+row.current,0); const open=state.orders.filter((order)=>!["received","cancelled"].includes(order.status)).reduce((sum,order)=>sum+orderTotalOere(order),0);
  return <section className="procure-v2"><PageHead title="Forbrug pr. varegruppe" subtitle="Følg indkøb, mængder og sammenlignelige enhedspriser." demo={demo} tenant={tenant} back actions={<button className="procure-button secondary" onClick={()=>exportConsumption(rows.map((row)=>({label:row.category,spend:row.current,open:0})))}>⇩ Eksportér</button>} /><div className="procure-detail-tabs"><Link to="/indkoeb/forbrug">Overblik</Link><span className="active">Varegrupper</span><Link to="/ressourcer/varekatalog">Varer og priser</Link></div><div className="procure-filterbar consumption"><select><option>September 2026</option></select><select><option>Alle afdelinger</option></select><select><option>Alle varegrupper</option></select><select><option>Alle leverandører</option></select></div><PageState busy={busy} error={error} />{!busy&&!error&&<><div className="procure-kpis two"><MetricCard icon="▤" value={kr(total)} label="Dokumenterede indkøb" hint="Ekskl. moms · godkendelsesdato" to="/oekonomi/fakturacenter?kilde=procure"/><MetricCard icon="▱" value={kr(open)} label="Åbne bestillinger" hint="Ekskl. moms · ikke medregnet ovenfor" to="/indkoeb/bestillinger"/></div><div className="procure-two-col group"><article className="procure-card"><h2>Forbrug pr. varegruppe</h2><div className="procure-table-wrap"><table><thead><tr><th>Varegruppe</th><th>August</th><th>September</th><th>Ændring</th></tr></thead><tbody>{rows.map((row)=><tr key={row.category}><td><b>{row.category}</b></td><td>{kr(row.previous)}</td><td>{kr(row.current)}</td><td>{row.change==null?"Ikke sammenlignelig":`${row.change>=0?"+":""}${row.change.toFixed(1).replace(".",",")} %`}</td></tr>)}</tbody><tfoot><tr><th>I alt</th><th>{kr(rows.reduce((s,r)=>s+r.previous,0))}</th><th>{kr(total)}</th><th>—</th></tr></tfoot></table></div></article><article className="procure-card"><h2>{selected?.category} · fordeling på afdeling</h2><div className="procure-bars">{spendRows(state).map((row)=>{const max=Math.max(...spendRows(state).map((item)=>item.spend),1);return <div key={row.id}><span>{row.label}</span><i className={row.spend === 0 ? "zero" : ""} style={{width:`${row.spend > 0 ? row.spend/max*100 : 0}%`}}/><b>{kr(row.spend)}</b></div>;})}</div></article></div><div className="procure-two-col"><article className="procure-card"><h2>Indkøbt antal · pr. vare og enhed</h2><div className="procure-table-wrap"><table><thead><tr><th>Vare</th><th>Bestilt</th><th>Modtaget</th><th>Rest</th><th>Enhed</th></tr></thead><tbody>{quantities.slice(0,5).map((row)=><tr key={`${row.itemId}-${row.unit}`}><td>{row.name}</td><td>{number(row.ordered)}</td><td>{number(row.received)}</td><td>{number(row.remaining)}</td><td>{row.unit}</td></tr>)}</tbody></table></div><p className="procure-hint">ⓘ Uforenelige enheder lægges ikke sammen.</p></article><article className="procure-card"><h2>Prisudvikling og leverandører</h2><p>Pakketape, klar · normaliseret pris pr. rulle</p><div className="procure-table-wrap"><table><thead><tr><th>Leverandør</th><th>August</th><th>September</th><th>Grundlag</th></tr></thead><tbody><tr><td>Nordisk Drift ApS</td><td>{kr(2500)}</td><td className="procure-lowest">{kr(2400)} <Status tone="ok">Laveste pris</Status></td><td>Aftalepris · 01.09.2026</td></tr><tr><td>EmballagePartner ApS</td><td>{kr(2600)}</td><td>{kr(2500)}</td><td>Fakturapris · 04.09.2026</td></tr><tr><td>Uden pakningsdata</td><td colSpan="3">Ikke sammenlignelig – pakningsstørrelse mangler</td></tr></tbody></table></div><p className="procure-hint">ⓘ Ekskl. moms. Rabat og fragt behandles ens; anden valuta vises som ikke sammenlignelig.</p></article></div></>}</section>;
}

function mailBody(order,supplier,tenantName) {
  return `Hej ${supplier?.name || "leverandør"}\n\nHermed vores bestilling. Bekræft venligst bestillingen og leveringsdatoen. De godkendte ordreoplysninger fremgår nedenfor og af den vedhæftede PDF.\n\nMed venlig hilsen\n${order.contact} · ${tenantName || "Virksomheden"}`;
}

export function SendOrderScreen({ state,setState,demo,tenant,canWrite }) {
  const location=useLocation(); const navigate=useNavigate(); const order=orderForPath(state,location.pathname); const supplier=supplierFor(state,order?.supplierId); const [cc,setCc]=useState(""); const [subject,setSubject]=useState(order?`Bestilling ${order.poNumber} – ${order.title}`:""); const [body,setBody]=useState(order?mailBody(order,supplier,tenant?.navn):""); const [message,setMessage]=useState(null); const [sending,setSending]=useState(false); const [requestId]=useState(()=>globalThis.crypto?.randomUUID?.()||`procure-send-${Date.now()}`); const [pdfInfo,setPdfInfo]=useState(null);
  useEffect(()=>{let active=true;if(!order)return undefined;(async()=>{try{if(demo){const bytes=createOrderPdfBytes(order,supplier,tenant||{});const digest=await crypto.subtle.digest("SHA-256",bytes);const sha256=[...new Uint8Array(digest)].map((part)=>part.toString(16).padStart(2,"0")).join("");const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));if(active)setPdfInfo({url,sha256,revision:order.revision,stoerrelse:bytes.length,demo:true});}else{const result=await getOrderPdf(order.id);if(active)setPdfInfo(result);}}catch{if(active)setMessage({tone:"bad",text:"Ordre-PDF'en kunne ikke hentes fra den godkendte revision."});}})();return()=>{active=false;};},[order?.id,order?.revision,demo]);
  if(!order)return <section className="procure-v2"><PageHead title="Gennemse og send bestilling" subtitle="Bestillingen findes ikke." demo={demo} tenant={tenant} back/><PageState empty emptyText="Vælg en bestilling fra listen."/></section>;
  const permission=canSendOrder(order); const send=async()=>{if(sending||!canWrite||!permission.ok||!pdfInfo)return;setSending(true);setMessage(null);if(demo){await new Promise((resolve)=>setTimeout(resolve,350));setState((current)=>({...current,orders:current.orders.map((item)=>item.id===order.id?{...item,status:"sent",sendStatus:"accepted",supplierConfirmationStatus:"pending",sentAt:new Date().toISOString(),sentBy:"Dennis Christensen",sentMail:{to:supplier.orderEmail,cc,subject,body,requestId,revision:order.revision,pdfName:`${order.poNumber}.pdf`,pdfSha256:pdfInfo.sha256,transport:"Kontrolleret testtransport"}}:item)}));setMessage({tone:"ok",text:`Testtransporten modtog PDF'en (${pdfInfo.sha256.slice(0,12)}…). Ingen rigtig leverandør har modtaget noget.`});setSending(false);return;}const result=await sendOrdreMail({ordreId:order.id,sendRequestId:requestId,sprog:"da",cc,emne:subject,ledsagetekst:body});setSending(false);setMessage({tone:result.ok?"ok":"bad",text:result.ok?`Mailudbyderen har accepteret bestillingen med PDF ${result.data?.pdfSha256?.slice(0,12)||""}…. Leverandørbekræftelse afventes.`:result.besked});};
  return <section className="procure-v2"><PageHead title="Gennemse og send bestilling" subtitle="Mail og ordre-PDF er udfyldt automatisk." demo={demo} tenant={tenant} back/><Toast message={message?.text} tone={message?.tone} onClose={()=>setMessage(null)}/><div className="procure-send-grid"><article className="procure-card"><div className="procure-detail-title"><h2>Mail til leverandør</h2><Status tone={order.approvalStatus==="approved"?"ok":"warn"}>{order.approvalStatus==="approved"?"✓ Indkøb godkendt":"Afventer godkendelse"}</Status></div>{demo&&<div className="procure-alert info"><b>Kontrolleret testtransport</b><span>Send-knappen simulerer et idempotent provider-svar og sender ikke til en rigtig adresse.</span></div>}<div className="procure-mail-fields"><label><span>Fra</span><input readOnly value={`${tenant?.navn||"Eksempelvirksomhed"} <indkoeb@eksempelvirksomhed.example>`}/></label><label><span>Til</span><input readOnly value={`${supplier?.name} <${supplier?.orderEmail||"mail mangler"}>`}/></label><label><span>Cc</span><input value={cc} onChange={(event)=>setCc(event.target.value)} placeholder="Tilføj modtager (valgfrit)"/></label><label><span>Emne</span><input value={subject} onChange={(event)=>setSubject(event.target.value)}/></label></div><div className="procure-editor-toolbar" aria-label="Tekstformatering"><button type="button" disabled title="Ren tekst i denne version">B</button><button type="button" disabled title="Ren tekst i denne version"><i>I</i></button><button type="button" disabled title="Ren tekst i denne version">U̲</button><button type="button" disabled title="Ren tekst i denne version">• Liste</button><span>Ledsageteksten gemmes som faktisk afsendt.</span></div><textarea aria-label="Redigerbar ledsagetekst" className="procure-mail-body" value={body} onChange={(event)=>setBody(event.target.value)}/><button className="procure-pdf-row" disabled={!pdfInfo} onClick={()=>pdfInfo&&window.open(pdfInfo.url,"_blank","noopener,noreferrer")}><span>▧</span><b>{order.poNumber}.pdf <small>(samme godkendte PDF som ved afsendelse)</small></b><span>Forhåndsvis ↗</span></button></article><aside><article className="procure-card"><h2>Bestillingen</h2><dl className="procure-order-summary"><dt>PO-nummer</dt><dd>{order.poNumber}</dd><dt>Leverandør</dt><dd>{supplier?.name}</dd><dt>Afdeling</dt><dd>{order.department}</dd><dt>Varegruppe</dt><dd>{[...new Set(order.lines.map((line)=>line.categorySnapshot))].join(", ")}</dd><dt>Ønsket levering</dt><dd>{order.wantedDate}</dd></dl><div className="procure-total"><span>Total (ekskl. moms)</span><strong>{kr(orderTotalOere(order))}</strong></div></article><article className="procure-card procure-timeline"><h2>Ordreforløb</h2><TimelineStep done title="Behov oprettet" meta={order.needId}/><TimelineStep done={order.approvalStatus==="approved"} active={order.approvalStatus!=="approved"} title="Indkøb godkendt" meta={order.approvalStatus==="approved"?"Godkendt grundlag":"Afgørelse mangler"}/><TimelineStep done={order.sendStatus==="accepted"} active={permission.ok} title={order.sendStatus==="accepted"?"Sendt – afventer leverandørbekræftelse":"Klar til afsendelse"} meta={order.sentAt||"Mail er klar til at blive sendt"}/><TimelineStep title="Leverandørbekræftelse" meta="Separat status — en mailkvittering er ikke en bekræftelse"/></article>{!permission.ok&&<div className="procure-alert warn"><b>Bestillingen kan ikke sendes</b><span>{permission.reason}</span></div>}<div className="procure-send-actions"><button className="procure-button secondary" onClick={()=>setMessage({tone:"ok",text:"Mailkladden er gemt i denne visning."})}>▣ Gem kladde</button><button className="procure-button secondary" onClick={()=>navigate(-1)}>← Tilbage</button><button className="procure-button" disabled={!permission.ok||!canWrite||sending||!supplier?.orderEmail||!pdfInfo} onClick={send}>{sending?"Sender …":"➤ Send bestilling"}</button></div></aside></div></section>;
}

function downloadOrderPdf(order,supplier){const blob=new Blob([createOrderPdfBytes(order,supplier)],{type:"application/pdf"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`${order.poNumber}.pdf`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportConsumption(rows){const csv=["Område;Godkendt fakturaforbrug ekskl. moms;Åbne bestillinger ekskl. moms",...rows.map((row)=>`${row.label||row.category};${(row.spend||0)/100};${(row.open||0)/100}`)].join("\n");const blob=new Blob([`\ufeff${csv}`],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download="procure-forbrug.csv";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
