import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakturagrundlagCsv, genererFakturagrundlagPdf } from "../functions/fakturagrundlag-pdf.js";
import { byggFakturaPortPayload, simulerFakturaPort, validerFakturaPortPayload } from "../functions/dinero-test-adapter.js";

const FUNKTIONER = readFileSync("functions/index.js", "utf8");
const REGLER = readFileSync("firebase.rules.json", "utf8");
const STORAGE = readFileSync("storage.rules", "utf8");

const SNAPSHOT = {
  version: 1, forretningsnoegle: "faktura:2026-08:kunde-a:ordinaer",
  periode: "2026-08", kundeId: "kunde-a", modtager: { navn: "Test ApS", cvr: "00000001", kanal: "email", email: "faktura@demo.veyro.invalid" },
  linjer: [{ navn: "Platform", enhed: "måned", antal: 1000, satsOere: 10000, momssats: 25, beloebOere: 10000, momsOere: 2500, ialtOere: 12500 }],
  beloebOere: 10000, momsOere: 2500, ialtOere: 12500,
};

test("frigivelse bruger stabil forretningsnøgle, CAS og én outbox-post", () => {
  const start = FUNKTIONER.indexOf("export const fakturagrundlagfrigiv =");
  const slut = FUNKTIONER.indexOf("export const fakturagrundlagdokumenter =", start);
  const blok = FUNKTIONER.slice(start, slut);
  assert.match(blok, /fakturaForretningsnoegle\(periode, tenantId\)/);
  assert.match(blok, /await ref\.transaction/);
  assert.match(blok, /sikrFakturaJob/);
  assert.match(FUNKTIONER, /const fakturaJobId = \(periode, tenantId\) => `faktura_/);
});

test("ukendt adapterudfald spærrer blind retry og testadapteren er emulatorbegrænset", () => {
  const start = FUNKTIONER.indexOf("export const fakturajobkoer =");
  const blok = FUNKTIONER.slice(start);
  assert.match(blok, /job\.status === "ukendt_udfald"/);
  assert.match(blok, /Afstem i Dinero før et nyt forsøg/);
  assert.match(blok, /integration\.adapter !== "test" \|\| !erIsoleretFakturatest\(\)/);
  assert.match(blok, /TEST_TIMEOUT_EFTER_OPRET/);
  assert.match(blok, /TEST_SEND_FEJL/);
});

test("ejerfakturadata er klient-uskrivelige i database og storage", () => {
  assert.match(REGLER, /"fakturajobs"\s*:\s*\{[\s\S]*?"\.write": false/);
  assert.match(STORAGE, /match \/ejer\/fakturagrundlag\/\{periode\}\/\{tenantId\}\/\{dokumentId\}[\s\S]*?allow read, write: if false/);
});

test("PDF og CSV dannes fra samme versionsbundne snapshot", async () => {
  const pdf = Buffer.from(await genererFakturagrundlagPdf(SNAPSHOT));
  const csv = fakturagrundlagCsv(SNAPSHOT);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 700);
  assert.match(csv, /faktura:2026-08:kunde-a:ordinaer|Platform/);
  assert.match(csv, /"100"/);
});

test("testadapteren validerer kontrakten og kræver et eksplicit scenario", () => {
  const payload = byggFakturaPortPayload(SNAPSHOT, "test-draft-1");
  assert.deepEqual(validerFakturaPortPayload(payload), []);
  assert.equal(simulerFakturaPort(payload).kind, "contract_error");
  const svar = simulerFakturaPort(payload, "success");
  assert.equal(svar.kind, "sent");
  assert.equal(svar.invoice.externalReference, "test-draft-1");
  assert.equal(svar.invoice.subtotalCents, SNAPSHOT.beloebOere);
  assert.equal(svar.invoice.vatCents, SNAPSHOT.momsOere);
  assert.equal(svar.invoice.totalCents, SNAPSHOT.ialtOere);
  assert.match(simulerFakturaPort({ ...payload, currency: "EUR" }, "success").errors.join(" "), /DKK/);
});
