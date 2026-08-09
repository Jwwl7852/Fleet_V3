/* test/indberetninger.test.mjs
 * Indberetninger. Beslutning 25, plus chaufførappens tre datatyper.
 *
 * Tyngden ligger i koblingen til fakturagrundlaget. Det er det første sted
 * appens data møder økonomien, og passer den ikke nu, passer den heller ikke
 * når appen kommer — så den prøves med grundlag.js' EGNE funktioner frem for
 * med et håndskrevet forventet objekt. En test der gentager modellen, kan ikke
 * opdage at de to er uenige.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HAENDELSE_ART, FELT, felterFor, harFelt, SENSITIVE_FELTER,
  FORLOEB, kanSkifteTil, kanAfslutte,
  byggTidsregistrering, tidPaaStedetMin, forsinkelseMin,
  byggUnderskrift, maaOverskriveUnderskrift,
  MAENGDE_SKALA, byggMateriallinje, kanFaktureres,
  grundlagslinjeFraMateriale, lagertraekFraMateriale,
  forbrugKmPrLiter,
} from "../src/fleet/indberetninger.js";

import {
  ANTAL_SKALA, LINJE_ART, validerLinje, linjeBeloebOere, talFraAntal,
} from "../src/fleet/grundlag.js";

const NU = Date.UTC(2026, 7, 9, 12, 0, 0);
const MIN = 60000;

const indb = (o = {}) => ({
  id: o.id ?? "ind-001",
  art: o.art ?? "reparation",
  bookingId: o.bookingId === undefined ? "bk-2026-00311" : o.bookingId,
  forloeb: o.forloeb ?? "ny",
  ...o,
});

const materiale = (o = {}) => ({
  ...byggMateriallinje({
    vare: o.vare ?? "Bobleplast",
    varenummer: o.varenummer ?? "BP-500",
    maengde: o.maengde ?? 2 * MAENGDE_SKALA,
    enhed: o.enhed ?? "m",
    lagerId: o.lagerId ?? "lager-hoved",
  }),
  ...o.overskriv,
});

/* ---- Arter og felter --------------------------------------------------- */

test("arten styrer feltskemaet — brændstof har liter, en godsskade har ikke", () => {
  assert.ok(harFelt("braendstof", FELT.liter));
  assert.ok(!harFelt("godsskade", FELT.liter));
  assert.ok(harFelt("godsskade", FELT.skadeBeskrivelse));
});

test("chaufførappens tre felter kan hænge på enhver art der har mennesker på", () => {
  /* At binde dem til én art ville betyde at appen skulle vælge art, før den
     vidste hvad der skete. */
  for (const art of ["reparation", "koeretoejsskade", "godsskade"]) {
    assert.ok(harFelt(art, FELT.tidsregistrering), art);
    assert.ok(harFelt(art, FELT.underskrift), art);
    assert.ok(harFelt(art, FELT.materialelinjer), art);
  }
});

test("underskriften står på listen over sensitive felter", () => {
  assert.ok(SENSITIVE_FELTER.includes(FELT.underskrift),
    "den er både en personoplysning og et bevis");
  assert.ok(SENSITIVE_FELTER.includes(FELT.skadeBeskrivelse));
});

/* ---- Forløbet ---------------------------------------------------------- */

test("forløbet fejler lukket — en ukendt tilstand åbner ingenting", () => {
  assert.equal(kanSkifteTil("ny", "vurderet"), true);
  assert.equal(kanSkifteTil("ny", "paaVaerksted"), false, "der springes ikke");
  assert.equal(kanSkifteTil("vrøvl", "afsluttet"), false);
  assert.equal(kanSkifteTil("afsluttet", "ny"), false);
});

test("afventerFaktura er en egen tilstand, ikke en variant af paaVaerksted", () => {
  /* Bilen er tilbage i drift, men pengesiden er ikke lukket. Uden den ville
     listen være ubrugelig som huskeliste. */
  assert.ok(FORLOEB.afventerFaktura);
  assert.ok(kanSkifteTil("paaVaerksted", "afventerFaktura"));
  assert.ok(kanSkifteTil("afventerFaktura", "afsluttet"));
});

/* ---- Afslutning -------------------------------------------------------- */

test("en indberetning kan ikke afsluttes uden at pengesiden er afklaret", () => {
  const tjek = kanAfslutte(indb({ forloeb: "afventerFaktura" }));
  assert.equal(tjek.ok, false);
  assert.ok(tjek.aarsager.some((a) => /omkostning/.test(a)));
});

test("en registreret omkostning er nok", () => {
  assert.equal(kanAfslutte(indb({ forloeb: "afventerFaktura", omkostningOere: 4_250_00 })).ok, true);
  assert.equal(kanAfslutte(indb({ forloeb: "afventerFaktura", indkoebId: "ink-77" })).ok, true);
});

test('"ingen omkostning" kræver en begrundelse — ellers er den ubrugelig', () => {
  const uden = kanAfslutte(indb({ forloeb: "afventerFaktura", ingenOmkostning: { begrundelse: "  " } }));
  assert.equal(uden.ok, false);
  assert.ok(uden.aarsager.some((a) => /begrundelse/.test(a)));

  /* Med begrundelse kan "dækket af garantien" bagefter skelnes fra "vi glemte
     at få fakturaen". Kun den sidste er et problem. */
  const med = kanAfslutte(indb({
    forloeb: "afventerFaktura",
    ingenOmkostning: { begrundelse: "Dækket af garantien, Volvo sag 88213." },
  }));
  assert.equal(med.ok, true, med.aarsager.join(" / "));
});

/* ---- 1. Tidsregistrering ----------------------------------------------- */

test("to slags tidspunkter: hvornår det skete, og hvornår det blev tastet", () => {
  const t = byggTidsregistrering({
    ankomstMs: NU, afgangMs: NU + 90 * MIN, registreretAf: "uid-lars",
  }, NU + 240 * MIN);

  assert.equal(t.ankomstMs, NU);
  assert.equal(t.registreretMs, NU + 240 * MIN);
  assert.notEqual(t.ankomstMs, t.registreretMs,
    "gemmer vi kun ét, kan ingen se om det er en iagttagelse eller en erindring");

  assert.equal(tidPaaStedetMin(t), 90);
  assert.equal(forsinkelseMin(t), 240, "meldt 4 timer senere — svagere dokumentation");
});

test("afgang før ankomst afvises", () => {
  assert.throws(() => byggTidsregistrering({ ankomstMs: NU, afgangMs: NU - MIN }), /før ankomst/);
});

test("tid på stedet er beregnet, ikke gemt", () => {
  /* Et gemt varighedsfelt driver fra sine endepunkter, første gang nogen
     retter et klokkeslæt. */
  const t = byggTidsregistrering({ ankomstMs: NU }, NU);
  assert.equal(t.afgangMs, null);
  assert.equal(tidPaaStedetMin(t), null, "uden afgang er varigheden ukendt, ikke nul");
});

/* ---- 2. Underskrift ---------------------------------------------------- */

test("en underskrift uden navn er ikke et bevis", () => {
  assert.throws(() => byggUnderskrift({ navn: "   ", billedeSti: "s/1.png" }), /navnet/);
});

test("underskriften kan aldrig overskrives", () => {
  assert.equal(maaOverskriveUnderskrift(), false,
    "kan den redigeres bagefter, beviser den ingenting");
});

test("billedet ligger i Storage — kun stien i databasen", () => {
  const u = byggUnderskrift({ navn: "Preben Sørensen", billedeSti: "underskrifter/ind-001.png" }, NU);
  assert.equal(u.billedeSti, "underskrifter/ind-001.png");
  assert.equal(u.navn, "Preben Sørensen");
  assert.equal(u.personId, null, "en kundes lagerchef har intet personId hos os");
});

test("en påbegyndt underskrift uden navn blokerer afslutningen", () => {
  const i = indb({ forloeb: "afventerFaktura", omkostningOere: 100, underskrift: { navn: "" } });
  assert.ok(kanAfslutte(i).aarsager.some((a) => /navnet/.test(a)));
});

/* ---- 3. Materialeforbrug — KOBLINGEN TIL FAKTURAGRUNDLAGET ------------- */

test("mængden er i SAMME skala som grundlagets antal", () => {
  /* ⚠ Den vigtigste linje i filen. To forskellige skalaer ville fakturere
     tusind gange for meget eller for lidt, og fejlen opdages på fakturaen. */
  assert.equal(MAENGDE_SKALA, ANTAL_SKALA);
});

test("en materialelinje bliver til en GYLDIG grundlagslinje", () => {
  /* Prøvet med grundlag.js' egen validator frem for et håndskrevet objekt —
     ellers kan de to drive fra hinanden uden at testen opdager det. */
  const i = indb();
  const m = materiale();
  const linje = grundlagslinjeFraMateriale(i, m, { satsOere: 45_00, momssats: 25 });

  assert.deepEqual(validerLinje(linje), [], "grundlag.js skal selv sige god for den");
  assert.equal(linje.art, LINJE_ART.materiale.art);
  assert.equal(talFraAntal(linje.antal), 2, "2,0 m bliver 2,0 m — ikke 2000");
  assert.equal(linje.enhed, "m");
  assert.equal(linjeBeloebOere(linje), 90_00, "2 m à 45,00 kr.");
  assert.equal(linje.kilde.type, "indberetning");
  assert.equal(linje.kilde.id, "ind-001");
});

test("SALGSPRISEN GÆTTES IKKE — og den er ikke kostprisen", () => {
  /* Brugte vi indkøbsprisen som sats, ville avancen forsvinde på hver linje
     uden at noget så forkert ud. */
  assert.throws(
    () => grundlagslinjeFraMateriale(indb(), materiale(), { momssats: 25 }),
    /satsOere mangler/
  );
});

test("momssatsen føres med og gættes heller ikke", () => {
  const linje = grundlagslinjeFraMateriale(indb(), materiale(), { satsOere: 45_00 });
  assert.equal(linje.momssats, null, "ikke 25 — den blokerer eksporten længere fremme");
  /* Men den blokerer ikke HER: man skal kunne skrive grundlaget færdigt og
     spørge bogholderen bagefter. */
  assert.deepEqual(validerLinje(linje), []);
});

test("materiale på egen bil kan ikke faktureres — der er ingen kunde", () => {
  /* En reparation på vores egen lastbil er en driftsudgift. Uden dette tjek
     kunne den blive til en linje på en tilfældig kundes regning. */
  const eget = indb({ bookingId: null });
  const tjek = kanFaktureres(eget, materiale());
  assert.equal(tjek.ok, false);
  assert.match(tjek.aarsag, /ingen kunde/);
  assert.throws(() => grundlagslinjeFraMateriale(eget, materiale(), { satsOere: 45_00 }), /ingen kunde/);
});

test("EN GENTAGELSE MÅ IKKE BLIVE EN FORDOBLING", () => {
  /* Er materialet allerede faktureret, skal et nyt kald afvises frem for at
     lave linje nummer to. Samme princip som to-vejs-referencen på grundlaget. */
  const brugt = materiale({ overskriv: { grundlagslinjeId: "grl-004-l9" } });
  assert.equal(kanFaktureres(indb(), brugt).ok, false);
  assert.throws(() => grundlagslinjeFraMateriale(indb(), brugt, { satsOere: 45_00 }), /allerede/);

  const trukket = materiale({ overskriv: { lagertraekId: "lt-3" } });
  assert.throws(() => lagertraekFraMateriale(indb(), trukket), /allerede trukket/);
});

test("ÉN HÆNDELSE, TO POSTERINGER — salget og forbruget er ikke det samme", () => {
  const i = indb();
  const m = materiale();
  const salg = grundlagslinjeFraMateriale(i, m, { satsOere: 45_00, momssats: 25 });
  const forbrug = lagertraekFraMateriale(i, m);

  /* Samme mængde, samme vare — men lagertrækket bærer INGEN pris. Hvad
     materialet kostede, ved lageret, ikke chaufføren. To kilder til kostprisen
     ville gøre denne til den dårligste. */
  assert.equal(forbrug.maengde, salg.antal);
  assert.ok(!("satsOere" in forbrug));
  assert.ok(!("beloebOere" in forbrug));
  assert.equal(forbrug.lagerId, "lager-hoved");
});

test("mængden skal være tusinddele som heltal", () => {
  assert.throws(() => byggMateriallinje({ vare: "Spændebånd", maengde: 2.5, enhed: "stk" }), /tusinddele/);
  assert.throws(() => byggMateriallinje({ vare: "", maengde: 1000, enhed: "stk" }), /vare mangler/);
});

/* ---- Brændstof --------------------------------------------------------- */

test("km/l regnes på differencen mellem målerstande", () => {
  const t = [
    { kmStand: 100_000, liter: 300 },
    { kmStand: 101_000, liter: 320 },   /* 1000 km på 320 l */
    { kmStand: 102_000, liter: 280 },   /* 1000 km på 280 l */
  ];
  /* 2000 km / 600 l */
  assert.equal(forbrugKmPrLiter(t).toFixed(3), (2000 / 600).toFixed(3));
});

test("én tankning giver ingen km/l — der skal to målerstande til", () => {
  assert.equal(forbrugKmPrLiter([{ kmStand: 100_000, liter: 300 }]), null);
  assert.equal(forbrugKmPrLiter([]), null);
});

test("AdBlue tæller ikke med i km/l", () => {
  const uden = forbrugKmPrLiter([
    { kmStand: 100_000, liter: 300 },
    { kmStand: 101_000, liter: 300 },
  ]);
  const med = forbrugKmPrLiter([
    { kmStand: 100_000, liter: 300, adBlueLiter: 15 },
    { kmStand: 101_000, liter: 300, adBlueLiter: 15 },
  ]);
  /* Lagde vi AdBlue til, ville forbruget se ~5 % bedre ud — lige lidt nok til
     at ingen opdager det, og lige meget nok til at en sammenligning mellem to
     biler bliver forkert. */
  assert.equal(uden, med);
});
