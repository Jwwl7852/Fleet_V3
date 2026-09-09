import { describe, expect, it } from 'vitest';
import { createDemoDataset, DEMO_USER_ID } from '../src/data/fixtures';
import { selectOverview } from '../src/data/overviewSelectors';

describe('selectOverview', () => {
  it('beregner alle KPIer fra samme datasæt', () => {
    const dataset = createDemoDataset();
    const overview = selectOverview(dataset, DEMO_USER_ID);
    expect(overview.propertyCount).toBe(dataset.properties.length);
    expect(overview.openCaseCount).toBe(2);
    expect(overview.upcomingServiceCount).toBe(3);
    expect(overview.registeredCostTotal).toBe(186500);
    expect(overview.myTasks).toHaveLength(3);
  });

  it('udelader budget og estimater fra registrerede omkostninger', () => {
    const dataset = createDemoDataset();
    const first = selectOverview(dataset, DEMO_USER_ID);
    dataset.costs.push({ id: 'budget-extra', kind: 'budget', amount: 999999, currency: 'DKK', date: '2026-03-01' });
    dataset.costs.push({ id: 'estimate-extra', kind: 'estimate', amount: 999999, currency: 'DKK', date: '2026-03-01' });
    expect(selectOverview(dataset, DEMO_USER_ID).registeredCostTotal).toBe(first.registeredCostTotal);
  });

  it('reagerer på ændringer og giver ærlige tomme tilstande', () => {
    const dataset = createDemoDataset();
    dataset.properties.push({ id: 'property-test', registeredAt: '2026-09-08' });
    dataset.costs = [];
    dataset.serviceOccurrences = [];
    const overview = selectOverview(dataset, DEMO_USER_ID);
    expect(overview.propertyCount).toBe(5);
    expect(overview.registeredCostTotal).toBe(0);
    expect(overview.costHasData).toBe(false);
    expect(overview.serviceHasData).toBe(false);
  });
});
