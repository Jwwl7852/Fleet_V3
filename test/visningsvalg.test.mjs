import test from "node:test";
import assert from "node:assert/strict";
import { begraensPanel, begraensZoom, erIndreRaekkehandling, gemVisningsvalg, laesVisningsvalg, visningsnoegle } from "../src/fleet/visningsvalg.js";

const lager = () => {
  const data = new Map();
  return { getItem: (k) => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
};

test("visningsnøgler afgrænses pr. miljø, bruger, tenant/ejer og skærm", () => {
  const a = visningsnoegle({ miljoe: "dev", brugerId: "u1", kontekst: "tenant-a", skaerm: "/support", egenskab: "zoom" });
  const b = visningsnoegle({ miljoe: "dev", brugerId: "u1", kontekst: "tenant-b", skaerm: "/support", egenskab: "zoom" });
  const ejer = visningsnoegle({ miljoe: "dev", brugerId: "u1", kontekst: "ejer", skaerm: "/main", egenskab: "zoom" });
  assert.notEqual(a, b);
  assert.notEqual(a, ejer);
  assert.match(a, /^veyro:visning:v1:/);
});

test("visningsvalg gemmes uden at blive en adgangsbeslutning", () => {
  const l = lager(); const n = "n";
  assert.equal(laesVisningsvalg(l, n, 100), 100);
  assert.equal(gemVisningsvalg(l, n, 115), true);
  assert.equal(laesVisningsvalg(l, n, 100), 115);
});

test("zoom og paneler holder dokumenterede grænser", () => {
  assert.equal(begraensZoom(10), 75);
  assert.equal(begraensZoom(116), 115);
  assert.equal(begraensZoom(200), 130);
  assert.equal(begraensPanel(10, 38, 76), 38);
  assert.equal(begraensPanel(88, 38, 76), 76);
});

test("indre kontroller åbner ikke den klikbare række", () => {
  const raekke = { contains: (element) => element === kontrol };
  const kontrol = {};
  const maal = { closest: () => kontrol };
  assert.equal(erIndreRaekkehandling(maal, raekke), true);
  assert.equal(erIndreRaekkehandling(raekke, raekke), false);
});
