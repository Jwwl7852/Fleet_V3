/* test/skive2b-menu.test.mjs
 * Skive 2B — det FAKTISK RENDEREDE menutræ, med navvisning oven på Skive 2A.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * test/navvisning.test.mjs prøver den RENE logik (`erSkjultVedNavvisning()`,
 * `synligeOmraader()`) isoleret. Den fil her prøver det bruger-observerbare
 * spørgsmål: hvad renderer AppShell FAKTISK for en given
 * {rolle, moduler, navvisning}-kombination? De ni scenarier nedenfor er
 * opgavebeskrivelsens egne, ordret.
 *
 * `renderetMenu()` er en ren genimplementering af AppShell.jsx's
 * `synligeToppunkter` — samme filterkæde, samme rækkefølge (modul → perm →
 * børn → navvisning SIDST), ikke en tilnærmelse. Se samme greb i
 * test/skive2a-navigation.test.mjs og test/navadgang.test.mjs.
 *
 * ⚠ MODULSYNLIGHED, IKKE SERVERADGANG. Ligesom skive2a-navigation.test.mjs
 * måler denne fil kun hvad der TEGNES. Den rører hverken
 * firebase.rules.json eller nogen Cloud Function-logik — det er
 * navvisning.test.mjs's "håndhævelsen"-beskrivelse og rules.tenant-familien
 * der prøver serversiden.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NAV, ALLE } from "../src/fleet/nav.js";
import { harModul, modulsaet, VALGFRIE_MODULER, MODUL } from "../src/fleet/moduler.js";
import { ROLLE_PERMS, harPerm, permStrengFraRolle } from "../src/fleet/permissions.js";
import { erSkjultVedNavvisning } from "../src/fleet/navvisning.js";

/**
 * ⚠ SAMME LOGIK SOM AppShell.jsx's `synligeToppunkter` — se filens hoved.
 * `navvisning` er valgfri; udeladt/undefined/null betyder "ingen post",
 * præcis som `usePost()`'s `post: null` før noget er skrevet.
 */
function renderetMenu({ moduler, perms, navvisning = null }) {
  const modulNavn = (m) => m.kraeverModul || (MODUL[m.key] ? m.key : null);
  const synligeBorn = (m) => (m.born || [])
    .filter((b) => !b.skjulINav)
    .filter((b) => !b.kraeverModul || harModul(moduler, b.kraeverModul))
    .filter((b) => !b.kraeverPerm || harPerm(perms, b.kraeverPerm));
  return NAV
    .filter((m) => { const n = modulNavn(m); return !n || harModul(moduler, n); })
    .filter((m) => !m.kraeverPerm || harPerm(perms, m.kraeverPerm))
    .filter((m) => !m.born?.length || synligeBorn(m).length)
    .filter((m) => !erSkjultVedNavvisning(m.key, navvisning));
}

const noegler = (menu) => menu.map((m) => m.key).sort();
const FULD_TENANT = modulsaet(VALGFRIE_MODULER);

describe("Skive 2B — 1) Ingen navvisning-post: identisk med Skive 2A", () => {
  const scenarier = [
    { navn: "lagermedarbejder, fuld tenant", moduler: FULD_TENANT, rolle: "lagermedarbejder" },
    { navn: "disponent, fuld tenant", moduler: FULD_TENANT, rolle: "disponent" },
    { navn: "admin, fuld tenant", moduler: FULD_TENANT, rolle: "admin" },
    { navn: "admin, kun Planning+Kunder", moduler: modulsaet(["booking", "kunder"]), rolle: "admin" },
  ];

  for (const s of scenarier) {
    it(`⚠ ${s.navn}: navvisning=null/undefined/{} giver samme menu`, () => {
      const perms = permStrengFraRolle(s.rolle);
      const uden2b = renderetMenu({ moduler: s.moduler, perms }); // ingen navvisning-parameter overhovedet
      const medNull = renderetMenu({ moduler: s.moduler, perms, navvisning: null });
      const medUndefined = renderetMenu({ moduler: s.moduler, perms, navvisning: undefined });
      const medTomPost = renderetMenu({ moduler: s.moduler, perms, navvisning: {} });
      assert.deepEqual(noegler(medNull), noegler(uden2b));
      assert.deepEqual(noegler(medUndefined), noegler(uden2b));
      assert.deepEqual(noegler(medTomPost), noegler(uden2b),
        "en TOM post (admin har rørt skærmen uden at skjule noget) skal stadig vise alt");
    });
  }
});

describe("Skive 2B — 2) Lagermedarbejder, navvisning tillader kun Warehouse + Unitbooking", () => {
  const perms = permStrengFraRolle("lagermedarbejder");
  /* ⚠ ALLE ELLERS TILGÆNGELIGE DRIFTSOMRÅDER SLÅS EKSPLICIT FRA. En
     admin ville i praksis kun skrive false for det der skal skjules — men
     testen er strengere med vilje: den viser at ETHVERT andet driftsområde,
     også dem lagermedarbejderen i forvejen kunne se, forsvinder. */
  const navvisning = {
    kunderOversigt: false, fakturacenter: false, oekonomi: false,
    booking: false, flaade: false, facility: false, indkoeb: false,
    bemanding: false, opsaetning: false,
    // warehouse og unitbooking IKKE nævnt → forbliver synlige (standard).
  };
  const menu = renderetMenu({ moduler: FULD_TENANT, perms, navvisning });
  const top = noegler(menu);

  it("Dashboard er synlig", () => assert.ok(top.includes("dashboard")));
  it("Warehouse er synlig", () => assert.ok(top.includes("warehouse")));
  it("Unitbooking er synlig", () => assert.ok(top.includes("unitbooking")));
  it("Hjælp (support) er synlig", () => assert.ok(top.includes("support")));
  it("Planning/Fleet/Facility/Procure/Workforce er skjult", () => {
    for (const k of ["booking", "flaade", "facility", "indkoeb", "bemanding"]) {
      assert.ok(!top.includes(k), `${k} er stadig synlig`);
    }
  });
});

describe("Skive 2B — 3) Disponent, navvisning med kun Planning + Fleet", () => {
  const perms = permStrengFraRolle("disponent");
  /* Disponenten er i forvejen berettiget til hele driftssiden (fuld
     tenant); navvisning vælger kun to af dem. */
  const navvisning = { facility: false, indkoeb: false, warehouse: false, unitbooking: false, bemanding: false };
  const menu = renderetMenu({ moduler: FULD_TENANT, perms, navvisning });
  const drift = menu.filter((m) => m.gruppe === "drift").map((m) => m.key).sort();

  it("kun Planning og Fleet vises blandt driftsområderne han ellers var berettiget til", () => {
    assert.deepEqual(drift, ["booking", "flaade"]);
  });
  it("Dashboard og Hjælp er upåvirkede", () => {
    const top = noegler(menu);
    assert.ok(top.includes("dashboard") && top.includes("support"));
  });
});

describe("Skive 2B — 4) Navvisning af et område kunden IKKE har købt", () => {
  it("forbliver skjult, selvom navvisning eksplicit slår det TIL", () => {
    /* Tenanten har IKKE warehouse. En admin (ved en fejl, eller ondsindet)
       sætter navvisning.warehouse = true — det må ikke dukke op. */
    const moduler = modulsaet(["booking", "kunder"]); // ingen warehouse
    const perms = permStrengFraRolle("admin");
    const menu = renderetMenu({ moduler, perms, navvisning: { warehouse: true } });
    assert.ok(!noegler(menu).includes("warehouse"),
      "et ikke-købt modul blev synligt via navvisning");
  });
});

describe("Skive 2B — 5) Navvisning af et område eksisterende permission-gating allerede skjuler", () => {
  it("forbliver skjult for en chauffør, selvom navvisning eksplicit slår det TIL", () => {
    /* Chaufføren har ikke fakturaer.laes (Skive 4A; var indkoeb.laes) —
       fakturacenter (Fakturaer & bilag) er derfor allerede permission-skjult,
       uanset moduler. */
    const perms = permStrengFraRolle("chauffoer");
    const menu = renderetMenu({ moduler: FULD_TENANT, perms, navvisning: { fakturacenter: true } });
    assert.ok(!noegler(menu).includes("fakturacenter"),
      "et permission-spærret område blev synligt via navvisning");
  });
});

describe("Skive 2B — 6) Admin uden navvisning mister intet i forhold til Skive 2A", () => {
  it("admin, fuld tenant, ingen navvisning-post: ser alle topniveaupunkter", () => {
    const perms = permStrengFraRolle("admin");
    const menu = renderetMenu({ moduler: FULD_TENANT, perms });
    assert.deepEqual(noegler(menu), NAV.map((m) => m.key).sort());
  });
});

describe("Skive 2B — 7) Dashboard og Hjælp kan ikke skjules via navvisning", () => {
  it("selv et eksplicit forsøg på at skjule dem fejler at gøre det", () => {
    const perms = permStrengFraRolle("admin");
    const menu = renderetMenu({
      moduler: FULD_TENANT, perms,
      navvisning: { dashboard: false, support: false },
    });
    const top = noegler(menu);
    assert.ok(top.includes("dashboard"), "Dashboard forsvandt");
    assert.ok(top.includes("support"), "Hjælp (support) forsvandt");
  });
});

describe("Skive 2B — 8) Direkte route: navvisning ændrer ikke route-/serverpermission-resultatet", () => {
  const APP = readFileSync("src/App.jsx", "utf8");
  const ruter = new Set([...APP.matchAll(/<Route\s+path="([^"]*)"/g)].map((m) => m[1]));
  const harIndeks = /<Route\s+index/.test(APP);
  const harRute = (sti) => (sti === "/" ? harIndeks : ruter.has(sti.replace(/^\//, "")));

  it("⚠ HVERT SKJULT OMRÅDES RUTER FINDES STADIG UÆNDRET I App.jsx OG ALLE", () => {
    /* Skjul ALT via navvisning og bekræft at ruterne alligevel er der —
       "skjult i menu" ≠ "forbudt at åbne". */
    const perms = permStrengFraRolle("admin");
    const altSkjult = Object.fromEntries(
      NAV.map((m) => [m.key, false]).filter(([k]) => k !== "dashboard" && k !== "support"));
    const menu = renderetMenu({ moduler: FULD_TENANT, perms, navvisning: altSkjult });
    assert.ok(menu.every((m) => m.key === "dashboard" || m.key === "support"),
      "noget overlevede at blive slået fra — testen selv er forkert opsat");

    for (const m of NAV) {
      const born = m.born?.length ? m.born : [m];
      for (const b of born) {
        assert.ok(harRute(b.sti), `${b.sti} har ingen rute i App.jsx`);
        assert.ok(ALLE.some((p) => p.sti === b.sti), `${b.sti} er forsvundet fra ALLE`);
      }
    }
  });

  it("⚠ App.jsx FILTRERER INGEN RUTE PÅ navvisning", () => {
    assert.doesNotMatch(APP, /navvisning/i,
      "App.jsx kender navvisning — routing skal være uafhængig af den");
  });
});

describe("Skive 2B — 9) Et ukendt nav-key i navvisning gør intet nyt synligt", () => {
  it("et opdigtet område-navn ændrer ikke menuen", () => {
    const perms = permStrengFraRolle("admin");
    const uden = renderetMenu({ moduler: FULD_TENANT, perms });
    const med = renderetMenu({
      moduler: FULD_TENANT, perms,
      navvisning: { rumfart: true, ukendtOmraade: false },
    });
    assert.deepEqual(noegler(med), noegler(uden));
  });
});

describe("Skive 2B — groft sikkerhedsnet på tværs af alle roller", () => {
  it("ingen rolle ser mere med navvisning end uden — kun mindre eller ens", () => {
    for (const rolle of Object.keys(ROLLE_PERMS)) {
      const perms = permStrengFraRolle(rolle);
      const uden = new Set(noegler(renderetMenu({ moduler: FULD_TENANT, perms })));
      /* Et navvisning-forsøg der slår ALT konfigurerbart fra plus nogle
         opdigtede navne — resultatet skal være en DELMÆNGDE af `uden`. */
      const uartig = Object.fromEntries(NAV.map((m) => [m.key, false]));
      uartig.opdigtetOmraade = false;
      const med = new Set(noegler(renderetMenu({ moduler: FULD_TENANT, perms, navvisning: uartig })));
      for (const k of med) {
        assert.ok(uden.has(k), `${rolle}: "${k}" er synlig MED navvisning men ikke uden — det er en udvidelse`);
      }
    }
  });
});
