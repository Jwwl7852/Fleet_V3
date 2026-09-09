import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AARSAGSKODE, AARSAGSKODE_V2, AFVIGELSESMODEL, AFVIGELSESNIVEAU,
  AFHAENGIGHEDSART, DATAKILDE, DATAKVALITET, KILDE, LOESNINGSFORSLAGSTATUS, MOBILEVENTTYPE,
  REFERENCEART, SKABELONSTOPSTATUS, TILDELINGSMETODE,
  aendrSkabelonStopvarighed, behandlMobilevents, beregnAfvigelse, beregnFremdrift,
  beregnRutetid, deaktiverSkabelonStop, fjernSkabelonStop, flytSkabelonStop,
  opretDagsruteFraSkabelon, planningReference, sammenholdMobilOgObd,
  tilfoejSkabelonStop, validerAfvigelsesregler, validerLoesningsforslag,
  validerMobilevent, validerObdObservation, validerRuteskabelon,
  validerSkabelonDagsrute, validerSkabelonTildeling,
} from "../src/fleet/planning-basic-v2.js";
import { DEMO_BEREGNING_MS, DEMO_PLANNING_BASIC } from "../src/fleet/demo-planning-basic.js";
import {
  DEMO_AFVIGELSESREGLER_FAELLES, DEMO_AFVIGELSESREGLER_PR_TYPE,
  DEMO_DAGSRUTE_FAST_MEDARBEJDER, DEMO_DAGSRUTE_LIVE, DEMO_DAGSRUTE_UDEN_OBD,
  DEMO_DAGSRUTE_UFULDSAENDIG, DEMO_FAST_KOMMUNAL_SKABELON, DEMO_FAST_SERVICE_SKABELON,
  DEMO_FORETRUKKET_SKABELON, DEMO_KOERETIDER_FAST,
  DEMO_KOERETIDER_UFULDSAENDIG, DEMO_KRITISK_AFVIGELSE, DEMO_LOESNINGSFORSLAG,
  DEMO_MOBILEVENTS_LIVE, DEMO_OBD_OBSERVATIONER_LIVE, DEMO_PLANNING_BASIC_V2,
  DEMO_SKABELON_EFTER_AENDRING, DEMO_STOPPOSITIONER, DEMO_TIDSPLAN_LIVE,
  DEMO_TIDSPLAN_UDEN_OBD, DEMO_UOVERENSSTEMMELSE,
  DEMO_V2_NU_MS, DEMO_V2_TENANT,
} from "../src/fleet/demo-planning-basic-v2.js";

const kode = (svar, forventet) => svar.fund.some((f) => f.kode === forventet);
const klon = (v) => structuredClone(v);
const minut = 60000;
const her = dirname(fileURLToPath(import.meta.url));
const rod = resolve(her, "..");

describe("Faste ruteskabeloner", () => {
  it("validerer de tre generiske syntetiske skabeloner", () => {
    for (const skabelon of DEMO_PLANNING_BASIC_V2.ruteskabeloner) assert.equal(validerRuteskabelon(skabelon).ok, true);
    assert.equal(DEMO_FAST_KOMMUNAL_SKABELON.standardTildeling.medarbejder.metode, TILDELINGSMETODE.FAST);
    assert.equal(DEMO_FAST_SERVICE_SKABELON.standardTildeling.koeretoej.metode, TILDELINGSMETODE.FAST);
    assert.equal(DEMO_FORETRUKKET_SKABELON.standardTildeling.medarbejder.metode, TILDELINGSMETODE.FORETRUKKET);
  });

  it("tilføjer og fjerner stop i nye versioner uden at mutere originalen", () => {
    const original = klon(DEMO_FAST_KOMMUNAL_SKABELON);
    const nytStop = { ...klon(original.stop[0]), id: "fs-stop-nyt", raekkefoelge: 99 };
    const tilfoejet = tilfoejSkabelonStop(original, nytStop);
    const fjernet = fjernSkabelonStop(tilfoejet, nytStop.id);
    assert.equal(tilfoejet.version, original.version + 1);
    assert.equal(tilfoejet.stop.length, original.stop.length + 1);
    assert.equal(fjernet.stop.length, original.stop.length);
    assert.equal(original.stop.some((s) => s.id === nytStop.id), false);
  });

  it("deaktiverer historisk stop, flytter rækkefølge og ændrer estimat", () => {
    const deaktiveret = deaktiverSkabelonStop(DEMO_FAST_KOMMUNAL_SKABELON, "fs-stop-2");
    assert.equal(deaktiveret.stop.find((s) => s.id === "fs-stop-2").status, SKABELONSTOPSTATUS.INAKTIV);
    const flyttet = flytSkabelonStop(DEMO_FAST_KOMMUNAL_SKABELON, "fs-stop-3", 0);
    assert.equal(flyttet.stop[0].id, "fs-stop-3");
    assert.deepEqual(flyttet.stop.map((s) => s.raekkefoelge), [1, 2, 3]);
    const aendret = aendrSkabelonStopvarighed(DEMO_FAST_KOMMUNAL_SKABELON, "fs-stop-1", 45);
    assert.equal(aendret.stop[0].estimeretVarighedMin, 45);
    assert.equal(DEMO_FAST_KOMMUNAL_SKABELON.stop[0].estimeretVarighedMin, 20);
  });

  it("afviser ugyldige tildelingsmåder, referencer og stoprækkefølge", () => {
    const ugyldig = klon(DEMO_FAST_KOMMUNAL_SKABELON);
    ugyldig.standardTildeling.medarbejder = { metode: "ALTID" };
    ugyldig.stop[1].raekkefoelge = 1;
    assert.equal(kode(validerRuteskabelon(ugyldig), AARSAGSKODE_V2.TILDELINGSMETODE_UGYLDIG), true);
    assert.equal(kode(validerRuteskabelon(ugyldig), AARSAGSKODE_V2.RUTESKABELON_STOP_RAEKKEFOELGE), true);
  });

  it("afviser dagsruter uden for gyldighed eller gentagelsesdag", () => {
    const udenfor = opretDagsruteFraSkabelon(DEMO_FAST_KOMMUNAL_SKABELON, {
      id: "udenfor", dagsplanId: "dag-test", tenantRef: DEMO_V2_TENANT,
      dato: "2033-01-01", tidszone: "Europe/Copenhagen", planlagtStartMs: Date.UTC(2033, 0, 1, 6),
    });
    assert.equal(kode(udenfor, AARSAGSKODE_V2.RUTESKABELON_DATO_UDEN_FOR_GYLDIGHED), true);
    const weekend = opretDagsruteFraSkabelon(DEMO_FAST_KOMMUNAL_SKABELON, {
      id: "weekend", dagsplanId: "dag-test", tenantRef: DEMO_V2_TENANT,
      dato: "2032-05-22", tidszone: "Europe/Copenhagen", planlagtStartMs: Date.UTC(2032, 4, 22, 6),
    });
    assert.equal(kode(weekend, AARSAGSKODE_V2.RUTESKABELON_GENTAGELSE_MATCHER_IKKE), true);
  });

  it("fjerner pauser, der tilhører et fjernet eller deaktiveret stop", () => {
    assert.equal(fjernSkabelonStop(DEMO_FAST_KOMMUNAL_SKABELON, "fs-stop-2").pauser.length, 0);
    assert.equal(deaktiverSkabelonStop(DEMO_FAST_KOMMUNAL_SKABELON, "fs-stop-2").pauser.length, 0);
  });

  it("validerer stopafhængigheder og omsætter dem til stopforekomster", () => {
    const skabelon = klon(DEMO_FAST_KOMMUNAL_SKABELON);
    skabelon.stop[1].afhaengigheder = [{ art: AFHAENGIGHEDSART.EFTER, stopId: "fs-stop-1", niveau: "HARD" }];
    assert.equal(validerRuteskabelon(skabelon).ok, true);
    const svar = opretDagsruteFraSkabelon(skabelon, {
      id: "afh-test", dagsplanId: "dag-test", tenantRef: DEMO_V2_TENANT,
      dato: "2032-05-18", tidszone: "Europe/Copenhagen", planlagtStartMs: Date.UTC(2032, 4, 18, 6),
    });
    assert.equal(svar.rute.stopforekomster[1].afhaengigheder[0].stopforekomstId, "afh-test:fs-stop-1");
    assert.equal(kode(validerRuteskabelon(deaktiverSkabelonStop(skabelon, "fs-stop-1")), AARSAGSKODE.AFHAENGIGHED_UKENDT), true);
    skabelon.stop[0].afhaengigheder = [{ art: AFHAENGIGHEDSART.EFTER, stopId: "fs-stop-2", niveau: "HARD" }];
    assert.equal(kode(validerRuteskabelon(skabelon), AARSAGSKODE.AFHAENGIGHED_CYKLUS), true);
  });
});

describe("Versionsbundet dagsrute", () => {
  it("kopierer kun aktive stop og binder reference, version og snapshot", () => {
    const skabelon = deaktiverSkabelonStop(DEMO_FAST_KOMMUNAL_SKABELON, "fs-stop-2");
    const svar = opretDagsruteFraSkabelon(skabelon, {
      id: "snapshot-test", dagsplanId: "dag-test", tenantRef: DEMO_V2_TENANT,
      dato: "2032-05-18", tidszone: "Europe/Copenhagen", planlagtStartMs: Date.UTC(2032, 4, 18, 6),
    });
    assert.equal(svar.ok, true);
    assert.equal(svar.rute.stopforekomster.length, 2);
    assert.equal(svar.rute.skabelonBinding.version, skabelon.version);
    assert.equal(validerSkabelonDagsrute(svar.rute).ok, true);
  });

  it("ændrer ikke en eksisterende dagsrute, når skabelonen får en ny version", () => {
    assert.equal(DEMO_DAGSRUTE_FAST_MEDARBEJDER.skabelonBinding.version, 1);
    assert.equal(DEMO_SKABELON_EFTER_AENDRING.version, 2);
    assert.equal(DEMO_DAGSRUTE_FAST_MEDARBEJDER.stopforekomster[0].skabelonStopId, "fs-stop-1");
    assert.equal(DEMO_SKABELON_EFTER_AENDRING.stop[0].id, "fs-stop-3");
  });

  it("opdager manipulation af det bundne snapshot", () => {
    const rute = klon(DEMO_DAGSRUTE_FAST_MEDARBEJDER);
    rute.skabelonBinding.version += 1;
    assert.equal(kode(validerSkabelonDagsrute(rute), AARSAGSKODE_V2.SKABELON_SNAPSHOT_UOVERENSSTEMMELSE), true);
  });
});

describe("Faste og foretrukne ressourcer", () => {
  it("understøtter INGEN, FORETRUKKET og FAST uafhængigt for medarbejder og køretøj", () => {
    assert.equal(DEMO_FAST_KOMMUNAL_SKABELON.standardTildeling.koeretoej.metode, TILDELINGSMETODE.INGEN);
    assert.equal(DEMO_FAST_SERVICE_SKABELON.standardTildeling.medarbejder.metode, TILDELINGSMETODE.INGEN);
    assert.equal(DEMO_FORETRUKKET_SKABELON.standardTildeling.medarbejder.metode, TILDELINGSMETODE.FORETRUKKET);
    assert.equal(DEMO_FAST_SERVICE_SKABELON.standardTildeling.koeretoej.metode, TILDELINGSMETODE.FAST);
    assert.equal(DEMO_DAGSRUTE_FAST_MEDARBEJDER.koeretoejRefs.length, 0);
  });

  it("finder brud på fast tildeling og gør præferenceafvigelse ikke-blokerende", () => {
    const fastBrud = klon(DEMO_DAGSRUTE_FAST_MEDARBEJDER);
    fastBrud.medarbejderRefs = [{ kilde: KILDE.WORKFORCE, art: REFERENCEART.MEDARBEJDER, id: "wf-demo-002" }];
    assert.equal(kode(validerSkabelonTildeling(fastBrud, DEMO_PLANNING_BASIC.ressourcer, DEMO_BEREGNING_MS), AARSAGSKODE_V2.FAST_TILDELING_BRUD), true);
    const praef = klon(DEMO_DAGSRUTE_UDEN_OBD);
    praef.medarbejderRefs = [planningReference(REFERENCEART.MEDARBEJDER, "pb-med-007")];
    const ressourcer = klon(DEMO_PLANNING_BASIC.ressourcer);
    ressourcer.find((r) => r.reference.id === "pb-med-007").kompetencer.push("teknik");
    const svar = validerSkabelonTildeling(praef, ressourcer, DEMO_BEREGNING_MS);
    assert.equal(kode(svar, AARSAGSKODE_V2.FORETRUKKET_TILDELING_AFVIGER), true);
    assert.equal(svar.ok, true);
    praef.medarbejderRefs = [];
    assert.equal(kode(validerSkabelonTildeling(praef, ressourcer, DEMO_BEREGNING_MS), AARSAGSKODE_V2.FORETRUKKET_TILDELING_AFVIGER), true);
  });

  it("lader ikke FAST omgå udløbet certifikat eller fravær", () => {
    const skabelon = klon(DEMO_FAST_KOMMUNAL_SKABELON);
    skabelon.standardTildeling.medarbejder.ressourceRef.id = "wf-demo-004";
    const oprettet = opretDagsruteFraSkabelon(skabelon, {
      id: "ulovlig-fast", dagsplanId: "dag-test", tenantRef: DEMO_V2_TENANT,
      dato: "2032-05-18", tidszone: "Europe/Copenhagen", planlagtStartMs: Date.UTC(2032, 4, 18, 9),
    }).rute;
    let svar = validerSkabelonTildeling(oprettet, DEMO_PLANNING_BASIC.ressourcer, DEMO_BEREGNING_MS);
    assert.equal(kode(svar, AARSAGSKODE.CERTIFIKAT_UDLOEBET), true);
    skabelon.standardTildeling.medarbejder.ressourceRef.id = "wf-demo-003";
    const fravaer = opretDagsruteFraSkabelon(skabelon, {
      id: "ulovlig-fravaer", dagsplanId: "dag-test", tenantRef: DEMO_V2_TENANT,
      dato: "2032-05-18", tidszone: "Europe/Copenhagen", planlagtStartMs: Date.UTC(2032, 4, 18, 9),
    }).rute;
    svar = validerSkabelonTildeling(fravaer, DEMO_PLANNING_BASIC.ressourcer, DEMO_BEREGNING_MS);
    assert.equal(kode(svar, AARSAGSKODE.FRAVAER_OVERLAP), true);
  });

  it("lader ikke FAST omgå køretøjstype og kapacitet", () => {
    const skabelon = klon(DEMO_FAST_SERVICE_SKABELON);
    skabelon.standardTildeling.koeretoej.ressourceRef = planningReference(REFERENCEART.KOERETOEJ, "pb-bil-005");
    const rute = opretDagsruteFraSkabelon(skabelon, {
      id: "forkert-bil", dagsplanId: "dag-test", tenantRef: DEMO_V2_TENANT,
      dato: "2032-05-18", tidszone: "Europe/Copenhagen", planlagtStartMs: Date.UTC(2032, 4, 18, 8),
    }).rute;
    const svar = validerSkabelonTildeling(rute, DEMO_PLANNING_BASIC.ressourcer, DEMO_BEREGNING_MS);
    assert.equal(kode(svar, AARSAGSKODE.KOERETOEJSTYPE_FORKERT), true);
    assert.equal(kode(svar, AARSAGSKODE.KOERETOEJSKAPACITET_UTILSTRAEKKELIG), true);
  });

  it("kontrollerer også stopniveauets ressourcekrav", () => {
    const rute = klon(DEMO_DAGSRUTE_FAST_MEDARBEJDER);
    rute.skabelonBinding.snapshot.stop[0].krav.kompetencer = ["umulig-stopkompetence"];
    const svar = validerSkabelonTildeling(rute, DEMO_PLANNING_BASIC.ressourcer, DEMO_BEREGNING_MS);
    assert.equal(kode(svar, AARSAGSKODE.KOMPETENCE_MANGLER), true);
  });
});

describe("Rutetidsberegning", () => {
  it("beregner startkørsel, mellemstop, retur, stop og pause", () => {
    const svar = beregnRutetid(DEMO_DAGSRUTE_FAST_MEDARBEJDER, { koeretider: DEMO_KOERETIDER_FAST });
    assert.equal(svar.komplet, true);
    assert.equal(svar.tidsplan.planlagtStartMs, Date.UTC(2032, 4, 18, 6));
    assert.equal(svar.tidsplan.planlagtSlutMs, Date.UTC(2032, 4, 18, 8, 5));
    assert.equal(svar.tidsplan.samletKoeretidMin, 45);
    assert.equal(svar.tidsplan.samletStoptidMin, 65);
    assert.equal(svar.tidsplan.samletPausetidMin, 15);
    assert.equal(svar.tidsplan.samletRutetidMin, 125);
  });

  it("markerer manglende slutkørsel uden at gætte", () => {
    const svar = beregnRutetid(DEMO_DAGSRUTE_UFULDSAENDIG, { koeretider: DEMO_KOERETIDER_UFULDSAENDIG });
    assert.equal(svar.komplet, false);
    assert.equal(kode(svar, AARSAGSKODE_V2.KOERETID_MANGLER), true);
    assert.equal(svar.mangler.some((m) => m.art === "koeretid"), true);
    assert.equal(svar.tidsplan.planlagtSlutMs, null);
  });

  it("markerer manglende stopvarighed uden at gætte", () => {
    const rute = klon(DEMO_DAGSRUTE_FAST_MEDARBEJDER);
    delete rute.stopforekomster[1].estimeretVarighedMin;
    const svar = beregnRutetid(rute, { koeretider: DEMO_KOERETIDER_FAST });
    assert.equal(svar.komplet, false);
    assert.equal(kode(svar, AARSAGSKODE_V2.STOPVARIGHED_MANGLER), true);
  });

  it("returnerer konkrete tidsvindue-, deadline- og arbejdstidsbrud", () => {
    const rute = klon(DEMO_DAGSRUTE_FAST_MEDARBEJDER);
    rute.stopforekomster[2].tidskrav.deadlineMs = Date.UTC(2032, 4, 18, 7, 30);
    const medarbejder = klon(DEMO_PLANNING_BASIC.ressourcer.find((r) => r.reference.id === "wf-demo-001"));
    medarbejder.tilgaengelighed.vagter[0].tilMs = Date.UTC(2032, 4, 18, 7);
    const svar = beregnRutetid(rute, { koeretider: DEMO_KOERETIDER_FAST, medarbejdere: [medarbejder], beregningMs: DEMO_BEREGNING_MS });
    assert.equal(kode(svar, AARSAGSKODE.DEADLINE_OVERSKREDET), true);
    assert.equal(kode(svar, AARSAGSKODE.UDEN_FOR_VAGT), true);
  });
});

describe("Mobilevents og idempotens", () => {
  it("validerer event med tenant, tildelt medarbejder, tidspunkt og GPS", () => {
    const svar = validerMobilevent(DEMO_MOBILEVENTS_LIVE[0], { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE });
    assert.equal(svar.ok, true);
    assert.equal(svar.event.forsinketSynkronisering, true);
    assert.equal(kode(svar, AARSAGSKODE_V2.MOBILEVENT_FORSINKET_SYNKRONISERING), true);
  });

  it("behandler identiske dubletter idempotent", () => {
    const event = DEMO_MOBILEVENTS_LIVE[0];
    const svar = behandlMobilevents([event, klon(event)], { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE });
    assert.equal(svar.events.length, 1);
    assert.deepEqual(svar.dubletIder, [event.id]);
    assert.equal(kode(svar, AARSAGSKODE_V2.MOBILEVENT_DUBLET_KONFLIKT), false);
  });

  it("opdager samme event-id med forskelligt indhold", () => {
    const event = DEMO_MOBILEVENTS_LIVE[0];
    const svar = behandlMobilevents([event, { ...event, mobilTidMs: event.mobilTidMs + 1 }], { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE });
    assert.equal(kode(svar, AARSAGSKODE_V2.MOBILEVENT_DUBLET_KONFLIKT), true);
    assert.equal(svar.dubletKonflikter.length, 1);
    assert.equal(svar.dubletKonflikter[0].bevaret.mobilTidMs, event.mobilTidMs);
  });

  it("sorterer efter mobilens tid og tåler forkert modtagelsesrækkefølge", () => {
    const ankomst = { ...klon(DEMO_MOBILEVENTS_LIVE[0]), id: "ankomst-sort", mobilTidMs: Date.UTC(2032, 4, 18, 8, 10), modtagetMs: Date.UTC(2032, 4, 18, 8, 40) };
    const afgang = { ...ankomst, id: "afgang-sort", type: MOBILEVENTTYPE.AFGAAET, mobilTidMs: Date.UTC(2032, 4, 18, 8, 30), modtagetMs: Date.UTC(2032, 4, 18, 8, 31) };
    const svar = behandlMobilevents([afgang, ankomst], { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE });
    assert.deepEqual(svar.gyldigeEvents.map((e) => e.id), ["ankomst-sort", "afgang-sort"]);
  });

  it("afviser afgang uden ankomst", () => {
    const afgang = { ...klon(DEMO_MOBILEVENTS_LIVE[0]), id: "afgang-uden", type: MOBILEVENTTYPE.AFGAAET };
    const svar = behandlMobilevents([afgang], { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE });
    assert.equal(kode(svar, AARSAGSKODE_V2.MOBILEVENT_AFGANG_UDEN_ANKOMST), true);
    assert.equal(svar.gyldigeEvents.length, 0);
    const ankomst = { ...afgang, id: "ankomst-foerst", type: MOBILEVENTTYPE.ANKOMMET, mobilTidMs: afgang.mobilTidMs - 2 * minut };
    const andenAfgang = { ...afgang, id: "anden-afgang", mobilTidMs: afgang.mobilTidMs + minut, modtagetMs: afgang.modtagetMs + minut };
    const sekvens = behandlMobilevents([ankomst, afgang, andenAfgang], { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE });
    assert.equal(kode(sekvens, AARSAGSKODE_V2.MOBILEVENT_AFGANG_UDEN_ANKOMST), true);
    assert.deepEqual(sekvens.gyldigeEvents.map((event) => event.id), ["ankomst-foerst", "afgang-uden"]);
  });

  it("afviser ukendt rute, stop, medarbejder, tenant og ugyldig GPS", () => {
    const event = { ...klon(DEMO_MOBILEVENTS_LIVE[0]), tenantRef: "anden-tenant", dagsruteId: "ukendt", stopforekomstId: "ukendt", medarbejderRef: planningReference(REFERENCEART.MEDARBEJDER, "ukendt"), position: { breddegrad: 100, laengdegrad: 0 } };
    const svar = validerMobilevent(event, { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE });
    for (const forventet of [AARSAGSKODE_V2.MOBILEVENT_TENANT_AFVIGER, AARSAGSKODE_V2.MOBILEVENT_RUTE_UKENDT, AARSAGSKODE_V2.MOBILEVENT_STOP_UKENDT, AARSAGSKODE_V2.MOBILEVENT_MEDARBEJDER_IKKE_TILDELT, AARSAGSKODE_V2.GPS_KOORDINAT_UGYLDIG]) assert.equal(kode(svar, forventet), true);
  });

  it("afviser et mobilstempel urimeligt langt fra rutens dag", () => {
    const event = { ...klon(DEMO_MOBILEVENTS_LIVE[0]), mobilTidMs: Date.UTC(2040, 0, 1), modtagetMs: Date.UTC(2040, 0, 1, 0, 1) };
    assert.equal(kode(validerMobilevent(event, { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE }), AARSAGSKODE_V2.MOBILEVENT_TID_UREALISTISK), true);
  });
});

describe("Fremdrift med og uden OBD", () => {
  it("fungerer uden OBD og kalder forventet fremdrift estimeret, aldrig live", () => {
    const fremdrift = beregnFremdrift({ rute: DEMO_DAGSRUTE_LIVE, tidsplan: DEMO_TIDSPLAN_LIVE, mobilevents: DEMO_MOBILEVENTS_LIVE, observationer: [], nuMs: DEMO_V2_NU_MS });
    assert.equal(fremdrift.arbejdsstatus.kvalitet, DATAKVALITET.FORAELDET);
    assert.equal(fremdrift.fysiskPosition.kilde, DATAKILDE.MOBIL);
    assert.equal(fremdrift.forventet.kvalitet, DATAKVALITET.ESTIMERET);
    assert.equal(fremdrift.forventet.erLivePosition, false);
    assert.equal(fremdrift.forventet.beregningsbasis.senesteMobileventId, DEMO_MOBILEVENTS_LIVE[0].id);
    assert.equal(fremdrift.forventet.beregningsbasis.anvendtAfvigelseMin, 40);
    assert.equal(fremdrift.forventet.stopforekomstId, DEMO_DAGSRUTE_LIVE.stopforekomster[1].id);
    assert.equal(fremdrift.forventet.forventetAnkomstMs, DEMO_TIDSPLAN_LIVE.stop[1].ankomstMs + 40 * minut);
    assert.equal(fremdrift.harLiveObd, false);
  });

  it("holder bekræftet arbejdsstatus og live fysisk position adskilt", () => {
    const fremdrift = beregnFremdrift({ rute: DEMO_DAGSRUTE_LIVE, tidsplan: DEMO_TIDSPLAN_LIVE, mobilevents: DEMO_MOBILEVENTS_LIVE, observationer: DEMO_OBD_OBSERVATIONER_LIVE, nuMs: DEMO_OBD_OBSERVATIONER_LIVE[0].tidspunktMs + minut });
    assert.equal(fremdrift.arbejdsstatus.kilde, DATAKILDE.MOBIL);
    assert.equal(fremdrift.fysiskPosition.kilde, DATAKILDE.OBD);
    assert.equal(fremdrift.fysiskPosition.kvalitet, DATAKVALITET.LIVE_OBD);
    assert.equal(fremdrift.harLiveObd, true);
    const udenFriskhedsvurdering = beregnFremdrift({ rute: DEMO_DAGSRUTE_LIVE, tidsplan: DEMO_TIDSPLAN_LIVE, mobilevents: DEMO_MOBILEVENTS_LIVE, observationer: DEMO_OBD_OBSERVATIONER_LIVE });
    assert.equal(udenFriskhedsvurdering.fysiskPosition.kvalitet, DATAKVALITET.FORAELDET);
    assert.equal(udenFriskhedsvurdering.harLiveObd, false);
  });

  it("validerer OBD-formatet, men kræver aldrig en observation på ruten", () => {
    assert.equal(validerObdObservation(DEMO_OBD_OBSERVATIONER_LIVE[0], { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE }).ok, true);
    const uden = sammenholdMobilOgObd({ mobilevents: DEMO_MOBILEVENTS_LIVE, observationer: [], nuMs: DEMO_V2_NU_MS });
    assert.equal(kode(uden, AARSAGSKODE_V2.OBD_MANGLER), true);
    assert.equal(uden.ok, true);
  });

  it("afviser et OBD-køretøj, der ikke er tildelt ruten", () => {
    const observation = { ...klon(DEMO_OBD_OBSERVATIONER_LIVE[0]), koeretoejRef: planningReference(REFERENCEART.KOERETOEJ, "pb-bil-005") };
    assert.equal(kode(validerObdObservation(observation, { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE }), AARSAGSKODE_V2.OBD_KOERETOEJ_IKKE_TILDELT), true);
  });

  it("bevarer begge spor og markerer ankomst uden for stopzonen", () => {
    assert.equal(DEMO_UOVERENSSTEMMELSE.senesteMobilevent.id, DEMO_MOBILEVENTS_LIVE[0].id);
    assert.equal(DEMO_UOVERENSSTEMMELSE.senesteObdObservation.id, DEMO_OBD_OBSERVATIONER_LIVE[0].id);
    assert.equal(DEMO_UOVERENSSTEMMELSE.arbejdsstatusKilde, DATAKILDE.MOBIL);
    assert.equal(DEMO_UOVERENSSTEMMELSE.fysiskPlaceringKilde, DATAKILDE.OBD);
    assert.equal(kode(DEMO_UOVERENSSTEMMELSE, AARSAGSKODE_V2.MOBIL_ANKOMMET_OBD_UDEN_FOR_STOPZONE), true);
    assert.equal(kode(DEMO_UOVERENSSTEMMELSE, AARSAGSKODE_V2.OBD_FORAELDET), true);
    assert.equal(DEMO_UOVERENSSTEMMELSE.konsistent, false);
  });

  it("markerer afgang ved stop og bevægelse under ankommet med særskilte koder", () => {
    const event = klon(DEMO_MOBILEVENTS_LIVE[0]);
    event.type = MOBILEVENTTYPE.AFGAAET;
    const obd = { ...klon(DEMO_OBD_OBSERVATIONER_LIVE[0]), position: DEMO_STOPPOSITIONER[event.stopforekomstId], tidspunktMs: event.mobilTidMs + minut };
    let svar = sammenholdMobilOgObd({ mobilevents: [event], observationer: [obd], stoppositioner: DEMO_STOPPOSITIONER, nuMs: obd.tidspunktMs });
    assert.equal(kode(svar, AARSAGSKODE_V2.MOBIL_AFGAAET_OBD_STADIG_VED_STOP), true);
    event.type = MOBILEVENTTYPE.ANKOMMET;
    obd.hastighedKmt = 20;
    svar = sammenholdMobilOgObd({ mobilevents: [event], observationer: [obd], stoppositioner: DEMO_STOPPOSITIONER, nuMs: obd.tidspunktMs });
    assert.equal(kode(svar, AARSAGSKODE_V2.OBD_BEVAEGELSE_MENS_MOBIL_ANKOMMET), true);
  });
});

describe("Afvigelsesregler", () => {
  it("validerer fælles grænse og grænser pr. rutetype", () => {
    assert.equal(validerAfvigelsesregler(DEMO_AFVIGELSESREGLER_FAELLES).ok, true);
    assert.equal(validerAfvigelsesregler(DEMO_AFVIGELSESREGLER_PR_TYPE).ok, true);
    assert.equal(DEMO_AFVIGELSESREGLER_FAELLES.model, AFVIGELSESMODEL.FAELLES);
    assert.equal(DEMO_AFVIGELSESREGLER_PR_TYPE.model, AFVIGELSESMODEL.PR_RUTETYPE);
  });

  it("klassificerer bekræftet kritisk afvigelse og påvirker senere stop", () => {
    assert.equal(DEMO_KRITISK_AFVIGELSE.afvigelseMin, 40);
    assert.equal(DEMO_KRITISK_AFVIGELSE.niveau, AFVIGELSESNIVEAU.KRITISK);
    assert.equal(DEMO_KRITISK_AFVIGELSE.kilde, DATAKILDE.MOBIL);
    assert.equal(DEMO_KRITISK_AFVIGELSE.kvalitet, DATAKVALITET.BEKRAEFTET_MOBIL);
    assert.equal(DEMO_KRITISK_AFVIGELSE.paavirkedeStop.length, 1);
  });

  it("anvender rutetypens regel og skelner estimeret fra bekræftet", () => {
    const svar = beregnAfvigelse({
      rute: DEMO_DAGSRUTE_UDEN_OBD, tidsplan: DEMO_TIDSPLAN_UDEN_OBD,
      regler: DEMO_AFVIGELSESREGLER_PR_TYPE,
      estimeretGrundlag: { stopforekomstId: DEMO_TIDSPLAN_UDEN_OBD.stop[0].stopforekomstId, type: MOBILEVENTTYPE.ANKOMMET, afvigelseMin: 12 },
    });
    assert.equal(svar.afvigelse.niveau, AFVIGELSESNIVEAU.ADVARSEL);
    assert.equal(svar.afvigelse.kvalitet, DATAKVALITET.ESTIMERET);
    assert.equal(svar.afvigelse.bekræftet, false);
    assert.equal(svar.afvigelse.regelId, "pb2-regel-teknik");
  });

  it("kalder kun et frisk OBD-afvigelsesgrundlag LIVE_OBD", () => {
    const observation = DEMO_OBD_OBSERVATIONER_LIVE[0];
    let svar = beregnAfvigelse({
      rute: DEMO_DAGSRUTE_LIVE, tidsplan: DEMO_TIDSPLAN_LIVE,
      observationer: [observation], regler: DEMO_AFVIGELSESREGLER_FAELLES,
      nuMs: observation.tidspunktMs + minut,
    });
    assert.equal(svar.afvigelse.kvalitet, DATAKVALITET.LIVE_OBD);
    svar = beregnAfvigelse({
      rute: DEMO_DAGSRUTE_LIVE, tidsplan: DEMO_TIDSPLAN_LIVE,
      observationer: [observation], regler: DEMO_AFVIGELSESREGLER_FAELLES,
      nuMs: observation.tidspunktMs + 20 * minut,
    });
    assert.equal(svar.afvigelse.kvalitet, DATAKVALITET.FORAELDET);
  });
});

describe("Redigerbart løsningsforslag", () => {
  it("validerer den syntetiske kontrakt uden at beregne et forslag", () => {
    assert.equal(validerLoesningsforslag(DEMO_LOESNINGSFORSLAG).ok, true);
    assert.equal(DEMO_LOESNINGSFORSLAG.status, LOESNINGSFORSLAGSTATUS.FORESLAAET);
    assert.equal(DEMO_LOESNINGSFORSLAG.redigerbar, true);
    assert.equal(DEMO_LOESNINGSFORSLAG.frigivet, false);
  });

  it("forhindrer frigivelse uden disponentgodkendelse", () => {
    const forslag = { ...klon(DEMO_LOESNINGSFORSLAG), frigivet: true };
    assert.equal(kode(validerLoesningsforslag(forslag), AARSAGSKODE_V2.LOESNINGSFORSLAG_GODKENDELSE_MANGLER), true);
  });

  it("kræver den fulde forslagspayload og aktør på en godkendelse", () => {
    const manglerKoersel = klon(DEMO_LOESNINGSFORSLAG);
    delete manglerKoersel.ekstraKoeretidMin;
    assert.equal(kode(validerLoesningsforslag(manglerKoersel), AARSAGSKODE_V2.LOESNINGSFORSLAG_UGYLDIGT), true);
    const godkendt = { ...klon(DEMO_LOESNINGSFORSLAG), status: LOESNINGSFORSLAGSTATUS.GODKENDT, disponentGodkendelse: { godkendt: true, tidspunktMs: DEMO_V2_NU_MS } };
    assert.equal(kode(validerLoesningsforslag(godkendt), AARSAGSKODE_V2.LOESNINGSFORSLAG_GODKENDELSE_MANGLER), true);
  });
});

describe("Tenant-, reference- og importgrænser", () => {
  it("holder hele v2-demoen tydeligt syntetisk og deterministisk", () => {
    assert.equal(DEMO_PLANNING_BASIC_V2.metadata.syntetisk, true);
    assert.equal(DEMO_PLANNING_BASIC_V2.metadata.obdIntegration, false);
    assert.ok(DEMO_PLANNING_BASIC_V2.ruteskabeloner.every((s) => /Fiktiv/i.test(s.navn)));
    assert.ok(DEMO_PLANNING_BASIC_V2.mobilevents.every((e) => e.syntetisk === true));
    assert.ok(DEMO_PLANNING_BASIC_V2.obdObservationer.every((o) => o.syntetisk === true));
    assert.match(DEMO_PLANNING_BASIC_V2.tenantRef, /fiktiv/);
    assert.deepEqual(klon(DEMO_PLANNING_BASIC_V2), klon(DEMO_PLANNING_BASIC_V2));
  });

  it("bruger hverken systemtid eller tilfældighed i validering og beregning", () => {
    const oprindeligNu = Date.now;
    const oprindeligRandom = Math.random;
    Date.now = () => { throw new Error("Date.now må ikke bruges"); };
    Math.random = () => { throw new Error("Math.random må ikke bruges"); };
    try {
      assert.equal(validerRuteskabelon(DEMO_FAST_KOMMUNAL_SKABELON).ok, true);
      assert.equal(beregnRutetid(DEMO_DAGSRUTE_FAST_MEDARBEJDER, { koeretider: DEMO_KOERETIDER_FAST }).komplet, true);
      assert.equal(beregnFremdrift({ rute: DEMO_DAGSRUTE_LIVE, tidsplan: DEMO_TIDSPLAN_LIVE, mobilevents: DEMO_MOBILEVENTS_LIVE, nuMs: DEMO_V2_NU_MS }).forventet.kvalitet, DATAKVALITET.ESTIMERET);
    } finally {
      Date.now = oprindeligNu;
      Math.random = oprindeligRandom;
    }
  });

  it("isolerer mobilevents og OBD-observationer på tenant", () => {
    const mobil = validerMobilevent(DEMO_MOBILEVENTS_LIVE[0], { tenantRef: "anden-tenant", rute: DEMO_DAGSRUTE_LIVE });
    const obd = validerObdObservation(DEMO_OBD_OBSERVATIONER_LIVE[0], { tenantRef: "anden-tenant", rute: DEMO_DAGSRUTE_LIVE });
    assert.equal(kode(mobil, AARSAGSKODE_V2.MOBILEVENT_TENANT_AFVIGER), true);
    assert.equal(kode(obd, AARSAGSKODE_V2.OBD_TENANT_AFVIGER), true);
  });

  it("afviser forkert typed medarbejder- og køretøjsreference", () => {
    const event = { ...klon(DEMO_MOBILEVENTS_LIVE[0]), medarbejderRef: planningReference(REFERENCEART.KOERETOEJ, "pb-bil-005") };
    const observation = { ...klon(DEMO_OBD_OBSERVATIONER_LIVE[0]), koeretoejRef: planningReference(REFERENCEART.MEDARBEJDER, "pb-med-005") };
    assert.equal(kode(validerMobilevent(event, { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE }), AARSAGSKODE.REFERENCE_ART_FORKERT), true);
    assert.equal(kode(validerObdObservation(observation, { tenantRef: DEMO_V2_TENANT, rute: DEMO_DAGSRUTE_LIVE }), AARSAGSKODE.REFERENCE_ART_FORKERT), true);
  });

  const nyeKernefiler = [
    "src/fleet/planning-basic-v2.js", "src/fleet/planning-basic-v2-kontrakt.js",
    "src/fleet/planning-basic-ruteskabeloner.js", "src/fleet/planning-basic-tidsberegning.js",
    "src/fleet/planning-basic-fremdrift.js", "src/fleet/demo-planning-basic-v2.js",
  ];
  const imports = (fil) => [...readFileSync(fil, "utf8").matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)].map((m) => m[1]);
  function grafFra(start, sete = new Set()) {
    const fil = resolve(rod, start);
    if (sete.has(fil)) return sete;
    sete.add(fil);
    for (const imp of imports(fil)) {
      if (!imp.startsWith(".")) continue;
      let maal = resolve(dirname(fil), imp);
      if (!extname(maal)) maal += ".js";
      grafFra(maal, sete);
    }
    return sete;
  }

  it("holder v2-kernens transitive importgraf fri for UI, Firebase og permissions", () => {
    for (const fil of grafFra("src/fleet/planning-basic-v2.js")) {
      assert.doesNotMatch(fil.replaceAll("\\", "/"), /firebase\.js|permissions\.js|booking-state\.js|\.jsx$/i, fil);
      assert.doesNotMatch(readFileSync(fil, "utf8"), /from\s+["'][^"']*(firebase|permissions|booking-state|react)[^"']*["']/i, fil);
    }
  });

  it("etablerer ingen persistence, netværk, solver eller ekstern integration", () => {
    for (const fil of nyeKernefiler) {
      const kilde = readFileSync(resolve(rod, fil), "utf8");
      assert.doesNotMatch(kilde, /kaldFunktion|httpsCallable|initializeApp|getDatabase|firebase\.|fetch\(/, fil);
      assert.doesNotMatch(kilde, /\b(?:db|ref)\s*\.\s*(?:set|update|push|remove)\s*\(/, fil);
      assert.doesNotMatch(kilde, /solver|heuristik|optimi[sz]/i, fil);
    }
  });

  it("ingen eksisterende ikke-Planning-fil importerer v2-kernen", () => {
    const src = resolve(rod, "src");
    const alle = [];
    const gaa = (mappe) => {
      for (const navn of readdirSync(mappe)) {
        const fil = join(mappe, navn);
        if (statSync(fil).isDirectory()) gaa(fil);
        else if (/\.(js|jsx)$/.test(navn)) alle.push(fil);
      }
    };
    gaa(src);
    const nye = new Set(nyeKernefiler.map((f) => resolve(rod, f)));
    const erPlanningUi = (fil) => fil.replaceAll("\\", "/").includes("/src/fleet/planning-ui/");
    const erRentPlanningLag = (fil) => /\/src\/fleet\/planning-(?:input|execution)\//.test(fil.replaceAll("\\", "/"));
    const uiFiler = alle.filter(erPlanningUi);
    assert.ok(uiFiler.length > 0, "Planning-UI skal klassificeres som Planning, ikke som domænekerne");

    for (const fil of alle.filter((f) => !nye.has(f) && !f.endsWith("planning-basic.js") && !erPlanningUi(f) && !erRentPlanningLag(f))) {
      assert.doesNotMatch(readFileSync(fil, "utf8"), /planning-basic-v2/, fil);
    }

    for (const fil of uiFiler) {
      for (const imp of imports(fil)) {
        if (/planning-basic-v2/.test(imp)) {
          assert.ok(["../planning-basic-v2.js", "../demo-planning-basic-v2.js"].includes(imp), `${fil} skal bruge v2-facaden eller den syntetiske v2-fixture`);
        }
        assert.doesNotMatch(imp, /fleet\.css|firebase|functions|permissions|booking-state/i, `${fil} har en forbudt UI-import`);
      }
    }

    for (const fil of alle.filter(erRentPlanningLag)) {
      const kilde = readFileSync(fil, "utf8");
      assert.doesNotMatch(kilde, /from\s+["'][^"']*(react|firebase|permissions|booking-state|planning-ui)[^"']*["']/i, fil);
      assert.doesNotMatch(kilde, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.|window\.|navigator\./i, fil);
    }
  });
});
