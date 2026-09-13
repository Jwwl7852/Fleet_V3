import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decryptWebshopCredential, encryptWebshopCredential } from "../functions/procure-webshop-credentials.js";

const key = Buffer.alloc(32, 7).toString("base64");

test("webshoplegitimation krypteres med AES-256-GCM og forkert nøgle afvises", () => {
  const input = { username: "synthetic-user", password: "synthetic-password" };
  const encrypted = encryptWebshopCredential(input, key, Buffer.alloc(12, 3));
  assert.equal(encrypted.algoritme, "aes-256-gcm");
  assert.doesNotMatch(encrypted.ciphertext, /synthetic-user|synthetic-password/);
  assert.deepEqual(decryptWebshopCredential(encrypted, key), input);
  assert.throws(() => decryptWebshopCredential(encrypted, Buffer.alloc(32, 8).toString("base64")));
});

test("webshop-callables tager tenant fra auth og logger aldrig credentialfelter", () => {
  const source = readFileSync("functions/index.js", "utf8");
  for (const name of ["procureWebshopCredentialGem", "procureWebshopCredentialHent", "procureWebshopBestillingRegistrer"]) {
    const start = source.indexOf(`export const ${name}`);
    const next = source.indexOf("\nexport const ", start + 1);
    const block = source.slice(start, next < 0 ? undefined : next);
    assert.ok(start >= 0, `${name} mangler`);
    assert.match(block, /procureDoer\(req,/);
    assert.doesNotMatch(block, /tenantId\s*=\s*req\.data/);
  }
  assert.match(source, /procureHemmeligeOplysninger\/\$\{tenantId\}\/\$\{supplierId\}/);
  assert.match(source, /hemmelighed ikke logget/);
  const ui = readFileSync("src/fleet/procure-v2/SendOrderScreenV2.jsx", "utf8");
  assert.doesNotMatch(ui, /localStorage|sessionStorage/);
  assert.match(ui, /setTimeout\(clearCredential, 60_000\)/);
});

test("webshopregistrering beskytter mod metodehop, mailforsøg og gentagne kald", () => {
  const source = readFileSync("functions/index.js", "utf8");
  const start = source.indexOf("export const procureWebshopBestillingRegistrer");
  const next = source.indexOf("\nexport const ", start + 1);
  const block = source.slice(start, next);
  assert.match(block, /order\.mail && Object\.keys\(order\.mail\)\.length/);
  assert.match(block, /order\.bestillingsmetode && order\.bestillingsmetode !== "webshop"/);
  assert.match(block, /order\.webshop\?\.registreringer\?\.\[requestId\]/);
  assert.match(block, /godkendtRevision/);
  assert.match(block, /leverandoerBekraeftelseStatus = "afventer"/);
  assert.match(block, /kortnummer \|\| d\.cvv/);
});

test("lokal Firebase-preview forbinder også callables til Functions-emulatoren", () => {
  const source = readFileSync("src/firebase.js", "utf8");
  assert.match(source, /VITE_FB_DATABASE_EMULATOR_PORT/);
  assert.match(source, /VITE_FB_AUTH_EMULATOR_PORT/);
  assert.match(source, /VITE_FB_FUNCTIONS_EMULATOR_PORT/);
  assert.match(source, /_funktioner\.useEmulator\("127\.0\.0\.1",\s*funktionerEmulatorPort\)/);
});
