/* test/beslutningstal.test.mjs
 * Antallet af beslutninger, holdt op mod det der kan tælles.
 *
 * ⚠ HVORFOR FILEN FINDES. Samme fejlklasse som test/statustal.test.mjs
 * (beslutning 88) — bare ét niveau højere oppe. BESLUTNINGER.md's egen
 * indledning sagde "der er 20 trufne beslutninger" lige OVER en tabel der
 * allerede listede 25, README's dokumentindeks sagde "de 80 beslutninger",
 * og CLAUDE.md sagde "118 trufne beslutninger" — tre håndskrevne tal, tre
 * forskellige svar på samme spørgsmål, ingen af dem 120. Fundet ved
 * gennemgang af "syv roller"-drift (samme session), ikke stillet af nogen.
 *
 * Et tal skrevet i hånden kan kun blive forkert, efterhånden som filen
 * vokser — præcis README's egen begrundelse for beslutning 88. Denne fil
 * er svaret på tallet ét niveau op: BESLUTNINGER.md selv, ikke kun README's
 * beskrivelse af den.
 *
 * ⚠ TO TÆLLEFORMER, ÉT TAL. De første 25 beslutninger står som RÆKKER i
 * "## Oversigt"-tabellen (`| 1 | ... |` gennem `| 25 | ... |`) — fra dengang
 * hver beslutning var kort nok til én linje. Fra 26 og frem er de deres
 * egen overskrift, `## N. Titel`, med plads til fuld begrundelse. Begge
 * dele tælles med, for begge er en TRUFFET beslutning — formatet er
 * historie, ikke betydning.
 *
 * ⚠ EN UNDERBESLUTNING TÆLLER IKKE MED. `### 31b. Omgjort: ...` er niveau 3
 * og fanges ikke af `^## \d+\.` — den ÆNDRER beslutning 31, den er ikke sin
 * egen. Samme regel holder overskrifter som "## Beslutning 16 i detaljer"
 * (ingen indledende tal) uden for tællingen: det er en UDDYBNING af 16, ikke
 * beslutning 121.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const BESLUTNINGER = readFileSync("BESLUTNINGER.md", "utf8");
const README = readFileSync("README.md", "utf8");
const CLAUDE = readFileSync("CLAUDE.md", "utf8");

/**
 * De trufne beslutningers numre — tabelrækker (1..25) plus overskrifter
 * (26..120 i dag). Kaster hvis "## Oversigt" eller den efterfølgende
 * overskrift ikke findes, i stedet for at tælle stiltiende for lidt.
 */
function beslutningsnumre() {
  const oversigtStart = BESLUTNINGER.indexOf("## Oversigt");
  assert.ok(oversigtStart >= 0, "BESLUTNINGER.md har intet '## Oversigt'-afsnit");
  const naesteH2 = BESLUTNINGER.indexOf("\n## ", oversigtStart + 1);
  assert.ok(naesteH2 >= 0, "Oversigt-tabellen har ingen efterfølgende overskrift at stoppe ved");

  const tabel = BESLUTNINGER.slice(oversigtStart, naesteH2);
  const tabelNumre = [...tabel.matchAll(/^\| *(\d+) *\|/gm)].map((m) => Number(m[1]));

  const restenAfFilen = BESLUTNINGER.slice(naesteH2);
  const headingNumre = [...restenAfFilen.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]));

  return [...tabelNumre, ...headingNumre];
}

describe("Beslutningstallet er talt, ikke husket", () => {
  it("⚠ NUMRENE ER 1..N, UDEN HULLER OG UDEN DUBLETTER", () => {
    const numre = beslutningsnumre();
    const set = new Set(numre);
    assert.equal(set.size, numre.length,
      "en eller flere beslutningsnumre optræder mere end én gang: "
      + numre.filter((n, i) => numre.indexOf(n) !== i).join(", "));

    const max = Math.max(...numre);
    const mangler = [];
    for (let i = 1; i <= max; i += 1) if (!set.has(i)) mangler.push(i);
    assert.deepEqual(mangler, [],
      `beslutning ${mangler.join(", ")} mangler mellem 1 og ${max} — `
      + "enten en fejl i tællingen ovenfor, eller et rigtigt hul i nummereringen");
  });

  it("⚠ BESLUTNINGER.MD'S EGEN INDLEDNING SIGER DET SAMME TAL SOM DEN TÆLLER", () => {
    const antal = new Set(beslutningsnumre()).size;
    assert.match(BESLUTNINGER, new RegExp(`der er ${antal}\\s*\\n?\\s*trufne beslutninger`),
      `BESLUTNINGER.md's indledning nævner ikke det talte antal (${antal})`);
  });

  it("⚠ README'S DOKUMENTINDEKS SIGER DET SAMME TAL", () => {
    const antal = new Set(beslutningsnumre()).size;
    assert.match(README, new RegExp(`De ${antal} beslutninger`),
      `README's beskrivelse af BESLUTNINGER.md nævner ikke det talte antal (${antal})`);
  });

  it("⚠ CLAUDE.MD'S ARBEJDSREGEL SIGER DET SAMME TAL", () => {
    const antal = new Set(beslutningsnumre()).size;
    assert.match(CLAUDE, new RegExp(`Der er \\*\\*${antal} trufne beslutninger\\*\\*`),
      `CLAUDE.md's arbejdsregel nævner ikke det talte antal (${antal})`);
  });

  /* Prøven skal kunne fejle. Den følgende linje findes ikke i filen — den
     beviser kun at regexet rent faktisk kan afvise et forkert tal. */
  it("kan se et FORKERT tal og afvise det", () => {
    assert.doesNotMatch(CLAUDE, /Der er \*\*1 trufne beslutninger\*\*/,
      "prøven ville ikke opdage et forkert tal — regexet leder ikke");
  });
});
