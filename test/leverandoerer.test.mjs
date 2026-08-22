/* test/leverandoerer.test.mjs
 * Prislister og performance. Beslutning 25.
 *
 * De to prøver der betyder mest: at en pris slås op PÅ EN DATO frem for som
 * "den nyeste", og at et nøgletal med for tyndt grundlag giver null frem for
 * en procent. Begge er fejl der ville se ud som tal og læses som viden.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  prisPaa, gaeldendePrisliste, kommendePriser,
  beregnNoegletal, MINDSTE_GRUNDLAG, maalTekst, MAALING_AARSAG,
  prisafvigelseTone, PRISAFVIGELSE_GRAENSE_FAST_PCT,
} from "../src/fleet/leverandoerer.js";

const D = 24 * 60 * 60 * 1000;
const NU = Date.UTC(2026, 7, 9);
const MARTS = Date.UTC(2026, 2, 1);
const JUNI = Date.UTC(2026, 5, 1);
const OKTOBER = Date.UTC(2026, 9, 1);

const lev = (o = {}) => ({
  id: o.id ?? "lv-mercedes",
  navn: "Mercedes Greve",
  aftale: o.aftale ?? { type: "fastaftale" },
  prisliste: o.prisliste ?? [
    { varenummer: "OLIE-5W30", vare: "Motorolie 5W30", enhed: "l", prisOere: 4_200, gyldigFra: MARTS },
    { varenummer: "OLIE-5W30", vare: "Motorolie 5W30", enhed: "l", prisOere: 4_600, gyldigFra: JUNI },
    { varenummer: "OLIE-5W30", vare: "Motorolie 5W30", enhed: "l", prisOere: 4_900, gyldigFra: OKTOBER },
    { varenummer: "FILT-880", vare: "Oliefilter", enhed: "stk", prisOere: 21_500, gyldigFra: MARTS },
  ],
  ...o,
});

/* ---- Prislisten -------------------------------------------------------- */

test("EN SATS OVERSKRIVES ALDRIG — prisen slås op på en dato", () => {
  /* Et indkøb i april skal måles mod aprilprisen. Målte vi mod dagens, ville
     en faktura fra marts pludselig se forkert ud, og afvigelsen ville pege på
     leverandøren frem for på vores egen prisregulering. */
  assert.equal(prisPaa(lev(), "OLIE-5W30", Date.UTC(2026, 3, 15)).prisOere, 4_200);
  assert.equal(prisPaa(lev(), "OLIE-5W30", Date.UTC(2026, 6, 15)).prisOere, 4_600);
});

test("en kommende regulering gælder ikke endnu", () => {
  /* Oktoberprisen står i listen allerede — det er hele pointen med at kunne
     se en prisstigning før den rammer. Men den må ikke bruges i august. */
  assert.equal(prisPaa(lev(), "OLIE-5W30", NU).prisOere, 4_600);
  const kommende = kommendePriser(lev(), NU);
  assert.equal(kommende.length, 1);
  assert.equal(kommende[0].prisOere, 4_900);
});

test("en vare der ikke fandtes endnu, giver null — ikke den nyeste pris", () => {
  /* Et opslag der altid svarer, kan ikke skelne "ukendt" fra "kendt", og så
     regnes prisafvigelsen mod et tal vi fandt på. */
  assert.equal(prisPaa(lev(), "OLIE-5W30", Date.UTC(2026, 0, 1)), null);
  assert.equal(prisPaa(lev(), "FINDES-IKKE", NU), null);
});

test("den gældende prisliste har én række pr. vare", () => {
  const liste = gaeldendePrisliste(lev(), NU);
  assert.equal(liste.length, 2, "fire poster, to varer");
  assert.equal(liste.find((p) => p.varenummer === "OLIE-5W30").prisOere, 4_600);
});

/* ---- Nøgletallene ------------------------------------------------------ */

const indkoeb = (n, o = {}) => ({
  id: `ink-${n}`,
  leverandoerId: "lv-mercedes",
  datoMs: NU - 30 * D,
  beloebOere: o.beloebOere ?? 10_000_00,
  varenummer: o.varenummer ?? "OLIE-5W30",
  prisOere: o.prisOere ?? 4_600,
  aftaltLeveringMs: o.aftaltLeveringMs,
  leveretMs: o.leveretMs,
  ...o,
});

test("ET NØGLETAL UDEN GRUNDLAG ER VILDLEDENDE — under grænsen giver null", () => {
  /* To leveringer, én forsinket. 50 % ville se ud præcis som en leverandør
     med hundrede leveringer og halvdelen forsinket. */
  const to = [
    indkoeb(1, { aftaltLeveringMs: NU - 10 * D, leveretMs: NU - 10 * D }),
    indkoeb(2, { aftaltLeveringMs: NU - 9 * D, leveretMs: NU - 5 * D }),
  ];
  const n = beregnNoegletal(lev(), { indkoeb: to });
  assert.equal(n.leveringspraecisionPct.vaerdi, null);
  assert.equal(n.leveringspraecisionPct.grundlag, 2);
  assert.equal(n.leveringspraecisionPct.nokData, false);
  assert.ok(MINDSTE_GRUNDLAG > 2);
});

test("med grundlag nok kommer tallet frem, og grundlaget følger med", () => {
  const fire = [
    indkoeb(1, { aftaltLeveringMs: NU - 10 * D, leveretMs: NU - 10 * D }),
    indkoeb(2, { aftaltLeveringMs: NU - 9 * D, leveretMs: NU - 9 * D }),
    indkoeb(3, { aftaltLeveringMs: NU - 8 * D, leveretMs: NU - 8 * D }),
    indkoeb(4, { aftaltLeveringMs: NU - 7 * D, leveretMs: NU - 3 * D }),
  ];
  const n = beregnNoegletal(lev(), { indkoeb: fire });
  assert.equal(n.leveringspraecisionPct.vaerdi, 75);
  assert.equal(n.leveringspraecisionPct.grundlag, 4,
    "tallet må aldrig stå uden hvor mange det er regnet på");
});

test("et indkøb uden aftalt termin tæller ikke som til tiden", () => {
  /* At tælle det med ville pynte på tallet — man kan ikke være forsinket i
     forhold til en aftale der ikke findes. */
  const blandet = [
    indkoeb(1, { aftaltLeveringMs: NU - 10 * D, leveretMs: NU - 5 * D }),
    indkoeb(2), indkoeb(3), indkoeb(4), indkoeb(5),
  ];
  const n = beregnNoegletal(lev(), { indkoeb: blandet });
  assert.equal(n.leveringspraecisionPct.grundlag, 1, "kun den ene har en termin");
  assert.equal(n.leveringspraecisionPct.vaerdi, null);
});

test("prisafvigelsen måles mod prisen DA VI KØBTE", () => {
  /* Købt i april til 4.600 mod en aftalt aprilpris på 4.200 — knap 9,5 % over.
     Målte vi mod juniprisen, ville afvigelsen være nul, og en reel overpris
     ville forsvinde bag vores egen senere regulering. */
  const april = Date.UTC(2026, 3, 15);
  const poster = [1, 2, 3].map((n) =>
    indkoeb(n, { datoMs: april, prisOere: 4_600 })
  );
  const r = beregnNoegletal(lev(), { indkoeb: poster });
  assert.equal(r.prisafvigelsePct.vaerdi, 9.5);
});

test("manglende fakturaer har INGEN grænse — den første skal ses", () => {
  /* En optælling, ikke et gennemsnit. En tærskel ville skjule den ene
     manglende faktura, og det er netop den man skal rykke for. */
  const n = beregnNoegletal(lev(), { indkoeb: [indkoeb(1)], fakturaer: [] });
  assert.equal(n.manglendeFakturaer.vaerdi, 1);
  assert.equal(n.manglendeFakturaer.nokData, true, "ét indkøb er nok til at tælle det");
});

test("en ubesvaret sag har ingen svartid — den har en alder", () => {
  const sager = [
    { leverandoerId: "lv-mercedes", oprettetMs: NU - 5 * D, foersteSvarMs: NU - 5 * D + 2 * 3600000 },
    { leverandoerId: "lv-mercedes", oprettetMs: NU - 4 * D, foersteSvarMs: NU - 4 * D + 4 * 3600000 },
    { leverandoerId: "lv-mercedes", oprettetMs: NU - 3 * D, foersteSvarMs: NU - 3 * D + 6 * 3600000 },
    /* Ubesvaret. Regnede vi den med som en meget lang svartid, ville tallet
       blande "de svarer langsomt" med "de har ikke svaret". */
    { leverandoerId: "lv-mercedes", oprettetMs: NU - 30 * D, foersteSvarMs: null },
  ];
  /* ⚠ `sagerFindes` SKAL SIGES. Regnestykket er uændret; det der er nyt, er at
     kalderen skal erklære at kilden findes. Uden flaget kan et tomt array
     ikke skelnes fra "de har aldrig svaret" — og `sager/` findes ikke i
     `firebase.rules.json` endnu. Se beslutning 91. */
  const n = beregnNoegletal(lev(), { sager, sagerFindes: true });
  assert.equal(n.svartidTimer.grundlag, 3);
  assert.equal(n.svartidTimer.vaerdi, 4);
  assert.equal(n.svartidTimer.aarsag, null);
});

/**
 * ⚠ EN KILDE DER IKKE FINDES, ER IKKE ET TYNDT GRUNDLAG.
 *
 * De to peger på hver sin handling: byg noden, eller vent på flere sager.
 * Skærmen skrev "for lidt grundlag" på begge, og på den præmis blev et
 * demo-datasæt fodret ind ved siden af kundens rigtige indkøb — for ellers
 * "ville der stå nul". Det ville der ikke: `maal(0, 0)` giver null.
 */
test("⚠ UDEN sagerFindes ER SVARTIDEN 'kilden findes ikke'", () => {
  const n = beregnNoegletal(lev(), { sager: [] });
  assert.equal(n.svartidTimer.vaerdi, null);
  assert.equal(n.svartidTimer.aarsag, "ingenKilde");
  assert.equal(maalTekst(n.svartidTimer), "kilden findes ikke");
});

test("andelen af indkøbet regnes af ALT indkøb, ikke kun leverandørens eget", () => {
  const alle = [
    indkoeb(1, { beloebOere: 25_000_00 }),
    indkoeb(2, { beloebOere: 25_000_00 }),
    indkoeb(3, { beloebOere: 25_000_00 }),
    { id: "ink-9", leverandoerId: "lv-anden", beloebOere: 25_000_00 },
  ];
  const n = beregnNoegletal(lev(), { indkoeb: alle });
  assert.equal(n.andelAfIndkoebPct.vaerdi, 75);
  assert.equal(n.omsaetningOere, 75_000_00);
});

test("fakturaafvigelsen er et BELØB, ikke en procent — den skal krediteres", () => {
  const ind = [indkoeb(1, { beloebOere: 10_000_00 }), indkoeb(2, { beloebOere: 10_000_00 }),
               indkoeb(3, { beloebOere: 10_000_00 })];
  const fakturaer = [
    { id: "f1", leverandoerId: "lv-mercedes", indkoebId: "ink-1", beloebOere: 10_500_00 },
    { id: "f2", leverandoerId: "lv-mercedes", indkoebId: "ink-2", beloebOere: 10_000_00 },
    { id: "f3", leverandoerId: "lv-mercedes", indkoebId: "ink-3", beloebOere: 10_000_00 },
  ];
  const n = beregnNoegletal(lev(), { indkoeb: ind, fakturaer });
  assert.equal(n.fakturaafvigelseOere.vaerdi, 500_00);
});

/* ---- Den FAKTISKE form fra demo-indkoeb.js ----------------------------- */

test("nøgletallene regner på den rigtige indkøbsform, ikke en jeg fandt på", () => {
  /* ⚠ DENNE PRØVE ER GRUNDEN TIL AT indkoebBeloebOere() FINDES.
     Første udkast læste `beloebOere`, `datoMs` og `prisOere` — felter jeg
     havde forestillet mig. De rigtige linjer hedder `dato`, `antal` og
     `prisPrEnhedOere`, og beløbet BEREGNES af antal × pris. De øvrige prøver
     her i filen bruger den form jeg fandt på, og de ville derfor blive ved med
     at bestå selv om koden ikke kunne læse et eneste rigtigt indkøb. */
  const april = Date.UTC(2026, 3, 15);
  const rigtigeLinjer = [1, 2, 3].map((n) => ({
    id: `il-00${n}`,
    dato: april,
    leverandoerId: "lv-mercedes",
    vare: "Motorolie 5W30",
    varenummer: "OLIE-5W30",
    antal: 20,
    enhed: "l",
    prisPrEnhedOere: 4_600,
  }));

  const n = beregnNoegletal(lev(), { indkoeb: rigtigeLinjer });

  /* 20 l à 46,00 kr. × 3 linjer */
  assert.equal(n.omsaetningOere, 3 * 20 * 4_600);
  assert.equal(n.andelAfIndkoebPct.vaerdi, 100);
  /* Og prisen måles mod APRILPRISEN (4.200), fundet via linjens `dato`. */
  assert.equal(n.prisafvigelsePct.vaerdi, 9.5);
});

/* ---- Tonen afhænger af aftaleformen ------------------------------------ */

test("SAMME TAL, TO BETYDNINGER: 4 % på en fastaftale er et brud, på spot er det markedet", () => {
  const fast = lev({ aftale: { type: "fastaftale" } });
  const spot = lev({ aftale: { type: "spot" } });
  assert.equal(prisafvigelseTone(fast, 4), "bad");
  assert.equal(prisafvigelseTone(spot, 4), "ok");
  assert.ok(PRISAFVIGELSE_GRAENSE_FAST_PCT < 10);
  /* En tabel der farvede dem ens, ville lære indkøberen at ignorere farven. */
});

test("ukendt afvigelse farves neutralt, ikke grønt", () => {
  /* Grønt ville betyde "i orden", og det ved vi ikke. */
  assert.equal(prisafvigelseTone(lev(), null), "info");
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ EN ANDEL AF ET UDSNIT ER IKKE EN ANDEL — beslutning 91
   ══════════════════════════════════════════════════════════════════════════

   `andelAfIndkoebPct` er tællerens andel af NÆVNEREN, og nævneren er
   tenantens samlede indkøb. Skærmene henter et vindue med en grænse på 500.
   Ramte listen loftet, er summen et UDSNIT — og en andel regnet af et udsnit
   er beslutning 6's fejl med et procenttegn på.

   ⚠ OG GRUNDLAGET AFSLØREDE DET IKKE, fordi det tælles på TÆLLEREN. En liste
   med kun én leverandørs linjer gav **100 %** med et grundlag der så
   tilstrækkeligt ud. Det er ikke en visningsfejl: skærmen rangerer
   leverandører, og "de står for 100 % af vores indkøb" er en anbefaling om at
   finde en anden.

   Begge skærme HAVDE oplysningen — `useListe` svarer `afkortet`, og
   Indkøbsoversigten skriver den endda på skærmen — den blev bare ikke sendt
   videre til regnestykket. */

test("⚠ EN AFKORTET LISTE GIVER INGEN ANDEL", () => {
  const alle = [
    indkoeb(1, { beloebOere: 25_000_00 }),
    indkoeb(2, { beloebOere: 25_000_00 }),
    indkoeb(3, { beloebOere: 25_000_00 }),
  ];
  const hel = beregnNoegletal(lev(), { indkoeb: alle });
  assert.equal(hel.andelAfIndkoebPct.vaerdi, 100, "uden andre leverandører ER andelen 100");

  const udsnit = beregnNoegletal(lev(), { indkoeb: alle, indkoebAfkortet: true });
  assert.equal(udsnit.andelAfIndkoebPct.vaerdi, null);
  assert.equal(udsnit.andelAfIndkoebPct.aarsag, "udsnit");
  assert.equal(maalTekst(udsnit.andelAfIndkoebPct), "kan ikke regnes af et udsnit");
});

test("⚠ MEN GRUNDLAGET FØLGER MED ALLIGEVEL", () => {
  /* "Vi har tre indkøb hos dem, og vi kan stadig ikke sige andelen" er en
     anden oplysning end "vi har nul". Uden tallet ville et afkortet svar se
     ud som et tomt. */
  const alle = [indkoeb(1), indkoeb(2), indkoeb(3)];
  const n = beregnNoegletal(lev(), { indkoeb: alle, indkoebAfkortet: true });
  assert.equal(n.andelAfIndkoebPct.grundlag, 3);
});

test("⚠ EN AFKORTET LISTE RØRER IKKE DE ANDRE FEM TAL", () => {
  /* Kun andelen har en NÆVNER der skal være fuldstændig. De andre fem er
     regnet på leverandørens egne linjer, og de er lige så rigtige i et
     udsnit — bliver de også nullet, siger skærmen "vi ved ingenting" om en
     leverandør vi ved en hel del om. */
  const alle = [
    indkoeb(1, { aftaltLeveringMs: NU, leveretMs: NU - 3600000 }),
    indkoeb(2, { aftaltLeveringMs: NU, leveretMs: NU - 3600000 }),
    indkoeb(3, { aftaltLeveringMs: NU, leveretMs: NU + 3600000 }),
  ];
  const n = beregnNoegletal(lev(), { indkoeb: alle, indkoebAfkortet: true });
  assert.equal(n.leveringspraecisionPct.nokData, true);
  assert.equal(n.leveringspraecisionPct.vaerdi, 67);
  assert.equal(n.manglendeFakturaer.vaerdi, 3);
});

test("⚠ ET TAL UDEN VÆRDI BÆRER ALTID EN GRUND", () => {
  /* Prøven kan ikke afgøre om grunden er SAND — men den kan afgøre om nogen
     har taget stilling. Samme greb som `null`-begrundelserne i kpi/. */
  const n = beregnNoegletal(lev(), { indkoeb: [indkoeb(1)], indkoebAfkortet: true });
  for (const [navn, m] of Object.entries(n)) {
    if (navn === "omsaetningOere") continue;
    if (m.nokData) {
      assert.equal(m.aarsag, null, `${navn} har både en værdi og en grund`);
    } else {
      assert.ok(MAALING_AARSAG[m.aarsag], `${navn} står tomt uden en kendt grund`);
    }
  }
});

test("de tre grunde har hver sin tekst — og ingen af dem er en streg", () => {
  const tekster = Object.values(MAALING_AARSAG);
  assert.equal(new Set(tekster).size, tekster.length, "to grunde deler tekst");
  for (const t of tekster) {
    assert.ok(t.length > 3 && t !== "—", `"${t}" siger ikke noget`);
  }
});
