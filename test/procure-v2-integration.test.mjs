import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../src/fleet/fleet.css", import.meta.url), "utf8");

describe("PROCURE i den fælles AppShell", () => {
  it("holder mobilsidebarens padding inden for viewporten", () => {
    assert.match(css, /\.fc-side\{[^}]*box-sizing:border-box/s);
  });

  it("lader mobilens modulgrupper dele den samme vandrette scrollrække", () => {
    const mobile = css.match(/@media \(max-width:900px\)\{([\s\S]*?)\n\}/g)?.at(-1) || "";
    assert.match(mobile, /\.fc-nav-gruppe-blok\{display:contents\}/);
  });
});
