/* test/chaufforadgang.test.mjs
 * En chauffør må kun nå /app — beslutning 117.
 *
 * ⚠ HVORFOR FILEN FINDES. `Chauffoerramme` har hele tiden været sideordnet
 * AppShell (beslutning 103) — men intet forhindrede en chauffør i selv at
 * NAVIGERE til en AppShell-rute. De fleste læsninger ville blive afvist
 * (BASIS_LAES + indberetningerSkriv er hele hans sæt), men en afvist
 * læsning er noget andet end en spærret dør: skærmen fandtes stadig,
 * delvist tom, i stedet for slet ikke at være der for ham.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";

const KODE = udenKommentarer(readFileSync("src/App.jsx", "utf8"));

describe("erChauffoer", () => {
  it("findes, og er en funktion af rollen — ikke af noget andet", () => {
    assert.match(KODE, /erChauffoer\s*=\s*bruger\?\.rolle\s*===\s*"chauffoer"/);
  });

  /* ⚠ DEN VIGTIGSTE PRØVE I FILEN. harAdgang er selve adgangsvejen —
     reglerne kender kun tokenet, ikke rollen — og den må ALDRIG blive
     rolleafhængig. Se noten ved erUdbyder: "SIDEORDNET, IKKE EN
     UDVIDELSE." Samme regel gælder her. */
  it("⚠ RØRER IKKE harAdgang", () => {
    assert.match(KODE, /const harAdgang = Boolean\(bruger\?\.tenant\);/,
      "harAdgang er blevet rolleafhængig — det må den ikke være");
  });
});

describe("AppShell-blokken", () => {
  it("⚠ KRÆVER !erChauffoer, IKKE KUN harAdgang", () => {
    assert.match(KODE, /\{harAdgang && !erChauffoer && \(\s*<Route element=\{<AppShell/,
      "AppShell-ruterne er ikke udelukket for en chauffør");
  });

  /* ⚠ EN CHAUFFØR MÅ IKKE LANDE PÅ EN TOM SIDE. Udelukkes AppShell-blokken
     uden en catch-all, matcher INGEN rute en sti uden for /app — React
     Router viser ingenting, og det ser ud som en fejl frem for en
     spærring. */
  it("⚠ EN CHAUFFØR DER RAMMER EN UKENDT STI, SENDES TIL /app — IKKE TIL \"/\"", () => {
    assert.match(KODE, /\{harAdgang && erChauffoer && \(\s*<Route path="\*" element=\{<Navigate to="\/app" replace \/>\} \/>/,
      "der er ingen chauffør-specifik catch-all til /app");
  });
});

describe("/app/*-ruten", () => {
  /* ⚠ IKKE BEGRÆNSET TIL erChauffoer. Kravet var at chauffører KUN må nå
     /app — ikke at /app kun må nås af chauffører. En anden rolle der
     navigerer derhen manuelt, skal stadig kunne se den. */
  it("er stadig åben for enhver med adgang, ikke kun chauffører", () => {
    const start = KODE.indexOf('<Route path="/app/*"');
    assert.ok(start >= 0, "ruten /app/* findes ikke");
    const foer = KODE.slice(0, start);
    const sidsteBetingelse = foer.lastIndexOf("{harAdgang &&");
    const mellemrum = foer.slice(sidsteBetingelse, start);
    assert.ok(!mellemrum.includes("erChauffoer"),
      "/app/* er blevet begrænset til kun chauffører");
  });
});
