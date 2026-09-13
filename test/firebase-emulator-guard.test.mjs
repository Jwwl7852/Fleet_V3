import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FIREBASE = readFileSync("src/firebase.js", "utf8");
const FIREBASE_CONFIG = JSON.parse(readFileSync("firebase.json", "utf8"));

test("lokale Firebase-emulatorer er fail-closed og kan ikke pege på produktion", () => {
  assert.match(FIREBASE, /import\.meta\.env\.DEV/);
  assert.match(FIREBASE, /VITE_FIREBASE_EMULATOR_PREVIEW/);
  assert.match(FIREBASE, /import\.meta\.env\.DEV \|\| emulatorPreviewAnmodet/);
  assert.match(FIREBASE, /\^demo-/);
  assert.match(FIREBASE, /localhost\|127\\\.0\\\.0\\\.1\|\\\[::1\\\]/);
  assert.match(FIREBASE, /emulatorerAnmodet && !brugerLokaleEmulatorer/);
  assert.match(FIREBASE, /VITE_FIREBASE_DATABASE_PORT \|\| 9000/);
  assert.match(FIREBASE, /VITE_FIREBASE_AUTH_PORT \|\| 9099/);
  assert.match(FIREBASE, /VITE_FIREBASE_FUNCTIONS_PORT \|\| 5001/);
  assert.match(FIREBASE, /_db\.useEmulator\("127\.0\.0\.1", databasePort\)/);
  assert.match(FIREBASE, /_auth\.useEmulator\(`http:\/\/127\.0\.0\.1:\$\{authPort\}`/);
  assert.match(FIREBASE, /_funktioner\.useEmulator\("127\.0\.0\.1", functionsPort\)/);
  assert.match(FIREBASE, /Number\.isInteger\(vaerdi\)/);
  assert.equal(FIREBASE_CONFIG.emulators.auth.port, 9099);
});
