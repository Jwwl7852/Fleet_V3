/* test/dashboards.test.mjs
 * Dashboardkataloget holdt op mod kpi/ og mod ruterne.
 *
 * ⚠ HVORFOR DEN HER FIL FINDES. Hvert tal på et dashboard er en STI ind i
 * `kpi/` — "flaade.udeAfDrift". En tastefejl i en sti fejler ikke: opslaget
 * svarer null, og skærmen skriver INTET (—). Og "—" er en tilstand systemet
 * har MED VILJE, nemlig "ikke aggregeret endnu". En forkert sti ser altså
 * nøjagtig ud som et felt der venter på aggregeringen, og den forskel kan
 * ingen se på skærmen.
 *
 * Prøven er derfor ikke pænhed. Den er den eneste måde at skelne de to på.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SAMLET, DASHBOARDS, ALLE_DASHBOARDS, MODULKORT, HANDLINGER,
  tilgaengelige, kpiVaerdi, kapacitetsgrad, kortTal, handlinger,
} from "../src/fleet/dashboards.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { ALLE_MODULER, MODUL } from "../src/fleet/moduler.js";
import { ALLE_PRIORITETER } from "../src/fleet/prioritet.js";

const DIVISIONER = ["gods", "bus"];

describe("katalogets nøgler er modulernes", () => {
  it("⚠ INGEN EGNE NAVNE — `flaade`, ikke `fleet`", () => {
    /* Et eget navnerum her ville betyde en oversættelsestabel mere, og den
       slags driver. harModul() slår op på modulnøglen. */
    for (const d of DASHBOARDS) {
      if (d.key === SAMLET) continue;
      assert.ok(ALLE_MODULER.includes(d.key),
        `dashboardet "${d.key}" svarer ikke til et modul i moduler.js`);
    }
  });

  it("samlet er ikke et modul, og det er det eneste altid-punkt", () => {
    assert.ok(!ALLE_MODULER.includes(SAMLET));
    assert.deepEqual(DASHBOARDS.filter((d) => d.altid).map((d) => d.key), [SAMLET]);
  });

  it("⚠ LABELET KOMMER FRA MODULKATALOGET, ikke fra et nyt map", () => {
    /* Ellers kunne Dashboardet sige "Indkøb" hvor sidebaren siger "Procure". */
    for (const d of DASHBOARDS) {
      if (d.key === SAMLET) continue;
      assert.equal(d.label, MODUL[d.key].label,
        `${d.key} hedder "${d.label}" her og "${MODUL[d.key].label}" i moduler.js`);
    }
  });

  it("en kunde ser kun de moduler han har — plus samlet", () => {
    const kun = tilgaengelige((m) => m === "flaade");
    assert.deepEqual(kun.map((d) => d.key), [SAMLET, "flaade"]);
    /* ⚠ SAMLET FORSVINDER ALDRIG. Den er samlingen, ikke en af delene — og en
       kunde uden nogen valgfrie moduler skal stadig have en forside. */
    assert.deepEqual(tilgaengelige(() => false).map((d) => d.key), [SAMLET]);
  });
});

describe("⚠ HVER FELTSTI RAMMER ET FELT DER FINDES", () => {
  /* Den vigtigste prøve i filen. Se hovedet: en forkert sti ser ud som et
     ubesvaret nøgletal, og den forskel kan ingen se på skærmen. */

  it("modulkortenes tal findes i kpi/ — i BEGGE divisioner", () => {
    const mangler = [];
    for (const division of DIVISIONER) {
      const kpi = DEMO_KPI[division];
      for (const [modul, kort] of Object.entries(MODULKORT)) {
        for (const post of kort.tal || []) {
          if (post.afledt) continue;
          if (kpiVaerdi(kpi, post.felt) === null) {
            mangler.push(`${division}/${modul} → ${post.felt}`);
          }
        }
      }
    }
    assert.deepEqual(mangler, [], "feltstier uden et felt i demo-kpi.js");
  });

  it("handlingernes tal findes også", () => {
    const mangler = [];
    for (const division of DIVISIONER) {
      for (const h of HANDLINGER) {
        if (kpiVaerdi(DEMO_KPI[division], h.felt) === null) {
          mangler.push(`${division}/${h.key} → ${h.felt}`);
        }
      }
    }
    assert.deepEqual(mangler, []);
  });

  it("⚠ kpiVaerdi SVARER null, IKKE undefined OG IKKE 0", () => {
    /* De tre skal ikke kunne skelnes af forbrugeren: skærmen skriver INTET
       for et manglende felt og for et null-felt. Svarede den undefined for en
       forkert sti, ville en tastefejl få sin egen visning. */
    assert.equal(kpiVaerdi(DEMO_KPI.gods, "findes.ikke"), null);
    assert.equal(kpiVaerdi(DEMO_KPI.gods, "flaade.findesIkke"), null);
    assert.equal(kpiVaerdi(null, "flaade.aktive"), null);
    assert.equal(kpiVaerdi(DEMO_KPI.gods, null), null);
    /* Men et rigtigt nul er stadig nul — ikke null. */
    assert.equal(kpiVaerdi({ a: { b: 0 } }, "a.b"), 0);
  });
});

describe("de afledte tal", () => {
  it("kapacitetsgraden regnes af to felter der begge står i kpi/", () => {
    const k = DEMO_KPI.gods;
    assert.equal(kapacitetsgrad(k), (k.bemanding.disponeret / k.bemanding.planlagt) * 100);
  });

  it("⚠ GATEN STÅR FØR REGNESTYKKET — null / 58 er 0, ikke null", () => {
    /* Et regnestykke på null giver STILLE et tal, og 0 % kapacitet ligner en
       måling af en flåde der står stille. Se noten ved deviationPct(). */
    assert.equal(kapacitetsgrad({ bemanding: { disponeret: null, planlagt: 58 } }), null);
    assert.equal(kapacitetsgrad({ bemanding: { disponeret: 48, planlagt: null } }), null);
    /* Og en nævner på nul er ikke uendelig kapacitet. */
    assert.equal(kapacitetsgrad({ bemanding: { disponeret: 48, planlagt: 0 } }), null);
    assert.equal(kapacitetsgrad(null), null);
  });

  it("kortTal svarer ens for et felt og en afledning", () => {
    const k = DEMO_KPI.gods;
    const felt = kortTal(k, { felt: "flaade.aktive", label: "L", form: "antal" });
    assert.equal(felt.vaerdi, k.flaade.aktive);
    const afledt = kortTal(k, { afledt: "kapacitet", label: "L", form: "pct" });
    assert.equal(afledt.vaerdi, kapacitetsgrad(k));
    /* En ukendt afledning må ikke kaste — den svarer null, som et manglende felt. */
    assert.equal(kortTal(k, { afledt: "findesIkke", label: "L" }).vaerdi, null);
  });
});

describe("⚠ ET MODUL UDEN TAL SIGER DET — det udelades ikke", () => {
  const uden = Object.entries(MODULKORT).filter(([, k]) => k.mangler);

  it("warehouse og unitbooking er dem der mangler", () => {
    /* Bliver listen kortere, er det fordi aggregeringen er bygget — og så
       skal `mangler` væk i samme ombæring. Bliver den længere, har nogen
       tilføjet et modul uden tal, og det skal ses. */
    assert.deepEqual(uden.map(([m]) => m).sort(), ["unitbooking", "warehouse"]);
  });

  it("et kort har ENTEN tal ELLER mangler — aldrig begge", () => {
    /* Begge dele ville betyde et kort der både viser tal og siger at tallene
       ikke findes. */
    for (const [modul, kort] of Object.entries(MODULKORT)) {
      assert.ok(Boolean(kort.tal) !== Boolean(kort.mangler),
        `${modul} har både tal og mangler — eller ingen af delene`);
    }
  });

  it("hvert manglende felt er navngivet med sin fulde sti, og en grund", () => {
    /* "Tallene mangler" er ikke en oplysning. Feltnavnet er dét man kan
       skrive aggregeringen efter. */
    for (const [modul, kort] of uden) {
      assert.ok(kort.mangler.length >= 1, modul);
      for (const f of kort.mangler) {
        assert.match(f, /^[a-z]+\.[a-zA-Z]+$/, `${modul}: "${f}" er ikke en feltsti`);
      }
      assert.ok(kort.hvorfor && kort.hvorfor.length > 40,
        `${modul} mangler en begrundelse`);
    }
  });

  it("⚠ OG DE STÅR IKKE I kpi/ ENDNU — ellers er noten forkert", () => {
    /* Får et af felterne en værdi uden at `mangler` bliver fjernet, står der
       en besked om et hul der er lukket. Det er værre end ingen besked. */
    for (const [modul, kort] of uden) {
      for (const f of kort.mangler) {
        for (const division of DIVISIONER) {
          assert.equal(kpiVaerdi(DEMO_KPI[division], f), null,
            `${modul}: ${f} FINDES nu i kpi/ — fjern den fra mangler[]`);
        }
      }
    }
  });
});

describe("prioriterede handlinger", () => {
  it("⚠ ET UBESVARET FELT GIVER INGEN HANDLING", () => {
    /* null er ikke nul. `null >= 1` er false i JavaScript, men det er held og
       ikke en beslutning — `null >= 0` er true. Gaten står på
       Number.isFinite(), så en ændring i grænsen ikke lader ubesvarede felter
       blive til noget nogen skal reagere på. */
    const tom = handlinger({ flaade: { udeAfDrift: null } });
    assert.deepEqual(tom, []);
  });

  it("⚠ ET NUL ER HELLER IKKE EN HANDLING", () => {
    /* "0 fakturaer til godkendelse" er ikke en handling, det er fraværet af
       en. Før stod fem rækker fast uanset tallet. */
    const nul = handlinger({ indkoeb: { fakturaerTilGodkendelse: 0 } });
    assert.deepEqual(nul, []);
  });

  it("⚠ ET MODUL KUNDEN IKKE HAR, GIVER INGEN HANDLING", () => {
    /* Ellers stod der "5 fakturaer venter" hos en vognmand uden Procure —
       med et link til en skærm han ikke kan åbne. */
    const kun = handlinger(DEMO_KPI.gods, { harModulFn: (m) => m === "flaade" });
    assert.ok(kun.length > 0);
    for (const h of kun) assert.equal(h.modul, "flaade");
  });

  it("bærer tallet med, så listen og kortet ikke kan være uenige", () => {
    const alle = handlinger(DEMO_KPI.gods);
    for (const h of alle) {
      assert.equal(h.antal, kpiVaerdi(DEMO_KPI.gods, h.felt),
        `${h.key} viser et andet tal end sit felt`);
    }
  });

  it("⚠ PRIORITETEN ER DET DELTE KATALOG — ikke et fjerde ordforråd", () => {
    for (const h of HANDLINGER) {
      assert.ok(ALLE_PRIORITETER.includes(h.prioritet),
        `${h.key} har prioritet "${h.prioritet}", som ikke findes i prioritet.js`);
    }
  });
});

describe("hvert link fører et sted hen", () => {
  /* Samme mekanik som moduler.test.mjs: en sti uden en Route giver en tom
     side, og hverken build eller de øvrige prøver kan se det. */
  const app = readFileSync("src/App.jsx", "utf8");
  const ruter = new Set([...app.matchAll(/<Route\s+path="([^"]*)"/g)].map((m) => m[1]));
  const harRute = (sti) => ruter.has(sti.replace(/^\//, "").split("?")[0]);

  it("modulkortenes stier", () => {
    for (const [modul, kort] of Object.entries(MODULKORT)) {
      assert.ok(harRute(kort.sti), `${modul} peger på ${kort.sti}, som ingen Route har`);
    }
  });

  it("handlingernes stier — også dem med et forespørgselsled", () => {
    /* ⚠ ?vis=forsinkede hører til ruten, ikke til stien. Uden split("?")
       ville prøven lede efter en Route der hed "flaade/koe?vis=forsinkede". */
    for (const h of HANDLINGER) {
      assert.ok(harRute(h.sti), `${h.key} peger på ${h.sti}, som ingen Route har`);
    }
  });

  it("hvert dashboard uden for samlet har et modulkort", () => {
    /* Ellers kunne man vælge et dashboard der viste ingenting. */
    for (const key of ALLE_DASHBOARDS) {
      if (key === SAMLET) continue;
      assert.ok(MODULKORT[key], `dashboardet "${key}" har intet kort`);
    }
  });
});
