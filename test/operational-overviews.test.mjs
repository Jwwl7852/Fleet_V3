import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const integrations = [
  "fleet-v2/src/components/Overview.jsx",
  "facility-v2/src/components/overview/OverviewPage.jsx",
  "workforce-v2/src/components/OverviewPage.jsx",
  "src/fleet/procure-v2/ProcureScreens.jsx",
  "src/moduler/unitbooking/Overblik.jsx",
  "src/moduler/warehouse/Overblik.jsx",
];

describe("Version 1-moduloverblik", () => {
  it("bruger den samme driftsoversigt i præcis de seks aftalte moduler", async () => {
    for (const path of integrations) {
      const source = await read(path);
      assert.match(source, /OperationalOverview/, `${path} mangler den fælles oversigt`);
      assert.match(source, /kpis=\{\[/, `${path} mangler KPI-kontrakten`);
      assert.match(source, /tables=\{\[/, `${path} mangler tabelkontrakten`);
    }
    const planning = await read("src/moduler/booking/PlanningV2Module.jsx");
    assert.doesNotMatch(planning, /OperationalOverview/, "PLANNING må ikke ændres til det nye moduloverblik");
  });

  it("gør klikbare rækker tastaturbetjente og begrænser tabeller lokalt", async () => {
    const component = await read("src/fleet/OperationalOverview.jsx");
    const css = await read("src/fleet/fleet.css");
    assert.match(component, /event\.key === "Enter" \|\| event\.key === " "/);
    assert.match(component, /tabIndex=\{table\.onRow \? 0/);
    assert.match(css, /\.fc-overview-table-scroll\{max-width:100%;overflow-x:auto\}/);
    assert.match(css, /@media\(max-width:700px\)/);
  });

  it("bevarer UNITBOOKING-kalenderen og gør det nye overblik til modulindgang", async () => {
    const app = await read("src/App.jsx");
    const navigation = await read("src/fleet/nav.js");
    assert.match(app, /path="unitbooking" element=\{<UnitbookingOverblik/);
    assert.match(app, /path="unitbooking\/kalender" element=\{<Unitbookingkalender/);
    assert.match(navigation, /sti: "\/unitbooking", label: "Overblik"/);
    assert.match(navigation, /sti: "\/unitbooking\/kalender", label: "Kalender"/);
  });

  it("mærker syntetiske datakilder og opfinder ikke WAREHOUSE-projekter", async () => {
    const shared = await read("src/fleet/OperationalOverview.jsx");
    const fleet = await read("fleet-v2/src/components/Overview.jsx");
    const warehouse = await read("src/moduler/warehouse/Overblik.jsx");
    const unitbooking = await read("src/moduler/unitbooking/Overblik.jsx");
    assert.match(shared, /Syntetiske testdata/);
    assert.match(fleet, /testData=\{demoMode\}/);
    assert.match(warehouse, /source="WAREHOUSE-noder" testData=\{demoMode\}/);
    assert.doesNotMatch(warehouse, /Opret projekt|action=\{/);
    assert.match(unitbooking, /gemte importudkast, ikke parsing-gæt/);
  });

  it("holder KPI-totaler adskilt fra fem-rækkers præsentationsudsnit", async () => {
    const facility = await read("facility-v2/src/components/overview/OverviewPage.jsx");
    const workforce = await read("workforce-v2/src/components/OverviewPage.jsx");
    const unitbooking = await read("src/moduler/unitbooking/Overblik.jsx");
    assert.match(facility, /const allOpenTasks =/);
    assert.match(facility, /value: allOpenTasks\.length/);
    assert.match(facility, /\.slice\(0, 5\)/);
    assert.match(workforce, /const awaitingHours = awaitingTime\.reduce/);
    assert.match(workforce, /value: `\$\{awaitingHours\.toLocaleString/);
    assert.match(unitbooking, /ledigeKasser\(unitMap, udlaan\.data/);
  });
});
