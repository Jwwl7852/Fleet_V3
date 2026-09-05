/* test/rules.udbyder.test.mjs
 * Den ANDEN krydsning af tenant-grænsen — og hvor smal den er.
 *
 * ⚠ KRAVET DEN BÆRER: kunder må ikke kunne komme til hinandens data.
 *
 * Tenant-isolationen selv står i rules.tenant.test.mjs, punkt 1 i den låste
 * rækkefølge. Den her prøve handler om det udbyder-claim en konsol kræver —
 * altså om det ene sted hvor grænsen med vilje er brudt.
 *
 * Beslutning 24 tillod den FØRSTE krydsning (support) én gang, fordi hver
 * krydsning er et sted hvor en fejl giver én kunde adgang til en andens.
 * Den her er den anden. Prøven findes for at holde den så smal som den blev
 * skrevet: nøjagtig fire noder pr. tenant, ingen af dem operationelle — og
 * den fjerde gaar KUN til udbyderen, ikke tilbage til kunden (beslutning 89).
 *
 * ⚠ SUITEN DÆKKER SIG SELV IND. Nodelisten læses ud af firebase.rules.json,
 * som i rules.tenant.test.mjs. Tilføjer nogen en node, og giver den ved et
 * uheld udbyderen adgang, fejler prøven uden at nogen har husket et
 * testtilfælde.
 *
 * Koer: npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "./rules-test-claims.mjs";
import { ref, set, get } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";

/* Egne tenant-id'er: node --test kører filerne parallelt, og denne fil må
   ikke kunne tørre en anden fils data væk. Samme grund som i
   rules.tenant.test.mjs. */
const T_A = "udbyderKundeA";
const T_B = "udbyderKundeB";

let miljoe;

/** De noder der findes under tenants/$tenantId, læst ud af regelfilen. */
function nodeliste() {
  const raa = readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const t = JSON.parse(raa).rules.tenants.$tenantId;
  return Object.keys(t).filter((k) => !k.startsWith(".") && !k.startsWith("$"));
}

/* De FIRE noder udbyderen MED VILJE må læse. Står de her, er det fordi nogen
   har besluttet det — alt andet skal fejle.

   ⚠ abonnement kom til med ejerkonsollen. Den er kundeposten, ikke kundedata:
   status, hvornår den blev ændret og af hvem. Konsollen kan ikke vise en
   kundeliste med "aktiv / på pause" uden den — og kunden selv skal kunne
   læse den, for det er DEN node der lukker alle de andre. */
/* ⚠ abonnementHistorik kom til med beslutning 89, og den er den FJERDE — men
   den er ikke som de tre andre: den er læsbar for udbyderen ALENE. Kunden må
   ikke se den, fordi `aarsag` står i posten, og om årsagen siger abonnement.js
   at *"hvorfor han er lukket, hører i en samtale, ikke i en skærm."*

   Retningen er altså den modsatte af de tre: `abonnement` krydser grænsen ud
   til udbyderen OG bliver hos kunden; historikken bliver kun hos udbyderen. */
const TILLADT_FOR_UDBYDER = ["virksomhed", "moduler", "abonnement", "abonnementHistorik"];

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fleetcontrol-rules-test",
    database: { rules: readFileSync("firebase.rules.json", "utf8") },
  });

  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const t of [T_A, T_B]) {
      await set(ref(db, `tenants/${t}/_findes`), true);
      await set(ref(db, `tenants/${t}/virksomhed`), { navn: `Kunde ${t}`, cvr: "12345678" });
      await set(ref(db, `tenants/${t}/moduler`), { dashboard: true, flaade: true });
      /* Lidt drift at prøve at nå. */
      await set(ref(db, `tenants/${t}/kunder/k1`), { navn: "Hemmelig kunde", aktiv: true });
      await set(ref(db, `tenants/${t}/koeretoejer/kt1`), { art: "lastbil", status: "aktiv" });
    }
    await set(ref(db, `udbyder/kunder/${T_A}`), { oprettetMs: 1e12, status: "aktiv" });
    await set(ref(db, `udbyder/kunder/${T_B}`), { oprettetMs: 1e12, status: "aktiv" });
  });
});

after(async () => { await miljoe?.cleanup(); });

/** En udbyder: intet tenant-claim, kun udbyder-flaget. */
const somUdbyder = (uid = "udb1") =>
  miljoe.authenticatedContext(uid, { udbyder: true }).database();

/** En helt almindelig kunde-admin i tenant A. */
const somKunde = (uid = "kunde1", tenant = T_A) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle: "admin", perms: permStrengFraRolle("admin"),
  }).database();

describe("udbyder-claim'et rører ikke kundedata", () => {
  it("kan læse indekset over kunder", async () => {
    /* Det er hele grunden til at noden findes: uden den kan konsollen ikke
       vide hvilke tenants der er. */
    await assertSucceeds(get(ref(somUdbyder(), "udbyder/kunder")));
  });

  it("kan læse virksomhed, moduler, abonnement og historikken — og PRÆCIS de fire", async () => {
    const db = somUdbyder();
    for (const node of TILLADT_FOR_UDBYDER) {
      await assertSucceeds(get(ref(db, `tenants/${T_A}/${node}`)));
    }
  });

  it("afvises på HVER anden node under en tenant", async () => {
    /* ⚠ DEN HER BÆRER KRAVET. Nodelisten kommer fra regelfilen, så en ny
       node med en for løs regel fælder prøven uden at nogen har skrevet et
       testtilfælde til den. */
    const db = somUdbyder();
    const noder = nodeliste().filter((n) => !TILLADT_FOR_UDBYDER.includes(n));
    assert.ok(noder.length > 10, `kun ${noder.length} noder at prøve — er listen læst rigtigt?`);
    for (const node of noder) {
      await assertFails(get(ref(db, `tenants/${T_A}/${node}`)));
    }
  });

  it("kan ikke læse hele tenanten på én gang", async () => {
    /* tenants/$tenantId har bevidst ingen .read. Havde de to tilladte noder
       fået deres regel ét niveau oppe, ville den kaskadere ned over alt. */
    await assertFails(get(ref(somUdbyder(), `tenants/${T_A}`)));
    await assertFails(get(ref(somUdbyder(), "tenants")));
  });

  it("kan ikke skrive noget som helst", async () => {
    /* Skrivning sker med Admin SDK. Et udbyder-claim i en browser kan ikke
       oprette en kunde — og kan derfor heller ikke oprette sig selv adgang. */
    const db = somUdbyder();
    await assertFails(set(ref(db, `udbyder/kunder/${T_A}/status`), "spaerret"));
    await assertFails(set(ref(db, `udbyder/kunder/nyKunde`), { oprettetMs: 1 }));
    await assertFails(set(ref(db, `tenants/${T_A}/virksomhed/navn`), "Overtaget"));
    await assertFails(set(ref(db, `tenants/${T_A}/moduler/facility`), true));
    await assertFails(set(ref(db, `tenants/${T_A}/kunder/k2`), { navn: "X", aktiv: true }));
  });
});

describe("en kunde rører ikke udbyderen — og heller ikke en anden kunde", () => {
  it("kan ikke læse indekset over kunder", async () => {
    /* Det ville liste alle andre kunder. Det er den mest direkte udgave af
       kravet: kunder må ikke kunne komme til hinandens data. */
    await assertFails(get(ref(somKunde(), "udbyder/kunder")));
    await assertFails(get(ref(somKunde(), `udbyder/kunder/${T_B}`)));
  });

  it("kan læse SIN EGEN virksomhed og moduler", async () => {
    const db = somKunde();
    await assertSucceeds(get(ref(db, `tenants/${T_A}/virksomhed`)));
    await assertSucceeds(get(ref(db, `tenants/${T_A}/moduler`)));
  });

  /**
   * ⚠ HELLER IKKE SIN EGEN ABONNEMENTSHISTORIK.
   *
   * Den er den ene node under tenanten som KUNDEN ikke må læse, og det er
   * ikke en stramning for stramningens skyld: `aarsag` står i posten, og om
   * årsagen siger `abonnement.js` at *"hvorfor han er lukket, hører i en
   * samtale, ikke i en skærm."* En log kunden kunne åbne, ville sige
   * "Manglende betaling" på hans egen skærm.
   *
   * Naboen `abonnement` ER hans, fordi låseskærmen skal kunne tegne status —
   * og den viser aldrig årsagen. Se beslutning 89.
   */
  it("kan IKKE læse sin egen abonnementshistorik", async () => {
    await assertFails(get(ref(somKunde(), `tenants/${T_A}/abonnementHistorik`)));
  });

  it("kan IKKE læse en anden kundes virksomhed eller moduler", async () => {
    /* De to noder er de eneste hvor reglen har et ELLER i sig. Præcis dér
       skal det efterprøves at tenant-leddet stadig gælder for en kunde. */
    const db = somKunde();
    await assertFails(get(ref(db, `tenants/${T_B}/virksomhed`)));
    await assertFails(get(ref(db, `tenants/${T_B}/moduler`)));
  });

  it("kan ikke skrive sine egne moduler", async () => {
    /* ⚠ ELLERS KUNNE EN KUNDE KØBE SIG SELV ET MODUL. Modulafkrydsning er
       en kommerciel kontrol, og den skal derfor stadig skrives af os. */
    await assertFails(set(ref(somKunde(), `tenants/${T_A}/moduler/facility`), true));
    await assertFails(set(ref(somKunde(), `tenants/${T_A}/virksomhed/navn`), "Nyt navn"));
  });

  it("et forfalsket udbyder-claim UDEN tenant når stadig ingen drift", async () => {
    /* Claim'et kan kun sættes server-side, men prøven fastholder hvad det
       ville give hvis nogen fik det: adgang til to ikke-operationelle noder
       og indekset. Ikke til en eneste kundes data. */
    const db = miljoe.authenticatedContext("blandet", {
      udbyder: true, rolle: "admin", perms: permStrengFraRolle("admin"),
    }).database();
    await assertFails(get(ref(db, `tenants/${T_A}/kunder`)));
    await assertFails(get(ref(db, `tenants/${T_A}/koeretoejer`)));
    await assertFails(get(ref(db, `tenants/${T_A}/personale`)));
  });
});

describe("Prislisten og målingerne er udbyderens — og kun læsbare", () => {
  before(async () => {
    await miljoe.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await set(ref(db, "udbyder/prisliste/p1"), {
        gyldigFraMs: 1e12, momssats: 25,
        moduler: { flaade: { basisOere: 49500, prBrugerOere: { chauffoer: 4900 } } },
      });
      await set(ref(db, `udbyder/maalinger/${T_A}/2026-08-11`), {
        ms: 1e12, status: "aktiv", brugere: { chauffoer: 12, desktop: 4 },
        koeretoejer: 14, moduler: { flaade: true },
      });
    });
  });

  it("lader udbyderen læse begge", async () => {
    const db = somUdbyder();
    await assertSucceeds(get(ref(db, "udbyder/prisliste")));
    await assertSucceeds(get(ref(db, "udbyder/maalinger")));
  });

  it("holder en KUNDE ude af begge", async () => {
    /* ⚠ MÅLINGEN ER GRUNDLAGET FOR HANS EGEN REGNING, og han skal kunne se
       den — men på grundlaget, ikke i den rå node. Her ligger også de andre
       kunders tal, og de kommer ham ikke ved. */
    const db = somKunde();
    await assertFails(get(ref(db, "udbyder/prisliste")));
    await assertFails(get(ref(db, "udbyder/maalinger")));
    await assertFails(get(ref(db, `udbyder/maalinger/${T_A}`)));
  });

  it("afviser skrivning fra BEGGE", async () => {
    /* ⚠ Kunne en klient skrive en måling, kunne den skrive sin egen regning
       ned. Og kunne den skrive en prisliste, kunne den sætte prisen til nul.
       Begge skrives med Admin SDK. */
    for (const db of [somUdbyder(), somKunde()]) {
      await assertFails(set(ref(db, "udbyder/prisliste/p2"), { gyldigFraMs: 1, momssats: 25 }));
      await assertFails(set(ref(db, "udbyder/prisliste/p1/momssats"), 0));
      await assertFails(set(ref(db, `udbyder/maalinger/${T_A}/2026-08-11/koeretoejer`), 0));
    }
  });
});
