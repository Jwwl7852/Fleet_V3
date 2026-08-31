/* test/f2-opgavedokumenter-ui.test.mjs
 * F.2 — admin-siden af opgavedokumenter: OpgaveBilag i Vaerkstedskalender.jsx.
 *
 * Samme "skærmen tegner, maskinen håndhæver"-disciplin som resten af appen —
 * se test/leverandoerportal-ui.test.mjs for samme metode på leverandør-
 * portalens skærme. Denne fil beviser kun at kildeteksten følger de
 * mønstre resten af appen holder sig til; DEV-adfærden er verificeret i en
 * rigtig browser, se commit-teksten.
 *
 * Kør: npm test
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const KALENDER = readFileSync("src/moduler/flaade/Vaerkstedskalender.jsx", "utf8");
const KLIENT = readFileSync("src/fleet/opgavedokumenter.js", "utf8");

describe("src/fleet/opgavedokumenter.js", () => {
  test("hver funktion går gennem kaldFunktion() — samme mønster som fakturadokumenter.js", () => {
    assert.match(KLIENT, /import \{ kaldFunktion \} from "\.\.\/firebase\.js"/);
    for (const fn of [
      "opgaveDokumentUploadInitier", "opgaveDokumentUploadBekraeft",
      "opgaveDokumentDownloadLink", "opgaveDokumentDeaktiver", "opgaveDokumentSynlighedSaet",
    ]) {
      assert.match(KLIENT, new RegExp(`kald\\("${fn}"`), `${fn} kaldes ikke`);
    }
  });

  test("⚠ SAMME MIME/STØRRELSESTJEK FØR UPLOAD SOM fakturadokumenter.js — genbrugt fra dokumenter.js, ikke afskrevet", () => {
    assert.match(KLIENT, /import \{ TILLADT_MIME, MAX_FILSTOERRELSE_BYTES \} from "\.\/dokumenter\.js"/);
  });

  test("⚠ INGEN Firebase Storage-SDK — overførslen er en almindelig fetch() PUT", () => {
    assert.doesNotMatch(KLIENT, /from ["']firebase\/storage["']/);
    assert.match(KLIENT, /fetch\(uploadUrl, \{/);
  });
});

describe("OpgaveBilag i Vaerkstedskalender.jsx", () => {
  test("kalder den delte klient (opgavedokumenter.js), ikke kaldFunktion direkte", () => {
    assert.match(KALENDER, /from "\.\.\/\.\.\/fleet\/opgavedokumenter\.js"/);
  });

  test("⚠ DOKUMENTERNE KOMMER MED opgave-PROP'EN — ingen separat useListe-hentning i OpgaveBilag", () => {
    const start = KALENDER.indexOf("function OpgaveBilag(");
    assert.ok(start >= 0, "OpgaveBilag findes ikke");
    const slut = KALENDER.indexOf("\n/**", start);
    const krop = KALENDER.slice(start, slut < 0 ? undefined : slut);
    assert.match(krop, /opgave\.dokumenter/);
    assert.doesNotMatch(krop, /useListe\(/,
      "OpgaveBilag henter tilsyneladende sine egne data i stedet for at læse opgave.dokumenter");
  });

  test("⚠ EN VELLYKKET UPLOAD/DEAKTIVERING/SYNLIGHEDSÆNDRING KALDER onAendret — ELLERS FORBLIVER LISTEN FORÆLDET", () => {
    const start = KALENDER.indexOf("function OpgaveBilag(");
    const slut = KALENDER.indexOf("\n/**", start);
    const krop = KALENDER.slice(start, slut < 0 ? undefined : slut);
    const forekomster = [...krop.matchAll(/if \(r\.ok\) onAendret\?\.\(\);/g)].length;
    assert.equal(forekomster, 3,
      "forventede tre steder (upload, deaktiver, synlighed) der kalder onAendret() efter et vellykket svar");
  });

  test("⚠ DELINGSKOLONNEN VISES KUN NÅR opgave.leverandoerId ER SAT", () => {
    const start = KALENDER.indexOf("function OpgaveBilag(");
    const slut = KALENDER.indexOf("\n/**", start);
    const krop = KALENDER.slice(start, slut < 0 ? undefined : slut);
    assert.match(krop, /\.\.\.\(opgave\.leverandoerId \? \[\{/,
      "delingskolonnen er tilsyneladende altid til stede, uanset om opgaven har en leverandør");
  });

  test("⚠ TOGGLEN KALDER saetOpgaveDokumentSynlighed MED synlig FRA CHECKBOKSEN — ikke en hardkodet værdi", () => {
    assert.match(KALENDER, /saetOpgaveDokumentSynlighed\(\{ opgaveId: opgave\.id, dokumentId: d\.id, synlig \}\)/);
  });

  test("Bilag hentes ét sted, ikke som en råt-vist storagePath — samme 'Åbn' → hentOpgaveDokumentLink-mønster", () => {
    assert.match(KALENDER, /hentOpgaveDokumentLink\(\{ opgaveId: opgave\.id, dokumentId: d\.id \}\)/);
  });
});
