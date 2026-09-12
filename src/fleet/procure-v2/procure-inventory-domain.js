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
    afdelingId: current?.afdelingId || id(input.departmentId || item.standardAfdelingId) || null,
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
    const sums = { starts: 0, receipts: 0, consumption: 0, returns: 0, corrections: 0, transfers: 0, counts: 0, countDeviation: 0 };
    for (const row of inPeriod) {
      const delta = movementDelta(row);
      if (row.art === "startbeholdning") sums.starts += delta;
      else if (row.art === "modtaget") sums.receipts += delta;
      else if (row.art === "forbrug") sums.consumption += Math.abs(delta);
      else if (row.art === "retur") sums.returns += Math.abs(delta);
      else if (["korrektion", "svind"].includes(row.art)) sums.corrections += delta;
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
      starts: 0, receipts: 0, consumption: 0, returns: 0, corrections: 0, transfers: 0, counts: 0, countDeviation: 0,
      openingKnown: true, closingKnown: true };
    current.openingKnown &&= row.opening !== null;
    current.closingKnown &&= row.closing !== null;
    if (row.opening !== null) current.opening += row.opening;
    if (row.closing !== null) current.closing += row.closing;
    for (const field of ["starts", "receipts", "consumption", "returns", "corrections", "transfers", "counts", "countDeviation"]) current[field] += row[field];
    current.movements.push(...row.movements);
    warehouseRows.set(key, current);
  }
  return [...warehouseRows.values()].map(({ openingKnown, closingKnown, ...row }) => ({
    ...row, opening: openingKnown ? row.opening : null, closing: closingKnown ? row.closing : null,
    movements: row.movements.sort((a, b) => Number(a.ms || 0) - Number(b.ms || 0)),
  }));
}

export function inventoryCsv(rows = [], { from = "", to = "" } = {}) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["Fra dato", "Til dato", "Vare", "Varenummer", "Lager", "Placering", "Primo", "Startbeholdning i perioden", "Modtagelser", "Forbrug", "Retur", "Korrektioner", "Nettoflytning", "Ultimo", "Enhed"];
  return [header, ...rows.map((row) => [from, to, row.item.navn, row.item.varenummer, row.movements[0]?.lager || row.warehouseId, row.locationId ? row.movements[0]?.placering || row.locationId : "Alle placeringer", row.opening ?? "Ukendt", row.starts, row.receipts, row.consumption, row.returns, row.corrections, row.transfers, row.closing ?? "Ukendt", row.item.grundenhed || row.item.enhed])]
    .map((columns) => columns.map(quote).join(";")).join("\r\n");
}

const isCount = (row) => ["startbeholdning", "optaelling"].includes(row?.art)
  && finite(row?.efter) !== null;

/**
 * Beregner fysisk lagerafgang mellem dokumenterede optaellinger.
 *
 * En optaellings egen delta er afstemningen til det talte antal og maa ikke
 * samtidig blive talt som forbrug. Derfor bruges de to observerede
 * beholdninger som intervallets endepunkter, mens kun de mellemliggende
 * fysiske bevægelser indgår i forklaringen.
 */
export function calculatedConsumptionIntervals(item = {}, movements = [], {
  fromMs = 0, toMs = Number.MAX_SAFE_INTEGER,
} = {}) {
  const relevant = movements
    .filter((row) => row.forbrugsvareId === item.id)
    .sort((a, b) => Number(a.ms || 0) - Number(b.ms || 0));
  const byLocation = new Map();
  for (const row of relevant) {
    const key = `${row.lagerId || ""}|${row.placeringId || ""}`;
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key).push(row);
  }
  const intervals = [];
  for (const [locationKey, rows] of byLocation) {
    const counts = rows.filter(isCount);
    for (let index = 1; index < counts.length; index += 1) {
      const start = counts[index - 1];
      const end = counts[index];
      const startMs = Number(start.ms || 0); const endMs = Number(end.ms || 0);
      const inSelectedPeriod = startMs >= fromMs && endMs <= toMs;
      const overlapsSelectedPeriod = endMs >= fromMs && startMs <= toMs;
      if (!overlapsSelectedPeriod) continue;
      const between = rows.filter((row) => Number(row.ms || 0) > startMs
        && Number(row.ms || 0) <= endMs && row !== end);
      let receipts = 0; let transfers = 0; let returns = 0;
      let registeredUsage = 0; let otherCorrections = 0;
      for (const row of between) {
        const delta = movementDelta(row);
        if (row.art === "modtaget") receipts += delta;
        else if (["flytningInd", "flytningUd"].includes(row.art)) transfers += delta;
        else if (row.art === "retur") returns += Math.abs(delta);
        else if (row.art === "forbrug") registeredUsage += Math.abs(delta);
        else if (["korrektion", "svind"].includes(row.art)) otherCorrections += delta;
      }
      const startQuantity = finite(start.efter); const endQuantity = finite(end.efter);
      const quantity = startQuantity + receipts + transfers - returns + otherCorrections - endQuantity;
      const days = Math.max(1, (endMs - startMs) / 86400000);
      intervals.push({
        key: `${item.id}|${locationKey}|${startMs}|${endMs}`,
        itemId: item.id, locationKey, warehouseId: start.lagerId || end.lagerId || "",
        warehouse: start.lager || end.lager || "", locationId: start.placeringId || end.placeringId || "",
        location: start.placering || end.placering || "", unit: start.enhed || end.enhed || item.grundenhed || item.enhed,
        startMs, endMs, startQuantity, endQuantity, receipts, transfers, returns,
        registeredUsage, otherCorrections, quantity, unregisteredDifference: quantity - registeredUsage,
        days, monthlyQuantity: quantity / days * 30.4375,
        negative: quantity < 0, inSelectedPeriod, partialCoverage: !inSelectedPeriod,
        movements: between,
      });
    }
  }
  const measured = intervals.filter((row) => row.inSelectedPeriod);
  const quantity = measured.reduce((sum, row) => sum + row.quantity, 0);
  const days = measured.reduce((sum, row) => sum + row.days, 0);
  return {
    intervals,
    measured,
    hasBasis: measured.length > 0,
    partialCoverage: intervals.some((row) => row.partialCoverage),
    quantity: measured.length ? quantity : null,
    monthlyQuantity: measured.length && days > 0 ? quantity / days * 30.4375 : null,
    annualQuantity: measured.length && days >= 330 ? quantity / days * 365.25 : null,
    coveredDays: days,
    negative: measured.some((row) => row.negative),
  };
}

export function inventoryOverviewRows(items = [], movements = [], { departmentId = "" } = {}) {
  return items.filter((item) => item.lagerfoert === true).map((item) => {
    const allLocations = Object.values(item.lagerplaceringer || {});
    const locations = departmentId
      ? allLocations.filter((row) => row.afdelingId === departmentId)
      : allLocations;
    const unit = id(item.grundenhed || item.enhed);
    const unitsCompatible = locations.every((row) => id(row.enhed || unit) === unit);
    const known = locations.length > 0 && locations.every((row) => finite(row.beholdning) !== null);
    const quantity = known && unitsCompatible
      ? locations.reduce((sum, row) => sum + Number(row.beholdning), 0) : null;
    const countDates = locations.map((row) => finite(row.senestOptaltMs));
    const neverCounted = !locations.length || countDates.some((value) => value === null);
    const latestCountedAt = countDates.filter((value) => value !== null).sort((a, b) => b - a)[0] || null;
    const oldestCountedAt = countDates.filter((value) => value !== null).sort((a, b) => a - b)[0] || null;
    const minimum = finite(item.minimumBeholdning);
    let status = "Ikke optalt"; let tone = "warn";
    if (quantity !== null && minimum === null) { status = "Niveau ikke sat"; tone = "info"; }
    else if (quantity !== null && quantity < minimum) { status = "Under genbestillingsniveau"; tone = "bad"; }
    else if (quantity !== null && quantity === minimum) { status = "Ved genbestillingsniveau"; tone = "warn"; }
    else if (quantity !== null) { status = "Over niveau"; tone = "ok"; }
    const consumption = calculatedConsumptionIntervals(item, movements);
    return { item, locations, unit, quantity, minimum, status, tone, latestCountedAt,
      oldestCountedAt, neverCounted, unitsCompatible, consumption };
  });
}

export function materialConsumptionCsv(rows = [], { from = "", to = "" } = {}) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const columns = ["Fra dato", "Til dato", "Vare", "Varenummer", "Afdeling", "Grundlag", "Mængde", "Enhed", "Måleperiode", "Dækning"];
  return [columns, ...rows.map((row) => [from, to, row.name, row.sku, row.department,
    row.basis, row.quantity ?? "Mangler grundlag", row.unit, row.measurementPeriod || "",
    row.partialCoverage ? "Delvist dækket" : row.quantity === null ? "Mangler grundlag" : "Dækket"])]
    .map((values) => values.map(quote).join(";")).join("\r\n");
}
