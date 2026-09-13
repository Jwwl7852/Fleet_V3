/* Lokal integrationstest af delgodkendelse. Scriptet er låst til emulatorhosts
 * og bruger kun syntetiske brugere fra procure-auth-emulator-seed.mjs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PROJECT_ID, SYNTHETIC_PASSWORD, TENANT_A, TEST_USERS } from "./procure-auth-emulator-seed.mjs";

const authBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
const databaseBase = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000"}`;
const functionsBase = `http://${process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5002"}/${PROJECT_ID}/europe-west1`;

async function signIn(email) {
  const response = await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body.idToken;
}

async function readTenant(path, token) {
  const response = await fetch(`${databaseBase}/tenants/${TENANT_A}/${path}.json?ns=${encodeURIComponent(PROJECT_ID)}&auth=${encodeURIComponent(token)}`);
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

async function call(name, data, token) {
  const response = await fetch(`${functionsBase}/${name}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}

const approverToken = await signIn(TEST_USERS.approver.email);
const buyerToken = await signIn(TEST_USERS.buyer.email);
const cases = await readTenant("procureGodkendelsessager", approverToken);
const approval = Object.values(cases || {}).find((row) => row.status === "partially-approved" && Object.values(row.lines || {}).some((line) => line.itemId === "tape" && line.requestedQuantity === 10 && line.approvedQuantity === 6));
assert.ok(approval, "Kør først procure-auth-browser-qa.mjs, så den syntetiske sag med seks af ti godkendte taperuller findes.");
const tape = Object.values(approval.lines).find((line) => line.itemId === "tape");
const requestId = `qa-${randomUUID()}`;
const input = { approvalId: approval.id, expectedRevision: approval.revision, requestId, decisions: [{ lineId: tape.id, action: "approve", quantity: 2 }] };
const orderCountBefore = Object.values(await readTenant("indkoebsordrer", approverToken) || {}).filter((order) => order.godkendelsessagId === approval.id).length;

const denied = await call("procureGodkendelseslinjerAfgor", input, buyerToken);
assert.equal(denied.status, 403);
assert.equal(denied.body?.error?.status, "PERMISSION_DENIED");

const accepted = await call("procureGodkendelseslinjerAfgor", input, approverToken);
assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
assert.equal(accepted.body.result.ok, true);
assert.equal(accepted.body.result.orders.length, 1);

const updated = await readTenant(`procureGodkendelsessager/${approval.id}`, approverToken);
assert.equal(updated.lines[tape.id].approvedQuantity, 8);
assert.equal(updated.lines[tape.id].orderedApprovedQuantity, 8);
assert.equal(updated.lines[tape.id].pendingQuantity, 2);
const createdOrder = await readTenant(`indkoebsordrer/${accepted.body.result.orders[0].id}`, approverToken);
assert.equal(Object.values(createdOrder.linjer).reduce((sum, line) => sum + line.antal, 0), 2);
assert.equal(createdOrder.godkendelsesgrundlagOere, approval.approvalBasisOere, "deling må ikke sænke godkendelsesgrundlaget");

const repeated = await call("procureGodkendelseslinjerAfgor", input, approverToken);
assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
assert.equal(repeated.body.result.duplicate, true);
const orderCountAfterRetry = Object.values(await readTenant("indkoebsordrer", approverToken) || {}).filter((order) => order.godkendelsessagId === approval.id).length;
assert.equal(orderCountAfterRetry, orderCountBefore + 1);

console.log(JSON.stringify({
  ok: true,
  approvalId: approval.id,
  fullApprovalBasisOere: approval.approvalBasisOere,
  requestedQuantity: 10,
  approvedAndOrderedQuantity: 8,
  pendingQuantity: 2,
  unauthorizedBuyerDenied: true,
  retryWasDuplicate: true,
  supplierOrdersBefore: orderCountBefore,
  supplierOrdersAfterRetry: orderCountAfterRetry,
}, null, 2));
