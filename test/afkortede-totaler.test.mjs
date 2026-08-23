/* test/afkortede-totaler.test.mjs
 * En sum af en afkortet liste er ikke en total.
 *
 * ⚠ HVORFOR FILEN FINDES. Beslutning 6 navngav fejlen: *"en total ud af et
 * udsnit"*. Beslutning 91 fandt den i `andelAfIndkoebPct`. Her er den målt
 * bredt, og den stod **13 steder**:
 *
 *   "Varer i alt"    talt op af en liste med loft på 500
 *   "Udlån i alt"    samme
 *   "Kasser i alt"   samme
 *   "Bevægelser"     loft på 1000 — med `note="hele historikken"` under sig
 *
 * `useListe` har hele tiden svaret `afkortet`, og dens eget hoved siger
 * hvorfor: *"Skriv det til brugeren — tavs afkortning opdages først når nogen
 * spørger hvorfor en booking mangler."* Kortene læste det ikke.
 *
 * ⚠ ET NØGLETALSKORT ER EN PÅSTAND OM VIRKSOMHEDEN. Et tal i en tabelrække
 * beskriver rækkerne; et tal i et `KpiKort` beskriver kunden. Derfor er det
 * netop dér kravet gælder — en lint på hvert `.length` ville råbe ad hvert
 * "er listen tom", og en lint der råber ad alt, bliver slået fra.
 *
 * "Mindst 500" er et svar. "500" er et løfte.
 *
 * Se beslutning 96.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { mindst } from "../src/fleet/format.js";

const BS = String.fromCharCode(92);

function jsxFiler(dir) {
  const ud = [];
  for (const navn of readdirSync(dir)) {
    const p = join(dir, navn);
    if (statSync(p).isDirectory()) ud.push(...jsxFiler(p));
    else if (navn.endsWith(".jsx")) ud.push(p);
  }
  return ud;
}

const udenKommentarer = (kode) => kode
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, "");

/** Kaldet fra `useListe(` til den matchende parentes. */
function heleKaldet(kode, start) {
  let dybde = 0;
  for (let i = start; i < kode.length; i++) {
    if (kode[i] === "(") dybde += 1;
    else if (kode[i] === ")") {
      dybde -= 1;
      if (dybde === 0) return kode.slice(start, i + 1);
    }
  }
  return kode.slice(start);
}

/** Navnene på de lister i filen der hentes MED et loft. */
function medGraense(kode) {
  const navne = new Set();
  for (const m of kode.matchAll(/useListe\(/g)) {
    const tekst = heleKaldet(kode, m.index);
    if (!/graense\s*:/.test(tekst)) continue;
    const foer = kode.slice(Math.max(0, m.index - 260), m.index);
    const fraData = [...foer.matchAll(/data:\s*([A-Za-z0-9_]+)/g)].map((x) => x[1]);
    const heleObjekt = foer.match(/const\s+([A-Za-z0-9_]+)\s*=\s*$/);
    if (heleObjekt) fraData.push(heleObjekt[1]);
    if (fraData.length) navne.add(fraData[fraData.length - 1]);
  }
  return navne;
}

/** Hvert `<KpiKort …/>`-element i filen. */
function kpiKort(kode) {
  const ud = [];
  let i = 0;
  while ((i = kode.indexOf("<KpiKort", i)) >= 0) {
    const slut = kode.indexOf("/>", i);
    ud.push(kode.slice(i, slut > 0 ? slut + 2 : i + 400));
    i = slut > 0 ? slut + 2 : i + 8;
  }
  return ud;
}

const FUND = [];
for (const f of jsxFiler("src/moduler")) {
  const sti = f.split(BS).join("/");
  const kode = udenKommentarer(readFileSync(f, "utf8"));
  const graenser = medGraense(kode);
  if (!graenser.size) continue;
  for (const kort of kpiKort(kode)) {
    for (const v of graenser) {
      const bygget = [".length", ".data.length", ".reduce(", ".data.reduce("]
        .some((endelse) => kort.includes(v + endelse));
      if (!bygget) continue;
      const label = kort.match(/label="([^"]*)"/)?.[1] || "(uden label)";
      /* Kortet skal enten sige "mindst", eller selv nævne afkortningen. */
      const aerligt = /mindst\(/.test(kort) || /afkortet/i.test(kort);
      FUND.push({ sti, label, liste: v, aerligt });
    }
  }
}

describe("mindst() siger hvad vi ved, ikke hvad vi håber", () => {
  it("en hel liste giver tallet", () => {
    assert.equal(mindst(500, false), "500");
    assert.equal(mindst(1234, false), "1.234");
  });

  it("⚠ EN AFKORTET LISTE GIVER EN NEDRE GRÆNSE", () => {
    assert.equal(mindst(500, true), "mindst 500");
    assert.equal(mindst(1000, true), "mindst 1.000");
  });

  it("⚠ DEN SKJULER IKKE TALLET BAG EN STREG", () => {
    /* At listen er afkortet, er en oplysning om VORES hentning — ikke om
       kundens data. En streg ville sige "vi ved det ikke", og det passer
       ikke: vi ved at der er mindst så mange. */
    assert.match(mindst(42, true), /42/);
  });

  it("et tal der ikke er et tal, går gennem num() som før", () => {
    assert.equal(mindst(null, false), "—");
    /* ⚠ OG "mindst —" ER MENINGSLØST. Er tallet ikke regnet, er der ingen
       nedre grænse at love. */
    assert.equal(mindst(null, true), "mindst —");
  });
});

describe("Ingen nøgletalskort påstår en total den ikke har", () => {
  it("der ER kort at prøve — ellers læser prøven ingenting", () => {
    assert.ok(FUND.length >= 10,
      `kun ${FUND.length} kort bygget af en liste med loft — er filerne læst rigtigt?`);
  });

  it("⚠ HVERT KORT BYGGET AF EN AFKORTET LISTE SIGER DET", () => {
    const tavse = FUND.filter((f) => !f.aerligt)
      .map((f) => `${f.sti}: "${f.label}" er talt op af ${f.liste} (hentet med loft)`);
    assert.deepEqual(tavse, [],
      "et nøgletalskort påstår en total der er regnet af et udsnit. Brug "
      + "mindst(n, afkortet) fra format.js — beslutning 6 og 96.\n  "
      + tavse.join("\n  "));
  });
});
