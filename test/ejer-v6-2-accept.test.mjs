import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { foreslaaPilotEvaluering, lokaltTilbudsforslag } from "../src/fleet/ejer-v6-regler.js";
import { antalTilSkala, tilfoejKalendermaaneder, validerTilbud } from "../src/fleet/ejer-tilbud-regler.js";

const kontekst = {
  moduler: ["Fleet", "Planning"],
  aktiviteter: ["OBD-montering", "opstartsworkshop"],
  pilotStart: "2026-10-01",
  pilotMaaneder: 3,
  omfang: "25 køretøjer og 5 navngivne brugere",
  udenfor: ["automatisk overgang til drift", "specialudvikling"],
  uafklaret: ["CVR"],
  vejledendeDrift: true,
};

const gyldigLinje = {
  id: "fleet", art: "modul", navn: "Fleet", modulId: "flaade", enhed: "måned",
  fakturering: "maanedlig", antal: antalTilSkala(1), normalprisOere: 10000,
  aftaltPrisOere: null, linjerabatBps: 0, momssats: 25,
};

const pilot = (rettelser = {}) => ({
  virksomhedId: "v62-kunde", udstedelsesdato: "2026-09-15", gyldigTil: "2026-10-15",
  valuta: "DKK", tilbudstype: "pilot_med_drift", pilotStart: "2026-10-01",
  pilotMaaneder: 3, pilotEvaluering: "2026-12-17", linjer: [gyldigLinje],
  ...rettelser,
});

test("V6.2 lokal adapter laver kildebaseret pilottekst og meningsfuld kort revision", () => {
  const foerste = lokaltTilbudsforslag({ felt: "loesningsbeskrivelse", kunde: "Aurora Mobilitet ApS", pilot: true, kontekst });
  const instruktion = "Gør teksten kortere og fremhæv pilotens afgrænsning. Skriv ikke denne instruktion i tilbuddet.";
  const revideret = lokaltTilbudsforslag({ felt: "loesningsbeskrivelse", kunde: "Aurora Mobilitet ApS", pilot: true, instruks: instruktion, kontekst });
  assert.ok(revideret.length < foerste.length);
  for (const fakta of ["Aurora Mobilitet ApS", "Fleet", "Planning", "OBD-montering", "3 kalendermåneder", "25 køretøjer", "specialudvikling", "CVR", "aktiveres ikke automatisk"]) assert.match(revideret, new RegExp(fakta, "i"));
  assert.doesNotMatch(revideret, /Skriv ikke denne instruktion|sælgerens anvisning/i);
});

test("V6.2 kontrastprøve følger ændret varighed og gør manglende omfang til afklaring", () => {
  const toMaaneder = lokaltTilbudsforslag({ felt: "indledning", kunde: "Aurora Mobilitet ApS", pilot: true, instruks: "Kortere med tydelig pilotafgrænsning", kontekst: { ...kontekst, pilotMaaneder: 2 } });
  assert.match(toMaaneder, /2 kalendermåneder/);
  assert.doesNotMatch(toMaaneder, /3 kalendermåneder/);
  const mangler = lokaltTilbudsforslag({ felt: "indledning", kunde: "Aurora Mobilitet ApS", pilot: true, instruks: "Kortere med tydelig pilotafgrænsning", kontekst: { ...kontekst, omfang: "" } });
  assert.match(mangler, /afklare .*pilotens aftalte omfang/i);
  assert.doesNotMatch(mangler, /25 køretøjer/);
});

test("V6.2 tillader både fremtidig og historisk pilotstart, men bevarer øvrig validering", () => {
  const fremtidig = validerTilbud(pilot());
  assert.deepEqual(fremtidig.fejl, {});
  assert.equal(fremtidig.post.pilotSlut, "2027-01-01");
  const historisk = validerTilbud(pilot({ udstedelsesdato: "2026-11-01", gyldigTil: "2026-12-01" }));
  assert.equal(historisk.fejl.pilotStart, undefined);
  assert.equal(validerTilbud(pilot({ pilotStart: "ikke-en-dato" })).fejl.pilotStart, "Pilotens startdato er ugyldig.");
  assert.equal(validerTilbud(pilot({ pilotMaaneder: 0 })).fejl.pilotMaaneder, "Pilotens varighed skal være 1–24 kalendermåneder.");
  assert.equal(tilfoejKalendermaaneder("2028-01-31", 1), "2028-02-29");
  assert.equal(foreslaaPilotEvaluering("2028-01-31", 1), "2028-02-15");
  assert.equal(fremtidig.post.tilbudstype, "pilot_med_drift");
  assert.equal(Object.hasOwn(fremtidig.post, "aktiverDriftAutomatisk"), false);
});

test("V6.2 klient- og serverkopi af tilbudsregler er identiske", () => {
  const klient = readFileSync(new URL("../src/fleet/ejer-tilbud-regler.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../functions/delt/ejer-tilbud-regler.js", import.meta.url), "utf8");
  assert.equal(server.replace(/^\/\*[\s\S]*?\*\/\s*/, ""), klient);
});
