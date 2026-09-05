/* test/indberetningindsend.test.mjs
 * indberetningIndsend — TILFØJET 2026-09-05.
 *
 * ⚠ HVORFOR DEN FINDES. Produktejerens triageflow: "så snart der er
 * indberettes, skal der oprettes en sag med et ticketnummer." En
 * indberetning blev hidtil skrevet DIREKTE af klienten (ingen Cloud
 * Function) — der var ingen server-side krog en sag kunne oprettes
 * atomisk fra. `indberetningIndsend` er den krog, samme mønster som
 * `opgaveplanlaeg` (opgave + reservation i én update()).
 *
 * ⚠ SAMME METODE SOM test/skive3b-indberetningstriage.test.mjs's anden
 * halvdel: functions/index.js læses SOM TEKST, og prøven spørger om
 * HÅNDHÆVELSEN — ikke kun om funktionen findes. Ingen emulator-tur her;
 * `.write`-lukningen prøves i test/rules.indberetninger.test.mjs, og den
 * fulde ende-til-ende-strøm (rigtigt ticketnummer, rigtig sag) er
 * DEV-verificeret i en rigtig browser, ikke kun her.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";
import { ALLE_ARTER, kraeverForloeb } from "../src/fleet/indberetninger.js";

const KILDE = readFileSync("functions/index.js", "utf8");

const funktionsblok = (navn) => {
  const i = KILDE.indexOf(`export const ${navn} = onCall`);
  assert.ok(i > 0, `${navn} findes ikke`);
  const naeste = KILDE.indexOf("\nexport const ", i + 1);
  return naeste < 0 ? KILDE.slice(i) : KILDE.slice(i, naeste);
};

const blok = funktionsblok("indberetningIndsend");
const ren = udenKommentarer(blok);

describe("indberetningIndsend findes og kræver det rigtige", () => {
  it("kræver indberetninger.skriv — samme som reglen krævede for en ny post", () => {
    assert.match(ren, /perms\.includes\("\|indberetninger\.skriv\|"\)/);
  });

  it("⚠ ABONNEMENT, MODUL OG TENANT PRØVES — samme vagter som opgaveplanlaeg", () => {
    assert.match(ren, /_findes/);
    assert.match(ren, /abonnement.*status/);
    assert.match(ren, /moduler.*flaade/);
  });

  it("afviser en ukendt art", () => {
    assert.match(ren, /ALLE_ARTER\.includes\(art\)/);
  });
});

describe("⚠ SERVER-SIDE FELTER — EN BROWSER KAN OPLYSE HVAD SOM HELST", () => {
  it("oprettetAf/oprettetMs kommer IKKE fra payloadet (d)", () => {
    assert.match(ren, /oprettetAf:\s*uid/);
    assert.ok(!/oprettetAf:\s*d\./.test(ren), "oprettetAf tages fra klienten");
    assert.match(ren, /oprettetMs:\s*nu/);
    assert.ok(!/oprettetMs:\s*d\./.test(ren), "oprettetMs tages fra klienten");
  });

  it("id genereres af serveren (push-nøgle), ikke sendt af klienten", () => {
    assert.match(ren, /const id = rod\.child\("indberetninger"\)\.push\(\)\.key/);
  });
});

describe("⚠ KUN DRIFTSHÆNDELSER FÅR ET FORLØB OG EN SAG", () => {
  it("forloeb sættes kun når kraeverForloeb(art) er sand", () => {
    assert.match(ren, /kraeverForloeb\(art\)\s*\?\s*\{\s*forloeb:\s*"ny"\s*\}\s*:\s*\{\s*\}/);
  });

  it("⚠ KATALOGET ER ENIGT MED SIG SELV — hver driftshændelse kræver et forløb", () => {
    /* Ikke en test af funktionen, men af FORUDSÆTNINGEN den bygger på: hvis
       kraeverForloeb() og ALLE_ARTER nogensinde driver fra hinanden, giver
       resten af testene her et falsk billede. */
    for (const art of ALLE_ARTER) {
      assert.equal(typeof kraeverForloeb(art), "boolean", art);
    }
  });

  it("sagen oprettes kun inde i kraeverForloeb(art)-forgreningen", () => {
    const i = ren.indexOf("if (kraeverForloeb(art)) {");
    assert.ok(i > 0, "ingen kraeverForloeb-forgrening om sagsoprettelsen");
    const forgrening = ren.slice(i, ren.indexOf("\n  }", i) + 4);
    assert.match(forgrening, /naesteSagsnummer\(/);
    assert.match(forgrening, /SAG_ART\.fleet\.art/);
    assert.match(forgrening, /objektType:\s*"indberetning"/);
    assert.match(forgrening, /objektId:\s*id/);
  });

  it("⚠ SKADEBESKRIVELSE/MODPART AFVISES EKSPLICIT — aldrig stille tabt", () => {
    /* De to er klassificerede og har `.validate: false` på hovedposten
       (kun tilladt på sensitive/indberetninger, som chaufføren ikke må
       skrive til). Funktionen går uden om .validate (Admin-SDK) og skal
       derfor selv afvise dem — ikke stiltiende springe dem over. */
    assert.match(ren, /d\.skadeBeskrivelse.*d\.modpart|d\.modpart.*d\.skadeBeskrivelse/);
    assert.match(ren, /HttpsError\("invalid-argument"/);
  });

  it("braendstof kræver koeretoejId, dato og liter — samme tre felter som reglen", () => {
    assert.match(ren,
      /art === "braendstof" && !\(post\.koeretoejId && post\.dato && Number\(post\.liter\) > 0\)/);
  });
});

describe("⚠ ÉN update() — ATOMISK, SAMME FIGUR SOM opgaveplanlaeg", () => {
  it("kun ét rod.update()-kald, ingen separate .set()", () => {
    assert.equal((ren.match(/await rod\.update\(/g) || []).length, 1);
    assert.ok(!/\.set\(/.test(ren), "funktionen skriver med .set() ved siden af update()");
  });

  it("indberetningen og sagen (når den findes) lander i SAMME opdatering", () => {
    const i = ren.indexOf("const opdatering = {}");
    const j = ren.indexOf("await rod.update(opdatering)");
    assert.ok(i > 0 && j > i, "opdatering bygges ikke før den ene update()");
    const midt = ren.slice(i, j);
    assert.match(midt, /opdatering\[`indberetninger\/\$\{id\}`\]\s*=\s*post/);
    assert.match(midt, /opdatering\[`sager\/\$\{sagId\}`\]/);
    /* ⚠ IKKE opdatering[`indberetninger/${id}/sagId`] VED SIDEN AF. Det er
       RTDB's "values argument contains a path that is ancestor of another
       path" — en helt anden sti INDE i den sti der allerede er sat ovenfor,
       forbudt i samme update()-kald. FUNDET VED DEV-VERIFIKATION: den
       version fejlede 500/INTERNAL for enhver driftshændelse. sagId sættes
       i stedet ved at MUTERE `post` (samme objektreference som opdatering[
       indberetninger/${id}] allerede peger på) — se testen nedenfor. */
    assert.ok(!/opdatering\[`indberetninger\/\$\{id\}\/sagId`\]/.test(midt),
      "opdatering sætter sagId som en understi ved siden af den fulde node — RTDB afviser det");
  });

  it("⚠ sagId sættes ved at MUTERE post, ikke ved en ekstra understi", () => {
    /* post er allerede den objektreference opdatering[`indberetninger/${id}`]
       peger på — post.sagId = sagId er derfor nok, og skal stå EFTER at
       sagId er kendt (inde i kraeverForloeb-forgreningen). */
    const i = ren.indexOf("if (kraeverForloeb(art)) {");
    const forgrening = ren.slice(i, ren.indexOf("\n  }", i) + 4);
    assert.match(forgrening, /post\.sagId\s*=\s*sagId/);
  });

  it("auditlogges efter samme mønster som opgaver/indberetningTriage", () => {
    assert.ok(ren.includes("logIndberetning("));
    assert.ok(ren.includes("AUDIT.opret"));
  });

  it("returnerer sagId/sagsnummer til klienten, så kvitteringen kan vise ticketnummeret", () => {
    assert.match(ren, /return\s*\{\s*id,\s*sagId,\s*sagsnummer\s*\}/);
  });
});

describe("⚠ KLIENTEN KALDER FUNKTIONEN, SKRIVER IKKE DIREKTE", () => {
  const klient = readFileSync("src/moduler/app/Indberetning.jsx", "utf8");

  it("ingen gem()/db.ref() til at oprette en indberetning — kaldFunktion i stedet", () => {
    assert.ok(!/from ".*\/skriv\.js"/.test(klient), "importerer stadig gem() fra skriv.js");
    assert.ok(klient.includes('kaldFunktion("indberetningIndsend"'),
      "send() kalder ikke indberetningIndsend");
  });

  it("kaster ikke ukontrolleret — fanger fejlen og viser besked", () => {
    assert.ok(klient.includes("try {") && klient.includes("catch (e)"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Reglen — .write kræver nu data.exists() for at KUNNE oprette
   ══════════════════════════════════════════════════════════════════════════ */
describe("Reglen: indberetninger/$id kan ikke længere oprettes direkte", () => {
  const REGLER = JSON.parse(
    readFileSync("firebase.rules.json", "utf8")
      .replace(/^﻿/, "")
      .replace(/^\s*\/\/.*$/gm, "")
  ).rules.tenants.$tenantId;
  const POST = REGLER.indberetninger.$id;

  it("⚠ BEGGE GRENE KRÆVER data.exists() — hverken egen eller andres kan oprettes direkte", () => {
    /* Der skal stå netop TO forekomster af data.exists() i .write — én pr.
       gren (indberetninger.skriv og indberetninger.skrivAlle). Én ville
       betyde at den anden gren stadig kunne oprette frit. */
    const forekomster = (POST[".write"].match(/data\.exists\(\)/g) || []).length;
    assert.equal(forekomster, 2,
      `.write nævner data.exists() ${forekomster} gange — forventede 2 (én pr. gren)`);
  });

  it("⚠ EN REDIGERING ER STADIG ÅBEN — ejerskabstjekket på oprettetAf er urørt", () => {
    assert.match(POST[".write"], /data\.child\('oprettetAf'\)\.val\(\) === auth\.uid/);
  });

  it("sagId peger på en post der findes — samme mønster som opgave.sagId", () => {
    assert.match(POST.sagId[".validate"],
      /root\.child\('tenants'\)\.child\(\$tenantId\)\.child\('sager'\)\.child\(newData\.val\(\)\)\.exists\(\)/);
  });
});
