/* test/stop.test.mjs
 * Etapens stop — og de to felter der svarede på det samme spørgsmål.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Turplanen er den sidste af de fire skærme i ejerens specifikation, og den
 * viser STOP: nummereret, med tidsvindue, adresse, telefon og det gods der
 * skal af og på. Den model fandtes ikke.
 *
 * ⚠ MEN NOGET LIGNENDE GJORDE. Målt i den udrullede base — otte etaper:
 *
 *   `fraSted` / `tilSted`       8 af 8. Et NAVN. Læst af TI filer.
 *                               **Står ikke i regelfilens feltliste.**
 *   `fraAdresse` / `tilAdresse` 2 af 8. STRUKTURERET og valideret.
 *                               Læst af ÉN fil. **Skrevet af ingenting.**
 *
 * Den designede adresse var aldrig taget i brug, mens et fritekstfelt
 * reglerne ikke kender, bar hele driften. Det kunne ligge sådan, fordi
 * `etaper` er `.write: false`: kun Cloud Functions skriver, og Admin-SDK'et
 * går uden om `.validate`.
 *
 * Se beslutning 110.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";

import {
  ALLE_STOP_ARTER, STOP_FELTER, ORDRE_FELTER,
  stopListe, ordreListe, adresselinje, summerOrdrer, erNaaet, stopstatus,
  valideStop, stopFraStraekning,
} from "../src/fleet/stop.js";
import { planlagteStop } from "../src/fleet/rutestatus.js";
import { bookingOpdatering } from "../src/fleet/booking-state.js";
import { DEMO_ETAPER } from "../src/fleet/demo-etaper.js";
import { DEMO_KUNDER } from "../src/fleet/demo-kunder.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules.tenants.$tenantId;

const ETAPE = REGLER.etaper.$etapeId;
const STOP = ETAPE.stop.$nr;

const stop = (o = {}) => ({ art: "afhentning", navn: "Lager A", ...o });

describe("Den tredje form er forbudt", () => {
  /**
   * ⚠ FORBUDT, IKKE FJERNET — som `division` i beslutning 70. En manglende
   * regel ville TILLADE feltet, og så kunne den vende tilbage som data uden
   * at nogen havde besluttet det.
   */
  it("⚠ fraAdresse OG tilAdresse ER .validate: false", () => {
    assert.equal(ETAPE.fraAdresse[".validate"], false);
    assert.equal(ETAPE.tilAdresse[".validate"], false);
  });

  it("⚠ OG INGEN DEMO-ETAPE BÆRER DEM LÆNGERE", () => {
    for (const e of DEMO_ETAPER) {
      assert.ok(!e.fraAdresse, `${e.id} har fraAdresse`);
      assert.ok(!e.tilAdresse, `${e.id} har tilAdresse`);
    }
  });

  /**
   * ⚠ `fraSted` BLIVER. Stedet er et NAVN til prissætning og ruteopslag;
   * stoppet er en adresse man kan køre til. De svarer på hvert sit spørgsmål,
   * og ti filer læser det første.
   */
  it("⚠ MEN fraSted BLIVER — det er ikke det samme felt", () => {
    for (const e of DEMO_ETAPER) {
      assert.ok(e.fraSted, `${e.id} har mistet fraSted`);
      assert.ok(e.tilSted, `${e.id} har mistet tilSted`);
    }
  });
});

describe("Formen", () => {
  it("felterne i reglen er dem modellen kender", () => {
    const iRegel = Object.keys(STOP).filter((k) => !k.startsWith(".") && k !== "$andet");
    assert.deepEqual(iRegel.sort(), [...STOP_FELTER].sort());
    assert.equal(STOP.$andet[".validate"], false);
  });

  it("og ordrelinjens felter er det også", () => {
    const iRegel = Object.keys(STOP.ordrer.$ordreId)
      .filter((k) => !k.startsWith(".") && k !== "$andet");
    assert.deepEqual(iRegel.sort(), [...ORDRE_FELTER].sort());
    assert.equal(STOP.ordrer.$ordreId.$andet[".validate"], false);
  });

  it("⚠ TO ARTER, OG REGLEN KENDER DE SAMME", () => {
    /* En grænseovergang er ikke et stop man laver noget ved — den udledes
       stadig af `graenseovergange`. */
    assert.deepEqual(ALLE_STOP_ARTER, ["afhentning", "levering"]);
    for (const a of ALLE_STOP_ARTER) {
      assert.ok(STOP.art[".validate"].includes(a), `reglen kender ikke ${a}`);
    }
  });

  /**
   * ⚠ NØGLET, IKKE EN ARRAY. `forslag` kostede tre lukkede overgange i
   * produktion netop fordi demo brugte arrays mens noden var nøglet
   * (beslutning 76). Rækkefølgen kommer af nøglen som TAL.
   *
   * ⚠ OG PRØVEN BRUGTE FØRST `{3, 1, 2}`, HVILKET IKKE BEVISTE NOGET.
   * JavaScript ordner selv heltalslignende nøgler stigende, så listen kom
   * rigtigt ud UANSET om der blev sorteret. Målt ved at fjerne `.sort()`:
   * prøven blev grøn.
   *
   * `"02"` er derimod IKKE en heltalsindeks for JS — den ordnes efter
   * indsættelse — mens `Number("02")` er 2. Det er dét tilfælde sorteringen
   * findes for, og det er dét prøven skal ramme. En prøve der ikke kan
   * fejle, siger ingenting.
   */
  it("⚠ RÆKKEFØLGEN KOMMER AF NØGLEN, IKKE AF OBJEKTETS ORDEN", () => {
    const e = { stop: { 3: stop({ navn: "C" }), "02": stop({ navn: "B" }), 1: stop({ navn: "A" }) } };
    assert.deepEqual(stopListe(e).map((s) => s.navn), ["A", "B", "C"]);
  });

  it("en etape uden stop giver en tom liste, ikke et brag", () => {
    assert.deepEqual(stopListe(null), []);
    assert.deepEqual(stopListe({}), []);
    assert.deepEqual(stopListe({ stop: [] }), []);
  });

  it("et stop med en ukendt art tælles ikke med", () => {
    const e = { stop: { 1: stop(), 2: { art: "graense", navn: "Rødby" } } };
    assert.equal(stopListe(e).length, 1);
  });
});

describe("Adressen", () => {
  /**
   * ⚠ TOMME LED UDELADES, OG DER SÆTTES IKKE KOMMA FOR DEM. En adresse der
   * skriver ", 8000 " fordi gaden mangler, ser ud som en fejl i dataene.
   */
  it("⚠ SÆTTER IKKE KOMMA FOR ET LED DER MANGLER", () => {
    assert.equal(adresselinje({ gade: "Transportvej 1", postnr: "8000", by: "Aarhus C" }),
      "Transportvej 1, 8000 Aarhus C");
    assert.equal(adresselinje({ postnr: "8000", by: "Aarhus C" }), "8000 Aarhus C");
    assert.equal(adresselinje({ gade: "Transportvej 1" }), "Transportvej 1");
    assert.equal(adresselinje({}), "");
    assert.equal(adresselinje(null), "");
  });
});

describe("Summen er håndteringer, ikke paller", () => {
  /**
   * ⚠ DE SAMME TOLV PALLER OP OG AF ER TOLV PALLER OG FIREOGTYVE LØFT. Stod
   * der "24 paller" om en tur med 12, ville tallet være forkert på en måde
   * ingen kan se — og en chauffør der læssede efter det, ville stå med for
   * lidt plads.
   */
  it("⚠ BEGGE STOP TÆLLER MED, OG NAVNET SIGER DET", () => {
    const s = [
      stop({ ordrer: { a: { kolli: 12, kg: 4200 } } }),
      stop({ art: "levering", ordrer: { b: { kolli: 12, kg: 4200 } } }),
    ];
    assert.deepEqual(summerOrdrer(s), { kolli: 24, kg: 8400, helt: true });
    /* Og skærmen skriver "håndteringer". */
    const skaerm = readFileSync("src/moduler/app/Turplan.jsx", "utf8");
    assert.match(skaerm, /håndteringer/);
    assert.ok(!/\{num\(sum\.kolli\)\} paller/.test(skaerm));
  });

  /**
   * ⚠ `null` NÅR ET TAL MANGLER, IKKE 0. En sum lagt af halvdelen af
   * ordrelinjerne er forkert på en måde ingen kan se.
   */
  it("⚠ ET MANGLENDE TAL GØR HELE SUMMEN null", () => {
    const s = [stop({ ordrer: { a: { kolli: 12 }, b: { kolli: 3, kg: 90 } } })];
    const r = summerOrdrer(s);
    assert.equal(r.kg, null, "kg mangler på den ene linje");
    assert.equal(r.kolli, null, "og så kan ingen af tallene gøres op");
    assert.equal(r.helt, false);
  });

  it("ingen stop giver nul, ikke null", () => {
    /* En tom liste ER et svar: der er intet at håndtere. */
    assert.deepEqual(summerOrdrer([]), { kolli: 0, kg: 0, helt: true });
  });
});

describe("Et stop er nået når der er meldt på det", () => {
  /**
   * ⚠ UDLEDT AF MELDINGERNE, IKKE ET FLAG. Et `scannetMs` på stoppet ville
   * være den samme kendsgerning gemt to steder — og de to ville drive fra
   * hinanden første gang en melding blev sendt igen.
   */
  it("⚠ INTET scannetMs-FELT NOGEN STEDER", () => {
    for (const f of STOP_FELTER) {
      assert.ok(!/scan/i.test(f), `modellen har feltet ${f}`);
    }
    for (const f of Object.keys(STOP)) {
      assert.ok(!/scan/i.test(f), `reglen har feltet ${f}`);
    }
  });

  it("erNaaet følger stopId på meldingerne", () => {
    const s = { id: "stop-1" };
    assert.ok(erNaaet(s, [{ stopId: "stop-1" }]));
    assert.ok(!erNaaet(s, [{ stopId: "stop-2" }]));
    assert.ok(!erNaaet(s, []));
  });

  it("stopstatus tæller nåede og resterende", () => {
    const s = [{ id: "stop-1" }, { id: "stop-2" }, { id: "stop-3" }];
    assert.deepEqual(stopstatus(s, [{ stopId: "stop-1" }]),
      { naaet: 1, tilbage: 2, i_alt: 3 });
  });
});

describe("Hvad der må skrives", () => {
  it("et almindeligt stop er gyldigt", () => {
    assert.deepEqual(valideStop(stop()), []);
    assert.deepEqual(valideStop(stop({ fraMs: 100, tilMs: 200 })), []);
  });

  it("uden art eller navn afvises det", () => {
    assert.match(valideStop({ navn: "A" }).join(), /Ukendt stoptype/);
    assert.match(valideStop({ art: "afhentning" }).join(), /mangler et navn/);
  });

  /**
   * ⚠ ET TIDSVINDUE ER TO TAL ELLER INGEN. Ét alene er ikke et vindue: "fra
   * kl. 08" uden et til ville blive tegnet som et punkt, hvor det i
   * virkeligheden er en åben ende.
   */
  it("⚠ ET HALVT TIDSVINDUE AFVISES", () => {
    assert.match(valideStop(stop({ fraMs: 100 })).join(), /både en start og en slutning/);
    assert.match(valideStop(stop({ tilMs: 200 })).join(), /både en start og en slutning/);
    assert.match(valideStop(stop({ fraMs: 200, tilMs: 100 })).join(), /slutter før/);
  });

  it("et ukendt felt afvises", () => {
    assert.match(valideStop(stop({ lat: 55.4 })).join(), /Ukendt felt: lat/);
    assert.match(valideStop(stop({ ordrer: { a: { vejrudsigt: "regn" } } })).join(),
      /Ukendt felt på ordren/);
  });

  /**
   * ⚠ HELE TAL. Et halvt kolli findes ikke, og et kg med decimaler ville
   * lægge sig sammen til en vægt der ser præcis ud.
   */
  it("⚠ KOLLI OG KG ER HELE TAL", () => {
    assert.match(valideStop(stop({ ordrer: { a: { kolli: 1.5 } } })).join(), /helt tal/);
    assert.match(valideStop(stop({ ordrer: { a: { kg: 90.4 } } })).join(), /helt tal/);
    assert.deepEqual(valideStop(stop({ ordrer: { a: { kolli: 2, kg: 90 } } })), []);
  });

  it("reglen håndhæver de samme grænser", () => {
    /* En klientvalidering der ikke også står i reglerne, tillader før eller
       siden noget serveren skulle have stoppet. */
    assert.match(STOP.ordrer.$ordreId.kolli[".validate"], /% 1 === 0/);
    assert.match(STOP.ordrer.$ordreId.kg[".validate"], /% 1 === 0/);
    assert.match(STOP.tilMs[".validate"], /fraMs/);
    assert.match(STOP[".validate"], /hasChildren\(\['art', 'navn'\]\)/);
  });

  it("⚠ OG ORDRENS kundeId SLÅS OP", () => {
    assert.match(STOP.ordrer.$ordreId.kundeId[".validate"], /child\('kunder'\)/);
  });
});

describe("planlagteStop har ÉT svar", () => {
  const gammel = {
    fraSted: "København", tilSted: "Hamburg", fra: 1, til: 9,
    graenseovergange: ["roedby"],
  };

  it("udleder som før når etapen ingen stop har", () => {
    assert.deepEqual(planlagteStop(gammel).map((s) => s.id),
      ["start", "graense-roedby", "slut"]);
  });

  /**
   * ⚠ DEN VIGTIGSTE. `statushaendelser.stopId` prøves mod NETOP denne
   * funktion (beslutning 103). Lå de eksplicitte stop ved siden af den
   * udledte rute, kunne en melding pege på et stop den ene kendte og den
   * anden ikke.
   */
  it("⚠ DE EKSPLICITTE VINDER, OG GRÆNSEN KOMMER MED", () => {
    const ny = {
      ...gammel,
      stop: { 1: stop({ navn: "Lager A" }), 2: stop({ art: "levering", navn: "Hafen" }) },
    };
    assert.deepEqual(planlagteStop(ny).map((s) => s.id),
      ["stop-1", "graense-roedby", "stop-2"]);
    assert.deepEqual(planlagteStop(ny).map((s) => s.sted),
      ["Lager A", "roedby", "Hafen"]);
  });

  /**
   * ⚠ MED MERE END TO STOP LÆGGES GRÆNSEN IKKE IND. Hvor den hører på et
   * multi-drop, er et gæt — og et gæt der stod som en plan, ville få
   * `naesteStop()` til at pege på et sted chaufføren ikke skal hen.
   */
  it("⚠ ET MULTI-DROP FÅR INGEN GÆTTET GRÆNSE", () => {
    const multi = {
      ...gammel,
      stop: {
        1: stop({ navn: "A" }), 2: stop({ art: "levering", navn: "B" }),
        3: stop({ art: "levering", navn: "C" }),
      },
    };
    assert.deepEqual(planlagteStop(multi).map((s) => s.id),
      ["stop-1", "stop-2", "stop-3"]);
  });

  it("stoppet følger med som `stop`, så skærmen kan nå adressen", () => {
    const ny = { ...gammel, stop: { 1: stop({ gade: "Havnegade 14" }) } };
    assert.equal(planlagteStop(ny)[0].stop.gade, "Havnegade 14");
  });
});

describe("Der er en skrivevej", () => {
  /**
   * ⚠ DET ER HELE POINTEN. `fraAdresse` var en form uden en skrivevej — den
   * blev valideret og skrevet af ingenting. Et stop der først opstod når
   * skærmen tegnede det, ville have samme fejl.
   */
  it("⚠ bookingopret SKRIVER DE TO STOP", () => {
    const r = bookingOpdatering("bk1", ["et1"], {
      kundeId: "k1", fraSted: "København", tilSted: "Hamburg",
      transporttype: "fuld", onsketAfhentningMs: 1000, onsketLeveringMs: 9000,
      straekninger: [{ fraSted: "København", tilSted: "Hamburg" }],
    }, { uid: "u", nu: 5, nummer: "BKG-1" });

    const e = r.opdatering["etaper/et1"];
    const liste = stopListe(e);
    assert.equal(liste.length, 2);
    assert.deepEqual(liste.map((s) => s.art), ["afhentning", "levering"]);
    assert.deepEqual(liste.map((s) => s.navn), ["København", "Hamburg"]);
    for (const s of liste) assert.deepEqual(valideStop(s), []);
  });

  /**
   * ⚠ NAVNET ER STEDET, INDTIL NOGEN TASTER EN ADRESSE. Vi finder ikke på en
   * gade: en gættet adresse sender chaufføren det forkerte sted hen, og det
   * er værre end en adresse der mangler.
   */
  it("⚠ DER GÆTTES INGEN GADE", () => {
    const s = stopFraStraekning({ fraSted: "København", tilSted: "Hamburg" });
    for (const nr of ["1", "2"]) {
      assert.ok(!s[nr].gade, "der er fundet på en gade");
      assert.ok(!s[nr].postnr);
      assert.ok(!s[nr].telefon);
    }
  });

  it("uden et ønsket tidspunkt sættes intet vindue", () => {
    const s = stopFraStraekning({ fraSted: "A", tilSted: "B" });
    assert.ok(!("fraMs" in s["1"]), "et vindue er fundet på");
    assert.ok(!("tilMs" in s["1"]));
  });
});

describe("Demo-stoppene", () => {
  const medStop = DEMO_ETAPER.filter((e) => e.stop);

  it("der ER etaper med stop — ellers prøver skærmen ingenting", () => {
    assert.ok(medStop.length >= 2, `kun ${medStop.length} etaper har stop`);
  });

  it("hvert stop er gyldigt", () => {
    for (const e of medStop) {
      for (const s of stopListe(e)) {
        assert.deepEqual(valideStop(s), [], `${e.id} stop ${s.nr}`);
      }
    }
  });

  it("⚠ OG HVER ORDRE PEGER PÅ EN KUNDE DER FINDES", () => {
    /* Reglen slår `kunder/<kundeId>` op, så en opfundet kunde ville blive
       afvist ved skrivning — men seedet går uden om `.validate`. */
    const kendte = new Set(DEMO_KUNDER.map((k) => k.id));
    for (const e of medStop) {
      for (const s of stopListe(e)) {
        for (const o of ordreListe(s)) {
          assert.ok(kendte.has(o.kundeId),
            `${e.id}: ordren peger på kunden "${o.kundeId}", som ikke findes`);
        }
      }
    }
  });

  /**
   * ⚠ ORDRENUMMERET GEMMES UDEN `#`. Skærmen sætter det foran; et gemt
   * nummertegn ville følge med i en eksport og i en søgning. Og "#100010"
   * ligner en HEX-FARVE — designlinten fældede demo-filen på det.
   */
  it("⚠ INTET NUMMERTEGN I DATA", () => {
    for (const e of medStop) {
      for (const s of stopListe(e)) {
        for (const o of ordreListe(s)) {
          assert.ok(!/^#/.test(o.nummer || ""), `${e.id}: nummeret bærer et #`);
        }
      }
    }
  });
});

describe("Delt kode", () => {
  /**
   * ⚠ LISTEN ER LUKKET UNDER IMPORT. `rutestatus.js` importerer nu `stop.js`,
   * og en manglende kopi fejler ved DEPLOY, ikke ved test.
   */
  it("⚠ stop.js STÅR PÅ DELTE_FILER", () => {
    assert.ok(DELTE_FILER.includes("stop.js"));
    assert.ok(DELTE_FILER.includes("rutestatus.js"));
    assert.ok(DELTE_FILER.indexOf("stop.js") < DELTE_FILER.indexOf("rutestatus.js"),
      "stop.js skal kopieres før den fil der importerer den");
  });

  it("⚠ OG stop.js ER SELV IMPORTFRI", () => {
    const kode = udenKommentarer(readFileSync("src/fleet/stop.js", "utf8"));
    assert.ok(!/^import /m.test(kode),
      "stop.js har fået en import — så skal DEN også stå på listen");
  });
});
