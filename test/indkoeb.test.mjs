/* test/indkoeb.test.mjs
 * Leverandøren som entitet, og de tre fejl fra Indkøb-mockupsene.
 *
 * Ingen emulator.
 *
 * Alle tre fejl er af samme slags: et tal skrevet ved siden af de data det
 * skulle beskrive. Testene fastholder at tallene BEREGNES af det der vises.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  LEVERANDOER_KATEGORI, AFTALETYPE, FAKTURASTATUS,
  afstem, fakturaTotalOere, kanGodkende, leverandoerNavn, parterFraLeverandoer,
  PERM_GODKEND, mestKoebteVarer, snitprisPrMaaned, indkoebBeloebOere,
} from "../src/fleet/leverandoerer.js";
import {
  DEMO_LEVERANDOERER, DEMO_INDKOEBSLINJER, DEMO_FAKTURAER, DEMO_AFSTEMNING,
  demoAfstemning, demoUdenMatch, demoLeverandoer,
} from "../src/fleet/demo-indkoeb.js";
import { DEMO_BESOEG } from "../src/fleet/demo-vaerksted.js";
import { DEMO_SERVICEBESOEG } from "../src/fleet/demo-facility.js";
import { demoSag } from "../src/fleet/demo-sag.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { vurderAfsender, AFSENDER_STATUS } from "../src/fleet/sager.js";

/* ══════════════════════════════════════════════════════════════════════
   FEJL 1: "9.842.250 − 9.781.625 = 9.765.125" er ikke en subtraktion
   ══════════════════════════════════════════════════════════════════════ */
describe("Fejl 1 — tre uafhængige totaler, to navngivne afvigelser", () => {
  const a = demoAfstemning();

  it("rammer mockuppens afvigelse: 16.500 kr ikke bogført", () => {
    assert.equal(a.ikkeBogfoertOere, 1650000);
    assert.equal(a.modtagneFakturaerOere - a.bogfoertOere, a.ikkeBogfoertOere);
  });

  it("giver den anden afvigelse sit eget navn og tal", () => {
    assert.equal(a.manglendeFakturaerOere, 6062500);
    assert.equal(a.registreredeIndkoebOere - a.modtagneFakturaerOere, a.manglendeFakturaerOere);
  });

  /* De to er forskellige tal og kræver hver sin handling. Ét felt der hed
     "afvigelse" ville blive læst som ét. */
  it("holder de to afvigelser adskilt", () => {
    assert.notEqual(a.manglendeFakturaerOere, a.ikkeBogfoertOere);
  });

  /* Bogført er regnskabets egen opgørelse. Var den afledt, ville
     afstemningen altid gå op, og der var intet at afstemme. */
  it("udleder ikke bogført af de to andre", () => {
    const b = afstem({
      registreredeIndkoebOere: 1000, modtagneFakturaerOere: 900, bogfoertOere: 700,
    });
    assert.equal(b.bogfoertOere, 700);
    assert.equal(b.manglendeFakturaerOere, 100);
    assert.equal(b.ikkeBogfoertOere, 200);
  });

  it("gemmer ingen afvigelse i demo-data", () => {
    for (const felt of ["manglendeFakturaerOere", "ikkeBogfoertOere", "afvigelseOere"]) {
      assert.equal(felt in DEMO_AFSTEMNING, false, `${felt} er gemt og kan drive`);
    }
  });

  it("har begge afvigelser positive, så begge handlinger kan vises", () => {
    assert.ok(a.manglendeFakturaerOere > 0);
    assert.ok(a.ikkeBogfoertOere > 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   FEJL 2: KPI sagde 8, tabellen 16
   ══════════════════════════════════════════════════════════════════════ */
describe("Fejl 2 — antallet beregnes af listen", () => {
  it("tæller manglende match af fakturalisten", () => {
    const forventet = DEMO_FAKTURAER.filter((f) => !f.indkoebId && f.status !== "afvist").length;
    assert.equal(demoUdenMatch().length, forventet);
    assert.ok(forventet > 0, "uden en faktura uden match kan tallet ikke ses virke");
  });

  /* Et afledt tal hører ikke i kpi/ — samme sag som bemanding.ledig og
     aktive klimaalarmer. */
  it("gemmer ikke det afledte tal i kpi/", () => {
    assert.equal(DEMO_KPI.indkoeb.manglendeMatch, undefined);
    assert.equal(DEMO_KPI.indkoeb.afstemningsafvigelser, undefined);
  });

  /* Skelettet hardkodede 21 mens kpi sagde 7 — og Dashboard viser kpi'ens tal. */
  it("har fakturaerTilGodkendelse i kpi/, så to skærme ikke siger hver sit", () => {
    assert.ok(Number.isFinite(DEMO_KPI.indkoeb.fakturaerTilGodkendelse));
  });

  it("har de øvrige Indkøb-felter defineret frem for hardkodet", () => {
    for (const felt of ["varerTilGodkendelse", "manglerFaktura", "godkendtDenneMaaned",
                        "maanedensForbrugOere", "aabneOrdrer"]) {
      assert.ok(Number.isFinite(DEMO_KPI.indkoeb[felt]), `indkoeb.${felt} mangler`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   FEJL 3: beløb inkl. moms i ét felt
   ══════════════════════════════════════════════════════════════════════ */
describe("Fejl 3 — ekskl. moms plus momsOere, aldrig ét felt", () => {
  it("holder beløb og moms adskilt på hver faktura", () => {
    for (const f of DEMO_FAKTURAER) {
      assert.ok(Number.isInteger(f.beloebOere), `${f.id}: beloebOere ikke hele øre`);
      assert.ok(Number.isInteger(f.momsOere), `${f.id}: momsOere ikke hele øre`);
      assert.equal("totalOere" in f, false, `${f.id} har en gemt total`);
      assert.equal("beloebInklMoms" in f, false);
    }
  });

  it("beregner totalen", () => {
    for (const f of DEMO_FAKTURAER) {
      assert.equal(fakturaTotalOere(f), f.beloebOere + f.momsOere);
    }
    assert.equal(fakturaTotalOere(null), 0);
  });

  /* 25 % dansk moms. Fanger et beløb hvor inkl.-tallet er endt i beloebOere. */
  it("har moms der er 25 % af beløbet", () => {
    for (const f of DEMO_FAKTURAER) {
      assert.equal(f.momsOere, Math.round(f.beloebOere * 0.25), `${f.id}: moms passer ikke`);
    }
  });

  /* Mockuppens 18,50 kr/stk er 1850 øre, ikke 18.5. */
  it("gemmer enhedspriser som hele øre", () => {
    for (const l of DEMO_INDKOEBSLINJER) {
      assert.ok(Number.isInteger(l.prisPrEnhedOere), `${l.id}: pris ikke hele øre`);
      assert.ok(l.prisPrEnhedOere >= 0);
    }
    const hydra = DEMO_INDKOEBSLINJER.find((l) => l.prisPrEnhedOere === 1850);
    assert.ok(hydra, "mockuppens 18,50 kr/stk skal stå som 1850 i demo-sættet");
  });

  it("beregner linjens beløb af antal × pris", () => {
    for (const l of DEMO_INDKOEBSLINJER) {
      assert.equal(indkoebBeloebOere(l), l.antal * l.prisPrEnhedOere);
      assert.equal("beloebOere" in l, false, `${l.id} har et gemt beløb`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Leverandøren som entitet
   ══════════════════════════════════════════════════════════════════════ */
describe("Leverandøren er en entitet", () => {
  const ider = new Set(DEMO_LEVERANDOERER.map((l) => l.id));

  it("bruger kendte kategorier og aftaletyper", () => {
    for (const l of DEMO_LEVERANDOERER) {
      assert.ok(LEVERANDOER_KATEGORI[l.kategori], `${l.id}: ukendt kategori`);
      assert.ok(AFTALETYPE[l.aftale?.type], `${l.id}: ukendt aftaletype`);
    }
  });

  /* Division BESKRIVER LEVERANDØRENS FORRETNING — modsat personale og
     køretøjer, hvor den ville beskrive vores organisation (beslutning 19). */
  it("slår navnet op og fejler synligt på et ukendt id", () => {
    assert.equal(leverandoerNavn(DEMO_LEVERANDOERER, "lv-mercedes"), "Mercedes Greve");
    assert.match(leverandoerNavn(DEMO_LEVERANDOERER, "lv-findes-ikke"), /ukendt leverandør/);
  });

  /* Det var Bil 104 med to nummerplader. Nu peger alt på et id. */
  it("er kilden for værkstedsbesøg, servicebesøg, indkøb og fakturaer", () => {
    for (const b of DEMO_BESOEG) {
      assert.ok(ider.has(b.leverandoerId), `værkstedsbesøg ${b.id}: ukendt leverandør`);
    }
    for (const b of DEMO_SERVICEBESOEG) {
      assert.ok(ider.has(b.leverandoerId), `servicebesøg ${b.id}: ukendt leverandør`);
    }
    for (const l of DEMO_INDKOEBSLINJER) {
      assert.ok(ider.has(l.leverandoerId), `linje ${l.id}: ukendt leverandør`);
    }
    for (const f of DEMO_FAKTURAER) {
      assert.ok(ider.has(f.leverandoerId), `faktura ${f.id}: ukendt leverandør`);
    }
  });

  it("efterlader ingen fritekst-leverandør i demo-data", () => {
    for (const b of DEMO_BESOEG) {
      assert.equal("vaerksted" in b, false, `${b.id} har stadig en fritekststreng`);
    }
    for (const b of DEMO_SERVICEBESOEG) {
      assert.equal("leverandoer" in b, false, `${b.id} har stadig en fritekststreng`);
    }
  });

  it("har unikke id'er og CVR-numre", () => {
    assert.equal(ider.size, DEMO_LEVERANDOERER.length);
    const cvr = DEMO_LEVERANDOERER.map((l) => l.cvr);
    assert.equal(new Set(cvr).size, cvr.length);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Koblingen til beslutning 20
   ══════════════════════════════════════════════════════════════════════ */
describe("Leverandørens e-mail er sagens udgangspunkt", () => {
  it("giver hver leverandør mindst én kontaktadresse", () => {
    for (const l of DEMO_LEVERANDOERER) {
      assert.ok(parterFraLeverandoer(l).length > 0, `${l.id} har ingen kontakt`);
    }
  });

  it("normaliserer som vurderAfsender gør", () => {
    const parter = parterFraLeverandoer({ kontaktEmail: "  Service@Mercedes-Greve.DK " });
    assert.deepEqual(parter, ["service@mercedes-greve.dk"]);
  });

  /* Startlisten skal faktisk virke: en mail fra leverandøren skal vurderes
     kendt, ikke havne i karantæne. */
  it("gør leverandørens egen adresse kendt på en sag", () => {
    const lv = demoLeverandoer("lv-mercedes");
    const svar = vurderAfsender({
      envelopeAfsender: lv.kontaktEmail, dmarc: "pass",
      parter: parterFraLeverandoer(lv),
    });
    assert.equal(svar.status, AFSENDER_STATUS.kendt);
  });

  it("stemmer med den sag der allerede findes på leverandøren", () => {
    const sag = demoSag("FLT-2026-00381");
    const lv = demoLeverandoer("lv-mercedes");
    assert.equal(sag.modpartNavn, lv.navn, "sagen og kartoteket staver navnet forskelligt");
    assert.deepEqual(sag.parter, parterFraLeverandoer(lv));
  });

  it("sporer en faktura tilbage til sin sag", () => {
    const medSag = DEMO_FAKTURAER.filter((f) => f.sagsnummer);
    assert.ok(medSag.length > 0, "ingen faktura bærer et sagsnummer");
    for (const f of medSag) {
      assert.match(f.sagsnummer, /^(FLT|FAC)-\d{4}-\d{5}$/, `${f.id}: ugyldigt sagsnummer`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Godkendelsen
   ══════════════════════════════════════════════════════════════════════ */
describe("kanGodkende skelner mellem adgang og forudsætning", () => {
  const modtaget = DEMO_FAKTURAER.find((f) => f.status === "modtaget" && f.indkoebId);

  it("afviser uden permission", () => {
    const svar = kanGodkende(modtaget, false);
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /mangler adgangen/i);
  });

  it("godkender med permission og et match", () => {
    assert.equal(kanGodkende(modtaget, true).ok, true);
  });

  /* Den anden slags nej: en forudsætning, ikke en rettighed. */
  it("afviser en faktura uden match — uden at kalde det en rettighedsfejl", () => {
    const udenMatch = DEMO_FAKTURAER.find((f) => !f.indkoebId && f.status === "modtaget");
    const svar = kanGodkende(udenMatch, true);
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /ikke matchet/i);
    assert.ok(!/mangler adgangen/i.test(svar.aarsag));
  });

  it("afviser en allerede godkendt eller bogført faktura", () => {
    for (const status of ["godkendt", "bogfoert"]) {
      const f = DEMO_FAKTURAER.find((x) => x.status === status);
      if (!f) continue;
      assert.equal(kanGodkende(f, true).ok, false);
    }
  });

  it("afviser når der ikke er modtaget en faktura", () => {
    assert.equal(kanGodkende({ status: "mangler", indkoebId: "x" }, true).ok, false);
    assert.equal(kanGodkende(null, true).ok, false);
  });

  /**
   * ⚠ DEN VAR MIDLERTIDIG, OG PRØVEN HOLDT DEN FAST. Her stod
   * `assert.equal(PERM_GODKEND_MIDLERTIDIG, "indkoeb.skriv")` — altså en
   * prøve der ville blive RØD den dag manglen blev rettet. En prøve der
   * beskriver et mellemstadie, skal selv kunne se at det er ovre; ellers
   * lærer den næste at rette prøven i stedet for koden. Det er samme fælde
   * som beslutning 79 fandt i `division-fjernet`.
   *
   * Nu vogter den det der faktisk gælder: at godkendelsen IKKE deler
   * permission med bestillingen.
   */
  it("⚠ GODKENDELSE DELER IKKE PERMISSION MED BESTILLING", () => {
    /* ⚠ SKIVE 4A — VAR "indkoeb.godkend". Samme argument som dengang: en
       prøve der beskriver et mellemstadie, skal selv kunne se at det er
       ovre. Se fakturaerGodkend i permissions.js. */
    assert.equal(PERM_GODKEND, "fakturaer.godkend");
    assert.notEqual(PERM_GODKEND, "indkoeb.skriv",
      "den der bestiller, kan godkende sit eget køb");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Indkøbslinjerne
   ══════════════════════════════════════════════════════════════════════ */
describe("Indkøbslinjerne bærer det reglerne kræver", () => {
  it("bruger kendte fakturastatusser", () => {
    for (const l of DEMO_INDKOEBSLINJER) {
      /**
       * ⚠ ET KONTANTKØB HAR INGEN fakturastatus, OG DET ER POINTEN.
       *
       * Der KOMMER ingen faktura. Satte vi "mangler", ville købet stå i
       * hver optælling af det vi venter på — og listen over manglende bilag
       * kunne aldrig tømmes. Betalingsformen er et FELT, ikke en status:
       * fakturastatus svarer på "har vi fået regningen", betalingsform på
       * "hvordan betalte vi". Se beslutning 83.
       */
      if (l.betalingsform === "kontant") {
        assert.equal(l.fakturastatus, undefined,
          `${l.id}: et kontantkøb venter ikke på en faktura`);
        continue;
      }
      assert.ok(FAKTURASTATUS[l.fakturastatus], `${l.id}: ukendt status`);
    }
    for (const f of DEMO_FAKTURAER) {
      assert.ok(FAKTURASTATUS[f.status], `${f.id}: ukendt status`);
    }
  });

  it("viser ikke flere ÅBNE ordrer end kpi/ siger der findes", () => {
    /* ⚠ DEN HER SAMMENLIGNEDE FØR ALLE LINJER MED ÅBNE ORDRER, og det gik
       kun godt så længe demo-sættet ikke havde historik. `aabneOrdrer` tæller
       ordrer der ikke er lukket; en bogført dieselregning fra marts er ikke
       en åben ordre, og at tælle den med gjorde loftet til noget andet end
       det hed.

       Det blev synligt da prisudviklingens tolv måneders indkøb kom til —
       de er alle bogførte. Loftet gælder stadig, det er bare det rigtige
       loft nu: et udsnit kan ikke have flere åbne end totalen. */
    const aabne = DEMO_INDKOEBSLINJER.filter(
      (l) => l.fakturastatus !== "bogfoert" && l.fakturastatus !== "afvist"
    );
    const iAlt = DEMO_KPI.indkoeb.aabneOrdrer;
    assert.ok(aabne.length <= iAlt,
      `${aabne.length} åbne linjer i demo, men kpi/ siger ${iAlt} i alt`);
  });

  it("har en historik der kan bære en prisudvikling", () => {
    /* Snitprisen pr. måned ER et gennemsnit af indkøb. Havde historikken sin
       egen tabel, kunne de to sige hver sit om samme måned — samme fejl som
       to demo-datasæt. Derfor ligger den i DEMO_INDKOEBSLINJER, og derfor
       skal der være måneder nok til at tegne en kurve. */
    const historik = DEMO_INDKOEBSLINJER.filter((l) => l.historisk);
    assert.ok(historik.length >= 30, `kun ${historik.length} historiske linjer`);
    const maaneder = new Set(historik.map((l) => new Date(l.dato).getMonth()));
    assert.ok(maaneder.size >= 6, `kun ${maaneder.size} forskellige måneder`);
    /* Historikken er afsluttet. Stod den som `mangler`, ville huskelisten
       "mangler faktura" vokse med et år bagud. */
    for (const l of historik) {
      assert.equal(l.fakturastatus, "bogfoert", `${l.id} er ikke bogført`);
    }
  });

  /**
   * ⚠ HER STOD "dækker begge divisioner", med begrundelsen *"kun én division —
   * filteret kan ikke ses virke"*. Filteret findes ikke længere (beslutning
   * 70), og kravet om to divisioner var et krav om at demo-data skulle bære et
   * felt for at en kontrol kunne demonstreres. Kategorierne er den rigtige
   * spredning: de siger noget om indkøbene selv.
   */
  it("dækker flere kategorier", () => {
    const kategorier = new Set(DEMO_INDKOEBSLINJER.map((l) => l.kategori));
    assert.ok(kategorier.size >= 4);
    /* ⚠ OG INGEN LINJE BÆRER division — reglen afviser det nu. */
    const med = DEMO_INDKOEBSLINJER.filter((l) => l.division !== undefined);
    assert.deepEqual(med, [], "demo-linjer bærer stadig division, som reglen afviser");
  });
});

/* ---- Vareforbrug og prisudvikling ------------------------------------- */

describe("Mest købte varer og snitpris", () => {
  it("andelen er af den VISTE liste, og skærmen skal sige det", () => {
    /* Samme fælde som andelAfIndkoebPct: én vare i en filtreret liste giver
       100 %, og det ligner en andel af helheden. Testen fastholder at
       funktionen regner på det den får — skærmens tekst er den anden halvdel
       af aftalen. */
    const kun = [{ vare: "A", kategori: "daek", antal: 2, prisPrEnhedOere: 100 }];
    assert.equal(mestKoebteVarer(kun)[0].andelPct, 100);
  });

  it("sorterer efter beløb og lægger samme vare sammen", () => {
    const l = [
      { vare: "A", kategori: "daek", antal: 1, prisPrEnhedOere: 100 },
      { vare: "B", kategori: "daek", antal: 1, prisPrEnhedOere: 500 },
      { vare: "A", kategori: "daek", antal: 1, prisPrEnhedOere: 100 },
    ];
    const r = mestKoebteVarer(l);
    assert.equal(r[0].vare, "B");
    assert.equal(r[1].beloebOere, 200, "de to A-linjer skal lægges sammen");
  });

  it("snitprisen er VÆGTET, ikke gennemsnittet af enhedspriser", () => {
    /* 4.000 liter til 10 kr og 100 til 20 kr giver 10,24 — ikke 15. Det
       usammenvejede tal lader et lille nødkøb flytte månedens pris, og så
       ligner én dyr tankning en prisstigning hos leverandøren. */
    const nu = Date.now();
    const l = [
      { varenummer: "X", dato: nu - 86400000, antal: 4000, prisPrEnhedOere: 1000 },
      { varenummer: "X", dato: nu - 86400000, antal: 100, prisPrEnhedOere: 2000 },
    ];
    const r = snitprisPrMaaned(l, { varenummer: "X", maaneder: 2, nu });
    assert.equal(r.at(-1).snitOere, Math.round((4000 * 1000 + 100 * 2000) / 4100));
  });

  it("en måned uden indkøb udelades — den har ikke prisen nul", () => {
    /* En kurve der dykker til bunden i juli fortæller det modsatte af
       sandheden om en måned man bare ikke købte noget i. */
    const nu = Date.now();
    const l = [{ varenummer: "X", dato: nu - 86400000, antal: 10, prisPrEnhedOere: 500 }];
    const r = snitprisPrMaaned(l, { varenummer: "X", maaneder: 6, nu });
    assert.equal(r.length, 1);
    assert.ok(r.every((p) => p.antal > 0));
  });

  it("demo-historikken giver en stigende dieselkurve over seks måneder", () => {
    const r = snitprisPrMaaned(DEMO_INDKOEBSLINJER, { varenummer: "DIESEL-B7", maaneder: 6 });
    assert.ok(r.length >= 5, `kun ${r.length} måneder med data`);
    assert.ok(r.at(-1).snitOere > r[0].snitOere, "kurven skal kunne ses stige");
  });
});

/* ═════════════════════════════════════════════════════════════════════
   ÉT BELØB, ÉN SKALA
   ═════════════════════════════════════════════════════════════════════ */

describe("Linjens beløb regnes ét sted", () => {
  it("kun beloeb.js definerer linjeBeloebOere", () => {
    /* ⚠ DEN TREDJE KOPI LÅ I EN DEMOFIL.
       beloeb.js' linjeBeloebOere dividerer med ANTAL_SKALA; demo-indkoeb.js'
       af samme navn gangede råt. Skærmene importerede DEMOFILENS — den fil
       der forsvinder den dag noden er rigtig. To funktioner med samme navn og
       forskellig skala i ét repo er 1000×-fejlen, og den næste kopi får ikke
       lov at hedde det samme et tredje sted.

       Indkøbets regnestykke hedder indkoebBeloebOere() og står i
       leverandoerer.js — domænemodulet, ikke demofilen. */
    const mappe = new URL("../src/fleet/", import.meta.url);
    const syndere = readdirSync(mappe)
      .filter((f) => f.endsWith(".js") && f !== "beloeb.js")
      .filter((f) => /export (const|function) linjeBeloebOere/
        .test(readFileSync(new URL(f, mappe), "utf8")));
    assert.deepEqual(syndere, [],
      "linjeBeloebOere er defineret uden for beloeb.js — med hvilken skala?");
  });

  it("en demofil definerer overhovedet ikke beløbsregnestykket", () => {
    /* Formen hører i demo-filen; REGNESTYKKET gør ikke. En skærm der
       importerer sin aritmetik fra demo-*.js, holder op med at virke den dag
       demofilen er tjent — og indtil da regner den på sin egen kopi. */
    const kilde = readFileSync(new URL("../src/fleet/demo-indkoeb.js", import.meta.url), "utf8");
    assert.doesNotMatch(kilde, /export const \w*[Bb]eloebOere = \(/,
      "demo-indkoeb.js definerer et beløbsregnestykke igen.");
  });
});
