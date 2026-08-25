/* test/opgaveflyt.test.mjs
 * At flytte en opgave — beslutning 49.
 *
 * HVORFOR FILEN FINDES. En flytning rører TO ting: opgavens vindue og dens
 * reservation. De bærer den samme kendsgerning — at ressourcen er optaget — og
 * lander de ikke sammen, står den ene og påstår noget den anden modsiger.
 * Den farlige halvdel er en opgave uden en dækkende reservation: den ser FRI
 * ud i disponeringen, og `etapeskift` disponerer bilen mens den står på liften.
 *
 * ⚠ REGNESTYKKET LIGGER I `opgaveplan-regler.js` OG IKKE I FUNKTIONEN, netop
 * for at de to fælder herunder kan prøves uden en emulator. Samme grund som
 * `beregnKpi()` ikke regnes i jobbet.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  FLYTBAR_STATUS, FLYTBARE_TYPER, PLANLAEGBAR_STATUS,
  flytEfter, erFlyttet, valideOpgaveflyt, flytOpdatering, MAKS_MINUTTER,
  kanFlyttes, valideOpgaveplan,
} from "../src/fleet/opgaveplan-regler.js";
import { ALLE_OPGAVE_STATUS } from "../src/fleet/opgaver.js";
import { tjekLedigMod } from "../src/fleet/reservations.js";

const T = 3600000;
const NU = Date.UTC(2026, 7, 24, 8, 0, 0);

/** En værkstedsopgave som noden bærer den — nodens feltnavne, ikke besøgets. */
const vaerksted = (x = {}) => ({
  art: "vaerksted", status: "planlagt",
  koeretoejId: "kt-1", arbejdstype: "service",
  beskrivelse: "Serviceeftersyn",
  startMs: NU, estimeretMin: 120,
  ...x,
});

/** En facility-opgave. Ressourcen er et anlæg ELLER en hel lokation. */
const facility = (x = {}) => ({
  art: "facility", status: "planlagt",
  aktivId: "fa-port3",
  beskrivelse: "Portmotor udskiftes",
  startMs: NU, estimeretMin: 240,
  ...x,
});

const UID = "u-disponent";

/* ══════════════════════════════════════════════════════════════════════════
   HVAD DER MÅ FLYTTES
   ══════════════════════════════════════════════════════════════════════════ */

describe("FLYTBAR_STATUS", () => {
  test("⚠ EN OPGAVE DER ER I GANG, FLYTTES IKKE", () => {
    /* Bilen står på liften NU. At flytte starttidspunktet bagud er at skrive
       historien om; at flytte det frem er at påstå at arbejdet ikke er
       begyndt. Det er samme slags nej som at der ingen vej er tilbage fra
       `returneret` paa et kasseudlaan. */
    const svar = valideOpgaveflyt(vaerksted({ status: "igang" }), { startMs: NU + T });
    assert.equal(svar.ok, false);
    assert.match(svar.fejl.status, /I gang/);
  });

  test("endestationerne kan heller ikke", () => {
    for (const status of ["udfoert", "annulleret"]) {
      const svar = valideOpgaveflyt(vaerksted({ status }), { startMs: NU + T });
      assert.equal(svar.ok, false, `${status} slap igennem`);
    }
  });

  test("⚠ indberettet KAN HELLER IKKE — den har intet vindue at flytte", () => {
    /* En indberetning kommer fra en chauffør i marken. Den er ikke planlagt
       endnu, så der er ingen tid at flytte den TIL en anden tid fra. */
    assert.equal(FLYTBAR_STATUS.includes("indberettet"), false);
  });

  test("hver værdi på listen er en status noden kender", () => {
    /* Samme selvkontrol som paa PLANLAEGBAR_STATUS: en tastefejl her ville
       spærre en status der findes, uden at nogen kunne se hvorfor. */
    for (const s of FLYTBAR_STATUS) {
      assert.ok(ALLE_OPGAVE_STATUS.includes(s), `"${s}" er ingen kendt status`);
    }
  });

  test("⚠ TO LISTER, IKKE ÉN KONSTANT — også når de er ens", () => {
    /* De svarer på hvert sit spørgsmål: hvad man må OPRETTE, og hvad man må
       FLYTTE. At de er ens i dag er et sammenfald. Slog vi dem sammen, ville
       den dag nogen vil kunne forlænge et estimat paa en opgave der er igang,
       ogsaa aabne for at OPRETTE en opgave der allerede er i gang. Proeven
       her holder ikke at de er ens — den holder at de er TO. */
    assert.notEqual(FLYTBAR_STATUS, PLANLAEGBAR_STATUS);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ARTEN FLYTTES IKKE MED
   ══════════════════════════════════════════════════════════════════════════ */

describe("arten bevares", () => {
  test("en værkstedsopgave kan ikke hænges på et anlæg", () => {
    const svar = valideOpgaveflyt(vaerksted(), {
      startMs: NU, estimeretMin: 120,
      ressourceType: "facilityAktiv", ressourceId: "fa-port3",
    });
    assert.equal(svar.ok, false);
    assert.match(svar.fejl.ressourceType, /kan ikke hænge/);
  });

  test("en facility-opgave kan ikke hænges på en bil", () => {
    const svar = valideOpgaveflyt(facility(), {
      startMs: NU, estimeretMin: 240,
      ressourceType: "koeretoej", ressourceId: "kt-1",
    });
    assert.equal(svar.ok, false);
    assert.match(svar.fejl.ressourceType, /kan ikke hænge/);
  });

  test("⚠ FACILITY HAR TO TYPER — anlægget og hele lokationen", () => {
    /* Lukker man hallen, er alle porte i den ogsaa optaget. De to er hver sin
       ressourcetype i reservationsnoden, og derfor er raekkens id ikke nok. */
    assert.deepEqual(FLYTBARE_TYPER.facility, ["facilityAktiv", "lokation"]);
    assert.deepEqual(FLYTBARE_TYPER.vaerksted, ["koeretoej"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   flytEfter — posten som den bliver
   ══════════════════════════════════════════════════════════════════════════ */

describe("flytEfter", () => {
  test("en bil skifter koeretoejId", () => {
    const e = flytEfter(vaerksted(), {
      startMs: NU + 2 * T, ressourceType: "koeretoej", ressourceId: "kt-9",
    });
    assert.equal(e.koeretoejId, "kt-9");
    assert.equal(e.startMs, NU + 2 * T);
    assert.equal(e.art, "vaerksted");
  });

  test("⚠ AT FLYTTE TIL EN LOKATION RYDDER aktivId", () => {
    /* ressourceId() foretraekker anlaegget. Blev feltet staaende, ville
       reservationen stadig pege paa PORTEN mens brugeren har sluppet blokken
       paa HALLEN — og saa spaerrer den ét anlaeg i stedet for hele stedet. */
    const e = flytEfter(facility({ lokationId: "lok-halb" }), {
      ressourceType: "lokation", ressourceId: "lok-halb",
    });
    assert.equal(e.aktivId, null);
    assert.equal(e.lokationId, "lok-halb");
  });

  test("at flytte til et anlæg sætter aktivId og lader lokationen stå", () => {
    /* Lokationen er hvor anlaegget STAAR — den er ikke et alternativ til det,
       den er dets adresse. Ryddede vi den, mistede vi hvor porten sidder. */
    const e = flytEfter(facility({ aktivId: null, lokationId: "lok-halb" }), {
      ressourceType: "facilityAktiv", ressourceId: "fa-port5",
    });
    assert.equal(e.aktivId, "fa-port5");
    assert.equal(e.lokationId, "lok-halb");
  });

  test("uden en række rører den kun tiden", () => {
    const foer = vaerksted();
    const e = flytEfter(foer, { startMs: NU + T });
    assert.equal(e.koeretoejId, foer.koeretoejId);
    assert.equal(e.startMs, NU + T);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   VINDUET GÆTTES IKKE
   ══════════════════════════════════════════════════════════════════════════ */

describe("vinduet", () => {
  test("uden estimat er der intet at reservere", () => {
    const svar = valideOpgaveflyt(vaerksted({ estimeretMin: null }), { startMs: NU + T });
    assert.equal(svar.ok, false);
    /* ⚠ OG SÆTNINGEN ER kanFlyttes' EGEN, ikke formularens. Den forklarer
       hvorfor blokken ikke kan traekkes — at den ENE TIME gitteret tegner,
       ikke er en varighed nogen har besluttet. Skrev tidsfelter() oven i den,
       ville skaermen vise det ene og serveren afvise med det andet. */
    assert.equal(svar.fejl.estimeretMin, kanFlyttes(vaerksted({ estimeretMin: null })).aarsag);
  });

  test("⚠ ET MANGLENDE STARTTIDSPUNKT FÅR SAMME SÆTNING SOM VED OPRETTELSEN", () => {
    /* tidsfelter() staar ét sted netop derfor: brugeren skal ikke faa to
       forklaringer paa én spaerring, alt efter hvordan han kom til den.
       ⚠ ESTIMATET ER UNDTAGELSEN, og den er bevidst — se proeven ovenfor:
       dér er flytningens egen sætning den rigtige, fordi den forklarer
       gitterets ene time. Starttidspunktet har ingen saadan forskel. */
    const foer = vaerksted({ startMs: null });
    const flyt = valideOpgaveflyt(foer, {});
    const plan = valideOpgaveplan({ ...foer, art: "vaerksted" });
    assert.equal(flyt.fejl.startMs, plan.fejl.startMs);
    assert.match(flyt.fejl.startMs, /Vælg en startdato/);
  });

  test("loftet på 90 døgn gælder også en flytning", () => {
    const svar = valideOpgaveflyt(vaerksted(), {
      startMs: NU, estimeretMin: MAKS_MINUTTER + 1,
    });
    assert.equal(svar.ok, false);
    assert.match(svar.fejl.estimeretMin, /90 døgn/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   EN FLYTNING DER IKKE FLYTTER NOGET
   ══════════════════════════════════════════════════════════════════════════ */

describe("uændret", () => {
  test("⚠ SLIPPER MAN BLOKKEN HVOR DEN LÅ, SKRIVES DER IKKE", () => {
    /* En auditpost der siger at opgaven blev flyttet, naar den ikke blev det,
       goer resten af loggen mindre vaerd. */
    const foer = vaerksted();
    const svar = valideOpgaveflyt(foer, {
      startMs: foer.startMs, estimeretMin: foer.estimeretMin,
      ressourceType: "koeretoej", ressourceId: foer.koeretoejId,
    });
    assert.equal(svar.ok, false);
    assert.match(svar.fejl._intet, /ikke noget at flytte/);
  });

  test("erFlyttet ser en ryddet aktivId", () => {
    const foer = facility({ lokationId: "lok-halb" });
    const efter = flytEfter(foer, { ressourceType: "lokation", ressourceId: "lok-halb" });
    assert.equal(erFlyttet(foer, efter), true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   FÆLDE 1 — SAMME RESSOURCE ER SAMME NØGLE
   ══════════════════════════════════════════════════════════════════════════ */

describe("⚠ FÆLDE 1: samme sti må ikke nulstilles", () => {
  test("en flytning på samme bil skriver ÉN reservationssti og ingen null", () => {
    /* Et objekt har kun én vaerdi pr. noegle. Satte vi den gamle sti til null
       OG den nye post paa den samme noegle, ville rækkefølgen i kildeteksten
       afgoere hvilken der overlevede — og landede null sidst, forsvandt
       reservationen mens bilen stod paa liften. */
    const foer = vaerksted();
    const { opdatering, gammelSti, nySti } = flytOpdatering(
      "op-1", foer,
      { startMs: NU + 2 * T, ressourceType: "koeretoej", ressourceId: "kt-1" },
      { uid: UID, nu: NU });

    assert.equal(gammelSti, nySti);
    const stier = Object.keys(opdatering).filter((k) => k.startsWith("reservationer/"));
    assert.deepEqual(stier, ["reservationer/koeretoej/kt-1/res-op-1"]);
    assert.notEqual(opdatering[stier[0]], null);
    assert.equal(opdatering[stier[0]].fra, NU + 2 * T);
  });

  test("en flytning til en ANDEN bil nulstiller den gamle", () => {
    /* Blev den staaende, ville den foerste bil se optaget ud resten af dagen —
       og den naeste disponent ville lede efter et arbejde der ikke findes.
       Samme regel som at etapeskift frigiver ved en annullering. */
    const { opdatering, gammelSti, nySti } = flytOpdatering(
      "op-1", vaerksted(),
      { startMs: NU, ressourceType: "koeretoej", ressourceId: "kt-9" },
      { uid: UID, nu: NU });

    assert.equal(gammelSti, "reservationer/koeretoej/kt-1/res-op-1");
    assert.equal(nySti, "reservationer/koeretoej/kt-9/res-op-1");
    assert.equal(opdatering[gammelSti], null);
    assert.equal(opdatering[nySti].fra, NU);
  });

  test("⚠ OG DEN ÆNDRER OGSÅ SELVE OPGAVEN — ikke kun reservationen", () => {
    /* De to baerer den SAMME kendsgerning. Flyttede vi kun reservationen,
       ville opgaven staa paa den gamle bil og reservationen paa den nye. */
    const { opdatering } = flytOpdatering(
      "op-1", vaerksted(),
      { startMs: NU + T, ressourceType: "koeretoej", ressourceId: "kt-9" },
      { uid: UID, nu: NU });

    assert.equal(opdatering["opgaver/op-1/koeretoejId"], "kt-9");
    assert.equal(opdatering["opgaver/op-1/startMs"], NU + T);
  });

  test("kun de felter der faktisk skiftede, skrives", () => {
    /* En skrivning af et uaendret felt er en skrivning der ikke betyder
       noget — og den ville staa i historikken som om den gjorde. */
    const { opdatering } = flytOpdatering(
      "op-1", vaerksted(), { startMs: NU + T }, { uid: UID, nu: NU });
    assert.equal("opgaver/op-1/koeretoejId" in opdatering, false);
    assert.equal("opgaver/op-1/estimeretMin" in opdatering, false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   FÆLDE 2 — OPGAVEN KONFLIKTER MED SIG SELV
   ══════════════════════════════════════════════════════════════════════════ */

describe("⚠ FÆLDE 2: opgaven må ikke spærre for sig selv", () => {
  test("den nye reservation bærer sit udledte id", () => {
    const { ny } = flytOpdatering(
      "op-1", vaerksted(),
      { startMs: NU + T, ressourceType: "koeretoej", ressourceId: "kt-1" },
      { uid: UID, nu: NU });
    assert.equal(ny.id, "res-op-1");
  });

  test("tjekLedigMod filtrerer opgavens EGEN gamle reservation fra", () => {
    /* Uden id'et ville en flytning paa to timer paa samme bil ALTID blive
       afvist — af opgaven selv. Den overlapper naturligvis sig selv. */
    const { ny } = flytOpdatering(
      "op-1", vaerksted(),
      { startMs: NU + T, ressourceType: "koeretoej", ressourceId: "kt-1" },
      { uid: UID, nu: NU });

    const paaBilen = [{
      id: "res-op-1", fra: NU, til: NU + 2 * T,
      kilde: { type: "vaerksted", id: "op-1", reference: null },
    }];
    assert.equal(tjekLedigMod(paaBilen, ny).ok, true);
  });

  test("men en ANDEN post på samme bil spærrer stadig", () => {
    /* Filtreringen maa ramme praecis én post. Ramte den bredere, ville
       flytningen kunne lande oven i en booking uden at nogen saa det. */
    const { ny } = flytOpdatering(
      "op-1", vaerksted(),
      { startMs: NU + T, ressourceType: "koeretoej", ressourceId: "kt-1" },
      { uid: UID, nu: NU });

    const paaBilen = [{
      id: "res-op-2", fra: NU, til: NU + 4 * T,
      kilde: { type: "vaerksted", id: "op-2", reference: null },
    }];
    const svar = tjekLedigMod(paaBilen, ny);
    assert.equal(svar.ok, false);
    assert.equal(svar.konflikter.length, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   EN OPGAVE UDEN ESTIMAT HAR INGEN GAMMEL RESERVATION
   ══════════════════════════════════════════════════════════════════════════ */

describe("⚠ INTET VINDUE, INGEN GAMMEL RESERVATION", () => {
  test("gammelSti er null når posten aldrig fik en", () => {
    /* reservationFraOpgave() kaster paa et manglende vindue frem for at
       gaette et, saa der blev aldrig skrevet en reservation. En sti bygget
       paa et gaettet vindue ville slette en ANDEN opgaves reservation. */
    const { opdatering, gammelSti } = flytOpdatering(
      "op-1", vaerksted({ estimeretMin: null }),
      { startMs: NU, estimeretMin: 60, ressourceType: "koeretoej", ressourceId: "kt-1" },
      { uid: UID, nu: NU });

    assert.equal(gammelSti, null);
    assert.equal(Object.values(opdatering).includes(null), false);
    assert.equal(opdatering["reservationer/koeretoej/kt-1/res-op-1"].til, NU + 60 * 60000);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   FACILITY: TO RESSOURCETYPER I ÉN NODE
   ══════════════════════════════════════════════════════════════════════════ */

describe("facility", () => {
  test("et besøg på et anlæg spærrer anlægget", () => {
    const { nySti } = flytOpdatering(
      "fs-1", facility(),
      { startMs: NU + T, ressourceType: "facilityAktiv", ressourceId: "fa-port5" },
      { uid: UID, nu: NU });
    assert.equal(nySti, "reservationer/facilityAktiv/fa-port5/res-fs-1");
  });

  test("⚠ ET BESØG UDEN ANLÆG SPÆRRER HELE LOKATIONEN", () => {
    /* Og stien skifter TYPE, ikke bare id. Epoxybehandlingen af gulvet lukker
       hallen, og saa er alle porte i den ogsaa optaget. */
    const { gammelSti, nySti, opdatering } = flytOpdatering(
      "fs-1", facility({ lokationId: "lok-halb" }),
      { ressourceType: "lokation", ressourceId: "lok-halb" },
      { uid: UID, nu: NU });

    assert.equal(gammelSti, "reservationer/facilityAktiv/fa-port3/res-fs-1");
    assert.equal(nySti, "reservationer/lokation/lok-halb/res-fs-1");
    assert.equal(opdatering[gammelSti], null);
    assert.equal(opdatering["opgaver/fs-1/aktivId"], null);
  });

  test("kilden er facilitySag, ikke vaerksted", () => {
    /* Prioriteten foelger kilden: vaerksted 40, facilitySag 20. Bar en
       facility-flytning kilden "vaerksted", ville en portreparation slaa en
       booking af vejen. */
    const { ny } = flytOpdatering(
      "fs-1", facility(),
      { startMs: NU + T, ressourceType: "facilityAktiv", ressourceId: "fa-port3" },
      { uid: UID, nu: NU });
    assert.equal(ny.kilde.type, "facilitySag");
  });

  test("en facility-opgave uden både anlæg og lokation afvises", () => {
    /* Den har ingen ressource at haenge paa, og reservationFraOpgave() ville
       kaste inde i funktionen frem for at svare brugeren noget. */
    const svar = valideOpgaveflyt(
      facility({ aktivId: "fa-port3", lokationId: null }),
      { ressourceType: "lokation", ressourceId: "" });
    assert.equal(svar.ok, false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KAN DEN OVERHOVEDET FLYTTES — spørgsmålet gitteret stiller FØR trækket
   ══════════════════════════════════════════════════════════════════════════ */

describe("kanFlyttes", () => {
  test("⚠ EN OPGAVE UDEN ESTIMAT KAN IKKE FLYTTES — heller ikke i tid", () => {
    /* DEN VIGTIGE AF DE TRE. Gitteret tegner en opgave uden estimat som ÉN
       TIME, saa den kan ses og klikkes. Regnede skaermen flytningens nye
       varighed ud af blokkens egen tegning, ville den time blive til et
       rigtigt estimeretMin — og bilen ville vaere spaerret en time ingen har
       besluttet, fordi vi engang havde brug for at kunne SE blokken. */
    const svar = kanFlyttes(vaerksted({ estimeretMin: null }));
    assert.equal(svar.ok, false);
    assert.equal(svar.felt, "estimeretMin");
    assert.match(svar.aarsag, /ikke\s+en varighed nogen har besluttet/);
  });

  test("den svarer på tre ting og kender ikke destinationen", () => {
    /* Gitteret skal saette markoeren FOER der traekkes. En blok der ser ud til
       at kunne traekkes, og som afvises naar man slipper den, lover noget. */
    assert.equal(kanFlyttes(vaerksted()).ok, true);
    assert.equal(kanFlyttes(facility()).ok, true);
    assert.equal(kanFlyttes(vaerksted({ status: "udfoert" })).felt, "status");
    assert.equal(kanFlyttes({ art: "ukendt" }).felt, "art");
    assert.equal(kanFlyttes(null).felt, "art");
  });

  test("⚠ SAMME SÆTNING SOM valideOpgaveflyt GIVER", () => {
    /* To formuleringer af én spaerring er to forklaringer paa én ting.
       Skaermen viser kanFlyttes(); serveren afviser med valideOpgaveflyt().
       Sagde de hver sit, ville brugeren se det ene og faa det andet. */
    const post = vaerksted({ status: "igang" });
    const kort = kanFlyttes(post);
    const fuld = valideOpgaveflyt(post, { startMs: NU + 3600000 });
    assert.equal(fuld.fejl.status, kort.aarsag);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   HÅNDHÆVELSEN — at funktionen findes, er ikke at den håndhæver noget
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";

const kilde = readFileSync("functions/index.js", "utf8");
const blok = (() => {
  const start = kilde.indexOf("export const opgaveflyt");
  assert.ok(start >= 0, "functions/index.js har ingen opgaveflyt");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
})();

describe("opgaveflyt håndhæver det skærmen viser", () => {
  test("⚠ KALDER SKÆRMENS EGEN VALIDERING, ikke en afskrift", () => {
    assert.ok(blok.includes("valideOpgaveflyt("), "valideOpgaveflyt kaldes ikke");
    assert.ok(blok.includes("flytOpdatering("), "opdateringen bygges ikke ét sted");
    assert.ok(kilde.includes('from "./delt/opgaveplan-regler.js"'));
  });

  test("⚠ REGNESTYKKET LIGGER IKKE I FUNKTIONEN", () => {
    /* Samme grund som beregnKpi() ikke regnes i jobbet: laa de to faelder —
       samme sti er samme noegle, og opgaven konflikter med sig selv — her,
       kunne de kun proeves ved at koere funktionen mod en emulator. */
    /* Det ENE sted funktionen naevner noden, er dér den LAESER hvad der
       allerede staar paa ressourcen. Selve POSTENS sti — den med res-id'et —
       bygges kun ét sted, og det er i flytOpdatering(). */
    /* ⚠ KRAVET ER PAA POSTENS STI, IKKE PAA ANTALLET AF LAESNINGER.
       Proeven kraevede foer PRAECIS én sti, og faldt da indeslutningen
       (beslutning 90) tilfoejede en laesning MERE — hallens, naar der
       reserveres paa en port. Den laesning er rigtig; det der stadig ikke maa
       ske, er at funktionen bygger POSTENS sti med res-id'et selv.

       En proeve der taeller, siger nej til en udvidelse den ikke har en
       mening om. Den spoerger nu om det den faktisk skal beskytte: to
       segmenter efter `reservationer/`, aldrig tre. */
    const stier = blok.match(/`reservationer\/[^`]*`/g) || [];
    assert.ok(stier.length > 0, "funktionen laeser slet ikke reservationer");
    const forDybe = stier.filter((s) => s.split("/").length > 3);
    assert.deepEqual(forDybe, [],
      "funktionen bygger selv reservationspostens sti i stedet for at bruge flytOpdatering()");
  });

  test("⚠ PERMISSIONEN, IKKE ROLLEN", () => {
    assert.match(blok, /perms\.includes\("\|opgaver\.skriv\|"\)/);
    assert.ok(!/rolle === "(admin|disponent)"/.test(blok),
      "der spørges på rollen frem for på permissionen");
  });

  test("⚠ ABONNEMENT, TENANT OG MODUL PRØVES — admin-SDK'et går uden om reglerne", () => {
    assert.ok(blok.includes('child("abonnement/status")'), "abonnementet prøves ikke");
    assert.ok(blok.includes('child("_findes")'), "tenanten prøves ikke");
    assert.ok(blok.includes("MODUL_FOR_ART"), "modulspærringen prøves ikke");
  });

  test("⚠ MODULET FØLGER ARTEN — ikke en fast nøgle", () => {
    /* Spurgte den altid om Fleet, kunne en kunde der KUN har Facility, ikke
       flytte sine egne servicebesoeg. Spurgte den ikke om noget, var
       funktionen en aaben doer rundt om modulspaerringen. */
    assert.match(kilde, /MODUL_FOR_ART = \{ vaerksted: "flaade", facility: "facility" \}/);
  });

  test("⚠ ARTEN KOMMER FRA NODEN, IKKE FRA KLIENTEN", () => {
    /* opgaveplanlaeg SAETTER art fordi den opretter. Her ville det samme vaere
       en fejl: en flytning der kunne skifte art, kunne lave en
       vaerkstedsopgave om til en facility-opgave — to feltskemaer, én post. */
    assert.ok(!/art:\s*kortStreng\(d\.art/.test(blok), "arten tages fra klienten");
    assert.ok(!/art:\s*"vaerksted"/.test(blok), "funktionen sætter en art");
    assert.ok(blok.includes("MODUL_FOR_ART[foer.art]"), "arten læses ikke af posten");
  });

  test("⚠ ALT LANDER I ÉN rod.update()", () => {
    /* Opgavens felter, den gamle reservation VAEK og den nye paa plads —
       sammen eller slet ikke. Den farlige halvdel er en opgave uden en
       daekkende reservation: den ser FRI ud i disponeringen. */
    assert.equal((blok.match(/await rod\.update\(/g) || []).length, 1,
      "der skrives i mere end ét kald");
  });

  test("⚠ LEDIGHEDEN PRØVES FØR SKRIVNINGEN", () => {
    const foerSkrivning = blok.slice(0, blok.indexOf("await rod.update("));
    assert.ok(foerSkrivning.includes("tjekLedigMod("), "ledigheden prøves ikke");
  });

  test("⚠ DEN OVERSKRIVER IKKE, HELLER IKKE NÅR DEN KUNNE", () => {
    /* At rydde en booking af vejen er et etapeskift med aarsag og historik —
       etapeskifts arbejde. Samme svar som opgaveplanlaeg giver. */
    assert.ok(blok.includes("kanOverskrive"), "svaret siger ikke hvad der kunne overskrives");
    assert.ok(!/tving:\s*true/.test(blok), "funktionen tvinger igennem");
  });

  test("⚠ RESSOURCEN SLÅS OP — begge arter", () => {
    /* En opgave kan ikke flyttes til en bil, et anlaeg eller en lokation der
       ikke findes. Uden opslaget ville reservationen haenge paa ingenting. */
    assert.ok(blok.includes('child(`koeretoejer/'), "bilen slås ikke op");
    assert.ok(blok.includes("facility/aktiver/"), "anlægget slås ikke op");
    assert.ok(blok.includes("facility/lokationer/"), "lokationen slås ikke op");
  });

  test("⚠ EN SOLGT ELLER SKROTTET ENHED KAN IKKE FÅ EN FLYTTET OPGAVE", () => {
    assert.match(blok, /"solgt".*"skrottet"|solgt[\s\S]{0,80}skrottet/);
  });

  test("⚠ FLYTNINGEN LOGGES — og oprettelsen gør nu også", () => {
    /* Hullet blev synligt da flytningen kom til: havde kun DEN logget, kunne
       man se at en opgave var flyttet, men ikke at den var oprettet. */
    assert.ok(blok.includes("logOpgave("), "flytningen logges ikke");
    assert.ok(kilde.includes("async function logOpgave("), "der er ingen auditpost for opgaver");
    const opret = kilde.slice(kilde.indexOf("export const opgaveplanlaeg"));
    assert.ok(opret.slice(0, opret.indexOf("\nexport const ", 1)).includes("logOpgave("),
      "opgaveplanlaeg logger stadig ikke");
  });

  test("⚠ FILERNE ER I DELTE_FILER — ellers fejler den ved DEPLOY", () => {
    for (const f of ["opgaveplan-regler.js", "opgaver.js", "reservations.js", "prioritet.js"]) {
      assert.ok(DELTE_FILER.includes(f), `${f} mangler i DELTE_FILER`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMENE — tre gitre, én funktion
   ══════════════════════════════════════════════════════════════════════════ */

describe("de to skærme kalder den samme funktion", () => {
  /* ⚠ SKIVE 3A — TO SKÆRME, IKKE TRE. Disponering.jsx flyttede
     værkstedsopgavens dagsgitter (og dermed flytOpgave()/kanFlyttes()/
     Planlaegdialog) til Fleet Driftskalenderen, som ALLEREDE stod her —
     to kalendre på den samme node er væk, ikke blevet tre. Se
     test/skive3a-planning-fleet.test.mjs. */
  const SKAERME = [
    "src/moduler/flaade/Vaerkstedskalender.jsx",
    "src/moduler/facility/Servicekalender.jsx",
  ];

  test("hver af dem flytter gennem flytOpgave()", () => {
    for (const sti of SKAERME) {
      const s = readFileSync(sti, "utf8");
      assert.ok(s.includes("flytOpgave("), `${sti} kalder ikke flytOpgave`);
      assert.ok(s.includes("onFlyt="), `${sti} giver gitteret ingen onFlyt`);
    }
  });

  test("⚠ INGEN AF DEM SKRIVER SELV", () => {
    /* `opgaver` og `reservationer` er begge .write: false, og de to baerer den
       SAMME kendsgerning. En klient kan kun skrive den ene halvdel. */
    for (const sti of SKAERME) {
      const s = readFileSync(sti, "utf8");
      assert.ok(!/db\.ref\(/.test(s), `${sti} skriver uden om serveren`);
      assert.ok(!/\.set\(|\.remove\(/.test(s), `${sti} skriver uden om serveren`);
    }
  });

  test("⚠ HVER AF DEM SPØRGER kanFlyttes() FØR TRÆKKET", () => {
    /* En blok der ser ud til at kunne traekkes, og som afvises naar man
       slipper den, lover noget. Og saetningen skal vaere serverens egen. */
    for (const sti of SKAERME) {
      const s = readFileSync(sti, "utf8");
      assert.ok(s.includes("kanFlyttes("), `${sti} har sin egen idé om hvad der kan flyttes`);
      assert.ok(s.includes("kanFlytte="), `${sti} giver gitteret intet kanFlytte`);
    }
  });

  test("⚠ INGEN AF DEM SENDER estimeretMin MED", () => {
    /* Blokkens `til` er ikke altid opgavens slutning: en opgave uden estimat
       tegnes som ÉN TIME, saa den kan ses og klikkes. Regnede en skaerm
       varigheden ud af blokkens tegning, ville den time blive et rigtigt
       estimat — og ressourcen vaere spaerret i et tidsrum ingen har besluttet.
       Det er den samme standardlaengde reservationFraOpgave() naegter at
       gaette, og den ville komme ind ad bagdoeren. */
    for (const sti of SKAERME) {
      const s = readFileSync(sti, "utf8");
      const kald = s.slice(s.indexOf("flytOpgave({"));
      assert.ok(!/estimeretMin/.test(kald.slice(0, kald.indexOf("})") + 2)),
        `${sti} regner et estimat ud af blokkens tegning`);
    }
  });

  test("⚠ FACILITY SENDER RÆKKENS TYPE MED, ikke kun dens id", () => {
    /* Et traek fra en port til en hal skifter ressourceTYPE — fra
       facilityAktiv til lokation — og saa spaerres hele stedet i stedet for ét
       anlaeg. Sendte skaermen kun id'et, skulle serveren gaette, og gaettet er
       forskellen paa at lukke en port og at lukke en hal. */
    const s = readFileSync("src/moduler/facility/Servicekalender.jsx", "utf8");
    assert.ok(s.includes("typeFor("), "skærmen afgør ikke rækkens type");
    assert.ok(s.includes('"facilityAktiv"') && s.includes('"lokation"'));
  });

  test("⚠ DER ER KUN ÉN Planlaegdialog", () => {
    /* To formularer til den SAMME node ville vaere to steder at vaere uenige
       om feltskemaet, og den ene ville foer eller siden glemme
       valideOpgaveplan(). Samme snit som Gitterkalenderen selv. */
    for (const sti of SKAERME) {
      const s = readFileSync(sti, "utf8");
      assert.ok(!/function Planlaegdialog\(/.test(s),
        `${sti} har sin egen kopi af planlægningsformularen`);
    }
    const delt = readFileSync("src/fleet/Planlaegdialog.jsx", "utf8");
    assert.ok(delt.includes("export default function Planlaegdialog("));
  });
});
