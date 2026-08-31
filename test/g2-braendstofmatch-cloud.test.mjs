/* test/g2-braendstofmatch-cloud.test.mjs
 * G.2 — Brændstofmatch. Samme metode som f2-opgavedokumenter-cloud.
 * test.mjs: kildekode-inspektion mod functions/index.js (batch-adfærden
 * kan ikke prøves i en emulator uden en rigtig Cloud Functions-kørsel)
 * plus direkte prøver af genbrug og audit-allowlisten.
 * test/rules.braendstofmatch.test.mjs (RTDB) og test/braendstofmatch.
 * test.mjs (de rene funktioner) dækker resten.
 *
 * Kør: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const kilde = readFileSync("functions/index.js", "utf8");

const blokAf = (navn) => {
  const start = kilde.indexOf(`export const ${navn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${navn}`);
  const naeste = kilde.indexOf("\nexport const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
};

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ══════════════════════════════════════════════════════════════════════════
   PERMISSION-GENBRUG — indkoeb.skriv, ingen ny global permission
   ══════════════════════════════════════════════════════════════════════════ */
describe("Brændstofmatch genbruger indkoeb.skriv — ingen ny global permission", () => {
  it("⚠ INGEN braendstofmatchLaes/Skriv-KONSTANT I permissions.js", () => {
    const permKilde = readFileSync("src/fleet/permissions.js", "utf8");
    assert.ok(!/braendstofmatch(Laes|Skriv):/i.test(permKilde),
      "der er tilføjet en global braendstofmatch-permission — matcher ikke det generiske dokument-/opgave-mønster");
  });

  it("⚠ BEGGE FUNKTIONER BRUGER procureDoer MED indkoeb.skriv", () => {
    for (const navn of ["braendstofAutomatch", "braendstofMatchBekraeft"]) {
      const b = udenKommentarer(blokAf(navn));
      assert.match(b, /procureDoer\(req,\s*\{\s*perm:\s*"indkoeb\.skriv"\s*\}\)/,
        `${navn} bruger ikke indkoeb.skriv`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SCOREN GEMMES ALDRIG — samme princip som fakturamatch
   ══════════════════════════════════════════════════════════════════════════ */
describe("Scoren sendes ikke med, og gemmes ikke", () => {
  it("⚠ braendstofMatchBekraeft LÆSER ALDRIG ET score-FELT FRA KLIENTEN", () => {
    const b = udenKommentarer(blokAf("braendstofMatchBekraeft"));
    assert.doesNotMatch(b, /d\.score/, "funktionen læser tilsyneladende en klient-leveret score");
  });

  it("⚠ INGEN AF FUNKTIONERNE SKRIVER ET score-FELT TIL RTDB", () => {
    for (const navn of ["braendstofAutomatch", "braendstofMatchBekraeft"]) {
      const b = udenKommentarer(blokAf(navn));
      assert.doesNotMatch(b, /score:/, `${navn} gemmer tilsyneladende en score`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   braendstofAutomatch — kun utvetydige, eksplicit trigget, ét-til-ét
   ══════════════════════════════════════════════════════════════════════════ */
describe("braendstofAutomatch", () => {
  it("⚠ BRUGER DEN DELTE afgørAutomatch() — GENOPFINDER IKKE BESLUTNINGEN LOKALT", () => {
    const b = udenKommentarer(blokAf("braendstofAutomatch"));
    assert.match(b, /afgørAutomatch\(forslag\)/);
    assert.doesNotMatch(b, /kvalificerede\.length\s*===\s*1/,
      "funktionen ser ud til at genimplementere 'ét kvalificerende forslag'-logikken selv, i stedet for at kalde afgørAutomatch()");
  });

  it("⚠ EN LINJE DER ALLEREDE HAR ET MATCH, SPRINGES OVER — genberegnes ikke", () => {
    const b = udenKommentarer(blokAf("braendstofAutomatch"));
    assert.match(b, /if \(eksisterendeMatch\[indkoebId\]\) continue;/);
  });

  it("⚠ EN BOGFØRT ELLER AFVIST LINJE MATCHES ALDRIG AUTOMATISK", () => {
    const b = udenKommentarer(blokAf("braendstofAutomatch"));
    assert.match(b, /fakturastatus === "bogfoert" \|\| linje\.fakturastatus === "afvist"/);
  });

  it("⚠ TO LINJER I SAMME KØRSEL KAN IKKE KLAIME SAMME TANKNING — sættet udvides undervejs", () => {
    const b = udenKommentarer(blokAf("braendstofAutomatch"));
    assert.match(b, /matchedeTankningIder\.add\(/,
      "det matchede sæt udvides tilsyneladende ikke undervejs i løkken — to linjer kunne foreslås samme tankning");
  });

  it("⚠ EN VELLYKKET AUTOMATCH LOGGES PR. LINJE, OBJEKT \"braendstofmatch\"", () => {
    const b = udenKommentarer(blokAf("braendstofAutomatch"));
    assert.match(b, /logProcure\(tenantId, uid, [^,]+, "braendstofmatch"/);
    assert.match(b, /automatisk matchet/);
  });

  it("⚠ INGEN SKRIVNING SKER, HVIS INTET BLEV MATCHET — automatiskMatchet > 0 vogter update()", () => {
    const b = udenKommentarer(blokAf("braendstofAutomatch"));
    assert.match(b, /if \(automatiskMatchet > 0\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   braendstofMatchBekraeft — manuel match, ikkeMatchbar, fjern
   ══════════════════════════════════════════════════════════════════════════ */
describe("braendstofMatchBekraeft — de tre grene", () => {
  it('⚠ "ikkeMatchbar" KRÆVER EN GRUND', () => {
    const b = udenKommentarer(blokAf("braendstofMatchBekraeft"));
    assert.match(b, /if \(d\.handling === "ikkeMatchbar"\)/);
    assert.match(b, /if \(!grund\)/);
  });

  it('⚠ "fjern" ER BLOKERET NÅR LINJEN ER BOGFØRT', () => {
    const b = udenKommentarer(blokAf("braendstofMatchBekraeft"));
    const fjernStart = b.indexOf('d.handling === "fjern"');
    assert.ok(fjernStart >= 0, 'ingen "fjern"-gren fundet');
    const fjernBlok = b.slice(fjernStart, b.indexOf("}", b.indexOf("bogfoert", fjernStart)));
    assert.match(fjernBlok, /fakturastatus === "bogfoert"/);
  });

  it("⚠ EN MANUEL MATCH BRUGER DEN SAMME kanMatcheBraendstof() SOM SKÆRMEN VILLE VISE", () => {
    const b = udenKommentarer(blokAf("braendstofMatchBekraeft"));
    assert.match(b, /kanMatcheBraendstof\(linje,/);
  });

  it("⚠ ÉN TANKNING, HØJST ÉT MATCH — levende opslag på tankningId FØR skrivningen", () => {
    const b = udenKommentarer(blokAf("braendstofMatchBekraeft"));
    assert.match(b, /orderByChild\("tankningId"\)\.equalTo\(tankningId\)/);
    const opslagIndeks = b.indexOf('orderByChild("tankningId")');
    const skrivIndeks = b.indexOf("await db.ref(sti).set(efter);", opslagIndeks);
    assert.ok(skrivIndeks > opslagIndeks, "opslaget for ét-til-ét ligger EFTER skrivningen, ikke før");
  });

  it("⚠ EN TANKNING AF EN ANDEN ART END braendstof AFVISES", () => {
    const b = udenKommentarer(blokAf("braendstofMatchBekraeft"));
    assert.match(b, /tankning\.art !== "braendstof"/);
  });

  it("⚠ ALLE TRE GRENE LOGGER, OBJEKT \"braendstofmatch\"", () => {
    const b = udenKommentarer(blokAf("braendstofMatchBekraeft"));
    const forekomster = [...b.matchAll(/logProcure\(tenantId, uid, [^,]+, "braendstofmatch"/g)].length;
    assert.equal(forekomster, 3, "forventede tre logProcure-kald — fjern, ikkeMatchbar og match");
  });

  it("⚠ INGEN HARDSLET AF SELVE FAKTURALINJEN — kun matchposten fjernes ved 'fjern'", () => {
    const b = udenKommentarer(blokAf("braendstofMatchBekraeft"));
    assert.ok(!/indkoeb\/\$\{indkoebId\}`\)\.remove\(\)/.test(b),
      "funktionen sletter tilsyneladende selve indkøbslinjen — den må kun fjerne matchposten");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   AUDIT — regnskabsklasse, ikke drift
   ══════════════════════════════════════════════════════════════════════════ */
describe("Audit — braendstofmatch er et regnskabsobjekt, samme klasse som indkoeb", () => {
  it("⚠ braendstofmatch ER REGISTRERET I REGNSKABSOBJEKTER", () => {
    const auditKilde = readFileSync("src/fleet/audit-regler.js", "utf8");
    const blok = auditKilde.slice(
      auditKilde.indexOf("const REGNSKABSOBJEKTER"),
      auditKilde.indexOf("]);", auditKilde.indexOf("const REGNSKABSOBJEKTER")));
    assert.match(blok, /"braendstofmatch"/);
  });

  it("⚠ indkoebId/tankningId/automatisk ER PÅ LOGBARE_FELTER", () => {
    const auditKilde = readFileSync("src/fleet/audit-regler.js", "utf8");
    const blok = auditKilde.slice(
      auditKilde.indexOf("export const LOGBARE_FELTER"),
      auditKilde.indexOf("]);", auditKilde.indexOf("export const LOGBARE_FELTER")));
    for (const felt of ["indkoebId", "tankningId", "automatisk"]) {
      assert.match(blok, new RegExp(`"${felt}"`), `${felt} mangler på LOGBARE_FELTER`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   MODUL — braendstofmatch hører til indkoeb (Procure)
   ══════════════════════════════════════════════════════════════════════════ */
describe("Modultilhør", () => {
  it("⚠ braendstofmatch ER REGISTRERET UNDER indkoeb-MODULET I NODE_MODUL", () => {
    const modulerKilde = readFileSync("src/fleet/moduler.js", "utf8");
    assert.match(modulerKilde, /braendstofmatch:\s*"indkoeb"/);
  });
});
