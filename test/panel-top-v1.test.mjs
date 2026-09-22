import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brugerInitialer } from "../src/fleet/brugerinitialer.js";

const shell = readFileSync("src/fleet/AppShell.jsx", "utf8");
const shellCss = readFileSync("src/fleet/fleet.css", "utf8");
const facilityReports = readFileSync("facility-v2/src/routes/ReportsPage.jsx", "utf8");
const facilityCss = readFileSync("facility-v2/src/styles/facility-v2.css", "utf8");
const workQueue = readFileSync("fleet-v2/src/components/WorkQueue.jsx", "utf8");
const fleetReports = readFileSync("fleet-v2/src/components/ReportTriage.jsx", "utf8");
const fleetCss = readFileSync("fleet-v2/src/styles/fleet-v2.css", "utf8");

test("den fælles topbjælke holder konteksten i den særskilte siderække", () => {
  assert.doesNotMatch(shell, /className="fc-top-kontekst"/);
  assert.ok(shell.includes('className="fc-shell-brugerfunktioner"'));
  assert.ok(shell.includes('className="fc-sidehoved"'));
  assert.ok(shell.includes("sideModulLabel"));
  assert.ok(shell.includes("sideUnderLabel"));
  assert.match(shell, /<i aria-hidden="true">\/<\/i><strong>\{sideUnderLabel\}<\/strong>/);
  assert.ok(shellCss.includes("background:var(--fc-navy);color:var(--veyro-white)"));
  assert.ok(shellCss.includes(".fc-sidehoved{box-sizing:border-box;display:flex"));
});

test("initialer udledes af det aktuelle navn og er ikke hardkodet", () => {
  assert.equal(brugerInitialer("Dennis Christensen", "forkert@example.test"), "DC");
  assert.equal(brugerInitialer("Anna Maria Jensen", "forkert@example.test"), "AM");
  assert.equal(brugerInitialer("", "kollegatest-admin@example.invalid"), "KA");
  assert.doesNotMatch(shell, />DC</);
});

test("FACILITY viser den faktiske sagsreference i en kompakt relation", () => {
  assert.match(facilityReports, /triage-case-link[^>]*>Åbn sag \{caseRecord\.reference\}/);
  assert.match(facilityReports, /to=\{`\/facility\/sager\/\$\{caseRecord\.id\}`\}/);
  assert.ok(shellCss.includes(".veyro-module--facility .triage-case-link{align-self:flex-start;flex:0 0 auto;min-height:36px"));
});

test("FACILITY og FLEET bruger resterende højde med interne scrollområder", () => {
  assert.ok(shellCss.includes(".fc-main--indberetninger .fc-slot{display:flex;flex-direction:column;min-height:0}"));
  assert.ok(shellCss.includes(".triage-layout.facility-three-panel{height:100%;min-height:0;align-items:stretch}"));
  assert.ok(shellCss.includes("overflow-y:auto;scrollbar-gutter:stable"));
  assert.match(fleetCss, /\.fleet-v2-embedded > \.triage-page \{ height:100%; min-height:0; overflow:hidden/);
});

test("FLEET Arbejdskø har en ubrudt højdekæde og en separat handlingslinje", () => {
  assert.ok(shell.includes('fc-main--fleet-arbejdskoe'));
  assert.ok(shellCss.includes('.fc-main--fleet-arbejdskoe .fleet-v2-embedded>.queue-page{display:flex;flex:1 1 0'));
  assert.match(workQueue, /className="queue-actions-toolbar"/);
  assert.match(workQueue, /className="kanban-empty">Ingen sager/);
  assert.match(workQueue, /className="queue-table-empty"/);
  assert.ok(fleetCss.includes('grid-auto-flow: column; grid-auto-columns: minmax(205px, 1fr)'));
});

test("indberetningsfiltre og indbakker følger den fælles kompakte standard", () => {
  assert.match(fleetCss, /triage-filters :is\(\.input-with-icon, select\)[^{]*\{[^}]*height: 40px; min-height: 40px/);
  assert.match(facilityCss, /\.compact-filters input, \.compact-filters select \{[^}]*height: 40px; min-height: 40px/);
  assert.match(fleetCss, /\.triage-list > button \{[^}]*min-height: 70px/);
  assert.match(facilityCss, /\.master-list li button \{[^}]*min-height: 66px/);
  assert.match(facilityReports, /facility-report-status--\$\{item\.status\}/);
  assert.match(facilityCss, /\.facility-report-status--received/);
  assert.match(facilityCss, /\.facility-report-status--triaged/);
  assert.match(fleetReports, /selectedReport && selectedCase/);
  assert.match(fleetReports, /Den tilknyttede enhed findes ikke i det aktuelle enhedsregister/);
});

test("Ny indberetning i siderækken genbruger eksisterende flow", () => {
  assert.ok(shell.includes('new CustomEvent("veyro:opret-facility-indberetning")'));
  assert.ok(facilityReports.includes("window.addEventListener('veyro:opret-facility-indberetning', openCreate)"));
  assert.ok(shell.includes('to="/fleet-v2/indberetninger/ny"'));
});
