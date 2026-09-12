import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bygSupportAiResultat, findSupportKilder, supportSagFakta } from "../src/fleet/ejer-support-ai.js";

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
