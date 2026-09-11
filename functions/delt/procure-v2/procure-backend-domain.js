/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/procure-v2/procure-backend-domain.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const entries = (value) => Array.isArray(value) ? value : Object.entries(value || {}).map(([id, item]) => ({ id, ...item }));

export const serverOrdreLinjer = (ordre = {}) => entries(ordre.linjer || ordre.lines).map((line) => ({
  id: line.id,
  navn: line.vare || line.name,
  antal: finite(line.antal ?? line.quantity),
  enhed: line.enhed || line.unit || "stk.",
  prisOere: finite(line.prisPrEnhedOere ?? line.unitPriceOere),
  vareId: line.forbrugsvareId || line.vareId || line.itemId || null,
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
    if (delivered === 0 && damaged === 0 && rejected === 0) continue;
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

export function returneretPrLinje(ordre = {}) {
  const totals = new Map();
  for (const returned of entries(ordre.returneringer).filter((row) => row.status === "registreret")) {
    for (const line of entries(returned.linjer || returned.lines)) {
      const id = line.ordrelinjeId || line.orderLineId || line.id;
      totals.set(id, finite(totals.get(id)) + finite(line.antal ?? line.quantity));
    }
  }
  return totals;
}

export function byggServerReturnering(ordre, input = {}, { uid, now = Date.now() } = {}) {
  const received = modtagetPrLinje(ordre); const returned = returneretPrLinje(ordre);
  const errors = {}; const lines = {}; let valueOere = 0;
  for (const row of input.lines || []) {
    const orderLine = serverOrdreLinjer(ordre).find((line) => line.id === row.orderLineId);
    const quantity = finite(row.quantity);
    const available = orderLine ? finite(received.get(orderLine.id)) - finite(returned.get(orderLine.id)) : 0;
    if (!orderLine || quantity <= 0 || quantity > available) { errors[row.orderLineId || "linje"] = `Der kan højst returneres ${Math.max(0, available)} godkendt modtaget.`; continue; }
    lines[orderLine.id] = { ordrelinjeId: orderLine.id, antal: quantity, enhed: orderLine.enhed, aftaltPrisPrEnhedOere: orderLine.prisOere };
    valueOere += quantity * orderLine.prisOere;
  }
  if (!String(input.reason || "").trim()) errors.reason = "Skriv årsagen til returneringen.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.returnDate || "")) errors.returnDate = "Vælg returneringsdato.";
  if (!Object.keys(lines).length) errors.lines = "Vælg mindst én modtaget vare.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, returned: { status: "registreret", returneretDato: input.returnDate,
    begrundelse: String(input.reason).trim().slice(0, 500), kreditstatus: "afventer-kreditnota",
    fakturaId: String(input.invoiceId || "").slice(0, 80) || null, linjer: lines, vaerdiOere: valueOere,
    registreretAf: uid, registreretMs: now } };
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
    ...(input.returnId ? { returneringId: input.returnId } : {}),
  } };
}

export function nettoFaktureretOere(invoices = []) {
  return invoices.filter((invoice) => invoice.status === "godkendt" || invoice.status === "bogfoert")
    .reduce((sum, invoice) => sum + (invoice.fakturatype === "credit-note" ? -1 : 1) * finite(invoice.beloebOere), 0);
}

export function sanitizeMobileDraft(input = {}, { uid, now = Date.now(), revision = 1 } = {}) {
  const items = {};
  for (const [id, value] of Object.entries(input.items || {})) {
    const quantity = Number(value);
    if (/^[A-Za-z0-9_-]{1,80}$/.test(id) && Number.isFinite(quantity) && quantity > 0) items[id] = quantity;
  }
  const custom = {};
  for (const row of entries(input.custom)) {
    const id = String(row.id || "").slice(0, 80);
    const name = String(row.name || row.navn || "").trim().slice(0, 200);
    const quantity = Number(row.quantity ?? row.antal);
    if (/^[A-Za-z0-9_-]{1,80}$/.test(id) && name && Number.isFinite(quantity) && quantity > 0) {
      custom[id] = { id, name, quantity, unit: String(row.unit || "stk.").slice(0, 30), category: String(row.category || "Ukategoriseret").slice(0, 80) };
    }
  }
  return {
    revision, items, custom,
    departmentId: String(input.departmentId || "").slice(0, 80),
    department: String(input.department || "").slice(0, 120),
    deliveryLocationId: String(input.deliveryLocationId || "").slice(0, 80) || null,
    deliveryLocation: String(input.deliveryLocation || "").slice(0, 160),
    wantedDate: input.asSoonAsPossible ? null : String(input.wantedDate || "").slice(0, 10) || null,
    asSoonAsPossible: Boolean(input.asSoonAsPossible),
    updatedBy: uid, updatedAt: now,
  };
}

export function splitServerDraft(draft = {}, selections = []) {
  const wanted = new Map(selections.map((row) => [String(row.id), Number(row.quantity)]));
  const submitted = [];
  const next = { ...draft, items: { ...(draft.items || {}) }, custom: { ...(draft.custom || {}) } };
  const errors = {};
  for (const [id, quantity] of wanted) {
    const custom = next.custom[id];
    const available = Number(custom?.quantity ?? next.items[id] ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > available) { errors[id] = `Ugyldig delmængde; højst ${available}.`; continue; }
    submitted.push({ id, quantity, custom: Boolean(custom), ...(custom || {}) });
    const remainder = available - quantity;
    if (custom) remainder > 0 ? next.custom[id] = { ...custom, quantity: remainder } : delete next.custom[id];
    else remainder > 0 ? next.items[id] = remainder : delete next.items[id];
  }
  if (!submitted.length && !Object.keys(errors).length) errors.selection = "Vælg mindst én linje.";
  return { ok: !Object.keys(errors).length, errors, submitted, draft: next };
}

export function decideServerApproval(approval = {}, decisions = [], { uid, now = Date.now() } = {}) {
  const byId = new Map(decisions.map((row) => [String(row.lineId), row]));
  const errors = {};
  const history = { ...(approval.history || {}) };
  const lines = {};
  for (const line of entries(approval.lines)) {
    const requested = finite(line.requestedQuantity ?? line.quantity);
    const approvedBefore = finite(line.approvedQuantity);
    const orderedBefore = finite(line.orderedApprovedQuantity);
    const rejectedBefore = finite(line.rejectedQuantity);
    const unresolved = Math.max(0, requested - approvedBefore - rejectedBefore);
    const decision = byId.get(String(line.id));
    if (!decision) {
      lines[line.id] = { ...line, requestedQuantity: requested, approvedQuantity: approvedBefore, orderedApprovedQuantity: orderedBefore, rejectedQuantity: rejectedBefore, pendingQuantity: unresolved };
      continue;
    }
    const action = String(decision.action || "");
    const reason = String(decision.reason || "").trim().slice(0, 500);
    const quantity = action === "approve" ? Number(decision.quantity) : unresolved;
    if (!["approve", "defer", "return", "reject"].includes(action)) errors[line.id] = "Ukendt linjeafgørelse.";
    else if (action === "approve" && (!Number.isFinite(quantity) || quantity <= 0 || quantity > unresolved)) errors[line.id] = `Der kan højst godkendes ${unresolved}.`;
    else if (action !== "approve" && !reason) errors[line.id] = "Begrundelse er påkrævet.";
    if (errors[line.id]) { lines[line.id] = line; continue; }
    const approvedQuantity = approvedBefore + (action === "approve" ? quantity : 0);
    const rejectedQuantity = rejectedBefore + (action === "reject" ? quantity : 0);
    const pendingQuantity = Math.max(0, requested - approvedQuantity - rejectedQuantity);
    lines[line.id] = { ...line, requestedQuantity: requested, approvedQuantity, orderedApprovedQuantity: orderedBefore, rejectedQuantity, pendingQuantity,
      approvalState: action === "approve" && pendingQuantity > 0 ? "partially-approved" : action,
      lastDecisionReason: reason || null, lastDecisionAt: now, lastDecisionBy: uid };
    history[`${now}-${line.id}`] = { at: now, actorId: uid, lineId: line.id, action, quantity, reason: reason || null };
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!byId.size) return { ok: false, errors: { decisions: "Vælg mindst én linje." } };
  const approvedOrderLines = Object.values(lines).map((line) => ({ ...line, quantity: Math.max(0, finite(line.approvedQuantity) - finite(line.orderedApprovedQuantity)) })).filter((line) => line.quantity > 0);
  const pending = Object.values(lines).some((line) => finite(line.pendingQuantity) > 0);
  return { ok: true, lines, history, approvedOrderLines, status: pending ? (approvedOrderLines.length ? "partially-approved" : "pending") : approvedOrderLines.length ? "approved" : "processed" };
}
