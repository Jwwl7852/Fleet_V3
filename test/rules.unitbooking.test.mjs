/* test/rules.unitbooking.test.mjs
 * Unitbooking etape 4: hvem må skrive hvad om en kasse og et udlån.
 *
 * ⚠ HVORFOR DEN HER FIL BLEV SKREVET.
 * Etape 4 flyttede to ting fra klienten til serveren, og begge flytninger er
 * usynlige i en gennemlæsning:
 *
 *   1. `kasseudlaan` blev `.write: false`. Et udlån ændrer TO poster — udlånet
 *      og kassen — og perioden skal prøves mod de eksisterende udlån. Et
 *      konflikttjek i skærmen kan gås uden om med en direkte skrivning.
 *   2. Klienten må kun sætte kassens status til `ledig` eller `udeAfDrift`.
 *      `klargjort` og `udlaant` er FØLGER af et udlånsskifte.
 *
 * Suiten kørte grøn med det samme efter begge ændringer — der fandtes ingen
 * prøve der skrev et kasseudlån fra en klient. En regel ingen har forsøgt at
 * bryde, er ikke afprøvet. Det er samme lærestreg som rules.opgaver.test.mjs
 * skriver i sit eget hoved.
 *
 * Kør:  npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import { SELVVALGT_KASSE_STATUS } from "../src/fleet/unitbooking.js";

/* Egen tenant: node --test kører testfilerne parallelt. */
const TENANT = "vognmandWh";
let miljoe;

const som = (uid, rolle = "lagermedarbejder") =>
  miljoe.authenticatedContext(uid, {
    tenant: TENANT, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const t = (sti) => `tenants/${TENANT}/${sti}`;

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-unitbooking",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  /* Grundlaget lægges uden om reglerne — det er ikke det der prøves her.
     ⚠ Bemærk at MDT-900 lægges ind som `udlaant`: den tilstand KAN kun opstå
     via serveren, og prøven nedenfor skal kunne redigere en kasse der er ude. */
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, t("_findes")), true);
    /* ⚠ TO TYPER: en MED undertyper og en UDEN. Uden den sidste kunne
       proeven ikke skelne "undertypen hoerer til en anden type" fra "typen
       har slet ingen", og de to er forskellige fejl. */
    await set(ref(db, t("kassetyper/AL")), {
      navn: "Alukasse",
      undertyper: { std: { navn: "Standard" }, xl: { navn: "XL" } },
    });
    await set(ref(db, t("kassetyper/TR")), { navn: "Traekasse" });
    await set(ref(db, t("reolpladser/p1")), {
      hal: "Hal 1", reol: "1", fag: "1", hylde: "6", plads: "1",
    });
    await set(ref(db, t("kasser/MDT-900")), {
      type: "AL", status: "udlaant", hjemPladsId: "p1",
    });
    await set(ref(db, t("kasseudlaan/u-eksisterende")), {
      kasseId: "MDT-900", sagsnummer: "4260", fra: 1786000000000,
      til: 1787000000000, tilstand: "udlaant",
    });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("et udlån skrives kun af serveren", () => {
  it("nægter en lagermedarbejder at oprette et udlån", async () => {
    /* ⚠ HAN HAR PERMISSIONEN. `kasseudlaan.skriv` står i hans rolle, og den
       blev der ikke fjernet — den bruges af den Cloud Function der skriver
       for ham. Det er VEJEN der er lukket, ikke retten. */
    const db = som("lager-1");
    await assertFails(set(ref(db, t("kasseudlaan/u-ny")), {
      kasseId: "MDT-900", sagsnummer: "4999", fra: 1790000000000,
      til: 1791000000000, tilstand: "booket",
    }));
  });

  it("nægter også en admin — det er ikke et rolle­spørgsmål", async () => {
    const db = som("admin-1", "admin");
    await assertFails(set(ref(db, t("kasseudlaan/u-admin")), {
      kasseId: "MDT-900", sagsnummer: "4998", fra: 1790000000000,
      til: 1791000000000, tilstand: "booket",
    }));
  });

  it("nægter at rette tilstanden på et udlån der findes", async () => {
    /* Kunne den rettes direkte, kunne en kasse meldes returneret uden at
       nogen havde den i hånden — og kassens status ville blive stående. */
    const db = som("lager-1");
    await assertFails(
      set(ref(db, t("kasseudlaan/u-eksisterende/tilstand")), "returneret"));
  });

  it("lader alle læse dem — listen er ikke hemmelig", async () => {
    const db = som("lager-1");
    await assertSucceeds(get(ref(db, t("kasseudlaan"))));
  });
});

describe("kassens status: klienten sætter kun det den kan se", () => {
  const kasse = (ekstra) => ({ type: "AL", hjemPladsId: "p1", ...ekstra });

  it("accepterer de to selvvalgte", async () => {
    const db = som("lager-2");
    for (const status of SELVVALGT_KASSE_STATUS) {
      await assertSucceeds(set(ref(db, t(`kasser/MDT-92${
        SELVVALGT_KASSE_STATUS.indexOf(status)}`)),
        kasse({ status, pladsId: "p1" })));
    }
  });

  it("nægter klargjort og udlaant på en NY kasse", async () => {
    const db = som("lager-2");
    await assertFails(set(ref(db, t("kasser/MDT-910")),
      kasse({ status: "klargjort", pladsId: "p1" })));
    /* ⚠ Uden plads, som en udlånt kasse skal være — så afvisningen ikke
       kommer af pladsreglen i stedet. */
    await assertFails(set(ref(db, t("kasser/MDT-911")),
      kasse({ status: "udlaant" })));
  });

  it("nægter at melde en kasse hjem uden om udlånet", async () => {
    /* Det farligste tilfælde: MDT-900 er ude hos et museum. Kunne en klient
       sætte den til `ledig`, ville den stå som hjemme mens udlånet stadig
       sagde udlånt — og næste booking ville blive lovet en kasse i Paris. */
    const db = som("lager-2");
    await assertFails(update(ref(db, t("kasser/MDT-900")), { status: "ledig" }));
  });

  it("tillader at rette noten på en kasse der ER ude", async () => {
    /* ⚠ DEN HER ER GRUNDEN TIL SIDSTE LED I REGLEN. Uden `newData.val() ===
       data.val()` ville formularen ikke kunne gemme NOGET på en udlånt kasse,
       fordi den sender hele posten med sin uændrede status. En regel der
       spærrer for det legitime, bliver lavet om af den næste — og så ryger
       spærringen ovenfor med. */
    const db = som("lager-2");
    await assertSucceeds(set(ref(db, t("kasser/MDT-900")), {
      type: "AL", status: "udlaant", hjemPladsId: "p1",
      note: "Hank løs i venstre side.",
    }));
  });

  it("nægter stadig en udlånt kasse en reolplads", async () => {
    const db = som("lager-2");
    await assertFails(set(ref(db, t("kasser/MDT-900")), {
      type: "AL", status: "udlaant", hjemPladsId: "p1", pladsId: "p1",
    }));
  });
});

describe("modellen og reglerne siger det samme", () => {
  it("kender ikke kassestatussen booket", () => {
    /* ⚠ EN RESERVATION ER ET UDLÅN. Stod `booket` også på kassen, var samme
       kendsgerning gemt to steder. Reglen skal ikke tage imod den. */
    const tekst = readFileSync("firebase.rules.json", "utf8");
    const linje = tekst.split(/\r?\n/).find((l) =>
      l.includes('"status"') && l.includes("ledig"));
    assert.ok(linje, "fandt ikke statusreglen for en kasse");
    assert.ok(!linje.includes("booket"),
      "kassens statusregel kender stadig booket");
    for (const s of SELVVALGT_KASSE_STATUS) {
      assert.ok(linje.includes(s), `statusreglen mangler ${s}`);
    }
  });
});

describe("undertypen skal høre til kassens egen type", () => {
  /* ⚠ KRYDSFELT-REGEL. Uden det led kunne en trækasse bære alukassens "XL",
     og filtret "Trækasse + XL" ville vise en kasse der hverken var det ene
     eller det andet. Reglen læser newData.parent(), altså postens tilstand
     EFTER skrivningen — derfor holder den også når kun undertypen rettes. */
  const kasse = (ekstra) => ({
    type: "AL", status: "ledig", hjemPladsId: "p1", pladsId: "p1", ...ekstra,
  });

  it("en undertype fra kassens egen type går igennem", async () => {
    const db = som("lager-1");
    await assertSucceeds(set(ref(db, t("kasser/MDT-U1")), kasse({ undertype: "std" })));
  });

  it("⚠ EN ANDEN TYPES UNDERTYPE AFVISES", async () => {
    const db = som("lager-1");
    await assertFails(set(ref(db, t("kasser/MDT-U2")),
      kasse({ type: "TR", undertype: "xl" })));
  });

  it("en type uden undertyper kan ikke få en", async () => {
    const db = som("lager-1");
    await assertFails(set(ref(db, t("kasser/MDT-U3")),
      kasse({ type: "TR", undertype: "std" })));
  });

  it("en ukendt undertype afvises", async () => {
    const db = som("lager-1");
    await assertFails(set(ref(db, t("kasser/MDT-U4")),
      kasse({ undertype: "findes-ikke" })));
  });

  it("feltet er ikke påkrævet — en kasse uden undertype går igennem", async () => {
    const db = som("lager-1");
    await assertSucceeds(set(ref(db, t("kasser/MDT-U5")), kasse()));
    await assertSucceeds(set(ref(db, t("kasser/MDT-U6")), kasse({ type: "TR" })));
  });

  it("⚠ EN DYB SKRIVNING AF KUN UNDERTYPEN KOMMER IKKE UDENOM REGLEN", async () => {
    /* Det er her newData.parent() betyder noget: kassen findes med type AL,
       og der skrives kun feltet. Kunne man sætte en trækasses undertype med
       et enkeltfelt-skriv, ville krydsfelt-reglen være dekoration. */
    const db = som("lager-1");
    await assertSucceeds(set(ref(db, t("kasser/MDT-U7")), kasse()));
    await assertSucceeds(set(ref(db, t("kasser/MDT-U7/undertype")), "xl"));
    await assertFails(set(ref(db, t("kasser/MDT-U7/undertype")), "findes-ikke"));
  });

  it("undertyper i katalogget kræver et navn", async () => {
    const db = som("lager-1");
    await assertSucceeds(set(ref(db, t("kassetyper/AL/undertyper/ny")), { navn: "Ny" }));
    await assertFails(set(ref(db, t("kassetyper/AL/undertyper/tom")), { beskrivelse: "x" }));
    await assertFails(set(ref(db, t("kassetyper/AL/undertyper/lang")),
      { navn: "x".repeat(61) }));
  });
});
