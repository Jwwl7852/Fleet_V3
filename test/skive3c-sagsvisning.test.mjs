/* test/skive3c-sagsvisning.test.mjs
 * Skive 3C — Fleet/Facility Sagsvisning mod eksisterende backend.
 *
 * ⚠ SAMME METODE SOM SKIVE 3A/3B'S EGNE PRØVEFILER. At komponenten findes,
 * er ikke det samme som at den bruger rigtige data eller siger sandheden om
 * hvad en handling gør. Filerne læses som TEKST og spørges om håndhævelsen —
 * samme disciplin som test/opgaveplan.test.mjs' "HÅNDHÆVELSEN".
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";

const sagsvisning = readFileSync("src/fleet/Sagsvisning.jsx", "utf8");
const sagplan = readFileSync("src/fleet/sagplan.js", "utf8");
const vaerkstedskalender = readFileSync("src/moduler/flaade/Vaerkstedskalender.jsx", "utf8");
const servicekalender = readFileSync("src/moduler/facility/Servicekalender.jsx", "utf8");
const indberetninger = readFileSync("src/moduler/flaade/Indberetninger.jsx", "utf8");

/* ══════════════════════════════════════════════════════════════════════════
   1. RIGTIGE DATA, IKKE FASE-0
   ══════════════════════════════════════════════════════════════════════════ */
describe("Sagsvisning læser rigtige data — ikke en hardkodet demo-tråd", () => {
  it("⚠ HENTER VIA usePost — DEN SAMME MEKANISME SOM ANDRE SATELLITTER", () => {
    assert.ok(sagsvisning.includes('usePost("sager"'), "den generelle sag hentes ikke");
    assert.ok(sagsvisning.includes('usePost("sensitive/sager"'),
      "det klassificerede hentes ikke via usePost");
  });

  it("⚠ demo ER KUN FALDBAKKEN — samme mønster som ethvert andet useListe/usePost-kald", () => {
    /* DEMO_SAGER må optræde, men KUN som `demo:`-parameter til usePost, som
       kun bruger den når der ingen database er (samme lov som CLAUDE.md
       håndhæver for useListe). Filen må IKKE slå direkte op i demoSag()/
       demoSagerFor() og bruge svaret som den rigtige sag — det var netop
       fase 0-fejlen. */
    assert.ok(!/demoSag\(|demoSagerFor\(/.test(sagsvisning),
      "Sagsvisning slår direkte op i demo-sag.js i stedet for at lade usePost styre faldbakken");
  });

  it("⚠ INGEN PERMANENT DEAKTIVERET \"fase 0\"-KNAP", () => {
    assert.ok(!/fase 0/i.test(sagsvisning), "skærmen taler stadig om fase 0");
    assert.ok(!/disabled\s+title="Afsendelse er ikke bygget/.test(sagsvisning),
      "den permanent deaktiverede attrapknap er der stadig");
  });

  it("⚠ ÆRLIG TOMTILSTAND NÅR INGEN SAG FINDES", () => {
    assert.match(sagsvisning, /Der er endnu ikke oprettet en sag/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. SAND UI-SEMANTIK — SKIVE 3C: INGEN LOVET MAILAFSENDELSE FOR DEN INTERNE
   NOTE. SKIVE 3D: "Send mail" ER NU LOVLIGT, FORDI DEN RENT FAKTISK SENDER.
   ══════════════════════════════════════════════════════════════════════════ */
describe("⚠ DEN INTERNE NOTE LOVER STADIG INGEN AFSENDELSE — 'Send mail' ER NU DEN RIGTIGE, FORDI DEN RENT FAKTISK SENDER", () => {
  /* ⚠ "Send besked" ER STADIG FORBUDT — det var ALDRIG et rigtigt knapnavn,
     hverken i 3C eller 3D. Det er "Tilføj besked til sagen" (intern note)
     eller "Send mail" (den rigtige, Skive 3D), aldrig noget midt imellem. */
  const forbudt = [/"Send besked"/, />Send besked</, /gemLabel="Send besked/];

  it("Sagsvisning.jsx bruger aldrig \"Send besked\" som knaptekst", () => {
    /* ⚠ TJEKKET STÅR MOD KODEN UDEN KOMMENTARER. Filens EGEN dokumentation af
       hvad den IKKE gør, citerer nødvendigvis de forbudte ord — se hovedet. */
    const kode = udenKommentarer(sagsvisning);
    for (const m of forbudt) {
      assert.ok(!m.test(kode), `${m} matcher — "Send besked" er ikke et knapnavn her`);
    }
  });

  it("⚠ KNAPPEN HEDDER \"Tilføj besked til sagen\" — sagBeskedSkriv REGISTRERER, sender ikke", () => {
    assert.ok(sagsvisning.includes("Tilføj besked til sagen"));
  });

  it("⚠ DEN INTERNE NOTE-DIALOG SIGER DET UDTRYKKELIGT: ingen mail sendes herfra", () => {
    assert.match(sagsvisning, /sendes ingen mail herfra/);
  });

  it("⚠ SKIVE 3D — \"Send mail\" ER EN RIGTIG, SEPARAT KNAP, IKKE EN VARIANT AF DEN INTERNE NOTE", () => {
    assert.ok(sagsvisning.includes("Send mail"), "knappen der rent faktisk sender, findes ikke");
    /* Den skal stå i SIN EGEN dialog (SendMailDialog), ikke i
       TilfoejBeskedDialog — de to må aldrig blive én formular med et
       skiftende resultat. */
    assert.ok(sagsvisning.includes("function SendMailDialog"),
      "der er ingen selvstændig komponent for den rigtige afsendelse");
  });

  it("⚠ INGEN POST GEMMES SOM \"sendt\" — kun \"accepteret\"/\"fejlet\"/\"anmodet\" (mailtransport.js)", () => {
    /* "accepteret" er ikke "leveret" — se MAIL_STATUS-noten i
       mailtransport.js. Hverken sagplan.js eller Sagsvisning.jsx må
       opfinde et fjerde ord der lover mere end det. */
    assert.ok(!/status:\s*["']sendt["']/.test(udenKommentarer(sagplan)));
    assert.ok(!/["']sendt["']/.test(udenKommentarer(sagsvisning)),
      "Sagsvisning.jsx bruger \"sendt\" som en tilstand — den findes ikke i MAIL_STATUS");
    assert.ok(!/["']leveret["']/i.test(udenKommentarer(sagsvisning)),
      "Sagsvisning.jsx lover levering, som ingen udbyder har bekræftet");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. KARANTÆNE OG AFTALE — USYNLIGE, IKKE ATTRAPKNAPPER
   ══════════════════════════════════════════════════════════════════════════ */
describe("Karantæne- og aftalehandlinger er betingede på rigtige data", () => {
  it("⚠ KARANTÆNEKORTET TEGNES KUN NÅR sag.karantaene.length > 0", () => {
    assert.match(sagsvisning, /sag\.karantaene\.length > 0 && <Karantaene/);
  });

  it("⚠ \"Bekræft aftale\" TEGNES KUN NÅR a.tilstand === \"forslag\"", () => {
    assert.match(udenKommentarer(sagsvisning), /a\.tilstand === "forslag" &&/);
  });

  it("⚠ INGEN AF DE TO ER PERMANENT DEAKTIVEREDE MED \"ikke bygget endnu\"", () => {
    assert.ok(!/ikke bygget endnu/.test(sagsvisning));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. GENBRUGER DE EKSISTERENDE FEM FUNKTIONER — INTET NYT LAG
   ══════════════════════════════════════════════════════════════════════════ */
describe("sagplan.js kalder de fem eksisterende Cloud Functions — ingen afskrift", () => {
  it("kalder sagOpret, sagBeskedSkriv, sagKarantaeneFrigiv, sagAftaleBekraeft, sagAfslut", () => {
    for (const navn of [
      "sagOpret", "sagBeskedSkriv", "sagKarantaeneFrigiv", "sagAftaleBekraeft", "sagAfslut",
    ]) {
      assert.ok(sagplan.includes(`"${navn}"`), `${navn} kaldes ikke`);
    }
  });

  it("⚠ INGEN db.ref() — vejen går gennem kaldFunktion()", () => {
    assert.ok(!/db\.ref\(|\.set\(|\.update\(/.test(sagplan));
    assert.ok(sagplan.includes("kaldFunktion("));
  });

  it("⚠ KASTER ALDRIG", () => {
    assert.ok(sagplan.includes("try {") && sagplan.includes("catch (fejl)"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. AFSLUTTET SAG KAN IKKE MUTERES HVOR MODELLEN FORBYDER DET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Afsluttet sag viser ingen handlinger der ville muteres videre", () => {
  it('"Afslut sag"-kortet tegnes kun når sag.tilstand !== "afsluttet"', () => {
    assert.match(udenKommentarer(sagsvisning), /sag\.tilstand !== "afsluttet" &&/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. KANONISK PLACERING — INGEN PARALLEL FLEET/FACILITY-KOPI
   ══════════════════════════════════════════════════════════════════════════ */
describe("Fleet og Facility genbruger SAMME Sagsvisning — ingen parallelkopi", () => {
  it("Vaerkstedskalender.jsx importerer Sagsvisning fra fleet/, bygger den ikke selv", () => {
    assert.ok(vaerkstedskalender.includes('import Sagsvisning from "../../fleet/Sagsvisning.jsx"'));
    assert.match(vaerkstedskalender, /<Sagsvisning[\s\S]{0,120}art="fleet"/);
  });

  it("Servicekalender.jsx importerer SAMME Sagsvisning, ikke en egen", () => {
    assert.ok(servicekalender.includes('import Sagsvisning from "../../fleet/Sagsvisning.jsx"'));
    assert.match(servicekalender, /<Sagsvisning[\s\S]{0,160}art="facility"/);
  });

  it("⚠ INGEN PARALLEL Kommunikation/Filer-KOMPONENT TILBAGE I Vaerkstedskalender.jsx", () => {
    assert.ok(!/function Kommunikation\(/.test(vaerkstedskalender));
    assert.ok(!/function Filer\(/.test(vaerkstedskalender));
    assert.ok(!/demoSagerFor\(/.test(vaerkstedskalender));
  });

  it("⚠ INGEN ATTRAP-FOTOS TILBAGE NOGET STED", () => {
    assert.ok(!/fc-foto/.test(vaerkstedskalender));
    assert.ok(!/Billederne er attrapper/.test(vaerkstedskalender));
  });

  it("⚠ INGEN STALE \"fase 0\"-LINK I Servicekalender.jsx", () => {
    /* Uden kommentarer — se noten ved den tilsvarende prøve ovenfor. */
    const kode = udenKommentarer(servicekalender);
    assert.ok(!/sagen.*fase 0|fase 0.*sagen/is.test(kode));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. INDBERETNING → SAG ER ET VISNINGSLINK, IKKE ET OPRETTELSESPUNKT
   ══════════════════════════════════════════════════════════════════════════ */
describe("Indberetninger.jsx åbner en sag der findes — opretter ingen", () => {
  it("importerer den delte Sagsvisning", () => {
    assert.ok(indberetninger.includes('import Sagsvisning from "../../fleet/Sagsvisning.jsx"'));
  });

  it("⚠ INGEN \"Opret sag\"-AFFØDNING FRA EN INDBERETNING", () => {
    /* Sagsvisning kaldes her UDEN objektType/objektId — kun sagId. Uden de
       to felter viser den delte komponent ingen Opret sag-knap (se dens
       egen betingelse), og denne skærm sender dem bevidst ikke med. */
    const kald = sagsvisning.match(/<Sagsvisning[\s\S]*?\/>/)?.[0] || "";
    assert.ok(kald.length > 0);
    const idKald = indberetninger.match(/<Sagsvisning[^>]*\/>/)?.[0] || "";
    assert.ok(!/objektType/.test(idKald), "Indberetninger.jsx sender objektType med");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. OPRET SAG ER EN BEVIDST ARBEJDSGANG — INTET AUTOMATISK
   ══════════════════════════════════════════════════════════════════════════ */
describe("Opret sag kræver et menneske der udfylder og trykker", () => {
  it("⚠ INGEN AUTOMATISK KALD AF opretSag() UDEN FOR EN DIALOG DER KRÆVER ET KLIK", () => {
    /* opretSag() må kun optræde inde i OpretSagDialog's gem()-funktion. */
    const forekomster = (sagsvisning.match(/opretSag\(/g) || []).length;
    assert.equal(forekomster, 1, "opretSag() kaldes fra mere end ét sted");
  });

  it("⚠ KNAPPEN ER PERMISSION-GATET PÅ sag.skriv (OG opgaver.skriv NÅR DER ER ET OBJEKT)", () => {
    assert.ok(sagsvisning.includes("PERM.sagSkriv"));
    assert.ok(sagsvisning.includes("PERM.opgaverSkriv"));
  });
});
