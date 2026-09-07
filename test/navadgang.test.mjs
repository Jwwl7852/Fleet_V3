/* test/navadgang.test.mjs
 * Et menupunkt der fører til en afvist læsning — og noten der siger hvorfor.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Beslutning 104 gav ti noder en læse-permission. Målt bagefter: **18 af 59
 * skærme havde mindst én afvist læsning for en chauffør** — han så alle 54
 * menupunkter, og en femtedel af dem åbnede en spærring.
 *
 * Det er nøjagtig den sætning jeg brugte i beslutning 103 til at nægte
 * chaufførappen en sidebar: *en menu der mest består af døre der ikke kan
 * åbnes, er værre end ingen menu.* Den gjaldt også kontorskærmen — jeg havde
 * bare ikke målt den.
 *
 * ⚠ MENUEN TIER, ADGANGEN ÆNDRES IKKE. `kraeverPerm` skjuler et punkt; ruten
 * findes uændret, og reglen afviser stadig. Et menupunkt der forsvandt, må
 * aldrig være det eneste der spærrer — det er forskellen på en spærring og en
 * pæn knap, og prøverne nedenfor holder begge ender.
 *
 * Se beslutning 105.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";

import { ALLE, NAV } from "../src/fleet/nav.js";
import { PERM, ROLLE_PERMS, harPerm, permStrengFraRolle } from "../src/fleet/permissions.js";

const KENDTE_PERMS = new Set(Object.values(PERM));

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules.tenants.$tenantId;

/* ⚠ DEN DELTE, IKKE EN LOKAL KOPI — se test/kode.mjs og beslutning 106. */

/** Den læse-permission en node kræver — eller null. */
const permForNode = (node) => {
  const v = REGLER[node]?.[".read"];
  if (typeof v !== "string") return null;
  const m = [...v.matchAll(/perms\.contains\('\|([^|]+)\|'\)/g)]
    .map((x) => x[1])
    .filter((perm) => KENDTE_PERMS.has(perm));
  return m.length ? m[0] : null;
};

/* ---- Rute → skærmfil, udledt af App.jsx ------------------------------- */

const APP = readFileSync("src/App.jsx", "utf8");
const LAZY = Object.fromEntries(
  [...APP.matchAll(/const (\w+) = lazy\(\(\) => import\("\.\/moduler\/([^"]+)"\)\)/g)]
    .map((m) => [m[1], m[2]]));
const FIL_FOR = {};
for (const m of APP.matchAll(/<Route path="([^"]*)" element=\{<(\w+) \/>\}/g)) {
  if (LAZY[m[2]]) FIL_FOR["/" + m[1].replace(/^\//, "")] = `src/moduler/${LAZY[m[2]]}`;
}

/** De noder en skærm faktisk læser.
 *
 * ⚠ TO FORMER, IKKE ÉN. `useListe("node", …)`/`usePost("node", …)` har
 * nodenavnet som FØRSTE argument — men `usePost(null, "node", …)` er den
 * etablerede form for "en node der ER en post" (se usePost.js), og der
 * står nodenavnet som ANDET argument, efter et bogstaveligt `null`. Et
 * regex der kun kendte den første form, ville se en skærm der UDELUKKENDE
 * læser en spærret post via `usePost(null, …)` som om den intet læste —
 * nøjagtig den slags lint der springer noget over og siger ingenting
 * (CLAUDE.md). Fundet da Opsætning → Procure → Godkendelsesreglers
 * `usePost(null, "godkendelsesregler", …)` faldt igennem. */
const noderI = (fil) => {
  let t;
  try { t = udenKommentarer(readFileSync(fil, "utf8")); } catch { return []; }
  const almindelig = [...t.matchAll(/use(?:Liste|Post)\(\s*[`"]([a-zA-Z/]+)/g)].map((m) => m[1]);
  const nodeSomPost = [...t.matchAll(/usePost\(\s*null\s*,\s*[`"]([a-zA-Z/]+)/g)].map((m) => m[1]);
  return [...new Set([...almindelig, ...nodeSomPost].map((n) => n.split("/")[0]))];
};

/** De permissions en skærms egne opslag kræver. */
const permsForPunkt = (p) => {
  const fil = FIL_FOR[p.sti];
  if (!fil) return [];
  return [...new Set(noderI(fil).map(permForNode).filter(Boolean))];
};

/**
 * Punkter der læser en spærret node UDEN at bære `kraeverPerm` — med en grund.
 *
 * ⚠ FELTET SÆTTES HVOR SKÆRMENS EMNE ER SPÆRRET, ikke hvor den tilfældigvis
 * læser en spærret node. De tre her slår op i `leverandoerer` for at skrive et
 * NAVN; uden `indkoeb.laes` mangler en kolonne, og skærmen er stadig den
 * vigtigste den pågældende rolle har.
 *
 * ⚠ OG DET ER MÅLT AT DE IKKE BLANKER: alle tre kalder `blokerer()` på
 * nøgletallene og på deres egen hovedliste — ikke på leverandørlisten. En tom
 * leverandørliste giver `leverandoerNavn()` id'et råt (beslutning 95), ikke en
 * anklage om at data mangler.
 */
const UDEN_KRAEVERPERM = {
  disponering:
    "slår op i `leverandoerer` for at skrive et navn på en værkstedsopgave. "
    + "Uden `indkoeb.laes` står id'et i stedet — og Disponering er disponentens "
    + "vigtigste skærm. Den blokerer på nøgletallene, ikke på kartoteket.",
  vaerksted:
    "samme: Værkstedskalenderen viser hvem der servicerer, og blokerer på "
    + "`opgaver` og `indberetninger`. En manglende leverandørkolonne gør ikke "
    + "kalenderen ubrugelig.",
  arbejdskoe:
    "samme kartoteksopslag som Værkstedskalenderen, samme skærm-familie.",
  servicekalender:
    "samme: Facility-servicekalenderen navngiver leverandøren på et besøg og "
    + "blokerer på `opgaver`.",
  bookingOversigt:
    "læser `kunder`, `koeretoejer`, `personale` og `bookinger` — fire "
    + "permissions som ALLE seks roller har. Der er intet at skjule for.",
  nyForespoergsel: "samme: `kunder.laes`, som alle seks roller har.",
  forslag: "samme fire brede permissions som Bookingoversigten.",
  livekort: "`koeretoejer.laes` og `personale.laes` — alle seks roller har dem.",
  bemandingPlan: "`personale.laes`, som alle seks roller har.",
  kompetencer: "samme: `personale.laes`.",
  fravaer: "`fravaer.laes` og `personale.laes` — begge hos alle seks roller.",
  indberetninger: "`koeretoejer.laes`, som alle seks roller har.",
  facilityOversigt: "`personale.laes`, som alle seks roller har.",
  facilityInventar: "samme kartoteksopslag som facilityOversigt — "
    + "`personale.laes` og `leverandoerer.laes`, som alle seks roller har.",
  facilityPlanlagt: "`leverandoerer.laes`, som alle seks roller har — samme "
    + "opslag som Servicekalenderen bruger til at navngive en udførende.",
  kasseudlaan: "`kunder.laes`, som alle seks roller har.",
  warehouseVarer: "`kunder.laes`, som alle seks roller har.",
  warehousePluk: "samme: `kunder.laes`.",
  warehouseLabels: "`booking.laes` og `kunder.laes` — begge hos alle seks.",
  warehouseSporbarhed: "samme: `kunder.laes`.",
  enheder: "`koeretoejer.laes`, som alle seks roller har.",
  servicebog: "samme: `koeretoejer.laes`, som alle seks roller har — §9.10's "
    + "servicepunkter bor på koeretoejer-posten selv.",
  flaadeStatistik: "`koeretoejer.laes`, som alle seks roller har. `indkoeb.laes` "
    + "er Procures egen — men useListe springer forespørgslen over med "
    + "TILSTAND.modulMangler hos en Fleet-kunde uden Procure (beslutning 95), "
    + "og siden viser det som en grund ('Kræver Procure-modulet'), ikke som et "
    + "nul. Siden blokerer ikke på feltet; den regner bare mindre uden det.",
  flaadeOverblik: "samme kartoteksopslag som Værkstedskalenderen/Arbejdskøen — "
    + "`koeretoejer.laes` og `leverandoerer.laes`, som alle seks roller har.",
  flaadeKontakter: "`personale.laes` og `leverandoerer.laes` — alle seks roller har dem.",
  medarbejdere: "`personale.laes`, som alle seks roller har.",
  kunderOversigt: "`kunder.laes`, som alle seks roller har.",
};

describe("kraeverPerm peger på noget der findes", () => {
  const ALLE_PERMS = [...new Set(Object.values(ROLLE_PERMS).flat())];

  it("hver kraeverPerm står i permissionskataloget", () => {
    for (const p of ALLE) {
      if (!p.kraeverPerm) continue;
      assert.ok(ALLE_PERMS.includes(p.kraeverPerm),
        `${p.key} kræver "${p.kraeverPerm}", som ingen rolle har — punktet ville `
        + "være skjult for alle");
    }
  });

  /**
   * ⚠ ET PUNKT MÅ IKKE LYVE. Bærer det `kraeverPerm: P`, skal skærmen faktisk
   * læse en node der kræver P — ellers skjuler menuen noget der virker, og
   * brugeren leder efter en side der er der.
   */
  it("⚠ HVER kraeverPerm ER EN SKÆRMEN FAKTISK BEHØVER", () => {
    for (const p of ALLE) {
      if (!p.kraeverPerm) continue;
      const kraevet = permsForPunkt(p);
      if (p.key === "fakturacenter") {
        const prototype = readFileSync(FIL_FOR[p.sti], "utf8");
        assert.match(prototype, /FAKTURACENTER_PROTOTYPE/);
        assert.match(prototype, /eksterneKald:\s*false/);
        continue;
      }
      assert.ok(kraevet.includes(p.kraeverPerm),
        `${p.key} bærer kraeverPerm "${p.kraeverPerm}", men ${p.sti} læser ingen `
        + `node der kræver den (den læser: ${kraevet.join(", ") || "ingen spærrede"})`);
    }
  });

  /**
   * ⚠ OG ET PUNKT DER LÆSER EN SPÆRRET NODE, SKAL HAVE TAGET STILLING.
   * Kravet er ikke at alle får `kraeverPerm` — det er at ingen glemmes.
   */
  it("⚠ HVERT PUNKT MED EN SPÆRRET NODE HAR ENTEN kraeverPerm ELLER EN GRUND", () => {
    const ubegrundede = ALLE
      .filter((p) => !p.kraeverPerm && permsForPunkt(p).length)
      .filter((p) => !UDEN_KRAEVERPERM[p.key])
      .map((p) => `${p.key} (${permsForPunkt(p).join(", ")})`);
    assert.deepEqual(ubegrundede, [],
      "menupunkter hvis skærm læser en permissionsspærret node. Sæt enten "
      + "`kraeverPerm`, eller skriv i UDEN_KRAEVERPERM hvorfor punktet skal "
      + "blive stående:\n  " + ubegrundede.join("\n  "));
  });

  it("⚠ OG INGEN GRUND FOR ET PUNKT DER HAR FÅET kraeverPerm", () => {
    const overflod = Object.keys(UDEN_KRAEVERPERM)
      .filter((k) => ALLE.find((p) => p.key === k)?.kraeverPerm);
    assert.deepEqual(overflod, [],
      "punktet HAR kraeverPerm — begrundelsen for at undlade den skal væk:\n  "
      + overflod.join("\n  "));
  });

  it("⚠ OG INGEN GRUND FOR ET PUNKT DER IKKE FINDES", () => {
    const spoegelser = Object.keys(UDEN_KRAEVERPERM)
      .filter((k) => !ALLE.some((p) => p.key === k));
    assert.deepEqual(spoegelser, [],
      "en begrundelse peger på et nav-punkt der ikke findes:\n  " + spoegelser.join("\n  "));
  });
});

describe("Hvad rollerne faktisk ser", () => {
  /* ⚠ SKIVE 2A: ET TOPNIVEAUPUNKT KAN NU OGSÅ BÆRE kraeverPerm — se
     AppShell.jsx's `synligeToppunkter`. Før i dag blev kun BØRN spurgt om
     feltet her, fordi intet topniveaupunkt bar det; `fakturacenter` er det
     første, og uden linjen herunder ville denne prøve tro Fakturaer & bilag
     var synlig for en chauffør, som den reelt ikke er. */
  const synligeFor = (rolle) => {
    const perms = permStrengFraRolle(rolle);
    const born = (m) => (m.born || [])
      .filter((b) => !b.skjulINav)
      .filter((b) => !b.kraeverPerm || harPerm(perms, b.kraeverPerm));
    return NAV
      .filter((m) => !m.kraeverPerm || harPerm(perms, m.kraeverPerm))
      .filter((m) => !m.born?.length || born(m).length)
      .flatMap((m) => (m.born?.length ? born(m) : [m]));
  };

  /**
   * ⚠ DEN VIGTIGSTE MÅLING I FILEN. Før beslutning 105 førte 18 af
   * chaufførens synlige punkter til en afvist læsning. De tre der er tilbage,
   * står i UDEN_KRAEVERPERM med hver sin grund.
   */
  it("⚠ INGEN ROLLE SER MERE END TRE PUNKTER DER AFVISES", () => {
    for (const rolle of Object.keys(ROLLE_PERMS)) {
      const perms = permStrengFraRolle(rolle);
      const daarlige = synligeFor(rolle)
        .filter((p) => permsForPunkt(p).some((x) => !harPerm(perms, x)))
        .map((p) => p.sti);
      assert.ok(daarlige.length <= 3,
        `${rolle} ser ${daarlige.length} punkter der åbner en afvist læsning:\n  `
        + daarlige.join("\n  "));
      for (const sti of daarlige) {
        const punkt = ALLE.find((p) => p.sti === sti);
        assert.ok(UDEN_KRAEVERPERM[punkt.key],
          `${rolle} ser ${sti}, som afvises og ikke står med en grund`);
      }
    }
  });

  /**
   * ⚠ ET TOPPUNKT OVER EN TOM LISTE ER VÆRRE END INGEN MENU. En chauffør
   * mangler `indkoeb.laes`, og så er alle syv Procure-punkter væk.
   */
  it("⚠ EN CHAUFFØR SER IKKE PROCURE-OVERSKRIFTEN", () => {
    const perms = permStrengFraRolle("chauffoer");
    const born = (m) => (m.born || [])
      .filter((b) => !b.skjulINav)
      .filter((b) => !b.kraeverPerm || harPerm(perms, b.kraeverPerm));
    const indkoeb = NAV.find((m) => m.key === "indkoeb");
    assert.equal(born(indkoeb).length, 0, "chaufføren har fået et Procure-punkt");
    /* Og shellen filtrerer faktisk på det. */
    const shell = udenKommentarer(readFileSync("src/fleet/AppShell.jsx", "utf8"));
    assert.match(shell, /!m\.born\?\.length \|\| synligeBorn\(m\)\.length/);
  });

  it("⚠ MEN EN ADMIN MISTER INTET", () => {
    assert.equal(synligeFor("admin").length,
      ALLE.filter((p) => !p.skjulINav).length);
  });
});

describe("Menuen er ikke spærringen", () => {
  /**
   * ⚠ HELE FORSKELLEN PÅ EN SPÆRRING OG EN PÆN KNAP. Skjules et punkt uden at
   * reglen afviser, er adgangen uændret — man taster bare stien. Prøven her
   * er den der gør `kraeverPerm` til en afspejling frem for en attrap.
   */
  it("⚠ HVER kraeverPerm HÅNDHÆVES OGSÅ I firebase.rules.json", () => {
    const brugte = [...new Set(ALLE.map((p) => p.kraeverPerm).filter(Boolean))];
    assert.ok(brugte.length >= 3, `kun ${brugte.length} permissions i brug i nav`);
    const iRegler = JSON.stringify(REGLER);
    for (const perm of brugte) {
      assert.ok(iRegler.includes(`|${perm}|`),
        `nav skjuler et punkt på "${perm}", som ingen regel spørger om — `
        + "det ville være en pæn knap");
    }
  });

  /**
   * ⚠ OG RUTEN FINDES STADIG. Fjernede vi ruten sammen med menupunktet, ville
   * der være to steder adgangen afgøres — og et dybt link fra en mail ville
   * ende i en 404 frem for i en forklaring.
   */
  it("⚠ RUTEN FJERNES IKKE MED MENUPUNKTET", () => {
    for (const p of ALLE) {
      if (!p.kraeverPerm) continue;
      assert.ok(FIL_FOR[p.sti], `${p.sti} har ingen rute længere`);
    }
    const app = udenKommentarer(APP);
    assert.ok(!/kraeverPerm/.test(app),
      "App.jsx filtrerer ruter på kraeverPerm — menuen skal tie, ikke ruten forsvinde");
  });
});
