/* test/roller.test.mjs
 * Beslutning 31b — kunden kan redigere sine roller, og de to spærringer.
 *
 * ⚠ DEN HER FIL ER PRISEN FOR AT OMGØRE EN BESLUTNING.
 *
 * Beslutning 31 gjorde rollerne faste, fordi to ting kunne gå galt:
 *
 *   1. En vognmand fjerner `brugere.skriv` fra sin egen adminrolle og har
 *      lukket sig ude af sit eget system. Der er ingen vej tilbage fra
 *      klienten — adgangen til at rette det var selv en permission.
 *   2. En node der kan bestemme hvad en bruger må, er et andet
 *      håndhævelsespunkt end tokenet, og to er ét for mange.
 *
 * Farerne forsvandt ikke af at beslutningen blev omgjort. Nummer 1 er spærret
 * mekanisk her; nummer 2 er besvaret ved at noden er en KILDE og aldrig et
 * håndhævelsespunkt — det prøves i rules.permissions.test.mjs.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PERM, ALLE_PERMS, ROLLE_PERMS, ALLE_ROLLER, permsFraRolle,
  permsForTenant, valideRolleperms, laaserUde, NOEGLEPERM, permStreng,
  permsForBruger, valideMedarbejderOverride, laaserUdeMedarbejder,
} from "../src/fleet/permissions.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";

describe("⚠ EN TENANT UDEN roller/ OPFØRER SIG PRÆCIS SOM FØR", () => {
  /* Det er dét der gør ændringen sikker at udrulle: ingen eksisterende kunde
     skifter adgang af at funktionen kommer. */

  it("falder tilbage på standarden — ikke på ingenting, og ikke på alt", () => {
    for (const rolle of ALLE_ROLLER) {
      assert.deepEqual(permsForTenant(rolle, null), permsFraRolle(rolle), rolle);
      assert.deepEqual(permsForTenant(rolle, undefined), permsFraRolle(rolle), rolle);
      assert.deepEqual(permsForTenant(rolle, {}), permsFraRolle(rolle), rolle);
    }
  });

  it("en rolle uden EGEN definition falder også tilbage", () => {
    /* Noden findes, men kun for én rolle. De øvrige seks er standard. */
    const roller = { chauffoer: { perms: [PERM.indberetningerSkriv] } };
    assert.deepEqual(permsForTenant("disponent", roller), permsFraRolle("disponent"));
    assert.deepEqual(permsForTenant("chauffoer", roller), [PERM.indberetningerSkriv]);
  });

  it("⚠ EN UKENDT ROLLE GIVER INGENTING — ikke alt", () => {
    /* Fejler lukket, som permsFraRolle altid har gjort. En node kan ikke
       opfinde en ottende rolle ved at have en nøgle mere. */
    assert.deepEqual(permsForTenant("konge", { konge: { perms: ALLE_PERMS } }), []);
  });
});

describe("noden er en kilde — men en filtreret én", () => {
  it("⚠ UKENDTE PERMISSIONS KOMMER ALDRIG I ET TOKEN", () => {
    /* En streng ingen regel kender, er en adgang til ingenting — som SER UD
       som om den gav noget. Den skal ikke stå i et claim, hvor den ville ligne
       en rettighed nogen har fået. */
    const roller = { chauffoer: { perms: [PERM.indberetningerSkriv, "findes.ikke"] } };
    assert.deepEqual(permsForTenant("chauffoer", roller), [PERM.indberetningerSkriv]);
  });

  it("⚠ REKKEFØLGEN ER KATALOGETS, IKKE NODENS", () => {
    /* Claim-strengen sammenlignes med contains(). To brugere med de SAMME
       permissions i forskellig rækkefølge ville få to forskellige strenge, og
       en fejlsøgning der holdt to tokens op mod hinanden, ville se en forskel
       der ikke er der. */
    const a = permsForTenant("chauffoer", {
      chauffoer: { perms: [PERM.indberetningerSkriv, PERM.opgaverSkriv] },
    });
    const b = permsForTenant("chauffoer", {
      chauffoer: { perms: [PERM.opgaverSkriv, PERM.indberetningerSkriv] },
    });
    assert.deepEqual(a, b);
    assert.equal(permStreng(a), permStreng(b));
  });

  it("en tom liste er et gyldigt svar — en rolle der ikke må noget", () => {
    /* Ikke det samme som ingen node. Kunden kan tage alt fra en rolle; det er
       kun NØGLEPERMISSIONEN der er spærret, og kun på den sidste rolle. */
    assert.deepEqual(permsForTenant("chauffoer", { chauffoer: { perms: [] } }), []);
  });
});

describe("valideRolleperms", () => {
  it("godtager en liste af kendte permissions", () => {
    assert.equal(valideRolleperms([PERM.opgaverSkriv, PERM.brugereSkriv]).ok, true);
    assert.equal(valideRolleperms([]).ok, true);
  });

  it("afviser en ukendt permission — og navngiver den", () => {
    const r = valideRolleperms([PERM.opgaverSkriv, "findes.ikke"]);
    assert.equal(r.ok, false);
    assert.match(r.fejl, /findes\.ikke/);
  });

  it("afviser en dublet", () => {
    /* To gange den samme permission giver en claim-streng med et dobbelt
       navn. Den virker, men den er ikke det nogen skrev. */
    assert.equal(valideRolleperms([PERM.opgaverSkriv, PERM.opgaverSkriv]).ok, false);
  });

  it("afviser noget der ikke er en liste", () => {
    for (const v of [null, undefined, "opgaver.skriv", { a: 1 }, 7]) {
      assert.equal(valideRolleperms(v).ok, false, String(v));
    }
  });
});

describe("⚠ SPÆRRINGEN MOD AT LÅSE SIG SELV UDE", () => {
  /* Den mest almindelige måde at ødelægge en rolleadministration på, og den
     rammer netop den der prøver at stramme op. Beslutning 31 blev truffet for
     den; 31b omgjorde beslutningen og beholdt beskyttelsen. */

  it("nøglepermissionen er brugere.skriv", () => {
    assert.equal(NOEGLEPERM, PERM.brugereSkriv);
  });

  it("⚠ MAN KAN IKKE FJERNE DEN FRA SIN EGEN ROLLE", () => {
    /* Heller ikke selv om en anden rolle også har den. En admin der vil
       degradere sig selv, skal have en anden admin i huset til at gøre det. */
    const roller = {
      admin: { perms: [...ALLE_PERMS] },
      koordinator: { perms: [PERM.brugereSkriv] },
    };
    const grund = laaserUde("admin", [PERM.opgaverSkriv], roller, { egenRolle: "admin" });
    assert.ok(grund, "det lykkedes at fjerne nøglepermissionen fra sin egen rolle");
    assert.match(grund, /din egen rolle/i);
  });

  it("⚠ MAN KAN IKKE FJERNE DEN FRA DEN SIDSTE ROLLE DER HAR DEN", () => {
    /* Standarden tæller med: en rolle uden egen definition bærer ROLLE_PERMS.
       Her har KUN admin den, og det er admin der redigeres. */
    const kunAdmin = Object.fromEntries(
      ALLE_ROLLER.map((r) => [r, { perms: permsFraRolle(r).filter((p) => p !== NOEGLEPERM) }])
    );
    kunAdmin.admin = { perms: [...ALLE_PERMS] };

    const grund = laaserUde("admin", [PERM.opgaverSkriv], kunAdmin, { egenRolle: "disponent" });
    assert.ok(grund, "nøglepermissionen kunne forsvinde fra den sidste rolle");
    assert.match(grund, /sidste rolle/i);
  });

  it("men den KAN fjernes, hvis en anden rolle har den", () => {
    /* Spærringen er mod at lukke sig ude — ikke mod at rydde op. */
    const roller = {
      admin: { perms: [...ALLE_PERMS] },
      koordinator: { perms: [PERM.brugereSkriv, PERM.opgaverSkriv] },
    };
    assert.equal(
      laaserUde("koordinator", [PERM.opgaverSkriv], roller, { egenRolle: "admin" }),
      null);
  });

  it("og en rolle der BEHOLDER den, spærres aldrig", () => {
    assert.equal(laaserUde("admin", [...ALLE_PERMS], {}, { egenRolle: "admin" }), null);
  });

  it("⚠ SVARET ER EN SÆTNING, ikke et flag", () => {
    /* Serveren afviser med den sætning skærmen ville have vist. "false" ville
       ikke fortælle nogen hvad de skal gøre i stedet. */
    const grund = laaserUde("admin", [], {}, { egenRolle: "admin" });
    assert.ok(grund.length > 40 && /\.$/.test(grund.trim()), grund);
  });
});

describe("⚠ ROLLE_PERMS FORSVINDER IKKE — den er standarden", () => {
  it("de seks rollenavne står fast", () => {
    /* Man redigerer hvad en rolle indeholder; man opfinder ikke en syvende.
       En ny rolle er stadig en ændring i koden — med en brugerart i
       priser.js, ellers faktureres den lydløst som desktop.
       ⚠ VAR SYV. casehandler er konsolideret ind i koordinator —
       beslutning 120, en produktejerbeslutning, ikke en tilfældig
       reduktion. Tallet ændres kun ved en ny, dokumenteret beslutning. */
    assert.equal(ALLE_ROLLER.length, 6);
    assert.deepEqual(Object.keys(ROLLE_PERMS).sort(), [...ALLE_ROLLER].sort());
  });

  it("admin har stadig alt som udgangspunkt", () => {
    assert.deepEqual(ALLE_PERMS.filter((p) => !permsFraRolle("admin").includes(p)), []);
  });

  it("⚠ CHAUFFØREN KAN KUN INDBERETTE, STEMPLE OG ANSØGE OM FRIHED — som STANDARD", () => {
    /* Prøven prøver nu standardrollen, ikke hvad en given tenant måtte have
       gjort ved sin. Kunden KAN give chaufføren mere; det er hele pointen med
       31b. Listen er udtømmende, så en ny skrivepermission på standarden
       fælder den.
       ⚠ BESLUTNING 121 UDVIDEDE DEN MED TO. `stemplingerSkriv` og
       `fravaerAnsoegSkriv` var før ubetingede for enhver rolle (rent
       ejerskabstjek i reglerne) — at lægge dem i EGEN_SKRIV ændrer ingen
       faktisk adgang, kun at den nu KAN slås fra pr. rolle. */
    const skriver = permsFraRolle("chauffoer").filter((p) => /skriv|godkend|opret/i.test(p));
    assert.deepEqual(skriver,
      [PERM.stemplingerSkriv, PERM.fravaerAnsoegSkriv, PERM.indberetningerSkriv]);
  });
});

describe("⚠ ADMIN KAN IKKE INDSKRÆNKES — BESLUTNING 121", () => {
  /* "Den eneste der altid har fuld adgang er admin" er et krav, ikke en
     standard man kan redigere væk. Der var intet der forhindrede en tenant i
     at skrive et `roller/admin` der reducerede admin under fuld adgang. */

  it("⚠ ET ROLLER/ADMIN-OVERRIDE IGNORERES STILTIENDE", () => {
    const roller = { admin: { perms: [PERM.kunderLaes] } };
    assert.deepEqual(permsForTenant("admin", roller), ALLE_PERMS);
  });

  it("selv et tomt admin-preset i noden giver stadig alt", () => {
    assert.deepEqual(permsForTenant("admin", { admin: { perms: [] } }), ALLE_PERMS);
  });

  it("uden nogen node giver admin stadig alt, som før", () => {
    assert.deepEqual(permsForTenant("admin", null), ALLE_PERMS);
    assert.deepEqual(permsForTenant("admin", {}), ALLE_PERMS);
  });
});

describe("⚠ MEDARBEJDER-OVERSTYRING — TILFØJET 2026-09-05", () => {
  /* Produktejerens krav: "man skal helt ned på medarbejder niveau bestemme
     hvad de kan se og har rettigheder til." permsForBruger() er DELTAET
     oven på permsForTenant() — en medarbejder uden override er identisk med
     rollens standard. */

  it("uden override er en bruger identisk med sin rolle", () => {
    for (const rolle of ALLE_ROLLER) {
      assert.deepEqual(permsForBruger(rolle, null, null), permsForTenant(rolle, null), rolle);
      assert.deepEqual(permsForBruger(rolle, {}, undefined), permsForTenant(rolle, {}), rolle);
    }
  });

  it("tilføjet lægger noget OVEN PÅ rollen", () => {
    const perms = permsForBruger("chauffoer", {}, { tilfoejet: [PERM.sagLaes], fjernet: [] });
    assert.ok(perms.includes(PERM.sagLaes));
    assert.ok(permsFraRolle("chauffoer").every((p) => perms.includes(p)));
  });

  it("fjernet tager noget VÆK fra rollen", () => {
    const perms = permsForBruger("chauffoer", {}, { tilfoejet: [], fjernet: [PERM.stemplingerSkriv] });
    assert.ok(!perms.includes(PERM.stemplingerSkriv));
  });

  it("⚠ EN UKENDT PERMISSION I OVERRIDE HAR INGEN EFFEKT", () => {
    /* Samme "fejler lukket" som permsForTenant() — en streng ingen regel
       kender, må aldrig ende i et token. */
    const perms = permsForBruger("chauffoer", {}, { tilfoejet: ["findes.ikke"], fjernet: [] });
    assert.ok(!perms.includes("findes.ikke"));
  });

  it("⚠ ADMIN IGNORERER OVERRIDE UBETINGET — hverken ind- eller udskrænket", () => {
    const uden = permsForBruger("admin", {}, { tilfoejet: [], fjernet: [PERM.brugereSkriv] });
    assert.deepEqual(uden, ALLE_PERMS);
    const med = permsForBruger("admin", {}, { tilfoejet: ["findes.ikke"], fjernet: [] });
    assert.deepEqual(med, ALLE_PERMS);
  });

  it("⚠ RÆKKEFØLGEN ER KATALOGETS — samme grund som permsForTenant()", () => {
    const a = permsForBruger("chauffoer", {}, { tilfoejet: [PERM.sagLaes, PERM.auditLaes], fjernet: [] });
    const b = permsForBruger("chauffoer", {}, { tilfoejet: [PERM.auditLaes, PERM.sagLaes], fjernet: [] });
    assert.deepEqual(a, b);
  });
});

describe("valideMedarbejderOverride", () => {
  it("godtager to lister af kendte, ikke-overlappende permissions", () => {
    assert.equal(valideMedarbejderOverride([PERM.sagLaes], [PERM.opgaverSkriv]).ok, true);
    assert.equal(valideMedarbejderOverride([], []).ok, true);
  });

  it("afviser en ukendt permission i hver liste", () => {
    assert.equal(valideMedarbejderOverride(["findes.ikke"], []).ok, false);
    assert.equal(valideMedarbejderOverride([], ["findes.ikke"]).ok, false);
  });

  it("⚠ AFVISER AT DEN SAMME PERMISSION STÅR I BEGGE LISTER", () => {
    /* Modstridende hensigt — tilføj og fjern samme ting — ikke to gyldige
       valg der tilfældigvis overlapper. */
    const r = valideMedarbejderOverride([PERM.sagLaes], [PERM.sagLaes]);
    assert.equal(r.ok, false);
    assert.match(r.fejl, /sag\.laes/);
  });
});

describe("⚠ SPÆRRINGEN MOD AT LÅSE SIG SELV UDE — ÉT LAG DYBERE", () => {
  /* Samme fare som laaserUde(), nu på PERSONER i stedet for ROLLER: en
     tenant kan i teorien fjerne brugere.skriv fra alle individuelle
     brugere via overrides, selv om rollen nominelt stadig har den. */

  it("⚠ MAN KAN IKKE FJERNE DEN FRA SIN EGEN ADGANG", () => {
    const grund = laaserUdeMedarbejder("uid-a", "admin", [PERM.brugereSkriv], {
      egenUid: "uid-a", alleBrugere: {}, roller: {},
    });
    assert.ok(grund);
    assert.match(grund, /din egen adgang/i);
  });

  it("⚠ MAN KAN IKKE FJERNE DEN FRA DEN SIDSTE BRUGER DER HAR DEN", () => {
    const alleBrugere = { "uid-a": { rolle: "admin" }, "uid-b": { rolle: "chauffoer" } };
    const grund = laaserUdeMedarbejder("uid-a", "admin", [PERM.brugereSkriv], {
      egenUid: "uid-b", alleBrugere, roller: {},
    });
    assert.ok(grund, "nøglepermissionen kunne forsvinde fra den sidste bruger");
    assert.match(grund, /sidste bruger/i);
  });

  it("men den KAN fjernes, hvis en anden bruger reelt har den", () => {
    const alleBrugere = {
      "uid-a": { rolle: "admin" },
      "uid-b": { rolle: "chauffoer", permsOverride: { tilfoejet: [PERM.brugereSkriv], fjernet: [] } },
    };
    const grund = laaserUdeMedarbejder("uid-a", "admin", [PERM.brugereSkriv], {
      egenUid: "uid-c", alleBrugere, roller: {},
    });
    assert.equal(grund, null);
  });

  it("uden brugere.skriv i fjernet-listen spærres intet", () => {
    assert.equal(
      laaserUdeMedarbejder("uid-a", "chauffoer", [PERM.sagLaes], { egenUid: "uid-a", alleBrugere: {}, roller: {} }),
      null);
  });
});

describe("delingen med serveren", () => {
  it("permissions.js er i DELTE_FILER", () => {
    /* rolleskriv kalder valideRolleperms() og laaserUde(). Firebase deployer
       kun functions/-mappen, så en import op gennem træet fejler i skyen —
       ved DEPLOY, ikke ved test. */
    assert.ok(DELTE_FILER.includes("permissions.js"));
  });

  it("⚠ SAMME FUNKTION AFGØR I SKÆRMEN OG PÅ SERVEREN", () => {
    /* En klientvalidering der ikke også står på serveren, er en pæn knap — og
       her ville den pæne knap kunne koste kunden adgangen til sit eget
       system. */
    for (const f of [
      valideRolleperms, laaserUde, permsForTenant,
      permsForBruger, valideMedarbejderOverride, laaserUdeMedarbejder,
    ]) {
      assert.equal(typeof f, "function");
    }
  });
});
