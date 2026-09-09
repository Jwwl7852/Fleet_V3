import { createDemoDataset, DATASET_VERSION, DEMO_TENANT_ID } from './fixtures';

export const FACILITY_DATABASE_NAME = 'veyro-facility-v2';
export const FACILITY_DATABASE_VERSION = 1;
export const FACILITY_DATASET_STORE = 'tenant-datasets';

export function migrateDataset(input) {
  if (!input) return createDemoDataset();
  const version = Number(input.version ?? 0);
  if (version > DATASET_VERSION) {
    throw new Error(`Datasættets version ${version} er nyere end appens version ${DATASET_VERSION}.`);
  }
  return {
    ...createDemoDataset(),
    ...input,
    version: DATASET_VERSION,
  };
}

function openDatabase(databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, FACILITY_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FACILITY_DATASET_STORE)) {
        database.createObjectStore(FACILITY_DATASET_STORE, { keyPath: 'tenantId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createFacilityRepository({ databaseName = FACILITY_DATABASE_NAME } = {}) {
  async function transaction(mode, operation) {
    const database = await openDatabase(databaseName);
    try {
      const tx = database.transaction(FACILITY_DATASET_STORE, mode);
      const store = tx.objectStore(FACILITY_DATASET_STORE);
      const value = await operation(store);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return value;
    } finally {
      database.close();
    }
  }

  return {
    databaseName,
    async load(tenantId = DEMO_TENANT_ID) {
      const existing = await transaction('readonly', (store) => requestAsPromise(store.get(tenantId)));
      if (existing) {
        const migrated = migrateDataset(existing);
        if (migrated.version !== existing.version) await this.save(migrated);
        return migrated;
      }
      const seeded = createDemoDataset();
      await this.save(seeded);
      return seeded;
    },
    async save(dataset) {
      const migrated = migrateDataset(dataset);
      await transaction('readwrite', (store) => requestAsPromise(store.put(migrated)));
      return migrated;
    },
  };
}

export function createMemoryFacilityRepository(initialDataset = createDemoDataset()) {
  let stored = structuredClone(initialDataset);
  return {
    databaseName: 'memory-facility-test',
    async load() { return structuredClone(stored); },
    async save(dataset) {
      stored = migrateDataset(structuredClone(dataset));
      return structuredClone(stored);
    },
    peek() { return structuredClone(stored); },
  };
}
