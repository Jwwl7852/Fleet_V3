import assert from "node:assert/strict";
import test from "node:test";

import {
  workQueueUnitLabel,
  workQueueUnits,
} from "../fleet-v2/src/data/workQueuePresentation.js";

test("Arbejdskøen bevarer lokale sagsrelationer og lader Ressourcer-data vinde", () => {
  const local = [
    { id: "unit-local", number: "NB-001", make: "Ford", model: "Transit" },
    { id: "unit-shared", number: "GAMMEL", make: "Lokal", model: "Kopi" },
  ];
  const shared = [
    { id: "unit-shared", number: "EJ-008", make: "Autoritativ", model: "Enhed" },
  ];

  assert.deepEqual(workQueueUnits(local, shared), [local[0], shared[0]]);
});

test("enhedslinjen viser nummer og mærke/model fra den fundne stamdatapost", () => {
  assert.equal(
    workQueueUnitLabel(
      { unitId: "unit-nb-001" },
      { id: "unit-nb-001", number: "NB-001", make: "Ford", model: "Transit" },
    ),
    "NB-001 · Ford Transit",
  );
});

test("enhedslinjen navngiver præcist en manglende relation eller stamdatapost", () => {
  assert.equal(
    workQueueUnitLabel({ unitId: "unit-ukendt" }, null),
    "Enhed unit-ukendt · stamdata ikke fundet",
  );
  assert.equal(workQueueUnitLabel({}, null), "Enhedsrelation mangler");
});
