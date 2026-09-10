import test from "node:test";
import assert from "node:assert/strict";

import {
  crmAktiviteter,
  crmMuligheder,
  erAabenMulighed,
  erForfaldenAktivitet,
  harValideringsfejl,
  validerCrmAktivitet,
  validerCrmMulighed,
  validerCrmVirksomhed,
} from "../src/fleet/ejer-crm-regler.js";

test("CRM-virksomhed bevarer identifikatorer som tekst og validerer ejer", () => {
  const resultat = validerCrmVirksomhed({
    navn: "Prøvekunde ApS", cvr: "01234567", ean: "5790001234567",
    ansvarligUid: "ejer-dennis", kontaktEmail: "kontakt@example.test",
  });
  assert.equal(harValideringsfejl(resultat), false);
  assert.equal(resultat.post.cvr, "01234567");
  assert.equal(resultat.post.ean, "5790001234567");
  assert.equal(typeof resultat.post.cvr, "string");
});

test("CRM-virksomhed afviser ugyldig CVR, mail, EAN og manglende ansvarlig", () => {
  const { fejl } = validerCrmVirksomhed({
    navn: "X", cvr: "123", ean: "42", kontaktEmail: "nej", ansvarligUid: "",
  });
  assert.deepEqual(Object.keys(fejl).sort(), ["ansvarligUid", "cvr", "ean", "kontaktEmail"]);
});

test("salgsmulighed holder månedsværdi og engangsbeløb adskilt", () => {
  const resultat = validerCrmMulighed({
    titel: "Fleet pilot", ansvarligUid: "ejer-jorn", fase: "demo",
    kilde: "anbefaling", moduler: ["flaade"], forventetLukDato: "2026-11-01",
    naesteAktivitet: "Aftal demo", naesteAktivitetDato: "2026-09-15",
    maanedligVaerdiOere: 585500, engangsVaerdiOere: 4085500,
  }, "proevekunde");
  assert.equal(harValideringsfejl(resultat), false);
  assert.equal(resultat.post.maanedligVaerdiOere, 585500);
  assert.equal(resultat.post.engangsVaerdiOere, 4085500);
  assert.notEqual(resultat.post.maanedligVaerdiOere, resultat.post.engangsVaerdiOere);
});

test("salgsmulighed afviser ukendt modul, negativ værdi og ugyldig dato", () => {
  const { fejl } = validerCrmMulighed({
    titel: "X", ansvarligUid: "ejer", fase: "ny", kilde: "anden",
    moduler: ["fremtid"], forventetLukDato: "2026-99-99",
    maanedligVaerdiOere: -1, engangsVaerdiOere: 0,
  }, "kunde");
  assert.ok(fejl.moduler);
  assert.ok(fejl.forventetLukDato);
  assert.ok(fejl.maanedligVaerdiOere);
});

test("aktiviteter valideres og forfald afgøres uden at afsluttede poster tæller", () => {
  const resultat = validerCrmAktivitet({
    titel: "Ring om tilbud", art: "opkald", ansvarligUid: "ejer",
    fristDato: "2026-09-09", status: "aaben",
  }, "kunde");
  assert.equal(harValideringsfejl(resultat), false);
  assert.equal(erForfaldenAktivitet(resultat.post, "2026-09-10"), true);
  assert.equal(erForfaldenAktivitet({ ...resultat.post, status: "afsluttet" }, "2026-09-10"), false);
});

test("pipeline og aktivitetsliste afledes fra samme virksomhedsdata", () => {
  const data = {
    v1: {
      stamdata: { navn: "Prøvekunde" },
      muligheder: { m1: { titel: "Pilot", fase: "ny" }, m2: { titel: "Tabt", fase: "tabt" } },
      aktiviteter: { a1: { titel: "Ring", status: "aaben" } },
    },
  };
  assert.deepEqual(crmMuligheder(data).map((m) => m.virksomhedsnavn), ["Prøvekunde", "Prøvekunde"]);
  assert.equal(crmAktiviteter(data)[0].virksomhedsnavn, "Prøvekunde");
  assert.equal(crmMuligheder(data).filter(erAabenMulighed).length, 1);
});
