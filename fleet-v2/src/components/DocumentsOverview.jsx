import { useEffect, useMemo, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { DEMO_ACTORS } from "../data/caseWorkflow";
import { DOCUMENT_CATEGORIES, DOCUMENT_RELATION_TYPES, documentFileKind, documentValidity, resolveDocumentVersion } from "../data/documentWorkflow";
import { modelLabel } from "../data/unitSelectors";
import { Icon } from "./Icon";

const dateLabel = (value) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleString("da-DK", value.length === 10 ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }) : "—";
const sizeLabel = (value) => Number.isFinite(value) ? value >= 1024 * 1024 ? `${(value / 1024 / 1024).toLocaleString("da-DK", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(value / 1024)).toLocaleString("da-DK")} KB` : "Fil ikke tilgængelig";

function relationLabel(relation, units, relations) {
  if (relation.type === "unit") { const item = units.find((entry) => entry.id === relation.targetId); return item ? `${item.number} · ${modelLabel(item)}` : relation.targetId; }
  if (relation.type === "case") { const item = (relations.cases || []).find((entry) => entry.id === relation.targetId); return item?.reference || item?.number || relation.targetId; }
  if (relation.type === "workshopTask") { const item = (relations.workshopTasks || []).find((entry) => entry.id === relation.targetId); return item ? `${item.number} · ${item.title}` : relation.targetId; }
  if (relation.type === "serviceRequirement") { const item = (relations.serviceRequirements || []).find((entry) => entry.id === relation.targetId); return item?.title || relation.targetId; }
  if (relation.type === "serviceRecord") { const item = (relations.service || []).find((entry) => entry.id === relation.targetId); return item?.title || relation.targetId; }
  if (relation.type === "lease") { const item = (relations.leases || []).find((entry) => entry.id === relation.targetId); return item?.agreementNumber || relation.targetId; }
  return relation.targetId;
}

function DocumentPreview({ document, dataset, versionId }) {
  const version = resolveDocumentVersion(document, dataset, versionId);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!version?.blob) { setUrl(""); return undefined; }
    const next = URL.createObjectURL(version.blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [version?.blob]);
  if (!version?.available) return <div className="document-missing"><Icon name="warning" size={26} /><strong>Filen er ikke tilgængelig lokalt</strong><p>Metadata og relationer er bevaret. Der er ikke oprettet en fiktiv fil.</p></div>;
  const kind = documentFileKind(version.mimeType);
  if (kind === "image") return <img className="document-image-preview" src={url} alt={`Forhåndsvisning af ${document.title}`} />;
  if (kind === "pdf") return <object className="document-pdf-preview" data={url} type="application/pdf"><p>PDF-forhåndsvisning understøttes ikke. Brug download.</p></object>;
  if (kind === "video") return <video className="document-video-preview" src={url} controls preload="metadata"><track kind="captions" /></video>;
  return <div className="document-missing"><Icon name="document" /><strong>Ingen forhåndsvisning</strong><p>Download filen for at åbne den.</p></div>;
}

function RelationFields({ units, relations, values, setValues }) {
  const toggle = (type, targetId) => {
    const exists = values.some((item) => item.type === type && item.targetId === targetId);
    setValues(exists ? values.filter((item) => !(item.type === type && item.targetId === targetId)) : [...values, { type, targetId }]);
  };
  const groups = [
    ["unit", units.map((item) => [item.id, `${item.number} · ${modelLabel(item)}`])],
    ["case", (relations.cases || []).map((item) => [item.id, item.reference || item.number])],
    ["workshopTask", (relations.workshopTasks || []).map((item) => [item.id, `${item.number} · ${item.title}`])],
    ["serviceRequirement", (relations.serviceRequirements || []).map((item) => [item.id, item.title])],
    ["serviceRecord", (relations.service || []).map((item) => [item.id, item.title])],
    ["lease", (relations.leases || []).map((item) => [item.id, item.agreementNumber])],
  ];
  return <div className="document-relations-editor">{groups.map(([type, items]) => items.length ? <details key={type}><summary>{DOCUMENT_RELATION_TYPES[type]} <span>{values.filter((item) => item.type === type).length || ""}</span></summary><div>{items.map(([targetId, label]) => <label key={targetId}><input type="checkbox" checked={values.some((item) => item.type === type && item.targetId === targetId)} onChange={() => toggle(type, targetId)} />{label}</label>)}</div></details> : null)}</div>;
}

const emptyForm = { title: "", category: "other", note: "", validFrom: "", expiresAt: "", reminderDays: "30", relations: [], files: [] };

function DocumentDialog({ mode, document, units, relations, onClose, onUpload, onUpdate, onReplace }) {
  const [values, setValues] = useState(document ? { title: document.title, category: document.category, note: document.note || "", validFrom: document.validFrom || "", expiresAt: document.expiresAt || "", reminderDays: document.reminderDays ?? "30", relations: document.relations.map(({ type, targetId }) => ({ type, targetId })), files: [] } : emptyForm);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (mode === "upload") await onUpload(values);
      else if (mode === "replace") { if (!values.files[0]) throw new Error("Vælg den nye filversion."); await onReplace(values.files[0]); }
      else await onUpdate(values);
      onClose();
    } catch (cause) { setError(cause.message || "Dokumentet kunne ikke gemmes lokalt."); }
    finally { setBusy(false); }
  };
  return <div className="dialog-backdrop" role="presentation"><form className="unit-dialog document-dialog" role="dialog" aria-modal="true" aria-labelledby="document-dialog-title" onSubmit={submit}><header><div><span className="eyebrow">FLEET v2 · lokal prototypelagring</span><h2 id="document-dialog-title">{mode === "upload" ? "Upload dokumenter" : mode === "replace" ? "Ny dokumentversion" : "Redigér metadata og relationer"}</h2></div><button type="button" aria-label="Luk" onClick={onClose}><Icon name="close" /></button></header><div className="document-dialog-body">
    {mode !== "edit" ? <label className="document-file-drop"><Icon name="upload" size={25} /><strong>{mode === "replace" ? "Vælg erstatningsfil" : "Vælg en eller flere filer"}</strong><small>PDF, JPG, PNG og WebP maks. 20 MB · MP4, WebM og MOV maks. 100 MB</small><input aria-label="Dokumentfiler" type="file" multiple={mode === "upload"} accept="application/pdf,image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(event) => set("files", [...event.target.files])} /></label> : null}
    {mode !== "replace" ? <><div className="form-two-cols"><label>Titel{mode === "upload" ? " (valgfri ved én fil)" : ""}<input aria-label="Dokumenttitel" value={values.title} onChange={(event) => set("title", event.target.value)} /></label><label>Kategori<select aria-label="Dokumentkategori" value={values.category} onChange={(event) => set("category", event.target.value)}>{Object.entries(DOCUMENT_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Gyldig fra<input aria-label="Gyldig fra" type="date" value={values.validFrom} onChange={(event) => set("validFrom", event.target.value)} /></label><label>Udløbsdato<input aria-label="Udløbsdato" type="date" value={values.expiresAt} onChange={(event) => set("expiresAt", event.target.value)} /></label><label>Varsling før udløb (dage)<input aria-label="Varslingsfrist" type="number" min="0" value={values.reminderDays} onChange={(event) => set("reminderDays", event.target.value)} /></label><label className="span-all">Bemærkning<textarea aria-label="Dokumentbemærkning" rows="3" value={values.note} onChange={(event) => set("note", event.target.value)} /></label></div><section><h3>Tilknytninger</h3><p className="muted">Samme dokument kan knyttes flere steder uden at filen kopieres.</p><RelationFields units={units} relations={relations} values={values.relations} setValues={(next) => set("relations", next)} /></section></> : null}
    {values.files.length ? <div className="document-selected-files">{values.files.map((file) => <span key={`${file.name}-${file.size}`}><Icon name="document" size={15} />{file.name}<small>{sizeLabel(file.size)}</small></span>)}</div> : null}
    {error ? <div className="form-alert danger" role="alert">{error}</div> : null}
  </div><footer><button className="secondary-button" type="button" onClick={onClose}>Annullér</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Gemmer lokalt …" : mode === "upload" ? "Upload" : mode === "replace" ? "Opret version" : "Gem ændringer"}</button></footer></form></div>;
}

function DocumentDetail({ document, dataset, units, relations, onNavigate, actions }) {
  const [selectedVersion, setSelectedVersion] = useState(document?.currentVersionId);
  useEffect(() => setSelectedVersion(document?.currentVersionId), [document?.id, document?.currentVersionId]);
  if (!document) return <section className="document-not-found"><Icon name="warning" size={34} /><h2>Dokumentet findes ikke</h2><p>ID’et findes ikke i det lokale dokumentregister.</p><button className="secondary-button" type="button" onClick={() => onNavigate("/dokumenter")}>Til dokumentoversigten</button></section>;
  const version = resolveDocumentVersion(document, dataset, selectedVersion);
  const download = () => {
    if (!version?.blob) return;
    const url = URL.createObjectURL(version.blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = version.fileName || document.title; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const validity = documentValidity(document);
  return <section className="document-detail"><header><button className="mobile-back" type="button" onClick={() => onNavigate("/dokumenter")}><Icon name="chevron" size={14} />Dokumenter</button><div><span className="eyebrow">{DOCUMENT_CATEGORIES[document.category]} · {document.originLabel}</span><h2>{document.title}</h2><p>{version?.fileName} · {sizeLabel(version?.size)} · version {version?.version}</p></div><div className="document-detail-actions"><button className="secondary-button" type="button" onClick={actions.edit}><Icon name="edit" size={15} />Redigér</button><button className="secondary-button" type="button" onClick={actions.replace}><Icon name="upload" size={15} />Ny version</button><button className="primary-button" type="button" disabled={!version?.available} onClick={download}><Icon name="download" size={15} />Download</button></div></header>
    {document.archivedAt ? <div className="document-archive-banner"><Icon name="archive" /><span><strong>Dokumentet er arkiveret</strong><small>{dateLabel(document.archivedAt)}</small></span><button className="secondary-button compact" type="button" onClick={actions.restore}>Gendan</button></div> : null}
    <div className="document-detail-grid"><div className="document-preview-card"><DocumentPreview document={document} dataset={dataset} versionId={selectedVersion} /></div><aside><section className="document-meta-card"><h3>Metadata</h3><dl><div><dt>Status</dt><dd><span className={`document-validity ${validity.key}`}>{validity.label}</span></dd></div><div><dt>Uploadet</dt><dd>{dateLabel(document.createdAt)}</dd></div><div><dt>Gyldig fra</dt><dd>{dateLabel(document.validFrom)}</dd></div><div><dt>Udløber</dt><dd>{dateLabel(document.expiresAt)}</dd></div><div><dt>Bemærkning</dt><dd>{document.note || "Ingen bemærkning"}</dd></div></dl></section><section className="document-meta-card"><h3>Tilknytninger</h3>{document.relations.length ? <div className="document-relation-list">{document.relations.map((item) => <article key={item.id}><span><small>{DOCUMENT_RELATION_TYPES[item.type]}</small><strong>{relationLabel(item, units, relations)}</strong></span><button type="button" onClick={() => actions.removeRelation(item)} aria-label={`Fjern tilknytning til ${relationLabel(item, units, relations)}`}><Icon name="close" size={13} /></button></article>)}</div> : <p className="muted">Dokumentet har ingen aktive tilknytninger.</p>}</section></aside></div>
    <section className="document-version-card"><header><h3>Versionshistorik</h3><span>{document.versions.length} versioner</span></header>{[...document.versions].sort((a,b) => b.version - a.version).map((item) => <button type="button" key={item.id} className={selectedVersion === item.id ? "is-active" : ""} onClick={() => setSelectedVersion(item.id)}><span><strong>Version {item.version}</strong><small>{item.fileName} · {sizeLabel(item.size)}</small></span><span>{dateLabel(item.uploadedAt)}{item.id === document.currentVersionId ? <em>Aktuel</em> : null}</span></button>)}</section>
    {!document.archivedAt ? <button className="danger-link" type="button" onClick={actions.archive}>Arkivér dokument</button> : null}
  </section>;
}

export function DocumentsOverview({ documentId, onNavigate }) {
  const data = useFleetData(); const { dataset, units, relations, loading } = data;
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("all"); const [unitId, setUnitId] = useState("all"); const [department, setDepartment] = useState("all"); const [relationType, setRelationType] = useState("all"); const [validity, setValidity] = useState("all"); const [archive, setArchive] = useState("active"); const [sort, setSort] = useState("uploaded-desc");
  const [dialog, setDialog] = useState(null); const [message, setMessage] = useState("");
  const documents = relations.documents || [];
  const filtered = useMemo(() => documents.filter((document) => {
    const linkedUnits = document.relations.filter((item) => item.type === "unit").map((item) => units.find((unit) => unit.id === item.targetId)).filter(Boolean);
    const linkedCases = document.relations.filter((item) => item.type === "case").map((item) => (relations.cases || []).find((entry) => entry.id === item.targetId)).filter(Boolean);
    const current = document.versions.find((item) => item.id === document.currentVersionId);
    const haystack = [document.title, current?.fileName, ...linkedUnits.flatMap((item) => [item.number, item.registration]), ...linkedCases.flatMap((item) => [item.reference, item.number])].filter(Boolean).join(" ").toLocaleLowerCase("da-DK");
    const state = documentValidity(document).key;
    return (!query || haystack.includes(query.toLocaleLowerCase("da-DK"))) && (category === "all" || document.category === category) && (unitId === "all" || document.relations.some((item) => item.type === "unit" && item.targetId === unitId)) && (department === "all" || linkedUnits.some((item) => item.department === department)) && (relationType === "all" || document.relations.some((item) => item.type === relationType)) && (validity === "all" || state === validity) && (archive === "all" || (archive === "archived") === Boolean(document.archivedAt));
  }).sort((a,b) => sort === "title" ? a.title.localeCompare(b.title, "da") : sort === "expiry" ? (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999") : b.createdAt.localeCompare(a.createdAt)), [documents, units, relations.cases, query, category, unitId, department, relationType, validity, archive, sort]);
  const selected = documents.find((item) => item.id === documentId);
  const actor = DEMO_ACTORS[1];
  const run = async (action, success) => { try { await action(); setMessage(success); } catch (cause) { setMessage(cause.message); throw cause; } };
  const reset = () => { setQuery(""); setCategory("all"); setUnitId("all"); setDepartment("all"); setRelationType("all"); setValidity("all"); setArchive("active"); };
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser dokumentregister …</p></main>;
  return <main className={`workspace-page documents-page${documentId ? " has-detail" : ""}`} id="main-content">
    <header className="page-heading documents-heading"><div><span className="eyebrow">FLEET v2 · lokale prototypedata</span><h1>Dokumenter</h1><p>Fælles register for enheder, sager, værksted og service. Ingen fakturabehandling.</p></div><button className="primary-button" type="button" onClick={() => setDialog({ mode: "upload" })}><Icon name="upload" size={16} />Upload dokumenter</button></header>
    <section className="document-toolbar"><div className="catalog-search"><Icon name="search" size={16} /><input aria-label="Søg i dokumenter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel, filnavn, enhed eller sagsreference …" /></div><select aria-label="Filtrér dokumentkategori" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Alle kategorier</option>{Object.entries(DOCUMENT_CATEGORIES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Filtrér dokumentenhed" value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="all">Alle enheder</option>{units.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select><select aria-label="Filtrér dokumentafdeling" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">Alle afdelinger</option>{[...new Set(units.map((item) => item.department))].sort().map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filtrér dokumenttilknytning" value={relationType} onChange={(event) => setRelationType(event.target.value)}><option value="all">Alle tilknytninger</option>{Object.entries(DOCUMENT_RELATION_TYPES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Filtrér dokumentgyldighed" value={validity} onChange={(event) => setValidity(event.target.value)}><option value="all">Alle gyldigheder</option><option value="valid">Gyldigt</option><option value="expiring">Udløber snart</option><option value="expired">Udløbet</option><option value="future">Endnu ikke gyldigt</option><option value="none">Ingen udløbsdato</option></select><select aria-label="Filtrér dokumentarkiv" value={archive} onChange={(event) => setArchive(event.target.value)}><option value="active">Aktive</option><option value="archived">Arkiverede</option><option value="all">Alle inkl. arkiv</option></select><select aria-label="Sortér dokumenter" value={sort} onChange={(event) => setSort(event.target.value)}><option value="uploaded-desc">Nyeste upload</option><option value="title">Titel</option><option value="expiry">Udløbsdato</option></select><button className="link-button" type="button" onClick={reset}>Nulstil</button></section>
    {message ? <div className="document-message" role="status">{message}<button aria-label="Luk besked" type="button" onClick={() => setMessage("")}><Icon name="close" size={13} /></button></div> : null}
    <div className="documents-layout"><section className="document-list-card"><header><strong>{filtered.length} dokumenter</strong><span>Én fil · flere relationer · ingen permanent sletning</span></header><div className="document-table"><div className="document-table-head"><span>Dokument</span><span>Kategori</span><span>Tilknytning</span><span>Fil</span><span>Uploadet</span><span>Gyldighed</span></div>{filtered.map((document) => { const version = document.versions.find((item) => item.id === document.currentVersionId); const state = documentValidity(document); return <button type="button" key={document.id} className={document.id === documentId ? "is-selected" : ""} onClick={() => onNavigate(`/dokumenter/${document.id}`)}><span className="document-title-cell"><i><Icon name={documentFileKind(version?.mimeType) === "image" ? "image" : documentFileKind(version?.mimeType) === "video" ? "play" : "document"} size={17} /></i><span><strong>{document.title}</strong><small>{version?.fileName || "Filreference mangler"}</small></span></span><span>{DOCUMENT_CATEGORIES[document.category] || "Øvrigt"}</span><span>{document.relations.length ? `${DOCUMENT_RELATION_TYPES[document.relations[0].type]} · ${relationLabel(document.relations[0], units, relations)}${document.relations.length > 1 ? ` +${document.relations.length - 1}` : ""}` : "Ingen"}</span><span>{version?.mimeType || "Ukendt"}<small>{sizeLabel(version?.size)}</small></span><span>{dateLabel(document.createdAt)}</span><span><em className={`document-validity ${state.key}`}>{state.label}</em>{document.archivedAt ? <small>Arkiveret</small> : null}</span></button>; })}{!filtered.length ? <div className="document-empty"><Icon name="document" size={30} /><h2>Ingen dokumenter matcher</h2><p>Tilpas filtrene eller upload et dokument.</p></div> : null}</div></section>{documentId ? <DocumentDetail document={selected} dataset={dataset} units={units} relations={relations} onNavigate={onNavigate} actions={{ edit: () => setDialog({ mode: "edit", document: selected }), replace: () => setDialog({ mode: "replace", document: selected }), removeRelation: async (item) => { if (window.confirm(`Fjern kun tilknytningen til ${relationLabel(item, units, relations)}? Dokumentet bevares.`)) await run(() => data.removeDocumentRelation(selected.id, item.id), "Tilknytningen er fjernet. Dokumentet og øvrige relationer er bevaret."); }, archive: async () => { if (window.confirm("Arkivér dokumentet? Historik og relationer bevares.")) await run(() => data.archiveDocument(selected.id, true, actor), "Dokumentet er arkiveret."); }, restore: () => run(() => data.archiveDocument(selected.id, false, actor), "Dokumentet er gendannet.") }} /> : null}</div>
    {dialog ? <DocumentDialog mode={dialog.mode} document={dialog.document} units={units} relations={relations} onClose={() => setDialog(null)} onUpload={(values) => run(() => data.uploadDocuments(values, actor), "Dokumenterne er gemt lokalt.")} onUpdate={(values) => run(() => data.updateDocument(dialog.document.id, values, actor), "Metadata og relationer er opdateret.")} onReplace={(file) => run(() => data.replaceDocumentFile(dialog.document.id, file, actor), "En ny dokumentversion er oprettet.")} /> : null}
  </main>;
}
