/* test/facility.test.mjs
 * Facility som entitet, og de tre fejl fra mockupsene som invarianter.
 *
 * Ingen emulator.
 *
 * HVORFOR DEN FINDES. De tre fejl er alle af samme slags: et tal skrevet i
 * hånden ved siden af de data det skulle beskrive. Sådan et tal bliver ikke
 * forkert med det samme — det bliver forkert den dag nogen ændrer data uden at
 * ændre tallet. Testene her fastholder at tallene BEREGNES.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AKTIV_ART, AKTIV_STATUS, ZONE_ART, LOKATION_TYPE, OMKOSTNINGSPOST,
  alarmTilstand, aktiveAlarmer, gennemsnitTemperatur, gennemsnitPrZoneArt,
  elVarmeOere, bygningsomkostningOere, ressourceTypeForFacility,
} from "../src/fleet/facility.js";
import {
  DEMO_LOKATIONER, DEMO_AKTIVER, DEMO_ZONER, DEMO_SENSORER, DEMO_FEJL,
  DEMO_SERVICEBESOEG, DEMO_BYGNINGSOMKOSTNING, demoZonePar, demoAabneFejl,
} from "../src/fleet/demo-facility.js";
import { reservationFraOpgave, opgaveMangler } from "../src/fleet/opgaver.js";
import { KILDE, RESSOURCE, prioritetFor } from "../src/fleet/reservations.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";

/* ══════════════════════════════════════════════════════════════════════
   FEJL 1: to skærme, forskellige temperaturer for samme zoner
   ══════════════════════════════════════════════════════════════════════ */
describe("Fejl 1 — én sensorkilde, ikke to", () => {
  it("giver hver zone præcis én måling", () => {
    const par = demoZonePar();
    assert.equal(par.length, DEMO_ZONER.length);
    const ider = par.map((p) => p.zone.id);
    assert.equal(new Set(ider).size, ider.length, "en zone optræder to gange");
  });

  /* To kald må give det samme. Havde hver skærm sit eget datasæt, ville de
     kunne nå at drive fra hinanden — det var mockuppens fejl. */
  it("giver samme svar hver gang den kaldes", () => {
    const a = demoZonePar().map((p) => p.maaling?.tempC);
    const b = demoZonePar().map((p) => p.maaling?.tempC);
    assert.deepEqual(a, b);
  });

  it("har en sensor til hver zone og ingen sensor uden zone", () => {
    const zoneIder = new Set(DEMO_ZONER.map((z) => z.id));
    for (const z of DEMO_ZONER) {
      assert.ok(DEMO_SENSORER[z.id], `zone ${z.id} mangler sensor`);
    }
    for (const id of Object.keys(DEMO_SENSORER)) {
      assert.ok(zoneIder.has(id), `sensor ${id} har ingen zone — grænsen er ukendt`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   FEJL 2: gennemsnittet 15,2 passede ikke på sensorerne (de gav 16,9)
   ══════════════════════════════════════════════════════════════════════ */
describe("Fejl 2 — gennemsnittet beregnes", () => {
  it("giver præcis 16,9 °C for de tempererede zoner", () => {
    const tempererede = demoZonePar().filter((p) => p.zone.art === "tempereret");
    assert.equal(tempererede.length, 3);
    assert.ok(
      Math.abs(gennemsnitTemperatur(tempererede) - 16.9) < 0.001,
      "rekonstruktionen af mockup-fejlen holder ikke"
    );
  });

  /* 15,2 var ÉN zones værdi, læst som gennemsnittet af dem alle. */
  it("viser at 15,2 var en enkelt zone og ikke snittet", () => {
    const kontor = demoZonePar().find((p) => p.zone.id === "zo-kontor");
    assert.equal(kontor.maaling.tempC, 15.2);
    const tempererede = demoZonePar().filter((p) => p.zone.art === "tempereret");
    assert.notEqual(gennemsnitTemperatur(tempererede), 15.2);
  });

  it("regner det aritmetiske gennemsnit", () => {
    assert.equal(gennemsnitTemperatur([
      { maaling: { tempC: 10 } }, { maaling: { tempC: 20 } },
    ]), 15);
    assert.equal(gennemsnitTemperatur([]), null);
    assert.equal(gennemsnitTemperatur([{ maaling: null }]), null);
  });

  /* Et snit på tværs af en fryser og et kontor beskriver ingen af dem. */
  it("holder zonearterne adskilt", () => {
    const snit = gennemsnitPrZoneArt(demoZonePar());
    assert.ok(snit.frost, "frost mangler");
    assert.ok(snit.tempereret, "tempereret mangler");
    assert.ok(snit.frost.snit < -15, "frost skal ligge under −15 °C");
    assert.ok(snit.tempereret.snit > 10, "tempereret skal ligge over 10 °C");
    /* Ét samlet snit ville ligge et sted ingen zone er. */
    const samlet = gennemsnitTemperatur(demoZonePar());
    assert.ok(
      samlet < snit.tempereret.snit && samlet > snit.frost.snit,
      "et samlet snit beskriver ingen af arterne — derfor vises det ikke"
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════
   FEJL 3: "El/varme 58.420 kr" var hele bygningen
   ══════════════════════════════════════════════════════════════════════ */
describe("Fejl 3 — el/varme er ikke bygningsomkostningen", () => {
  it("giver to forskellige tal", () => {
    const elVarme = elVarmeOere(DEMO_BYGNINGSOMKOSTNING);
    const bygning = bygningsomkostningOere(DEMO_BYGNINGSOMKOSTNING);
    assert.notEqual(elVarme, bygning);
    assert.ok(elVarme < bygning, "el/varme skal være en DEL af bygningen");
  });

  it("rammer mockuppens tal: 43.030 kr mod 58.420 kr", () => {
    assert.equal(elVarmeOere(DEMO_BYGNINGSOMKOSTNING), 4303000);
    assert.equal(bygningsomkostningOere(DEMO_BYGNINGSOMKOSTNING), 5842000);
  });

  it("summer komponenterne — der er ingen gemt total at drive fra", () => {
    const sum = Object.values(DEMO_BYGNINGSOMKOSTNING).reduce((s, v) => s + v, 0);
    assert.equal(bygningsomkostningOere(DEMO_BYGNINGSOMKOSTNING), sum);
    assert.equal("total" in DEMO_BYGNINGSOMKOSTNING, false, "en gemt total kan drive");
    assert.equal("bygningsomkostningOere" in DEMO_BYGNINGSOMKOSTNING, false);
  });

  it("bruger kun kendte poster, og alle i hele øre", () => {
    for (const [n, v] of Object.entries(DEMO_BYGNINGSOMKOSTNING)) {
      assert.ok(OMKOSTNINGSPOST[n], `ukendt post "${n}"`);
      assert.ok(Number.isInteger(v), `${n} er ikke hele øre`);
    }
  });

  it("tæller kun el og varme med i elVarme", () => {
    assert.equal(elVarmeOere({ el: 100, varme: 200, vand: 999 }), 300);
    assert.equal(elVarmeOere({}), 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Entiteten
   ══════════════════════════════════════════════════════════════════════ */
describe("Facility som entitet", () => {
  const lokIder = new Set(DEMO_LOKATIONER.map((l) => l.id));
  const aktivIder = new Set(DEMO_AKTIVER.map((a) => a.id));

  it("giver hvert aktiv og hver zone en lokation der findes", () => {
    for (const a of DEMO_AKTIVER) assert.ok(lokIder.has(a.lokationId), `${a.id}: ukendt lokation`);
    for (const z of DEMO_ZONER) assert.ok(lokIder.has(z.lokationId), `${z.id}: ukendt lokation`);
  });

  it("bruger kun kendte arter, statusser og typer", () => {
    for (const l of DEMO_LOKATIONER) assert.ok(LOKATION_TYPE[l.type], `${l.id}: ukendt type`);
    for (const a of DEMO_AKTIVER) {
      assert.ok(AKTIV_ART[a.art], `${a.id}: ukendt art`);
      assert.ok(AKTIV_STATUS[a.status], `${a.id}: ukendt status`);
    }
    for (const z of DEMO_ZONER) assert.ok(ZONE_ART[z.art], `${z.id}: ukendt art`);
  });

  /* Grænsen hører PÅ ZONEN. Mangler den, kommer alarmen fra artens standard,
     og zonens egen grænse er en illusion. */
  it("giver hver zone sine egne grænser", () => {
    for (const z of DEMO_ZONER) {
      assert.ok(Number.isFinite(z.graenser?.minC), `${z.id} mangler minC`);
      assert.ok(Number.isFinite(z.graenser?.maksC), `${z.id} mangler maksC`);
      assert.ok(z.graenser.maksC > z.graenser.minC, `${z.id}: maks <= min`);
    }
  });

  it("holder alarmtærsklen ude af måledata", () => {
    for (const [id, s] of Object.entries(DEMO_SENSORER)) {
      for (const forbudt of ["minC", "maksC", "graenser", "alarm"]) {
        assert.equal(forbudt in s.aktuel, false,
          `sensor ${id} bærer "${forbudt}" — grænsen hører på zonen`);
      }
    }
  });

  it("giver hvert aktiv der måles i en zone en zoneId", () => {
    for (const a of DEMO_AKTIVER) {
      if (AKTIV_ART[a.art]?.maalesZone) {
        assert.ok(a.zoneId, `${a.id} er et ${a.art} uden zone`);
      }
    }
  });

  it("knytter hver fejl til et aktiv der findes", () => {
    for (const f of DEMO_FEJL) assert.ok(aktivIder.has(f.aktivId), `${f.id}: ukendt aktiv`);
  });

  /* Ellers siger Overblik og aktivlisten hver sit om samme anlæg. */
  it("giver hvert aktiv med status fejl en åben fejlmelding", () => {
    const medFejl = new Set(demoAabneFejl().map((f) => f.aktivId));
    for (const a of DEMO_AKTIVER.filter((x) => x.status === "fejl")) {
      assert.ok(medFejl.has(a.id), `${a.kaldenavn || a.navn} har status fejl uden fejlmelding`);
    }
  });

  it("er et udsnit, ikke hele bestanden", () => {
    assert.ok(DEMO_AKTIVER.length < DEMO_KPI.gods.facility.aktiver);
  });

  /* Facility er fælles: porten er den samme uanset hvem der kører igennem. */
  it("har ens facility-tal under gods og bus", () => {
    assert.deepEqual(DEMO_KPI.gods.facility, DEMO_KPI.bus.facility);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Alarmen er afledt
   ══════════════════════════════════════════════════════════════════════ */
describe("Alarmen afledes af måling og grænse", () => {
  const zone = { art: "koel", graenser: { minC: 2, maksC: 6 } };

  it("melder over og under grænsen", () => {
    assert.equal(alarmTilstand(zone, { tempC: 7.4 }).alarm, true);
    assert.equal(alarmTilstand(zone, { tempC: 1.2 }).alarm, true);
    assert.equal(alarmTilstand(zone, { tempC: 4 }).alarm, false);
  });

  it("siger til frem for at gætte når der mangler noget", () => {
    assert.equal(alarmTilstand(zone, null).tekst, "Ingen måling");
    assert.equal(alarmTilstand({ art: "ukendt" }, { tempC: 4 }).tekst, "Ingen grænse sat");
  });

  it("falder tilbage på artens standard når zonen ingen grænse har", () => {
    assert.equal(alarmTilstand({ art: "frost" }, { tempC: -25 }).alarm, true);
    assert.equal(alarmTilstand({ art: "frost" }, { tempC: -20 }).alarm, false);
  });

  it("finder køl-zonen over grænsen i demo-sættet", () => {
    const alarmer = aktiveAlarmer(demoZonePar());
    assert.ok(alarmer.some((p) => p.zone.id === "zo-koel1"),
      "demo-sættet skal have mindst én alarm, ellers kan den ikke ses virke");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Den fjerde reservationskilde
   ══════════════════════════════════════════════════════════════════════ */
describe("Servicebesøg er opgaver med art facility", () => {
  it("kunne gemmes i opgaver/", () => {
    for (const b of DEMO_SERVICEBESOEG) {
      assert.deepEqual(opgaveMangler(b), [], `${b.id} kunne ikke gemmes som opgave`);
      assert.equal(b.art, "facility");
      assert.equal(b.division, "faelles");
    }
  });

  it("giver kilde facilitySag med prioritet 20", () => {
    const r = reservationFraOpgave(DEMO_SERVICEBESOEG[0]);
    assert.equal(r.kilde.type, KILDE.facilitySag);
    assert.equal(prioritetFor(KILDE.facilitySag), 20);
  });

  it("taber til værksted og fravær, vinder over booking", () => {
    assert.ok(prioritetFor(KILDE.facilitySag) < prioritetFor(KILDE.vaerksted));
    assert.ok(prioritetFor(KILDE.facilitySag) < prioritetFor(KILDE.fravaer));
    assert.ok(prioritetFor(KILDE.facilitySag) > prioritetFor(KILDE.booking));
  });

  /* Lukker man hallen, er alle porte i den også optaget. */
  it("spærrer hele lokationen når besøget intet aktiv har", () => {
    const heleStedet = DEMO_SERVICEBESOEG.find((b) => !b.aktivId);
    assert.ok(heleStedet, "demo-sættet skal have et besøg på en hel lokation");
    const r = reservationFraOpgave(heleStedet);
    assert.equal(r.ressourceType, RESSOURCE.lokation);
    assert.equal(r.ressourceId, heleStedet.lokationId);
  });

  it("spærrer kun anlægget når besøget har et aktiv", () => {
    const paaAktiv = DEMO_SERVICEBESOEG.find((b) => b.aktivId);
    const r = reservationFraOpgave(paaAktiv);
    assert.equal(r.ressourceType, RESSOURCE.facilityAktiv);
    assert.equal(r.ressourceId, paaAktiv.aktivId);
  });

  it("bruger samme regel som ressourceTypeForFacility()", () => {
    for (const b of DEMO_SERVICEBESOEG) {
      assert.equal(reservationFraOpgave(b).ressourceType, ressourceTypeForFacility(b));
    }
  });

  it("servicerer ikke samme anlæg to gange samtidig", () => {
    for (const id of new Set(DEMO_SERVICEBESOEG.map((b) => b.aktivId).filter(Boolean))) {
      const mine = DEMO_SERVICEBESOEG.filter((b) => b.aktivId === id);
      for (let i = 0; i < mine.length; i++) {
        for (let j = i + 1; j < mine.length; j++) {
          assert.equal(
            mine[i].fra < mine[j].til && mine[j].fra < mine[i].til, false,
            `${mine[i].id} og ${mine[j].id} overlapper på ${id}`
          );
        }
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Reglen: et manglende KPI-tal defineres, det hardkodes ikke
   ══════════════════════════════════════════════════════════════════════ */
describe("KPI-felterne findes, så skærmene ikke hardkoder", () => {
  for (const felt of [
    "aabneFejl", "klimaalarmerIDag", "sensorerAktive",
    "eksterneLeverandoerer", "anslaaetServiceOere",
  ]) {
    it(`facility.${felt} er defineret i begge divisioner`, () => {
      assert.ok(Number.isFinite(DEMO_KPI.gods.facility[felt]), `gods mangler ${felt}`);
      assert.ok(Number.isFinite(DEMO_KPI.bus.facility[felt]), `bus mangler ${felt}`);
    });
  }

  it("flaade.ikkeLinkedeFakturaer er defineret", () => {
    assert.ok(Number.isFinite(DEMO_KPI.gods.flaade.ikkeLinkedeFakturaer));
    assert.ok(Number.isFinite(DEMO_KPI.bus.flaade.ikkeLinkedeFakturaer));
  });

  /* De AFLEDTE tal må IKKE ligge i kpi/ — samme fejl som bemanding.ledig.
     Aktive alarmer regnes af måling + grænse, og et gemt tal ville drive. */
  it("gemmer ikke de afledte tal", () => {
    for (const d of ["gods", "bus"]) {
      assert.equal(DEMO_KPI[d].facility.klimaalarmerAktive, undefined,
        "aktive alarmer er afledt og hører ikke i kpi/");
      assert.equal(DEMO_KPI[d].facility.gennemsnitTempC, undefined,
        "gennemsnittet beregnes af sensorerne");
      assert.equal(DEMO_KPI[d].facility.bygningsomkostningOere, undefined,
        "totalen summeres af komponenterne");

      /* ⚠ SAMME TAL SOM bygningsomkostningOere — UNDER ET ANDET NAVN.
         Det stod på den PÅBUDTE liste tolv linjer længere oppe, mens navnet
         nedenfor stod på den FORBUDTE. Prøven krævede altså at feltet fandtes
         OG at det ikke fandtes; den var kun grøn fordi de to navne aldrig
         blev holdt op mod hinanden.

         Det er summen af `facility/omkostning`s fem komponenter, og
         bygningsomkostningOere() regner den hos forbrugeren. Ingen skærm
         læste kpi-feltet. Et gemt afledt tal driver fra sit grundlag —
         `bemanding.ledig` en gang til. */
      assert.equal(DEMO_KPI[d].facility.facilityOmkostningOere, undefined,
        "facility-omkostningen er bygningsomkostningen under et andet navn");
    }
  });
});
