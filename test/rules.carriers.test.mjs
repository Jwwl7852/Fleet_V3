/* test/rules.carriers.test.mjs
 * Carrieren i reglerne — WAREHOUSE.md etape 11.
 *
 * `carriers/<carrierId>`
 *
 * ⚠ DEN INVARIANT DER BÆRER BELÆGNINGEN, HÅNDHÆVES HER.
 * `belaegningPaaPlads()` i reolplads.js tæller det der HAR et pladsId, og
 * spørger ikke om status. Det er kun rigtigt så længe en carrier der ikke
 * står på lageret, ikke KAN have en plads — og det er reglerne der afgør,
 * ikke formularen. En kontrol der kun findes i frontend, er ikke
 * adgangskontrol.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";

import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import { PERM, ALLE_PERMS, permStreng, permStrengFraRolle } from "../src/fleet/permissions.js";
import { ALLE_CARRIER_STATUS, ALLE_CARRIER_TYPER } from "../src/fleet/warehouse.js";

const T = "tenantCarrier";
const UDEN_MODUL = "tenantUdenWms";
const PLADS = "p-a-01-02";
const KUNDE = "k-nordisk";
/* ⚠ TRANSPORTEN ER EN ETAPE — beslutning 46. Feltet hed transportId og stod
   uden eksistenskontrol, så længe spørgsmålet var åbent (WAREHOUSE.md 6.4). */
const ETAPE = "et-001";

let miljoe;

const medPerms = (uid, perms, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle: "lagermedarbejder", perms: permStreng(perms),
  }).database();

const somRolle = (uid, rolle, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const sti = (rest, tenant = T) => `tenants/${tenant}/${rest}`;
const carrierSti = (id, tenant = T) => sti(`carriers/${id}`, tenant);

const PAA_LAGER = {
  type: "pallekasse", ejerforhold: "ejet", status: "paaLager",
  pladsId: PLADS, kundeId: KUNDE,
};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-carriers",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    await set(ref(db, `tenants/${T}/moduler`), { warehouse: true, unitbooking: false });
    await set(ref(db, sti(`reolpladser/${PLADS}`)), {
      hal: "Hovedlager", reol: "A01", fag: "02", hylde: "1", plads: "1",
    });
    await set(ref(db, sti(`kunder/${KUNDE}`)), {
      navn: "Nordisk Transport", division: "gods", aktiv: true,
    });
    /* Etapen beholderen kan knyttes til. ⚠ Tenanten har IKKE booking-modulet,
       og det er med vilje: reglens opslag læser træet og går uden om .read,
       så en carrier kan bære et etapeId hos en kunde der ikke selv må liste
       etaper. Samme asymmetri som kundeId har. */
    await set(ref(db, sti(`etaper/${ETAPE}`)), {
      division: "gods", bookingId: "bk-2026-00317", nr: 1,
    });

    /* En tenant der IKKE har Warehouse — modulspærringen prøves mod den. */
    await set(ref(db, `tenants/${UDEN_MODUL}/_findes`), true);
    await set(ref(db, `tenants/${UDEN_MODUL}/moduler`), { warehouse: false, unitbooking: true });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("hvem må skrive en carrier", () => {
  it("med carriers.skriv går den igennem", async () => {
    const db = medPerms("uid-ok", [PERM.carriersSkriv]);
    await assertSucceeds(set(ref(db, carrierSti("CRR-100245")), PAA_LAGER));
  });

  /* ⚠ PERMISSIONEN ER carriers.skriv OG IKKE kasser.skriv.
     En WMS-medarbejder hos en kunde uden Unitbooking skal kunne oprette en
     beholder — samme fælde som reolpladser.skriv lukkede. */
  it("⚠ kasser.skriv RÆKKER IKKE — heller ikke med alt andet", async () => {
    const uden = ALLE_PERMS.filter((p) => p !== PERM.carriersSkriv);
    const db = medPerms("uid-uden", uden);
    await assertFails(set(ref(db, carrierSti("CRR-forsoeg")), PAA_LAGER));
  });

  it("lagermedarbejderen kan, chaufføren kan ikke", async () => {
    await assertSucceeds(set(
      ref(somRolle("uid-lager", "lagermedarbejder"), carrierSti("CRR-lager")), PAA_LAGER));
    await assertFails(set(
      ref(somRolle("uid-chauffoer", "chauffoer"), carrierSti("CRR-ch")), PAA_LAGER));
  });

  it("enhver i tenanten må læse dem", async () => {
    /* Der er ingen carriers.laes: der findes ingen klassificeret satellit at
       kontrastere mod, og så ville permissionen ikke beskytte noget. Samme
       begrundelse som varer og bevægelser. */
    await assertSucceeds(get(ref(somRolle("uid-laes", "chauffoer"), sti("carriers"))));
  });
});

describe("modulet spærrer noden", () => {
  it("⚠ EN TENANT UDEN WAREHOUSE KAN HVERKEN LÆSE ELLER SKRIVE", async () => {
    /* Modulspærringen rammer begge veje — se rules.moduler.test.mjs. En
       kunde der ikke har købt WMS, har ingen carriers. */
    const db = medPerms("uid-udenmodul", ALLE_PERMS, UDEN_MODUL);
    await assertFails(set(ref(db, carrierSti("CRR-x", UDEN_MODUL)), PAA_LAGER));
    await assertFails(get(ref(db, sti("carriers", UDEN_MODUL))));
  });
});

describe("formen på en carrier", () => {
  const skriv = (id, post) =>
    set(ref(medPerms("uid-form", [PERM.carriersSkriv]), carrierSti(id)), post);

  it("kræver type, ejerforhold og status", async () => {
    await assertFails(skriv("c-1", { ejerforhold: "ejet", status: "paaLager" }));
    await assertFails(skriv("c-2", { type: "pallekasse", status: "paaLager" }));
    await assertFails(skriv("c-3", { type: "pallekasse", ejerforhold: "ejet" }));
  });

  it("afviser en ukendt type, ejerforhold og status", async () => {
    await assertFails(skriv("c-4", { ...PAA_LAGER, type: "papkasse" }));
    await assertFails(skriv("c-5", { ...PAA_LAGER, ejerforhold: "lejet" }));
    await assertFails(skriv("c-6", { ...PAA_LAGER, status: "delvistTomt" }));
  });

  it("kender hver type og status koden kender", async () => {
    /* ⚠ TO LISTER DRIVER. Reglerne er dem der afgør; en status der kun findes
       i koden, afvises først hos kunden. */
    for (const type of ALLE_CARRIER_TYPER) {
      await assertSucceeds(skriv(`c-type-${type}`, { ...PAA_LAGER, type }));
    }
    for (const status of ALLE_CARRIER_STATUS) {
      const post = { ...PAA_LAGER, status };
      if (status === "iTransit" || status === "opbrugt") delete post.pladsId;
      if (status === "opbrugt") post.ejerforhold = "engang";
      await assertSucceeds(skriv(`c-status-${status}`, post));
    }
  });

  /* ⚠ DET LED BELÆGNINGEN HVILER PÅ. */
  it("⚠ EN CARRIER I TRANSIT KAN IKKE HAVE EN PLADS", async () => {
    await assertFails(skriv("c-transit", { ...PAA_LAGER, status: "iTransit" }));
    await assertSucceeds(skriv("c-transit-ok", {
      type: "pallekasse", ejerforhold: "ejet", status: "iTransit",
      etapeId: ETAPE,
    }));
  });

  /* ⚠ FREMMEDNØGLEN ER SELVE BESLUTNINGEN. Så længe det var uafgjort, om en
     transport var en etape eller et nyt objekt, stod feltet som en fri streng
     — planchens `TRP-2024-0513` ville være gået igennem. Gør den det stadig,
     er beslutning 46 ikke håndhævet nogen steder, og labelen kan ikke slå sin
     egen transport op. */
  it("⚠ ET etapeId SKAL PEGE PÅ EN ETAPE DER FINDES", async () => {
    await assertFails(skriv("c-trp", {
      type: "pallekasse", ejerforhold: "ejet", status: "iTransit",
      etapeId: "TRP-2024-0513",
    }));
    await assertFails(skriv("c-tom-etape", {
      type: "pallekasse", ejerforhold: "ejet", status: "iTransit",
      etapeId: "et-findes-ikke",
    }));
  });

  /* Det gamle navn er væk, ikke bare ubrugt. En post der stadig bærer det,
     ville stå med et felt ingen skærm læser. */
  it("⚠ transportId ER IKKE ET FELT LÆNGERE", async () => {
    await assertFails(skriv("c-gammelt-navn", {
      type: "pallekasse", ejerforhold: "ejet", status: "iTransit",
      transportId: "TRP-2024-0513",
    }));
  });

  it("⚠ EN OPBRUGT CARRIER KAN HELLER IKKE", async () => {
    await assertFails(skriv("c-opbrugt", {
      ...PAA_LAGER, ejerforhold: "engang", status: "opbrugt",
    }));
  });

  it("⚠ EN PÅ LAGERET MÅ GERNE MANGLE SIN PLADS", async () => {
    /* Scannet ind, ikke placeret — de elleve "uden lokation" på planchen.
       Kræver reglerne en plads, kan modtagelsen ikke gemme det der skete. */
    await assertSucceeds(skriv("c-ulokaliseret", {
      type: "kartonkasse", ejerforhold: "engang", status: "paaLager",
    }));
  });

  it("⚠ KUN EN ENGANGS KAN VÆRE OPBRUGT", async () => {
    await assertFails(skriv("c-ejet-opbrugt", {
      type: "pallekasse", ejerforhold: "ejet", status: "opbrugt",
    }));
    await assertSucceeds(skriv("c-engang-opbrugt", {
      type: "traekasse", ejerforhold: "engang", status: "opbrugt",
    }));
  });

  it("afviser en plads og en kunde der ikke findes", async () => {
    await assertFails(skriv("c-plads", { ...PAA_LAGER, pladsId: "p-findes-ikke" }));
    await assertFails(skriv("c-kunde", { ...PAA_LAGER, kundeId: "k-findes-ikke" }));
  });

  it("kræver mål i hele millimeter", async () => {
    await assertFails(skriv("c-maal", { ...PAA_LAGER, laengdeMm: 1200.5 }));
    await assertFails(skriv("c-maal2", { ...PAA_LAGER, breddeMm: -1 }));
    await assertSucceeds(skriv("c-maal3", {
      ...PAA_LAGER, laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950,
    }));
  });

  it("afviser et ukendt felt", async () => {
    await assertFails(skriv("c-ukendt", { ...PAA_LAGER, indhold: "3 varer" }));
  });

  /* ⚠ INDHOLDET LIGGER IKKE HER ENDNU. Beholdningen hænger på pladsen indtil
     etape 12, og et felt der lignede indhold, ville blive en tredje kilde til
     hvad der er i beholderen. */
  it("⚠ BÆRER IKKE SIT INDHOLD ENDNU", async () => {
    await assertFails(skriv("c-varer", { ...PAA_LAGER, varer: { v1: 3 } }));
    await assertFails(skriv("c-antal", { ...PAA_LAGER, antalVarer: 3 }));
  });

  it("⚠ EN DYB ENKELTFELT-SKRIVNING KOMMER IKKE UDENOM KRYDSFELT-REGLEN", async () => {
    /* Krydsfelt-reglerne står på $carrierId og skal gælde uanset hvilket
       enkeltfelt der skrives. Kunne man sætte status til iTransit alene og
       lade pladsen blive stående, ville belægningen tælle en beholder der er
       på vej ud ad porten. */
    const db = medPerms("uid-dyb", [PERM.carriersSkriv]);
    await assertSucceeds(set(ref(db, carrierSti("CRR-dyb")), PAA_LAGER));
    await assertFails(set(ref(db, `${carrierSti("CRR-dyb")}/status`), "iTransit"));
    await assertFails(set(ref(db, `${carrierSti("CRR-dyb")}/pladsId`), "p-findes-ikke"));
    /* Og den rigtige vej rundt går igennem: pladsen fjernes SAMMEN med
       skiftet. Det er én skrivning, ikke to. */
    await assertSucceeds(set(ref(db, carrierSti("CRR-dyb")), {
      type: "pallekasse", ejerforhold: "ejet", status: "iTransit",
      kundeId: KUNDE, etapeId: ETAPE,
    }));
  });
});
