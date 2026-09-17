import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NAV, REDIRECTS } from "../src/fleet/nav.js";
import { modulerFor } from "../src/fleet/moduler.js";
import {
  hardwareErLedig, validerHardwareTilknytning,
  validerRessourceHardware, validerRessourceKategori,
} from "../src/fleet/ressource-regler.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("Ressourcer er et hovedområde med de syv aftalte registre", () => {
  const resources = NAV.find((item) => item.key === "ressourcer");
  assert.ok(resources);
  assert.deepEqual(resources.born.filter((item) => !item.skjulINav).map((item) => item.label), [
    "Overblik", "Enheder", "Ejendomme", "Medarbejdere", "Units",
    "Varekatalog", "Lagerlokationer", "Certifikater",
  ]);
});

test("modulgenveje peger på de samme fælles registre", () => {
  const byKey = new Map(NAV.flatMap((item) => item.born || [item]).map((item) => [item.key, item]));
  assert.equal(byKey.get("fleetV2Enheder").sti, "/ressourcer/enheder");
  assert.equal(byKey.get("planningV2Ressourcer").sti, "/ressourcer/enheder");
  assert.equal(byKey.get("workforceMedarbejdere").sti, "/ressourcer/medarbejdere");
  assert.equal(byKey.get("unitbookingRegister").sti, "/ressourcer/units");
  assert.equal(byKey.get("indkoebKatalog").sti, "/ressourcer/varekatalog");
  assert.equal(byKey.get("warehouseLokationer").sti, "/ressourcer/lagerlokationer");
  assert.equal(byKey.get("reolpladser").skjulINav, true);
});

test("fælles datakilder har OR-modulgates uden at blande fysiske datatyper", () => {
  assert.deepEqual(modulerFor("koeretoejer"), ["flaade", "booking"]);
  assert.deepEqual(modulerFor("kasser"), ["unitbooking", "warehouse"]);
  assert.deepEqual(modulerFor("reolpladser"), ["unitbooking", "warehouse"]);
  assert.deepEqual(modulerFor("forbrugsvarer"), ["indkoeb", "warehouse"]);
  assert.deepEqual(modulerFor("varer"), ["warehouse"]);
});

test("gamle opsætningslinks har interne kompatibilitetsmål", () => {
  const redirects = new Map(REDIRECTS.map((item) => [item.fra, item.til]));
  assert.equal(redirects.get("/opsaetning/fleet-kategorier"), "/opsaetning/ressourcer/enheder");
  assert.equal(redirects.get("/opsaetning/kasser"), "/ressourcer/units");
  assert.equal(redirects.get("/opsaetning/medarbejdere"), "/ressourcer/medarbejdere");
  assert.equal(redirects.get("/opsaetning/aftalepriser"), "/opsaetning/priser/kunder");
  assert.equal(redirects.get("/opsaetning/procure/godkendelsesregler"), "/opsaetning/godkendelsesregler/procure");
});

test("kategorier deaktiveres, og hardware kan kun vælges ledigt på korrekt ressourcetype", () => {
  assert.deepEqual(validerRessourceKategori({ navn: " Scooter ", aktiv: false, sortering: 10 }).fejl, {});
  assert.deepEqual(validerRessourceHardware({ serienummer: " OBD-42 ", status: "aktiv" }, "obd").fejl, {});
  assert.equal(hardwareErLedig({ status: "aktiv" }, { ressourceType: "enhed", ressourceId: "v1" }), true);
  assert.equal(hardwareErLedig({ status: "aktiv", tilknytning: { ressourceType: "enhed", ressourceId: "v2" } }, { ressourceType: "enhed", ressourceId: "v1" }), false);
  assert.deepEqual(validerHardwareTilknytning({ art: "gps", hardwareId: "g1", ressourceType: "enhed", ressourceId: "v1" }), {
    ressourceType: "GPS kan ikke knyttes til denne ressourcetype.",
  });
});

test("datalaget indeholder de fælles og atomiske adgangsgrænser", () => {
  const rules = read("firebase.rules.json");
  const functions = read("functions/index.js");
  assert.match(rules, /"ressourceKategorier"\s*:\s*\{/);
  assert.match(rules, /"ressourceHardware"\s*:\s*\{/);
  assert.match(rules, /"\.indexOn"\s*:\s*\["sortering"\]/);
  assert.match(rules, /"\.indexOn"\s*:\s*\["serienummer"\]/);
  assert.match(rules, /"obdHardwareId"/);
  assert.match(rules, /"gpsHardwareId"/);
  assert.match(rules, /"sikkerhedsklasse"/);
  assert.match(functions, /tenantRef\.transaction/);
  assert.match(functions, /if \(!tenant && varm\) tenant = structuredClone\(foer\.val\(\)\)/);
  assert.match(functions, /Hardwaren er allerede tilknyttet en anden ressource/);
  assert.match(functions, /perm: \["indkoeb\.skriv", "varer\.skriv"\], modul: \["indkoeb", "warehouse"\]/);
});
