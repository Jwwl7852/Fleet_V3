import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PROJECT_ID, TEST_EMAIL, TEST_PASSWORD,
} from "../scripts/seed-v1-colleague-emulator.mjs";

test("kollegatest er låst til et syntetisk projekt og en .invalid-konto", () => {
  assert.equal(PROJECT_ID, "demo-veyro-integration");
  assert.match(TEST_EMAIL, /@example\.invalid$/);
  assert.ok(TEST_PASSWORD.length >= 12);
});

test("kollegatest har dokumenterede kommandoer og en hemmelighedsfri eksempelprofil", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const guide = readFileSync(new URL("../COLLEGA_TEST_V1.md", import.meta.url), "utf8");
  const example = readFileSync(new URL("../.env.v1-colleague.example", import.meta.url), "utf8");
  assert.match(pkg.scripts["v1:colleague:emulators"], /demo-veyro-integration/);
  assert.match(pkg.scripts["v1:colleague:seed"], /seed-v1-colleague-emulator/);
  assert.match(pkg.scripts["v1:colleague:dev"], /--mode v1-colleague/);
  assert.match(guide, /codex\/veyro-integration-v1/);
  assert.match(example, /VITE_FIREBASE_EMULATORS=true/);
  assert.doesNotMatch(example, /fleetcontrol-98e11|fleetcontrol-dev-1ac1c/);
});
