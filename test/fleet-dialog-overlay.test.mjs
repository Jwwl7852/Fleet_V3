import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dialogSource = await readFile(new URL("../fleet-v2/src/components/DraggableDialog.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../fleet-v2/src/styles/fleet-v2.css", import.meta.url), "utf8");

test("Fleet-dialogen dækker hele viewporten uden gammel sideforskydning", () => {
  assert.match(styles, /\.fleet-dialog-backdrop\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.doesNotMatch(styles, /--fleet-dialog-left/);
  assert.doesNotMatch(dialogSource, /shellOffset|fc-menu-kompakt|--fleet-dialog-left/);
});

test("Fleet-dialogen låser og gendanner baggrundens rulning", () => {
  assert.match(dialogSource, /document\.body\.style\.overflow\s*=\s*"hidden"/);
  assert.match(dialogSource, /document\.body\.style\.overscrollBehavior\s*=\s*"none"/);
  assert.match(dialogSource, /document\.body\.style\.overflow\s*=\s*previousOverflow/);
  assert.match(dialogSource, /document\.body\.style\.overscrollBehavior\s*=\s*previousOverscrollBehavior/);
});
