import { useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { LEASE_STATUSES, leaseSummary } from "../data/leasingWorkflow";
import { DEMO_ACTORS } from "../data/caseWorkflow";
import { Icon } from "./Icon";
import { LeaseFormDialog } from "./LeaseFormDialog";
import { UnitThumbnail } from "./UnitThumbnail";

const today = "2026-09-08";
const day = 86400000;
const daysUntil = (value) => value ? Math.ceil((new Date(`${value}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / day) : null;
const currency = (minor, code = "DKK") => minor == null ? "Ikke oplyst" : new Intl.NumberFormat("da-DK", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(minor / 100);
const number = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
const shortDate = (value) => value ? new Intl.DateTimeFormat("da-DK").format(new Date(`${value}T00:00:00`)) : "—";

export function LeasingOverview({ onNavigate, imageProcessor }) {
  const { units, relations, loading, saveLease, runLeaseAutomation } = useFleetData();
  const [query, setQuery] = useState(""); const [lessor, setLessor] = useState("all"); const [status, setStatus] = useState("all"); const [risk, setRisk] = useState("all"); const [sort, setSort] = useState("end"); const [editing, setEditing] = useState(undefined); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const leases = relations.leases || []; const observations = relations.meterObservations || [];
  const summaries = useMemo(() => leases.map((lease) => leaseSummary(lease, units, observations, { today })).filter(({ unit }) => unit), [leases, units, observations]);
  const filtered = useMemo(() => summaries.filter(({ lease, unit, projection }) => {
    const text = `${unit.number} ${unit.registration || ""} ${unit.make} ${unit.model} ${lease.agreementNumber} ${lease.lessor?.name}`.toLowerCase();
    const isRisk = projection.calculable && (projection.remainingKm <= Math.max(5000, projection.allowance * .1) || projection.excessKm > 0);
    return (!query || text.includes(query.toLowerCase())) && (lessor === "all" || lease.lessor?.name === lessor) && (status === "all" || lease.status === status) && (risk === "all" || (risk === "risk") === isRisk);
  }).sort((a,b) => sort === "unit" ? a.unit.number.localeCompare(b.unit.number) : sort === "payment" ? (b.lease.payment?.recurringMinor || -1) - (a.lease.payment?.recurringMinor || -1) : (a.lease.endDate || "9999").localeCompare(b.lease.endDate || "9999")), [summaries, query, lessor, status, risk, sort]);
  if (loading) return <main id="main-content" className="page fleet-loading">Indlæser leasingaftaler …</main>;
  const active = summaries.filter(({ lease }) => ["active","ending"].includes(lease.status));
  const soon = active.filter(({ lease }) => { const days = daysUntil(lease.plannedDeliveryDate || lease.endDate); return days != null && days >= 0 && days <= 120; });
  const atRisk = active.filter(({ projection }) => projection.calculable && (projection.excessKm > 0 || projection.remainingKm <= Math.max(5000, projection.allowance * .1)));
  const currencyCodes = new Set(active.map(({ lease }) => lease.payment?.currency).filter(Boolean));
  const monthly = currencyCodes.size === 1 ? active.reduce((sum,{lease})=>sum+(lease.payment?.interval === "monthly" ? lease.payment.recurringMinor || 0 : 0),0) : null;
  const incomplete = summaries.filter(({ lease, projection }) => !lease.documentIds?.length || !projection.calculable || !lease.lastNoticeDate).length;
  const actions = [...atRisk.map((summary)=>({...summary,actionType:"risk"})), ...soon.map((summary)=>({...summary,actionType:"delivery"}))];
  const save = async (values, contractFile, unitImageChange) => { const result = await saveLease({ ...values, contractFile, unitImageChange }, DEMO_ACTORS[1]); setNotice(`${result.lease.agreementNumber} er gemt lokalt${result.updatedUnit ? `, og billedet for ${result.updatedUnit.number} er opdateret overalt` : ""}.`); };
  const demo = async () => { setBusy(true); try { const result = await runLeaseAutomation({ now: () => "2026-09-08T12:00:00.000Z", today: "2026-09-08", leadDays: 999 }); setNotice(result.created.length ? `Demo: ${result.created.length} afleveringssag oprettet atomisk.` : "Demo: eksisterende afleveringssag blev genbrugt – ingen dublet."); } finally { setBusy(false); } };
  return <main id="main-content" className="page leasing-page">
    <header className="page-title-row"><div><small className="eyebrow">FLEET · LEASING · FIKTIVE DEMODATA</small><h1>Leasing</h1><p>Overblik over leasingaftaler, kilometerforbrug og kommende udløb.</p></div><div className="title-actions"><button type="button" className="secondary-button" onClick={demo} disabled={busy}><Icon name="clock" size={17} />{busy?"Kontrollerer …":"Kør varslingsdemo"}</button><button type="button" className="primary-button" onClick={()=>setEditing(null)}><Icon name="plus" />Opret leasingaftale</button></div></header>
    {notice ? <div className="inline-notice"><Icon name="info" size={18}/>{notice}</div> : null}
    <section className="lease-kpis">
      <article><span className="kpi-icon"><Icon name="document" /></span><div><small>Aktive leasingaftaler</small><strong>{active.length}</strong></div></article>
      <article className="warning"><span className="kpi-icon"><Icon name="clock" /></span><div><small>Aflevering inden 120 dage</small><strong>{soon.length}</strong></div></article>
      <article className="danger"><span className="kpi-icon"><Icon name="warning" /></span><div><small>Enheder i km-risiko</small><strong>{atRisk.length}</strong></div></article>
      <article><span className="kpi-icon"><Icon name="economy" /></span><div><small>Kontraktuel månedlig ydelse</small><strong>{monthly == null ? "Kan ikke summeres" : currency(monthly, [...currencyCodes][0])}</strong></div></article>
      <article className="neutral"><span className="kpi-icon"><Icon name="info" /></span><div><small>Mangler grundlag</small><strong>{incomplete}</strong></div></article>
    </section>
    <section className="lease-toolbar">
      <div className="catalog-search"><Icon name="search" size={16}/><input aria-label="Søg i leasingaftaler" placeholder="Enhed, registrering, aftale eller selskab …" value={query} onChange={(event)=>setQuery(event.target.value)} /></div>
      <select aria-label="Filtrér leasingselskab" value={lessor} onChange={(event)=>setLessor(event.target.value)}><option value="all">Alle selskaber</option>{[...new Set(leases.map((item)=>item.lessor?.name).filter(Boolean))].map((item)=><option key={item}>{item}</option>)}</select>
      <select aria-label="Filtrér leasingstatus" value={status} onChange={(event)=>setStatus(event.target.value)}><option value="all">Alle statusser</option>{Object.entries(LEASE_STATUSES).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>
      <select aria-label="Filtrér kilometerrisiko" value={risk} onChange={(event)=>setRisk(event.target.value)}><option value="all">Alle km-niveauer</option><option value="risk">Kræver handling</option><option value="ok">Uden km-risiko</option></select>
      <select aria-label="Sortér leasingaftaler" value={sort} onChange={(event)=>setSort(event.target.value)}><option value="end">Udløb først</option><option value="unit">Enhedsnummer</option><option value="payment">Højeste ydelse</option></select>
      <button className="link-button" type="button" onClick={()=>{setQuery("");setLessor("all");setStatus("all");setRisk("all");}}>Nulstil</button>
    </section>
    <div className="lease-overview-grid"><section className="lease-table-card"><header><h2>Leasingaftaler ({filtered.length})</h2><span>Samme data som aftaledetaljerne</span></header><div className="table-scroll"><table><thead><tr><th>Enhed</th><th>Registrering</th><th>Leasingselskab</th><th>Aftale</th><th>Periode</th><th>Aflevering</th><th>Resterende km</th><th>Status</th><th>Ydelse</th></tr></thead><tbody>{filtered.map(({lease,unit,projection})=><tr key={lease.id} tabIndex="0" onClick={()=>onNavigate(`/leasing/${lease.id}`)} onKeyDown={(event)=>{if(event.key==="Enter")onNavigate(`/leasing/${lease.id}`)}}><td><div className="lease-unit-cell"><UnitThumbnail unit={unit}/><strong>{unit.number}</strong></div></td><td>{unit.registration||"—"}</td><td>{lease.lessor?.name||"Ikke oplyst"}</td><td>{lease.agreementNumber}</td><td>{shortDate(lease.startDate)} – {shortDate(lease.endDate)}</td><td>{shortDate(lease.plannedDeliveryDate||lease.endDate)}</td><td>{projection.calculable ? `${number.format(projection.remainingKm)} km` : "Kan ikke beregnes"}</td><td><span className={`status-pill ${projection.excessKm>0?"danger":lease.status==="active"?"success":"warning"}`}>{projection.excessKm>0?"Forventet overskridelse":LEASE_STATUSES[lease.status]}</span></td><td>{currency(lease.payment?.recurringMinor,lease.payment?.currency)}</td></tr>)}</tbody></table>{!filtered.length?<div className="empty-state"><Icon name="leasing"/><h3>Ingen aftaler matcher</h3><p>Nulstil filtrene eller opret en ny leasingaftale.</p></div>:null}</div></section>
      <aside className="lease-actions-panel"><section><header><h2>Kræver handling ({actions.length})</h2></header>{actions.slice(0,4).map(({lease,unit,projection,actionType})=><button key={`${lease.id}-${actionType}`} type="button" onClick={()=>onNavigate(`/leasing/${lease.id}`)}><Icon name={actionType==="risk"?"warning":"clock"}/><span><strong>{unit.number} · {actionType==="risk"?"forventet overskridelse":`aflevering ${shortDate(lease.plannedDeliveryDate||lease.endDate)}`}</strong><small>{actionType==="risk"?`${number.format(projection.excessKm)} km over aftalen`:lease.agreementNumber}</small></span><Icon name="chevron" size={15}/></button>)}{!actions.length?<p>Ingen aktuelle handlinger.</p>:null}</section><section className="integration-empty"><Icon name="info"/><div><strong>Prognoser er estimater</strong><p>De bygger på daterede målerobservationer og er ikke faktiske fakturaer.</p></div></section></aside>
    </div>
    {editing !== undefined ? <LeaseFormDialog lease={editing} units={units} onClose={()=>setEditing(undefined)} onSave={save} imageProcessor={imageProcessor}/> : null}
  </main>;
}
