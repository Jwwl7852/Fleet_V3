import test from "node:test";
import assert from "node:assert/strict";

import {
  documentedSpendForPeriod,
  formatUnitQuantity,
  orderUnitSummary,
  procurementStatus,
  recordsForProcurementTab,
  validateOrderUnit,
} from "../src/fleet/procure-v2/procure-v2-domain.js";

test("bestillingsenheder viser pakker og grundenheder uden skjult afrunding", () => {
  const tape = {
    orderUnit: "pakker", baseUnit: "ruller", unitsPerOrder: 6,
    orderPriceOere: 14400, minimumOrderQuantity: 1, orderStep: 1,
  };
  assert.deepEqual(orderUnitSummary(tape, 2), {
    orderQuantity: 2, orderUnit: "pakker", baseQuantity: 12,
    baseUnit: "ruller", unitsPerOrder: 6, totalOere: 28800,
    orderPriceOere: 14400, orderQuantityLabel: "2 pakker", baseQuantityLabel: "12 ruller",
    label: "2 pakker = 12 ruller",
  });
  assert.equal(orderUnitSummary(tape, 1).label, "1 pakke = 6 ruller");
  assert.equal(orderUnitSummary({ orderUnit: "dunke", baseUnit: "liter", unitsPerOrder: 5 }, 1).label, "1 dunk = 5 liter");
  assert.equal(formatUnitQuantity(1, "ruller"), "1 rulle");
  assert.equal(orderUnitSummary(tape, 3).totalOere, 43200);
  assert.equal(validateOrderUnit(tape, 2.5).ok, false);
  assert.match(validateOrderUnit(tape, 2.5).errors.join(" "), /trin på 1/);
});

test("enkeltstyksvare ændrer én grundenhed ad gangen", () => {
  const single = { orderUnit: "ruller", baseUnit: "ruller", unitsPerOrder: 1, orderPriceOere: 2400, orderStep: 1 };
  assert.equal(orderUnitSummary(single, 1).baseQuantity, 1);
  assert.equal(orderUnitSummary(single, 1).totalOere, 2400);
});

test("bestillingsfaner har samme statusmodel og afledt dellevering", () => {
  const orders = [
    { id: "a", status: "kladde", lines: [] },
    { id: "b", status: "afventerGodkendelse", lines: [] },
    { id: "c", status: "sendt", lines: [{ id: "l", quantity: 10 }] },
    { id: "d", status: "afsluttet", lines: [] },
  ];
  const receipts = [{ orderId: "c", lines: [{ orderLineId: "l", acceptedQuantity: 4 }] }];
  assert.equal(procurementStatus(orders[2], receipts).label, "Delvist modtaget");
  assert.deepEqual(recordsForProcurementTab(orders, "processing", receipts).map((item) => item.id), ["b"]);
  assert.deepEqual(recordsForProcurementTab(orders, "closed", receipts).map((item) => item.id), ["d"]);
});

test("dokumenteret firmakortforbrug dobbelttælles ikke mod samme fakturadokument", () => {
  const invoices = [{
    approvalStatus: "approved", approvedAt: 20, supplierId: "s1", documentRef: "doc-1",
    type: "invoice", lines: [{ quantity: 2, unitPriceOere: 1000 }],
  }];
  const cards = [
    { economyStatus: "documented", confirmationSource: "user", paymentAt: 20, supplierId: "s1", documentRef: "doc-1", amountOere: 2000 },
    { economyStatus: "documented", confirmationSource: "bank", paymentAt: 21, supplierId: "s1", documentRef: "doc-2", amountOere: 900 },
    { economyStatus: "documented", confirmationSource: "bank", paymentAt: 22, supplierId: "s1", documentRef: "refund-1", kind: "refund", amountOere: 100 },
  ];
  assert.deepEqual(documentedSpendForPeriod(invoices, cards), {
    invoiceSpendOere: 2000, cardSpendOere: 800, totalOere: 2800,
  });
});
