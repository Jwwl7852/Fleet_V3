import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("src/fleet/AppShell.jsx", "utf8");

test("sidebaren viser identitet og log ud uden bruger- eller rollevælger", () => {
  assert.match(shell, /className="fc-who-n"/);
  assert.match(shell, />Log ud<\/button>/);
  assert.doesNotMatch(shell, /<Brugervaelger|fc-demo-rolle|fc-devbruger|fc-rolle/);
  assert.doesNotMatch(shell, /Log ind som|Se platformen som/);
  assert.doesNotMatch(shell, /className="fc-who-r"/);
});
