import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { LEASE_SERVICE_STATES, LEASE_TYPES } from "../data/leasingWorkflow";
import { DOCUMENT_LIMITS, documentFileKind, validateDocumentFile } from "../data/documentWorkflow";
import { prepareUnitImage } from "../data/unitImage";
import { UnitThumbnail } from "./UnitThumbnail";

const money = (minor) => minor == null ? "" : String(minor / 100).replace(".", ",");
const numberValue = (value) => value == null ? "" : String(value);
const fileSize = (value) => value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(value / 1024))} KB`;
const acceptedContractTypes = "application/pdf,image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";

function initialValues(lease, units) {
  return lease ? {
    id: lease.id, agreementNumber: lease.agreementNumber, unitId: lease.unitId, lessorName: lease.lessor?.name || "", contactName: lease.lessor?.contactName || "", contactEmail: lease.lessor?.email || "", contactPhone: lease.lessor?.phone || "", type: lease.type, status: lease.status,
    startDate: lease.startDate, endDate: lease.endDate, bindingMonths: numberValue(lease.bindingMonths), noticeDays: numberValue(lease.noticeDays), lastNoticeDate: lease.lastNoticeDate || "", extensionTerms: lease.extensionTerms || "", plannedDeliveryDate: lease.plannedDeliveryDate || "",
    initialAmount: money(lease.payment?.initialMinor), recurringAmount: money(lease.payment?.recurringMinor), paymentInterval: lease.payment?.interval || "monthly", currency: lease.payment?.currency || "DKK", vat: lease.payment?.vat || "unknown", depositAmount: money(lease.payment?.depositMinor), feesAmount: money(lease.payment?.feesMinor), adjustmentTerms: lease.payment?.adjustmentTerms || "", residualValue: money(lease.payment?.residualValueMinor), purchaseOption: money(lease.payment?.purchaseOptionMinor),
    startMeter: numberValue(lease.mileage?.startValue), startMeterDate: lease.mileage?.startObservedAt || "", allowanceScope: lease.mileage?.allowanceScope || "total", includedKm: numberValue(lease.mileage?.includedKm), periodKm: numberValue(lease.mileage?.periodKm), periodMonths: numberValue(lease.mileage?.periodMonths), overageRate: money(lease.mileage?.overageRateMinor), underageRate: money(lease.mileage?.underageRateMinor), toleranceKm: numberValue(lease.mileage?.toleranceKm), capKm: numberValue(lease.mileage?.capKm), manualExpectedMonthlyKm: numberValue(lease.mileage?.manualExpectedMonthlyKm),
    maintenance: lease.services?.maintenance || "unresolved", repairs: lease.services?.repairs || "unresolved", tyres: lease.services?.tyres || "unresolved", tyreChange: lease.services?.tyreChange || "unresolved", tyreStorage: lease.services?.tyreStorage || "unresolved", insurance: lease.services?.insurance || "unresolved", roadside: lease.services?.roadside || "unresolved", replacementVehicle: lease.services?.replacementVehicle || "unresolved", serviceNotes: lease.services?.notes || "",
    returnLocation: lease.returnTerms?.location || "", returnContact: lease.returnTerms?.contact || "", returnCondition: lease.returnTerms?.condition || "", returnEquipment: lease.returnTerms?.equipment || "", returnInspection: lease.returnTerms?.inspection || "", earlyReturnFee: money(lease.returnTerms?.earlyReturnFeeMinor), revisedAllowanceKm: numberValue(lease.returnTerms?.revisedAllowanceKm), otherReturnFees: money(lease.returnTerms?.otherFeesMinor), warningDays: lease.warningDays || [120,90,30],
  } : {
    agreementNumber: "", unitId: units[0]?.id || "", lessorName: "", contactName: "", contactEmail: "", contactPhone: "", type: "operational", status: "draft", startDate: "", endDate: "", bindingMonths: "", noticeDays: "", lastNoticeDate: "", extensionTerms: "", plannedDeliveryDate: "",
    initialAmount: "", recurringAmount: "", paymentInterval: "monthly", currency: "DKK", vat: "exclusive", depositAmount: "", feesAmount: "", adjustmentTerms: "", residualValue: "", purchaseOption: "", startMeter: "", startMeterDate: "", allowanceScope: "total", includedKm: "", periodKm: "", periodMonths: "", overageRate: "", underageRate: "", toleranceKm: "", capKm: "", manualExpectedMonthlyKm: "",
    maintenance: "unresolved", repairs: "unresolved", tyres: "unresolved", tyreChange: "unresolved", tyreStorage: "unresolved", insurance: "unresolved", roadside: "unresolved", replacementVehicle: "unresolved", serviceNotes: "", returnLocation: "", returnContact: "", returnCondition: "", returnEquipment: "", returnInspection: "", earlyReturnFee: "", revisedAllowanceKm: "", otherReturnFees: "", warningDays: [120,90,30],
  };
}

const Field = ({ label, error, children, wide = false }) => <label className={wide ? "span-2" : ""}><span>{label}</span>{children}{error ? <small className="field-error">{error}</small> : null}</label>;

export function LeaseFormDialog({ lease, units, onClose, onSave, imageProcessor = prepareUnitImage }) {
  const [initial] = useState(() => initialValues(lease, units));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false); const [section, setSection] = useState("identity");
  const [contractFile, setContractFile] = useState(null); const [contractError, setContractError] = useState(""); const [dragging, setDragging] = useState(false); const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [unitImageChange, setUnitImageChange] = useState(undefined); const [unitImageBusy, setUnitImageBusy] = useState(false); const [unitImageError, setUnitImageError] = useState(""); const [unitImageDragging, setUnitImageDragging] = useState(false);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const unit = useMemo(() => units.find((item) => item.id === values.unitId), [units, values.unitId]);
  const dirty = contractFile || unitImageChange !== undefined || JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => {
    if (!contractFile || typeof URL.createObjectURL !== "function") { setPreviewUrl(""); return undefined; }
    const url = URL.createObjectURL(contractFile); setPreviewUrl(url);
    return () => URL.revokeObjectURL?.(url);
  }, [contractFile]);
  const chooseContract = (file) => {
    if (!file) return;
    try { validateDocumentFile(file); setContractFile(file); setContractError(""); setShowPreview(false); }
    catch (error) { setContractError(error.message); }
  };
  const chooseUnitImage = async (file) => { if (!file) return; setUnitImageBusy(true); setUnitImageError(""); try { setUnitImageChange(await imageProcessor(file)); } catch (error) { setUnitImageError(error.message || "Billedet kunne ikke behandles."); } finally { setUnitImageBusy(false); } };
  const requestClose = () => {
    if (dirty && !window.confirm("Kassér ikke-gemte ændringer? Den valgte kontrakt bliver ikke gemt.")) return;
    onClose();
  };
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setErrors({});
    try { await onSave(values, contractFile, unitImageChange); onClose(); }
    catch (error) { setErrors(error.validation || { form: error.message }); }
    finally { setBusy(false); }
  };
  const serviceOptions = Object.entries(LEASE_SERVICE_STATES);
  return <div className="modal-layer"><form className="modal-card lease-form-dialog" onSubmit={save} aria-label={lease ? "Rediger leasingaftale" : "Opret leasingaftale"}>
    <header><div><small>FLEET · Leasing</small><h2>{lease ? `Rediger ${lease.agreementNumber}` : "Opret leasingaftale"}</h2><p>Ukendte oplysninger kan stå tomme. Alle beløb gemmes struktureret med valuta og momsstatus.</p></div><button type="button" className="icon-button" onClick={requestClose} aria-label="Luk"><Icon name="close" /></button></header>
    <nav className="lease-form-tabs" aria-label="Formularafsnit">{[["identity","Aftale"],["payment","Betaling & km"],["services","Ydelser"],["return","Aflevering"]].map(([key,label]) => <button key={key} type="button" className={section===key?"is-active":""} onClick={()=>setSection(key)}>{label}</button>)}</nav>
    <div className="modal-body">
      {errors.form ? <p className="form-error">{errors.form}</p> : null}
      {section === "identity" ? <div className="form-grid">
        <section
          className={`lease-contract-upload span-2${dragging ? " is-dragging" : ""}`}
          data-testid="lease-contract-dropzone"
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); chooseContract(event.dataTransfer.files?.[0]); }}
        >
          <div className="lease-contract-upload-head"><span className="lease-contract-icon"><Icon name="document" /></span><div><strong>Leasingkontrakt</strong><p>Træk kontrakten hertil, eller vælg en fil fra din computer.</p></div></div>
          {!contractFile ? <label className="secondary-button lease-contract-file-button">Vælg fil<input className="sr-only" aria-label="Vælg leasingkontrakt" type="file" accept={acceptedContractTypes} onChange={(event) => chooseContract(event.target.files?.[0])} /></label> : <div className="lease-contract-selected">
            <div><Icon name={documentFileKind(contractFile.type) === "image" ? "image" : documentFileKind(contractFile.type) === "video" ? "play" : "document"} /><span><strong>{contractFile.name}</strong><small>{fileSize(contractFile.size)} · klar til at blive gemt sammen med aftalen</small></span></div>
            <div className="lease-contract-actions"><button type="button" className="secondary-button" onClick={() => setShowPreview((current) => !current)}>{showPreview ? "Skjul" : "Forhåndsvis"}</button><label className="secondary-button lease-contract-file-button">Udskift<input className="sr-only" aria-label="Udskift leasingkontrakt" type="file" accept={acceptedContractTypes} onChange={(event) => chooseContract(event.target.files?.[0])} /></label><button type="button" className="link-button danger-link" onClick={() => { setContractFile(null); setContractError(""); setShowPreview(false); }}>Fjern</button></div>
          </div>}
          {contractError ? <p className="field-error" role="alert">{contractError}</p> : null}
          {showPreview && previewUrl ? <div className="lease-contract-preview">{documentFileKind(contractFile.type) === "image" ? <img src={previewUrl} alt={`Forhåndsvisning af ${contractFile.name}`} /> : documentFileKind(contractFile.type) === "video" ? <video src={previewUrl} controls aria-label={`Forhåndsvisning af ${contractFile.name}`} /> : <object data={previewUrl} type="application/pdf" aria-label={`Forhåndsvisning af ${contractFile.name}`}><a href={previewUrl} download={contractFile.name}>Download filen</a></object>}</div> : null}
          <small>PDF og billeder: maks. {DOCUMENT_LIMITS.pdf / 1024 / 1024} MB. Video: maks. {DOCUMENT_LIMITS.video / 1024 / 1024} MB.</small>
          <p className="lease-contract-note"><Icon name="info" size={15} /> Upload er ikke automatisk kontraktaflæsning. Automatisk aflæsning er ikke tilsluttet for egne filer.</p>
        </section>
        <Field label="Aftalenummer *" error={errors.agreementNumber}><input aria-label="Aftalenummer" value={values.agreementNumber} onChange={set("agreementNumber")} /></Field>
        <Field label="Enhed *" error={errors.unitId}><select aria-label="Leasingens enhed" value={values.unitId} onChange={(event)=>{setValues((current)=>({...current,unitId:event.target.value}));setUnitImageChange(undefined);setUnitImageError("");}}>{units.map((item)=><option value={item.id} key={item.id}>{item.number} · {item.make} {item.model}</option>)}</select><small>Registrering: {unit?.registration || "Ikke oplyst"} · VIN: {unit?.serialNumber || "Ikke oplyst"}</small></Field>
        <section className={`lease-unit-image span-2${unitImageDragging?" is-dragging":""}`} onDragOver={(event)=>{event.preventDefault();setUnitImageDragging(true);}} onDragLeave={()=>setUnitImageDragging(false)} onDrop={(event)=>{event.preventDefault();setUnitImageDragging(false);chooseUnitImage(event.dataTransfer.files?.[0]);}}><div className="lease-unit-image-copy"><UnitThumbnail unit={{...unit,image:unitImageChange===undefined?unit?.image:unitImageChange}} large/><div><strong>Enhedsbillede for {unit?.number}</strong><p>Det er enhedens fælles billede og opdateres også i Enheder, profil og mobilvalg.</p><small>JPG, PNG eller WebP · maks. 10 MB · tilpasses med bevarede proportioner.</small></div></div><div className="inline-actions"><label className="secondary-button file-button"><Icon name="camera" size={16}/>{unitImageBusy?"Behandler …":(unitImageChange===undefined?unit?.image:unitImageChange)?"Erstat billede":"Tilføj billede"}<input aria-label="Vælg enhedsbillede fra Leasing" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={unitImageBusy} onChange={(event)=>{chooseUnitImage(event.target.files?.[0]);event.target.value="";}}/></label>{(unitImageChange===undefined?unit?.image:unitImageChange)?<button className="text-danger-button" type="button" onClick={()=>setUnitImageChange(null)}>Fjern billede</button>:null}</div>{unitImageError?<p className="field-error" role="alert">{unitImageError}</p>:null}</section>
        <Field label="Leasingselskab *" error={errors.lessorName}><input aria-label="Leasingselskab" value={values.lessorName} onChange={set("lessorName")} /></Field><Field label="Kontaktperson"><input value={values.contactName} onChange={set("contactName")} /></Field>
        <Field label="E-mail"><input type="email" value={values.contactEmail} onChange={set("contactEmail")} /></Field><Field label="Telefon"><input value={values.contactPhone} onChange={set("contactPhone")} /></Field>
        <Field label="Leasingform"><select value={values.type} onChange={set("type")}>{Object.entries(LEASE_TYPES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><Field label="Aftalestatus"><select value={values.status} onChange={set("status")}><option value="draft">Kladde</option><option value="active">Aktiv</option><option value="ending">Udløber snart</option><option value="delivered">Afleveret</option><option value="closed">Afsluttet</option></select></Field>
        <Field label="Startdato *" error={errors.startDate}><input type="date" value={values.startDate} onChange={set("startDate")} /></Field><Field label="Kontraktudløb *" error={errors.endDate}><input type="date" value={values.endDate} onChange={set("endDate")} /></Field>
        <Field label="Bindingsperiode, måneder"><input inputMode="numeric" value={values.bindingMonths} onChange={set("bindingMonths")} /></Field><Field label="Opsigelsesfrist, dage"><input inputMode="numeric" value={values.noticeDays} onChange={set("noticeDays")} /></Field>
        <Field label="Sidste opsigelsesdato"><input type="date" value={values.lastNoticeDate} onChange={set("lastNoticeDate")} /></Field><Field label="Planlagt aflevering"><input type="date" value={values.plannedDeliveryDate} onChange={set("plannedDeliveryDate")} /></Field>
        <Field label="Forlængelsesvilkår" wide><textarea value={values.extensionTerms} onChange={set("extensionTerms")} /></Field>
      </div> : null}
      {section === "payment" ? <div className="form-grid">
        <Field label="Månedlig ydelse" error={errors.recurringAmount}><input aria-label="Månedlig leasingydelse" inputMode="decimal" value={values.recurringAmount} onChange={set("recurringAmount")} /></Field><Field label="Betalingsinterval"><select value={values.paymentInterval} onChange={set("paymentInterval")}><option value="monthly">Månedlig</option><option value="quarterly">Kvartalsvis</option><option value="annual">Årlig</option></select></Field>
        <Field label="Valuta"><select value={values.currency} onChange={set("currency")}><option>DKK</option><option>EUR</option><option>SEK</option></select></Field><Field label="Moms"><select value={values.vat} onChange={set("vat")}><option value="exclusive">Ekskl. moms</option><option value="inclusive">Inkl. moms</option><option value="unknown">Uafklaret</option></select></Field>
        <Field label="Førstegangsydelse"><input inputMode="decimal" value={values.initialAmount} onChange={set("initialAmount")} /></Field><Field label="Depositum (særskilt)"><input inputMode="decimal" value={values.depositAmount} onChange={set("depositAmount")} /></Field><Field label="Gebyrer"><input inputMode="decimal" value={values.feesAmount} onChange={set("feesAmount")} /></Field><Field label="Restværdi"><input inputMode="decimal" value={values.residualValue} onChange={set("residualValue")} /></Field><Field label="Købsoption"><input inputMode="decimal" value={values.purchaseOption} onChange={set("purchaseOption")} /></Field><Field label="Regulering"><input value={values.adjustmentTerms} onChange={set("adjustmentTerms")} /></Field>
        <Field label="Startmålerstand" error={errors.startMeter}><input inputMode="decimal" value={values.startMeter} onChange={set("startMeter")} /></Field><Field label="Måledato ved levering"><input type="date" value={values.startMeterDate} onChange={set("startMeterDate")} /></Field>
        <Field label="Kilometergrænse"><select value={values.allowanceScope} onChange={set("allowanceScope")}><option value="total">Samlet for hele aftalen</option><option value="periodic">Pr. periode</option></select></Field>{values.allowanceScope === "total" ? <Field label="Inkluderet km" error={errors.includedKm}><input inputMode="decimal" value={values.includedKm} onChange={set("includedKm")} /></Field> : <><Field label="Km pr. periode"><input inputMode="decimal" value={values.periodKm} onChange={set("periodKm")} /></Field><Field label="Periode, måneder"><input inputMode="decimal" value={values.periodMonths} onChange={set("periodMonths")} /></Field></>}
        <Field label="Overkilometer, kr./km"><input inputMode="decimal" value={values.overageRate} onChange={set("overageRate")} /></Field><Field label="Underkilometer, kr./km"><input inputMode="decimal" value={values.underageRate} onChange={set("underageRate")} /></Field><Field label="Tolerance, km"><input inputMode="decimal" value={values.toleranceKm} onChange={set("toleranceKm")} /></Field><Field label="Loft, km"><input inputMode="decimal" value={values.capKm} onChange={set("capKm")} /></Field><Field label="Forventet km pr. måned"><input inputMode="decimal" value={values.manualExpectedMonthlyKm} onChange={set("manualExpectedMonthlyKm")} /><small>Manuel prognose ændrer ikke historiske målinger.</small></Field>
      </div> : null}
      {section === "services" ? <div className="form-grid">{[["maintenance","Service og vedligeholdelse"],["repairs","Reparationer"],["tyres","Dæk"],["tyreChange","Dækskifte"],["tyreStorage","Dækopbevaring"],["insurance","Forsikring"],["roadside","Vejhjælp"],["replacementVehicle","Erstatningsbil"]].map(([key,label])=><Field label={label} key={key}><select value={values[key]} onChange={set(key)}>{serviceOptions.map(([value,text])=><option value={value} key={value}>{text}</option>)}</select></Field>)}<Field label="Undtagelser og begrænsninger" wide><textarea value={values.serviceNotes} onChange={set("serviceNotes")} /></Field></div> : null}
      {section === "return" ? <div className="form-grid"><Field label="Afleveringssted"><input value={values.returnLocation} onChange={set("returnLocation")} /></Field><Field label="Kontakt ved aflevering"><input value={values.returnContact} onChange={set("returnContact")} /></Field><Field label="Standkrav" wide><textarea value={values.returnCondition} onChange={set("returnCondition")} /></Field><Field label="Nøgler, kabler, hjul og udstyr" wide><textarea value={values.returnEquipment} onChange={set("returnEquipment")} /></Field><Field label="Inspektionskrav" wide><textarea value={values.returnInspection} onChange={set("returnInspection")} /></Field><Field label="Gebyr ved tidlig aflevering"><input inputMode="decimal" value={values.earlyReturnFee} onChange={set("earlyReturnFee")} /></Field><Field label="Ændret kilometerkvote"><input inputMode="decimal" value={values.revisedAllowanceKm} onChange={set("revisedAllowanceKm")} /></Field><Field label="Øvrige afleveringsgebyrer"><input inputMode="decimal" value={values.otherReturnFees} onChange={set("otherReturnFees")} /></Field><Field label="Varsler før udløb" error={errors.warningDays}><input aria-label="Varslingsdage" value={values.warningDays.join(", ")} onChange={(event)=>setValues((current)=>({...current,warningDays:event.target.value.split(/[,; ]+/).filter(Boolean)}))} /><small>Fx 120, 90 og 30 dage.</small></Field></div> : null}
    </div>
    <footer><span>Gemmer kun lokalt i prototypens IndexedDB.</span><button type="button" className="secondary-button" onClick={requestClose}>Annuller</button><button type="submit" className="primary-button" disabled={busy || unitImageBusy}>{busy ? "Gemmer …" : unitImageBusy ? "Behandler billede …" : "Gem aftale"}</button></footer>
  </form></div>;
}
