import { describe, expect, it } from 'vitest';
import { createDemoDataset } from '../src/data/fixtures';
import { archiveInstallation, archiveLocationNode, archiveProperty, createInstallation, createLocationNode, createProperty, DomainValidationError, getLocationPath, parseDanishArea, restoreLocationNode, RevisionConflictError, updateInstallation, updateLocationNode, updateProperty } from '../src/domain/facilityDomain';
import { createMemoryFacilityRepository } from '../src/data/facilityRepositoryV2';

const propertyInput = (overrides = {}) => ({ number: 'EJ-090', name: 'Testejendom', type: 'Kontor', address: '', postalCode: '', city: '', country: 'Danmark', administrativeStatus: 'active', registeredArea: '1.250,5', constructionYear: '', energyLabel: '', managerName: '', managerEmail: '', managerPhone: '', description: '', notes: '', ...overrides });
const installationInput = (overrides = {}) => ({ number: 'TEST-01', name: 'Testinstallation', type: 'Ventilation', propertyId: 'property-nordparken-14', physicalLocationId: 'location-nordparken-tech', servedAreaIds: ['location-nordparken-first'], manufacturer: '', model: '', serialNumber: '', acquisitionDate: '', commissioningDate: '', description: '', technicalNotes: '', supplierName: '', supplierContactName: '', supplierEmail: '', supplierPhone: '', functionStatus: 'notAssessed', functionNote: '', functionReason: '', ...overrides });

describe('FACILITY-domæneregler', () => {
  it('fortolker dansk decimalkomma og bevarer tomt areal', () => {
    expect(parseDanishArea('1.250,5')).toBe(1250.5);
    expect(parseDanishArea('')).toBeNull();
    expect(() => parseDanishArea('12,3,4')).toThrow(DomainValidationError);
  });

  it('kræver entydigt ejendomsnummer også mod arkiverede poster', () => {
    const dataset = createDemoDataset();
    dataset.properties[0].archivedAt = '2026-01-01T00:00:00Z';
    expect(() => createProperty(dataset, propertyInput({ number: 'EJ-014' }))).toThrow(DomainValidationError);
  });

  it('understøtter udeladte mellemtrin og afviser ugyldige forældre', () => {
    let dataset = createDemoDataset();
    const room = createLocationNode(dataset, { propertyId: 'property-nordparken-14', parentId: 'location-nordparken-building-a', type: 'room', name: 'Direkte rum', number: '', description: '' }, { createId: () => 'room' });
    dataset = room.dataset;
    expect(room.entity.parentId).toBe('location-nordparken-building-a');
    const outdoor = createLocationNode(dataset, { propertyId: 'property-nordparken-14', parentId: null, type: 'outdoorArea', name: 'Parkering', number: '', description: '' }, { createId: () => 'outdoor' });
    expect(outdoor.entity.parentId).toBeNull();
    expect(() => createLocationNode(dataset, { propertyId: 'property-nordparken-14', parentId: room.entity.id, type: 'building', name: 'Ugyldig', number: '', description: '' })).toThrow(DomainValidationError);
  });

  it('afviser selvreference, efterkommer, manglende og fremmed forælder', () => {
    const dataset = createDemoDataset(); const node = dataset.locationNodes.find((item) => item.id === 'location-nordparken-building-a');
    expect(() => updateLocationNode(dataset, node.id, node.revision, { ...node, parentId: node.id })).toThrow(DomainValidationError);
    expect(() => updateLocationNode(dataset, node.id, node.revision, { ...node, parentId: 'location-nordparken-tech' })).toThrow(DomainValidationError);
    expect(() => updateLocationNode(dataset, node.id, node.revision, { ...node, parentId: 'missing' })).toThrow(DomainValidationError);
    expect(() => updateLocationNode(dataset, node.id, node.revision, { ...node, parentId: 'location-harbour-building' })).toThrow(DomainValidationError);
  });

  it('flytter med samme ID og uden at ændre betjente områder', () => {
    const dataset = createDemoDataset(); const installation = dataset.installations[0]; const beforeServed = [...installation.servedAreaIds];
    const moved = updateInstallation(dataset, installation.id, installation.revision, installationInput({ number: installation.number, name: installation.name, physicalLocationId: 'location-nordparken-roof', servedAreaIds: beforeServed, functionStatus: installation.functionStatus, functionNote: installation.functionNote }));
    expect(moved.entity.id).toBe(installation.id);
    expect(moved.entity.physicalLocationId).toBe('location-nordparken-roof');
    expect(moved.entity.servedAreaIds).toEqual(beforeServed);
    expect(moved.dataset.history.at(-1).changes.some((item) => item.field === 'physicalLocation')).toBe(true);
  });

  it('kræver begrundelse for ændret funktionsvurdering', () => {
    const dataset = createDemoDataset(); const installation = dataset.installations[0];
    expect(() => updateInstallation(dataset, installation.id, installation.revision, installationInput({ number: installation.number, name: installation.name, functionStatus: 'out' }))).toThrow(DomainValidationError);
  });

  it('håndhæver arkiveringsblokeringer og gendannelsesrækkefølge', () => {
    const dataset = createDemoDataset(); const property = dataset.properties[0];
    expect(() => archiveProperty(dataset, property.id, property.revision, 'Test')).toThrow(DomainValidationError);
    const node = dataset.locationNodes.find((item) => item.id === 'location-nordparken-building-a');
    expect(() => archiveLocationNode(dataset, node.id, node.revision, 'Test')).toThrow(DomainValidationError);
    const installation = dataset.installations[0];
    expect(() => archiveInstallation(dataset, installation.id, installation.revision, 'Test')).toThrow(DomainValidationError);
    const archivedDataset = structuredClone(dataset); const child = archivedDataset.locationNodes.find((item) => item.id === 'location-nordparken-tech'); child.archivedAt = '2026-09-08T00:00:00Z'; child.revision += 1; archivedDataset.locationNodes.find((item) => item.id === child.parentId).archivedAt = '2026-09-08T00:00:00Z';
    expect(() => restoreLocationNode(archivedDataset, child.id, child.revision)).toThrow(DomainValidationError);
  });

  it('bevarer historiske snapshots ved senere omdøbning', () => {
    let dataset = createDemoDataset(); const node = dataset.locationNodes.find((item) => item.id === 'location-nordparken-tech');
    let result = updateLocationNode(dataset, node.id, node.revision, { ...node, name: 'Teknikrum nyt' }); dataset = result.dataset;
    const firstSnapshot = dataset.history.at(-1).snapshot.path;
    result = updateLocationNode(dataset, node.id, result.entity.revision, { ...result.entity, name: 'Teknikrum senest' });
    expect(result.dataset.history.at(-2).snapshot.path).toBe(firstSnapshot);
    expect(firstSnapshot).toContain('Teknikrum nyt');
    expect(getLocationPath(result.dataset, node.propertyId, node.id)).toContain('Teknikrum senest');
  });

  it('viser revisionskonflikt i stedet for tavst datatab', async () => {
    const repository = createMemoryFacilityRepository(); const property = repository.peek().properties[0];
    await repository.updateProperty(property.id, property.revision, propertyInput({ number: property.number, name: 'Første ændring' }));
    await expect(repository.updateProperty(property.id, property.revision, propertyInput({ number: property.number, name: 'Anden ændring' }))).rejects.toBeInstanceOf(RevisionConflictError);
    expect(repository.peek().properties[0].name).toBe('Første ændring');
  });

  it('tillader samme installationsnummer på en anden ejendom men ikke samme', () => {
    let dataset = createDemoDataset();
    expect(() => createInstallation(dataset, installationInput({ number: 'VENT-03' }))).toThrow(DomainValidationError);
    const created = createInstallation(dataset, installationInput({ number: 'VENT-03', propertyId: 'property-havnepladsen-1', physicalLocationId: 'location-harbour-tech', servedAreaIds: [] }));
    expect(created.entity.propertyId).toBe('property-havnepladsen-1');
  });

  it('bevarer stabile IDer ved ejendomsredigering', () => {
    const dataset = createDemoDataset(); const property = dataset.properties[0]; const result = updateProperty(dataset, property.id, property.revision, propertyInput({ number: property.number, name: 'Omdøbt' }));
    expect(result.entity.id).toBe(property.id);
    expect(result.dataset.cases[0].propertyId).toBe(property.id);
  });
});
