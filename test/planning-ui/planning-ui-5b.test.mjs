import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMPORTKILDE, STOPTYPE, foreslaaKolonnemapping,
  opretOpgaverFraImportRaekker, parseCsv,
} from "../../src/fleet/planning-input/index.js";
import {
  IMPORTSKABELON_ENCODING, IMPORTSKABELON_FILNAVN, IMPORTSKABELON_SEPARATOR,
  opretStandardImportCsv, validerStandardImportkolonner,
} from "../../src/fleet/planning-ui/planning-import-template.js";
import { mobilHandlingerFor } from "../../src/fleet/planning-ui/planning-ui-copy.js";
import { opretPlanningUiFixtures } from "../../src/fleet/planning-ui/demo-planning-ui.js";

const rod = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(rod, path), "utf8");

describe("Etape 5B importskabelon", () => {
  it("bruger kun kendte kontraktkolonner, BOM og semikolon", () => {
    assert.deepEqual(validerStandardImportkolonner(), { ok: true, ukendte: [] });
    assert.equal(IMPORTSKABELON_FILNAVN, "Veyro_Planning_Importskabelon_v1.csv");
    assert.equal(IMPORTSKABELON_SEPARATOR, ";");
    assert.equal(IMPORTSKABELON_ENCODING, "UTF-8 med BOM");
    assert.equal(opretStandardImportCsv().startsWith("\uFEFF"), true);
  });

  it("roundtripper én-stop og flerstop uden tab eller dubletter", () => {
    const parsed = parseCsv(opretStandardImportCsv(), { filnavn: IMPORTSKABELON_FILNAVN });
    const mapping = foreslaaKolonnemapping(parsed.overskrifter);
    let n = 0;
    const tasks = opretOpgaverFraImportRaekker(parsed.raekker, mapping, { tenantRef: "tenant-fiktiv", kilde: IMPORTKILDE.CSV, batchId: "batch-template", filnavn: IMPORTSKABELON_FILNAVN, importeretMs: Date.UTC(2032, 4, 17, 12), idGenerator: (prefix) => `${prefix}-${++n}` });
    assert.equal(tasks.length, 2);
    const single = tasks.find((task) => !task.importFlerstopId);
    const multi = tasks.find((task) => task.importFlerstopId === "DEMO-FLERSTOP-001");
    assert.equal(single.stop.length, 1);
    assert.equal(multi.stop.length, 2);
    assert.deepEqual(multi.stop.map((stop) => [stop.id, stop.raekkefoelge, stop.type]), [["DEMO-STOP-A", 1, STOPTYPE.AFHENTNING], ["DEMO-STOP-B", 2, STOPTYPE.LEVERING]]);
    assert.equal(new Set(tasks.flatMap((task) => task.stop.map((stop) => `${task.id}:${stop.id}`))).size, 3);
  });

  it("forklarer ærligt at ægte xlsx er udskudt", () => {
    const source = read("src/fleet/planning-ui/PlanningIntake.jsx");
    assert.match(source, /Download standard importskabelon/);
    assert.match(source, /Ægte \.xlsx er udskudt/);
    assert.doesNotMatch(source, /download=\{[^}]*xlsx/i);
  });
});

describe("Etape 5B interaktionskontrakter", () => {
  it("har tre særskilte driftstabeller og synlig kortmarkering", () => {
    const source = read("src/fleet/planning-ui/PlanningOperations.jsx");
    for (const label of ["Aktiv rute", "Tilknyttet rute", "Forbindelse", "Demoposition", "data-selected", "data-muted"]) assert.match(source, new RegExp(label));
    assert.match(source, /Fremhæv på kort/);
    assert.match(source, /Åbn i Livekalender/);
  });

  it("samler forsinkelse, kritisk afvigelse og OBD-offline i KPI-filteret", () => {
    const source = read("src/fleet/planning-ui/PlanningOperations.jsx");
    assert.match(source, /filtre\.status === "handling"/);
    assert.match(source, /\["advarsel", "kritisk"\]\.includes\(status\.tone\)/);
    assert.match(source, /rute\.datakonflikt/);
    assert.match(source, /rute\.id === "ui-rute-cykel"/);
  });

  it("har lokal kortzoom, lagvalg, nulstilling og fuldskærm", () => {
    const source = read("src/fleet/planning-ui/PlanningOperations.jsx");
    for (const label of ["Zoom ind", "Zoom ud", "Nulstil kort", "Skjul ruter", "Vis fuld skærm"]) assert.match(source, new RegExp(label));
  });

  it("holder kalenderpanelet modeless og skifter indhold direkte", () => {
    const demo = read("src/fleet/planning-ui/PlanningDemo.jsx");
    assert.match(demo, /pr-sidepanel-host/);
    assert.match(demo, /role="complementary"/);
    assert.doesNotMatch(demo, /className="pr-sidepanel-host".{0,240}aria-modal="true"/);
    assert.match(demo, /aabnKalenderElement/);
  });

  it("lægger NU-mærket separat og over live-linjen", () => {
    const operations = read("src/fleet/planning-ui/PlanningOperations.jsx");
    const css = read("src/fleet/planning-ui/planning-demo.css");
    assert.match(operations, /data-testid="now-marker"[^]*09:42/);
    assert.match(operations, /data-testid="now-line"/);
    assert.match(css, /\.pr-now-marker[^}]*z-index:35/);
  });

  it("bruger ens Start/Slut med opgavetype som sekundær betydning", () => {
    assert.deepEqual(mobilHandlingerFor({ rutetype: "hjemmepleje" }, {}), { start: "Start", afslut: "Slut", startet: "Start", afsluttet: "Slut", betydning: "besøg" });
    assert.equal(mobilHandlingerFor({ rutetype: "service" }, {}).betydning, "serviceopgave");
    assert.equal(mobilHandlingerFor({ rutetype: "transport" }, { stoptype: "AFHENTNING" }).betydning, "afhentning");
    assert.equal(mobilHandlingerFor({ rutetype: "transport" }, { stoptype: "LEVERING" }).betydning, "levering");
    assert.equal(mobilHandlingerFor({ rutetype: "ukendt" }, {}).start, "Start");
    const transport = opretPlanningUiFixtures().ruter.find((rute) => rute.rutetype === "transport");
    assert.deepEqual(transport.stop.slice(0, 2).map((stop) => stop.stoptype), ["AFHENTNING", "LEVERING"]);
  });

  it("blokerer afslutningsknappen indtil start er registreret", () => {
    const demo = read("src/fleet/planning-ui/PlanningDemo.jsx");
    assert.match(demo, /const kanAfgang = senesteLokale\?\.type === MOBILEVENTTYPE\.ANKOMMET/);
    assert.match(demo, /disabled=\{!kanAfgang\}/);
  });
});
