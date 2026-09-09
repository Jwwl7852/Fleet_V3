import { useEffect, useMemo, useRef, useState } from "react";
import { useFleetData } from "../data/FleetDataContext";
import { prepareUnitImage } from "../data/unitImage";
import { REPORT_TYPES, SEVERITIES, USABILITY } from "../data/caseWorkflow";
import { formatMeter, meterUnit, modelLabel } from "../data/unitSelectors";
import { Icon } from "./Icon";
import { UnitThumbnail } from "./UnitThumbnail";
import { ReportImage } from "./ReportImage";
import { resolveUnitCode } from "../data/mobileReporting";

const demoReporter = { id: "demo-mette", name: "Mette Larsen" };
const triState = { yes: "Ja", no: "Nej", unknown: "Ved ikke" };
const areas = ["Front", "Bagende", "Venstre side", "Højre side", "Ruder", "Hjul/dæk", "Undervogn", "Andet"];
const emptyIncident = { timeUnknown: false, occurredAt: "", location: "", description: "", damageType: "", damagedAreas: [], counterparty: "unknown", counterpartyName: "", counterpartyRegistration: "", counterpartyInsurer: "", witnesses: "unknown", witnessContacts: "", personalInjury: "unknown", personalInjuryNote: "", police: "unknown", policeReference: "", weather: "", light: "", road: "" };
const initial = { unitId: "", type: "fault", category: "", severity: "moderate", title: "", description: "", images: [], media: [], meter: "", usability: "uncertain", incident: emptyIncident, draftId: null, reference: null };

function validate(step, values) {
  const errors = {};
  if (step === 1 && !values.unitId) errors.unitId = "Vælg en enhed.";
  if (step === 2) {
    if (!values.category.trim()) errors.category = "Angiv en kategori.";
    if (!values.title.trim()) errors.title = "Skriv en kort titel.";
    if (values.description.trim().length < 10) errors.description = "Beskriv problemet med mindst 10 tegn.";
  }
  if (step === 3) {
    const meter = Number(String(values.meter).replace(",", "."));
    if (values.meter === "" || !Number.isFinite(meter) || meter < 0) errors.meter = "Angiv en gyldig målerstand.";
    if (!values.usability) errors.usability = "Vurder om enheden kan bruges.";
  }
  return errors;
}

function TriState({ label, value, onChange }) {
  return <fieldset className="tri-state"><legend>{label}</legend>{Object.entries(triState).map(([key, text]) => <label className="radio-line" key={key}><input type="radio" name={label} checked={value === key} onChange={() => onChange(key)} />{text}</label>)}</fieldset>;
}

export function ReportWizard({ onNavigate, imageProcessor = prepareUnitImage, reporter = demoReporter, allowedUnitIds = null, mobile = false }) {
  const { units, relations, submitReport, saveReportDraft, loading } = useFleetData();
  const [step, setStep] = useState(1);
  const [values, setValues] = useState(initial);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [scanCode, setScanCode] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const submitting = useRef(false);
  const submissionKey = useRef(crypto.randomUUID());
  const draftId = new URLSearchParams(window.location.search).get("draft");
  useEffect(() => {
    const draft = relations.reportDrafts?.find((item) => item.id === draftId && (!mobile || item.reporterId === reporter.id));
    if (draft && (!allowedUnitIds || !draft.unitId || allowedUnitIds.includes(draft.unitId))) { setValues({ ...initial, ...draft, incident: { ...emptyIncident, ...(draft.incident || {}) } }); setStep(draft.savedStep || 1); }
    else if (draft && mobile) setMessage("Kladden tilhører en anden demo-bruger eller en enhed, du ikke længere har adgang til.");
  }, [draftId, relations.reportDrafts, mobile, reporter.id, allowedUnitIds]);
  const availableUnits = useMemo(() => allowedUnitIds ? units.filter((item) => allowedUnitIds.includes(item.id)) : units, [units, allowedUnitIds]);
  const unit = availableUnits.find((item) => item.id === values.unitId);
  const matches = useMemo(() => { const needle = query.trim().toLocaleLowerCase("da-DK"); return availableUnits.filter((item) => !needle || [item.number, item.registration, item.make, item.model].filter(Boolean).join(" ").toLocaleLowerCase("da-DK").includes(needle)).slice(0, 8); }, [query, availableUnits]);
  const set = (key, value) => { setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); };
  const setIncident = (key, value) => { setValues((current) => ({ ...current, incident: { ...current.incident, [key]: value } })); setErrors((current) => ({ ...current, [key]: undefined })); };
  const next = () => { const found = validate(step, values); if (Object.keys(found).length) setErrors(found); else setStep((current) => Math.min(4, current + 1)); };
  const addFiles = async (event) => {
    const files = [...(event.target.files || [])]; event.target.value = ""; setMessage("");
    try {
      const images = []; const media = [];
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          if (file.size > 10 * 1024 * 1024) throw new Error("Et billede må højst fylde 10 MB.");
          images.push({ id: crypto.randomUUID(), ...(await imageProcessor(file)), source: "reporter" });
        } else {
          if (file.type !== "application/pdf" && !file.type.startsWith("video/")) throw new Error("Brug JPG, PNG, WebP, PDF eller video.");
          const limit = file.type.startsWith("video/") ? 100 : 20;
          if (file.size > limit * 1024 * 1024) throw new Error(`${file.type.startsWith("video/") ? "Video" : "Dokument"} må højst fylde ${limit} MB.`);
          media.push({ id: crypto.randomUUID(), blob: file, type: file.type, name: file.name, size: file.size, kind: file.type.startsWith("video/") ? "video" : "document", addedAt: new Date().toISOString() });
        }
      }
      setValues((current) => ({ ...current, images: [...current.images, ...images], media: [...current.media, ...media] }));
    } catch (error) { setMessage(error.message); }
  };
  const saveDraft = async () => {
    setBusy(true); setMessage("");
    try {
      if (values.unitId && !availableUnits.some((item) => item.id === values.unitId)) throw new Error("Enheden er ikke længere tilgængelig for denne demo-bruger.");
      const result = await saveReportDraft({ ...values, draftClientId: submissionKey.current, reporterId: reporter.id, reporterName: reporter.name, mobile: mobile || undefined, savedStep: step });
      setValues((current) => ({ ...current, draftId: result.draft.id, reference: result.draft.reference }));
      setMessage(`Kladde gemt lokalt med reference ${result.draft.reference}.`);
      window.history.replaceState({}, "", `${mobile ? "/mobil/ny" : "/indberetninger/ny"}?draft=${result.draft.id}`);
    } catch (error) { setMessage(`${error.message || "Kladden kunne ikke gemmes."} Formularen er bevaret.`); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (submitting.current) return;
    const all = { ...validate(1, values), ...validate(2, values), ...validate(3, values) };
    if (Object.keys(all).length) { setErrors(all); setStep(all.unitId ? 1 : all.category || all.title || all.description || all.damageType ? 2 : 3); return; }
    submitting.current = true; setBusy(true); setMessage("");
    try {
      if (!unit) throw new Error("Enheden er ikke længere tilgængelig for denne demo-bruger.");
      const result = await submitReport({ ...values, clientSubmissionId: submissionKey.current, reporterId: reporter.id, reporterName: reporter.name, origin: mobile ? "mobile_local_prototype" : "desktop_local_prototype", meterObservation: { value: Number(String(values.meter).replace(",", ".")), unit: unit.meterType === "hours" ? "hours" : "km", observedAt: new Date().toISOString() } });
      setReceipt(result);
    } catch (error) { setMessage(`${error.message || "Indberetningen kunne ikke gemmes."} Formularen er bevaret.`); }
    finally { submitting.current = false; setBusy(false); }
  };
  const applyScan = (raw = scanCode) => {
    const result = resolveUnitCode(raw, units, { ...reporter, fullFleet: true, departments: [] });
    if (result.unit && availableUnits.some((item) => item.id === result.unit.id)) { set("unitId", result.unit.id); if (!values.meter) set("meter", String(result.unit.meter)); setScanMessage(`${result.unit.number} er valgt fra en stabil enhedskode.`); }
    else setScanMessage(result.error || "Du har ikke adgang til denne enhed.");
  };
  const scanImage = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!("BarcodeDetector" in window) || typeof createImageBitmap !== "function") { setScanMessage("Kamerascanning understøttes ikke i denne browser. Brug manuel søgning eller kodeindtastning."); return; }
    try { const bitmap = await createImageBitmap(file); const detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13"] }); const found = await detector.detect(bitmap); bitmap.close?.(); if (!found.length) throw new Error("Der blev ikke fundet en læsbar QR- eller stregkode i billedet."); applyScan(found[0].rawValue); }
    catch (error) { setScanMessage(error.message || "Kameraadgang eller scanning mislykkedes. Brug manuel søgning."); }
  };
  const cancel = () => {
    const changed = values.unitId || values.category || values.title || values.description || values.images.length || values.media.length;
    if (mobile && changed && !window.confirm("Kassér ikke-gemte ændringer? Gem som kladde først, hvis oplysninger og billeder skal bevares.")) return;
    onNavigate(mobile ? "/mobil" : "/indberetninger");
  };
  if (loading) return <main className="workspace-page loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser lokale enheder …</p></main>;
  if (receipt) return <main className={`workspace-page report-receipt${mobile ? " mobile-report-page" : ""}`} id="main-content"><span className="receipt-icon"><Icon name="check" size={34} /></span><span className="eyebrow">Gemt lokalt · fiktive demodata</span><h1>Tak for din indberetning</h1><p>Indberetningen og sagen deler samme reference.</p><div><strong>{receipt.caseItem.reference}</strong><span>{receipt.report.number} · {receipt.caseItem.number} · Ny</span></div><span className="inline-actions"><button className="primary-button" type="button" onClick={() => onNavigate(mobile ? `/mobil/mine/${receipt.report.id}` : `/indberetninger/${receipt.report.id}`)}>Følg status <Icon name="chevron" size={15} /></button>{!mobile ? <button className="secondary-button" type="button" onClick={() => onNavigate(`/sager/${receipt.caseItem.id}`)}>Åbn sagsmappe</button> : null}</span></main>;

  return <main className={`workspace-page report-wizard-page${mobile ? " mobile-report-page" : ""}`} id="main-content">
    <header className="page-heading-row"><div><span className="eyebrow">{mobile ? "Mobil indberetning" : "Indberetninger"} · Lokal prototype</span><h1>Ny indberetning</h1><p>Samme indberetning og sag bruges på tværs. <strong>{reporter.name} · demo-bruger</strong></p></div><div className="page-actions"><button className="secondary-button" onClick={saveDraft} disabled={busy} type="button">Gem kladde</button><button className="secondary-button" onClick={cancel} type="button">Annuller</button></div></header>
    {message ? <div className="form-alert warning" role="status">{message}</div> : null}
    <ol className="wizard-steps">{[[1,"Enhed"],[2,"Problem"],[3,"Dokumentation"],[4,"Bekræft"]].map(([number,label]) => <li className={step === number ? "is-active" : step > number ? "is-complete" : ""} key={number}><span>{step > number ? "✓" : number}</span><b>{label}</b></li>)}</ol>
    <section className="wizard-card">
      {step === 1 ? <div className="wizard-section"><h2>Vælg enhed</h2><p>Søg på enhedsnummer, registrering, mærke eller model.</p>{mobile ? <section className="mobile-scan-card"><div><Icon name="scan" size={22} /><span><strong>Scan enhedslabel</strong><small>QR- eller stregkode identificerer enheden, men giver ikke adgang.</small></span></div><label>Enhedskode<input aria-label="Enhedskode" value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="VEYRO-UNIT:unit-…" /></label><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => applyScan()}>Brug kode</button><label className="secondary-button file-button"><Icon name="camera" size={16} />Scan med kamera<input aria-label="Scan QR eller stregkode" type="file" accept="image/*" capture="environment" onChange={scanImage} /></label></div>{scanMessage ? <p role="status">{scanMessage}</p> : null}</section> : null}<label className="input-with-icon"><Icon name="search" size={17} /><input aria-label="Søg efter enhed" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg i enhedsregister …" /></label>{errors.unitId ? <small className="field-error">{errors.unitId}</small> : null}<div className="unit-choice-list">{matches.map((item) => <button className={values.unitId === item.id ? "is-selected" : ""} type="button" key={item.id} onClick={() => { set("unitId", item.id); if (!values.meter) set("meter", String(item.meter)); }}><UnitThumbnail unit={item} /><span><strong>{item.number}</strong><b>{modelLabel(item)}</b><small>{item.registration || "Ingen registrering"} · {item.department}</small></span><i>{values.unitId === item.id ? "Valgt" : "Vælg"}</i></button>)}</div></div> : null}
      {step === 2 ? <div className="wizard-section"><h2>Beskriv problemet</h2><p>Ukendte skadesoplysninger kan markeres som Ved ikke og suppleres senere.</p><div className="choice-grid report-type-grid">{Object.entries(REPORT_TYPES).map(([key,label]) => <button className={values.type === key ? "is-selected" : ""} type="button" key={key} onClick={() => set("type", key)}><Icon name={key === "service" ? "service" : "warning"} /><strong>{label}</strong></button>)}</div><div className="form-two-cols"><label>Kategori<input value={values.category} onChange={(event) => set("category", event.target.value)} />{errors.category ? <small className="field-error">{errors.category}</small> : null}</label><label>Oplevet alvorlighed<select value={values.severity} onChange={(event) => set("severity", event.target.value)}>{Object.entries(SEVERITIES).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="span-all">Titel<input value={values.title} onChange={(event) => set("title", event.target.value)} />{errors.title ? <small className="field-error">{errors.title}</small> : null}</label><label className="span-all">Beskrivelse<textarea rows="4" value={values.description} onChange={(event) => set("description", event.target.value)} />{errors.description ? <small className="field-error">{errors.description}</small> : null}</label></div>{values.type === "damage" ? <DamageFields values={values.incident} setValue={setIncident} errors={errors} /> : null}</div> : null}
      {step === 3 ? <div className="wizard-section"><h2>Dokumentation og anvendelighed</h2><p>Filer gemmes kun lokalt i IndexedDB. Video maks. 100 MB; PDF maks. 20 MB.</p><label className="image-drop"><Icon name="upload" size={25} /><strong>Vælg billeder, dokumenter eller video</strong><small>JPG, PNG, WebP, PDF eller video</small><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,video/*" capture="environment" multiple onChange={addFiles} /></label><div className="report-image-grid">{values.images.map((image,index) => <div key={image.id}><ReportImage image={image} alt={`Vedhæftet billede ${index + 1}`} /><button type="button" onClick={() => set("images", values.images.filter((item) => item.id !== image.id))}>Fjern</button></div>)}</div>{values.media.length ? <div className="media-file-list">{values.media.map((file) => <article key={file.id}><Icon name="document" /><span><strong>{file.name}</strong><small>{file.kind === "video" ? "Videoklip" : "Dokument"} · {(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" onClick={() => set("media", values.media.filter((item) => item.id !== file.id))}>Fjern</button></article>)}</div> : null}<div className="form-two-cols"><label>{unit?.meterType === "hours" ? "Driftstimer" : "Kilometertal"}<input inputMode="decimal" value={values.meter} onChange={(event) => set("meter", event.target.value)} /><small>Dateret observation; overskriver ikke enhedens aktuelle målerstand.</small>{errors.meter ? <small className="field-error">{errors.meter}</small> : null}</label><fieldset><legend>Kan enheden anvendes?</legend>{Object.entries(USABILITY).map(([key,label]) => <label className="radio-line" key={key}><input type="radio" name="usability" checked={values.usability === key} onChange={() => set("usability", key)} />{label}</label>)}</fieldset></div><section className="integration-empty"><Icon name="gps" /><div><strong>OBD og dashcam er ikke tilsluttet</strong><p>Senest kendte data fremstilles ikke som hændelsesdata. Original måling og manuelle supplementer holdes adskilt.</p></div></section></div> : null}
      {step === 4 ? <div className="wizard-section review-section"><h2>Gennemgå og indsend</h2><p>Der oprettes én indberetning og én sag med fælles reference.</p>{unit ? <div className="review-unit"><UnitThumbnail unit={unit} /><span><strong>{unit.number}</strong><b>{modelLabel(unit)}</b><small>{formatMeter(unit)}</small></span></div> : null}<dl><div><dt>Reference</dt><dd>{values.reference || "Tildeles ved indsendelse"}</dd></div><div><dt>Type</dt><dd>{REPORT_TYPES[values.type]}</dd></div><div><dt>Kategori</dt><dd>{values.category}</dd></div><div><dt>Alvorlighed</dt><dd>{SEVERITIES[values.severity]}</dd></div><div><dt>Titel</dt><dd>{values.title}</dd></div><div><dt>Anvendelighed</dt><dd>{USABILITY[values.usability]}</dd></div><div><dt>Målerobservation</dt><dd>{values.meter} {unit ? meterUnit(unit) : ""}</dd></div><div><dt>Dokumentation</dt><dd>{values.images.length} billeder · {values.media.length} øvrige filer</dd></div>{values.type === "damage" ? <><div><dt>Hændelse</dt><dd>{values.incident.timeUnknown ? "Tidspunkt ukendt" : values.incident.occurredAt || "Ikke oplyst"} · {values.incident.location}</dd></div><div><dt>Skadede områder</dt><dd>{values.incident.damagedAreas.join(", ")}</dd></div></> : null}</dl></div> : null}
    </section>
    <footer className="wizard-actions"><button className="secondary-button" type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}>Tilbage</button>{step < 4 ? <button className="primary-button" type="button" onClick={next}>Fortsæt <Icon name="chevron" size={15} /></button> : <button className="primary-button" type="button" disabled={busy} onClick={submit}>{busy ? "Gemmer lokalt …" : "Indsend indberetning"}</button>}</footer>
  </main>;
}

function DamageFields({ values, setValue, errors }) {
  return <section className="damage-form"><header><span className="eyebrow">Forsikringsgrundlag · ikke selskabsspecifikt</span><h3>Hændelsesoplysninger</h3></header><div className="form-two-cols"><label>Hændelsesdato og -tid<input aria-label="Hændelsesdato og tidspunkt" type="datetime-local" value={values.occurredAt} disabled={values.timeUnknown} onChange={(event) => setValue("occurredAt", event.target.value)} />{errors.occurredAt ? <small className="field-error">{errors.occurredAt}</small> : null}</label><label className="check-card"><input type="checkbox" checked={values.timeUnknown} onChange={(event) => setValue("timeUnknown", event.target.checked)} />Tidspunkt ukendt</label><label>Sted<input aria-label="Hændelsessted" value={values.location} onChange={(event) => setValue("location", event.target.value)} />{errors.location ? <small className="field-error">{errors.location}</small> : null}</label><label>Skadetype<input aria-label="Skadetype" value={values.damageType} onChange={(event) => setValue("damageType", event.target.value)} />{errors.damageType ? <small className="field-error">{errors.damageType}</small> : null}</label><label className="span-all">Hændelsesbeskrivelse<textarea aria-label="Hændelsesbeskrivelse" rows="3" value={values.description} onChange={(event) => setValue("description", event.target.value)} /></label></div><fieldset className="damage-areas"><legend>Skadede områder</legend>{areas.map((area) => <label key={area}><input type="checkbox" checked={values.damagedAreas.includes(area)} onChange={(event) => setValue("damagedAreas", event.target.checked ? [...values.damagedAreas, area] : values.damagedAreas.filter((item) => item !== area))} />{area}</label>)}{errors.damagedAreas ? <small className="field-error">{errors.damagedAreas}</small> : null}</fieldset><div className="incident-grid"><TriState label="Modpart involveret?" value={values.counterparty} onChange={(value) => setValue("counterparty", value)} /><TriState label="Vidner?" value={values.witnesses} onChange={(value) => setValue("witnesses", value)} /><TriState label="Personskade?" value={values.personalInjury} onChange={(value) => setValue("personalInjury", value)} /><TriState label="Politi involveret?" value={values.police} onChange={(value) => setValue("police", value)} /></div>{values.counterparty === "yes" ? <div className="form-two-cols conditional-fields"><label>Modparts navn/kontakt<input value={values.counterpartyName} onChange={(event) => setValue("counterpartyName", event.target.value)} /></label><label>Modparts registrering<input value={values.counterpartyRegistration} onChange={(event) => setValue("counterpartyRegistration", event.target.value)} /></label><label>Forsikringsselskab<input value={values.counterpartyInsurer} onChange={(event) => setValue("counterpartyInsurer", event.target.value)} /></label></div> : null}{values.witnesses === "yes" ? <label className="standalone-label">Vidners kontaktoplysninger<textarea rows="2" value={values.witnessContacts} onChange={(event) => setValue("witnessContacts", event.target.value)} /></label> : null}{values.police === "yes" ? <label className="standalone-label">Politiets journalnummer, hvis kendt<input value={values.policeReference} onChange={(event) => setValue("policeReference", event.target.value)} /></label> : null}{values.personalInjury === "yes" ? <label className="standalone-label">Kort relevant oplysning<textarea rows="2" value={values.personalInjuryNote} onChange={(event) => setValue("personalInjuryNote", event.target.value)} /></label> : null}<div className="form-three-cols"><label>Vejr<input value={values.weather} onChange={(event) => setValue("weather", event.target.value)} /></label><label>Lysforhold<input value={values.light} onChange={(event) => setValue("light", event.target.value)} /></label><label>Vejforhold<input value={values.road} onChange={(event) => setValue("road", event.target.value)} /></label></div></section>;
}
