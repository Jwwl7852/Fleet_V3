/* test/skive2a-navigation.test.mjs
 * Skive 2A — det FAKTISK RENDEREDE menutræ, pr. tenant-modulkombination.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Skive 2A indfører fire gruppeoverskrifter (Fælles/Driftsmoduler/
 * Administration/Hjælp) og gør to topniveaupunkter uden børn
 * (`kunderOversigt`, `fakturacenter`) selv-spærrede via `kraeverModul`
 * hhv. `kraeverPerm` — noget AppShell.jsx aldrig har skullet gøre for et
 * BARNLØST topniveaupunkt før. `test/navadgang.test.mjs` og
 * `test/skive1-navigation.test.mjs` prøver hver sit smalle udsnit; denne
 * fil prøver det brugeren faktisk bad om: det RENDEREDE træ for en række
 * konkrete tenant-modulkombinationer, ikke kun for "fuld tenant".
 *
 * ⚠ MODULSYNLIGHED, IKKE SERVERADGANG. Filen måler udelukkende hvad
 * `NAV`/AppShell TEGNER for en given `{moduler, perms}`-kombination — den
 * samme `renderetMenu()`-funktion som findes nedenfor, en ren
 * genimplementering af AppShell.jsx's `synligeToppunkter`/`synligeBorn`
 * (JSX kan ikke importeres i Node — se samme greb i navadgang.test.mjs).
 * Den prøver IKKE `firebase.rules.json` og påstår intet om hvad en
 * afvist/tilladt LÆSNING gør — det er `rules.*.test.mjs`s domæne. En
 * skjult menu og en afvist server-læsning er to forskellige garantier
 * (produktregel 7, se 02_TARGET_NAVIGATION.md), og denne fil rører kun
 * den første.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NAV, ALLE } from "../src/fleet/nav.js";
import { harModul, modulsaet, VALGFRIE_MODULER, MODUL } from "../src/fleet/moduler.js";
import { ROLLE_PERMS, harPerm, permStrengFraRolle } from "../src/fleet/permissions.js";

/**
 * ⚠ DEN SAMME LOGIK SOM AppShell.jsx's `synligeToppunkter`/`synligeBorn` —
 * ikke en tilnærmelse. Et topniveaupunkt kan siden Skive 2A selv bære
 * `kraeverModul`/`kraeverPerm` (før kun børn); et barn er desuden aldrig
 * synligt hvis `skjulINav` er sat.
 *
 * ⚠ OG `m.key` ER IKKE ALTID ET MODULNAVN — se AppShell.jsx's `modulNavn()`.
 * `fakturacenter` er med vilje uden modulklausul; `m.kraeverModul || m.key`
 * ville bruge "fakturacenter" som et påstået modulnavn og `harModul()`
 * fejler LUKKET på et ukendt navn, hvilket denne fil selv fangede første
 * gang den blev kørt (se historikken for den fejlrettelse).
 */
function renderetMenu({ moduler, perms }) {
  const modulNavn = (m) => m.kraeverModul || (MODUL[m.key] ? m.key : null);
  const synligeBorn = (m) => (m.born || [])
    .filter((b) => !b.skjulINav)
    .filter((b) => !b.kraeverModul || harModul(moduler, b.kraeverModul))
    .filter((b) => !b.kraeverPerm || harPerm(perms, b.kraeverPerm));
  return NAV
    .filter((m) => { const n = modulNavn(m); return !n || harModul(moduler, n); })
    .filter((m) => !m.kraeverPerm || harPerm(perms, m.kraeverPerm))
    .filter((m) => !m.born?.length || synligeBorn(m).length)
    .map((m) => ({ ...m, synligeBorn: synligeBorn(m) }));
}

const ADMIN_PERMS = permStrengFraRolle("admin");
const noegler = (menu) => menu.map((m) => m.key).sort();

/* De seks HIDE/LATER-stier fra Skive 1 — skal forblive skjult under ENHVER
   modul-/rollekombination denne fil prøver, inklusive fuld tenant + admin. */
const SKJULT_I_SKIVE_1 = [
  "/oekonomi", "/bemanding", "/facility/klima", "/opsaetning/integrationer",
  "/support/overblik", "/support/sag/:id",
];

describe("Skive 2A — det rendererede træ for konkrete tenant-modulkombinationer", () => {
  it("Planning + nødvendig Kunder: ser Planning, ser ikke de øvrige driftsmoduler", () => {
    const moduler = modulsaet(["booking", "kunder"]);
    const menu = renderetMenu({ moduler, perms: ADMIN_PERMS });
    const top = noegler(menu);
    assert.ok(top.includes("booking"), "Planning mangler");
    for (const k of ["flaade", "facility", "indkoeb", "warehouse", "unitbooking", "bemanding"]) {
      assert.ok(!top.includes(k), `${k} er synlig, men er ikke købt`);
    }
  });

  it("Fleet + Facility + Workforce + Procure, ingen Planning: ser de fire, ikke Planning", () => {
    const moduler = modulsaet(["flaade", "facility", "bemanding", "indkoeb"]);
    const menu = renderetMenu({ moduler, perms: ADMIN_PERMS });
    const top = noegler(menu);
    for (const k of ["flaade", "facility", "bemanding", "indkoeb"]) {
      assert.ok(top.includes(k), `${k} mangler, selvom modulet er købt`);
    }
    assert.ok(!top.includes("booking"), "Planning er synlig, men er ikke købt");
    for (const k of ["warehouse", "unitbooking"]) {
      assert.ok(!top.includes(k), `${k} er synlig, men er ikke købt`);
    }
  });

  it("Warehouse + Unitbooking + nødvendig Kunder: ser de to, ikke andre driftsmoduler", () => {
    /* ⚠ Warehouse KRÆVER Kunder — MODUL_KRAEVER i moduler.js — så "nødvendig
       Kunder" her er ikke en ekstra forudsætning denne prøve opfinder, det
       er den eksisterende regel gjort eksplicit. */
    const moduler = modulsaet(["warehouse", "unitbooking", "kunder"]);
    const menu = renderetMenu({ moduler, perms: ADMIN_PERMS });
    const top = noegler(menu);
    assert.ok(top.includes("warehouse"), "Warehouse mangler");
    assert.ok(top.includes("unitbooking"), "Unitbooking mangler");
    for (const k of ["booking", "flaade", "facility", "indkoeb", "bemanding"]) {
      assert.ok(!top.includes(k), `${k} er synlig, men er ikke købt`);
    }
  });

  it("⚠ FULD TENANT: admin mister ingen købte, V1-synlige områder", () => {
    const moduler = modulsaet(VALGFRIE_MODULER);
    const menu = renderetMenu({ moduler, perms: ADMIN_PERMS });
    assert.deepEqual(noegler(menu), NAV.map((m) => m.key).sort(),
      "admin med alle moduler ser ikke alle topniveaupunkter");
  });

  it("⚠ HIDE/LATER FRA SKIVE 1 FORBLIVER SKJULT — også for fuld tenant + admin", () => {
    const moduler = modulsaet(VALGFRIE_MODULER);
    const menu = renderetMenu({ moduler, perms: ADMIN_PERMS });
    const synligeStier = new Set(menu.flatMap((m) => m.synligeBorn.map((b) => b.sti)));
    for (const sti of SKJULT_I_SKIVE_1) {
      assert.ok(!synligeStier.has(sti), `"${sti}" er synlig igen — Skive 1's HIDE/LATER er brudt`);
    }
    /* Og de findes stadig i ALLE — HIDE er "skjult i menuen", ikke "fjernet". */
    for (const sti of SKJULT_I_SKIVE_1) {
      assert.ok(ALLE.some((p) => p.sti === sti), `"${sti}" er forsvundet fra ALLE, ikke kun skjult`);
    }
  });

  /**
   * ⚠ CHAUFFØREN NÅR ALDRIG DENNE MENU. Den strukturelle spærring
   * (beslutning 117: `erChauffoer` sender ham til `/app/*`, uden om
   * AppShell/sidebaren) er UÆNDRET af Skive 2A — App.jsx er ikke rørt i
   * denne skive, og `test/chaufforadgang.test.mjs` prøver netop den
   * mekanisme. Denne prøve bekræfter kun det snævre spørgsmål der ER
   * relevant for et nav.js-redesign: giver chaufførens EGET permission-sæt
   * adgang til noget af det nye (fakturacenter's kraeverPerm)? Svaret skal
   * fortsat være nej, uafhængigt af at han aldrig ser skærmen.
   */
  it("⚠ CHAUFFØREN FÅR IKKE ADGANG TIL DE NYE TOPNIVEAUPUNKTER VIA PERMISSION-AKSEN", () => {
    const chauffoerPerms = permStrengFraRolle("chauffoer");
    const moduler = modulsaet(VALGFRIE_MODULER);
    const menu = renderetMenu({ moduler, perms: chauffoerPerms });
    const top = noegler(menu);
    assert.ok(!top.includes("fakturacenter"),
      "chaufføren ser Fakturaer & bilag, men har ikke indkoeb.laes");
    /* Kunder er kun modul-gatet (ingen kraeverPerm), så den er upåvirket af
       permission-aksen — det bekræftes her for at vise at forskellen er
       bevidst, ikke en tilfældighed. */
    assert.ok(top.includes("kunderOversigt"),
      "Kunder er forsvundet for chaufføren — den skal kun være modul-gatet");
  });

  it("⚠ APP.JSX ER IKKE RØRT AF SKIVE 2A", () => {
    /* Den strukturelle chauffør-spærring hører til App.jsx, ikke nav.js.
       Skive 2A er navigations-KUN — App.jsx skal stadig indeholde nøjagtig
       den samme catch-all som chaufforadgang.test.mjs prøver. */
    const app = readFileSync("src/App.jsx", "utf8");
    assert.match(app, /erChauffoer\s*=\s*bruger\?\.rolle\s*===\s*"chauffoer"/,
      "App.jsx's chauffør-gate er ændret — det hører ikke til i en navigationsskive");
  });
});

describe("Skive 2A — strukturelle invarianter", () => {
  it("hvert topniveaupunkt hører til én af de fire kendte grupper", () => {
    const KENDTE = new Set(["faelles", "drift", "admin", "hjaelp"]);
    for (const m of NAV) {
      assert.ok(KENDTE.has(m.gruppe), `${m.key} har ${m.gruppe ? `en ukendt gruppe "${m.gruppe}"` : "ingen gruppe"}`);
    }
  });

  it("Fælles-gruppen indeholder præcis Dashboard, Kunder, Fakturaer & bilag, Økonomi/Fakturagrundlag", () => {
    const faelles = NAV.filter((m) => m.gruppe === "faelles").map((m) => m.key);
    assert.deepEqual(faelles, ["dashboard", "kunderOversigt", "fakturacenter", "oekonomi"]);
  });

  it("Driftsmoduler-gruppen står i rækkefølgen Planning, Fleet, Facility, Procure, Warehouse, Unitbooking, Workforce", () => {
    const drift = NAV.filter((m) => m.gruppe === "drift").map((m) => m.key);
    assert.deepEqual(drift,
      ["booking", "flaade", "facility", "indkoeb", "warehouse", "unitbooking", "bemanding"]);
  });

  it("Administration er Opsætning, Hjælp er Hjælp — hver sin egen gruppe", () => {
    assert.deepEqual(NAV.filter((m) => m.gruppe === "admin").map((m) => m.key), ["opsaetning"]);
    assert.deepEqual(NAV.filter((m) => m.gruppe === "hjaelp").map((m) => m.key), ["support"]);
  });

  it("Fakturaer & bilag er UÆNDRET tilgængelig — samme rute, samme kraeverPerm som før flytningen", () => {
    const punkt = NAV.find((m) => m.key === "fakturacenter");
    assert.equal(punkt.sti, "/oekonomi/fakturacenter",
      "ruten er ændret — Skive 2A må kun flytte MENUPLADSEN");
    assert.equal(punkt.kraeverPerm, "indkoeb.laes",
      "kraeverPerm er ændret — fakturaer.*-permissionmodellen hører til en senere delskive");
    assert.equal(punkt.kraeverModul, undefined,
      "Fakturaer & bilag har fået en modulklausul den ikke havde før — det ville gøre den SMALLERE end i dag, ikke bredere, men stadig en utilsigtet ændring");
  });

  it("Kunder er UÆNDRET tilgængelig — samme rute, samme kraeverModul som før flytningen", () => {
    const punkt = NAV.find((m) => m.key === "kunderOversigt");
    assert.equal(punkt.sti, "/opsaetning/kunder",
      "ruten er ændret — Skive 2A må kun flytte MENUPLADSEN");
    assert.equal(punkt.kraeverModul, "kunder");
    assert.equal(punkt.kraeverPerm, undefined,
      "Kunder har fået en permission-spærring den ikke havde før");
  });

  it("Standardpriser og Kundepriser bliver stående under Opsætning i denne skive", () => {
    /* Matrix-# 48 (fane på kundens profil) er en senere MERGE/FINISH-opgave
       — se nav.js's kommentar. Denne prøve låser at 2A ikke ved et uheld
       flyttede dem med Kunder. */
    const opsaetning = NAV.find((m) => m.key === "opsaetning");
    const boernNoegler = opsaetning.born.map((b) => b.key);
    for (const k of ["standardpriser", "kundepriser", "kundepriserEn"]) {
      assert.ok(boernNoegler.includes(k), `${k} er ikke længere under Opsætning`);
    }
    assert.ok(!boernNoegler.includes("kunderOversigt"),
      "kunderOversigt står stadig som barn under Opsætning — den skulle blive et topniveaupunkt");
  });

  it("Leverandører er IKKE flyttet i denne skive", () => {
    /* Eksplicit undtaget af opgavebeskrivelsen: "flyt ikke Leverandører
       endnu". Den skal stadig stå som barn under Procure. */
    const procure = NAV.find((m) => m.key === "indkoeb");
    assert.ok(procure.born.some((b) => b.key === "leverandoerer"),
      "Leverandører er flyttet ud af Procure — det hører til en senere delskive");
    assert.ok(!NAV.some((m) => m.key === "leverandoerer"),
      "Leverandører er blevet et topniveaupunkt — det hører til en senere delskive");
  });

  it("ingen rolle ser flere topniveaupunkter end ALLE roller tilsammen skulle kunne", () => {
    /* Groft sikkerhedsnet: en rolle må aldrig se et topniveaupunkt der ikke
       findes i NAV, uanset modul-/permission-kombination. */
    const alleTopNoegler = new Set(NAV.map((m) => m.key));
    for (const rolle of Object.keys(ROLLE_PERMS)) {
      const menu = renderetMenu({
        moduler: modulsaet(VALGFRIE_MODULER),
        perms: permStrengFraRolle(rolle),
      });
      for (const m of menu) {
        assert.ok(alleTopNoegler.has(m.key), `${rolle} ser et ukendt punkt: ${m.key}`);
      }
    }
  });
});
