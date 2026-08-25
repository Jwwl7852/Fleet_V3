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
/* ⚠ SKIVE 3C — DEN FEMTE FUNKTION. */
const sagAfslut = blokAf("sagAfslut");

describe("De fem funktioner findes og bruger den delte politik", () => {
  it("⚠ IMPORTERER FRA delt/sager.js, IKKE EN AFSKRIFT", () => {
    assert.match(kilde, /from "\.\/delt\/sager\.js"/);
    assert.ok(kilde.includes("SAG_ART"), "SAG_ART importeres ikke");
    assert.ok(kilde.includes("naesteSagsnummer"), "naesteSagsnummer importeres ikke");
    assert.ok(kilde.includes("frigivKarantaene"), "frigivKarantaene importeres ikke");
    assert.ok(kilde.includes("reservationFraAftale"), "reservationFraAftale importeres ikke");
    assert.ok(kilde.includes("kanSkifteSagTilstand"), "kanSkifteSagTilstand importeres ikke");
  });

  it("hver funktion tjekker tenant og aktivt abonnement — admin-SDK går uden om reglerne", () => {
    for (const b of [sagOpret, sagBeskedSkriv, sagKarantaeneFrigiv, sagAftaleBekraeft, sagAfslut]) {
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

  /* ⚠ SKIVE 3C — FULDFØRER opgave.sagId. Feltet stod i opgaver.js' FAELLES
     og var reference-tjekket i firebase.rules.json siden beslutning 45, men
     ingen funktion skrev det nogensinde — samme gab som indberetningId var
     før Skive 3B. */
  describe("⚠ SKIVE 3C — opgave.sagId FULDFØRES, IKKE OPFINDES", () => {
    it("skriver opgaver/<objektId>/sagId i SAMME opdatering som sagen", () => {
      const b = udenKommentarer(sagOpret);
      assert.match(b, /opdatering\[`opgaver\/\$\{objektId\}\/sagId`\]\s*=\s*sagId/);
    });

    it("⚠ KRÆVER OGSÅ opgaver.skriv — ikke kun sag.skriv", () => {
      assert.ok(sagOpret.includes('perms.includes("|opgaver.skriv|")'),
        "koblingen til opgaven kræver ikke opgaver.skriv");
    });

    it("⚠ AFVISER EN OPGAVE DER ALLEREDE HAR EN SAG — feltet er ét, ikke en liste", () => {
      assert.ok(sagOpret.includes("opgave.sagId"),
        "der tjekkes ikke om opgaven allerede har en sag");
      assert.match(udenKommentarer(sagOpret), /failed-precondition/);
    });

    it("⚠ STADIG ÉN update() — koblingen lander i den SAMME opdatering", () => {
      const b = udenKommentarer(sagOpret);
      assert.equal((b.match(/rod\.update\(/g) || []).length, 1,
        "der skrives i mere end ét kald");
    });
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

/* ⚠ SKIVE 3C — DEN FEMTE OG SIDSTE VEJ IND. Audit viste tilstand: "afsluttet"
   i SAG_TILSTAND, men ingen funktion kunne sætte den. sagAfslut er den
   MINIMALE funktion Skive 3C.6 bad om: samme permission-mønster som de fire
   andre, samme delte maskine som skærmen viser, ingen ny tilstand. */
describe("sagAfslut", () => {
  it("⚠ KRÆVER sag.skriv — samme permission som sagOpret", () => {
    assert.ok(sagAfslut.includes('perms.includes("|sag.skriv|")'));
  });

  it("⚠ KALDER kanSkifteSagTilstand() — SAMME MASKINE SOM SKÆRMEN VISER", () => {
    assert.ok(sagAfslut.includes("kanSkifteSagTilstand("));
  });

  it("⚠ MÅLET ER ALTID \"afsluttet\" — ingen anden tilstand kan sættes herfra", () => {
    assert.match(udenKommentarer(sagAfslut), /kanSkifteSagTilstand\(sag\.tilstand,\s*"afsluttet"\)/);
    assert.match(udenKommentarer(sagAfslut), /tilstand`\]:\s*"afsluttet"/);
  });

  it("⚠ KRÆVER EN BEGRUNDELSE — additivt felt, ikke en ny tilstandsmaskine", () => {
    const b = udenKommentarer(sagAfslut);
    assert.ok(b.includes("afslutningsAarsag"), "begrundelsen læses ikke");
    assert.ok(!b.includes('kortStreng(d.tilstand'),
      "funktionen tager en anden tilstand end afsluttet fra klienten");
  });

  it("⚠ INGEN GENÅBNING TILBYDES — funktionen skriver aldrig \"aaben\" eller \"afventerSvar\"", () => {
    const b = udenKommentarer(sagAfslut);
    assert.ok(!/tilstand`\]:\s*"(aaben|afventerSvar)"/.test(b),
      "funktionen kan sætte en anden tilstand end afsluttet");
  });

  it("⚠ ÉN update()", () => {
    const b = udenKommentarer(sagAfslut);
    assert.equal((b.match(/rod\.update\(/g) || []).length, 1);
  });

  it("⚠ INGEN SLETNING — historikken bevares", () => {
    assert.ok(!/\.remove\(/.test(sagAfslut));
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

  /* ⚠ SKIVE 3C, PUNKT 8 — SIKKERHEDSBASELINE. Alle fem mutationer skal
     auditlogges. Et 3C-security-gap er en mutation der IKKE gør det. */
  it("⚠ ALLE FEM FUNKTIONER KALDER logSager()", () => {
    for (const [navn, b] of [
      ["sagOpret", sagOpret], ["sagBeskedSkriv", sagBeskedSkriv],
      ["sagKarantaeneFrigiv", sagKarantaeneFrigiv],
      ["sagAftaleBekraeft", sagAftaleBekraeft], ["sagAfslut", sagAfslut],
    ]) {
      assert.ok(b.includes("logSager("), `${navn} kalder ikke logSager()`);
    }
  });

  /* ⚠ BEGRUNDELSEN ER FRITEKST og må ikke stå i auditposten — samme regel
     som indberetningers ingenOmkostning.begrundelse. Kun tilstandsskiftet
     logges. */
  it("⚠ afslutningsAarsag STÅR IKKE I logSager-KALDET I sagAfslut", () => {
    const kald = udenKommentarer(sagAfslut).match(/logSager\([^;]*\);/s)?.[0] || "";
    assert.ok(kald.length > 0, "logSager-kaldet blev ikke fundet");
    assert.ok(!kald.includes("afslutningsAarsag"),
      "den frie afslutningsårsag sendes med i auditkaldet");
  });
});
