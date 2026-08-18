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
 *   5. demo-vaerksted.js havde en DEMO_INDKOEB ved siden af demo-indkoeb.js'
 *      DEMO_INDKOEBSLINJER — to datasæt for ÉN node, i to demo-filer.
 *      Den her lint så dem ikke: begge lå i fleet/, hvor de "hører hjemme".
 *
 *      ⚠ OG DEN KOSTEDE EN FORKERT RETTELSE. Fakturaen fa-9001 pegede på
 *      indkoebId "ik-001", som ikke fandtes i demo-indkoeb.js — så feltet
 *      blev sat til null med en note om at "en hængende reference er værre
 *      end ingen". Linjen fandtes. Den lå i den anden fil og blev aldrig
 *      seedet. fa-9002 pegede tilsvarende på en linje til 16.500 kr mens
 *      fakturaen var på 29.600, og forskellen blev læst som
 *      afstemningsmateriale. Symptomerne blev behandlet; årsagen stod.
 *
 * Fem gange er ikke et tilfælde. Det er noget der vil ske igen, og det sker
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

/**
 * Et datasæt kendt på sin FORM, ikke på sit navn.
 *
 * ⚠ FEMTE OG SJETTE GANG. `TILBUD` lå i Kunder.jsx, `OPGAVER` i Dashboard.jsx
 * og `FUNKTIONER` i Bemanding.jsx — alle tre er datasæt, og alle tre gled forbi
 * prøven ovenfor, fordi den matcher `DEMO_[A-ZÆØÅ0-9_]+`. Et navn er ikke en
 * beskyttelse: den der skriver et par rækker demo-data i den skærm han er i
 * gang med, kalder dem netop ikke DEMO_noget.
 *
 * Signaturen er et modul-niveau array med mindst tre objektliterals der har et
 * `id`. Det er hvad et datasæt ER. Kolonnedefinitioner (`kolonner={[…]}`) er
 * inline i JSX og har ingen `id`; kataloger som RAPPORTER og MATRIX har heller
 * ikke tre id-bærende poster.
 */
function moduldatasaet(tekst) {
  const fund = [];
  for (const m of tekst.matchAll(/^(?:export\s+)?const\s+([A-Za-z_][\w]*)\s*=\s*\[/gm)) {
    const start = m.index + m[0].length - 1;
    let dybde = 0;
    let i = start;
    for (; i < tekst.length; i++) {
      if (tekst[i] === "[") dybde++;
      else if (tekst[i] === "]" && --dybde === 0) break;
    }
    const poster = (tekst.slice(start, i).match(/\{\s*id:/g) || []).length;
    if (poster >= 3) fund.push({ navn: m[1], poster });
  }
  return fund;
}

describe("Demo-data hører i fleet/, ikke i moduler/", () => {
  it("har intet datasæt i en modulfil — uanset hvad det hedder", () => {
    const fund = [];
    for (const sti of alleFiler(MODULER)) {
      const tekst = udenKommentarer(readFileSync(sti, "utf8"));
      for (const d of moduldatasaet(tekst)) {
        fund.push(`${sti}: ${d.navn} (${d.poster} poster med id)`);
      }
    }
    assert.deepEqual(
      fund, [],
      "Et array med tre eller flere id-bærende poster i en modulfil ER et " +
      "datasæt, uanset hvad konstanten hedder. Den kan ikke nås af de andre " +
      "demo-sæt, og så laver de deres egen kopi — det er sket seks gange. " +
      "Flyt den til src/fleet/demo-*.js, giv den DEMO_-præfikset, og importér " +
      "den.\n  " + fund.join("\n  ")
    );
  });

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

/* ══════════════════════════════════════════════════════════════════════
   To demo-filer må ikke beskrive den SAMME node
   ══════════════════════════════════════════════════════════════════════ */
describe("Én node, ét demo-datasæt", () => {
  /* ⚠ LINTEN OVENFOR SÅ KUN MODULFILER. Begge sæt lå i fleet/ — altså dér
     hvor et demo-datasæt HØRER hjemme — og reglen fangede dem derfor ikke.
     Det der er galt, er ikke placeringen: det er at to filer beskriver den
     samme node.

     Kontrollen er en NAVNELIGHED, ikke en formanalyse: kan man ikke af navnet
     se hvilken node sættet hører til, kan den næste heller ikke. Det er
     præcis sådan DEMO_INDKOEB og DEMO_INDKOEBSLINJER kunne stå side om side
     i et halvt år. */
  const NODER = [
    "INDKOEB", "FAKTURAER", "LEVERANDOERER", "KOERETOEJER", "PERSONALE",
    "KOMPETENCER", "KUNDER", "ETAPER", "OPGAVER", "FRAVAER", "VARER",
    "BEHOLDNING", "CARRIERS", "KASSER", "KASSEUDLAAN", "INDBERETNINGER",
    "AKTIVER", "LOKATIONER", "ZONER", "GRUNDLAG", "LAGRE",
  ];

  it("har højst ét demo-datasæt pr. node", () => {
    /* Hvilke filer eksporterer et sæt hvis navn begynder med nodens? */
    const prNode = {};
    for (const navn of readdirSync(FLEET).filter((n) => /^demo-.*\.js$/.test(n))) {
      const tekst = readFileSync(join(FLEET, navn), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of tekst.matchAll(/export const (DEMO_[A-Z_]+)\s*=\s*\[/g)) {
        const node = NODER.find((n) => m[1] === `DEMO_${n}` || m[1].startsWith(`DEMO_${n}`));
        if (!node) continue;
        (prNode[node] ||= []).push(`${navn}:${m[1]}`);
      }
    }

    const dobbelte = Object.entries(prNode)
      .filter(([, hvor]) => hvor.length > 1)
      .map(([node, hvor]) => `${node} → ${hvor.join(" OG ")}`);

    assert.deepEqual(dobbelte, [],
      "To demo-datasæt for én node. De driver fra hinanden, og den ene bliver " +
      "aldrig seedet — se hovedet i denne fil.\n" + dobbelte.join("\n"));
  });

  it("⚠ ET DATASÆT SOM INGEN NODE HAR, ER OGSÅ ET SVAR", () => {
    /* Nogle sæt hører bevidst ingen node til: servicebesøg, supportsager,
       tilbud, bemandingsplan. De skal kunne findes — men ikke forveksles med
       et sæt der HAR en node og bare ikke er seedet. Listen her er derfor
       ikke en fejl; den er en optælling. */
    const uden = [];
    for (const navn of readdirSync(FLEET).filter((n) => /^demo-.*\.js$/.test(n))) {
      const tekst = readFileSync(join(FLEET, navn), "utf8");
      for (const m of tekst.matchAll(/export const (DEMO_[A-Z_]+)\s*=\s*\[/g)) {
        if (!NODER.some((n) => m[1].startsWith(`DEMO_${n}`))) uden.push(m[1]);
      }
    }
    assert.ok(uden.length >= 1, "alle demo-sæt hører nu til en node — ret listen");
  });
});
