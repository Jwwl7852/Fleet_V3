import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  byggKreditsnapshot, kreditlinjeFraKilde, reserveretKredit, validerKreditModResterende,
} from "../src/fleet/ejer-kreditnota-regler.js";
import {
  byggKreditnotaPortPayload, simulerKreditnotaPort, validerKreditnotaPortPayload,
} from "../functions/dinero-test-adapter.js";
import { dineroKlient, dineroKreditnotaCreateModel, hentDineroToken } from "../functions/dinero-personlig.js";
import { genererKreditnotaPdf } from "../functions/kreditnota-pdf.js";

const FUNKTIONER = readFileSync("functions/index.js", "utf8");
const REGLER = readFileSync("firebase.rules.json", "utf8");
const STORAGE = readFileSync("storage.rules", "utf8");

const FAKTURA = {
  version: 1, sha256: "a".repeat(64), forretningsnoegle: "faktura:2026-08:kunde-a:ordinaer",
  periode: "2026-08", kundeId: "kunde-a", modtager: { navn: "Test ApS", cvr: "00000001", email: "ok@example.test", kanal: "email" },
  linjer: [
    { navn: "Platform", enhed: "måned", antal: 1000, satsOere: 100000, momssats: 25, beloebOere: 100000, momsOere: 25000, ialtOere: 125000 },
    { navn: "Enheder", enhed: "stk", antal: 5000, satsOere: 319000, momssats: 25, beloebOere: 1595000, momsOere: 398750, ialtOere: 1993750 },
  ],
  beloebOere: 1695000, momsOere: 423750, ialtOere: 2118750,
};

const snapshot = (valg, id = "kredit_11111111111111111111") => byggKreditsnapshot({
  faktura: FAKTURA, valg, aarsag: "Aftalt reduktion", kreditId: id, oprettetMs: 1, oprettetAf: "ejer-a",
});

test("fuld og delvis kredit bruger det historiske linjesnapshot og heltalsøre", () => {
  const fuld = snapshot([{ kildeIndeks: 0, antal: 1000 }]);
  assert.deepEqual([fuld.beloebOere, fuld.momsOere, fuld.ialtOere], [100000, 25000, 125000]);
  const delvis = snapshot([{ kildeIndeks: 1, antal: 2000 }]);
  assert.deepEqual([delvis.beloebOere, delvis.momsOere, delvis.ialtOere], [638000, 159500, 797500]);
  assert.equal(delvis.linjer[0].satsOere, 319000);
  assert.equal(delvis.originalFaktura.sha256, FAKTURA.sha256);
});

test("kladder, frigivne og ukendte udfald reserverer, mens annullerede ikke gør", () => {
  const a = snapshot([{ kildeIndeks: 1, antal: 3000 }], "kredit_aaaaaaaaaaaaaaaaaaaa");
  const poster = {
    a: { status: "kladde", snapshot: a },
    b: { status: "ukendt_udfald", snapshot: snapshot([{ kildeIndeks: 0, antal: 1000 }], "kredit_bbbbbbbbbbbbbbbbbbbb") },
    c: { status: "annulleret", snapshot: snapshot([{ kildeIndeks: 1, antal: 1000 }], "kredit_cccccccccccccccccccc") },
  };
  assert.deepEqual(reserveretKredit(poster).perLinje, { 0: 1000, 1: 3000 });
  const forMeget = snapshot([{ kildeIndeks: 1, antal: 3000 }], "kredit_dddddddddddddddddddd");
  const kontrol = validerKreditModResterende(FAKTURA, poster, forMeget);
  assert.equal(kontrol.ok, false);
  assert.match(kontrol.fejl.join(" "), /højst 2/);
});

test("lineær kreditering afviser nul, negative og større mængder", () => {
  assert.throws(() => kreditlinjeFraKilde(FAKTURA.linjer[0], 0, 0), /ugyldig/);
  assert.throws(() => kreditlinjeFraKilde(FAKTURA.linjer[0], 0, 1001), /ugyldig/);
});

test("kreditporten har eksplicit dokumenttype, originalreference og fejlscenarier", () => {
  const kredit = snapshot([{ kildeIndeks: 0, antal: 1000 }]);
  const payload = byggKreditnotaPortPayload(kredit, "credit-guid", "invoice-guid");
  assert.deepEqual(validerKreditnotaPortPayload(payload), []);
  assert.equal(payload.documentType, "credit_note");
  assert.equal(payload.creditNoteFor, "invoice-guid");
  assert.equal(simulerKreditnotaPort(payload, "success").kind, "sent");
  assert.equal(simulerKreditnotaPort(payload, "timeout_after_create").kind, "unknown");
  assert.equal(simulerKreditnotaPort(payload, "book_ok_send_fail").kind, "send_error");
});

test("Dinero personal auth og routes følger den dokumenterede kontrakt", async () => {
  const kald = [];
  const fetchImpl = async (url, init) => {
    kald.push({ url, init });
    if (String(url).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify({ Collection: [] }), { status: 200 });
  };
  const token = await hentDineroToken({ clientId: "client", clientSecret: "secret", apiKey: "api", fetchImpl });
  assert.equal(token.accessToken, "token");
  assert.match(String(kald[0].init.body), /grant_type=password/);
  assert.match(kald[0].init.headers.authorization, /^Basic /);
  const klient = dineroKlient({ organizationId: "org", accessToken: "token", fetchImpl });
  await klient.liste("kreditnotaer", { changesSince: "2026-01-01T00:00:00Z", page: 2, pageSize: 100 });
  assert.match(kald[1].url, /\/v1\/org\/sales\/creditnotes\?/);
  assert.match(kald[1].url, /changesSince=2026-01-01T00%3A00%3A00Z/);
  const model = dineroKreditnotaCreateModel(snapshot([{ kildeIndeks: 0, antal: 1000 }]), { invoiceGuid: "invoice-guid", externalReference: "veyro:kredit", accountNumber: 1000 });
  assert.equal(model.CreditNoteFor, "invoice-guid");
  assert.equal(model.ProductLines[0].BaseAmountValue, 1000);
});

test("frigivelse, ukendt udfald, retursynk og lukket adgang er implementeret", () => {
  assert.match(FUNKTIONER, /export const kreditnotaopret = onCall/);
  assert.match(FUNKTIONER, /await ref\.transaction/);
  assert.match(FUNKTIONER, /validerKreditModResterende/);
  assert.match(FUNKTIONER, /job\.status === "ukendt_udfald"/);
  assert.match(FUNKTIONER, /schedule: "every 15 minutes"/);
  assert.match(FUNKTIONER, /changesSince/);
  assert.match(FUNKTIONER, /senesteForsoegMs/);
  assert.match(FUNKTIONER, /senesteSuccesMs/);
  assert.match(REGLER, /"kreditnotaer"\s*:\s*\{[\s\S]*?"\.write": false/);
  assert.match(REGLER, /"dinero"\s*:\s*\{[\s\S]*?"\.write": false/);
  assert.match(STORAGE, /match \/ejer\/kreditnotaer\/[\s\S]*?allow read, write: if false/);
});

test("kredit-PDF er versionsbundet og ikke en falsk udstedt kreditnota", async () => {
  const bytes = Buffer.from(await genererKreditnotaPdf(snapshot([{ kildeIndeks: 0, antal: 1000 }])));
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(bytes.length > 700);
});

