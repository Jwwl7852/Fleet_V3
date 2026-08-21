/* test/facilityopgave.test.mjs
 * At planlægge et servicebesøg — beslutning 51.
 *
 * HVORFOR FILEN FINDES. `opgaver` har haft tre veje ind og ÉN lukket:
 * `opgaveplanlaeg` SÆTTER `art: "vaerksted"`, `opgaveflyt` BEVARER opgavens
 * egen, og `opgavestatus` rører kun status. Facility kunne altså flytte og
 * afslutte sine servicebesøg — men ikke oprette et. Skærmen skrev det selv:
 * "En knap her ville love noget serveren afviser."
 *
 * ⚠ OG DET ER IKKE ET FLAG PÅ `opgaveplanlaeg`. To ting skiller de to ad, og
 * begge er spærringer: FELTSKEMAET (art ER skemaet — beslutning 21) og
 * MODULET (`flaade` mod `facility`). En funktion med et art-flag skulle bære
 * begge skemaer, og så er der intet tilbage af den spærring `art !==
 * "vaerksted"` er.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  valideFacilityopgave, valideOpgaveplan, PLANLAEGBAR_STATUS,
} from "../src/fleet/opgaveplan-regler.js";
import { reservationFraOpgave, harFelt, FELT } from "../src/fleet/opgaver.js";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import { DEMO_AKTIVER, DEMO_LOKATIONER } from "../src/fleet/demo-facility.js";

const START = Date.UTC(2026, 8, 14, 8, 0, 0);

/** Et gyldigt servicebesøg på ét anlæg. */
const besoeg = (x = {}) => ({
  art: "facility", division: "faelles", status: "planlagt",
  aktivId: "fa-port3", beskrivelse: "Portmotor skiftes",
  startMs: START, estimeretMin: 240,
  ...x,
});

const KATALOG = {
  aktiver: DEMO_AKTIVER.map((a) => a.id),
  lokationer: DEMO_LOKATIONER.map((l) => l.id),
};

/* ══════════════════════════════════════════════════════════════════════════
   FORMEN
   ══════════════════════════════════════════════════════════════════════════ */

describe("valideFacilityopgave", () => {
  test("tager imod et besøg på ét anlæg", () => {
    const r = valideFacilityopgave(besoeg(), KATALOG);
    assert.equal(r.ok, true, JSON.stringify(r.fejl));
  });

  test("tager imod et besøg på hele lokationen", () => {
    const r = valideFacilityopgave(
      besoeg({ aktivId: undefined, lokationId: "lok-halb" }), KATALOG);
    assert.equal(r.ok, true, JSON.stringify(r.fejl));
  });

  /**
   * ⚠ DEN AFVISER EN VÆRKSTEDSOPGAVE — modstykket til at `valideOpgaveplan()`
   * afviser en facility-opgave. Uden begge halvdele ville den ene formular
   * kunne oprette den andens poster, og de to har ikke samme feltskema.
   */
  test("⚠ AFVISER EN VÆRKSTEDSOPGAVE, og omvendt", () => {
    assert.equal(valideFacilityopgave(besoeg({ art: "vaerksted" }), KATALOG).ok, false);
    const modsat = valideOpgaveplan({
      art: "facility", division: "faelles", status: "planlagt",
      aktivId: "fa-port3", beskrivelse: "x", startMs: START, estimeretMin: 60,
    });
    assert.equal(modsat.ok, false);
    assert.ok(modsat.fejl.art, "valideOpgaveplan slipper en facility-opgave igennem");
  });

  /**
   * ⚠ ENTEN ET ANLÆG ELLER ET STED — IKKE BEGGE.
   *
   * `ressourceId()` foretrækker aktivet, så en post med begge felter
   * reserverer ANLÆGGET og lader lokationen stå som en påstand ingen læser.
   * Og anlæggets lokation står allerede på anlægget: to steder til samme
   * kendsgerning driver fra hinanden første gang nogen flytter porten til en
   * anden hal. Samme regel som at en enhed ikke får en `pladsId`.
   */
  test("⚠ AFVISER BÅDE ANLÆG OG LOKATION PÅ SAMME POST", () => {
    const r = valideFacilityopgave(besoeg({ lokationId: "lok-halb" }), KATALOG);
    assert.equal(r.ok, false);
    assert.ok(r.fejl.aktivId);
  });

  test("og afviser en post uden nogen af dem", () => {
    const r = valideFacilityopgave(
      besoeg({ aktivId: undefined }), KATALOG);
    assert.equal(r.ok, false);
    assert.ok(r.fejl.aktivId);
  });

  test("afviser et anlæg og en lokation der ikke findes", () => {
    assert.equal(valideFacilityopgave(besoeg({ aktivId: "fa-findes-ikke" }), KATALOG).ok, false);
    assert.equal(valideFacilityopgave(
      besoeg({ aktivId: undefined, lokationId: "lok-findes-ikke" }), KATALOG).ok, false);
  });

  /* Uden kataloget springes eksistenstjekket over — klienten har listerne i
     hånden, serveren slår op i basen, og ingen af de to gætter for den anden. */
  test("springer eksistenstjekket over når kataloget ikke er med", () => {
    assert.equal(valideFacilityopgave(besoeg({ aktivId: "fa-hvadsomhelst" })).ok, true);
  });

  /**
   * ⚠ INGEN ARBEJDSTYPE. Arten HAR ikke feltet, og ordlisten er værkstedets —
   * den deles med Procures omkostningstype. Et felt arten ikke har, er ikke et
   * tomt felt; det er en post der ikke passer på sit eget skema.
   */
  test("⚠ AFVISER EN ARBEJDSTYPE", () => {
    assert.equal(harFelt("facility", FELT.arbejdstype), false);
    const r = valideFacilityopgave(besoeg({ arbejdstype: "service" }), KATALOG);
    assert.equal(r.ok, false);
    assert.ok(r.fejl.arbejdstype);
  });

  /**
   * ⚠ DIVISIONEN LÅSES IKKE TIL `faelles`.
   *
   * Skærmen reagerer ikke på Gods/Bus — anlæggene er de samme uanset hvem der
   * kører gennem porten — men opgaven bærer hvem der BETALER. Målt: `op-013`,
   * eftersynet af busladestanderne i Aalborg, står som `bus`. Låste vi feltet,
   * kunne den post ikke oprettes gennem den skærm der viser den.
   */
  test("⚠ TAGER IMOD ALLE TRE DIVISIONER", () => {
    for (const d of ["gods", "bus", "faelles"]) {
      assert.equal(valideFacilityopgave(besoeg({ division: d }), KATALOG).ok, true, d);
    }
    assert.equal(valideFacilityopgave(besoeg({ division: "alle" }), KATALOG).ok, false);
    const bus = DEMO_OPGAVER.find((o) => o.art === "facility" && o.division === "bus");
    assert.ok(bus, "demo-sættet har ingen facility-opgave uden for fælles længere");
  });

  test("kan kun oprette de to planlægbare statusser", () => {
    for (const s of PLANLAEGBAR_STATUS) {
      assert.equal(valideFacilityopgave(besoeg({ status: s }), KATALOG).ok, true, s);
    }
    for (const s of ["igang", "udfoert", "annulleret", "indberettet"]) {
      assert.equal(valideFacilityopgave(besoeg({ status: s }), KATALOG).ok, false, s);
    }
  });

  /**
   * ⚠ SAMME SÆTNING SOM VÆRKSTEDET FÅR. `tidsfelter()` står ét sted for begge
   * arter — ellers ville brugeren få to forklaringer på én spærring, alt efter
   * hvilken skærm han kom fra.
   */
  test("⚠ MANGLENDE VARIGHED GIVER SAMME SÆTNING BEGGE STEDER", () => {
    const fac = valideFacilityopgave(besoeg({ estimeretMin: null }), KATALOG);
    const vk = valideOpgaveplan({
      art: "vaerksted", division: "gods", status: "planlagt",
      koeretoejId: "kt-1", arbejdstype: "service", beskrivelse: "x",
      startMs: START, estimeretMin: null,
    });
    assert.ok(fac.fejl.estimeretMin);
    assert.equal(fac.fejl.estimeretMin, vk.fejl.estimeretMin);
  });

  /* Nodens eget katalog må ikke sige det samme to gange: ressourcen hedder
     "aktivId eller lokationId" i opgaveMangler(), og uden oversættelsen ville
     den manglende ressource stå både ved feltet og som en nodefejl. */
  test("siger ikke den samme mangel to gange", () => {
    const r = valideFacilityopgave(besoeg({ aktivId: undefined }), KATALOG);
    assert.ok(r.fejl.aktivId);
    assert.equal(r.fejl._node, undefined);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RESERVATIONEN — hvad besøget spærrer
   ══════════════════════════════════════════════════════════════════════════ */

describe("Ressourcen følger af hvad der blev valgt", () => {
  test("et anlæg spærrer anlægget", () => {
    const r = reservationFraOpgave({ ...besoeg(), id: "op-x" });
    assert.equal(r.ressourceType, "facilityAktiv");
    assert.equal(r.ressourceId, "fa-port3");
    assert.equal(r.kilde.type, "facilitySag");
  });

  /**
   * ⚠ ET BESØG UDEN ANLÆG SPÆRRER HELE STEDET. Lukker man hallen, er alle
   * porte i den også optaget — derfor er ressourcen `lokation` og ikke
   * "aktivet uden id".
   */
  test("⚠ EN LOKATION SPÆRRER HELE STEDET", () => {
    const r = reservationFraOpgave({
      ...besoeg(), aktivId: undefined, lokationId: "lok-halb", id: "op-y",
    });
    assert.equal(r.ressourceType, "lokation");
    assert.equal(r.ressourceId, "lok-halb");
  });

  test("vinduet regnes af estimatet, ikke af noget gættet", () => {
    const r = reservationFraOpgave({ ...besoeg(), id: "op-z" });
    assert.equal(r.til - r.fra, 240 * 60000);
    assert.throws(() => reservationFraOpgave({ ...besoeg(), estimeretMin: null, id: "q" }));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   HÅNDHÆVELSEN — at funktionen findes, er ikke at den håndhæver noget
   ══════════════════════════════════════════════════════════════════════════ */

const kilde = readFileSync("functions/index.js", "utf8");
const blok = (() => {
  const start = kilde.indexOf("export const facilityplanlaeg");
  assert.ok(start >= 0, "functions/index.js har ingen facilityplanlaeg");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
})();

const planblok = (() => {
  const start = kilde.indexOf("export const opgaveplanlaeg");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return kilde.slice(start, naeste);
})();

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("facilityplanlaeg håndhæver det skærmen viser", () => {
  test("⚠ KALDER SKÆRMENS EGEN VALIDERING, ikke en afskrift", () => {
    assert.ok(blok.includes("valideFacilityopgave("), "valideringen kaldes ikke");
    assert.ok(blok.includes("opgaveMangler("), "nodens eget katalog spørges ikke");
    assert.ok(blok.includes("reservationFraOpgave("), "reservationen bygges ikke ét sted");
    assert.ok(kilde.includes('from "./delt/opgaveplan-regler.js"'));
  });

  /**
   * ⚠ ARTEN SÆTTES AF SERVEREN. Kom den udefra, kunne en kunde uden Fleet
   * oprette en værkstedsopgave gennem Facilitys dør — modulspærringen ville
   * være til at vælge.
   */
  test("⚠ SÆTTER ARTEN SELV", () => {
    const b = udenKommentarer(blok);
    assert.ok(b.includes('art: "facility"'), "arten sættes ikke i funktionen");
    assert.ok(!/art:\s*kortStreng\(d\.art/.test(b), "arten tages fra klienten");
    assert.ok(!b.includes("d.art"), "klienten kan oplyse arten");
  });

  /**
   * ⚠ OG DEN SPØRGER OM SIT EGET MODUL. `opgaveplanlaeg` kræver `flaade`;
   * den her kræver `facility`. Spurgte begge om Fleet, kunne en kunde der KUN
   * har Facility, ikke planlægge sit eget servicebesøg.
   */
  test("⚠ SPØRGER OM facility-MODULET, IKKE OM FLEET", () => {
    assert.ok(blok.includes('moduler.child("facility")'), "modulet spørges ikke");
    assert.ok(!blok.includes('moduler.child("flaade")'), "den spørger om Fleets modul");
    assert.ok(planblok.includes('moduler.child("flaade")'), "opgaveplanlaeg har mistet sit");
  });

  test("⚠ KRÆVER opgaver.skriv — det er en opgave den skriver", () => {
    assert.ok(blok.includes('perms.includes("|opgaver.skriv|")'));
  });

  test("⚠ ABONNEMENT OG TENANT TJEKKES — admin-SDK'et går uden om reglerne", () => {
    assert.ok(blok.includes('rod.child("_findes")'));
    assert.ok(blok.includes('abonnement/status'));
  });

  /**
   * ⚠ OPGAVEN OG RESERVATIONEN LANDER SAMMEN ELLER SLET IKKE. Landede kun
   * opgaven, ville anlægget have et servicebesøg uden at være spærret — og så
   * ser det FRIT ud, hvilket er værre end en spærring man kan se. Det er
   * beslutning 4's fejl og beslutning 45's begrundelse.
   */
  test("⚠ ÉN update() MED BEGGE HALVDELE", () => {
    const b = udenKommentarer(blok);
    assert.equal((b.match(/rod\.update\(/g) || []).length, 1, "der skrives mere end ét sted");
    assert.ok(b.includes("opgaver/${opgaveId}"));
    assert.ok(b.includes("res-${opgaveId}"), "reservationens id udledes ikke af opgaven");
  });

  test("⚠ PRØVER LEDIGHEDEN, OG OVERSKRIVER IKKE", () => {
    const b = udenKommentarer(blok);
    assert.ok(b.includes("tjekLedigMod("), "ledigheden prøves ikke");
    assert.ok(b.includes("failed-precondition"), "en optaget ressource giver ikke et svar");
    assert.ok(!b.includes("kanOverskrive ?" + " true"), "den overskriver");
  });

  test("efterlader et spor i auditloggen", () => {
    assert.ok(blok.includes("logOpgave("), "oprettelsen logges ikke");
  });

  /**
   * ⚠ ET ANLÆG DER ER I STYKKER, ER PRÆCIS DET ET SERVICEBESØG FINDES FOR.
   * `opgaveplanlaeg` afviser en SOLGT eller SKROTTET enhed, fordi den er ude
   * af flåden for altid. En tilsvarende statusspærring her ville forbyde at
   * bestille reparationen af den port der er gået i stykker.
   */
  test("⚠ SPÆRRER IKKE PÅ ANLÆGGETS STATUS", () => {
    const b = udenKommentarer(blok);
    assert.ok(!b.includes('"udeAfDrift"'), "et anlæg ude af drift afvises");
    assert.ok(!b.includes('a.status'), "anlæggets status afgør noget");
    assert.ok(planblok.includes('kt.status === "solgt"'),
      "opgaveplanlaeg har mistet sin egen spærring");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMEN VISER, FUNKTIONEN HÅNDHÆVER
   ══════════════════════════════════════════════════════════════════════════ */

describe("Servicekalenderen har én vej ind", () => {
  const skaerm = readFileSync("src/moduler/facility/Servicekalender.jsx", "utf8");
  const dialog = readFileSync("src/moduler/facility/Servicedialog.jsx", "utf8");

  test("skærmen skriver ikke selv — den åbner dialogen", () => {
    const s = udenKommentarer(skaerm);
    assert.ok(s.includes("Servicedialog"), "dialogen bruges ikke");
    assert.ok(!s.includes("planlaegFacilityopgave("),
      "skærmen kalder serveren uden om dialogen");
  });

  test("dialogen kalder serveren og validerer med den samme funktion", () => {
    const d = udenKommentarer(dialog);
    assert.ok(d.includes("planlaegFacilityopgave("));
    assert.ok(d.includes("valideFacilityopgave("));
    assert.ok(!d.includes("db.ref"), "dialogen skriver uden om serveren");
  });

  /**
   * ⚠ HELLER IKKE HER MÅ DER BLIVE TO FORMULARER TIL ÉN NODE.
   * `Planlaegdialog` flyttede til `fleet/` netop fordi to skærme planlagde
   * værkstedsopgaver. Facility har ÉN — og bruger den ikke som en kopi.
   */
  test("⚠ DEN GENBRUGER IKKE VÆRKSTEDETS FORMULAR", () => {
    const d = udenKommentarer(dialog);
    assert.ok(!d.includes("Planlaegdialog"), "værkstedets formular bruges til facility");
    assert.ok(!d.includes("valideOpgaveplan("), "værkstedets validering bruges her");
  });

  /**
   * ⚠ ENTEN-ELLER ER BYGGET IND I VÆLGEREN. Ressourcen er ÉT felt, ikke to man
   * kunne udfylde begge — en form der ikke kan skrive den forkerte post, er
   * bedre end en validering der afviser den bagefter.
   */
  test("⚠ ÉN RESSOURCEVÆLGER, IKKE TO", () => {
    const d = udenKommentarer(dialog);
    const felter = (d.match(/<Felt\s/g) || []).length;
    assert.ok(felter >= 7, "formularen har mistet felter");
    assert.equal((d.match(/id="sv-res"/g) || []).length, 1);
    assert.ok(!d.includes('id="sv-lokation"'), "lokationen har fået sit eget felt");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DEMO-SÆTTET — de fem poster der bar begge felter
   ══════════════════════════════════════════════════════════════════════════ */

describe("Demo-sættet kan oprettes gennem skærmen", () => {
  const facility = DEMO_OPGAVER.filter((o) => o.art === "facility");

  test("ingen post bærer både aktivId og lokationId", () => {
    for (const o of facility) {
      assert.ok(!(o.aktivId && o.lokationId),
        `${o.id} bærer begge — anlæggets lokation står på anlægget`);
    }
  });

  test("og hver post ville blive taget imod af valideringen", () => {
    for (const o of facility) {
      /* Kun de PLANLÆGBARE prøves: en post der er i gang eller udført, kunne
         ikke oprettes i den tilstand — og skal heller ikke kunne det. */
      if (!PLANLAEGBAR_STATUS.includes(o.status)) continue;
      const r = valideFacilityopgave(o, KATALOG);
      assert.equal(r.ok, true, `${o.id}: ${JSON.stringify(r.fejl)}`);
    }
  });
});
