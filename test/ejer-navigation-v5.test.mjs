import assert from "node:assert/strict";
import test from "node:test";
import { erEjerNavgruppeAaben, ejerInitialer, ejerVisningsnavn } from "../src/fleet/ejer-navigation.js";

test("en aktiv menugruppe kan foldes sammen og åbnes igen", () => {
  assert.equal(erEjerNavgruppeAaben({ gemt: {}, noegle: "Salg", aktiv: true }), true);
  assert.equal(erEjerNavgruppeAaben({ gemt: { Salg: false }, noegle: "Salg", aktiv: true }), false);
  assert.equal(erEjerNavgruppeAaben({ gemt: { Salg: true }, noegle: "Salg", aktiv: true }), true);
});

test("ejerens viste navn er konfigureret og afslører ikke loginmail", () => {
  assert.equal(ejerVisningsnavn({ displayName: "Dennis Christensen", navn: "test@example.com" }), "Dennis Christensen");
  assert.equal(ejerVisningsnavn({ navn: "test@example.com" }), "Ejer");
  assert.equal(ejerInitialer({ displayName: "Dennis Christensen" }), "DC");
});
