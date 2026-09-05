/* Tydeligt syntetiske etape 2-data. Ingen position er geokodet eller vejberegnet. */

import {
  GENTAGELSESART, KILDE, REFERENCEART, TIDSFORM, planningReference,
} from "./planning-basic.js";
import { DEMO_PLANNING_BASIC } from "./demo-planning-basic.js";
import {
  AFVIGELSESMODEL, DATAKILDE, LOESNINGSFORSLAGSTATUS, MOBILEVENTTYPE,
  SKABELONSTATUS, SKABELONSTOPSTATUS, TILDELINGSMETODE,
} from "./planning-basic-v2-kontrakt.js";
import {
  flytSkabelonStop, opretDagsruteFraSkabelon,
} from "./planning-basic-ruteskabeloner.js";
import { beregnRutetid, koeretidssegmenterForRute } from "./planning-basic-tidsberegning.js";
import { beregnAfvigelse, sammenholdMobilOgObd } from "./planning-basic-fremdrift.js";

export const DEMO_V2_TENANT = "tenant-fiktiv-planning-v2";
export const DEMO_V2_DATO = "2032-05-18";
export const DEMO_V2_NU_MS = Date.UTC(2032, 4, 18, 9, 15);
const tid = (time, minut = 0) => Date.UTC(2032, 4, 18, time, minut);
const ref = (kilde, art, id) => ({ kilde, art, id });
const lok = (id) => planningReference(REFERENCEART.LOKATION, id);
const opg = (id) => planningReference(REFERENCEART.OPGAVE, id);
const medarbejder = (id, kilde = KILDE.WORKFORCE) => ref(kilde, REFERENCEART.MEDARBEJDER, id);
const bil = (id, kilde = KILDE.FLEET) => ref(kilde, REFERENCEART.KOERETOEJ, id);
const ingen = () => ({ metode: TILDELINGSMETODE.INGEN });
const fast = (ressourceRef) => ({ metode: TILDELINGSMETODE.FAST, ressourceRef });
const foretrukket = (ressourceRef) => ({ metode: TILDELINGSMETODE.FORETRUKKET, ressourceRef });
const frieKrav = () => ({ kompetencer: [], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } });
const stop = (id, raekkefoelge, opgaveId, lokationId, estimeretVarighedMin, tidskrav) => ({
  id, raekkefoelge, maalRef: opg(opgaveId), lokationRef: lok(lokationId),
  estimeretVarighedMin, tidskrav, krav: frieKrav(), afhaengigheder: [],
  status: SKABELONSTOPSTATUS.AKTIV,
});

export const DEMO_FAST_KOMMUNAL_SKABELON = {
  id: "pb2-skabelon-feltservice", reference: planningReference(REFERENCEART.RUTESKABELON, "pb2-skabelon-feltservice"),
  navn: "Fiktiv kommunal reference-rute", rutetype: "feltservice", status: SKABELONSTATUS.AKTIV,
  gyldigFra: "2032-01-01", gyldigTil: "2032-12-31", gentagelse: { art: GENTAGELSESART.UGEDAGE, ugedage: [1, 2, 3, 4, 5] },
  startLokationRef: lok("pb-depot-nord"), slutLokationRef: lok("pb-depot-midt"),
  stop: [
    stop("fs-stop-1", 1, "pb-opg-001", "pb-lok-001", 20, { art: TIDSFORM.FAST, startMs: tid(6, 10) }),
    stop("fs-stop-2", 2, "pb-opg-002", "pb-lok-002", 25, { art: TIDSFORM.VINDUE, fraMs: tid(6, 40), tilMs: tid(7, 30) }),
    stop("fs-stop-3", 3, "pb-opg-003", "pb-lok-003", 20, { art: TIDSFORM.DEADLINE, deadlineMs: tid(8) }),
  ],
  pauser: [{ id: "fs-pause-1", efterStopId: "fs-stop-2", varighedMin: 15 }],
  standardKrav: { kompetencer: ["basis"], certifikater: ["medicin"], udstyrRefs: [], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } },
  standardTildeling: { medarbejder: fast(medarbejder("wf-demo-001")), koeretoej: ingen() },
  standardVarighedMin: 125, version: 1,
};

export const DEMO_FAST_SERVICE_SKABELON = {
  id: "pb2-skabelon-service", reference: planningReference(REFERENCEART.RUTESKABELON, "pb2-skabelon-service"),
  navn: "Fiktiv fast transport- og servicerute", rutetype: "transportservice", status: SKABELONSTATUS.AKTIV,
  gyldigFra: "2032-01-01", gyldigTil: null, gentagelse: { art: GENTAGELSESART.DAGLIG, interval: 1 },
  startLokationRef: lok("pb-depot-midt"), slutLokationRef: lok("pb-depot-syd"),
  stop: [
    stop("ts-stop-1", 1, "pb-opg-009", "pb-lok-004", 20, { art: TIDSFORM.FRI }),
    stop("ts-stop-2", 2, "pb-opg-010", "pb-lok-005", 25, { art: TIDSFORM.DEADLINE, deadlineMs: tid(10) }),
  ],
  pauser: [], standardKrav: { kompetencer: ["basis"], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: true, typer: ["varevogn"], kapacitet: { kg: 300 } } },
  standardTildeling: { medarbejder: ingen(), koeretoej: fast(bil("fleet-demo-001")) },
  standardVarighedMin: 80, version: 3,
};

export const DEMO_FORETRUKKET_SKABELON = {
  id: "pb2-skabelon-teknik", reference: planningReference(REFERENCEART.RUTESKABELON, "pb2-skabelon-teknik"),
  navn: "Fiktiv teknisk rute uden OBD", rutetype: "teknisk_service", status: SKABELONSTATUS.AKTIV,
  gyldigFra: "2032-01-01", gyldigTil: null, gentagelse: { art: GENTAGELSESART.HVER_N_UGE, interval: 1, ugedage: [2, 4] },
  startLokationRef: lok("pb-depot-syd"), slutLokationRef: lok("pb-depot-syd"),
  stop: [stop("tek-stop-1", 1, "pb-opg-004", "pb-lok-006", 30, { art: TIDSFORM.FRI })],
  pauser: [], standardKrav: { kompetencer: ["teknik"], certifikater: [], udstyrRefs: [planningReference(REFERENCEART.UDSTYR, "pb-udstyr-001")], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } },
  standardTildeling: { medarbejder: foretrukket(medarbejder("pb-med-006", KILDE.PLANNING)), koeretoej: ingen() },
  standardVarighedMin: 50, version: 1,
};

function dagsrute(skabelon, id, startMs, ekstra = {}) {
  const svar = opretDagsruteFraSkabelon(skabelon, {
    id, dagsplanId: "pb2-dagsplan-001", tenantRef: DEMO_V2_TENANT,
    dato: DEMO_V2_DATO, tidszone: "Europe/Copenhagen", planlagtStartMs: startMs, ...ekstra,
  });
  if (!svar.ok || !svar.rute) throw new Error(`Syntetisk dagsrute kunne ikke oprettes: ${svar.fund.map((f) => f.kode).join(", ")}`);
  return svar.rute;
}

export const DEMO_DAGSRUTE_FAST_MEDARBEJDER = dagsrute(DEMO_FAST_KOMMUNAL_SKABELON, "pb2-rute-feltservice", tid(6));
export const DEMO_DAGSRUTE_LIVE = dagsrute(DEMO_FAST_SERVICE_SKABELON, "pb2-rute-live", tid(8), { medarbejderRef: medarbejder("wf-demo-002") });
export const DEMO_DAGSRUTE_UDEN_OBD = dagsrute(DEMO_FORETRUKKET_SKABELON, "pb2-rute-uden-obd", tid(11));
export const DEMO_DAGSRUTE_UFULDSAENDIG = dagsrute(DEMO_FAST_SERVICE_SKABELON, "pb2-rute-ufuldstaendig", tid(13), { medarbejderRef: medarbejder("wf-demo-002") });

function koeretider(rute, minutter) {
  return koeretidssegmenterForRute(rute).map((segment, i) => ({ segmentId: segment.id, varighedMin: minutter[i] }));
}

export const DEMO_KOERETIDER_FAST = koeretider(DEMO_DAGSRUTE_FAST_MEDARBEJDER, [10, 10, 15, 10]);
export const DEMO_KOERETIDER_LIVE = koeretider(DEMO_DAGSRUTE_LIVE, [10, 15, 10]);
export const DEMO_KOERETIDER_UDEN_OBD = koeretider(DEMO_DAGSRUTE_UDEN_OBD, [10, 10]);
export const DEMO_KOERETIDER_UFULDSAENDIG = koeretider(DEMO_DAGSRUTE_UFULDSAENDIG, [10, 15, 10]).slice(0, -1);

export const DEMO_TIDSPLAN_FAST = beregnRutetid(DEMO_DAGSRUTE_FAST_MEDARBEJDER, { koeretider: DEMO_KOERETIDER_FAST }).tidsplan;
export const DEMO_TIDSPLAN_LIVE = beregnRutetid(DEMO_DAGSRUTE_LIVE, { koeretider: DEMO_KOERETIDER_LIVE }).tidsplan;
export const DEMO_TIDSPLAN_UDEN_OBD = beregnRutetid(DEMO_DAGSRUTE_UDEN_OBD, { koeretider: DEMO_KOERETIDER_UDEN_OBD }).tidsplan;

export const DEMO_SKABELON_EFTER_AENDRING = flytSkabelonStop(DEMO_FAST_KOMMUNAL_SKABELON, "fs-stop-3", 0);

const liveStop = DEMO_DAGSRUTE_LIVE.stopforekomster[0];
export const DEMO_MOBILEVENTS_LIVE = [{
  id: "pb2-mobil-ankomst-1", tenantRef: DEMO_V2_TENANT, dagsruteId: DEMO_DAGSRUTE_LIVE.id,
  stopforekomstId: liveStop.id, medarbejderRef: medarbejder("wf-demo-002"), type: MOBILEVENTTYPE.ANKOMMET,
  mobilTidMs: DEMO_TIDSPLAN_LIVE.stop[0].ankomstMs + 40 * 60000,
  modtagetMs: DEMO_TIDSPLAN_LIVE.stop[0].ankomstMs + 60 * 60000,
  position: { breddegrad: 55.9901, laengdegrad: 8.0451 }, gpsNoejagtighedMeter: 12,
  kilde: DATAKILDE.MOBIL, offlineSynkronisering: true, syntetisk: true,
}];

export const DEMO_OBD_OBSERVATIONER_LIVE = [{
  id: "pb2-obd-1", tenantRef: DEMO_V2_TENANT, koeretoejRef: bil("fleet-demo-001"),
  dagsruteId: DEMO_DAGSRUTE_LIVE.id, tidspunktMs: DEMO_MOBILEVENTS_LIVE[0].mobilTidMs + 60000,
  modtagetMs: DEMO_MOBILEVENTS_LIVE[0].mobilTidMs + 2 * 60000,
  position: { breddegrad: 56.0300, laengdegrad: 8.1000 }, hastighedKmt: 0,
  gpsNoejagtighedMeter: 8, kilde: DATAKILDE.OBD, syntetisk: true,
  fremdriftsmarkoer: { type: MOBILEVENTTYPE.ANKOMMET, stopforekomstId: liveStop.id },
}];

export const DEMO_STOPPOSITIONER = {
  [liveStop.id]: { breddegrad: 55.99, laengdegrad: 8.045, radiusMeter: 100 },
};

export const DEMO_UOVERENSSTEMMELSE = sammenholdMobilOgObd({
  mobilevents: DEMO_MOBILEVENTS_LIVE, observationer: DEMO_OBD_OBSERVATIONER_LIVE,
  stoppositioner: DEMO_STOPPOSITIONER, nuMs: DEMO_V2_NU_MS,
});

export const DEMO_AFVIGELSESREGLER_FAELLES = {
  model: AFVIGELSESMODEL.FAELLES,
  faelles: { id: "pb2-regel-faelles", advarselMin: 10, kritiskMin: 30 },
};
export const DEMO_AFVIGELSESREGLER_PR_TYPE = {
  model: AFVIGELSESMODEL.PR_RUTETYPE,
  prRutetype: {
    feltservice: { id: "pb2-regel-feltservice", advarselMin: 5, kritiskMin: 20 },
    transportservice: { id: "pb2-regel-transport", advarselMin: 15, kritiskMin: 35 },
    teknisk_service: { id: "pb2-regel-teknik", advarselMin: 10, kritiskMin: 25 },
  },
};

export const DEMO_KRITISK_AFVIGELSE = beregnAfvigelse({
  rute: DEMO_DAGSRUTE_LIVE, tidsplan: DEMO_TIDSPLAN_LIVE,
  mobilevents: DEMO_MOBILEVENTS_LIVE, observationer: [], regler: DEMO_AFVIGELSESREGLER_FAELLES,
}).afvigelse;

export const DEMO_LOESNINGSFORSLAG = {
  id: "pb2-loesning-1", tenantRef: DEMO_V2_TENANT, ruteId: DEMO_DAGSRUTE_LIVE.id,
  udloesendeAfvigelse: DEMO_KRITISK_AFVIGELSE,
  berørteStopIder: [DEMO_KRITISK_AFVIGELSE.stopforekomstId, ...DEMO_KRITISK_AFVIGELSE.paavirkedeStop.map((s) => s.stopforekomstId)],
  foreslaaedeAendringer: [{ art: "aendrPlanlagtTid", stopforekomstId: DEMO_DAGSRUTE_LIVE.stopforekomster[1].id, nyAnkomstMs: DEMO_TIDSPLAN_LIVE.stop[1].ankomstMs + 40 * 60000 }],
  aendredeAnkomsttider: DEMO_KRITISK_AFVIGELSE.paavirkedeStop,
  ekstraKoeretidMin: 0, reduceretKoeretidMin: 0,
  berørteMedarbejderRefs: [medarbejder("wf-demo-002")], berørteKoeretoejRefs: [bil("fleet-demo-001")],
  regelbrud: [], status: LOESNINGSFORSLAGSTATUS.FORESLAAET, redigerbar: true,
  kraeverDisponentGodkendelse: true, disponentGodkendelse: null, frigivet: false,
  syntetisk: true,
};

export const DEMO_PLANNING_BASIC_V2 = Object.freeze({
  metadata: { syntetisk: true, brancheuafhaengig: true, obdIntegration: false, geokodet: false, vejberegnet: false },
  tenantRef: DEMO_V2_TENANT,
  ruteskabeloner: [DEMO_FAST_KOMMUNAL_SKABELON, DEMO_FAST_SERVICE_SKABELON, DEMO_FORETRUKKET_SKABELON],
  dagsruter: [DEMO_DAGSRUTE_FAST_MEDARBEJDER, DEMO_DAGSRUTE_LIVE, DEMO_DAGSRUTE_UDEN_OBD, DEMO_DAGSRUTE_UFULDSAENDIG],
  mobilevents: DEMO_MOBILEVENTS_LIVE, obdObservationer: DEMO_OBD_OBSERVATIONER_LIVE,
  loesningsforslag: [DEMO_LOESNINGSFORSLAG],
  ressourceSnapshot: DEMO_PLANNING_BASIC.ressourcer,
});
