import assert from "node:assert/strict";
import test from "node:test";
import {
  serverFakturaTilScenarie,
  serverFakturaerTilScenarier,
} from "../src/fleet/fakturacenter-server-adapter.js";

test("autoritative fakturafelter vises uden opdigtet dokument eller beløb", () => {
  const scenarie = serverFakturaTilScenarie({
    id: "f-1",
    fakturanummer: "F-100",
    leverandoerId: "lev-1",
    beloebOere: 100_000,
    momsOere: 25_000,
    modtagetMs: Date.parse("2026-09-14T10:00:00Z"),
    status: "modtaget",
    destinationArt: "procure",
    destinationId: "po-1",
    kontrolRevision: 2,
  });
  assert.equal(scenarie.id, "f-1");
  assert.equal(scenarie.sektion, "indbakke");
  assert.equal(scenarie.faktura.nettoOere, 100_000);
  assert.equal(scenarie.faktura.totalOere, 125_000);
  assert.equal(scenarie.faktura.kontrolRevision, 2);
  assert.equal(scenarie.match.placering.modul, "PROCURE");
  assert.equal(scenarie.intake.original.filnavn, "Originalfil ikke registreret");
  assert.deepEqual(scenarie.faktura.fordelinger, [], "destination er ikke det samme som en finansiel fordeling");
});

test("serverens kontrolstatus styrer de tre synlige arbejdslister", () => {
  const [indbakke, ekstra, arkiv] = serverFakturaerTilScenarier([
    { id: "a" },
    { id: "b", kontrolstatus: "ekstra-kontrol" },
    { id: "c", kontrolstatus: "arkiveret" },
    { kontrolstatus: "arkiveret" },
  ]);
  assert.equal(indbakke.sektion, "indbakke");
  assert.equal(ekstra.sektion, "ekstra-kontrol");
  assert.equal(arkiv.sektion, "arkiv");
  assert.equal(arkiv.faktura.låst, true);
});

test("manglende serverfelter forbliver ukendte", () => {
  const scenarie = serverFakturaTilScenarie({ id: "ukendt" });
  assert.equal(scenarie.faktura.nettoOere, null);
  assert.equal(scenarie.faktura.momsOere, null);
  assert.equal(scenarie.faktura.totalOere, null);
  assert.equal(scenarie.intake.modtagetMs, null);
  assert.equal(scenarie.aflæsning.original.fakturanummer, null);
  assert.equal(scenarie.match.placering, null);
});

test("historik og faktiske fordelinger normaliseres uden at tabe identitet", () => {
  const scenarie = serverFakturaTilScenarie({
    id: "f-2",
    fordelinger: {
      x: { fordelingId: "ford-1", modul: "fleet", destinationId: "sag-1", nettoOere: 900 },
    },
    kontrolHistorik: {
      h2: { handling: "ekstra-godkend", uid: "u2", ms: 20 },
      h1: { handling: "kontroller", uid: "u1", ms: 10 },
    },
  });
  assert.deepEqual(scenarie.faktura.fordelinger[0], {
    fordelingId: "ford-1", modul: "FLEET", destinationId: "sag-1", nettoOere: 900, koststed: null,
  });
  assert.deepEqual(scenarie.faktura.historik.map((post) => post.brugerId), ["u1", "u2"]);
});
