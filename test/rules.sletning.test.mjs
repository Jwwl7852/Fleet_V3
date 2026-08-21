/* test/rules.sletning.test.mjs
 * Hvad kan en KLIENT hardslette?
 *
 * ⚠ HVORFOR FILEN FINDES. Målt i emulatoren, før noget blev rettet:
 *
 *     20 af 23 poster kunne hardslettes
 *     17 af 23 HELE noder kunne tømmes i ÉT kald
 *
 * — af en bruger med de permissions rollen i forvejen har. Hele kunderegistret,
 * hele prisgrundlaget, alle indkøb, hele den klassificerede personalemappe.
 *
 * To ting gjorde det muligt, og de er hver sin fejl:
 *
 *   1. `.write` lå på NODEN. Den kaskaderer, så tilladelsen til at skrive én
 *      post var også tilladelse til at overskrive eller tømme hele noden.
 *   2. Ingen `newData.exists()`. En `.validate` køres ikke ved en sletning —
 *      beslutning 38 og 52 — så formkravene sagde intet om at forsvinde.
 *
 * `CLAUDE.md` har hele tiden sagt "hardslet ikke regnskabsdata", og `skriv.js`
 * har ingen `slet()`. Men en regel er det eneste der gælder: `db.ref().remove()`
 * går uden om klientbiblioteket, og en disciplin der kun findes i frontend, er
 * ikke adgangskontrol.
 *
 * ⚠ PRØVEN ER EN ADFÆRDSPRØVE, IKKE EN TEKSTSØGNING. `indberetninger` bærer
 * `newData.exists()` inde i et ELLER — en uskreven post MÅ trækkes tilbage
 * (beslutning 52) — så en søgning efter strengen ville sige "lukket" om en
 * node der er åben med vilje. Kun et forsøg svarer rigtigt.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds } from "@firebase/rules-unit-testing";
import { ref, set, remove } from "firebase/database";
import { PERM, permStreng } from "../src/fleet/permissions.js";

const T = "tenantSlet";
const UID = "uid-altmuligmand";
let miljoe;

/**
 * ⚠ ALLE PERMISSIONS. Spørgsmålet er ikke "kan en chauffør slette" — det er
 * om der findes NOGEN klient der kan. En bruger med hele nøgleknippet er det
 * skarpeste svar, og den findes: admin har dem alle.
 */
const somAlt = () =>
  miljoe.authenticatedContext(UID, {
    tenant: T, rolle: "admin", perms: permStreng(Object.values(PERM)),
  }).database();

/**
 * Postsstierne læses UD AF REGELFILEN — som nodelisten i rules.tenant.test.mjs.
 *
 * ⚠ EN HÅNDSKREVET LISTE VILLE MISSE DEN NÆSTE NODE. Det var netop dét der
 * skete: `newData.exists()` stod på præcis tre noder — koeretoejer, personale
 * og kompetencer — fordi nogen tænkte over det dér og ikke de tyve andre
 * steder. En ny node med en for løs regel skal fejle her uden at nogen har
 * husket at skrive et testtilfælde.
 */
function skrivbareStier() {
  const regler = JSON.parse(
    readFileSync("firebase.rules.json", "utf8").replace(/^\s*\/\/.*$/gm, "")
  ).rules.tenants.$tenantId;

  const ud = [];
  (function gaa(node, sti) {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (k === ".write") {
        if (typeof v === "string") ud.push(sti);
      } else if (!k.startsWith(".")) {
        gaa(v, sti ? `${sti}/${k}` : k);
      }
    }
  })(regler, "");
  return ud;
}

/** `kunder/$kundeId` → `kunder/id1`. Wildcardet for brugerlayout ER uid'et. */
const somSti = (skabelon) =>
  skabelon.split("/").map((d, i) =>
    !d.startsWith("$") ? d : (skabelon.startsWith("brugerlayout") ? UID : `id${i}`)
  ).join("/");

/** Nodestien: alt over det sidste wildcard. */
const nodeSti = (skabelon) => {
  const dele = somSti(skabelon).split("/");
  dele.pop();
  return dele.join("/");
};

/**
 * De to der MÅ slettes af en klient — og hver har sin grund skrevet ned.
 *
 * ⚠ LISTEN ER UNDTAGELSEN, IKKE REGLEN. Står en node her, er det fordi nogen
 * har besluttet det; alt andet skal være lukket.
 */
const MAA_SLETTES = {
  /* Brugerens EGEN forside. Det er en præference om hans egen skærm, ikke en
     post om noget der er sket — og reglen er `auth.uid === $uid`, så han kan
     kun rydde sin egen. Se beslutning 43. */
  "brugerlayout/$uid": "brugerens eget layout",
  /* En indberetning UDEN underskrift må trækkes tilbage: `FORLOEB` har ingen
     `annulleret`, så uden den åbning ville en fejloprettet post stå for
     altid. Er den underskrevet, er den låst — beslutning 52. */
  "indberetninger/$id": "en uskreven indberetning kan trækkes tilbage",
  /* Satellitten følger sin hovedpost: er der ingen underskrift, er der intet
     bevis at værne om. Er der én, afviser reglen BEGGE dele — det er prøvet
     for sig i rules.indberetninger.test.mjs, og det er dér den hører, fordi
     spærringen afhænger af postens INDHOLD og ikke af dens sti. */
  "sensitive/indberetninger/$id": "den uskrevne satellit følger sin hovedpost",
};

const laegTilbage = async (sti) => {
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `tenants/${T}/${sti}`), { note: "prøve", ms: 1 });
  });
};

const lykkes = async (p) => {
  try { await assertSucceeds(p); return true; } catch { return false; }
};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fleetcontrol-rules-slet",
    database: { rules: readFileSync("firebase.rules.json", "utf8") },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
  });
});
after(async () => { await miljoe?.cleanup(); });

describe("En post hardslettes ikke", () => {
  it("finder de skrivbare stier i regelfilen", () => {
    const stier = skrivbareStier();
    assert.ok(stier.length >= 25,
      `kun ${stier.length} skrivbare stier — regelfilen er skrumpet, eller søgningen er i stykker`);
  });

  /**
   * ⚠ DEN VIGTIGSTE AF DE TO. En node der kan tømmes i ét kald, er ikke en
   * fejl man opdager ved at kigge — den ser ud som en tom skærm.
   */
  it("⚠ INGEN NODE KAN TØMMES I ÉT KALD", async () => {
    const db = somAlt();
    const aabne = [];
    for (const skabelon of skrivbareStier()) {
      const post = somSti(skabelon);
      const node = nodeSti(skabelon);
      if (!node) continue;
      await laegTilbage(post);
      if (await lykkes(remove(ref(db, `tenants/${T}/${node}`)))) aabne.push(node);
      await laegTilbage(post);
    }
    assert.deepEqual(aabne, [],
      "noder der kan tømmes i ét kald. `.write` hører på POSTEN, ikke på noden — den kaskaderer.");
  });

  it("⚠ OG EN ENKELT POST KAN KUN SLETTES DE STEDER DET ER BESLUTTET", async () => {
    const db = somAlt();
    const aabne = [];
    for (const skabelon of skrivbareStier()) {
      const post = somSti(skabelon);
      await laegTilbage(post);
      const kunne = await lykkes(remove(ref(db, `tenants/${T}/${post}`)));
      await laegTilbage(post);
      if (kunne && !MAA_SLETTES[skabelon]) aabne.push(skabelon);
    }
    assert.deepEqual(aabne, [],
      "poster der kan hardslettes uden at nogen har besluttet det. "
      + "En post tages ud af drift med en STATUS og en årsag — se CLAUDE.md.");
  });

  /**
   * ⚠ OG DEN ANDEN VEJ: undtagelserne skal stadig VIRKE.
   *
   * Lukkede vi dem ved et uheld, ville en bruger ikke kunne rydde sin egen
   * forside, og en fejloprettet indberetning ville stå for altid. En
   * undtagelse ingen kan bruge, er en liste der lyver.
   */
  it("de to besluttede undtagelser kan stadig slettes", async () => {
    const db = somAlt();
    for (const skabelon of Object.keys(MAA_SLETTES)) {
      const post = somSti(skabelon);
      await laegTilbage(post);
      assert.ok(await lykkes(remove(ref(db, `tenants/${T}/${post}`))),
        `${skabelon} kan ikke længere slettes — ${MAA_SLETTES[skabelon]}`);
    }
  });
});
