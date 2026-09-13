import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BILAG_MAX_BYTES, beregnBogfoerteOmkostninger, bilagDedupeSignaler,
  filsignaturMatcher, normaliserBilagsmetadata, validerBilagsfil,
} from "../src/fleet/ejer-bilag-regler.js";
import {
  bilagMailForbindelsesstatus, koerIsoleretOcrTest, normaliserOcrForslag,
} from "../functions/bilag-adaptere.js";

const FUNKTIONER = readFileSync("functions/index.js", "utf8");
const REGLER = readFileSync("firebase.rules.json", "utf8");
const STORAGE = readFileSync("storage.rules", "utf8");

test("bilagsfiler valideres på størrelse, type og faktisk signatur", () => {
  assert.deepEqual(validerBilagsfil({ filnavn: "bilag.pdf", contentType: "application/pdf", stoerrelse: 42 }), []);
  assert.match(validerBilagsfil({ filnavn: "x.html", contentType: "text/html", stoerrelse: 42 }).join(" "), /PDF/);
  assert.match(validerBilagsfil({ filnavn: "stor.pdf", contentType: "application/pdf", stoerrelse: BILAG_MAX_BYTES + 1 }).join(" "), /20 MB/);
  assert.equal(filsignaturMatcher(Buffer.from("%PDF-1.7\nfixture"), "application/pdf"), true);
  assert.equal(filsignaturMatcher(Buffer.from("<html>"), "application/pdf"), false);
  assert.equal(filsignaturMatcher(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true);
  assert.equal(filsignaturMatcher(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"), true);
});

test("fast metadata-model bruger heltalsøre og afviser usammenhængende total", () => {
  const gyldig = normaliserBilagsmetadata({
    leverandoer: "Leverandør A", dokumentnummer: "F-42", dato: "2026-09-10", valuta: "dkk",
    beloebEksklMomsOere: 10000, momsOere: 2500, totalOere: 12500, kategori: "Software",
  });
  assert.equal(gyldig.ok, true);
  assert.equal(gyldig.post.valuta, "DKK");
  assert.equal(normaliserBilagsmetadata({ beloebEksklMomsOere: 100, momsOere: 25, totalOere: 124 }).ok, false);
  assert.equal(normaliserBilagsmetadata({ totalOere: 12.5 }).ok, false);
});

test("eksakte og sandsynlige dubletter markeres uden automatisk sletning", () => {
  const a = { fil: { sha256: "a".repeat(64) }, metadata: { aktuel: { leverandoer: "A ApS", dokumentnummer: "1", dato: "2026-09-01", valuta: "DKK", totalOere: 12500 } } };
  assert.equal(bilagDedupeSignaler(a, { fil: { sha256: "a".repeat(64) } }).art, "eksakt_fil");
  const mulig = bilagDedupeSignaler(a, { metadata: { aktuel: { leverandoer: "A ApS", dokumentnummer: "1", dato: "2026-09-01", valuta: "DKK", totalOere: 12500 } } });
  assert.equal(mulig.art, "mulig");
  assert.ok(mulig.score < 100);
});

test("omkostninger tæller kun eksplicit resultatmappede Dinero-poster og krediteringer", () => {
  const resultat = beregnBogfoerteOmkostninger({
    a: { id: "a", kontonummer: "4000", beloebOere: 10000 },
    b: { id: "b", kontonummer: "4000", beloebOere: -2500 },
    c: { id: "c", kontonummer: "5500", beloebOere: 7000 },
  }, { "4000": { resultatkonto: true, kategori: "Drift", koefficient: 1 } });
  assert.equal(resultat.ialtOere, 7500);
  assert.equal(resultat.raekker.length, 2);
  assert.deepEqual(resultat.umappede.map((p) => p.id), ["c"]);
});

test("mail og OCR er udskiftelige og ikke tilsluttet som standard", () => {
  assert.deepEqual(bilagMailForbindelsesstatus({}), { invoiceMail: "ikke_tilsluttet", inboundMail: "ikke_tilsluttet" });
  const forslag = normaliserOcrForslag({ leverandoer: "A", sikkerhed: { leverandoer: 104, totalOere: -2 } });
  assert.equal(forslag.sikkerhed.leverandoer, 100);
  assert.equal(forslag.sikkerhed.totalOere, 0);
  assert.equal(koerIsoleretOcrTest(null).kind, "contract_error");
  assert.equal(koerIsoleretOcrTest({ leverandoer: "Fixture" }).kind, "forslag");
});

test("serverflowet adskiller upload, gennemgang, godkendelse, klargøring og bogført match", () => {
  for (const navn of ["ejerbilaguploadinitier", "ejerbilaguploadbekraeft", "ejerbilaghent", "ejerbilagmetadatagem", "ejerbilagstatus", "ejerbilagocrkoer", "ejerbilagklargoerdinero", "ejerbilagmatchdinero", "dinerokontomappinggem"]) {
    assert.match(FUNKTIONER, new RegExp(`export const ${navn} = onCall`));
  }
  assert.match(FUNKTIONER, /status: "klargoering_dinero"/);
  assert.match(FUNKTIONER, /overfoerselsStatus: "ikke_tilsluttet"/);
  assert.match(FUNKTIONER, /dineroKlargoering: \{ snapshot, snapshotSha256/);
  assert.match(FUNKTIONER, /bilagRef\.transaction/);
});

test("ejerens database- og storageområder er læsbare kun via den afgrænsede adgangsmodel", () => {
  assert.match(REGLER, /"bilagsindbakke"\s*:\s*\{[\s\S]*?"poster"[\s\S]*?auth\.token\.udbyder === true/);
  assert.match(REGLER, /"bilagsindbakke"[\s\S]*?"dedupe"\s*:\s*\{ "\.read": false/);
  assert.match(REGLER, /"bilagjobs"\s*:\s*\{[\s\S]*?"\.write": false/);
  assert.match(STORAGE, /match \/ejer\/bilag\/[\s\S]*?allow read, write: if false/);
});
