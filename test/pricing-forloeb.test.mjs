/* test/pricing-forloeb.test.mjs
 * beregnForloeb() — forløbet med lagerophold.
 *
 * ⚠ FUNKTIONEN HAVDE INGEN PRØVER. Alt andet i pricing.js er prøvet:
 * satsPaa(), METODER, beregnBooking(), lagerdoegn(), lagerUd(), satsopslag().
 * Netop den ene der lægger dem sammen, var udækket — og det er dér tre tavse
 * spring havde overlevet:
 *
 *   1. et lagerophold hvis lager ikke fandtes i arket, blev sprunget helt over
 *   2. håndteringslinjen blev udeladt hvis satsen manglede på datoen
 *   3. døgnlinjen blev udeladt af samme grund — under en kommentar der
 *      påstod at "lagerdagslinjen udelades ALDRIG"
 *
 * Målt før rettelsen: et ophold på fem døgn gav `lagerlinjer: []`,
 * `totalOere: 0` og `estimeret: false`. Altså et estimat der udgav sig for at
 * være PRÆCIST, og som manglede hele lageromkostningen.
 *
 * Ingen emulator.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { beregnForloeb, ALLE_METODER } from "../src/fleet/pricing.js";
import { DEMO_LAGRE } from "../src/fleet/demo-omkostninger.js";
import { omkostningsark } from "../src/fleet/omkostninger.js";

const DAG = 86400000;
const IND = Date.UTC(2026, 7, 1);
const UD = Date.UTC(2026, 7, 6);          /* fem døgn */
const NU = Date.UTC(2026, 7, 18);

/** Et ark med ét lager, begge satser sat. */
const ark = (o = {}) => ({
  biler: {}, poster: {}, agenter: {},
  lagre: {
    "lag-kolding": {
      navn: "Kolding",
      kapacitet: 400,
      satser: o.satser === null ? [] : (o.satser || [
        { gyldigFra: 0, metode: "prLagerdoegn", beloebOere: 4500, friDage: 2 },
      ]),
      haandteringSatser: o.haandtering === null ? [] : (o.haandtering || [
        { gyldigFra: 0, metode: "fastPrBooking", beloebOere: 25000 },
      ]),
    },
  },
});

const ophold = (o = {}) => ({
  lagerId: "lag-kolding", indMs: IND, udMs: UD, maengde: 3, ...o,
});

const forloeb = (o = {}) => ({ etaper: [], lagerophold: [ophold()], ...o });

describe("beregnForloeb — lagerophold", () => {
  it("regner håndtering og lagerdage", () => {
    const r = beregnForloeb(forloeb(), ark(), { paaMs: NU });
    assert.equal(r.lagerlinjer.length, 2);
    assert.equal(r.manglerSats, false);

    const h = r.lagerlinjer.find((l) => l.id.endsWith(":haandtering"));
    const d = r.lagerlinjer.find((l) => l.id.endsWith(":doegn"));
    assert.equal(h.beloebOere, 25000);

    /* ⚠ FRIDAGENE LIGGER PÅ SATSEN, IKKE I BEREGNINGEN. Fem døgn, to fri →
       tre fakturerbare à 45,00 kr. Ændrer lageret sine fridage, er det en NY
       sats med gyldigFra — ikke en konstant et sted i koden. */
    assert.equal(d.antal, 5);
    assert.equal(d.friDage, 2);
    assert.equal(d.fakturerbareDage, 3);
    assert.equal(d.beloebOere, 3 * 4500);
    assert.equal(r.totalOere, 25000 + 13500);
  });

  it("⚠ ET UKENDT LAGER GIVER EN SYNLIG LINJE, IKKE ET SPRING", () => {
    /* Det her var fejlen. Godset HAR stået et sted; opholdet er en
       kendsgerning uanset om vi har satsen. Sprang vi over, blev summen 0 og
       estimatet "præcist" — og lageromkostningen forsvandt uden et spor.

       ⚠ OG DET VAR IKKE EN TEORETISK KODESTI. `omkostningsark()` byggede
       slet ikke `lagre`, så opslaget ramte undefined for HVERT ophold. */
    const r = beregnForloeb(forloeb(), { biler: {}, poster: {}, agenter: {} }, { paaMs: NU });
    assert.equal(r.lagerlinjer.length, 1);
    assert.equal(r.manglerSats, true);
    assert.equal(r.totalOere, null, "en sum med et ubesvaret led er ikke en sum");

    const l = r.lagerlinjer[0];
    assert.equal(l.beloebOere, null, "null, ikke 0 — 0 ville betyde gratis");
    assert.match(l.navn, /ukendt lager/);
    assert.equal(l.antal, 5, "døgnene tælles stadig — de er en kendsgerning");
  });

  it("⚠ EN MANGLENDE DØGNSATS UDELADER IKKE LINJEN", () => {
    /* Kommentaren i koden lovede netop det her, og gjorde det modsatte. */
    const r = beregnForloeb(forloeb(), ark({ satser: null }), { paaMs: NU });
    const d = r.lagerlinjer.find((l) => l.id.endsWith(":doegn"));
    assert.ok(d, "døgnlinjen skal stå der");
    assert.equal(d.beloebOere, null);
    assert.equal(d.manglerSats, true);
    assert.equal(d.antal, 5);
    assert.equal(r.totalOere, null);
  });

  it("⚠ EN MANGLENDE HÅNDTERINGSSATS UDELADER HELLER IKKE LINJEN", () => {
    const r = beregnForloeb(forloeb(), ark({ haandtering: null }), { paaMs: NU });
    const h = r.lagerlinjer.find((l) => l.id.endsWith(":haandtering"));
    assert.ok(h);
    assert.equal(h.beloebOere, null);
    assert.equal(h.manglerSats, true);
    assert.equal(r.totalOere, null);
  });

  it("⚠ EN SATS DER FØRST GÆLDER SENERE, MANGLER I DAG", () => {
    /* satsPaa() svarer på hvad der gjaldt PÅ DATOEN. En prisregulering der
       træder i kraft om tre uger, må stå i listen — den skal bare ikke gælde
       endnu, og så er der ingen sats at regne med. */
    const r = beregnForloeb(forloeb(), ark({
      satser: [{ gyldigFra: NU + 30 * DAG, metode: "prLagerdoegn", beloebOere: 4500 }],
    }), { paaMs: NU });
    const d = r.lagerlinjer.find((l) => l.id.endsWith(":doegn"));
    assert.equal(d.manglerSats, true);
    assert.equal(r.totalOere, null);
  });

  it("⚠ ET ESTIMERET UDTAG SMITTER AF PÅ HELE FORLØBET", () => {
    /* Uden udMs hviler døgnene på en PLAN. Så kan tallet flytte sig, og
       forbrugeren skal kunne skrive det — i stedet for at vise et estimat som
       var det en faktura. */
    const r = beregnForloeb(
      { etaper: [], lagerophold: [ophold({ udMs: undefined, udPlanlagtMs: UD })] },
      ark(), { paaMs: NU });
    assert.equal(r.estimeret, true);
    const d = r.lagerlinjer.find((l) => l.id.endsWith(":doegn"));
    assert.equal(d.grundlag, "planlagt");
    /* Estimeret er ikke det samme som manglende: satsen ER kendt. */
    assert.equal(r.manglerSats, false);
    assert.equal(typeof r.totalOere, "number");
  });

  it("⚠ ET OPHOLD UDEN ENDE KASTER — nul lagerdage er ikke svaret", () => {
    assert.throws(
      () => beregnForloeb(
        { etaper: [], lagerophold: [ophold({ udMs: undefined })] }, ark(), { paaMs: NU }),
      /uden udMs, udPlanlagtMs eller senestMs/);
  });

  it("snapshottet bærer kun de satser der FANDTES", () => {
    /* En sats der ikke fandtes, kan ikke snapshottes — og et tomt felt i
       snapshottet ville se ud som en sats på nul. Linjen bærer manglen; det
       er dér den hører hjemme. */
    const r = beregnForloeb(forloeb(), ark({ satser: null }), { paaMs: NU });
    assert.ok(r.snapshot.satser["lager:lag-kolding:haandtering"]);
    assert.equal(r.snapshot.satser["lager:lag-kolding:doegn"], undefined);
  });

  it("et forløb uden lagerophold er uændret", () => {
    const r = beregnForloeb({ etaper: [], lagerophold: [] }, ark(), { paaMs: NU });
    assert.deepEqual(r.lagerlinjer, []);
    assert.equal(r.manglerSats, false);
    assert.equal(r.totalOere, 0);
  });
});

describe("lagrene i omkostningsarket", () => {
  it("⚠ omkostningsark() BYGGER lagre — den gjorde det ikke", () => {
    /* Det her er selve hullet. Arket havde biler, poster og agenter, men
       ingen `lagre` — og `beregnForloeb()` slår op i netop den nøgle. Hvert
       lagerophold ramte undefined. Prøven findes for at nøglen ikke kan
       forsvinde igen uden at nogen ser det. */
    const ark = omkostningsark([], { lagre: DEMO_LAGRE });
    assert.ok(ark.lagre, "arket mangler lagre");
    assert.equal(Object.keys(ark.lagre).length, DEMO_LAGRE.length);
    for (const l of DEMO_LAGRE) {
      assert.ok(ark.lagre[l.id], `${l.id} kom ikke med i arket`);
      assert.ok(Array.isArray(ark.lagre[l.id].satser),
        "satserne skal være en ARRAY — satsPaa() filtrerer på dem");
    }
  });

  it("⚠ DEMO-SATSERNES METODER FINDES I METODER", () => {
    /* Regelfilen validerer `metode` som en STRENG med et længdekrav, ikke som
       et enum — ordlisten bor i pricing.js, og en afskrift i reglerne ville
       være et andet sted den stod, med sin egen udrulningscyklus. Prøven her
       er den kontrol reglen ikke kan lave.

       Den er ikke teoretisk: første udkast af reglen skrev `prPalleDoegn` og
       `prKvadratmeterDoegn`. De rigtige hedder `prPalledoegn` og
       `prKvadratmeterdoegn` — små bogstaver i midten. Et enum med de forkerte
       navne ville have afvist enhver rigtig sats. */
    for (const l of DEMO_LAGRE) {
      for (const sats of Object.values(l.satser || {})) {
        assert.ok(ALLE_METODER.includes(sats.metode),
          `${l.id}: "${sats.metode}" findes ikke i METODER`);
      }
      for (const sats of Object.values(l.haandteringSatser || {})) {
        assert.ok(ALLE_METODER.includes(sats.metode),
          `${l.id}: "${sats.metode}" findes ikke i METODER`);
      }
    }
  });

  it("⚠ ET LAGER UDEN DØGNSATS FINDES I DEMO-SÆTTET", () => {
    /* Uden en sådan post kunne "mangler sats" aldrig ses i dev, og en
       beregning der kun kan give det rigtige svar, kan ikke tage fejl på en
       måde nogen opdager. Samme grund som den åbne indkøbsordre og den
       planlagte facility-opgave. */
    const uden = DEMO_LAGRE.filter((l) => !l.satser);
    assert.ok(uden.length >= 1,
      "intet lager mangler sin døgnsats — så kan manglen ikke ses i dev");

    const ark = omkostningsark([], { lagre: DEMO_LAGRE });
    const r = beregnForloeb(
      { etaper: [], lagerophold: [{ lagerId: uden[0].id, indMs: IND, udMs: UD }] },
      ark, { paaMs: NU });
    assert.equal(r.manglerSats, true);
    assert.equal(r.totalOere, null);
    /* Håndteringen ER kendt — kun døgnprisen mangler. Begge linjer står der. */
    assert.equal(r.lagerlinjer.length, 2);
    assert.ok(r.lagerlinjer.find((l) => l.beloebOere !== null));
  });

  it("et lager MED begge satser regner igennem", () => {
    const ark = omkostningsark([], { lagre: DEMO_LAGRE });
    const helt = DEMO_LAGRE.find((l) => l.satser && l.haandteringSatser);
    const r = beregnForloeb(
      { etaper: [], lagerophold: [{ lagerId: helt.id, indMs: IND, udMs: UD }] },
      ark, { paaMs: NU });
    assert.equal(r.manglerSats, false);
    assert.ok(r.totalOere > 0);
  });
});
