import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { actualCostSummary, applyManualCostSave, buildEconomyEntries, mergeDowntimeIntervals, periodDistance } from "../src/data/economyWorkflow";

describe("økonomi og flådestatistik", () => {
  it("holder faktiske, foreløbige, estimater og kontraktlige ydelser adskilt", () => {
    const dataset = createFixtureDataset();
    const entries = buildEconomyEntries(dataset);
    const summary = actualCostSummary(entries);
    expect(summary.amountMinor).toBe(dataset.relations.costs.reduce((sum,item)=>sum+item.amount*100,0));
    expect(entries.some((item)=>item.state==="contractual")).toBe(false);
  });

  it("registrerer manuel omkostning med valuta, moms og rettelseshistorik", () => {
    let dataset=createFixtureDataset();
    const first=applyManualCostSave(dataset,{unitId:"unit-sc-104",date:"2026-09-08",categoryKey:"insurance",amount:"1250,50",currency:"DKK",vatBasis:"unknown",note:"Police"},{id:"demo-sara",name:"Sara"},{id:"one",now:"2026-09-08T10:00:00Z"});
    expect(first.cost).toMatchObject({amountMinor:125050,source:"manual_local",state:"actual"});
    const second=applyManualCostSave(first.dataset,{...first.cost,amount:"1300",categoryKey:"insurance"},{id:"demo-sara",name:"Sara"},{now:"2026-09-08T11:00:00Z"});
    expect(second.cost.history).toHaveLength(1);
  });

  it("beregner kun periodedistance fra mindst to daterede målinger", () => {
    const rows=[{unitId:"u",unit:"km",value:100,observedAt:"2026-01-01T00:00:00Z"},{unitId:"u",unit:"km",value:350,observedAt:"2026-02-01T00:00:00Z"}];
    expect(periodDistance("u",rows,"2026-01-01","2026-12-31").distance).toBe(250);
    expect(periodDistance("u",rows.slice(0,1),"2026-01-01","2026-12-31").calculable).toBe(false);
  });

  it("dobbelttæller ikke overlappende nedetidsintervaller", () => {
    const merged=mergeDowntimeIntervals([{start:"2026-01-01T00:00:00Z",end:"2026-01-02T00:00:00Z"},{start:"2026-01-01T12:00:00Z",end:"2026-01-03T00:00:00Z"}]);
    expect(merged).toEqual([{start:"2026-01-01T00:00:00Z",end:"2026-01-03T00:00:00Z"}]);
  });
});
