import { useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { CASE_STATUSES, REPORT_TYPES, SEVERITIES } from "../data/caseWorkflow";
import { MOBILE_DEMO_USERS, mobileUnitsForUser, reporterProgressLabel, reporterVisibleEvents } from "../data/mobileReporting";
import { modelLabel } from "../data/unitSelectors";
import { Icon } from "./Icon";
import { ReportImage } from "./ReportImage";
import { ReportWizard } from "./ReportWizard";
import { UnitThumbnail } from "./UnitThumbnail";

const storedUser = () => localStorage.getItem("veyro-mobile-demo-user") || MOBILE_DEMO_USERS[0].id;
const dateTime = (value) => value ? new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Ikke oplyst";

function MobileHeader({ user, setUser, view, onNavigate }) {
  return <header className="mobile-center-header"><div><span className="eyebrow">FLEET · lokal mobilprototype</span><h1>Mobil indberetning</h1><p>Store trykflader og samme sagsdata som desktop.</p></div><label>Demo-profil<select aria-label="Mobil demo-profil" value={user.id} onChange={(event) => setUser(event.target.value)}>{MOBILE_DEMO_USERS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.fullFleet ? "hele flåden" : item.departments.join(" + ")}</option>)}</select><small>Prototypelogik – ikke produktionssikret adgangskontrol.</small></label><nav aria-label="Mobil indberetning"><button className={view === "home" ? "is-active" : ""} onClick={() => onNavigate("/mobil")} type="button"><Icon name="mobile" />Start</button><button className={view === "mine" ? "is-active" : ""} onClick={() => onNavigate("/mobil/mine")} type="button"><Icon name="report" />Mine</button><button className={view === "drafts" ? "is-active" : ""} onClick={() => onNavigate("/mobil/kladder")} type="button"><Icon name="document" />Kladder</button></nav></header>;
}

function ReportCard({ report, caseItem, unit, onOpen }) {
  return <button className="mobile-report-card" type="button" onClick={onOpen}><UnitThumbnail unit={unit} /><span><small>{unit?.number} · {dateTime(report.createdAt)}</small><strong>{report.title}</strong><em>{report.reference || caseItem?.reference} · {report.number}</em></span><b>{reporterProgressLabel(caseItem)}</b><Icon name="chevron" size={16} /></button>;
}

function MobileReportDetail({ reportId, user, relations, units, onNavigate }) {
  const report = (relations.reports || []).find((item) => item.id === reportId && item.reporterId === user.id);
  if (!report) return <section className="mobile-empty"><Icon name="warning" size={34} /><h2>Indberetningen findes ikke</h2><p>Den tilhører ikke den valgte demo-bruger eller findes ikke længere.</p><button className="primary-button" onClick={() => onNavigate("/mobil/mine")} type="button">Til Mine indberetninger</button></section>;
  const caseItem = (relations.cases || []).find((item) => item.reportId === report.id); const unit = units.find((item) => item.id === report.unitId);
  const events = reporterVisibleEvents(relations.caseEvents, caseItem);
  return <section className="mobile-detail"><button className="link-button" type="button" onClick={() => onNavigate("/mobil/mine")}><Icon name="chevron" size={14} className="back-icon" />Tilbage</button><div className="mobile-detail-hero"><UnitThumbnail unit={unit} large /><div><span className="eyebrow">{report.reference || caseItem?.reference}</span><h2>{report.title}</h2><p>{unit?.number} · {modelLabel(unit || {})}</p><span className={`status-pill ${caseItem?.status === "rejected" ? "danger" : "info"}`}>{reporterProgressLabel(caseItem, relations.workshopTasks || [])}</span></div></div><dl className="mobile-report-facts"><div><dt>Type</dt><dd>{REPORT_TYPES[report.type]}</dd></div><div><dt>Alvorlighed</dt><dd>{SEVERITIES[report.severity]}</dd></div><div><dt>Oprettet</dt><dd>{dateTime(report.createdAt)}</dd></div><div><dt>Status</dt><dd>{CASE_STATUSES[caseItem?.status] || "Modtaget"}</dd></div></dl><section className="mobile-copy-card"><h3>Din indberetning</h3><p>{report.description}</p></section>{report.images?.length ? <section className="mobile-copy-card"><h3>Bilag</h3><div className="report-image-grid">{report.images.map((image, index) => <ReportImage key={image.id} image={image} alt={`Indsendt billede ${index + 1}`} />)}</div></section> : null}<section className="mobile-copy-card"><h3>Fremdrift</h3><div className="mobile-timeline">{events.map((event) => <article key={event.id}><i /><span><strong>{event.title}</strong><small>{dateTime(event.at)}</small>{event.type === "created" ? <p>{event.text}</p> : null}</span></article>)}{!events.length ? <p>Ingen synlige opdateringer endnu.</p> : null}</div><p className="prototype-note">Interne noter, leverandørdialog og økonomi vises ikke her.</p></section></section>;
}

export function MobileReporting({ view = "home", reportId, onNavigate, imageProcessor }) {
  const { units, relations, loading } = useFleetData();
  const [userId, setUserId] = useState(storedUser);
  const user = MOBILE_DEMO_USERS.find((item) => item.id === userId) || MOBILE_DEMO_USERS[0];
  const allowed = useMemo(() => mobileUnitsForUser(units, user), [units, user]);
  const setUser = (id) => { localStorage.setItem("veyro-mobile-demo-user", id); setUserId(id); };
  if (view === "new") return <ReportWizard onNavigate={onNavigate} imageProcessor={imageProcessor} reporter={user} allowedUnitIds={allowed.map((item) => item.id)} mobile />;
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser mobilprototype …</p></main>;
  const own = (relations.reports || []).filter((item) => item.reporterId === user.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const drafts = (relations.reportDrafts || []).filter((item) => item.reporterId === user.id).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  return <main className="workspace-page mobile-center-page" id="main-content"><MobileHeader user={user} setUser={setUser} view={view} onNavigate={onNavigate} />
    {view === "detail" ? <MobileReportDetail reportId={reportId} user={user} relations={relations} units={units} onNavigate={onNavigate} /> : null}
    {view === "home" ? <section className="mobile-home-grid"><button className="mobile-primary-card" type="button" onClick={() => onNavigate("/mobil/ny")}><span><Icon name="plus" size={28} /></span><div><h2>Ny indberetning</h2><p>Vælg eller scan en enhed, dokumentér problemet og få en kvittering.</p></div><Icon name="chevron" /></button><button className="mobile-stat-card" type="button" onClick={() => onNavigate("/mobil/mine")}><strong>{own.length}</strong><span>Mine indberetninger</span></button><button className="mobile-stat-card" type="button" onClick={() => onNavigate("/mobil/kladder")}><strong>{drafts.length}</strong><span>Gemte kladder</span></button><section className="mobile-access-card"><Icon name="shield" /><div><strong>{user.fullFleet ? "Hele virksomhedens flåde" : "Tilladte afdelinger"}</strong><p>{user.fullFleet ? `${allowed.length} enheder tilgængelige` : `${user.departments.join(" og ")} · ${allowed.length} enheder`}</p><small>Adgangen demonstreres lokalt og skal senere håndhæves af autentifikation og servervalidering.</small></div></section></section> : null}
    {view === "mine" ? <section className="mobile-list-section"><header><h2>Mine indberetninger</h2><span>{own.length} lokale poster</span></header>{own.map((report) => <ReportCard key={report.id} report={report} caseItem={(relations.cases || []).find((item) => item.reportId === report.id)} unit={units.find((item) => item.id === report.unitId)} onOpen={() => onNavigate(`/mobil/mine/${report.id}`)} />)}{!own.length ? <div className="mobile-empty"><Icon name="report" /><h3>Ingen indberetninger endnu</h3><p>Opret den første fra mobilen.</p></div> : null}</section> : null}
    {view === "drafts" ? <section className="mobile-list-section"><header><h2>Gemte kladder</h2><span>Kun {user.name}</span></header>{drafts.map((draft) => { const unit = units.find((item) => item.id === draft.unitId); const available = allowed.some((item) => item.id === draft.unitId); return <button className="mobile-report-card" type="button" key={draft.id} onClick={() => available ? onNavigate(`/mobil/ny?draft=${draft.id}`) : null}><UnitThumbnail unit={unit} /><span><small>{dateTime(draft.updatedAt)}</small><strong>{draft.title || "Ikke navngivet kladde"}</strong><em>{draft.reference} · trin {draft.savedStep || 1}</em></span><b className={available ? "" : "danger-text"}>{available ? "Fortsæt" : "Adgang mangler"}</b><Icon name="chevron" size={16} /></button>; })}{!drafts.length ? <div className="mobile-empty"><Icon name="document" /><h3>Ingen kladder</h3><p>Gemte formularer vises her med billeder og valgt trin.</p></div> : null}</section> : null}
  </main>;
}
