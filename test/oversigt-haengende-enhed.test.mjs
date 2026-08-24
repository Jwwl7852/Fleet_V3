/* test/oversigt-haengende-enhed.test.mjs
 * Enhedsvælgeren crasher ikke på et koeretoejId der ikke findes — beslutning 117.
 *
 * ⚠ HVORFOR FILEN FINDES. `opgaveEnhed(id)` returnerer null når id'et ikke
 * matcher noget i bilListe — en hængende reference, opdaget under den live
 * verifikation af chauffør-adgangen, ikke relateret til den selv. Skærmen
 * byggede enhedsvalget som `{ id, navn: opgaveEnhed(id) }` og sorterede med
 * `.localeCompare` direkte på `navn` — og et null der rammer `.localeCompare`
 * er en blank hvid skærm for ALLE roller, ikke en fejlmeddelelse.
 *
 * kundeNavn og opgavePerson faldt begge tilbage til id allerede; enhedsvalget
 * gjorde det ikke. Denne prøve holder de tre ens.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";

const KODE = udenKommentarer(readFileSync("src/moduler/booking/Oversigt.jsx", "utf8"));

describe("enhedsvalg", () => {
  it("⚠ falder tilbage til id, ligesom kundeNavn og opgavePerson", () => {
    assert.match(KODE, /navn:\s*opgaveEnhed\(id\)\s*\|\|\s*id/,
      "enhedsvalg bruger opgaveEnhed(id) uden fald til id — et null crasher sorteringen");
  });

  it("sorteringen kan ikke længere ramme localeCompare på null", () => {
    const start = KODE.indexOf("const enhedsvalg");
    const stykke = KODE.slice(start, start + 300);
    assert.match(stykke, /navn:\s*opgaveEnhed\(id\)\s*\|\|\s*id[\s\S]*\.sort\(/,
      "faldet til id ligger ikke før sorteringen af enhedsvalg");
  });
});
