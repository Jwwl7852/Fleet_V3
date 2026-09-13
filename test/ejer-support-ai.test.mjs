import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bygSupportAiResultat, findSupportKilder, supportSagFakta, supportVersionMatcher } from "../src/fleet/ejer-support-ai.js";
import { bygPortalAiPayload, bygPortalBaggrundPayload, EJER_SUPPORT_ADAPTER_STATUS, erPortalSupport, opretEjerSupportAdapter, supportKanal, supportStatusVisning } from "../src/fleet/ejer-support-kontrakt.js";

const sag = { id: "s1", sagstype: "support", kontaktNavn: "Maja Larsen", virksomhedhedsnavn: "Nordlys", senesteAktivitetMs: 10, support: { modul: "FLEET", version: "3.4.2", fejltekst: "Session expired", forsoegt: "Browser genstartet" }, beskeder: { m1: { id: "m1", retning: "indgaaende", tekst: "Session expired efter adgangsændring", sendtMs: 10 } } };
const viden = { kunde: { id: "kunde", titel: "Forny session", indhold: "Log helt ud og ind igen.", kilde: "Implementeret auth-flow", modul: "FLEET", noegleord: ["session expired"], godkendt: true, vidensstatus: "godkendt", publikum: "kunde_godkendt", aktuelVersion: 2 }, intern: { id: "intern", titel: "Mulig cache", indhold: "Kan skyldes cache.", kilde: "Intern analyse", modul: "FLEET", noegleord: ["session expired"], godkendt: true, vidensstatus: "godkendt", publikum: "intern", aktuelVersion: 1 }, gammel: { id: "gammel", titel: "Gammel løsning", indhold: "Må ikke bruges.", kilde: "Arkiv", modul: "FLEET", noegleord: ["session expired"], godkendt: true, vidensstatus: "foraeldet", publikum: "kunde_godkendt", aktuelVersion: 1 } };

test("V8 E1 skelner dokumenteret fakta, intern forklaring og kundegodkendt løsning", () => {
  const resultat = bygSupportAiResultat({ traad: sag, viden, instruktion: "Fejlsøg og lav et kort svar" });
  assert.equal(resultat.harKundegodkendtLoesning, true); assert.match(resultat.kundesvar, /Log helt ud/); assert.doesNotMatch(resultat.kundesvar, /Kan skyldes cache/); assert.match(resultat.aiSvar, /Dokumenterede fakta/); assert.match(resultat.aiSvar, /kun intern/); assert.equal(findSupportKilder(sag, viden).some((post) => post.id === "gammel"), false);
});

test("V8 E2 viser ukendt og foreslår afklaring uden opfundet løsning", () => {
  const ukendt = { ...sag, support: { modul: "FLEET" }, beskeder: { m1: { id: "m1", retning: "indgaaende", tekst: "Synkronisering stopper", sendtMs: 10 } } };
  const resultat = bygSupportAiResultat({ traad: ukendt, viden, instruktion: "Find løsningen" });
  assert.equal(resultat.harKundegodkendtLoesning, false); assert.match(resultat.kundesvar, /ikke tilstrækkeligt godkendt grundlag/); assert.match(resultat.kundesvar, /produktversion/); assert.doesNotMatch(resultat.kundesvar, /Log helt ud/); assert.equal(supportSagFakta(ukendt).version, "Ukendt");
});

test("V8 UI genbruger samme mailarbejdsrum og serveren beskytter kilder", () => {
  const support = readFileSync(new URL("../src/moduler/udbyder/EjerSupportV2.jsx", import.meta.url), "utf8");
  const mail = readFileSync(new URL("../src/moduler/udbyder/EjerMailV71Samtale.jsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  assert.match(support, /<EjerMailV71Samtale/); assert.match(support, /supportVisning/); assert.match(mail, /Svarudkast/); assert.match(mail, /AI-chat/); assert.match(mail, /Oplysninger/);
  assert.match(server, /export const supportaiforslaggem/); assert.match(server, /kraevSynligKommunikationstraad\(traadId, ejerUid\)/); assert.match(server, /vidensstatus === "godkendt"/); assert.match(server, /publikum === "kunde_godkendt"/); assert.doesNotMatch(server.slice(server.indexOf("export const supportaiforslaggem"), server.indexOf("export const kommunikationssagsoplysninggem")), /kaldOpenAi/);
});

test("V8.1 A2 skelner fordelingskø fra en tildelt faglig afklaring", () => {
  assert.equal(supportStatusVisning("triage", "").label, "Skal fordeles");
  assert.equal(supportStatusVisning("triage", "owner-dennis").label, "Faglig afklaring");
  assert.equal(supportStatusVisning("afventer_kunden", "owner-dennis").label, "Afventer kunden");
});

test("V8.1 A3 matcher kun dokumentation til den registrerede version", () => {
  assert.equal(supportVersionMatcher("3.4.x", "3.4.2"), true);
  assert.equal(supportVersionMatcher("2.x", "3.4.2"), false);
  assert.equal(supportVersionMatcher("3.4.x", "Ukendt"), false);
  const fakta = supportSagFakta({ ...sag, links: { virksomhedId: "crm-1" }, support: { ...sag.support, versionKilde: "Syntetisk fixture" } });
  assert.equal(fakta.kundeKilde, "CRM-kobling");
  assert.equal(fakta.versionErSyntetisk, true);
  assert.equal(fakta.afsenderKilde, "Seneste indgående besked");
});

test("V8.1 B ejeradapteren er samlet og følger den afstemte V1.1-grænse", async () => {
  const kald = [];
  const adapter = opretEjerSupportAdapter({ hentPlatform: async () => { kald.push("hent"); return { traade: {} }; } });
  assert.deepEqual(await adapter.hentPlatform(), { traade: {} });
  assert.deepEqual(kald, ["hent"]);
  assert.equal(adapter.status.tilstand, "ejeradapter_forbundet");
  assert.equal(EJER_SUPPORT_ADAPTER_STATUS.kontraktRevision, "veyro.support.v1.1");
  assert.equal(erPortalSupport({ kilde: { adapter: "veyro.support.v1.1" } }), true);
  assert.equal(erPortalSupport({ kilde: { adapter: "v8_support_local" } }), false);
  assert.equal(supportKanal({ kilde: { adapter: "veyro.support.v1.1" } }), "portal");
});

test("V8.1 B portaladapteren bruger kun de afstemte ejeroperationer og transport", () => {
  const adapter = readFileSync(new URL("../src/fleet/ejer-support-adapter.js", import.meta.url), "utf8");
  assert.match(adapter, /supportEjerKoelist/);
  assert.match(adapter, /supportEjerSagHent/);
  assert.match(adapter, /supportEjerOvertag/);
  assert.match(adapter, /supportEjerStatusOpdater/);
  assert.match(adapter, /supportEjerNoteSkriv/);
  assert.match(adapter, /supportEjerAiForslagGem/);
  assert.match(adapter, /supportEjerBaggrundGem/);
  assert.match(adapter, /supportEjerSvarKladdeGem/);
  assert.match(adapter, /forventetSagRevision/);
  assert.match(adapter, /supportEjerSvarGodkend/);
  assert.match(adapter, /supportEjerSvarTransporter/);
  assert.doesNotMatch(adapter, /supportEjerSvarSend/);
  assert.doesNotMatch(adapter, /portalInternFunktionMangler/);
});

test("Support V1.1 interne payloads bevarer idempotens og begge revisionslag", () => {
  const ai = bygPortalAiPayload({
    traadId: "sag-1", operationId: "operation_12345678", instruktion: "Find næste sikre trin",
    forventetSagRevision: 7, forventetRevision: 3, basisAktivitetMs: 99,
    basisKladdeRevision: 2, basisKladdeFingeraftryk: "811c9dc5",
  });
  assert.deepEqual(ai, {
    sagId: "sag-1", anmodningId: "operation_12345678", instruktion: "Find næste sikre trin",
    forventetSagRevision: 7, forventetRevision: 3, basisAktivitetMs: 99,
    basisKladdeRevision: 2, basisKladdeFingeraftryk: "811c9dc5",
  });
  assert.deepEqual(bygPortalBaggrundPayload({
    traadId: "sag-1", anmodningId: "baggrund_12345678", vaerdi: "Kun internt",
    forventetSagRevision: 8, forventetRevision: 1,
  }), {
    sagId: "sag-1", anmodningId: "baggrund_12345678", vaerdi: "Kun internt",
    forventetSagRevision: 8, forventetRevision: 1,
  });
});

test("V8.1 mobilopfølgning reserverer læseplads til AI-historikken", () => {
  const css = readFileSync(new URL("../src/fleet/ejer-mail-v7.css", import.meta.url), "utf8");
  assert.match(css, /\.ejer-support-detalje \.ejer-mail-fokus\.mobil-svar \.ejer-mail-svarfokus\{height:max\(700px,calc\(100dvh - 16px\)\);min-height:700px\}/);
  assert.match(css, /\.ejer-support-detalje \.ejer-ai-chatpanel\{grid-template-rows:auto minmax\(240px,1fr\) auto auto\}/);
  assert.match(css, /\.ejer-support-detalje \.ejer-ai-chatpanel>\.ejer-ai-chathistorik\{max-height:none;min-height:240px;overflow:auto\}/);
});
