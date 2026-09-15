import { useEffect, useMemo, useRef, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { buildWorkshopMail } from "../data/caseFolderWorkflow";
import { DEMO_ACTORS } from "../data/caseWorkflow";
import { modelLabel } from "../data/unitSelectors";
import { selectableWorkshops } from "../data/supplierWorkshopAdapter";
import { workshopAssignmentDraftKey } from "../data/supplierReturn";
import { Icon } from "./Icon";
import { ReportImage } from "./ReportImage";
import { UnitThumbnail } from "./UnitThumbnail";

const fallbackContacts = {
  "workshop-internal-east": { name: "Veyro intern booking", email: "intern.demo@veyro.invalid" },
  "workshop-internal-west": { name: "Veyro intern booking", email: "intern-vest.demo@veyro.invalid" },
  "workshop-external-volvo": { name: "Mikkel Sørensen · demo-kontakt", email: "vaerksted.demo@example.invalid" },
};

const EMPTY_VALUES = { mode: "quote", workshopId: "", recipient: "", subject: "", body: "", selectedAttachmentIds: [], communicationMode: "draft", noMailReason: "", workDescription: "" };

function readDraft(key) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? { ...EMPTY_VALUES, ...parsed } : null;
  } catch {
    return null;
  }
}

export function WorkshopAssignment({ caseId, canCreateSupplier = false, onCreateSupplier, onNavigate, onBack = onNavigate, selectedSupplierId = "" }) {
  const { units, relations, saveWorkshopOrder, loading, tenantId } = useFleetData();
  const caseItem = (relations.cases || []).find((item) => item.id === caseId);
  const unit = units.find((item) => item.id === caseItem?.unitId);
  const report = (relations.reports || []).find((item) => item.id === caseItem?.reportId);
  const existing = (relations.workshopOrders || []).filter((item) => item.caseId === caseId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const workshops = useMemo(
    () => selectableWorkshops(relations.workshops, existing?.workshopId || caseItem?.vendorId),
    [relations.workshops, existing?.workshopId, caseItem?.vendorId],
  );
  const firstWorkshopId = workshops.find((item) => item.kind === "external")?.id || workshops[0]?.id || "";
  const contactEmail = (workshopId) => (relations.workshops || []).find((item) => item.id === workshopId)?.email || fallbackContacts[workshopId]?.email || "";
  const draftKey = workshopAssignmentDraftKey(tenantId, caseId);
  const restoredDraft = useRef(readDraft(draftKey));
  const initialized = useRef(false);
  const [values, setValues] = useState(() => restoredDraft.current || EMPTY_VALUES);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const clientOrderId = useRef(crypto.randomUUID());
  const images = useMemo(() => report?.images || [], [report]);
  useEffect(() => {
    if (!caseItem || !unit || initialized.current) return;
    initialized.current = true;
    if (restoredDraft.current) return;
    if (existing) { setValues({ ...EMPTY_VALUES, ...existing, selectedAttachmentIds: existing.selectedAttachmentIds || [] }); return; }
    const generated = buildWorkshopMail({ caseItem, unit, orderReference: caseItem.orderReference, mode: "quote", workDescription: report?.description || caseItem.description, vendorContact: caseItem.vendorContact });
    const workshopId = caseItem.vendorId || firstWorkshopId;
    setValues((current) => ({ ...current, workshopId, recipient: contactEmail(workshopId), subject: generated.subject, body: generated.body, workDescription: report?.description || caseItem.description || "", selectedAttachmentIds: images.map((item) => item.id) }));
  }, [caseItem, unit, report, existing, images, firstWorkshopId]);
  useEffect(() => {
    if (!selectedSupplierId || !workshops.some((item) => item.id === selectedSupplierId)) return;
    setValues((current) => ({ ...current, workshopId: selectedSupplierId, recipient: contactEmail(selectedSupplierId) }));
  }, [selectedSupplierId, workshops]);
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /></main>;
  if (!caseItem || !unit) return <main className="workspace-page not-found-state" id="main-content"><Icon name="warning" size={38} /><h1>Sagen findes ikke</h1><button className="primary-button" onClick={() => onBack("/arbejdsko")} type="button">Til Arbejdskø</button></main>;
  if (caseItem.readOnly) return <main className="workspace-page not-found-state" id="main-content"><Icon name="warning" size={38} /><span className="eyebrow">Serverstyret servicesag</span><h1>Værkstedsbehandling er ikke tilsluttet</h1><p>Sagen vises fra serveren og må ikke få et lokalt værkstedsudkast. Brug den fælles sagsadapter, når den er tilgængelig.</p><button className="primary-button" onClick={() => onBack(`/sager/${caseId}`)} type="button">Tilbage til sagsmappe</button></main>;
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const regenerate = (mode = values.mode, workshopId = values.workshopId) => {
    const generated = buildWorkshopMail({ caseItem, unit, orderReference: existing?.reference || caseItem.orderReference, mode, workDescription: values.workDescription, vendorContact: caseItem.vendorContact });
    setValues((current) => ({ ...current, mode, workshopId, recipient: contactEmail(workshopId), subject: generated.subject, body: generated.body }));
  };
  const save = async (noMail = false) => {
    setBusy(true); setMessage("");
    try {
      const result = await saveWorkshopOrder(caseId, { ...values, id: existing?.id, clientOrderId: clientOrderId.current, communicationMode: noMail ? "no_mail" : "draft" }, DEMO_ACTORS[1]);
      setValues((current) => ({ ...current, ...result.order }));
      window.sessionStorage.removeItem(draftKey);
      setMessage(noMail ? "Værkstedsvalget er gemt uden mail. Intet er sendt." : `Mailudkast ${result.order.reference} v${result.order.version} er gemt lokalt. Intet er sendt.`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); setMessage(`${label} kopieret.`); } catch { setMessage("Browseren tillod ikke kopiering. Markér teksten manuelt."); } };
  const download = (image) => { const url = URL.createObjectURL(image.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = image.name || `${caseItem.reference}-${image.id}.jpg`; anchor.click(); URL.revokeObjectURL(url); };
  const createSupplier = () => {
    if (!canCreateSupplier || !onCreateSupplier) return;
    window.sessionStorage.setItem(draftKey, JSON.stringify(values));
    onCreateSupplier();
  };
  return <main className="workspace-page assignment-page" id="main-content">
    <div className="profile-breadcrumb"><button onClick={() => onBack(`/sager/${caseId}`)} type="button">Sagsmappe</button><Icon name="chevron" size={13} /><span>Klargør værkstedsmail</span><em>Lokal prototype</em></div>
    <header className="page-heading-row"><div><span className="eyebrow">{caseItem.reference} · {caseItem.number}</span><h1>Tildel værksted og klargør mail</h1><p>Mailafsendelse er ikke tilsluttet. Et gemt udkast markeres aldrig som sendt.</p></div><button className="secondary-button" onClick={() => onBack(`/sager/${caseId}`)} type="button">Tilbage til sag</button></header>
    <div className="assignment-grid"><section className="assignment-main"><article className="case-summary-card"><UnitThumbnail unit={unit} /><div><strong>{unit.number} · {modelLabel(unit)}</strong><span>{unit.registration || "Ingen registrering"}</span><small>{report?.title || caseItem.title}</small></div><b>{caseItem.reference}</b></article>
      <section className="folder-card"><h2>1. Vælg formål og værksted</h2><div className="mode-switch"><button type="button" className={values.mode === "quote" ? "active" : ""} onClick={() => regenerate("quote")}>Anmod om tilbud</button><button type="button" className={values.mode === "order" ? "active" : ""} onClick={() => regenerate("order")}>Bestil arbejde</button></div><div className="form-two-cols"><label>Værksted<select value={values.workshopId} onChange={(event) => regenerate(values.mode, event.target.value)}>{workshops.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.kind === "external" ? "Ekstern" : "Intern"}</option>)}</select></label><label>Kontakt og modtager<input aria-label="Mailmodtager" value={values.recipient || ""} onChange={(event) => set("recipient", event.target.value)} /></label><label className="span-all">Arbejdsbeskrivelse<textarea aria-label="Arbejdsbeskrivelse" rows="3" value={values.workDescription || ""} onChange={(event) => set("workDescription", event.target.value)} /></label></div><div className="inline-actions"><button className="secondary-button" type="button" disabled={!canCreateSupplier || !onCreateSupplier} onClick={createSupplier} title={canCreateSupplier ? "Opret et værksted i det fælles leverandørregister." : "Kræver leverandoerer.skriv."}>Opret leverandør</button><small>{canCreateSupplier ? "Sagsudkastet bevares, mens leverandøren oprettes." : "En bruger med adgang til leverandørregisteret skal oprette værkstedet."}</small></div></section>
      <section className="folder-card"><header className="card-action-head"><h2>2. Redigér mailudkast</h2><span className="integration-badge">Ikke tilsluttet</span></header><label className="standalone-label">Emne<input aria-label="Mailemne" value={values.subject || ""} onChange={(event) => set("subject", event.target.value)} /></label><label className="standalone-label">Mailtekst<textarea aria-label="Mailtekst" rows="14" value={values.body || ""} onChange={(event) => set("body", event.target.value)} /></label><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => copy(values.subject, "Emne")}>Kopiér emne</button><button className="secondary-button" type="button" onClick={() => copy(values.body, "Mailtekst")}>Kopiér tekst</button><button className="secondary-button" type="button" onClick={() => regenerate()}>Gendan forslag</button></div></section>
    </section><aside className="assignment-aside"><section className="folder-card"><h2>3. Vælg skadesbilleder</h2><p className="muted">Kun indberetningens billeder foreslås. Modpart, vidner, personskade og forsikringsfelter vedhæftes ikke automatisk.</p>{images.length ? <div className="attachment-picker">{images.map((image, index) => <article key={image.id}><ReportImage image={image} alt={`Skadesbillede ${index + 1}`} /><label><input type="checkbox" checked={values.selectedAttachmentIds?.includes(image.id)} onChange={(event) => set("selectedAttachmentIds", event.target.checked ? [...(values.selectedAttachmentIds || []), image.id] : values.selectedAttachmentIds.filter((id) => id !== image.id))} />Vedhæft billede {index + 1}</label><button type="button" onClick={() => download(image)}>Download</button></article>)}</div> : <div className="empty-inline"><p>Ingen skadesbilleder på sagen.</p></div>}</section><section className="folder-card"><h2>Gem lokalt</h2><button className="primary-button full" type="button" disabled={busy} onClick={() => save(false)}>{busy ? "Gemmer …" : "Gem mailudkast"}</button><label className="standalone-label">Bemærkning ved aftale uden mail<textarea aria-label="Bemærkning uden mail" rows="3" value={values.noMailReason || ""} onChange={(event) => set("noMailReason", event.target.value)} placeholder="Fx aftalt telefonisk" /></label><button className="secondary-button full" type="button" disabled={busy} onClick={() => save(true)}>Gem uden mail</button>{message ? <div className="form-alert warning" role="status">{message}</div> : null}<small className="prototype-note">Afsender-interface: kladde, afsendelse, sendt og fejl. Kun kladde er aktiv i denne etape.</small></section></aside></div>
  </main>;
}
