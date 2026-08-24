/* test/sager-funktioner.test.mjs
 * Beslutning 20/112, skive 1 — at funktionerne håndhæver det politikken siger.
 *
 * `sager.js` er selv prøvet af `test/sager.test.mjs` (39 tests, uden
 * emulator). Denne fil prøver at de FIRE funktioner der er den eneste vej ind
 * i `sager/` og `sensitive/sager/`, rent faktisk kalder den samme politik —
 * og ikke en afskrift. Samme mønster som `test/facilityopgave.test.mjs`s
 * "HÅNDHÆVELSEN"-afsnit: at funktionen findes, er ikke at den håndhæver noget.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const kilde = readFileSync("functions/index.js", "utf8");

const blokAf = (navn) => {
  const start = kilde.indexOf(`export const ${navn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${navn}`);
  const naeste = kilde.indexOf("\nexport const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
};

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sagOpret = blokAf("sagOpret");
const sagBeskedSkriv = blokAf("sagBeskedSkriv");
const sagKarantaeneFrigiv = blokAf("sagKarantaeneFrigiv");
const sagAftaleBekraeft = blokAf("sagAftaleBekraeft");

describe("De fire funktioner findes og bruger den delte politik", () => {
  it("⚠ IMPORTERER FRA delt/sager.js, IKKE EN AFSKRIFT", () => {
    assert.match(kilde, /from "\.\/delt\/sager\.js"/);
    assert.ok(kilde.includes("SAG_ART"), "SAG_ART importeres ikke");
    assert.ok(kilde.includes("naesteSagsnummer"), "naesteSagsnummer importeres ikke");
    assert.ok(kilde.includes("frigivKarantaene"), "frigivKarantaene importeres ikke");
    assert.ok(kilde.includes("reservationFraAftale"), "reservationFraAftale importeres ikke");
  });

  it("hver funktion tjekker tenant og aktivt abonnement — admin-SDK går uden om reglerne", () => {
    for (const b of [sagOpret, sagBeskedSkriv, sagKarantaeneFrigiv, sagAftaleBekraeft]) {
      assert.ok(b.includes('rod.child("_findes")'), "tenant-tjek mangler");
      assert.ok(b.includes("abonnement/status"), "abonnement-tjek mangler");
    }
  });
});

describe("sagOpret", () => {
  it("⚠ KRÆVER sag.skriv", () => {
    assert.ok(sagOpret.includes('perms.includes("|sag.skriv|")'));
  });

  /* ⚠ ARTEN AFGØR MODULET. En værkstedssag (fleet) kræver flaade, en
     facility-sag kræver facility — ligesom opgaveplanlaeg/facilityplanlaeg. */
  it("⚠ SPØRGER OM SIT EGET MODUL, UDLEDT AF ARTEN", () => {
    assert.ok(sagOpret.includes('"fleet" ? "flaade" : "facility"'),
      "modulet udledes ikke af arten");
  });

  it("⚠ NUMMERET KOMMER FRA naesteSagsnummer, IKKE FRA KLIENTEN", () => {
    const b = udenKommentarer(sagOpret);
    assert.ok(b.includes("naesteSagsnummer("), "counteren kaldes ikke");
    assert.ok(!/nummer:\s*kortStreng\(d\.nummer/.test(b), "nummeret tages fra klienten");
  });

  it("⚠ ÉN update() — sagen og en eventuel modpart lander sammen", () => {
    const b = udenKommentarer(sagOpret);
    assert.equal((b.match(/rod\.update\(/g) || []).length, 1,
      "der skrives mere end ét sted");
  });

  it("⚠ objektId TJEKKES KUN NÅR objektType ER \"opgave\" — polymorf reference", () => {
    assert.ok(sagOpret.includes('objektType === "opgave"'),
      "den polymorfe reference tjekkes ikke");
  });
});

describe("sagBeskedSkriv", () => {
  it("⚠ KRÆVER BEGGE — sag.skriv OG sag.sensitiveLaes", () => {
    assert.ok(sagBeskedSkriv.includes('perms.includes("|sag.skriv|")'));
    assert.ok(sagBeskedSkriv.includes('perms.includes("|sag.sensitiveLaes|")'));
  });

  it("⚠ RETNINGEN ER ALTID udgaaende — der er ingen modtagevej endnu", () => {
    const b = udenKommentarer(sagBeskedSkriv);
    assert.ok(b.includes('retning: "udgaaende"'));
    assert.ok(!b.includes('"indgaaende"'), "funktionen kan skrive en indgående besked");
  });

  it("⚠ BRUGER ServerValue.increment(), IKKE LÆS-OG-SKRIV", () => {
    assert.ok(sagBeskedSkriv.includes("ServerValue.increment(1)"));
  });

  it("⚠ ÉN update() — beskeden og sagens summeringer lander sammen", () => {
    const b = udenKommentarer(sagBeskedSkriv);
    assert.equal((b.match(/rod\.update\(/g) || []).length, 1,
      "der skrives mere end ét sted");
  });

  it("⚠ EN UKENDT TILSTAND AFVISES", () => {
    assert.ok(sagBeskedSkriv.includes("SAG_TILSTAND[nyTilstand]"));
  });
});

describe("sagKarantaeneFrigiv", () => {
  it("⚠ KRÆVER sag.karantaeneFrigiv", () => {
    assert.ok(sagKarantaeneFrigiv.includes('perms.includes("|sag.karantaeneFrigiv|")'));
  });

  it("⚠ KALDER frigivKarantaene() — SAMME FUNKTION SOM POLITIKKEN", () => {
    assert.ok(sagKarantaeneFrigiv.includes("frigivKarantaene("));
  });
});

describe("sagAftaleBekraeft", () => {
  it("⚠ KRÆVER sag.aftaleBekraeft", () => {
    assert.ok(sagAftaleBekraeft.includes('perms.includes("|sag.aftaleBekraeft|")'));
  });

  it("⚠ KALDER reservationFraAftale() — REGNESTYKKET BYGGES ÉT STED", () => {
    assert.ok(sagAftaleBekraeft.includes("reservationFraAftale("));
  });

  /* ⚠ SAMME MØNSTER SOM facilityplanlaeg: indeslutninger() +
     tjekLedigIndesluttet(), ikke tjekLedigMod() alene — en aftale kan lande
     på et facilityAktiv, og et rum og porten i det er ét fysisk sted. */
  it("⚠ TJEKKER LEDIGHED MED indeslutninger() + tjekLedigIndesluttet()", () => {
    assert.ok(sagAftaleBekraeft.includes("indeslutninger("));
    assert.ok(sagAftaleBekraeft.includes("tjekLedigIndesluttet("));
  });

  it("⚠ AFVISER ET FORSLAG DER IKKE STÅR SOM \"forslag\"", () => {
    assert.ok(sagAftaleBekraeft.includes('aftale.tilstand !== "forslag"'));
  });

  it("⚠ RESERVATIONENS NØGLE ER res-<aftaleId>, IKKE TILFÆLDIG", () => {
    assert.ok(sagAftaleBekraeft.includes("res-${aftaleId}"));
  });

  it("⚠ ÉN update() — aftalen, sagen og reservationen lander sammen", () => {
    const b = udenKommentarer(sagAftaleBekraeft);
    assert.equal((b.match(/rod\.update\(/g) || []).length, 1,
      "der skrives mere end ét sted");
  });
});

describe("logSager skriver samme form som de øvrige logXxx-funktioner", () => {
  it("bruger klasseFor(), diff() og AUDIT — ikke sin egen afskrift", () => {
    const start = kilde.indexOf("async function logSager(");
    assert.ok(start >= 0, "logSager findes ikke");
    const slut = kilde.indexOf("\n}", start);
    const b = kilde.slice(start, slut);
    assert.ok(b.includes("klasseFor("));
    assert.ok(b.includes("diff("));
    assert.ok(b.includes('objekt: "sager"'));
  });
});
