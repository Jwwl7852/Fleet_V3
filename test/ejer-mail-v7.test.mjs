import assert from "node:assert/strict";
import test from "node:test";
import { bygAiOpmærksomhedspunkter, filtrerMailtraade, lokaltSvarforslag, paginerMailtraade } from "../src/fleet/ejer-mail-v7-regler.js";

const nu = Date.UTC(2026, 8, 11, 12);
const traade = Object.fromEntries(Array.from({ length: 112 }, (_, indeks) => {
  const id = `sag-${indeks}`;
  return [id, { id, emne: `Syntetisk sag ${indeks}`, delingsstatus: "delt", sagstype: indeks === 1 ? "support" : "kundedialog", status: indeks % 3 === 0 ? "afventer_os" : "afventer_kunden", ansvarligUid: indeks % 2 ? "joern" : "dennis", senesteAktivitetMs: nu - (indeks + 1) * 3_600_000, postkasseKilder: { info: { type: "delt", adresse: "info@veyrosystems.com" } }, ...(indeks === 1 ? { support: { status: "triage", modul: "FLEET", fristMs: nu + 3_600_000 } } : {}), ...(indeks === 2 ? { analyser: { a: { manglendeOplysninger: ["CVR", "startdato"] } } } : {}) }];
}));

test("V7 filtrerer postkasse, status og ejer uden at klippe totalen", () => {
  const alle = filtrerMailtraade(traade, { postkasse: "info", ejerUid: "dennis" });
  assert.equal(alle.length, 112);
  const mine = filtrerMailtraade(traade, { postkasse: "info", ejerUid: "dennis", kunMine: true });
  assert.equal(mine.every((traad) => traad.ansvarligUid === "dennis"), true);
  assert.equal(paginerMailtraade(alle, 5).poster.length, 12);
  assert.equal(paginerMailtraade(alle, 5).total, 112);
});

test("V7 samlet AI-overblik kommer fra flere sager og kan blive tomt", () => {
  const punkter = bygAiOpmærksomhedspunkter(Object.values(traade), nu);
  assert.ok(punkter.length >= 3);
  assert.ok(new Set(punkter.map((punkt) => punkt.traadId)).size >= 3);
  assert.deepEqual(bygAiOpmærksomhedspunkter([], nu), []);
});

test("V7 lokal svarrevision følger sagen og lækker ikke instruktionen", () => {
  const langt = lokaltSvarforslag({ navn: "Maria Lund", mangler: ["CVR", "startdato", "OBD-antal"], signatur: "Dennis" });
  const kort = lokaltSvarforslag({ navn: "Maria Lund", mangler: ["CVR", "startdato", "OBD-antal"], instruktion: "Gør svaret kortere", signatur: "Dennis" });
  assert.ok(kort.length < langt.length);
  assert.match(kort, /Maria/); assert.match(kort, /CVR/); assert.match(kort, /Dennis/);
  assert.doesNotMatch(kort, /Gør svaret kortere/);
});
