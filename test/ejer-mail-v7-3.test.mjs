import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bygMailsignaturTekst, findKendtMailsignaturAfslutning, fjernKendtMailsignaturAfslutning } from "../src/fleet/ejer-mailsignatur.js";
import { filtrerMailtraade, lokalAiChatRevision } from "../src/fleet/ejer-mail-v7-regler.js";

test("V7.3 signatur er særskilt og AI-forslag indeholder ikke skjult signatur", () => {
  const signatur = bygMailsignaturTekst({ navn: "Dennis", titel: "Ejer", virksomhed: "Veyro Systems" });
  assert.equal(signatur, "Venlig hilsen\nDennis\nEjer\nVeyro Systems");
  const forslag = lokalAiChatRevision({ navn: "Maria", oplysninger: [], instruktioner: ["Kort"], signatur: "" }).tekst;
  assert.doesNotMatch(forslag, /Venlig hilsen/);
});

test("V7.3.1 fjerner kun en kendt, afsluttende ejersignatur", () => {
  const dobbelt = "Hej Maria.\n\nSvartekst.\n\nVenlig hilsen\nDennis Testejer";
  assert.equal(findKendtMailsignaturAfslutning(dobbelt, ["Dennis Testejer"])?.navn, "Dennis Testejer");
  assert.equal(fjernKendtMailsignaturAfslutning(dobbelt, ["Dennis Testejer"]), "Hej Maria.\n\nSvartekst.");
  const friTekst = "Hej Maria.\n\nMed venlig hilsen fra hele projektgruppen";
  assert.equal(findKendtMailsignaturAfslutning(friTekst, ["Dennis Testejer"]), null);
  assert.equal(fjernKendtMailsignaturAfslutning(friTekst, ["Dennis Testejer"]), friTekst);
});

test("V7.3 nyeste-først har stabil id-tiebreaker", () => {
  const traade = { a: { id: "a", status: "ny", delingsstatus: "delt", sagstype: "kundedialog", senesteAktivitetMs: 10 }, b: { id: "b", status: "ny", delingsstatus: "delt", sagstype: "kundedialog", senesteAktivitetMs: 10 } };
  assert.deepEqual(filtrerMailtraade(traade, { postkasse: "faelles", status: "aabne", mappe: "indbakke", visning: "indbakker" }).map((p) => p.id), ["b", "a"]);
});

test("V7.3 UI har flerlinjede bundkomposere og signaturvalg", () => {
  const jsx = readFileSync(new URL("../src/moduler/udbyder/EjerMailV71Samtale.jsx", import.meta.url), "utf8");
  assert.match(jsx, /ejer-intern-note-komposer/); assert.match(jsx, /Fortsæt den fælles AI-chat<textarea rows="4"/);
  assert.match(jsx, /Anvend min aktuelle signatur/); assert.match(jsx, /data-testid="review-samlet-svar"/);
  assert.match(jsx, /aiUdvekslinger/); assert.match(jsx, /sorterNyeste/);
});

test("V7.3.1 mobilpanel og supportnoter følger samme aktive sag", () => {
  const jsx = readFileSync(new URL("../src/moduler/udbyder/EjerMailV71Samtale.jsx", import.meta.url), "utf8");
  const support = readFileSync(new URL("../src/moduler/udbyder/EjerSupportV2.jsx", import.meta.url), "utf8");
  const samtale = readFileSync(new URL("../src/moduler/udbyder/EjerMailV71Samtale.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/fleet/ejer-mail-v7.css", import.meta.url), "utf8");
  assert.match(jsx, /aria-selected=\{mobilpanel === "svar"\}/);
  assert.match(css, /mobil-svar \.ejer-mail-traadfokus\{display:none!important\}/);
  assert.match(support, /Interne noter · nyeste først/);
  assert.match(support, /EjerMailV71Samtale/);
  assert.match(samtale, /data-note-id=\{note\.id\}/);
});

test("V7.3.2 højrepanelet reserverer plads til begge AI-komposere", () => {
  const jsx = readFileSync(new URL("../src/moduler/udbyder/EjerMailV71Samtale.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/fleet/ejer-mail-v7.css", import.meta.url), "utf8");
  assert.match(jsx, /ejer-svarudkastpanel/);
  assert.match(jsx, /ejer-mail-ai-scrollregion/);
  assert.match(jsx, /data-testid="fast-hurtiginstruks"/);
  assert.match(jsx, /data-testid="fast-ai-chat-komposer"/);
  assert.match(css, /\.ejer-svarudkastpanel\{grid-template-rows:minmax\(0,1fr\) auto/);
  assert.match(css, /\.ejer-ai-chatpanel\{grid-template-rows:auto minmax\(128px,1fr\) auto auto/);
  assert.doesNotMatch(css, /\.ejer-mail-aiinstruks\{position:sticky/);
});

test("V7.3 server beskytter signatur og noter med tenantløs ejeradgang", () => {
  const server = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  assert.match(server, /export const ejermailsignaturhent/); assert.match(server, /export const ejermailsignaturgem/);
  assert.match(server, /profiler\/\$\{ejerUid\}\/mailSignatur/); assert.match(server, /kraevSynligKommunikationstraad\(traadId, ejerUid\)/);
});
