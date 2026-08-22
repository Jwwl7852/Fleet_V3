/* test/godkendelse.test.mjs
 * Godkendelse af indkøb — beslutning 82, trin 3 i Procures proces.
 *
 * ⚠ HVAD DEN HER PRØVE HOLDER FAST I:
 *
 *   1. **Den der rammer loftet, må ikke kunne hæve det.** Reglen sættes med
 *      `brugere.skriv`, ikke `indkoeb.skriv`. Falder det led, kan enhver der
 *      bestiller, sætte sin egen grænse til hundrede millioner — og hele
 *      planche 2 er pynt. Samme skelnen som beslutning 24 lavede på
 *      auditudtrækket.
 *   2. **At godkende er en anden handling end at bestille.** `indkoeb.godkend`
 *      findes, og den er ikke `indkoeb.skriv`.
 *   3. **En aktiv regel uden grænse spærrer ALT.** Den fejler lukket. Faldt
 *      den tilbage på 0, ville alt skulle godkendes; på uendelig ville intet.
 *      Begge ser ud som "reglen er slået til".
 *   4. **Et automatisk godkendt indkøb er ikke et godkendt indkøb.** Det får
 *      intet `godkendtAf` — et uid dér ville påstå at en person kiggede.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  STANDARD_GODKENDELSESREGLER, valideGodkendelsesregler, kraeverGodkendelse,
  ORDRE_OVERGANGE, kanSkifteIndkoebsordre, tilgaengeligeOrdreHandlinger,
  ordreOpdatering, ventendeOrdrer, GODKENDELSESGRUND, ORDRESTATUS,
  ordreSumOere,
} from "../src/fleet/procure.js";
import { DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER } from "../src/fleet/demo-procure.js";
import { PERM, ROLLE_PERMS, ALLE_ROLLER } from "../src/fleet/permissions.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SKAERM = udenKommentarer(readFileSync("src/moduler/indkoeb/Godkendelser.jsx", "utf8"));
const KLIENT = udenKommentarer(readFileSync("src/fleet/godkendelse.js", "utf8"));
const SERVER = udenKommentarer(readFileSync("functions/index.js", "utf8"));
const REGLER = readFileSync("firebase.rules.json", "utf8");

function funktion(navn) {
  const start = SERVER.indexOf(`export const ${navn} =`);
  if (start < 0) throw new Error(`${navn} findes ikke i functions/index.js`);
  const slut = SERVER.indexOf("\nexport const ", start + 1);
  return SERVER.slice(start, slut < 0 ? SERVER.length : slut);
}

const PERMS_ALT = `|${PERM.indkoebSkriv}|${PERM.indkoebGodkend}|`;

/* ══════════════════════════════════════════════════════════════════════════
   REGLEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Reglen er virksomhedens egen politik", () => {
  /**
   * ⚠ EN TENANT UDEN NODEN OPFØRER SIG PRÆCIS SOM I DAG. Faldt standarden
   * tilbage på "godkendelse påkrævet", ville hver eksisterende kunde få en kø
   * han ikke havde bedt om, første gang funktionen blev udrullet. Samme greb
   * som `permsForTenant()` bruger på `roller/`.
   */
  test("⚠ STANDARDEN ER INGEN GODKENDELSE", () => {
    assert.equal(STANDARD_GODKENDELSESREGLER.overBeloeb.aktiv, false);
    assert.equal(STANDARD_GODKENDELSESREGLER.fakturagodkendelse.aktiv, false);
    const o = { linjer: { a: { vare: "x", antal: 1000, prisPrEnhedOere: 100000 } } };
    assert.equal(kraeverGodkendelse(o, STANDARD_GODKENDELSESREGLER).kraever, false);
    assert.equal(kraeverGodkendelse(o, null).kraever, false, "en manglende node kræver godkendelse");
  });

  /**
   * ⚠ EN AKTIV REGEL UDEN GRÆNSE ER UGYLDIG — og indtil den er rettet, spærrer
   * den ALT. Fejler lukket, som permission-strengen gør. Faldt den tilbage på
   * 0, skulle alt godkendes; på uendelig skulle intet. Begge ser ud som
   * "reglen er slået til", og de er hinandens modsætning.
   */
  test("⚠ EN AKTIV REGEL UDEN GRÆNSE ER UGYLDIG OG SPÆRRER ALT", () => {
    const uden = { overBeloeb: { aktiv: true, godkenderUid: "u1" }, fakturagodkendelse: { aktiv: false } };
    assert.equal(valideGodkendelsesregler(uden).ok, false);
    assert.ok(valideGodkendelsesregler(uden).fejl.graenseOere);

    const lille = { linjer: { a: { vare: "x", antal: 1, prisPrEnhedOere: 100 } } };
    const svar = kraeverGodkendelse(lille, uden);
    assert.equal(svar.kraever, true, "en ugyldig regel lod et indkøb slippe igennem");
    assert.equal(svar.grund, "ugyldigRegel");
    assert.ok(GODKENDELSESGRUND[svar.grund], "grunden kan ikke vises på skærmen");
  });

  /* ⚠ EN AKTIV REGEL UDEN GODKENDER ER EN KØ INGEN TØMMER. */
  test("⚠ EN AKTIV REGEL SKAL HAVE EN GODKENDER", () => {
    const r = valideGodkendelsesregler({
      overBeloeb: { aktiv: true, graenseOere: 500000 },
      fakturagodkendelse: { aktiv: false },
    });
    assert.equal(r.ok, false);
    assert.ok(r.fejl.godkenderUid);
  });

  /* En slået FRA regel behøver hverken grænse eller godkender — det er hele
     meningen med at kunne slå den fra. */
  test("en slået fra regel er gyldig uden felter", () => {
    assert.equal(valideGodkendelsesregler(STANDARD_GODKENDELSESREGLER).ok, true);
  });

  /**
   * ⚠ GRÆNSEN ER I HELE ØRE SOM INTEGER. 5.000 kr er 500000, aldrig 5000.5 —
   * en float ville sætte et loft ingen kan genfinde.
   */
  test("⚠ GRÆNSEN SKAL VÆRE HELE ØRE", () => {
    const med = (v) => valideGodkendelsesregler({
      overBeloeb: { aktiv: true, graenseOere: v, godkenderUid: "u1" },
      fakturagodkendelse: { aktiv: false },
    });
    assert.equal(med(500000).ok, true);
    assert.equal(med(5000.5).ok, false, "en float blev taget imod som en beløbsgrænse");
    assert.equal(med(-1).ok, false);
    assert.equal(med("500000").ok, false);
  });

  /**
   * ⚠ "OVERSTIGER", IKKE "MINDST". Planchens knap siger *"Kræver godkendelse,
   * når et indkøb overstiger det angivne beløb"* — præcis 5.000 kr. er altså
   * IKKE over grænsen. Læste vi det omvendt, ville hvert indkøb på nøjagtig
   * grænsen havne i en kø den ikke hører i.
   */
  test("⚠ PRÆCIS PÅ GRÆNSEN KRÆVER IKKE GODKENDELSE", () => {
    const r = { overBeloeb: { aktiv: true, graenseOere: 500000, godkenderUid: "u1" },
      fakturagodkendelse: { aktiv: false } };
    const paa = { linjer: { a: { vare: "x", antal: 5, prisPrEnhedOere: 100000 } } };
    const over = { linjer: { a: { vare: "x", antal: 5, prisPrEnhedOere: 100001 } } };
    assert.equal(ordreSumOere(paa), 500000);
    assert.equal(kraeverGodkendelse(paa, r).kraever, false);
    assert.equal(kraeverGodkendelse(over, r).kraever, true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   OVERGANGENE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Ordren skifter tilstand efter tabellen", () => {
  const REGLER = DEMO_GODKENDELSESREGLER;
  const ordre = (status, oprettetAf = "uid-lars") => ({
    id: "o1", status, oprettetAf,
    linjer: { a: { vare: "x", antal: 10, prisPrEnhedOere: 100000 } },
  });

  test("hver tilstand i kataloget har en række i tabellen", () => {
    for (const s of Object.keys(ORDRESTATUS)) {
      assert.ok(ORDRE_OVERGANGE[s], `"${s}" har ingen overgange — heller ikke en tom liste`);
    }
    for (const s of Object.keys(ORDRE_OVERGANGE)) {
      assert.ok(ORDRESTATUS[s], `"${s}" er en overgang til en tilstand der ikke findes`);
    }
  });

  /* ⚠ HVER MÅLTILSTAND SKAL FINDES. En overgang til en tilstand reglen ikke
     kender, ville blive afvist af `.validate` EFTER at knappen var trykket. */
  test("⚠ INGEN OVERGANG PEGER PÅ EN UKENDT TILSTAND", () => {
    for (const [fra, liste] of Object.entries(ORDRE_OVERGANGE)) {
      for (const o of liste) {
        assert.ok(ORDRESTATUS[o.til], `${fra} → "${o.til}" findes ikke`);
        assert.ok(o.perm, `${fra} → ${o.til} kræver ingen permission`);
        assert.ok(o.label, `${fra} → ${o.til} har ingen knaptekst`);
      }
    }
  });

  /**
   * ⚠ TRE ENDESTATIONER. `afvist`, `modtaget` og `annulleret` har ingen vej
   * videre — varen står på hylden, eller beslutningen er taget. Skal noget
   * sendes retur, er det en kreditnota: en anden post, ikke en tilbagerulning.
   */
  test("⚠ afvist, modtaget OG annulleret ER ENDESTATIONER", () => {
    for (const s of ["afvist", "modtaget", "annulleret"]) {
      assert.deepEqual(ORDRE_OVERGANGE[s], [], `${s} kan rulles tilbage`);
      const svar = kanSkifteIndkoebsordre(ordre(s), "kladde", { perms: PERMS_ALT });
      assert.equal(svar.ok, false);
      assert.match(svar.aarsag, /afsluttet/);
    }
  });

  /**
   * ⚠ AT GODKENDE KRÆVER indkoeb.godkend, IKKE indkoeb.skriv. Den der
   * bestiller varen, og den der siger god for regningen, er i en virksomhed
   * med adskilte funktioner BEVIDST to personer.
   */
  test("⚠ GODKENDELSE KRÆVER SIN EGEN PERMISSION", () => {
    const o = ordre("afventerGodkendelse", "uid-mikkel");
    const kun = { perms: `|${PERM.indkoebSkriv}|`, regler: REGLER, uid: "uid-mikkel" };
    const svar = kanSkifteIndkoebsordre(o, "godkendt", kun);
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /indkoeb\.godkend/);

    const med = { perms: PERMS_ALT, regler: REGLER, uid: "uid-mikkel" };
    assert.equal(kanSkifteIndkoebsordre(o, "godkendt", med).ok, true);
  });

  /**
   * ⚠ KUN DEN UDPEGEDE GODKENDER AFGØR. Reglen navngiver ÉN person; havde
   * enhver med permissionen kunnet godkende, ville feltet på planchen være
   * pynt.
   */
  test("⚠ EN ANDEN END DEN UDPEGEDE KAN IKKE AFGØRE", () => {
    const o = ordre("afventerGodkendelse");
    const anden = { perms: PERMS_ALT, regler: REGLER, uid: "uid-en-anden" };
    for (const til of ["godkendt", "afvist"]) {
      const svar = kanSkifteIndkoebsordre(o, til, anden);
      assert.equal(svar.ok, false, `${til} kunne afgøres af en anden`);
      assert.match(svar.aarsag, /udpegede godkender/);
    }
  });

  /**
   * ⚠ MEN GODKENDEREN MÅ GODKENDE SINE EGNE — og det er en truffet beslutning,
   * ikke et hul. Reglen udpeger ÉN person; krævede vi derudover to par øjne,
   * ville hans egne ordrer ALDRIG kunne godkendes — en blindgyde i data, ikke
   * en kontrol. Planchen svarer selv: kortet "Kan slås fra" siger at
   * funktionen bør slås fra netop når samme person bestiller og godkender.
   *
   * Til gengæld MARKERES det, og markeringen er hele grunden til at det er
   * forsvarligt.
   */
  test("⚠ GODKENDEREN MÅ GODKENDE SIT EGET — OG DET MARKERES", () => {
    const egen = ordre("afventerGodkendelse", "uid-mikkel");
    const som = { perms: PERMS_ALT, regler: REGLER, uid: "uid-mikkel" };
    assert.equal(kanSkifteIndkoebsordre(egen, "godkendt", som).ok, true);

    const opd = ordreOpdatering(egen, "godkendt", { uid: "uid-mikkel", nu: 7, regler: REGLER });
    assert.equal(opd.selvgodkendt, true, "selvgodkendelsen kan ikke ses");
    assert.equal(opd.godkendtAf, "uid-mikkel");
    assert.equal(opd.godkendtAutomatisk, false);
  });

  /* ⚠ EN AFVISNING KRÆVER EN GRUND. Uden den er den en tavshed, og den samme
     bestilling bliver lagt igen i næste uge. */
  test("⚠ AFVISNING OG ANNULLERING KRÆVER EN BEGRUNDELSE", () => {
    const som = { perms: PERMS_ALT, regler: REGLER, uid: "uid-mikkel" };
    assert.equal(
      kanSkifteIndkoebsordre(ordre("afventerGodkendelse", "uid-mikkel"), "afvist", som).kraeverBegrundelse,
      true);
    assert.equal(
      kanSkifteIndkoebsordre(ordre("kladde"), "annulleret", som).kraeverBegrundelse, true);
    /* En godkendelse gør det IKKE — en begrundelse for et ja er en formular
       ingen udfylder ærligt. */
    assert.equal(
      kanSkifteIndkoebsordre(ordre("afventerGodkendelse", "uid-mikkel"), "godkendt", som).kraeverBegrundelse,
      false);
  });

  /**
   * ⚠ "SEND TIL GODKENDELSE" ENDER MÅSKE PÅ `godkendt`. Er beløbet under
   * grænsen, er der ingen at vente på — og en kø med en post ingen skal røre,
   * lærer folk at ignorere køen.
   *
   * ⚠ MEN DEN FÅR INTET `godkendtAf`. Et uid dér ville påstå at en person
   * kiggede. Flaget siger hvad der skete.
   */
  test("⚠ UNDER GRÆNSEN GODKENDES AUTOMATISK — UDEN ET godkendtAf", () => {
    const lille = { id: "o2", status: "kladde", oprettetAf: "uid-lars",
      linjer: { a: { vare: "x", antal: 1, prisPrEnhedOere: 10000 } } };
    const opd = ordreOpdatering(lille, "afventerGodkendelse", { uid: "uid-lars", nu: 9, regler: REGLER });
    assert.equal(opd.status, "godkendt");
    assert.equal(opd.godkendtAutomatisk, true);
    assert.equal(opd.godkendtAf, undefined,
      "en automatisk godkendelse påstår at en person kiggede");
  });

  test("over grænsen havner i køen", () => {
    const stor = { id: "o3", status: "kladde", oprettetAf: "uid-lars",
      linjer: { a: { vare: "x", antal: 10, prisPrEnhedOere: 100000 } } };
    const opd = ordreOpdatering(stor, "afventerGodkendelse", { uid: "uid-lars", nu: 9, regler: REGLER });
    assert.equal(opd.status, "afventerGodkendelse");
    assert.equal(opd.godkendtAutomatisk, undefined);
  });

  /* ⚠ DE UMULIGE FALDER IKKE UD — de står med deres grund. En knap der
     forsvinder, efterlader spørgsmålet "hvorfor kan jeg ikke det her?". */
  test("⚠ HANDLINGSLISTEN BÆRER OGSÅ DE UMULIGE, MED EN GRUND", () => {
    const h = tilgaengeligeOrdreHandlinger(ordre("afventerGodkendelse"),
      { perms: PERMS_ALT, regler: REGLER, uid: "uid-en-anden" });
    assert.equal(h.length, 2);
    assert.ok(h.every((x) => !x.ok), "en anden end godkenderen fik lov");
    assert.ok(h.every((x) => x.aarsag), "en umulig handling står uden sin grund");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KØEN OG DEMO-SÆTTET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Køen viser det den skal", () => {
  test("⚠ DEMO-REGLERNE KAN GEMMES", () => {
    const r = valideGodkendelsesregler(DEMO_GODKENDELSESREGLER);
    assert.equal(r.ok, true, Object.values(r.fejl).join(", "));
  });

  /**
   * ⚠ EN VENTENDE ORDRE SKAL FAKTISK KRÆVE GODKENDELSE.
   *
   * Ligger den under beløbsgrænsen, ville serveren have godkendt den
   * automatisk — den kan altså ikke stå i køen. Et demo-sæt der viser en
   * tilstand serveren ikke kan producere, får skærmen til at se rigtig ud på
   * præcis den måde ingen opdager: knapperne virker, tallene passer, og rækken
   * burde ikke være der. Det blev målt: ord-006 stod på 1.420 kr.
   */
  test("⚠ INGEN VENTENDE DEMO-ORDRE ER UNDER GRÆNSEN", () => {
    const koe = ventendeOrdrer(DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER);
    assert.ok(koe.length >= 2, "for få ventende ordrer til at køen kan ses virke");
    for (const k of koe) {
      assert.equal(kraeverGodkendelse(k.ordre, DEMO_GODKENDELSESREGLER).kraever, true,
        `${k.ordre.id} venter, men ${k.sumOere / 100} kr. er under grænsen — `
        + "serveren ville have godkendt den automatisk");
    }
  });

  /* ⚠ ÆLDST FØRST. Den der har ventet længst, er den der spærrer noget. */
  test("⚠ KØEN ER SORTERET ÆLDST FØRST", () => {
    const koe = ventendeOrdrer(DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER);
    for (let i = 1; i < koe.length; i += 1) {
      assert.ok(koe[i - 1].ordre.oprettetMs <= koe[i].ordre.oprettetMs,
        "køen står ikke ældst først");
    }
  });

  /* Uden et eksempel kan markeringen "godkendt af den der bestilte" ikke ses. */
  test("⚠ ÉN VENTENDE ORDRE ER LAGT AF GODKENDEREN SELV", () => {
    const g = DEMO_GODKENDELSESREGLER.overBeloeb.godkenderUid;
    const koe = ventendeOrdrer(DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER);
    assert.ok(koe.some((k) => k.ordre.oprettetAf === g),
      "ingen ventende ordre er lagt af godkenderen — selvgodkendelsen kan ikke ses");
  });

  /* Er reglen slået fra, er køen tom — uanset hvad ordrerne koster. */
  test("⚠ ER REGLEN SLÅET FRA, ER KØEN IKKE FYLDT MED GAMLE POSTER", () => {
    const koe = ventendeOrdrer(DEMO_INDKOEBSORDRER, STANDARD_GODKENDELSESREGLER);
    for (const k of koe) {
      assert.equal(k.grund, "reglenErFra",
        "en ordre venter med en grund der ikke findes, når reglen er fra");
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   PERMISSIONEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Den der rammer loftet, kan ikke hæve det", () => {
  /**
   * ⚠ REGLEN SÆTTES MED brugere.skriv, IKKE indkoeb.skriv.
   *
   * Med `indkoeb.skriv` kunne enhver der bestiller, sætte sin egen
   * beløbsgrænse til hundrede millioner og godkende sig selv ud af hele
   * planche 2. Et loft der kan hæves af den der rammer det, er ikke et loft —
   * præcis det beslutning 24 rettede 23 på, og her koster det penge.
   */
  test("⚠ godkendelsesregelskriv KRÆVER brugere.skriv", () => {
    const blok = funktion("godkendelsesregelskriv");
    assert.match(blok, /PERM\.brugereSkriv/);
    assert.ok(!/indkoeb\.skriv/.test(blok),
      "den der bestiller, kan sætte sin egen beløbsgrænse");
  });

  test("⚠ ordrestatus BRUGER SAMME kanSkifteIndkoebsordre SOM SKÆRMEN", () => {
    const blok = funktion("ordrestatus");
    assert.match(blok, /kanSkifteIndkoebsordre\(ordre, til, \{ perms, regler, uid \}\)/);
    assert.match(SKAERM, /tilgaengeligeOrdreHandlinger\(/);
    assert.match(SERVER, /kanSkifteIndkoebsordre,[\s\S]{0,120}from "\.\/delt\/procure\.js";/);
  });

  /**
   * ⚠ REGLERNE LÆSES AF NODEN, IKKE AF KALDET. Kom grænsen ind udefra, kunne
   * den der bestiller, sende sin egen — og hele permissionstjekket ovenfor
   * ville være omgået i ét hop.
   */
  test("⚠ SERVEREN LÆSER REGLERNE AF NODEN", () => {
    const blok = funktion("ordrestatus");
    assert.match(blok, /rod\.child\("godkendelsesregler"\)\.once\("value"\)/);
    assert.match(blok, /STANDARD_GODKENDELSESREGLER/);
    assert.ok(!/d\.graenseOere|d\.regler/.test(blok),
      "grænsen kommer fra klienten");
  });

  /* ⚠ GODKENDEREN SKAL FINDES SOM BRUGER — ellers er køen en post der venter
     på nogen der ikke kan logge ind. */
  test("⚠ GODKENDEREN SKAL VÆRE BRUGER I VIRKSOMHEDEN", () => {
    const blok = funktion("godkendelsesregelskriv");
    assert.match(blok, /brugere\/\$\{felt\.godkenderUid\}/);
  });

  test("⚠ indkoeb.godkend ER IKKE indkoeb.skriv", () => {
    assert.equal(PERM.indkoebGodkend, "indkoeb.godkend");
    assert.notEqual(PERM.indkoebGodkend, PERM.indkoebSkriv);
  });

  /**
   * ⚠ IKKE ALLE ROLLER MÅ GODKENDE. Har alle den, er permissionen en
   * beskrivelse frem for en spærring — og det var netop fundet i
   * rollegennemgangen, hvor 48 af 55 stier var ens for alle syv roller.
   */
  test("⚠ IKKE ALLE ROLLER HAR indkoeb.godkend", () => {
    const med = ALLE_ROLLER.filter((r) => ROLLE_PERMS[r].includes(PERM.indkoebGodkend));
    assert.ok(med.length >= 1, "ingen rolle kan godkende et indkøb");
    assert.ok(med.length < ALLE_ROLLER.length,
      "alle roller kan godkende — så er permissionen en beskrivelse, ikke en spærring");
    /* Den der bestiller, må ikke også godkende som standard. */
    for (const r of ["casehandler", "disponent"]) {
      assert.ok(!ROLLE_PERMS[r].includes(PERM.indkoebGodkend),
        `${r} bestiller OG godkender — det er ikke to sæt øjne`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   REGELFILEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Noden er lukket, og formen står i reglerne", () => {
  test("⚠ godkendelsesregler ER .write: false", () => {
    const i = REGLER.indexOf('"godkendelsesregler": {');
    assert.ok(i > 0, "noden findes ikke i regelfilen");
    const blok = REGLER.slice(i, i + 3000);
    assert.match(blok, /"\.write": false/);
    /* Modulklausulen — en kunde uden Procure skal ikke kunne læse den. */
    assert.match(blok, /child\('indkoeb'\)\.val\(\) === true/);
  });

  /* ⚠ HELE ØRE SOM INTEGER, og `% 1 === 0` fordi RTDB-regler ingen toInt har.
     Filen kunne slet ikke indlæses den dag `toInt()` blev prøvet. */
  test("⚠ GRÆNSEN VALIDERES SOM HELE ØRE", () => {
    const i = REGLER.indexOf('"graenseOere"', REGLER.indexOf('"godkendelsesregler": {'));
    const linje = REGLER.slice(i, REGLER.indexOf("\n", i));
    assert.match(linje, /% 1 === 0/);
    assert.ok(!/toInt/.test(linje), "toInt findes ikke i RTDB-regler");
  });

  /* ⚠ FLAGET SKAL KUNNE STÅ PÅ ORDREN. Uden det i reglerne ville
     `godkendtAutomatisk` blive afvist af `$andet: false` — og en automatisk
     godkendelse ville se ud som en menneskelig. */
  test("⚠ godkendtAutomatisk OG selvgodkendt STÅR I REGLERNE", () => {
    const i = REGLER.indexOf('"indkoebsordrer": {');
    const blok = REGLER.slice(i, REGLER.indexOf('"godkendelsesregler": {'));
    assert.match(blok, /"godkendtAutomatisk": \{ "\.validate": "newData\.isBoolean\(\)" \}/);
    assert.match(blok, /"selvgodkendt": \{ "\.validate": "newData\.isBoolean\(\)" \}/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMEN OG KLIENTEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Skærmen siger hvad den gør og ikke gør", () => {
  /**
   * ⚠ FAKTURAGODKENDELSEN ER GEMT, IKKE HÅNDHÆVET — OG DET STÅR PÅ SKÆRMEN.
   * `fakturaer/` er `.write: false`, og der findes ingen funktion der skriver
   * den. En kontakt man kunne slå til, ville love noget systemet ikke holder.
   */
  test("⚠ FAKTURAREGLEN ER LÅST, MED SIN GRUND", () => {
    assert.match(SKAERM, /Reglen er ikke bygget endnu/);
    assert.match(SKAERM, /aktiv=\{false\} disabled/,
      "kontakten til fakturagodkendelse kan slås til uden at nogen håndhæver den");
  });

  /* ⚠ TOM STRENG ER IKKE NUL. `Number("")` er 0, og en grænse på 0 kr. betyder
     at ALT skal godkendes — det stik modsatte af "feltet er ikke udfyldt". */
  test("⚠ EN TØM BELØBSGRÆNSE BLIVER null, IKKE 0", () => {
    assert.match(SKAERM, /v === "" \? null : Math\.round\(Number\(v\) \* 100\)/);
  });

  /* ⚠ "GODKENDT AUTOMATISK" ER IKKE "GODKENDT". */
  test("⚠ SKÆRMEN SKILLER AUTOMATISK FRA MENNESKELIG GODKENDELSE", () => {
    assert.match(SKAERM, /godkendtAutomatisk/);
    assert.match(SKAERM, /selvgodkendt/);
  });

  /* ⚠ EN AFVISNING ER ET SVAR, ikke en nedbrudt forbindelse. */
  test("⚠ KLIENTEN SKELNER DE TRE SLAGS AFVISNING", () => {
    assert.match(KLIENT, /permission-denied/);
    assert.match(KLIENT, /failed-precondition/);
    assert.match(KLIENT, /invalid-argument/);
    assert.ok(!/throw/.test(KLIENT), "klienten kaster — en afvisning er et svar");
  });

  /* Skærmen læser noden; demo-sættene er en FALDBAKKE. */
  test("⚠ DEMO-SÆTTENE BRUGES KUN SOM demo:-FALDBAKKE", () => {
    for (const navn of ["DEMO_INDKOEBSORDRER", "DEMO_LEVERANDOERER", "DEMO_GODKENDELSESREGLER"]) {
      const alle = [...SKAERM.matchAll(new RegExp(`\\b${navn}\\b`, "g"))].length;
      const fald = [...SKAERM.matchAll(new RegExp(`demo: ${navn}\\b`, "g"))].length;
      assert.equal(alle - 1, fald, `${navn} bruges uden for demo:-faldbakken`);
    }
    /* Regelsættet står i et objekt fordi noden SELV er en post. */
    /* ⚠ NODEN ER SELV EN POST — sættet ER svaret, ikke et opslag i det. */
    assert.match(SKAERM, /demo: DEMO_GODKENDELSESREGLER/);
  });

  /* ⚠ KONTAKTEN ER EN RIGTIG CHECKBOX. Et div med onClick kan ikke nås med
     Tab, har ingen tilstand at læse op og reagerer ikke på mellemrum. */
  test("⚠ KONTAKTEN KAN BRUGES MED TASTATUR", () => {
    assert.match(SKAERM, /<input type="checkbox"[\s\S]{0,200}aria-label=\{label\}/);
  });

  test("⚠ BLOKERER IKKE PÅ EN TOM NODE", () => {
    assert.match(SKAERM, /blokerer\(ordrer\.tilstand\)/);
  });
});
