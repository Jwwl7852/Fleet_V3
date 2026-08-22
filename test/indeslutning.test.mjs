/* test/indeslutning.test.mjs
 * Hallen og porten er to stier og ét fysisk rum.
 *
 * ⚠ HULLET DER BLEV LUKKET. `reservationFraOpgave()` har hele tiden båret
 * sætningen *"Lukker man hallen, er alle porte i den også optaget"* — og
 * datamodellen håndhævede den ikke. En reservation på `lokation/lok-halb` og
 * en på `facilityAktiv/fa-port3` er to STIER, og `tjekLedigMod()` ser kun én
 * ad gangen. Et gulvarbejde i Hal B spærrede ikke porten i den.
 *
 * Det stod i README som et kendt hul med en advarsel der viste sig at være
 * den rigtige: *"en indeslutningsregel er sin egen beslutning — den skal
 * gælde begge veje, i begge funktioner, og et halvt tjek i én af dem ville
 * være værre end ingen."*
 *
 * Se beslutning 90.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RESSOURCE, KILDE, indeslutninger, tjekLedigIndesluttet, tjekLedigMod,
} from "../src/fleet/reservations.js";

const T = (t) => new Date(`2026-09-0${t}T08:00:00Z`).getTime();

/* Hal B med to porte, og en hal mere som ingen af dem hører til. */
const AKTIVER = {
  "fa-port3": { lokationId: "lok-halb" },
  "fa-port5": { lokationId: "lok-halb" },
  "fa-lift1": { lokationId: "lok-vejle" },
};

const besoeg = (id, fra, til, kilde = KILDE.facilitySag) => ({
  id, fra, til, kilde: { type: kilde, id: "sag-1", reference: "1245" },
});

describe("Hvad der ligger inde i hvad", () => {
  it("en lokation indeslutter sine egne anlæg — og kun dem", () => {
    const ud = indeslutninger(
      { ressourceType: RESSOURCE.lokation, ressourceId: "lok-halb" },
      { aktiver: AKTIVER });
    assert.deepEqual(ud.map((x) => x.ressourceId).sort(), ["fa-port3", "fa-port5"]);
    assert.ok(ud.every((x) => x.ressourceType === RESSOURCE.facilityAktiv));
  });

  /**
   * ⚠ BEGGE VEJE, ELLERS AFGØR RÆKKEFØLGEN UDFALDET. Var den kun den ene,
   * kunne man booke hallen først og stadig tage porten bagefter.
   */
  it("⚠ OG ET ANLÆG INDESLUTTES AF SIN LOKATION", () => {
    assert.deepEqual(
      indeslutninger(
        { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3" },
        { aktiver: AKTIVER }),
      [{ ressourceType: RESSOURCE.lokation, ressourceId: "lok-halb" }]);
  });

  /**
   * ⚠ MEN IKKE MELLEM SØSKENDE. At servicere port 3 spærrer ikke port 5.
   * Kaskaderede den, ville ét servicebesøg lukke et helt anlægsområde — og så
   * ville folk holde op med at bruge lokationen som ressource.
   */
  it("⚠ TO PORTE I SAMME HAL ER UAFHÆNGIGE", () => {
    const ud = indeslutninger(
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3" },
      { aktiver: AKTIVER });
    assert.ok(!ud.some((x) => x.ressourceId === "fa-port5"));
  });

  it("et køretøj, en medarbejder og et lager indeslutter ingenting", () => {
    for (const t of [RESSOURCE.koeretoej, RESSOURCE.medarbejder, RESSOURCE.lager]) {
      assert.deepEqual(indeslutninger({ ressourceType: t, ressourceId: "x" },
        { aktiver: AKTIVER }), []);
    }
  });

  it("et anlæg uden kendt lokation giver ingen indeslutning", () => {
    /* ⚠ OG DET ER IKKE ET SIKKERT SVAR — det er et TOMT. Derfor henter begge
       funktioner anlæggene selv frem for at tage dem fra klienten: en kalder
       der ikke har dem, må ikke få et falsk "ledigt". */
    assert.deepEqual(indeslutninger(
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-ukendt" },
      { aktiver: AKTIVER }), []);
    assert.deepEqual(indeslutninger(
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3" }, {}), []);
  });

  it("tåler en tom eller ufuldstændig reservation", () => {
    assert.deepEqual(indeslutninger(null, { aktiver: AKTIVER }), []);
    assert.deepEqual(indeslutninger({ ressourceType: RESSOURCE.lokation }, {}), []);
  });
});

describe("Tjekket på tværs af rummet", () => {
  const ny = {
    ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3",
    fra: T(1), til: T(2),
    kilde: { type: KILDE.facilitySag, id: "sag-2" },
  };

  /**
   * ⚠ DEN HER ER HULLET, SKREVET NED. Før beslutning 90 svarede
   * `tjekLedigMod()` OK på præcis dette: portens egen sti er tom, og hallens
   * blok stod et andet sted i træet.
   */
  it("⚠ EN LUKKET HAL SPÆRRER PORTEN I DEN", () => {
    const grupper = [
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3", reservationer: [] },
      { ressourceType: RESSOURCE.lokation, ressourceId: "lok-halb",
        reservationer: [besoeg("res-gulv", T(1), T(3))] },
    ];

    /* Sådan så det ud FØR: kun portens egen sti. */
    assert.equal(tjekLedigMod([], ny).ok, true,
      "portens egen sti er tom — det var derfor hullet ikke kunne ses");

    const svar = tjekLedigIndesluttet(ny, grupper);
    assert.equal(svar.ok, false);
    assert.equal(svar.konflikter.length, 1);
    assert.equal(svar.konflikter[0].viaRessourceId, "lok-halb");
  });

  it("⚠ OG EN LUKKET PORT SPÆRRER IKKE HELE HALLEN — men ses fra hallen", () => {
    const paaHallen = {
      ...ny, ressourceType: RESSOURCE.lokation, ressourceId: "lok-halb",
    };
    const grupper = [
      { ressourceType: RESSOURCE.lokation, ressourceId: "lok-halb", reservationer: [] },
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3",
        reservationer: [besoeg("res-port", T(1), T(3))] },
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port5", reservationer: [] },
    ];
    const svar = tjekLedigIndesluttet(paaHallen, grupper);
    assert.equal(svar.ok, false);
    assert.equal(svar.konflikter[0].viaRessourceId, "fa-port3");
  });

  /**
   * ⚠ KONFLIKTEN SIGER HVOR DEN KOM FRA. "Ressourcen er optaget" på en port
   * der står tom, er ubrugelig — man går hen og kigger, og porten ER tom.
   */
  it("⚠ TEKSTEN NÆVNER AT DET ER RUMMET, IKKE RESSOURCEN", () => {
    const grupper = [
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3", reservationer: [] },
      { ressourceType: RESSOURCE.lokation, ressourceId: "lok-halb",
        reservationer: [besoeg("res-gulv", T(1), T(3))] },
    ];
    const tekst = tjekLedigIndesluttet(ny, grupper).konflikter[0].tekst;
    assert.match(tekst, /Hele stedet er optaget/);
  });

  it("en egen konflikt bærer INGEN via — den er ikke indesluttet", () => {
    const grupper = [
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3",
        reservationer: [besoeg("res-egen", T(1), T(3))] },
    ];
    const k = tjekLedigIndesluttet(ny, grupper).konflikter[0];
    assert.ok(!("viaRessourceType" in k), "en egen konflikt skal se ud som før");
  });

  it("ledigt i begge ender er ledigt", () => {
    const grupper = [
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3",
        reservationer: [besoeg("res-a", T(4), T(5))] },
      { ressourceType: RESSOURCE.lokation, ressourceId: "lok-halb",
        reservationer: [besoeg("res-b", T(6), T(7))] },
    ];
    assert.equal(tjekLedigIndesluttet(ny, grupper).ok, true);
  });

  /**
   * ⚠ EN OVERSKRIVNING SKAL DÆKKE DEM ALLE. Kunne man overskrive porten men
   * ikke hallen, ville en "tving" rydde det ene og efterlade det andet — og
   * arbejdet ville stå i et rum der stadig var optaget.
   */
  it("⚠ kanOverskrive ER FALSK HVIS BARE ÉN GRUPPE IKKE KAN", () => {
    const vaerksted = { ...ny, kilde: { type: KILDE.vaerksted, id: "o-1" } };
    const grupper = [
      { ressourceType: RESSOURCE.facilityAktiv, ressourceId: "fa-port3",
        reservationer: [besoeg("res-b", T(1), T(3), KILDE.booking)] },
      { ressourceType: RESSOURCE.lokation, ressourceId: "lok-halb",
        reservationer: [besoeg("res-v", T(1), T(3), KILDE.vaerksted)] },
    ];
    const svar = tjekLedigIndesluttet(vaerksted, grupper);
    assert.equal(svar.ok, false);
    assert.equal(svar.kanOverskrive, false,
      "værksted (40) slår booking (10), men ikke et andet værksted");
  });

  it("uden grupper er svaret ledigt — kalderen leverer dem", () => {
    assert.deepEqual(tjekLedigIndesluttet(ny, []),
      { ok: true, konflikter: [], kanOverskrive: true });
  });
});

/**
 * ⚠ ET HALVT TJEK ER VÆRRE END INGEN, FORDI DET LIGNER ET HELT.
 *
 * Lå udvidelsen kun i `facilityplanlaeg`, kunne man oprette lovligt og
 * FLYTTE ind i en optaget hal bagefter. README's egen note sagde det:
 * *"den skal gælde begge veje, i begge funktioner."*
 */
describe("Begge veje ind bruger den", () => {
  const KODE = readFileSync("functions/index.js", "utf8");

  const kropAf = (navn) => {
    const start = KODE.indexOf(`export const ${navn} = onCall`);
    assert.ok(start > 0, `fandt ikke ${navn}`);
    const slut = KODE.indexOf("\nexport const ", start + 10);
    return KODE.slice(start, slut > 0 ? slut : KODE.length);
  };

  for (const navn of ["facilityplanlaeg", "opgaveflyt"]) {
    it(`⚠ ${navn} TJEKKER HELE RUMMET`, () => {
      const krop = kropAf(navn);
      assert.match(krop, /indeslutninger\(/,
        `${navn} udvider ikke tjekket til de indesluttede ressourcer`);
      assert.match(krop, /tjekLedigIndesluttet\(/,
        `${navn} bruger stadig det smalle tjek`);
      assert.ok(!/const svar = tjekLedigMod\(/.test(krop),
        `${navn} har stadig et tjek der kun ser én sti`);
    });
  }

  it("⚠ ANLÆGGENE HENTES AF SERVEREN, IKKE AF KLIENTEN", () => {
    /* En klient der kunne sende `aktiver` med, kunne sende et tomt map — og
       så var indeslutningen væk uden at nogen kunne se det. */
    for (const navn of ["facilityplanlaeg", "opgaveflyt"]) {
      assert.match(kropAf(navn), /child\("facility\/aktiver"\)/,
        `${navn} skal hente anlæggene selv`);
    }
  });
});

/**
 * ⚠ SKÆRMEN VISER; FUNKTIONEN HÅNDHÆVER — men de skal være enige.
 *
 * Regnede gitteret hver række for sig, ville det tilbyde et ledigt felt
 * serveren afviser. Det er den værste af de to fejl: man har allerede lovet
 * håndværkeren en tid.
 */
describe("Servicekalenderen viser det samme", () => {
  const SKAERM = readFileSync("src/moduler/facility/Servicekalender.jsx", "utf8");

  it("⚠ GITTERET KENDER INDESLUTNINGEN", () => {
    assert.match(SKAERM, /indeslutninger\(/,
      "skærmen regner hver række for sig og tilbyder tider serveren afviser");
  });

  it("⚠ OG DE LEDIGE FELTER REGNES AF DEN SAMME LISTE SOM BLOKKENE", () => {
    /* Ét regnestykke, to visninger — som i Disponering. To lister ville
       drive, og driften ville være et felt man kan klikke på men ikke bruge. */
    assert.match(SKAERM, /const mine = blokke\.filter/);
    assert.match(SKAERM, /const blokke = \[\.\.\.egneBlokke, \.\.\.skygger\]/);
  });

  it("en skygge kan ikke trækkes, og grunden siges", () => {
    assert.match(SKAERM, /if \(b\.skygge\) return/,
      "en skygge man kan tage fat i, ville flytte en blok der hører et andet sted");
  });
});
