import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const her = dirname(fileURLToPath(import.meta.url));
const rod = resolve(her, "../..");
const laes = (sti) => readFileSync(resolve(rod, sti), "utf8");

describe("Etape 5A referencevisninger", () => {
  it("viser referencehierarkiet for Dagens drift", () => {
    const drift = laes("src/fleet/planning-ui/PlanningOperations.jsx");
    for (const tekst of ["Dagens drift", "Aktive ruter", "18", "Kører efter planen", "14", "Kræver handling", "Ikke tildelt", "Live overblik", "Rutekort – live"]) {
      assert.match(drift, new RegExp(tekst));
    }
  });

  it("viser referencehierarkiet for Livekalender", () => {
    const drift = laes("src/fleet/planning-ui/PlanningOperations.jsx");
    for (const tekst of ["Livekalender", "Planlagt", "Faktisk via OBD", "Forventet position", "Aktuel position", "09:42", "Afvigelser", "Vis kort", "Fuld skærm"]) {
      assert.match(drift, new RegExp(tekst));
    }
  });

  it("bruger én fælles ruteidentitet på begge arbejdsflader", () => {
    const drift = laes("src/fleet/planning-ui/PlanningOperations.jsx");
    for (const navn of ["København fast rute", "Service Nord", "Kommunal rute 04", "Syd rute", "Akutteam", "Vest rute", "Industrirute", "Kyst rute"]) {
      assert.match(drift, new RegExp(navn), navn);
    }
    assert.ok((drift.match(/referenceRutenavn\(rute\)/g) || []).length >= 4);
  });

  it("binder alle aktive referencekontroller til lokale handlers", () => {
    const drift = laes("src/fleet/planning-ui/PlanningOperations.jsx");
    for (const handler of ["onRoute", "onProposal", "setFiltre", "setFullscreen", "setZoom", "setShowMap"]) {
      assert.match(drift, new RegExp(`onClick=\\{[^}]*${handler}|onClick=\\{\\(\\) => [^}]*${handler}`), handler);
    }
    assert.match(drift, /<Segmentvalg value=\{raekkevisning\} onChange=\{setRaekkevisning\}/);
  });

  it("bevarer Opgaver, Optimering og den manuelt foldbare Planning-menu", () => {
    const demo = laes("src/fleet/planning-ui/PlanningDemo.jsx");
    assert.match(demo, /PlanningIntake/);
    assert.match(demo, /PlanningOptimization/);
    assert.match(demo, /planningMenuAaben/);
    assert.match(demo, /aria-expanded=\{planningMenuAaben\}/);
    assert.match(demo, /Nulstil demodata/);
  });

  it("holder hele Planning-UI fri for delte styles, eksterne lag og persistence", () => {
    const mappe = resolve(rod, "src/fleet/planning-ui");
    const filer = readdirSync(mappe).map((navn) => join(mappe, navn)).filter((fil) => statSync(fil).isFile() && /\.(js|jsx)$/.test(fil));
    for (const fil of filer) {
      const kilde = readFileSync(fil, "utf8");
      assert.doesNotMatch(kilde, /fleet\.css|firebase|https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB/i, fil);
    }
  });

  it("mærker kort, OBD og godkendelse som lokal syntetisk demo", () => {
    const drift = laes("src/fleet/planning-ui/PlanningOperations.jsx");
    const demo = laes("src/fleet/planning-ui/PlanningDemo.jsx");
    assert.match(drift, /Demo – syntetiske ruter og positioner/);
    assert.match(drift, /OBD live – demo/);
    assert.match(demo, /Demoplanen er opdateret lokalt – intet er sendt eller gemt/);
    assert.doesNotMatch(`${drift}\n${demo}`, /data er gemt|sendt til medarbejder|publiceret/);
  });
});
