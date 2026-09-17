import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

describe("direkte modulruter", () => {
  it("lukker WAREHOUSE og UNITBOOKING før deres skærme indlæses", () => {
    assert.match(app, /function ModulRute\(\{ moduler, modul, label \}\)/);
    assert.match(app, /Array\.isArray\(modul\)/);
    assert.match(app, /kraevedeModuler\.some\(\(navn\) => harModul\(moduler, navn\)\)/);
    assert.match(app, /if \(!harEtModul\)/);
    assert.match(app, /modul="warehouse" label="WAREHOUSE"/);
    assert.match(app, /modul="unitbooking" label="UNITBOOKING"/);
    assert.match(app, /Et direkte link indlæser ikke modulets data/);
  });
});
