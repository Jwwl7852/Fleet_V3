import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mobilHandlingerFor } from "../../src/fleet/planning-ui/planning-ui-copy.js";

const root = resolve(import.meta.dirname, "../..");
const demo = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningDemo.jsx"), "utf8");
const intake = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningIntake.jsx"), "utf8");
const flexible = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningFlexibleScheduling.jsx"), "utf8");
const panel = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningWorkPanel.jsx"), "utf8");

describe("Ikke-blokerende arbejdsflade", () => {
  it("bruger ét modeless sidepanel uden backdrop eller fokusfælde", () => {
    assert.match(panel, /data-modeless="true"/); assert.doesNotMatch(panel, /aria-modal|backdrop|focusTrap/); assert.match(panel, /Escape/);
    assert.doesNotMatch(intake, /pu-overlay[\s\S]*Opret opgave/);
  });
  it("gør hele opgaverækken tastaturklikbar uden bubbling fra checkbox og link", () => {
    assert.match(intake, /pi-clickable-row[\s\S]*tabIndex="0"[\s\S]*event\.key === "Enter"[\s\S]*event\.key === " "/);
    assert.match(intake, /stopPropagation\(\)/);
  });
  it("bevarer Intake monteret ved navigation og viser Kladde", () => {
    assert.match(demo, /hidden=\{visning !== VISNING\.OPGAVER\}/); assert.match(intake, /Kladde/);
  });
  it("udskifter det aktive opgavepanel uden at stable paneler", () => {
    assert.match(intake, /openRow = \(opgaveId\) => \{ setDialog\(null\); setValgtId\(opgaveId\); \}/);
    assert.match(intake, /openDialog = \(type\) => \{ setValgtId\(null\); setDialog\(type\); \}/);
  });
  it("åbner kun en lokal opgavefane efter brugerklik", () => {
    assert.match(intake, /createLocalUrl\(\{ view: "opgaver", search \}\)/); assert.match(intake, /new URL\(`planning-demo\.html\?\$\{search\}`, window\.location\.href\)\.href/); assert.match(intake, /window\.open\(destination, "_blank"\)/); assert.match(intake, /Browseren blokerede/);
  });
});

describe("Ugeplanlægningsfladen", () => {
  it("tilføjer Planlægning som særskilt navigation uden at ændre Livekalender", () => {
    assert.match(demo, /VISNING\.PLANLAEGNING, "Planlægning"/); assert.match(demo, /VISNING\.KALENDER/); assert.match(flexible, /Uge \{currentWeek/);
  });
  it("har drag and drop og klikbaseret fallback med tidsvælger", () => {
    assert.match(flexible, /draggable/); assert.match(flexible, /onDragStart/); assert.match(flexible, /onDrop/); assert.doesNotMatch(flexible, /\+ Placér opgave/); assert.match(flexible, /Gem kladde/);
  });
  it("har tre ressourcevisninger og alle syv dage", () => {
    for (const text of ["Ruter", "Medarbejdere", "Køretøjer", "Mandag", "Søndag"]) assert.match(flexible, new RegExp(text));
  });
  it("holder bestilling, versioneret planforslag og bestillersvar i samme lokale tråd", () => {
    for (const text of ["Samlet lokal bestillingstråd", "Send til bekræftelse", "Åbn lokal bestillervisning", "intet sendes eksternt"]) assert.match(flexible, new RegExp(text, "i"));
  });
  it("viser flerdagsruter særskilt og kan åbne hele ugeprogrammet", () => {
    assert.match(flexible, /Flerdagsruter/); assert.match(flexible, /Samlet ugeprogram/); assert.match(flexible, /Gå til dagens del i Livekalenderen/);
  });
  it("viser ét flytbart, ikke-modalt opgavevindue uden fast dobbeltredigering", () => {
    assert.match(flexible, /ps-floating-task/);
    assert.doesNotMatch(flexible, /TaskWorkspace/);
    assert.doesNotMatch(flexible, /<PlanningWorkPanel title=\{task\.name\}/);
    assert.match(flexible, /<PlanningWorkPanel title=\{route\.name\}/);
  });
  it("bruger én aktiv opgaveidentitet i kalender, overskrift, placering og tråd", () => {
    assert.match(flexible, /activeTaskId/);
    assert.match(flexible, /data-active-task-id=\{task\.id\}/);
    assert.match(flexible, /data-active=\{activeTaskId === placement\.taskId\}/);
    assert.doesNotMatch(flexible, /openTaskId|const \[selectedTaskId/);
  });
  it("har tre tabs som bevarer samme opgaveområde", () => {
    for (const label of ["Placering", "Opgavedetaljer", "Bestillingstråd", "Luk opgavevindue"]) assert.match(flexible, new RegExp(label));
    assert.match(flexible, /activeTab/);
  });
  it("sorterer flere placeringer stabilt og viser en vedvarende dropzone", () => {
    assert.match(flexible, /startTime\.localeCompare\(right\.startTime\) \|\| left\.id\.localeCompare\(right\.id\)/);
    assert.doesNotMatch(flexible, /\+ Placér opgave/);
    assert.match(flexible, /event\.target === event\.currentTarget/);
    assert.match(flexible, /onDrop=\{\(event\) => \{ event\.preventDefault\(\); event\.stopPropagation\(\)/);
  });
  it("bevarer en konfliktramt placeringskladde og blokerer ugyldig bekræftelse", () => {
    assert.match(flexible, /setFindingsByTask/);
    assert.match(flexible, /if \(!result\.ok\) return/);
    assert.match(flexible, /disabled=\{!pending \|\| findings\.some/);
  });
  it("lukker filter-underkontrol før opgavevinduet med Escape", () => {
    assert.match(flexible, /if \(filtersOpen\) \{ setFiltersOpen\(false\); return; \}/);
    assert.match(flexible, /if \(activeTaskId\) closeTask\(\)/);
    assert.doesNotMatch(flexible, /event\.target\.closest\?\.\("input, textarea, select"\)/);
  });
  it("bruger BroadcastChannel til lokal to-vindue-synkronisering og har klikfallback", () => {
    assert.match(demo, /syncChannelName = "veyro-planning-week-demo"/);
    assert.match(demo, /new BroadcastChannel\(syncChannelName\)/);
    assert.match(demo, /channel\.close\(\)/);
    assert.match(flexible, /Åbn kalender i eget vindue/); assert.match(flexible, /createLocalUrl \? createLocalUrl/); assert.match(flexible, /new URL\(`planning-demo\.html\?\$\{search\}`, window\.location\.href\)\.href/); assert.match(flexible, /calendarOnly=1/); assert.match(flexible, /Opgave valgt/); assert.doesNotMatch(`${demo}\n${flexible}`, /localStorage|sessionStorage|indexedDB/);
    assert.match(demo, /payload\?\.revision > ugeplanRef\.current\.revision/);
  });
});

describe("Mobil Start og Slut", () => {
  it("bruger enkle primærhandlinger på tværs af opgavetyper", () => {
    for (const [route, stop, meaning] of [[{ rutetype: "hjemmepleje" }, {}, "besøg"], [{ rutetype: "service" }, {}, "serviceopgave"], [{ rutetype: "transport" }, { stoptype: "AFHENTNING" }, "afhentning"], [{ rutetype: "transport" }, { stoptype: "LEVERING" }, "levering"]]) assert.deepEqual(mobilHandlingerFor(route, stop), { start: "Start", afslut: "Slut", startet: "Start", afsluttet: "Slut", betydning: meaning });
  });
  it("holder Slut deaktiveret indtil Start", () => {
    assert.match(demo, /disabled=\{!kanAfgang\}/); assert.match(demo, /Registrér Start først/);
  });
});
