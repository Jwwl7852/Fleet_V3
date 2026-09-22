import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brugerInitialer } from "../src/fleet/brugerinitialer.js";

const shell = readFileSync("src/fleet/AppShell.jsx", "utf8");
const shellCss = readFileSync("src/fleet/fleet.css", "utf8");
const facilityReports = readFileSync("facility-v2/src/routes/ReportsPage.jsx", "utf8");
const fleetCss = readFileSync("fleet-v2/src/styles/fleet-v2.css", "utf8");

test("den fælles topbjælke viser kontekst, brugerfunktioner og en særskilt siderække", () => {
  assert.ok(shell.includes('className="fc-top-kontekst"'));
  assert.ok(shell.includes('className="fc-shell-brugerfunktioner"'));
  assert.ok(shell.includes('className="fc-sidehoved"'));
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

test("Ny indberetning i siderækken genbruger eksisterende flow", () => {
  assert.ok(shell.includes('new CustomEvent("veyro:opret-facility-indberetning")'));
  assert.ok(facilityReports.includes("window.addEventListener('veyro:opret-facility-indberetning', openCreate)"));
  assert.ok(shell.includes('to="/fleet-v2/indberetninger/ny"'));
});
