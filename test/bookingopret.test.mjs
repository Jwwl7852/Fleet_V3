/* test/bookingopret.test.mjs
 * At oprette en booking — beslutning 55.
 *
 * HVORFOR FILEN FINDES. Man kunne ikke oprette en booking. `bookinger` og
 * `etaper` er `.write: false`, der fandtes ingen `bookingopret`, og
 * `naesteBookingnummer()` — som har ligget i `booking-state.js` hele tiden —
 * blev **kaldt ingen steder**. README har navngivet hullet i månedsvis:
 *
 *   "En booking kan altså ikke oprettes af en klient."
 *
 * Skærmen fandtes til gengæld: `NyForespoergsel.jsx` med hver eneste felt,
 * to deaktiverede knapper og teksten *"Skrivning er ikke bygget endnu (fase
 * 0)"*. Det er hele forløbets begyndelse — booking → etape → disponering →
 * fakturagrundlag — og den lå på en attrap.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  valideBooking, bookingOpdatering, forloebstilstand,
  TRANSPORTTYPE, RUTEPRAEFERENCE, FLEKSIBILITET,
  ALLE_TRANSPORTTYPER, ALLE_FLEKSIBILITETER, NY_ETAPE_TILSTAND,
} from "../src/fleet/booking-state.js";
import { DEMO_BOOKINGER } from "../src/fleet/demo-bookinger.js";

const START = Date.UTC(2026, 8, 14, 8, 0, 0);
const SLUT = START + 11 * 3600000;

const post = (x = {}) => ({
  kundeId: "ku-1", fraSted: "København", tilSted: "Hamburg",
  transporttype: "fuldlast",
  afhentningFleks: "timer2", leveringFleks: "halvdag",
  onsketAfhentningMs: START, onsketLeveringMs: SLUT,
  ...x,
});

/* ══════════════════════════════════════════════════════════════════════════
   KATALOGERNE — de lå i en demofil
   ══════════════════════════════════════════════════════════════════════════ */

describe("Katalogerne hører i modulet", () => {
  /**
   * ⚠ DE LÅ I `demo-bookinger.js`. Tre skærme importerede dem derfra, og
   * serveren kunne slet ikke nå dem: `functions/` deployer kun sin egen mappe,
   * og et demosæt hører ikke i `delt/`. Præcis samme sted `ARBEJDSTYPE` lå,
   * før den flyttede til `opgaver.js`.
   */
  test("⚠ DEMOFILEN EKSPORTERER DEM IKKE LÆNGERE", () => {
    const demo = readFileSync("src/fleet/demo-bookinger.js", "utf8");
    for (const navn of ["TRANSPORTTYPE", "RUTEPRAEFERENCE", "FLEKSIBILITET"]) {
      assert.ok(!demo.includes(`export const ${navn}`),
        `${navn} er stadig defineret i demofilen`);
    }
    /* Og der er ingen re-eksport: to importstier til ét katalog er to steder
       at være uenige om hvor det bor. */
    assert.ok(!/export \{[^}]*TRANSPORTTYPE/.test(demo), "demofilen re-eksporterer kataloget");
  });

  test("og de er med i den delte fil", () => {
    const delt = readFileSync("scripts/kopier-delt.mjs", "utf8");
    assert.ok(delt.includes('"booking-state.js"'),
      "booking-state.js er ikke delt — serveren kan ikke nå katalogerne");
    assert.deepEqual(ALLE_TRANSPORTTYPER, Object.keys(TRANSPORTTYPE));
    assert.equal(Object.keys(RUTEPRAEFERENCE).length, 4);
    assert.deepEqual(ALLE_FLEKSIBILITETER, Object.keys(FLEKSIBILITET));
  });

  /* Demosættet skal kunne oprettes gennem skærmen — ellers viser det noget
     systemet ikke kan lave. */
  test("⚠ HVER DEMO-BOOKING VILLE BLIVE TAGET IMOD", () => {
    for (const b of DEMO_BOOKINGER) {
      const r = valideBooking(b);
      assert.equal(r.ok, true, `${b.nummer}: ${JSON.stringify(r.fejl)}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   FORMEN
   ══════════════════════════════════════════════════════════════════════════ */

describe("valideBooking", () => {
  test("tager en udfyldt forespørgsel", () => {
    const r = valideBooking(post(), { kunder: ["ku-1"] });
    assert.equal(r.ok, true, JSON.stringify(r.fejl));
  });

  test("afviser en ukendt kunde", () => {
    assert.equal(valideBooking(post(), { kunder: ["ku-2"] }).ok, false);
    /* Uden listen springes tjekket over — klienten har den i hånden, serveren
       slår op i basen, og ingen af de to gætter for den anden. */
    assert.equal(valideBooking(post()).ok, true);
  });

  /**
   * ⚠ FLEKSIBILITETEN ER PÅKRÆVET, OG DEN GÆTTES IKKE. Uden et spænd kan
   * matchningen ikke lægge to forsendelser sammen, og hver forespørgsel bliver
   * sin egen tur. En default på "fast" ville se ud som et svar kunden havde
   * givet — og det er det dyreste af de fire.
   */
  test("⚠ KRÆVER BEGGE FLEKSIBILITETER", () => {
    for (const felt of ["afhentningFleks", "leveringFleks"]) {
      const r = valideBooking(post({ [felt]: undefined }), { kunder: ["ku-1"] });
      assert.equal(r.ok, false, felt);
      assert.ok(r.fejl[felt]);
    }
  });

  test("⚠ LEVERING SKAL LIGGE EFTER AFHENTNING", () => {
    const r = valideBooking(post({ onsketLeveringMs: START - 1 }), { kunder: ["ku-1"] });
    assert.equal(r.ok, false);
    assert.ok(r.fejl.onsketLeveringMs);
  });

  test("⚠ BELØBET ER HELE ØRE", () => {
    assert.equal(valideBooking(post({ omsaetningOere: 1849.99 }), { kunder: ["ku-1"] }).ok, false);
    assert.equal(valideBooking(post({ omsaetningOere: -1 }), { kunder: ["ku-1"] }).ok, false);
    assert.equal(valideBooking(post({ omsaetningOere: 184999 }), { kunder: ["ku-1"] }).ok, true);
    /* Tomt er lovligt: en forespørgsel kan komme ind før prisen er aftalt. */
    assert.equal(valideBooking(post({ omsaetningOere: null }), { kunder: ["ku-1"] }).ok, true);
  });

  test("afviser en ukendt transporttype og en tom strækning", () => {
    assert.equal(valideBooking(post({ transporttype: "luftfragt" })).ok, false);
    assert.equal(valideBooking(post({ fraSted: "  " })).ok, false);
    assert.equal(valideBooking(post({ tilSted: "" })).ok, false);
  });

  /* ⚠ DIVISIONEN KAN IKKE UDLEDES AF KUNDEN — beslutning 19. */
  /* ⚠ HER STOD "kræver en division". Feltet findes ikke længere
     (beslutning 70), og en booking er gyldig uden det. */
  test("⚠ ER GYLDIG UDEN DIVISION — feltet findes ikke", () => {
    assert.equal(valideBooking(post({})).ok, true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   OPDATERINGEN — bookingen OG etaperne
   ══════════════════════════════════════════════════════════════════════════ */

describe("bookingOpdatering", () => {
  const byg = (x = {}, ider = ["e-1"]) =>
    bookingOpdatering("bk-1", ider, post(x), {
      uid: "u-case", nu: 1786000000000, nummer: "BKG-2026-00042",
    });

  test("skriver bookingen og etapen i ÉN opdatering", () => {
    const { opdatering } = byg();
    assert.deepEqual(Object.keys(opdatering).sort(),
      ["bookinger/bk-1", "etaper/e-1"]);
  });

  /**
   * ⚠ EN BOOKING UDEN ETAPER ER EN FORESPØRGSEL INGEN KAN PLANLÆGGE.
   * Det man disponerer er en ETAPE (beslutning 16), og `forloebstilstand([])`
   * svarer allerede `kladde` på den tomme liste — altså en tilstand der ligner
   * en rigtig, på et forløb der ikke kan komme videre.
   */
  test("⚠ KASTER PÅ EN BOOKING UDEN ETAPER", () => {
    assert.throws(() => byg({}, []), /etaper/);
    assert.throws(() => bookingOpdatering("bk-1", ["e-1"], post(), { uid: "u", nu: 1 }),
      /nummer/i);
  });

  /**
   * ⚠ TILSTANDEN SÆTTES IKKE — DEN REGNES. Beslutning 40: bookingens tilstand
   * er AFLEDT af etaperne. Kunne den sættes, ville der være to veje til ét
   * felt.
   */
  test("⚠ TILSTANDEN ER AFLEDT AF ETAPERNE", () => {
    const { opdatering, etaper } = byg();
    const b = opdatering["bookinger/bk-1"];
    assert.equal(etaper[0].tilstand, NY_ETAPE_TILSTAND);
    assert.equal(b.tilstand, forloebstilstand(etaper).tilstand);
    assert.equal(b.tilstand, "kladde");
    assert.equal(b.harAabneEtaper, false);
  });

  test("⚠ EN TILSTAND FRA KLIENTEN IGNORERES", () => {
    const { opdatering } = byg({ tilstand: "reserveret", harAabneEtaper: true });
    assert.equal(opdatering["bookinger/bk-1"].tilstand, "kladde");
    assert.equal(opdatering["bookinger/bk-1"].harAabneEtaper, false);
  });

  /**
   * ⚠ ØNSKERNE LIGGER I ENDERNE. Et forløb med tre etaper har ét
   * afhentnings- og ét leveringsønske; mellemtiderne er noget disponenten
   * finder. Gættede vi dem, ville et forslag blive prøvet mod et vindue ingen
   * har besluttet — samme regel som at en opgave uden estimat ikke får en
   * standardlængde.
   */
  test("⚠ KUN FØRSTE ETAPE FÅR fra, KUN SIDSTE FÅR senestMs", () => {
    const straekninger = [
      { fraSted: "København", tilSted: "Rødby" },
      { fraSted: "Puttgarden", tilSted: "Hamburg" },
    ];
    const { etaper } = bookingOpdatering("bk-2", ["e-1", "e-2"],
      { ...post(), straekninger },
      { uid: "u", nu: 1, nummer: "BKG-2026-00043" });

    assert.equal(etaper.length, 2);
    assert.equal(etaper[0].fra, START);
    assert.equal(etaper[0].senestMs, undefined);
    assert.equal(etaper[1].fra, undefined);
    assert.equal(etaper[1].senestMs, SLUT);
    assert.deepEqual(etaper.map((e) => e.nr), [1, 2]);
    assert.deepEqual(etaper.map((e) => e.bookingId), ["bk-2", "bk-2"]);
  });

  test("kræver ét id pr. strækning", () => {
    assert.throws(() => bookingOpdatering("bk-3", ["e-1"], {
      ...post(), straekninger: [{ fraSted: "a", tilSted: "b" }, { fraSted: "b", tilSted: "c" }],
    }, { uid: "u", nu: 1, nummer: "BKG-2026-00044" }), /strækning/);
  });

  /* Et felt der ikke blev udfyldt, er noget andet end et felt der blev
     udfyldt med ingenting — og RTDB sletter alligevel et null. */
  test("udelader de valgfrie felter frem for at skrive tomt", () => {
    const { opdatering } = byg({ kundekrav: "  ", kundeRef: "", rutepraeference: null });
    const b = opdatering["bookinger/bk-1"];
    assert.ok(!("kundekrav" in b));
    assert.ok(!("kundeRef" in b));
    assert.ok(!("rutepraeference" in b));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   HÅNDHÆVELSEN
   ══════════════════════════════════════════════════════════════════════════ */

const kilde = readFileSync("functions/index.js", "utf8");
const blok = (() => {
  const start = kilde.indexOf("export const bookingopret");
  assert.ok(start >= 0, "functions/index.js har ingen bookingopret");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
})();

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("bookingopret håndhæver det skærmen viser", () => {
  test("⚠ KALDER SKÆRMENS EGEN VALIDERING OG BYGGER ÉT STED", () => {
    assert.ok(blok.includes("valideBooking("), "valideringen kaldes ikke");
    assert.ok(blok.includes("bookingOpdatering("), "opdateringen bygges ikke ét sted");
    assert.ok(kilde.includes('from "./delt/booking-state.js"'));
  });

  /**
   * ⚠ NUMMERET FRA COUNTEREN, ALDRIG FRA EN OPTÆLLING — beslutning 8.
   * To casehandlere der opretter i samme sekund, ville ellers få samme
   * nummer, og en optælling ville dertil genbruge et nummer hvis en gammel
   * booking blev taget ud af drift.
   */
  test("⚠ HENTER NUMMERET FRA COUNTEREN", () => {
    const b = udenKommentarer(blok);
    assert.ok(b.includes("naesteBookingnummer("), "nummeret kommer ikke fra counteren");
    assert.ok(!b.includes("d.nummer"), "klienten kan oplyse nummeret");
    assert.ok(!/numberChildren|\.length \+ 1/.test(b), "nummeret tælles op");
  });

  test("⚠ ÉN update() MED BEGGE HALVDELE", () => {
    const b = udenKommentarer(blok);
    assert.equal((b.match(/rod\.update\(/g) || []).length, 1, "der skrives mere end ét sted");
  });

  test("⚠ TILSTANDEN KOMMER IKKE FRA KLIENTEN", () => {
    const b = udenKommentarer(blok);
    assert.ok(!b.includes("d.tilstand"), "klienten kan sætte tilstanden");
    assert.ok(!b.includes("d.harAabneEtaper"));
  });

  /**
   * ⚠ INGEN RESERVATION. En kladde-etape spærrer ingenting: reservationen
   * kommer når et FORSLAG godkendes, og det er `etapeskift`s arbejde. Skrev
   * vi en her, ville en forespørgsel spærre en bil ingen havde disponeret.
   */
  test("⚠ SKRIVER INGEN RESERVATION", () => {
    const b = udenKommentarer(blok);
    assert.ok(!b.includes("reservationer/"), "oprettelsen spærrer en ressource");
    assert.ok(!b.includes("reservationFraOpgave"));
  });

  test("kræver booking.opret, modulet og et aktivt abonnement", () => {
    assert.ok(blok.includes('perms.includes("|booking.opret|")'));
    assert.ok(blok.includes('moduler.child("booking")'));
    assert.ok(blok.includes("abonnement/status"));
    assert.ok(blok.includes('rod.child("_findes")'));
  });

  test("⚠ EN INAKTIV KUNDE FÅR INGEN NY BOOKING", () => {
    assert.ok(blok.includes("kunde.aktiv === false"));
    assert.ok(blok.includes("failed-precondition"));
  });

  test("efterlader et spor i auditloggen", () => {
    assert.ok(blok.includes("logOpgave("), "oprettelsen logges ikke");
  });
});

describe("Ny forespørgsel skriver gennem serveren", () => {
  const skaerm = udenKommentarer(readFileSync("src/moduler/booking/NyForespoergsel.jsx", "utf8"));

  test("⚠ ATTRAPPEN ER VÆK", () => {
    assert.ok(!skaerm.includes("fase 0"), "knappen siger stadig at der ikke skrives");
    assert.ok(skaerm.includes("opretBooking("), "skærmen kalder ikke serveren");
  });

  test("⚠ VALIDERER MED SERVERENS EGEN FUNKTION", () => {
    assert.ok(skaerm.includes("valideBooking("));
  });

  /**
   * ⚠ KUNDELISTEN KOMMER FRA NODEN, IKKE FRA DEMOSÆTTET. Skærmen læste
   * `DEMO_KUNDER` direkte — så vælgeren tilbød kunder der ikke findes i
   * basen, og serveren ville svare "Kunden findes ikke" på et valg skærmen
   * selv havde tilbudt.
   */
  test("⚠ HENTER KUNDERNE MED useListe", () => {
    assert.ok(skaerm.includes('useListe("kunder"'), "kunderne hentes ikke fra noden");
    assert.ok(!/DEMO_KUNDER\s*\n?\s*\.filter/.test(skaerm),
      "skærmen slår stadig op i demosættet");
  });

  test("skriver ikke uden om serveren", () => {
    assert.ok(!skaerm.includes("db.ref"), "skærmen skriver direkte");
    assert.ok(!skaerm.includes("gem({"), "skærmen går gennem skriv.js");
  });
});
