/* test/warehouse.test.mjs
 * Warehouse — de fem ting prototypen gjorde forkert, og som ikke må komme med.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KASSE_STATUS, ALLE_KASSE_STATUS, kraeverPlads,
  UDLAAN_TILSTAND, ALLE_UDLAAN_TILSTANDE, BINDENDE,
  pladsnavn, haller, valideReolplads, valideKasse, valideUdlaan,
  overlapper, konflikter, ledigeKasser, KASSE_ID_MOENSTER,
} from "../src/fleet/warehouse.js";
import { NODE_MODUL, MODUL, ALLE_MODULER, UDEN_SKAERM } from "../src/fleet/moduler.js";
import { PERM, ROLLE_PERMS, ALLE_ROLLER } from "../src/fleet/permissions.js";

const D = (a, m, d) => Date.UTC(a, m - 1, d);

describe("Pladsen er et id, ikke en streng", () => {
  it("udleder navnet af felterne", () => {
    /* ⚠ PROTOTYPEN BRUGTE STRENGEN SOM NØGLE. Omdøbtes en hal, pegede hver
       eneste kasse på en plads der ikke fandtes. */
    assert.equal(
      pladsnavn({ hal: "Hal 1", reol: "2", fag: "1", hylde: "10", plads: "1" }),
      "Hal 1 · Reol 2 · Fag 1 · Hylde 10 · Plads 1");
  });

  it("gemmer ikke navnet — reglerne afviser feltet", () => {
    /* Et gemt navn driver fra sine felter, og så kan ingen se hvilket der er
       rigtigt. Samme fejl som bemanding.ledig. */
    const regler = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
    const i = regler.indexOf('"reolpladser"');
    const blok = regler.slice(i, i + 4000);
    assert.match(blok, /"navn": \{ "\.validate": false \}/,
      "reolpladser tillader et gemt navn.");
  });

  it("finder hallerne af pladserne, ikke af et katalog", () => {
    const p = {
      a: { hal: "Hal 2" }, b: { hal: "Hal 1" }, c: { hal: "Hal 1" }, d: { hal: "Ålborghallen" },
    };
    /* Dansk sortering: Å sidst. */
    assert.deepEqual(haller(p), ["Hal 1", "Hal 2", "Ålborghallen"]);
  });

  it("kræver alle fem led", () => {
    assert.deepEqual(valideReolplads(
      { hal: "Hal 1", reol: "2", fag: "1", hylde: "10", plads: "1" }), {});
    assert.ok(valideReolplads({ hal: "Hal 1" }).reol);
    assert.ok(valideReolplads({ reol: "2", fag: "1", hylde: "1", plads: "1" }).hal);
  });
});

describe("Kassen", () => {
  const ctx = { typer: ["AL"], pladser: ["p1", "p2"] };
  const kasse = { id: "MDT-101", type: "AL", status: "ledig", hjemPladsId: "p1", pladsId: "p1" };

  it("bruger sin påskrift som id", () => {
    /* "MDT-101" står på kassen med tusch. Et genereret id ville betyde at
       nummeret på kassen og nummeret i systemet var to ting. */
    assert.ok(KASSE_ID_MOENSTER.test("MDT-101"));
    assert.ok(!KASSE_ID_MOENSTER.test("MDT 101"), "mellemrum blev godtaget");
    assert.ok(!KASSE_ID_MOENSTER.test("MDT.101"), "punktum er ulovligt i en RTDB-nøgle");
    assert.deepEqual(valideKasse(kasse, ctx), {});
  });

  it("⚠ optager IKKE en reolplads når den er udlånt", () => {
    /* Prototypen skrev "Udlånt hos kunde" SOM PLADS. Så kan ledige pladser
       ikke tælles, og en hylde er optaget af en kasse der fysisk er i Paris. */
    assert.ok(valideKasse({ ...kasse, status: "udlaant", pladsId: "p1" }, ctx).pladsId);
    assert.deepEqual(valideKasse({ ...kasse, status: "udlaant", pladsId: null }, ctx), {});
  });

  it("står et sted når den ikke er udlånt", () => {
    for (const status of ALLE_KASSE_STATUS.filter((s) => kraeverPlads(s))) {
      assert.ok(valideKasse({ ...kasse, status, pladsId: null }, ctx).pladsId,
        `${status} blev godtaget uden plads`);
    }
  });

  it("kræver en hjemplads, også når den er ude", () => {
    /* Hvor kassen HØRER TIL, er ikke det samme som hvor den står. */
    assert.ok(valideKasse({ ...kasse, status: "udlaant", pladsId: null, hjemPladsId: null }, ctx)
      .hjemPladsId);
  });

  it("afviser en ukendt type og en ukendt plads", () => {
    assert.ok(valideKasse({ ...kasse, type: "XX" }, ctx).type);
    assert.ok(valideKasse({ ...kasse, hjemPladsId: "p9" }, ctx).hjemPladsId);
  });

  it("kan tages ud af drift — ikke slettes", () => {
    /* Der hænger udlånshistorik på id'et. Samme regel som en solgt bil. */
    assert.ok(ALLE_KASSE_STATUS.includes("udeAfDrift"));
    const regler = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
    assert.match(regler, /udeAfDrift/, "reglerne kender ikke udeAfDrift");
  });
});

describe("Udlånet", () => {
  const ctx = { kasser: ["MDT-101"] };
  const u = {
    kasseId: "MDT-101", sagsnummer: "4357",
    fra: D(2026, 3, 2), til: D(2026, 3, 22), tilstand: "booket",
  };

  it("kræver et sagsnummer", () => {
    /* ⚠ DEN ENESTE NØGLE UD AF SYSTEMET. Uden det kan en kasse ikke findes
       igen når museet ringer. */
    assert.deepEqual(valideUdlaan(u, ctx), {});
    assert.ok(valideUdlaan({ ...u, sagsnummer: "" }, ctx).sagsnummer);
  });

  it("afviser en slutdato før startdatoen", () => {
    assert.ok(valideUdlaan({ ...u, til: D(2026, 3, 1) }, ctx).til);
  });

  it("afviser en ukendt kasse", () => {
    assert.ok(valideUdlaan({ ...u, kasseId: "MDT-999" }, ctx).kasseId);
  });
});

describe("To udlån på samme kasse", () => {
  it("overlapper INKLUSIVE i begge ender", () => {
    /* En kasse der kommer retur den 5. og lånes ud igen den 5., er ikke to
       udlån der kan køre samtidig — den skal pakkes ud, tjekkes og pakkes om. */
    assert.ok(overlapper(D(2026, 1, 1), D(2026, 1, 5), D(2026, 1, 5), D(2026, 1, 9)));
    assert.ok(!overlapper(D(2026, 1, 1), D(2026, 1, 5), D(2026, 1, 6), D(2026, 1, 9)));
  });

  it("tæller kun BINDENDE tilstande som en konflikt", () => {
    /* Et returneret eller annulleret udlån spærrer ingenting. */
    const udlaan = ALLE_UDLAAN_TILSTANDE.map((tilstand, i) => ({
      id: `u${i}`, kasseId: "MDT-101", tilstand,
      fra: D(2026, 1, 1), til: D(2026, 1, 31),
    }));
    const k = konflikter(udlaan, { kasseId: "MDT-101", fra: D(2026, 1, 10), til: D(2026, 1, 12) });
    assert.deepEqual(k.map((x) => x.tilstand).sort(), [...BINDENDE].sort());
  });

  it("kan se bort fra udlånet selv, når det redigeres", () => {
    const udlaan = [{ id: "u1", kasseId: "MDT-101", tilstand: "booket",
      fra: D(2026, 1, 1), til: D(2026, 1, 31) }];
    assert.equal(konflikter(udlaan,
      { kasseId: "MDT-101", fra: D(2026, 1, 5), til: D(2026, 1, 9), undtagId: "u1" }).length, 0);
  });

  it("⚠ AFGØR INGENTING — den svarer", () => {
    /* Håndhævelsen hører i den Cloud Function der skriver udlånet: to
       lagermænd kan ramme samme sekund, og en kontrol der kun står i skærmen,
       kan gås uden om med en direkte skrivning. Præcis samme forbehold som de
       fem disponeringstjek har. Prøven fastholder at noten står der. */
    const kilde = readFileSync(new URL("../src/fleet/warehouse.js", import.meta.url), "utf8");
    assert.match(kilde, /AFGØR INGENTING/,
      "forbeholdet om at konflikter() ikke håndhæver, er fjernet.");
  });

  it("finder de ledige kasser i en periode", () => {
    const kasser = {
      "MDT-101": { type: "AL", status: "ledig" },
      "MDT-102": { type: "AL", status: "ledig" },
      "MDT-103": { type: "AL", status: "udeAfDrift" },
      "MDT-104": { type: "TR", status: "ledig" },
    };
    const udlaan = [{ id: "u1", kasseId: "MDT-101", tilstand: "booket",
      fra: D(2026, 1, 1), til: D(2026, 1, 31) }];

    const fri = ledigeKasser(kasser, udlaan, { fra: D(2026, 1, 10), til: D(2026, 1, 12) });
    assert.deepEqual(fri.map((k) => k.id).sort(), ["MDT-102", "MDT-104"]);

    /* En kasse ude af drift er ikke ledig, heller ikke når ingen har booket den. */
    assert.ok(!fri.some((k) => k.id === "MDT-103"));

    const kunAL = ledigeKasser(kasser, udlaan,
      { fra: D(2026, 1, 10), til: D(2026, 1, 12), type: "AL" });
    assert.deepEqual(kunAL.map((k) => k.id), ["MDT-102"]);
  });
});

describe("Modulet er registreret — men ikke tegnet", () => {
  it("står i kataloget med sine fire noder", () => {
    assert.ok(MODUL.warehouse, "warehouse mangler i kataloget");
    assert.deepEqual(
      Object.keys(NODE_MODUL).filter((n) => NODE_MODUL[n] === "warehouse").sort(),
      ["kasser", "kassetyper", "kasseudlaan", "reolpladser"]);
  });

  it("⚠ HAR INGEN SKÆRM ENDNU, og siger det", () => {
    /* Et menupunkt der fører til ingenting, lover noget produktet ikke kan.
       Navnet står i UDEN_SKAERM indtil etape 3. */
    assert.ok(UDEN_SKAERM.includes("warehouse"));
  });

  it("bruger ikke et navn der var taget", () => {
    /* lagre er reservedele, bookinger er en transportopgave, kunder er
       kartoteket. To ting med samme navn er beslutning 11 og 14 om igen. */
    for (const node of ["kasser", "kassetyper", "reolpladser", "kasseudlaan"]) {
      assert.ok(!["lagre", "bookinger", "kunder", "opgaver"].includes(node));
    }
    assert.equal(NODE_MODUL.lagre, "indkoeb", "lagre hører stadig til Indkøb");
  });
});

describe("Adgangen er permissions, ikke en femte rolleverden", () => {
  it("har to permissions — stamdata og drift", () => {
    /* Prototypen havde Admin/Lager/Læser/Chauffør med sin egen matrix.
       Beslutning 31: rollerne er faste, og adgang afgøres af permissions. */
    assert.equal(PERM.kasserSkriv, "kasser.skriv");
    assert.equal(PERM.kasseudlaanSkriv, "kasseudlaan.skriv");
  });

  it("⚠ CHAUFFØREN HAR DEM IKKE — og det er nu et SVAR, ikke et spørgsmål", () => {
    /* Prototypens "Chauffør = udlevering/retur" ville kræve
       kasseudlaan.skriv på chauffør-presettet. Et preset er en BESLUTNING
       (nr. 31), ikke noget der ændres i forbifarten.

       Svaret blev: det er LAGERMEDARBEJDEREN der udleverer og modtager
       retur. En chauffør kører; den der står med kassen i hånden på lageret,
       er en anden person med et andet arbejde. Rollen findes nu. */
    assert.ok(!ROLLE_PERMS.chauffoer.includes(PERM.kasseudlaanSkriv));
    assert.ok(!ROLLE_PERMS.chauffoer.includes(PERM.kasserSkriv));
  });

  it("giver dem KUN til lagermedarbejderen og admin", () => {
    /* ⚠ EN DEDIKERET ROLLE ER MENINGSLOES, hvis alle andre har det samme i
       forvejen. De to permissions laa foerst i BASIS_DATA — altsaa hos
       sagsbehandler, disponent og koordinator — og saa ville
       lagermedarbejderen ikke vaere en afgraensning af noget. */
    for (const rolle of ["lagermedarbejder", "admin"]) {
      assert.ok(ROLLE_PERMS[rolle].includes(PERM.kasserSkriv), `${rolle} mangler kasser.skriv`);
      assert.ok(ROLLE_PERMS[rolle].includes(PERM.kasseudlaanSkriv), `${rolle} mangler kasseudlaan.skriv`);
    }
    for (const rolle of ["chauffoer", "casehandler", "disponent", "koordinator", "revisor"]) {
      assert.ok(!ROLLE_PERMS[rolle].includes(PERM.kasseudlaanSkriv),
        `${rolle} kan udlevere en kasse — det er lagermedarbejderens arbejde`);
    }
  });

  it("har ingen laes-permission", () => {
    /* Der er ingen klassificeret satellit at kontrastere mod — se den lange
       note ved bookingLaes om hvorfor kun fire objekter har en. */
    assert.ok(!Object.values(PERM).includes("kasser.laes"));
    assert.ok(!Object.values(PERM).includes("kasseudlaan.laes"));
  });
});
