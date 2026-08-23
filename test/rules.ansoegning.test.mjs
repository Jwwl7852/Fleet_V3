/* test/rules.ansoegning.test.mjs
 * Chaufføren må ansøge om frihed — for sig selv, og ingenting andet.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `fravaer` krævede `fravaer.skriv`, som ingen chauffør har. Fjerde kort i
 * chaufførappens specifikation er *"Anmod om frihed"*, og der fandtes ingen
 * vej.
 *
 * ⚠ MAN ANSØGER IKKE OM SYGDOM, og det er dét der gør vejen mulig. `art` er en
 * helbredsoplysning (GDPR art. 9) og bor i `sensitive/fravaer`, hvis `.write`
 * kræver BÅDE `fravaer.skriv` OG `fravaer.sensitiveLaes`. Det han søger om —
 * ferie, feriefridag, afspadsering — er ingen af delene.
 *
 * ⚠ OG DEN HER PRØVE ER PUNKT 3's DEFINITION OF DONE: serveren afviser.
 * Chaufførens gren har fire led, og hvert af dem prøves nedenfor ved at
 * demonstrere hvad der sker uden det.
 *
 * Se beslutning 108.
 *
 * Koer: npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, update, get } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import { ANSOEGBARE_ARTER, ALLE_FRAVAER_ARTER, FRAVAER_ART } from "../src/fleet/fravaer.js";

const T = "ansoegTenant";
const MIN_PERSON = "p-lars";
const KOLLEGA = "p-rene";
const UID_CHAUFFOER = "uid-lars";
const UID_KONTOR = "uid-mette";

const FRA = Date.UTC(2026, 8, 14);
const TIL = Date.UTC(2026, 8, 19);

let miljoe;

const sti = (s) => `tenants/${T}/${s}`;

const som = (uid, rolle) =>
  miljoe.authenticatedContext(uid, {
    tenant: T, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const ansoegning = (o = {}) => ({
  personId: o.personId ?? MIN_PERSON,
  fra: o.fra ?? FRA,
  til: o.til ?? TIL,
  ansoegning: {
    status: o.status ?? "ansoegt",
    oensket: o.oensket ?? "ferie",
    ansoegtMs: 1789000000000,
    ...(o.ekstra || {}),
  },
  ...(o.note ? { note: o.note } : {}),
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-ansoegning",
    database: { rules: readFileSync("firebase.rules.json", "utf8") },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, sti("_findes")), true);
    await set(ref(db, sti("moduler")), { dashboard: true, bemanding: true });
    await set(ref(db, sti("personale")), {
      [MIN_PERSON]: { navn: "Lars Aage" },
      [KOLLEGA]: { navn: "Rene Thomsen" },
    });
    /* ⚠ KOBLINGEN. Uden den kan reglen ikke afgøre hvem chaufføren er —
       beslutning 103. */
    await set(ref(db, sti(`brugere/${UID_CHAUFFOER}`)), {
      email: "l@x.dk", navn: "Lars", rolle: "chauffoer", spaerret: false,
      personId: MIN_PERSON,
    });
    await set(ref(db, sti(`brugere/${UID_KONTOR}`)), {
      email: "m@x.dk", navn: "Mette", rolle: "koordinator", spaerret: false,
    });
    /* En allerede AFVIST ansøgning, til at prøve at han ikke kan genåbne den. */
    await set(ref(db, sti("fravaer/f-afvist")), ansoegning({
      status: "afvist",
      ekstra: { afgjortAf: UID_KONTOR, afgjortMs: 1789100000000, svar: "Vi mangler folk i uge 38." },
    }));
  });
});

after(async () => { await miljoe?.cleanup(); });

describe("Chaufføren må ansøge for sig selv", () => {
  it("⚠ EN ANSØGNING PÅ SIG SELV GÅR IGENNEM", () =>
    assertSucceeds(set(ref(som(UID_CHAUFFOER, "chauffoer"), sti("fravaer/f-ok")),
      ansoegning({ note: "Bryllup i familien" }))));

  it("hver ansøgbar art går igennem", async () => {
    for (const oensket of ANSOEGBARE_ARTER) {
      await assertSucceeds(
        set(ref(som(UID_CHAUFFOER, "chauffoer"), sti(`fravaer/f-${oensket}`)),
          ansoegning({ oensket })));
    }
  });
});

describe("Og ingenting andet", () => {
  const db = () => som(UID_CHAUFFOER, "chauffoer");

  /**
   * ⚠ LED 1: personId. Uden det kunne han søge fri for en kollega — og en
   * godkendt ferie på en anden mand spærrer den anden mand.
   */
  it("⚠ AFVISER EN ANSØGNING PÅ EN KOLLEGA", () =>
    assertFails(set(ref(db(), sti("fravaer/f-kollega")),
      ansoegning({ personId: KOLLEGA }))));

  /**
   * ⚠ LED 2: status. Uden det kunne han godkende sin egen ferie, og hele
   * ansøgningen ville være en formalitet.
   */
  it("⚠ AFVISER AT HAN GODKENDER SIN EGEN", () =>
    assertFails(set(ref(db(), sti("fravaer/f-selvgodkendt")),
      ansoegning({ status: "godkendt" }))));

  /**
   * ⚠ LED 3: kontorets svarfelter. Kunne han skrive `afgjortAf`, ville en
   * ansøgning se afgjort ud uden at nogen havde set på den — og den ville
   * forsvinde fra kontorets liste.
   */
  it("⚠ AFVISER AT HAN SKRIVER KONTORETS SVAR", async () => {
    await assertFails(set(ref(db(), sti("fravaer/f-svar1")),
      ansoegning({ ekstra: { afgjortAf: UID_KONTOR } })));
    await assertFails(set(ref(db(), sti("fravaer/f-svar2")),
      ansoegning({ ekstra: { afgjortMs: 1789200000000 } })));
    await assertFails(set(ref(db(), sti("fravaer/f-svar3")),
      ansoegning({ ekstra: { svar: "Godkendt af mig selv" } })));
  });

  /**
   * ⚠ LED 4: kun en NY post. Uden det kunne han rette en AFVIST ansøgning
   * tilbage til `ansoegt` — og kontoret ville se den dukke op igen som ny.
   */
  it("⚠ AFVISER AT HAN GENÅBNER EN AFVIST ANSØGNING", async () => {
    await assertFails(set(ref(db(), sti("fravaer/f-afvist")), ansoegning()));
    await assertFails(update(ref(db(), sti("fravaer/f-afvist/ansoegning")),
      { status: "ansoegt" }));
  });

  /**
   * ⚠ DEN VIGTIGSTE: han kan ikke ansøge om en helbredsoplysning. Slap
   * `sygdom` igennem, ville han have skrevet en GDPR art. 9-kategori på en
   * node uden `fravaer.sensitiveLaes`.
   */
  it("⚠ AFVISER SYGDOM, BARSEL OG BARNS SYGEDAG", async () => {
    for (const art of ALLE_FRAVAER_ARTER.filter((a) => FRAVAER_ART[a].helbred)) {
      await assertFails(set(ref(db(), sti(`fravaer/f-syg-${art}`)),
        ansoegning({ oensket: art })));
    }
  });

  it("⚠ OG AFVISER kursus OG andet — dem søger man ikke om", () => Promise.all([
    assertFails(set(ref(db(), sti("fravaer/f-kursus")), ansoegning({ oensket: "kursus" }))),
    assertFails(set(ref(db(), sti("fravaer/f-andet")), ansoegning({ oensket: "andet" }))),
  ]));

  /**
   * ⚠ OG HAN KAN STADIG IKKE SKRIVE ÅRSAGEN. Det er hele grunden til at
   * `oensket` findes: den følsomme node er urørt.
   */
  it("⚠ AFVISER AT HAN SKRIVER I sensitive/fravaer", () =>
    assertFails(set(ref(db(), sti("sensitive/fravaer/f-ok")), { art: "ferie" })));

  it("⚠ OG HAN KAN IKKE OPRETTE ET FRAVÆR UDEN EN ANSØGNING", () =>
    /* Kontorets vej er hans ikke: et fravær uden `ansoegning` er registreret
       af nogen med fravaer.skriv, og det er dét der gør erAftalt() sand. */
    assertFails(set(ref(db(), sti("fravaer/f-uden")),
      { personId: MIN_PERSON, fra: FRA, til: TIL })));
});

describe("En bruger uden koblingen kan ingenting", () => {
  /**
   * ⚠ SAMME SPÆRRING SOM PÅ TURPLANEN. `brugere/<uid>/personId` er det ene
   * sted et login bliver til en medarbejder (beslutning 103). Mangler den, er
   * `null === personId` falsk, og grenen lukker af sig selv.
   */
  it("⚠ UDEN personId PÅ BRUGERPOSTEN AFVISES ANSØGNINGEN", () =>
    assertFails(set(ref(som("uid-ukendt", "chauffoer"), sti("fravaer/f-ukendt")),
      ansoegning())));
});

describe("Kontoret kan det hele", () => {
  it("koordinatoren opretter, godkender og svarer", async () => {
    const db = som(UID_KONTOR, "koordinator");
    await assertSucceeds(set(ref(db, sti("fravaer/f-kontor")), {
      personId: KOLLEGA, fra: FRA, til: TIL,
    }));
    await assertSucceeds(set(ref(db, sti("fravaer/f-godkendt")), ansoegning({
      status: "godkendt",
      ekstra: { afgjortAf: UID_KONTOR, afgjortMs: 1789300000000, svar: "God ferie." },
    })));
  });

  /**
   * ⚠ OG HAN KAN LÆSE SIN EGEN ANSØGNING. Svaret skal kunne ses i appen —
   * ellers er "du får svar" en påstand. `fravaer.laes` har alle syv roller.
   */
  it("⚠ CHAUFFØREN KAN LÆSE FRAVÆRSLISTEN, SÅ SVARET KAN VISES", () =>
    assertSucceeds(get(ref(som(UID_CHAUFFOER, "chauffoer"), sti("fravaer")))));

  it("men ikke årsagen", () =>
    assertFails(get(ref(som(UID_CHAUFFOER, "chauffoer"), sti("sensitive/fravaer")))));
});
