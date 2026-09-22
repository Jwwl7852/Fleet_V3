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
    "Enheder", "Ejendomme", "Medarbejdere", "Units", "Varekatalog",
    "Lagerlokationer", "Certifikater",
  ]);
  const medarbejdere = resources.born.find((item) => item.key === "ressourceMedarbejdere");
  const enheder = resources.born.find((item) => item.key === "ressourceEnheder");
  assert.deepEqual(enheder.underpunkter.map((item) => item.label), ["Leasing", "Dokumenter"]);
  assert.equal(enheder.underpunkter[0].sti, "/fleet-v2/leasing");
  assert.equal(enheder.underpunkter[1].sti, "/fleet-v2/dokumenter");
  assert.equal(NAV.find((item) => item.key === "flaade").born.some((item) => item.key === "fleetV2Leasing"), false);
  assert.equal(NAV.find((item) => item.key === "flaade").born.some((item) => item.key === "fleetV2Dokumenter"), false);
  assert.deepEqual(medarbejdere.underpunkter.map((item) => item.label), ["Kompetencer"]);
  assert.equal(medarbejdere.underpunkter[0].sti, "/ressourcer/medarbejdere/kompetencer");
  assert.equal(NAV.find((item) => item.key === "bemanding").born.some((item) => item.key === "workforceKompetencer"), false);
  assert.match(read("src/fleet/AppShell.jsx"), /synligeUnderpunkter/);
  assert.match(read("src/fleet/AppShell.jsx"), /className="fc-flydende-underpunkter"/);
  assert.match(read("src/App.jsx"), /path="ressourcer\/medarbejdere\/kompetencer" element=\{<WorkforceV2Module \/>\}/);
  assert.match(read("src/fleet/workforce-v2-integration.js"), /ressourcer\/medarbejdere\/kompetencer"\) return "skills"/);
  assert.doesNotMatch(read("src/fleet/nav.js"), /key: "ressourceOverblik"/);
  assert.match(read("src/moduler/Ressourcer.jsx"), /<Navigate to=\{poster\[0\]\?\.til \|\| "\/"\} replace \/>/);
});

test("flydende navigation bruger Veyro-logoet og de fælles modulikoner", () => {
  const shell = read("src/fleet/AppShell.jsx");
  const styles = read("src/fleet/fleet.css");
  assert.match(shell, /<div className="fc-shell-logo"><VeyroLogo variant="header" \/><\/div>/);
  assert.doesNotMatch(shell, /className="fc-tenant"/);
  assert.doesNotMatch(shell, /fc-brand-mark/);
  assert.match(shell, /function Navigationsikon\(\{ navn \}\)/);
  assert.equal((shell.match(/<Navigationsikon navn=\{m\.key\} \/>/g) || []).length, 2);
  assert.match(styles, /\.fc-shell-logo \.veyro-logo\{[^}]*width:108px/);
  assert.match(styles, /\.fc-nav-ikon\{[^}]*place-items:center[^}]*width:24px[^}]*height:24px/);
  assert.match(styles, /\.fc-flydende-nav\{[^}]*position:absolute[^}]*display:flex/);
  assert.match(styles, /\.fc-flydende-modul\{[^}]*display:grid[^}]*grid-template-columns:24px minmax\(0,1fr\) 18px/);
  assert.match(styles, /\.fc-mobil-undermenu \.fc-flydende-moduler\{display:none\}/);
});

test("modulgenveje peger på de samme fælles registre", () => {
  const byKey = new Map(NAV.flatMap((item) => item.born || [item]).map((item) => [item.key, item]));
  assert.equal(byKey.get("fleetV2Enheder"), undefined);
  assert.equal(byKey.get("planningV2Ressourcer"), undefined);
  assert.equal(byKey.get("workforceMedarbejdere"), undefined);
  assert.equal(byKey.get("ressourceMedarbejdere").sti, "/ressourcer/medarbejdere");
  assert.equal(byKey.get("unitbookingRegister"), undefined);
  assert.equal(byKey.get("ressourceUnits").sti, "/ressourcer/units");
  assert.equal(byKey.get("indkoebKatalog"), undefined);
  assert.equal(byKey.get("ressourceVarekatalog").sti, "/ressourcer/varekatalog");
  assert.equal(byKey.get("warehouseLokationer"), undefined);
  assert.equal(byKey.get("ressourceLagerlokationer").sti, "/ressourcer/lagerlokationer");
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
  assert.equal(redirects.get("/workforce-v2/medarbejdere"), "/ressourcer/medarbejdere");
  assert.equal(redirects.get("/workforce-v2/kompetencer"), "/ressourcer/medarbejdere/kompetencer");
  assert.equal(redirects.get("/fleet-v2/enheder"), "/ressourcer/enheder");
  assert.equal(redirects.get("/fleet-v2/enheder/:id"), "/ressourcer/enheder/:id");
  assert.equal(redirects.get("/indkoeb/katalog"), "/ressourcer/varekatalog");
  assert.equal(redirects.get("/warehouse/lokationer"), "/ressourcer/lagerlokationer");
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
  const enhedstype = validerRessourceKategori(
    { navn: " Servicebil ", aktiv: true, sortering: 10, tekniskArt: "varevogn" },
    { tekniskeArter: ["varevogn", "lastbil"] },
  );
  assert.deepEqual(enhedstype.fejl, {});
  assert.equal(enhedstype.post.tekniskArt, "varevogn");
  assert.ok(validerRessourceKategori(
    { navn: "Ukendt", aktiv: true, sortering: 10, tekniskArt: "fly" },
    { tekniskeArter: ["varevogn"] },
  ).fejl.tekniskArt);
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

test("ressourceregistre bruger samme linjebaserede og tastaturtilgængelige åbningsmønster", () => {
  const setupOverview = read("src/moduler/opsaetning/RessourceOpsaetning.jsx");
  const sharedList = read("src/moduler/RessourceOmraadeTabel.jsx");
  const setupCatalog = read("src/moduler/opsaetning/RessourceKatalogOpsaetning.jsx");
  const employees = read("src/moduler/Medarbejdere.jsx");
  const units = read("src/moduler/unitbooking/Kasser.jsx");
  const locations = read("src/moduler/warehouse/Lokationer.jsx");
  const products = read("src/fleet/procure-v2/ProcureScreens.jsx");
  const properties = read("facility-v2/src/routes/PropertiesPage.jsx");
  const vehicles = read("fleet-v2/src/components/UnitCatalog.jsx");
  const certificates = read("src/moduler/Kompetencer.jsx");
  const resourceLayout = read("src/moduler/RessourceLayout.jsx");

  assert.match(setupOverview, /<RessourceOmraadeTabel/);
  assert.match(sharedList, /paaRaekke=\{\(post\) => navigate\(post\.til\)\}/);
  assert.match(setupCatalog, /paaRaekke=\{setKategori\}/);
  assert.match(setupCatalog, /paaRaekke=\{setEnhed\}/);
  assert.match(employees, /paaRaekke=\{\(r\) => setValgtId\(r\.id\)\}/);
  assert.match(units, /paaRaekke=\{saetValgt\}/);
  assert.match(locations, /paaRaekke=\{saetValgt\}/);
  assert.match(products, /aria-label=\{`Åbn \$\{item\.name\}`\}/);
  assert.match(properties, /aria-label=\{`Åbn \$\{property\.number\} \$\{property\.name\}`\}/);
  assert.match(vehicles, /role="button" tabIndex="0" aria-label=\{`Åbn \$\{unit\.number\}`\}/);
  assert.match(vehicles, /event\.key === "Enter" \|\| event\.key === " "/);
  for (const source of [employees, units, locations, certificates]) assert.match(source, /<RessourceAabn/);
  assert.match(products, /className="fc-ressource-aabn"/);
  assert.match(properties, /className="fc-ressource-aabn"/);
  assert.match(vehicles, /className="fc-ressource-aabn"/);
  assert.match(resourceLayout, /Åbn <span aria-hidden="true">›<\/span>/);
  assert.match(products, /<CatalogItemDetails/);
  assert.match(units, /titel=\{`Unit \$\{valgt\.id\}`\}/);
  assert.match(locations, /titel=\{pladsnavn\(valgt\)\}/);
});

test("vareeditoren kobler varer til det fælles leverandørregister", () => {
  const products = read("src/fleet/procure-v2/ProcureScreens.jsx");
  const module = read("src/fleet/procure-v2/ProcureModule.jsx");
  const api = read("src/fleet/varelager.js");

  assert.match(products, /<span>Leverandør<\/span><select value=\{draft\.supplierId\}/);
  assert.match(products, /Ingen fast leverandør/);
  assert.match(products, /leverandoerId: draft\.supplierId \|\| undefined/);
  assert.match(products, /standardAfdelingId: draft\.defaultDepartmentId \|\| undefined/);
  assert.match(products, /Standardafdeling \(valgfri\)/);
  assert.match(products, /supplierId: selected\.supplierId \|\| ""/);
  assert.match(module, /supplierId: item\.leverandoerId \|\| null/);
  assert.match(api, /leverandoerId: post\.leverandoerId \|\| undefined/);
});

test("Ressourcer følger Enheder-listens kompakte liste- og filterstruktur", () => {
  const shell = read("src/fleet/AppShell.jsx");
  const employees = read("src/moduler/Medarbejdere.jsx");
  const units = read("src/moduler/unitbooking/Kasser.jsx");
  const locations = read("src/moduler/warehouse/Lokationer.jsx");
  const certificates = read("src/moduler/Kompetencer.jsx");
  const properties = read("facility-v2/src/routes/PropertiesPage.jsx");
  const vehicles = read("fleet-v2/src/components/UnitCatalog.jsx");

  assert.match(shell, /const ressourceSide =/);
  assert.match(shell, /fc-main fc-main--shared-page-top/);
  assert.match(shell, /<header className="fc-top">/);
  assert.match(shell, /pathname === "\/facility-v2\/ejendomme"/);
  assert.doesNotMatch(shell, /FACILITY – Ejendomme/);
  assert.doesNotMatch(shell, /ressourceOwnsPageTitle/);
  assert.match(employees, /<Dialog titel=\{valgt\.navn\}/);
  assert.doesNotMatch(employees, /role="tablist" aria-label="Status"/);
  assert.match(employees, /id="mb-visning"/);
  assert.match(employees, /setForm\(valgt\.id\)/);
  assert.match(employees, /ressourceKategorier\/medarbejderafdelinger/);
  assert.match(employees, /Tilføj funktion/);
  assert.doesNotMatch(employees, /type="checkbox"/);
  for (const source of [employees, units, locations, certificates]) {
    assert.match(source, /Sortér/);
    assert.match(source, /Nulstil/);
  }
  assert.doesNotMatch(units, /<KpiRaekke>/);
  assert.doesNotMatch(locations, /<KpiRaekke>/);
  assert.doesNotMatch(certificates, /<KpiRaekke>/);
  assert.match(properties, /directory-layout-single/);
  assert.doesNotMatch(properties, /directory-summary/);
  assert.doesNotMatch(vehicles, /Gem visning/);
  assert.doesNotMatch(vehicles, /Fiktive testdata ·/);

  const catalogCss = read("src/fleet/procure-v2/procure-v2.css");
  assert.match(catalogCss, /resource-catalog-directory \.procure-catalog-table :is\(th,td\)\{border-right:0;border-left:0\}/);
});
