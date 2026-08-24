/* test/meldingskoe.test.mjs
 * Den lokale kø for statusmeldinger uden forbindelse — beslutning 114.
 *
 * `meldingskoe.js` er ren bogføring: læg i kø, tag ud, læs, og skeln en
 * afbrudt forbindelse fra en afvisning fra serveren. Selve afsendelsen
 * (kaldFunktion) hører i Turplan.jsx og prøves ikke her — samme grænse som
 * resten af fleet/: politik uden firebase.
 *
 * Koer: npm test
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

/* ⚠ localStorage FINDES IKKE I node --test. Filen bruger den direkte —
   samme som browseren — så en minimal, in-memory version stilles op FØR
   modulet importeres. Et rigtigt vindue ville nulstille den mellem hver
   test af sig selv; her gør beforeEach det. */
function nytLager() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => { data.clear(); },
  };
}
globalThis.localStorage = nytLager();
/* ⚠ Node 24 definerer allerede en global `navigator` som en read-only
   getter (Web-API-globals) — en almindelig tildeling kaster. */
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true }, writable: true, configurable: true,
});

const {
  laegIKoe, fjernFraKoe, koeIndhold, erForbindelsesfejl,
} = await import("../src/fleet/meldingskoe.js");

const melding = (over = {}) => ({
  type: "afgang", ms: 1000, klientId: "k-1", stopId: "s-1", ...over,
});

beforeEach(() => {
  globalThis.localStorage.clear();
  globalThis.navigator.onLine = true;
});

describe("Køen", () => {
  it("er tom fra starten", () => {
    assert.deepEqual(koeIndhold(), []);
  });

  it("lægger en melding i køen og kan læse den igen", () => {
    laegIKoe({ etapeId: "e-1", melding: melding() });
    const koe = koeIndhold();
    assert.equal(koe.length, 1);
    assert.equal(koe[0].etapeId, "e-1");
    assert.equal(koe[0].melding.klientId, "k-1");
  });

  /* ⚠ IDEMPOTENT PÅ klientId. Trykker chaufføren to gange fordi han ikke så
     nogen reaktion, skal det ikke blive til to ventende poster — samme
     grund som klientId er nøglen på selve statushaendelsen. */
  it("⚠ ER IDEMPOTENT PÅ klientId — samme melding to gange bliver én", () => {
    laegIKoe({ etapeId: "e-1", melding: melding() });
    laegIKoe({ etapeId: "e-1", melding: melding() });
    assert.equal(koeIndhold().length, 1);
  });

  it("to forskellige klientId'er er to poster", () => {
    laegIKoe({ etapeId: "e-1", melding: melding({ klientId: "k-1" }) });
    laegIKoe({ etapeId: "e-1", melding: melding({ klientId: "k-2" }) });
    assert.equal(koeIndhold().length, 2);
  });

  it("fjernFraKoe fjerner kun den ene post", () => {
    laegIKoe({ etapeId: "e-1", melding: melding({ klientId: "k-1" }) });
    laegIKoe({ etapeId: "e-1", melding: melding({ klientId: "k-2" }) });
    fjernFraKoe("k-1");
    const koe = koeIndhold();
    assert.equal(koe.length, 1);
    assert.equal(koe[0].melding.klientId, "k-2");
  });

  it("bevarer rækkefølgen — først meldt, først i køen", () => {
    laegIKoe({ etapeId: "e-1", melding: melding({ klientId: "k-1", ms: 1 }) });
    laegIKoe({ etapeId: "e-1", melding: melding({ klientId: "k-2", ms: 2 }) });
    laegIKoe({ etapeId: "e-1", melding: melding({ klientId: "k-3", ms: 3 }) });
    assert.deepEqual(koeIndhold().map((p) => p.melding.klientId), ["k-1", "k-2", "k-3"]);
  });

  it("⚠ OVERLEVER ET NULSTILLET localStorage — ikke et kastet resultat", () => {
    globalThis.localStorage.setItem("fc-meldingskoe-v1", "{ dette er ikke json");
    assert.deepEqual(koeIndhold(), [], "ugyldigt indhold skal give en tom kø, ikke en fejl");
  });
});

describe("⚠ SERVERENS EGNE AFVISNINGER ER IKKE ET FORBINDELSESPROBLEM", () => {
  it("en kendt HttpsError-kode er IKKE en forbindelsesfejl", () => {
    assert.equal(erForbindelsesfejl({ code: "functions/invalid-argument" }), false);
    assert.equal(erForbindelsesfejl({ code: "functions/permission-denied" }), false);
    assert.equal(erForbindelsesfejl({ code: "functions/not-found" }), false);
    assert.equal(erForbindelsesfejl({ code: "functions/failed-precondition" }), false);
  });

  it("⚠ EN UKENDT ELLER MANGLENDE KODE ER en forbindelsesfejl", () => {
    assert.equal(erForbindelsesfejl({ code: "functions/internal" }), true);
    assert.equal(erForbindelsesfejl({ code: "functions/unavailable" }), true);
    assert.equal(erForbindelsesfejl({}), true);
    assert.equal(erForbindelsesfejl(undefined), true);
  });

  it("⚠ ER BROWSEREN OFFLINE, ER DET ALTID en forbindelsesfejl — uanset koden", () => {
    globalThis.navigator.onLine = false;
    assert.equal(erForbindelsesfejl({ code: "functions/invalid-argument" }), true);
  });
});
