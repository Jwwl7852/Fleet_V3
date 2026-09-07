import { createFixtureDataset, DEMO_TENANT_ID } from "./fleetFixtures";

const DATABASE_NAME = "veyro-fleet-v2-prototype";
const DATABASE_VERSION = 1;
const STORE_NAME = "tenant-datasets";

const clone = (value) => structuredClone(value);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "tenantId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const transaction = async (mode, operation) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB-transaktionen blev afbrudt."));
    });
  } finally {
    database.close();
  }
};

export function createIndexedDbUnitRepository({ tenantId = DEMO_TENANT_ID } = {}) {
  return {
    kind: "indexeddb-prototype",
    tenantId,
    async load() {
      const stored = await transaction("readonly", (store) => new Promise((resolve, reject) => {
        const request = store.get(tenantId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      }));
      if (stored) return clone(stored);
      const initial = createFixtureDataset();
      await transaction("readwrite", (store) => store.put(clone(initial)));
      return clone(initial);
    },
    async saveUnit(unit) {
      const dataset = await this.load();
      const index = dataset.units.findIndex((item) => item.id === unit.id);
      if (index >= 0) dataset.units[index] = clone(unit);
      else dataset.units.push(clone(unit));
      await transaction("readwrite", (store) => store.put(dataset));
      return clone(unit);
    },
  };
}

export function createMemoryUnitRepository(dataset = createFixtureDataset()) {
  let state = clone(dataset);
  return {
    kind: "memory-test",
    tenantId: state.tenantId,
    async load() { return clone(state); },
    async saveUnit(unit) {
      const index = state.units.findIndex((item) => item.id === unit.id);
      if (index >= 0) state.units[index] = clone(unit);
      else state.units.push(clone(unit));
      return clone(unit);
    },
    inspect() { return clone(state); },
  };
}

let singleton;
export const defaultUnitRepository = () => {
  if (!singleton) singleton = createIndexedDbUnitRepository();
  return singleton;
};
