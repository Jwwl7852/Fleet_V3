/* test/rules.rollematrix.test.mjs
 * Hvad hver af de seks roller må SKRIVE — målt, ikke udledt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR DEN FINDES.
 *
 * `ROLLER.md` målte læsesiden mod det udrullede DEV og fandt at 48 af 55 stier
 * er ens for alle syv roller. Skrivesiden kunne ikke måles samme sted: en
 * skrivning ville lægge affald i basen.
 *
 * Så jeg udledte den af regelfilen — og tog fejl med det samme.
 * `indberetninger` blev admin-only i tabellen, fordi jeg læste
 *
 *     (skriv OG din egen post) ELLER skrivAlle
 *
 * som en simpel OG. Virkeligheden er at enhver chauffør må oprette sin egen.
 * En matrix man ikke kan stå inde for, er værre end ingen.
 *
 * Her måles den. Emulatoren kan skrives i og smides væk, og den kører den
 * SAMME regelfil som er udrullet — `npm run regler:udrul` sammenligner de to,
 * så kæden holder (beslutning 29).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ OG FIXTURET PRØVES FØRST. Det er den vigtigste linje i filen.
 *
 * En afvisning kan komme fra en manglende permission ELLER fra en ugyldig
 * post — og de to ser ens ud udefra. Måler man uden at vide hvilken, får man
 * en matrix hvor "nej" nogle steder betyder "rollen må ikke" og andre steder
 * "jeg skrev fixturet forkert". Det er nøjagtig den fælde
 * `rules.division.test.mjs` advarer mod i sit eget hoved.
 *
 * Derfor: ADMIN skriver hvert fixtur først. Bliver det afvist, er fixturet
 * forkert, og prøven siger DET frem for at måle videre.
 *
 * ⚠ TENANTEN HAR INGEN `moduler`-NODE, og det er med vilje. Modulklausulerne
 * falder tilbage på "alt er købt", så det der måles, er PERMISSIONEN alene.
 * Modulsiden er `rules.moduler.test.mjs`' ærinde.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
/* ⚠ INGEN assertSucceeds/assertFails HER. Filen MÅLER frem for at påstå:
   hver skrivning prøves, og svaret skrives i en tabel. Et assert pr.
   skrivning ville stoppe ved den første afvisning — og en afvisning er
   netop et resultat her, ikke en fejl. */
import { initializeTestEnvironment } from "./rules-test-claims.mjs";
import { ref, set } from "firebase/database";
import { ROLLE_PERMS, permStrengFraRolle } from "../src/fleet/permissions.js";

const T = "tenantRollematrix";
const ROLLER = Object.keys(ROLLE_PERMS);

let miljoe;

const som = (rolle) =>
  miljoe.authenticatedContext(`uid-${rolle}`, {
    tenant: T, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const NU = Date.UTC(2026, 7, 1);

/* ── Fixturerne ────────────────────────────────────────────────────────────
   Hver post er den MINDST gyldige — ikke den mindst mulige. En post der kun
   lige slipper forbi, måler reglens kant frem for rollens ret. */
const NODER = [
  { navn: "kunder", sti: (k) => `kunder/${k}`,
    post: { navn: "Kolding Kommune", aktiv: true } },

  { navn: "koeretoejer", sti: (k) => `koeretoejer/${k}`,
    post: { registrering: "AB 12 345", navn: "Volvo FH 500", art: "lastbil",
            status: "aktiv", laengdeMm: 10500, driftPrKmOere: 342 } },

  { navn: "personale", sti: (k) => `personale/${k}`,
    post: { navn: "Lars Aage", status: "aktiv", ansaettelsesform: "fastansat" } },

  { navn: "kompetencer", sti: (k) => `kompetencer/${k}`,
    post: { personId: "p-fast", type: "adr", udloeberMs: 1790000000000 } },

  { navn: "fravaer", sti: (k) => `fravaer/${k}`,
    post: { personId: "p-fast", fra: NU, til: NU + 86400000 } },

  { navn: "leverandoerer", sti: (k) => `leverandoerer/${k}`,
    post: { navn: "Hydra-Grene Kolding", cvr: "18447291",
            kategori: "reservedele", aktiv: true } },

  { navn: "indkoeb", sti: (k) => `indkoeb/${k}`,
    post: { dato: NU, leverandoerId: "lv-hydra",
            vare: "Slange", antal: 12, prisPrEnhedOere: 1850,
            momsOere: 5550, fakturastatus: "modtaget" } },

  { navn: "lagre", sti: (k) => `lagre/${k}`,
    post: { navn: "Kolding", kapacitet: 420 } },

  { navn: "satser", sti: (k) => `satser/standard/${k}`,
    post: { navn: "Palleplads pr. døgn", kategori: "lager" } },

  { navn: "omkostninger", sti: (k) => `omkostninger/${k}`,
    post: { art: "passage", navn: "Bro: Storebælt", kategori: "bro" } },

  { navn: "varer", sti: (k) => `varer/${k}`,
    post: { kundeId: "k1", varenummer: "ST-1002", navn: "Leje 6205 2RS",
            enhed: "stk", sporing: "ingen" } },

  { navn: "reolpladser", sti: (k) => `reolpladser/${k}`,
    post: { hal: "Hal 2", reol: "3", fag: "1", hylde: "2", plads: "1" } },

  { navn: "brugerlayout (sin egen)", sti: () => "brugerlayout/EGEN/samlet",
    post: ["nedetid", "aabneOpgaver"], egenUid: true },
];

/* Målingen fyldes ud i before(). */
const maalt = {};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-rollematrix",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    /* Poster fixturerne peger på. Uden dem fejler skrivningen på et opslag,
       og "nej" ville betyde noget andet end en manglende permission. */
    await set(ref(db, `tenants/${T}/personale/p-fast`),
      { navn: "Lars Aage", status: "aktiv", ansaettelsesform: "fastansat" });
    await set(ref(db, `tenants/${T}/leverandoerer/lv-hydra`),
      { navn: "Hydra-Grene", kategori: "reservedele", aktiv: true });
    /* ⚠ `varer.kundeId` SLÅR OP I `kunder/`. Uden posten her blev fixturet
       afvist for ALLE — også admin — og en naiv måling ville have skrevet
       "ingen rolle kan skrive varer" i tabellen. Det var netop dét
       fixtur-vagten ovenfor fangede, første gang filen kørte. */
    await set(ref(db, `tenants/${T}/kunder/k1`),
      { navn: "Museum Sønderjylland", aktiv: true });
  });

  /* ── Måling: hver rolle, hver node ────────────────────────────────── */
  for (const n of NODER) {
    maalt[n.navn] = {};
    for (const rolle of ROLLER) {
      const db = som(rolle);
      const noegle = n.egenUid ? null : `probe-${rolle}`;
      const sti = n.egenUid
        ? n.sti().replace("EGEN", `uid-${rolle}`)
        : n.sti(noegle);
      try { await set(ref(db, `tenants/${T}/${sti}`), n.post); maalt[n.navn][rolle] = true; }
      catch { maalt[n.navn][rolle] = false; }
    }
  }
});

after(async () => {
  await miljoe?.cleanup();
});

describe("⚠ FIXTURET SKAL VÆRE GYLDIGT — ellers måler vi ingenting", () => {
  it("admin kan skrive hvert eneste fixtur", () => {
    /* Bliver et fixtur afvist for admin, er posten forkert — ikke rollen. En
       matrix hvor "nej" nogle steder betyder "jeg skrev fixturet forkert", er
       ubrugelig, og den ser rigtig ud. */
    const daarlige = NODER.filter((n) => !maalt[n.navn].admin).map((n) => n.navn);
    assert.deepEqual(daarlige, [],
      "admin blev afvist — fixturet er ugyldigt for de her noder, og målingen " +
      "siger derfor intet om rollerne");
  });
});

describe("Skrivematrixen — målt", () => {
  /* ⚠ SNAPSHOT. Tabellen er MÅLT, og den står her så en ændring skal være
     bevidst. Flytter nogen en permission mellem to roller, bliver den her
     rød — og så skal ROLLER.md rettes i samme ombæring.

     Læses som: hvilke roller kan skrive noden. */
  const FORVENTET = {
    "kunder": ["disponent", "koordinator", "admin"],
    "koeretoejer": ["disponent", "admin"],
    "personale": ["admin"],
    "kompetencer": ["admin"],
    "fravaer": ["disponent", "koordinator", "admin"],
    "leverandoerer": ["disponent", "koordinator", "admin"],
    "indkoeb": ["disponent", "koordinator", "admin"],
    "lagre": ["admin"],
    "satser": ["admin"],
    "omkostninger": ["admin"],
    "varer": ["lagermedarbejder", "admin"],
    "reolpladser": ["lagermedarbejder", "admin"],
    "brugerlayout (sin egen)": ROLLER,
  };

  for (const n of NODER) {
    it(`${n.navn}`, () => {
      const kan = ROLLER.filter((r) => maalt[n.navn][r]);
      assert.deepEqual(kan, FORVENTET[n.navn],
        `${n.navn}: målt [${kan.join(", ")}] — forventet [${FORVENTET[n.navn].join(", ")}]`);
    });
  }

  it("⚠ INGEN NODE ER ENS FOR ALLE — undtagen brugerens eget layout", () => {
    /* Modsat læsesiden, hvor 48 af 55 stier er ens for alle syv. Skrivesiden
       er finkornet, og forskellen mellem de to er hele pointen i ROLLER.md. */
    const ensForAlle = NODER
      .filter((n) => ROLLER.every((r) => maalt[n.navn][r]))
      .map((n) => n.navn);
    assert.deepEqual(ensForAlle, ["brugerlayout (sin egen)"]);
  });

  it("⚠ EN CHAUFFØR KAN IKKE SKRIVE ANDET END SIT EGET LAYOUT", () => {
    /* Den mindst betroede rolle. Kan han skrive en kunde eller en sats, er
       det ikke en detalje — det er adgangsmodellen der er faldet fra
       hinanden. (Han kan skrive sin egen indberetning; den node står ikke
       her, fordi reglen er "(skriv OG din egen) ELLER skrivAlle" og derfor
       hører i rules.indberetninger.test.mjs.) */
    const kan = NODER.filter((n) => maalt[n.navn].chauffoer).map((n) => n.navn);
    assert.deepEqual(kan, ["brugerlayout (sin egen)"]);
  });
});
