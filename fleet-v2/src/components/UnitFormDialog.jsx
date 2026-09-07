import { useMemo, useState } from "react";
import { UNIT_STATUSES, UNIT_TYPES } from "../data/fleetFixtures";
import { validateUnit } from "../data/unitSelectors";
import { Icon } from "./Icon";

const emptyValues = {
  number: "", type: "vehicle", make: "", model: "", registration: "", serialNumber: "",
  department: "", year: "", meterType: "km", meter: "0", status: "operation", notes: "",
};

const valuesFromUnit = (unit) => unit ? {
  number: unit.number,
  type: unit.type,
  make: unit.make,
  model: unit.model,
  registration: unit.registration || "",
  serialNumber: unit.serialNumber || "",
  department: unit.department,
  year: unit.year || "",
  meterType: unit.meterType,
  meter: String(unit.meter),
  status: unit.status,
  notes: unit.notes || "",
} : emptyValues;

function Field({ label, error, hint, children, wide = false }) {
  return (
    <label className={`unit-form-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
      {error ? <em role="alert">{error}</em> : null}
    </label>
  );
}

export function UnitFormDialog({ unit, units, tenantId, onClose, onSave }) {
  const [values, setValues] = useState(() => valuesFromUnit(unit));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = useMemo(() => validateUnit(values, units, unit?.id), [unit?.id, units, values]);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    const id = unit?.id || `unit-local-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
    await onSave({
      ...(unit || {}),
      id,
      tenantId,
      number: values.number.trim(),
      type: values.type,
      make: values.make.trim(),
      model: values.model.trim(),
      registration: values.registration.trim() || null,
      serialNumber: values.serialNumber.trim() || null,
      department: values.department.trim(),
      year: values.year ? Number(values.year) : null,
      meterType: values.meterType,
      meter: Number(values.meter),
      status: values.status,
      notes: values.notes.trim(),
      noteCount: unit?.noteCount || 0,
      updatedAt: new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="unit-dialog" role="dialog" aria-modal="true" aria-labelledby="unit-dialog-title">
        <header>
          <div><span className="eyebrow">Lokal prototypelagring</span><h2 id="unit-dialog-title">{unit ? `Redigér ${unit.number}` : "Opret enhed"}</h2><p>Gemmes kun i denne browsers IndexedDB.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Luk formular"><Icon name="close" /></button>
        </header>
        <form onSubmit={submit} noValidate>
          <div className="unit-form-grid">
            <Field label="Enhedsnummer *" error={submitted ? errors.number : null} hint={unit ? "Visningsfelt – det stabile interne ID ændres ikke." : "Fx NB-019."}><input autoFocus value={values.number} onChange={set("number")} /></Field>
            <Field label="Enhedstype *" error={submitted ? errors.type : null}><select value={values.type} onChange={set("type")}>{Object.entries(UNIT_TYPES).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></Field>
            <Field label="Mærke *" error={submitted ? errors.make : null}><input value={values.make} onChange={set("make")} /></Field>
            <Field label="Model *" error={submitted ? errors.model : null}><input value={values.model} onChange={set("model")} /></Field>
            <Field label="Registreringsnummer" hint="Valgfrit for maskiner og udstyr."><input value={values.registration} onChange={set("registration")} /></Field>
            <Field label="VIN / serienummer" hint="Valgfrit, når enheden ikke har et nummer."><input value={values.serialNumber} onChange={set("serialNumber")} /></Field>
            <Field label="Afdeling *" error={submitted ? errors.department : null}><input value={values.department} onChange={set("department")} /></Field>
            <Field label="Produktionsår" error={submitted ? errors.year : null}><input inputMode="numeric" value={values.year} onChange={set("year")} /></Field>
            <Field label="Målerart *" error={submitted ? errors.meterType : null}><select value={values.meterType} onChange={set("meterType")}><option value="km">Kilometer</option><option value="hours">Driftstimer</option></select></Field>
            <Field label="Målerstand *" error={submitted ? errors.meter : null}><input inputMode="numeric" min="0" step="1" type="number" value={values.meter} onChange={set("meter")} /></Field>
            <Field label="Driftsstatus *" error={submitted ? errors.status : null}><select value={values.status} onChange={set("status")}>{Object.entries(UNIT_STATUSES).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></Field>
            <Field label="Internt ID" hint="Stabilt og ikke redigerbart."><input disabled value={unit?.id || "Oprettes automatisk"} /></Field>
            <Field label="Noter" wide><textarea rows="3" value={values.notes} onChange={set("notes")} /></Field>
          </div>
          <footer><button className="secondary-button" type="button" onClick={onClose}>Annuller</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Gemmer lokalt …" : unit ? "Gem ændringer" : "Opret enhed"}</button></footer>
        </form>
      </section>
    </div>
  );
}
