import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const files = readdirSync(resolve(root, "src/fleet/planning-scheduling")).filter((name) => name.endsWith(".js"));

describe("Planning-scheduling arkitektur", () => {
  it("er React-, browser-, Firebase-, netværks- og persistencefri", () => {
    for (const name of files) {
      const source = readFileSync(resolve(root, "src/fleet/planning-scheduling", name), "utf8");
      assert.doesNotMatch(source, /\breact\b|\bwindow\.|\bdocument\.|BroadcastChannel|localStorage|indexedDB|firebase|fetch\s*\(|XMLHttpRequest|WebSocket/i, name);
      assert.doesNotMatch(source, /Date\.now|Math\.random/, name);
    }
  });
  it("importerer aldrig UI eller optimeringsmotoren", () => {
    for (const name of files) assert.doesNotMatch(readFileSync(resolve(root, "src/fleet/planning-scheduling", name), "utf8"), /planning-ui|planning-optimization/, name);
  });
});
