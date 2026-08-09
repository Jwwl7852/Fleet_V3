/* test/demo-kilder.test.mjs
 * Et demo-datasæt hører i fleet/, ikke i en modulfil.
 *
 * ⚠ HVORFOR DEN HER TEST FINDES: FIRE GANGE.
 *
 *   1. Bemanding havde sine egne elleve chaufførnavne. De var det eneste sted
 *      staben fandtes, så Medarbejdere ville have fået sit eget sæt — og Lars
 *      Aage kunne stå med et udløbet bevis på den ene skærm og slet ikke
 *      findes på den anden.
 *   2. Bilerne stod hardkodet tre steder, og to af dem var uenige: Bil 104
 *      havde AB 12 345 i demo-sag.js og DE 45 678 i Bookingopsætning. En
 *      nummerplade er værre end et nøgletal — det er den man slår op på.
 *   3. Sagens bil skulle rettes ind efter demo-flaade, da den blev kilden.
 *   4. DEMO_KUNDER lå som en lokal const inde i moduler/Kunder.jsx, hvor
 *      demo-bookinger ikke kunne nå den uden at lave sin egen kopi.
 *
 * Fire gange er ikke et tilfælde. Det er noget der vil ske igen, og det sker
 * i god tro: man skriver et par rækker demo-data i den skærm man er i gang
 * med, og opdager først et halvt år senere at der er to sandheder.
 *
 * Testen er derfor en LINT, ikke en enhedstest. Den læser filerne som tekst.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MODULER = "src/moduler";
const FLEET = "src/fleet";

function alleFiler(mappe) {
  const ud = [];
  for (const navn of readdirSync(mappe)) {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) ud.push(...alleFiler(sti));
    else if (/\.(js|jsx)$/.test(navn)) ud.push(sti);
  }
  return ud;
}

/* En deklaration af en DEMO_-konstant — ikke et import og ikke en brug. */
const DEKLARATION = /^\s*(?:export\s+)?(?:const|let|var)\s+(DEMO_[A-ZÆØÅ0-9_]+)\s*=/gm;

/**
 * Kommentarer væk, før der scannes.
 *
 * Uden det melder testen falsk: Bemanding.jsx NÆVNER DEMO_KPI i en kommentar
 * om at demo-personale kontrollerer sig mod den, og en lint der brokker sig
 * over en forklaring, bliver slået fra. En lint man ikke kan stole på, er
 * værre end ingen.
 */
const udenKommentarer = (tekst) =>
  tekst.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Demo-data hører i fleet/, ikke i moduler/", () => {
  it("har ingen DEMO_-konstant deklareret i en modulfil", () => {
    const fund = [];
    for (const sti of alleFiler(MODULER)) {
      const tekst = udenKommentarer(readFileSync(sti, "utf8"));
      for (const m of tekst.matchAll(DEKLARATION)) {
        fund.push(`${sti}: ${m[1]}`);
      }
    }
    assert.deepEqual(
      fund, [],
      "Et demo-datasæt i en modulfil kan ikke nås af andre demo-sæt, og så laver de " +
      "deres egen kopi. Flyt konstanten til src/fleet/demo-*.js og importér den.\n" +
      fund.join("\n")
    );
  });

  /* Modulerne må gerne BRUGE dem — de skal bare importere dem. */
  it("importerer demo-data fra fleet/ i de moduler der bruger dem", () => {
    const fejl = [];
    for (const sti of alleFiler(MODULER)) {
      const tekst = udenKommentarer(readFileSync(sti, "utf8"));
      const brugt = [...tekst.matchAll(/\bDEMO_[A-ZÆØÅ0-9_]+/g)].map((m) => m[0]);
      if (!brugt.length) continue;
      for (const navn of new Set(brugt)) {
        const importeret = new RegExp(`import[^;]*\\b${navn}\\b[^;]*from\\s+["'][^"']*fleet/`, "s")
          .test(tekst);
        if (!importeret) fejl.push(`${sti}: ${navn} bruges uden at være importeret fra fleet/`);
      }
    }
    assert.deepEqual(fejl, [], fejl.join("\n"));
  });

  /* Og hver demo-fil i fleet/ skal faktisk eksportere noget — en fil der kun
     har en selvkontrol, er ikke en kilde. */
  it("eksporterer fra hver demo-fil i fleet/", () => {
    const demoFiler = readdirSync(FLEET).filter((n) => /^demo-.*\.js$/.test(n));
    assert.ok(demoFiler.length >= 7, `kun ${demoFiler.length} demo-filer fundet`);
    for (const navn of demoFiler) {
      const tekst = readFileSync(join(FLEET, navn), "utf8");
      assert.match(tekst, /export const DEMO_/, `${navn} eksporterer ingen DEMO_-konstant`);
    }
  });

  /* Selvkontrollen er grunden til at demo-personale virkede. Den skal med i
     hver ny demo-fil — se README. demo-kunder.js er rent stamdata uden
     krydsreferencer og undtages. */
  it("har en selvkontrol i hver demo-fil med krydsreferencer", () => {
    const uden = [];
    for (const navn of readdirSync(FLEET).filter((n) => /^demo-.*\.js$/.test(n))) {
      if (navn === "demo-kpi.js" || navn === "demo-kunder.js") continue;
      const tekst = readFileSync(join(FLEET, navn), "utf8");
      if (!/import\.meta\.env\?\.DEV/.test(tekst)) uden.push(navn);
    }
    assert.deepEqual(
      uden, [],
      "Uden en selvkontrol opdages en drift mellem to demo-sæt først når nogen " +
      "kigger. Se demo-personale.js.\n" + uden.join("\n")
    );
  });
});
