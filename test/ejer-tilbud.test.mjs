import test from "node:test";
import assert from "node:assert/strict";
import {
  antalTilSkala, beregnTilbud, beregnTilbudslinje, tilbudsnummer, validerTilbud,
} from "../src/fleet/ejer-tilbud-regler.js";

const linje = (navn, antal, normalprisOere, fakturering, ekstra = {}) => ({
  id: navn.toLowerCase().replaceAll(" ", "_"), art: "andet", navn,
  antal: antalTilSkala(antal), enhed: "stk.", normalprisOere,
  aftaltPrisOere: null, linjerabatBps: 0, generelRabatBps: 0,
  rabatberettiget: true, momssats: 25, fakturering, ...ekstra,
});

test("acceptdatasættet giver 5.855 kr. månedligt og 40.855 kr. én gang", () => {
  const resultat = beregnTilbud({ linjer: [
    linje("Grundplatform", 1, 149500, "maanedlig"),
    linje("FLEET-enheder", 60, 4500, "maanedlig", { linjerabatBps: 1000, art: "modul", modulId: "flaade" }),
    linje("Medarbejderbrugere", 10, 7900, "maanedlig", { art: "medarbejder" }),
    linje("Chaufførbrugere", 60, 1900, "maanedlig", { art: "chauffoer" }),
    linje("Implementering", 10, 99500, "engang", { linjerabatBps: 1000, art: "implementering", enhed: "timer" }),
    linje("OBD-enheder", 20, 159500, "engang", { art: "enhed" }),
  ] });
  assert.equal(resultat.maanedlig.beloebOere, 585500);
  assert.equal(resultat.maanedlig.momsOere, 146375);
  assert.equal(resultat.maanedlig.ialtOere, 731875);
  assert.equal(resultat.engang.beloebOere, 4085500);
});

test("aftalt pris erstatter normalpris, og rabatter anvendes efter hinanden", () => {
  const resultat = beregnTilbudslinje(linje("Ydelse", 1, 15000, "engang", {
    aftaltPrisOere: 10000, linjerabatBps: 1000,
  }), 1000);
  assert.equal(resultat.udgangspunktOere, 10000);
  assert.equal(resultat.efterLinjerabatOere, 9000);
  assert.equal(resultat.satsOere, 8100);
});

test("introperioden påvirker første år uden at ændre normal månedspris", () => {
  const resultat = beregnTilbud({
    introRabatBps: 2000, introMaaneder: 3,
    linjer: [linje("Platform", 1, 100000, "maanedlig")],
  });
  assert.equal(resultat.maanedlig.beloebOere, 100000);
  assert.equal(resultat.introMaanedlig.beloebOere, 80000);
  assert.equal(resultat.foersteAarEksklMomsOere, 1140000);
});

test("tilbud validerer DKK, datoer, moms, mængder og kendte moduler", () => {
  const resultat = validerTilbud({
    virksomhedId: "kunde_1", udstedelsesdato: "2026-09-10", gyldigTil: "2026-10-10",
    valuta: "DKK", linjer: [linje("FLEET", 2, 4500, "maanedlig", { art: "modul", modulId: "flaade" })],
  });
  assert.deepEqual(resultat.fejl, {});
  const ugyldig = validerTilbud({
    virksomhedId: "kunde_1", udstedelsesdato: "2026-10-10", gyldigTil: "2026-09-10",
    valuta: "EUR", linjer: [linje("Ukendt", -1, 1, "maanedlig", { modulId: "fakturacenter" })],
  });
  assert.ok(ugyldig.fejl.gyldigTil);
  assert.ok(ugyldig.fejl.valuta);
  assert.ok(ugyldig.fejl["linjer.0.antal"]);
  assert.ok(ugyldig.fejl["linjer.0.modulId"]);
});

test("tilbudsnummer har stabilt årsformat", () => {
  assert.equal(tilbudsnummer(2026, 42), "T-2026-0042");
});
