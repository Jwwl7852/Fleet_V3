import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mobile = readFileSync("src/fleet/procure-v2/MobileOrderScreen.jsx", "utf8");
const admin = readFileSync("src/fleet/procure-v2/QrLabelScreen.jsx", "utf8");
const backend = readFileSync("functions/index.js", "utf8");
const app = readFileSync("src/App.jsx", "utf8");
const rules = readFileSync("firebase.rules.json", "utf8");

describe("PROCURE QR-hyldebestilling", () => {
  it("QR-linket indeholder kun stabil mærkatreference og login bevarer retursti", () => {
    assert.match(admin, /\/indkoeb\/mobil\/scan\/\$\{encodeURIComponent\(id\)\}/);
    assert.doesNotMatch(admin, /[?&](vare|pris|tenant)=/);
    assert.match(app, /state=\{\{ fra: l\.pathname \+ l\.search \}\}/);
    assert.match(app, /l\.state\?\.fra \|\| "\/"/);
  });

  it("kamera har manuel fallback og scanning sender aldrig bestillingen", () => {
    assert.match(mobile, /BarcodeDetector/);
    assert.match(mobile, /Kameraadgang blev afvist/);
    assert.match(mobile, /Søg efter varen i stedet/);
    const scanner = mobile.slice(mobile.indexOf("function QrScanner"), mobile.indexOf("export default function MobileOrderScreen"));
    assert.doesNotMatch(scanner, /meldBehov|opretBestilling|skiftOrdre/);
    assert.match(mobile, /Tilføj og scan næste/);
    assert.match(mobile, /Allerede i kurven til/);
  });

  it("backend tager tenant og rettighed fra signerede claims", () => {
    for (const name of ["procureQrMaerkatOpret", "procureQrMaerkatStatus", "procureQrMaerkatListe", "procureQrMaerkatHent"]) {
      const start = backend.indexOf(`export const ${name}`);
      const next = backend.indexOf("\nexport const ", start + 1);
      const block = backend.slice(start, next < 0 ? undefined : next);
      assert.ok(start >= 0, `${name} mangler`);
      assert.match(block, /procureDoer\(req, \{ perm: "indkoeb\.(laes|skriv)", modul: "indkoeb" \}\)/);
      assert.doesNotMatch(block, /tenantId\s*=\s*req\.data/);
    }
  });

  it("databasen lukker direkte læsning og skrivning; callables håndhæver tenant", () => {
    const start = rules.indexOf('"procureQrMaerkater":');
    const end = rules.indexOf("// FORBRUGSVARER", start);
    const node = rules.slice(start, end);
    assert.ok(start >= 0);
    assert.match(node, /"\.read": false/);
    assert.match(node, /"\.write": false/);
    assert.match(backend.slice(backend.indexOf("export const procureQrMaerkatListe")), /procureDoer\(req, \{ perm: "indkoeb\.laes", modul: "indkoeb" \}\)/);
    assert.match(node, /"forbrugsvareId"[\s\S]*?forbrugsvarer/);
  });

  it("kan oprette flere placeringer og udskrive flere valgte mærkater", () => {
    assert.match(admin, /Same vare|samme vare/i);
    assert.match(admin, /selected\.has\(row\.id\)/);
    assert.match(admin, /window\.print\(\)/);
    assert.match(admin, /printable\.map/);
  });
});
