import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { datasetForLocalPersistence, mergeSharedWorkshops, selectableWorkshops, supplierToWorkshop } from "../src/data/supplierWorkshopAdapter";

describe("fælles leverandørregister i FLEET", () => {
  it("mapper kun værkstedsleverandører og bevarer kontaktdata", () => {
    expect(supplierToWorkshop({
      id: "lv-1", navn: "Nord Service", kategori: "vaerksted", aktiv: true,
      kontaktEmail: "service@example.test", kontaktTelefon: "12 34 56 78",
    })).toMatchObject({
      id: "lv-1", name: "Nord Service", kind: "external", selectable: true,
      email: "service@example.test", phone: "12 34 56 78", source: "shared-supplier-register",
    });
    expect(supplierToWorkshop({ id: "lv-2", navn: "Kontor", kategori: "kontor" })).toBeNull();
  });

  it("bevarer interne værksteder og historiske referencer uden at gøre dem valgbare", () => {
    const dataset = createFixtureDataset();
    dataset.relations.workshopTasks.push({ id: "task-history", workshopId: "workshop-external-volvo" });
    const merged = mergeSharedWorkshops(dataset, [
      { id: "lv-active", navn: "Aktivt værksted", kategori: "vaerksted", aktiv: true },
      { id: "lv-closed", navn: "Lukket værksted", kategori: "vaerksted", aktiv: false },
    ]);
    const internal = merged.relations.workshops.filter((item) => item.kind === "internal");
    const historical = merged.relations.workshops.find((item) => item.id === "workshop-external-volvo");
    expect(internal).toHaveLength(2);
    expect(historical).toMatchObject({ selectable: false, source: "legacy-fleet-reference" });
    expect(selectableWorkshops(merged.relations.workshops).map((item) => item.id)).toEqual([
      "workshop-internal-east", "workshop-internal-west", "lv-active",
    ]);
    expect(selectableWorkshops(merged.relations.workshops, "lv-closed").map((item) => item.id)).toContain("lv-closed");
  });

  it("ændrer ikke datasættet før den fælles liste er afgjort", () => {
    const dataset = createFixtureDataset();
    expect(mergeSharedWorkshops(dataset, undefined)).toBe(dataset);
  });

  it("kopierer ikke fælles leverandørstamdata ind i FLEETs lokale lager", () => {
    const local = createFixtureDataset();
    const runtime = mergeSharedWorkshops(local, [
      { id: "lv-shared", navn: "Fælles værksted", kategori: "vaerksted", aktiv: true },
    ]);
    const persisted = datasetForLocalPersistence(runtime, local);
    expect(runtime.relations.workshops.some((item) => item.id === "lv-shared")).toBe(true);
    expect(persisted.relations.workshops.some((item) => item.id === "lv-shared")).toBe(false);
  });
});
