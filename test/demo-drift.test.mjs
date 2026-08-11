/* test/demo-drift.test.mjs
 * Samme arbejde må ikke stå på to forskellige biler.
 *
 * ⚠ HVORFOR DEN FINDES. Da datasættene endelig lå samme sted og kunne
 * sammenlignes, fandt selvkontrollen to steder hvor de var uenige:
 *
 *   "Fordør lukker ikke i"       Bus 12 på Dashboard, Bil 77 i demo-opgaver.
 *                                Bil 77 er en SOLGT TRÆKKER — en fordør
 *                                findes ikke på den, og en afgået enhed kan
 *                                ikke have en åben værkstedsopgave.
 *   "Serviceeftersyn 30.000 km"  Bil 104 to steder, Bil 78 ét sted.
 *
 * Det er Bil 104 med to nummerplader, seks år efter. En console.warn fanges
 * kun af den der tilfældigt har konsollen åben; en prøve fanges af hooken.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import { DEMO_BESOEG } from "../src/fleet/demo-vaerksted.js";
import { DEMO_DASHBOARD_OPGAVER } from "../src/fleet/demo-dashboard.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";

/* Tankestreg, bindestreg og dobbelt mellemrum skal ikke gøre to ens
   beskrivelser forskellige — "Serviceeftersyn – 30.000 km" og
   "Serviceeftersyn 30.000 km" er samme arbejde. */
const normaliser = (s) => (s || "").toLowerCase().replace(/[\s–—-]+/g, " ").trim();
const enhedFor = (id) => DEMO_KOERETOEJER.find((k) => k.id === id)?.kaldenavn || null;

test("Samme beskrivelse står på samme bil i alle datasæt", () => {
  const poster = [
    ...DEMO_OPGAVER.map((o) => ({ kilde: `demo-opgaver/${o.id}`, besk: o.beskrivelse, bil: enhedFor(o.koeretoejId) })),
    ...DEMO_BESOEG.map((b) => ({ kilde: `demo-vaerksted/${b.id}`, besk: b.beskrivelse, bil: enhedFor(b.koeretoejId) })),
    ...DEMO_DASHBOARD_OPGAVER.map((d) => ({ kilde: `demo-dashboard/${d.id}`, besk: d.besk, bil: d.enhed })),
  ].filter((p) => p.bil);

  const perBesk = new Map();
  for (const p of poster) {
    const n = normaliser(p.besk);
    if (!perBesk.has(n)) perBesk.set(n, []);
    perBesk.get(n).push(p);
  }

  const uenige = [];
  for (const [besk, liste] of perBesk) {
    const biler = new Set(liste.map((p) => p.bil));
    if (biler.size > 1) {
      uenige.push(`"${besk}" står på ${[...biler].join(" og ")} — ` +
        liste.map((p) => `${p.kilde}=${p.bil}`).join(", "));
    }
  }

  assert.deepEqual(uenige, [],
    "To datasæt beskriver samme arbejde på hver sin bil. Det er Bil 104 med to " +
    "nummerplader. Afgør hvilken der er rigtig — det er et domænespørgsmål, ikke " +
    "en kodefejl:\n  " + uenige.join("\n  "));
});

test("En afgået enhed har ingen åben opgave", () => {
  /* Posten bliver stående i flåden — regnskabsdata hardslettes aldrig — men
     en solgt eller skrottet bil kan ikke være på værksted. Uden tjekket ser
     opgaven helt normal ud i en tabel. */
  const afgaaet = new Set(
    DEMO_KOERETOEJER.filter((k) => k.status === "solgt" || k.status === "skrottet").map((k) => k.id)
  );
  assert.ok(afgaaet.size > 0, "demo-flåden har ingen afgået enhed at prøve på");

  for (const o of DEMO_OPGAVER) {
    if (!afgaaet.has(o.koeretoejId)) continue;
    assert.ok(["udfoert", "annulleret"].includes(o.status),
      `${o.id} er "${o.status}" på ${enhedFor(o.koeretoejId)}, som er afgået`);
  }
});

test("30.000 km-servicen hører til Bil 104", () => {
  /* Afgjort af den der kender flåden. Prøven står her, så svaret ikke kan
     drive tilbage ved næste redigering: Bil 78 står på 268.400 km, og en
     30.000 km-service dér giver ingen mening. */
  const med = [
    ...DEMO_BESOEG.filter((b) => normaliser(b.beskrivelse).includes("30.000 km"))
      .map((b) => enhedFor(b.koeretoejId)),
    ...DEMO_OPGAVER.filter((o) => normaliser(o.beskrivelse).includes("30.000 km"))
      .map((o) => enhedFor(o.koeretoejId)),
    ...DEMO_DASHBOARD_OPGAVER.filter((d) => normaliser(d.besk).includes("30.000 km"))
      .map((d) => d.enhed),
  ].filter(Boolean);

  assert.ok(med.length >= 2, "30.000 km-servicen findes ikke i demo-sættet længere");
  for (const bil of med) assert.equal(bil, "Bil 104", `30.000 km-servicen står på ${bil}`);
});
