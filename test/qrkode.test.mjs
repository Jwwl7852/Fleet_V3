/* test/qrkode.test.mjs
 * QR-koden på transportlabelen. WAREHOUSE.md etape 16.
 *
 * ⚠ EN QR-KODER HAR FEM STEDER AT TAGE FEJL UAFHÆNGIGT AF HINANDEN:
 * Reed-Solomon over GF(256), blokfletningen, modulplaceringen, maskeringen og
 * formatbitsene. Er ét af dem forkert, ser billedet stadig ud som en QR-kode —
 * og det gjorde det. To fejl overlevede at koden var tegnet og set på skærmen:
 *
 *   1. Formatordet stod SPEJLVENDT i begge kopier. Afkoderen fandt symbolet,
 *      læste versionen og maskede rigtigt, og fejlede først på fejlretningen.
 *   2. Anden formatkopi var delt 8 + 7 i stedet for 7 + 8, så den ottende bit
 *      landede oven i det mørke modul.
 *
 * ⚠ OG TREDJE FEJL VAR ET VALG, IKKE EN FEJL I KODEN. Byte-tilstand alene gav
 * en kode en HEL version større end nødvendigt for vores nyttelast, og de
 * store symboler kunne afkoderen ikke finde. Alfanumerisk tilstand pakker to
 * tegn i elleve bit; `BKG-…-CRR-…` ligger helt inden for sættet.
 *
 * ⚠ SNAPSHOTTET ER IKKE SKREVET AF HOVEDET. Det er sammenlignet MODUL FOR
 * MODUL med zxings egen koder — 240 matricer, både alfanumerisk og byte, nul
 * afvigelser — og afkodet igen af zxings læser. Zxing er ikke en afhængighed
 * her; den blev lånt til kontrollen.
 *
 * ⚠ Og prøven fandt sin egen grænse: ~4 % af koderne kunne zxings LÆSER ikke
 * finde i et syntetisk billede. Zxings EGNE koder fejlede nøjagtig ens på de
 * samme nyttelaster — matricerne var identiske — så det er læseren i prøven,
 * ikke koderen. Det er skrevet ned frem for at stå som en grøn prøve.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  qrModuler, qrFelter, qrBredde, vaelgVersion, kanAlfanumerisk,
  QR_STILLE_ZONE, MAKS_VERSION,
} from "../src/fleet/qrkode.js";

const KODE = "BKG-2026-00317-CRR-100248";

/* ⚠ EFTERPRØVET MOD ZXING. Se hovedet. */
const AFKODET_AF_ZXING = [
  "1111111011011111101111111",
  "1000001001111000101000001",
  "1011101010010111101011101",
  "1011101001011000101011101",
  "1011101001111010001011101",
  "1000001010001111001000001",
  "1111111010101010101111111",
  "0000000000110101000000000",
  "1010001101101101100100101",
  "1101010001100000010110011",
  "1111001000010111111111000",
  "0111100011101010011000010",
  "0011101110000111110100101",
  "0010110110000110001101011",
  "1101101010010001111111011",
  "0010110010100100100000100",
  "1110111100011100111111111",
  "0000000011001000100010001",
  "1111111011001110101010010",
  "1000001000111011100010000",
  "1011101001000111111111100",
  "1011101001000110111001000",
  "1011101010010000011110011",
  "1000001000000100111100001",
  "1111111010011101001010011",
];

describe("tilstandsvalget", () => {
  it("vælger alfanumerisk når hvert tegn kan", () => {
    assert.equal(kanAlfanumerisk(KODE), true);
    assert.equal(kanAlfanumerisk("BKG 2026 / 00317"), true);
  });

  it("falder tilbage til byte når et tegn ikke kan", () => {
    /* Små bogstaver og æøå findes ikke i det alfanumeriske sæt. */
    assert.equal(kanAlfanumerisk("Nørrebro"), false);
    assert.equal(kanAlfanumerisk("bkg-2026"), false);
    assert.ok(qrModuler("Nørrebro æøå"), "byte-tilstand skal stadig kunne kode");
  });

  it("⚠ SPARER IKKE EN VERSION HER — og det var ikke fejlen", () => {
    /* Jeg troede at byte-tilstanden var årsagen til at nogle koder ikke kunne
       findes, fordi de alle var STORE bogstaver. Samme 25 tegn i hver tilstand
       lander på SAMME version, og fejlraten flyttede sig ikke. Gevinsten er de
       otte sparede kodeord, ikke et mindre symbol.
       ⚠ Prøven står her for at fastholde rettelsen af påstanden. */
    const store = "BKG-2026-00317-CRR-100248";
    const smaa = "bkg-2026-00317-crr-100248";
    assert.equal(kanAlfanumerisk(store), true);
    assert.equal(kanAlfanumerisk(smaa), false);
    assert.equal(vaelgVersion(store), vaelgVersion(smaa));
  });

  it("siger nej frem for at klippe en for lang tekst", () => {
    const forLang = "A".repeat(400);
    assert.equal(vaelgVersion(forLang), null);
    assert.equal(qrModuler(forLang), null);
    assert.equal(qrModuler(""), null);
    assert.equal(qrModuler(null), null);
  });

  it("kender sin øvre version", () => {
    assert.equal(MAKS_VERSION, 6);
  });
});

describe("symbolet", () => {
  const m = qrModuler(KODE);

  it("⚠ AFKODET AF ZXING — matricen er ikke skrevet af hovedet", () => {
    assert.deepEqual(m.map((r) => r.join("")), AFKODET_AF_ZXING);
  });

  it("er kvadratisk og har standardens størrelse", () => {
    assert.equal(m.length, 25);            /* version 2 */
    for (const r of m) assert.equal(r.length, 25);
  });

  it("har tre søgemønstre — ellers findes koden ikke", () => {
    const n = m.length;
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const kant = x === 0 || x === 6 || y === 0 || y === 6;
          const midte = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          assert.equal(m[oy + y][ox + x], kant || midte ? 1 : 0, `(${ox + x},${oy + y})`);
        }
      }
    }
  });

  it("har tidsspor der skifter", () => {
    const n = m.length;
    for (let i = 8; i < n - 8; i += 1) {
      const v = i % 2 === 0 ? 1 : 0;
      assert.equal(m[6][i], v, `vandret ${i}`);
      assert.equal(m[i][6], v, `lodret ${i}`);
    }
  });

  it("⚠ HAR DET MØRKE MODUL. Anden formatkopi skrev en bit oven i det", () => {
    assert.equal(m[m.length - 8][8], 1);
  });
});

describe("det der tegnes", () => {
  it("felterne er præcis modulernes ettaller", () => {
    const m = qrModuler(KODE);
    const f = qrFelter(KODE);
    assert.equal(f.length, m.flat().filter((v) => v === 1).length);
    for (const { x, y } of f) assert.equal(m[y][x], 1);
  });

  it("bredden rummer den stille zone i begge ender", () => {
    /* Standarden siger fire moduler hele vejen rundt. Uden dem kan en scanner
       ikke se hvor koden holder op. */
    assert.equal(QR_STILLE_ZONE, 4);
    assert.equal(qrBredde(KODE), 25 + 4 * 2);
    assert.equal(qrBredde(""), null);
  });
});
