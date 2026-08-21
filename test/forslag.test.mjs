/* test/forslag.test.mjs
 * Forslaget: at lave det, og at trække det tilbage — beslutning 58 og 59.
 *
 * ⚠ HVORFOR TILBAGETRÆKNINGEN FINDES: LOFTET VAR EN BLINDGYDE.
 *
 * Beslutning 58 satte loftet til tre og skrev i sin egen validering *"træk et
 * tilbage for at lave et nyt"* — og der var ingen vej tilbage. Værre: den
 * overgang koordinatoren bruger til at bede om NYE forslag (`afventerKoord →
 * returneret → afventerKoord`) kræver `kraeverForslag`, som de tre gamle
 * opfyldte. Etapen kunne altså gå frem og tilbage med de samme tre forslag i
 * al evighed.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  forslagListe, aktiveForslag, erTrukket, kanTraekkeForslag, traekOpdatering,
  valideForslag, forslagOpdatering, MAKS_FORSLAG, FORSLAGBARE_TILSTANDE,
} from "../src/fleet/booking-state.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const etape = (forslag = {}, o = {}) => ({
  id: "et-1", tilstand: "afventerPlan", forslag, ...o,
});

const F = (nr, o = {}) => ({
  nr, koeretoejIder: { "kt-1": true }, personId: "p-1",
  afhentningMs: 1, leveringMs: 2, ...o,
});

const nyt = { koeretoejIder: { "kt-1": true }, personId: "p-1",
              afhentningMs: 1, leveringMs: 2 };

/* ══════════════════════════════════════════════════════════════════════════
   FORMEN — nøglet, ikke en array
   ══════════════════════════════════════════════════════════════════════════ */

describe("Forslagene er nøglet på deres eget id", () => {
  /**
   * ⚠ RTDB HAR INGEN ARRAYS. Målt i DEV før rettelsen lå `et-004/forslag` med
   * nøglerne 0, 1, 2 og sit `id` INDE i objektet — en form regelfilens
   * `$andet: false` afviser, og som `valgtForslagId` aldrig kunne matche.
   * Nøglerne ville dertil FLYTTE SIG når et forslag blev trukket tilbage.
   */
  test("⚠ forslagListe GIVER id'ET FRA NØGLEN", () => {
    const l = forslagListe(etape({ "fs-b": F(2), "fs-a": F(1) }));
    assert.deepEqual(l.map((f) => f.id), ["fs-a", "fs-b"], "sorteres ikke på nr");
    assert.deepEqual(l.map((f) => f.nr), [1, 2]);
  });

  test("tåler en etape uden forslag", () => {
    assert.deepEqual(forslagListe(etape()), []);
    assert.deepEqual(forslagListe(null), []);
    assert.deepEqual(aktiveForslag(etape()), []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TILBAGETRÆKNINGEN
   ══════════════════════════════════════════════════════════════════════════ */

describe("At trække et forslag tilbage", () => {
  test("⚠ DET SLETTES IKKE — DET FÅR ET TIDSPUNKT OG ET uid", () => {
    const e = etape({ "fs-a": F(1) });
    const { opdatering } = traekOpdatering("et-1", "fs-a", e, { uid: "u-disp", nu: 4242 });
    assert.deepEqual(opdatering, {
      "etaper/et-1/forslag/fs-a/trukketMs": 4242,
      "etaper/et-1/forslag/fs-a/trukketAf": "u-disp",
    });
    /* Ingen sti sættes til null — det ville være en sletning. */
    assert.ok(!Object.values(opdatering).includes(null));
  });

  /**
   * ⚠ ET VALG DER PEGER PÅ NOGET TRUKKET, RYDDES. Ellers ville feltet blive
   * stående og se gyldigt ud — en godkendelse der ventede på at ske.
   * `etapeskift` afviser den også, men to spærringer i den rigtige rækkefølge
   * er bedre end én der først siger nej til sidst.
   */
  test("⚠ OG valgtForslagId RYDDES HVIS DEN PEGER PÅ DET", () => {
    const e = etape({ "fs-a": F(1) }, { valgtForslagId: "fs-a" });
    const { opdatering } = traekOpdatering("et-1", "fs-a", e, { uid: "u", nu: 1 });
    assert.equal(opdatering["etaper/et-1/valgtForslagId"], null);

    /* Peger valget på et ANDET forslag, røres det ikke. */
    const e2 = etape({ "fs-a": F(1), "fs-b": F(2) }, { valgtForslagId: "fs-b" });
    const { opdatering: o2 } = traekOpdatering("et-1", "fs-a", e2, { uid: "u", nu: 1 });
    assert.ok(!("etaper/et-1/valgtForslagId" in o2));
  });

  test("⚠ LOFTET TÆLLER DE AKTIVE — ellers er sætningen usand", () => {
    const fyldt = {};
    for (let i = 1; i <= MAKS_FORSLAG; i++) fyldt[`fs-${i}`] = F(i);
    assert.equal(valideForslag(nyt, etape(fyldt)).ok, false, "et fjerde slap ind");

    /* Træk ét tilbage — så er der plads igen. */
    fyldt["fs-1"] = F(1, { trukketMs: 9 });
    assert.equal(aktiveForslag(etape(fyldt)).length, MAKS_FORSLAG - 1);
    assert.equal(valideForslag(nyt, etape(fyldt)).ok, true,
      "der blev ikke plads efter en tilbagetrækning — blindgyden består");
  });

  /**
   * ⚠ NUMMERET GENBRUGES IKKE. Koordinatoren har måske set "forslag 2";
   * gav vi nummeret til et nyt, ville en samtale om forslag 2 pege på to
   * forskellige ting. Pladsen bliver ledig, nummeret gør ikke.
   */
  test("⚠ ET TRUKKET NUMMER GENBRUGES IKKE", () => {
    const e = etape({ "fs-1": F(1), "fs-2": F(2, { trukketMs: 9 }), "fs-3": F(3) });
    const { post } = forslagOpdatering("et-1", "fs-ny", nyt, e);
    assert.equal(post.nr, 4, "nummeret blev genbrugt fra et trukket forslag");
  });

  test("⚠ IKKE MENS KOORDINATOREN TAGER STILLING", () => {
    const e = etape({ "fs-a": F(1) }, { tilstand: "afventerKoord" });
    const svar = kanTraekkeForslag(e, "fs-a");
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /returneret/i);
    /* Og de tilstande der ER i orden, er de samme som der må skrives i. */
    for (const t of FORSLAGBARE_TILSTANDE) {
      assert.equal(kanTraekkeForslag(etape({ "fs-a": F(1) }, { tilstand: t }), "fs-a").ok,
        true, t);
    }
  });

  test("afviser et forslag der ikke findes, og et der allerede er trukket", () => {
    const e = etape({ "fs-a": F(1, { trukketMs: 9 }) });
    assert.equal(kanTraekkeForslag(e, "fs-x").ok, false);
    assert.equal(kanTraekkeForslag(e, "fs-a").ok, false);
    assert.match(kanTraekkeForslag(e, "fs-a").aarsag, /allerede/i);
    assert.equal(erTrukket(e.forslag["fs-a"]), true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   HÅNDHÆVELSEN
   ══════════════════════════════════════════════════════════════════════════ */

const kilde = readFileSync("functions/index.js", "utf8");
const blok = (navn) => {
  const start = kilde.indexOf(`export const ${navn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${navn}`);
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return udenKommentarer(naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste));
};

describe("Serveren håndhæver det samme", () => {
  test("forslagskriv tager begge handlinger — og kun dem", () => {
    const b = blok("forslagskriv");
    assert.ok(b.includes('["opret", "traek"].includes(handling)'));
    assert.ok(b.includes("kanTraekkeForslag("), "tilbagetrækningen prøves ikke");
    assert.ok(b.includes("traekOpdatering("), "opdateringen bygges ikke ét sted");
  });

  /**
   * ⚠ ET TRUKKET FORSLAG KAN IKKE GODKENDES.
   *
   * Reglen kan ikke hindre at `valgtForslagId` peger på et: en `.validate` ser
   * ét felt ad gangen. Uden tjekket i `etapeskift` kunne en godkendelse binde
   * en bil til et forslag disponenten havde taget tilbage.
   */
  test("⚠ etapeskift AFVISER ET TRUKKET FORSLAG", () => {
    const b = blok("etapeskift");
    assert.ok(b.includes("erTrukket(forslag)"), "et trukket forslag kan godkendes");
    assert.ok(b.includes("failed-precondition"));
  });

  test("⚠ OG REGLEN KENDER DE TO FELTER", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8").replace(/^\s*\/\/.*$/gm, "")
    ).rules;
    const f = regler.tenants.$tenantId.etaper.$etapeId.forslag.$forslagId;
    assert.ok(f.trukketMs, "trukketMs står ikke i reglerne");
    assert.ok(f.trukketAf, "trukketAf står ikke i reglerne");
    /* ⚠ $andet: false betyder at et felt der ikke står her, AFVISES — så en
       tilbagetrækning uden reglen ville være en post serveren skrev og reglen
       kalder ugyldig. */
    assert.equal(f.$andet[".validate"], false);
  });
});

describe("Skærmene", () => {
  test("⚠ ET TRUKKET FORSLAG KAN IKKE VÆLGES", () => {
    const s = udenKommentarer(readFileSync("src/moduler/booking/Forslag.jsx", "utf8"));
    assert.ok(s.includes("aktiveForslag("), "skærmen viser også de trukne som et valg");
  });

  test("⚠ OG DISPONENTEN HAR EN VEJ TILBAGE", () => {
    const s = udenKommentarer(readFileSync("src/moduler/booking/Disponering.jsx", "utf8"));
    assert.ok(s.includes("traekForslag("), "der er ingen knap til at trække et forslag");
    assert.ok(s.includes("kanTraekkeForslag("), "skærmen spørger ikke om det må");
    /* ⚠ OG "Foreslå tur" SPÆRRES VED LOFTET — med en grund, ikke bare grå. */
    assert.ok(s.includes("MAKS_FORSLAG"), "loftet vises ikke i skærmen");
  });
});
