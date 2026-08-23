/* test/sensitivlaesning.test.mjs
 * En læsning af sensitive/ skal logges — hver eneste af dem.
 *
 * ⚠ HVORFOR FILEN FINDES. `sensitive/indberetninger` blev læst UDEN
 * `auditerSom`. Noden bærer skadebeskrivelse, modpart, forsikringsselskab,
 * policenummer og en underskrift — den mest personlige og mest juridisk
 * ladede post i produktet, frosset af beslutning 52 og bag sin egen
 * `indberetninger.sensitiveLaes`.
 *
 * `audit.js` siger det selv om `laes()`:
 *
 *   "Det er den del der plejer at mangle, og den RA-kunder spørger om."
 *
 * Den plejede at mangle. Naboen — `sensitive/fravaer` i Fravaer.jsx — havde
 * den: samme hook, samme slags node, ét ord til forskel.
 *
 * ⚠ OG DET ER IKKE ET SPØRGSMÅL OM ADGANG. Reglerne afviste allerede en
 * bruger uden permissionen; det der manglede, var SPORET af de læsninger der
 * gik igennem. Adgangskontrollen holdt — dokumentationen af den gjorde ikke.
 *
 * Se beslutning 99, og forbeholdet "læsningslogning er klientside" i
 * BESLUTNINGER.md: udløseren ligger i klienten, og derfor er det netop her en
 * lint er det eneste der kan holde den på plads.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BS = String.fromCharCode(92);

function kildefiler(dir) {
  const ud = [];
  for (const navn of readdirSync(dir)) {
    const p = join(dir, navn);
    if (statSync(p).isDirectory()) ud.push(...kildefiler(p));
    else if (navn.endsWith(".jsx") || navn.endsWith(".js")) ud.push(p);
  }
  return ud;
}

const udenKommentarer = (kode) => kode
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, "");

/** Kaldet fra `useX(` til den matchende parentes. */
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

/* Hvert opslag mod en sensitive-node, uanset hvilket hook der bruges. */
const OPSLAG = [];
for (const f of [...kildefiler("src/moduler"), ...kildefiler("src/fleet")]) {
  const sti = f.split(BS).join("/");
  if (sti.endsWith("/usePost.js") || sti.endsWith("/useListe.js")) continue;
  const kode = udenKommentarer(readFileSync(f, "utf8"));
  for (const m of kode.matchAll(/\buse(Post|Liste)\(/g)) {
    const tekst = heleKaldet(kode, m.index);
    const node = tekst.match(/use(?:Post|Liste)\(\s*["'`]([a-zA-Z/]+)/)?.[1];
    if (!node?.startsWith("sensitive/")) continue;
    OPSLAG.push({ sti, node, auditeres: /auditerSom\s*:/.test(tekst) });
  }
}

describe("Følsomme læsninger efterlader et spor", () => {
  it("der ER sensitive opslag at prøve", () => {
    /* Findes de ikke, læser prøven ingenting — og så ville den være grøn
       den dag nogen omskrev hooket til noget den ikke genkender. */
    assert.ok(OPSLAG.length >= 2,
      `kun ${OPSLAG.length} opslag mod sensitive/ fundet`);
  });

  /**
   * ⚠ DEN HER BÆRER KRAVET.
   *
   * `sensitive/` er den ene node-familie hvor en LÆSNING i sig selv er en
   * hændelse. Hvem der har set en skadebeskrivelse eller en sygemeldings
   * årsag, er ikke det samme spørgsmål som hvem der måtte.
   */
  it("⚠ HVERT OPSLAG MOD sensitive/ BÆRER auditerSom", () => {
    const stille = OPSLAG.filter((o) => !o.auditeres)
      .map((o) => `${o.sti} → ${o.node}`);
    assert.deepEqual(stille, [],
      "en følsom læsning uden auditerSom. Reglerne afviser stadig den der "
      + "ikke må — men den der MÅ, efterlader intet spor:\n  "
      + stille.join("\n  "));
  });

  /**
   * ⚠ OG NAVNET SKAL KUNNE SØGES FREM.
   *
   * Auditposten bærer `objekt` som en fri streng. To skærme der kalder den
   * samme node to forskellige ting, giver to rækker der ikke kan lægges
   * sammen — og en udtrækning der ser komplet ud og ikke er det.
   */
  it("⚠ SAMME NODE HAR SAMME NAVN OVERALT", () => {
    const navne = new Map();
    for (const o of OPSLAG) {
      if (!o.auditeres) continue;
      const kode = udenKommentarer(readFileSync(o.sti, "utf8"));
      const i = kode.indexOf(o.node);
      const navn = kode.slice(i).match(/auditerSom\s*:\s*["']([^"']+)["']/)?.[1];
      if (!navn) continue;
      const kendt = navne.get(o.node);
      if (kendt && kendt !== navn) {
        assert.fail(`${o.node} auditeres både som "${kendt}" og "${navn}"`);
      }
      navne.set(o.node, navn);
    }
    assert.ok(navne.size >= 2, "for få navne til at sammenligne");
  });
});

describe("Hookene kan overhovedet logge", () => {
  it("usePost og useListe kalder audit.laes når auditerSom er sat", () => {
    for (const fil of ["src/fleet/usePost.js", "src/fleet/useListe.js"]) {
      const kode = udenKommentarer(readFileSync(fil, "utf8"));
      assert.match(kode, /auditerSom/, `${fil} kender ikke auditerSom`);
      assert.match(kode, /auditLaes\(/, `${fil} logger ikke læsningen`);
    }
  });

  it("⚠ OG DE LOGGER EN AFVISNING OGSÅ", () => {
    /* Et afvist forsøg er ofte det mest interessante i en auditlog — og
       reglerne kan ikke skrive til den selv. */
    for (const fil of ["src/fleet/usePost.js", "src/fleet/useListe.js"]) {
      const kode = udenKommentarer(readFileSync(fil, "utf8"));
      assert.match(kode, /auditNaegtet\(/, `${fil} logger ikke en afvisning`);
    }
  });

  it("⚠ ANTALLET LOGGES, IKKE RÆKKERNE", () => {
    /* En auditpost må ikke indeholde det den registrerer at nogen har set.
       Ellers er loggen selv en kopi af de følsomme data. */
    const kode = udenKommentarer(readFileSync("src/fleet/useListe.js", "utf8"));
    const kald = kode.slice(kode.indexOf("auditLaes({"), kode.indexOf("auditLaes({") + 120);
    assert.match(kald, /antal:/);
    assert.ok(!/raekker\s*[,}]/.test(kald.replace(/antal: raekker\.length/, "")),
      "auditposten bærer rækkerne selv");
  });
});
