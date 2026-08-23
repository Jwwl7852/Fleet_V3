/* test/grundlagseksport.test.mjs
 * Adaptere: den neutrale model → en fil et regnskabssystem kan tage imod.
 *
 * ⚠ HVORFOR FILEN FINDES. Beslutning 98 gjorde eksporten mulig og gav den en
 * knap. Den producerede JSON — og en bogholder vil ikke have JSON.
 *
 * ⚠ OG DEN NEUTRALE MODEL BAR INGEN DATO. `eksporter()` gav nummer, kunde,
 * beløb og linjer, og ikke ét tidspunkt. **Et bilag uden dato kan ikke
 * bogføres:** datoen afgør momsperioden. Det blev først synligt da eksporten
 * skulle bruges til noget — så længe funktionen blev kaldt ingen steder,
 * kunne en manglende dato ikke mærkes.
 *
 * ⚠ DER ER INGEN e-conomic-ADAPTER, og det er et valg. Jeg kender ikke deres
 * importskema, og et gæt ville være samme fejl som at gætte en momssats: en
 * fil der ser rigtig ud, fejler i bogholderens system — eller importerer
 * HALVT. Se README's uafklarede spørgsmål.
 *
 * Se beslutning 102.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  byggGrundlag, eksporter, EKSPORT_FORMAT_VERSION, MOMSSATS_SALG,
} from "../src/fleet/grundlag.js";
import {
  ADAPTER, ALLE_ADAPTERE, byggEksport, eksportfilnavn,
} from "../src/fleet/grundlagseksport.js";
import { CSV_SEP, CSV_BOM } from "../src/fleet/eksport.js";

const UDARBEJDET = Date.UTC(2026, 7, 20, 9, 0, 0);
const GODKENDT = Date.UTC(2026, 7, 24, 14, 30, 0);

const linje = (o = {}) => ({
  id: o.id ?? "l1",
  art: o.art ?? "koersel",
  tekst: o.tekst ?? "Kolding → Hamburg",
  antal: o.antal ?? 1500,
  enhed: o.enhed ?? "tur",
  satsOere: o.satsOere ?? 12_400_00,
  momssats: o.momssats ?? MOMSSATS_SALG,
  kilde: o.kilde ?? { type: "etape", id: "et-1" },
});

const eksporteret = (o = {}) => eksporter({
  ...byggGrundlag({
    bookingId: o.bookingId === undefined ? "bk-1" : o.bookingId,
    periode: o.periode,
    kundeId: "k-1",
    linjer: o.linjer ?? [linje()],
    udarbejdetAf: "uid-mette",
  }, UDARBEJDET),
  tilstand: "godkendt",
  nummer: o.nummer ?? "GRL-2026-00042",
  godkendtAf: "uid-jorn",
  godkendtMs: o.godkendtMs === undefined ? GODKENDT : o.godkendtMs,
});

describe("Den neutrale model bærer nok til at bogføre", () => {
  /**
   * ⚠ ET BILAG UDEN DATO KAN IKKE BOGFØRES. Version 1 havde ingen — hverken
   * udarbejdelse eller godkendelse — og en bogholder der mangler datoen, må
   * ringe. Den afgør hvilken momsperiode bilaget hører til.
   */
  it("⚠ BEGGE DATOER STÅR MED, OG DE BETYDER IKKE DET SAMME", () => {
    const e = eksporteret();
    assert.equal(e.udarbejdetMs, UDARBEJDET, "hvornår opgørelsen blev lavet");
    assert.equal(e.godkendtMs, GODKENDT, "hvornår nogen skrev under — bilagsdatoen");
    assert.notEqual(e.udarbejdetMs, e.godkendtMs);
  });

  it("⚠ ET PERIODEGRUNDLAG BÆRER SIN PERIODE", () => {
    /* Warehouses afregning gør en PERIODE op og har intet bookingId. Uden de
       to datoer kan modtageren ikke se hvad linjerne dækker. */
    const fra = Date.UTC(2026, 6, 1);
    const til = Date.UTC(2026, 6, 31);
    const e = eksporteret({ bookingId: null, periode: { fra, til } });
    assert.deepEqual(e.periode, { fra, til });
    assert.equal(e.bookingId, null);
  });

  it("⚠ VERSIONEN ER BUMPET — felter er lagt til", () => {
    /* En modtager der validerer strengt, afviser et ukendt felt. En fil der
       afvises i bogholderens system, er dyrere at fejlfinde end et
       versionsnummer der skifter. */
    assert.ok(EKSPORT_FORMAT_VERSION >= 2);
    assert.equal(eksporteret().formatVersion, EKSPORT_FORMAT_VERSION);
  });
});

describe("Adapterne oversætter — de regner ikke", () => {
  it("hver adapter har label, endelse, mime og en byg()", () => {
    assert.ok(ALLE_ADAPTERE.length >= 2);
    for (const id of ALLE_ADAPTERE) {
      const a = ADAPTER[id];
      assert.equal(a.id, id, "id'et skal matche nøglen");
      assert.ok(a.label && a.hvad && a.endelse && a.mime);
      assert.equal(typeof a.byg, "function");
    }
  });

  /**
   * ⚠ TALLENE ER FROSSET AF eksporter(). En adapter der regnede et beløb om,
   * ville kunne give et andet tal end fakturaen — og så er der to sandheder
   * om hvad kunden skylder.
   */
  it("⚠ INGEN ADAPTER RØRER ET BELØB", () => {
    const e = eksporteret();
    const foer = JSON.stringify(e);
    for (const id of ALLE_ADAPTERE) byggEksport(e, id);
    assert.equal(JSON.stringify(e), foer, "en adapter ændrede den neutrale model");
  });

  it("⚠ EN UKENDT ADAPTER KASTER — den falder ikke tilbage på JSON", () => {
    /* En bogholder der bad om CSV og fik JSON, opdager det når filen ikke kan
       importeres — og leder efter fejlen i sit eget system. */
    assert.throws(() => byggEksport(eksporteret(), "e-conomic"), /ukendt adapter/);
  });

  /**
   * ⚠ FILENDELSEN ER EN PÅSTAND OM INDHOLDET.
   *
   * `filnavn()` hardkodede `.csv`, og JSON-knappen fra beslutning 98 gav
   * derfor en fil der hed `.csv` og indeholdt JSON. Dobbeltklikker en
   * bogholder på den, åbner Excel den og laver noget helt tredje ud af den.
   */
  it("⚠ FILNAVNET FÅR ADAPTERENS EGEN ENDELSE", () => {
    const e = eksporteret();
    assert.match(eksportfilnavn(e, "neutral"), /\.json$/);
    assert.match(eksportfilnavn(e, "csv"), /\.csv$/);
  });

  it("⚠ OG DATOEN I NAVNET ER GRUNDLAGETS, IKKE DAGENS", () => {
    /* Henter bogholderen den samme fil om to uger, skal den hedde det samme —
       ellers ligger der to i mappen Overførsler, og kun den ene er bogført. */
    assert.match(eksportfilnavn(eksporteret(), "csv"), /2026-08-24/);
  });
});

describe("CSV'en er til et menneske og et andet system", () => {
  const linjerAf = (indhold) =>
    indhold.replace(CSV_BOM, "").trim().split("\r\n");

  it("⚠ ÉN RÆKKE PR. LINJE, OG INGEN TOTALRÆKKE", () => {
    /* En totalrække i en importfil bliver til en fakturalinje: systemet i den
       anden ende læser rækker, det ved ikke at den sidste er en sum. Én
       faktura på det dobbelte, og fejlen ser ud som en pris. */
    const e = eksporteret({ linjer: [linje({ id: "a" }), linje({ id: "b" })] });
    const l = linjerAf(byggEksport(e, "csv").indhold);
    assert.equal(l.length, 3, "overskrift + to linjer, intet mere");
  });

  it("⚠ BELØB I KRONER MED KOMMA — ikke i øre", () => {
    /* En importør der læser 1240000 som kroner, fakturerer 1,24 millioner. */
    const raekke = linjerAf(byggEksport(eksporteret(), "csv").indhold)[1];
    const felter = raekke.split(CSV_SEP);
    assert.ok(felter.includes("12400,00"), `stk.prisen mangler: ${raekke}`);
    assert.ok(felter.includes("18600,00"), "1,5 tur à 12.400 er 18.600");
    assert.ok(felter.includes("4650,00"), "25 % af 18.600 er 4.650");
  });

  it("⚠ ANTAL ER TUSINDDELE I MODELLEN — og vises som tal", () => {
    /* En kolonne der viste 1500 hvor der menes 1,5, bliver ganget med tusind
       af den der importerer. */
    const raekke = linjerAf(byggEksport(eksporteret(), "csv").indhold)[1];
    assert.ok(raekke.split(CSV_SEP).includes("1,5"), raekke);
  });

  it("⚠ KILDEN STÅR I EN KOLONNE", () => {
    /* Ringer kunden om en linje, er spørgsmålet altid "hvilken tur var det?" */
    const raekke = linjerAf(byggEksport(eksporteret(), "csv").indhold)[1];
    assert.ok(raekke.includes("etape:et-1"), raekke);
  });

  it("⚠ BILAGSDATOEN ER GODKENDELSEN, og tom hvis den mangler", () => {
    const med = linjerAf(byggEksport(eksporteret(), "csv").indhold)[1];
    assert.ok(med.includes("2026-08-24"), med);
    /* En dato der er gættet, kan ikke skelnes fra en der er rigtig — så
       hellere tom. */
    const uden = linjerAf(byggEksport(eksporteret({ godkendtMs: null }), "csv").indhold)[1];
    assert.ok(!uden.includes("2026-08-20"), "udarbejdelsesdatoen blev lånt som bilagsdato");
  });

  it("⚠ FORMEL-INJEKTION ER STADIG DÆKKET", () => {
    /* Et linjetekst er fritekst. `=HYPERLINK(...)` udføres af Excel når filen
       åbnes — csvFelt() sætter en apostrof foran, og adapteren må ikke gå
       uden om den. */
    const e = eksporteret({ linjer: [linje({ tekst: "=HYPERLINK(\"ondt\")" })] });
    const raekke = linjerAf(byggEksport(e, "csv").indhold)[1];
    assert.match(raekke, /'=HYPERLINK/);
  });

  it("dansk Excel: BOM, semikolon og CRLF", () => {
    const { indhold } = byggEksport(eksporteret(), "csv");
    assert.ok(indhold.startsWith(CSV_BOM), "uden BOM bliver Køretøj til KÃ¸retÃ¸j");
    assert.ok(indhold.includes(CSV_SEP));
    assert.ok(indhold.includes("\r\n"));
  });
});

describe("De navngivne regnskabssystemer", () => {
  /**
   * ⚠ DER ER INGEN ADAPTER TIL DEM, OG DET SKAL KUNNE SES.
   *
   * Beslutning 22 nævner e-conomic, Dinero og Business Central. Ingen af dem
   * har et format her, fordi jeg ikke kender deres importskemaer — og en
   * opfundet kolonnerække er samme fejl som en gættet momssats: filen ser
   * rigtig ud og fejler i den anden ende.
   *
   * Prøven står her så en fremtidig adapter ikke kan snige sig ind som et
   * gæt: kommer der en, skal den her linje rettes, og så skal nogen skrive
   * hvor skemaet kom fra.
   */
  it("⚠ INGEN OPFUNDET e-conomic-ADAPTER", () => {
    for (const navn of ["economic", "e-conomic", "dinero", "businesscentral"]) {
      assert.ok(!ALLE_ADAPTERE.includes(navn),
        `${navn} er tilføjet — står feltskemaet fra deres egen importvejledning?`);
    }
  });
});
