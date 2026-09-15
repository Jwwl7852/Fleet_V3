import { useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { CASE_PRIORITIES, CASE_STATUSES, DEMO_ACTORS, REPORT_TYPES, SEVERITIES, USABILITY, deriveUnitUsability } from "../data/caseWorkflow";
import { CASE_CLOSURE_STATES, INVOICE_RESOLUTION_STATES, actualExternalCost, invoiceResolutionForCase } from "../data/caseFolderWorkflow";
import { WORKSHOP_TASK_STATUSES } from "../data/workshopWorkflow";
import { formatCurrency, formatMeter, modelLabel } from "../data/unitSelectors";
import { documentsForRelation } from "../data/documentWorkflow";
import { CaseActionPanel } from "./CaseActionPanel";
import { Icon } from "./Icon";
import { ReportImage } from "./ReportImage";
import { UnitThumbnail } from "./UnitThumbnail";

const dateTime = (value) => value ? new Date(value).toLocaleString("da-DK", { dateStyle: "medium", timeStyle: "short" }) : "Ikke oplyst";
const dateOnly = (value) => value ? new Date(value).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "Ikke oplyst";
const actorName = (id) => DEMO_ACTORS.find((item) => item.id === id)?.name || "Ikke tildelt";

export function CaseFolder({ caseId, onNavigate, onBack = onNavigate, dialog = false, onDirtyChange }) {
  const { units, relations, closeCase, reopenCase, updateCase, loading } = useFleetData();
  const [closeMode, setCloseMode] = useState("normal");
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const caseItem = (relations.cases || []).find((item) => item.id === caseId);
  const report = (relations.reports || []).find((item) => item.id === caseItem?.reportId);
  const unit = units.find((item) => item.id === caseItem?.unitId);
  const tasks = (relations.workshopTasks || []).filter((item) => item.caseId === caseId);
  const orders = (relations.workshopOrders || []).filter((item) => item.caseId === caseId);
  const documents = documentsForRelation(relations.documents, "case", caseId);
  const vendor = (relations.workshops || []).find((item) => item.id === caseItem?.vendorId || item.id === tasks.at(-1)?.workshopId);
  const usability = deriveUnitUsability(caseItem?.unitId, relations.reports || [], relations.cases || [], relations.workshopTasks || []);
  const invoiceStatus = caseItem ? invoiceResolutionForCase({ relations }, caseItem) : "disconnected";
  const timeline = useMemo(() => [...(relations.caseEvents || []), ...(relations.workshopEvents || []), ...(relations.serviceEvents || []), ...(relations.orderEvents || []), ...(relations.invoiceEvents || [])].filter((item) => item.caseId === caseId).sort((a, b) => b.at?.localeCompare(a.at || "") || b.receivedAt?.localeCompare(a.receivedAt || "")), [relations, caseId]);
  const Root = dialog ? "section" : "main";
  if (loading) return <Root className="workspace-page loading-state" {...(!dialog ? { id: "main-content" } : {})}><span className="loading-spinner" /></Root>;
  if (!caseItem || !unit) return <Root className="workspace-page not-found-state" {...(!dialog ? { id: "main-content" } : {})}><Icon name="warning" size={38} /><span className="eyebrow">FLEET v2 · lokal prototype</span><h1>Sagen findes ikke</h1><p>ID’et <code>{caseId}</code> findes ikke i det lokale datasæt.</p><button className="primary-button" onClick={() => onBack("/arbejdsko")} type="button">Til Arbejdskø</button></Root>;
  const close = async () => { setBusy(true); setMessage(""); try { await closeCase(caseId, { mode: closeMode, confirmClosure: confirmed, reason }, DEMO_ACTORS[1]); setMessage("Sagen er lukket og hændelsen er gemt lokalt."); } catch (error) { setMessage(error.message); } finally { setBusy(false); } };
  const reopen = async () => { setBusy(true); setMessage(""); try { await reopenCase(caseId, reason, DEMO_ACTORS[1]); setMessage("Sagen er genåbnet med historik."); } catch (error) { setMessage(error.message); } finally { setBusy(false); } };
  const latestTask = tasks.at(-1);
  const workStatus = latestTask ? WORKSHOP_TASK_STATUSES[latestTask.status] : "Ikke oprettet";
  const latestActivity = timeline[0];
  const images = [...(report?.images || []), ...tasks.flatMap((item) => [...(item.beforeImages || []), ...(item.afterImages || [])])];
  const media = report?.media || [];
  const snapshot = (relations.evidenceSnapshots || []).find((item) => item.caseId === caseId);
  const localCosts = (relations.costs || []).filter((item) => item.caseId === caseItem.id);
  const externalCost = actualExternalCost({ relations }, caseItem.id);
  const serverControlled = caseItem.readOnly === true;

  return <Root className={`workspace-page case-folder-page${dialog ? " case-folder-dialog-content" : ""}`} {...(!dialog ? { id: "main-content" } : {})}>
    {!dialog ? <div className="profile-breadcrumb"><button onClick={() => onBack("/arbejdsko")} type="button">Arbejdskø</button><Icon name="chevron" size={13} /><span>{caseItem.reference}</span><em>{serverControlled ? "Serverstyret" : "Lokal prototype"}</em></div> : null}
    <header className="case-folder-hero"><div><span className="eyebrow">Sagsmappe · {caseItem.number}</span><h1>{report?.title || caseItem.title || caseItem.reference}</h1><p>{caseItem.reference} · {CASE_STATUSES[caseItem.status]}</p></div><div className="page-actions"><button className="secondary-button" type="button" onClick={() => onNavigate(`/indberetninger/${report?.id}`)} disabled={!report}>Åbn indberetning</button>{!serverControlled ? <button className="primary-button" type="button" onClick={() => onNavigate(`/sager/${caseId}/bestilling`)}><Icon name="document" size={16} />Tildel værksted</button> : null}</div></header>

    <section className="case-unit-row" aria-label="Enhed for sagen">
      <UnitThumbnail unit={unit} />
      <div><span className="eyebrow">Enhed</span><strong>{unit.number} · {modelLabel(unit)}</strong><small>{unit.registration || "Ingen registrering"}</small></div>
      <div><span>Målerstand</span><strong>{formatMeter(unit)}</strong><small>Målt {dateOnly(unit.updatedAt)}</small></div>
      <div><span>Anvendelighed</span><strong className={usability.tone}>{usability.label}</strong><small>{report ? `Indberettet ${dateOnly(report.createdAt)}` : "Manuel sag"}</small></div>
      <button className="link-button" onClick={() => onNavigate(`/enheder/${unit.id}`)} type="button">Åbn enhedsprofil <Icon name="chevron" size={13} /></button>
    </section>

    <div className="case-folder-workspace">
      <div className="case-folder-main-column">
        <section className="folder-card case-next-action">
          <header><div><span className="eyebrow">Aktuelt trin</span><h2>Problem og næste handling</h2></div><span className={`status-badge ${caseItem.priority}`}><i />{CASE_PRIORITIES[caseItem.priority]}</span></header>
          <div className="case-problem-summary"><Icon name="warning" size={20} /><div><strong>{report?.title || caseItem.title || "Manuel sag"}</strong><p>{report?.description || caseItem.description || "Ingen beskrivelse."}</p></div></div>
          <div className="case-next-step"><Icon name="info" size={18} /><span><strong>Næste skridt</strong>{caseItem.nextAction || "Vælg ansvarlig og næste handling"}</span></div>
          <CaseActionPanel caseItem={caseItem} report={report} onUpdate={updateCase} compact onDirtyChange={onDirtyChange} />
          {!serverControlled ? <><div className="case-workflow-actions"><button className="secondary-button" type="button" onClick={() => onNavigate(`/sager/${caseId}/bestilling`)}><Icon name="workshop" size={16} />{vendor ? `Skift ${vendor.name}` : "Vælg værksted eller leverandør"}</button><button className="secondary-button" type="button" onClick={() => onNavigate(`/sager/${caseId}/bestilling`)}><Icon name="document" size={16} />Klargør bestilling og mail</button></div>
          {orders.length ? <div className="case-order-preview">{orders.map((item) => <article className="order-row" key={item.id}><span className="integration-badge">Kladde · ikke sendt</span><strong>{item.reference} · v{item.version}</strong><p>{item.subject}</p><small>{item.recipient || "Gemt uden mail"} · {dateTime(item.updatedAt)}</small></article>)}</div> : <p className="muted">Ingen bestilling eller mailkladde endnu.</p>}</> : <div className="form-alert warning" role="status">Værksted, bestilling og mail kan først ændres, når den servervaliderede sagsadapter er tilsluttet.</div>}
        </section>

        <CaseSection title="Oprindelig indberetning" count={report ? 1 : 0} open>
          {report ? <><span className="eyebrow">{report.number} · {REPORT_TYPES[report.type]}</span><h3>{report.title}</h3><p>{report.description}</p><dl className="detail-list"><div><dt>Oplevet alvorlighed</dt><dd>{SEVERITIES[report.severity]}</dd></div><div><dt>Oplevet anvendelighed</dt><dd>{USABILITY[report.usability]}</dd></div><div><dt>Indberetter</dt><dd>{report.reporterName}</dd></div><div><dt>Oprettet</dt><dd>{dateTime(report.createdAt)}</dd></div></dl>{report.incident ? <div className="incident-summary"><h3>Skadeshændelse</h3><p>{report.incident.description || "Ingen særskilt hændelsesbeskrivelse."}</p><span>{report.incident.timeUnknown ? "Tidspunkt ukendt" : dateTime(report.incident.occurredAt)} · {report.incident.location}</span><span>Områder: {report.incident.damagedAreas?.join(", ") || "Ikke oplyst"}</span></div> : null}</> : <div className="empty-inline"><h3>Manuel sag</h3><p>Sagen har ingen forudgående indberetning.</p></div>}
        </CaseSection>

        <CaseSection title="Billeder og dokumenter" count={images.length + media.length + documents.length}>
          {images.length ? <div className="folder-gallery">{images.map((image, index) => <ReportImage image={image} alt={`Sagsbillede ${index + 1}`} key={image.id} />)}</div> : <p className="muted">Ingen billeder.</p>}
          {media.map((item) => <article className="order-row" key={item.id}><strong>{item.name}</strong><span>{item.kind === "video" ? "Manuelt videoklip" : "Dokument"}</span></article>)}
          {documents.length ? <div className="case-document-links">{documents.map((document) => <button className="link-button" type="button" key={document.id} onClick={() => onNavigate(`/dokumenter/${document.id}`)}><Icon name="document" size={14} />{document.title}</button>)}</div> : null}
          <div className="integration-empty"><Icon name="gps" /><div><strong>OBD og dashcam er ikke tilsluttet</strong><p>Kun faktisk modtagede snapshots vises.</p></div></div>
        </CaseSection>

        <CaseSection title="Enhedsdata og evidens" count={snapshot ? 1 : 0}>
          <dl className="detail-list"><div><dt>Enhed</dt><dd>{unit.number}</dd></div><div><dt>Mærke/model</dt><dd>{modelLabel(unit)}</dd></div><div><dt>Registrering</dt><dd>{unit.registration || "Ikke oplyst"}</dd></div><div><dt>VIN/serienummer</dt><dd>{unit.serialNumber || "Ikke oplyst"}</dd></div><div><dt>Aktuel målerstand</dt><dd>{formatMeter(unit)}</dd></div><div><dt>Indberettet observation</dt><dd>{report?.meterObservation?.value ?? "Ikke oplyst"} {report?.meterObservation?.unit === "hours" ? "t" : "km"}</dd></div></dl>
          {snapshot ? <p className="muted">Evidens: {snapshot.source} · målt {dateTime(snapshot.measuredAt)} · modtaget {dateTime(snapshot.receivedAt)}</p> : null}
        </CaseSection>

        <CaseSection title="Omkostninger" count={localCosts.length}>
          <div className="cost-summary"><article><span>Internt faktisk</span><strong>{formatCurrency.format(localCosts.filter((item) => item.actual).reduce((sum, item) => sum + item.amount, 0))}</strong></article><article><span>Eksternt foreløbigt</span><strong>{formatCurrency.format(localCosts.filter((item) => !item.actual).reduce((sum, item) => sum + item.amount, 0))}</strong></article><article><span>Eksternt kontrolleret</span><strong>{formatCurrency.format(externalCost)}</strong></article></div><p className="muted">Estimater tæller ikke som faktiske omkostninger. Kontrollerede kreditnotaer trækkes fra.</p>
        </CaseSection>

        <CaseSection title="Noter og historik" count={timeline.length}>
          <Timeline events={timeline} />
        </CaseSection>
      </div>

      <aside className="case-folder-side-column">
        <section className="folder-card case-overview-card"><h2>Sagens overblik</h2><dl className="case-overview-list"><div><dt>Ansvarlig</dt><dd>{actorName(caseItem.assigneeId)}</dd></div><div><dt>Prioritet</dt><dd>{CASE_PRIORITIES[caseItem.priority] || "Ikke valgt"}</dd></div><div><dt>Frist</dt><dd>{dateOnly(caseItem.dueDate)}</dd></div><div><dt>Arbejdsstatus</dt><dd>{workStatus}</dd></div><div><dt>Sagsstatus</dt><dd>{CASE_CLOSURE_STATES[caseItem.closureStatus || "open"]}</dd></div><div><dt>Leverandør</dt><dd>{vendor?.name || "Ikke valgt"}</dd></div></dl></section>
        <section className="folder-card case-latest-card"><h2>Seneste aktivitet</h2>{latestActivity ? <div className="latest-activity"><i /><div><strong>{latestActivity.title || `Fakturahændelse · ${latestActivity.controlStatus}`}</strong><p>{latestActivity.text || latestActivity.documentId}</p><small>{dateTime(latestActivity.at || latestActivity.receivedAt)} · {latestActivity.actorName || "Lokal adapterfixture"}</small></div></div> : <p className="muted">Ingen aktivitet registreret.</p>}</section>
        {serverControlled ? <section className="case-close-panel"><h2>Serverstyret afslutning</h2><p>Sagen vises direkte fra serviceautomatikken. Den lokale prototype kan ikke lukke, genåbne eller ændre fakturastatus.</p><div className={`invoice-readiness ${invoiceStatus === "cleared" ? "ready" : "blocked"}`}><strong>{CASE_STATUSES[caseItem.status]}</strong><span>{INVOICE_RESOLUTION_STATES[invoiceStatus]}</span></div><small>Afslutning kræver en servervalideret sags- og fakturaadapter.</small></section> : <section className="case-close-panel"><h2>Afslutning af sag</h2><p>Afsluttet arbejde frigiver ikke automatisk sagen. Fakturaafklaring påvirker ikke enhedens nedetid.</p>{caseItem.closureStatus === "closed" ? <><div className="closure-result"><Icon name="check" /><strong>Lukket {dateTime(caseItem.closedAt)}</strong><span>{caseItem.closureReason}</span></div><label>Begrundelse for genåbning<textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="secondary-button full" type="button" disabled={busy} onClick={reopen}>Genåbn sag</button></> : <><div className="closure-mode"><label><input type="radio" checked={closeMode === "normal"} onChange={() => setCloseMode("normal")} />Normal lukning</label><label><input type="radio" checked={closeMode === "no_invoice"} onChange={() => setCloseMode("no_invoice")} />Luk uden faktura</label></div>{closeMode === "no_invoice" ? <label>Hvorfor mangler eller forventes fakturaen ikke?<textarea aria-label="Begrundelse for lukning uden faktura" rows="3" value={reason} onChange={(event) => setReason(event.target.value)} /></label> : <div className={`invoice-readiness ${invoiceStatus === "cleared" ? "ready" : "blocked"}`}><strong>{invoiceStatus === "cleared" ? "Fakturagrundlaget er afklaret" : "Normal lukning er blokeret"}</strong><span>{INVOICE_RESOLUTION_STATES[invoiceStatus]}</span></div>}<label className="confirm-close"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Jeg bekræfter, at sagen kan lukkes</label><button className="primary-button full" type="button" disabled={busy} onClick={close}>Luk sag</button></>}{message ? <div className="form-alert warning" role="status">{message}</div> : null}<small>Fakturacenter er ikke tilsluttet. Ingen match-, kontrol- eller godkendelseshandlinger findes i FLEET.</small></section>}
      </aside>
    </div>
  </Root>;
}

function CaseSection({ title, count, children, open = false }) {
  return <details className="case-fold-section folder-card" open={open}><summary><span>{title}</span><em>{count}</em><Icon name="chevron" size={14} /></summary><div className="case-fold-content">{children}</div></details>;
}

function Timeline({ events }) { return <div className="compact-timeline">{events.map((event) => <article key={event.id}><span><Icon name="clock" size={14} /></span><div><strong>{event.title || `Fakturahændelse · ${event.controlStatus}`}</strong><p>{event.text || `${event.documentId} · ${(event.netAmountMinor / 100).toLocaleString("da-DK")} DKK`}</p><small>{dateTime(event.at || event.receivedAt)} · {event.actorName || "Lokal adapterfixture"}</small></div></article>)}</div>; }
