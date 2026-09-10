import test from "node:test";
import assert from "node:assert/strict";
import {
  splitOrdersBySupplier, approvalRequirement, canSendOrder, buildReceipt,
  remainingQuantity, matchInvoice, spendForPeriod, quantitiesByItem,
  comparableUnitPrice,
} from "../src/fleet/procure-v2/procure-v2-domain.js";

const order = {
  id: "o1", tenantId: "t1", departmentId: "lager", revision: 3, approvedRevision: 3,
  approvalStatus: "approved", sendStatus: "draft",
  lines: [
    { id: "l1", itemId: "tape", name: "Tape", quantity: 10, unit: "ruller", unitPriceOere: 2400 },
    { id: "l2", itemId: "film", name: "Film", quantity: 5, unit: "ruller", unitPriceOere: 7500 },
  ],
};

test("separate leverandører får separate PO-numre og behovsspor", () => {
  const result = splitOrdersBySupplier([
    { needId: "n1", supplierId: "s1", name: "A", category: "emballage" },
    { needId: "n2", supplierId: "s2", name: "B", category: "drift" },
    { needId: "n3", supplierId: "s1", name: "C" },
  ], { year: 2026, start: 142 });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.poNumber), ["PO-2026-0142", "PO-2026-0143"]);
  assert.deepEqual(result[0].lines[0].sourceNeedIds, ["n1"]);
  assert.equal(result[0].lines[0].categorySnapshot, "emballage");
  assert.equal(result[0].lines[1].categorySnapshot, "Ukategoriseret");
});

test("godkendelsesregel vælges efter afdeling og beløbsgrænse", () => {
  const rule = approvalRequirement(order, [
    { id: "low", active: true, thresholdOere: 50000 },
    { id: "lager", active: true, departmentId: "lager", thresholdOere: 40000 },
    { id: "other", active: true, departmentId: "drift", thresholdOere: 10000 },
  ]);
  assert.equal(rule.id, "low");
});

test("ændret revision kan ikke sendes efter ældre godkendelse", () => {
  assert.equal(canSendOrder(order).ok, true);
  assert.match(canSendOrder({ ...order, revision: 4 }).reason, /ændret siden godkendelsen/);
  assert.match(canSendOrder({ ...order, sendStatus: "unknown" }).reason, /ukendt resultat/);
});

test("dellevering tæller kun godkendt mængde og sporer skader", () => {
  const result = buildReceipt(order, [], {
    receivedDate: "2026-09-15", receivedBy: "u1",
    lines: { l1: { deliveredQuantity: 8, damagedQuantity: 2 }, l2: { deliveredQuantity: 5 } },
  }, { actorId: "u1", now: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.lines[0].acceptedQuantity, 6);
  assert.equal(result.receipt.lines[0].damagedQuantity, 2);
  assert.equal(remainingQuantity(order, [result.receipt], "l1"), 4);
});

test("modtagelse over restantal afvises", () => {
  const prior = { orderId: "o1", lines: [{ orderLineId: "l1", acceptedQuantity: 9 }] };
  const result = buildReceipt(order, [prior], {
    receivedDate: "2026-09-15", receivedBy: "u1", lines: { l1: { deliveredQuantity: 2 } },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.l1, /højst godkendes 1/);
});

test("fakturamatch ser tidligere delfakturaer, prisafvigelse og dublet", () => {
  const receipt = { orderId: "o1", lines: [{ orderLineId: "l1", acceptedQuantity: 8 }] };
  const invoice = { id: "i2", invoiceNumber: "ND-2", supplierId: "s1", lines: [{ orderLineId: "l1", quantity: 5, unitPriceOere: 2600 }] };
  const previous = [
    { id: "i1", invoiceNumber: "ND-1", supplierId: "s1", lines: [{ orderLineId: "l1", quantity: 4, unitPriceOere: 2400 }] },
    { id: "i3", invoiceNumber: "ND-2", supplierId: "s1", lines: [] },
  ];
  const result = matchInvoice({ order, receipts: [receipt], invoice, previousInvoices: previous });
  assert.equal(result.duplicate, true);
  assert.equal(result.lines[0].quantityTooHigh, true);
  assert.equal(result.lines[0].priceDifferenceOere, 200);
});

test("forbrug bruger kun godkendte fakturaer og fratrækker kreditnotaer", () => {
  const invoices = [
    { approvalStatus: "approved", approvedAt: 20, departmentId: "lager", supplierId: "s1", type: "invoice", lines: [{ itemId: "tape", categorySnapshot: "emballage", quantity: 10, unitPriceOere: 100 }] },
    { approvalStatus: "approved", approvedAt: 30, departmentId: "lager", supplierId: "s1", type: "credit-note", lines: [{ itemId: "tape", categorySnapshot: "emballage", quantity: 2, unitPriceOere: 100 }] },
    { approvalStatus: "pending", approvedAt: 40, departmentId: "lager", supplierId: "s1", type: "invoice", lines: [{ quantity: 99, unitPriceOere: 100 }] },
  ];
  assert.equal(spendForPeriod(invoices, { from: 10, to: 50, categoryId: "emballage" }), 800);
});

test("mængder blandes ikke på tværs af enheder", () => {
  const orders = [{ ...order, lines: [
    { id: "a", itemId: "oil", name: "Olie", unit: "liter", quantity: 10 },
    { id: "b", itemId: "oil", name: "Olie", unit: "dunke", quantity: 2 },
  ] }];
  assert.equal(quantitiesByItem(orders, []).length, 2);
});

test("prisnormalisering afviser manglende grundlag og fremmed valuta", () => {
  assert.equal(comparableUnitPrice({ packagePriceOere: 1000 }).comparable, false);
  assert.equal(comparableUnitPrice({ packagePriceOere: 1000, packageQuantity: 10, baseUnit: "stk", currency: "EUR" }).comparable, false);
  assert.equal(comparableUnitPrice({ packagePriceOere: 1000, packageQuantity: 10, baseUnit: "stk", currency: "DKK" }).unitPriceOere, 100);
});
