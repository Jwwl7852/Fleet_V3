/* test/rules.audit.test.mjs
 * Punkt 4: central audit-service.
 *
 * DEFINITION OF DONE:
 *   - en bruger med ALLE permissions kan ikke skrive, ændre eller slette
 *     en audit-post
 *   - tenant A kan ikke læse tenant B's log
 *   - en bruger i egen tenant UDEN audit.laes kan ikke læse loggen
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, update, remove, get } from "firebase/database";
import {
  PERM, ALLE_PERMS, ROLLE_PERMS, permStreng, permStrengFraRolle,
} from "../src/fleet/permissions.js";
/* Politikken importeres fra audit-regler.js, ikke audit.js: den sidste
   importerer firebase og kan ikke indlæses uden Vite. Det er samme grund til
   at Cloud Function'en skal bruge audit-regler.js. */
import { diff, klasseFor, AUDIT, LOGBARE_FELTER, retentionFor, KLASSER }
  from "../src/fleet/audit-regler.js";

const MIN = "tenantAudA";
const FREMMED = "tenantAudB";

let miljoe;

const som = (uid, tenant, perms) =>
  miljoe.authenticatedContext(uid, { tenant, rolle: "admin", perms: permStreng(perms) }).database();

const somRolle = (uid, rolle, tenant = MIN) =>
  miljoe
    .authenticatedContext(uid, { tenant, rolle, perms: permStrengFraRolle(rolle) })
    .database();

const auditSti = (tenant, rest = "") => `audit/${tenant}/drift/2026/08${rest}`;

const POST = {
  ms: 1786000000000, brugerUid: "nogen", rolle: "disponent",
  handling: "aendre", objekt: "kunder", objektId: "k1",
  aendrede: ["navn"], foer: {}, efter: {},
};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-audit",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  /* Cloud Function'ens rolle: Admin SDK gaar uden om reglerne. Uden en
     eksisterende post kunne "kan ikke aendres" vaere sandt bare fordi der
     ikke var noget at aendre. */
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const t of [MIN, FREMMED]) {
      await set(ref(db, `tenants/${t}/_findes`), true);
      await set(ref(db, `${auditSti(t)}/post1`), { ...POST, objektId: `i-${t}` });
    }
  });
});

after(async () => {
  await miljoe?.cleanup();
});

/* ---- Append-only ---------------------------------------------------- */

describe("auditloggen er append-only", () => {
  /* Selve definition of done. ALLE 19 permissions, inklusive audit.laes. */
  it("en bruger med ALLE permissions kan hverken oprette, ændre eller slette", async () => {
    const db = som("uid-alt", MIN, ALLE_PERMS);
    const p = `${auditSti(MIN)}/post1`;

    await assertFails(set(ref(db, `${auditSti(MIN)}/ny`), POST));
    await assertFails(set(ref(db, p), { ...POST, handling: "opret" }));
    await assertFails(update(ref(db, p), { handling: "opret" }));
    await assertFails(update(ref(db, p), { objektId: "noget-andet" }));
    await assertFails(remove(ref(db, p)));
    await assertFails(remove(ref(db, `audit/${MIN}`)));
  });

  it("admin-presettet kan det heller ikke — .write: false gælder alle", async () => {
    const db = somRolle("uid-admin", "admin");
    await assertFails(set(ref(db, `${auditSti(MIN)}/adm`), POST));
    await assertFails(remove(ref(db, `${auditSti(MIN)}/post1`)));
  });

  it("man kan ikke smugle en audit-post ind i en multi-path update", async () => {
    const db = som("uid-smug", MIN, ALLE_PERMS);
    await assertFails(
      update(ref(db, "/"), {
        [`tenants/${MIN}/kunder/lovlig`]: { navn: "Kunde", aktiv: true },
        [`${auditSti(MIN)}/smuglet`]: POST,
      })
    );
    const kontrol = som("uid-smug2", MIN, ALLE_PERMS);
    const snap = await get(ref(kontrol, `tenants/${MIN}/kunder/lovlig`));
    assert.equal(snap.exists(), false, "Den lovlige halvdel må ikke lande når audit-delen afvises.");
  });
});

/* ---- Læsning -------------------------------------------------------- */

describe("hvem må læse loggen", () => {
  it("med audit.laes: egen tenants log kan læses", async () => {
    const db = som("uid-laes", MIN, [PERM.auditLaes]);
    const snap = await assertSucceeds(get(ref(db, auditSti(MIN))));
    assert.equal(snap.val().post1.objektId, `i-${MIN}`);
  });

  /* Loggen er selv foelsom: den afsloerer hvilke kunder der bliver kigget paa,
     og af hvem. Tenant-medlemskab er derfor ikke nok. */
  it("UDEN audit.laes: afvist, også med alle andre 18 permissions", async () => {
    const udenAudit = ALLE_PERMS.filter((p) => p !== PERM.auditLaes);
    const db = som("uid-udenaudit", MIN, udenAudit);
    await assertFails(get(ref(db, auditSti(MIN))));
    await assertFails(get(ref(db, `audit/${MIN}`)));
  });

  it("tenant A kan ikke læse tenant B's log — heller ikke med audit.laes", async () => {
    const db = som("uid-a", MIN, ALLE_PERMS);
    await assertFails(get(ref(db, auditSti(FREMMED))));
    await assertFails(get(ref(db, `audit/${FREMMED}`)));
    await assertFails(get(ref(db, "audit")));
  });

  it("ikke-logget-ind kan ingenting", async () => {
    const db = miljoe.unauthenticatedContext().database();
    await assertFails(get(ref(db, auditSti(MIN))));
    await assertFails(set(ref(db, `${auditSti(MIN)}/anon`), POST));
  });

  it("et opdigtet tenant-claim kan ikke læse en log der ikke findes", async () => {
    const db = som("uid-spoeg", "tenantAudSpoegelse", ALLE_PERMS);
    await assertFails(get(ref(db, auditSti("tenantAudSpoegelse"))));
  });
});

/* ---- Revisor -------------------------------------------------------- */

describe("revisor-presettet", () => {
  it("kan læse loggen", async () => {
    const db = somRolle("uid-rev", "revisor");
    await assertSucceeds(get(ref(db, auditSti(MIN))));
  });

  it("kan ikke skrive NOGET — hverken i loggen eller i tenanten", async () => {
    const db = somRolle("uid-rev2", "revisor");
    await assertFails(set(ref(db, `${auditSti(MIN)}/rev`), POST));
    for (const [node, post] of [
      ["kunder", { navn: "K", aktiv: true }],
      ["opgaver", {}],
      ["indberetninger", { art: "braendstof", forloeb: "ny",
        kmStand: 184320, liter: 410, oprettetAf: "uid-rev2", oprettetMs: 1786000000000 }],
    ]) {
      await assertFails(set(ref(db, `tenants/${MIN}/${node}/rev`), post));
    }
  });

  it("presettet indeholder ikke én eneste skrive-permission", () => {
    for (const p of ROLLE_PERMS.revisor) {
      assert.ok(!p.includes(".skriv"), `revisor har skrive-permission "${p}"`);
    }
  });

  it("der findes ingen audit.skriv i kataloget", () => {
    assert.ok(
      !ALLE_PERMS.some((p) => p.startsWith("audit.skriv")),
      "audit.skriv må ikke findes — loggen skrives kun af en Cloud Function."
    );
  });
});

/* ---- Ingen følsomme oplysninger i posten ---------------------------- */

describe("diff() lækker ikke", () => {
  it("navngiver alle ændrede felter, men viser kun værdier fra allowlisten", () => {
    const foer = {
      navn: "Picasso, Pablo", adresse: "Strandvejen 123", note: "Værdi 18 mio.",
      beloebOere: 1800000000, tilstand: "kladde", };
    const efter = { ...foer, navn: "Monet, Claude", adresse: "Strandvejen 125", beloebOere: 1900000000, tilstand: "reserveret" };
    const d = diff(foer, efter);

    assert.deepEqual(d.aendrede, ["adresse", "beloebOere", "navn", "tilstand"]);
    assert.deepEqual(d.foer, { beloebOere: 1800000000, tilstand: "kladde" });
    assert.deepEqual(d.efter, { beloebOere: 1900000000, tilstand: "reserveret" });

    const serialiseret = JSON.stringify(d);
    for (const hemmelighed of ["Picasso", "Monet", "Strandvejen", "18 mio"]) {
      assert.ok(!serialiseret.includes(hemmelighed), `"${hemmelighed}" slap ud i auditposten`);
    }
  });

  it("uændrede felter kommer slet ikke med", () => {
    const d = diff({ navn: "A", beloebOere: 100 }, { navn: "A", beloebOere: 200 });
    assert.deepEqual(d.aendrede, ["beloebOere"]);
    assert.deepEqual(d.foer, { beloebOere: 100 });
  });

  it("fritekstfelter står ikke på allowlisten", () => {
    for (const felt of ["navn", "adresse", "note", "noter", "beskrivelse", "besk",
                        "begrundelse", "email", "telefon", "kontaktperson", "aarsag"]) {
      assert.ok(!LOGBARE_FELTER.has(felt), `"${felt}" må ikke være logbart`);
    }
  });
});

/* ---- Retention-klasser ---------------------------------------------- */

describe("retention-klassen ligger i stien", () => {
  /* Mekanismen skal kunne bære forskellige grænser pr. klasse, selv om alle
     tre starter på 24. Ellers bliver den juridiske afgørelse en omskrivning
     frem for en talændring. */
  it("hver klasse har sin egen grænse, og der er en fallback", () => {
    assert.deepEqual(KLASSER.sort(), ["drift", "regnskab", "sikkerhed"]);
    for (const k of KLASSER) assert.equal(typeof retentionFor(k), "number");
    assert.equal(retentionFor("findes-ikke"), retentionFor("drift"));
  });

  it("regnskabsobjekter og sikkerhedshandlinger får deres egen partition", () => {
    assert.equal(klasseFor(AUDIT.aendre, "fakturaer"), "regnskab");
    assert.equal(klasseFor(AUDIT.aendre, "satser"), "regnskab");
    assert.equal(klasseFor(AUDIT.tilstandsskift, "bookinger"), "regnskab");
    assert.equal(klasseFor(AUDIT.login, "bruger"), "sikkerhed");
    assert.equal(klasseFor(AUDIT.adgangNaegtet, "kunder"), "sikkerhed");
    assert.equal(klasseFor(AUDIT.eksporter, "kunder"), "sikkerhed");
    assert.equal(klasseFor(AUDIT.laes, "kunder"), "drift");
    assert.equal(klasseFor(AUDIT.aendre, "opgaver"), "drift");
  });
});
