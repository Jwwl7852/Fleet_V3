/* test/bestilling.test.mjs
 * Bestillingskladden — beslutning 81, trin 2 i Procures proces.
 *
 * ⚠ HVAD DEN HER PRØVE HOLDER FAST I:
 *
 *   1. Et forslag uden grundlag er et GÆT. `foreslaaLeverandoer()` svarer
 *      `null` når ingen har leveret varen — ikke den billigste i kartoteket
 *      og ikke den man handlede med sidst. Falder den regel, får den der
 *      bestiller en anbefaling systemet ikke har dækning for.
 *   2. Linjerne er NØGLET, ikke en array. Et demo-sæt med en array ville lade
 *      skærmen virke i demo og fejle mod noden — beslutning 76's fælde igen,
 *      denne gang med penge på.
 *   3. Beløbet REGNES, det gemmes ikke. Et gemt totalbeløb driver fra sine
 *      linjer første gang nogen retter et antal.
 *   4. Mailen SENDES IKKE, og skærmen siger det. En "send"-knap uden en
 *      afsendelsesvej er værre end ingen knap.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  foreslaaLeverandoer, kladdelinjer, grupperPaaLeverandoer, mailudkast,
  ordreSumOere, linjeListe, valideOrdre, ORDRENUMMER,
} from "../src/fleet/procure.js";
import { DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER } from "../src/fleet/demo-procure.js";
import { DEMO_INDKOEBSLINJER, DEMO_LEVERANDOERER } from "../src/fleet/demo-indkoeb.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SKAERM = udenKommentarer(readFileSync("src/moduler/indkoeb/Bestillinger.jsx", "utf8"));
const KLIENT = udenKommentarer(readFileSync("src/fleet/bestilling.js", "utf8"));
const SERVER = udenKommentarer(readFileSync("functions/index.js", "utf8"));

/**
 * Kroppen af én Cloud Function.
 *
 * ⚠ MÅLT PÅ FUNKTIONEN, IKKE PÅ EN FAST MÆNGDE TEGN. Første udgave tog 8000
 * tegn efter `export const ordreskriv` og talte to `.update(` — den ene lå i
 * DEN NÆSTE funktion. En prøve der læser ind i naboen, siger noget om naboen.
 */
function funktion(navn) {
  const start = SERVER.indexOf(`export const ${navn} =`);
  if (start < 0) throw new Error(`${navn} findes ikke i functions/index.js`);
  const slut = SERVER.indexOf("\nexport const ", start + 1);
  return SERVER.slice(start, slut < 0 ? SERVER.length : slut);
}

/* ══════════════════════════════════════════════════════════════════════════
   LEVERANDØRFORSLAGET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Forslaget slår op — det gætter ikke", () => {
  const HISTORIK = [
    { vare: "Motorolie 5W30", varenummer: "OLIE-5W30", leverandoerId: "lv-a",
      prisPrEnhedOere: 4200, enhed: "l", dato: 1000 },
    { vare: "Motorolie 5W-30", varenummer: "OLIE-5W30", leverandoerId: "lv-b",
      prisPrEnhedOere: 4600, enhed: "l", dato: 2000 },
    { vare: "Kabelbinder 300 mm", leverandoerId: "lv-c",
      prisPrEnhedOere: 1900, enhed: "pk", dato: 500 },
  ];

  /**
   * ⚠ SENEST, IKKE BILLIGST. En pris fra 2019 er ikke et tilbud — den er et
   * historisk tal, og en bestilling lagt på den bliver afvist eller
   * faktureret til noget andet. Vendte vi det om, ville forslaget se
   * *klogere* ud og være ubrugeligt.
   */
  test("⚠ FORESLÅR DEN SENESTE, IKKE DEN BILLIGSTE", () => {
    const f = foreslaaLeverandoer("Motorolie 5W30", HISTORIK, { varenummer: "OLIE-5W30" });
    assert.equal(f.leverandoerId, "lv-b");
    assert.equal(f.prisPrEnhedOere, 4600);
  });

  /**
   * ⚠ VARENUMMERET VINDER OVER NAVNET. "Motorolie 5W-30" og "Motorolie 5W30"
   * er én vare for et menneske og to for en maskine. Uden nummeret som nøgle
   * ville de to linjer ovenfor blive to forskellige varer — Bil 104 med to
   * nummerplader, denne gang på en oliedunk.
   */
  test("⚠ VARENUMMERET SLÅR NAVNET, og grundlaget siger hvilket", () => {
    const paaNummer = foreslaaLeverandoer("Olie", HISTORIK, { varenummer: "OLIE-5W30" });
    assert.equal(paaNummer.grundlag, "varenummer");
    assert.equal(paaNummer.antalTidligere, 2, "nummeret samlede ikke de to stavemåder");

    const paaNavn = foreslaaLeverandoer("Kabelbinder 300 mm", HISTORIK);
    assert.equal(paaNavn.grundlag, "navn");
    assert.equal(paaNavn.leverandoerId, "lv-c");
  });

  /* Navnet normaliseres, men KUN på navnet — et varenummer er en nøgle. */
  test("navnet matcher trods komma, punktum og dobbelt mellemrum", () => {
    const f = foreslaaLeverandoer("kabelbinder  300 mm.", HISTORIK);
    assert.ok(f, "en harmløs stavevariant gav intet forslag");
    assert.equal(f.leverandoerId, "lv-c");
  });

  /**
   * ⚠ INTET TRÆF ER ET SVAR. Planchen har en egen tilstand for det —
   * "Leverandør mangler" — og den findes fordi svaret findes. Faldt den
   * tilbage på "den vi handler mest med", ville systemet anbefale nogen at
   * købe hos et firma der aldrig har haft varen.
   */
  test("⚠ INTET TRÆF GIVER null — IKKE EN TILFÆLDIG LEVERANDØR", () => {
    assert.equal(foreslaaLeverandoer("Hejsevogn", HISTORIK), null);
    assert.equal(foreslaaLeverandoer("Motorolie 5W30", []), null);
    assert.equal(foreslaaLeverandoer("", HISTORIK), null);
  });

  /* En linje uden leverandør er ikke et halvt forslag — den er intet. */
  test("en historisk linje uden leverandør giver intet forslag", () => {
    const f = foreslaaLeverandoer("Skruer", [
      { vare: "Skruer", prisPrEnhedOere: 100, dato: 9 },
    ]);
    assert.equal(f, null);
  });
});

describe("Kladden samler på leverandøren", () => {
  /**
   * ⚠ ET BEHOV UDEN FORSLAG FALDER IKKE UD AF LISTEN. Skjulte vi det, ville
   * en mangel forsvinde præcis fordi den er en mangel — og den der bestiller,
   * ville tro at alt var dækket.
   */
  test("⚠ HVERT ÅBENT BEHOV FÅR EN LINJE, også dem uden forslag", () => {
    const aabne = DEMO_INDKOEBSBEHOV.filter(
      (b) => b.status !== "bestilt" && b.status !== "afvist");
    const linjer = kladdelinjer(aabne, DEMO_INDKOEBSLINJER);
    assert.equal(linjer.length, aabne.length);
    assert.ok(linjer.some((l) => l.forslag === null),
      "hvert behov fik et forslag — så kan skærmen ikke vise 'Leverandør mangler'");
    assert.ok(linjer.some((l) => l.forslag),
      "intet behov fik et forslag — så kan opslaget ikke ses virke");
  });

  /**
   * ⚠ BEGGE GRUNDLAG SKAL VÆRE DER. Et varenummertræf er stærkt; et navnetræf
   * kan være to forskellige varer med samme ord, og skærmen skriver hvilket
   * det er. Findes kun det ene i sættet, kan den forskel ikke ses — og den
   * advarsel man aldrig ser, er den man ikke tror på når den kommer.
   */
  test("⚠ BÅDE ET VARENUMMERTRÆF OG ET NAVNETRÆF I DEMO", () => {
    const linjer = kladdelinjer(
      DEMO_INDKOEBSBEHOV.filter((b) => b.status !== "bestilt" && b.status !== "afvist"),
      DEMO_INDKOEBSLINJER);
    const grundlag = new Set(linjer.map((l) => l.forslag?.grundlag).filter(Boolean));
    assert.ok(grundlag.has("varenummer"), "intet varenummertræf i demo");
    assert.ok(grundlag.has("navn"), "intet navnetræf i demo");
  });

  /**
   * ⚠ ET FORSLAG ER IKKE NOK TIL AT BESTILLE. Et behov må gerne komme ind
   * uden antal — den der melder ind, ved hvad han mangler, ikke hvor meget der
   * er i en pakke — men bestillingen kan ikke sendes før nogen har sat det.
   * Uden et eksempel ser skærmen ud som om et forslag altid rækker.
   */
  test("⚠ ET BEHOV MED FORSLAG OG UDEN ANTAL FINDES I DEMO", () => {
    const linjer = kladdelinjer(
      DEMO_INDKOEBSBEHOV.filter((b) => b.status !== "bestilt" && b.status !== "afvist"),
      DEMO_INDKOEBSLINJER);
    assert.ok(linjer.some((l) => l.forslag && l.behov.antal === undefined),
      "hvert behov med et forslag har også et antal — tilstanden 'Sæt et antal' kan ikke ses");
  });

  /**
   * ⚠ ÉN ORDRE PR. LEVERANDØR. Man sender ikke én bestilling til tre firmaer,
   * og et bestillingsnummer der dækkede flere, kunne ikke bruges som
   * reference på nogen af fakturaerne.
   */
  test("⚠ ÉN GRUPPE PR. LEVERANDØR, og de uden forslag under null", () => {
    const grupper = grupperPaaLeverandoer([
      { behov: { id: "a" }, forslag: { leverandoerId: "lv-a" } },
      { behov: { id: "b" }, forslag: { leverandoerId: "lv-b" } },
      { behov: { id: "c" }, forslag: { leverandoerId: "lv-a" } },
      { behov: { id: "d" }, forslag: null },
    ]);
    assert.equal(grupper.length, 3);
    assert.equal(grupper.find((g) => g.leverandoerId === "lv-a").linjer.length, 2);
    assert.equal(grupper.find((g) => g.leverandoerId === null).linjer.length, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ORDREN OG DENS FORM
   ══════════════════════════════════════════════════════════════════════════ */
describe("Demo-ordrerne kan gemmes", () => {
  test("⚠ HVER ORDRE ER GYLDIG", () => {
    for (const o of DEMO_INDKOEBSORDRER) {
      const r = valideOrdre(o);
      assert.equal(r.ok, true,
        `${o.id}: ${Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")}`);
    }
  });

  /**
   * ⚠ LINJERNE ER NØGLET, IKKE EN ARRAY. RTDB har ingen arrays. Et demo-sæt
   * med en array ville lade skærmen virke i demo og fejle mod noden — præcis
   * den forskel der lukkede tre etapeovergange i produktion mens demo stod
   * grønt (beslutning 76).
   */
  test("⚠ LINJERNE ER ET NØGLET OBJEKT — IKKE EN ARRAY", () => {
    for (const o of DEMO_INDKOEBSORDRER) {
      assert.ok(!Array.isArray(o.linjer),
        `${o.id} bærer linjerne som en array — noden har ingen arrays`);
      assert.ok(linjeListe(o).length > 0, `${o.id} har ingen linjer`);
    }
  });

  test("nummeret har seriens form", () => {
    for (const o of DEMO_INDKOEBSORDRER) {
      assert.match(o.nummer, ORDRENUMMER, `${o.id} har et nummer uden for serien`);
    }
    const numre = DEMO_INDKOEBSORDRER.map((o) => o.nummer);
    assert.equal(new Set(numre).size, numre.length, "to ordrer deler nummer");
  });

  /**
   * ⚠ SPORET GÅR BEGGE VEJE. Et behov der peger på en ordre der ikke findes —
   * eller en linje der peger på et behov som stadig står åbent — er den samme
   * kendsgerning skrevet to steder, uenigt. Her koster det en vare bestilt to
   * gange.
   */
  test("⚠ BEHOV OG ORDRE PEGER PÅ HINANDEN", () => {
    const ordreIder = new Set(DEMO_INDKOEBSORDRER.map((o) => o.id));
    const behov = new Map(DEMO_INDKOEBSBEHOV.map((b) => [b.id, b]));

    for (const b of DEMO_INDKOEBSBEHOV.filter((x) => x.status === "bestilt")) {
      assert.ok(ordreIder.has(b.ordreId),
        `${b.id} er bestilt på "${b.ordreId}", som ikke findes`);
    }
    for (const o of DEMO_INDKOEBSORDRER) {
      for (const l of linjeListe(o)) {
        if (!l.behovId) continue;
        const b = behov.get(l.behovId);
        assert.ok(b, `${o.id}/${l.id} peger på behovet "${l.behovId}", som ikke findes`);
        assert.equal(b.status, "bestilt",
          `${o.id}/${l.id} bestiller ${l.behovId}, men behovet står som "${b.status}"`);
        assert.equal(b.ordreId, o.id, `${l.behovId} peger på ${b.ordreId}, ikke ${o.id}`);
      }
    }
  });

  /* ⚠ BÅDE EN KLADDE OG EN SENDT. Udkastpanelet viser kun kladder; uden begge
     kan filteret ikke ses virke. */
  test("⚠ MINDST ÉN KLADDE OG ÉN SENDT", () => {
    const t = new Set(DEMO_INDKOEBSORDRER.map((o) => o.status));
    assert.ok(t.has("kladde") && t.has("sendt"),
      "alle ordrer står i samme tilstand — udkastfilteret kan ikke ses virke");
  });

  /**
   * ⚠ BELØBET REGNES, DET GEMMES IKKE. Et gemt totalbeløb driver fra sine
   * linjer første gang nogen retter et antal — det er `bemanding.ledig`
   * (beslutning 71), og her er tallet penge.
   */
  test("⚠ INGEN ORDRE BÆRER ET GEMT TOTALBELØB", () => {
    for (const o of DEMO_INDKOEBSORDRER) {
      for (const felt of ["sum", "sumOere", "totalOere", "beloebOere"]) {
        assert.equal(o[felt], undefined, `${o.id} bærer et gemt ${felt}`);
      }
    }
    const o = DEMO_INDKOEBSORDRER.find((x) => linjeListe(x).length > 1);
    const facit = linjeListe(o).reduce((s, l) => s + l.antal * l.prisPrEnhedOere, 0);
    assert.equal(ordreSumOere(o), facit);
  });

  /* En linje uden pris må ikke tælle som nul — så ville summen se hel ud. */
  test("⚠ EN LINJE UDEN PRIS TÆLLER IKKE MED", () => {
    const sum = ordreSumOere({
      linjer: { a: { vare: "x", antal: 2, prisPrEnhedOere: 500 },
                b: { vare: "y", antal: 3 } },
    });
    assert.equal(sum, 1000);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   E-MAILUDKASTET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Udkastet er et udkast", () => {
  const ORDRE = DEMO_INDKOEBSORDRER[0];
  const LEV = DEMO_LEVERANDOERER.find((l) => l.id === ORDRE.leverandoerId);

  /**
   * ⚠ NUMMERET I EMNET ER HELE GRUNDEN TIL AT NUMMERET FINDES. Uden det på
   * fakturaen kan matchet i trin 5 kun gættes ud fra beløb og leverandør — og
   * to bestillinger til samme firma i samme uge ser så ens ud.
   */
  test("⚠ NUMMERET STÅR I EMNET OG I TEKSTEN", () => {
    const u = mailudkast(ORDRE, { leverandoer: LEV });
    assert.ok(u.emne.includes(ORDRE.nummer), "emnet bærer ikke bestillingsnummeret");
    assert.match(u.brodtekst, new RegExp(`Angiv venligst bestillingsnummer ${ORDRE.nummer}`),
      "teksten beder ikke om nummeret på fakturaen");
  });

  test("hver linje står i teksten med antal og vare", () => {
    const u = mailudkast(ORDRE, { leverandoer: LEV });
    for (const l of linjeListe(ORDRE)) {
      assert.ok(u.brodtekst.includes(l.vare), `"${l.vare}" står ikke i udkastet`);
    }
  });

  /**
   * ⚠ INGEN PRIS UDEN GRUNDLAG. En linje uden pris skriver "—", ikke 0: en
   * bestilling der beder om noget til nul kroner, er en aftale ingen har
   * indgået.
   */
  test("⚠ EN LINJE UDEN PRIS SKRIVER IKKE 0,00", () => {
    const u = mailudkast({
      nummer: "BST-2026-00099",
      linjer: { a: { vare: "Presenning", antal: 2, enhed: "stk" } },
    }, {});
    assert.match(u.brodtekst, /pris ikke oplyst/);
    assert.ok(!/0,00 kr\./.test(u.brodtekst), "en manglende pris blev til nul kroner");
  });

  /* Modtageren kan mangle, og så er svaret null — ikke en tom streng der
     ligner en adresse. */
  test("en leverandør uden mailadresse giver tilEmail: null", () => {
    assert.equal(mailudkast(ORDRE, { leverandoer: { navn: "X" } }).tilEmail, null);
    assert.equal(mailudkast(ORDRE, {}).tilEmail, null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMEN, KLIENTEN OG SERVEREN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Skærmen viser, serveren håndhæver", () => {
  /**
   * ⚠ LINJERNE BYGGES AF BEHOVENE PÅ SERVEREN. Kom varen og antallet udefra,
   * kunne ordren bede om noget andet end behovet sagde — og sporet tilbage
   * ville pege på et løfte der ikke blev holdt. Klienten sender ID'er.
   */
  test("⚠ KLIENTEN SENDER behovId, IKKE vare", () => {
    assert.match(KLIENT, /behovId: l\.behovId,/);
    assert.ok(!/vare:/.test(KLIENT), "klienten sender varen — den skal komme fra behovet");
    assert.match(SERVER, /linje = behovTilLinje\(/,
      "serveren bygger ikke linjen af behovet");
  });

  /* ⚠ ET BEHOV KAN KUN BESTILLES ÉN GANG. Uden det led kunne to bestillinger
     lagt kort efter hinanden begge tage det samme behov med. */
  test("⚠ SERVEREN AFVISER ET BEHOV DER ALLEREDE ER BESTILT", () => {
    const blok = funktion("ordreskriv");
    assert.match(blok, /behov\.status === "bestilt"/);
    assert.match(blok, /behov\.status === "afvist"/);
    assert.match(blok, /failed-precondition/);
  });

  /**
   * ⚠ ORDREN OG BEHOVENES TILSTAND I ÉN update(). Delte vi skrivningen i to,
   * kunne halvdelen lande — og et behov der stod som bestilt uden en ordre,
   * ville være en vare ingen havde købt og ingen kunne bestille. Samme regel
   * som `enheder`/`beholdning` (beslutning 39).
   */
  test("⚠ ORDRE OG BEHOV SKRIVES I ÉN update()", () => {
    const blok = funktion("ordreskriv");
    assert.match(blok, /await db\.ref\(\)\.update\(opdatering\);/);
    assert.equal((blok.match(/\.update\(|\.set\(|\.push\([^)]/g) || []).length, 1,
      "der er mere end én skrivning i ordreskriv — halvdelen kan lande");
  });

  /* ⚠ NUMMERET KOMMER FRA TÆLLEREN, ikke fra klienten. Beslutning 8. */
  test("⚠ NUMMERET KOMMER FRA naesteNummer()", () => {
    assert.match(SERVER, /const nummer = await naesteNummer\(db, sti, \{/);
    assert.ok(!/nummer:/.test(KLIENT), "klienten sender et nummer — tælleren bliver pynt");
  });

  /* ⚠ TILSTANDEN ER `kladde`. Mailen sendes ikke af systemet, så "sendt" er
     noget et menneske sætter når han HAR sendt den. */
  test("⚠ EN NY ORDRE ER EN KLADDE, ALDRIG sendt", () => {
    const blok = funktion("ordreskriv");
    assert.match(blok, /status: "kladde",/);
    assert.ok(!/status: "sendt"/.test(blok),
      "serveren påstår at mailen er sendt — den sender ingenting");
  });

  test("⚠ FUNKTIONEN KRÆVER indkoeb.skriv", () => {
    const blok = funktion("ordreskriv");
    assert.match(blok, /perms\.includes\("\|indkoeb\.skriv\|"\)/);
    assert.match(blok, /moduler\.child\("indkoeb"\)\.val\(\) !== true/);
    assert.match(blok, /abonnement\/status/);
  });

  /**
   * ⚠ EN AFVISNING ER ET SVAR, IKKE EN NEDBRUDT FORBINDELSE. "Varen er
   * allerede bestilt" er en kendsgerning om VERDEN; "prisen er ikke hele øre"
   * er en kendsgerning om det brugeren skrev. Slås de sammen til "prøv igen",
   * lærer brugeren at systemet er i stykker.
   */
  test("⚠ KLIENTEN SKELNER failed-precondition FRA invalid-argument", () => {
    assert.match(KLIENT, /failed-precondition/);
    assert.match(KLIENT, /invalid-argument/);
    assert.match(KLIENT, /permission-denied/);
    assert.ok(!/throw/.test(KLIENT), "klienten kaster — en afvisning er et svar");
  });
});

describe("Skærmen siger hvad den ikke gør", () => {
  /**
   * ⚠ INGEN "SEND"-KNAP PÅ EN KLADDE — SKIVE 4D. Kladden vises FØR
   * godkendelse, og kan derfor ikke sende (ordreMailSend kræver status
   * "godkendt") — en knap der så ud som send, men ikke kunne bruges på en
   * kladde, ville være en fælde. Den rigtige afsendelse (Send ordre) findes
   * LÆNGERE NEDE på DENNE SAMME skærm nu (Procure TARGET slog Bestillinger,
   * Behov og Godkendelser sammen til én arbejdsflade), på en godkendt
   * ordre — så prøven er afgrænset til selve e-mailudkast-sektionen, ikke
   * hele filen.
   */
  test("⚠ DER ER INGEN SEND-KNAP PÅ EN KLADDE, OG DET STÅR PÅ SKÆRMEN", () => {
    assert.match(SKAERM, /sender den ikke herfra/,
      "skærmen lover ikke noget, men siger heller ikke hvad den ikke gør");
    assert.match(SKAERM, /godkendelseskøen nedenfor/,
      "skærmen peger på hvor den rigtige afsendelse rent faktisk sker");
    const start = SKAERM.indexOf("E-mailudkast");
    const slut = SKAERM.indexOf("Afventer godkendelse (", start);
    const udkastSektion = SKAERM.slice(start, slut < 0 ? start + 2000 : slut);
    assert.ok(!/>\s*Send\b/.test(udkastSektion),
      "der er en Send-knap i e-mailudkastet — en kladde kan ikke sendes");
  });

  /* ⚠ ET BESTILT BEHOV KAN IKKE BESTILLES IGEN FRA SKÆRMEN. Serveren afviser
     det, men en knap der altid afvises, er en fælde. */
  test("⚠ KUN ÅBNE BEHOV KOMMER I KLADDEN", () => {
    assert.match(SKAERM,
      /b\.status !== "bestilt" && b\.status !== "afvist"/,
      "et bestilt eller afvist behov kan lægges i kladden igen");
  });

  /**
   * ⚠ EN TOM STRENG ER IKKE NUL. `Number("")` er 0, og "0 stk." ville blive
   * sendt som et svar. Samme fælde som i Behov.jsx.
   */
  test("⚠ ET TØMT ANTALSFELT BLIVER null, IKKE 0", () => {
    assert.match(SKAERM, /e\.target\.value === "" \? null : Number\(e\.target\.value\)/);
  });

  /**
   * ⚠ `??` OG IKKE `||`. Et antal på 0 er ikke "ikke sat" — `||` ville
   * erstatte det med behovets eget tal, og et ugyldigt antal ville blive
   * rettet i tavshed til et gyldigt.
   */
  test("⚠ ANTALLET LÆSES MED ??, IKKE ||", () => {
    assert.match(SKAERM, /antal\[l\.behov\.id\] \?\? l\.behov\.antal \?\? null/);
  });

  /* Nøgletallene må ikke lade en manglende pris se ud som nul kroner. */
  test("⚠ EN MANGLENDE PRIS SIGES I NOTEN UNDER BELØBET", () => {
    assert.match(SKAERM, /uden kendt pris — beløbet er et minimum/);
  });

  /* Skærmen læser noden; demo-sættet er en FALDBAKKE, ikke en kilde. */
  test("⚠ DEMO-SÆTTENE BRUGES KUN SOM demo:-FALDBAKKE", () => {
    for (const navn of ["DEMO_INDKOEBSBEHOV", "DEMO_INDKOEBSORDRER",
      "DEMO_INDKOEBSLINJER", "DEMO_LEVERANDOERER"]) {
      const alle = [...SKAERM.matchAll(new RegExp(`\\b${navn}\\b`, "g"))].length;
      const faldbakke = [...SKAERM.matchAll(new RegExp(`demo: ${navn}\\b`, "g"))].length;
      assert.equal(alle - 1, faldbakke, `${navn} bruges uden for demo:-faldbakken`);
    }
  });

  /* ⚠ BLOKERER KUN PÅ DET DER BLOKERER — beslutning 73. En tom node er et
     svar, ikke en fejl. */
  test("⚠ BLOKERER IKKE PÅ EN TOM NODE", () => {
    assert.match(SKAERM, /blokerer\(behov\.tilstand\)/);
    assert.ok(!/if \(!\w+\.data\.length\) return/.test(SKAERM));
  });
});
