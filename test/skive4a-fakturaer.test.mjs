/* test/skive4a-fakturaer.test.mjs
 * Skive 4A — Fælles Fakturaer & bilag + permission/ruting.
 *
 * ⚠ SAMME METODE SOM skive3d-sagmail.test.mjs: kildekode-inspektion mod
 * functions/index.js (samme funktion kan ikke sige to ting — screen VISER,
 * server HÅNDHÆVER), plus direkte prøver af permission-fordelingen og
 * navigationen. Ingen af dem kører mod en emulator — det gør rules.*-
 * suiten, som er den der bekræfter noden faktisk håndhæver det her.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PERM, ROLLE_PERMS, harPerm, permStrengFraRolle } from "../src/fleet/permissions.js";
import { NAV, REDIRECTS } from "../src/fleet/nav.js";

const kilde = readFileSync("functions/index.js", "utf8");
const REGELFIL = readFileSync("firebase.rules.json", "utf8")
  .replace(/^﻿/, "").replace(/^\s*\/\/.*$/gm, "");

const blokAf = (navn) => {
  const start = kilde.indexOf(`export const ${navn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${navn}`);
  const naeste = kilde.indexOf("\nexport const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
};

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* ══════════════════════════════════════════════════════════════════════════
   PERMISSION-MODELLEN — punkt 2
   ══════════════════════════════════════════════════════════════════════════ */
describe("fakturaer.laes/.skriv/.godkend — rollefordelingen", () => {
  const LAES = ["disponent", "koordinator", "lagermedarbejder", "revisor", "admin"];
  const SKRIV = ["disponent", "koordinator", "admin"];
  const GODKEND = ["koordinator", "admin"];

  it("⚠ FORDELINGEN ER IDENTISK MED DEN GAMLE indkoeb.*-FORDELING", () => {
    for (const rolle of Object.keys(ROLLE_PERMS)) {
      assert.equal(
        ROLLE_PERMS[rolle].includes(PERM.fakturaerLaes), LAES.includes(rolle),
        `${rolle}: fakturaerLaes stemmer ikke med indkoebLaes-fordelingen`);
      assert.equal(
        ROLLE_PERMS[rolle].includes(PERM.fakturaerSkriv), SKRIV.includes(rolle),
        `${rolle}: fakturaerSkriv stemmer ikke med indkoebSkriv-fordelingen`);
      assert.equal(
        ROLLE_PERMS[rolle].includes(PERM.fakturaerGodkend), GODKEND.includes(rolle),
        `${rolle}: fakturaerGodkend stemmer ikke med indkoebGodkend-fordelingen`);
    }
  });

  it("⚠ CHAUFFØREN HAR INGEN AF DE TRE", () => {
    for (const perm of [PERM.fakturaerLaes, PERM.fakturaerSkriv, PERM.fakturaerGodkend]) {
      assert.ok(!ROLLE_PERMS.chauffoer.includes(perm), `chaufføren har ${perm}`);
    }
  });

  it("⚠ INGEN AF DE TRE HAVES AF ALLE SYV ROLLER — ellers spærrer den for ingen", () => {
    const roller = Object.keys(ROLLE_PERMS);
    for (const perm of [PERM.fakturaerLaes, PERM.fakturaerSkriv, PERM.fakturaerGodkend]) {
      const har = roller.filter((r) => ROLLE_PERMS[r].includes(perm));
      assert.ok(har.length > 0 && har.length < roller.length, `${perm}: ${har.length}/${roller.length}`);
    }
  });

  it("⚠ indkoeb.laes ALENE GIVER IKKE fakturaer.laes — de to permissions er uafhængige", () => {
    /* harPerm() tjekker den EKSAKTE streng — en rolle med kun indkoebLaes i
       sit perms-token må ikke kunne læse fakturaer via den. */
    const perms = `|${PERM.indkoebLaes}|`;
    assert.ok(harPerm(perms, PERM.indkoebLaes));
    assert.ok(!harPerm(perms, PERM.fakturaerLaes),
      "et perms-token med kun indkoeb.laes matcher fakturaer.laes — de er ikke uafhængige");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RTDB-REGLEN — fakturaer/.read
   ══════════════════════════════════════════════════════════════════════════ */
describe("fakturaer-nodens .read kræver fakturaer.laes", () => {
  const i = REGELFIL.indexOf('"fakturaer": {');
  const blok = REGELFIL.slice(i, i + 30000);

  it("⚠ REGLEN NÆVNER fakturaer.laes", () => {
    assert.match(blok, /perms\.contains\('\|fakturaer\.laes\|'\)/);
  });

  it("⚠ REGLEN KRÆVER FORTSAT TENANT-MEDLEMSKAB — permissionen erstatter ikke isolationen", () => {
    assert.match(blok, /auth\.token\.tenant === \$tenantId/);
  });

  it("⚠ INGEN MODULKLAUSUL — uændret, tre skærme rører noden", () => {
    assert.ok(!/moduler'\)\.child\('indkoeb'\)/.test(blok),
      "fakturaer har fået en modulklausul — det ville spærre en af de tre forbrugere");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   CLOUD FUNCTIONS — fakturamatch, fakturadestination, fakturastatus
   ══════════════════════════════════════════════════════════════════════════ */
describe("De tre faktura-funktioner kræver fakturaer.*, ikke indkoeb.*", () => {
  it("⚠ fakturamatch KRÆVER fakturaer.skriv", () => {
    const b = udenKommentarer(blokAf("fakturamatch"));
    assert.match(b, /perm:\s*"fakturaer\.skriv"/);
    assert.ok(!/perm:\s*"indkoeb\.skriv"/.test(b), "fakturamatch kræver stadig indkoeb.skriv");
  });

  it("⚠ fakturadestination KRÆVER fakturaer.skriv — den var permission-fri", () => {
    const b = udenKommentarer(blokAf("fakturadestination"));
    assert.match(b, /perm:\s*"fakturaer\.skriv"/);
  });

  it("⚠ fakturastatus's GODKEND/AFVIS-GREN KRÆVER fakturaer.godkend", () => {
    const b = udenKommentarer(blokAf("fakturastatus"));
    assert.match(b, /PERM\.fakturaerGodkend/);
    assert.ok(!/PERM\.indkoebGodkend/.test(b), "fakturastatus nævner stadig indkoebGodkend");
  });

  it("⚠ fakturastatus's BOGFØR-GREN KRÆVER NU OGSÅ EN PERMISSION — den var helt åben", () => {
    const b = udenKommentarer(blokAf("fakturastatus"));
    const bogfoerStart = b.indexOf('til === "bogfoert"');
    const godkendStart = b.indexOf("} else {", bogfoerStart);
    assert.ok(bogfoerStart >= 0 && godkendStart > bogfoerStart, "bogfør-grenen blev ikke fundet");
    const bogfoerBlok = b.slice(bogfoerStart, godkendStart);
    assert.match(bogfoerBlok, /PERM\.fakturaerSkriv/,
      "bogfør-overgangen kræver stadig ingen permission");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KANONISK RUTE — punkt 3
   ══════════════════════════════════════════════════════════════════════════ */
describe("Fakturaer & bilag er den ene kanoniske overflade", () => {
  it("⚠ NAV-PUNKTET KRÆVER fakturaer.laes, IKKE indkoeb.laes", () => {
    const punkt = NAV.find((m) => m.key === "fakturacenter");
    assert.ok(punkt, "fakturacenter findes ikke i NAV");
    assert.equal(punkt.kraeverPerm, "fakturaer.laes");
    assert.equal(punkt.sti, "/oekonomi/fakturacenter",
      "ruten blev omdøbt — det var et bevidst fravalg i 4A");
  });

  it("⚠ RUTEN ER IKKE OMDØBT — ingen ny REDIRECTS-indgang for den", () => {
    assert.ok(!REDIRECTS.some((r) => r.fra === "/fakturaer" || r.til === "/fakturaer"),
      "der er tilføjet en /fakturaer-redirect — 4A besluttede at UDSKYDE omdøbningen");
  });

  it("⚠ PROCURES EGET PUNKT ER RELABELT OG PEGER STADIG PÅ /indkoeb/fakturaer", () => {
    const gruppe = NAV.find((m) => m.key === "indkoeb");
    const punkt = gruppe?.born?.find((b) => b.key === "fakturaer");
    assert.ok(punkt, "indkoeb.fakturaer findes ikke");
    assert.equal(punkt.sti, "/indkoeb/fakturaer");
    assert.ok(!/^Fakturaer, match/.test(punkt.label),
      "Procures punkt hedder stadig 'Fakturaer, match & kontantkøb' — den fulde titel hører nu til det fælles Fakturacenter");
  });

  it("⚠ INGEN DUPLIKERET FAKTURATABEL I Procures skærm", () => {
    const skaerm = udenKommentarer(
      readFileSync("src/moduler/indkoeb/Fakturaer.jsx", "utf8"));
    /* Godkend/afvis/bogfør-knapperne der duplikerede Fakturacenteret. */
    assert.ok(!/paaSkift\("godkendt"\)/.test(skaerm),
      "Fakturaer.jsx har stadig en godkend-handling — duplikerer Fakturacenteret");
    assert.ok(!/demoAfstemning\(/.test(skaerm),
      "Fakturaer.jsx viser stadig Afstemning — en permanent demo uden ægte kilde");
    /* Men den linker til det kanoniske sted. */
    assert.match(skaerm, /oekonomi\/fakturacenter\?destination=procure/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   FILTRERET KONTEKST — punkt 4
   ══════════════════════════════════════════════════════════════════════════ */
describe("Fakturacenter v1 bruger kun lokal prototypekontekst", () => {
  it("⚠ PROTOTYPEN LÆSER IKKE QUERY ELLER EKSTERNE DATA", () => {
    const skaerm = udenKommentarer(
      readFileSync("src/moduler/oekonomi/Fakturacenter.jsx", "utf8"));
    assert.doesNotMatch(skaerm, /useSearchParams|params\.get\("destination"\)/);
    assert.match(skaerm, /FAKTURACENTER_PROTOTYPE/);
    assert.match(skaerm, /eksterneKald:\s*false/);
  });

  it("⚠ PROTOTYPEN KAN IKKE OMGÅ EN GATE MED SIN EGEN LÆSNING", () => {
    const skaerm = udenKommentarer(
      readFileSync("src/moduler/oekonomi/Fakturacenter.jsx", "utf8"));
    assert.doesNotMatch(skaerm, /useListe\(|usePost\(|from ["']firebase|httpsCallable/i);
    assert.match(skaerm, /DEMO_FAKTURACENTER_SCENARIER/);
  });

  it("⚠ Modulfakturaer.jsx LINKER MED ?destination=<art>, IKKE UFILTRERET", () => {
    const skaerm = udenKommentarer(
      readFileSync("src/fleet/Modulfakturaer.jsx", "utf8"));
    assert.match(skaerm, /\/oekonomi\/fakturacenter\?destination=\$\{art\}/);
    assert.ok(!/to="\/oekonomi\/fakturacenter"/.test(skaerm),
      "et link mangler stadig filteret");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   GODKENDELSESMOTOREN GENBRUGES — punkt 6
   ══════════════════════════════════════════════════════════════════════════ */
describe("Ingen ny godkendelsesmodel — samme godkendelsesregler-node", () => {
  it("⚠ fakturastatus LÆSER STADIG DEN SAMME godkendelsesregler-NODE", () => {
    const b = udenKommentarer(blokAf("fakturastatus"));
    assert.match(b, /rod\.child\("godkendelsesregler"\)/);
    assert.match(b, /regler\.fakturagodkendelse/);
  });

  it("⚠ INGEN NY approval-NODE I REGELFILEN", () => {
    assert.ok(!/"fakturaGodkendelser"|"fakturaApproval"|"approvalFlow"/.test(REGELFIL),
      "der er tilføjet en ny godkendelses-node — genbrug godkendelsesregler i stedet");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SCOPE — punkt 8: ingen upload/storage, ingen leverandør-CRUD, ingen mail
   ══════════════════════════════════════════════════════════════════════════ */
describe("4A rører ikke det der eksplicit er udenfor scope", () => {
  it("⚠ INGEN Storage-REFERENCE I FAKTURASKÆRMENE", () => {
    for (const sti of [
      "src/moduler/oekonomi/Fakturacenter.jsx",
      "src/moduler/indkoeb/Fakturaer.jsx",
      "src/fleet/Modulfakturaer.jsx",
    ]) {
      const kode = readFileSync(sti, "utf8");
      assert.ok(!/firebase\/storage|getStorage|uploadBytes/.test(kode), `${sti} refererer Storage`);
    }
  });

  it("⚠ INGEN NY leverandoer-SKRIVEFUNKTION I functions/index.js", () => {
    assert.ok(!/export const leverandoerskriv|export const leverandoerOpret/.test(kilde),
      "en leverandør-CRUD-funktion er tilføjet — det er Skive 4B's opgave");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   PERMSTRENGFRAROLLE — sanity: den nye familie er faktisk en del af strengen
   ══════════════════════════════════════════════════════════════════════════ */
describe("permStrengFraRolle bærer de nye permissions", () => {
  it("⚠ ADMIN HAR ALLE TRE I SIN PERMS-STRENG", () => {
    const perms = permStrengFraRolle("admin");
    for (const perm of [PERM.fakturaerLaes, PERM.fakturaerSkriv, PERM.fakturaerGodkend]) {
      assert.ok(perms.includes(`|${perm}|`), `admin-strengen mangler ${perm}`);
    }
  });

  it("⚠ CHAUFFØRENS STRENG HAR INGEN AF DEM", () => {
    const perms = permStrengFraRolle("chauffoer");
    for (const perm of [PERM.fakturaerLaes, PERM.fakturaerSkriv, PERM.fakturaerGodkend]) {
      assert.ok(!perms.includes(`|${perm}|`), `chaufførens streng har ${perm}`);
    }
  });
});
