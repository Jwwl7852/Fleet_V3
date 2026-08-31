/* test/retention.test.mjs
 * Retention og auditoprydningen.
 *
 * Prøven der betyder mest, står nederst: at jobbet IKKE sletter noget så
 * længe tallet ikke er afgjort. Et slettet auditspor kan ikke skaffes igen,
 * og 24 måneder er en foreløbig værdi ingen jurist har sagt god for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RETENTION_MAANEDER, RETENTION_AFGJORT, KLASSER,
  retentionFor, retentionErAfgjort, forfaldnePartitioner, klasseFor, AUDIT,
} from "../src/fleet/audit-regler.js";

const NU = Date.UTC(2026, 7, 18);
const MD = 30.44 * 86400000;

/* ---- Politikken -------------------------------------------------------- */

test("hver klasse har både et tal og et svar på om tallet er afgjort", () => {
  /* To felter og ikke ét: stod der kun et tal, ville den første der skrev en
     sletter, læse det som et svar. */
  for (const k of KLASSER) {
    assert.equal(typeof RETENTION_MAANEDER[k], "number", `${k} mangler et tal`);
    assert.equal(typeof RETENTION_AFGJORT[k], "boolean", `${k} mangler et afgjort-flag`);
  }
});

test("⚠ INGEN RETENTION ER AFGJORT ENDNU", () => {
  /* Den her prøve SKAL falde den dag juristen har svaret — og så er det
     meningen at man også retter tallet og skriver begrundelsen i
     BESLUTNINGER.md. I den rækkefølge. */
  for (const k of KLASSER) {
    assert.equal(retentionErAfgjort(k), false,
      `${k} er markeret afgjort. Staar tallet og begrundelsen i BESLUTNINGER.md?`);
  }
});

test("en ukendt klasse falder tilbage på drift — men er ikke afgjort", () => {
  assert.equal(retentionFor("findes-ikke"), RETENTION_MAANEDER.drift);
  assert.equal(retentionErAfgjort("findes-ikke"), false);
});

/* ---- Hvilke partitioner er forfaldne ----------------------------------- */

test("en partition der er ældre end sin retention, er forfalden", () => {
  const r = forfaldnePartitioner([{ klasse: "drift", aar: "2023", maaned: "01" }], NU);
  assert.equal(r.length, 1);
  assert.equal(r[0].maaneder, 24);
});

test("en frisk partition er ikke", () => {
  assert.deepEqual(forfaldnePartitioner([{ klasse: "drift", aar: "2026", maaned: "07" }], NU), []);
});

test("⚠ GRÆNSEN REGNES PÅ PARTITIONENS SLUTNING, ikke dens start", () => {
  /* En post fra den 31. i måneden hører til hele måneden. Regnede vi på
     starten, ville den blive slettet en måned for tidligt — og en måned er
     en hel partition. */
  const lige_indenfor = new Date(NU - 24 * MD);
  const aar = lige_indenfor.getUTCFullYear();
  const maaned = lige_indenfor.getUTCMonth() + 1;
  /* Partitionen der SLUTTER lige efter grænsen, må ikke være forfalden. */
  const r = forfaldnePartitioner(
    [{ klasse: "drift", aar: String(aar), maaned: String(maaned).padStart(2, "0") }], NU);
  assert.equal(r.length, 0, "en partition blev forfalden foer den var helt ude af vinduet");
});

test("en ukendt klasse i stien springes over", () => {
  /* Stien er skrevet af en funktion, men en fremmed nøgle skal ikke få
     jobbet til at slette noget den ikke forstår. */
  assert.deepEqual(forfaldnePartitioner([{ klasse: "hittepaa", aar: "2000", maaned: "01" }], NU), []);
});

test("ugyldige tal springes over frem for at blive til NaN", () => {
  assert.deepEqual(forfaldnePartitioner([{ klasse: "drift", aar: "abc", maaned: "01" }], NU), []);
});

/* ══════════════════════════════════════════════════════════════════════════
   DEN VIGTIGE

   Et slettet auditspor kan ikke skaffes igen.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ FORFALDEN BETYDER IKKE MÅ SLETTES", () => {
  const r = forfaldnePartitioner([{ klasse: "regnskab", aar: "2020", maaned: "03" }], NU);
  assert.equal(r.length, 1, "partitionen er ikke fundet forfalden");
  assert.equal(r[0].maaSlettes, false,
    "en partition maa slettes selv om retention ikke er afgjort");
});

test("⚠ JOBBET SLETTER KUN NÅR maaSlettes ER SAND", () => {
  const kilde = readFileSync("functions/index.js", "utf8");
  /* ⚠ SLICEN SKAL VÆRE AFGRÆNSET TIL FUNKTIONENS EGEN KROP — den stod uden
     et slut-punkt og fangede derfor OGSÅ hver eneste funktion skrevet
     EFTER auditoprydning i filen. Det opdagedes først da en helt anden
     funktion (braendstofMatchBekraefts "fjern"-gren) fik sit eget,
     lovlige .remove()-kald og gjorde tælleren "mere end én" — uden at
     auditoprydning selv var rørt. Se samme blokAf()-mønster i
     skive4c-dokumenter.test.mjs. */
  const start = kilde.indexOf("export const auditoprydning");
  const naeste = kilde.indexOf("\nexport const ", start + 1);
  const blok = naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
  assert.ok(blok.includes("if (!p.maaSlettes) {"), "jobbet spoerger ikke om det maa");
  assert.ok(blok.includes("rapport.forfaldne.push(linje);"), "det forfaldne rapporteres ikke");
  /* ⚠ ÉN OPERATION PR. PARTITION. Det er hele grunden til at klassen ligger i
     stien — ellers skulle hver post scannes. */
  assert.ok(/audit\/\$\{tenantId\}\/\$\{p\.klasse\}\/\$\{p\.aar\}\/\$\{p\.maaned\}`\)\.remove\(\)/.test(blok),
    "der slettes ikke en hel partition ad gangen");
  assert.equal((blok.match(/\.remove\(\)/g) || []).length, 1,
    "der er mere end een sletning — hvad sletter den anden?");
});

test("⚠ MEN DEN TIER IKKE", () => {
  /* Et spørgsmål ingen kan se, bliver ikke besvaret. En oprydning der bare
     var udeladt, ville ingen opdage manglede. */
  const kilde = readFileSync("functions/index.js", "utf8");
  const blok = kilde.slice(kilde.indexOf("export const auditoprydning"));
  assert.ok(blok.includes("udbyder/retention/${dato}"), "rapporten skrives ikke");
  assert.ok(/Retention er IKKE afgjort/.test(blok), "loggen siger ikke hvorfor der ikke slettes");
});

test("⚠ RAPPORTEN BÆRER INGEN AUDITPOSTER", () => {
  /* Kun tenant, klasse, år, måned og et ANTAL. En auditpost kopieret ud i en
     rapport under udbyder/ havde forladt kundens tenant — den grænse
     beslutning 24 holder. */
  const kilde = readFileSync("functions/index.js", "utf8");
  const blok = kilde.slice(kilde.indexOf("export const auditoprydning"));
  const linje = blok.slice(blok.indexOf("const linje = {"), blok.indexOf("};", blok.indexOf("const linje = {")));
  for (const felt of ["foer", "efter", "aendrede", "uid", "note", "objektId"]) {
    assert.ok(!linje.includes(felt), `rapporten baerer ${felt} — en auditpost har forladt tenanten`);
  }
  assert.ok(linje.includes("antal"), "rapporten siger ikke hvor mange");

  const regler = readFileSync("firebase.rules.json", "utf8");
  const blokR = regler.slice(regler.indexOf('"retention": {'), regler.indexOf('"kunder": {', regler.indexOf('"retention": {')));
  assert.ok(blokR.includes('"$andet": { ".validate": false }'),
    "rapporten tager imod hvad som helst");
});

test("⚠ TENANTLISTEN KOMMER FRA udbyder/kunder, ikke fra audit/", () => {
  /* En scanning af audit/ selv ville liste tenants ud af en node auditloggen
     skriver — og en tenant uden aktivitet ville forsvinde ud af oprydningen
     uden at nogen så det. */
  const kilde = readFileSync("functions/index.js", "utf8");
  const blok = kilde.slice(kilde.indexOf("export const auditoprydning"));
  assert.ok(blok.includes('db.ref("udbyder/kunder")'));
});

test("klassen i stien er den samme som klasseFor() giver", () => {
  /* Ellers ville jobbet rydde op i partitioner ingen skriver til. */
  assert.equal(klasseFor(AUDIT.login, "hvadsomhelst"), "sikkerhed");
  assert.equal(klasseFor(AUDIT.aendre, "etaper"), "regnskab");
  assert.equal(klasseFor(AUDIT.aendre, "opgaver"), "drift");
  for (const k of ["drift", "regnskab", "sikkerhed"]) assert.ok(KLASSER.includes(k));
});

test("jobbet kører månedligt, ikke dagligt", () => {
  /* En partition er månedlig. Et dagligt job ville læse hele audit-træet
     igennem 30 gange for at finde det samme. */
  const kilde = readFileSync("functions/index.js", "utf8");
  const blok = kilde.slice(kilde.indexOf("export const auditoprydning"));
  assert.ok(/schedule: "\d+ \d+ 1 \* \*"/.test(blok), "jobbet koerer ikke maanedligt");
});
