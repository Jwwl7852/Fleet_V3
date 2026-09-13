import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anvendPlanPaaFixture, planlaegEjerMigrationV1 } from "../src/fleet/ejer-migration.js";

const fixture = () => JSON.parse(readFileSync("test/fixtures/ejer-migration-v1.json", "utf8"));

test("migration v1 er additiv og finder kun manglende forretningsnøgler", () => {
  const plan = planlaegEjerMigrationV1(fixture());
  assert.equal(plan.kanAnvendes, true);
  assert.equal(plan.antalOperationer, 2);
  assert.deepEqual(plan.operationer.map((x) => x.sti), [
    "udbyder/fakturagrundlag/2026-07/tenant-fixture-a/forretningsnoegle",
    "udbyder/fakturajobs/job-a/forretningsnoegle",
  ]);
  assert.ok(plan.operationer.every((x) => x.handling === "tilfoej_hvis_mangler"));
});

test("genkørsel er idempotent", () => {
  const data = fixture();
  const efter = anvendPlanPaaFixture(data, planlaegEjerMigrationV1(data));
  const igen = planlaegEjerMigrationV1(efter);
  assert.equal(igen.antalOperationer, 0);
  assert.equal(igen.antalKonflikter, 0);
});

test("accepterede tilbud og historiske beløb ændres ikke", () => {
  const data = fixture();
  const tilbudFoer = structuredClone(data.udbyder.tilbud);
  const grundlagFoer = structuredClone(data.udbyder.fakturagrundlag["2026-07"]["tenant-fixture-a"]);
  const efter = anvendPlanPaaFixture(data, planlaegEjerMigrationV1(data));
  assert.deepEqual(efter.udbyder.tilbud, tilbudFoer);
  assert.deepEqual(efter.udbyder.fakturagrundlag["2026-07"]["tenant-fixture-a"].linjer, grundlagFoer.linjer);
  assert.equal(efter.udbyder.fakturagrundlag["2026-07"]["tenant-fixture-a"].ialtOere, grundlagFoer.ialtOere);
});

test("afvigende eksisterende nøgle bliver konflikt og overskrives ikke", () => {
  const data = fixture();
  data.udbyder.fakturajobs["job-a"].forretningsnoegle = "faktura:forkert";
  const plan = planlaegEjerMigrationV1(data);
  assert.equal(plan.kanAnvendes, false);
  assert.equal(plan.antalKonflikter, 1);
  assert.equal(plan.konflikter[0].faktisk, "faktura:forkert");
  assert.ok(!plan.operationer.some((x) => x.sti === plan.konflikter[0].sti));
});

test("ufuldstændige legacy-poster rapporteres uden syntetiske værdier", () => {
  const data = fixture();
  data.udbyder.fakturajobs.ukendt = { status: "afventer" };
  data.udbyder.fakturagrundlag.ukendt = { kunde: {} };
  const plan = planlaegEjerMigrationV1(data);
  assert.equal(plan.antalSprunget, 2);
  assert.deepEqual(plan.sprunget.map((x) => x.aarsag).sort(), ["mangler_periode_eller_tenant", "ugyldig_periode"]);
});

test("recoveryplanen kan kun fjerne præcis den tilføjede værdi", () => {
  const plan = planlaegEjerMigrationV1(fixture());
  for (const post of plan.operationer) {
    assert.equal(post.recovery.handling, "fjern_hvis_uaendret");
    assert.equal(post.recovery.sti, post.sti);
    assert.equal(post.recovery.forventetVaerdi, post.vaerdi);
  }
});

test("CLI er dry-run som standard og kræver dobbelt projektbekræftelse ved apply", () => {
  const cli = readFileSync("scripts/ejer-migration-v1.mjs", "utf8");
  assert.match(cli, /mode: options\.apply \? "apply" : "dry-run"/);
  assert.match(cli, /options\["confirm-project"\] !== options\.project/);
  assert.match(cli, /flag: "wx"/);
  assert.match(cli, /arg === "--help"/);
  assert.match(cli, /transaction/);
});

test("fællestabellen understøtter feltkolonner med stabile React-nøgler", () => {
  const ui = readFileSync("src/fleet/ui.jsx", "utf8");
  assert.match(ui, /key=\{k\.key \?\? k\.felt \?\? `kolonne-\$\{i\}`\}/);
  assert.match(ui, /r\[k\.key \?\? k\.felt\]/);
});
