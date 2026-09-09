import { useEffect, useMemo, useRef, useState } from "react";
import { UNIT_STATUSES, UNIT_TYPES } from "../data/fleetFixtures";
import { prepareUnitImage } from "../data/unitImage";
import { parsePositiveDanishNumber, validateUnit } from "../data/unitSelectors";
import { disconnectedVehicleLookup, mapVehicleLookupResult, normalizeDanishRegistration } from "../data/vehicleLookup";
import { Icon } from "./Icon";

const emptyValues = {
  number: "", type: "vehicle", make: "", model: "", variant: "", registration: "", serialNumber: "",
  department: "", year: "", firstRegistrationDate: "", fuel: "", color: "", curbWeightKg: "", grossWeightKg: "",
  meterType: "km", meter: "0", status: "operation", notes: "", dimensionsEnabled: false,
  lengthCm: "", widthCm: "", heightCm: "",
};

const valuesFromUnit = (unit) => unit ? {
  number: unit.number, type: unit.type, make: unit.make, model: unit.model,
  variant: unit.vehicleDetails?.variant || "", registration: unit.registration || "", serialNumber: unit.serialNumber || "",
  department: unit.department, year: unit.year || "", firstRegistrationDate: unit.vehicleDetails?.firstRegistrationDate || "",
  fuel: unit.vehicleDetails?.fuel || "", color: unit.vehicleDetails?.color || "",
  curbWeightKg: unit.vehicleDetails?.curbWeightKg ?? "", grossWeightKg: unit.vehicleDetails?.grossWeightKg ?? "",
  meterType: unit.meterType, meter: String(unit.meter), status: unit.status, notes: unit.notes || "",
  dimensionsEnabled: Boolean(unit.dimensions),
  lengthCm: unit.dimensions?.lengthCm == null ? "" : String(unit.dimensions.lengthCm).replace(".", ","),
  widthCm: unit.dimensions?.widthCm == null ? "" : String(unit.dimensions.widthCm).replace(".", ","),
  heightCm: unit.dimensions?.heightCm == null ? "" : String(unit.dimensions.heightCm).replace(".", ","),
} : emptyValues;

const LOOKUP_FIELDS = [
  ["make", "Mærke"], ["model", "Model"], ["variant", "Variant"], ["type", "Enhedstype"],
  ["firstRegistrationDate", "Første registreringsdato"], ["year", "Modelår"], ["fuel", "Drivmiddel"],
  ["serialNumber", "Stelnummer"], ["color", "Farve"], ["curbWeightKg", "Egenvægt (kg)"],
  ["grossWeightKg", "Totalvægt (kg)"], ["lengthCm", "Længde (cm)"], ["widthCm", "Bredde (cm)"], ["heightCm", "Højde (cm)"],
];

function Field({ label, error, hint, children, wide = false }) {
  return <label className={`unit-form-field${wide ? " is-wide" : ""}`}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}{error ? <em role="alert">{error}</em> : null}</label>;
}

function ImageEditor({ image, onChange, imageProcessor }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!image?.blob) { setPreviewUrl(""); return undefined; }
    const url = URL.createObjectURL(image.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image?.blob]);
  const choose = async (file) => {
    if (!file) return;
    setBusy(true); setError("");
    try { onChange(await imageProcessor(file)); }
    catch (cause) { setError(cause.message || "Billedet kunne ikke behandles."); }
    finally { setBusy(false); }
  };
  const select = async (event) => { const file = event.target.files?.[0]; event.target.value = ""; await choose(file); };
  return <section className="unit-image-editor" aria-labelledby="unit-image-title">
    <div className="form-section-heading"><div><h3 id="unit-image-title">Enhedsbillede</h3><p>Gemmes lokalt i browserens IndexedDB. JPG, PNG eller WebP · maks. 10 MB.</p></div></div>
    <div className={`unit-image-row${dragging ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}>
      <div className={`unit-image-preview${previewUrl ? " has-image" : ""}`}>{previewUrl ? <img src={previewUrl} alt="Forhåndsvisning af enhedsbillede" /> : <><Icon name="unit" size={30} /><span>Intet eget billede</span></>}</div>
      <div className="unit-image-actions"><label className="secondary-button file-button"><Icon name="upload" size={16} />{busy ? "Behandler …" : image ? "Erstat billede" : "Upload billede"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={select} disabled={busy} /></label>{image ? <button className="text-danger-button" type="button" onClick={() => onChange(null)}>Fjern billede</button> : null}<small>Træk et billede hertil, eller brug fil-/kameravalg. Store billeder tilpasses til højst 1600 px.</small>{error ? <em role="alert">{error}</em> : null}</div>
    </div>
  </section>;
}

function LookupReview({ result, selected, onToggle, onApply, onDismiss }) {
  const available = LOOKUP_FIELDS.filter(([key]) => result.fields[key] !== "" && result.fields[key] != null);
  return <section className="lookup-review" aria-labelledby="lookup-review-title">
    <div className="lookup-review-header"><div><span className="eyebrow">Gennemgå før anvendelse</span><h3 id="lookup-review-title">Fundne køretøjsoplysninger</h3><p>{result.source} · opslag {new Date(result.lookedUpAt).toLocaleString("da-DK")}</p></div><button type="button" className="icon-button" onClick={onDismiss} aria-label="Luk opslag"><Icon name="close" size={16} /></button></div>
    {available.length ? <div className="lookup-field-list">{available.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(selected[key])} onChange={() => onToggle(key)} /><span><strong>{label}</strong><small>{result.fields[key]}</small></span></label>)}</div> : <p className="lookup-empty">Datakilden returnerede ingen understøttede oplysninger.</p>}
    {result.historicalOdometer ? <p className="historical-meter"><Icon name="info" size={15} />Historisk målerstand: {result.historicalOdometer.value} {result.historicalOdometer.unit} pr. {result.historicalOdometer.observedAt}. Den anvendes ikke som aktuel målerstand.</p> : null}
    <footer><button className="secondary-button" type="button" onClick={onDismiss}>Annuller</button><button className="primary-button" type="button" onClick={onApply} disabled={!available.some(([key]) => selected[key])}>Anvend valgte oplysninger</button></footer>
  </section>;
}

export function UnitFormDialog({ unit, units, tenantId, onClose, onSave, vehicleLookup = disconnectedVehicleLookup, imageProcessor = prepareUnitImage }) {
  const [values, setValues] = useState(() => valuesFromUnit(unit));
  const [image, setImage] = useState(unit?.image || null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lookupState, setLookupState] = useState({ status: "idle", message: "" });
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupSelection, setLookupSelection] = useState({});
  const requestSequence = useRef(0);
  const registrationRef = useRef(values.registration);
  const valuesRef = useRef(values);
  const errors = useMemo(() => validateUnit(values, units, unit?.id), [unit?.id, units, values]);
  useEffect(() => { valuesRef.current = values; }, [values]);
  const set = (key) => (event) => {
    const value = event.target.value;
    setValues((current) => {
      const next = { ...current, [key]: value };
      valuesRef.current = next;
      return next;
    });
  };
  const setRegistration = (event) => {
    requestSequence.current += 1;
    registrationRef.current = event.target.value;
    setValues((current) => {
      const next = { ...current, registration: event.target.value };
      valuesRef.current = next;
      return next;
    });
    setLookupResult(null); setLookupState({ status: "idle", message: "" });
  };

  const lookup = async () => {
    const registration = normalizeDanishRegistration(values.registration);
    if (!registration) { setLookupState({ status: "error", message: "Indtast en dansk nummerplade først." }); return; }
    setValues((current) => ({ ...current, registration })); registrationRef.current = registration;
    const sequence = ++requestSequence.current;
    setLookupState({ status: "loading", message: "Henter køretøjsdata …" }); setLookupResult(null);
    try {
      const result = mapVehicleLookupResult(await vehicleLookup.lookup(registration));
      if (sequence !== requestSequence.current || normalizeDanishRegistration(registrationRef.current) !== registration) return;
      const selection = {};
      LOOKUP_FIELDS.forEach(([key]) => { const present = result.fields[key] !== "" && result.fields[key] != null; selection[key] = present && (valuesRef.current[key] === "" || valuesRef.current[key] == null); });
      setLookupSelection(selection); setLookupResult(result);
      setLookupState({ status: "success", message: "Oplysninger fundet. Vælg hvad der skal anvendes." });
    } catch (cause) {
      if (sequence !== requestSequence.current || normalizeDanishRegistration(registrationRef.current) !== registration) return;
      setLookupState({ status: "error", message: cause.message || "Køretøjsopslaget mislykkedes. Prøv igen." });
    }
  };

  const applyLookup = () => {
    setValues((current) => {
      const next = { ...current };
      LOOKUP_FIELDS.forEach(([key]) => { if (lookupSelection[key]) next[key] = String(lookupResult.fields[key]).replace(".", ","); });
      if (["lengthCm", "widthCm", "heightCm"].some((key) => lookupSelection[key])) next.dimensionsEnabled = true;
      return next;
    });
    setLookupResult(null); setLookupState({ status: "success", message: `Valgte oplysninger fra ${lookupResult.source} er anvendt.` });
  };

  const toggleDimensions = (event) => {
    const checked = event.target.checked;
    if (!checked && values.dimensionsEnabled && [values.lengthCm, values.widthCm, values.heightCm].some((value) => String(value).trim()) && !globalThis.confirm("De udfyldte udvendige mål fjernes, når enheden gemmes. Vil du fortsætte?")) return;
    setValues((current) => ({ ...current, dimensionsEnabled: checked, ...(checked ? {} : { lengthCm: "", widthCm: "", heightCm: "" }) }));
  };

  const submit = async (event) => {
    event.preventDefault(); setSubmitted(true); setSaveError("");
    if (Object.keys(errors).length) return;
    setSaving(true);
    const id = unit?.id || `unit-local-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
    const dimensions = values.dimensionsEnabled ? { unit: "cm", lengthCm: parsePositiveDanishNumber(values.lengthCm), widthCm: parsePositiveDanishNumber(values.widthCm), heightCm: parsePositiveDanishNumber(values.heightCm) } : null;
    try {
      await onSave({
        ...(unit || {}), id, tenantId, number: values.number.trim(), type: values.type, make: values.make.trim(), model: values.model.trim(),
        registration: normalizeDanishRegistration(values.registration) || null, serialNumber: values.serialNumber.trim() || null,
        department: values.department.trim(), year: values.year ? Number(values.year) : null, meterType: values.meterType,
        meter: Number(values.meter), status: values.status, notes: values.notes.trim(), noteCount: unit?.noteCount || 0, image, dimensions,
        vehicleDetails: { variant: values.variant.trim() || null, firstRegistrationDate: values.firstRegistrationDate || null, fuel: values.fuel.trim() || null, color: values.color.trim() || null, curbWeightKg: values.curbWeightKg === "" ? null : Number(values.curbWeightKg), grossWeightKg: values.grossWeightKg === "" ? null : Number(values.grossWeightKg) },
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (cause) { setSaveError(cause.message || "Enheden kunne ikke gemmes lokalt. Prøv igen."); }
    finally { setSaving(false); }
  };

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unit-dialog" role="dialog" aria-modal="true" aria-labelledby="unit-dialog-title">
      <header><div><span className="eyebrow">Lokal prototypelagring</span><h2 id="unit-dialog-title">{unit ? `Redigér ${unit.number}` : "Opret enhed"}</h2><p>Gemmes kun i denne browsers IndexedDB.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Luk formular"><Icon name="close" /></button></header>
      <form onSubmit={submit} noValidate>
        <div className="unit-form-grid">
          <Field label="Enhedsnummer *" error={submitted ? errors.number : null} hint={unit ? "Visningsfelt – det stabile interne ID ændres ikke." : "Fx NB-019."}><input autoFocus value={values.number} onChange={set("number")} /></Field>
          <Field label="Enhedstype *" error={submitted ? errors.type : null}><select value={values.type} onChange={set("type")}>{Object.entries(UNIT_TYPES).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></Field>
          <Field label="Registreringsnummer" wide hint="Danmark · mellemrum og bindestreger normaliseres. Feltet er valgfrit."><div className="registration-lookup"><input aria-label="Registreringsnummer" value={values.registration} onChange={setRegistration} onBlur={() => setValues((current) => ({ ...current, registration: normalizeDanishRegistration(current.registration) }))} /><button className="secondary-button" type="button" onClick={lookup} disabled={lookupState.status === "loading"}>{lookupState.status === "loading" ? <span className="mini-spinner" /> : <Icon name="search" size={16} />}Hent køretøjsdata</button></div></Field>
          <div className={`lookup-status is-${lookupState.status}`} role="status"><Icon name={lookupState.status === "error" ? "warning" : "info"} size={15} /><span>{lookupState.message || "Nummerpladeopslag er ikke tilsluttet. Manuel oprettelse fungerer uafhængigt."}</span></div>
          {lookupResult ? <LookupReview result={lookupResult} selected={lookupSelection} onToggle={(key) => setLookupSelection((current) => ({ ...current, [key]: !current[key] }))} onApply={applyLookup} onDismiss={() => setLookupResult(null)} /> : null}
          <Field label="Mærke *" error={submitted ? errors.make : null}><input value={values.make} onChange={set("make")} /></Field><Field label="Model *" error={submitted ? errors.model : null}><input value={values.model} onChange={set("model")} /></Field>
          <Field label="Variant"><input value={values.variant} onChange={set("variant")} /></Field><Field label="VIN / serienummer" hint="Valgfrit, når enheden ikke har et nummer."><input value={values.serialNumber} onChange={set("serialNumber")} /></Field>
          <Field label="Afdeling *" error={submitted ? errors.department : null}><input value={values.department} onChange={set("department")} /></Field><Field label="Produktionsår / modelår" error={submitted ? errors.year : null}><input inputMode="numeric" value={values.year} onChange={set("year")} /></Field>
          <Field label="Første registreringsdato" hint="Holdes adskilt fra modelår."><input type="date" value={values.firstRegistrationDate} onChange={set("firstRegistrationDate")} /></Field><Field label="Drivmiddel"><input value={values.fuel} onChange={set("fuel")} /></Field>
          <Field label="Farve"><input value={values.color} onChange={set("color")} /></Field><Field label="Egenvægt i kg"><input inputMode="decimal" type="number" min="0" value={values.curbWeightKg} onChange={set("curbWeightKg")} /></Field>
          <Field label="Totalvægt i kg"><input inputMode="decimal" type="number" min="0" value={values.grossWeightKg} onChange={set("grossWeightKg")} /></Field><Field label="Målerart *" error={submitted ? errors.meterType : null}><select value={values.meterType} onChange={set("meterType")}><option value="km">Kilometer</option><option value="hours">Driftstimer</option></select></Field>
          <Field label="Målerstand *" error={submitted ? errors.meter : null}><input inputMode="numeric" min="0" step="1" type="number" value={values.meter} onChange={set("meter")} /></Field><Field label="Driftsstatus *" error={submitted ? errors.status : null}><select value={values.status} onChange={set("status")}>{Object.entries(UNIT_STATUSES).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></Field>
          <Field label="Internt ID" hint="Stabilt og ikke redigerbart."><input disabled value={unit?.id || "Oprettes automatisk"} /></Field>
          <section className="dimensions-section"><label className="dimensions-toggle"><input type="checkbox" checked={values.dimensionsEnabled} onChange={toggleDimensions} /><span><strong>Tilføj udvendige mål</strong><small>Udvendige mål – ikke lastrum eller indvendige mål.</small></span></label>{values.dimensionsEnabled ? <div className="dimensions-grid"><Field label="Længde i cm" error={submitted ? errors.lengthCm : null}><input inputMode="decimal" value={values.lengthCm} onChange={set("lengthCm")} placeholder="Fx 599,5" /></Field><Field label="Bredde i cm" error={submitted ? errors.widthCm : null}><input inputMode="decimal" value={values.widthCm} onChange={set("widthCm")} /></Field><Field label="Højde i cm" error={submitted ? errors.heightCm : null}><input inputMode="decimal" value={values.heightCm} onChange={set("heightCm")} /></Field></div> : null}</section>
          <ImageEditor image={image} onChange={setImage} imageProcessor={imageProcessor} />
          <Field label="Noter" wide><textarea rows="3" value={values.notes} onChange={set("notes")} /></Field>
        </div>
        {saveError ? <p className="form-save-error" role="alert"><Icon name="warning" size={16} />{saveError}</p> : null}
        <footer><button className="secondary-button" type="button" onClick={onClose}>Annuller</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Gemmer lokalt …" : unit ? "Gem ændringer" : "Opret enhed"}</button></footer>
      </form>
    </section>
  </div>;
}
