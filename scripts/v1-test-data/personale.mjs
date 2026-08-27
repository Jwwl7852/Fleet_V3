/* scripts/v1-test-data/personale.mjs
 * V1-testselskabets stab — 9 medarbejdere + deres kompetencer, samme
 * nodeform som tenants/<t>/personale/<personId> og .../kompetencer/<id>
 * (se src/fleet/demo-personale.js).
 *
 * Chauffører, lager/terminal, en mekaniker, en disponent og to på kontoret
 * — dækker de funktioner ejerne bad om. INGEN division (beslutning 19),
 * intet følsomt (CPR/privatadresse hører i sensitive/personale, som denne
 * seed ikke rører).
 *
 * ⚠ vtChauffoer1 ER DEN DER KOBLES TIL chauffør-testbrugeren — samme
 * mønster som PERSON_FOR_ROLLE i dev-brugere.js, kun for chauffoer-rollen.
 */
import { STED } from "../../src/fleet/steder.js";

const NU = Date.now();
const D = 86400000;
const AAR = 365 * D;

export const V1T_PERSONALE = [
  { id: "vtChauffoer1", navn: "Anna Vognmand", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 01", email: "anna.vognmand@fleetcontrol-v1test.invalid",
    stationeret: STED.kolding, ansatMs: NU - 3 * AAR },
  { id: "vtChauffoer2", navn: "Bo Larsen", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 02", email: "bo.larsen@fleetcontrol-v1test.invalid",
    stationeret: STED.kolding, ansatMs: NU - 2 * AAR },
  { id: "vtChauffoer3", navn: "Cecilie Holm", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 03", email: "cecilie.holm@fleetcontrol-v1test.invalid",
    stationeret: STED.aalborg, ansatMs: NU - 1 * AAR },
  { id: "vtLager1", navn: "Ditte Werner", funktioner: { lager: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 04", email: "ditte.werner@fleetcontrol-v1test.invalid",
    stationeret: STED.kolding, ansatMs: NU - 4 * AAR },
  { id: "vtLager2", navn: "Emil Skov", funktioner: { lager: true, terminal: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 05", email: "emil.skov@fleetcontrol-v1test.invalid",
    stationeret: STED.kolding, ansatMs: NU - 2 * AAR },
  { id: "vtMekaniker1", navn: "Frederik Toft", funktioner: { mekaniker: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 06", email: "frederik.toft@fleetcontrol-v1test.invalid",
    stationeret: STED.kolding, ansatMs: NU - 5 * AAR },
  { id: "vtDisponent1", navn: "Gitte Ravn", funktioner: { disponent: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 07", email: "gitte.ravn@fleetcontrol-v1test.invalid",
    stationeret: STED.kolding, ansatMs: NU - 3 * AAR },
  /* Samme navn som "ansvarlig" på kunderne i kunder.mjs — én kilde til
     hvem der administrerer, ikke to. */
  { id: "vtAdmin1", navn: "Henrik Fabricius", funktioner: { administration: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 08", email: "henrik.fabricius@fleetcontrol-v1test.invalid",
    stationeret: STED.kolding, ansatMs: NU - 6 * AAR },
  { id: "vtKontor1", navn: "Ida Kjeldsen", funktioner: { administration: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "70 00 01 09", email: "ida.kjeldsen@fleetcontrol-v1test.invalid",
    stationeret: STED.kolding, ansatMs: NU - 2 * AAR },
];

/* ---- Kompetencer — tenants/<t>/kompetencer/<id> ----------------------- */
export const V1T_KOMPETENCER = [
  { id: "vtk-chauffoer1-c", personId: "vtChauffoer1", type: "c", udloeberMs: NU + 400 * D },
  { id: "vtk-chauffoer1-ce", personId: "vtChauffoer1", type: "ce", udloeberMs: NU + 400 * D },
  { id: "vtk-chauffoer1-tacho", personId: "vtChauffoer1", type: "tachografkort", udloeberMs: NU + 300 * D },
  { id: "vtk-chauffoer1-eubevis", personId: "vtChauffoer1", type: "eubevis", udloeberMs: NU + 100 * D },
  { id: "vtk-chauffoer2-c", personId: "vtChauffoer2", type: "c", udloeberMs: NU + 350 * D },
  { id: "vtk-chauffoer2-ce", personId: "vtChauffoer2", type: "ce", udloeberMs: NU + 350 * D },
  { id: "vtk-chauffoer2-tacho", personId: "vtChauffoer2", type: "tachografkort", udloeberMs: NU + 250 * D },
  { id: "vtk-chauffoer3-c", personId: "vtChauffoer3", type: "c", udloeberMs: NU + 450 * D },
  { id: "vtk-chauffoer3-ce", personId: "vtChauffoer3", type: "ce", udloeberMs: NU + 450 * D },
  { id: "vtk-chauffoer3-tacho", personId: "vtChauffoer3", type: "tachografkort", udloeberMs: NU + 280 * D },
  { id: "vtk-chauffoer3-adr", personId: "vtChauffoer3", type: "adr", udloeberMs: NU + 90 * D },
  { id: "vtk-lager1-truck", personId: "vtLager1", type: "truckcertifikat", udloeberMs: NU + 200 * D },
  { id: "vtk-lager2-truck", personId: "vtLager2", type: "truckcertifikat", udloeberMs: NU + 220 * D },
  { id: "vtk-lager2-foerste", personId: "vtLager2", type: "foerstehjaelp", udloeberMs: NU + 150 * D },
  { id: "vtk-mekaniker1-truck", personId: "vtMekaniker1", type: "truckcertifikat", udloeberMs: NU + 240 * D },
  { id: "vtk-mekaniker1-foerste", personId: "vtMekaniker1", type: "foerstehjaelp", udloeberMs: NU + 180 * D },
  /* Kontoret. Gitte disponerer men kører ikke — førstehjælp er ikke
     forbeholdt chauffører, samme pointe som Line Aggerholm i demo-sættet. */
  { id: "vtk-disponent1-foerste", personId: "vtDisponent1", type: "foerstehjaelp", udloeberMs: NU + 160 * D },
];
