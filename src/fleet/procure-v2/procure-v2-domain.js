const finite = (value) => Number.isFinite(value) ? value : 0;

export function orderTotalOere(order = {}) {
  return (order.lines || []).reduce((sum, line) => sum + finite(line.quantity) * finite(line.unitPriceOere), 0);
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
