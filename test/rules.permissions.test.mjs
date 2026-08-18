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
  initializeTestEnvironment, assertSucceeds, assertFails, } from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import {
  PERM, ALLE_PERMS, ROLLE_PERMS, permStreng, permStrengFraRolle, harPerm, ALLE_ROLLER, permsFraRolle,
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
    /* ⚠ LEVERANDOEREN SKAL FINDES. indkoeb.leverandoerId og
       fakturaer.leverandoerId slaar nu op i leverandoerer/ — beslutning 18,
       og samme tjek som valideIndkoeb() laver i formularen. Uden posten her
       fejler enhver indkoebsskrivning i suiten, og den fejl ville ligne en
       manglende permission. */
    await set(ref(db, `tenants/${T}/leverandoerer/lv-hydra`), {
      navn: "Hydra-Grene Kolding", kategori: "reservedele", aktiv: true,
    });
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

  it("chaufføren kan KUN indberette", () => {
    /* ⚠ HED FOER "…og skrive i idébanken". Idébanken er ude af kundens
       installation (beslutning 22), og saa er indberetningen det eneste en
       chauffoer skriver. Testen er skaerpet, ikke svaekket: listen er
       udtoemmende, saa en ny skrivepermission paa chauffoeren faelder den. */
    const skriv = ROLLE_PERMS.chauffoer.filter((p) => p.includes(".skriv"));
    assert.deepEqual(skriv.sort(), [PERM.indberetningerSkriv].sort());
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
      ["indkoeb", PERM.indkoebSkriv, { division: "gods", dato: 1786000000000,
        leverandoerId: "lv-hydra", vare: "Slange", antal: 1, prisPrEnhedOere: 1850,
        fakturastatus: "modtaget" }],
      /* ⚠ leverandoerer DELER indkoeb.skriv — den har ikke sin egen.
         En leverandoer er en del af Indkoeb, og en permission mere ville
         betyde en rolle der kan registrere et indkoeb men ikke oprette den
         leverandoer indkoebet kraever. Prøven staar her for at sharingen er
         BESLUTTET frem for overset: en bruger uden indkoeb.skriv afvises
         stadig, og det er halvdelen der betyder noget. */
      ["leverandoerer", PERM.indkoebSkriv, { navn: "Ny Leverandoer", kategori: "daek" }],
      ["satser", PERM.satserSkriv, { post: { satser: [] } }],
      ["lagre", PERM.lagreSkriv, { division: "gods", navn: "Kolding" }],
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
      ["satser", { post: {} }],
    ]) {
      await assertFails(set(ref(db, sti(node, "tastefejl")), post));
    }
  });

  it("rollen alene giver ingenting — admin uden perms-claim afvises", async () => {
    const db = miljoe.authenticatedContext("uid-kunrolle", { tenant: T, rolle: "admin" }).database();
    await assertFails(set(ref(db, sti("kunder", "k-kunrolle")), KUNDE));
    await assertFails(set(ref(db, sti("opgaver", "o-kunrolle")), { division: "gods" }));
  });

  it("et tomt perms-claim giver ingenting", async () => {
    const db = miljoe.authenticatedContext("uid-tom", { tenant: T, rolle: "admin", perms: "" }).database();
    await assertFails(set(ref(db, sti("kunder", "k-tom")), KUNDE));
  });

  /* Foer beslutning 17 gjaldt det alle noder. Nu gaelder det dem der
     ikke har en klassificeret satellit — de fire der har, kraever ogsaa en
     laes-permission. Se noten ved bookingLaes om hvorfor asymmetrien er
     bevidst. */
  it("de uklassificerede noder kan læses med tenant-medlemskab alene", async () => {
    const db = miljoe.authenticatedContext("uid-laeser", { tenant: T, rolle: "chauffoer" }).database();
    for (const node of ["opgaver", "indkoeb", "fakturaer", "satser", "facility"]) {
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

describe("rollerne er faste — og claim'et er det ene håndhævelsespunkt", () => {
  /* Her stod "roller/ er inert indtil Cloud Function'en findes", og
     begrundelsen var rigtig: kunne man redigere noden uden at claim'et fulgte
     med, ville man fjerne en permission, få ingen fejl, og adgangen ville
     stadig virke — den værste fejltilstand af alle, fordi den ser ud som om
     den lykkedes.

     ⚠ MEN SLUTNINGEN VAR FORKERT. Svaret var ikke at bygge funktionen; det
     var at rollerne er FASTE (beslutning 31). Noden er væk, og claim'et
     kommer fra ROLLE_PERMS. */
  it("⚠ roller/ FINDES IKKE LÆNGERE — beslutning 31", () => {
    /* Noden var tenantens egne rolledefinitioner, `.write: false` "indtil
       den Cloud Function der udsteder claims, findes". Den funktion skal
       ikke findes: rollerne er FASTE. En vognmand der fjerner
       booking.godkend fra sin egen adminrolle, har lukket sig ude — og
       adgangen til at rette det var selv en permission.

       ⚠ OG DEN LAA TOM I MÅNEDSVIS. Ingen skrev den, ingen læste den. Det
       er nøjagtig den døde overflade beslutning 31 fjernede idébanken for,
       med sin egen begrundelse — den var bare ikke anvendt her. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10))
    );
    assert.equal(
      regler.rules.tenants.$tenantId.roller, undefined,
      "roller/ er tilbage. Genindfoeres den, afgoeres beslutning 31 om — og " +
      "saa skal det staa i BESLUTNINGER.md, ikke i en regelfil."
    );
  });

  it("⚠ CLAIM'ET KOMMER FRA ROLLE_PERMS, ikke fra en node", async () => {
    /* Der er ingen vej fra en databasenode til en permission, og det er med
       vilje: en node der KUNNE bestemme hvad en bruger må, ville være et
       andet håndhævelsespunkt end tokenet — og to håndhævelsespunkter er ét
       for mange. */
    const kilde = readFileSync("functions/index.js", "utf8");
    const blok = kilde.slice(kilde.indexOf("export const skiftrolle"));
    assert.ok(blok.includes("permStrengFraRolle(rolle)"),
      "skiftrolle udleder ikke perms af presettet");
    const opslag = [".child(" + "\"roller", ".child(" + "`roller"];
    assert.ok(!opslag.some((o) => kilde.includes(o)),
      "en funktion slaar op i roller/ — noden findes ikke laengere");

    /* ⚠ OG EN NEDGRADERING SKAL SLÅ IGENNEM STRAKS. Uden
       revokeRefreshTokens beholder brugeren sine gamle claims indtil
       tokenet udløber af sig selv: man ville tro man havde fjernet en
       adgang, som stadig virkede. */
    assert.ok(blok.includes("revokeRefreshTokens"),
      "en rolleaendring traeder ikke i kraft foer tokenet udloeber");
  });

  it("⚠ EN ROLLE KAN IKKE ÆNDRES — kun tildeles", () => {
    /* Syv faste roller. Skal en betyde noget andet, er det en ændring i
       permissions.js med en begrundelse, prøver og fornyede claims — ikke
       et felt en kunde kan rette. */
    assert.equal(ALLE_ROLLER.length, 7,
      "antallet af roller er aendret — er der taget stilling til brugerarten " +
      "i priser.js? En ny rolle uden en ville lydloest blive faktureret som desktop.");
    for (const rolle of ALLE_ROLLER) {
      assert.ok(permsFraRolle(rolle).length >= 0);
    }
    /* Admin har alt — ellers kunne administratoren ikke rydde op. */
    assert.deepEqual(
      ALLE_PERMS.filter((p) => !permsFraRolle("admin").includes(p)), [],
      "admin mangler en permission og kan derfor ikke rydde op");
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
