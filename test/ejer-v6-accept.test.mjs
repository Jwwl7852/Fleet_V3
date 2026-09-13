import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const laes = (sti) =>
  readFileSync(new URL(`../${sti}`, import.meta.url), "utf8");

test("V6 tilbud har tre sammenhængende arbejdsområder og eksplicit AI-indsættelse", () => {
  const kode = laes("src/moduler/udbyder/EjerTilbud.jsx");
  assert.match(kode, /Sammensæt løsning/);
  assert.match(kode, /Tilbudstekst/);
  assert.match(kode, /Dokument/);
  assert.match(kode, /AI-forslag · gennemgå før indsættelse/);
  assert.match(kode, /Indsæt i tilbud/);
  assert.match(kode, /Feltet er ændret efter forslaget blev lavet/);
  assert.match(kode, /basisTekst/);
  assert.match(kode, /Priser og totaler berøres aldrig/);
});

test("V6 mail har kompakt mobilfilter og én mobil postkassevælger", () => {
  const kode = laes("src/moduler/udbyder/EjerMailV2.jsx");
  assert.match(kode, /ejer-mail-mobilvalg/);
  assert.match(kode, /ejer-mail-mobilkontroller/);
  assert.match(kode, /visMobilFiltre/);
  assert.match(kode, /Testdata/);
});

test("V6 leverandørgemning viser før og efter og kræver den præcise bekræftelse", () => {
  const kode = laes("src/moduler/udbyder/EjerLeverandoerer.jsx");
  assert.match(kode, /aendringer\.map/);
  assert.match(kode, /Bekræft og gem/);
  assert.match(kode, /disabled=\{arbejder \|\| !aendringer\.length\}/);
  assert.match(kode, /onClick=\{\(\) => setBekraeftGem\(false\)\}/);
});

test("V6 foretager sidste sagstjek efter jobreservation og før Microsoft Graph", () => {
  const kode = laes("functions/index.js");
  const start = kode.indexOf("const job = reserve.snapshot.val()");
  const kontrol = kode.indexOf("vurderMailjobFoerTransport", start);
  const graph = kode.indexOf("hentGraphToken", start);
  assert.ok(start >= 0, "Mailjobbet skal reserveres først.");
  assert.ok(
    kontrol > start,
    "Den sidste kontrol skal ske efter reservationen.",
  );
  assert.ok(
    graph > kontrol,
    "Graph-token må først hentes efter den sidste kontrol.",
  );
  assert.match(kode.slice(start, graph), /friskTraad/);
  assert.match(kode.slice(start, graph), /friskTilbudStatus/);
});

test("V6 capture dokumenterer begge desktopstørrelser, hjulgrænser og kodecommit", () => {
  const kode = laes("scripts/capture-owner-review.mjs");
  assert.match(kode, /"1440x900"/);
  assert.match(kode, /"1920x1080"/);
  assert.match(kode, /maalinger:\s*scrollKontrol1440/);
  assert.match(kode, /maalinger:\s*scrollKontrol1920/);
  assert.match(kode, /udvidScrollFixture/);
  assert.match(kode, /Input\.dispatchMouseEvent/);
  assert.match(kode, /isolationOk/);
  assert.match(kode, /capture-manifest\.json/);
  assert.match(kode, /codeCommit: CODE_COMMIT/);
});
