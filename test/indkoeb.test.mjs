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
import {
  LEVERANDOER_KATEGORI, AFTALETYPE, FAKTURASTATUS,
  afstem, fakturaTotalOere, kanGodkende, leverandoerNavn, parterFraLeverandoer,
  PERM_GODKEND_MIDLERTIDIG,
} from "../src/fleet/leverandoerer.js";
import {
  DEMO_LEVERANDOERER, DEMO_INDKOEBSLINJER, DEMO_FAKTURAER, DEMO_AFSTEMNING,
  linjeBeloebOere, demoAfstemning, demoUdenMatch, demoLeverandoer,
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
    for (const d of ["gods", "bus"]) {
      assert.equal(DEMO_KPI[d].indkoeb.manglendeMatch, undefined);
      assert.equal(DEMO_KPI[d].indkoeb.afstemningsafvigelser, undefined);
    }
  });

  /* Skelettet hardkodede 21 mens kpi sagde 7 — og Dashboard viser kpi'ens tal. */
  it("har fakturaerTilGodkendelse i kpi/, så to skærme ikke siger hver sit", () => {
    assert.ok(Number.isFinite(DEMO_KPI.gods.indkoeb.fakturaerTilGodkendelse));
    assert.ok(Number.isFinite(DEMO_KPI.bus.indkoeb.fakturaerTilGodkendelse));
  });

  it("har de øvrige Indkøb-felter defineret frem for hardkodet", () => {
    for (const felt of ["varerTilGodkendelse", "manglerFaktura", "godkendtDenneMaaned",
                        "maanedensForbrugOere", "aabneOrdrer"]) {
      for (const d of ["gods", "bus"]) {
        assert.ok(Number.isFinite(DEMO_KPI[d].indkoeb[felt]), `${d}.indkoeb.${felt} mangler`);
      }
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
      assert.equal(linjeBeloebOere(l), l.antal * l.prisPrEnhedOere);
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
  it("har en gyldig division på hver leverandør", () => {
    for (const l of DEMO_LEVERANDOERER) {
      assert.ok(["gods", "bus", "faelles"].includes(l.division), `${l.id}: ugyldig division`);
    }
  });

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

  /* Midlertidig løsning — den skal skilles ud, og hvorfor står i
     leverandoerer.js. */
  it("bruger indkoeb.skriv indtil fakturaer.godkend findes", () => {
    assert.equal(PERM_GODKEND_MIDLERTIDIG, "indkoeb.skriv");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Indkøbslinjerne
   ══════════════════════════════════════════════════════════════════════ */
describe("Indkøbslinjerne bærer det reglerne kræver", () => {
  it("har division på hver linje — den kan ikke arves fra bilen", () => {
    for (const l of DEMO_INDKOEBSLINJER) {
      assert.ok(["gods", "bus", "faelles"].includes(l.division), `${l.id}: ugyldig division`);
    }
  });

  it("bruger kendte fakturastatusser", () => {
    for (const l of DEMO_INDKOEBSLINJER) {
      assert.ok(FAKTURASTATUS[l.fakturastatus], `${l.id}: ukendt status`);
    }
    for (const f of DEMO_FAKTURAER) {
      assert.ok(FAKTURASTATUS[f.status], `${f.id}: ukendt status`);
    }
  });

  it("er et udsnit, ikke hele perioden", () => {
    const iAlt = DEMO_KPI.gods.indkoeb.aabneOrdrer + DEMO_KPI.bus.indkoeb.aabneOrdrer;
    assert.ok(DEMO_INDKOEBSLINJER.length <= iAlt);
  });

  it("dækker begge divisioner og flere kategorier", () => {
    const divisioner = new Set(DEMO_INDKOEBSLINJER.map((l) => l.division));
    assert.ok(divisioner.size >= 2, "kun én division — filteret kan ikke ses virke");
    const kategorier = new Set(DEMO_INDKOEBSLINJER.map((l) => l.kategori));
    assert.ok(kategorier.size >= 4);
  });
});
