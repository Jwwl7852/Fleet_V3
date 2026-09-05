/* Deterministiske og tydeligt syntetiske UI-fixtures. Ingen position er geokodet. */

import {
  DATAKILDE, LOESNINGSFORSLAGSTATUS, MOBILEVENTTYPE, REGELNIVEAU,
} from "../planning-basic-v2.js";
import {
  DEMO_FAST_KOMMUNAL_SKABELON, DEMO_FAST_SERVICE_SKABELON,
  DEMO_FORETRUKKET_SKABELON, DEMO_PLANNING_BASIC_V2,
} from "../demo-planning-basic-v2.js";
import {
  DEMO_DATO, DEMO_NU_MS, koeretoejReference, medarbejderReference,
} from "./planning-ui-model.js";

const MINUT = 60000;
const DAG_MS = Date.UTC(2032, 4, 18);
const klon = (v) => structuredClone(v);

export const UI_MEDARBEJDERE = Object.freeze([
  { id: "wf-demo-001", navn: "Demo Alma Fiktiv", team: "Nord", kompetencer: ["basis", "medicin"] },
  { id: "wf-demo-002", navn: "Demo Bertram Fiktiv", team: "Midt", kompetencer: ["basis", "transport"] },
  { id: "pb-med-006", navn: "Demo Clara Fiktiv", team: "Teknik", kompetencer: ["basis", "teknik"] },
  { id: "pb-med-007", navn: "Demo David Fiktiv", team: "Nord", kompetencer: ["basis"] },
  { id: "wf-demo-005", navn: "Demo Elin Fiktiv", team: "Syd", kompetencer: ["basis", "renovation"] },
  { id: "wf-demo-006", navn: "Demo Farid Fiktiv", team: "Midt", kompetencer: ["basis", "service"] },
]);

export const UI_KOERETOEJER = Object.freeze([
  { id: "fleet-demo-001", navn: "DEMO-01 · Varevogn", type: "varevogn", kapacitet: "800 kg" },
  { id: "fleet-demo-002", navn: "DEMO-02 · Elbil", type: "personbil", kapacitet: "4 pl." },
  { id: "fleet-demo-003", navn: "DEMO-03 · Minibus", type: "minibus", kapacitet: "8 pl." },
  { id: "fleet-demo-004", navn: "DEMO-04 · Servicebil", type: "servicebil", kapacitet: "500 kg" },
  { id: "fleet-demo-005", navn: "DEMO-05 · Kompaktbil", type: "personbil", kapacitet: "4 pl." },
  { id: "fleet-demo-006", navn: "DEMO-06 · Renovation", type: "renovation", kapacitet: "3.000 kg" },
  { id: "fleet-demo-007", navn: "DEMO-07 · Reserve", type: "varevogn", kapacitet: "600 kg" },
]);

const STOPNAVNE = ["Alfa", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];
const RUTER = [
  { id: "ui-rute-nord", navn: "Fiktiv Nordrunde", rutetype: "hjemmepleje", medarbejderId: "wf-demo-001", koeretoejId: "fleet-demo-002", startMinut: 390, stopAntal: 6, gennemfoert: 4, afvigelseMin: 4, obd: "frisk", fast: true, startsted: "Demo-depot Nord", slutsted: "Demo-depot Nord" },
  { id: "ui-rute-service", navn: "Fiktiv Servicerute A", rutetype: "service", medarbejderId: "wf-demo-002", koeretoejId: "fleet-demo-001", startMinut: 420, stopAntal: 5, gennemfoert: 3, afvigelseMin: 38, obd: "frisk", konflikt: true, fast: true, startsted: "Demo-base Midt", slutsted: "Demo-base Syd" },
  { id: "ui-rute-cykel", navn: "Fiktiv Nærzone", rutetype: "hjemmepleje", medarbejderId: "pb-med-006", koeretoejId: null, startMinut: 450, stopAntal: 5, gennemfoert: 2, afvigelseMin: 9, obd: "ingen", startsted: "Demo-mødested Vest", slutsted: "Demo-mødested Vest" },
  { id: "ui-rute-transport", navn: "Fiktiv Transportlinje", rutetype: "transport", medarbejderId: "pb-med-007", koeretoejId: "fleet-demo-003", startMinut: 405, stopAntal: 5, gennemfoert: 3, afvigelseMin: 18, obd: "foraeldet", startsted: "Demo-terminal", slutsted: "Demo-terminal" },
  { id: "ui-rute-syd", navn: "Fiktiv Sydrunde", rutetype: "hjemmepleje", medarbejderId: "wf-demo-005", koeretoejId: "fleet-demo-005", startMinut: 480, stopAntal: 5, gennemfoert: 1, afvigelseMin: 17, obd: "ingen", startsted: "Demo-depot Syd", slutsted: "Demo-depot Syd" },
  { id: "ui-rute-renovation", navn: "Fiktiv Miljørute", rutetype: "renovation", medarbejderId: "wf-demo-006", koeretoejId: "fleet-demo-006", startMinut: 360, stopAntal: 5, gennemfoert: 5, afvigelseMin: 0, obd: "frisk", startsted: "Demo-drift Øst", slutsted: "Demo-drift Øst" },
  { id: "ui-rute-teknik", navn: "Fiktiv Teknikrunde", rutetype: "service", medarbejderId: "pb-med-006", koeretoejId: "fleet-demo-004", startMinut: 570, stopAntal: 5, gennemfoert: 0, afvigelseMin: -3, obd: "ingen", startsted: "Demo-værksted", slutsted: "Demo-værksted" },
  { id: "ui-rute-reserve", navn: "Fiktiv Reserverute", rutetype: "transport", medarbejderId: "wf-demo-002", koeretoejId: "fleet-demo-007", startMinut: 600, stopAntal: 4, gennemfoert: 0, afvigelseMin: 34, obd: "frisk", manglerSlutkoersel: true, startsted: "Demo-base Midt", slutsted: "Demo-terminal" },
];

function bygStop(rute, indeks, markoer) {
  const koerselFoerMin = 7 + ((indeks + rute.id.length) % 4) * 3;
  const ventetidMin = indeks === 1 && rute.id === "ui-rute-nord" ? 8 : 0;
  const varighedMin = 14 + ((indeks + rute.id.length) % 3) * 6;
  const planlagtMinut = markoer + koerselFoerMin;
  const status = indeks < rute.gennemfoert ? "gennemfoert" : indeks === rute.gennemfoert && rute.gennemfoert < rute.stopAntal ? "igang" : "fremtidig";
  const nummer = RUTER.findIndex((post) => post.id === rute.id) * 10 + indeks + 1;
  return {
    stop: {
      id: `${rute.id}-stop-${indeks + 1}`,
      navn: `Fiktivt stop ${STOPNAVNE[indeks]}`,
      adresse: `Testvej ${100 + nummer}, 0000 Demoby`,
      planlagtMinut, forventetMinut: planlagtMinut + rute.afvigelseMin,
      koerselFoerMin, ventetidMin, varighedMin,
      pauseEfterMin: indeks === 2 && rute.stopAntal > 4 ? 15 : 0,
      status,
      tidsvindue: `${String(Math.floor(planlagtMinut / 60)).padStart(2, "0")}.${String(planlagtMinut % 60).padStart(2, "0")}–${String(Math.floor((planlagtMinut + 45) / 60)).padStart(2, "0")}.${String((planlagtMinut + 45) % 60).padStart(2, "0")}`,
      position: { breddegrad: 55.7 + nummer / 1000, laengdegrad: 8.4 + nummer / 1200 },
      kortpunkt: { x: 12 + ((nummer * 17) % 75), y: 14 + ((nummer * 23) % 70) },
    },
    naesteMarkoer: planlagtMinut + ventetidMin + varighedMin + (indeks === 2 && rute.stopAntal > 4 ? 15 : 0),
  };
}

function bygRute(definition) {
  const stop = [];
  let markoer = definition.startMinut;
  for (let indeks = 0; indeks < definition.stopAntal; indeks += 1) {
    const bygget = bygStop(definition, indeks, markoer);
    stop.push(bygget.stop);
    markoer = bygget.naesteMarkoer;
  }
  const rute = {
    ...definition,
    dato: DEMO_DATO,
    datoStartMs: DAG_MS + definition.startMinut * MINUT,
    status: definition.gennemfoert === definition.stopAntal ? "afsluttet" : definition.gennemfoert ? "aktiv" : "planlagt",
    stop,
    koerselTilSlutMin: definition.manglerSlutkoersel ? null : 10 + (definition.stopAntal % 3) * 3,
    mobilevents: [], obdObservationer: [], datakonflikt: definition.konflikt === true, planAendret: false,
    kortRute: stop.map((post) => post.kortpunkt),
  };
  const aktivtStop = stop[Math.min(definition.gennemfoert, stop.length - 1)];
  if (definition.gennemfoert || definition.obd !== "ingen") {
    const mobilTidMs = DAG_MS + (aktivtStop.planlagtMinut + definition.afvigelseMin) * MINUT;
    rute.mobilevents.push({
      id: `mobil-${definition.id}`, tenantRef: "tenant-fiktiv-ui-demo", dagsruteId: definition.id,
      stopforekomstId: aktivtStop.id, medarbejderRef: medarbejderReference(definition.medarbejderId),
      type: definition.gennemfoert === definition.stopAntal ? MOBILEVENTTYPE.AFGAAET : MOBILEVENTTYPE.ANKOMMET,
      mobilTidMs, modtagetMs: mobilTidMs + (definition.id === "ui-rute-cykel" ? 12 : 1) * MINUT,
      position: klon(aktivtStop.position), gpsNoejagtighedMeter: 11,
      kilde: DATAKILDE.MOBIL, offlineSynkronisering: definition.id === "ui-rute-cykel",
      synkroniseret: definition.id !== "ui-rute-cykel", syntetisk: true,
    });
  }
  if (definition.obd !== "ingen") {
    const frisk = definition.obd === "frisk";
    const tidspunktMs = frisk ? DEMO_NU_MS - 2 * MINUT : DEMO_NU_MS - 62 * MINUT;
    const position = definition.konflikt
      ? { breddegrad: aktivtStop.position.breddegrad + 0.06, laengdegrad: aktivtStop.position.laengdegrad + 0.05 }
      : klon(aktivtStop.position);
    rute.obdObservationer.push({
      id: `obd-${definition.id}`, tenantRef: "tenant-fiktiv-ui-demo",
      koeretoejRef: koeretoejReference(definition.koeretoejId), dagsruteId: definition.id,
      tidspunktMs, modtagetMs: tidspunktMs + MINUT, position, hastighedKmt: frisk ? 18 : 0,
      gpsNoejagtighedMeter: 9, kilde: DATAKILDE.OBD, syntetisk: true,
      fremdriftsmarkoer: { type: MOBILEVENTTYPE.ANKOMMET, stopforekomstId: aktivtStop.id },
    });
  }
  return rute;
}

export const UI_RUTER = Object.freeze(RUTER.map(bygRute));

export const UI_IKKE_TILDELTE = Object.freeze([
  { id: "ui-opgave-uden-rute", navn: "Fiktiv akutopgave", adresse: "Prøveallé 999, 0000 Demoby", tidsvindue: "10.30–11.15", krav: "Basis · intet køretøjskrav" },
]);

export const UI_AFVIGELSESINDSTILLINGER = Object.freeze({
  model: "FAELLES",
  faelles: { id: "ui-faelles", advarselMin: 15, kritiskMin: 30 },
  prRutetype: {
    service: { id: "ui-service", advarselMin: 10, kritiskMin: 25 },
    hjemmepleje: { id: "ui-hjemmepleje", advarselMin: 12, kritiskMin: 25 },
    transport: { id: "ui-transport", advarselMin: 20, kritiskMin: 40 },
    renovation: { id: "ui-renovation", advarselMin: 15, kritiskMin: 35 },
  },
});

function forslagBasis(id, rute, stop, art, hard = false) {
  return {
    id, tenantRef: "tenant-fiktiv-ui-demo", ruteId: rute.id,
    udloesendeAfvigelse: { ruteId: rute.id, stopforekomstId: stop.id, afvigelseMin: rute.afvigelseMin },
    berørteStopIder: rute.stop.slice(rute.stop.indexOf(stop)).map((post) => post.id),
    foreslaaedeAendringer: [{ art, stopforekomstId: stop.id, maalRuteId: "ui-rute-reserve" }],
    aendredeAnkomsttider: [], ekstraKoeretidMin: art === "flytStop" ? 6 : 0, reduceretKoeretidMin: 0,
    berørteMedarbejderRefs: [medarbejderReference(rute.medarbejderId)],
    berørteKoeretoejRefs: rute.koeretoejId ? [koeretoejReference(rute.koeretoejId)] : [],
    regelbrud: hard ? [{ niveau: REGELNIVEAU.HARD, kode: "KOMPETENCE_MANGLER", tekst: "Målrutens medarbejder mangler den krævede specialistkompetence." }] : [],
    status: LOESNINGSFORSLAGSTATUS.FORESLAAET, redigerbar: true,
    kraeverDisponentGodkendelse: true, disponentGodkendelse: null, frigivet: false,
    forventetAendringMin: art === "flytStop" ? 16 : 12,
    titel: hard ? "Flyt stop til reserverute" : "Bevar ruten og forskyd tider",
    forklaring: hard ? "Aflaster den forsinkede rute, men bryder et kompetencekrav." : "Bevarer ressourcerne og opdaterer forventningen for de berørte stop.",
    datagrundlag: hard ? "Bekræftet mobilstatus + syntetisk kapacitetskontrol" : "Bekræftet mobilstatus + planlagte køretider",
    syntetisk: true,
  };
}

const kritiskRute = UI_RUTER.find((rute) => rute.id === "ui-rute-service");
const kritiskStop = kritiskRute.stop[kritiskRute.gennemfoert];
export const UI_LOESNINGSFORSLAG = Object.freeze([
  forslagBasis("ui-forslag-flyt", kritiskRute, kritiskStop, "flytStop", true),
  forslagBasis("ui-forslag-forskyd", kritiskRute, kritiskStop, "forskydTider", false),
]);

function navngivSkabelon(skabelon, navn, rutetype) {
  const kopi = klon(skabelon);
  kopi.navn = navn;
  kopi.rutetype = rutetype;
  kopi.stop = kopi.stop.map((stop, indeks) => ({ ...stop, uiNavn: `Fiktivt skabelonstop ${STOPNAVNE[indeks]}`, uiAdresse: `Skabelonvej ${201 + indeks}, 0000 Demoby` }));
  return kopi;
}

export const UI_RUTESKABELONER = Object.freeze([
  navngivSkabelon(DEMO_FAST_KOMMUNAL_SKABELON, "Fiktiv fast morgenrunde", "hjemmepleje"),
  navngivSkabelon(DEMO_FAST_SERVICE_SKABELON, "Fiktiv fast servicerute", "service"),
  navngivSkabelon(DEMO_FORETRUKKET_SKABELON, "Fiktiv foretrukken teknikrunde", "service"),
]);

export const UI_SKABELON_KOERETIDER = Object.freeze({
  "pb2-skabelon-feltservice": [10, 10, 15, 10],
  "pb2-skabelon-service": [10, 15, 10],
  "pb2-skabelon-teknik": [10, 10],
});

export const UI_RESSOURCESNAPSHOT = DEMO_PLANNING_BASIC_V2.ressourceSnapshot;

export function opretPlanningUiFixtures() {
  return {
    ruter: klon(UI_RUTER), medarbejdere: klon(UI_MEDARBEJDERE), koeretoejer: klon(UI_KOERETOEJER),
    ikkeTildelte: klon(UI_IKKE_TILDELTE), forslag: klon(UI_LOESNINGSFORSLAG),
    ruteskabeloner: klon(UI_RUTESKABELONER), skabelonKoeretider: klon(UI_SKABELON_KOERETIDER),
    afvigelsesindstillinger: klon(UI_AFVIGELSESINDSTILLINGER), ressourceSnapshot: klon(UI_RESSOURCESNAPSHOT),
  };
}
