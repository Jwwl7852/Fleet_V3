import test from "node:test";
import assert from "node:assert/strict";
import {
  kundekontoAendringer,
  kundekontoFraTilbudssnapshot,
  normaliserKundekonto,
  prislinjerTilKundekonto,
} from "../src/fleet/ejer-kundekonto-regler.js";

const pris = {
  id: "fixture-rateblad-v1",
  momssats: 25,
  platform: { basisOere: 100000 },
  moduler: {
    flaade: {
      basisOere: 200000,
      prKoeretoejOere: 5000,
      prBrugerOere: { desktop: 1000, chauffoer: 500 },
    },
  },
  tilbudslinjer: {
    obd: {
      art: "enhed", navn: "OBD-hardware", enhed: "stk.",
      fakturering: "engang", normalprisOere: 125000, momssats: 25,
      rabatberettiget: true,
    },
  },
};

test("manuel kundekonto bruger det versionerede rateblad og aftalte mængder", () => {
  const linjer = prislinjerTilKundekonto(pris, {
    moduler: [{ id: "flaade", status: "aktiv" }],
    maengder: { medarbejderbrugere: 10, chauffoerbrugere: 60, enheder: 42 },
    obd: { hardwareAntal: 8 },
  });
  assert.ok(linjer.every((linje) => linje.priskilde === "prisliste:fixture-rateblad-v1"));
  assert.equal(linjer.find((linje) => linje.id.endsWith("_desktop")).antal, 10000);
  assert.equal(linjer.find((linje) => linje.id.endsWith("_chauffoer")).antal, 60000);
  assert.equal(linjer.find((linje) => linje.id.endsWith("_enhed")).antal, 42000);
  assert.equal(linjer.find((linje) => linje.navn === "OBD-hardware").antal, 8000);
});

test("accepteret tilbud holder OBD og øvrige enheder adskilt", () => {
  const konto = kundekontoFraTilbudssnapshot({
    prislisteId: "fixture-rateblad-v1",
    beregning: { linjer: [
      { id: "bil", art: "enhed", navn: "FLEET-enheder", modulId: "flaade", antal: 42000, normalprisOere: 5000, satsOere: 5000, momssats: 25, fakturering: "maanedlig", enhed: "stk.", linjerabatBps: 0, rabatberettiget: true },
      { id: "obd", art: "enhed", navn: "OBD-hardware", modulId: "flaade", antal: 8000, normalprisOere: 125000, satsOere: 125000, momssats: 25, fakturering: "engang", enhed: "stk.", linjerabatBps: 0, rabatberettiget: true },
    ] },
  });
  assert.equal(konto.maengder.enheder, 42);
  assert.equal(konto.obd.hardwareAntal, 8);
  assert.equal(konto.obd.hardwarePrisOere, 125000);
});

test("komplet opsætning validerer mængder, dato og prislinjer", () => {
  const resultat = normaliserKundekonto({
    faerdig: true,
    profil: { navn: "Fiktiv Service ApS", cvr: "12345678", fakturaEmail: "faktura@example.test" },
    moduler: [{ id: "flaade", status: "aktiv", startdato: "2026-09-15" }],
    maengder: { medarbejderbrugere: 10, chauffoerbrugere: 60, enheder: 42 },
    obd: { hardwareAntal: 8, hardwarePrisOere: 125000, dataabonnementAntal: 8, dataabonnementPrisOere: 2500, leveretAntal: 4, tilknyttetAntal: 3 },
    abonnement: {
      prislisteId: "fixture-rateblad-v1", generelRabatBps: 1000,
      introRabatBps: 500, introMaaneder: 3, bindingMaaneder: 12,
      interval: "maaned", virkningsdato: "2026-09-15",
      linjer: prislinjerTilKundekonto(pris, {
        moduler: [{ id: "flaade" }],
        maengder: { medarbejderbrugere: 10, chauffoerbrugere: 60, enheder: 42 },
        obd: { hardwareAntal: 8 },
      }),
    },
  });
  assert.deepEqual(resultat.fejl, {});
  assert.ok(resultat.beregning.maanedlig.beloebOere > 0);
  assert.ok(resultat.beregning.engang.beloebOere > 0);
});

test("leveret OBD kan ikke overstige det aftalte antal", () => {
  const resultat = normaliserKundekonto({
    profil: { navn: "Fiktiv Service ApS" },
    obd: { hardwareAntal: 2, leveretAntal: 3 },
  });
  assert.match(resultat.fejl["obd.leveretAntal"], /kan ikke overstige/);
});

test("ændringsresume viser adgang, antal og rateblad", () => {
  const ændringer = kundekontoAendringer(
    { moduler: [], maengder: { enheder: 2 }, abonnement: { prislisteId: "gammel", generelRabatBps: 0 } },
    { moduler: [{ id: "flaade", status: "aktiv" }], maengder: { enheder: 4 }, abonnement: { prislisteId: "ny", generelRabatBps: 500 } },
  );
  assert.ok(ændringer.some((tekst) => tekst.includes("Fleet")));
  assert.ok(ændringer.some((tekst) => tekst.includes("enheder")));
  assert.ok(ændringer.some((tekst) => tekst.includes("Rateblad")));
});
