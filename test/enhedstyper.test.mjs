import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fleetTypeForTechnicalType,
  resolveUnitType,
  selectableUnitTypes,
  unitTypeKey,
} from "../fleet-v2/src/data/unitTypeRegistry.js";

const types = [
  { id: "servicebil", navn: "Servicebil", tekniskArt: "varevogn", aktiv: true, sortering: 10 },
  { id: "gammel", navn: "Historisk type", tekniskArt: "trailer", aktiv: false, sortering: 20 },
];

describe("kundens Enhedstyper", () => {
  it("bruger stabile ID'er, mens et omdøbt navn slår igennem ved opslag", () => {
    const unit = { id: "u1", categoryId: "servicebil", art: "varevogn", type: "vehicle" };
    assert.equal(resolveUnitType(unit, types).name, "Servicebil");
    const renamed = types.map((type) => type.id === "servicebil" ? { ...type, navn: "Teknikbil" } : type);
    assert.equal(resolveUnitType(unit, renamed).name, "Teknikbil");
    assert.equal(unit.categoryId, "servicebil");
  });

  it("viser en eksisterende inaktiv type, men tilbyder den ikke ved ny tildeling", () => {
    assert.deepEqual(selectableUnitTypes(types, "").map((type) => type.id), ["servicebil"]);
    assert.deepEqual(selectableUnitTypes(types, "gammel").map((type) => type.id), ["servicebil", "gammel"]);
  });

  it("udpeger manglende og modstridende legacy-værdier uden at gætte", () => {
    assert.match(resolveUnitType({ art: "lastbil" }, types).conflict, /ingen Enhedstype/);
    assert.match(resolveUnitType({ kategoriId: "slettet", art: "lastbil" }, types).conflict, /findes ikke/);
    assert.match(resolveUnitType({ kategoriId: "servicebil", art: "lastbil" }, types).conflict, /mens enheden er gemt som lastbil/);
  });

  it("holder den tekniske klassifikation bag den valgte type", () => {
    assert.equal(fleetTypeForTechnicalType("varevogn"), "vehicle");
    assert.equal(fleetTypeForTechnicalType("truck"), "machine");
    assert.equal(fleetTypeForTechnicalType("trailer"), "equipment");
  });

  it("bruger kategori-ID som tværgående filternøgle", () => {
    assert.equal(unitTypeKey({ categoryId: "servicebil", type: "vehicle" }), "servicebil");
    assert.equal(unitTypeKey({ type: "vehicle" }), "legacy:vehicle");
  });
});
