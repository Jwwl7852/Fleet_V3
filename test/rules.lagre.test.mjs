/* test/rules.lagre.test.mjs
 * Lagrene og deres to satslister.
 *
 * ⚠ NODEN VALIDEREDE KUN `division`. De to satslister havde et `.indexOn` og
 * ingen form — et beløb kunne komme ind som float eller som en streng, og
 * beslutning 2 stod dermed kun i en kommentar.
 *
 * Og hullet var svært at se, netop fordi noden var TOM: der var ingen data at
 * blive uenig med. En tom node kan ikke afsløre sin egen manglende validering.
 *
 * ⚠ TO SATSARTER, OG DE MÅLER IKKE DET SAMME. `haandteringSatser` er ind/ud —
 * ét greb, uanset hvor længe godset står. `satser` er døgnene.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set } from "firebase/database";
import { PERM, permStreng } from "../src/fleet/permissions.js";
import { ALLE_METODER } from "../src/fleet/pricing.js";

const T = "tenantLagre";
let miljoe;

const somSkriver = (uid = "u-lager") =>
  miljoe.authenticatedContext(uid, {
    tenant: T, rolle: "admin", perms: permStreng([PERM.lagreSkriv]),
  }).database();

const sti = (rest) => `tenants/${T}/${rest}`;

const LAGER = { navn: "Kolding", kapacitet: 420 };
const DOEGNSATS = {
  gyldigFra: Date.UTC(2026, 0, 1), beloebOere: 4500,
  metode: "prLagerdoegn", friDage: 2, valuta: "DKK", aktiv: true,
};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-lagre",
    database: {
      host: "127.0.0.1", port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `tenants/${T}/_findes`), true);
  });
});

after(async () => { await miljoe?.cleanup(); });

describe("lageret selv", () => {
  it("tager et fuldt udfyldt lager", async () => {
    await assertSucceeds(set(ref(somSkriver(), sti("lagre/lag-ok")), LAGER));
  });

  it("afviser et ukendt felt", async () => {
    await assertFails(
      set(ref(somSkriver(), sti("lagre/ekstra")), { ...LAGER, ejerId: "x" }));
  });
});

describe("satserne på lageret", () => {
  it("tager en døgnsats", async () => {
    const db = somSkriver();
    await set(ref(db, sti("lagre/lag-s")), LAGER);
    await assertSucceeds(set(ref(db, sti("lagre/lag-s/satser/s1")), DOEGNSATS));
  });

  it("⚠ BELØBET ER HELE ØRE — en float afvises", async () => {
    /* 45,00 kr er 4500. En float bliver 4499,999 i en sum over tredive
       lagerdøgn, og så går afregningen mod kunden ikke op med en øre ingen
       kan forklare. Reglen stod kun som en kommentar før. */
    const db = somSkriver();
    await set(ref(db, sti("lagre/lag-f")), LAGER);
    await assertFails(
      set(ref(db, sti("lagre/lag-f/satser/float")), { ...DOEGNSATS, beloebOere: 45.5 }));
    await assertFails(
      set(ref(db, sti("lagre/lag-f/satser/tekst")), { ...DOEGNSATS, beloebOere: "4500" }));
    await assertFails(
      set(ref(db, sti("lagre/lag-f/satser/neg")), { ...DOEGNSATS, beloebOere: -1 }));
  });

  it("kræver gyldigFra, beløb og metode", async () => {
    /* ⚠ gyldigFra ER IKKE VALGFRI. En sats uden dato kan ikke slås op PÅ en
       dato, og så måles et ophold fra marts mod dagens pris. */
    const db = somSkriver();
    await set(ref(db, sti("lagre/lag-k")), LAGER);
    for (const felt of ["gyldigFra", "beloebOere", "metode"]) {
      const uden = { ...DOEGNSATS };
      delete uden[felt];
      await assertFails(set(ref(db, sti(`lagre/lag-k/satser/uden-${felt}`)), uden));
    }
  });

  it("⚠ FLERE SATSER PÅ SAMME LAGER ER MENINGEN", async () => {
    /* Det er hele pointen med versioneringen: to satser med hver sin
       gyldigFra er prishistorikken. En regel der krævede én, ville have
       tvunget en overskrivning — som beslutning 7 forbyder. */
    const db = somSkriver();
    await set(ref(db, sti("lagre/lag-v")), LAGER);
    await assertSucceeds(set(ref(db, sti("lagre/lag-v/satser/a")), { ...DOEGNSATS, gyldigFra: 1 }));
    await assertSucceeds(set(ref(db, sti("lagre/lag-v/satser/b")), { ...DOEGNSATS, gyldigFra: 2, beloebOere: 4800 }));
  });

  it("⚠ METODEN VALIDERES SOM STRENG, IKKE SOM ENUM — med vilje", () => {
    /* Ordlisten er METODER i pricing.js. En afskrift i regelfilen ville være
       et andet sted den stod, med sin egen udrulningscyklus — og første
       udkast af reglen skrev netop `prPalleDoegn` hvor den rigtige hedder
       `prPalledoegn`. Kontrollen ligger derfor dér hvor listen bor; se
       test/pricing-forloeb.test.mjs.

       Prøven her fastholder at reglen IKKE indeholder et enum, så den ikke
       kan blive skrevet ind igen i en fart. */
    /* ⚠ NODEN, IKKE ET TEKSTUDSNIT. Prøven skar før fra `"lagre": {` til
       `"bookinger": {` og læste alt derimellem — altså også `indberetninger`
       og hvad der ellers stod i mellemrummet. Den faldt på en KOMMENTAR i
       `materialelinjer.lagerId` der nævnte `prLagerdoegn` for at forklare at
       `lagre` bruges til to ting.

       Et anker der spænder over "resten indtil den næste node", er ikke et
       anker — syvende gang i dette repo (jf. beslutning 100). Reglen læses
       nu som JSON, så kravet gælder præcis den node det handler om. */
    const lagre = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .replace(/^﻿/, "").replace(/^\s*\/\/.*$/gm, "")
    ).rules.tenants.$tenantId.lagre;
    assert.ok(lagre, "lagre-noden blev ikke fundet");
    assert.doesNotMatch(JSON.stringify(lagre), /prLagerdoegn/,
      "metodenavne er skrevet af ind i regelfilen — ordlisten bor i pricing.js");
    assert.ok(ALLE_METODER.includes("prLagerdoegn"), "METODER kender ikke prLagerdoegn");
  });
});
