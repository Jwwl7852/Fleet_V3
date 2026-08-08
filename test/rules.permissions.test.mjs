/* test/rules.permissions.test.mjs
 * Punkt 3: permissions som liste frem for rolle-streng.
 *
 * DEFINITION OF DONE: en test der viser at SERVEREN afviser en bruger uden
 * den noedvendige permission. Ikke at UI'et skjuler en knap. Alt herunder
 * gaar gennem databaseemulatoren med rigtige custom claims.
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
import { ref, set, get } from "firebase/database";
import {
  PERM, ALLE_PERMS, ROLLE_PERMS, permStreng, permStrengFraRolle, harPerm,
} from "../src/fleet/permissions.js";

const T = "tenantPerm";

let miljoe;

/** Bruger med et eksplicit permission-saet. rolle er kun til visning. */
const medPerms = (uid, perms, rolle = "casehandler") =>
  miljoe.authenticatedContext(uid, { tenant: T, rolle, perms: permStreng(perms) }).database();

/** Bruger med et rolle-preset. */
const somRolle = (uid, rolle) =>
  miljoe.authenticatedContext(uid, { tenant: T, rolle, perms: permStrengFraRolle(rolle) }).database();

const sti = (node, id) => `tenants/${T}/${node}/${id}`;
const KUNDE = { navn: "Prøvekunde", division: "gods", aktiv: true };

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-perms",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    /* ctx.database() må kun kaldes ÉN gang pr. context. Andet kald forsøger
       at koble emulatoren på en allerede initialiseret instans, og SDK'et
       kaster FIREBASE FATAL ERROR. */
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    await set(ref(db, sti("indberetninger", "andres")), {
      division: "gods", type: "braendstof", km: 100, oprettetAf: "enAnden",
    });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

/* ---- Kataloget, uden emulator ------------------------------------- */

describe("permission-kataloget", () => {
  it("rolle-presets indeholder kun kendte permissions", () => {
    for (const [rolle, perms] of Object.entries(ROLLE_PERMS)) {
      for (const p of perms) {
        assert.ok(ALLE_PERMS.includes(p), `${rolle} har ukendt permission "${p}"`);
      }
    }
  });

  /* Beslutning 5. Naar den staar som en test, kan den ikke forsvinde ved en
     omskrivning uden at nogen ser det. */
  it("disponenten har IKKE booking.godkend", () => {
    assert.ok(!ROLLE_PERMS.disponent.includes(PERM.bookingGodkend));
    assert.ok(ROLLE_PERMS.koordinator.includes(PERM.bookingGodkend));
  });

  it("chaufføren kan kun indberette og skrive i idébanken", () => {
    const skriv = ROLLE_PERMS.chauffoer.filter((p) => p.includes(".skriv"));
    assert.deepEqual(
      skriv.sort(),
      [PERM.idebankSkriv, PERM.indberetningerSkriv].sort()
    );
    /* Læsning af de fire klassificerede objekters general-del har de, som
       alle andre — men intet klassificeret. Se beslutning 17. */
    for (const p of ROLLE_PERMS.chauffoer) {
      assert.ok(!p.includes("sensitiveLaes") && !p.includes("vaerdiLaes"),
        `chaufføren har "${p}"`);
    }
  });

  it("harPerm matcher hele navnet, ikke et præfiks", () => {
    const s = permStreng([PERM.bookingAfvis]);
    assert.ok(harPerm(s, PERM.bookingAfvis));
    assert.ok(!harPerm(s, "booking.afv"));
    assert.ok(!harPerm(s, "booking.afvisAlle"));
    /* En streng uden roer — en Cloud Function der glemte formatet. */
    assert.ok(!harPerm("booking.afvis", PERM.bookingAfvis));
  });
});

/* ---- DoD: serveren afviser ---------------------------------------- */

describe("serveren håndhæver permissions", () => {
  it("MED kunder.skriv: skrivningen går igennem", async () => {
    const db = medPerms("uid-med", [PERM.kunderSkriv]);
    await assertSucceeds(set(ref(db, sti("kunder", "k-med")), KUNDE));
  });

  /* Selve definition of done. */
  it("UDEN kunder.skriv: serveren afviser — også med alle andre permissions", async () => {
    const udenKunder = ALLE_PERMS.filter((p) => p !== PERM.kunderSkriv);
    const db = medPerms("uid-uden", udenKunder);
    await assertFails(set(ref(db, sti("kunder", "k-uden")), KUNDE));
  });

  it("hver node kræver sin egen permission", async () => {
    const noder = [
      ["kunder", PERM.kunderSkriv, KUNDE],
      ["opgaver", PERM.opgaverSkriv, { division: "gods", art: "vaerksted" }],
      ["koeretoejer", PERM.koeretoejerSkriv, { navn: "Volvo", art: "lastbil", status: "aktiv" }],
      ["fravaer", PERM.fravaerSkriv, { personId: "lars", fra: 1, til: 2 }],
      ["indkoeb", PERM.indkoebSkriv, { division: "gods", beloebOere: 100 }],
      ["satser", PERM.satserSkriv, { post: { satser: [] } }],
      ["lagre", PERM.lagreSkriv, { division: "gods", navn: "Kolding" }],
      ["idebank", PERM.idebankSkriv, { titel: "Idé" }],
    ];
    for (const [node, perm, post] of noder) {
      /* Navngiv noden i fejlen. Ellers siger en fejlende løkke kun
         "PERMISSION_DENIED", og så skal man gætte hvilken af otte. */
      const kun = medPerms(`uid-kun-${node}`, [perm]);
      await assertSucceeds(set(ref(kun, sti(node, "ja")), post)).catch((e) => {
        throw new Error(`"${node}" burde acceptere en bruger med kun ${perm}: ${e.message}`);
      });

      const alt = medPerms(`uid-alt-${node}`, ALLE_PERMS.filter((p) => p !== perm));
      await assertFails(set(ref(alt, sti(node, "nej")), post)).catch(() => {
        throw new Error(`"${node}" accepterede en bruger UDEN ${perm}`);
      });
    }
  });
});

/* ---- Fejler lukket ------------------------------------------------- */

describe("ukendte og manglende permissions fejler lukket", () => {
  /* En tastefejl i den Cloud Function der udsteder claims maa ikke give
     adgang til noget som helst. */
  it("et perms-claim med en ukendt permission giver adgang til intet", async () => {
    const db = miljoe
      .authenticatedContext("uid-tastefejl", {
        tenant: T, rolle: "admin", perms: "|kunder.skrivx|noget.andet|ADMIN|*|",
      })
      .database();
    for (const [node, post] of [
      ["kunder", KUNDE],
      ["opgaver", { division: "gods" }],
      ["idebank", { titel: "Idé" }],
      ["satser", { post: {} }],
    ]) {
      await assertFails(set(ref(db, sti(node, "tastefejl")), post));
    }
  });

  it("rollen alene giver ingenting — admin uden perms-claim afvises", async () => {
    const db = miljoe.authenticatedContext("uid-kunrolle", { tenant: T, rolle: "admin" }).database();
    await assertFails(set(ref(db, sti("kunder", "k-kunrolle")), KUNDE));
    await assertFails(set(ref(db, sti("idebank", "i-kunrolle")), { titel: "Idé" }));
  });

  it("et tomt perms-claim giver ingenting", async () => {
    const db = miljoe.authenticatedContext("uid-tom", { tenant: T, rolle: "admin", perms: "" }).database();
    await assertFails(set(ref(db, sti("kunder", "k-tom")), KUNDE));
  });

  /* Foer beslutning 17 gjaldt det alle noder. Nu gaelder det de tretten der
     ikke har en klassificeret satellit — de fire der har, kraever ogsaa en
     laes-permission. Se noten ved bookingLaes om hvorfor asymmetrien er
     bevidst. */
  it("de tretten uklassificerede noder kan læses med tenant-medlemskab alene", async () => {
    const db = miljoe.authenticatedContext("uid-laeser", { tenant: T, rolle: "chauffoer" }).database();
    for (const node of ["opgaver", "indkoeb", "fakturaer", "idebank", "facility"]) {
      await assertSucceeds(get(ref(db, `tenants/${T}/${node}`)));
    }
    /* Men ikke de fire klassificerede — uden perms-claim er der ingen
       booking.laes. */
    await assertFails(get(ref(db, `tenants/${T}/kunder`)));
  });
});

/* ---- Presets opfører sig som fÃ¸r ----------------------------------- */

describe("rolle-presets giver samme adgang som før", () => {
  it("chaufføren må indberette, men ikke skrive kunder", async () => {
    const db = somRolle("uid-ch", "chauffoer");
    await assertSucceeds(
      set(ref(db, sti("indberetninger", "egen")), {
        division: "gods", type: "braendstof", km: 184320, oprettetAf: "uid-ch",
      })
    );
    await assertFails(set(ref(db, sti("kunder", "k-ch")), KUNDE));
    await assertFails(set(ref(db, sti("opgaver", "o-ch")), { division: "gods" }));
  });

  it("chaufføren må ikke rette en andens indberetning — admin må", async () => {
    const ch = somRolle("uid-ch2", "chauffoer");
    await assertFails(set(ref(ch, sti("indberetninger", "andres")), {
      division: "gods", type: "braendstof", km: 999, oprettetAf: "enAnden",
    }));

    const adm = somRolle("uid-adm", "admin");
    await assertSucceeds(set(ref(adm, sti("indberetninger", "andres")), {
      division: "gods", type: "braendstof", km: 999, oprettetAf: "enAnden",
    }));
  });

  it("koordinatoren må ikke skrive køretøjer — det må disponenten", async () => {
    const koord = somRolle("uid-ko", "koordinator");
    await assertFails(set(ref(koord, sti("koeretoejer", "bil1")), { navn: "Volvo", art: "lastbil", status: "aktiv" }));

    const disp = somRolle("uid-di", "disponent");
    await assertSucceeds(set(ref(disp, sti("koeretoejer", "bil1")), { navn: "Volvo", art: "lastbil", status: "aktiv" }));
  });

  it("kun admin må skrive satser og lagre", async () => {
    for (const rolle of ["casehandler", "disponent", "koordinator", "chauffoer"]) {
      const db = somRolle(`uid-s-${rolle}`, rolle);
      await assertFails(set(ref(db, sti("satser", "p1")), { post: {} }));
      await assertFails(set(ref(db, sti("lagre", "l1")), { division: "gods", navn: "Kolding" }));
    }
    const adm = somRolle("uid-s-admin", "admin");
    await assertSucceeds(set(ref(adm, sti("satser", "p1")), { post: {} }));
  });
});

/* ---- Bookingflowet ------------------------------------------------- */

describe("roller/ er inert indtil Cloud Function'en findes", () => {
  /* Den vaerste fejltilstand af alle er den der SER UD som om den lykkedes.
     Kunne man redigere roller/ nu, ville claim'et ikke blive opdateret: man
     fjernede booking.vaerdiLaes fra disponent-rollen, fik ingen fejl, og
     disponenten kunne stadig se vurderingen paa hvert vaerk. En afvisning er
     bedre end tavshed.

     Aabnes noden for admin med roller.skriv, SKAL den her test opdateres i
     samme aendring — og det er meningen at det gør ondt nok til at man taenker
     over om claim-udstedelsen er paa plads. */
  /* perms er et ARRAY, ikke et map. RTDB-noegler maa ikke indeholde punktum,
     og permission-navnene gor — perms/booking.foreslaa: true er derfor
     umuligt. Arrayet er ogsaa det permsFraRolle() allerede returnerer. */
  it("ingen kan skrive i roller/ — heller ikke med alle permissions", async () => {
    const db = medPerms("uid-roller", ALLE_PERMS);
    const rolle = { navn: "Disponent", perms: [PERM.bookingForeslaa, PERM.kunderSkriv] };
    await assertFails(set(ref(db, sti("roller", "disponent")), rolle));
    await assertFails(set(ref(db, `${sti("roller", "disponent")}/perms`), [PERM.bookingForeslaa]));
    await assertFails(set(ref(db, `tenants/${T}/roller`), { disponent: rolle }));
  });

  it("reglen står som .write: false i filen, ikke som en betingelse der kan blive sand", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    );
    assert.strictEqual(
      regler.rules.tenants.$tenantId.roller[".write"], false,
      "roller/ skal være .write: false indtil claim-udstedelsen findes. " +
      "Uden den ville en rolleændring se ud som om den virkede, mens claim'et " +
      "blev stående — og en fjernet permission ville stadig give adgang."
    );
  });

  it("men den kan læses, så en admin-skærm kan vise rollerne", async () => {
    const db = medPerms("uid-rollerlaes", ALLE_PERMS);
    await assertSucceeds(get(ref(db, `tenants/${T}/roller`)));
  });
});

describe("bookingflowet er stadig lukket for alle", () => {
  /* Permissions for bookingflowet kan ikke haandhaeves i reglerne endnu:
     bookinger og etaper er .write: false, fordi tilstandsskiftet skal ske
     atomisk sammen med reservationen i en Cloud Function der ikke findes.
     Serveren afviser altsaa ALLE — strengere end nogen permission.
     Testen fastholder det, saa ingen aabner noden i mellemtiden uden at
     opdage at booking.godkend saa ikke bliver tjekket af nogen. */
  it("selv en admin med alle permissions kan ikke skrive bookinger eller etaper", async () => {
    const db = somRolle("uid-b", "admin");
    await assertFails(set(ref(db, sti("bookinger", "b1")), { nummer: "BKG-2026-00001" }));
    await assertFails(set(ref(db, sti("etaper", "e1")), { division: "gods", bookingId: "b1" }));
  });
});
