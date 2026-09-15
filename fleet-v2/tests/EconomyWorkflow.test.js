import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { actualCostSummary, applyManualCostSave, buildEconomyEntries, deduplicateEconomyEntries, economyCsv, economyPeriodComparison, filterEconomyEntries, materializeRecurringEntries, mergeDowntimeIntervals, periodDistance } from "../src/data/economyWorkflow";

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

  it("eksporterer danske overskrifter og decimaler som UTF-8 CSV-indhold", () => {
    const dataset = createFixtureDataset();
    const csv = economyCsv(buildEconomyEntries(dataset), dataset.units);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Beløb");
    expect(csv).toContain("Beløbsgrundlag;Beløb ekskl. moms;Momsbeløb;Beløb inkl. moms");
    expect(csv).toMatch(/\"\d+,\d{2}\"/);
    expect([...new TextEncoder().encode(csv).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("eksporterer kun de momsbeløb, som datagrundlaget faktisk dokumenterer", () => {
    const units = [{ id: "unit-1", number: "ØKO-Æ01" }];
    const csv = economyCsv([
      { id: "net", unitId: "unit-1", date: "2026-09-15", category: "Brændstof", amountMinor: 10000, netAmountMinor: 10000, vatAmountMinor: 2500, vatBasis: "excl_vat", currency: "DKK", state: "booked", source: "test" },
      { id: "gross", unitId: "unit-1", date: "2026-09-15", category: "Værksted", amountMinor: 12500, grossAmountMinor: 12500, vatAmountMinor: 2500, vatBasis: "incl_vat", currency: "DKK", state: "booked", source: "test" },
      { id: "unknown", unitId: "unit-1", date: "2026-09-15", category: "Andet", amountMinor: 5000, vatBasis: "unknown", currency: "DKK", state: "actual", source: "test" },
    ], units);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[1]).toContain('"100,00";"Ekskl. moms";"100,00";"25,00";"125,00"');
    expect(lines[2]).toContain('"125,00";"Inkl. moms";"100,00";"25,00";"125,00"');
    expect(lines[3]).toContain('"50,00";"Uafklaret";"";"";""');
    expect(csv).toContain("ØKO-Æ01");
  });

  it("materialiserer en månedlig kontrakt inden for kontraktens og filtrets periode", () => {
    const rows = materializeRecurringEntries([{ id: "lease", economicEventId: "lease", date: "2026-01-01", periodStart: "2026-01-01", periodEnd: "2026-03-31", recurrence: "monthly", amountMinor: 100, state: "contractual" }], "2026-02-01", "2026-12-31");
    expect(rows.map((item) => item.month)).toEqual(["2026-02", "2026-03"]);
  });

  it("foretrækker bogført post for samme økonomiske hændelse og bevarer kreditnotaen særskilt", () => {
    const rows = deduplicateEconomyEntries([
      { id: "order", economicEventId: "event-1", state: "provisional", amountMinor: 10000 },
      { id: "invoice", economicEventId: "event-1", state: "controlled", amountMinor: 10000 },
      { id: "booked", economicEventId: "event-1", state: "booked", amountMinor: 10000 },
      { id: "credit", economicEventId: "credit-1", creditOf: "event-1", state: "booked", amountMinor: -2500 },
    ]);
    expect(rows).toEqual([expect.objectContaining({ id: "booked" }), expect.objectContaining({ id: "credit", amountMinor: -2500 })]);
  });

  it("sammenligner kun ens status og kræver poster i begge perioder", () => {
    const units = [{ id: "u" }];
    const entries = [
      { id: "a", economicEventId: "a", unitId: "u", date: "2026-02-10", amountMinor: 10000, currency: "DKK", state: "actual" },
      { id: "b", economicEventId: "b", unitId: "u", date: "2026-01-10", amountMinor: 8000, currency: "DKK", state: "actual" },
      { id: "c", economicEventId: "c", unitId: "u", date: "2026-02-12", amountMinor: 50000, currency: "DKK", state: "estimate" },
    ];
    const result = economyPeriodComparison(entries, units, { from: "2026-02-01", to: "2026-02-28" });
    expect(result).toMatchObject({ calculable: true, currentMinor: 10000, priorMinor: 8000, changePct: 25 });
    expect(filterEconomyEntries(entries, units, { from: "2026-02-01", to: "2026-02-28" })).toHaveLength(2);
  });
});
