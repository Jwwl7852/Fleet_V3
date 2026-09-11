import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  orderTotalOere, PROCUREMENT_TABS, procurementStatus, recordsForProcurementTab,
} from "./procure-v2-domain.js";

const kr = (oere = 0) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(oere / 100);
const date = (value) => value || "Hurtigst muligt";

function statusTone(tone) {
  return tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "info";
}

export default function ProcurementWorkspaceScreen({ state, demo, tenant, canWrite, busy, error }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = PROCUREMENT_TABS.some((item) => item.id === params.get("fane")) ? params.get("fane") : "all";
  const query = (params.get("soeg") || "").trim().toLowerCase();
  const department = params.get("afdeling") || "";
  const sort = params.get("sort") || "newest";
  const departments = Object.values(state.setup?.afdelinger || {}).filter((row) => row.active !== false);
  const records = [
    ...state.needs.map((item) => ({ ...item, recordType: "need", stableReference: item.id, amountOere: null })),
    ...state.orders.map((item) => ({ ...item, recordType: "order", stableReference: item.poNumber || item.id, amountOere: orderTotalOere(item) })),
  ];
  const countFor = (id) => recordsForProcurementTab(records, id, state.receipts).length;
  const shown = recordsForProcurementTab(records, tab, state.receipts)
    .filter((item) => !department || item.departmentId === department)
    .filter((item) => !query || `${item.stableReference} ${item.title} ${item.department} ${item.lines?.map((line) => line.name).join(" ")}`.toLowerCase().includes(query))
    .sort((a, b) => sort === "oldest" ? String(a.stableReference).localeCompare(String(b.stableReference)) : String(b.stableReference).localeCompare(String(a.stableReference)));
  const selectedId = params.get("sag") || params.get("behov") || params.get("ordre") || shown[0]?.id;
  const selected = records.find((item) => item.id === selectedId) || shown[0];
  const selectedStatus = selected ? procurementStatus(selected, state.receipts) : null;
  const supplier = selected?.supplierId ? state.suppliers.find((item) => item.id === selected.supplierId) : null;
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "sag") next.delete("sag");
    setParams(next, { replace: key !== "sag" });
  };
  const open = (record) => set("sag", record.id);

  return <section className="procure-v2 procure-workspace">
    <header className="procure-pagehead">
      <div><h1>Bestillinger</h1><p>Ét samlet overblik fra kladde og godkendelse til levering og afslutning.</p></div>
      <div className="procure-head-actions">
        {demo && <span className="procure-demo">Syntetiske testdata · {tenant?.navn || "lokal preview"}</span>}
        <Link className="procure-button secondary" to="/indkoeb/mobil">Mobilbestilling</Link>
        <Link className="procure-button" to="/indkoeb/mobil">＋ Ny bestilling</Link>
      </div>
    </header>
    {busy && <div className="procure-state" role="status">Indlæser bestillinger …</div>}
    {error && <div className="procure-state error" role="alert"><b>Bestillinger kunne ikke indlæses.</b><span>Kontrollér forbindelsen og prøv igen.</span></div>}
    {!busy && !error && <>
      <article className="procure-card procure-workspace-list">
        <div className="procure-tabs" role="tablist" aria-label="Bestillingsstatus">
          {PROCUREMENT_TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => set("fane", item.id)}>{item.label} <span>{countFor(item.id)}</span></button>)}
        </div>
        <div className="procure-filterbar">
          <label className="procure-search"><span>⌕</span><input type="search" value={params.get("soeg") || ""} onChange={(event) => set("soeg", event.target.value)} placeholder="Søg reference, vare eller leverandør …" /></label>
          <select aria-label="Afdeling" value={department} onChange={(event) => set("afdeling", event.target.value)}><option value="">Alle afdelinger</option>{departments.map((row) => <option value={row.id} key={row.id}>{row.label}</option>)}</select>
          <select aria-label="Sortering" value={sort} onChange={(event) => set("sort", event.target.value)}><option value="newest">Nyeste først</option><option value="oldest">Ældste først</option></select>
        </div>
        {!shown.length ? <div className="procure-state"><b>Ingen bestillinger i denne visning</b><span>Skift fane eller filtre, eller opret en ny bestilling.</span></div> : <div className="procure-case-list" role="list">
          {shown.map((item) => {
            const status = procurementStatus(item, state.receipts);
            const itemSupplier = state.suppliers.find((supplierRow) => supplierRow.id === item.supplierId);
            return <button type="button" key={`${item.recordType}-${item.id}`} aria-current={selected?.id === item.id ? "true" : undefined} className={`procure-case-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => open(item)}>
              <div><small>{item.recordType === "need" ? "BESTILLINGSKLADDE" : "BESTILLING"}</small><b>{item.stableReference}</b><span>{item.title}</span></div>
              <div><small>Leverandør</small><span>{itemSupplier?.name || "Afklares"}</span></div>
              <div><small>Afdeling</small><span>{item.department || "Ikke angivet"}</span></div>
              <div><small>Ønsket levering</small><span>{date(item.wantedDate)}</span></div>
              <div><small>Beløb</small><span>{item.amountOere === null ? "Afklares" : kr(item.amountOere)}</span></div>
              <span className={`procure-status ${statusTone(status.tone)}`}>{status.label}</span>
              <span className="procure-row-chevron" aria-hidden="true">›</span>
            </button>;
          })}
        </div>}
      </article>
      {selected && <article className="procure-card procure-workspace-detail">
        <div className="procure-detail-title"><div><button type="button" className="procure-back" onClick={() => navigate(-1)}>← Tilbage</button><h2>{selected.stableReference} · {selected.title}</h2></div><span className={`procure-status ${statusTone(selectedStatus.tone)}`}>{selectedStatus.label}</span></div>
        <div className="procure-facts"><span><small>Leverandør</small><b>{supplier?.name || "Afklares før bestilling"}</b></span><span><small>Afdeling</small><b>{selected.department || "Ikke angivet"}</b></span><span><small>Leveringssted</small><b>{selected.deliveryLocation || "Ikke angivet"}</b></span><span><small>Ønsket leveringsdato</small><b>{date(selected.wantedDate)}</b></span></div>
        <div className="procure-table-wrap"><table><thead><tr><th>Vare</th><th>Varegruppe</th><th>Antal og enhed</th><th>Pris</th><th>Beløb</th></tr></thead><tbody>{(selected.lines || []).map((line) => <tr key={line.id}><td><b>{line.name}</b><small>{line.sku || "Fritekst"}</small></td><td>{line.categorySnapshot || line.category || "Ukategoriseret"}</td><td>{line.quantity} {line.unit}</td><td>{Number.isInteger(line.unitPriceOere) ? kr(line.unitPriceOere) : "Afklares"}</td><td>{Number.isInteger(line.unitPriceOere) ? kr(line.quantity * line.unitPriceOere) : "Afklares"}</td></tr>)}</tbody></table></div>
        {selected.recordType === "order" && <div className="procure-actions">
          {selectedStatus.id === "pending" && <Link className="procure-button" to={`/indkoeb/godkendelser?ordre=${selected.id}`}>Gennemgå godkendelse</Link>}
          {selectedStatus.id === "approved" && <Link className="procure-button" to={`/indkoeb/bestillinger/${selected.id}/send`}>Gennemse og send bestilling</Link>}
          {["ordered", "part-received"].includes(selectedStatus.id) && <Link className="procure-button" to={`/indkoeb/modtagelser/${selected.id}`}>Modtag varer</Link>}
          <Link className="procure-button secondary" to={`/oekonomi/fakturacenter?sektion=arbejdsbord&kilde=procure&po=${encodeURIComponent(selected.poNumber || "")}&retur=${encodeURIComponent(`/indkoeb/bestillinger?sag=${selected.id}`)}`}>Åbn i Fakturacenter</Link>
        </div>}
        {selected.recordType === "need" && <div className="procure-actions"><Link className="procure-button" to="/indkoeb/katalog">Fortsæt med leverandør og varer</Link><button className="procure-button secondary" disabled={!canWrite}>Redigér kladde</button></div>}
      </article>}
    </>}
  </section>;
}
