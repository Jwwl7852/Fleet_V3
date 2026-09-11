const finite = (value) => Number.isFinite(value) ? value : 0;

const UNIT_FORMS = Object.freeze({
  pakke: ["pakke", "pakker"], pakker: ["pakke", "pakker"],
  rulle: ["rulle", "ruller"], ruller: ["rulle", "ruller"],
  kasse: ["kasse", "kasser"], kasser: ["kasse", "kasser"],
  æske: ["æske", "æsker"], æsker: ["æske", "æsker"],
  sæk: ["sæk", "sække"], sække: ["sæk", "sække"],
  dunk: ["dunk", "dunke"], dunke: ["dunk", "dunke"],
  pose: ["pose", "poser"], poser: ["pose", "poser"], par: ["par", "par"],
  stk: ["stk.", "stk."], "stk.": ["stk.", "stk."], liter: ["liter", "liter"],
  enhed: ["enhed", "enheder"], enheder: ["enhed", "enheder"],
});

export function unitLabel(unit = "enhed", quantity = 0) {
  const normalized = String(unit || "enhed").trim().toLowerCase();
  const forms = UNIT_FORMS[normalized];
  if (!forms) return String(unit || "enhed");
  return Number(quantity) === 1 ? forms[0] : forms[1];
}

export function formatUnitQuantity(quantity = 0, unit = "enhed") {
  return `${quantity} ${unitLabel(unit, quantity)}`;
}

export const PROCUREMENT_TABS = [
  { id: "all", label: "Alle" },
  { id: "draft", label: "Kladder" },
  { id: "processing", label: "Under behandling" },
  { id: "ordered", label: "Bestilt" },
  { id: "closed", label: "Afsluttede" },
];

export function procurementStatus(record = {}, receipts = []) {
  const status = record.status || record.approvalStatus || "draft";
  if (["annulleret", "cancelled"].includes(status)) return { id: "cancelled", label: "Annulleret", tab: "closed", tone: "bad" };
  if (["afvist", "rejected"].includes(status)) return { id: "rejected", label: "Afvist", tab: "closed", tone: "bad" };
  if (["afsluttet", "closed"].includes(status)) return { id: "closed", label: "Afsluttet", tab: "closed", tone: "ok" };
  if (["tilbageTilRettelse", "returned"].includes(status)) return { id: "returned", label: "Tilbage til rettelse", tab: "processing", tone: "warn" };
  if (["kladde", "draft", "new"].includes(status)) return { id: "draft", label: "Kladde", tab: "draft", tone: "neutral" };
  if (["afventerGodkendelse", "pending", "pending-approval"].includes(status)) return { id: "pending", label: "Afventer godkendelse", tab: "processing", tone: "warn" };
  if (["godkendt", "approved"].includes(status)) return { id: "approved", label: "Godkendt — klar til bestilling", tab: "processing", tone: "ok" };
  const accepted = (record.lines || []).reduce((sum, line) => sum + acceptedQuantityForLine(receipts.filter((receipt) => receipt.orderId === record.id), line.id), 0);
  const ordered = (record.lines || []).reduce((sum, line) => sum + finite(line.quantity), 0);
  if (ordered > 0 && accepted >= ordered) return { id: "received", label: "Fuldt modtaget", tab: "ordered", tone: "ok" };
  if (accepted > 0 || ["part-received", "delvistModtaget"].includes(status)) return { id: "part-received", label: "Delvist modtaget", tab: "ordered", tone: "info" };
  return { id: "ordered", label: "Bestilt", tab: "ordered", tone: "info" };
}

export function recordsForProcurementTab(records = [], tab = "all", receipts = []) {
  if (tab === "all") return records;
  return records.filter((record) => procurementStatus(record, receipts).tab === tab);
}

export function validateOrderUnit(item = {}, quantity = 0) {
  const errors = [];
  const orderQuantity = Number(quantity);
  const minimum = finite(Number(item.minimumOrderQuantity ?? 1)) || 1;
  const step = finite(Number(item.orderStep ?? 1)) || 1;
  const unitsPerOrder = finite(Number(item.unitsPerOrder ?? 1));
  if (!Number.isFinite(orderQuantity) || orderQuantity < minimum) errors.push(`Mindste bestilling er ${formatUnitQuantity(minimum, item.orderUnit || item.unit || "enheder")}.`);
  if (Number.isFinite(orderQuantity) && Math.abs((orderQuantity - minimum) / step - Math.round((orderQuantity - minimum) / step)) > 1e-9) errors.push(`Antallet skal ændres i trin på ${step}.`);
  if (!Number.isFinite(unitsPerOrder) || unitsPerOrder <= 0) errors.push("Antal grundenheder pr. bestillingsenhed mangler.");
  return { ok: !errors.length, errors };
}

export function orderUnitSummary(item = {}, quantity = 0) {
  const orderQuantity = finite(Number(quantity));
  const unitsPerOrder = finite(Number(item.unitsPerOrder ?? 1));
  const orderUnit = item.orderUnit || item.unit || "enhed";
  const baseUnit = item.baseUnit || item.unit || orderUnit;
  const baseQuantity = orderQuantity * unitsPerOrder;
  const orderPriceOere = Number.isInteger(item.orderPriceOere)
    ? item.orderPriceOere
    : Math.round(finite(item.unitPriceOere) * unitsPerOrder);
  return {
    orderQuantity, orderUnit, baseQuantity, baseUnit, unitsPerOrder,
    totalOere: Math.round(orderQuantity * orderPriceOere), orderPriceOere,
    orderQuantityLabel: formatUnitQuantity(orderQuantity, orderUnit),
    baseQuantityLabel: formatUnitQuantity(baseQuantity, baseUnit),
    label: unitsPerOrder === 1
      ? formatUnitQuantity(orderQuantity, orderUnit)
      : `${formatUnitQuantity(orderQuantity, orderUnit)} = ${formatUnitQuantity(baseQuantity, baseUnit)}`,
  };
}

export function orderTotalOere(order = {}) {
  return (order.lines || []).reduce((sum, line) => sum + finite(line.quantity) * finite(line.unitPriceOere), 0);
}

export const LINE_APPROVAL_ACTIONS = Object.freeze(["approve", "defer", "return", "reject"]);

/** Del en gemt indkøbsliste uden at miste de linjer/mængder, der skal vente. */
export function splitDraftSelection(lines = [], quantities = {}) {
  const submitted = [];
  const remaining = [];
  const errors = {};
  for (const line of lines) {
    const available = finite(Number(line.quantity));
    const selected = finite(Number(quantities[line.id] ?? 0));
    if (selected < 0 || selected > available) {
      errors[line.id] = `Der kan højst sendes ${available} ${line.orderUnit || line.unit || "enheder"}.`;
      continue;
    }
    if (selected > 0) submitted.push({ ...line, quantity: selected, sourceLineId: line.sourceLineId || line.id, sourceQuantity: available });
    if (available - selected > 0) remaining.push({ ...line, quantity: available - selected, sourceLineId: line.sourceLineId || line.id, sourceQuantity: available });
  }
  if (!submitted.length && !Object.keys(errors).length) errors.selection = "Vælg mindst én linje eller mængde at sende videre.";
  return { ok: !Object.keys(errors).length, errors, submitted, remaining };
}

/**
 * Afgør kun de valgte mængder. Ikke-valgte og delvist godkendte mængder
 * forbliver eksplicit ventende og kan aldrig glide med i en leverandørordre.
 */
export function decideApprovalLines(approval = {}, decisions = {}, { actorId = "unknown", now = Date.now() } = {}) {
  const errors = {};
  const history = [...(approval.history || [])];
  const lines = (approval.lines || approval.draftLines || []).map((line) => {
    const requested = finite(Number(line.requestedQuantity ?? line.quantity));
    const approvedBefore = finite(Number(line.approvedQuantity));
    const orderedBefore = finite(Number(line.orderedApprovedQuantity));
    const row = decisions[line.id];
    if (!row) return { ...line, requestedQuantity: requested, approvedQuantity: approvedBefore, orderedApprovedQuantity: orderedBefore, pendingQuantity: Math.max(0, requested - approvedBefore - finite(line.rejectedQuantity)) };
    const action = row.action;
    if (!LINE_APPROVAL_ACTIONS.includes(action)) {
      errors[line.id] = "Vælg godkend, udskyd, send tilbage eller afvis.";
      return line;
    }
    const unresolved = Math.max(0, requested - approvedBefore - finite(line.rejectedQuantity));
    const quantity = action === "approve" ? finite(Number(row.quantity)) : unresolved;
    const reason = String(row.reason || "").trim();
    if (action === "approve" && (quantity <= 0 || quantity > unresolved)) {
      errors[line.id] = `Der kan godkendes mellem 1 og ${unresolved} ${line.orderUnit || line.unit || "enheder"}.`;
      return line;
    }
    if (action !== "approve" && !reason) {
      errors[line.id] = "En begrundelse er påkrævet.";
      return line;
    }
    const approvedQuantity = approvedBefore + (action === "approve" ? quantity : 0);
    const rejectedQuantity = finite(line.rejectedQuantity) + (action === "reject" ? quantity : 0);
    const pendingQuantity = Math.max(0, requested - approvedQuantity - rejectedQuantity);
    history.push({ at: now, actorId, lineId: line.id, action, quantity, reason: reason || null });
    return {
      ...line, requestedQuantity: requested, approvedQuantity, orderedApprovedQuantity: orderedBefore,
      rejectedQuantity, pendingQuantity,
      approvalState: action === "approve" && pendingQuantity > 0 ? "partially-approved" : action,
      lastDecisionReason: reason || null, lastDecisionAt: now, lastDecisionBy: actorId,
    };
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  if (history.length === (approval.history || []).length) return { ok: false, errors: { decisions: "Vælg mindst én linje at behandle." } };
  const approvedOrderLines = lines
    .map((line) => ({ ...line, quantity: Math.max(0, finite(line.approvedQuantity) - finite(line.orderedApprovedQuantity)) }))
    .filter((line) => line.quantity > 0);
  const stillWaiting = lines.some((line) => finite(line.pendingQuantity) > 0 && !["reject", "return"].includes(line.approvalState));
  return {
    ok: true, lines, history, approvedOrderLines,
    status: stillWaiting ? (approvedOrderLines.length ? "partially-approved" : "pending") : approvedOrderLines.length ? "approved" : "processed",
    approvalBasisOere: Number.isInteger(approval.approvalBasisOere)
      ? approval.approvalBasisOere
      : (approval.lines || approval.draftLines || []).reduce((sum, line) => sum + finite(line.quantity) * finite(line.unitPriceOere), 0),
  };
}

export function splitOrdersBySupplier(lines = [], { year = new Date().getFullYear(), start = 1 } = {}) {
  const groups = new Map();
  for (const line of lines) {
    const supplierId = line.supplierId || null;
    if (!groups.has(supplierId)) groups.set(supplierId, []);
    groups.get(supplierId).push({
      ...line,
      categorySnapshot: line.categorySnapshot || line.category || "Ukategoriseret",
      sourceNeedIds: [...new Set(line.sourceNeedIds || (line.needId ? [line.needId] : []))],
    });
  }
  let sequence = start;
  return [...groups.entries()].map(([supplierId, orderLines]) => ({
    supplierId,
    poNumber: supplierId ? `PO-${year}-${String(sequence++).padStart(4, "0")}` : null,
    lines: orderLines,
    blockedReason: supplierId ? null : "Vælg leverandør, før bestillingen kan oprettes.",
  }));
}

export function approvalRequirement(order = {}, rules = []) {
  const totalOere = orderTotalOere(order);
  const matching = rules
    .filter((rule) => rule.active !== false)
    .filter((rule) => !rule.departmentId || rule.departmentId === order.departmentId)
    .filter((rule) => totalOere >= finite(rule.thresholdOere))
    .sort((a, b) => finite(b.thresholdOere) - finite(a.thresholdOere));
  return matching[0] || null;
}

export function approvedRevisionIsCurrent(order = {}) {
  return Number.isInteger(order.revision)
    && Number.isInteger(order.approvedRevision)
    && order.revision === order.approvedRevision;
}

export function canSendOrder(order = {}) {
  if (order.approvalStatus !== "approved") return { ok: false, reason: "Bestillingen er ikke godkendt." };
  if (!approvedRevisionIsCurrent(order)) return { ok: false, reason: "Bestillingen er ændret siden godkendelsen og skal vurderes igen." };
  if (order.sendStatus === "sending" || order.sendStatus === "unknown") {
    return { ok: false, reason: "Et afsendelsesforsøg er allerede i gang eller har ukendt resultat. Kontrollér forsøget før en ny afsendelse." };
  }
  if (order.sendStatus === "accepted") return { ok: false, reason: "Denne godkendte revision er allerede sendt." };
  return { ok: true, reason: null };
}

export function acceptedQuantityForLine(receipts = [], lineId) {
  return receipts.reduce((sum, receipt) => sum + (receipt.lines || [])
    .filter((line) => line.orderLineId === lineId)
    .reduce((lineSum, line) => lineSum + finite(line.acceptedQuantity), 0), 0);
}

export function remainingQuantity(order, receipts, lineId) {
  const line = (order?.lines || []).find((item) => item.id === lineId);
  return Math.max(0, finite(line?.quantity) - acceptedQuantityForLine(receipts, lineId));
}

export function buildReceipt(order, receipts = [], input = {}, { actorId = "unknown", now = Date.now() } = {}) {
  if (!order?.id) return { ok: false, errors: { order: "Bestillingen mangler." } };
  const errors = {};
  const lines = [];
  for (const orderLine of order.lines || []) {
    const row = input.lines?.[orderLine.id] || {};
    const delivered = finite(Number(row.deliveredQuantity));
    const damaged = finite(Number(row.damagedQuantity));
    const rejected = finite(Number(row.rejectedQuantity));
    const accepted = delivered - damaged - rejected;
    const remaining = remainingQuantity(order, receipts, orderLine.id);
    if (delivered < 0 || damaged < 0 || rejected < 0 || accepted < 0) {
      errors[orderLine.id] = "Mængder må ikke være negative, og skade/afvisning må ikke overstige leveringen.";
      continue;
    }
    if (accepted > remaining) {
      errors[orderLine.id] = `Der kan højst godkendes ${remaining} ${orderLine.unit}.`;
      continue;
    }
    if (delivered > 0) lines.push({
      orderLineId: orderLine.id,
      deliveredQuantity: delivered,
      acceptedQuantity: accepted,
      damagedQuantity: damaged,
      rejectedQuantity: rejected,
      unit: orderLine.unit,
    });
  }
  if (!lines.length && !Object.keys(errors).length) errors.lines = "Angiv mindst én modtaget mængde.";
  if (!input.receivedDate) errors.receivedDate = "Vælg modtagelsesdato.";
  if (!input.receivedBy) errors.receivedBy = "Vælg modtager.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    receipt: {
      id: input.id || `receipt-${now}`,
      orderId: order.id,
      tenantId: order.tenantId,
      lines,
      receivedDate: input.receivedDate,
      receivedBy: input.receivedBy,
      deliveryNote: input.deliveryNote || null,
      attachments: input.attachments || [],
      note: input.note || null,
      createdAt: now,
      createdBy: actorId,
      correctionOf: input.correctionOf || null,
    },
  };
}

export function receiptValueOere(order, receipt) {
  return (receipt?.lines || []).reduce((sum, receivedLine) => {
    const orderLine = (order?.lines || []).find((line) => line.id === receivedLine.orderLineId);
    return sum + finite(receivedLine.acceptedQuantity) * finite(orderLine?.unitPriceOere);
  }, 0);
}

export function matchInvoice({ order, receipts = [], invoice, previousInvoices = [] } = {}) {
  if (!order || !invoice) return { status: "missing", duplicate: false, lines: [] };
  const duplicate = previousInvoices.some((item) => item.id !== invoice.id
    && item.supplierId === invoice.supplierId && item.invoiceNumber === invoice.invoiceNumber);
  const previousByLine = new Map();
  for (const previous of previousInvoices.filter((item) => item.id !== invoice.id && item.status !== "rejected")) {
    for (const line of previous.lines || []) previousByLine.set(line.orderLineId, finite(previousByLine.get(line.orderLineId)) + finite(line.quantity));
  }
  const lines = (invoice.lines || []).map((invoiceLine) => {
    const orderLine = (order.lines || []).find((line) => line.id === invoiceLine.orderLineId);
    const received = acceptedQuantityForLine(receipts, invoiceLine.orderLineId);
    const alreadyInvoiced = finite(previousByLine.get(invoiceLine.orderLineId));
    const ordered = finite(orderLine?.quantity);
    const priceDifferenceOere = finite(invoiceLine.unitPriceOere) - finite(orderLine?.unitPriceOere);
    const quantityTooHigh = alreadyInvoiced + finite(invoiceLine.quantity) > Math.min(ordered, received);
    return {
      orderLineId: invoiceLine.orderLineId,
      ordered,
      received,
      alreadyInvoiced,
      invoiced: finite(invoiceLine.quantity),
      agreedUnitPriceOere: finite(orderLine?.unitPriceOere),
      invoiceUnitPriceOere: finite(invoiceLine.unitPriceOere),
      priceDifferenceOere,
      quantityTooHigh,
      status: !orderLine ? "missing-line" : quantityTooHigh ? "quantity-deviation" : priceDifferenceOere !== 0 ? "price-deviation" : "match",
    };
  });
  const hasDeviation = duplicate || lines.some((line) => line.status !== "match");
  return { status: hasDeviation ? "deviation" : "match", duplicate, lines };
}

export function spendForPeriod(invoices = [], { from, to, departmentId, categoryId, supplierId, itemId } = {}) {
  const filtered = invoices.filter((invoice) => invoice.approvalStatus === "approved")
    .filter((invoice) => !from || invoice.approvedAt >= from)
    .filter((invoice) => !to || invoice.approvedAt < to)
    .filter((invoice) => !departmentId || invoice.departmentId === departmentId)
    .filter((invoice) => !supplierId || invoice.supplierId === supplierId);
  return filtered.reduce((sum, invoice) => sum + (invoice.lines || [])
    .filter((line) => !categoryId || line.categorySnapshot === categoryId)
    .filter((line) => !itemId || line.itemId === itemId)
    .reduce((lineSum, line) => {
      const sign = invoice.type === "credit-note" ? -1 : 1;
      return lineSum + sign * finite(line.quantity) * finite(line.unitPriceOere);
    }, 0), 0);
}

export function documentedSpendForPeriod(invoices = [], cardPurchases = [], filters = {}) {
  const invoiceSpendOere = spendForPeriod(invoices, filters);
  const invoiceDocumentRefs = new Set(invoices
    .filter((invoice) => invoice.approvalStatus === "approved")
    .map((invoice) => invoice.paymentDocumentRef || invoice.documentRef)
    .filter(Boolean));
  const cardSpendOere = cardPurchases
    .filter((purchase) => purchase.economyStatus === "documented")
    .filter((purchase) => purchase.confirmationSource === "bank" || purchase.confirmationSource === "user")
    .filter((purchase) => !purchase.documentRef || !invoiceDocumentRefs.has(purchase.documentRef))
    .filter((purchase) => !filters.from || purchase.paymentAt >= filters.from)
    .filter((purchase) => !filters.to || purchase.paymentAt < filters.to)
    .filter((purchase) => !filters.departmentId || purchase.departmentId === filters.departmentId)
    .filter((purchase) => !filters.supplierId || purchase.supplierId === filters.supplierId)
    .reduce((sum, purchase) => sum + (purchase.kind === "refund" ? -1 : 1) * finite(purchase.amountOere), 0);
  return { invoiceSpendOere, cardSpendOere, totalOere: invoiceSpendOere + cardSpendOere };
}

export function budgetForPeriod(setup = {}, period, departmentId) {
  if (!/^\d{4}-\d{2}$/.test(String(period || ""))) return null;
  const rows = Object.values(setup?.budgetter?.[period] || {});
  if (departmentId) {
    const row = rows.find((item) => item.departmentId === departmentId);
    return Number.isInteger(row?.amountOere) ? row.amountOere : null;
  }
  if (!rows.length || rows.some((row) => !Number.isInteger(row?.amountOere))) return null;
  return rows.reduce((sum, row) => sum + row.amountOere, 0);
}

export function quantitiesByItem(orders = [], receipts = []) {
  const groups = new Map();
  for (const order of orders.filter((item) => item.status !== "cancelled")) {
    for (const line of order.lines || []) {
      const key = `${line.itemId || line.name}::${line.unit}`;
      const current = groups.get(key) || { itemId: line.itemId || null, name: line.name, unit: line.unit, ordered: 0, received: 0, remaining: 0 };
      current.ordered += finite(line.quantity);
      current.received += acceptedQuantityForLine(receipts.filter((receipt) => receipt.orderId === order.id), line.id);
      current.remaining = current.ordered - current.received;
      groups.set(key, current);
    }
  }
  return [...groups.values()];
}

export function comparableUnitPrice(entry = {}) {
  if (!Number.isFinite(entry.packageQuantity) || entry.packageQuantity <= 0 || !entry.baseUnit) {
    return { comparable: false, reason: "Pakningsstørrelse eller grundenhed mangler." };
  }
  if (!Number.isInteger(entry.packagePriceOere)) return { comparable: false, reason: "Prisgrundlag mangler." };
  if (entry.currency && entry.currency !== "DKK") return { comparable: false, reason: "Valutaen er ikke normaliseret til DKK." };
  return {
    comparable: true,
    unitPriceOere: Math.round((entry.packagePriceOere - finite(entry.discountOere) + finite(entry.freightOere)) / entry.packageQuantity),
    baseUnit: entry.baseUnit,
    priceDate: entry.priceDate || null,
    basis: entry.basis || "unknown",
  };
}
