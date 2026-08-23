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
const KUNDE = { navn: "Prøvekunde", aktiv: true };

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
      art: "braendstof", forloeb: "ny", kmStand: 100,
      oprettetAf: "enAnden", oprettetMs: 1786000000000,
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
      ["koeretoejer", PERM.koeretoejerSkriv, { navn: "Volvo", art: "lastbil", status: "aktiv" }],
      ["fravaer", PERM.fravaerSkriv, { personId: "lars", fra: 1, til: 2 }],
      ["indkoeb", PERM.indkoebSkriv, { dato: 1786000000000,
        leverandoerId: "lv-hydra", vare: "Slange", antal: 1, prisPrEnhedOere: 1850,
        fakturastatus: "modtaget" }],
      /* ⚠ leverandoerer DELER indkoeb.skriv — den har ikke sin egen.
         En leverandoer er en del af Indkoeb, og en permission mere ville
         betyde en rolle der kan registrere et indkoeb men ikke oprette den
         leverandoer indkoebet kraever. Prøven staar her for at sharingen er
         BESLUTTET frem for overset: en bruger uden indkoeb.skriv afvises
         stadig, og det er halvdelen der betyder noget. */
      ["leverandoerer", PERM.indkoebSkriv, { navn: "Ny Leverandoer", kategori: "daek" }],
      /* ⚠ STIEN ER GRUPPE/POST, IKKE BARE GRUPPE. `.write` flyttede ned på
         postniveau i beslutning 53, så et helt prisgrundlag ikke kan tømmes i
         ét kald. En skrivning på gruppen selv afvises nu — og det er præcis
         forskellen prøven skal kunne se. */
      ["satser/gr", PERM.satserSkriv, { navn: "Standardsats", satser: { s1: { gyldigFra: 1786000000000, beloebOere: 185000 } } }],
      ["lagre", PERM.lagreSkriv, { navn: "Kolding" }],
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

  /* ⚠ opgaver STOD I LISTEN OVENFOR OG ER TAGET UD — men rækken forsvinder
     ikke bare. Noden er `.write: false` efter beslutning 45, så halvdelen af
     løkken ("en bruger med KUN opgaver.skriv accepteres") kan ikke længere
     demonstreres. Den anden halvdel gælder nu for ALLE, og det er en
     skærpelse frem for et tab. */
  it("⚠ opgaver ER LUKKET FOR ALLE — også for den der HAR opgaver.skriv", async () => {
    /* Permissionen består: `opgaveplanlaeg` kræver den, så den skelner
       stadig en disponent fra en chauffør. Det er VEJEN der er lukket, ikke
       retten — samme ordning som kasseudlaan (beslutning 37).

       Grunden er at en opgave og dens RESERVATION bærer den samme
       kendsgerning: at enheden er optaget. `reservationer` er `.write: false`,
       så en klient kunne kun skrive den ene halvdel — og en opgave uden
       reservation ser FRI ud i disponeringen. */
    const post = { art: "vaerksted", status: "planlagt",
                   startMs: 1786000000000, estimeretMin: 90 };
    const kun = medPerms("uid-kun-opgaver", [PERM.opgaverSkriv]);
    await assertFails(set(ref(kun, sti("opgaver", "nej1")), post));
    const alt = medPerms("uid-alt-opgaver", ALLE_PERMS);
    await assertFails(set(ref(alt, sti("opgaver", "nej2")), post));
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
      ["opgaver", {}],
      ["satser", { post: {} }],
    ]) {
      await assertFails(set(ref(db, sti(node, "tastefejl")), post));
    }
  });

  it("rollen alene giver ingenting — admin uden perms-claim afvises", async () => {
    const db = miljoe.authenticatedContext("uid-kunrolle", { tenant: T, rolle: "admin" }).database();
    await assertFails(set(ref(db, sti("kunder", "k-kunrolle")), KUNDE));
    await assertFails(set(ref(db, sti("opgaver", "o-kunrolle")), {}));
  });

  it("et tomt perms-claim giver ingenting", async () => {
    const db = miljoe.authenticatedContext("uid-tom", { tenant: T, rolle: "admin", perms: "" }).database();
    await assertFails(set(ref(db, sti("kunder", "k-tom")), KUNDE));
  });

  /* Foer beslutning 17 gjaldt det alle noder. Nu gaelder det dem der
     ikke har en klassificeret satellit — de fire der har, kraever ogsaa en
     laes-permission. Se noten ved bookingLaes om hvorfor asymmetrien er
     bevidst. */
  /**
   * ⚠ LISTEN VAR LÆNGERE, OG DET ER BESLUTNING 104 DER KORTEDE DEN.
   *
   * Her stod `indkoeb` og `satser` blandt de noder tenant-medlemskab alene
   * åbner. Det gjorde de — og det var ikke besluttet: læsegating blev sat på
   * de fire noder der har en `sensitive/`-satellit, og resten fulgte ikke
   * med. Målt: **39 af 51 læsbare noder krævede ingen permission**, og
   * **femten domæner havde en `.skriv` og ingen `.laes`**.
   *
   * De tre kommercielle er lukket nu. De øvrige tolv står stadig åbne — med
   * en grund, i `test/laeseadgang.test.mjs`.
   */
  it("de ÅBNE noder kan stadig læses med tenant-medlemskab alene", async () => {
    const db = miljoe.authenticatedContext("uid-laeser", { tenant: T, rolle: "chauffoer" }).database();
    for (const node of ["opgaver", "fakturaer", "facility"]) {
      await assertSucceeds(get(ref(db, `tenants/${T}/${node}`)));
    }
    /* Men ikke de fire klassificerede — uden perms-claim er der ingen
       booking.laes. */
    await assertFails(get(ref(db, `tenants/${T}/kunder`)));
  });

  it("⚠ MEN PRISERNE OG INDKØBENE ER LUKKET — beslutning 104", async () => {
    /* Uden et perms-claim overhovedet. At de her afvises, er den halvdel
       punkt 3 kalder definition of done: serveren siger nej. */
    const db = miljoe.authenticatedContext("uid-laeser", { tenant: T, rolle: "chauffoer" }).database();
    for (const node of ["satser", "omkostninger", "indkoeb", "leverandoerer", "grundlag"]) {
      await assertFails(get(ref(db, `tenants/${T}/${node}`)));
    }
  });
});

/* ---- Presets opfører sig som fÃ¸r ----------------------------------- */

describe("rolle-presets giver samme adgang som før", () => {
  it("chaufføren må indberette, men ikke skrive kunder", async () => {
    const db = somRolle("uid-ch", "chauffoer");
    await assertSucceeds(
      set(ref(db, sti("indberetninger", "egen")), {
        art: "braendstof", forloeb: "ny", kmStand: 184320,
        oprettetAf: "uid-ch", oprettetMs: 1786000000000,
      })
    );
    await assertFails(set(ref(db, sti("kunder", "k-ch")), KUNDE));
    await assertFails(set(ref(db, sti("opgaver", "o-ch")), {}));
  });

  it("chaufføren må ikke rette en andens indberetning — admin må", async () => {
    const ch = somRolle("uid-ch2", "chauffoer");
    await assertFails(set(ref(ch, sti("indberetninger", "andres")), {
      art: "braendstof", forloeb: "ny", kmStand: 999,
      oprettetAf: "enAnden", oprettetMs: 1786000000000,
    }));

    const adm = somRolle("uid-adm", "admin");
    await assertSucceeds(set(ref(adm, sti("indberetninger", "andres")), {
      art: "braendstof", forloeb: "ny", kmStand: 999,
      oprettetAf: "enAnden", oprettetMs: 1786000000000,
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
      await assertFails(set(ref(db, sti("satser/gr", "p1")), { navn: "Standardsats", satser: { s1: { gyldigFra: 1786000000000, beloebOere: 185000 } } }));
      await assertFails(set(ref(db, sti("lagre", "l1")), { navn: "Kolding" }));
    }
    const adm = somRolle("uid-s-admin", "admin");
    await assertSucceeds(set(ref(adm, sti("satser/gr", "p1")), { navn: "Standardsats", satser: { s1: { gyldigFra: 1786000000000, beloebOere: 185000 } } }));
  });

  /**
   * ⚠ OG HELE GRUPPEN KAN IKKE SKRIVES I ÉT KALD — beslutning 53.
   *
   * Før lå `.write` på `satser`, og den kaskaderer: én `set()` kunne
   * erstatte eller TØMME hele prisgrundlaget. Målt på tværs af regelfilen
   * kunne 17 af 23 noder tømmes sådan. Reglen ligger nu på posten.
   */
  it("⚠ EN HEL SATSGRUPPE KAN HVERKEN SKRIVES ELLER TØMMES I ÉT KALD", async () => {
    const adm = somRolle("uid-s-admin2", "admin");
    await assertSucceeds(set(ref(adm, sti("satser/gr2", "p1")), { navn: "Standardsats", satser: { s1: { gyldigFra: 1786000000000, beloebOere: 185000 } } }));
    await assertFails(set(ref(adm, sti("satser", "gr2")), { p1: { navn: "Standardsats", satser: { s1: { gyldigFra: 1786000000000, beloebOere: 185000 } } } }));
    await assertFails(set(ref(adm, sti("satser", "gr2")), null));
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
  it("⚠ roller/ ER TILBAGE — MEN KUN SOM KILDE (beslutning 31b)", () => {
    /* Noden var fjernet af beslutning 31: rollerne var faste, og der skulle
       ikke findes en funktion der udstedte claims fra en node.

       Beslutning 31b omgjorde det — kunden kan redigere sine roller. Den
       stærkeste indvending stod i regelfilen selv:

         "en node der KUNNE bestemme hvad en bruger må, ville være et andet
          håndhævelsespunkt end tokenet — og to håndhævelsespunkter er ét
          for mange."

       Svaret er hele designet, og DET er hvad prøven her håndhæver:

           roller/ er en KILDE, aldrig et HÅNDHÆVELSESPUNKT.

       Noden siger hvad der bliver mintet NÆSTE gang. Adgang afgøres
       udelukkende af auth.token.perms. Slog en regel op i noden, ville de
       to stå og være uenige indtil næste mint — et token er stille, en
       node er levende. */
    const raa = readFileSync("firebase.rules.json", "utf8");
    const udenKommentarer = raa
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith("//"))
      .join(String.fromCharCode(10));
    const regler = JSON.parse(udenKommentarer);
    const node = regler.rules.tenants.$tenantId.roller;

    assert.ok(node, "roller/ mangler — beslutning 31b kræver noden");

    /* ⚠ .write: false. Noden skrives KUN af rolleskriv, som minter claims i
       samme ombæring. Kunne en klient skrive den direkte, ville noden sige
       ét og tokenet noget andet indtil næste mint. */
    assert.equal(node[".write"], false,
      "roller/ er skrivbar fra en klient — så kan noden og tokenet blive uenige");

    /* ══ DEN VIGTIGSTE LINJE I FILEN ══
       INGEN regel må slå op i roller/. Prøven leder i HELE regelfilen efter
       et child('roller')-opslag — det er sådan et andet håndhævelsespunkt
       ville se ud. */
    const opslag = "child(" + String.fromCharCode(39) + "roller" + String.fromCharCode(39) + ")";
    assert.ok(!udenKommentarer.includes(opslag),
      "en regel slår op i roller/. Så er der TO håndhævelsespunkter: noden og " +
      "tokenet — og de er uenige indtil næste mint. Adgang afgøres af " +
      "auth.token.perms og intet andet. Se beslutning 31b.");
  });

  it("⚠ ROLLENAVNENE ER STADIG FASTE — man redigerer indholdet", () => {
    /* Beslutning 31b lod kunden redigere hvad en rolle INDEHOLDER. Den lod
       ham ikke opfinde en ottende: en ny rolle er stadig en ændring i koden,
       med prøver og en brugerart i priser.js — ellers faktureres den lydløst
       som desktop, den dyre af de to. */
    const kode = readFileSync("functions/index.js", "utf8");
    const i = kode.indexOf("export const rolleskriv = onCall");
    assert.ok(i > 0, "rolleskriv findes ikke");
    const krop = kode.slice(i, kode.indexOf(String.fromCharCode(10) + "export const ", i + 1));
    assert.match(krop, /ROLLE_PERMS\[rolle\]/,
      "rolleskriv prøver ikke rollenavnet mod de syv faste");
  });
  it("⚠ CLAIM'ET MINTES SERVER-SIDE — og noden er kilden, ikke dommeren", () => {
    /* Prøven hed før "CLAIM'ET KOMMER FRA ROLLE_PERMS, ikke fra en node", og
       begrundelsen var: en node der KUNNE bestemme hvad en bruger må, ville
       være et andet håndhævelsespunkt end tokenet.

       Beslutning 31b lader kunden redigere sine roller, så funktionerne SLÅR
       nu op i noden. Indvendingen er ikke løst ved at ignorere den, men ved
       at dele den i to:

         KILDEN            roller/ — hvad der mintes NÆSTE gang. Funktioner
                           læser den. Reglerne gør ALDRIG.
         HÅNDHÆVELSEN      auth.token.perms — og intet andet.

       At reglerne ikke læser noden, prøves i "roller/ ER TILBAGE" ovenfor.
       Her prøves den anden halvdel: at mintningen sker på serveren og slår
       igennem med det samme. */
    const kilde = readFileSync("functions/index.js", "utf8");
    const krop = (navn) => {
      const i = kilde.indexOf(`export const ${navn} = onCall`);
      assert.ok(i > 0, `${navn} findes ikke`);
      const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", i + 1);
      return naeste < 0 ? kilde.slice(i) : kilde.slice(i, naeste);
    };

    /* ⚠ ALLE STEDER DER MINTER, SKAL BRUGE TENANTENS EGEN DEFINITION.
       Mintede ét af dem konstanten, ville en kunde der har redigeret sin
       disponentrolle, få standarden tilbage næste gang han oprettede en
       disponent — og forskellen ville vise sig som en adgang der manglede
       uden grund. */
    assert.match(krop("skiftrolle"), /claimForRolle\(tenantId, rolle\)/,
      "skiftrolle minter ikke gennem tenantens egne rolledefinitioner");
    assert.match(kilde, /function claimForRolle[\s\S]*?permsForTenant\(/,
      "claimForRolle udleder ikke perms af rollen");

    /* ⚠ OG EN ÆNDRING SKAL SLÅ IGENNEM STRAKS. Uden revokeRefreshTokens
       beholder brugeren sine gamle claims indtil tokenet udløber af sig
       selv: man ville tro man havde fjernet en adgang, som stadig virkede.
       Det gælder nu BEGGE veje — et rolleskift og en rolleændring. */
    for (const navn of ["skiftrolle", "rolleskriv"]) {
      assert.match(krop(navn), /revokeRefreshTokens/,
        `${navn} træder ikke i kraft før tokenet udløber`);
    }

    /* ⚠ OG KLIENTEN MINTER IKKE. Der findes ingen vej fra browseren til et
       claim; setCustomUserClaims står kun i functions/.

       ⚠ KOMMENTARERNE SKAL VÆK FØRST. permissions.js NÆVNER
       setCustomUserClaims i en note om hvordan claims fornys — og en prøve
       der fælder på en kommentar, fælder på det stik modsatte af det den
       leder efter.

       ⚠ OG DET SKAL VÆRE EN RIGTIG BLOKTILSTAND, ikke et præfikstjek.
       Første forsyning filtrerede linjer der begyndte med `*`, `/*` eller
       `//` — og permissions.js' blokkommentarer fortsætter med almindelig
       indrykning uden stjerne. Nævnelsen på linje 30 slap igennem, og prøven
       fældede en fil der ikke havde gjort noget.

       Tilstandsmaskinen står her frem for en regex, fordi mønstret for en
       blokkommentar selv er fuldt af skråstreger og stjerner — og en prøve
       skal kunne læses af den der fælder den. */
    const udenKommentarer = (tekst) => {
      const ud = [];
      let iBlok = false;
      for (const linje of tekst.split(String.fromCharCode(10))) {
        const t = linje.trim();
        if (iBlok) {
          if (t.includes("*" + "/")) iBlok = false;
          continue;
        }
        if (t.startsWith("/" + "*")) {
          if (!t.includes("*" + "/")) iBlok = true;
          continue;
        }
        if (t.startsWith("//")) continue;
        ud.push(linje);
      }
      return ud.join(String.fromCharCode(10));
    };
    const klient = udenKommentarer(readFileSync("src/fleet/permissions.js", "utf8"));
    assert.doesNotMatch(klient, /setCustomUserClaims/,
      "permissions.js minter claims — det hører på serveren");
  });

  it("⚠ ROLLENAVNENE ER FASTE — det er INDHOLDET kunden kan redigere", () => {
    /* Prøven hed før "EN ROLLE KAN IKKE ÆNDRES — kun tildeles".

       Beslutning 31b lod kunden redigere hvad en rolle indeholder. Den lod
       ham ikke opfinde en ottende: en ny rolle er stadig en ændring i koden,
       med en begrundelse, prøver og fornyede claims — og med en BRUGERART i
       priser.js, ellers bliver den lydløst faktureret som desktop, den dyre
       af de to. Det er stadig den vigtigste grund til at antallet er låst. */
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
    await assertFails(set(ref(db, sti("etaper", "e1")), { bookingId: "b1" }));
  });
});
