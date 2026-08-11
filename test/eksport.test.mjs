/* test/eksport.test.mjs
 * CSV til DANSK Excel — og de tre ting der gør en fil ubrugelig i tavshed.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  csv, csvFelt, csvOere, filnavn, CSV_SEP, CSV_NL, CSV_BOM,
} from "../src/fleet/eksport.js";

describe("Dansk Excel", () => {
  it("bruger semikolon, ikke komma", () => {
    /* ⚠ Excel læser efter maskinens regionsindstilling, ikke efter filen. På
       en dansk maskine er listeseparatoren semikolon — med komma bliver hele
       rækken til ÉN celle, og det ses først når nogen skal regne på den. */
    assert.equal(CSV_SEP, ";");
    const ud = csv([{ a: 1, b: 2 }], [
      { navn: "A", hent: (r) => r.a }, { navn: "B", hent: (r) => r.b },
    ]);
    assert.match(ud, /A;B/);
    assert.match(ud, /1;2/);
  });

  it("skriver decimaler med KOMMA og uden tusindtalsskilletegn", () => {
    /* 1.234.50 ville blive læst som fire kolonner. */
    assert.equal(csvFelt(1234.5), "1234,5");
    assert.equal(csvOere(153000), "1530,00");
    assert.doesNotMatch(csvOere(153000), /\./);
  });

  it("begynder med en BOM", () => {
    /* Uden den gætter Excel på Windows-1252, og Køretøj bliver til KÃ¸retÃ¸j.
       Filen ser rigtig ud i enhver anden editor. */
    const ud = csv([], [{ navn: "Køretøj", hent: () => "" }]);
    assert.ok(ud.startsWith(CSV_BOM), "mangler BOM");
    assert.match(ud, /Køretøj/);
  });

  it("bruger CRLF", () => {
    const ud = csv([{ x: 1 }], [{ navn: "X", hent: (r) => r.x }]);
    assert.ok(ud.includes(CSV_NL));
    assert.equal(CSV_NL, "\r\n");
  });
});

describe("Felter der ellers ødelægger filen", () => {
  it("citerer et felt med separator, citationstegn eller linjeskift", () => {
    assert.equal(csvFelt("a;b"), '"a;b"');
    assert.equal(csvFelt('han sagde "nej"'), '"han sagde ""nej"""');
    assert.equal(csvFelt("to\nlinjer"), '"to\nlinjer"');
  });

  it("uskadeliggør en formel", () => {
    /* ⚠ CSV-INJECTION. En celle der begynder med = + - eller @ UDFØRES af
       Excel når filen åbnes. Et virksomhedsnavn er fritekst fra en formular,
       og =HYPERLINK(...) i et kundenavn er ikke en teoretisk fare. */
    assert.equal(csvFelt("=1+1"), "'=1+1");
    assert.equal(csvFelt("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
    assert.equal(csvFelt("+34"), "'+34");
    assert.equal(csvFelt("-cmd"), "'-cmd");
    assert.equal(csvFelt("@SUM(A1)"), "'@SUM(A1)");
  });

  it("rører ikke et almindeligt navn", () => {
    assert.equal(csvFelt("Nordvest Transport ApS"), "Nordvest Transport ApS");
  });

  it("gør tomt til tomt — ikke til 'null'", () => {
    /* "null" i en celle ligner en værdi. */
    assert.equal(csvFelt(null), "");
    assert.equal(csvFelt(undefined), "");
    assert.equal(csvFelt(NaN), "");
    assert.equal(csvOere(null), "");
    assert.equal(csvOere(undefined), "");
  });

  it("skriver ja/nej frem for true/false", () => {
    assert.equal(csvFelt(true), "ja");
    assert.equal(csvFelt(false), "nej");
  });
});

describe("Filnavnet", () => {
  it("bærer en dato, så to udtræk ikke hedder det samme", () => {
    assert.equal(filnavn("Prisliste", Date.UTC(2026, 7, 11)),
      "fleetcontrol-prisliste-2026-08-11.csv");
  });

  it("holder æøå og tegnsætning ude af filsystemet", () => {
    assert.equal(filnavn("Fakturagrundlag august/2026", Date.UTC(2026, 7, 11)),
      "fleetcontrol-fakturagrundlag-august-2026-2026-08-11.csv");
    assert.doesNotMatch(filnavn("Køretøjer", 0), /[æøåÆØÅ/\\:]/);
  });
});

describe("Et udtræk af en prisliste", () => {
  it("hænger sammen fra rækker til fil", () => {
    const raekker = [
      { modul: "Flåde", basisOere: 49500, prKoeretoejOere: 2900 },
      { modul: "Bemanding", basisOere: 29500, prKoeretoejOere: 0 },
    ];
    const ud = csv(raekker, [
      { navn: "Modul", hent: (r) => r.modul },
      { navn: "Pr. måned", hent: (r) => csvOere(r.basisOere) },
      { navn: "Pr. køretøj", hent: (r) => csvOere(r.prKoeretoejOere) },
    ]);
    const linjer = ud.replace(CSV_BOM, "").trimEnd().split(CSV_NL);
    assert.equal(linjer.length, 3);
    assert.equal(linjer[0], "Modul;Pr. måned;Pr. køretøj");
    assert.equal(linjer[1], "Flåde;495,00;29,00");
    assert.equal(linjer[2], "Bemanding;295,00;0,00");
  });
});
