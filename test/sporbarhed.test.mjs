/* test/sporbarhed.test.mjs
 * Sporbarhed — etape 9.
 *
 * Prøven der betyder mest, står nederst: at `enhedsafvigelse()` faktisk finder
 * uenigheden mellem de to kilder. Den funktion ER prisen ved at have enheden
 * som eget objekt, og virker den ikke, har vi betalt uden at få noget.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SERIE_MOENSTER, ENHED_TILSTAND, ALLE_ENHED_TILSTANDE, UDGAAENDE_ARTER,
  valideEnhed, virkningPaaEnhed, spor, partiPlacering, enhedsafvigelse,
  valideBevaegelse, MAENGDE_SKALA, UDEN_BATCH,
} from "../src/fleet/warehouse.js";
import { DEMO_ENHEDER, DEMO_BEHOLDNING, DEMO_VARER } from "../src/fleet/demo-lager.js";

const SERIEVARE = { id: "v-tool", sporing: "serie", enhed: "stk", kundeId: "k1" };
const BATCHVARE = { id: "v-lot", sporing: "batch", enhed: "stk", kundeId: "k1" };
const M = (n) => n * MAENGDE_SKALA;

/* ---- Serienummeret som nøgle ------------------------------------------ */

test("⚠ ET SERIENUMMER MED PUNKTUM AFVISES — det bliver en RTDB-nøgle", () => {
  /* Samme fælde som batchen. RTDB tillader hverken . # $ [ ] eller / i en
     nøgle, og en skrivning ville fejle et helt andet sted end der hvor fejlen
     blev lavet. */
  assert.ok(SERIE_MOENSTER.test("SN-4711"));
  assert.ok(SERIE_MOENSTER.test("SN_4711"));
  assert.ok(!SERIE_MOENSTER.test("SN.4711"));
  assert.ok(!SERIE_MOENSTER.test("SN/4711"));
  assert.ok(!SERIE_MOENSTER.test("SN#4711"));
  assert.ok(!SERIE_MOENSTER.test("-SN4711"), "må ikke starte med bindestreg");
  assert.ok(!SERIE_MOENSTER.test(""), "tom streng kan ikke være en nøgle");
});

test("mønstret tillader 60 tegn — ikke batchens 40", () => {
  /* Reglerne har tilladt 60 i `serienummer` siden etape 4. En stramning til
     batchens grænse ville afvise noget der allerede står i basen. */
  assert.ok(SERIE_MOENSTER.test("A".repeat(60)));
  assert.ok(!SERIE_MOENSTER.test("A".repeat(61)));
});

test("⚠ SERIENUMMERET PRØVES MOD MØNSTRET PÅ BEVÆGELSEN OGSÅ", () => {
  /* Ellers ville den ugyldige nøgle først blive opdaget af skrivningen. */
  const b = {
    art: "modtag", vareId: "v-tool", kundeId: "k1", antal: M(1),
    tilCarrierId: "CRR-1", serienummer: "SN.4711",
  };
  assert.match(valideBevaegelse(b, { vare: SERIEVARE }).serienummer, /punktum/);
});

/* ---- Én bevægelse, én enhed ------------------------------------------- */

test("⚠ EN SERIE-SPORET VARE BÆRER PRÆCIS ÉN ENHED PR. BEVÆGELSE", () => {
  /* Bar bevægelsen ti, skulle ét serienummer bestemme ti enheders skæbne — og
     de ni ville være usporede bag et tal der så rigtigt ud. Det er også
     forudsætningen for at enhedsrækken kan skrives i den samme opdatering:
     der er én række, ikke en liste. */
  const b = (antal) => ({
    art: "modtag", vareId: "v-tool", kundeId: "k1", antal,
    tilCarrierId: "CRR-1", serienummer: "SN-4711",
  });
  assert.deepEqual(valideBevaegelse(b(M(1)), { vare: SERIEVARE }), {});
  assert.match(valideBevaegelse(b(M(10)), { vare: SERIEVARE }).antal, /én enhed/);
});

test("en batch-vare må gerne bære mange — kun serie er låst", () => {
  const b = {
    art: "modtag", vareId: "v-lot", kundeId: "k1", antal: M(420),
    tilCarrierId: "CRR-1", batch: "LOT-1",
  };
  assert.deepEqual(valideBevaegelse(b, { vare: BATCHVARE }), {});
});

test("⚠ EN OPTÆLLING ER UNDTAGET — dér ER antal en saldo", () => {
  /* En optælling af tre serie-enheder siger "der ligger tre", ikke "flyt tre".
     Krævede vi ét, kunne en serie-vare aldrig tælles. */
  const b = {
    art: "optael", vareId: "v-tool", kundeId: "k1", antal: M(3),
    tilCarrierId: "CRR-1", serienummer: "SN-4711",
  };
  assert.equal(valideBevaegelse(b, { vare: SERIEVARE }).antal, undefined);
});

/* ---- Enheden som post -------------------------------------------------- */

test("⚠ I HUSET KRÆVER EN BEHOLDER, UDE AF HUSET FORBYDER DEN", () => {
  /* En enhed på lager uden beholder er gods ingen kan finde. En afsendt enhed
     MED beholder ville tælle med i beholderens indhold — og så ser beholderen
     fyldt ud af noget der er kørt. */
  const grund = { serienummer: "SN-1", vareId: "v-tool", kundeId: "k1" };
  assert.match(valideEnhed({ ...grund, tilstand: "paaLager" }).carrierId, /ligger i en beholder/);
  assert.deepEqual(valideEnhed({ ...grund, tilstand: "paaLager", carrierId: "CRR-1" }), {});
  assert.deepEqual(valideEnhed({ ...grund, tilstand: "afsendt" }), {});
  assert.match(
    valideEnhed({ ...grund, tilstand: "afsendt", carrierId: "CRR-1" }).carrierId,
    /ligger ikke i en beholder/);
});

test("enheden bærer sin kunde — et historisk faktum, som på bevægelsen", () => {
  /* Skifter varen ejer, må sidste kvartals sporbarhedsudtræk ikke pludselig
     pege på en anden kunde. */
  const f = valideEnhed({ serienummer: "SN-1", vareId: "v-tool", tilstand: "afsendt" });
  assert.match(f.kundeId, /kunde/);
});

test("kun to tilstande — karantæne sidder på hylden", () => {
  /* En enhed der bar sin egen karantæne, kunne stå spærret på en fri plads:
     to svar på om der må plukkes. Se kanPlukkesFra(). */
  assert.deepEqual(ALLE_ENHED_TILSTANDE, ["paaLager", "afsendt"]);
  assert.equal(ENHED_TILSTAND.paaLager.iHuset, true);
  assert.equal(ENHED_TILSTAND.afsendt.iHuset, false);
});

/* ---- Hvad en bevægelse gør ved enheden --------------------------------- */

test("⚠ ENHEDEN ER HVOR DEN ENDER — tilCarrierId, ikke fraCarrierId", () => {
  /* En række der pegede på hvor enheden kom fra, ville svare på det forrige
     spørgsmål. */
  const v = virkningPaaEnhed({
    art: "flyt", vareId: "v-tool", kundeId: "k1", antal: M(1),
    fraCarrierId: "CRR-1", tilCarrierId: "CRR-2", serienummer: "SN-4711",
  }, { vare: SERIEVARE });
  assert.equal(v.serienummer, "SN-4711");
  assert.equal(v.felter.carrierId, "CRR-2");
  assert.equal(v.felter.tilstand, "paaLager");
  assert.equal(v.kraeverLedigtSerienummer, false, "enheden findes i forvejen");
  assert.equal(v.kraeverEnhedenLiggerI, "CRR-1");
});

test("en afsendelse tager enheden ud af huset og fjerner beholderen", () => {
  const v = virkningPaaEnhed({
    art: "afsend", vareId: "v-tool", kundeId: "k1", antal: M(1),
    fraCarrierId: "CRR-1", serienummer: "SN-4711",
  }, { vare: SERIEVARE });
  assert.equal(v.felter.tilstand, "afsendt");
  assert.equal(v.felter.carrierId, null);
  assert.ok(UDGAAENDE_ARTER.includes("afsend"));
});

test("en modtagelse kræver at serienummeret er ledigt", () => {
  const v = virkningPaaEnhed({
    art: "modtag", vareId: "v-tool", kundeId: "k1", antal: M(1),
    tilCarrierId: "CRR-1", serienummer: "SN-4711",
  }, { vare: SERIEVARE });
  assert.equal(v.kraeverLedigtSerienummer, true);
  assert.equal(v.kraeverEnhedenLiggerI, null);
});

test("⚠ EN PLACERING RØRER INGEN ENHED", () => {
  /* Beholderen flytter med alt hvad der er i den; enheden ligger stadig i den
     samme beholder bagefter. Samme gevinst som ved beholdningen. */
  assert.equal(virkningPaaEnhed(
    { art: "putaway", carrierId: "CRR-1", tilPladsId: "p-1", serienummer: "SN-4711" },
    { vare: SERIEVARE }), null);
});

test("en optælling flytter ingen enhed — den er kontrol af et TAL", () => {
  assert.equal(virkningPaaEnhed(
    { art: "optael", vareId: "v-tool", kundeId: "k1", antal: M(3),
      tilCarrierId: "CRR-1", serienummer: "SN-4711" },
    { vare: SERIEVARE }), null);
});

test("en vare uden serie-sporing giver ingen virkning", () => {
  assert.equal(virkningPaaEnhed(
    { art: "modtag", vareId: "v-lot", antal: M(5), tilCarrierId: "CRR-1", batch: "LOT-1" },
    { vare: BATCHVARE }), null);
});

/* ---- Sporet ------------------------------------------------------------ */

const BEV = [
  { id: "b3", vareId: "v-lot", batch: "LOT-1", art: "pluk", tidspunktMs: 300 },
  { id: "b1", vareId: "v-lot", batch: "LOT-1", art: "modtag", tidspunktMs: 100 },
  { id: "b2", vareId: "v-lot", batch: "LOT-1", art: "flyt", tidspunktMs: 200 },
  { id: "b4", vareId: "v-lot", batch: "LOT-2", art: "modtag", tidspunktMs: 150 },
  { id: "b5", vareId: "v-andet", batch: "LOT-1", art: "modtag", tidspunktMs: 120 },
  { id: "b6", vareId: "v-tool", serienummer: "SN-4711", art: "modtag", tidspunktMs: 90 },
  { id: "b7", vareId: "v-usporet", art: "modtag", tidspunktMs: 80 },
];

test("⚠ SPORET LÆSES ÆLDSTE FØRST — et forløb læses forfra", () => {
  /* Alle andre lister i huset er nyeste først, fordi de svarer på "hvad er der
     sket for nylig". Den her svarer på "hvad skete der med DEN her" — og
     vendes den om, læser man forløbet baglæns uden at opdage det. */
  const s = spor(BEV, { vareId: "v-lot", batch: "LOT-1" });
  assert.deepEqual(s.map((b) => b.id), ["b1", "b2", "b3"]);
});

test("⚠ EN BATCH ER KUN ENTYDIG SAMMEN MED SIN VARE", () => {
  /* To kunder kan have hver sin LOT-1. Uden vareId ville et tilbagekald ramme
     en fremmed kundes gods — den værste udgang af netop denne skærm. */
  const s = spor(BEV, { vareId: "v-lot", batch: "LOT-1" });
  assert.ok(!s.some((b) => b.vareId === "v-andet"));
});

test("et opslag uden batch finder bevægelserne uden batch", () => {
  /* UDEN_BATCH er nøglens sentinel, aldrig en værdi på selve bevægelsen. */
  assert.deepEqual(spor(BEV, { vareId: "v-usporet" }).map((b) => b.id), ["b7"]);
  assert.deepEqual(spor(BEV, { vareId: "v-usporet", batch: UDEN_BATCH }).map((b) => b.id), ["b7"]);
});

test("et serienummer sporer på tværs af vare-filteret", () => {
  assert.deepEqual(spor(BEV, { serienummer: "SN-4711" }).map((b) => b.id), ["b6"]);
});

test("et tomt opslag giver ingenting — ikke hele lageret", () => {
  /* Ellers ville skærmen vise 5000 bevægelser i det øjeblik den blev åbnet. */
  assert.deepEqual(spor(BEV, {}), []);
  assert.deepEqual(spor(BEV, { batch: "LOT-1" }), [], "en batch uden vare er ikke et opslag");
});

test("spor() rører ikke listen den fik", () => {
  const kopi = BEV.slice();
  spor(BEV, { vareId: "v-lot", batch: "LOT-1" });
  assert.deepEqual(BEV.map((b) => b.id), kopi.map((b) => b.id));
});

/* ---- Hvor ligger partiet ----------------------------------------------- */

const BEH = [
  { id: "k1", carrierId: "CRR-1", vareId: "v-lot", batch: "LOT-1", antal: M(100) },
  { id: "k2", carrierId: "CRR-2", vareId: "v-lot", batch: "LOT-1", antal: 0 },
  { id: "k3", carrierId: "CRR-3", vareId: "v-lot", batch: "LOT-2", antal: M(50) },
];
const CARRIERS = [
  { id: "CRR-1", pladsId: "p-a-01" },
  { id: "CRR-2", pladsId: "p-b-02" },
  { id: "CRR-3" },
];

test("⚠ KUN BEHOLDERE MED NOGET I — en nulrække sender nogen til en tom hylde", () => {
  const p = partiPlacering(BEH, { vareId: "v-lot", batch: "LOT-1" }, { carriers: CARRIERS });
  assert.deepEqual(p.map((r) => r.carrierId), ["CRR-1"]);
  assert.equal(p[0].pladsId, "p-a-01");
});

test("en beholder uden plads giver pladsId null — ikke en fejl", () => {
  /* Den er i transit eller scannet ind uden at være sat. Skærmen skal skrive
     hvad det betyder frem for at vise en tom rubrik. */
  const p = partiPlacering(BEH, { vareId: "v-lot", batch: "LOT-2" }, { carriers: CARRIERS });
  assert.equal(p.length, 1);
  assert.equal(p[0].pladsId, null);
  assert.equal(p[0].carrier.id, "CRR-3");
});

/* ══════════════════════════════════════════════════════════════════════════
   AFVIGELSEN — PRISEN VED VALGET

   `enheder/<serienr>` og `beholdning` bærer den samme kendsgerning. Virker den
   her funktion ikke, har vi betalt prisen uden at få noget for den.
   ══════════════════════════════════════════════════════════════════════════ */

const VARER = [
  { id: "v-tool", sporing: "serie" },
  { id: "v-lot", sporing: "batch" },
];

test("⚠ UENIGHEDEN FINDES — tallet siger tre, rækkerne siger to", () => {
  const beh = [{ carrierId: "CRR-1", vareId: "v-tool", antal: M(3) }];
  const enh = [
    { id: "SN-1", vareId: "v-tool", carrierId: "CRR-1", tilstand: "paaLager" },
    { id: "SN-2", vareId: "v-tool", carrierId: "CRR-1", tilstand: "paaLager" },
  ];
  const a = enhedsafvigelse(beh, enh, { varer: VARER });
  assert.equal(a.length, 1);
  assert.deepEqual(a[0], { carrierId: "CRR-1", vareId: "v-tool", saldo: 3, enheder: 2 });
});

test("ingen uenighed når de stemmer", () => {
  const beh = [{ carrierId: "CRR-1", vareId: "v-tool", antal: M(2) }];
  const enh = [
    { id: "SN-1", vareId: "v-tool", carrierId: "CRR-1", tilstand: "paaLager" },
    { id: "SN-2", vareId: "v-tool", carrierId: "CRR-1", tilstand: "paaLager" },
  ];
  assert.deepEqual(enhedsafvigelse(beh, enh, { varer: VARER }), []);
});

test("⚠ EN AFSENDT ENHED TÆLLER IKKE MED — den er ude af huset", () => {
  /* Talte den med, ville hver eneste afsendelse skabe en falsk uenighed. */
  const beh = [{ carrierId: "CRR-1", vareId: "v-tool", antal: M(1) }];
  const enh = [
    { id: "SN-1", vareId: "v-tool", carrierId: "CRR-1", tilstand: "paaLager" },
    { id: "SN-0", vareId: "v-tool", tilstand: "afsendt" },
  ];
  assert.deepEqual(enhedsafvigelse(beh, enh, { varer: VARER }), []);
});

test("⚠ EN ENHED UDEN BEHOLDNINGSPOST ER OGSÅ EN UENIGHED", () => {
  /* Uden det led ville en enhed der lå et sted lageret ikke kender, være
     usynlig — og det er præcis den slags hul en migrering efterlader. */
  const enh = [{ id: "SN-1", vareId: "v-tool", carrierId: "CRR-9", tilstand: "paaLager" }];
  const a = enhedsafvigelse([], enh, { varer: VARER });
  assert.deepEqual(a, [{ carrierId: "CRR-9", vareId: "v-tool", saldo: 0, enheder: 1 }]);
});

test("⚠ KUN SERIE-SPOREDE VARER SAMMENLIGNES", () => {
  /* En batch-vare har ingen enhedsrækker at være uenig med, og en
     sammenligning ville melde afvigelse på hver eneste palle. */
  const beh = [{ carrierId: "CRR-1", vareId: "v-lot", batch: "LOT-1", antal: M(420) }];
  assert.deepEqual(enhedsafvigelse(beh, [], { varer: VARER }), []);
});

/* ---- Demo-sættet ------------------------------------------------------- */

test("⚠ DEMO-SÆTTET ER ENIGT MED SIG SELV", () => {
  /* Er det ikke det, står afvigelsespanelet rødt fra dag ét — og så lærer man
     at rødt er normaltilstanden. En rigtig uenighed hos en kunde ville
     forsvinde i støjen fra vores egen. */
  assert.deepEqual(
    enhedsafvigelse(DEMO_BEHOLDNING, DEMO_ENHEDER, { varer: DEMO_VARER }), [],
    "demo-lager.js viser en uenighed vi selv har lavet");
});

test("demo-sættet bærer både en enhed i huset og en afsendt", () => {
  /* Den afsendte skal med: den har ingen beholder, tæller ikke med nogen
     steder — og den bliver stående, fordi sporet er hele grunden til at
     rækken findes. */
  assert.ok(DEMO_ENHEDER.some((e) => e.tilstand === "paaLager"));
  const ude = DEMO_ENHEDER.find((e) => e.tilstand === "afsendt");
  assert.ok(ude, "ingen afsendt enhed — så er den tilstand aldrig set i dev");
  assert.equal(ude.carrierId, undefined, "en afsendt enhed ligger ikke i en beholder");
});

/* ---- Skærmen ----------------------------------------------------------- */

test("skærmen regner ikke selv", () => {
  const s = readFileSync("src/moduler/warehouse/Sporbarhed.jsx", "utf8");
  assert.ok(s.includes("spor(bevaegelser"), "sporet bygges ikke af husets funktion");
  assert.ok(s.includes("partiPlacering("), "placeringen findes ikke gennem husets funktion");
  assert.ok(s.includes("enhedsafvigelse("), "uenigheden vises ikke");
  /* ⚠ OG DEN SKRIVER INGENTING. Sporet er en FØLGE af bevægelserne; de
     registreres hvor de sker — i Bevægelser, Modtagelse, Pluk og Optælling.
     En knap her ville være endnu en vej ind i det samme. Prøven leder efter
     IMPORTEN, ikke efter ordet: filen forklarer i prosa hvad den ikke gør. */
  assert.ok(!/from "\.\.\/\.\.\/fleet\/(lager|skriv|fakturering)\.js"/.test(s),
    "skærmen importerer en skrivevej");
  assert.ok(!/db\.ref\(|\.set\(|\.update\(/.test(s), "skærmen skriver til basen");
});

test("⚠ SKÆRMEN HENTER HELE HISTORIKKEN, IKKE ET VINDUE", () => {
  /* Et tilbagekald spørger om et parti der kan være modtaget for to år siden,
     og en afregningsperiode er ligegyldig her. */
  const s = readFileSync("src/moduler/warehouse/Sporbarhed.jsx", "utf8");
  const blok = s.slice(s.indexOf('useListe("bevaegelser"'));
  assert.ok(blok.slice(0, 200).includes('vindue: "alle"'),
    "sporet er begrænset til en periode");
});

test("ruten og nav-punktet findes begge steder", () => {
  /* Sidebaren genereres af nav.js, så de to kan ikke komme ud af sync — men
     en rute uden et punkt ville være en side ingen kan finde. */
  const nav = readFileSync("src/fleet/nav.js", "utf8");
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(nav.includes('sti: "/warehouse/sporbarhed"'));
  assert.ok(app.includes('path="warehouse/sporbarhed"'));
});
