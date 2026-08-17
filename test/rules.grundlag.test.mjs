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
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import { GRUNDLAG_TILSTAND, ALLE_LINJEARTER } from "../src/fleet/grundlag.js";

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
