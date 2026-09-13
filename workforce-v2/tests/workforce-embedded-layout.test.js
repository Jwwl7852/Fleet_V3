import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/WorkforceV2App.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/workforce-v2.css", import.meta.url), "utf8");

test("embedded WORKFORCE markerer modulroden eksplicit", () => {
  assert.match(app, /wf-app--embedded/);
});

test("embedded WORKFORCE fjerner standalone-sidebarens gridkolonne", () => {
  assert.match(css, /\.wf-app--embedded \.wf-workspace\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.wf-app--embedded \.wf-main\{[^}]*grid-column:1\/-1/);
  assert.match(css, /\.wf-app--embedded\{[^}]*width:100%/);
  assert.doesNotMatch(css, /\.wf-app--embedded[^}]*overflow\s*:\s*hidden/);
});
