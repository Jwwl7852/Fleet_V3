import test from "node:test";
import assert from "node:assert/strict";
import { filterServiceRows, pruneSelectedUnits, sortServiceRows } from "../src/fleet/service-filtering.js";

const rows = [
  { id: "missing", categoryId: "inspection", unitId: "u3", departmentId: "north", dueDate: null, label: "Uden dato" },
  { id: "future", categoryId: "maintenance", unitId: "u2", departmentId: "south", dueDate: "2026-10-01", label: "Kommende" },
  { id: "overdue", categoryId: "maintenance", unitId: "u1", departmentId: "north", dueDate: "2026-09-01", label: "Overskredet" },
];

test("servicefiltre bruger ELLER inden for et filter og OG mellem filtre", () => {
  const filtered = filterServiceRows(rows, {
    categories: ["maintenance", "inspection"],
    units: ["u1", "u3"],
    departments: ["north"],
  });
  assert.deepEqual(filtered.map((row) => row.id), ["missing", "overdue"]);
});

test("servicekrav sorteres efter dato med manglende dato sidst", () => {
  assert.deepEqual(sortServiceRows(rows).map((row) => row.id), ["overdue", "future", "missing"]);
});

test("afdelingsskift fjerner enheder som ikke længere er tilgængelige", () => {
  assert.deepEqual(pruneSelectedUnits(["u1", "u2"], [{ value: "u2" }, { value: "u3" }]), {
    kept: ["u2"],
    removed: ["u1"],
  });
});
