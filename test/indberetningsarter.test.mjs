/* test/indberetningsarter.test.mjs
 * Ti arter i to klasser — og forløbet der kun hører til den ene.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * README har beskrevet skellet siden Flåde → Indberetninger blev bygget:
 *
 *   driftshændelser  (reparation, skade, dæk, service, andet) STARTER ET FORLØB
 *   udgiftsregistreringer (tankning, parkering, truckwash, kvittering) GØR IKKE
 *
 * **Koden havde fire arter i én klasse.** Dokumentationen beskrev et design
 * ingen havde bygget — og reglen krævede `forloeb` af dem alle, så en
 * parkeringsbillet stod med "Ny" i en tilstandsmaskine med seks trin om et
 * beløb der bare skal bogføres.
 *
 * Det blev synligt da chaufførappen skulle have de otte fliser fra
 * specifikationen: fire af dem havde ingen art at skrive.
 *
 * Se beslutning 106.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";

import {
  KLASSE, HAENDELSE_ART, ALLE_ARTER, APP_FLISER, FELT,
  arterAf, kraeverForloeb, arterForFlise, felterFor, harFelt,
} from "../src/fleet/indberetninger.js";

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules.tenants.$tenantId;

const POST = REGLER.indberetninger.$id;

describe("Kataloget har to klasser", () => {
  it("hver art har en klasse vi kender", () => {
    for (const a of ALLE_ARTER) {
      assert.ok(Object.values(KLASSE).includes(HAENDELSE_ART[a].klasse),
        `${a} har klassen "${HAENDELSE_ART[a].klasse}"`);
    }
  });

  it("begge klasser har arter — ellers er skellet en tom kasse", () => {
    assert.ok(arterAf(KLASSE.drift).length >= 5);
    assert.ok(arterAf(KLASSE.udgift).length >= 3);
    assert.equal(arterAf(KLASSE.drift).length + arterAf(KLASSE.udgift).length,
      ALLE_ARTER.length);
  });

  it("de fire oprindelige arter er der stadig", () => {
    /* En omdøbning ville være en datamigrering af hver eneste post. Se noten
       ved `braendstof`: appen kalder den "Tankning", noden hedder det den
       altid har heddet. */
    for (const a of ["reparation", "koeretoejsskade", "godsskade", "braendstof"]) {
      assert.ok(ALLE_ARTER.includes(a), `arten ${a} er forsvundet`);
    }
    assert.equal(HAENDELSE_ART.braendstof.label, "Tankning");
  });

  /**
   * ⚠ TILLÆGSKRAV "BRÆNDSTOFMATCH" §1 — INGEN PRIS I FORMULARET.
   * `prisPrLiterOere` findes stadig som FELT (bagudkompatibilitet med gamle
   * poster, se rules.indberetninger.test.mjs), men braendstof må ikke bære
   * det i sit eget feltskema længere — det er netop det felt kravet bad om
   * at fjerne fra chaufførens formular, og formularen viser kun felter
   * `felterFor("braendstof")` nævner.
   */
  it("⚠ BRAENDSTOF HAR IKKE prisPrLiterOere I SIT FELTSKEMA", () => {
    assert.deepEqual(felterFor("braendstof"), [FELT.kmStand, FELT.liter, FELT.adBlueLiter]);
    assert.ok(!harFelt("braendstof", FELT.prisPrLiterOere));
  });

  /**
   * ⚠ `andet` ER EN DRIFTSHÆNDELSE. En chauffør der ikke kan sætte navn på det
   * han ser, har set noget der skal VURDERES. Var den en udgift, ville "jeg
   * ved ikke hvad det er" ende som en post ingen kigger på igen.
   */
  it("⚠ andet HØRER I DRIFT, IKKE I UDGIFT", () => {
    assert.equal(HAENDELSE_ART.andet.klasse, KLASSE.drift);
    assert.ok(kraeverForloeb("andet"));
  });
});

describe("Forløbet hører kun til driftshændelser", () => {
  it("kraeverForloeb følger klassen", () => {
    for (const a of arterAf(KLASSE.drift)) assert.ok(kraeverForloeb(a), a);
    for (const a of arterAf(KLASSE.udgift)) assert.ok(!kraeverForloeb(a), a);
  });

  /**
   * ⚠ DEN VIGTIGSTE I FILEN. Regelfilen kan ikke importere kataloget, så
   * ordlisten står to steder. Prøven er det eneste der forhindrer at de
   * driver — samme ordning som meldingstyperne på `statushaendelser`
   * (beslutning 103).
   */
  it("⚠ REGLENS UNDTAGELSESLISTE ER NØJAGTIG UDGIFTSARTERNE", () => {
    const udtryk = POST[".validate"];
    const m = udtryk.match(/matches\(\/\^\(([^)]*)\)\$\//);
    assert.ok(m, `reglen har ingen artsliste i sin .validate:\n  ${udtryk}`);
    assert.deepEqual(m[1].split("|").sort(), [...arterAf(KLASSE.udgift)].sort(),
      "reglen fritager andre arter for `forloeb` end kataloget kalder udgifter");
  });

  it("⚠ OG art, oprettetAf, oprettetMs ER STADIG PÅKRÆVET AF ALLE", () => {
    const m = POST[".validate"].match(/hasChildren\(\[([^\]]*)\]\)/);
    const kraevet = m[1].split(",").map((s) => s.trim().replace(/['"]/g, ""));
    assert.deepEqual(kraevet.sort(), ["art", "oprettetAf", "oprettetMs"],
      "et felt er faldet ud af det generelle krav");
  });

  it("⚠ forloeb ER IKKE FJERNET FRA REGLEN — kun gjort betinget", () => {
    /* Var feltet slet ikke krævet, kunne en reparation stå uden en tilstand,
       og kontorets arbejdsliste ville miste den i tavshed. */
    assert.match(POST[".validate"], /hasChildren\(\['forloeb'\]\)/);
    assert.ok(POST.forloeb, "feltets egen .validate er væk");
  });
});

describe("Feltskemaerne", () => {
  it("hver art har et skema — også et tomt", () => {
    for (const a of ALLE_ARTER) {
      assert.ok(Array.isArray(felterFor(a)), `${a} har intet skema`);
    }
  });

  it("⚠ DÆK OG SERVICE BÆRER kmStand", () => {
    /* Et dæk skiftes efter kilometer, og et serviceinterval måles i dem.
       Uden feltet kan ingen se om det næste ligger om en uge eller et halvt år. */
    assert.ok(harFelt("daek", FELT.kmStand));
    assert.ok(harFelt("service", FELT.kmStand));
  });

  /**
   * ⚠ BELØBET STÅR I `omkostningOere`, som noden allerede bar. Et
   * `beloebOere` ved siden af ville være det samme tal to steder, og så
   * skulle hver rapport vælge hvilket.
   */
  it("⚠ INGEN UDGIFTSART HAR FÅET SIT EGET BELØBSFELT", () => {
    for (const a of arterAf(KLASSE.udgift)) {
      for (const f of felterFor(a)) {
        assert.ok(!/beloeb/i.test(f), `${a} bærer feltet ${f}`);
      }
    }
    assert.ok(POST.omkostningOere, "noden har mistet omkostningOere");
  });

  it("hvert felt i et skema står i FELT-kataloget", () => {
    const kendte = Object.values(FELT);
    for (const a of ALLE_ARTER) {
      for (const f of felterFor(a)) {
        assert.ok(kendte.includes(f), `${a} bærer det ukendte felt ${f}`);
      }
    }
  });

  it("⚠ OG HVERT FELT FINDES OGSÅ I REGLEN", () => {
    /* Et felt skærmen spørger om, og noden afviser, er en formular der
       fejler når man trykker Send. `$andet: false` afviser alt ukendt. */
    for (const a of ALLE_ARTER) {
      for (const f of felterFor(a)) {
        assert.ok(POST[f], `feltet ${f} (${a}) står ikke i regelfilen`);
      }
    }
  });
});

describe("Appens fliser er ikke arterne", () => {
  it("otte fliser", () => {
    assert.equal(APP_FLISER.length, 8);
  });

  it("hver flise fører til mindst én art der findes", () => {
    for (const f of APP_FLISER) {
      const arter = arterForFlise(f.key);
      assert.ok(arter.length >= 1, `flisen ${f.key} fører ingen steder hen`);
      for (const a of arter) {
        assert.ok(HAENDELSE_ART[a], `flisen ${f.key} peger på arten ${a}, som ikke findes`);
      }
    }
  });

  /**
   * ⚠ `Skade` SPØRGER ÉT SPØRGSMÅL MERE. En enhedsskade og en godsskade har
   * hvert sit feltskema og er BEGGE sensitive. Gættede vi, ville halvdelen af
   * godsskaderne stå som enhedsskader — og det opdages først når forsikringen
   * spørger.
   */
  it("⚠ SKADE ER DEN ENESTE FLISE MED ET VALG", () => {
    const medValg = APP_FLISER.filter((f) => !f.art);
    assert.deepEqual(medValg.map((f) => f.key), ["skade"]);
    assert.deepEqual(arterForFlise("skade"), ["koeretoejsskade", "godsskade"]);
  });

  /**
   * ⚠ `kvittering` HAR INGEN FLISE, OG DET ER ET VALG. En chauffør
   * fotograferer altid en kvittering FOR noget — en tankning, en vask, en
   * parkering. En flise ville konkurrere med de tre og gøre dataene dårligere.
   */
  it("⚠ kvittering ER EN ART UDEN FLISE", () => {
    assert.ok(ALLE_ARTER.includes("kvittering"));
    const iFliser = new Set(APP_FLISER.flatMap((f) => arterForFlise(f.key)));
    assert.ok(!iFliser.has("kvittering"));
    /* Og den er den ENESTE der mangler — ellers er der en art ingen kan melde. */
    const mangler = ALLE_ARTER.filter((a) => !iFliser.has(a));
    assert.deepEqual(mangler, ["kvittering"],
      "en art kan ikke nås fra appen, og det står ingen steder hvorfor");
  });
});

describe("Chaufførappen skriver dem", () => {
  const SKAERM = udenKommentarer(readFileSync("src/moduler/app/Indberetning.jsx", "utf8"));

  /* ⚠ RETTET 2026-09-05 — TILFØJET 2026-09-05: skærmen gik DIREKTE gennem
     skriv.js indtil beslutning 122. En sag med et ticketnummer skal
     oprettes ATOMISK sammen med driftshændelsen (produktejerens
     triageflow), og det kræver Admin-SDK'et — se `indberetningIndsend` i
     functions/index.js. Skærmen kalder den nu, den skriver ikke selv. */
  it("den går gennem indberetningIndsend, ikke skriv.js/db.ref()", () => {
    assert.match(SKAERM, /kaldFunktion\("indberetningIndsend"/);
    assert.ok(!/db\.ref\(|gem\(\{/.test(SKAERM), "skærmen skriver uden om funktionen");
  });

  /**
   * ⚠ FORLØBET SÆTTES KUN HVOR DET BETYDER NOGET — men SERVER-SIDE siden
   * beslutning 122, ikke i skærmen. `erUdgift(art) ? {} : {forloeb:"ny"}`'s
   * spejlbillede (`kraeverForloeb(art) ? {forloeb:"ny"} : {}`) står nu i
   * `indberetningIndsend` og er prøvet i test/indberetningindsend.test.mjs.
   * Denne prøve bekræfter i stedet at skærmen IKKE gætter på det selv —
   * ét sted der afgør det, ikke to der kan drive fra hinanden.
   */
  it("⚠ SKÆRMEN SENDER IKKE forloeb — serveren afgør det", () => {
    assert.ok(!/forloeb:/.test(SKAERM),
      "skærmen sender stadig forloeb i payloadet — det er nu serverens afgørelse");
  });

  it("⚠ OG DEN SPØRGER KATALOGET OM FELTERNE", () => {
    /* En if-kæde i skærmen ville være det andet sted svaret stod — og den
       ville love felter noden ikke tager imod. */
    assert.match(SKAERM, /harFelt\(art, f\)/);
    assert.match(SKAERM, /HAENDELSE_ART\[art\]\.paaKoeretoej/);
  });

  it("⚠ OG KUN HANS EGNE STÅR PÅ \"Indberettet\"", () => {
    /* Noden er gated på modulet, ikke på ejerskabet — han KAN læse kollegaens.
       Listen er hans kvittering, ikke kontorets arbejdsliste. */
    assert.match(SKAERM, /i\.oprettetAf === bruger\?\.uid/);
  });
});
