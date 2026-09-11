const finite = (value) => value === null || value === undefined || value === ""
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const id = (value) => String(value || "").trim();

export const INVENTORY_TYPES = Object.freeze({
  startbeholdning: { label: "Startbeholdning", direction: 1 },
  modtaget: { label: "Modtagelse", direction: 1 },
  forbrug: { label: "Forbrug", direction: -1 },
  retur: { label: "Retur til leverandør", direction: -1 },
  optaelling: { label: "Optælling", direction: 0 },
  korrektion: { label: "Lagerkorrektion", direction: 0 },
  flytningUd: { label: "Flytning ud", direction: -1 },
  flytningInd: { label: "Flytning ind", direction: 1 },
  svind: { label: "Svind", direction: -1 },
});

export const USER_INVENTORY_TYPES = Object.freeze([
  "startbeholdning", "forbrug", "optaelling", "korrektion", "flytning",
]);

export function inventoryLocationKey(warehouseId, locationId) {
  const warehouse = id(warehouseId);
  const location = id(locationId);
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(warehouse) || !/^[A-Za-z0-9_-]{1,60}$/.test(location)) return null;
  return `${warehouse.length}_${warehouse}_${location}`;
}

export function inventoryLocation(item = {}, warehouseId, locationId) {
  const key = inventoryLocationKey(warehouseId, locationId);
  return key ? item.lagerplaceringer?.[key] || null : null;
}

export function inventoryTotal(item = {}) {
  const locations = Object.values(item.lagerplaceringer || {});
  if (!locations.length || locations.some((row) => !Number.isFinite(Number(row.beholdning)))) return null;
  return locations.reduce((sum, row) => sum + Number(row.beholdning), 0);
}

const commonErrors = (item, input) => {
  const errors = {};
  if (!item?.id) errors.item = "Varen findes ikke.";
  if (item?.lagerfoert !== true) errors.item = "Varen er ikke markeret som lagerført.";
  if (!inventoryLocationKey(input.warehouseId, input.locationId)) errors.location = "Vælg et gyldigt lager og en gyldig placering.";
  const unit = id(input.unit || item?.grundenhed || item?.enhed);
  const stockUnit = id(item?.grundenhed || item?.enhed);
  if (!unit || unit !== stockUnit) errors.unit = `Bevægelsen skal registreres i ${stockUnit || "varens lagerenhed"}.`;
  return errors;
};

export function applyInventoryMovement(item = {}, input = {}, { uid = "", actorName = "", now = Date.now() } = {}) {
  const errors = commonErrors(item, input);
  const type = id(input.type);
  if (!INVENTORY_TYPES[type] || type === "flytningInd" || type === "flytningUd") errors.type = "Vælg en gyldig lagerbevægelse.";
  const key = inventoryLocationKey(input.warehouseId, input.locationId);
  const current = key ? item.lagerplaceringer?.[key] || null : null;
  const before = finite(current?.beholdning);
  const revision = Number(current?.revision || 0);
  if (Number(input.expectedRevision) !== revision) errors.revision = "Beholdningen er ændret af en anden. Genindlæs og bekræft igen.";

  let after = before;
  let delta = 0;
  let quantity = finite(input.quantity);
  if (type === "startbeholdning") {
    if (before !== null) errors.type = "Startbeholdning kan kun registreres, når beholdningen er ukendt.";
    if (quantity === null || quantity < 0) errors.quantity = "Angiv den optalte startbeholdning.";
    after = quantity;
    delta = quantity;
  } else if (type === "optaelling") {
    if (before === null) errors.type = "Brug Startbeholdning første gang varen optælles på placeringen.";
    if (quantity === null || quantity < 0) errors.quantity = "Angiv det faktiske antal på hylden.";
    after = quantity;
    delta = quantity === null || before === null ? 0 : quantity - before;
    if (delta !== 0 && !id(input.reason)) errors.reason = "Begrund forskellen mellem beregnet og optalt beholdning.";
  } else if (type === "korrektion") {
    const requestedDelta = finite(input.delta);
    if (before === null) errors.type = "Registrér en startbeholdning før en korrektion.";
    if (requestedDelta === null || requestedDelta === 0) errors.delta = "Angiv en korrektion forskellig fra nul.";
    if (!id(input.reason)) errors.reason = "En lagerkorrektion skal have en begrundelse.";
    delta = requestedDelta || 0;
    after = before === null ? null : before + delta;
    quantity = Math.abs(delta);
  } else {
    if (before === null) errors.type = "Beholdningen er ukendt. Registrér en startbeholdning først.";
    if (quantity === null || quantity <= 0) errors.quantity = "Antallet skal være større end nul.";
    const direction = INVENTORY_TYPES[type]?.direction || 0;
    delta = (quantity || 0) * direction;
    after = before === null ? null : before + delta;
    if (["retur", "svind"].includes(type) && !id(input.reason)) errors.reason = "Skriv en begrundelse.";
    if (type === "retur" && !id(input.orderId)) errors.orderId = "Vælg den bestilling, varen returneres fra.";
  }
  if (after !== null && after < 0) errors.quantity = "Bevægelsen kan ikke gøre den registrerede placering negativ. Optæl placeringen først.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const movement = {
    forbrugsvareId: item.id,
    art: type,
    antal: type === "optaelling" || type === "startbeholdning" ? Number(after) : Number(quantity),
    delta: Number(delta),
    enhed: id(item.grundenhed || item.enhed),
    lagerId: id(input.warehouseId), lager: id(input.warehouse),
    placeringId: id(input.locationId), placering: id(input.location),
    foer: before, efter: after,
    uid, medarbejderNavn: id(actorName) || null, ms: now,
    anmodningsnoegle: id(input.requestId),
    ...(id(input.reason) ? { note: id(input.reason).slice(0, 250) } : {}),
    ...(id(input.orderId) ? { ordreId: id(input.orderId) } : {}),
    ...(id(input.receiptId) ? { modtagelseId: id(input.receiptId) } : {}),
    ...(id(input.orderLineId) ? { ordrelinjeId: id(input.orderLineId) } : {}),
  };
  const nextLocation = {
    lagerId: movement.lagerId, lager: movement.lager,
    placeringId: movement.placeringId, placering: movement.placering,
    beholdning: after, enhed: movement.enhed, revision: revision + 1,
    senestBevaegetMs: now,
    ...(type === "optaelling" || type === "startbeholdning" ? { senestOptaltMs: now } : current?.senestOptaltMs ? { senestOptaltMs: current.senestOptaltMs } : {}),
  };
  const nextItem = { ...item, lagerplaceringer: { ...(item.lagerplaceringer || {}), [key]: nextLocation }, sidstBevaegetMs: now };
  const total = inventoryTotal(nextItem);
  if (total === null) delete nextItem.beholdning;
  else nextItem.beholdning = total;
  return { ok: true, item: nextItem, movement, location: nextLocation, key };
}

export function applyInventoryTransfer(item = {}, input = {}, context = {}) {
  const quantity = finite(input.quantity);
  const errors = {};
  if (quantity === null || quantity <= 0) errors.quantity = "Antallet skal være større end nul.";
  if (input.fromWarehouseId === input.toWarehouseId && input.fromLocationId === input.toLocationId) errors.location = "Vælg to forskellige lagerplaceringer.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const out = applyInventoryMovement(item, {
    type: "forbrug", quantity, unit: input.unit, requestId: `${input.requestId}-ud`,
    warehouseId: input.fromWarehouseId, warehouse: input.fromWarehouse,
    locationId: input.fromLocationId, location: input.fromLocation,
    expectedRevision: input.expectedFromRevision,
  }, context);
  if (!out.ok) return out;
  const destination = inventoryLocation(out.item, input.toWarehouseId, input.toLocationId);
  if (!destination || !Number.isFinite(Number(destination.beholdning))) {
    return { ok: false, errors: { destination: "Modtagerplaceringen skal have en registreret startbeholdning." } };
  }
  const inbound = applyInventoryMovement(out.item, {
    type: "modtaget", quantity, unit: input.unit, requestId: `${input.requestId}-ind`,
    warehouseId: input.toWarehouseId, warehouse: input.toWarehouse,
    locationId: input.toLocationId, location: input.toLocation,
    expectedRevision: input.expectedToRevision,
  }, context);
  if (!inbound.ok) return inbound;
  const transferId = id(input.requestId);
  const outMovement = { ...out.movement, art: "flytningUd", flytningId: transferId };
  const inMovement = { ...inbound.movement, art: "flytningInd", flytningId: transferId };
  return { ok: true, item: inbound.item, movements: [outMovement, inMovement], locations: [out.location, inbound.location] };
}

export function stockQuantityForOrderLine(item = {}, orderLine = {}, acceptedQuantity = 0) {
  const accepted = Number(acceptedQuantity);
  if (!Number.isFinite(accepted) || accepted < 0) return { ok: false, message: "Den modtagne mængde er ugyldig." };
  const stockUnit = id(item.grundenhed || item.enhed);
  const lineUnit = id(orderLine.enhed || orderLine.unit);
  if (lineUnit === stockUnit) return { ok: true, quantity: accepted, unit: stockUnit, factor: 1 };
  const orderUnit = id(item.bestillingsenhed || item.orderUnit || item.enhed);
  const factor = Number(item.antalPrBestillingsenhed || item.unitsPerOrder);
  if (lineUnit === orderUnit && Number.isFinite(factor) && factor > 0) {
    return { ok: true, quantity: accepted * factor, unit: stockUnit, factor };
  }
  return { ok: false, message: `Mængden i ${lineUnit || "ukendt enhed"} kan ikke omregnes til lagerenheden ${stockUnit || "ukendt"}.` };
}

const movementDelta = (row) => Number.isFinite(Number(row.delta)) ? Number(row.delta)
  : Number(row.efter) - Number(row.foer);

export function inventoryPeriodSummary(items = [], movements = [], { fromMs = 0, toMs = Number.MAX_SAFE_INTEGER, groupBy = "location" } = {}) {
  const groups = new Map();
  for (const movement of movements) {
    const key = `${movement.forbrugsvareId}|${movement.lagerId}|${movement.placeringId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(movement);
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const locationRows = [...groups.entries()].map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => Number(a.ms || 0) - Number(b.ms || 0));
    const inPeriod = sorted.filter((row) => Number(row.ms) >= fromMs && Number(row.ms) <= toMs);
    const beforeRows = sorted.filter((row) => Number(row.ms) < fromMs);
    const firstInPeriod = inPeriod[0];
    const opening = beforeRows.length ? finite(beforeRows.at(-1).efter)
      : firstInPeriod?.art === "startbeholdning" && finite(firstInPeriod.foer) === null ? 0
      : firstInPeriod ? finite(firstInPeriod.foer) : null;
    const last = inPeriod.at(-1);
    const sums = { receipts: 0, consumption: 0, returns: 0, corrections: 0, transfers: 0, counts: 0, countDeviation: 0 };
    for (const row of inPeriod) {
      const delta = movementDelta(row);
      if (row.art === "modtaget") sums.receipts += delta;
      else if (row.art === "forbrug") sums.consumption += Math.abs(delta);
      else if (row.art === "retur") sums.returns += Math.abs(delta);
      else if (["korrektion", "svind", "startbeholdning"].includes(row.art)) sums.corrections += delta;
      else if (["flytningInd", "flytningUd"].includes(row.art)) sums.transfers += delta;
      else if (row.art === "optaelling") { sums.counts += 1; sums.countDeviation += delta; sums.corrections += delta; }
    }
    const [itemId, warehouseId, locationId] = key.split("|");
    const item = byId.get(itemId) || { id: itemId, navn: itemId, enhed: inPeriod[0]?.enhed || "" };
    return { key, itemId, item, warehouseId, locationId, opening, closing: last ? finite(last.efter) : opening, movements: inPeriod, ...sums };
  });
  if (groupBy !== "warehouse") return locationRows;
  const warehouseRows = new Map();
  for (const row of locationRows) {
    const key = `${row.itemId}|${row.warehouseId}`;
    const current = warehouseRows.get(key) || { key, itemId: row.itemId, item: row.item,
      warehouseId: row.warehouseId, locationId: "", opening: 0, closing: 0, movements: [],
      receipts: 0, consumption: 0, returns: 0, corrections: 0, transfers: 0, counts: 0, countDeviation: 0,
      openingKnown: true, closingKnown: true };
    current.openingKnown &&= row.opening !== null;
    current.closingKnown &&= row.closing !== null;
    if (row.opening !== null) current.opening += row.opening;
    if (row.closing !== null) current.closing += row.closing;
    for (const field of ["receipts", "consumption", "returns", "corrections", "transfers", "counts", "countDeviation"]) current[field] += row[field];
    current.movements.push(...row.movements);
    warehouseRows.set(key, current);
  }
  return [...warehouseRows.values()].map(({ openingKnown, closingKnown, ...row }) => ({
    ...row, opening: openingKnown ? row.opening : null, closing: closingKnown ? row.closing : null,
    movements: row.movements.sort((a, b) => Number(a.ms || 0) - Number(b.ms || 0)),
  }));
}

export function inventoryCsv(rows = []) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["Vare", "Varenummer", "Lager", "Placering", "Primo", "Modtagelser", "Forbrug", "Retur", "Korrektioner", "Nettoflytning", "Ultimo", "Enhed"];
  return [header, ...rows.map((row) => [row.item.navn, row.item.varenummer, row.movements[0]?.lager || row.warehouseId, row.locationId ? row.movements[0]?.placering || row.locationId : "Alle placeringer", row.opening ?? "Ukendt", row.receipts, row.consumption, row.returns, row.corrections, row.transfers, row.closing ?? "Ukendt", row.item.grundenhed || row.item.enhed])]
    .map((columns) => columns.map(quote).join(";")).join("\r\n");
}
