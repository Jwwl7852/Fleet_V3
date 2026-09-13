import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const samtale = await readFile(new URL("../src/moduler/udbyder/EjerMailV71Samtale.jsx", import.meta.url), "utf8");
const oversigt = await readFile(new URL("../src/moduler/udbyder/EjerMailV7.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/fleet/ejer-mail-v7.css", import.meta.url), "utf8");
const server = await readFile(new URL("../functions/index.js", import.meta.url), "utf8");

test("V7.2 mobilstart er kompakt og har alle værktøjer bag én betjening", () => {
  assert.match(oversigt, /ejer-mail-mobilkompakt/);
  assert.match(oversigt, /Søg, filtre og mapper/);
  assert.match(oversigt, /aktive filtre/);
  assert.match(oversigt, /Nulstil/);
  assert.match(css, /not\(\.mobil-vaerktoejer-aabne\).*ejer-mail-toolbar/);
  assert.match(css, /min-height:68px/);
});

test("V7.2 svarudkast bruger Oplysninger-data og samme AI-chat", () => {
  assert.match(samtale, /kundebekraeftet = oplysninger\.filter/);
  assert.match(samtale, /Bekræftet og mangler/);
  assert.match(samtale, /Se alle i Oplysninger/);
  assert.match(samtale, /Seneste AI-revision/);
  assert.match(samtale, /blivPaaFane: true/);
  assert.match(samtale, /Forslaget overskriver aldrig kladden automatisk/);
});

test("V7.2 blokerer afsendelse ved enhver lokal ændring", () => {
   assert.match(samtale, /kladde\?\.status === "godkendt" && !beskidt/);
  assert.match(samtale, /en tidligere godkendelse gælder ikke/);
  assert.match(samtale, /data-testid="afsend-godkendt-svar"/);
  assert.match(samtale, /Godkendelse<\/dt><dd>Afventer din konkrete godkendelse/);
});

test("V7.2 gemning og godkendelse er synligheds- og revisionsbeskyttet", () => {
  const gem = server.slice(server.indexOf("export const kommunikationssvarkladdegem"), server.indexOf("export const kommunikationssvargodkend"));
  const godkend = server.slice(server.indexOf("export const kommunikationssvargodkend"), server.indexOf("function graphBeskedTilIntern"));
  assert.match(gem, /kraevSynligKommunikationstraad/);
  assert.match(gem, /ref\.transaction/);
  assert.doesNotMatch(gem, /godkendtIndholdHash/);
  assert.match(godkend, /kraevSynligKommunikationstraad/);
  assert.match(godkend, /ref\.transaction/);
  assert.match(godkend, /aktuel\.indholdHash !== foer\.indholdHash/);
});
