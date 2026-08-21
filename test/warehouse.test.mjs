/* test/warehouse.test.mjs
 * Warehouse (WMS) — datamodellen. Etape 2.
 *
 * Kør:  npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ALLE_ENHEDER, ALLE_SPORINGER, BATCH_MOENSTER,
  valideVare, rumfangMm3,
  ALLE_PLADS_TYPER, ALLE_PLADS_STATUS,
  kanPlukkesFra, valideLagerfelter,
  BEVAEGELSE_ART, ALLE_BEVAEGELSE_ARTER, ABSOLUTTE_ARTER, valideBevaegelse,
  MAENGDE_SKALA, maengdeFraTal, talFraMaengde,
  UDEN_BATCH, beholdningsNoegle, virkningPaaBeholdning, virkningPaaCarrier,
  beholdningPaaCarrier, validePlacering,
  beholdningPrVare, beholdningPaaPlads, underMinimum,
  LAGERSVAR, tolkLagerfejl,
  ALLE_ORDRE_TILSTANDE, KLIENT_ORDRE_TILSTANDE, kanSkifteOrdre,
  valideOrdre, ordreFremdrift, kanFortrydeFrigivelse, plukkoe,
  ALLE_AFVIGELSESAARSAGER, valideOptaelling,
  noejagtighed, MINDSTE_OPTAELLINGER, afvigelserPrAarsag, forfaldneOptaellinger,
  YDELSE, ALLE_YDELSER, IKKE_AFREGNEDE_ARTER,
  afregningslinjer, afregningssum,
  ALLE_CARRIER_TYPER,
  ALLE_CARRIER_STATUS, kraeverLokation, udenLokation,
  valideCarrier, carrieroverblik, kanPlaceres,
} from "../src/fleet/warehouse.js";
import { ANTAL_SKALA } from "../src/fleet/beloeb.js";
import { NODE_MODUL, MODUL, UDEN_SKAERM, modulerFor } from "../src/fleet/moduler.js";
import { PERM, ROLLE_PERMS } from "../src/fleet/permissions.js";

const K = {
  kunder: ["k1"], varer: ["v1"], pladser: ["p1", "p2"],
  carriers: ["c1", "c2"],
};
const vare = (x = {}) => ({
  kundeId: "k1", varenummer: "ST-1002", navn: "Leje 6205 2RS",
  enhed: "stk", sporing: "ingen", ...x,
});
const bev = (x = {}) => ({
  art: "flyt", vareId: "v1", kundeId: "k1", antal: 2 * MAENGDE_SKALA,
  fraCarrierId: "c1", tilCarrierId: "c2", ...x,
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
    /* ⚠ ELLERS GÅR UNITBOOKING I STYKKER. Noden blev udvidet, ikke
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
       Unitbooking-plads holde op med at virke. */
    assert.equal(kanPlukkesFra({}), true);
  });
});

describe("bevægelsen ved hvad den gør ved en beholder", () => {
  it("nægter en modtagelse en fra-beholder", () => {
    /* ⚠ ELLERS TRÆKKES DER VARER UD AF EN BEHOLDER DER ALDRIG HAVDE DEM, og
       beholdningen går i minus uden at nogen kan se hvorfor. */
    assert.ok(valideBevaegelse(bev({ art: "modtag" }), K).fraCarrierId);
    assert.deepEqual(
      valideBevaegelse(bev({ art: "modtag", fraCarrierId: null }), K), {});
  });

  it("nægter en afsendelse en til-beholder", () => {
    assert.ok(valideBevaegelse(bev({ art: "afsend" }), K).tilCarrierId);
    assert.deepEqual(
      valideBevaegelse(bev({ art: "afsend", tilCarrierId: null }), K), {});
  });

  it("kræver begge på en flytning — og at de er forskellige", () => {
    assert.ok(valideBevaegelse(bev({ fraCarrierId: null }), K).fraCarrierId);
    assert.ok(valideBevaegelse(bev({ tilCarrierId: "c1" }), K).tilCarrierId);
  });

  it("⚠ AFVISER EN PLADS PÅ EN GODSBEVÆGELSE", () => {
    /* Efter etape 12 ligger godset i en beholder. Et pladsId der blev taget
       imod og ignoreret, ville få den næste til at tro at det virkede — og
       beholdningen ville blive skrevet et sted hvor der ikke ligger noget. */
    assert.ok(valideBevaegelse(bev({ fraPladsId: "p1" }), K).fraPladsId);
    assert.ok(valideBevaegelse(bev({ tilPladsId: "p2" }), K).tilPladsId);
  });

  it("har en regel for hver art der findes", () => {
    /* Ellers ville en ny art give `undefined` og lydløst slippe forbi begge
       beholdertjek. */
    for (const a of ALLE_BEVAEGELSE_ARTER) {
      assert.ok(BEVAEGELSE_ART[a], `${a} mangler i tabellen`);
      assert.equal(typeof BEVAEGELSE_ART[a].kraeverFraCarrier, "boolean");
      assert.equal(typeof BEVAEGELSE_ART[a].kraeverTilCarrier, "boolean");
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
      valideBevaegelse(bev({ art: "optael", antal: 0, fraCarrierId: null }), K), {});
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

  it("trækker fra den ene beholder og lægger til den anden", () => {
    const v = virkningPaaBeholdning(bev({ antal: 3000 }));
    assert.equal(v.length, 2);
    assert.equal(v.find((x) => x.carrierId === "c1").aendring, -3000);
    assert.equal(v.find((x) => x.carrierId === "c2").aendring, 3000);
  });

  it("rører kun én beholder på en modtagelse", () => {
    const v = virkningPaaBeholdning(bev({ art: "modtag", fraCarrierId: null, antal: 5000 }));
    assert.equal(v.length, 1);
    assert.equal(v[0].aendring, 5000);
  });

  it("⚠ EN PLACERING RØRER INGEN SALDO", () => {
    /* Beholderen flytter med alt hvad der er i den; tallene følger med uden
       at blive skrevet om. Det er hele gevinsten ved etape 12 — før var en
       flytning N saldoændringer der skulle lykkes sammen. */
    assert.deepEqual(
      virkningPaaBeholdning({ art: "putaway", carrierId: "c1", tilPladsId: "p1" }), []);
    assert.deepEqual(
      virkningPaaCarrier({ art: "putaway", carrierId: "c1", tilPladsId: "p1" }),
      { carrierId: "c1", pladsId: "p1" });
    /* Og omvendt: en godsbevægelse flytter ingen beholder. */
    assert.equal(virkningPaaCarrier(bev()), null);
  });

  it("⚠ EN OPTÆLLING SÆTTER, DEN ÆNDRER IKKE", () => {
    /* Optællingen er et tal man har talt sig frem til. Blev den lagt til,
       ville en optælling der bekræftede beholdningen, fordoble den. */
    const v = virkningPaaBeholdning(bev({ art: "optael", fraCarrierId: null, antal: 7000 }));
    assert.equal(v.length, 1);
    assert.equal(v[0].saet, 7000);
    assert.equal(v[0].aendring, undefined);
    for (const a of ABSOLUTTE_ARTER) assert.ok(ALLE_BEVAEGELSE_ARTER.includes(a));
  });

  it("summerer pr. vare frem for at læse et gemt tal", () => {
    const poster = [
      { carrierId: "c1", vareId: "v1", batch: "A", antal: 2000 },
      { carrierId: "c2", vareId: "v1", batch: "B", antal: 3000 },
      { carrierId: "c2", vareId: "v2", batch: "_", antal: 1000 },
    ];
    assert.deepEqual(beholdningPrVare(poster), { v1: 5000, v2: 1000 });
    assert.equal(beholdningPaaCarrier(poster, "c2").length, 2);
    /* ⚠ HYLDEN NÅS GENNEM BEHOLDEREN. To led, fordi et gemt pladsId på
       posten ville drive fra carrieren første gang nogen flyttede den. */
    const carriers = [{ id: "c1", pladsId: "p1" }, { id: "c2", pladsId: "p1" }];
    assert.equal(beholdningPaaPlads(poster, "p1", carriers).length, 3);
    assert.equal(beholdningPaaPlads(poster, "p2", carriers).length, 0);
    /* En beholder uden lokation lægger ikke sit gods på en tilfældig hylde. */
    assert.equal(beholdningPaaPlads(poster, "p1", [{ id: "c1" }]).length, 0);
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

  it("ejer sine egne noder og DELER reolpladser", () => {
    assert.deepEqual(
      Object.keys(NODE_MODUL).filter((n) => modulerFor(n).includes("warehouse")).sort(),
      ["beholdning", "bevaegelser", "carriers", "enheder", "optaellinger",
       "plukordrer", "reolpladser", "varer"]);
    assert.deepEqual(modulerFor("reolpladser").sort(), ["unitbooking", "warehouse"]);
  });

  it("⚠ CARRIEREN HØRER TIL WAREHOUSE ALENE — IKKE SAMMEN MED `kasser`", () => {
    /* De to er fysisk den samme slags beholder, men de bærer hver sin
       forretning: kassen udlejes pr. sag, carrieren bærer kundens gods. De
       står derfor på hvert sit modul — mens `reolpladser`, som de begge står
       på, hører til begge. Se WAREHOUSE.md punkt 6.2. */
    assert.deepEqual(modulerFor("carriers"), ["warehouse"]);
    assert.deepEqual(modulerFor("kasser"), ["unitbooking"]);
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
       En WMS-medarbejder hos en kunde uden Unitbooking ville ellers ikke
       kunne oprette en hylde. */
    /* ⚠ REGLEN LÆSES DÉR HVOR DEN LIGGER, ikke ud af et tekstudsnit.
       Udsnittet gik fra '"reolpladser": {' til '".indexOn"', fordi `.write`
       stod øverst på noden. I beslutning 53 flyttede den ned på `$pladsId` —
       under `.indexOn` — og så var udsnittet tomt og prøven grøn af den
       forkerte grund. En prøve der leder det forkerte sted, er værre end
       ingen. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8").replace(/^\s*\/\/.*$/gm, "")
    ).rules;
    const skriv = regler.tenants.$tenantId.reolpladser.$pladsId[".write"];
    assert.ok(typeof skriv === "string", "reolpladser/$pladsId har ingen .write");
    assert.ok(skriv.includes("|reolpladser.skriv|"));
    assert.ok(!skriv.includes("|kasser.skriv|"),
      "reolpladser kræver stadig kasser.skriv");
    /* ⚠ OG DEN LIGGER PÅ POSTEN, IKKE PÅ NODEN. Lå den på `reolpladser`,
       kunne ét kald tømme hele hyldekortoteket. Se beslutning 53. */
    assert.equal(regler.tenants.$tenantId.reolpladser[".write"], undefined,
      "reolpladser har fået .write tilbage på nodeniveau");
    assert.ok(skriv.includes("newData.exists()"),
      "en hylde kan hardslettes igen");
  });
});

describe("den delte node skrives uden at slette den andens felter", () => {
  it("Unitbookings formular fletter", () => {
    /* ⚠ KODEPRØVEN VED SIDEN AF ADFÆRDSPRØVEN, og de er ikke overflødige:
       adfærdsprøven i rules.warehouse.test.mjs viser at update() bevarer
       felterne, men den kan ikke se om SKÆRMEN kalder den vej. Fjerner nogen
       `flet: true` igen, er reglerne stadig grønne — og felterne forsvinder
       lige så stille som første gang. */
    const kilde = readFileSync("src/moduler/unitbooking/Reolpladser.jsx", "utf8");
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

describe("serveren skriver bevægelsen og saldoen sammen", () => {
  const kilde = readFileSync("functions/index.js", "utf8");

  it("bruger den delte politik frem for sin egen afskrift", () => {
    for (const navn of ["valideBevaegelse", "virkningPaaBeholdning", "kanPlukkesFra"]) {
      assert.ok(kilde.includes(`${navn}(`), `functions/index.js kalder ikke ${navn}`);
    }
    assert.ok(kilde.includes('from "./delt/warehouse.js"'));
  });

  it("⚠ SKRIVER ALT I ÉN update()", () => {
    /* Bevægelsen og begge saldoændringer skal lande sammen eller slet ikke.
       To kald ville kunne efterlade en saldo uden en bevægelse bag sig — et
       lagertal ingen kan forklare. */
    /* ⚠ BLOKKEN AFGRÆNSES. Auditloggen skriver også — den ligger i
       `logBevaegelse` under funktionen, og den er en LEGITIM anden skrivning:
       en log der kunne vælte en bevægelse, ville være værre end ingen log.
       Prøven må ikke ramme den, og den må heller ikke bare tælle alt. */
    const start = kilde.indexOf("export const bevaegelseskriv");
    const blok = kilde.slice(start, kilde.indexOf("async function skrivPlacering", start));
    assert.ok(blok.length > 500, "fandt ikke funktionskroppen");
    assert.ok(blok.includes("rod.update(opdatering)"),
      "bevægelsen skrives ikke som én multi-path update");
    /* ⚠ PRÆCIS ÉN SKRIVNING TIL LAGERET. Bliver det to, kan den ene lykkes og
       den anden fejle — og så står der en saldo uden en bevægelse bag sig.
       Læsninger (`once`) tæller ikke; det er skrivningerne der skal samles. */
    /* ⚠ KUN DATABASESKRIVNINGER TÆLLES. Et Map har også `.set()`, og en prøve
       der tæller alt, falder på en datastruktur frem for på en fejl — det
       skete for den tilsvarende prøve på plukordreafsend. */
    assert.equal((blok.match(/rod\.update\(/g) || []).length, 1,
      "der må være præcis én rod.update() i bevaegelseskriv");
    assert.equal((blok.match(/rod\.set\(|rod\.child\([^)]*\)\.set\(/g) || []).length, 0,
      "der skrives til lageret uden for den samlede update");
  });

  it("⚠ BRUGER increment(), IKKE LÆS-OG-SKRIV", () => {
    /* To samtidige plukninger af 2 og 3 skal give −5, aldrig −2 eller −3.
       En læs-og-skriv ville tabe den ene. */
    assert.ok(kilde.includes("ServerValue.increment("),
      "saldoen opdateres ikke atomisk");
  });

  it("læser kunden af varen frem for af nyttelasten", () => {
    /* ⚠ ELLERS KAN EN BEVÆGELSE AFREGNES TIL EN ANDEN KUNDE end den varen
       tilhører. Klienten sender den ikke, og serveren tager den ikke imod. */
    const blok = kilde.slice(kilde.indexOf("export const bevaegelseskriv"));
    assert.ok(blok.includes("post.kundeId = vare.kundeId"));
    /* ⚠ KUN I DEN HER FUNKTION. `kasseudlaanskriv` tager legitimt imod en
       kundeId fra klienten — dér er kunden en oplysning om udlånet, ikke en
       ejendomsret der kan misbruges. Prøven må ikke ramme den. */
    assert.ok(!blok.includes("kundeId: kortStreng(d.kundeId"),
      "bevaegelseskriv læser kundeId fra nyttelasten");
  });

  it("blokerer pluk fra en beholder på en karantæneplads", () => {
    /* ⚠ BLOKERER, ADVARER IKKE. Samme regel som en udløbet kompetence.
       ⚠ OG SPÆRRINGEN SIDDER PÅ HYLDEN, IKKE PÅ BEHOLDEREN. Efter etape 12
       står godset i en carrier, og carrieren står på pladsen: slås den ikke
       op ét led længere ude, kan karantænen omgås ved at plukke fra
       beholderen frem for fra hylden. */
    assert.ok(kilde.includes("kanPlukkesFra(p)"),
      "karantænen slås ikke op på beholderens plads");
    assert.ok(kilde.includes("const pladsFor = async (carrierId)"),
      "der findes ikke et opslag fra beholder til hylde");
  });

  it("⚠ PLACERINGEN SKRIVER BEVÆGELSEN OG PLADSEN SAMMEN", () => {
    /* Skrives kun den ene, står beholderen enten et sted ingen kan se
       hvornår den kom til, eller der findes en placering af noget der aldrig
       blev flyttet. Samme regel som udlånet og kassen. */
    const start = kilde.indexOf("async function skrivPlacering");
    const blok = kilde.slice(start, kilde.indexOf("async function logBevaegelse", start));
    assert.ok(blok.length > 400, "fandt ikke placeringens krop");
    assert.equal((blok.match(/rod\.update\(/g) || []).length, 1,
      "placeringen skrives ikke som én multi-path update");
    assert.ok(blok.includes("/pladsId`]: virkning.pladsId"),
      "carrierens plads skrives ikke med i samme update");
  });

  it("⚠ NÆGTER AT SÆTTE EN OPBRUGT BEHOLDER PÅ EN HYLDE", () => {
    /* Admin-SDK'et går uden om reglerne, så invarianten skal håndhæves i
       funktionen også. Slap en opbrugt engangskasse igennem, ville en hylde
       se optaget ud af noget der er brugt op.

       ⚠ EN I TRANSIT MÅ DERIMOD GERNE — at sætte den på hylden ER ankomsten,
       og statussen følger med i samme skrivning. */
    assert.ok(kilde.includes("kanPlaceres(carrier.status)"));
    assert.ok(kilde.includes("carriers/${virkning.carrierId}/status`] = virkning.status"),
      "ankomsten skrives ikke sammen med placeringen");
  });

  it("prøver abonnement og modul, som reglerne gør", () => {
    const blok = kilde.slice(kilde.indexOf("kraevBevaegelsesskriv"));
    assert.ok(blok.includes("Abonnementet er ikke aktivt."));
    assert.ok(blok.includes("Warehouse er ikke slået til."));
  });

  it("⚠ GØR EN NEGATIV SALDO LARMENDE", () => {
    /* Vinduet mellem dækningstjekket og skrivningen kan ikke lukkes med en
       transaktion, når to pladser skal ændres sammen. Derfor skal det der KAN
       gå galt, være synligt frem for tavst. */
    assert.ok(kilde.includes("NEGATIV SALDO"),
      "en negativ saldo logges ikke");
  });
});

describe("svaret fra serveren forklarer sig selv", () => {
  it("⚠ BEHOLDER SERVERENS TEKST NÅR LAGERET SIGER FRA", () => {
    /* "Der ligger kun 3 paller i beholderen" ER svaret. En generisk tekst
       ville lade brugeren prøve igen med samme mængde. */
    const r = tolkLagerfejl({
      code: "functions/failed-precondition",
      message: "Der ligger kun 3 palle af PAL-1200 i beholderen — der kan ikke tages 5.",
    });
    assert.equal(r.art, LAGERSVAR.afvist);
    assert.match(r.besked, /Der ligger kun 3/);
  });

  it("kalder en afvisning for en afvisning, ikke en netværksfejl", () => {
    assert.equal(tolkLagerfejl({ code: "functions/permission-denied" }).art,
      LAGERSVAR.naegtet);
    assert.equal(tolkLagerfejl({ code: "functions/unavailable" }).art,
      LAGERSVAR.forbindelse);
    assert.equal(tolkLagerfejl({ code: "functions/invalid-argument" }).art,
      LAGERSVAR.ugyldig);
  });
});

describe("plukordren — det udgående flow", () => {
  const V = 1000;
  const ordre = (x = {}) => ({
    id: "o1", kundeId: "k1", nummer: "SO-10458", prioritet: "normal",
    tilstand: "kladde", afgangMs: 1786000000000, afsendCarrierId: "c2",
    linjer: { a: { vareId: "v1", antal: 10 * V } }, ...x,
  });
  const CTX = { kunder: ["k1"], varer: ["v1"], carriers: ["c1", "c2"] };

  it("kræver en kunde, et nummer, en afgang og en afsendelsesbeholder", () => {
    assert.deepEqual(valideOrdre(ordre(), CTX), {});
    assert.ok(valideOrdre(ordre({ kundeId: "" }), CTX).kundeId);
    assert.ok(valideOrdre(ordre({ nummer: "" }), CTX).nummer);
    assert.ok(valideOrdre(ordre({ afgangMs: null }), CTX).afgangMs);
    /* ⚠ UDEN AFSENDELSESBEHOLDER VED PLUKKET IKKE HVAD GODSET SKAL LIGGE I
       mellem hylden og bilen — og det er dér det bliver væk. Efter etape 12
       ligger alt gods i en beholder, også det der venter på afgang. */
    assert.ok(valideOrdre(ordre({ afsendCarrierId: "" }), CTX).afsendCarrierId);
    assert.ok(valideOrdre(ordre({ afsendCarrierId: "c9" }), CTX).afsendCarrierId);
  });

  it("nægter en ordre uden linjer", () => {
    assert.ok(valideOrdre(ordre({ linjer: {} }), CTX).linjer);
    assert.ok(valideOrdre(ordre({ linjer: { a: { vareId: "v1", antal: 0 } } }), CTX).linjer);
    assert.ok(valideOrdre(ordre({ linjer: { a: { vareId: "x", antal: 1 } } }), CTX).linjer);
  });

  it("⚠ `afsendt` STÅR IKKE PÅ KLIENTENS LISTE", () => {
    /* En ordre bliver afsendt fordi varerne forlader huset. Kunne tilstanden
       sættes direkte, kunne en ordre meldes afsendt uden at en palle var rørt,
       mens lageret stadig stod med godset. */
    assert.deepEqual(KLIENT_ORDRE_TILSTANDE, ["kladde", "frigivet", "annulleret"]);
    assert.ok(!KLIENT_ORDRE_TILSTANDE.includes("afsendt"));
    assert.ok(ALLE_ORDRE_TILSTANDE.includes("afsendt"));
  });

  it("lukker en afsendt og en annulleret ordre for altid", () => {
    for (const til of ALLE_ORDRE_TILSTANDE) {
      assert.equal(kanSkifteOrdre("afsendt", til), false, `afsendt → ${til}`);
      assert.equal(kanSkifteOrdre("annulleret", til), false, `annulleret → ${til}`);
    }
    assert.equal(kanSkifteOrdre("kladde", "afsendt"), false,
      "en kladde kan ikke afsendes — den er ikke frigivet til plukning");
  });

  it("udleder fremdriften af BEVÆGELSERNE, ikke af et felt", () => {
    const bev = [
      { reference: "o1", art: "pluk", vareId: "v1", antal: 4 * V },
      { reference: "o1", art: "pluk", vareId: "v1", antal: 2 * V },
      /* ⚠ EN AFSENDELSE TÆLLER IKKE SOM ET PLUK. Lagde man dem sammen, ville
         en fuldt plukket og afsendt ordre se ud som om der var plukket
         dobbelt. */
      { reference: "o1", art: "afsend", vareId: "v1", antal: 6 * V },
      /* En anden ordres pluk må ikke tælle med. */
      { reference: "o2", art: "pluk", vareId: "v1", antal: 99 * V },
    ];
    const fd = ordreFremdrift(ordre(), bev);
    assert.equal(fd.plukketIalt, 6 * V);
    assert.equal(fd.linjer[0].mangler, 4 * V);
    assert.equal(fd.andel, 0.6);
    assert.equal(fd.faerdig, false);
  });

  it("⚠ VISER ET OVERPLUK FREM FOR AT KLIPPE DET VÆK", () => {
    /* En scanner kan læse den samme palle to gange. Klippede vi det væk,
       ville lageret mangle noget ingen kunne forklare. */
    const fd = ordreFremdrift(ordre(), [
      { reference: "o1", art: "pluk", vareId: "v1", antal: 12 * V },
    ]);
    assert.equal(fd.linjer[0].overplukket, 2 * V);
    assert.equal(fd.linjer[0].mangler, 0);
    assert.ok(fd.harOverpluk);
    /* Andelen går ikke over 100 %. */
    assert.equal(fd.andel, 1);
  });

  it("kalder en tom ordre for ufærdig frem for færdig", () => {
    /* 0 af 0 er ikke 100 %. En tom ordre er ikke en leveret ordre. */
    const fd = ordreFremdrift(ordre({ linjer: {} }), []);
    assert.equal(fd.andel, 0);
    assert.equal(fd.faerdig, false);
  });

  it("⚠ EN FRIGIVET ORDRE MED PLUK PÅ KAN IKKE TRÆKKES TILBAGE", () => {
    /* Varerne står på afsendelsespladsen. Lukkes ordren ned, står de dér
       uden en ordre der forklarer hvorfor. */
    assert.equal(kanFortrydeFrigivelse(ordreFremdrift(ordre(), [])), true);
    assert.equal(kanFortrydeFrigivelse(ordreFremdrift(ordre(), [
      { reference: "o1", art: "pluk", vareId: "v1", antal: 1 * V },
    ])), false);
  });

  it("sorterer plukkøen efter prioritet, så afgang", () => {
    const koe = plukkoe([
      ordre({ id: "a", tilstand: "frigivet", prioritet: "normal", afgangMs: 100 }),
      ordre({ id: "b", tilstand: "frigivet", prioritet: "hoej", afgangMs: 900 }),
      ordre({ id: "c", tilstand: "frigivet", prioritet: "normal", afgangMs: 50 }),
      /* Kladder og afsendte står ikke i køen. */
      ordre({ id: "d", tilstand: "kladde", prioritet: "hoej", afgangMs: 1 }),
      ordre({ id: "e", tilstand: "afsendt", prioritet: "hoej", afgangMs: 1 }),
    ]);
    assert.deepEqual(koe.map((o) => o.id), ["b", "c", "a"]);
  });
});

describe("afsendelsen skriver bevægelser og tilstand sammen", () => {
  const kilde = readFileSync("functions/index.js", "utf8");
  const start = kilde.indexOf("export const plukordreafsend");
  const blok = kilde.slice(start);

  it("findes og bruger den delte tilstandstabel", () => {
    assert.ok(start > 0, "plukordreafsend findes ikke");
    assert.ok(blok.includes("kanSkifteOrdre(ordre.tilstand"));
  });

  it("⚠ SKRIVER ALT I ÉN update()", () => {
    const krop = blok.slice(0, blok.indexOf("await logBevaegelse"));
    assert.ok(krop.includes("rod.update(opdatering)"));
    /* ⚠ HER ER DER ET Map. Bevægelserne grupperes pr. vare og batch før de
       skrives, og `pr.set()` er ikke en databaseskrivning. Prøven må se
       forskel — ellers falder den på en datastruktur frem for på en fejl. */
    assert.equal((krop.match(/rod\.update\(/g) || []).length, 1);
    assert.equal((krop.match(/rod\.set\(|rod\.child\([^)]*\)\.set\(/g) || []).length, 0);
  });

  it("afsender det der er PLUKKET, ikke det der er bestilt", () => {
    /* ⚠ ELLERS SKULLE ET LAGER MED 8 PÅ HYLDEN VENTE PÅ 2 der måske aldrig
       kommer. Forskellen står i historikken. */
    assert.ok(blok.includes('b.art !== "pluk"'));
    assert.ok(blok.includes('b.art !== "afsend"'),
      "allerede afsendt trækkes ikke fra — en anden afsendelse ville sende dobbelt");
    assert.ok(!blok.includes("ordre.linjer"),
      "afsendelsen læser ordrens linjer frem for bevægelserne");
  });

  it("bruger increment() på saldoen", () => {
    assert.ok(blok.includes("ServerValue.increment(-l.antal)"));
  });
});

describe("optællingen måler noget", () => {
  const V = 1000;
  const opt = (x = {}) => ({
    carrierId: "c1", vareId: "v1", taeltAntal: 10 * V, forventet: 10 * V, ...x,
  });

  it("kræver en årsag NÅR der er en afvigelse", () => {
    /* ⚠ OG KUN DÉR. Krævede vi en årsag på hver optælling, ville hver eneste
       der ramte plet, stå med en årsagskode — og så betyder koden intet. */
    assert.deepEqual(valideOptaelling(opt()), {});
    assert.ok(valideOptaelling(opt({ taeltAntal: 8 * V })).aarsag);
    assert.deepEqual(
      valideOptaelling(opt({ taeltAntal: 8 * V, aarsag: "svind" })), {});
  });

  it("⚠ ÅRSAGEN ER EN ALLOWLISTE, IKKE FRITEKST", () => {
    /* "svind", "Svind?" og "vist nok stjålet" ville blive tre kategorier af
       det samme problem, og så kan ingen se hvor hullet er. */
    assert.ok(valideOptaelling(opt({ taeltAntal: 8 * V, aarsag: "stjålet" })).aarsag);
    for (const a of ALLE_AFVIGELSESAARSAGER) {
      assert.deepEqual(valideOptaelling(opt({ taeltAntal: 8 * V, aarsag: a })), {},
        `${a} blev afvist`);
    }
  });

  it("⚠ `ukendt` ER EN GYLDIG ÅRSAG", () => {
    /* Tvinges folk til at vælge en de ikke kender, vælger de en tilfældig —
       og så er statistikken værre end ingen. */
    assert.ok(ALLE_AFVIGELSESAARSAGER.includes("ukendt"));
    assert.deepEqual(
      valideOptaelling(opt({ taeltAntal: 0, aarsag: "ukendt" })), {});
  });

  it("nægter en negativ optælling og en halv palle", () => {
    /* Man kan tælle nul på en hylde. Man kan ikke tælle minus tre. */
    assert.ok(valideOptaelling(opt({ taeltAntal: -1 })).taeltAntal);
    assert.deepEqual(
      valideOptaelling(opt({ taeltAntal: 0, forventet: 0 })), {});
    assert.ok(valideOptaelling(
      opt({ taeltAntal: 500, forventet: 500 }), { vare: { enhed: "palle" } }).taeltAntal);
  });

  it("⚠ SIGER 'FOR LIDT GRUNDLAG' FREM FOR EN PROCENT", () => {
    /* To optællinger og to hundrede ser ens ud som en procent, og så skiftes
       der arbejdsgang på grundlag af én uenighed. Samme regel som
       MINDSTE_GRUNDLAG i leverandoerer.js. */
    const faa = Array.from({ length: MINDSTE_OPTAELLINGER - 1 }, () => ({ afvigelse: 0 }));
    assert.equal(noejagtighed(faa), null);
    const nok = Array.from({ length: MINDSTE_OPTAELLINGER }, (_, i) =>
      ({ afvigelse: i === 0 ? 5 : 0 }));
    assert.equal(noejagtighed(nok), (MINDSTE_OPTAELLINGER - 1) / MINDSTE_OPTAELLINGER);
    assert.equal(noejagtighed([]), null);
  });

  it("summerer afvigelser MED fortegn pr. årsag", () => {
    /* ⚠ FUNDET OG SVIND MÅ IKKE UDLIGNE HINANDEN I ANTAL — det er to
       forskellige problemer — men i mængde er det netop forskellen der er
       interessant. */
    const a = afvigelserPrAarsag([
      { afvigelse: -5, aarsag: "svind" },
      { afvigelse: -3, aarsag: "svind" },
      { afvigelse: 2, aarsag: "fundet" },
      { afvigelse: 0, aarsag: null },
    ]);
    assert.equal(a[0].aarsag, "svind");
    assert.equal(a[0].antal, 2);
    assert.equal(a[0].sum, -8);
    assert.equal(a.find((x) => x.aarsag === "fundet").sum, 2);
    /* En optælling uden afvigelse tæller ikke med nogen steder. */
    assert.equal(a.reduce((s, x) => s + x.antal, 0), 3);
  });

  it("⚠ EN NEGATIV SALDO ER ALTID FORFALDEN — og står øverst", () => {
    /* Den er beviset på at en bevægelse mangler, og fejlen vokser indtil
       nogen går ud og kigger. */
    const nu = 1786000000000;
    const beh = [
      { id: "a", pladsId: "p1", vareId: "v1", batch: "_", antal: 5 },
      { id: "b", pladsId: "p2", vareId: "v1", batch: "_", antal: -2 },
    ];
    /* a blev talt i går — den er ikke forfalden på tid. */
    const forf = forfaldneOptaellinger(beh, [
      { pladsId: "p1", vareId: "v1", batch: null, tidspunktMs: nu - 86400000 },
    ], nu);
    assert.deepEqual(forf.map((x) => x.id), ["b"]);
    assert.equal(forf[0].negativ, true);
  });

  it("regner en aldrig talt lokation som forfalden", () => {
    const beh = [{ id: "a", pladsId: "p1", vareId: "v1", batch: "_", antal: 5 }];
    assert.equal(forfaldneOptaellinger(beh, [], 1786000000000).length, 1);
    assert.equal(forfaldneOptaellinger(beh, [], 1786000000000)[0].senestOptaltMs, null);
  });
});

describe("serveren læser forventningen — klienten gør ikke", () => {
  const kilde = readFileSync("functions/index.js", "utf8");
  const start = kilde.indexOf("export const optaellingskriv");
  const blok = kilde.slice(start);

  it("findes og læser saldoen selv", () => {
    assert.ok(start > 0, "optaellingskriv findes ikke");
    assert.ok(blok.includes("const forventet = snap.exists()"),
      "forventningen læses ikke af databasen");
  });

  it("⚠ TAGER IKKE FORVENTNINGEN FRA NYTTELASTEN", () => {
    /* Ellers er afvigelsen forskellen mellem hvad brugeren TROEDE der stod og
       hvad han talte — og så måler den ingenting. */
    const krop = blok.slice(0, blok.indexOf("await logBevaegelse"));
    assert.ok(!krop.includes("d.forventet"),
      "forventningen læses fra nyttelasten");
    assert.ok(!krop.includes("d.afvigelse"));
  });

  it("⚠ SÆTTER SALDOEN, den lægger ikke til", () => {
    /* Blev optællingen lagt til, ville en optælling der BEKRÆFTEDE
       beholdningen, fordoble den. */
    const krop = blok.slice(0, blok.indexOf("await logBevaegelse"));
    assert.ok(krop.includes("antal`]: taeltAntal"),
      "saldoen sættes ikke til det talte");
    assert.ok(!krop.includes("ServerValue.increment"),
      "en optælling må ikke bruge increment");
  });

  it("skriver måling, bevægelse og saldo i én update()", () => {
    const krop = blok.slice(0, blok.indexOf("await logBevaegelse"));
    assert.equal((krop.match(/rod\.update\(/g) || []).length, 1);
    assert.ok(krop.includes("optaellinger/${optId}"));
    assert.ok(krop.includes("bevaegelser/${bevId}"));
  });
});

describe("raterne bor i satser — ikke i et fjerde prissystem", () => {
  const V = 1000;
  const D = (d) => Date.UTC(2026, 5, d);

  it("⚠ SLÅR IKKE SATSEN OP SELV", () => {
    /* satsPaa() i pricing.js er husets ene funktion til "hvilken sats gjaldt
       på det her tidspunkt", og den bærer beslutning 7 om at satser aldrig
       overskrives. Jeg havde skrevet den af som gaeldendeSats(); den er væk
       igen. warehouse.js er importfri og kan ikke importere pricing.js —
       derfor tager afregningslinjer() opslaget som en PARAMETER. */
    assert.throws(
      () => afregningslinjer({ bevaegelser: [], kundeId: "k1", fra: 0, til: 1 }),
      /satsFor/);
    const kilde = readFileSync("src/fleet/warehouse.js", "utf8");
    assert.ok(!kilde.includes("gaeldendeSats"),
      "der er igen en satsopslagsfunktion i warehouse.js");
  });

  it("⚠ AFREGNER IKKE EN OPTÆLLING", () => {
    /* Optælling og justering er VORES kontrol af vores eget lager, ikke en
       ydelse kunden har bedt om. Kunne de afregnes, ville en optælling være
       en indtægt — og så blev der talt af de forkerte grunde. */
    assert.deepEqual(IKKE_AFREGNEDE_ARTER, ["optael", "justering"]);
    const alleArter = ALLE_YDELSER.flatMap((y) => YDELSE[y].arter);
    for (const a of IKKE_AFREGNEDE_ARTER) {
      assert.ok(!alleArter.includes(a), `${a} er blevet fakturerbar`);
    }
  });

  it("regner håndtering pr. hændelse og modtagelse pr. mængde", () => {
    /* ⚠ EN SATS PR. PALLE OG EN PR. HÅNDTERING giver vidt forskellige beløb af
       de samme bevægelser. Derfor står `grundlag` i modellen. */
    const bev = [
      { kundeId: "k1", art: "modtag", antal: 10 * V, tidspunktMs: D(5) },
      { kundeId: "k1", art: "flyt", antal: 4 * V, tidspunktMs: D(5) },
      { kundeId: "k1", art: "flyt", antal: 6 * V, tidspunktMs: D(6) },
    ];
    const satser = {
      modtagelse: [{ gyldigFra: D(1), satsOere: 4500 }],
      haandtering: [{ gyldigFra: D(1), satsOere: 1250 }],
    };
    const satsFor = (y, ms) =>
      (satser[y] || []).filter((s) => s.gyldigFra <= ms)
        .sort((a, b) => b.gyldigFra - a.gyldigFra)[0] || null;
    const l = afregningslinjer({ bevaegelser: bev, satsFor, kundeId: "k1", fra: D(1), til: D(30) });
    const m = l.find((x) => x.ydelse === "modtagelse");
    const h = l.find((x) => x.ydelse === "haandtering");
    /* 10 enheder × 45,00 */
    assert.equal(m.antal, 10 * V);
    assert.equal(m.beloebOere, 45000);
    /* TO hændelser × 12,50 — ikke ti enheder */
    assert.equal(h.haendelser, 2);
    assert.equal(h.antal, 2 * V);
    assert.equal(h.beloebOere, 2500);
  });

  it("⚠ DELER PERIODEN NÅR SATSEN SKIFTER MIDT I DEN", () => {
    /* En enkelt sats for hele måneden ville fakturere den forkerte pris for
       den ene halvdel. */
    const bev = [
      { kundeId: "k1", art: "pluk", antal: 1 * V, tidspunktMs: D(5) },
      { kundeId: "k1", art: "pluk", antal: 1 * V, tidspunktMs: D(20) },
    ];
    const satser = { pluk: [{ gyldigFra: D(1), satsOere: 375 }, { gyldigFra: D(15), satsOere: 400 }] };
    const satsFor = (y, ms) =>
      (satser[y] || []).filter((s) => s.gyldigFra <= ms)
        .sort((a, b) => b.gyldigFra - a.gyldigFra)[0] || null;
    const l = afregningslinjer({ bevaegelser: bev, satsFor, kundeId: "k1", fra: D(1), til: D(30) });
    assert.equal(l.length, 2, "perioden blev ikke delt ved satsskiftet");
    assert.deepEqual(l.map((x) => x.beloebOere).sort((a, b) => a - b), [375, 400]);
  });

  it("holder andre kunder og andre perioder ude", () => {
    const bev = [
      { kundeId: "k1", art: "pluk", antal: 1 * V, tidspunktMs: D(5) },
      { kundeId: "k2", art: "pluk", antal: 1 * V, tidspunktMs: D(5) },
      { kundeId: "k1", art: "pluk", antal: 1 * V, tidspunktMs: D(29) },
    ];
    const satsFor = () => ({ gyldigFra: D(1), beloebOere: 375 });
    /* Halvåbent [fra, til) — den 29. er uden for [1, 29). */
    const l = afregningslinjer({ bevaegelser: bev, satsFor, kundeId: "k1", fra: D(1), til: D(29) });
    assert.equal(l.length, 1);
    assert.equal(l[0].haendelser, 1);
  });

  it("⚠ EN YDELSE UDEN SATS UDELADES IKKE — den står med null", () => {
    /* Udelod vi den, ville fakturaen se komplet ud mens en ydelse manglede en
       pris. Beløbet er null og ikke 0: et beløb på nul ligner en gratis
       ydelse, null er et ubesvaret spørgsmål. */
    const bev = [{ kundeId: "k1", art: "pluk", antal: 1 * V, tidspunktMs: D(5) }];
    const l = afregningslinjer({ bevaegelser: bev, satsFor: () => null, kundeId: "k1", fra: D(1), til: D(30) });
    assert.equal(l.length, 1);
    assert.equal(l[0].satsOere, null);
    assert.equal(l[0].beloebOere, null);
  });

  it("⚠ NÆGTER EN SUM NÅR BARE ÉN SATS MANGLER", () => {
    /* Samme regel som momsen der mangler: et system der lægger de kendte tal
       sammen og lader det manglende stå som nul, giver et tal der ser rigtigt
       ud og er for lavt. */
    assert.equal(afregningssum([{ beloebOere: 100 }, { beloebOere: null }]).beloebOere, null);
    assert.equal(afregningssum([{ beloebOere: 100 }, { beloebOere: null }]).mangler, 1);
    assert.equal(afregningssum([{ beloebOere: 100 }, { beloebOere: 250 }]).beloebOere, 350);
  });
});

describe("carrieren — beholderen kundens gods står i", () => {
  const CTX = { pladser: ["p-1", "p-2"], kunder: ["k-1"] };
  const OK = {
    id: "CRR-100245", type: "pallekasse", ejerforhold: "ejet",
    status: "paaLager", pladsId: "p-1", kundeId: "k-1",
  };

  it("accepterer en gyldig carrier", () => {
    assert.deepEqual(valideCarrier(OK, CTX), {});
  });

  it("kræver type, ejerforhold og status", () => {
    assert.ok(valideCarrier({ ...OK, type: undefined }, CTX).type);
    assert.ok(valideCarrier({ ...OK, type: "papkasse" }, CTX).type);
    assert.ok(valideCarrier({ ...OK, ejerforhold: undefined }, CTX).ejerforhold);
    assert.ok(valideCarrier({ ...OK, ejerforhold: "lejet" }, CTX).ejerforhold);
    assert.ok(valideCarrier({ ...OK, status: "påLager" }, CTX).status);
  });

  it("⚠ ID-ET ER EN DATABASENØGLE", () => {
    /* Samme fælde som ydelses-id'et i PRISER.md: RTDB tillader hverken
       . # $ [ ] eller / i en nøgle, og hver skrivning ville fejle med
       "invalid path" et helt andet sted end der hvor navnet blev valgt. */
    assert.ok(valideCarrier({ ...OK, id: "CRR.100245" }, CTX).id);
    assert.ok(valideCarrier({ ...OK, id: "CRR/245" }, CTX).id);
    assert.ok(valideCarrier({ ...OK, id: "" }, CTX).id);
    assert.deepEqual(valideCarrier({ ...OK, id: "CRR_100-245" }, CTX), {});
  });

  it("⚠ EN CARRIER I TRANSIT OPTAGER IKKE EN HYLDE", () => {
    /* Præcis samme regel som en udlånt kasse: prototypen skrev "Udlånt hos
       kunde" SOM plads, og så kunne ledige pladser ikke tælles. */
    assert.ok(valideCarrier({ ...OK, status: "iTransit" }, CTX).pladsId);
    assert.deepEqual(
      valideCarrier({ ...OK, status: "iTransit", pladsId: null }, CTX), {});
    /* Ude af drift står stadig et sted — den er ødelagt, ikke væk. */
    assert.deepEqual(valideCarrier({ ...OK, status: "udeAfDrift" }, CTX), {});
  });

  it("⚠ EN CARRIER PÅ LAGERET MÅ GERNE MANGLE SIN PLADS", () => {
    /* Scannet ind, ikke placeret — det er de elleve "uden lokation" på
       planchen. Kræver man en plads, kan modtagelsen ikke gemme det der
       faktisk er sket. */
    assert.deepEqual(valideCarrier({ ...OK, pladsId: null }, CTX), {});
    assert.equal(udenLokation({ status: "paaLager" }), true);
    assert.equal(udenLokation({ status: "paaLager", pladsId: "p-1" }), false);
    /* En i transit er ikke "uden lokation" — den er undervejs. */
    assert.equal(udenLokation({ status: "iTransit" }), false);
    assert.equal(udenLokation({ status: "opbrugt" }), false);
  });

  it("⚠ KUN EN ENGANGS KAN VÆRE OPBRUGT", () => {
    /* En egen beholder kommer retur; er den ødelagt, er den ude af drift.
       Kunne de bruges i flæng, kunne man ikke tælle hvor mange beholdere man
       faktisk har. */
    assert.ok(valideCarrier(
      { ...OK, status: "opbrugt", pladsId: null }, CTX).status);
    assert.deepEqual(valideCarrier(
      { ...OK, ejerforhold: "engang", status: "opbrugt", pladsId: null }, CTX), {});
  });

  it("afviser en plads og en kunde der ikke findes", () => {
    assert.ok(valideCarrier({ ...OK, pladsId: "p-9" }, CTX).pladsId);
    assert.ok(valideCarrier({ ...OK, kundeId: "k-9" }, CTX).kundeId);
    /* Uden kontekst kan de ikke prøves — så lader vi være med at påstå. */
    assert.deepEqual(valideCarrier({ ...OK, pladsId: "p-9", kundeId: "k-9" }, {}), {});
  });

  it("kræver mål i hele millimeter", () => {
    /* Samme regel som varens mål og samletLaengdeMm() i flaade.js. En float
       ved en volumengrænse er en fejl der venter. */
    assert.ok(valideCarrier({ ...OK, laengdeMm: 1200.5 }, CTX).laengdeMm);
    assert.ok(valideCarrier({ ...OK, breddeMm: -1 }, CTX).breddeMm);
    assert.deepEqual(
      valideCarrier({ ...OK, laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950 }, CTX), {});
    /* Målene er valgfrie — en engangs-kartonkasse måles ikke op. */
    assert.deepEqual(valideCarrier({ ...OK, laengdeMm: null }, CTX), {});
  });

  it("kundeId er valgfrit — en tom beholder tilhører ingen endnu", () => {
    assert.deepEqual(valideCarrier({ ...OK, kundeId: null }, CTX), {});
  });

  it("⚠ HVER STATUS SIGER OM DEN KRÆVER EN PLADS", () => {
    /* Reolplads-opgørelsen hviler på invarianten: det der har et pladsId,
       står der. Uden den ville en carrier i transit kunne tælle på en hylde. */
    assert.equal(kraeverLokation("paaLager"), true);
    assert.equal(kraeverLokation("udeAfDrift"), true);
    assert.equal(kraeverLokation("iTransit"), false);
    assert.equal(kraeverLokation("opbrugt"), false);
    assert.equal(kraeverLokation("findesIkke"), false);
  });

  it("statusserne i koden er de samme som i reglerne", () => {
    /* ⚠ TO LISTER DRIVER. Reglerne er dem der afgør; står der en status i
       koden som reglerne ikke kender, afvises skrivningen først hos kunden. */
    const regler = readFileSync("firebase.rules.json", "utf8");
    for (const s of ALLE_CARRIER_STATUS) {
      assert.ok(regler.includes(s), `status "${s}" står ikke i firebase.rules.json`);
    }
    for (const t of ALLE_CARRIER_TYPER) {
      assert.ok(regler.includes(t), `typen "${t}" står ikke i firebase.rules.json`);
    }
  });

  it("⚠ 'DELVIST TØMT' ER IKKE EN STATUS", () => {
    /* Planchen viser den, men den kræver et referencetal — delvist i forhold
       til hvad? Indholdet ligger først på carrieren i etape 12. En status vi
       gemte nu, ville være gættet før spørgsmålet var besvaret, og den ville
       drive fra beholdningen som `bemanding.ledig`. */
    assert.ok(!ALLE_CARRIER_STATUS.includes("delvistTomt"));
    /* Og "ingen lokation" er fraværet af en plads — ikke en femte status. */
    assert.ok(!ALLE_CARRIER_STATUS.includes("ingenLokation"));
  });
});

describe("placeringen — beholderen sættes på en hylde", () => {
  const CTX = { pladser: ["p1", "p2"], carriers: ["c1", "c2"] };
  const OK = { art: "putaway", carrierId: "c1", tilPladsId: "p1" };

  it("kræver en beholder og en hylde", () => {
    assert.deepEqual(valideBevaegelse(OK, CTX), {});
    assert.ok(valideBevaegelse({ ...OK, carrierId: null }, CTX).carrierId);
    assert.ok(valideBevaegelse({ ...OK, tilPladsId: null }, CTX).tilPladsId);
    assert.ok(valideBevaegelse({ ...OK, carrierId: "c9" }, CTX).carrierId);
    assert.ok(valideBevaegelse({ ...OK, tilPladsId: "p9" }, CTX).tilPladsId);
  });

  it("⚠ HAR HVERKEN VARE ELLER ANTAL", () => {
    /* Den flytter beholderen med alt hvad der er i den. Godset skifter ikke
       mængde af at blive båret et andet sted hen, og et antal her ville være
       et tal ingen kunne forklare bagefter. */
    assert.ok(valideBevaegelse({ ...OK, vareId: "v1" }, CTX).vareId);
    assert.ok(valideBevaegelse({ ...OK, antal: 1000 }, CTX).antal);
    assert.ok(valideBevaegelse({ ...OK, batch: "LOT-1" }, CTX).batch);
    /* Og den blander sig ikke med godsbevægelsens felter. */
    assert.ok(valideBevaegelse({ ...OK, fraCarrierId: "c2" }, CTX).fraCarrierId);
  });

  it("⚠ ER DEN ENESTE ART DER FLYTTER EN BEHOLDER", () => {
    /* Alle andre flytter gods MELLEM beholdere. Var der to arter der begge
       kunne flytte en beholder, ville "hvor står den?" have to svar. */
    const flytter = ALLE_BEVAEGELSE_ARTER.filter((a) => BEVAEGELSE_ART[a].flytterCarrier);
    assert.deepEqual(flytter, ["putaway"]);
  });

  it("valideBevaegelse deler sig efter arten", () => {
    /* Samme indgang, to skemaer. En placering prøvet mod godsreglerne ville
       blive afvist for at mangle en vare den ikke skal have. */
    assert.deepEqual(validePlacering(OK, CTX), valideBevaegelse(OK, CTX));
  });
});

describe("nøglen bærer beholderen", () => {
  it("⚠ ER <carrierId>__<vareId>__<batch>", () => {
    /* Efter etape 12 ligger godset i en beholder. Nøglen er deterministisk,
       så serveren kan skrive uden først at slå op — og så samme beholder og
       vare ALDRIG kan få to poster. */
    assert.equal(beholdningsNoegle("CRR-1", "v1", "LOT-A"), "CRR-1__v1__LOT-A");
    assert.equal(beholdningsNoegle("CRR-1", "v1", null), `CRR-1__v1__${UDEN_BATCH}`);
  });

  it("⚠ OG HYLDEN STÅR IKKE I DEN", () => {
    /* Stod pladsen i nøglen, ville en flytning af beholderen kræve at hver
       eneste beholdningspost blev skrevet om — N ændringer der skulle lykkes
       sammen, hvor atomiciteten kun er delvis. Nu er en flytning ét felt. */
    const n = beholdningsNoegle("CRR-1", "v1", "LOT-A");
    assert.ok(!n.includes("p-"), "nøglen bærer en plads");
  });
});

describe("serveren læser ikke et felt forbi", () => {
  const kilde = readFileSync("functions/index.js", "utf8");

  it("⚠ EN PLACERING MED ET ANTAL AFVISES AF FUNKTIONEN", () => {
    /* Fundet af en probe mod den udrullede base: funktionen læste `antal`
       forbi, så kaldet lykkedes. Der landede ingen forkerte data — posten
       bygges af serveren — men kalderen troede at tallet betød noget.
       Et felt der tages imod og ignoreres, er værre end et der afvises. */
    const start = kilde.indexOf("async function skrivPlacering");
    const blok = kilde.slice(start, kilde.indexOf("async function logBevaegelse", start));
    assert.ok(blok.includes("vareId: kortStreng(d.vareId"),
      "de forbudte felter sendes ikke med i valideringen");
    assert.ok(blok.includes('antal: typeof d.antal === "number"'),
      "et antal på en placering læses stadig forbi");
  });
});

describe("carrier-overblikkets fem tal", () => {
  const C = [
    { id: "c1", status: "paaLager", ejerforhold: "ejet", pladsId: "p1" },
    { id: "c2", status: "paaLager", ejerforhold: "ejet" },
    { id: "c3", status: "iTransit", ejerforhold: "ejet" },
    { id: "c4", status: "paaLager", ejerforhold: "engang" },
    { id: "c5", status: "opbrugt", ejerforhold: "engang" },
    { id: "c6", status: "udeAfDrift", ejerforhold: "ejet", pladsId: "p2" },
  ];
  const B = [
    { carrierId: "c1", vareId: "v1", antal: 1000 },
    { carrierId: "c1", vareId: "v2", antal: 500 },
    /* En tømt post bliver stående — den er historik og tæller ikke som
       indhold. Ellers ville hver tømt beholder se fuld ud for altid. */
    { carrierId: "c2", vareId: "v1", antal: 0 },
    { carrierId: "c4", vareId: "v3", antal: 70 },
  ];

  it("tæller hver ting for sig", () => {
    assert.deepEqual(carrieroverblik(C, B), {
      ialt: 6, aktive: 4, iTransit: 1, engangs: 1, udenLokation: 2, medIndhold: 2,
    });
  });

  it("⚠ EN OPBRUGT ENGANGS ER IKKE EN AKTIV BEHOLDER", () => {
    /* Den findes stadig og bærer sin historik — derfor tæller den i `ialt`.
       Men den er ude af omløb, og talte den med under "aktive", kunne man
       ikke se hvor mange beholdere man faktisk har at arbejde med. */
    const kun = carrieroverblik([{ id: "x", status: "opbrugt", ejerforhold: "engang" }], []);
    assert.equal(kun.ialt, 1);
    assert.equal(kun.aktive, 0);
    assert.equal(kun.engangs, 0);
  });

  it("⚠ 'UDEN LOKATION' ER KUN DEM DER BURDE STÅ ET STED", () => {
    /* En beholder i transit mangler ikke en plads — den er undervejs. Talte
       den med, ville tallet ikke længere være en liste over noget nogen skal
       gøre noget ved. */
    assert.equal(carrieroverblik([{ id: "t", status: "iTransit", ejerforhold: "ejet" }], []).udenLokation, 0);
    assert.equal(carrieroverblik([{ id: "u", status: "paaLager", ejerforhold: "ejet" }], []).udenLokation, 1);
  });

  it("tåler tomme lister", () => {
    assert.deepEqual(carrieroverblik(), {
      ialt: 0, aktive: 0, iTransit: 0, engangs: 0, udenLokation: 0, medIndhold: 0,
    });
  });

  it("⚠ TALLENE LIGGER IKKE I kpi/ — ET DELTA GØR", () => {
    /* De fem er afledt af data skærmen har, og et gemt tal ville drive fra
       sit grundlag. "Siden i går" kan derimod ikke regnes af dagens rækker,
       og det ene felt hører derfor i kpi/. Se CLAUDE.md om undtagelsen. */
    const kpi = readFileSync("src/fleet/demo-kpi.js", "utf8");
    assert.ok(kpi.includes("carriereUdenLokationDelta"),
      "delta-feltet er ikke defineret i demo-kpi.js");
    for (const felt of ["carriereAktive:", "carriereITransit:", "carriereMedIndhold:"]) {
      assert.ok(!kpi.includes(felt),
        `${felt} er gemt i kpi/, men kan regnes af det skærmen har`);
    }
  });

  it("skærmen henter tallene fra funktionen og ikke fra sin egen tælling", () => {
    /* Kodeprøve, som den på belægningen: adfærdsprøverne kan ikke se om
       skærmen begynder at tælle selv igen. */
    const skaerm = readFileSync("src/moduler/warehouse/Carriers.jsx", "utf8");
    assert.ok(skaerm.includes("carrieroverblik(carriers, beholdning)"));
    assert.ok(skaerm.includes("k?.warehouse"),
      "delta-kortet læser ikke fra kpi/");
  });
});

describe("modtagelsen — at placere er at ankomme", () => {
  it("⚠ EN BEHOLDER I TRANSIT BLIVER paaLager NÅR DEN SÆTTES PÅ EN HYLDE", () => {
    /* To skridt ville betyde at der fandtes et øjeblik hvor beholderen både
       var i transit og stod på en hylde — og det er præcis den tilstand
       belægningen hviler på ikke findes. */
    const v = virkningPaaCarrier(
      { art: "putaway", carrierId: "c1", tilPladsId: "p1" },
      { id: "c1", status: "iTransit" });
    assert.deepEqual(v, { carrierId: "c1", pladsId: "p1", status: "paaLager" });
  });

  it("en beholder der allerede er på lageret, skifter ikke status", () => {
    /* En flytning fra hylde til hylde er ikke en ankomst. Skrev vi statussen
       med hver gang, ville auditloggen vise et skifte der ikke skete. */
    const v = virkningPaaCarrier(
      { art: "putaway", carrierId: "c1", tilPladsId: "p2" },
      { id: "c1", status: "paaLager", pladsId: "p1" });
    assert.deepEqual(v, { carrierId: "c1", pladsId: "p2" });
    /* Uden beholderen kan ankomsten ikke afgøres — så påstås den ikke. */
    assert.deepEqual(virkningPaaCarrier({ art: "putaway", carrierId: "c1", tilPladsId: "p2" }),
      { carrierId: "c1", pladsId: "p2" });
  });

  it("⚠ kanPlaceres ER IKKE DET SAMME SOM kraeverLokation", () => {
    /* Den ene svarer på om beholderen BURDE stå et sted, den anden på om den
       må flyttes dertil. En i transit må — det er ankomsten — men den er
       ikke "uden lokation" imens. */
    assert.equal(kanPlaceres("iTransit"), true);
    assert.equal(kraeverLokation("iTransit"), false);
    assert.equal(kanPlaceres("paaLager"), true);
    assert.equal(kanPlaceres("udeAfDrift"), true);
    /* En opbrugt engangskasse kommer ikke på en hylde igen. */
    assert.equal(kanPlaceres("opbrugt"), false);
    assert.equal(kanPlaceres("findesIkke"), false);
  });
});

describe("undefined bliver til null på vejen gennem en callable", () => {
  const cf = readFileSync("functions/index.js", "utf8");
  const klient = readFileSync("src/fleet/lager.js", "utf8");

  it("⚠ SERVEREN LÆSER `antal` MED typeof, IKKE MED Number()", () => {
    /* `Number(null)` er 0 — et tal der ser sendt ud. Skærmen sendte ingen
       mængde på en placering, og den blev afvist for at bære en på nul.
       Proben fandt det ikke: den udelod feltet HELT. Det var et klik i
       browseren der fandt det. */
    const start = cf.indexOf("async function skrivPlacering");
    const blok = cf.slice(start, cf.indexOf("async function logBevaegelse", start));
    assert.ok(blok.includes('typeof d.antal === "number"'),
      "et antal på null læses stadig som 0");
    assert.ok(!blok.includes("Number.isFinite(Number(d.antal))"));
  });

  it("klienten sender slet ikke de felter arten ikke har", () => {
    /* Den anden halvdel af rettelsen: sendes feltet ikke, er der ingen null
       at koste om. To lag, fordi den ene side ikke kan stole på den anden. */
    assert.ok(klient.includes("vareId: vareId || undefined"));
    assert.ok(klient.includes("antal: Number.isFinite(antal) ? antal : undefined"));
  });

  it("⚠ EN PLACERING UDEN MÆNGDE ER GYLDIG", () => {
    /* Selve reglen, prøvet på funktionen frem for på teksten: null og
       undefined er begge "ingen mængde". Kun et rigtigt tal er en fejl. */
    const CTX = { pladser: ["p1"], carriers: ["c1"] };
    const OK = { art: "putaway", carrierId: "c1", tilPladsId: "p1" };
    assert.deepEqual(validePlacering({ ...OK, antal: null, vareId: null }, CTX), {});
    assert.deepEqual(validePlacering({ ...OK, antal: undefined }, CTX), {});
    assert.ok(validePlacering({ ...OK, antal: 0 }, CTX).antal,
      "en mængde på nul er stadig en mængde der ikke hører til");
  });
});
