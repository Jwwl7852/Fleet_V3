import { describe, expect, it } from 'vitest';
import { createDemoDataset } from '../src/data/fixtures';
import { addCalendarMonths, addRestriction, appendWork, calculateNextServiceDue, closeCase, createBooking, createManualCase, createTask, reopenCase, runServiceCatchUp, submitReport } from '../src/domain/workflowDomain';

const reportInput = (overrides = {}) => ({ submissionKey: 'stable-submit-1', source: 'desktop', propertyId: 'property-nordparken-14', locationId: 'location-nordparken-building-a', installationId: '', title: 'Fejl på bygningen', description: 'Facadeelement er løst.', category: 'Bygning', reporterSeverity: 'high', observedAt: '2026-09-08T10:00:00Z', affectedAreaIds: [], attachmentVersionIds: [], ...overrides });

describe('FACILITY arbejdsgange', () => {
  it('opretter atomisk én indberetning og én sag og afviser dubletter', () => {
    const first = submitReport(createDemoDataset(), reportInput());
    const retry = submitReport(first.dataset, reportInput());
    expect(first.report.caseId).toBe(first.caseRecord.id);
    expect(retry.duplicate).toBe(true);
    expect(retry.dataset.reports).toHaveLength(first.dataset.reports.length);
    expect(retry.dataset.cases).toHaveLength(first.dataset.cases.length);
  });

  it('understøtter bygningsfejl uden installation og installation med flere områder', () => {
    const building = submitReport(createDemoDataset(), reportInput());
    const installation = submitReport(building.dataset, reportInput({ submissionKey: 'stable-submit-2', locationId: 'location-nordparken-tech', installationId: 'installation-vent-03', affectedAreaIds: ['location-nordparken-ground', 'location-nordparken-first'] }));
    expect(building.report.installationId).toBeNull();
    expect(installation.report.affectedAreaIds).toHaveLength(2);
  });

  it('bevarer fælles sag og separate opgave- og bestillingsidentiteter', () => {
    const createdCase = createManualCase(createDemoDataset(), { propertyId: 'property-nordparken-14', title: 'Manuel sag' });
    const internal = createTask(createdCase.dataset, { caseId: createdCase.entity.id, title: 'Intern kontrol', assignmentType: 'internal', resourceId: 'resource-dennis', attachmentVersionIds: [] });
    const external = createTask(internal.dataset, { caseId: createdCase.entity.id, title: 'Ekstern reparation', assignmentType: 'external', supplierId: 'supplier-nordklima', attachmentVersionIds: [] });
    expect(external.dataset.tasks.filter((item) => item.caseId === createdCase.entity.id)).toHaveLength(2);
    expect(external.entity.taskNumber).toMatch(/^OPG-/);
    expect(external.entity.orderNumber).toMatch(/^BST-/);
  });

  it('finder kun kalenderoverlap for den konkrete ressource', () => {
    const dataset = createDemoDataset();
    const first = createBooking(dataset, { taskId: 'task-00042', resourceId: 'resource-dennis', startAt: '2026-09-10T08:00:00Z', endAt: '2026-09-10T10:00:00Z' });
    const conflict = createBooking(first.dataset, { taskId: 'task-filter', resourceId: 'resource-dennis', startAt: '2026-09-10T09:00:00Z', endAt: '2026-09-10T11:00:00Z' });
    const other = createBooking(conflict.dataset, { taskId: 'task-docs', resourceId: 'resource-anna', startAt: '2026-09-10T09:00:00Z', endAt: '2026-09-10T11:00:00Z' });
    expect(conflict.conflicts).toHaveLength(1);
    expect(other.conflicts).toHaveLength(0);
  });

  it('afslutter arbejde uden automatisk at lukke sagen og bevarer begrænsninger', () => {
    const dataset = createDemoDataset(); const caseRecord = dataset.cases.find((item) => item.id === 'case-ventilation-noise'); const task = dataset.tasks.find((item) => item.id === 'task-00042');
    const restricted = addRestriction(dataset, caseRecord.id, caseRecord.revision, { targetType: 'location', targetId: 'location-nordparken-tech', scope: 'Teknikrum', reason: 'Adgang begrænset', source: 'Driftsleder' });
    const freshTask = restricted.dataset.tasks.find((item) => item.id === task.id);
    const completed = appendWork(restricted.dataset, task.id, freshTask.revision, 'complete', { solution: 'Rem udskiftet', restrictionDecision: 'none' });
    expect(completed.entity.status).toBe('completed');
    expect(completed.dataset.cases.find((item) => item.id === caseRecord.id).status).not.toBe('closed');
    expect(completed.dataset.restrictions.find((item) => item.id === restricted.entity.id).status).toBe('active');
  });

  it('blokerer normal lukning, kræver begrundelse uden faktura og historikfører genåbning', () => {
    const dataset = createDemoDataset(); const record = dataset.cases.find((item) => item.id === 'case-ventilation-noise'); dataset.tasks.find((item) => item.id === 'task-00042').status = 'completed';
    expect(() => closeCase(dataset, record.id, record.revision, { mode: 'normal', confirmed: true })).toThrow(/Fakturacenter/);
    expect(() => closeCase(dataset, record.id, record.revision, { mode: 'withoutInvoice', confirmed: true, reason: '' })).toThrow(/begrundelse/);
    const closed = closeCase(dataset, record.id, record.revision, { mode: 'withoutInvoice', confirmed: true, reason: 'Garantiarbejde uden faktura' });
    const reopened = reopenCase(closed.dataset, record.id, closed.entity.revision, 'Fejlen kom igen');
    expect(reopened.entity.status).toBe('triage');
    expect(reopened.dataset.history.at(-1).action).toBe('Sag genåbnet');
  });

  it('tillader normal lukning med et isoleret fakturaafklaringsgrundlag', () => {
    const dataset = createDemoDataset(); const record = dataset.cases.find((item) => item.id === 'case-ventilation-noise');
    dataset.tasks.filter((item) => item.caseId === record.id).forEach((item) => { item.status = 'completed'; });
    record.invoiceResolution = { status: 'resolved', source: 'Isoleret testadapter', timestamp: '2026-09-08T12:00:00Z' };
    const closed = closeCase(dataset, record.id, record.revision, { mode: 'normal', confirmed: true });
    expect(closed.entity.status).toBe('closed');
    expect(closed.entity.closureReason).toMatch(/fakturaafklaring/i);
  });
});

describe('servicekalender', () => {
  it('bruger sidste gyldige månedsdag og bevarer skudårsanker', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(calculateNextServiceDue({ intervalType: 'annual', annualMonth: 2, annualDay: 29, nextDueDate: '2024-02-29' }, { date: '2024-02-29' }).nextDueDate).toBe('2025-02-28');
    expect(calculateNextServiceDue({ intervalType: 'annual', annualMonth: 2, annualDay: 29, nextDueDate: '2025-02-28' }, { date: '2025-02-28' }).nextDueDate).toBe('2026-02-28');
  });

  it('genbruger åben serviceforekomst ved gentagen catch-up', () => {
    const dataset = createDemoDataset(); dataset.serviceOccurrences = [];
    const first = runServiceCatchUp(dataset, '2026-09-08');
    const second = runServiceCatchUp(first.dataset, '2026-09-08');
    expect(first.created).toHaveLength(1);
    expect(second.created).toHaveLength(0);
    expect(second.dataset.reports.filter((item) => item.source === 'service')).toHaveLength(1);
  });
});
