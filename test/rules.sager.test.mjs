/* test/rules.sager.test.mjs
 * Skive 3C, punkt 8 — sikkerhedsbaseline for `sager/` og `sensitive/sager/`.
 *
 * ⚠ IKKE EN NY SECURITY-FEATURE. Dette er mekanisk BEVIS for at den
 * eksisterende sagsfunktion følger platformens model — tenant-isolation,
 * mindste privilegium og at det klassificerede fortsat er klassificeret.
 * Ingen af de to noder havde en dedikeret regelprøve før denne skive.
 *
 * ⚠ DE TO NODER ER IKKE ENS. Den generelle `sager/` er `.write: false` for
 * ENHVER klient — kun de fem Cloud Functions (admin-SDK) kan skrive, samme
 * mønster som `opgaver/` og `kasseudlaan/`. Men `sensitive/sager/` er
 * SKRIVBAR, med samme permission-kombination (`sag.skriv` +
 * `sag.sensitiveLaes`) som `sagBeskedSkriv()` selv kræver — nøjagtig samme
 * mønster som `sensitive/indberetninger` fra Skive 3B. Det er ikke et hul:
 * appen bruger kun Cloud Function-vejen, men reglen er den samme spærring
 * en direkte skrivning ville møde. Prøverne herunder beviser derfor: at
 * LÆSNING er korrekt begrænset af tenant og permission på begge noder, at
 * SKRIVNING til den generelle post er lukket for enhver klient, og at
 * skrivning til det klassificerede kræver begge permissions og aldrig kan
 * krydse en tenant-grænse.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import { PERM, ROLLE_PERMS, permStreng, permStrengFraRolle } from "../src/fleet/permissions.js";

const A = "tenantSagA";
const B = "tenantSagB";

let miljoe;

const som = (tenantId) => (uid, perms) =>
  miljoe.authenticatedContext(uid, {
    tenant: tenantId, rolle: "admin", perms: permStreng(perms),
  }).database();
const somA = som(A);

const somRolle = (tenantId, uid, rolle) =>
  miljoe.authenticatedContext(uid, {
    tenant: tenantId, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const stiA = (rest) => `tenants/${A}/${rest}`;
const stiB = (rest) => `tenants/${B}/${rest}`;

const SAG = (o = {}) => ({
  nummer: "FLT-2026-00001", art: "fleet", tilstand: "aaben",
  emne: "Test", modul: "flaade", oprettetAf: "uid-admin", oprettetMs: 1,
  ...o,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-sager",
    database: {
      host: "127.0.0.1", port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const t of [A, B]) {
      await set(ref(db, `tenants/${t}/_findes`), true);
    }
    /* ⚠ ÉN SAG I HVER TENANT, SKREVET UDEN OM REGLERNE — samme greb som
       provisioneringen bruger (admin-SDK), fordi der ingen klientvej er ind. */
    await set(ref(db, stiA("sager/sag-a")), SAG());
    await set(ref(db, stiA("sensitive/sager/sag-a")), {
      beskeder: { b1: { ms: 1, retning: "udgaaende", tekst: "Hej" } },
    });
    await set(ref(db, stiB("sager/sag-b")), SAG({ nummer: "FLT-2026-00002" }));
    await set(ref(db, stiB("sensitive/sager/sag-b")), {
      beskeder: { b1: { ms: 1, retning: "udgaaende", tekst: "Hemmeligt" } },
    });
  });
});

after(async () => { await miljoe?.cleanup(); });

/* ══════════════════════════════════════════════════════════════════════
   TENANT-ISOLATION
   ══════════════════════════════════════════════════════════════════════ */
describe("tenant-isolation", () => {
  it("⚠ EN BRUGER I TENANT A KAN IKKE LÆSE EN SAG I TENANT B", async () => {
    const dbA = somA("u1", [PERM.sagLaes]);
    await assertFails(get(ref(dbA, stiB("sager/sag-b"))));
  });

  it("⚠ OG IKKE DET KLASSIFICEREDE I TENANT B, HELLER IKKE MED ALLE PERMS", async () => {
    const dbA = somA("u2", [PERM.sagLaes, PERM.sagSensitiveLaes, PERM.sagSkriv]);
    await assertFails(get(ref(dbA, stiB("sensitive/sager/sag-b"))));
  });

  it("⚠ OG KAN SLET IKKE SKRIVE I TENANT B — .write er false alligevel", async () => {
    const dbA = somA("u3", [PERM.sagLaes, PERM.sagSensitiveLaes, PERM.sagSkriv]);
    await assertFails(set(ref(dbA, stiB("sager/sag-b/emne")), "Kapret"));
  });

  it("egen tenant virker uændret", async () => {
    const dbA = somA("u4", [PERM.sagLaes]);
    await assertSucceeds(get(ref(dbA, stiA("sager/sag-a"))));
  });
});

/* ══════════════════════════════════════════════════════════════════════
   MINDSTE PRIVILEGIUM
   ══════════════════════════════════════════════════════════════════════ */
describe("mindste privilegium", () => {
  it("⚠ UDEN sag.laes KAN SAGEN SLET IKKE LÆSES", async () => {
    const db = somA("p1", []);
    await assertFails(get(ref(db, stiA("sager/sag-a"))));
  });

  it("MED sag.laes kan den generelle post læses", async () => {
    const db = somA("p2", [PERM.sagLaes]);
    await assertSucceeds(get(ref(db, stiA("sager/sag-a"))));
  });

  it("⚠ sag.laes ALENE GIVER IKKE ADGANG TIL DET KLASSIFICEREDE", async () => {
    /* Samme skel som disponenten på indberetninger: AT der er en sag, er
       ikke det samme som at kunne læse tråden. */
    const db = somA("p3", [PERM.sagLaes]);
    await assertFails(get(ref(db, stiA("sensitive/sager/sag-a"))));
  });

  it("MED sag.sensitiveLaes kan det klassificerede læses", async () => {
    const db = somA("p4", [PERM.sagSensitiveLaes]);
    await assertSucceeds(get(ref(db, stiA("sensitive/sager/sag-a"))));
  });

  it("⚠ DEN GENERELLE SAG (sager/) ER .write: false FOR ENHVER KLIENT", () => {
    /* .write: false på FORÆLDREN kaskaderer til $sagId, som derfor ikke har
       (og ikke skal have) sin egen .write — samme mønster som opgaver/ og
       kasseudlaan/. Vejen er lukket, ikke en manglende permission. Prøvet
       synkront her; selve skrivningen prøves i praksis nedenfor. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8").replace(/^\s*\/\/.*$/gm, ""));
    const node = regler.rules.tenants.$tenantId.sager;
    assert.equal(node[".write"], false);
  });

  it("⚠ OG FORSØGET AFVISES I PRAKSIS — admin, alle sag-permissions", async () => {
    const db = somA("p5", [
      PERM.sagLaes, PERM.sagSensitiveLaes, PERM.sagSkriv,
      PERM.sagKarantaeneFrigiv, PERM.sagAftaleBekraeft,
    ]);
    await assertFails(set(ref(db, stiA("sager/sag-a/tilstand")), "afsluttet"));
  });

  /* ⚠ sensitive/sager DERIMOD ER SKRIVBAR — MED VILJE, samme mønster som
     sensitive/indberetninger (Skive 3B). sagBeskedSkriv() bruger IKKE en
     lukket vej: den bruger DEN SAMME permission-kombination reglen selv
     kræver. En direkte klientskrivning er derfor teknisk mulig, men
     appen bruger kun Cloud Function-vejen — og reglen er den samme
     spærring begge veje møder. */
  it("⚠ sensitive/sager KRÆVER sag.skriv OG sag.sensitiveLaes — begge", async () => {
    const kunLaes = somA("p6", [PERM.sagSensitiveLaes]);
    await assertFails(set(ref(kunLaes, stiA("sensitive/sager/sag-a/beskeder/ny")),
      { ms: 1, retning: "udgaaende", tekst: "Uden skriv" }));

    const begge = somA("p7", [PERM.sagSkriv, PERM.sagSensitiveLaes]);
    await assertSucceeds(set(ref(begge, stiA("sensitive/sager/sag-a/beskeder/ny2")),
      { ms: 1, retning: "udgaaende", tekst: "Med begge" }));
  });

  it("⚠ MEN IKKE PÅ TVÆRS AF TENANT — samme regel som base-noden", async () => {
    const dbA = somA("p8", [PERM.sagSkriv, PERM.sagSensitiveLaes]);
    await assertFails(set(ref(dbA, stiB("sensitive/sager/sag-b/beskeder/ny")),
      { ms: 1, retning: "udgaaende", tekst: "Kapret" }));
  });

  it("⚠ DISPONENTEN HAR KUN sagLaes — hverken sensitivt eller skriv", () => {
    /* Læst af den faktiske rolle-liste, ikke antaget — se permissions.js. */
    assert.ok(ROLLE_PERMS.disponent.includes(PERM.sagLaes));
    assert.ok(!ROLLE_PERMS.disponent.includes(PERM.sagSensitiveLaes));
    assert.ok(!ROLLE_PERMS.disponent.includes(PERM.sagSkriv));
  });

  /* ⚠ SAMME SKEL, PRØVET MED DEN RIGTIGE ROLLE — ikke en syntetisk
     permission-kombination. Disponenten skal vide AT bilen har en åben
     værkstedssag for at kunne planlægge; hvad der står i tråden, er ikke
     hans. */
  it("⚠ EN RIGTIG disponent KAN LÆSE SAGEN, MEN IKKE TRÅDEN", async () => {
    const disp = somRolle(A, "d1", "disponent");
    await assertSucceeds(get(ref(disp, stiA("sager/sag-a"))));
    await assertFails(get(ref(disp, stiA("sensitive/sager/sag-a"))));
  });

  it("⚠ EN RIGTIG koordinator KAN SKRIVE PÅ TRÅDEN — begge permissions følger rollen", async () => {
    const koord = somRolle(A, "k1", "koordinator");
    await assertSucceeds(set(ref(koord, stiA("sensitive/sager/sag-a/beskeder/ny3")),
      { ms: 1, retning: "udgaaende", tekst: "Fra koordinatoren" }));
  });

  it("⚠ OG HELLER IKKE koordinatoren KAN LÆSE PÅ TVÆRS AF TENANT", async () => {
    const koordB = somRolle(B, "k2", "koordinator");
    await assertFails(get(ref(koordB, stiA("sensitive/sager/sag-a"))));
  });

  it("kun koordinator (og admin) har karantaeneFrigiv og aftaleBekraeft blandt driftsrollerne", () => {
    for (const rolle of ["chauffoer", "casehandler", "disponent", "lagermedarbejder", "revisor"]) {
      assert.ok(!ROLLE_PERMS[rolle].includes(PERM.sagKarantaeneFrigiv), rolle);
      assert.ok(!ROLLE_PERMS[rolle].includes(PERM.sagAftaleBekraeft), rolle);
    }
    assert.ok(ROLLE_PERMS.koordinator.includes(PERM.sagKarantaeneFrigiv));
    assert.ok(ROLLE_PERMS.koordinator.includes(PERM.sagAftaleBekraeft));
  });
});

/* ══════════════════════════════════════════════════════════════════════
   FORMEN — additivt felt fra Skive 3C, samme disciplin som resten af noden
   ══════════════════════════════════════════════════════════════════════ */
describe("afslutningsAarsag — det nye felt", () => {
  it("står på $andet-listen, ikke løst", async () => {
    /* $andet: false betyder ethvert felt der IKKE er navngivet, afvises —
       inklusive et forsøg på at skrive afslutningsAarsag uden om.
       Skrivningen selv er stadig lukket (se testen ovenfor); det her
       beviser at feltet blev TILFØJET til skemaet og ikke bare accepteret
       som en tilfældighed i $andet. */
    const regler = readFileSync("firebase.rules.json", "utf8");
    const blok = regler.slice(
      regler.indexOf('"sager": {', regler.indexOf('"sager": {') + 1));
    assert.ok(blok.slice(0, 6000).includes("afslutningsAarsag"),
      "afslutningsAarsag mangler i sagens skema");
  });
});
