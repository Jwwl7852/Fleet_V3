/* test/abonnementhistorik.test.mjs
 * Abonnementshistorikken — hændelsesloggen, ikke faktureringsgrundlaget.
 *
 * ⚠ HVAD PRØVEN BÆRER, OG HVAD DEN IKKE KAN.
 *
 * Noden er `.write: false`, så en regelprøve kan kun måle at vejen er lukket
 * — ikke at en post har den rigtige form. Formen håndhæves af
 * `valideHistorikpost()`, som Cloud Functions kalder, fordi Admin SDK går
 * uden om både `.write` og `.validate`. Samme arbejdsdeling som
 * `valideOpgaveplan()` på `opgaver` (beslutning 45).
 *
 * Se beslutning 89.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ALLE_HISTORIK_ARTER, HISTORIK_FELTER,
  historikposter, valideHistorikpost, historiktekst, historikListe,
} from "../src/fleet/abonnement.js";
import { ALLE_MODULER } from "../src/fleet/moduler.js";

const AF = "ejer1";
const MS = 1_760_000_000_000;
const grund = { afUid: AF, ms: MS };

describe("Posterne udledes af FORSKELLEN, ikke af kaldet", () => {
  /**
   * ⚠ DEN VIGTIGSTE PRØVE I FILEN. Ejerkonsollen sender hele modulsættet hver
   * gang der trykkes Gem. Loggede vi kaldet, ville der stå en post hver gang
   * nogen kiggede og gemte igen — og en log fuld af hændelser der ikke skete,
   * kan ikke bruges til at forklare en faktura.
   */
  it("⚠ ET GEM UDEN ÆNDRING GIVER INGEN POST", () => {
    const moduler = { flaade: true, booking: true };
    assert.deepEqual(
      historikposter({ foer: { moduler }, efter: { moduler: { ...moduler } }, ...grund }),
      []);
  });

  it("⚠ ET TILVALG OG ET FRAVALG ER TO POSTER, IKKE ÉN ÆNDRING", () => {
    const poster = historikposter({
      foer: { moduler: { flaade: true, facility: true } },
      efter: { moduler: { flaade: true, warehouse: true } },
      ...grund,
    });
    assert.deepEqual(poster, [
      { ms: MS, afUid: AF, art: "modul", modul: "facility", til: false },
      { ms: MS, afUid: AF, art: "modul", modul: "warehouse", til: true },
    ]);
  });

  /**
   * ⚠ `false` OG `undefined` ER DET SAMME HER, og det er med vilje.
   * `modulsaet()` skriver kun `true`, men et fravalgt modul kan stå som
   * `false` i en ældre node. Læste vi de to forskelligt, ville en oprydning
   * af noden se ud som et fravalg der aldrig skete.
   */
  it("et modul der står som false, er ikke et fravalg", () => {
    assert.deepEqual(historikposter({
      foer: { moduler: { flaade: true, facility: false } },
      efter: { moduler: { flaade: true } },
      ...grund,
    }), []);
  });

  it("moduler der ikke sendes med, giver ingen poster", () => {
    /* kundestatus rører ikke modulerne. Gav et fraværende `efter.moduler`
       poster, ville hver pause fravælge hele kundens abonnement i loggen. */
    assert.deepEqual(historikposter({
      foer: { moduler: { flaade: true }, status: "aktiv" },
      efter: { status: "paused" },
      ...grund,
    }), [{ ms: MS, afUid: AF, art: "status", status: "paused" }]);
  });

  it("statusskiftet bærer sin årsag, og kun når der er en", () => {
    assert.deepEqual(historikposter({
      foer: { status: "aktiv" },
      efter: { status: "paused", aarsag: "betaling" },
      ...grund,
    }), [{ ms: MS, afUid: AF, art: "status", status: "paused", aarsag: "betaling" }]);

    const genaabnet = historikposter({
      foer: { status: "paused", aarsag: "betaling" },
      efter: { status: "aktiv", aarsag: null },
      ...grund,
    });
    assert.equal(genaabnet.length, 1);
    assert.ok(!("aarsag" in genaabnet[0]),
      "en genåbning uden årsag må ikke bære et tomt felt — det ser ud som et felt der mangler");
  });

  /**
   * ⚠ EN RETTET ÅRSAG ER OGSÅ EN HÆNDELSE. Sættes en kunde på pause med
   * `betaling` og rettes årsagen bagefter, ville en log der kun så på
   * statussen stå med den forkerte grund for altid — og det er netop det
   * spørgsmål loggen findes for at besvare.
   */
  it("⚠ EN RETTET ÅRSAG GIVER EN POST, SELVOM STATUSSEN ER DEN SAMME", () => {
    assert.deepEqual(historikposter({
      foer: { status: "paused", aarsag: "betaling" },
      efter: { status: "paused", aarsag: "kundeoensket" },
      ...grund,
    }), [{ ms: MS, afUid: AF, art: "status", status: "paused", aarsag: "kundeoensket" }]);
  });

  /**
   * ⚠ RABATTEN ER DEN ENE ÆNDRING MÅLINGERNE IKKE KAN SE.
   *
   * `maaldagligt` skriver status, moduler, brugere og køretøjer — ikke
   * rabatten. Og `linjerForPeriode()` får ÉN `rabatBps` for hele perioden,
   * nemlig den der står når grundlaget genereres: en rabat sat den 20.
   * prissætter også de nitten dage der allerede er gået.
   */
  it("⚠ ET RABATSKIFT BÆRER BÅDE FØR OG EFTER", () => {
    assert.deepEqual(historikposter({
      foer: { rabatBps: 0 }, efter: { rabatBps: 1500 }, ...grund,
    }), [{ ms: MS, afUid: AF, art: "rabat", rabatBps: 1500, foerBps: 0 }]);
  });

  it("en rabat pr. modul bærer sit modul — det er den eneste forskel", () => {
    assert.deepEqual(historikposter({
      foer: { rabatModulBps: {} },
      efter: { rabatModulBps: { warehouse: 1000 } },
      ...grund,
    }), [{ ms: MS, afUid: AF, art: "rabat", modul: "warehouse", rabatBps: 1000, foerBps: 0 }]);
  });

  it("⚠ EN NULSTILLING ER EN ÆNDRING TIL NUL, IKKE EN POST DER UDEBLIVER", () => {
    /* kundeabonnement gemmer ikke et nul (en node fuld af nuller ville se ud
       som aftaler der ikke findes), så en fjernet rabat kommer som `null`.
       Uden posten kunne man ikke se hvornår rabatten holdt op. */
    assert.deepEqual(historikposter({
      foer: { rabatModulBps: { warehouse: 1000 } },
      efter: { rabatModulBps: null },
      ...grund,
    }), [{ ms: MS, afUid: AF, art: "rabat", modul: "warehouse", rabatBps: 0, foerBps: 1000 }]);
  });

  it("et kald der ikke rører rabatten, giver ingen rabatpost", () => {
    assert.deepEqual(historikposter({
      foer: { rabatBps: 1500 }, efter: { interval: "maaned" }, ...grund,
    }), []);
  });

  it("oprettelsen giver udgangspunktet — ellers kan første tilstand ikke ses", () => {
    const poster = historikposter({
      foer: {},
      efter: { moduler: { dashboard: true, flaade: true }, status: "aktiv" },
      ...grund,
    });
    assert.equal(poster.filter((p) => p.art === "modul").length, 2);
    assert.equal(poster.filter((p) => p.art === "status").length, 1);
  });
});

describe("Formen håndhæves i funktionen — reglen kan ikke nå den", () => {
  it("en gyldig post af hver art går igennem", () => {
    const gyldige = [
      { ...grund, art: "modul", modul: "flaade", til: true },
      { ...grund, art: "status", status: "paused", aarsag: "betaling" },
      { ...grund, art: "rabat", rabatBps: 1500, foerBps: 0 },
    ];
    for (const p of gyldige) {
      assert.deepEqual(valideHistorikpost(p, { kendteModuler: ALLE_MODULER }), []);
    }
    assert.equal(gyldige.length, ALLE_HISTORIK_ARTER.length,
      "der er en art uden et gyldigt eksempel her");
  });

  it("⚠ ET UKENDT FELT AFVISES — som $andet: false i reglen", () => {
    const fejl = valideHistorikpost(
      { ...grund, art: "modul", modul: "flaade", til: true, note: "fordi Jørn sagde det" },
      { kendteModuler: ALLE_MODULER });
    assert.ok(fejl.some((f) => f.includes("note")),
      "fritekst skal afvises — allowlisten findes for at holde tastet tekst ude");
  });

  it("et ukendt modul, en ukendt status og en ukendt årsag afvises", () => {
    const k = { kendteModuler: ALLE_MODULER };
    assert.ok(valideHistorikpost({ ...grund, art: "modul", modul: "turtle", til: true }, k).length);
    assert.ok(valideHistorikpost({ ...grund, art: "status", status: "spaerret" }, k).length);
    assert.ok(valideHistorikpost(
      { ...grund, art: "status", status: "paused", aarsag: "irriterende" }, k).length);
  });

  it("rabatten skal være heltal i basispoint mellem 0 og 10000", () => {
    for (const bps of [15.5, -1, 10001, "1500"]) {
      assert.ok(valideHistorikpost({ ...grund, art: "rabat", rabatBps: bps, foerBps: 0 }).length,
        `${bps} skulle være afvist`);
    }
  });

  it("ms og afUid er obligatoriske — en post uden aktør forklarer ingenting", () => {
    assert.ok(valideHistorikpost({ ms: MS, art: "status", status: "aktiv" }).length);
    assert.ok(valideHistorikpost({ afUid: AF, art: "status", status: "aktiv" }).length);
  });

  /**
   * Reglens `$andet: false` og `HISTORIK_FELTER` er den samme allowliste to
   * steder. Driver de fra hinanden, afviser den ene præcis det den anden
   * tillader — og fejlen ses først når en post forsvinder i skrivningen.
   */
  it("⚠ ALLOWLISTEN ER DEN SAMME I REGLEN OG I KODEN", () => {
    const raa = readFileSync("firebase.rules.json", "utf8")
      .replace(/^﻿/, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const post = JSON.parse(raa).rules.tenants.$tenantId.abonnementHistorik.$postId;
    const iReglen = Object.keys(post).filter((k) => !k.startsWith(".") && k !== "$andet");

    assert.deepEqual(iReglen.sort(), [...HISTORIK_FELTER].sort(),
      "reglen og HISTORIK_FELTER kender ikke de samme felter.");
    assert.equal(post.$andet?.[".validate"], false,
      "uden $andet: false kan et ukendt felt skrives af en fremtidig vej ind.");
  });
});

describe("Vejen ind er lukket, og der er ingen sletning", () => {
  const REGLER = JSON.parse(
    readFileSync("firebase.rules.json", "utf8")
      .replace(/^﻿/, "").replace(/^\s*\/\/.*$/gm, "")).rules;
  const NODE = REGLER.tenants.$tenantId.abonnementHistorik;

  it("⚠ .write: false — som opgaver (45), kasseudlaan (37) og roller (31b)", () => {
    assert.equal(NODE[".write"], false,
      "en append-only log som en klient kunne skrive i, kunne også rettes i: "
      + ".write kaskaderer, så en tilladelse på noden ville give hver post med.");
  });

  it("⚠ KUN UDBYDEREN LÆSER DEN — ikke kunden", () => {
    assert.ok(NODE[".read"].includes("auth.token.udbyder"));
    assert.ok(!NODE[".read"].includes("auth.token.tenant"),
      "`aarsag` står i posten, og hvorfor kunden er lukket, hører i en samtale "
      + "— ikke i en skærm han selv kan åbne.");
  });

  it("⚠ INGEN FUNKTION SLETTER I LOGGEN", () => {
    const kode = readFileSync("functions/index.js", "utf8");
    const linjer = kode.split("\n")
      .filter((l) => l.includes("abonnementHistorik"))
      .filter((l) => l.includes("remove(") || l.includes("set(null)"));
    assert.deepEqual(linjer, [],
      "en log man skal kunne forklare en faktura med, må ikke kunne ryddes.");
  });
});

/**
 * ⚠ DEN HER ER GRUNDEN TIL AT HISTORIKKEN SER UD SOM DEN GØR.
 *
 * ABONNEMENT.md beskrev historikken som det der skulle gøre en delvis måned
 * fakturerbar. Det spørgsmål blev besvaret et andet sted i mellemtiden:
 * `maaldagligt` skriver `udbyder/maalinger/<kunde>/<dato>`, og
 * `sammenfatMaalinger()` regner `moduldage` og `dageFaktureres` af dem.
 *
 * Bliver historikken en ANDEN kilde til det samme tal, driver de to fra
 * hinanden — og så skal nogen afgøre hvilken der havde ret om en faktura der
 * allerede er sendt. Det er `bemanding.ledig` (beslutning 71) med penge på.
 */
describe("Historikken er ikke faktureringsgrundlaget", () => {
  it("⚠ HVERKEN priser.js ELLER GENERATOREN LÆSER DEN", () => {
    const fund = [];
    for (const fil of ["src/fleet/priser.js", "functions/index.js"]) {
      const kode = readFileSync(fil, "utf8");
      const iKode = kode.split("\n")
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => l.includes("abonnementHistorik"))
        /* Kommentarer forklarer netop hvorfor den IKKE bruges. */
        .filter(([, l]) => !l.trimStart().startsWith("//")
                        && !l.trimStart().startsWith("*")
                        && !l.trimStart().startsWith("/*"));
      /* I functions/index.js SKRIVES den — af medHistorik og de fire veje ind.
         Det der ikke må ske, er at generatoren LÆSER den. */
      for (const [nr, l] of iKode) {
        if (l.includes("once(") || l.includes("historikForPeriode")) {
          fund.push(`${fil}:${nr} ${l.trim()}`);
        }
      }
    }
    assert.deepEqual(fund, [],
      "regningen tælles i målingerne. To kilder til samme tal driver.\n  "
      + fund.join("\n  "));
  });

  it("byggKundegrundlag tager ikke historikken ind", () => {
    const kode = readFileSync("functions/index.js", "utf8");
    const start = kode.indexOf("function byggKundegrundlag(");
    assert.ok(start > 0, "fandt ikke byggKundegrundlag");
    const signatur = kode.slice(start, kode.indexOf(")", start));
    assert.ok(!signatur.includes("historik"),
      "grundlaget regnes af målingerne, prislisten og abonnementet — ikke af loggen.");
  });
});

describe("Teksten på skærmen", () => {
  it("siger hvad der skete, i klar tekst", () => {
    assert.equal(
      historiktekst({ art: "modul", modul: "warehouse", til: true }),
      "warehouse blev tilvalgt");
    assert.equal(
      historiktekst({ art: "status", status: "paused", aarsag: "betaling" }),
      "På pause — Manglende betaling");
    assert.equal(
      historiktekst({ art: "rabat", rabatBps: 1500, foerBps: 0 }),
      "Rabat: 0 % → 15 %");
    assert.equal(
      historiktekst({ art: "rabat", modul: "flaade", rabatBps: 0, foerBps: 1000 }),
      "Rabat på flaade: 10 % → 0 %");
  });

  it("⚠ EN GENÅBNING UDEN ÅRSAG FÅR INGEN TOM PARENTES", () => {
    assert.equal(historiktekst({ art: "status", status: "aktiv" }), "Aktiv");
  });

  it("listen er nyeste først", () => {
    const liste = historikListe({
      a: { ms: 1, art: "status", status: "aktiv" },
      b: { ms: 3, art: "status", status: "paused" },
      c: { ms: 2, art: "status", status: "aktiv" },
    });
    assert.deepEqual(liste.map((p) => p.id), ["b", "c", "a"]);
  });

  it("en tom node giver en tom liste — ikke et kast", () => {
    assert.deepEqual(historikListe(null), []);
    assert.deepEqual(historikListe(undefined), []);
  });
});
