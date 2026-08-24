/* test/retention-regler.test.mjs
 * Beslutning 115 — retention pr. datatype, ikke-destruktiv grundmekanisme.
 *
 * Filen prøver tre ting: at kategorierne er en liste man kan stole på (intet
 * gættet tal, ingen kategori uden en node der findes — eller en begrundelse
 * for hvorfor den ikke gør), at legal hold og dry-run regner rigtigt, og —
 * vigtigst — at dry-run ALDRIG rører de poster den bliver bedt om at
 * vurdere. Se noten i retention-regler.js.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  RETENTION_KATEGORI, BACKUP_POLICY, erUndtaget, simulerRetention, periodeFor,
  anonymiser, eksporterFoerSletning, slet,
} from "../src/fleet/retention-regler.js";

describe("⚠ INGEN TAL ER GÆTTET", () => {
  it("hver kategori har periodeMaaneder: null og afgjort: false", () => {
    for (const [navn, k] of Object.entries(RETENTION_KATEGORI)) {
      assert.equal(k.periodeMaaneder, null, `${navn} har et tal — det må ikke være sat endnu`);
      assert.equal(k.afgjort, false, `${navn} siger afgjort, men ingen jurist har svaret`);
    }
    assert.equal(BACKUP_POLICY.periodeMaaneder, null);
    assert.equal(BACKUP_POLICY.afgjort, false);
  });

  it("hver kategori har en metode, et princip og et eksempel — ikke bare et navn", () => {
    for (const [navn, k] of Object.entries(RETENTION_KATEGORI)) {
      assert.ok(["anonymiser", "slet", "eksport-foerst"].includes(k.metode),
        `${navn} har en ukendt metode: "${k.metode}"`);
      assert.ok(k.princip?.length > 10, `${navn} har intet rigtigt princip`);
      assert.ok(Array.isArray(k.noder), `${navn} mangler en nodeliste (kan være tom)`);
    }
  });

  /* ⚠ EN KATEGORI DER IKKE ER BYGGET, HAR INGEN NODER. Modsat ville
     rapporten (retentionDryRun) forsøge at læse en node der ikke findes,
     og fejle på en måde der ligner en driftsfejl frem for "spørg ikke om
     dette endnu". */
  it("⚠ EN UBYGGET KATEGORI HAR EN TOM NODELISTE", () => {
    for (const [navn, k] of Object.entries(RETENTION_KATEGORI)) {
      if (!k.bygget) {
        assert.deepEqual(k.noder, [], `${navn} er markeret ikke-bygget, men har noder alligevel`);
      }
    }
  });

  it("auditlog-kategorien henviser til den eksisterende mekanisme, dupliker den ikke", () => {
    assert.ok(RETENTION_KATEGORI.auditlog.henvisning, "auditlog mangler en henvisning");
  });
});

describe("Legal hold", () => {
  const holds = [
    { objekt: "bookinger", objektId: "bkg-1", ophaevetMs: null },
    { objekt: "bookinger", objektId: "bkg-2", ophaevetMs: 12345 },
  ];

  it("et objekt med et AKTIVT hold er undtaget", () => {
    assert.equal(erUndtaget("bookinger", "bkg-1", holds), true);
  });

  it("⚠ ET OPHÆVET HOLD TÆLLER IKKE MED", () => {
    assert.equal(erUndtaget("bookinger", "bkg-2", holds), false);
  });

  it("et objekt uden noget hold er ikke undtaget", () => {
    assert.equal(erUndtaget("bookinger", "bkg-3", holds), false);
  });

  it("holdet er specifikt for objekt+objektId, ikke bare objektId", () => {
    assert.equal(erUndtaget("etaper", "bkg-1", holds), false);
  });

  it("tom eller manglende holdliste undtager ingenting", () => {
    assert.equal(erUndtaget("bookinger", "bkg-1", []), false);
    assert.equal(erUndtaget("bookinger", "bkg-1", undefined), false);
  });
});

describe("simulerRetention — ren simulering, ingen mutation", () => {
  const NU = Date.UTC(2026, 7, 24);
  const MAANED = 30.44 * 86400000;

  const poster = () => [
    { id: "a", oprettetMs: NU - 40 * MAANED },  // ældre end 36 mdr.
    { id: "b", oprettetMs: NU - 10 * MAANED },  // for ung
    { id: "c", oprettetMs: NU - 37 * MAANED },  // ældre, men undtaget af hold
    { id: "d" },                                 // intet tidsfelt
  ];

  it("deler posterne i paavirkede / forUngeEndnu / undtagetAfHold", () => {
    const holds = [{ objekt: "bookinger", objektId: "c", ophaevetMs: null }];
    const svar = simulerRetention("bookinger", poster(), { periodeMaaneder: 36 }, holds, NU);
    assert.deepEqual(svar.paavirkede.map((p) => p.id), ["a"]);
    assert.deepEqual(svar.undtagetAfHold.map((p) => p.id), ["c"]);
    assert.deepEqual(svar.forUngeEndnu.map((p) => p.id), ["b"]);
  });

  it("⚠ EN POST UDEN TIDSFELT SPRINGES OVER, DEN GÆTTES IKKE", () => {
    const svar = simulerRetention("bookinger", poster(), { periodeMaaneder: 36 }, [], NU);
    const alle = [...svar.paavirkede, ...svar.undtagetAfHold, ...svar.forUngeEndnu].map((p) => p.id);
    assert.ok(!alle.includes("d"), "posten uden tidsfelt blev alligevel klassificeret");
  });

  /* ⚠ DEN VIGTIGSTE PRØVE I FILEN. Simuleringen kaldes "dry-run" fordi den
     IKKE må ændre noget — hverken input-arrayet, dets objekter, eller nogen
     global tilstand. */
  it("⚠ MUTERER ALDRIG poster-ARRAYET ELLER DETS OBJEKTER", () => {
    const original = poster();
    const kopi = JSON.parse(JSON.stringify(original));
    simulerRetention("bookinger", original, { periodeMaaneder: 36 }, [], NU);
    assert.deepEqual(original, kopi, "poster blev ændret af en funktion der hedder simulér");
  });

  it("⚠ periodeMaaneder ER EN HYPOTESE — et ikke-positivt tal afvises", () => {
    assert.throws(() => simulerRetention("bookinger", poster(), { periodeMaaneder: 0 }, [], NU));
    assert.throws(() => simulerRetention("bookinger", poster(), { periodeMaaneder: -5 }, [], NU));
    assert.throws(() => simulerRetention("bookinger", poster(), {}, [], NU));
  });

  it("respekterer et andet tidsfelt end oprettetMs", () => {
    const p = [{ id: "x", sidsteBeskedMs: NU - 40 * MAANED }];
    const svar = simulerRetention("sager", p, { periodeMaaneder: 36, tidsfelt: "sidsteBeskedMs" }, [], NU);
    assert.deepEqual(svar.paavirkede.map((r) => r.id), ["x"]);
  });
});

describe("periodeFor — kundespecifik overstyring, hvor den findes", () => {
  it("bruger platformens (endnu ikke afgjorte) standard, hvis der ingen overstyring er", () => {
    assert.equal(periodeFor("bookingTransport", {}), null);
  });

  it("bruger tenantens overstyring, hvis den er sat", () => {
    assert.equal(periodeFor("bookingTransport", { bookingTransport: 36 }), 36);
  });

  it("en ukendt kategori giver null, ikke en fejl", () => {
    assert.equal(periodeFor("findes-ikke", {}), null);
  });
});

describe("⚠ HOOKS — kaster, gør ingenting stille", () => {
  it("anonymiser(), eksporterFoerSletning() og slet() kaster alle", () => {
    assert.throws(() => anonymiser(), /ikke bygget/);
    assert.throws(() => eksporterFoerSletning(), /ikke bygget/);
    assert.throws(() => slet(), /ikke bygget/);
  });
});
