const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const entries = (value) => Array.isArray(value) ? value : Object.entries(value || {}).map(([id, item]) => ({ id, ...item }));

export const serverOrdreLinjer = (ordre = {}) => entries(ordre.linjer || ordre.lines).map((line) => ({
  id: line.id,
  navn: line.vare || line.name,
  antal: finite(line.antal ?? line.quantity),
  enhed: line.enhed || line.unit || "stk.",
  prisOere: finite(line.prisPrEnhedOere ?? line.unitPriceOere),
  vareId: line.forbrugsvareId || line.itemId || null,
  varegruppe: line.varegruppe || line.categorySnapshot || "Ukategoriseret",
}));

export function registreredeModtagelser(ordre = {}) {
  return entries(ordre.modtagelser).filter((receipt) => receipt.status === "registreret");
}

export function modtagetPrLinje(ordre = {}) {
  const totals = new Map();
  for (const receipt of registreredeModtagelser(ordre)) {
    for (const line of entries(receipt.linjer || receipt.lines)) {
      const id = line.ordrelinjeId || line.orderLineId || line.id;
      totals.set(id, finite(totals.get(id)) + finite(line.godkendtAntal ?? line.acceptedQuantity));
    }
  }
  return totals;
}

export function byggServerModtagelse(ordre, input = {}, { uid, now = Date.now() } = {}) {
  const errors = {};
  const lines = {};
  const current = modtagetPrLinje(ordre);
  for (const row of input.lines || []) {
    const orderLine = serverOrdreLinjer(ordre).find((line) => line.id === row.orderLineId);
    if (!orderLine) { errors[row.orderLineId || "linje"] = "Ordrelinjen findes ikke."; continue; }
    const delivered = finite(row.deliveredQuantity);
    const damaged = finite(row.damagedQuantity);
    const rejected = finite(row.rejectedQuantity);
    const accepted = delivered - damaged - rejected;
    const remaining = orderLine.antal - finite(current.get(orderLine.id));
    if (delivered <= 0 || damaged < 0 || rejected < 0 || accepted < 0) errors[orderLine.id] = "Mængderne er ugyldige.";
    else if (accepted > remaining) errors[orderLine.id] = `Der kan højst godkendes ${remaining} ${orderLine.enhed}.`;
    else lines[orderLine.id] = {
      ordrelinjeId: orderLine.id, leveretAntal: delivered, godkendtAntal: accepted,
      beskadigetAntal: damaged, afvistAntal: rejected, enhed: orderLine.enhed,
    };
  }
  if (!Object.keys(lines).length) errors.lines = "Angiv mindst én leveret mængde.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedDate || "")) errors.receivedDate = "Vælg modtagelsesdato.";
  if (!String(input.receivedBy || "").trim()) errors.receivedBy = "Angiv modtager.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, receipt: {
    status: "registreret", type: "modtagelse", ordreRevision: Number(ordre.revision || 1),
    modtagetDato: input.receivedDate, modtagetAfNavn: String(input.receivedBy).trim(),
    foelgeseddel: String(input.deliveryNote || "").trim() || null,
    note: String(input.note || "").trim() || null, linjer: lines,
    registreretAf: uid, registreretMs: now,
  } };
}

export function byggServerKorrektion(ordre, input = {}, { uid, now = Date.now() } = {}) {
  const current = modtagetPrLinje(ordre);
  const lines = {};
  const errors = {};
  for (const row of input.lines || []) {
    const orderLine = serverOrdreLinjer(ordre).find((line) => line.id === row.orderLineId);
    const delta = finite(row.acceptedDelta);
    if (!orderLine || delta === 0) { errors[row.orderLineId || "linje"] = "Korrektionen er ugyldig."; continue; }
    const next = finite(current.get(orderLine.id)) + delta;
    if (next < 0 || next > orderLine.antal) errors[orderLine.id] = "Korrektionen giver et ugyldigt samlet modtaget antal.";
    else lines[orderLine.id] = { ordrelinjeId: orderLine.id, godkendtAntal: delta, leveretAntal: 0, beskadigetAntal: 0, afvistAntal: 0, enhed: orderLine.enhed };
  }
  if (!String(input.reason || "").trim()) errors.reason = "Skriv årsagen til korrektionen.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, receipt: { status: "registreret", type: "korrektion", korrektionAf: input.correctionOf,
    ordreRevision: Number(ordre.revision || 1), modtagetDato: input.receivedDate,
    modtagetAfNavn: String(input.receivedBy || "").trim(), begrundelse: String(input.reason).trim(),
    linjer: lines, registreretAf: uid, registreretMs: now } };
}

export function ordreErFuldtModtaget(ordre) {
  const current = modtagetPrLinje(ordre);
  return serverOrdreLinjer(ordre).every((line) => finite(current.get(line.id)) === line.antal);
}

export function byggImporteretFaktura(ordre, input = {}, { uid, now = Date.now() } = {}) {
  const errors = {};
  if (!String(input.invoiceNumber || "").trim()) errors.invoiceNumber = "Fakturanummer mangler.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate || "")) errors.invoiceDate = "Fakturadato mangler.";
  if (!['invoice','credit-note'].includes(input.type)) errors.type = "Ukendt dokumenttype.";
  const lines = {};
  let gross = 0;
  let deviation = 0;
  for (const row of input.lines || []) {
    const orderLine = serverOrdreLinjer(ordre).find((line) => line.id === row.orderLineId);
    const quantity = finite(row.quantity);
    const unitPrice = Number(row.unitPriceOere);
    if (!orderLine || quantity <= 0 || !Number.isInteger(unitPrice) || unitPrice < 0) { errors[row.orderLineId || "line"] = "Fakturalinjen er ugyldig."; continue; }
    lines[orderLine.id] = { ordrelinjeId: orderLine.id, vare: orderLine.navn, vareId: orderLine.vareId,
      varegruppe: orderLine.varegruppe, antal: quantity, enhed: orderLine.enhed,
      prisPrEnhedOere: unitPrice, aftaltPrisPrEnhedOere: orderLine.prisOere };
    gross += quantity * unitPrice;
    deviation += quantity * (unitPrice - orderLine.prisOere);
  }
  if (!Object.keys(lines).length) errors.lines = "Fakturaen mangler linjer.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, invoice: { leverandoerId: ordre.leverandoerId || ordre.supplierId,
    fakturanummer: String(input.invoiceNumber).trim(), fakturadatoMs: Date.parse(`${input.invoiceDate}T12:00:00Z`),
    status: "modtaget", beloebOere: gross, fakturatype: input.type, kilde: input.source || "upload",
    destinationArt: "procure", destinationId: ordre.id, ordreRevision: Number(ordre.revision || 1),
    linjer: lines, prisafvigelseOere: deviation, afvigelsesstatus: deviation === 0 ? "ingen" : "aaben",
    importRequestId: input.requestId, oprettetAf: uid, modtagetMs: now,
    ...(input.creditsInvoiceId ? { kreditererFakturaId: input.creditsInvoiceId } : {}),
  } };
}

export function nettoFaktureretOere(invoices = []) {
  return invoices.filter((invoice) => invoice.status === "godkendt" || invoice.status === "bogfoert")
    .reduce((sum, invoice) => sum + (invoice.fakturatype === "credit-note" ? -1 : 1) * finite(invoice.beloebOere), 0);
}
