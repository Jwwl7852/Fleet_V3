import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const flexible = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningFlexibleScheduling.jsx"), "utf8");
const demo = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningDemo.jsx"), "utf8");
const css = readFileSync(resolve(root, "src/fleet/planning-ui/planning-demo.css"), "utf8");

describe("Fleksibel planlægningsarbejdsflade", () => {
  it("bruger hele den lokale arbejdsbredde uden en centreret maksimalbredde", () => {
    assert.match(css, /\.ps-flex-view\{[^}]*max-width:none[^}]*margin:0/);
    assert.match(css, /\.ps-flex-layout\{[^}]*grid-template-columns:minmax\(260px,var\(--ps-queue-width,336px\)\) 9px minmax\(0,1fr\)/);
  });

  it("har en selvstændigt rullende indbakke og kalender", () => {
    assert.match(css, /\.ps-inbox\{[^}]*overflow:hidden/);
    assert.match(css, /\.ps-inbox \.ps-queue-list\{[^}]*overflow-y:auto/);
    assert.match(css, /\.ps-flex-layout \.ps-week-scroll\{[^}]*overflow:auto/);
    assert.match(css, /\.ps-day-head\{[^}]*position:sticky/);
    assert.match(css, /\.ps-resource-name\{[^}]*position:sticky/);
  });

  it("har en justerbar, tastaturbetjent separator med sikre breddegrænser", () => {
    assert.match(flexible, /role="separator"/);
    assert.match(flexible, /aria-valuemin="260"/);
    assert.match(flexible, /ArrowLeft/);
    assert.match(flexible, /ArrowRight/);
    assert.match(flexible, /setPointerCapture/);
  });

  it("viser ét kompakt, flytbart opgavevindue med Maksimér og Gendan", () => {
    assert.match(flexible, /ps-floating-task/);
    assert.match(flexible, /Maksimér/);
    assert.match(flexible, /Gendan/);
    assert.match(flexible, /onHeaderPointerDown/);
    assert.match(flexible, /pointercancel/i);
    assert.doesNotMatch(flexible, /backdrop|aria-modal/);
  });

  it("bevarer ét aktivt opgave-ID, kladder og tråd ved skift", () => {
    assert.match(flexible, /activeTaskId/);
    assert.match(flexible, /placementDrafts/);
    assert.match(flexible, /findingsByTask/);
    assert.match(flexible, /data-active-task-id=\{task\.id\}/);
    assert.match(flexible, /Bestillingstråd/);
  });

  it("viser flere kort stabilt og bruger hele cellen uden gentagen placeringsknap", () => {
    assert.match(flexible, /startTime\.localeCompare\(right\.startTime\) \|\| left\.id\.localeCompare\(right\.id\)/);
    assert.doesNotMatch(flexible, /\+ Placér opgave|ps-drop-action/);
    assert.match(flexible, /event\.target === event\.currentTarget/);
    assert.match(flexible, /onDragEnter/);
    assert.match(flexible, /event\.stopPropagation\(\); openTask\(placement\.taskId\)/);
  });

  it("har flerugefilter, alle perioder og uden datoønske", () => {
    for (const text of ["Følg kalenderens uge", "Alle perioder", "Uden datoønske", "Tilføj forrige uge", "Tilføj næste uge", "2032-W37", "2032-W38", "2032-W39"]) assert.match(flexible, new RegExp(text));
    assert.match(flexible, /filtrerOpgaverEfterUger/);
    assert.match(flexible, /weekMode === "ALL" \? \[\]/);
  });

  it("åbner en kalender-only URL uden platformnavigation", () => {
    assert.match(flexible, /calendarOnly=1/);
    assert.match(flexible, /Åbn kalender i eget vindue/);
    assert.match(demo, /if \(urlState\.calendarOnly\)[\s\S]*PlanningScheduling[\s\S]*calendarOnly/);
  });

  it("har en mobil arbejdsgang uden krav om at trække separatoren", () => {
    assert.match(flexible, /Planlægningskø/);
    assert.match(flexible, /Ugekalender/);
    assert.match(css, /@media\s*\(max-width:700px\)[\s\S]*\.ps-mobile-switch/);
    assert.match(css, /\.ps-floating-task\{[^}]*width:min\(400px,calc\(100vw - 24px\)\)/);
  });
});
