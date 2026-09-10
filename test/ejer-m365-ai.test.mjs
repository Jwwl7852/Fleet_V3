import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aiBudgetKanReserveres, godkendelseErAktuel, mailIndholdHash,
  normaliserBesked, sha256, vurderForfaldenOpfoelgning,
} from "../functions/salgsplatform.js";
import { byggOpenAiAnmodning, kaldOpenAi, SALGS_AI_INSTRUKTION } from "../functions/openai-salgsassistent.js";
import { opretOgSendKladde } from "../functions/microsoft-graph.js";

const FUNKTIONER = readFileSync("functions/index.js", "utf8");
const GRAPH = readFileSync("functions/microsoft-graph.js", "utf8");
const REGLER = readFileSync("firebase.rules.json", "utf8");

test("webformular og afledt mail med samme korrelation bliver samme dublet", () => {
  const basis = { fra: " Kunde@Example.com ", til: "info@veyrosystems.com", emne: "Kontakt", tekst: "Vi vil gerne høre mere", sendtMs: 123, eksternKorrelationId: "form-42" };
  const form = normaliserBesked({ ...basis, provider: "webform" });
  const mail = normaliserBesked({ ...basis, provider: "microsoft365", providerId: "graph-99" });
  assert.equal(form.dedupeNoegle, mail.dedupeNoegle);
  assert.equal(form.fra, "kunde@example.com");
});

test("provider-id giver stabil dublet og en ukendt afsender opretter ingen tenantkobling", () => {
  const a = normaliserBesked({ provider: "microsoft365", providerId: "immutable-id", fra: "ny@kunde.dk", til: "info@veyrosystems.com", emne: "Hej", tekst: "Behov", sendtMs: 1 });
  const b = normaliserBesked({ provider: "microsoft365", providerId: "immutable-id", fra: "ny@kunde.dk", til: "info@veyrosystems.com", emne: "Ændret emne", tekst: "Ændret", sendtMs: 2 });
  assert.equal(a.dedupeNoegle, b.dedupeNoegle);
  assert.equal("tenantId" in a, false);
});

test("godkendt opfølgning ugyldiggøres af ny aktivitet eller ændret tekst", () => {
  const indhold = { til: "kunde@example.com", emne: "Opfølgning", tekst: "Hej", signatur: "Veyro" };
  const hash = mailIndholdHash(indhold);
  const opf = { status: "godkendt", indholdHash: hash, godkendtIndholdHash: hash, basisAktivitetMs: 100 };
  assert.equal(godkendelseErAktuel(opf, { status: "afventer_os", senesteAktivitetMs: 100 }), true);
  assert.equal(godkendelseErAktuel(opf, { status: "afventer_os", senesteAktivitetMs: 101 }), false);
  assert.equal(godkendelseErAktuel({ ...opf, indholdHash: sha256("ændret") }, { status: "afventer_os", senesteAktivitetMs: 100 }), false);
  assert.equal(godkendelseErAktuel(opf, { status: "afsluttet", senesteAktivitetMs: 100 }), false);
});

test("planlagt opfølgning bliver først godkendelsesopgave ved forfald og pauses ved ændringer", () => {
  const opf = { status: "planlagt", forfalderMs: 1_000, basisAktivitetMs: 10 };
  const traad = { status: "afventer_kunden", senesteAktivitetMs: 10 };
  assert.equal(vurderForfaldenOpfoelgning(opf, traad, 999), "uændret");
  assert.equal(vurderForfaldenOpfoelgning(opf, traad, 1_000), "klar_til_godkendelse");
  assert.equal(vurderForfaldenOpfoelgning(opf, { ...traad, senesteAktivitetMs: 11 }, 1_000), "pauset_ny_aktivitet");
  assert.equal(vurderForfaldenOpfoelgning(opf, { ...traad, status: "afsluttet" }, 1_000), "pauset_sag_afsluttet");
});

test("AI-budget medregner atomisk reservation og stopper ved grænsen", () => {
  const graense = { requests: 2, inputTokens: 1_000, outputTokens: 500 };
  assert.equal(aiBudgetKanReserveres({ requests: 0 }, graense, 400, 200), true);
  assert.equal(aiBudgetKanReserveres({ requests: 1, inputTokens: 300, reserveretInputTokens: 400, outputTokens: 100, reserveretOutputTokens: 200 }, graense, 301, 201), false);
  assert.equal(aiBudgetKanReserveres({ requests: 2 }, graense, 1, 1), false);
});

test("OpenAI-request er serverstyret, sagsspecifik, struktureret og ikke lagret", () => {
  const request = byggOpenAiAnmodning({ model: "godkendt-model", instruktion: SALGS_AI_INSTRUKTION, kontekst: '{"sag":{"id":"a"}}' });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.match(request.instructions, /ubetroet datagrundlag/);
  assert.doesNotMatch(request.instructions, /API[_ -]?key/i);
  assert.match(FUNKTIONER, /internAiSamtale/);
  assert.match(FUNKTIONER, /salgsanalysesvarudkastgem/);
});

test("Graph-porten bruger delta, immutable id, kladde plus send og skelner 202", () => {
  assert.match(GRAPH, /messages\/delta/);
  assert.match(GRAPH, /IdType="ImmutableId"/);
  assert.match(GRAPH, /\/messages`, \{ token, method: "POST"/);
  assert.match(GRAPH, /\/send`, \{ token, method: "POST"/);
  assert.match(GRAPH, /svar\.status === 202/);
  assert.match(FUNKTIONER, /status: "accepteret_af_graph"/);
  assert.match(FUNKTIONER, /"dokumenteret_sendt"/);
  assert.match(FUNKTIONER, /salgsopfoelgningforfald/);
  assert.match(FUNKTIONER, /\["accepteret", "afvist"\]\.includes\(tilbudStatus\)/);
  assert.match(FUNKTIONER, /salgsanalyseautomatisk/);
  assert.match(FUNKTIONER, /basisBeskedId/);
});

test("mail-, AI- og hemmelighedsrødder er klient-uskrivelige og delta er ulæseligt", () => {
  assert.match(REGLER, /"salgsindbakke"[\s\S]*?"traade"[\s\S]*?"\.write": false/);
  assert.match(REGLER, /"mailjobs"[\s\S]*?"\.write": false/);
  assert.match(REGLER, /"vidensbase"[\s\S]*?"\.write": false/);
  assert.match(REGLER, /"integrationshemmeligheder"\s*:\s*\{\s*"\.read": false/);
  assert.match(FUNKTIONER, /defineSecret\("M365_CLIENT_SECRET"\)/);
  assert.match(FUNKTIONER, /defineSecret\("OPENAI_API_KEY"\)/);
});

test("OpenAI-fejl forbliver en AI-fejl uden at skabe et falsk resultat", async () => {
  const oprindelig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => "syntetisk utilgængelig" });
  try {
    await assert.rejects(() => kaldOpenAi({ apiKey: "syntetisk", request: byggOpenAiAnmodning({ model: "fixture", instruktion: SALGS_AI_INSTRUKTION, kontekst: "{}" }) }), /503/);
  } finally { globalThis.fetch = oprindelig; }
});

test("ukendt Graph-udfald efter kladde bærer provider-id og må afstemmes", async () => {
  const oprindelig = globalThis.fetch; let kald = 0;
  globalThis.fetch = async () => {
    kald += 1;
    if (kald === 1) return { ok: true, status: 200, json: async () => ({ id: "immutable-draft-id" }) };
    throw new Error("syntetisk forbindelsesbrud efter kladde");
  };
  try {
    await assert.rejects(async () => {
      try { await opretOgSendKladde({ token: "syntetisk", mailboxId: "mailbox", mail: { jobId: "job-1", til: "kunde@example.com", emne: "Tilbud", tekst: "Hej", signatur: "Veyro" } }); }
      catch (e) { assert.equal(e.ukendtUdfald, true); assert.equal(e.providerDraftId, "immutable-draft-id"); throw e; }
    }, /kunne ikke kontaktes/);
  } finally { globalThis.fetch = oprindelig; }
});
