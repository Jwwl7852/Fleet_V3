/* test/stregkode128.test.mjs
 * Stregkoden er en RIGTIG Code 128 — ikke en der ligner.
 *
 * ⚠ FILEN FINDES FORDI KODEN VAR TEKST. Transportlabelen skrev
 * `BKG-2026-00317-CRR-100248` som bogstaver. Et menneske kunne læse den, og
 * derfor så mærkatet komplet ud — men en scanner kan ikke, og et mærkat der
 * ikke kan scannes, er hele grunden til at der er et mærkat.
 *
 * ⚠ OG EN PRØVE DER AFKODER MED MIN EGEN TABEL, ER GRØN AF DEN FORKERTE GRUND.
 * En mønstertabel skrevet af efter standarden kan være internt konsistent og
 * alligevel forkert; en afkoder bygget på den samme tabel ville sige ja til
 * begge dele. Modulstrengen nedenfor er derfor ikke skrevet af hovedet: den er
 * tegnet som et sort/hvidt billede og læst tilbage af **zxing**, en fremmed
 * implementering, den 20. august 2026. Zxing efterprøver selv kontrolcifret og
 * afviser koden, hvis det er forkert.
 *
 * Zxing er IKKE en afhængighed i repoet — den blev lånt til den ene kontrol.
 * Det snapshottet vogter, er at tabellen ikke må skride BAGEFTER.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  moduler, bjaelker, bredde, vaerdier, kontrolciffer, kanKodes,
  START_B, STOP, STILLE_ZONE,
} from "../src/fleet/stregkode128.js";

const KODE = "BKG-2026-00317-CRR-100248";

/* ⚠ EFTERPRØVET UDEFRA. Se hovedet — zxing læste præcis den her streng tilbage
   som "BKG-2026-00317-CRR-100248". Ændrer et mønster sig, bliver den rød. */
const AFKODET_AF_ZXING =
  "11010010000100010110001011000111011010001000100110111001100111001010011101100110011100" +
  "10110011101001001101110010011101100100111011001100101110010011100110111011011101001101" +
  "11001000100011011000101110110001011101001101110010011100110100111011001001110110011001" +
  "1100101100100111011101001100100100001101100011101011";

describe("mønstertabellen", () => {
  it("har standardens 107 koder", () => {
    /* 103 tegnværdier + tre startkoder + stoppet. */
    const kilde = readFileSync("src/fleet/stregkode128.js", "utf8");
    const tabel = kilde.match(/"\d{6,7}"/g) || [];
    assert.equal(tabel.length, 107);
  });

  it("er elleve moduler pr. kode — og tretten for stoppet", () => {
    /* ⚠ INVARIANTEN, IKKE ET STIKPRØVE. Et mønster på ti eller tolv moduler
       forskyder ALT efter sig, og koden ville stadig se ud som en stregkode. */
    const kilde = readFileSync("src/fleet/stregkode128.js", "utf8");
    const tabel = (kilde.match(/"\d{6,7}"/g) || []).map((s) => s.slice(1, -1));
    tabel.forEach((moenster, i) => {
      const sum = [...moenster].reduce((s, c) => s + Number(c), 0);
      const forventet = i === tabel.length - 1 ? 13 : 11;
      assert.equal(sum, forventet, `kode ${i} (${moenster})`);
    });
    /* Start + ét tegn + kontrol + stop = 11 + 11 + 11 + 13 = 46 */
    assert.equal(moduler("A").length, 46);
  });

  it("dækker hele subset B — 95 tegn, ASCII 32 til 126", () => {
    for (let v = 0; v <= 94; v += 1) {
      const tegn = String.fromCharCode(v + 32);
      assert.equal(moduler(tegn).length, 46, `tegn "${tegn}"`);
    }
    /* Over 126 er ikke subset B, og gættes ikke. */
    assert.equal(moduler(String.fromCharCode(127)), null);
  });

  it("starter på en bjælke og slutter på en bjælke", () => {
    /* Stoppet ender på en bjælke — det er dét der gør koden læsbar begge
       veje. Startede eller sluttede den på et mellemrum, ville scanneren ikke
       kunne se hvor den holder op. */
    const m = moduler(KODE);
    assert.equal(m[0], "1");
    assert.equal(m[m.length - 1], "1");
  });
});

describe("kodningen", () => {
  it("er start B, tegnene, kontrolciffer og stop", () => {
    const v = vaerdier("A");
    assert.equal(v[0], START_B);
    assert.equal(v[1], "A".charCodeAt(0) - 32);
    assert.equal(v[3], STOP);
    assert.equal(v.length, 4);
  });

  it("vægter tegnene med deres plads — ikke bare summen", () => {
    /* Bytter to tegn om, skal kontrolcifret skifte. Uden vægten ville "AB" og
       "BA" få samme ciffer, og en scanner kunne ikke se forskel på en kode og
       dens ombytning. */
    assert.notEqual(kontrolciffer("AB"), kontrolciffer("BA"));
  });

  it("⚠ AFKODET AF ZXING — modulstrengen er ikke skrevet af hovedet", () => {
    assert.equal(moduler(KODE), AFKODET_AF_ZXING);
  });

  it("koder ikke det den ikke kan", () => {
    /* Subset B er ASCII 32–126. Et "ø" har ingen kode, og en kode der udelod
       tegnet ville scanne til noget ANDET end det der står under den. */
    assert.equal(kanKodes("Nørrebro"), false);
    assert.equal(moduler("Nørrebro"), null);
    assert.equal(moduler(""), null);
    assert.equal(moduler(null), null);
    assert.equal(kanKodes(KODE), true);
  });
});

describe("det der tegnes", () => {
  it("bjælkerne dækker præcis modulernes ettaller", () => {
    const m = moduler(KODE);
    const b = bjaelker(KODE);
    const ialt = b.reduce((s, x) => s + x.bredde, 0);
    assert.equal(ialt, [...m].filter((c) => c === "1").length);
    for (const { fra, bredde: br } of b) {
      assert.equal(m.slice(fra, fra + br), "1".repeat(br));
      assert.notEqual(m[fra + br], "1");
    }
  });

  it("bredden rummer den stille zone i begge ender", () => {
    /* Uden hvidt papir omkring koden kan scanneren ikke finde begyndelsen.
       Standarden siger mindst ti moduler. */
    assert.ok(STILLE_ZONE >= 10);
    assert.equal(bredde(KODE), moduler(KODE).length + STILLE_ZONE * 2);
    assert.equal(bredde("Nørrebro"), null);
  });
});
