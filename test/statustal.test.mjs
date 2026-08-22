/* test/statustal.test.mjs
 * README's Status-afsnit, holdt op mod det der kan tælles.
 *
 * ⚠ HVORFOR FILEN FINDES. Status er dét afsnit README selv beder én læse
 * efter en pause — "Start her". Det stod med **957 tests** da der var 2619,
 * og med **27 af 30 skærme** da der var 54. Overskriften og tabellen lige
 * under den var endda uenige med hinanden, 27 mod 29, i to linjer med et
 * blankt mellemrum imellem.
 *
 * Ingen af tallene var løgn da de blev skrevet. De blev det af at produktet
 * voksede: Warehouse kom med elleve skærme, Unitbooking med fire, Procure med
 * fire nye. **Et tal skrevet i hånden kan kun blive forkert.**
 *
 * ⚠ SAMME FEJLKLASSE SOM BESLUTNING 52. En drevet tabel i README sagde at en
 * spærring MANGLEDE — den fandtes, men kunne omgås — og fordi rækken sagde at
 * reglen ikke var der, kiggede ingen på om den virkede. Et forkert tal i et
 * dokument der overstyrer hvordan der arbejdes, er ikke en skønhedsfejl.
 * `test/dokumentation.test.mjs` er svaret på DEN tabel; denne fil er svaret
 * på tallene ved siden af.
 *
 * ⚠ OG DET SAMLEDE PRØVETAL STÅR IKKE I README LÆNGERE. Det kan kun måles ved
 * at KØRE suiten, og en prøve kan ikke tælle sig selv. Et tal ingen prøve kan
 * holde, hører ikke i et dokument der bliver læst som en kendsgerning — så
 * det er erstattet af antallet af prøveFILER, som kan tælles.
 *
 * Se beslutning 88.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { NAV } from "../src/fleet/nav.js";

const README = readFileSync("README.md", "utf8");

/** Hver skærm i katalogets to niveauer. Et topniveau uden børn ER en skærm. */
const BLADE = NAV.flatMap((t) => (t.born?.length ? t.born : [t]));
const SKJULTE = BLADE.filter((b) => b.skjulINav);

/**
 * README's skærmtabel som Map(modul → antal).
 *
 * ⚠ LÆST MED split(), IKKE MED ET REGEX. Et mønster der skal matche en
 * markdown-tabel, skal escape rørtegnet i hver eneste position — og en streng
 * fuld af escapes er præcis den slags der overlever en kopiering forkert.
 * Her er der ingen escaping at tabe.
 */
function skaermtabel() {
  const i = README.indexOf("### Skærmene:");
  if (i < 0) return null;
  const raekker = new Map();
  for (const linje of README.slice(i).split("\n")) {
    if (linje.startsWith("### ") && !linje.includes("Skærmene:")) break;
    if (!linje.startsWith("|")) continue;
    const felt = linje.split("|").map((x) => x.split("*").join("").trim());
    const navn = felt[1];
    const tal = Number(felt[2]);
    if (!navn || !Number.isFinite(tal)) continue;
    raekker.set(navn, tal);
  }
  return raekker;
}

describe("Status-afsnittets tal er målte", () => {
  /**
   * `nav.js` er det ene sted en rute kan opstå: en skærm uden nav-post kan
   * ikke nås, og en nav-post uden skærm er en menu der fører til ingenting
   * (den prøve står i `test/nav.test.mjs`). Derfor er katalogets antal
   * SANDHEDEN, og README skal følge det — ikke omvendt.
   */
  it("⚠ SKÆRMTALLET KOMMER FRA nav.js, IKKE FRA HUKOMMELSEN", () => {
    const tabel = skaermtabel();
    assert.ok(tabel, "README har intet afsnit der hedder '### Skærmene:'");

    const fejl = [];
    for (const t of NAV) {
      const antal = t.born?.length || 1;
      if (!tabel.has(t.label)) {
        fejl.push(`${t.label}: står ikke i tabellen`);
        continue;
      }
      if (tabel.get(t.label) !== antal) {
        fejl.push(`${t.label}: README siger ${tabel.get(t.label)}, nav.js har ${antal}`);
      }
    }
    const kendt = new Set(NAV.map((t) => t.label));
    for (const modul of tabel.keys()) {
      if (modul === "I alt" || kendt.has(modul)) continue;
      fejl.push(`${modul}: står i README, men ikke i nav.js`);
    }

    assert.deepEqual(fejl, [],
      "README's skærmtabel er ikke enig med nav.js.\n  " + fejl.join("\n  "));
  });

  /**
   * ⚠ OG OVERSKRIFTEN SKAL SIGE DET SAMME SOM TABELLEN. Det var netop dét der
   * gik galt: "27 af 30" over en tabel der sagde 29. To tal om det samme,
   * begge forkerte, og ingen af dem kunne se hinanden.
   */
  it("⚠ TOTALEN ER SUMMEN, OG OVERSKRIFTEN SIGER DET SAMME", () => {
    const tabel = skaermtabel();
    assert.equal(tabel.get("I alt"), BLADE.length,
      `README siger ${tabel.get("I alt")} skærme i alt; nav.js har ${BLADE.length}`);

    const i = README.indexOf("### Skærmene:");
    const overskrift = README.slice(i, README.indexOf("\n", i));
    assert.ok(overskrift.includes(String(BLADE.length)),
      `overskriften "${overskrift.trim()}" nævner ikke det målte antal (${BLADE.length})`);

    const synlige = BLADE.length - SKJULTE.length;
    const saetning = `**${synlige} i menuen, ${SKJULTE.length} skjulte detaljeruter**`;
    assert.ok(README.includes(saetning), `README skal skrive "${saetning}"`);
  });

  it("⚠ PRØVEFILTALLET TÆLLES, OG DET SAMLEDE PRØVETAL SKRIVES IKKE", () => {
    const filer = readdirSync("test").filter((f) => f.endsWith(".test.mjs"));
    const saetning = `**${filer.length} prøvefiler** kører via`;
    assert.ok(README.includes(saetning),
      `README skal sige "${saetning}"; der er ${filer.length} filer i test/`);

    /* ⚠ Og ikke et samlet prøvetal ved siden af. En prøve kan ikke tælle sig
       selv, så tallet ville drive igen — som det gjorde fra 957 til 2619. */
    const status = README.slice(
      README.indexOf("## Status"), README.indexOf("### Fem moduler"));
    const fundet = [" tests**", " prøver** kører", " tests kører**"]
      .filter((m) => status.includes(m));
    assert.deepEqual(fundet, [],
      "Status skriver et samlet prøvetal. Det kan kun måles ved at køre suiten, "
      + "og et tal ingen prøve kan holde, driver.");
  });
});
