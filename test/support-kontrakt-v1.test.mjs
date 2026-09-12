import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  maaKundeLaeseSupportSag,
  maaPublicereSupportAi,
  kundesynligeSupportBeskeder,
} from "../src/fleet/support.js";
import { DEMO_SUPPORT_VIDEN } from "../src/fleet/demo-support-viden.js";
import { kundeGodkendtViden, lokaltSupportAiSvar } from "../src/fleet/support-ai.js";
import { opretSupportHukommelseslager } from "../src/fleet/support-lokal.js";

const kundeA = { uid: "kunde-a-bruger", tenant: "kunde-a" };
const kollegaA = { uid: "kunde-a-kollega", tenant: "kunde-a" };
const kundeB = { uid: "kunde-b-bruger", tenant: "kunde-b" };
const dennis = { uid: "dennis-ejer", udbyder: true };

function hukommelse() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
}

function system() {
  let tid = 1_800_000_000_000;
  return opretSupportHukommelseslager({ storage: hukommelse(), storageKey: "test", viden: DEMO_SUPPORT_VIDEN, nu: () => ++tid });
}

test("S1: kendt spørgsmål får kundegodkendt kilde og bevares efter genlæsning", async () => {
  const s = system(); const kunde = s.kunde(kundeA);
  const start = await kunde.start({ anmodningId: "start_kendt_001", emne: "Fakturakontrol", tekst: "Hvor finder jeg en faktura til kontrol?", kontekst: { modul: "FAKTURACENTER", version: "3.0.0", token: "maa-ikke-med" } });
  assert.equal(start.sag.status, "aiDialog");
  assert.match(start.sag.nummer, /^SUP-\d{4}-\d{5}$/);
  assert.equal(start.beskeder.length, 2);
  assert.equal(start.beskeder[1].afsenderType, "ai");
  assert.equal(start.beskeder[1].kilde.id, "demo-fakturacenter-status-v1");
  assert.equal(start.sag.kontekst, undefined, "rå kontekst må ikke returneres til kunden");
  const igen = await kunde.hent(start.sag.id);
  assert.deepEqual(igen, start);
});

test("S2/S4: ukendt problem eskaleres som samme, idempotente sag", async () => {
  const s = system(); const kunde = s.kunde(kundeA);
  const input = { anmodningId: "start_ukendt_001", emne: "Ukendt fejl", tekst: "Et særligt problem med zyxw sker igen", kontekst: { modul: "FLEET", version: "3.0.0" } };
  const foerste = await kunde.start(input); const andet = await kunde.start(input);
  assert.equal(foerste.sag.id, andet.sag.id);
  assert.equal((await kunde.list()).length, 1);
  assert.equal(foerste.sag.status, "afventerSupport");
  assert.equal(foerste.sag.ansvarstype, "ejer");
  assert.equal(foerste.beskeder.length, 2);
});

test("S3: kunde → eskalering → ejer → svar bruger samme sag og annullerer gammelt AI-svar", async () => {
  const s = system(); const kunde = s.kunde(kundeA); const ejer = s.ejer(dennis);
  const start = await kunde.start({ anmodningId: "start_race_0001", emne: "Fakturakontrol", tekst: "Hvor finder jeg faktura til kontrol?", kontekst: { modul: "FAKTURACENTER", version: "3.0.0" }, udskydAi: true });
  const eskaleret = await kunde.eskaler({ sagId: start.sag.id, anmodningId: "eskaler_race_01" });
  const overtaget = await ejer.overtag({ sagId: start.sag.id, anmodningId: "overtag_race_01", forventetRevision: eskaleret.sag.revision });
  const sentAi = s.aiPublicer(start.aiKladde, "ai_race_00000001");
  assert.equal(sentAi.publiceret, false);
  const besvaret = await ejer.svar({ sagId: start.sag.id, anmodningId: "ejer_svar_race1", forventetRevision: overtaget.sag.revision, tekst: "Jeg har overtaget sagen. Hvilket lokalt test-id ser du?" });
  assert.equal(besvaret.sag.status, "afventerKunde");
  const kundevisning = await kunde.hent(start.sag.id);
  assert.equal(kundevisning.beskeder.at(-1).afsenderType, "ejer");
  assert.equal(kundevisning.beskeder.some((b) => b.afsenderType === "ai"), false);
});

test("S5: tenant og bruger håndhæves, også mellem kolleger i samme tenant", async () => {
  const s = system(); const egen = s.kunde(kundeA);
  const sag = await egen.start({ anmodningId: "start_adgang_001", emne: "Adgangsprøve", tekst: "Noget ukendt skal undersøges", kontekst: { modul: "FÆLLES" } });
  await assert.rejects(() => s.kunde(kundeB).hent(sag.sag.id), { code: "permission-denied" });
  await assert.rejects(() => s.kunde(kollegaA).hent(sag.sag.id), { code: "permission-denied" });
  assert.equal(maaKundeLaeseSupportSag({ tenantId: "kunde-a", oprettetAfUid: "kunde-a-bruger" }, kundeA), true);
  assert.equal(maaKundeLaeseSupportSag({ tenantId: "kunde-b", oprettetAfUid: "kunde-a-bruger" }, kundeA), false);
});

test("S6/S7: intern note lækker ikke, og kundesvar efter overtagelse starter ikke AI", async () => {
  const s = system(); const kunde = s.kunde(kundeA); const ejer = s.ejer(dennis);
  const start = await kunde.start({ anmodningId: "start_intern_001", emne: "Ukendt", tekst: "En ukendt hændelse", kontekst: { modul: "FACILITY" } });
  const overtaget = await ejer.overtag({ sagId: start.sag.id, anmodningId: "overtag_intern1", forventetRevision: start.sag.revision });
  await ejer.internNote({ sagId: start.sag.id, anmodningId: "intern_note_0001", tekst: "Intern syntetisk note til ejerteamet." });
  const efterKunde = await kunde.send({ sagId: start.sag.id, anmodningId: "kunde_fortsaet_01", tekst: "Her er flere oplysninger." });
  assert.equal(efterKunde.sag.ansvarstype, "ejer");
  assert.equal(efterKunde.beskeder.at(-1).afsenderType, "kunde");
  assert.equal(JSON.stringify(efterKunde).includes("Intern syntetisk note"), false);
  const ejervisning = await ejer.hent(start.sag.id);
  assert.equal(ejervisning.interneNoter.length, 1);
  assert.equal(overtaget.sag.ansvarligUid, dennis.uid);
});

test("kunden løser og genåbner udtrykkeligt samme sag", async () => {
  const s = system(); const kunde = s.kunde(kundeA);
  const start = await kunde.start({ anmodningId: "start_loes_0001", emne: "Kendt", tekst: "Hvor er faktura til kontrol?", kontekst: { modul: "FAKTURACENTER", version: "3.0.0" } });
  const loest = await kunde.loes({ sagId: start.sag.id, anmodningId: "loes_sag_000001" });
  const genaabnet = await kunde.genaabn({ sagId: start.sag.id, anmodningId: "genaabn_sag_001" });
  assert.equal(loest.sag.status, "loest");
  assert.equal(genaabnet.sag.id, start.sag.id);
  assert.equal(genaabnet.sag.status, "afventerSupport");
});

test("AI-politikken kræver kundegodkendelse og aktuel revision", () => {
  assert.equal(kundeGodkendtViden([{ ...DEMO_SUPPORT_VIDEN[0], kundeGodkendt: false }]).length, 0);
  assert.equal(lokaltSupportAiSvar({ tekst: "faktura kontrol", viden: [], kontekst: {} }).eskaler, true);
  assert.equal(maaPublicereSupportAi({ status: "aiDialog", ansvarstype: "ai", ansvarligUid: null, revision: 4 }, 4), true);
  assert.equal(maaPublicereSupportAi({ status: "underBehandling", ansvarstype: "ejer", ansvarligUid: "x", revision: 5 }, 4), false);
  assert.deepEqual(kundesynligeSupportBeskeder({ a: { synlighed: "kunde", afsenderType: "kunde" }, b: { synlighed: "intern", afsenderType: "ejer" } }), { a: { synlighed: "kunde", afsenderType: "kunde" } });
});

test("arkitekturen bruger callable servervej og én fælles supportfil", () => {
  const adapter = readFileSync("src/fleet/support-kunde-adapter.js", "utf8");
  const endpoints = readFileSync("functions/support-endpoints.js", "utf8");
  const hjaelp = readFileSync("src/moduler/support/Hjaelp.jsx", "utf8");
  assert.doesNotMatch(adapter, /\.ref\s*\(/, "kundeadapteren må ikke skrive direkte i RTDB");
  for (const navn of ["supportSamtaleStart", "supportSamtaleHent", "supportBeskedSend", "supportEskaler", "supportEjerOvertag", "supportEjerSvarSend"]) assert.match(endpoints, new RegExp(`export const ${navn}`));
  assert.match(hjaelp, /Kontakt support/);
  assert.match(hjaelp, /Ingen ekstern AI eller mail/);
});
