/* test/skive4b-leverandoerer.test.mjs
 * Skive 4B — Fælles Leverandører + CRUD.
 *
 * ⚠ SAMME METODE SOM skive4a-fakturaer.test.mjs: kildekode-inspektion mod
 * firebase.rules.json, functions/index.js, nav.js og de skærme der bruger
 * leverandørkartoteket, plus direkte prøver af permission-fordelingen.
 * Ingen af dem kører mod en emulator — det gør rules.leverandoerer.test.mjs,
 * som er den der bekræfter noden faktisk håndhæver det her.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PERM, ROLLE_PERMS, harPerm, permStrengFraRolle } from "../src/fleet/permissions.js";
import { NAV } from "../src/fleet/nav.js";
import { NODE_MODUL } from "../src/fleet/moduler.js";

const kilde = readFileSync("functions/index.js", "utf8");
const REGELFIL = readFileSync("firebase.rules.json", "utf8")
  .replace(/^﻿/, "").replace(/^\s*\/\/.*$/gm, "");

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* ══════════════════════════════════════════════════════════════════════════
   PERMISSION-MODELLEN — punkt 2
   ══════════════════════════════════════════════════════════════════════════ */
describe("leverandoerer.laes/.skriv — rollefordelingen", () => {
  const LAES = ["disponent", "koordinator", "lagermedarbejder", "revisor", "admin"];
  const SKRIV = ["disponent", "koordinator", "admin"];

  it("⚠ FORDELINGEN ER DEN SAMME SOM DEN GAMLE indkoeb.laes/.skriv-FORDELING", () => {
    for (const rolle of Object.keys(ROLLE_PERMS)) {
      assert.equal(
        ROLLE_PERMS[rolle].includes(PERM.leverandoererLaes), LAES.includes(rolle),
        `${rolle}: leverandoererLaes stemmer ikke med den planlagte fordeling`);
      assert.equal(
        ROLLE_PERMS[rolle].includes(PERM.leverandoererSkriv), SKRIV.includes(rolle),
        `${rolle}: leverandoererSkriv stemmer ikke med den planlagte fordeling`);
    }
  });

  it("⚠ CHAUFFØREN HAR INGEN AF DE TO — ingen leverandør-CRUD til en chauffør", () => {
    assert.ok(!ROLLE_PERMS.chauffoer.includes(PERM.leverandoererLaes));
    assert.ok(!ROLLE_PERMS.chauffoer.includes(PERM.leverandoererSkriv));
  });

  it("⚠ INGEN AF DE TO HAVES AF ALLE SYV ROLLER — ellers spærrer den for ingen", () => {
    const roller = Object.keys(ROLLE_PERMS);
    for (const perm of [PERM.leverandoererLaes, PERM.leverandoererSkriv]) {
      const har = roller.filter((r) => ROLLE_PERMS[r].includes(perm));
      assert.ok(har.length > 0 && har.length < roller.length, `${perm}: ${har.length}/${roller.length}`);
    }
  });

  it("⚠ indkoeb.laes ALENE GIVER IKKE leverandoerer.laes — de to permissions er uafhængige", () => {
    const perms = `|${PERM.indkoebLaes}|`;
    assert.ok(harPerm(perms, PERM.indkoebLaes));
    assert.ok(!harPerm(perms, PERM.leverandoererLaes),
      "et perms-token med kun indkoeb.laes matcher leverandoerer.laes — de er ikke uafhængige");
  });

  it("⚠ indkoeb.skriv ALENE GIVER IKKE leverandoerer.skriv", () => {
    const perms = `|${PERM.indkoebSkriv}|`;
    assert.ok(harPerm(perms, PERM.indkoebSkriv));
    assert.ok(!harPerm(perms, PERM.leverandoererSkriv),
      "et perms-token med kun indkoeb.skriv matcher leverandoerer.skriv — de er ikke uafhængige");
  });

  it("⚠ ADMIN OG CHAUFFØR I permStrengFraRolle BÆRER DET FORVENTEDE", () => {
    const admin = permStrengFraRolle("admin");
    assert.ok(admin.includes(`|${PERM.leverandoererLaes}|`));
    assert.ok(admin.includes(`|${PERM.leverandoererSkriv}|`));
    const chauffoer = permStrengFraRolle("chauffoer");
    assert.ok(!chauffoer.includes(`|${PERM.leverandoererLaes}|`));
    assert.ok(!chauffoer.includes(`|${PERM.leverandoererSkriv}|`));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RTDB-REGLEN — leverandoerer/.read og $leverandoerId/.write, punkt 2+3+7
   ══════════════════════════════════════════════════════════════════════════ */
describe("leverandoerer-nodens regler — fuldt ugatet base-node (Model B)", () => {
  const i = REGELFIL.indexOf('"leverandoerer": {');
  const blok = REGELFIL.slice(i, i + 2000);

  it("⚠ .read KRÆVER leverandoerer.laes, IKKE indkoeb.laes", () => {
    assert.match(blok, /perms\.contains\('\|leverandoerer\.laes\|'\)/);
    assert.ok(!/perms\.contains\('\|indkoeb\.laes\|'\)/.test(blok),
      "leverandoerer.read nævner stadig indkoeb.laes");
  });

  it("⚠ .write KRÆVER leverandoerer.skriv, IKKE indkoeb.skriv", () => {
    assert.match(blok, /perms\.contains\('\|leverandoerer\.skriv\|'\)/);
    assert.ok(!/perms\.contains\('\|indkoeb\.skriv\|'\)/.test(blok),
      "leverandoerer.write nævner stadig indkoeb.skriv");
  });

  it("⚠ INGEN MODULKLAUSUL — elleve skærme uden for Procure rører noden", () => {
    assert.ok(!/moduler'\)\.child\('indkoeb'\)/.test(blok),
      "leverandoerer har fået en modulklausul — det ville spærre skærme uden for Procure");
  });

  it("⚠ leverandoerer STÅR IKKE I NODE_MODUL — den er base, ligesom fakturaer/satser", () => {
    assert.equal(NODE_MODUL.leverandoerer, undefined,
      "leverandoerer er stadig gatet af et modul i moduler.js");
  });

  it("⚠ newData.exists() BEVARES — ingen hardslet-regression", () => {
    assert.match(blok, /newData\.exists\(\)/,
      "hardslet-blokeringen fra beslutning 53 er væk fra $leverandoerId.write");
  });

  it("⚠ TENANT-ISOLATION STÅR UÆNDRET", () => {
    assert.match(blok, /auth\.token\.tenant === \$tenantId/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   INGEN NY CLOUD FUNCTION — punkt 5+7
   ══════════════════════════════════════════════════════════════════════════ */
describe("CRUD går gennem gem(), ingen ny leverandør-skrivefunktion", () => {
  it("⚠ INGEN leverandoerskriv/leverandoerOpret/leverandoerCrud I functions/index.js", () => {
    assert.ok(!/export const leverandoerskriv|export const leverandoerOpret|export const leverandoerCrud/.test(kilde),
      "en leverandør-CRUD Cloud Function er tilføjet — 4B genbruger gem(), ikke en ny funktion");
  });

  it("⚠ Leverandoerer.jsx SKRIVER VIA gem(), MED flet:true", () => {
    const skaerm = udenKommentarer(
      readFileSync("src/moduler/indkoeb/Leverandoerer.jsx", "utf8"));
    assert.match(skaerm, /gem\(\{/);
    assert.match(skaerm, /flet:\s*true/);
    assert.match(skaerm, /objekt:\s*"leverandoerer"/);
  });

  it("⚠ INGEN HARDSLET I Leverandoerer.jsx — hverken .remove() eller set(null)", () => {
    const skaerm = readFileSync("src/moduler/indkoeb/Leverandoerer.jsx", "utf8");
    assert.ok(!/\.remove\(\)/.test(skaerm), "Leverandoerer.jsx kalder .remove()");
    assert.ok(!/set\(\s*null\s*\)/.test(skaerm), "Leverandoerer.jsx kalder set(null)");
  });

  it("⚠ DEAKTIVERING SKRIVER KUN aktiv, IKKE ET FULDT OBJEKT — flet:true forhindrer overskrivning", () => {
    const skaerm = udenKommentarer(
      readFileSync("src/moduler/indkoeb/Leverandoerer.jsx", "utf8"));
    const deaktiverStart = skaerm.indexOf("const deaktiver =");
    assert.ok(deaktiverStart >= 0, "deaktiver() findes ikke");
    const deaktiverBlok = skaerm.slice(deaktiverStart, deaktiverStart + 300);
    assert.match(deaktiverBlok, /data:\s*\{\s*aktiv:\s*false\s*\}/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KANONISK RUTE OG NAVIGATION — punkt 4
   ══════════════════════════════════════════════════════════════════════════ */
describe("Leverandører er den ene kanoniske overflade", () => {
  it("⚠ NAV-PUNKTET KRÆVER leverandoerer.laes OG ER FLYTTET TIL faelles-gruppen", () => {
    const punkt = NAV.find((m) => m.key === "leverandoerer");
    assert.ok(punkt, "leverandoerer findes ikke som topniveaupunkt i NAV");
    assert.equal(punkt.kraeverPerm, "leverandoerer.laes");
    assert.equal(punkt.gruppe, "faelles");
  });

  it("⚠ RUTEN ER IKKE OMDØBT — /indkoeb/leverandoerer uændret", () => {
    const punkt = NAV.find((m) => m.key === "leverandoerer");
    assert.equal(punkt.sti, "/indkoeb/leverandoerer",
      "ruten blev ændret — 4B besluttede at bevare den for ikke at kræve en URL-migration");
  });

  it("⚠ IKKE LÆNGERE ET BARN UNDER indkoeb-GRUPPEN", () => {
    const gruppe = NAV.find((m) => m.key === "indkoeb");
    assert.ok(!gruppe.born.some((b) => b.key === "leverandoerer"),
      "leverandoerer står stadig som barn under Procure-gruppen");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ÉN KILDE — punkt 3+8: ingen parallel leverandørregistrering, alle moduler
   læser samme node
   ══════════════════════════════════════════════════════════════════════════ */
describe("Fleet, Facility og Procure læser samme fælles masterdata", () => {
  const PICKERE = [
    "src/fleet/Planlaegdialog.jsx",
    "src/moduler/facility/Servicedialog.jsx",
    "src/moduler/indkoeb/Oversigt.jsx",
    "src/moduler/indkoeb/Varelager.jsx",
    "src/moduler/indkoeb/Fakturaer.jsx",
  ];

  it("⚠ HVER PICKER FILTRERER PÅ aktiv !== false, MEN BEVARER DEN VALGTE HISTORISKE REFERENCE", () => {
    const mangler = [];
    for (const sti of PICKERE) {
      const kode = udenKommentarer(readFileSync(sti, "utf8"));
      if (!/\.filter\(\s*\(?\w+\)?\s*=>\s*\w+\.aktiv\s*!==\s*false/.test(kode)) {
        mangler.push(sti);
      }
    }
    assert.deepEqual(mangler, [],
      "picker(e) filtrerer ikke inaktive leverandører fra:\n  " + mangler.join("\n  "));
  });

  it("⚠ INGEN AF PICKERNE HAR EN hent: false-DÆMPER PÅ leverandoerer — base-noden må altid spørges", () => {
    /* Kilde-fixede filer der tidligere gated forespørgslen på et harProcure-
       flag (Vaerkstedskalender.jsx, Indberetninger.jsx) — den slags anti-
       mønster skal være væk fra HELE leverandørkæden. */
    for (const sti of [
      "src/moduler/flaade/Vaerkstedskalender.jsx",
      "src/moduler/flaade/Indberetninger.jsx",
      "src/moduler/facility/Servicekalender.jsx",
      ...PICKERE,
    ]) {
      const kode = udenKommentarer(readFileSync(sti, "utf8"));
      const kald = kode.match(/useListe\(\s*["'`]leverandoerer["'`][^)]*\)/);
      if (kald) {
        assert.ok(!/hent\s*:\s*harProcure/.test(kald[0]),
          `${sti}: leverandoerer-hentningen er stadig dæmpet med hent: harProcure`);
      }
    }
  });

  it("⚠ INGEN AF PICKERNE HAR ET EGET, HARDKODET LEVERANDØR-ARRAY VED SIDEN AF NODEN", () => {
    for (const sti of PICKERE) {
      const kode = udenKommentarer(readFileSync(sti, "utf8"));
      assert.ok(!/const\s+DEMO_LEVERANDOERER\w*\s*=\s*\[/.test(kode),
        `${sti} definerer sit eget leverandørsæt — det er en parallel kilde`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SCOPE — punkt 9: ingen upload/storage, ingen mail, ingen performance/rating,
   ingen CVR-integration, ingen bankoplysninger
   ══════════════════════════════════════════════════════════════════════════ */
describe("4B rører ikke det der eksplicit er udenfor scope", () => {
  it("⚠ INGEN Storage-REFERENCE I Leverandoerer.jsx", () => {
    const kode = readFileSync("src/moduler/indkoeb/Leverandoerer.jsx", "utf8");
    assert.ok(!/firebase\/storage|getStorage|uploadBytes/.test(kode));
  });

  it("⚠ INGEN MAIL-AFSENDELSE I Leverandoerer.jsx", () => {
    const kode = udenKommentarer(readFileSync("src/moduler/indkoeb/Leverandoerer.jsx", "utf8"));
    assert.ok(!/sendMail|nodemailer|mailgun/i.test(kode));
  });

  it("⚠ INGEN NYE stjerne-/rating-FELTER I CRUD-FORMULAREN", () => {
    const kode = readFileSync("src/moduler/indkoeb/Leverandoerer.jsx", "utf8");
    assert.ok(!/rating|stjerne|vurdering/i.test(kode));
  });

  it("⚠ INGEN CVR/VIRK-OPSLAG TILFØJET", () => {
    const kode = readFileSync("src/moduler/indkoeb/Leverandoerer.jsx", "utf8");
    assert.ok(!/virk\.dk|cvrapi|datacvr/i.test(kode));
  });

  it("⚠ INGEN BANKOPLYSNINGER I FELTSKEMAET", () => {
    const kode = readFileSync("src/fleet/leverandoerer.js", "utf8");
    assert.ok(!/bankkonto|iban|swift|regnr/i.test(kode));
  });
});
