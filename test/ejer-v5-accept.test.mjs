import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const laes = (sti) => readFileSync(new URL(`../${sti}`, import.meta.url), "utf8");

test("V01 låst tilbud har særskilt kladde og ingen redigeringsværktøjer i versionsvisningen", () => {
  const kode = laes("src/moduler/udbyder/EjerTilbud.jsx");
  assert.match(kode, /accepteret og låst/);
  assert.match(kode, /AI kan ikke indsætte eller ændre tekst/);
  assert.match(kode, /Opret ny kladde/);
  assert.match(kode, /version \{vistVersion\}/);
});

test("V02 accepteret eller afvist tilbud stopper opfølgning før mailjob", () => {
  const kode = laes("functions/index.js");
  const start = kode.indexOf("export const salgsopfoelgningafsend");
  const blok = kode.slice(start, start + 2600);
  assert.match(blok, /tilbud_accepteret/);
  assert.match(blok, /status: "pauset"/);
  assert.ok(blok.indexOf("tilbudStatus") < blok.indexOf("const jobId"));
});

test("V03 lokal tilbudsassistent kræver eksplicit indsættelse og ændrer ikke økonomi", () => {
  const kode = laes("src/moduler/udbyder/EjerTilbud.jsx");
  assert.match(kode, /Sælgerens anvisning til næste forslag/);
  assert.match(kode, /Lav revideret forslag/);
  assert.match(kode, /Indsæt i tilbud/);
  assert.match(kode, /Priser og totaler berøres aldrig/);
});

test("V06 mobilmail bruger routevalg, tilbagehandling og redigerbar lokal kladde", () => {
  const kode = laes("src/moduler/udbyder/EjerMailV2.jsx");
  assert.match(kode, /ejer-mail-mobil-detalje/);
  assert.match(kode, /Tilbage til indbakken/);
  assert.match(kode, /setLokaleKladder/);
  assert.doesNotMatch(kode, /aria-label="Svarudkast"[^>]*readOnly/);
});

test("V09-V12 bruger forståelige termer og sandfærdige ukendte målinger", () => {
  const konto = laes("src/moduler/udbyder/EjerKundekonto.jsx");
  assert.match(konto, /Brugere — administrative/);
  assert.match(konto, /Brugere — operative/);
  assert.match(konto, /unikke personer/);
  assert.doesNotMatch(konto, /kompatible felt <code>chauffoerbrugere/);
  assert.match(konto, /Ikke tilgængeligt/);
  const rapport = laes("src/moduler/udbyder/EjerRapporter.jsx");
  assert.match(rapport, /Mest solgte moduler/);
  assert.match(rapport, /Aftalt og registreret forbrug/);
});

test("V11 bilag har eksplicitte filvalg og fysisk kamera beskrives betinget", () => {
  const kode = laes("src/moduler/udbyder/EjerBilagsindbakke.jsx");
  assert.match(kode, /Vælg filer fra computer/);
  assert.match(kode, /Vælg eller tag billede/);
  assert.match(kode, /På en fysisk mobil kan systemets kamera tilbydes/);
  assert.match(kode, /Prøv igen/);
});
