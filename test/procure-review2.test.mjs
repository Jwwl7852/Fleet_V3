import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mobile = readFileSync("src/fleet/procure-v2/MobileOrderScreen.jsx", "utf8");
const receiving = readFileSync("src/fleet/procure-v2/MobileReceiptScreen.jsx", "utf8");
const approvals = readFileSync("src/fleet/procure-v2/ProcureScreens.jsx", "utf8");
const setup = readFileSync("src/fleet/procure-v2/ProcureSetupScreen.jsx", "utf8");
const styles = readFileSync("src/fleet/procure-v2/procure-v2.css", "utf8");
const backend = readFileSync("functions/index.js", "utf8");

test("demo-kvitteringen opsummerer den konkrete indsendelse, ikke første leverandørordre", () => {
  assert.match(mobile, /const receiptKey = `veyro:procure:mobile-receipt/);
  assert.match(mobile, /submittedLineCount: submitLines\.length/);
  assert.match(mobile, /remainingLineCount: selected\.filter/);
  assert.match(mobile, /supplierOrders: references\.map/);
  assert.match(mobile, /Godkendt – klar til bestilling/);
  assert.match(mobile, /afsendelse kræver en særskilt aktiv handling/);
});

test("prisafvigelseskredit og returkredit har hver sin backendgrænse", () => {
  const importStart = backend.indexOf("export const procureFakturaImport");
  const importEnd = backend.indexOf("\nexport const ", importStart + 1);
  const block = backend.slice(importStart, importEnd);
  assert.match(block, /d\.returnId/);
  assert.match(block, /returnCredits[\s\S]*returned\.vaerdiOere/);
  assert.match(block, /priceCredits[\s\S]*oprindelig\.prisafvigelseOere/);
  assert.match(block, /samme ordre og leverandør/);
});

test("webshopnøglen kan kun falde tilbage til lokal emulator-konfiguration", () => {
  assert.match(backend, /process\.env\.FUNCTIONS_EMULATOR === "true"[\s\S]*runtimeFirebaseConfig\.projectId[\s\S]*process\.env\.PROCURE_WEBSHOP_KEY_LOCAL/);
});

test("mobilmodtagelse kan genåbne serverbilag med ny adgangskontrol", () => {
  assert.match(receiving, /getReceiptAttachment/);
  assert.match(receiving, /Tidligere modtagelser/);
  assert.match(receiving, /tenantkontrolleret link/);
  assert.match(receiving, /setRegisteredStatus\(result\.receipt\?\.ordreStatus \|\| order\.status\)/);
  assert.match(receiving, /Lagerstatus:/);
  assert.match(receiving, /Økonomisk opfølgning:/);
});

test("hjælpetekster og nye kontroller bruger produktord og fælles geometri", () => {
  assert.match(approvals, /udskydelse, rettelse eller afvisning/);
  assert.doesNotMatch(setup, /historiske snapshots/);
  assert.match(setup, /tidligere bestillinger/);
  assert.match(styles, /\.procure-line-decision :is\(select,input,textarea\)[^{]*\{[^}]*border:1px solid var\(--veyro-border\)[^}]*border-radius:8px/);
  assert.match(styles, /\.procure-setup-add input,[^{]*\.procure-setup-list input\{[^}]*border:1px solid var\(--veyro-border\)[^}]*border-radius:8px/);
});
