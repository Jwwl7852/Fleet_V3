import assert from "node:assert/strict";
import test from "node:test";
import { foreslaaPilotEvaluering, grupperSolgteModuler, lokaltTilbudsforslag, pilotEvalueringAdvarsel, solgteModulerFraTilbud } from "../src/fleet/ejer-v6-regler.js";
import { mailIndholdHash, vurderMailjobFoerTransport } from "../functions/salgsplatform.js";

test("V6 pilotdato bruger 14 dage før slut og håndterer månedsslut/skudår", () => {
  assert.equal(foreslaaPilotEvaluering("2028-01-31", 1), "2028-02-15");
  assert.equal(foreslaaPilotEvaluering("2026-02-28", 1), "2026-03-14");
  assert.equal(pilotEvalueringAdvarsel("2026-02-01", "2026-03-01", "2026-03-02"), "Den manuelt valgte evaluering ligger uden for pilotperioden.");
});

test("V6 sidste transportkontrol stopper ændret salg og lader support følge sin egen godkendelse", () => {
  const opfoelgning = { status: "godkendt", indholdHash: "x", godkendtIndholdHash: "x", basisAktivitetMs: 10 };
  const traad = { status: "afventer_kunden", senesteAktivitetMs: 10 };
  assert.deepEqual(vurderMailjobFoerTransport({ job: { art: "opfoelgning" }, traad, opfoelgning, tilbudStatus: "accepteret" }), { tilladt: false, aarsag: "tilbud_accepteret" });
  assert.deepEqual(vurderMailjobFoerTransport({ job: { art: "opfoelgning" }, traad: { ...traad, senesteAktivitetMs: 11 }, opfoelgning }), { tilladt: false, aarsag: "godkendelse_forældet" });
  const svarKladde = { status: "godkendt", fra: "info@veyrosystems.com", til: "test@example.com", emne: "Svar", tekst: "Test", signatur: "Veyro", vedhaeftninger: [], basisAktivitetMs: 10 };
  svarKladde.godkendtIndholdHash = mailIndholdHash(svarKladde);
  assert.equal(vurderMailjobFoerTransport({ job: { art: "sagssvar", indholdHash: svarKladde.godkendtIndholdHash }, traad, svarKladde, tilbudStatus: "accepteret" }).tilladt, true);
});

test("V6 lokal AI gentager ikke sælgerinstruksen og kræver separat indsættelse i UI", () => {
  const forslag = lokaltTilbudsforslag({ felt: "indledning", kunde: "Nordlys Drift", instruks: "Gør teksten kortere og skriv ALDRIG DETTE", pilot: true });
  assert.match(forslag, /Nordlys Drift/);
  assert.doesNotMatch(forslag, /ALDRIG DETTE|Sælgerens anvisning/);
});

test("V6 mest solgte moduler tæller accepterede versioner, deduplikerer og skelner pilot", () => {
  const snapshot = (tilbudstype, linjer) => ({ tilbudstype, beregning: { linjer } });
  const tilbud = {
    a: { virksomhedId: "kunde-1", accept: { version: 1, ms: 100 }, versioner: { 1: { snapshot: snapshot("almindelig", [{ modulId: "flaade" }, { modulId: "flaade" }]) } } },
    b: { virksomhedId: "kunde-2", accept: { version: 1, ms: 120 }, versioner: { 1: { snapshot: snapshot("pilot", [{ modulId: "facility" }]) } } },
    c: { virksomhedId: "kunde-3", versioner: { 1: { snapshot: snapshot("almindelig", [{ modulId: "booking" }]) } } },
  };
  assert.deepEqual(grupperSolgteModuler(solgteModulerFraTilbud(tilbud, { fraMs: 0, tilMs: 200, forloeb: "drift" })).map((p) => [p.label, p.antal]), [["Fleet", 1]]);
  assert.deepEqual(grupperSolgteModuler(solgteModulerFraTilbud(tilbud, { fraMs: 0, tilMs: 200, forloeb: "pilot" })).map((p) => [p.label, p.antal]), [["Facility", 1]]);
});
