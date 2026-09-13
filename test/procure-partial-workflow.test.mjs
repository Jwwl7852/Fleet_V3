import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { budgetForPeriod, decideApprovalLines, splitDraftSelection } from "../src/fleet/procure-v2/procure-v2-domain.js";
import { decideServerApproval, sanitizeMobileDraft, splitServerDraft } from "../functions/delt/procure-v2/procure-backend-domain.js";

test("fem af ti linjer kan sendes videre, mens resten bevares", () => {
  const lines = Array.from({ length: 10 }, (_, index) => ({ id: `l${index + 1}`, name: `Vare ${index + 1}`, quantity: 1, unit: "stk.", unitPriceOere: 1000 }));
  const result = splitDraftSelection(lines, Object.fromEntries(lines.map((line, index) => [line.id, index < 5 ? 1 : 0])));
  assert.equal(result.ok, true);
  assert.equal(result.submitted.length, 5);
  assert.equal(result.remaining.length, 5);
  assert.deepEqual(result.remaining.map((line) => line.id), ["l6", "l7", "l8", "l9", "l10"]);
});

test("seks af ti kasser godkendes, fire venter og kun seks bliver ordregrundlag", () => {
  const approval = { approvalBasisOere: 144000, lines: [{ id: "tape", name: "Pakketape", quantity: 10, requestedQuantity: 10, unit: "kasser", unitPriceOere: 14400 }] };
  const result = decideApprovalLines(approval, { tape: { action: "approve", quantity: 6 } }, { actorId: "approver", now: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.lines[0].approvedQuantity, 6);
  assert.equal(result.lines[0].pendingQuantity, 4);
  assert.equal(result.approvedOrderLines[0].quantity, 6);
  assert.equal(result.approvalBasisOere, 144000, "grænsen følger hele grundlaget, ikke den godkendte del");
});

test("udskyd, rettelse og afvis kræver begrundelse og bestilles ikke", () => {
  const base = { lines: [{ id: "a", quantity: 2, unitPriceOere: 100 }, { id: "b", quantity: 2, unitPriceOere: 100 }, { id: "c", quantity: 2, unitPriceOere: 100 }] };
  assert.equal(decideApprovalLines(base, { a: { action: "defer" } }).ok, false);
  const result = decideApprovalLines(base, { a: { action: "defer", reason: "Næste måned" }, b: { action: "return", reason: "Ret kategori" }, c: { action: "reject", reason: "Ikke nødvendigt" } });
  assert.equal(result.ok, true);
  assert.equal(result.approvedOrderLines.length, 0);
  assert.deepEqual(result.lines.map((line) => line.approvalState), ["defer", "return", "reject"]);
});

test("en udskudt rest kræver en ny aktiv godkendelseshandling", () => {
  const first = decideServerApproval({ lines: { tape: { id: "tape", requestedQuantity: 10, approvedQuantity: 0, orderedApprovedQuantity: 0, rejectedQuantity: 0, unitPriceOere: 14400 } } }, [{ lineId: "tape", action: "approve", quantity: 6 }], { uid: "a", now: 1 });
  assert.equal(first.approvedOrderLines[0].quantity, 6);
  first.lines.tape.orderedApprovedQuantity = 6;
  assert.equal(decideServerApproval({ lines: first.lines }, [], { uid: "a", now: 2 }).ok, false);
  const second = decideServerApproval({ lines: first.lines }, [{ lineId: "tape", action: "approve", quantity: 4 }], { uid: "a", now: 3 });
  assert.equal(second.approvedOrderLines[0].quantity, 4);
});

test("serverkladde sanitiseres og delindsendelse bevarer restmængden", () => {
  const draft = sanitizeMobileDraft({ items: { tape: 10, bad: -2 }, custom: [{ id: "fri", name: "Specialvare", quantity: 2 }], departmentId: "lager", deliveryLocation: "Rampe 2" }, { uid: "buyer", now: 10, revision: 3 });
  assert.deepEqual(draft.items, { tape: 10 });
  const split = splitServerDraft(draft, [{ id: "tape", quantity: 6 }, { id: "fri", quantity: 1 }]);
  assert.equal(split.ok, true);
  assert.equal(split.draft.items.tape, 4);
  assert.equal(split.draft.custom.fri.quantity, 1);
});

test("hver mobil varelinje bevarer sin kundeskabte afdeling ved delindsendelse", () => {
  const draft = sanitizeMobileDraft({ items: { tape: 10, milk: 12 }, departmentId: "fallback",
    lineDepartments: { tape: "varemodtagelse", milk: "administration" } }, { uid: "buyer", now: 10, revision: 1 });
  const split = splitServerDraft(draft, [{ id: "tape", quantity: 6, departmentId: "varemodtagelse" }, { id: "milk", quantity: 12, departmentId: "administration" }]);
  assert.equal(split.ok, true);
  assert.deepEqual(split.submitted.map((row) => [row.id, row.departmentId]), [["tape", "varemodtagelse"], ["milk", "administration"]]);
  assert.equal(split.draft.items.tape, 4);
  assert.equal(split.draft.lineDepartments.tape, "varemodtagelse");
  assert.equal(split.draft.lineDepartments.milk, undefined);
});

test("callables håndhæver auth, tenant, revision, idempotens og godkenderpermission", () => {
  const source = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  for (const name of ["procureMobilKladdeHent", "procureMobilKladdeGem", "procureMobilKladdeDelIndsend", "procureGodkendelseslinjerAfgor"]) assert.match(source, new RegExp(`export const ${name}`));
  assert.match(source, /expectedRevision/);
  assert.match(source, /decisionRequests/);
  assert.match(source, /perm: "indkoeb\.godkend"/);
  assert.match(source, /approvalBasisOere: fullBasisOere/);
});

test("QR-aflæsning åbner varen, men kun Tilføj-handlingen ændrer kurven", () => {
  const source = fs.readFileSync(new URL("../src/fleet/procure-v2/MobileOrderScreen.jsx", import.meta.url), "utf8");
  const scanLoad = source.indexOf("setScanned({");
  const add = source.indexOf("const addScanned");
  const quantityWrite = source.indexOf("setQuantity(scanned.item.id", add);
  assert.ok(scanLoad >= 0 && add > scanLoad && quantityWrite > add);
  assert.match(source, /Tilføj og scan næste/);
  assert.match(source, /Scanning åbner kun varen/);
});

test("budgetter er adskilt pr. periode og afdeling", () => {
  const setup = { budgetter: { "2026-09": {
    lager: { departmentId: "lager", amountOere: 1500000 },
    drift: { departmentId: "drift", amountOere: 2500000 },
  } } };
  assert.equal(budgetForPeriod(setup, "2026-09", "lager"), 1500000);
  assert.equal(budgetForPeriod(setup, "2026-09"), 4000000);
  assert.equal(budgetForPeriod(setup, "2026-10"), null);
  assert.equal(budgetForPeriod(setup, "september"), null);
});
