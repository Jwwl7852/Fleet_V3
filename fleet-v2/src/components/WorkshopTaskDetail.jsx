import { useEffect, useMemo, useRef, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { CASE_PRIORITIES, DEMO_ACTORS, REPORT_TYPES, deriveUnitUsability } from "../data/caseWorkflow";
import { WORKSHOP_TASK_STATUSES, WORKSHOP_TASK_TRANSITIONS, workshopTaskRecordedCost } from "../data/workshopWorkflow";
import { formatCurrency, formatMeter, modelLabel } from "../data/unitSelectors";
import { Icon } from "./Icon";
import { ReportImage } from "./ReportImage";
import { UnitThumbnail } from "./UnitThumbnail";
import { documentsForRelation } from "../data/documentWorkflow";

const dateTime = (value) => value ? new Date(value).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Ikke registreret";
const toLocalInput = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

async function imagesFromFiles(files, kind, processor) {
  const selected = [...files];
  if (selected.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) throw new Error("Brug JPG, PNG eller WebP til værkstedsbilleder.");
  if (selected.some((file) => file.size > 10 * 1024 * 1024)) throw new Error("Et billede må højst fylde 10 MB.");
  return Promise.all(selected.map(async (file) => {
    const processed = processor ? await processor(file) : { blob: file, type: file.type, name: file.name };
    return { id: `${kind}-${crypto.randomUUID()}`, blob: processed.blob, type: processed.type || file.type, name: processed.name || file.name, addedAt: new Date().toISOString() };
  }));
}

export function WorkshopTaskDetail({ taskId, onNavigate, imageProcessor }) {
  const { units, relations, loading, updateWorkshopTask } = useFleetData();
  const task = (relations.workshopTasks || []).find((item) => item.id === taskId);
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    if (!task) return;
    setValues({ assigneeId: task.assigneeId || "", workDescription: task.workDescription || "", checklist: task.checklist || [], expectedCompletionAt: toLocalInput(task.expectedCompletionAt), expectedCost: task.expectedCost ?? "", note: "", workLogDescription: "", workLogHours: "", workLogCost: "", materialName: "", materialQuantity: "1", materialCost: "", status: "", reason: "", workPerformed: "", actualEndAt: toLocalInput(new Date().toISOString()), problemResolved: "", usability: "", workType: task.workTypeHint || "repair", serviceTitle: task.workTypeHint === "service" ? task.title : "", meter: "", otherCost: "", beforeImages: task.beforeImages || [], afterImages: task.afterImages || [] });
  }, [task]);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const unit = units.find((item) => item.id === task?.unitId);
  const report = (relations.reports || []).find((item) => item.id === task?.reportId);
  const workshop = (relations.workshops || []).find((item) => item.id === task?.workshopId);
  const booking = (relations.bookings || []).find((item) => item.id === task?.bookingId && item.status !== "cancelled");
  const events = useMemo(() => (relations.workshopEvents || []).filter((item) => item.taskId === taskId).sort((a, b) => b.at.localeCompare(a.at)), [relations.workshopEvents, taskId]);
  const linkedDocuments = documentsForRelation(relations.documents, "workshopTask", taskId);
  const usability = deriveUnitUsability(task?.unitId, relations.reports || [], relations.cases || [], relations.workshopTasks || []);
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser værkstedsopgave …</p></main>;
  if (!task) return <main className="workspace-page not-found-state" id="main-content"><Icon name="warning" size={38} /><span className="eyebrow">FLEET v2 · lokal prototype</span><h1>Værkstedsopgaven findes ikke</h1><p>ID’et <code>{taskId}</code> findes ikke i det lokale datasæt.</p><button className="primary-button" type="button" onClick={() => onNavigate("/vaerksted")}>Tilbage til Værksted</button></main>;
  const upload = async (event, kind) => {
    try { const next = await imagesFromFiles(event.target.files, kind, imageProcessor); set(kind, [...(values[kind] || []), ...next]); setError(""); }
    catch (cause) { setError(cause.message); }
    event.target.value = "";
  };
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      await updateWorkshopTask(task.id, {
        assigneeId: values.assigneeId,
        workDescription: values.workDescription,
        checklist: values.checklist,
        expectedCompletionAt: values.expectedCompletionAt ? new Date(values.expectedCompletionAt).toISOString() : null,
        expectedCost: values.expectedCost,
        note: values.note,
        beforeImages: values.beforeImages,
        afterImages: values.afterImages,
        workLog: values.workLogDescription.trim() ? { description: values.workLogDescription, hours: values.workLogHours, cost: values.workLogCost } : null,
        material: values.materialName.trim() ? { name: values.materialName, quantity: values.materialQuantity, totalCost: values.materialCost } : null,
        status: values.status || undefined,
        reason: values.reason,
        workPerformed: values.workPerformed,
        actualEndAt: values.actualEndAt ? new Date(values.actualEndAt).toISOString() : "",
        problemResolved: values.problemResolved === "yes" ? true : values.problemResolved === "no" ? false : undefined,
        usability: values.usability,
        workType: values.workType,
        serviceTitle: values.serviceTitle,
        meter: values.meter,
        otherCost: values.otherCost,
      }, DEMO_ACTORS[2]);
    } catch (cause) { setError(cause.message || "Opgaven kunne ikke gemmes."); }
    finally { saving.current = false; setBusy(false); }
  };
  const terminal = ["completed", "cancelled"].includes(task.status);
  const completing = values.status === "completed";
  return <main className="workspace-page workshop-task-page" id="main-content">
    <div className="profile-breadcrumb"><button type="button" onClick={() => onNavigate("/vaerksted")}>Værksted</button><Icon name="chevron" size={13} /><span>{task.number}</span><em>Lokal prototype</em></div>
    <header className="workshop-task-hero"><div><span className="eyebrow">{task.reference} · {task.number} · {CASE_PRIORITIES[task.priority]} prioritet</span><h1>{task.title}</h1><p>Oprettet {dateTime(task.createdAt)} · Senest opdateret {dateTime(task.updatedAt)}</p></div><div className="page-actions"><span className={`workshop-status ${task.status}`}>{WORKSHOP_TASK_STATUSES[task.status]}</span><button className="secondary-button" type="button" onClick={() => onNavigate(`/sager/${task.caseId}`)}>Åbn sagsmappe</button><button className="primary-button" type="button" onClick={() => onNavigate(`/vaerksted/kalender?task=${task.id}`)}><Icon name="service" size={16} />{booking ? "Redigér booking" : "Book tid"}</button></div></header>
    <section className="workshop-task-kpis"><article><span>Enhed</span><strong>{unit?.number}</strong><small>{modelLabel(unit || {})}</small></article><article><span>Anvendelighed</span><strong className={usability.tone}>{usability.label}</strong><small>adskilt fra driftsstatus</small></article><article><span>Værksted</span><strong>{workshop?.name}</strong><small>{workshop?.kind === "external" ? "Eksternt · lokalt registreret" : "Internt"}</small></article><article><span>Booking</span><strong>{dateTime(booking?.startAt)}</strong><small>{booking?.status === "confirmed" ? "Bekræftet aftale" : booking ? "Ønsket tid" : "Ingen booking"}</small></article><article><span>{task.workshopKind === "external" ? "Foreløbigt registreret" : "Faktisk intern omkostning"}</span><strong>{workshopTaskRecordedCost(task) ? formatCurrency.format(workshopTaskRecordedCost(task)) : "Ukendt"}</strong><small>{task.workshopKind === "external" ? "Ikke fakturakontrolleret" : `Estimat: ${task.expectedCost == null ? "Ukendt" : formatCurrency.format(task.expectedCost)}`}</small></article></section>
    <div className="workshop-task-grid">
      <section className="workshop-card task-origin"><header><h2>{report ? "Enhed og oprindelig indberetning" : "Enhed og servicegrundlag"}</h2></header><div className="task-unit"><UnitThumbnail unit={unit} /><div><strong>{unit.number} · {modelLabel(unit)}</strong><span>{formatMeter(unit)}</span><button className="link-button" type="button" onClick={() => onNavigate(`/enheder/${unit.id}`)}>Åbn enhedsprofil</button></div></div>{report ? <><div className="report-summary"><span>{report.number} · {REPORT_TYPES[report.type]}</span><h3>{report.title}</h3><p>{report.description}</p><small>Oprindelig anvendelighed: {report.usability === "blocked" ? "Kan ikke bruges" : report.usability === "uncertain" ? "Usikker" : "Kan bruges"}</small></div>{report.images?.length ? <div className="task-images">{report.images.map((image, index) => <ReportImage image={image} alt={`Indberetningsbillede ${index + 1}`} key={image.id} />)}</div> : <p className="muted">Ingen billeder på indberetningen.</p>}</> : <div className="report-summary"><span>Servicekrav · ingen fiktiv indberetning</span><h3>{task.title}</h3><p>{task.workDescription}</p><button className="link-button" type="button" onClick={() => onNavigate("/service")}>Åbn Service</button></div>}</section>
      <section className="workshop-card"><header><h2>Arbejde og tjekliste</h2></header><label>Arbejdsbeskrivelse<textarea aria-label="Redigér arbejdsbeskrivelse" rows="4" value={values.workDescription || ""} onChange={(event) => set("workDescription", event.target.value)} disabled={terminal} /></label><div className="task-checklist">{(values.checklist || []).map((item) => <label key={item.id}><input type="checkbox" checked={item.done} disabled={terminal} onChange={(event) => setValues((current) => ({ ...current, checklist: current.checklist.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry) }))} />{item.text}</label>)}</div><label>Intern note<textarea aria-label="Værkstedsnote" rows="2" value={values.note || ""} onChange={(event) => set("note", event.target.value)} disabled={terminal} /></label></section>
      <section className="workshop-card"><header><h2>Udførelse og materialer</h2></header><div className="workshop-form-grid"><label className="span-2">Udført aktivitet<input aria-label="Udført aktivitet" value={values.workLogDescription || ""} onChange={(event) => set("workLogDescription", event.target.value)} disabled={terminal} /></label><label>Timer<input aria-label="Tidsforbrug" type="number" min="0" step="0.25" value={values.workLogHours || ""} onChange={(event) => set("workLogHours", event.target.value)} disabled={terminal} /></label><label>Arbejdsløn ekskl. moms<input aria-label="Arbejdsløn" type="number" min="0" step="0.01" value={values.workLogCost || ""} onChange={(event) => set("workLogCost", event.target.value)} disabled={terminal} /></label><label>Materiale<input aria-label="Materiale" value={values.materialName || ""} onChange={(event) => set("materialName", event.target.value)} disabled={terminal} /></label><label>Materialepris ekskl. moms<input aria-label="Materialepris" type="number" min="0" step="0.01" value={values.materialCost || ""} onChange={(event) => set("materialCost", event.target.value)} disabled={terminal} /></label></div><div className="cost-lines"><span>Registreret arbejde <strong>{formatCurrency.format(task.workLogs.reduce((sum, item) => sum + (item.cost || 0), 0))}</strong></span><span>Registrerede materialer <strong>{formatCurrency.format(task.materials.reduce((sum, item) => sum + (item.totalCost || 0), 0))}</strong></span></div></section>
      <section className="workshop-card"><header><h2>Dokumentation før og efter</h2></header><div className="workshop-image-columns">{["beforeImages", "afterImages"].map((kind) => <div key={kind}><strong>{kind === "beforeImages" ? "Før arbejdet" : "Efter arbejdet"}</strong><label className="image-upload-small"><Icon name="upload" /><span>Tilføj billeder</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" onChange={(event) => upload(event, kind)} disabled={terminal} /></label><div>{(values[kind] || []).map((image, index) => <span className="task-image-edit" key={image.id}><ReportImage image={image} alt={`${kind === "beforeImages" ? "Før" : "Efter"} ${index + 1}`} /><button type="button" aria-label={`Fjern ${kind === "beforeImages" ? "før" : "efter"}-billede ${index + 1}`} onClick={() => set(kind, values[kind].filter((item) => item.id !== image.id))}>×</button></span>)}</div></div>)}</div></section>
      <section className="workshop-card task-documents"><header><h2>Dokumentregister</h2><button className="secondary-button compact" type="button" onClick={() => onNavigate("/dokumenter")}>Åbn alle</button></header>{linkedDocuments.length ? <div className="case-document-links">{linkedDocuments.map((document) => <button className="link-button" type="button" key={document.id} onClick={() => onNavigate(`/dokumenter/${document.id}`)}><Icon name="document" size={14} />{document.title}</button>)}</div> : <p className="muted">Ingen dokumenter er knyttet direkte til opgaven.</p>}</section>
      <section className="workshop-card task-history"><header><h2>Fælles hændelseshistorik</h2></header><div className="compact-timeline">{events.map((event) => <article key={event.id}><span><Icon name="clock" size={14} /></span><div><strong>{event.title}</strong><p>{event.text}</p><small>{dateTime(event.at)} · {event.actorName}</small></div></article>)}</div></section>
      <aside className="workshop-card task-actions"><header><h2>Status og afslutning</h2></header><label>Ansvarlig<select aria-label="Opgaveansvarlig" value={values.assigneeId || ""} onChange={(event) => set("assigneeId", event.target.value)} disabled={terminal}>{DEMO_ACTORS.slice(1).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Forventet færdig<input aria-label="Opgavens forventede færdig" type="datetime-local" value={values.expectedCompletionAt || ""} onChange={(event) => set("expectedCompletionAt", event.target.value)} disabled={terminal} /></label><label>Estimat ekskl. moms<input aria-label="Opgavens estimat" inputMode="decimal" value={values.expectedCost ?? ""} onChange={(event) => set("expectedCost", event.target.value.replace(",", "."))} disabled={terminal} /></label>{!terminal ? <label>Næste status<select aria-label="Værkstedsstatus" value={values.status || ""} onChange={(event) => set("status", event.target.value)}><option value="">Behold {WORKSHOP_TASK_STATUSES[task.status]}</option>{WORKSHOP_TASK_TRANSITIONS[task.status].map((status) => <option value={status} key={status}>{WORKSHOP_TASK_STATUSES[status]}</option>)}</select></label> : null}{values.status === "cancelled" ? <label>Begrundelse<textarea aria-label="Annulleringsbegrundelse" rows="3" value={values.reason || ""} onChange={(event) => set("reason", event.target.value)} /></label> : null}{completing ? <fieldset className="completion-fields"><legend>Afslut arbejdet</legend><label>Udført arbejde<textarea aria-label="Beskrivelse af udført arbejde" rows="4" value={values.workPerformed || ""} onChange={(event) => set("workPerformed", event.target.value)} /></label><label>Faktisk afsluttet<input aria-label="Faktisk afslutning" type="datetime-local" value={values.actualEndAt || ""} onChange={(event) => set("actualEndAt", event.target.value)} /></label><label>Er problemet løst?<select aria-label="Problem løst" value={values.problemResolved || ""} onChange={(event) => set("problemResolved", event.target.value)}><option value="">Vælg …</option><option value="yes">Ja</option><option value="no">Nej</option></select></label><label>Anvendelighed efter arbejdet<select aria-label="Anvendelighed efter arbejde" value={values.usability || ""} onChange={(event) => set("usability", event.target.value)}><option value="">Vælg …</option><option value="usable">Kan bruges</option><option value="uncertain">Usikker</option><option value="blocked">Kan ikke bruges</option></select></label><label>Arbejdstype<select aria-label="Arbejdstype" value={values.workType || "repair"} onChange={(event) => set("workType", event.target.value)}><option value="repair">Reparation</option><option value="service">Service</option></select></label>{values.workType === "service" ? <><label>Servicepostens titel<input aria-label="Servicepostens titel" value={values.serviceTitle || ""} onChange={(event) => set("serviceTitle", event.target.value)} /></label><label>Målerstand<input aria-label="Service målerstand" type="number" min="0" value={values.meter || ""} onChange={(event) => set("meter", event.target.value)} /></label></> : null}<label>Øvrig faktisk omkostning<input aria-label="Øvrig omkostning" type="number" min="0" step="0.01" value={values.otherCost || ""} onChange={(event) => set("otherCost", event.target.value)} /></label></fieldset> : null}{error ? <div className="form-alert danger" role="alert">{error}</div> : null}<button className="primary-button full" type="button" onClick={save} disabled={busy || terminal}><Icon name="check" size={16} />{busy ? "Gemmer …" : terminal ? "Opgaven er lukket" : "Gem opgave"}</button><small className="prototype-note">Intet sendes til eksterne værksteder i denne prototype.</small></aside>
    </div>
  </main>;
}
