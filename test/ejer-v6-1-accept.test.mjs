import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lokaltTilbudsforslag } from "../src/fleet/ejer-v6-regler.js";
import { validerTilbud } from "../src/fleet/ejer-tilbud-regler.js";

const laes = (sti) => readFileSync(new URL(`../${sti}`, import.meta.url), "utf8");

test("V6.1 viser tilbudstekst og AI i 60/40-layout med separate mobilpaneler", () => {
  const jsx = laes("src/moduler/udbyder/EjerTilbud.jsx"); const css = laes("src/fleet/ejer-standard.css");
  assert.match(jsx, /ejer-tilbud-tekstlayout/); assert.match(jsx, /ejer-tilbud-mobilpaneler/);
  assert.match(css, /grid-template-columns:minmax\(0,3fr\) minmax\(330px,2fr\)/);
  assert.match(css, /panel-tekst/); assert.match(css, /panel-ai/);
});

test("V6.1 bruger læsbart rateblad, rolig bilagssøgning og korrekt OBD-hjælp", () => {
  assert.match(laes("src/moduler/udbyder/EjerTilbud.jsx"), /Syntetisk testrateblad|ratebladTitel/);
  assert.match(laes("src/moduler/udbyder/EjerBilagsindbakke.jsx"), /ejer-bilag-soeg/);
  assert.match(laes("src/moduler/udbyder/EjerKundekonto.jsx"), /Engangspris pr\. OBD-enhed/);
  assert.doesNotMatch(laes("src/moduler/udbyder/EjerKundekonto.jsx"), /gemmes sikkert som heltalsøre/);
});

test("V6.1 lokalt revideret AI-forslag er faktisk kortere og lækker ikke instruktionen", () => {
  const langt = lokaltTilbudsforslag({ felt: "indledning", kunde: "Testkunde", instruks: "" });
  const kort = lokaltTilbudsforslag({ felt: "indledning", kunde: "Testkunde", instruks: "Gør kortere og skriv HEMMELIGT" });
  assert.ok(kort.length < langt.length); assert.doesNotMatch(kort, /HEMMELIGT|instruks/i);
});

test("V6.2 historisk pilotstart afvises ikke alene i forhold til tilbudsdatoen", () => {
  const resultat = validerTilbud({ virksomhedId: "kunde", udstedelsesdato: "2026-09-10", gyldigTil: "2026-10-10", valuta: "DKK", tilbudstype: "pilot", pilotStart: "2026-09-01", pilotMaaneder: 3, pilotEvaluering: "2026-10-01", linjer: [] });
  assert.equal(resultat.fejl.pilotStart, undefined);
});

test("V6.1 produktions-worker anvendes af afsendelsesvejen og har ingen offentlig testbypass", () => {
  const index = laes("functions/index.js"); const worker = laes("functions/mailjob-worker.js");
  assert.match(index, /koerMailjobWorker/); assert.match(worker, /efterReservation/); assert.match(worker, /vurderMailjobFoerTransport/);
  assert.doesNotMatch(index, /testTransport|testBypass|V61_MAILWORKER/);
});
