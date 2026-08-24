/* test/skive1-navigation.test.mjs
 * Skive 1 — HIDE/LATER er en RENDERET tilstand, ikke et fravær fra ALLE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `skjulINav: true` fjerner et punkt fra `synligeBorn()` i AppShell.jsx — men
 * punktet står stadig i `ALLE`, fordi `ALLE = NAV.flatMap(...)` ikke kender
 * flaget. En prøve der kun tjekker "er punktet væk fra ALLE" ville derfor
 * ALDRIG kunne fejle for en korrekt Skive-1-implementering, og ville heller
 * ikke opdage det hvis nogen ved en fejl fjernede punktet helt (i stedet for
 * at skjule det) — præcis den fejl navigationskontrakten forbyder.
 *
 * Denne fil måler derfor det samme AppShell.jsx rent faktisk gør —
 * `synligeBorn()`-filteret, gentaget her som i test/navadgang.test.mjs — for
 * hver af de syv roller, og ikke `ALLE`-medlemskabet alene.
 *
 * Se Skive 1 i docs/product-redesign-v1/05_IMPLEMENTATION_SLICES.md.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ALLE, NAV, REDIRECTS } from "../src/fleet/nav.js";
import { ROLLE_PERMS, harPerm, permStrengFraRolle } from "../src/fleet/permissions.js";

/* Rute → skærmfil, udledt af App.jsx — samme opslag som navadgang.test.mjs. */
const APP = readFileSync("src/App.jsx", "utf8");
const LAZY = Object.fromEntries(
  [...APP.matchAll(/const (\w+) = lazy\(\(\) => import\("\.\/moduler\/([^"]+)"\)\)/g)]
    .map((m) => [m[1], m[2]]));
const FIL_FOR = {};
for (const m of APP.matchAll(/<Route path="([^"]*)" element=\{<(\w+) \/>\}/g)) {
  if (LAZY[m[2]]) FIL_FOR["/" + m[1].replace(/^\//, "")] = `src/moduler/${LAZY[m[2]]}`;
}

/** De syv punkter Skive 1 gør til HIDE/LATER. */
const SKJULT_I_SKIVE_1 = [
  "/oekonomi", "/bemanding", "/facility/klima", "/opsaetning/integrationer",
  "/support/overblik", "/support/sag/:id",
];

/* ⚠ DEN SAMME `synligeBorn()`-LOGIK SOM AppShell.jsx — ikke en tilnærmelse.
   En gruppe forsvinder kun hvis INGEN af dens børn er synlige. */
const synligeFor = (rolle) => {
  const perms = permStrengFraRolle(rolle);
  const born = (m) => (m.born || [])
    .filter((b) => !b.skjulINav)
    .filter((b) => !b.kraeverPerm || harPerm(perms, b.kraeverPerm));
  return NAV
    .filter((m) => !m.born?.length || born(m).length)
    .flatMap((m) => (m.born?.length ? born(m) : [m]));
};

const ALLE_ROLLER = Object.keys(ROLLE_PERMS);

describe("Skive 1 — hvad menuen faktisk RENDERER (ikke kun ALLE-medlemskab)", () => {
  it("ingen rolle ser et af de seks HIDE/LATER-punkter i den rendererede menu", () => {
    for (const rolle of ALLE_ROLLER) {
      const synlige = synligeFor(rolle).map((p) => p.sti);
      for (const sti of SKJULT_I_SKIVE_1) {
        assert.ok(!synlige.includes(sti),
          `${rolle} ser stadig "${sti}" i den rendererede menu`);
      }
    }
  });

  it("Hjælp (/support) er IKKE skjult, og står som Support-gruppens eneste synlige barn", () => {
    const support = NAV.find((m) => m.key === "support");
    const hjaelp = support.born.find((b) => b.key === "hjaelp");
    assert.ok(hjaelp && !hjaelp.skjulINav, "Hjælp (/support) må ikke bære skjulINav");

    for (const rolle of ALLE_ROLLER) {
      const perms = permStrengFraRolle(rolle);
      const synligeBoern = support.born
        .filter((b) => !b.skjulINav)
        .filter((b) => !b.kraeverPerm || harPerm(perms, b.kraeverPerm));
      assert.deepEqual(synligeBoern.map((b) => b.key), ["hjaelp"],
        `${rolle} ser andre Support-punkter end Hjælp: ${synligeBoern.map((b) => b.key).join(", ")}`);
    }
  });

  it("de seks punkter er skjult VIA skjulINav — ikke fjernet fra ALLE", () => {
    for (const sti of SKJULT_I_SKIVE_1) {
      const punkt = ALLE.find((p) => p.sti === sti);
      assert.ok(punkt, `"${sti}" findes ikke længere i ALLE — nav-kontrakten kræver at metadata bevares`);
      assert.equal(punkt.skjulINav, true, `"${sti}" mangler skjulINav: true`);
    }
  });

  it("ruterne findes stadig uændret i App.jsx", () => {
    for (const sti of [...SKJULT_I_SKIVE_1, "/support"]) {
      assert.ok(FIL_FOR[sti], `"${sti}" har ingen rute i App.jsx længere`);
    }
  });

  /**
   * ⚠ DEN FEJL DER ER LET AT OVERSE. Skjules et barn, men gruppens EGEN
   * `sti` stadig peger på det, åbner gruppens NavLink alligevel den skjulte
   * side — HIDE/LATER er så ikke reelt håndhævet. Se risici i Skive 1.
   */
  it("gruppernes egen `sti` peger IKKE på et skjult barn", () => {
    for (const gruppe of NAV.filter((m) => m.born?.length)) {
      const eget = gruppe.born.find((b) => b.sti === gruppe.sti);
      if (eget) {
        assert.ok(!eget.skjulINav,
          `${gruppe.key}s egen sti ("${gruppe.sti}") peger på et skjult barn `
          + `("${eget.key}") — gruppens NavLink ville åbne en HIDE/LATER-side.`);
      }
    }
  });

  it("ingen REDIRECT sender en bruger ind i en HIDE/LATER-side", () => {
    for (const r of REDIRECTS) {
      assert.ok(!SKJULT_I_SKIVE_1.includes(r.til),
        `redirect "${r.fra}" → "${r.til}" ender i en skjult Skive-1-side`);
    }
  });
});
