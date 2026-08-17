/* test/rules.grundlag.test.mjs
 * Fakturagrundlaget i reglerne — beslutning 25.
 *
 * ⚠ NODEN ER `.write: false` FOR ALLE, OGSÅ ADMIN. Tre ting kan ikke
 * håndhæves af en klient:
 *
 *   1. Nummeret kommer fra en counter i en transaction (beslutning 8).
 *   2. Tilstandsskiftet følger kanGodkende() — åbne etaper spærrer.
 *   3. Et LÅST grundlag må aldrig kunne ændres; det er eksporteret, og
 *      tallet findes et sted vi ikke kontrollerer.
 *
 * Et regnskabsdokument der kan rettes i hånden, beviser ingenting. Samme
 * begrundelse som `kasseudlaan` og `bevaegelser`: det er VEJEN der er lukket,
 * ikke en manglende rettighed.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get, update } from "firebase/database";
import { permStrengFraRolle, PERM, ROLLE_PERMS } from "../src/fleet/permissions.js";
import { GRUNDLAG_TILSTAND, ALLE_LINJEARTER } from "../src/fleet/grundlag.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";
import { AUDIT, klasseFor } from "../src/fleet/audit-regler.js";

const T = "tenantGrundlag";
const KUNDE = "k-nordisk";

let miljoe;

const som = (uid, rolle = "admin") =>
  miljoe.authenticatedContext(uid, {
    tenant: T, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const sti = (rest) => `tenants/${T}/${rest}`;

const GRUNDLAG = {
  nummer: "GRL-2026-00311",
  kundeId: KUNDE,
  bookingId: "bk-2026-00311",
  division: "gods",
  tilstand: "kladde",
  udarbejdetAf: "uid-mette",
  udarbejdetMs: 1786000000000,
  linjer: {
    l1: {
      art: "koersel", tekst: "København → Hamburg",
      antal: 1000, satsOere: 1240000, enhed: "tur", momssats: 25,
      kilde: { type: "etape", id: "et-001" },
    },
  },
};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-grundlag",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    await set(ref(db, sti(`kunder/${KUNDE}`)), {
      navn: "Nordisk Transport", division: "gods", aktiv: true,
    });
    /* Skrevet uden om reglerne — som en Cloud Function ville. */
    await set(ref(db, sti("grundlag/grl-001")), GRUNDLAG);
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("grundlaget skrives kun af serveren", () => {
  it("⚠ NÆGTER EN ADMIN AT OPRETTE ET GRUNDLAG", () => {
    /* Han mangler ikke en rettighed — vejen er lukket. Nummeret skal komme
       fra en counter, og en klient kan ikke køre en transaction på den. */
    return assertFails(set(ref(som("uid-admin"), sti("grundlag/grl-nyt")), GRUNDLAG));
  });

  it("nægter også en koordinator og en casehandler", async () => {
    for (const rolle of ["koordinator", "casehandler"]) {
      await assertFails(
        set(ref(som(`uid-${rolle}`, rolle), sti(`grundlag/grl-${rolle}`)), GRUNDLAG));
    }
  });

  it("⚠ NÆGTER EN RETTELSE AF ET FELT PÅ ET GRUNDLAG DER FINDES", () => {
    /* Et beløb der kan rettes i hånden, gør godkendelsen til en formalitet. */
    return assertFails(
      update(ref(som("uid-admin"), sti("grundlag/grl-001")), { tilstand: "godkendt" }));
  });

  it("⚠ NÆGTER EN SLETNING", () => {
    /* Regnskabsdata hardslettes ikke. Et grundlag tages ud af drift med en
       erstatning — erstat() i grundlag.js — ikke ved at forsvinde. */
    return assertFails(set(ref(som("uid-admin"), sti("grundlag/grl-001")), null));
  });

  it("lader enhver i tenanten LÆSE dem", async () => {
    /* Der er ingen grundlag.laes: der findes ingen klassificeret satellit at
       kontrastere mod, og alle presets skulle alligevel have den. Se noten
       ved bookingLaes i permissions.js. */
    await assertSucceeds(get(ref(som("uid-chauffoer", "chauffoer"), sti("grundlag"))));
    await assertSucceeds(get(ref(som("uid-revisor", "revisor"), sti("grundlag"))));
  });

  it("holder en anden tenant ude", async () => {
    const fremmed = miljoe.authenticatedContext("uid-fremmed", {
      tenant: "enAnden", rolle: "admin", perms: permStrengFraRolle("admin"),
    }).database();
    await assertFails(get(ref(fremmed, sti("grundlag"))));
  });
});

describe("formen på et grundlag", () => {
  /* Reglerne prøves gennem den vej serveren bruger: uden om .write, men MED
     .validate. Det er præcis det en Cloud Function gør — admin-SDK'et går
     uden om reglerne, så valideringen her er det der beskriver formen for
     den der læser filen, og for enhver fremtidig vej ind. */
  const skriv = (id, post) => miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), sti(`grundlag/${id}`)), post);
  });

  it("kender de tre tilstande og ikke flere", () => {
    const regler = readFileSync("firebase.rules.json", "utf8");
    const blok = regler.slice(regler.indexOf('"grundlag": {'));
    /* ⚠ IKKE bare den første linje der nævner "tilstand" — `.indexOn` gør det
       også. Det er VALIDERINGEN der afgør hvad der kan skrives. */
    const linje = blok.split(/\r?\n/).find(
      (l) => l.includes('"tilstand"') && l.includes(".validate"));
    for (const t of Object.keys(GRUNDLAG_TILSTAND)) {
      assert.ok(linje.includes(t), `tilstanden "${t}" står ikke i reglerne`);
    }
  });

  it("kender de fem linjearter og ikke flere", () => {
    const regler = readFileSync("firebase.rules.json", "utf8");
    const blok = regler.slice(regler.indexOf('"grundlag": {'));
    const linje = blok.split(/\r?\n/).find((l) => l.includes('"art"'));
    for (const a of ALLE_LINJEARTER) {
      assert.ok(linje.includes(a), `linjearten "${a}" står ikke i reglerne`);
    }
  });

  it("⚠ KRÆVER IKKE EN MOMSSATS", () => {
    /* Vi gætter ikke 25 %. Feltet må MANGLE — det er det rigtige svar indtil
       en bogholder har svaret — og eksporten er så spærret. Krævede reglerne
       den, ville et grundlag ikke kunne gemmes før nogen havde gættet. */
    const regler = readFileSync("firebase.rules.json", "utf8");
    const blok = regler.slice(regler.indexOf('"grundlag": {'));
    const linje = blok.split(/\r?\n/).find((l) => l.includes("hasChildren(['art'"));
    assert.ok(linje, "fandt ikke linjens kravliste");
    assert.ok(!linje.includes("momssats"), "momssatsen er gjort påkrævet");
  });

  it("⚠ NUMMERET FØLGER DET ENE FORMAT", () => {
    /* GRL-ÅÅÅÅ-NNNNN, som alle andre numre i huset (beslutning 8). */
    const regler = readFileSync("firebase.rules.json", "utf8");
    const blok = regler.slice(regler.indexOf('"grundlag": {'));
    assert.ok(blok.includes("^GRL-[0-9]{4}-[0-9]{5}$"), "nummerformatet står ikke i reglerne");
  });

  it("tager imod et helt grundlag skrevet af serveren", () => {
    return skriv("grl-server", { ...GRUNDLAG, tilstand: "godkendt", godkendtAf: "uid-jorn", godkendtMs: 1786100000000 });
  });
});

describe("grundlagskriv — den eneste vej ind", () => {
  const kilde = readFileSync("functions/index.js", "utf8");
  const blok = kilde.slice(kilde.indexOf("export const grundlagskriv"));

  it("⚠ SERVEREN BRUGER SAMME FIL SOM SKÆRMEN", () => {
    /* kanGodkende(), kanEksportere() og nummerformatet er de SAMME
       funktioner begge steder. Skrev serveren sin egen afskrift, ville
       skærmen sige ja og serveren nej — og et regnskabsdokument er det
       værste sted at have to meninger. */
    assert.ok(kilde.includes('from "./delt/grundlag.js"'),
      "funktionen importerer ikke den delte grundlag.js");
    assert.ok(DELTE_FILER.includes("grundlag.js"), "grundlag.js kopieres ikke til delt/");
    assert.ok(DELTE_FILER.includes("booking-state.js"),
      "booking-state.js mangler — grundlag.js importerer den");
  });

  it("⚠ REGLEN FOR DELTE FILER ER TRANSITIV, IKKE 'IMPORTFRI'", () => {
    /* En fil må kun stå på listen hvis ALT den importerer også står der.
       Firebase deployer kun functions/-mappen, så en import op gennem træet
       fejler i skyen — ved DEPLOY, ikke ved test. */
    for (const fil of DELTE_FILER) {
      const src = readFileSync(`src/fleet/${fil}`, "utf8");
      const importer = [...src.matchAll(/from\s+"\.\/([\w-]+\.js)"/g)].map((m) => m[1]);
      for (const i of importer) {
        assert.ok(DELTE_FILER.includes(i),
          `${fil} importerer ${i}, som ikke kopieres til functions/delt/`);
      }
    }
  });

  it("⚠ NUMMERET TAGES I EN TRANSACTION, FØR POSTEN SKRIVES", () => {
    /* To mennesker der trykker i samme sekund, skal have hvert sit nummer.
       En optælling af eksisterende poster ville give dem det samme. */
    assert.ok(blok.includes("naesteGrundlagsnummer(db,"),
      "nummeret kommer ikke fra husets nummerserie");
  });

  it("⚠ ETAPERNE LÆSES AF SERVEREN, IKKE SENDT MED", () => {
    /* Kunne klienten oplyse dem, kunne et grundlag godkendes ved at fortie
       den åbne etape — og det er præcis den kontrol der spærrer. */
    assert.ok(blok.includes('rod.child("etaper").once("value")'),
      "etaperne læses ikke af serveren");
    assert.ok(blok.includes("kanGodkende(g, { etaper, bruger: uid })"));
  });

  it("⚠ LÅSNINGEN SPØRGER kanLaase(), IKKE kanEksportere()", () => {
    /* Et låst grundlag må gerne eksporteres igen — filen kan være gået tabt i
       den anden ende — men ikke låses igen: så ville eksportReference og
       laastMs blive overskrevet, og den første eksport forsvinde uden spor.
       Med det forkerte tjek nåede kaldet frem til laas(), som kaster en rå
       Error — og den kom ud af funktionen som "INTERNAL". */
    assert.ok(blok.includes("const tjek = kanLaase(g);"),
      "låsningen bruger stadig eksporttjekket");
    const skaerm = readFileSync("src/moduler/Fakturering.jsx", "utf8");
    assert.ok(skaerm.includes("kanLaase(g)"), "skærmen tilbyder at låse et låst grundlag");
    assert.ok(skaerm.includes("!laasning.ok"), "låseknappen spærres ikke af tjekket");
  });

  it("⚠ EN LÅSNING KRÆVER EN EKSPORTREFERENCE", () => {
    /* En låsning uden reference er en påstand. Referencen er beviset på at
       grundlaget faktisk ER eksporteret — uden den kan ingen finde bilaget
       igen i regnskabet. */
    assert.ok(blok.includes("En låsning kræver en eksportreference"));
  });

  it("⚠ DER FINDES INGEN SLET-HANDLING", () => {
    /* Regnskabsdata hardslettes ikke. En rettelse er et NYT grundlag der
       henviser til det gamle — og en funktion der findes, bliver kaldt. */
    assert.ok(!/handling === "slet"/.test(blok), "der er en slet-handling");
    assert.ok(!/\.remove\(\)/.test(blok), "funktionen kan fjerne et grundlag");
    assert.ok(blok.includes("Kendte: opret, godkend, laas."),
      "listen over handlinger er ændret — er sletning kommet med?");
  });

  it("de to permissioner er to handlinger", () => {
    /* At UDARBEJDE et grundlag er kontorarbejde; at GODKENDE det er at sige
       god for at fakturaen kan sendes. Den der gør det første, skal ikke
       nødvendigvis kunne gøre det andet. */
    assert.ok(blok.includes("PERM.grundlagSkriv"));
    assert.ok(blok.includes("PERM.grundlagGodkend"));
    assert.ok(ROLLE_PERMS.casehandler.includes(PERM.grundlagSkriv));
    assert.ok(!ROLLE_PERMS.casehandler.includes(PERM.grundlagGodkend),
      "casehandleren kan godkende sit eget grundlag");
    assert.ok(ROLLE_PERMS.koordinator.includes(PERM.grundlagGodkend));
    assert.ok(!ROLLE_PERMS.chauffoer.includes(PERM.grundlagSkriv));
  });

  it("⚠ SPORET LANDER I REGNSKABSPARTITIONEN", () => {
    /* Klassen afgør retention. Et grundlag hører sammen med de fakturaer det
       bliver til — ikke med de bevægelser der udløste det. */
    assert.equal(klasseFor(AUDIT.opret, "grundlag"), "regnskab");
    assert.ok(blok.includes("audit/${tenantId}/regnskab/"));
  });

  it("prøver abonnementet, som reglerne gør", () => {
    /* Admin-SDK'et går uden om reglerne, og reglerne er det eneste sted
       spærringen ellers står. */
    const guard = kilde.slice(kilde.indexOf("async function kraevGrundlag"));
    assert.ok(guard.slice(0, 1500).includes("Abonnementet er ikke aktivt."));
  });
});

describe("RTDB har ingen arrays — og domænet regner med dem", () => {
  const kilde = readFileSync("functions/index.js", "utf8");

  it("⚠ OVERSÆTTELSEN ER ÉN FUNKTION — IKKE ÉN PR. LÆSER", () => {
    /* Linjer og historik ligger som OBJEKTER i basen. godkend() gør
       `[...grundlag.historik]`, og med et objekt kaster den et sted der intet
       har med godkendelsen at gøre.

       ⚠ DEN STOD SOM EN AFSKRIFT HER. Serveren oversatte selv, og den dag
       Fakturering-skærmen begyndte at læse noden, manglede den samme
       oversættelse i klienten — skærmen blev hvid på det første rigtige
       grundlag. Nu kalder begge `fraDb()` i den delte grundlag.js. */
    const blok = kilde.slice(kilde.indexOf("async function hentGrundlag"));
    assert.ok(blok.slice(0, 900).includes("fraDb(g, id)"),
      "serveren oversætter selv i stedet for at kalde fraDb()");
    assert.ok(!/linjer: Object\.values\(g\.linjer/.test(blok.slice(0, 900)),
      "afskriften står der stadig ved siden af");

    const skaerm = readFileSync("src/moduler/Fakturering.jsx", "utf8");
    assert.ok(skaerm.includes("fraDb(g)"),
      "skærmen oversætter ikke — kanGodkende() kaster på den første post");
    assert.ok(!/Object\.values\(g\.linjer|Object\.values\(.*historik/.test(skaerm),
      "skærmen har sin egen kopi af oversættelsen");
  });

  it("skriver dem tilbage som objekter", () => {
    /* Den anden vej. Et array i RTDB bliver til nøglerne 0,1,2 — og en
       sletning midt i ville rykke resten. */
    assert.ok(kilde.includes("Object.fromEntries(aendring.historik.map((h, i) => [`h${i}`, h]))"));
  });
});

describe("Fakturering-skærmen — knapperne virker nu", () => {
  const skaerm = readFileSync("src/moduler/Fakturering.jsx", "utf8");

  it("⚠ SKÆRMEN SKRIVER IKKE SELV", () => {
    /* Nummeret, tilstandsskiftet og låsningen kan ikke håndhæves af en
       klient. Vejen ind er funktionen — også når knappen ser ud som om den
       gemmer noget. */
    assert.ok(skaerm.includes('from "../fleet/fakturering.js"'),
      "skærmen bruger ikke husets ene vej ind");
    assert.ok(!/db\.ref\(|\.set\(|\.update\(/.test(skaerm),
      "skærmen skriver til databasen udenom fakturering.js");
  });

  it("⚠ DEAKTIVERINGEN BRUGER DE SAMME TJEK SOM SERVEREN", () => {
    /* kanGodkende() og kanEksportere() er de SAMME funktioner begge steder,
       fordi grundlag.js kopieres til functions/delt/. Skrev skærmen sin egen
       afskrift, ville den sige ja hvor serveren siger nej — og så er en grå
       knap et tilfælde frem for en forklaring. */
    assert.ok(skaerm.includes("kanGodkende(g, { etaper })"));
    assert.ok(skaerm.includes("kanLaase(g)"));
    assert.ok(skaerm.includes("!godkendelse.ok"), "godkendeknappen spærres ikke af tjekket");
    assert.ok(skaerm.includes("!laasning.ok"), "låseknappen spærres ikke af tjekket");
    /* Og årsagen står på knappen. En deaktiveret knap uden forklaring sender
       brugeren på jagt. */
    assert.ok(skaerm.includes("godkendelse.aarsager[0]"));
    assert.ok(skaerm.includes("laasning.aarsager[0]"));
  });

  it("⚠ EN LÅSNING KRÆVER EN REFERENCE — I BEGGE ENDER", () => {
    /* Feltet på skærmen er den hurtige besked; afgørelsen er serverens.
       Stod kravet KUN i skærmen, kunne et direkte kald låse et grundlag uden
       at nogen kan finde bilaget igen. */
    assert.ok(skaerm.includes("!reference.trim()"), "skærmen låser uden reference");
    const kilde = readFileSync("functions/index.js", "utf8");
    const blok = kilde.slice(kilde.indexOf("export const grundlagskriv"));
    assert.ok(blok.includes("En låsning kræver en eksportreference"),
      "serveren låser uden reference");
  });

  it("⚠ GODKENDELSEN KRÆVER SIN EGEN PERMISSION", () => {
    /* At UDARBEJDE et grundlag er kontorarbejde; at GODKENDE det er at sige
       god for at fakturaen kan sendes. Skærmen spørger om handlingen, ikke om
       rollen — men den AFGØR det ikke: serveren spørger om det samme. */
    assert.ok(skaerm.includes("PERM.grundlagGodkend"));
    assert.ok(!/rolle ===|bruger\.rolle/.test(skaerm),
      "skærmen spørger om rollen frem for om permissionen");
  });

  it("⚠ LISTEN HENTES IGEN EFTER EN SKRIVNING", () => {
    /* Et godkendt grundlag der stadig står som kladde på skærmen, bliver
       godkendt to gange — og den anden gang afvises, uden at brugeren kan se
       hvorfor. */
    assert.ok(skaerm.includes("paaSkrevet"), "skærmen henter ikke listen igen");
    assert.ok(skaerm.includes("paaSkrevet={genindlaesGrundlag}"));
  });

  it("forbeholdet i toppen af filen passer stadig", () => {
    /* Kommentaren er en påstand om platformen, og den skal kunne blive
       forkert. Den sagde "der skrives ingenting herfra" indtil funktionen
       kom. */
    assert.ok(!/Fase 0/.test(skaerm), "hovedet lover stadig fase 0");
    assert.ok(skaerm.includes("Håndhævelsen ligger i"),
      "hovedet siger ikke hvor afgørelsen ligger");
  });
});
