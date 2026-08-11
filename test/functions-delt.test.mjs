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
  const hele = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  assert.match(hele, /auth\.token\?\.tenant/, "tenant læses ikke fra tokenet.");
  assert.match(hele, /const uid = auth\.uid/, "uid læses ikke fra auth.");

  /* ⚠ AFGRÆNSET TIL AUDITFUNKTIONEN, og det er en SKÆRPELSE, ikke en
     lempelse. Prøven læste hele filen og forbød `d.uid` overalt. Da
     brugeradministrationen kom til, læser skiftRolle og spaerLogin `d.uid`
     — men det er MÅLBRUGERENS uid, altså hvem handlingen gælder, ikke hvem
     der udfører den. De to er forskellige ting, og en prøve der forbød
     begge, ville have tvunget en omskrivning der ikke gjorde noget bedre.

     At målbrugeren hører til kalderens tenant, prøves for sig — se
     "Funktionerne rører kun brugere i egen tenant". Det er dét der faktisk
     beskytter, og det er en stærkere kontrol end et forbud mod et feltnavn. */
  const audit = hele.slice(hele.indexOf("export const audit"), hele.indexOf("BRUGERADMINISTRATION"));
  assert.doesNotMatch(audit, /\bd\.(tenantId|uid)\b/,
    "auditfunktionen læser tenantId eller uid fra nyttelasten.");
});

/* ══════════════════════════════════════════════════════════════════════
   Brugeradministrationen — den funktion der kan gøre mest skade
   ══════════════════════════════════════════════════════════════════════

   ⚠ EN ADMIN HOS KUNDE A DER SELV MÅTTE OPLYSE TENANTEN, KUNNE OPRETTE EN
   ADMINISTRATOR HOS KUNDE B. Det ville være det stik modsatte af hele
   isolationen — og det ville ske gennem en funktion vi selv har skrevet.
   Prøven læser koden som tekst, fordi funktionen ikke kan importeres uden
   firebase-admin.
   ══════════════════════════════════════════════════════════════════════ */
const funktionskode = () =>
  readFileSync(new URL("../functions/index.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("Brugerfunktionerne tager tenanten fra tokenet", () => {
  const kode = funktionskode();
  assert.match(kode, /const tenantId = auth\.token\?\.tenant/,
    "kraevBrugeradmin læser ikke tenant fra tokenet.");
  assert.doesNotMatch(kode, /\bd\.tenant(Id)?\b/,
    "en funktion læser tenant fra nyttelasten.");
});

test("Rollen afgør perms — de sendes ikke med", () => {
  /* Kunne klienten sende en perms-liste, kunne en admin give sig selv noget
     der ikke findes i noget preset, og rollegennemgangen ville ikke længere
     beskrive virkeligheden. */
  const kode = funktionskode();
  assert.match(kode, /permStrengFraRolle\(rolle\)/,
    "perms udledes ikke af rollen.");
  assert.doesNotMatch(kode, /\bd\.perms\b/,
    "en funktion læser perms fra nyttelasten.");
});

test("Et rolleskift fornyer tokenet", () => {
  /* ⚠ UDEN revokeRefreshTokens ER NEDGRADERINGEN EN PÆN KNAP. Brugeren
     beholder sine gamle claims indtil tokenet udløber af sig selv — man ville
     tro man havde fjernet en adgang, som stadig virkede. Det er den værste
     fejltilstand, fordi den ser ud som om den lykkedes. */
  const kode = funktionskode();
  const skift = kode.slice(kode.indexOf("export const skiftRolle"));
  assert.match(skift.slice(0, 1400), /revokeRefreshTokens/,
    "skiftRolle fornyer ikke tokenet.");
});

test("Funktionerne rører kun brugere i egen tenant", () => {
  /* uid er ikke hemmeligt. Uden tjekket kunne en admin ændre rollen på — eller
     spærre — en bruger hos en anden kunde ved at gætte eller opsnappe et uid. */
  const kode = funktionskode();
  const antal = [...kode.matchAll(/customClaims\?\.tenant !== tenantId/g)].length;
  assert.ok(antal >= 2, `kun ${antal} tenant-tjek på målbrugeren — forventede mindst 2`);
});

test("Brugerindekset bærer hverken claims eller løsen", () => {
  /* Claims står i tokenet, hvor de hører hjemme. Lå de også i indekset,
     ville de to kunne drive fra hinanden — og indekset ville være det man
     kiggede på. */
  const kode = funktionskode();
  const indeks = kode.slice(kode.indexOf("const indeksPost"), kode.indexOf("async function skrivIndeks"));
  assert.doesNotMatch(indeks, /\bperms\b/, "indekset bærer perms.");
  assert.doesNotMatch(indeks, /\bkode\b|\bpassword\b/, "indekset bærer et løsen.");
});

test("Man kan ikke spærre sit eget login", () => {
  /* Den sidste administrator der gjorde det, ville have låst hele
     virksomheden ude af sin egen brugeradministration — og der er ingen vej
     tilbage fra klienten. */
  const kode = funktionskode();
  assert.match(kode, /maalUid === uid && spaerret/,
    "spaerLogin forhindrer ikke at man spærrer sig selv.");
});

test("Kun admin har brugere.skriv", async () => {
  /* En rolle der kan oprette brugere, kan oprette en admin — og dermed give
     sig selv alt. Derfor ét preset, ikke flere. */
  const { PERM, ROLLE_PERMS } = await import("../src/fleet/permissions.js");
  const med = Object.entries(ROLLE_PERMS)
    .filter(([, p]) => p.includes(PERM.brugereSkriv))
    .map(([r]) => r);
  assert.deepEqual(med, ["admin"]);
});
