/* test/dokumentation.test.mjs
 * README's liste over noder UDEN regler, holdt op mod regelfilen.
 *
 * ⚠ HVORFOR FILEN FINDES. Fem af tolv rækker var forkerte.
 *
 * Listen "Noder der er dokumenteret, men mangler regler" sagde at
 * `facility/lokationer`, `facility/aktiver`, `facility/zoner`, `leverandoerer`
 * og `sensitive/indberetninger` ikke stod i `firebase.rules.json`. Alle fem
 * gjorde. Tabellens egen sidste linje siger hvad den er til for —
 *
 *   "Tilføjer du en node, hører den enten i reglerne eller på denne liste."
 *
 * — og en liste over det der mangler, er kun brugbar hvis den bliver KORTERE
 * når noget bliver bygget. Ellers er den en opgaveliste man holder op med at
 * læse, og så står der ting på den som er lavet for længst.
 *
 * ⚠ OG DET KOSTEDE NOGET. Rækken om underskriften sagde "skal have
 * `.write: !data.exists()`" — altså at spærringen manglede. Den fandtes, men
 * kunne omgås ved at slette først (beslutning 52). Fordi rækken sagde at
 * reglen ikke var der, kiggede ingen på om den virkede.
 *
 * Det er samme guard som `test/rules.tenant.test.mjs` er for reglerne selv:
 * nodelisten læses UD af filen, så en ny node ikke kan glide forbi.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const README = readFileSync("README.md", "utf8");
const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8").replace(/^\s*\/\/.*$/gm, "")
).rules;

const OVERSKRIFT = "### Noder der er dokumenteret, men mangler regler";

/** Tabellens rækker: [nodenavn, bemærkning]. */
function raekker() {
  const start = README.indexOf(OVERSKRIFT);
  assert.ok(start >= 0, `README har ingen "${OVERSKRIFT}"`);
  const slut = README.indexOf("\n### ", start + OVERSKRIFT.length);
  const afsnit = README.slice(start, slut < 0 ? undefined : slut);

  const ud = [];
  for (const linje of afsnit.split("\n")) {
    if (!linje.startsWith("|")) continue;
    const celler = linje.split("|").slice(1, -1).map((c) => c.trim());
    if (celler.length < 2) continue;
    if (celler[0] === "Node" || /^-+$/.test(celler[0])) continue;
    ud.push({ raa: celler[0], bemaerkning: celler[1] });
  }
  return ud;
}

/**
 * Findes stien i reglerne?
 *
 * ⚠ EN NODE KAN LIGGE TO STEDER, og det er ikke en detalje: `audit/` og
 * `support/` ligger i TOPPEN og ikke under `tenants/`, netop fordi `.read`
 * kaskaderer (beslutning 17 og 24). Begge steder prøves derfor.
 */
function findes(sti) {
  const gaa = (rod) => {
    let n = rod;
    for (const del of sti.split("/")) {
      n = n?.[del];
      if (!n) return false;
    }
    return true;
  };
  return gaa(REGLER) || gaa(REGLER.tenants?.$tenantId ?? {});
}

/* En række kan navngive flere noder: "`sager`, `sensitive/sager`". Og en
   bygget node står med ~~gennemstregning~~ og et flueben — den er historik,
   ikke en mangel. */
const erBygget = (r) => r.raa.includes("~~") || r.bemaerkning.includes("✅");

const noder = (r) =>
  [...r.raa.matchAll(/`([^`]+)`/g)].map((m) => m[1])
    /* `tenants/<t>/x` skrives med en pladsholder i tabellen; stien i reglerne
       er den samme uden præfikset. */
    .map((s) => s.replace(/^tenants\/<t>\//, ""))
    /* Et felt på en node — `…/<id>/underskrift` — er ikke en node. */
    .filter((s) => !s.includes("<") || s.startsWith("tenants/"));

describe("README's liste over noder uden regler", () => {
  it("har rækker at prøve", () => {
    assert.ok(raekker().length >= 8, "tabellen er forsvundet eller blevet meget kortere");
  });

  /**
   * ⚠ DEN VIGTIGE RETNING. En node der HAR fået regler, skal af listen —
   * ellers står der på skrift at noget mangler, som er bygget, og det er
   * præcis dét der gjorde at ingen kiggede efter om underskriftens spærring
   * virkede.
   */
  it("⚠ INGEN AF DEM STÅR I REGELFILEN", () => {
    const forkerte = [];
    for (const r of raekker()) {
      if (erBygget(r)) continue;
      for (const n of noder(r)) {
        if (findes(n)) forkerte.push(n);
      }
    }
    assert.deepEqual(forkerte, [],
      `${forkerte.length} node(r) står som "mangler regler", men HAR regler. `
      + "Stryg rækken — en liste der ikke bliver kortere, holder man op med at læse.");
  });

  /* Og den anden vej: en række der er markeret som bygget, skal faktisk være
     det. Ellers er fluebenet en påstand. */
  it("og en række der er streget ud, HAR regler", () => {
    for (const r of raekker()) {
      if (!erBygget(r)) continue;
      for (const n of noder(r)) {
        assert.ok(findes(n), `"${n}" står som bygget, men findes ikke i reglerne`);
      }
    }
  });
});
