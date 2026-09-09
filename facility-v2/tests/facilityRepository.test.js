import { describe, expect, it } from 'vitest';
import { createDemoDataset } from '../src/data/fixtures';
import { IDBFactory } from 'fake-indexeddb';
import { createFacilityRepository, createMemoryFacilityRepository, FACILITY_DATABASE_NAME, migrateDataset } from '../src/data/facilityRepositoryV2';

describe('FACILITY repository isolation', () => {
  it('bruger sit eget databasenavn', () => {
    expect(FACILITY_DATABASE_NAME).toBe('veyro-facility-v2');
    expect(FACILITY_DATABASE_NAME).not.toContain('fleet');
  });

  it('migrerer uden at nulstille eksisterende brugerdata', () => {
    const existing = createDemoDataset();
    existing.version = 0;
    existing.customerName = 'Bevaret navn';
    existing.properties.push({ id: 'property-user-created', name: 'Bevares' });
    const migrated = migrateDataset(existing);
    expect(migrated.version).toBe(8);
    expect(migrated.customerName).toBe('Bevaret navn');
    expect(migrated.properties.some((item) => item.id === 'property-user-created')).toBe(true);
  });

  it('migrerer en isoleret etape 1-database og bevarer IDer og relationer', async () => {
    const previous = globalThis.indexedDB;
    globalThis.indexedDB = new IDBFactory();
    const stageOne = createDemoDataset();
    stageOne.version = 1;
    delete stageOne.locationNodes;
    delete stageOne.media;
    delete stageOne.history;
    stageOne.properties[0].name = 'Brugerens bevarede navn';
    const databaseName = `veyro-facility-v2-test-${crypto.randomUUID()}`;
    const repository = createFacilityRepository({ databaseName });
    await repository.save(stageOne);
    const migrated = await repository.load();
    expect(migrated.version).toBe(8);
    expect(migrated.properties[0].id).toBe('property-nordparken-14');
    expect(migrated.properties[0].name).toBe('Brugerens bevarede navn');
    expect(migrated.cases[0].propertyId).toBe('property-nordparken-14');
    expect(migrated.locationNodes.length).toBeGreaterThan(0);
    expect(migrated.history).toEqual([]);
    repository.close();
    globalThis.indexedDB = previous;
  });

  it('serialiserer samtidige indsendelser med samme vedvarende nøgle', async () => {
    const repository = createMemoryFacilityRepository(createDemoDataset());
    const input = { submissionKey: 'same-tab-or-retry-key', source: 'desktop', propertyId: 'property-nordparken-14', locationId: 'location-nordparken-building-a', installationId: '', title: 'Samtidig indberetning', description: 'Må kun give én sag.', category: 'Bygning', reporterSeverity: 'normal', observedAt: '2026-09-08T12:00:00Z', affectedAreaIds: [], attachmentVersionIds: [] };
    const [first, second] = await Promise.all([repository.submitReport(input), repository.submitReport(input)]);
    expect([first.duplicate, second.duplicate].sort()).toEqual([false, true]);
    expect(repository.peek().reports.filter((item) => item.submissionKey === input.submissionKey)).toHaveLength(1);
  });

  it('registrerer etape-2-medier som dokumentversioner uden at kopiere Blob-ID', () => {
    const dataset = createDemoDataset();
    dataset.documents = [];
    dataset.media = [{ id: 'media-stage2', fileName: 'profil.webp', mimeType: 'image/webp', size: 1200, createdAt: '2026-09-08T12:00:00Z' }];
    dataset.properties[0].imageIds = ['media-stage2'];
    const migrated = migrateDataset(dataset);
    const document = migrated.documents.find((item) => item.versions.some((version) => version.blobId === 'media-stage2'));
    expect(document.relations).toContainEqual({ type: 'property', id: dataset.properties[0].id });
    expect(document.versions[0].blobId).toBe('media-stage2');
  });
});
