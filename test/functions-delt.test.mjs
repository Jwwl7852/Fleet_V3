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
  const i = kode.indexOf("export const skiftrolle");
  assert.ok(i > 0, "skiftrolle findes ikke — er funktionen døbt om?");
  assert.match(kode.slice(i, i + 1400), /revokeRefreshTokens/,
    "skiftrolle fornyer ikke tokenet.");
});

test("Funktionerne rører kun brugere i egen tenant", () => {
  /* uid er ikke hemmeligt. Uden tjekket kunne en admin ændre rollen på — eller
     spærre — en bruger hos en anden kunde ved at gætte eller opsnappe et uid.

     ⚠ PRØVEN TALTE FØR TO FOREKOMSTER, og det var et mål for kopier frem for
     for kontrol. Da de to blev til ét hentIEgenTenant(), faldt den — mens
     koden var blevet strammere, ikke løsere. Nu spørger den om det den mener:
     ingen af de to funktioner må hente en konto uden om hjælperen, og
     hjælperen skal have tjekket. */
  const kode = funktionskode();

  assert.match(kode, /function hentIEgenTenant[\s\S]*?customClaims\?\.tenant !== tenantId/,
    "hentIEgenTenant tjekker ikke tenanten.");

  for (const navn of ["skiftrolle", "spaerlogin"]) {
    const i = kode.indexOf(`export const ${navn} = onCall`);
    assert.ok(i > 0, `${navn} findes ikke — er funktionen døbt om?`);
    const krop = kode.slice(i, i + 1800);
    assert.match(krop, /hentIEgenTenant\(/, `${navn} går uden om hentIEgenTenant.`);
    assert.doesNotMatch(krop, /auth\.getUser\(/,
      `${navn} henter kontoen direkte — så er tenant-tjekket ikke garanteret.`);
  }
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

/* ══════════════════════════════════════════════════════════════════════
   EJERFUNKTIONERNE — den anden krydsning af tenant-grænsen
   ══════════════════════════════════════════════════════════════════════ */

const EJERFUNKTIONER = ["kundeopret", "kundemoduler", "kundestatus", "kundeadmin"];

/** Hvor ejerblokken begynder. ⚠ ET KODEMAERKE — se noten nedenfor. */
function ejergraense(kode) {
  const i = kode.indexOf("const TENANT_MOENSTER");
  assert.ok(i > 0, "fandt ikke ejerblokken — er TENANT_MOENSTER doebt om?");
  return i;
}

test("De fire ejerfunktioner findes og hedder det klienten kalder", () => {
  /* ⚠ SMÅ BOGSTAVER. En 2. generations funktion bliver til en Cloud
     Run-tjeneste, og et tjenestenavn må kun være småt. */
  const kode = funktionskode();
  for (const navn of EJERFUNKTIONER) {
    assert.match(kode, new RegExp(`export const ${navn} = onCall`), `${navn} mangler`);
    assert.equal(navn, navn.toLowerCase(), `${navn} har store bogstaver`);
  }
});

test("Hver ejerfunktion kræver udbyder-claim'et som FØRSTE handling", () => {
  /* ⚠ ET TJEK DER STÅR EFTER EN SKRIVNING, ER IKKE ET TJEK. Rækkefølgen
     er hele pointen: kraevUdbyder() skal kaste, før der er sket noget. */
  const kode = funktionskode();
  for (const navn of EJERFUNKTIONER) {
    const i = kode.indexOf(`export const ${navn} = onCall`);
    const krop = kode.slice(i, i + 400);
    const linjer = krop.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
    assert.match(linjer[0], /kraevUdbyder\(req\)/,
      `${navn} tjekker ikke udbyder-claim'et som det første, den gør.`);
  }
});

test("Udbydertjekket er et CLAIM, ikke en node i basen", () => {
  /* Slog vi op i en ejerliste i basen, ville en skrivning til den liste være
     en vej til at give sig selv adgang — og så skulle DEN skrivning
     beskyttes af noget. Ring. */
  const kode = funktionskode();
  const i = kode.indexOf("function kraevUdbyder");
  const krop = kode.slice(i, i + 500);
  assert.match(krop, /auth\.token\?\.udbyder !== true/);
  assert.doesNotMatch(krop, /getDatabase\(\)/,
    "kraevUdbyder slår op i basen — ejerskab skal komme fra tokenet.");
});

test("Ejerfunktionerne kan ikke give ejerskab", () => {
  /* ⚠ BESLUTNING 35. I er to. Kunne den ene fjerne den andens claim, kunne
     den ene lukke den anden ude — og adgangen til at rette det var selv
     ejerskabet. udbyder sættes kun med servicekontonøglen. */
  const kode = funktionskode();
  /* ⚠ GRAENSEN ER KODE, IKKE EN KOMMENTAR. Foerste udgave delte paa
     overskriften "EJERKONSOLLEN" — men funktionskode() stripper kommentarer,
     saa indexOf gav -1, slice(-1) gav ét tegn, og proeven var GROEN af
     ingenting. En proeve der ikke kan fejle, er ikke en proeve. */
  const efterEjerblok = kode.slice(ejergraense(kode));
  assert.doesNotMatch(efterEjerblok, /udbyder:\s*true/,
    "en ejerfunktion sætter udbyder-claim'et. Det må kun ske fra en maskine " +
    "med servicekontonøglen.");
});

test("kundeopret overskriver ikke en eksisterende kunde", () => {
  /* Et "opret" der stille nulstillede virksomhedsnavnet på en kunde med
     data og brugere, ville være en meget dyr tastefejl. */
  const kode = funktionskode();
  const i = kode.indexOf("export const kundeopret");
  const krop = kode.slice(i, i + 2000);
  assert.match(krop, /kundeFindes\(id\)/);
  assert.match(krop, /already-exists/);
});

test("kundeopret seeder ingen demo-data", () => {
  /* Hele pointen med den tomme platform: kunden skal se sit eget system tomt
     og opdage hvad tomme tilstande faktisk siger. En kunde der får DEMO
     Transports fjorten biler, sletter aldrig dem alle. */
  const kode = funktionskode();
  const i = kode.indexOf("export const kundeopret");
  const krop = kode.slice(i, kode.indexOf("export const kundemoduler"));
  assert.doesNotMatch(krop, /DEMO_|demo-/, "kundeopret seeder demo-data.");
  for (const node of ["koeretoejer", "personale", "kunder", "kpi"]) {
    assert.doesNotMatch(krop, new RegExp(`/${node}\``), `kundeopret skriver ${node}.`);
  }
});

test("kundeopret sætter markøren FØR alt andet", () => {
  /* Uden _findes afviser hver eneste regel alt — også de skrivninger der
     kommer bagefter, hvis de nogensinde skulle gå gennem reglerne. */
  const kode = funktionskode();
  const i = kode.indexOf("export const kundeopret");
  const krop = kode.slice(i, kode.indexOf("export const kundemoduler"));
  const iFindes = krop.indexOf("_findes");
  const iVirksomhed = krop.indexOf("/virksomhed");
  assert.ok(iFindes > 0 && iFindes < iVirksomhed, "_findes sættes ikke først.");
});

test("Kunde-id valideres — RTDB-nøgler tåler ikke punktum", () => {
  /* . $ # [ ] / er ulovlige i en nøgle. Et id med punktum ville skrive et
     helt andet sted i træet end nogen troede. */
  const kode = funktionskode();
  assert.match(kode, /TENANT_MOENSTER = \/\^\[a-z0-9\]\[a-z0-9-\]/);
  const i = kode.indexOf("function kraevKundeId");
  assert.match(kode.slice(i, i + 400), /TENANT_MOENSTER\.test\(id\)/);
});

test("kundestatus og kundemoduler rører ingen konto", () => {
  /* ⚠ BESLUTNING 32. Spærringen ligger på TENANTEN. Sattes `disabled` på
     kundens logins, kunne genåbningen ikke rulles tilbage: de der var
     spærret individuelt ville blive åbnet med. */
  const kode = funktionskode();
  for (const navn of ["kundestatus", "kundemoduler"]) {
    const i = kode.indexOf(`export const ${navn}`);
    const krop = kode.slice(i, i + 2200);
    assert.doesNotMatch(krop, /updateUser|deleteUser|disabled/,
      `${navn} rører en konto — spærringen hører på tenanten.`);
  }
});

test("Årsagen er en allowliste, ikke fritekst", () => {
  const kode = funktionskode();
  const i = kode.indexOf("export const kundestatus");
  const krop = kode.slice(i, i + 2200);
  assert.match(krop, /ALLE_AARSAGER\.includes\(aarsag\)/,
    "kundestatus tager imod en fri årsag — den ender i auditloggen.");
  assert.match(krop, /ALLE_ABONNEMENTSTATUS\.includes\(status\)/);
});

test("Hver ejerhandling logges hos KUNDEN", () => {
  /* Ikke i en separat ejerlog. Kunden skal kunne se at hans abonnement blev
     ændret; det er hans abonnement. Og én auditmekanisme frem for to. */
  const kode = funktionskode();
  for (const navn of EJERFUNKTIONER) {
    const i = kode.indexOf(`export const ${navn} = onCall`);
    const slut = kode.indexOf("export const", i + 10);
    const krop = kode.slice(i, slut > 0 ? slut : undefined);
    assert.match(krop, /log\(id, ejerUid|opretKonto\(/,
      `${navn} logger ikke hos kunden.`);
  }
});

test("kundeadmin og opretbruger deler ÉN oprettelse", () => {
  /* ⚠ TO KOPIER VILLE DRIVE, og den ene ville glemme at skrive indekset
     eller at sætte claims. De har forskellig ADGANGSKONTROL og samme
     oprettelse — det er præcis det en delt funktion er til for. */
  const kode = funktionskode();
  assert.match(kode, /async function opretKonto\(/);
  for (const navn of ["opretbruger", "kundeadmin"]) {
    const i = kode.indexOf(`export const ${navn} = onCall`);
    const slut = kode.indexOf("export const", i + 10);
    const krop = kode.slice(i, slut > 0 ? slut : undefined);
    assert.match(krop, /opretKonto\(/, `${navn} opretter kontoen selv.`);
    assert.doesNotMatch(krop, /createUser\(/, `${navn} har sin egen kopi af oprettelsen.`);
  }
});

test("Kun ejerfunktionerne tager tenanten fra nyttelasten", () => {
  /* ⚠ DET ER UNDTAGELSEN, OG DEN SKAL VÆRE SYNLIG. En ejerkonto har slet
     ingen tenant i sit token, så der er ikke noget at tage. Kundens egne
     funktioner må aldrig gøre det: en admin hos kunde A der selv måtte
     oplyse tenanten, kunne oprette en administrator hos kunde B. */
  /* ⚠ KLIPPET VED EJERBLOKKEN FØRST. Første udgave sliced fra hver funktion
     til den NÆSTE `export const` — og mellem spaerlogin og kundeopret står
     definitionen af kraevKundeId. Prøven var rød af den forkerte grund, og en
     prøve der er rød af den forkerte grund, bliver grøn af den forkerte grund
     næste gang. */
  const kode = funktionskode();
  const graense = ejergraense(kode);
  const kundensDel = kode.slice(0, graense);

  assert.doesNotMatch(kundensDel, /kraevKundeId\(/,
    "en af kundens egne funktioner tager et tenant-id fra nyttelasten.");
  assert.doesNotMatch(kundensDel, /kraevUdbyder\(/,
    "en af kundens egne funktioner bruger ejertjekket.");

  /* Og den anden vej: ejerblokken må ikke bruge kundens tjek, for en
     ejerkonto har ingen tenant og intet perms-claim at tjekke. */
  const ejerensDel = kode.slice(graense);
  assert.doesNotMatch(ejerensDel, /kraevBrugeradmin\(/,
    "en ejerfunktion bruger kundens tjek — en ejerkonto har ingen tenant.");
});
