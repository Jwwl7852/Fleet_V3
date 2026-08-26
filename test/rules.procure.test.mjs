/* test/rules.procure.test.mjs
 * Procures to nye noder — beslutning 78.
 *
 * ⚠ HVORFOR DE ER LUKKEDE. `indkoebsbehov` og `indkoebsordrer` er begge
 * `.write: false`, og det er ikke en manglende rettighed: casehandler,
 * disponent og admin HAR alle `indkoeb.skriv`. Det er VEJEN der er lukket.
 *
 * Et behov der bliver til en ordre, ændrer TO poster — behovet får sin
 * ordrereference, og ordren får sin linje. De skal skrives atomisk eller slet
 * ikke. Kunne en klient skrive den ene halvdel, ville et behov kunne stå som
 * "bestilt" uden en ordre der findes. Samme ordning som `opgaver` (45),
 * `kasseudlaan` (37) og `enheder` (39).
 *
 * ⚠ OG PRØVEN SKAL KUNNE FEJLE. En regel ingen har set afvise noget, er en
 * påstand. Derfor prøver hver enkelt både det lovlige og det ulovlige.
 *
 * Koer: npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get, update } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";

/* Eget tenant-id: node --test kører filerne parallelt. */
const TENANT = "procureA";
let miljoe;

const som = (uid, rolle) =>
  miljoe.authenticatedContext(uid, {
    tenant: TENANT, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const sti = (node, id) => `tenants/${TENANT}/${node}/${id}`;

const BEHOV = {
  vare: "Træplader 22 mm", kilde: "snedkeri", status: "nyt",
  oprettetMs: 1786000000000, oprettetAf: "uid-anders",
};
const ORDRE = {
  nummer: "BST-2026-00001", leverandoerId: "lv-stark", status: "kladde",
  oprettetMs: 1786000000000, oprettetAf: "uid-jens",
};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-procure",
    database: {
      host: "127.0.0.1", port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  /* ⚠ MARKØREN OG MODULET FØRST. Uden `_findes` afviser hver regel alt, og
     uden `moduler.indkoeb` er noden slet ikke læsbar — så ville hver prøve
     herunder fejle af den forkerte grund. */
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${TENANT}/_findes`), true);
    await set(ref(db, `tenants/${TENANT}/moduler`), { dashboard: true, indkoeb: true });
  });
});

after(async () => { await miljoe?.cleanup(); });

describe("Vejen ind er lukket for alle", () => {
  /**
   * ⚠ DET ER IKKE EN MANGLENDE RETTIGHED. Admin har `indkoeb.skriv` og bliver
   * afvist alligevel — fordi skrivningen hører i en Cloud Function der kan
   * skrive begge halvdele på én gang.
   */
  it("⚠ ADMIN KAN IKKE SKRIVE ET BEHOV — og han HAR indkoeb.skriv", async () => {
    const db = som("admin1", "admin");
    assert.ok(permStrengFraRolle("admin").includes("|indkoeb.skriv|"),
      "forudsætningen holder ikke: admin har ikke indkoeb.skriv");
    await assertFails(set(ref(db, sti("indkoebsbehov", "b1")), BEHOV));
  });

  it("⚠ ADMIN KAN HELLER IKKE SKRIVE EN ORDRE", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, sti("indkoebsordrer", "o1")), ORDRE));
  });

  /* ⚠ OG HELLER IKKE ET FELT AD GANGEN. `.write` kaskaderer nedad, så en
     lukket forælder lukker børnene — men det er værd at måle, for det var
     netop et to-trins smuthul beslutning 52 fandt et andet sted. */
  it("⚠ HELLER IKKE ET FELT AD GANGEN", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `${sti("indkoebsbehov", "b1")}/status`), "bestilt"));
    await assertFails(update(ref(db, sti("indkoebsordrer", "o1")), { status: "sendt" }));
  });

  it("en chauffør kan heller ikke — og det er den samme grund", async () => {
    const db = som("chauffoer1", "chauffoer");
    await assertFails(set(ref(db, sti("indkoebsbehov", "b2")), BEHOV));
  });
});

/* ⚠ HER LÅ SEKS PRØVER DER SKULLE VISE AT FORMEN HÅNDHÆVES — og de målte
   ingenting. `withSecurityRulesDisabled` slår ALLE regler fra, også
   `.validate`, så en post uden `vare` blev taget imod og prøven troede den
   havde bevist noget.

   ⚠ OG CLAUDE.md ADVAREDE MOD NETOP DET, om `opgaver`:

     "Skriv ikke en regelprøve der 'afviser' en opgave — den ville være grøn
      fordi skrivningen er lukket, ikke fordi posten var forkert."

   Her var det omvendt: rød af den forkerte grund. Men lærestykket er det
   samme — **på en node med `.write: false` kan en regelprøve kun måle at
   vejen er lukket.** `.validate`-blokken beskriver stadig den form serveren
   skal overholde, og håndhævelsen ligger i `valideBehov()` og
   `valideOrdre()` i `fleet/procure.js`, som prøves i
   `test/procure.test.mjs`. Se beslutning 78. */

describe("Læsningen følger modulet", () => {
  it("en kunde MED Procure kan læse begge noder", async () => {
    const db = som("admin1", "admin");
    await assertSucceeds(get(ref(db, `tenants/${TENANT}/indkoebsbehov`)));
    await assertSucceeds(get(ref(db, `tenants/${TENANT}/indkoebsordrer`)));
  });

  /**
   * ⚠ UDEN MODULET ER DE LUKKEDE. Det er den kommercielle grænse, og den er
   * håndhævet i reglen — ikke i menuen. En kunde der taster stien alligevel,
   * skal afvises af serveren.
   */
  it("⚠ EN KUNDE UDEN PROCURE FÅR INGEN AF DEM", async () => {
    const UDEN = "procureUden";
    await miljoe.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await set(ref(db, `tenants/${UDEN}/_findes`), true);
      await set(ref(db, `tenants/${UDEN}/moduler`), { dashboard: true });
    });
    const db = miljoe.authenticatedContext("u-uden", {
      tenant: UDEN, rolle: "admin", perms: permStrengFraRolle("admin"),
    }).database();
    await assertFails(get(ref(db, `tenants/${UDEN}/indkoebsbehov`)));
    await assertFails(get(ref(db, `tenants/${UDEN}/indkoebsordrer`)));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ordreMailSend'S EGEN POST — Skive 4D. Samme lukningsmønster som
   rules.dokumenter.test.mjs: `indkoebsordrer` er `.write: false`, og
   `mail/$sendRequestId` arver det — der er derfor INGEN klient-skrivevej at
   demonstrere en "gyldig post" igennem. Testene spørger om det der FAKTISK
   kan efterprøves: at ingen kan skrive den, uanset permission, og at den er
   tenant-isoleret og læsbar som resten af ordren.
   ══════════════════════════════════════════════════════════════════════════ */
describe("mail-recorden under en ordre er lukket for alle — Skive 4D", () => {
  const ORDRE_GODKENDT = "o-godkendt";
  const SRID = "srq-abc123";
  const ANDEN_TENANT = "procureAnden4d";
  const mailSti = (tenant, ordreId, srid) =>
    `tenants/${tenant}/indkoebsordrer/${ordreId}/mail/${srid}`;

  before(async () => {
    await miljoe.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      for (const t of [TENANT, ANDEN_TENANT]) {
        await set(ref(db, `tenants/${t}/_findes`), true);
        await set(ref(db, `tenants/${t}/moduler`), { dashboard: true, indkoeb: true });
      }
      await set(ref(db, sti("indkoebsordrer", ORDRE_GODKENDT)),
        { ...ORDRE, status: "godkendt" });
      /* ⚠ SEEDET SOM ordreMailSend (ADMIN SDK) VILLE HAVE SKREVET DEN. */
      await set(ref(db, mailSti(TENANT, ORDRE_GODKENDT, SRID)), {
        ms: 1786000000000, mailStatus: "accepteret", sprog: "da", afsendtAf: "uid-jens",
      });
    });
  });

  it("⚠ EN ADMIN KAN IKKE SKRIVE MAIL-RECORDEN DIREKTE — heller ikke med indkoeb.skriv", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, mailSti(TENANT, ORDRE_GODKENDT, "srq-forsoeg")), {
      ms: Date.now(), mailStatus: "accepteret",
    }));
  });

  it("⚠ HELLER IKKE EN OPDATERING AF EN EKSISTERENDE POST", async () => {
    const db = som("admin1", "admin");
    await assertFails(update(ref(db, mailSti(TENANT, ORDRE_GODKENDT, SRID)), { mailStatus: "fejlet" }));
  });

  it("⚠ INGEN HARDSLET — set(null) afvises", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, mailSti(TENANT, ORDRE_GODKENDT, SRID)), null));
  });

  it("mail-recorden læses som resten af ordren, med indkoeb.laes", async () => {
    const db = som("laeser1", "admin");
    const snap = await get(ref(db, mailSti(TENANT, ORDRE_GODKENDT, SRID)));
    assert.equal(snap.val()?.mailStatus, "accepteret");
  });

  it("⚠ TENANT A KAN IKKE LÆSE ELLER SKRIVE TENANT B's MAIL-RECORD", async () => {
    await miljoe.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await set(ref(db, `tenants/${ANDEN_TENANT}/indkoebsordrer/${ORDRE_GODKENDT}`),
        { ...ORDRE, status: "godkendt" });
      await set(ref(db, mailSti(ANDEN_TENANT, ORDRE_GODKENDT, SRID)), {
        ms: 1786000000000, mailStatus: "accepteret",
      });
    });
    const somA = som("uid-a", "admin"); // TENANT, ikke ANDEN_TENANT
    await assertFails(get(ref(somA, mailSti(ANDEN_TENANT, ORDRE_GODKENDT, SRID))));
    await assertFails(set(ref(somA, mailSti(ANDEN_TENANT, ORDRE_GODKENDT, "srq-fra-a")),
      { ms: Date.now(), mailStatus: "accepteret" }));
  });

  it("⚠ REGELFILEN SIGER DET SAMME — mail har ikke fået sin egen .write", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10))
    );
    const ordre = regler.rules.tenants.$tenantId.indkoebsordrer;
    assert.equal(ordre[".write"], false,
      "indkoebsordrer er skrivbar igen — så kan en mail-record forfalskes uden om ordreMailSend");
    assert.ok(!ordre.$ordreId.mail[".write"],
      "mail har fået sin egen .write — den skal arve indkoebsordrer/.write:false");
  });
});
