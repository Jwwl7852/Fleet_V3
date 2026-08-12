/* test/warehouse.test.mjs
 * Warehouse (WMS) — datamodellen. Etape 2.
 *
 * Kør:  npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ENHED, ALLE_ENHEDER, SPORING, ALLE_SPORINGER, BATCH_MOENSTER,
  valideVare, rumfangMm3,
  PLADS_TYPE, ALLE_PLADS_TYPER, PLADS_STATUS, ALLE_PLADS_STATUS,
  kanPlukkesFra, valideLagerfelter,
  BEVAEGELSE_ART, ALLE_BEVAEGELSE_ARTER, ABSOLUTTE_ARTER, valideBevaegelse,
  MAENGDE_SKALA, maengdeFraTal, talFraMaengde,
  UDEN_BATCH, beholdningsNoegle, virkningPaaBeholdning,
  beholdningPrVare, beholdningPaaPlads, underMinimum,
} from "../src/fleet/warehouse.js";
import { ANTAL_SKALA } from "../src/fleet/beloeb.js";
import { NODE_MODUL, MODUL, UDEN_SKAERM, modulerFor } from "../src/fleet/moduler.js";
import { PERM, ROLLE_PERMS } from "../src/fleet/permissions.js";

const K = { kunder: ["k1"], varer: ["v1"], pladser: ["p1", "p2"] };
const vare = (x = {}) => ({
  kundeId: "k1", varenummer: "ST-1002", navn: "Leje 6205 2RS",
  enhed: "stk", sporing: "ingen", ...x,
});
const bev = (x = {}) => ({
  art: "flyt", vareId: "v1", kundeId: "k1", antal: 2 * MAENGDE_SKALA,
  fraPladsId: "p1", tilPladsId: "p2", ...x,
});

describe("skalaen er husets, ikke Warehouses egen", () => {
  it("er den samme som ANTAL_SKALA i beloeb.js", () => {
    /* ⚠ TO SKALAER FAKTURERER 1000× FORKERT. Warehouse afregner pr.
       håndtering og pr. mængde, og mængden ender på en grundlagslinje der
       regner med ANTAL_SKALA. Filen er importfri og kan derfor ikke importere
       værdien — så prøven binder dem i stedet. */
    assert.equal(MAENGDE_SKALA, ANTAL_SKALA);
  });

  it("regner begge veje uden at samle afrunding op", () => {
    assert.equal(maengdeFraTal(12.5), 12500);
    assert.equal(talFraMaengde(12500), 12.5);
    assert.equal(maengdeFraTal(0.001), 1);
    /* 84,2 × 1000 giver 84199.99999999999 i flydende komma. */
    assert.equal(maengdeFraTal(84.2), 84200);
  });
});

describe("varen er kundens", () => {
  it("kræver en kunde", () => {
    /* ⚠ 3PL: uden en kunde er varen på lageret uden en modpart, og
       bevægelsen kan ikke afregnes. */
    assert.ok(valideVare(vare({ kundeId: "" }), K).kundeId);
    assert.ok(valideVare(vare({ kundeId: "findes-ikke" }), K).kundeId);
    assert.deepEqual(valideVare(vare(), K), {});
  });

  it("kræver en enhed fra listen, ikke fritekst", () => {
    /* "stk", "STK", "Stk." og "styk" ville være fire enheder på samme hylde,
       og en afregning pr. enhed ville lægge dem sammen. */
    assert.ok(valideVare(vare({ enhed: "styk" }), K).enhed);
    for (const e of ALLE_ENHEDER) {
      assert.deepEqual(valideVare(vare({ enhed: e }), K), {}, `${e} blev afvist`);
    }
  });

  it("kræver at sporingen vælges ved oprettelsen", () => {
    /* Den kan ikke laves om bagud: får en vare batch et år senere, findes der
       bevægelser uden — og så kan et tilbagekald ikke svare på hvilke kolli
       der var i partiet. */
    assert.ok(valideVare(vare({ sporing: undefined }), K).sporing);
    for (const s of ALLE_SPORINGER) {
      assert.deepEqual(valideVare(vare({ sporing: s }), K), {}, `${s} blev afvist`);
    }
  });

  it("tager mål som heltal i millimeter", () => {
    /* Samme regel som samletLaengdeMm() i flaade.js — en float ved en
       volumengrænse er en fejl der venter. */
    assert.ok(valideVare(vare({ laengdeMm: 120.5 }), K).laengdeMm);
    assert.ok(valideVare(vare({ vaegtG: -1 }), K).vaegtG);
    assert.deepEqual(valideVare(vare({ laengdeMm: 1200, vaegtG: 850 }), K), {});
  });

  it("regner rumfang først når alle tre mål findes", () => {
    assert.equal(rumfangMm3({ laengdeMm: 1200, breddeMm: 800 }), null);
    assert.equal(rumfangMm3({ laengdeMm: 1200, breddeMm: 800, hoejdeMm: 1000 }), 960000000);
    /* ⚠ null, IKKE 0. Et rumfang på nul ville se ud som en måling. */
    assert.equal(rumfangMm3({ laengdeMm: 0, breddeMm: 800, hoejdeMm: 1000 }), null);
  });
});

describe("reolpladsen er delt — og de nye felter er valgfrie", () => {
  it("accepterer en plads helt uden lagerfelter", () => {
    /* ⚠ ELLERS GÅR TURTLEBOOKING I STYKKER. Noden blev udvidet, ikke
       kopieret, og en plads uden de nye felter skal opføre sig som før. */
    assert.deepEqual(valideLagerfelter({}), {});
  });

  it("afviser en ukendt type eller status", () => {
    assert.ok(valideLagerfelter({ type: "reol" }).type);
    assert.ok(valideLagerfelter({ status: "spaerret" }).status);
    for (const t of ALLE_PLADS_TYPER) assert.deepEqual(valideLagerfelter({ type: t }), {});
    for (const s of ALLE_PLADS_STATUS) assert.deepEqual(valideLagerfelter({ status: s }), {});
  });

  it("holder temperaturen inden for noget fysisk", () => {
    assert.ok(valideLagerfelter({ temperatur: 200 }).temperatur);
    assert.ok(valideLagerfelter({ temperatur: "kold" }).temperatur);
    assert.deepEqual(valideLagerfelter({ temperatur: -18 }), {});
  });

  it("⚠ KARANTÆNE BLOKERER EN PLUK, DEN ADVARER IKKE", () => {
    /* Varen dér er under mistanke. En pluk der bare advarer, bliver klikket
       væk — samme regel som en udløbet kompetence. */
    assert.equal(kanPlukkesFra({ status: "karantaene" }), false);
    assert.equal(kanPlukkesFra({ status: "lukket" }), false);
    assert.equal(kanPlukkesFra({ status: "aktiv" }), true);
    /* En plads uden status er aktiv — ellers ville hver eneste
       Turtlebooking-plads holde op med at virke. */
    assert.equal(kanPlukkesFra({}), true);
  });
});

describe("bevægelsen ved hvad den gør ved en plads", () => {
  it("nægter en modtagelse en fra-plads", () => {
    /* ⚠ ELLERS TRÆKKES DER VARER UD AF EN HYLDE DER ALDRIG HAVDE DEM, og
       beholdningen går i minus uden at nogen kan se hvorfor. */
    assert.ok(valideBevaegelse(bev({ art: "modtag" }), K).fraPladsId);
    assert.deepEqual(
      valideBevaegelse(bev({ art: "modtag", fraPladsId: null }), K), {});
  });

  it("nægter en afsendelse en til-plads", () => {
    assert.ok(valideBevaegelse(bev({ art: "afsend" }), K).tilPladsId);
    assert.deepEqual(
      valideBevaegelse(bev({ art: "afsend", tilPladsId: null }), K), {});
  });

  it("kræver begge på en flytning — og at de er forskellige", () => {
    assert.ok(valideBevaegelse(bev({ fraPladsId: null }), K).fraPladsId);
    assert.ok(valideBevaegelse(bev({ tilPladsId: "p1" }), K).tilPladsId);
  });

  it("har en regel for hver art der findes", () => {
    /* Ellers ville en ny art give `undefined` og lydløst slippe forbi begge
       pladstjek. */
    for (const a of ALLE_BEVAEGELSE_ARTER) {
      assert.ok(BEVAEGELSE_ART[a], `${a} mangler i tabellen`);
      assert.equal(typeof BEVAEGELSE_ART[a].kraeverFra, "boolean");
      assert.equal(typeof BEVAEGELSE_ART[a].kraeverTil, "boolean");
    }
  });

  it("⚠ NÆGTER EN HALV PALLE", () => {
    /* Uden det her kunne 0,5 palle lande på et fakturagrundlag, og ingen
       ville kunne finde den halve palle på hylden. */
    const ctx = { ...K, vare: { enhed: "palle" } };
    assert.ok(valideBevaegelse(bev({ antal: 500 }), ctx).antal);
    assert.deepEqual(valideBevaegelse(bev({ antal: 2000 }), ctx), {});
    /* Kilo KAN deles — 12,5 kg er en gyldig mængde. */
    assert.deepEqual(
      valideBevaegelse(bev({ antal: 12500 }), { ...K, vare: { enhed: "kg" } }), {});
  });

  it("kræver batch når varen spores på batch", () => {
    const ctx = { ...K, vare: { enhed: "stk", sporing: "batch" } };
    assert.ok(valideBevaegelse(bev(), ctx).batch);
    assert.deepEqual(valideBevaegelse(bev({ batch: "LOT-240515" }), ctx), {});
  });

  it("⚠ AFVISER PUNKTUM I EN BATCH", () => {
    /* Batchen indgår i en beholdningsnøgle, og RTDB tillader ikke . # $ [ ] /
       i en nøgle. Uden den her ville skrivningen fejle et helt andet sted end
       der hvor fejlen blev lavet. */
    assert.ok(valideBevaegelse(bev({ batch: "LOT.2405" }), K).batch);
    assert.ok(valideBevaegelse(bev({ batch: "a/b" }), K).batch);
    assert.ok(BATCH_MOENSTER.test("LOT-240515_A"));
    assert.ok(!BATCH_MOENSTER.test("LOT.2405"));
  });

  it("tillader nul på en optælling, men ikke på en pluk", () => {
    /* ⚠ EN OPTÆLLING KAN VÆRE NUL — hylden var tom, og det er et resultat.
       En pluk på nul er en fejl. */
    assert.deepEqual(
      valideBevaegelse(bev({ art: "optael", antal: 0, fraPladsId: null }), K), {});
    assert.ok(valideBevaegelse(bev({ art: "pluk", antal: 0 }), K).antal);
  });
});

describe("beholdningen er summen, ikke et tal der tælles op og ned", () => {
  it("bygger en deterministisk nøgle", () => {
    /* ⚠ SAMME (plads, vare, batch) MÅ ALDRIG FÅ TO POSTER. To poster for
       samme hylde er DE-QR 777 mod DE-KL 404 igen, med et lagertal. */
    assert.equal(beholdningsNoegle("p1", "v1", "LOT-1"), "p1__v1__LOT-1");
    assert.equal(beholdningsNoegle("p1", "v1", null), `p1__v1__${UDEN_BATCH}`);
    assert.equal(beholdningsNoegle("p1", "v1"), beholdningsNoegle("p1", "v1", ""));
  });

  it("trækker fra den ene plads og lægger til den anden", () => {
    const v = virkningPaaBeholdning(bev({ antal: 3000 }));
    assert.equal(v.length, 2);
    assert.equal(v.find((x) => x.pladsId === "p1").aendring, -3000);
    assert.equal(v.find((x) => x.pladsId === "p2").aendring, 3000);
  });

  it("rører kun én plads på en modtagelse", () => {
    const v = virkningPaaBeholdning(bev({ art: "modtag", fraPladsId: null, antal: 5000 }));
    assert.equal(v.length, 1);
    assert.equal(v[0].aendring, 5000);
  });

  it("⚠ EN OPTÆLLING SÆTTER, DEN ÆNDRER IKKE", () => {
    /* Optællingen er et tal man har talt sig frem til. Blev den lagt til,
       ville en optælling der bekræftede beholdningen, fordoble den. */
    const v = virkningPaaBeholdning(bev({ art: "optael", fraPladsId: null, antal: 7000 }));
    assert.equal(v.length, 1);
    assert.equal(v[0].saet, 7000);
    assert.equal(v[0].aendring, undefined);
    for (const a of ABSOLUTTE_ARTER) assert.ok(ALLE_BEVAEGELSE_ARTER.includes(a));
  });

  it("summerer pr. vare frem for at læse et gemt tal", () => {
    const poster = [
      { pladsId: "p1", vareId: "v1", batch: "A", antal: 2000 },
      { pladsId: "p2", vareId: "v1", batch: "B", antal: 3000 },
      { pladsId: "p2", vareId: "v2", batch: "_", antal: 1000 },
    ];
    assert.deepEqual(beholdningPrVare(poster), { v1: 5000, v2: 1000 });
    assert.equal(beholdningPaaPlads(poster, "p2").length, 2);
  });

  it("regner en vare uden minimum som uden grænse", () => {
    /* ⚠ ELLERS STÅR HVER ENESTE VARE UDEN OPSÆTNING SOM EN ALARM, og så
       læser ingen listen. Samme grund som MINDSTE_GRUNDLAG. */
    const varer = [
      { id: "v1", minimum: 10 },
      { id: "v2", minimum: 5 },
      { id: "v3" },
    ];
    const poster = [
      { pladsId: "p1", vareId: "v1", antal: 3 * MAENGDE_SKALA },
      { pladsId: "p1", vareId: "v3", antal: 0 },
    ];
    const lav = underMinimum(varer, poster);
    assert.deepEqual(lav.map((r) => r.vare.id), ["v2", "v1"]);
    assert.ok(!lav.some((r) => r.vare.id === "v3"));
  });
});

describe("modulet, noderne og rettighederne hænger sammen", () => {
  it("⚠ TEGNES NU — og UDEN_SKAERM er tom igen", () => {
    /* Navnet stod der mellem etape 1 og 3: modulet kunne saelges, men havde
       ingen skaerm. Varer og Lokationer findes nu. */
    assert.ok(MODUL.warehouse);
    assert.ok(!UDEN_SKAERM.includes("warehouse"));
  });

  it("ejer sine tre egne noder og DELER reolpladser", () => {
    assert.deepEqual(
      Object.keys(NODE_MODUL).filter((n) => modulerFor(n).includes("warehouse")).sort(),
      ["beholdning", "bevaegelser", "reolpladser", "varer"]);
    assert.deepEqual(modulerFor("reolpladser").sort(), ["turtlebooking", "warehouse"]);
  });

  it("⚠ RØRER IKKE `lagre`", () => {
    /* Reservedelslageret under Indkøb er VORES egne dele, hvor forbruget er
       en omkostning på en bil. Warehouse er kundens gods, hvor bevægelsen er
       en indtægt. To forskellige ting. */
    assert.deepEqual(modulerFor("lagre"), ["indkoeb"]);
  });

  it("giver lagermedarbejderen begge moduler — ikke en ottende rolle", () => {
    /* Beslutning 31: en ny rolle skal svare til et nyt ARBEJDE, ikke til et
       nyt modul. Han står på lageret; om hylden bærer en transportkasse
       eller kundens paller, er ikke to job. */
    for (const p of [PERM.varerSkriv, PERM.bevaegelserSkriv, PERM.reolpladserSkriv]) {
      assert.ok(ROLLE_PERMS.lagermedarbejder.includes(p), `mangler ${p}`);
      assert.ok(ROLLE_PERMS.admin.includes(p));
    }
    for (const rolle of ["chauffoer", "casehandler", "disponent", "koordinator", "revisor"]) {
      assert.ok(!ROLLE_PERMS[rolle].includes(PERM.bevaegelserSkriv),
        `${rolle} kan flytte kundens gods`);
    }
  });

  it("reolpladsen har sin egen permission, ikke kasserens", () => {
    /* ⚠ EN NODE TO MODULER DELER, KAN IKKE GATES AF DET ENE MODULS RETTIGHED.
       En WMS-medarbejder hos en kunde uden Turtlebooking ville ellers ikke
       kunne oprette en hylde. */
    const regler = readFileSync("firebase.rules.json", "utf8");
    const blok = regler.slice(regler.indexOf('"reolpladser": {'));
    const skriv = blok.slice(0, blok.indexOf('".indexOn"'));
    assert.ok(skriv.includes("|reolpladser.skriv|"));
    assert.ok(!skriv.includes("|kasser.skriv|"),
      "reolpladser kræver stadig kasser.skriv");
  });
});

describe("den delte node skrives uden at slette den andens felter", () => {
  it("Turtlebookings formular fletter", () => {
    /* ⚠ KODEPRØVEN VED SIDEN AF ADFÆRDSPRØVEN, og de er ikke overflødige:
       adfærdsprøven i rules.warehouse.test.mjs viser at update() bevarer
       felterne, men den kan ikke se om SKÆRMEN kalder den vej. Fjerner nogen
       `flet: true` igen, er reglerne stadig grønne — og felterne forsvinder
       lige så stille som første gang. */
    const kilde = readFileSync("src/moduler/turtlebooking/Reolpladser.jsx", "utf8");
    assert.ok(kilde.includes("flet: true"),
      "Reolpladser skriver hele posten og sletter Warehouses felter");
  });

  it("skriv.js kan flette, og gør det ikke som standard", () => {
    /* ⚠ IKKE STANDARD. De øvrige skærme ejer hele deres post, og en fletning
       dér ville betyde at et felt man RYDDEDE, blev stående hvis formularen
       holdt op med at sende det. Fletningen er undtagelsen for delte noder. */
    const kilde = readFileSync("src/fleet/skriv.js", "utf8");
    assert.ok(kilde.includes("flet = false"), "flet er ikke slået fra som standard");
    assert.ok(kilde.includes(".update(data)"));
    assert.ok(kilde.includes(".set(data)"));
  });

  it("⚠ FLETNINGEN ER IKKE EN SLETTEVEJ", () => {
    /* Regnskabsdata hardslettes ikke, og update() må ikke blive smuthullet.
       Den samme prøve som skrivning.test.mjs kører på filen — gentaget her,
       fordi det var DEN HER ændring der kunne have åbnet den. */
    const kilde = readFileSync("src/fleet/skriv.js", "utf8");
    assert.ok(!/\.remove\(\)/.test(kilde), "skriv.js kalder .remove()");
    assert.ok(!/\bset\(null\)/.test(kilde), "skriv.js kalder set(null)");
    assert.ok(!/export (async )?function slet\b/.test(kilde), "skriv.js har en slet()");
  });
});
