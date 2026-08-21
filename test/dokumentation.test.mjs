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

/* ══════════════════════════════════════════════════════════════════════════
   PÅSTANDE DER VAR SANDE ÉN GANG

   ⚠ HVORFOR AFSNITTET FINDES. `CLAUDE.md` læses ind i hver eneste session, og
   den sagde to ting der var omgjort:

     "Rollerne er faste."
     "Der er ingen `roller/`-node at rette i."

   Begge blev afgjort af **beslutning 31**, og **31b omgjorde dem**. Noden står
   i regelfilen, kunden må redigere sine roller, og `rolleskriv` minter claims
   i samme ombæring. README sagde oven i købet at noden var *fjernet*, og
   ARKITEKTUR.md at den Cloud Function der skifter en etapes tilstand, "ikke
   findes" — den hedder `etapeskift` og har gjort det længe.

   En forkert instruktion er værre end ingen: den næste der læser den, lader
   være med at bygge noget der er bygget, eller siger nej til noget der er
   besluttet ja til.

   ⚠ LISTEN ER IKKE EN ORDLISTE. Hver række har en LEVENDE betingelse: forbuddet
   gælder kun så længe koden modsiger sætningen. Fjernes `rolleskriv` og noden
   igen, må sætningen komme tilbage — og så er prøven grøn af den rigtige grund.
   ══════════════════════════════════════════════════════════════════════════ */

const FUNKTIONER = readFileSync("functions/index.js", "utf8");
const PERMISSIONS = readFileSync("src/fleet/permissions.js", "utf8");

const findesNode = (sti) => {
  let n = REGLER.tenants?.$tenantId;
  for (const del of sti.split("/")) { n = n?.[del]; if (!n) return false; }
  return true;
};
const findesFunktion = (navn) => FUNKTIONER.includes(`export const ${navn} =`);

const FORAELDEDE = [
  {
    fil: "CLAUDE.md",
    tekst: "Der er ingen `roller/`-node at rette i",
    saaLaenge: () => findesNode("roller") && findesFunktion("rolleskriv"),
    hvorfor: "beslutning 31b: noden findes, og rolleskriv skriver den",
  },
  {
    fil: "CLAUDE.md",
    tekst: "**Rollerne er faste.**",
    saaLaenge: () => findesFunktion("rolleskriv"),
    hvorfor: "beslutning 31b: kunden må redigere hvad en rolle indeholder",
  },
  {
    fil: "README.md",
    tekst: "Noden `roller/` lå tom og `.write: false` i månedsvis og er nu",
    saaLaenge: () => findesNode("roller"),
    hvorfor: "noden er ikke fjernet — den står i firebase.rules.json",
  },
  {
    fil: "ARKITEKTUR.md",
    tekst: "med reservationen i en Cloud Function der ikke findes",
    saaLaenge: () => findesFunktion("etapeskift"),
    hvorfor: "etapeskift skifter tilstanden og skriver reservationen atomisk",
  },
  {
    fil: "ARKITEKTUR.md",
    tekst: "idébanken",
    saaLaenge: () => !PERMISSIONS.includes("idebank") && !findesNode("idebank"),
    hvorfor: "beslutning 22, udført i 31: rute, skærm, permission og node er væk",
  },
];

describe("Påstande der var sande én gang", () => {
  it("⚠ INGEN AF DEM STÅR I DOKUMENTATIONEN LÆNGERE", () => {
    const staar = [];
    for (const f of FORAELDEDE) {
      if (!f.saaLaenge()) continue;
      const fil = readFileSync(f.fil, "utf8");
      if (fil.includes(f.tekst)) staar.push(`${f.fil}: "${f.tekst}" — ${f.hvorfor}`);
    }
    assert.deepEqual(staar, [],
      "dokumentationen påstår noget koden modsiger. En forkert instruktion er "
      + "værre end ingen — den næste lader være med at bygge noget der er bygget.");
  });

  /**
   * ⚠ OG DEN GENERELLE UDGAVE: siger et dokument at en node er `.write: false`,
   * skal den være det. Det er den påstand der oftest står i disse filer, og den
   * er mekanisk kontrollerbar — modsat "rollerne er faste", som kræver en
   * beslutning at afgøre.
   */
  it("⚠ EN NODE DER OMTALES SOM .write: false, ER DET", () => {
    const forkerte = [];
    for (const navn of ["README.md", "CLAUDE.md", "ARKITEKTUR.md"]) {
      const fil = readFileSync(navn, "utf8");
      for (const m of fil.matchAll(/`(\w+)` (?:er|og) `?\.write: false`?/g)) {
        const node = m[1];
        const n = REGLER.tenants?.$tenantId?.[node];
        if (!n) continue;                       // ikke en tenant-node
        const barn = Object.keys(n).find((k) => k.startsWith("$"));
        const lukket = n[".write"] === false
          || (barn && n[barn][".write"] === false);
        if (!lukket) forkerte.push(`${navn}: "${node}" omtales som .write:false`);
      }
    }
    assert.deepEqual(forkerte, [],
      "en node omtales som lukket, men reglen tillader skrivning.");
  });
});
