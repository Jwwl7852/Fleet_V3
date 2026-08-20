/* test/unitbooking.test.mjs
 * Unitbooking — de fem ting prototypen gjorde forkert, og som ikke må komme med.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALLE_KASSE_STATUS, kraeverPlads,
  ALLE_UDLAAN_TILSTANDE, BINDENDE,
  pladsnavn, haller, valideReolplads, valideKasse, valideUdlaan,
  undertyperFor, harUndertyper, mmFraCm, cmFraMm,
  overlapper, konflikter, ledigeKasser, KASSE_ID_MOENSTER,
  SELVVALGT_KASSE_STATUS, AFSLUTTET, UDLAAN_SKIFT, kanSkifteUdlaan,
  virkningPaaKasse, reservationerFor, naesteReservation, halvaabent, iVindue,
  dageUde, historikForKasse, sagsoversigt,
} from "../src/fleet/unitbooking.js";
import {
  NODE_MODUL, MODUL, UDEN_SKAERM, modulerFor,
} from "../src/fleet/moduler.js";
import { PERM, ROLLE_PERMS } from "../src/fleet/permissions.js";

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
    const kilde = readFileSync(new URL("../src/fleet/unitbooking.js", import.meta.url), "utf8");
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
    assert.ok(MODUL.unitbooking, "unitbooking mangler i kataloget");
    assert.deepEqual(
      Object.keys(NODE_MODUL).filter((n) => modulerFor(n).includes("unitbooking")).sort(),
      ["kasser", "kassetyper", "kasseudlaan", "reolpladser"]);
    /* ⚠ REOLPLADSER ER DELT MED WAREHOUSE. Transportkasser og kundegods staar
       paa de samme hylder, og noden blev UDVIDET frem for kopieret. Proeven
       staar her, saa en fremtidig oprydning ikke "retter" den tilbage til eet
       modul og dermed lukker WMS ude af sit eget lager. */
    assert.deepEqual(modulerFor("reolpladser").sort(), ["unitbooking", "warehouse"]);
    assert.deepEqual(modulerFor("kasser"), ["unitbooking"]);
  });

  it("⚠ TEGNES NU — og UDEN_SKAERM er tom igen", () => {
    /* Navnet stod der mellem etape 1 og 3: modulet kunne saelges, men havde
       ingen skaerm, og et menupunkt der foerer til ingenting lover noget
       produktet ikke kan. Kasser og Reolpladser findes nu.

       ⚠ Proeven holder BEGGE veje: staar et modul i UDEN_SKAERM, maa det ikke
       have et menupunkt — og er listen tom, skal hvert modul have ét. Se
       moduler.test.mjs. */
    assert.ok(!UDEN_SKAERM.includes("unitbooking"));
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

describe("udlånets tilstandsmaskine", () => {
  it("har ingen genvej fra booket til udlaant", () => {
    /* ⚠ KLARGØRINGEN ER DET ENESTE STED et menneske har kassen i hånden og
       kan se om den er hel. Springes den over, går kassen ud af huset uden
       at nogen har set på den, og skaden opdages hos museet — hvor den ikke
       kan afgøres. Det koster ét klik at klargøre. */
    assert.equal(kanSkifteUdlaan("booket", "udlaant"), false);
    assert.equal(kanSkifteUdlaan("booket", "klargjort"), true);
    assert.equal(kanSkifteUdlaan("klargjort", "udlaant"), true);
  });

  it("lukker en returneret sag for altid", () => {
    /* Skal kassen ud igen, er det et NYT udlån med sin egen periode. En
       genåbnet post ville betyde at historikken kunne skrives om bagefter. */
    for (const til of ALLE_UDLAAN_TILSTANDE) {
      assert.equal(kanSkifteUdlaan("returneret", til), false,
        `returneret kunne skifte til ${til}`);
      assert.equal(kanSkifteUdlaan("annulleret", til), false,
        `annulleret kunne skifte til ${til}`);
    }
  });

  it("kender ikke en tilstand der ikke findes", () => {
    assert.equal(kanSkifteUdlaan("booket", "afsendt"), false);
    assert.equal(kanSkifteUdlaan("pjat", "booket"), false);
  });

  it("holder AFSLUTTET og BINDENDE adskilt og udtømmende", () => {
    assert.deepEqual([...BINDENDE, ...AFSLUTTET].sort(),
      [...ALLE_UDLAAN_TILSTANDE].sort());
    for (const t of AFSLUTTET) assert.ok(!BINDENDE.includes(t));
  });

  it("har en overgangstabel for hver tilstand der findes", () => {
    /* Ellers ville en ny tilstand give `undefined` og lydløst blive en
       blindgyde — eller værre, en tilstand ingen kan komme ud af. */
    for (const t of ALLE_UDLAAN_TILSTANDE) {
      assert.ok(Array.isArray(UDLAAN_SKIFT[t]), `${t} mangler i UDLAAN_SKIFT`);
      for (const til of UDLAAN_SKIFT[t]) {
        assert.ok(ALLE_UDLAAN_TILSTANDE.includes(til),
          `${t} kan skifte til ${til}, som ikke findes`);
      }
    }
  });
});

describe("hvad skiftet gør ved kassen", () => {
  const kasse = { hjemPladsId: "p-hjem", pladsId: "p-anden" };

  it("⚠ RØRER IKKE KASSEN ved en booking", () => {
    /* Det er hele grunden til at `booket` ikke er en kassestatus: kassen
       står stadig fysisk på sin hylde. */
    assert.equal(virkningPaaKasse({ fra: "booket", til: "annulleret", kasse }), null);
  });

  it("tager pladsen fra en udleveret kasse", () => {
    const v = virkningPaaKasse({ fra: "klargjort", til: "udlaant", kasse });
    assert.equal(v.status, "udlaant");
    /* ⚠ null, IKKE "hos kunde". Ellers er hylden optaget af en kasse der
       fysisk er i Paris, og ledige pladser kan ikke tælles. */
    assert.equal(v.pladsId, null);
  });

  it("sender en returneret kasse hjem — ikke tilbage hvor den stod", () => {
    const v = virkningPaaKasse({ fra: "udlaant", til: "returneret", kasse });
    assert.equal(v.status, "ledig");
    assert.equal(v.pladsId, "p-hjem");
  });

  it("ruller klargøringen tilbage, men kun hvis den fandt sted", () => {
    assert.equal(
      virkningPaaKasse({ fra: "klargjort", til: "booket", kasse }).status, "ledig");
    assert.equal(
      virkningPaaKasse({ fra: "klargjort", til: "annulleret", kasse }).status, "ledig");
    /* Var den kun booket, blev kassen aldrig rørt — så er der intet at rulle
       tilbage, og en skrivning ville overskrive fx udeAfDrift. */
    assert.equal(virkningPaaKasse({ fra: "booket", til: "annulleret", kasse }), null);
  });

  it("giver kun statusser kassen kender", () => {
    for (const fra of ALLE_UDLAAN_TILSTANDE) {
      for (const til of UDLAAN_SKIFT[fra] || []) {
        const v = virkningPaaKasse({ fra, til, kasse });
        if (!v) continue;
        assert.ok(ALLE_KASSE_STATUS.includes(v.status),
          `${fra}→${til} gav kassestatussen ${v.status}, som ikke findes`);
      }
    }
  });
});

describe("booket er ikke en kassestatus", () => {
  it("står ikke i KASSE_STATUS", () => {
    /* ⚠ EN RESERVATION ER ET UDLÅN. Stod den også på kassen, var samme
       kendsgerning gemt to steder — og de bliver uenige. Det er
       `bemanding.ledig` i ny forklædning. */
    assert.ok(!ALLE_KASSE_STATUS.includes("booket"));
    assert.ok(ALLE_UDLAAN_TILSTANDE.includes("booket"));
  });

  it("lader klienten sætte netop de to den selv kan observere", () => {
    assert.deepEqual(SELVVALGT_KASSE_STATUS, ["ledig", "udeAfDrift"]);
    for (const s of SELVVALGT_KASSE_STATUS) {
      assert.ok(ALLE_KASSE_STATUS.includes(s));
    }
    /* De to andre er FØLGER af et udlånsskifte og sættes kun af serveren. */
    for (const s of ["klargjort", "udlaant"]) {
      assert.ok(!SELVVALGT_KASSE_STATUS.includes(s));
    }
  });

  it("finder reservationen der skal vises på kassen", () => {
    const u = [
      { id: "a", kasseId: "K1", tilstand: "returneret", fra: 10, til: 20 },
      { id: "b", kasseId: "K1", tilstand: "booket", fra: 100, til: 120 },
      { id: "c", kasseId: "K1", tilstand: "booket", fra: 50, til: 60 },
      { id: "d", kasseId: "K2", tilstand: "booket", fra: 1, til: 5 },
    ];
    /* Tidligst først, og kun de bindende — en afsluttet periode er
       historik, ikke en reservation. */
    assert.deepEqual(reservationerFor(u, "K1").map((x) => x.id), ["c", "b"]);
    /* Står vi før begge, vises den næste. */
    assert.equal(naesteReservation(u, "K1", 30).id, "c");
    /* Er den første overstået, springes den over. */
    assert.equal(naesteReservation(u, "K1", 70).id, "b");
    /* Er alle overstået, er der intet at vise. */
    assert.equal(naesteReservation(u, "K1", 200), null);
    /* ⚠ EN IGANGVÆRENDE VINDER over en kommende. */
    assert.equal(naesteReservation(u, "K1", 55).id, "c");
  });
});

describe("serveren skriver ikke sin egen politik af", () => {
  const kilde = readFileSync("functions/index.js", "utf8");

  it("bruger den delte tilstandstabel og det delte konflikttjek", () => {
    /* ⚠ DET ER HELE GRUNDEN TIL delt/. Skrev serveren sin egen afskrift af
       overgangene, ville skærmen sige ja og serveren nej — og brugeren
       kunne ikke se hvorfor. Samme fejl som to divisionsfiltre. */
    for (const navn of ["valideUdlaan", "kanSkifteUdlaan", "virkningPaaKasse", "konflikter"]) {
      assert.ok(kilde.includes(`${navn}(`), `functions/index.js kalder ikke ${navn}`);
    }
    assert.ok(kilde.includes('from "./delt/unitbooking.js"'),
      "functions/index.js importerer ikke den delte unitbooking-fil");
  });

  it("lader ikke klienten vælge tilstanden på et nyt udlån", () => {
    /* Kunne den sendes med, kunne klargøringen springes over ved at oprette
       udlånet direkte som `udlaant`. */
    assert.ok(kilde.includes('tilstand: "booket"'),
      "et nyt udlån får ikke tvunget tilstanden booket");
    assert.ok(!kilde.includes("tilstand: kortStreng(d.tilstand"),
      "tilstanden læses fra nyttelasten");
  });

  it("prøver abonnement og modul, som reglerne gør", () => {
    /* ⚠ ADMIN-SDK'ET GÅR UDEN OM REGLERNE. Uden de to tjek ville funktionen
       være en åben dør rundt om både modulafkrydsningen og loginspærringen. */
    assert.ok(kilde.includes("Abonnementet er ikke aktivt."));
    assert.ok(kilde.includes("Unitbooking er ikke slået til."));
  });
});

describe("to konventioner, én oversættelse", () => {
  const D = (d) => Date.UTC(2026, 8, d);

  it("lægger en dag til, så den sidste dag kommer med", () => {
    /* ⚠ UDEN DEN MANGLER DEN SIDSTE DAG PÅ GITTERET. En kasse der er ude
       1.–15., er også ude den 15. — men et halvåbent [1., 15.) stopper ved
       midnat den 15. og tegner kassen som fri den dag den stadig er hos
       museet. Gitterkalenderens eget hoved advarer om præcis det. */
    const u = { fra: D(1), til: D(15) };
    assert.equal(halvaabent(u).fra, D(1));
    assert.equal(halvaabent(u).til, D(16));
  });

  it("giver en endagsperiode en bredde", () => {
    /* Ud og hjem samme dag er ét slot, ikke nul. Et halvåbent [d, d) er tomt,
       og blokken ville slet ikke blive tegnet. */
    const u = { fra: D(4), til: D(4) };
    const h = halvaabent(u);
    assert.ok(h.til > h.fra);
    assert.equal(h.til - h.fra, 86400000);
  });

  it("er enig med overlapper() om hvad der støder sammen", () => {
    /* ⚠ DEN VIGTIGSTE. To måder at regne på samme interval er præcis den
       slags der driver fra hinanden. Her prøves de mod hinanden på hver
       eneste kombination i en måned: er de uenige ét sted, viser gitteret
       noget andet end konflikttjekket afviser. */
    for (let aF = 1; aF <= 10; aF++) {
      for (let aT = aF; aT <= 10; aT++) {
        for (let bF = 1; bF <= 10; bF++) {
          for (let bT = bF; bT <= 10; bT++) {
            const a = halvaabent({ fra: D(aF), til: D(aT) });
            const b = halvaabent({ fra: D(bF), til: D(bT) });
            const halvaabentOverlap = a.fra < b.til && b.fra < a.til;
            const inklusivtOverlap = overlapper(D(aF), D(aT), D(bF), D(bT));
            assert.equal(halvaabentOverlap, inklusivtOverlap,
              `uenige om [${aF},${aT}] mod [${bF},${bT}]`);
          }
        }
      }
    }
  });

  it("tæller et udlån med i vinduet på dets sidste dag", () => {
    const u = { fra: D(1), til: D(5) };
    /* Vinduet er den 5. alene, halvåbent. */
    assert.equal(iVindue(u, D(5), D(6)), true);
    /* Den 6. er kassen hjemme igen. */
    assert.equal(iVindue(u, D(6), D(7)), false);
    /* Og et vindue der slutter FØR udlånet begynder, rører det ikke. */
    assert.equal(iVindue(u, D(1) - 86400000 * 3, D(1)), false);
  });
});

describe("historikken skelner mellem planen og kendsgerningen", () => {
  const D = (d) => Date.UTC(2026, 8, d);

  it("bruger stemplerne når de findes, og siger at den gør", () => {
    const u = {
      fra: D(1), til: D(20),
      udleveretMs: D(3) + 3600000 * 9, returneretMs: D(9) + 3600000 * 14,
    };
    const r = dageUde(u);
    assert.equal(r.faktisk, true);
    /* Seks dage, ikke de tyve der var aftalt. */
    assert.equal(r.dage, 6);
  });

  it("falder tilbage på planen — og siger at den gør", () => {
    /* ⚠ FLAGET ER VIGTIGERE END TALLET. Uden det læses et planlagt tal som
       en måling, og "MDT-101 har været ude 20 dage" ville være en påstand vi
       ikke kan stå inde for, hvis kassen kom hjem den 9. Samme forbehold som
       tjekKoerehviletid() bærer. */
    const r = dageUde({ fra: D(1), til: D(20) });
    assert.equal(r.faktisk, false);
    assert.equal(r.dage, 20);
  });

  it("regner inklusivt, som alt andet om et udlån", () => {
    /* Ud og hjem samme dag er ÉN dag, ikke nul. */
    assert.equal(dageUde({ fra: D(4), til: D(4) }).dage, 1);
    assert.equal(dageUde({ fra: D(4), til: D(5) }).dage, 2);
  });

  it("giver en kasse der var ude få timer, mindst én dag", () => {
    const u = { fra: D(1), til: D(1), udleveretMs: D(1) + 3600000 * 8,
                returneretMs: D(1) + 3600000 * 12 };
    assert.equal(dageUde(u).dage, 1);
    assert.equal(dageUde(u).faktisk, true);
  });

  it("halter ikke på et halvt stempel", () => {
    /* Er kassen udleveret men ikke kommet hjem, kender vi ikke varigheden —
       så er planen det bedste vi har, og flaget siger det. */
    const r = dageUde({ fra: D(1), til: D(10), udleveretMs: D(2) });
    assert.equal(r.faktisk, false);
    assert.equal(r.dage, 10);
  });
});

describe("sagen samler kasserne", () => {
  const D = (d) => Date.UTC(2026, 8, d);
  const u = [
    { id: "a", kasseId: "K2", sagsnummer: "4260", fra: D(5), til: D(20), tilstand: "booket" },
    { id: "b", kasseId: "K1", sagsnummer: "4260", fra: D(1), til: D(25),
      tilstand: "booket", beskrivelse: "Monet" },
    { id: "c", kasseId: "K3", sagsnummer: "4357", fra: D(2), til: D(3), tilstand: "returneret" },
    { id: "d", kasseId: "K1", sagsnummer: null, fra: D(1), til: D(2), tilstand: "booket" },
  ];

  it("grupperer på sagsnummer og samler kasserne", () => {
    const s = sagsoversigt(u);
    assert.equal(s.length, 2);
    const sag = s.find((x) => x.sagsnummer === "4260");
    assert.deepEqual(sag.kasser, ["K1", "K2"]);
    assert.equal(sag.udlaan.length, 2);
  });

  it("udleder sagens periode af yderpunkterne", () => {
    /* ⚠ IKKE GEMT. En sagsperiode der stod som et felt, ville holde op med at
       passe første gang et af udlånene blev rettet. */
    const sag = sagsoversigt(u).find((x) => x.sagsnummer === "4260");
    assert.equal(sag.fra, D(1));
    assert.equal(sag.til, D(25));
  });

  it("springer et udlån uden sagsnummer over", () => {
    /* Det kan ikke lade sig gøre gennem formularen — feltet er påkrævet — men
       et importeret udlån kunne mangle det, og en gruppe der hedder
       "undefined" er værre end ingen. */
    const alle = sagsoversigt(u).flatMap((s) => s.udlaan.map((x) => x.id));
    assert.ok(!alle.includes("d"));
  });

  it("tager den første beskrivelse der findes", () => {
    const sag = sagsoversigt(u).find((x) => x.sagsnummer === "4260");
    assert.equal(sag.beskrivelse, "Monet");
  });
});

describe("historikken pr. kasse", () => {
  const D = (d) => Date.UTC(2026, 8, d);
  const u = [
    { id: "a", kasseId: "K1", fra: D(1), til: D(2), tilstand: "returneret" },
    { id: "b", kasseId: "K1", fra: D(10), til: D(11), tilstand: "annulleret" },
    { id: "c", kasseId: "K2", fra: D(5), til: D(6), tilstand: "booket" },
  ];

  it("tager nyeste først", () => {
    assert.deepEqual(historikForKasse(u, "K1").map((x) => x.id), ["b", "a"]);
  });

  it("⚠ TAGER DEN ANNULLEREDE MED", () => {
    /* Nogen lovede kassen væk og trak det tilbage. Det er en oplysning, ikke
       støj — den udelades kun på kalenderen, hvor den ville få kassen til at
       se optaget ud i en periode hvor den er fri. */
    assert.ok(historikForKasse(u, "K1").some((x) => x.tilstand === "annulleret"));
  });
});

describe("serveren stempler det faktiske tidspunkt", () => {
  const kilde = readFileSync("functions/index.js", "utf8");

  it("sætter udleveretMs og returneretMs i selve skiftet", () => {
    /* ⚠ I SAMME opdatering-OBJEKT som tilstanden. To skrivninger kunne give
       et udlån der er returneret uden et returtidspunkt. */
    assert.ok(kilde.includes("udleveretMs`] = Date.now()"));
    assert.ok(kilde.includes("returneretMs`] = Date.now()"));
  });

  it("lader ikke klienten oplyse dem", () => {
    /* Et tidspunkt en browser må sende, kan sættes til hvad som helst — og
       et ur der går forkert er ikke engang ond vilje. */
    assert.ok(!kilde.includes("d.udleveretMs"));
    assert.ok(!kilde.includes("d.returneretMs"));
  });
});

describe("undertypen", () => {
  /* ⚠ UNDERTYPEN LIGGER UNDER SIN TYPE. En egen node med et typeId kunne
     drive: en undertype ville kunne pege på en type der var slettet, og to
     typer kunne dele en undertype med samme navn. Nestet er koblingen
     strukturel. Planchen (UNITBOOKING.md 6.1) har den i formularen på alle
     tre skærme og i filtrene på to. */
  const KATALOG = [
    { id: "AL", navn: "Alukasse", undertyper: { std: { navn: "Standard" }, xl: { navn: "XL" } } },
    { id: "TR", navn: "Trækasse" },
  ];
  const ctx = {
    typer: ["AL", "TR"],
    pladser: ["p1"],
    katalog: KATALOG,
  };
  const kasse = { id: "MDT-101", type: "AL", status: "ledig", hjemPladsId: "p1", pladsId: "p1" };

  it("undertyperne sorteres på navn, ikke på nøgle", () => {
    assert.deepEqual(undertyperFor(KATALOG[0]).map((u) => u.id), ["std", "xl"]);
    assert.deepEqual(undertyperFor(KATALOG[0]).map((u) => u.navn), ["Standard", "XL"]);
  });

  it("⚠ \"HAR UNDERTYPE\" ER UDLEDT, IKKE ET FELT", () => {
    /* Planchens ja/nej. Et flag ved siden af listen ville være den samme
       kendsgerning to steder, og de to ville blive uenige første gang nogen
       slettede den sidste undertype. */
    assert.equal(harUndertyper(KATALOG[0]), true);
    assert.equal(harUndertyper(KATALOG[1]), false);
    assert.equal(harUndertyper(undefined), false);
    assert.deepEqual(undertyperFor(undefined), []);
  });

  it("en kasse uden undertype er gyldig — feltet er ikke påkrævet", () => {
    /* En type kan have nul undertyper, og så har kassen ingen. Et påkrævet
       felt ville tvinge en opfundet undertype frem på hver eneste kasse. */
    assert.deepEqual(valideKasse(kasse, ctx), {});
    assert.deepEqual(valideKasse({ ...kasse, type: "TR" }, ctx), {});
  });

  it("en undertype fra kassens egen type går igennem", () => {
    assert.deepEqual(valideKasse({ ...kasse, undertype: "std" }, ctx), {});
    assert.deepEqual(valideKasse({ ...kasse, undertype: "xl" }, ctx), {});
  });

  it("⚠ EN ANDEN TYPES UNDERTYPE AFVISES", () => {
    /* Uden det led kunne en trækasse bære alukassens \"XL\", og filtret
       \"Trækasse + XL\" ville vise en kasse der hverken var det ene eller det
       andet. */
    assert.ok(valideKasse({ ...kasse, type: "TR", undertype: "xl" }, ctx).undertype);
    assert.ok(valideKasse({ ...kasse, undertype: "findes-ikke" }, ctx).undertype);
  });

  it("en type uden undertyper siger dét — ikke bare \"ukendt\"", () => {
    const f = valideKasse({ ...kasse, type: "TR", undertype: "std" }, ctx);
    assert.match(f.undertype, /ingen undertyper/);
  });

  it("uden katalog validerer den ikke undertypen — den gætter ikke", () => {
    /* Samme mønster som `typer: []`: er listen ikke hentet endnu, afvises
       intet. Serveren afgør alligevel. */
    assert.deepEqual(
      valideKasse({ ...kasse, undertype: "hvadsomhelst" }, { typer: [], pladser: ["p1"] }),
      {},
    );
  });
});

describe("målene og volumen", () => {
  /* ⚠ PLANCHEN HAR m² OG m³ SOM TO INDTASTEDE FELTER. To tal skrevet af et
     menneske om den samme fysiske kasse kan blive uenige, og så har
     "hvor stor er kassen" to svar. Målene kan de ikke: 120 × 80 × 95 cm ER
     0,96 m² og 0,91 m³. Se maalFraMm() i volumen.js. */
  const ctx = { typer: ["AL"], pladser: ["p1"] };
  const kasse = { id: "MDT-101", type: "AL", status: "ledig", hjemPladsId: "p1", pladsId: "p1" };

  it("centimeter tastes, millimeter gemmes", () => {
    /* Ét sted. To omregninger ville være to steder at tabe en faktor ti. */
    assert.equal(mmFraCm("120"), 1200);
    assert.equal(mmFraCm("95,5"), 955);
    assert.equal(mmFraCm("95.5"), 955);
    assert.equal(mmFraCm(""), null);
    assert.equal(mmFraCm("bred"), null);
    assert.equal(cmFraMm(1200), "120");
    assert.equal(cmFraMm(955), "95,5");
    assert.equal(cmFraMm(null), "");
  });

  it("en kasse uden mål er gyldig — de er ikke påkrævede", () => {
    assert.deepEqual(valideKasse(kasse, ctx), {});
  });

  it("⚠ ALLE TRE ELLER INGEN", () => {
    /* Et enkelt mål alene kan hverken give m² eller m³, men et felt der står
       udfyldt uden at tælle med, ser ud som en oplysning man har. */
    const f = valideKasse({ ...kasse, laengdeCm: "120" }, ctx);
    assert.ok(f.breddeCm);
    assert.ok(f.hoejdeCm);
    assert.equal(f.laengdeCm, undefined);
    assert.deepEqual(
      valideKasse({ ...kasse, laengdeCm: "120", breddeCm: "80", hoejdeCm: "95" }, ctx),
      {},
    );
  });

  it("et mål skal være et positivt tal med højst én decimal", () => {
    const m = { laengdeCm: "120", breddeCm: "80" };
    assert.ok(valideKasse({ ...kasse, ...m, hoejdeCm: "nul" }, ctx).hoejdeCm);
    assert.ok(valideKasse({ ...kasse, ...m, hoejdeCm: "0" }, ctx).hoejdeCm);
    assert.ok(valideKasse({ ...kasse, ...m, hoejdeCm: "-5" }, ctx).hoejdeCm);
    /* En kasse måles ikke skarpere end en millimeter. */
    assert.ok(valideKasse({ ...kasse, ...m, hoejdeCm: "95,55" }, ctx).hoejdeCm);
    assert.deepEqual(valideKasse({ ...kasse, ...m, hoejdeCm: "95,5" }, ctx), {});
  });
});
