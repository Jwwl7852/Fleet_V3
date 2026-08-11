/* test/functions-delt.test.mjs
 * Den delte politik må ikke drive fra sin kopi.
 *
 * ⚠ HVORFOR DEN FINDES. `functions/delt/audit-regler.js` er en KOPI af
 * `src/fleet/audit-regler.js`, fordi Firebase kun deployer functions/-mappen
 * og en import op gennem træet fejler i skyen — ved deploy, ikke ved test.
 *
 * En kopi er den fejl dette repo bliver ved med at betale for: Bil 104 med to
 * nummerplader, to demo-datasæt, to divisionsfiltre, tre datasæt i modulfiler.
 * Her ville driften betyde at KLIENTEN filtrerer mod én allowliste og
 * SERVEREN mod en anden — og serveren vinder, i tavshed. Et felt der blev
 * fjernet fra allowlisten i src ville stadig blive logget.
 *
 * Samme princip som `npm run regler:tjek`: prøven siger noget om filen,
 * driften håndhæver det udrullede, og de to skal efterprøves mod hinanden.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { DELTE_FILER, kildeSti, kopiSti, kropAf } from "../scripts/kopier-delt.mjs";

test("Hver delt fil har en kopi i functions/delt", () => {
  for (const navn of DELTE_FILER) {
    assert.ok(existsSync(kopiSti(navn)),
      `functions/delt/${navn} mangler. Kør npm run delt:kopier.`);
  }
});

test("Kopien er identisk med kilden", () => {
  for (const navn of DELTE_FILER) {
    const kilde = readFileSync(kildeSti(navn), "utf8");
    const kopi = kropAf(readFileSync(kopiSti(navn), "utf8"));
    assert.equal(kopi, kilde,
      `functions/delt/${navn} er ikke identisk med src/fleet/${navn}. ` +
      `Klienten og serveren ville filtrere mod hver sin allowliste, og ` +
      `serveren vinder uden at sige det. Kør npm run delt:kopier — ret ` +
      `ALDRIG kopien i hånden.`);
  }
});

test("Kopien bærer advarslen om at den ikke må redigeres", () => {
  /* Uden hovedet ser filen ud som en almindelig kilde, og den næste retter
     i den. Så er driften indført af en der troede han gjorde det rigtige. */
  for (const navn of DELTE_FILER) {
    const kopi = readFileSync(kopiSti(navn), "utf8");
    assert.match(kopi, /^\/\* ⚠ KOPI — REDIGÉR IKKE HER\./,
      `functions/delt/${navn} mangler advarselshovedet.`);
  }
});

test("Den delte fil har ingen imports", () => {
  /* Den skal kunne stå alene i to træer. En import ville trække en fil med
     der ikke er kopieret, og så fejler funktionen først i skyen. Det er
     samme grund som permissions.js og personale.js er importfri. */
  for (const navn of DELTE_FILER) {
    const kilde = readFileSync(kildeSti(navn), "utf8");
    assert.doesNotMatch(kilde, /^\s*import\s/m,
      `src/fleet/${navn} har et import. En delt fil skal kunne stå alene.`);
  }
});

test("Funktionen importerer politikken fra kopien, ikke op gennem træet", () => {
  /* En relativ sti ud af functions/ virker lokalt og fejler ved deploy. */
  const kode = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(kode, /from\s+["'](\.\.\/)+src\//,
    "functions/index.js importerer fra src/. Det virker lokalt og fejler i skyen.");
  assert.match(kode, /from\s+["']\.\/delt\/audit-regler\.js["']/,
    "functions/index.js importerer ikke politikken fra ./delt/.");
});

test("Funktionen tager aldrig tenant eller uid fra nyttelasten", () => {
  /* ⚠ DET ER HELE POINTEN MED EN AUDITLOG. En klient der selv må oplyse hvem
     den er, kan skrive en post om en anden bruger i en anden tenant — og så
     er loggen værre end ingen, fordi den ser troværdig ud. */
  const kode = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  assert.match(kode, /auth\.token\?\.tenant/, "tenant læses ikke fra tokenet.");
  assert.match(kode, /const uid = auth\.uid/, "uid læses ikke fra auth.");
  assert.doesNotMatch(kode, /\bd\.(tenantId|uid)\b/,
    "funktionen læser tenantId eller uid fra nyttelasten.");
});
