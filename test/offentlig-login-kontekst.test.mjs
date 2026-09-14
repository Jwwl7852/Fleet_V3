import assert from "node:assert/strict";
import test from "node:test";
import { findOffentligLoginKontekst, normaliserLoginOrigin, parseLoginKontekster } from "../functions/offentlig-login-kontekst.js";

const råKonfiguration = JSON.stringify({
  "https://kunde-a.example": { contextId: "kunde_a_public", moduler: ["fleet", "workforce"] },
  "https://kunde-b.example": { contextId: "kunde_b_public", moduler: ["fleet", "facility"] },
});

test("kun eksakte sikre origins og localhost-http accepteres", () => {
  assert.equal(normaliserLoginOrigin("https://kunde-a.example"), "https://kunde-a.example");
  assert.equal(normaliserLoginOrigin("http://127.0.0.1:5217"), "http://127.0.0.1:5217");
  assert.equal(normaliserLoginOrigin("http://kunde-a.example"), null);
  assert.equal(normaliserLoginOrigin("https://kunde-a.example/login"), null);
});

test("ukendt loginadresse frigiver ingen moduloplysninger", () => {
  assert.equal(findOffentligLoginKontekst({ origin: "https://ukendt.example", råKonfiguration }), null);
});

test("serverprojektionen indeholder kun opaque context-id og tilladte moduler", () => {
  assert.deepEqual(findOffentligLoginKontekst({ origin: "https://kunde-a.example", råKonfiguration }), {
    version: 1,
    contextId: "kunde_a_public",
    moduler: ["fleet", "workforce"],
  });
  assert.equal(parseLoginKontekster("ikke-json").size, 0);
  assert.equal(parseLoginKontekster(JSON.stringify({
    "https://kunde.example": { contextId: "kunde_public", moduler: ["fleet", "ukendt"] },
  })).size, 0);
});
