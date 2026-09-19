import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NAV, REDIRECTS } from "../src/fleet/nav.js";
import { RESSOURCE_GRUPPER } from "../src/fleet/ressource-regler.js";

test("Workforce viser Kalender og bevarer den gamle Bemanding-adresse", () => {
  const workforce = NAV.find((item) => item.key === "bemanding");
  const calendar = workforce.born.find((item) => item.key === "workforceKalender");
  assert.equal(calendar.label, "Kalender");
  assert.equal(calendar.sti, "/workforce-v2/kalender");
  const integration = readFileSync(new URL("../src/fleet/workforce-v2-integration.js", import.meta.url), "utf8");
  assert.match(integration, /schedule:\s*"kalender"/);
  assert.deepEqual(REDIRECTS.find((item) => item.fra === "/workforce-v2/bemanding"), {
    fra: "/workforce-v2/bemanding", til: "/workforce-v2/kalender",
  });
});

test("kalenderkategorier har én autoritativ Opsætning-kilde", () => {
  assert.ok(RESSOURCE_GRUPPER.includes("kalenderkategorier"));
  const setup = readFileSync(new URL("../src/moduler/opsaetning/RessourceOpsaetning.jsx", import.meta.url), "utf8");
  const module = readFileSync(new URL("../src/moduler/workforce/WorkforceV2Module.jsx", import.meta.url), "utf8");
  const rules = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
  assert.match(setup, /gruppe="kalenderkategorier"/);
  assert.match(module, /useListe\("ressourceKategorier\/kalenderkategorier"/);
  assert.match(rules, /medarbejderafdelinger\|kalenderkategorier\|units/);
});
