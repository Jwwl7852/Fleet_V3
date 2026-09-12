import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyInventoryMovement, applyInventoryTransfer, inventoryCsv,
  inventoryLocation, inventoryPeriodSummary, inventoryTotal, stockQuantityForOrderLine,
} from "../src/fleet/procure-v2/procure-inventory-domain.js";
import { DEMO_CATALOG } from "../src/fleet/procure-v2/procure-v2-demo.js";

const context = (now) => ({ uid: "lager-user", actorName: "Lager Medarbejder", now });
const item = (overrides = {}) => ({
  id: "tape", navn: "Tape, brun", varenummer: "EMB-1001", lagerfoert: true,
  enhed: "ruller", grundenhed: "ruller", bestillingsenhed: "kasser",
  antalPrBestillingsenhed: 12, lagerplaceringer: {}, ...overrides,
});
const movement = (source, input, now) => {
  const result = applyInventoryMovement(source, input, context(now));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result;
};

test("ukendt beholdning er ikke nul, og kun lagerførte varer kan få startbeholdning", () => {
  assert.equal(inventoryTotal(item()), null);
  const rejected = applyInventoryMovement(item({ lagerfoert: false }), {
    type: "startbeholdning", quantity: 0, unit: "ruller", requestId: "start-1",
    warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01", expectedRevision: 0,
  }, context(1));
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.item, /ikke markeret som lagerført/);
});

test("demoens lagerplaceringer bruger den kanoniske nøgle og kan modtages uden falsk konflikt", () => {
  const tape = DEMO_CATALOG.find((row) => row.id === "tape");
  const domain = item({ lagerplaceringer: Object.fromEntries(Object.entries(tape.inventoryLocations).map(([key, row]) => [key, {
    lagerId: row.warehouseId, lager: row.warehouse, placeringId: row.locationId, placering: row.location,
    beholdning: row.quantity, enhed: row.unit, revision: row.revision,
  }])) });
  const current = inventoryLocation(domain, "hovedlager", "a-01");
  assert.equal(current?.beholdning, 20);
  const result = applyInventoryMovement(domain, { type: "modtaget", quantity: 2, unit: "ruller", requestId: "demo-receipt",
    warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01", expectedRevision: current.revision }, context(50));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("modtagelse og optællingsdifference gemmes som to sporbare bevægelser", () => {
  const start = movement(item(), { type: "startbeholdning", quantity: 12, unit: "ruller", requestId: "start-1",
    warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01", expectedRevision: 0 }, 10);
  const receipt = movement(start.item, { type: "modtaget", quantity: 10, unit: "ruller", requestId: "receipt-1",
    warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01", expectedRevision: 1,
    orderId: "order-42", receiptId: "receipt-42", orderLineId: "line-1" }, 20);
  assert.deepEqual([receipt.movement.foer, receipt.movement.delta, receipt.movement.efter], [12, 10, 22]);
  assert.equal(receipt.movement.modtagelseId, "receipt-42");
  const count = movement(receipt.item, { type: "optaelling", quantity: 20, unit: "ruller", requestId: "count-1",
    warehouseId: "hovedlager", warehouse: "Hovedlager", locationId: "a-01", location: "A-01", expectedRevision: 2,
    reason: "Afvigelse ved optælling" }, 30);
  assert.deepEqual([count.movement.foer, count.movement.delta, count.movement.efter], [22, -2, 20]);
  assert.equal(count.location.senestOptaltMs, 30);
  assert.equal(count.movement.medarbejderNavn, "Lager Medarbejder");
});

test("optælling uden difference gemmes, men modtagelse alene ændrer ikke seneste optællingsdato", () => {
  const start = movement(item(), { type: "startbeholdning", quantity: 4, unit: "ruller", requestId: "s",
    warehouseId: "h", warehouse: "Hovedlager", locationId: "a", location: "A", expectedRevision: 0 }, 10);
  const receipt = movement(start.item, { type: "modtaget", quantity: 2, unit: "ruller", requestId: "r",
    warehouseId: "h", warehouse: "Hovedlager", locationId: "a", location: "A", expectedRevision: 1 }, 20);
  assert.equal(receipt.location.senestOptaltMs, 10);
  const count = movement(receipt.item, { type: "optaelling", quantity: 6, unit: "ruller", requestId: "c",
    warehouseId: "h", warehouse: "Hovedlager", locationId: "a", location: "A", expectedRevision: 2 }, 30);
  assert.equal(count.movement.delta, 0);
  assert.equal(count.location.senestOptaltMs, 30);
});

test("revision beskytter samtidige optællinger mod stiltiende overskrivning", () => {
  const start = movement(item(), { type: "startbeholdning", quantity: 8, unit: "ruller", requestId: "s",
    warehouseId: "h", warehouse: "H", locationId: "a", location: "A", expectedRevision: 0 }, 10);
  const stale = applyInventoryMovement(start.item, { type: "optaelling", quantity: 7, unit: "ruller", requestId: "stale",
    warehouseId: "h", warehouse: "H", locationId: "a", location: "A", expectedRevision: 0, reason: "Kontrol" }, context(20));
  assert.equal(stale.ok, false);
  assert.match(stale.errors.revision, /ændret af en anden/);
});

test("flytning skriver et ud- og indben uden at ændre virksomhedens total", () => {
  const first = movement(item(), { type: "startbeholdning", quantity: 20, unit: "ruller", requestId: "s1",
    warehouseId: "h", warehouse: "Hovedlager", locationId: "a", location: "A-01", expectedRevision: 0 }, 10);
  const second = movement(first.item, { type: "startbeholdning", quantity: 5, unit: "ruller", requestId: "s2",
    warehouseId: "h", warehouse: "Hovedlager", locationId: "b", location: "B-01", expectedRevision: 0 }, 11);
  const before = inventoryTotal(second.item);
  const moved = applyInventoryTransfer(second.item, { type: "flytning", requestId: "move-1", quantity: 3, unit: "ruller",
    fromWarehouseId: "h", fromWarehouse: "Hovedlager", fromLocationId: "a", fromLocation: "A-01", expectedFromRevision: 1,
    toWarehouseId: "h", toWarehouse: "Hovedlager", toLocationId: "b", toLocation: "B-01", expectedToRevision: 1 }, context(20));
  assert.equal(moved.ok, true, JSON.stringify(moved.errors));
  assert.deepEqual(moved.movements.map((row) => [row.art, row.delta]), [["flytningUd", -3], ["flytningInd", 3]]);
  assert.equal(inventoryTotal(moved.item), before);
});

test("pakningsstørrelser omregnes eksplicit og inkompatible enheder afvises", () => {
  assert.deepEqual(stockQuantityForOrderLine(item(), { enhed: "kasser" }, 2), { ok: true, quantity: 24, unit: "ruller", factor: 12 });
  assert.deepEqual(stockQuantityForOrderLine(item(), { enhed: "ruller" }, 2), { ok: true, quantity: 2, unit: "ruller", factor: 1 });
  assert.equal(stockQuantityForOrderLine(item(), { enhed: "liter" }, 2).ok, false);
});

test("periodeafstemning beregnes af bevægelser og CSV bevarer ligningen", () => {
  const movements = [
    { forbrugsvareId: "tape", lagerId: "h", placeringId: "a", lager: "Hovedlager", placering: "A-01", art: "startbeholdning", foer: null, efter: 12, delta: 12, ms: 10, enhed: "ruller" },
    { forbrugsvareId: "tape", lagerId: "h", placeringId: "a", lager: "Hovedlager", placering: "A-01", art: "modtaget", foer: 12, efter: 22, delta: 10, ms: 20, enhed: "ruller" },
    { forbrugsvareId: "tape", lagerId: "h", placeringId: "a", lager: "Hovedlager", placering: "A-01", art: "forbrug", foer: 22, efter: 19, delta: -3, ms: 30, enhed: "ruller" },
    { forbrugsvareId: "tape", lagerId: "h", placeringId: "a", lager: "Hovedlager", placering: "A-01", art: "optaelling", foer: 19, efter: 18, delta: -1, ms: 40, enhed: "ruller" },
  ];
  const [summary] = inventoryPeriodSummary([item()], movements, { fromMs: 0, toMs: 100 });
  assert.deepEqual({ opening: summary.opening, starts: summary.starts, receipts: summary.receipts, consumption: summary.consumption,
    corrections: summary.corrections, closing: summary.closing, counts: summary.counts },
  { opening: 0, starts: 12, receipts: 10, consumption: 3, corrections: -1, closing: 18, counts: 1 });
  const csv = inventoryCsv([summary], { from: "2026-01-01", to: "2026-12-31" });
  assert.match(csv, /"Fra dato";"Til dato";"Vare";"Varenummer"/);
  assert.match(csv, /"Primo";"Startbeholdning i perioden";"Modtagelser";"Forbrug";"Retur";"Korrektioner";"Nettoflytning";"Ultimo"/);
  assert.match(csv, /"2026-01-01";"2026-12-31"/);
  assert.match(csv, /"Tape, brun"/);
});

test("lageroversigten samler placeringer og nettoudligner interne flytninger", () => {
  const rows = inventoryPeriodSummary([item()], [
    { forbrugsvareId: "tape", lagerId: "h", placeringId: "a", lager: "Hovedlager", placering: "A-01", art: "flytningUd", foer: 10, efter: 6, delta: -4, ms: 20, enhed: "ruller" },
    { forbrugsvareId: "tape", lagerId: "h", placeringId: "b", lager: "Hovedlager", placering: "B-01", art: "flytningInd", foer: 2, efter: 6, delta: 4, ms: 20, enhed: "ruller" },
  ], { fromMs: 0, toMs: 100, groupBy: "warehouse" });
  assert.equal(rows.length, 1);
  assert.deepEqual({ opening: rows[0].opening, transfers: rows[0].transfers, closing: rows[0].closing },
    { opening: 12, transfers: 0, closing: 12 });
});

test("servergrænser er tenantafledte, atomiske og idempotente", () => {
  const source = readFileSync("functions/index.js", "utf8");
  const blockOf = (name) => { const start = source.indexOf(`export const ${name}`); const end = source.indexOf("\nexport const ", start + 1); return source.slice(start, end < 0 ? undefined : end); };
  for (const name of ["procureLagerBevaegelse", "procureModtagelseRegistrer", "procureVareReturneringRegistrer"]) {
    const block = blockOf(name);
    assert.match(block, /procureDoer\(req,/);
    assert.match(block, /rod\.transaction/);
    assert.doesNotMatch(block, /tenantId\s*=\s*req\.data/);
  }
  const inventory = blockOf("procureLagerBevaegelse");
  assert.match(inventory, /requestId}-ud/);
  assert.match(inventory, /requestId}-ind/);
  assert.match(inventory, /already: true/);
  const receipt = blockOf("procureModtagelseRegistrer");
  assert.match(receipt, /inventoryEffects/);
  assert.match(receipt, /lagerfoert !== true/);
});
