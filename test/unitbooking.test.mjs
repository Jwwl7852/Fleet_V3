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
  naesteSkift, NAESTE_SKIFT,
  overlapper, konflikter, ledigeKasser, KASSE_ID_MOENSTER,
  SELVVALGT_KASSE_STATUS, AFSLUTTET, UDLAAN_SKIFT, kanSkifteUdlaan,
  virkningPaaKasse, reservationerFor, naesteReservation, halvaabent, iVindue,
  dageUde, historikForKasse, sagsoversigt,
  kassebelaegning, I_BRUG_STATUS, klargoeresSnart, KLARGOER_VINDUE_TIMER,
  sagsblokke, sagstilstand, SAGSTILSTAND_RANG, SKIFTELABEL,
} from "../src/fleet/unitbooking.js";
import {
  NODE_MODUL, MODUL, UDEN_SKAERM, modulerFor,
} from "../src/fleet/moduler.js";
import { PERM, ROLLE_PERMS } from "../src/fleet/permissions.js";
/* ⚠ DEMO-SÆTTET PRØVES HER, ikke kun af sin egen selvkontrol. Kontrollen i
   `demo-unitbooking.js` kører bag `import.meta.env?.DEV` og altså ALDRIG i
   node — den advarer i browserens konsol, hvor ingen ser efter. */
import { DEMO_KASSER, DEMO_KASSEUDLAAN } from "../src/fleet/demo-unitbooking.js";

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

describe("næste handling", () => {
  /* ⚠ PLANCHEN: "Du ved altid, hvad der skal gøres nu." Der er ét rigtigt
     næste skridt pr. tilstand; resten er undtagelser. */
  it("er ét skridt fremad pr. tilstand", () => {
    assert.equal(naesteSkift("booket"), "klargjort");
    assert.equal(naesteSkift("klargjort"), "udlaant");
    assert.equal(naesteSkift("udlaant"), "returneret");
  });

  it("en afsluttet tilstand har ingen", () => {
    assert.equal(naesteSkift("returneret"), null);
    assert.equal(naesteSkift("annulleret"), null);
    assert.equal(naesteSkift("findes-ikke"), null);
    assert.equal(naesteSkift(undefined), null);
  });

  it("⚠ ET SKRIDT FREMAD ER ALTID ET LOVLIGT SKIFT", () => {
    /* Bindingen mellem de to tabeller. Uden den kunne NAESTE_SKIFT komme til
       at pege på et skift serveren afviser — og knappen ville stå som den
       primære handling og fejle hver gang. */
    for (const [fra, til] of Object.entries(NAESTE_SKIFT)) {
      assert.ok(UDLAAN_SKIFT[fra]?.includes(til), `${fra} → ${til}`);
      assert.equal(kanSkifteUdlaan(fra, til), true, `${fra} → ${til}`);
    }
  });

  it("⚠ HVER TILSTAND MED ET LOVLIGT SKIFT HAR ET NÆSTE SKRIDT", () => {
    /* Den anden vej: kommer der en tilstand til i UDLAAN_SKIFT uden et skridt
       fremad, står rækken uden primær knap — og så er "annullér" det eneste
       man kan trykke på. */
    for (const [fra, muligheder] of Object.entries(UDLAAN_SKIFT)) {
      const fremad = muligheder.filter((t) => t !== "annulleret" && t !== "booket");
      if (fremad.length) assert.ok(naesteSkift(fra), `${fra} mangler et næste skridt`);
    }
  });

  it("⚠ INGEN GENVEJ FRA RESERVERET TIL UDLÅNT", () => {
    /* Klargøringen er det ene sted hvor et menneske har kassen i hånden.
       Springes den over, opdages en skade først hos museet. */
    assert.notEqual(naesteSkift("booket"), "udlaant");
    assert.equal(kanSkifteUdlaan("booket", "udlaant"), false);
  });
});

describe("ledige kasser og undertypen", () => {
  const kasser = {
    "MDT-101": { type: "AL", undertype: "std", status: "ledig" },
    "MDT-201": { type: "AL", undertype: "xl", status: "ledig" },
    "MDT-105": { type: "TR", status: "ledig" },
    "MDT-108": { type: "AL", undertype: "std", status: "udeAfDrift" },
  };
  const vindue = { fra: 1786000000000, til: 1787000000000 };

  it("uden filter er alt der ikke er ude af drift, ledigt", () => {
    const r = ledigeKasser(kasser, [], vindue).map((k) => k.id);
    assert.deepEqual(r.sort(), ["MDT-101", "MDT-105", "MDT-201"]);
  });

  it("filtrerer på type", () => {
    const r = ledigeKasser(kasser, [], { ...vindue, type: "AL" }).map((k) => k.id);
    assert.deepEqual(r.sort(), ["MDT-101", "MDT-201"]);
  });

  it("filtrerer på type OG undertype", () => {
    const r = ledigeKasser(kasser, [], { ...vindue, type: "AL", undertype: "xl" });
    assert.deepEqual(r.map((k) => k.id), ["MDT-201"]);
  });

  it("⚠ UNDERTYPE UDEN TYPE FILTRERER ALT VÆK", () => {
    /* To typer kan have hver sin undertype med samme nøgle — "std" findes både
       på Alukasse og Klimakasse. Et filter på undertypen alene ville blande
       dem, så det er ikke tilladt: skærmen tegner heller ikke feltet, før en
       type er valgt. */
    const r = ledigeKasser(kasser, [], { ...vindue, undertype: "std" });
    assert.deepEqual(r, []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   BELÆGNINGSGRADEN — planchens fjerde nøgletal

   ⚠ DEN VAR IKKE BYGGET, OG BEGRUNDELSEN FOR AT LADE VÆRE VAR FORKERT.
   UNITBOOKING.md skrev at "en procent af kasserne i brug står allerede på
   Kasselisten". Den stod ingen steder. Det nærmeste var `belaegningPaaPlads()`
   i reolplads.js — som svarer på om en HYLDE er optaget. Se 6.10.
   ══════════════════════════════════════════════════════════════════════════ */

describe("kassebelaegning", () => {
  const k = (status, antal = 1) =>
    Array.from({ length: antal }, (_, i) => ({ id: `${status}-${i}`, status }));

  it("tæller klargjorte OG udlånte som i brug", () => {
    /* ⚠ En klargjort kasse staar stadig paa sin hylde, men den er pakket til
       en bestemt sag og kan ikke loves vaek til nogen anden. Talte vi kun de
       fysisk udleverede, ville lageret se ledigt ud om fredagen, hvor hver
       eneste kasse var pakket til mandag. */
    const b = kassebelaegning([...k("ledig", 5), ...k("klargjort", 2), ...k("udlaant", 3)]);
    assert.equal(b.iBrug, 5);
    assert.equal(b.kanBruges, 10);
    assert.equal(b.pct, 50);
  });

  it("⚠ NÆVNEREN ER DE BRUGBARE, IKKE ALLE", () => {
    /* En kasse der er ude af drift, er hverken i brug eller til raadighed.
       Talte vi den med i naevneren, ville et lager hvor halvdelen er i
       stykker, vise 50 % og ligne noget der stod halvt stille — mens hver
       eneste brugbare kasse var ude hos en kunde. */
    const b = kassebelaegning([...k("udlaant", 5), ...k("udeAfDrift", 5)]);
    assert.equal(b.pct, 100);
    assert.equal(b.kanBruges, 5);
    assert.equal(b.ialt, 10);
  });

  it("⚠ OG DERFOR KOMMER udeAfDrift MED TILBAGE", () => {
    /* Naar naevneren krymper, STIGER procenten hver gang en kasse gaar i
       stykker. Et tal der ser bedre ud af at noget gaar i stykker, er farligt
       alene — antallet skal staa ved siden af. Samme greb som dageUde():
       flaget hoerer til tallet. */
    const b = kassebelaegning([...k("udlaant", 5), ...k("udeAfDrift", 5)]);
    assert.equal(b.udeAfDrift, 5);
    assert.notEqual(b.ialt, b.kanBruges);
  });

  it("⚠ UDEN BRUGBARE KASSER ER SVARET null — IKKE 0", () => {
    /* Nul brugbare kasser betyder at spoergsmaalet ikke kan besvares. 0 %
       ville sige at lageret stod helt stille, og det er et andet udsagn.
       pct() skriver — for null. Samme gate som num(). */
    assert.equal(kassebelaegning(k("udeAfDrift", 3)).pct, null);
    assert.equal(kassebelaegning([]).pct, null);
  });

  it("⚠ INTET MINDSTE_GRUNDLAG — det er en optælling, ikke et estimat", () => {
    /* beregnNoegletal() i leverandoerer.js naegter under en graense, fordi den
       estimerer en RATE ud fra faa leveringer: to og to hundrede ser ens ud i
       en tabel. Det her er maalt paa HELE populationen — er én af to kasser
       ude, ER belaegningen 50 %. */
    assert.equal(kassebelaegning([...k("ledig"), ...k("udlaant")]).pct, 50);
  });

  it("et tomt lager og et fuldt lager kan skelnes", () => {
    assert.equal(kassebelaegning(k("ledig", 4)).pct, 0);
    assert.equal(kassebelaegning(k("udlaant", 4)).pct, 100);
  });

  it("hver status i I_BRUG_STATUS er en status kataloget kender", () => {
    /* En tastefejl her ville lydloest udelade en tilstand fra taelleren, og
       tallet ville vaere for lavt uden at nogen kunne se hvorfor. */
    for (const s of I_BRUG_STATUS) {
      assert.ok(ALLE_KASSE_STATUS.includes(s), `"${s}" er ingen kendt kassestatus`);
    }
  });

  it("⚠ booket ER IKKE EN KASSESTATUS", () => {
    /* Det er UDLAANETS tilstand. En booket kasse staar som `ledig` indtil
       nogen klargoer den — se SELVVALGT_KASSE_STATUS. Tallet er et
       oejebliksbillede af LAGERET, ikke af kalenderen. */
    assert.equal(ALLE_KASSE_STATUS.includes("booket"), false);
    assert.equal(I_BRUG_STATUS.includes("booket"), false);
  });

  it("den tåler poster uden status", () => {
    /* Et hul i data maa ikke faa taelleren til at kaste. En post uden status
       er hverken i brug eller ude af drift — den taeller kun i naevneren, og
       det er det aerlige svar: kassen findes. */
    const b = kassebelaegning([...k("udlaant", 1), { id: "x" }, null]);
    assert.equal(b.iBrug, 1);
    assert.equal(b.ialt, 3);
  });

  it("⚠ DEN HEDDER IKKE belaegning() — reolplads.js har allerede det ord", () => {
    /* belaegningPaaPlads() svarer om en HYLDE er optaget. De to blev allerede
       forvekslet én gang: UNITBOOKING.md begrundede at planchens nøgletal ikke
       blev bygget med at det "allerede stod på Kasselisten". Se 6.10. */
    const kilde = readFileSync(new URL("../src/fleet/unitbooking.js", import.meta.url), "utf8");
    assert.ok(!/export (function|const) belaegning\b/.test(kilde),
      "unitbooking.js eksporterer et navn der kan forveksles med hyldebelægningen");
  });

  it("⚠ OG DEN LIGGER IKKE I kpi/", () => {
    /* Tallet er afledt af den kasseliste skaermen allerede henter, og et gemt
       afledt tal driver fra sit grundlag — fejlen i bemanding.ledig. Se
       undtagelsen i CLAUDE.md. */
    const kpi = readFileSync(new URL("../src/fleet/kpi-aggregering.js", import.meta.url), "utf8");
    assert.ok(!/kassebelaegning|belaegningsgradPct.*kasse/i.test(kpi),
      "belægningsgraden er lagt i kpi/ — den er afledt og hører hos forbrugeren");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ÉT TAL, TO SKÆRME
   ══════════════════════════════════════════════════════════════════════════ */

describe("belægningsgraden er den samme begge steder", () => {
  const laes = (fil) =>
    readFileSync(new URL(`../src/moduler/unitbooking/${fil}`, import.meta.url), "utf8");
  const SKAERME = ["Kasser.jsx", "Udlaan.jsx"];

  it("begge kalder kassebelaegning()", () => {
    /* Planchen har tallet paa BEGGE skaerme. To skaerme der begge sagde
       "belaegningsgrad" og regnede hver sit, ville vaere beslutning 6 brudt —
       og forskellen ville se ud som et datahul frem for to regnestykker. */
    for (const f of SKAERME) {
      assert.match(laes(f), /kassebelaegning\(kasser\)/,
        `${f} regner belægningsgraden selv`);
    }
  });

  it("⚠ OG INGEN AF DEM REGNER DEN SELV", () => {
    /* En procent regnet i en skaerm er en kopi der driver. Proeven leder efter
       en division med "kasser.length" eller "length * 100" i naerheden. */
    for (const f of SKAERME) {
      const kode = laes(f).replace(/\/\*[\s\S]*?\*\//g, "");
      assert.ok(!/\/\s*kasser\.length\s*\)?\s*\*\s*100/.test(kode),
        `${f} har sin egen procentudregning`);
    }
  });

  it("⚠ OG BEGGE SKRIVER `ude af drift` VED SIDEN AF TALLET", () => {
    /* Naevneren er de BRUGBARE kasser, saa procenten STIGER hver gang en kasse
       gaar i stykker. Et tal der ser bedre ud af at noget gaar i stykker, maa
       ikke staa alene. */
    for (const f of SKAERME) {
      assert.match(laes(f), /bel\.udeAfDrift/,
        `${f} viser procenten uden at sige hvor mange der er ude af drift`);
    }
  });

  it("⚠ OG TALLET FORMATERES MED pct(), ikke med en egen streng", () => {
    /* pct() skriver INTET (—) for null. En egen `${x} %` ville skrive
       "null %" den dag der ikke er en eneste brugbar kasse. */
    for (const f of SKAERME) {
      assert.match(laes(f), /pct\(bel\.pct\)/, `${f} formaterer procenten selv`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KLARGØRES SNART — planchens tredje nøgletal, og dens tredje dato
   ══════════════════════════════════════════════════════════════════════════ */

describe("klargoeresSnart", () => {
  const NU = Date.UTC(2026, 7, 24, 8, 0, 0);
  const T = 3600000;
  const u = (id, tilstand, klargoerSenest) => ({ id, tilstand, klargoerSenest });

  it("⚠ TÆLLER DEM DER SKAL KLARGØRES, ikke dem der ER klargjort", () => {
    /* De to er ikke det samme tal: det ene er arbejde der er gjort, det andet
       arbejde der venter. Et lager hvor alt er pakket og intet forestaar, og
       et hvor intet er pakket og ti kasser skal ud i morgen, saa ens paa det
       gamle kort. */
    const r = klargoeresSnart([
      u("a", "booket", NU + 10 * T),
      u("b", "klargjort", NU + 1 * T),
      u("c", "udlaant", NU + 1 * T),
    ], NU);
    assert.equal(r.antal, 1);
    assert.deepEqual(r.poster.map((x) => x.id), ["a"]);
  });

  it("⚠ EN TÆLLING DER VOKSER AF AT ARBEJDET BLIVER GJORT, ER UBRUGELIG", () => {
    /* Derfor kun `booket`. Klargoeres kassen, forsvinder den ud af tallet —
       det er hele pointen med det. */
    const foer = klargoeresSnart([u("a", "booket", NU + 2 * T)], NU);
    const efter = klargoeresSnart([u("a", "klargjort", NU + 2 * T)], NU);
    assert.equal(foer.antal, 1);
    assert.equal(efter.antal, 0);
  });

  it("⚠ DE OVERSKREDNE TÆLLER MED — og tælles også for sig", () => {
    /* Et udlaan der skulle have vaeret pakket i gaar, er ikke holdt op med at
       skulle pakkes. Faldt det ud af tallet fordi fristen var passeret, ville
       listen blive kortere netop som den blev mere presserende. */
    const r = klargoeresSnart([
      u("bagud", "booket", NU - 20 * T),
      u("snart", "booket", NU + 5 * T),
    ], NU);
    assert.equal(r.antal, 2);
    assert.equal(r.bagud, 1);
  });

  it("vinduet er 48 timer, og det kan sættes", () => {
    const liste = [u("a", "booket", NU + 40 * T), u("b", "booket", NU + 80 * T)];
    assert.equal(KLARGOER_VINDUE_TIMER, 48);
    assert.equal(klargoeresSnart(liste, NU).antal, 1);
    assert.equal(klargoeresSnart(liste, NU, 100).antal, 2);
  });

  it("⚠ udenDato ER IKKE NUL — DET ER ET UBESVARET SPØRGSMÅL", () => {
    /* Feltet er valgfrit, saa et udlaan uden det kan hverken taelles med eller
       fra: vi ved ikke hvornaar det skal pakkes. Tallet ville paastaa at vaere
       en fuld optaelling. Samme greb som udeAfDrift paa belaegningsgraden og
       `uden` i volumenIalt(). */
    const r = klargoeresSnart([
      u("a", "booket", NU + 1 * T),
      u("b", "booket", undefined),
      u("c", "booket", null),
    ], NU);
    assert.equal(r.antal, 1);
    assert.equal(r.udenDato, 2);
  });

  it("de mest presserende står først", () => {
    const r = klargoeresSnart([
      u("sen", "booket", NU + 20 * T),
      u("tidlig", "booket", NU + 2 * T),
    ], NU);
    assert.deepEqual(r.poster.map((x) => x.id), ["tidlig", "sen"]);
  });
});

describe("klargoerSenest på udlånet", () => {
  const FRA = Date.UTC(2026, 8, 1);
  const grund = { kasseId: "MDT-101", sagsnummer: "4260", fra: FRA, til: FRA + 5 * 86400000, tilstand: "booket" };

  it("⚠ KAN IKKE LIGGE EFTER AFHENTNINGEN", () => {
    /* Man pakker foer kassen koerer. Reglen siger det samme (`<= fra`), og det
       er dér det afgoeres; det her svarer hurtigt. */
    const f = valideUdlaan({ ...grund, klargoerSenest: FRA + 86400000 }, {});
    assert.match(f.klargoerSenest, /pakket før den hentes/);
  });

  it("samme dag er i orden", () => {
    assert.equal(valideUdlaan({ ...grund, klargoerSenest: FRA }, {}).klargoerSenest, undefined);
  });

  it("⚠ OG DEN ER VALGFRI — de udlån der allerede ligger i basen, har den ikke", () => {
    /* Et paakraevet felt ville goere hver eneste af dem ugyldig efter
       reglerne. Samme holdning som faktiskMin paa opgaver: hullet TAELLES
       frem for at spaerre. */
    assert.equal(Object.keys(valideUdlaan(grund, {})).length, 0);
    assert.equal(Object.keys(valideUdlaan({ ...grund, klargoerSenest: null }, {})).length, 0);
  });

  it("men den skal være et tal hvis den er der", () => {
    const f = valideUdlaan({ ...grund, klargoerSenest: "i morgen" }, {});
    assert.match(f.klargoerSenest, /Vælg en dato/);
  });

  it("⚠ OG REGLEN SIGER DET SAMME SOM FUNKTIONEN", () => {
    /* En klientvalidering der ikke ogsaa staar i firebase.rules.json, er en
       paen knap. Reglen bruger newData.parent() — postens tilstand EFTER
       skrivningen — saa den holder ogsaa ved en dyb skrivning af kun feltet. */
    const regler = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
    assert.match(regler, /"klargoerSenest":\s*\{\s*"\.validate":\s*"newData\.isNumber\(\) && newData\.val\(\) <= newData\.parent\(\)\.child\('fra'\)\.val\(\)"/);
  });

  it("⚠ OG DEN STÅR IKKE I hasChildren — den er valgfri i reglen også", () => {
    /* Stod den dér, ville hver eneste eksisterende post vaere ugyldig, og en
       rettelse af et sagsnummer ville blive afvist paa et felt ingen roerte. */
    const regler = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
    const blok = regler.slice(regler.indexOf('"kasseudlaan"'));
    const krav = blok.slice(blok.indexOf("hasChildren"), blok.indexOf("hasChildren") + 120);
    assert.ok(!krav.includes("klargoerSenest"), "klargoerSenest er gjort påkrævet");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KALENDEREN GRUPPERET EFTER SAG
   ══════════════════════════════════════════════════════════════════════════ */

describe("sagsblokke", () => {
  const D = (a, m, d) => Date.UTC(a, m - 1, d);
  const u = (id, sag, kasse, fra, til, tilstand = "booket") =>
    ({ id, sagsnummer: sag, kasseId: kasse, fra, til, tilstand });

  it("⚠ FIRE KASSER I SAMME PERIODE BLIVER ÉN BLOK, IKKE FIRE KONFLIKTER", () => {
    /* Gitteret tegner overlap i samme raekke som en KONFLIKT — med vilje,
       fordi to udlaan paa ÉN kasse er noget konflikter() ville afvise. Men et
       museum laaner et helt saet til én udstilling. Lagde vi de fire raat i
       sagens raekke, ville hver eneste udstilling staa som fire roede
       konfliktblokke oven i hinanden. */
    const b = sagsblokke([
      u("a", "4412", "MDT-101", D(2026, 8, 24), D(2026, 9, 25)),
      u("b", "4412", "MDT-102", D(2026, 8, 24), D(2026, 9, 25)),
      u("c", "4412", "MDT-103", D(2026, 8, 24), D(2026, 9, 25)),
      u("d", "4412", "MDT-105", D(2026, 8, 24), D(2026, 9, 25)),
    ]);
    assert.equal(b.length, 1);
    assert.equal(b[0].kasser.length, 4);
    assert.equal(b[0].fra, D(2026, 8, 24));
    assert.equal(b[0].til, D(2026, 9, 25));
  });

  it("blokken spænder fra den første afgang til den sidste retur", () => {
    const b = sagsblokke([
      u("a", "4412", "MDT-101", D(2026, 8, 10), D(2026, 9, 1)),
      u("b", "4412", "MDT-102", D(2026, 8, 24), D(2026, 9, 25)),
    ]);
    assert.equal(b.length, 1);
    assert.equal(b[0].fra, D(2026, 8, 10));
    assert.equal(b[0].til, D(2026, 9, 25));
  });

  it("⚠ MEN DE FLETTES KUN NÅR DE HÆNGER SAMMEN", () => {
    /* Gaar kasserne ud i boelger — én i august, én i november — er det TO
       blokke. Én blok fra august til november ville paastaa at sagen holdt
       kasser i tre maaneder, hvor lageret var frit imellem. */
    const b = sagsblokke([
      u("a", "4412", "MDT-101", D(2026, 8, 1), D(2026, 8, 10)),
      u("b", "4412", "MDT-102", D(2026, 11, 1), D(2026, 11, 10)),
    ]);
    assert.equal(b.length, 2);
  });

  it("⚠ ET HUL PÅ NUL DAGE ER IKKE ET HUL", () => {
    /* Slutter den ene den 10. og begynder den anden den 11., har sagen kasser
       ude uden afbrydelse. To blokke ville tegne en pause der ikke findes. */
    const b = sagsblokke([
      u("a", "4412", "MDT-101", D(2026, 8, 1), D(2026, 8, 10)),
      u("b", "4412", "MDT-102", D(2026, 8, 11), D(2026, 8, 20)),
    ]);
    assert.equal(b.length, 1);
    assert.equal(b[0].til, D(2026, 8, 20));
  });

  it("to sager blandes ikke sammen", () => {
    const b = sagsblokke([
      u("a", "4412", "MDT-101", D(2026, 8, 1), D(2026, 8, 20)),
      u("b", "4413", "MDT-102", D(2026, 8, 1), D(2026, 8, 20)),
    ]);
    assert.equal(b.length, 2);
    assert.deepEqual(b.map((x) => x.sagsnummer).sort(), ["4412", "4413"]);
  });

  it("poster uden sagsnummer eller uden periode springes over", () => {
    /* Sagsnummeret er den eneste noegle ud af systemet; uden det er der ingen
       raekke at haenge blokken paa. */
    assert.deepEqual(sagsblokke([
      { id: "x", kasseId: "MDT-101", fra: D(2026, 8, 1), til: D(2026, 8, 2) },
      u("y", "4412", "MDT-102", undefined, D(2026, 8, 2)),
      null,
    ]), []);
  });
});

describe("sagstilstand", () => {
  it("⚠ DEN MEST BINDENDE VINDER, IKKE DEN FØRSTE", () => {
    /* Er én kasse ude og tre booket, er sagen I GANG — og en blok der sagde
       "Booket", ville faa den til at ligne noget der endnu ikke var sket. */
    assert.equal(sagstilstand(["booket", "booket", "udlaant"]), "udlaant");
    assert.equal(sagstilstand(["booket", "klargjort"]), "klargjort");
    assert.equal(sagstilstand(["booket"]), "booket");
  });

  it("rangen er forløbets rækkefølge, og hver værdi findes", () => {
    for (const t of SAGSTILSTAND_RANG) {
      assert.ok(ALLE_UDLAAN_TILSTANDE.includes(t), `"${t}" er ingen kendt udlånstilstand`);
    }
    assert.ok(SAGSTILSTAND_RANG.indexOf("udlaant") < SAGSTILSTAND_RANG.indexOf("booket"));
  });

  it("en tom liste giver null frem for at gætte", () => {
    assert.equal(sagstilstand([]), null);
  });
});

describe("⚠ DEMO-SÆTTET SKAL KUNNE VISE FORSKELLEN", () => {
  it("mindst én sag har flere kasser i samme periode", () => {
    /* Uden den ville de to grupperinger tegne det samme, og hverken en
       udvikler eller en bruger kunne se om sagsvisningen virkede. Maalt foer
       den blev bygget: fire sager, én kasse hver — og det samme i den
       udrullede base. */
    const flere = sagsblokke(DEMO_KASSEUDLAAN.filter((x) => x.tilstand !== "annulleret"))
      .filter((b) => b.kasser.length > 1);
    assert.ok(flere.length >= 1,
      "ingen sag har flere kasser — sagsvisningen kan ikke skelnes fra kassevisningen");
    assert.ok(flere[0].kasser.length >= 3);
  });

  it("⚠ OG INGEN KASSE STÅR SOM UDLÅNT UDEN ET UDLÅN AT PEGE PÅ", () => {
    /* MDT-103 gjorde: `udlaant`, med et udlaan der var `returneret` i marts.
       Det er ordret den fejl KASSE_STATUS' hoved beskriver som grunden til at
       `udlaant` ikke kan vaelges i haanden — "ingen kunne se hvem der havde
       den". Selvkontrollen i demofilen gik kun udlaan → kasse. */
    for (const k of DEMO_KASSER) {
      if (!["klargjort", "udlaant"].includes(k.status)) continue;
      assert.ok(
        DEMO_KASSEUDLAAN.some((x) => x.kasseId === k.id && x.tilstand === k.status),
        `${k.id} står som ${k.status}, men intet udlån er det`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SVÆVEKORTET — Fleet og Unitbooking er to forretninger
   ══════════════════════════════════════════════════════════════════════════ */

describe("⚠ DE TO SVÆVEKORT ER IKKE DET SAMME", () => {
  const laes = (sti) => readFileSync(new URL(`../${sti}`, import.meta.url), "utf8");

  it("hver skærm har sit eget, og de viser hver sin entitets felter", () => {
    /* UNITBOOKING.md 6.3 sagde at de to skærme ikke maatte faa hver sit — en
       ANALOGI til gitteret. Analogien holder ikke: gitteret er en FORM,
       svaevekortet er INDHOLD. En `opgave` og et `kasseudlaan` har ingenting
       til faelles. */
    const fleet = laes("src/moduler/flaade/Vaerkstedskalender.jsx");
    const unit = laes("src/moduler/unitbooking/Kalender.jsx");
    assert.match(fleet, /function Svaevekort\(/);
    assert.match(unit, /function Svaevekort\(/);

    /* Fleets felter findes ikke paa et udlaan … */
    assert.match(fleet, /arbejdstype/);
    assert.match(fleet, /prioritetFor/);
    /* … og udlaanets findes ikke paa en opgave. */
    assert.match(unit, /sagsnummer/);
    assert.match(unit, /dageUde\(/);
  });

  it("⚠ MEN UDSEENDET ER FÆLLES — og det er det gennem CSS", () => {
    /* `.fc-svaev` staar i fleet.css med sin placering, sin skygge og sine to
       kolonner. Aendres hvordan et svaevekort SER ud, sker det ét sted. Der
       skal ingen delt komponent til for det. */
    const css = laes("src/fleet/fleet.css");
    assert.match(css, /\.fc-svaev\{/);
    for (const sti of ["src/moduler/flaade/Vaerkstedskalender.jsx",
                       "src/moduler/unitbooking/Kalender.jsx"]) {
      assert.match(laes(sti), /className="fc-svaev"/, `${sti} tegner sin egen ramme`);
      assert.match(laes(sti), /fc-svaev-r/, `${sti} tegner sine egne rækker`);
    }
  });

  it("⚠ OG UNITBOOKINGS VISER IKKE ET SVÆVEKORT PÅ EN SAGSBLOK", () => {
    /* En sagsblok er FLERE udlaan flettet sammen. Et kort der viste ét af dem,
       ville paastaa at vaere hele sagen. */
    const unit = laes("src/moduler/unitbooking/Kalender.jsx");
    assert.match(unit, /if \(efterSag\) return;/);
  });

  it("⚠ OG DEN VISER OM 'UDE' ER MÅLT ELLER PLANLAGT", () => {
    /* dageUde() giver {dage, faktisk}, og flaget er vigtigere end tallet:
       uden det laeses "20 dage" som en maaling, og er kassen kommet hjem i
       forvejen, er det forkert paa en maade ingen kan se. Beslutning 37. */
    const unit = laes("src/moduler/unitbooking/Kalender.jsx");
    assert.match(unit, /ude\.faktisk \? "Ude \(målt\)" : "Ude \(planlagt\)"/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KOMMENDE KLARGØRINGER — panelet med den knap der var hele pointen
   ══════════════════════════════════════════════════════════════════════════ */

describe("klargøringspanelet på kalenderen", () => {
  const laes = (sti) => readFileSync(new URL(`../${sti}`, import.meta.url), "utf8");
  const kal = () => laes("src/moduler/unitbooking/Kalender.jsx");

  it("⚠ SAMME HANDLING SOM UDLÅN-SKÆRMEN — ikke en kopi", () => {
    /* §6.8: "at laane den hertil kraever at de to skaerme deler den samme
       handling — ikke to kopier". `kasseudlaan` er .write: false, saa der ER
       kun én vej ind. Panelet maa ikke bygge sin egen. */
    assert.match(kal(), /skiftUdlaan\(\{ udlaanId: u\.id, til \}\)/);
    assert.ok(!/db\.ref\(/.test(kal()), "kalenderen skriver uden om serveren");
  });

  it("⚠ SKRIDTET SLÅS OP, DET SKRIVES IKKE", () => {
    /* naesteSkift() er den SAMME tabel serveren haandhaever. Skrev panelet
       "klargjort" direkte, ville det vaere en knap der kunne blive ulovlig
       uden at nogen rettede den. */
    assert.match(kal(), /naesteSkift\(u\.tilstand\)/);
    assert.equal(naesteSkift("booket"), "klargjort");
    assert.ok(kanSkifteUdlaan("booket", naesteSkift("booket")),
      "næste skridt fra booket er ikke et lovligt skift");
  });

  it("⚠ ORDENE PÅ KNAPPEN LIGGER ÉT STED", () => {
    /* SKIFTELABEL laa i Udlaan.jsx. To skaerme med hver sin etiket for det
       samme skift er to forklaringer paa én ting. */
    for (const sti of ["src/moduler/unitbooking/Udlaan.jsx",
                       "src/moduler/unitbooking/Kalender.jsx"]) {
      assert.match(laes(sti), /SKIFTELABEL/, `${sti} bruger ikke kataloget`);
      assert.ok(!/const SKIFTELABEL = \{/.test(laes(sti)),
        `${sti} har sin egen kopi af etiketterne`);
    }
    assert.equal(SKIFTELABEL.klargjort, "Klargør");
  });

  it("⚠ LISTEN ER DEN SAMME SOM NØGLETALLET", () => {
    /* To lister for ét spoergsmaal ville kunne blive uenige, og forskellen
       ville se ud som et datahul frem for to filtre. */
    assert.match(kal(), /klargoeresSnart\(udlaan, nu\)/);
  });

  it("⚠ DEN KAN MINIMERES, MEN DEN FORSVINDER IKKE", () => {
    /* En lukket tilstand hvor panelet var VAEK, ville skjule de kasser der
       haster — netop for den der ryddede op i sin skaerm. Sammenklappet staar
       tallet stadig, og siger hvor mange der er bagud. */
    const s = kal();
    assert.match(s, /\{aaben \? "Skjul" : "Vis"\}/);
    assert.match(s, /klargoer\.bagud/);
  });

  it("⚠ OG DE UDEN FRIST STÅR PÅ SKÆRMEN", () => {
    /* klargoerSenest er valgfri (6.12). Uden linjen ville listen paastaa at
       vaere fuldstaendig. */
    assert.match(kal(), /klargoer\.udenDato/);
  });

  it("knappen kræver kasseudlaan.skriv", () => {
    assert.match(kal(), /harPerm\(bruger\?\.perms, PERM\.kasseudlaanSkriv\)/);
    assert.match(kal(), /disabled=\{!maaSkrive/);
  });
});

describe("næsten fuldskærm på kalenderen", () => {
  const kal = () => readFileSync(
    new URL("../src/moduler/unitbooking/Kalender.jsx", import.meta.url), "utf8");
  const css = () => readFileSync(
    new URL("../src/fleet/fleet.css", import.meta.url), "utf8");

  it("⚠ ESCAPE LUKKER DEN", () => {
    /* En visning der daekker skaermen og kun kan forlades med en
       museklik-knap, er en faelde — og den der er endt i den, leder efter
       browserens tilbageknap, som foerer helt vaek fra siden. */
    assert.match(kal(), /e\.key === "Escape"/);
    assert.match(kal(), /removeEventListener\("keydown"/);
  });

  it("⚠ DEN LIGGER UNDER DIALOGEN", () => {
    /* En dialog aabnet fra en fuldskaermsvisning skal stadig kunne ses.
       .fc-dialog-baggrund er 80; .fc-fuld skal vaere lavere. */
    const s = css();
    const fuld = Number(s.match(/\.fc-fuld\{[^}]*z-index:(\d+)/)[1]);
    const dialog = Number(s.match(/\.fc-dialog-baggrund\{[^}]*z-index:(\d+)/)[1]);
    assert.ok(fuld < dialog, `fuldskærm (${fuld}) ligger over dialogen (${dialog})`);
  });

  it("⚠ OG DEN ER \"NÆSTEN\" — der er en kant hele vejen rundt", () => {
    /* Et element der daekker hver eneste pixel, ser ud som en NY SIDE, og saa
       leder man efter browserens tilbageknap. Kanten siger at man staar OVEN
       PAA noget. `inset:0` ville vaere hele skaermen. */
    const regel = css().match(/\.fc-fuld\{[^}]*\}/)[0];
    assert.match(regel, /inset:\d+px/);
    assert.ok(!/inset:0/.test(regel), "fuldskærmen dækker hver eneste pixel");
  });

  it("knappen siger hvad der sker, og hvordan man kommer ud", () => {
    assert.match(kal(), /Escape lukker igen/);
  });
});
