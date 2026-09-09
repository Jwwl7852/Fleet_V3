import { describe, expect, it } from 'vitest';
import { createDemoDataset } from '../src/data/fixtures';
import { economyEntries, summarizeEconomy } from '../src/data/economySelectors';
import { addDocumentVersionRecord, createDocumentRecord, createTask } from '../src/domain/workflowDomain';

describe('dokumentversioner', () => {
  it('bevarer historiske opgavebilag på den valgte version', () => {
    const v1 = { id: 'version-1', number: 1, fileName: 'manual.pdf', mimeType: 'application/pdf', size: 100, blobId: 'blob-1', createdAt: '2026-09-01T10:00:00Z' };
    const document = createDocumentRecord(createDemoDataset(), { title: 'Manual', category: 'Manual', relations: [{ type: 'installation', id: 'installation-vent-03' }] }, v1);
    const task = createTask(document.dataset, { caseId: 'case-ventilation-noise', title: 'Ekstern opgave', assignmentType: 'external', supplierId: 'supplier-nordklima', attachmentVersionIds: [v1.id] });
    const current = task.dataset.documents[0];
    const versioned = addDocumentVersionRecord(task.dataset, current.id, current.revision, { id: 'version-2', number: 2, fileName: 'manual-ny.pdf', mimeType: 'application/pdf', size: 120, blobId: 'blob-2', createdAt: '2026-09-02T10:00:00Z' });
    expect(versioned.dataset.tasks.find((item) => item.id === task.entity.id).attachmentVersionIds).toEqual(['version-1']);
    expect(versioned.entity.currentVersionId).toBe('version-2');
  });
});

describe('økonomi', () => {
  it('opretter én økonomipost pr. kilde og summerer ikke relationer dobbelt', () => {
    const dataset = createDemoDataset(); const task = dataset.tasks.find((item) => item.id === 'task-00042');
    task.timeEntries.push({ id: 'time-one', date: '2026-09-08', resourceId: 'resource-dennis', hours: 2, hourlyCost: 400 });
    task.materials.push({ id: 'material-one', name: 'Filter', quantity: 2, unit: 'stk.', unitPrice: 300, total: 600 });
    const entries = economyEntries(dataset); const summary = summarizeEconomy(entries);
    expect(entries.filter((item) => item.sourceId === 'time-one')).toHaveLength(1);
    expect(entries.filter((item) => item.sourceId === 'material-one')).toHaveLength(1);
    expect(summary.registered).toBe(186500 + 800 + 600);
    expect(summary.estimate).toBe(32000 + 4800 + 1200 + 800);
  });

  it('viser timer uden kostsats som kendte timer med ukendt omkostning', () => {
    const dataset = createDemoDataset(); dataset.tasks[0].timeEntries.push({ id: 'time-unknown', date: '2026-09-08', resourceId: 'resource-anna', hours: 3.5, hourlyCost: null });
    const summary = summarizeEconomy(economyEntries(dataset));
    expect(summary.unknownCostHours).toBe(3.5);
  });
});
