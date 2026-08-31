/* test/timeregistrering-bekraeft.test.mjs
 * V1-brugertest §10.1: "når man stempler ud, vil vi gerne have at man
 * bliver spurgt om man er sikker." Ingen komponent-render-infrastruktur
 * findes i dette repo (se andre skærmtests) — samme metode som
 * test/skive4d-ordremail.test.mjs: kildeteksten læses, og mønsteret der
 * garanterer bekræftelsen, prøves direkte.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const kilde = readFileSync("src/moduler/app/Timeregistrering.jsx", "utf8");

describe("§10.1 — Stempl ud beder om bekræftelse, Stempl ind gør ikke", () => {
  it("⚠ TOGGLE-KNAPPEN KALDER IKKE stempl() DIREKTE NÅR EN VAGT ER ÅBEN", () => {
    const knap = kilde.slice(
      kilde.indexOf("<button type=\"button\" disabled={gemmer}"),
      kilde.indexOf("</button>") + "</button>".length
    );
    assert.match(knap, /onClick=\{\(\) => \(aaben \? setBekraeftUd\(true\) : stempl\(\)\)\}/,
      "knappen skal spørge (setBekraeftUd) ved udstempling, og kun kalde stempl() direkte ved indstempling");
  });

  it("⚠ BEKRÆFTELSESDIALOGEN BRUGER PRODUKTEJERNES EGEN ORDLYD", () => {
    assert.ok(kilde.includes("Er du sikker på, at du vil stemple ud?"),
      "spørgeteksten er ikke ordret som ønsket");
    assert.ok(kilde.includes("Ja, stempel ud"), "den primære handling mangler sin tekst");
    assert.ok(kilde.includes(">Annuller<") || kilde.includes("Annuller</Knap>"),
      "annuller-handlingen mangler");
  });

  it("⚠ DIALOGEN GENBRUGER DEN FÆLLES <Dialog>, INGEN EGEN MODAL", () => {
    assert.match(kilde, /import \{ Tom, Dialog, Knap \} from "\.\.\/\.\.\/fleet\/ui\.jsx"/,
      "Timeregistrering skal genbruge fleet/ui.jsx's Dialog/Knap, ikke opfinde sin egen");
    assert.match(kilde, /\{bekraeftUd && \(\s*<Dialog/, "bekræftelsen er ikke bygget på <Dialog>");
  });
});
