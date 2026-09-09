/* src/fleet/demo-planning-basic.js
 * SYNTETISKE PLANNING-DATA — aldrig borger- eller kundedata.
 * Alt er fast, fiktivt og uden implicit systemtid. Koordinater er syntetiske,
 * ikke geokodede eller vejberegnede.
 */
import {
  ADRESSESTATUS, AFHAENGIGHEDSART, DAGSPLANSTATUS, FELTKLASSIFIKATION,
  FOREKOMSTSTATUS, GENTAGELSESART, KILDE, OPGAVESTATUS, REFERENCEART,
  REGELNIVEAU, RUTESTATUS, TIDSFORM, planningReference,
} from "./planning-basic.js";
import { fraFleetKoeretoejer } from "./planning-adapters/fleet.js";
import { fraWorkforceMedarbejdere } from "./planning-adapters/workforce.js";
import { opretStatiskPlanningProvider, samlProviderSnapshots } from "./planning-adapters/providers.js";
import { selvkontrol } from "./selvkontrol.js";

export const DEMO_PLANLAGT_DATO = "2032-05-18";
export const DEMO_TIDSZONE = "Europe/Copenhagen";
export const DEMO_BEREGNING_MS = Date.UTC(2032, 4, 17, 12, 0, 0);
const DAG_START_MS = Date.UTC(2032, 4, 18, 0, 0, 0);
const tid = (time, minut = 0) => DAG_START_MS + (time * 60 + minut) * 60000;
const ref = (kilde, art, id) => ({ kilde, art, id });
const pRef = (art, id) => planningReference(art, id);
const idFor = (praefiks, nr) => `${praefiks}-${String(nr).padStart(3, "0")}`;

const klassificeret = (noegle, vaerdi, klassifikation = FELTKLASSIFIKATION.FORTROLIG) => ({
  noegle, vaerdi, klassifikation, synlighed: { roller: ["planlaegger"] },
});

const kontakt = () => [
  klassificeret("telefon", "0000 0000", FELTKLASSIFIKATION.FORTROLIG),
  klassificeret("email", "kontakt@eksempel.invalid", FELTKLASSIFIKATION.FORTROLIG),
];

export const DEMO_PLANNING_KUNDER = Array.from({ length: 10 }, (_, i) => {
  const nr = i + 1;
  const id = idFor("pb-kunde", nr);
  return {
    reference: pRef(REFERENCEART.KUNDE, id),
    ejerKilde: KILDE.PLANNING,
    navn: `Fiktiv Kunde ${String.fromCharCode(64 + nr)}`,
    kundenummer: `TEST-${String(nr).padStart(4, "0")}`,
    kontaktoplysninger: kontakt(),
    ekstrafelter: [klassificeret("demoKategori", "udelukkende syntetisk")],
  };
});

const LOKATIONER = [
  ["Fiktivvej 101", "0001", "Testby Nord", "nord", 56.010, 8.010],
  ["Prøveallé 202", "0002", "Testby Nord", "nord", 56.018, 8.024],
  ["Demovej 303", "0003", "Testby Nord", "nord", 56.026, 8.036],
  ["Teststræde 404", "0004", "Testby Midt", "midt", 55.990, 8.045],
  ["Eksempelvej 505", "0005", "Testby Midt", "midt", 55.982, 8.058],
  ["Prøvepladsen 606", "0006", "Testby Midt", "midt", 55.974, 8.070],
  ["Demogade 707", "0007", "Testby Syd", "syd", 55.955, 8.035],
  ["Testvej 808", "0008", "Testby Syd", "syd", 55.946, 8.048],
  ["Fiktivgade 909", "0009", "Testby Syd", "syd", 55.938, 8.061],
  ["Kontrolvej ?", "0010", "Testby Ukendt", "kontrol", 55.965, 8.015],
];

export const DEMO_PLANNING_LOKATIONER = LOKATIONER.map((x, i) => {
  const nr = i + 1;
  const id = idFor("pb-lok", nr);
  return {
    reference: pRef(REFERENCEART.LOKATION, id),
    ejerKilde: KILDE.PLANNING,
    navn: `Fiktiv lokation ${nr}`,
    kundeRef: pRef(REFERENCEART.KUNDE, idFor("pb-kunde", nr)),
    adresse: { adresselinje: x[0], postnr: x[1], by: x[2] },
    valideringsstatus: nr === 10 ? ADRESSESTATUS.KRAEVER_KONTROL : ADRESSESTATUS.VALIDERET,
    position: { breddegrad: x[4], laengdegrad: x[5], oprindelse: "syntetisk" },
    omraade: x[3],
    kontaktoplysninger: kontakt(),
    adgangsnoter: [klassificeret("adgang", "Syntetisk adgangsnote — ingen virkelig adresse.", FELTKLASSIFIKATION.FOELSOM)],
    ekstrafelter: nr === 10 ? [klassificeret("adresseKontrol", "Med vilje tvetydig demo-adresse.")] : [],
  };
});

export const DEMO_PLANNING_DEPOTER = [
  ["pb-depot-nord", "Fiktivt depot Nord", "Depotprøvevej 1", 56.035, 8.020],
  ["pb-depot-midt", "Fiktivt depot Midt", "Depotprøvevej 2", 55.985, 8.050],
  ["pb-depot-syd", "Fiktivt depot Syd", "Depotprøvevej 3", 55.940, 8.055],
].map(([id, navn, adresselinje, breddegrad, laengdegrad]) => ({
  reference: pRef(REFERENCEART.LOKATION, id), ejerKilde: KILDE.PLANNING,
  navn, lokationstype: "depot",
  adresse: { adresselinje, postnr: "0099", by: "Testby" },
  valideringsstatus: ADRESSESTATUS.VALIDERET,
  position: { breddegrad, laengdegrad, oprindelse: "syntetisk" },
  kontaktoplysninger: kontakt(), adgangsnoter: [], ekstrafelter: [],
}));

const vagt = (id, medarbejderId, fra = 5, til = 16) => ({ id, personId: medarbejderId, fraMs: tid(fra), tilMs: tid(til) });

export const DEMO_WORKFORCE_KILDE = Object.freeze({
  personale: [
    { id: "wf-demo-001", navn: "Fiktiv Medarbejder Alfa", status: "aktiv", funktioner: { planlaegningsressource: true }, stationeret: "Testby Nord", telefon: "0000 0000", email: "alfa@eksempel.invalid" },
    { id: "wf-demo-002", navn: "Fiktiv Medarbejder Beta", status: "aktiv", funktioner: { planlaegningsressource: true }, stationeret: "Testby Midt", telefon: "0000 0000", email: "beta@eksempel.invalid" },
    { id: "wf-demo-003", navn: "Fiktiv Medarbejder Gamma", status: "aktiv", funktioner: { planlaegningsressource: true }, stationeret: "Testby Syd", telefon: "0000 0000", email: "gamma@eksempel.invalid" },
    { id: "wf-demo-004", navn: "Fiktiv Medarbejder Delta", status: "aktiv", funktioner: { planlaegningsressource: true }, stationeret: "Testby Midt", telefon: "0000 0000", email: "delta@eksempel.invalid" },
  ],
  kompetencer: [
    { id: "wf-k-001-basis", personId: "wf-demo-001", type: "basis" },
    { id: "wf-k-001-med", personId: "wf-demo-001", type: "medicin", udloeberMs: tid(24) },
    { id: "wf-k-002-basis", personId: "wf-demo-002", type: "basis" },
    { id: "wf-k-002-loeft", personId: "wf-demo-002", type: "loeft" },
    { id: "wf-k-003-basis", personId: "wf-demo-003", type: "basis" },
    { id: "wf-k-004-basis", personId: "wf-demo-004", type: "basis" },
    { id: "wf-k-004-med", personId: "wf-demo-004", type: "medicin", udloeberMs: DEMO_BEREGNING_MS - 1 },
  ],
  vagter: [vagt("wf-v-001", "wf-demo-001"), vagt("wf-v-002", "wf-demo-002"), vagt("wf-v-003", "wf-demo-003"), vagt("wf-v-004", "wf-demo-004")],
  fravaer: [{ id: "wf-f-001", personId: "wf-demo-003", fra: tid(9), til: tid(13), art: "må aldrig adapteres", note: "må aldrig adapteres" }],
});

export const DEMO_FLEET_KILDE_KOERETOEJER = Object.freeze([
  { id: "fleet-demo-001", kaldenavn: "Fiktiv varevogn 1", navn: "Demo Varevogn", art: "varevogn", status: "aktiv", hjemsted: "Testby Nord", kapacitet: { kg: 900, m3: 6 } },
  { id: "fleet-demo-002", kaldenavn: "Fiktiv minibus 2", navn: "Demo Minibus", art: "minibus", status: "aktiv", hjemsted: "Testby Midt", saeder: 8 },
  { id: "fleet-demo-003", kaldenavn: "Fiktiv scooter 3", navn: "Demo Scooter", art: "scooter", status: "aktiv", hjemsted: "Testby Syd", kapacitet: { kg: 15 } },
  { id: "fleet-demo-004", kaldenavn: "Fiktiv lastbil 4", navn: "Demo Lastbil", art: "lastbil", status: "aktiv", hjemsted: "Testby Midt", kapacitet: { kg: 4000, m3: 22 } },
]);

const lokalMedarbejder = (id, navn, kompetencer) => ({
  reference: pRef(REFERENCEART.MEDARBEJDER, id), ejerKilde: KILDE.PLANNING,
  visningsnavn: navn, status: "aktiv", kompetencer,
  certifikater: [], tilgaengelighed: { vagter: [{ id: `${id}-vagt`, fraMs: tid(5), tilMs: tid(16) }], fravaer: [] },
});
const lokaltKoeretoej = (id, navn, type, kapacitet) => ({
  reference: pRef(REFERENCEART.KOERETOEJ, id), ejerKilde: KILDE.PLANNING,
  visningsnavn: navn, status: "aktiv", koeretoej: { type, kapacitet },
});

export const DEMO_PLANNING_EGNE_RESSOURCER = [
  lokalMedarbejder("pb-med-005", "Fiktiv Planressource Epsilon", ["basis", "loeft"]),
  lokalMedarbejder("pb-med-006", "Fiktiv Planressource Zeta", ["basis", "teknik"]),
  lokalMedarbejder("pb-med-007", "Fiktiv Planressource Eta", ["basis"]),
  lokaltKoeretoej("pb-bil-005", "Fiktiv personbil 5", "personbil", { personer: 4, kg: 120 }),
  lokaltKoeretoej("pb-bil-006", "Fiktiv ladcykel 6", "ladcykel", { kg: 40 }),
  lokaltKoeretoej("pb-bil-007", "Fiktiv servicevogn 7", "servicevogn", { kg: 500, m3: 3 }),
  { reference: pRef(REFERENCEART.UDSTYR, "pb-udstyr-001"), ejerKilde: KILDE.PLANNING, visningsnavn: "Fiktiv udstyrskasse A", status: "aktiv" },
  { reference: pRef(REFERENCEART.UDSTYR, "pb-udstyr-002"), ejerKilde: KILDE.PLANNING, visningsnavn: "Fiktiv udstyrskasse B", status: "aktiv" },
];

const wfRef = (id) => ref(KILDE.WORKFORCE, REFERENCEART.MEDARBEJDER, id);
export const DEMO_PLANNING_TEAMS = [
  { reference: pRef(REFERENCEART.TEAM, "pb-team-nord"), ejerKilde: KILDE.PLANNING, visningsnavn: "Fiktivt team Nord", kandidatgruppe: true, medlemRefs: [wfRef("wf-demo-001"), pRef(REFERENCEART.MEDARBEJDER, "pb-med-005")] },
  { reference: pRef(REFERENCEART.TEAM, "pb-team-midt"), ejerKilde: KILDE.PLANNING, visningsnavn: "Fiktivt team Midt", kandidatgruppe: true, medlemRefs: [wfRef("wf-demo-002"), wfRef("wf-demo-004"), pRef(REFERENCEART.MEDARBEJDER, "pb-med-006")] },
  { reference: pRef(REFERENCEART.TEAM, "pb-team-syd"), ejerKilde: KILDE.PLANNING, visningsnavn: "Fiktivt team Syd", kandidatgruppe: true, medlemRefs: [wfRef("wf-demo-003"), pRef(REFERENCEART.MEDARBEJDER, "pb-med-007")] },
];

const fri = () => ({ art: TIDSFORM.FRI });
const fast = (time, minut = 0) => ({ art: TIDSFORM.FAST, startMs: tid(time, minut) });
const vindue = (fra, til) => ({ art: TIDSFORM.VINDUE, fraMs: tid(fra), tilMs: tid(til) });
const deadline = (time) => ({ art: TIDSFORM.DEADLINE, deadlineMs: tid(time) });
const opgaveRef = (nr) => pRef(REFERENCEART.OPGAVE, idFor("pb-opg", nr));

function opgave(nr, ekstra = {}) {
  const id = idFor("pb-opg", nr);
  return {
    id, reference: pRef(REFERENCEART.OPGAVE, id), titel: `Generisk syntetisk opgave ${nr}`,
    kundeRef: pRef(REFERENCEART.KUNDE, idFor("pb-kunde", ((nr - 1) % 10) + 1)),
    lokationRef: pRef(REFERENCEART.LOKATION, idFor("pb-lok", ((nr - 1) % 10) + 1)),
    varighedMin: 30, prioritet: "normal", tidskrav: fri(), status: OPGAVESTATUS.AKTIV,
    krav: { kompetencer: ["basis"], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } },
    afhaengigheder: [], gentagelse: null, kontinuitet: null,
    praktiskeNoter: [klassificeret("praktisk", "Fiktiv praktisk note.")], ekstrafelter: [],
    ...ekstra,
  };
}

export const DEMO_PLANNING_OPGAVER = Array.from({ length: 26 }, (_, i) => opgave(i + 1));
Object.assign(DEMO_PLANNING_OPGAVER[0], { tidskrav: fast(6) });
Object.assign(DEMO_PLANNING_OPGAVER[1], { tidskrav: vindue(6, 10), krav: { kompetencer: ["basis"], certifikater: ["medicin"], udstyrRefs: [], koeretoej: { paakraevet: true, typer: ["varevogn"], kapacitet: { kg: 300 } } } });
Object.assign(DEMO_PLANNING_OPGAVER[2], { tidskrav: deadline(10), krav: { kompetencer: ["basis"], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: true, typer: ["varevogn"], kapacitet: { m3: 2 } } } });
Object.assign(DEMO_PLANNING_OPGAVER[3], { krav: { kompetencer: ["basis"], certifikater: [], udstyrRefs: [pRef(REFERENCEART.UDSTYR, "pb-udstyr-001")], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } } });
Object.assign(DEMO_PLANNING_OPGAVER[4], { kontinuitet: { noegle: "demo-kontinuitet-1", niveau: REGELNIVEAU.HARD } });
Object.assign(DEMO_PLANNING_OPGAVER[5], { kontinuitet: { noegle: "demo-kontinuitet-1", niveau: REGELNIVEAU.HARD } });
Object.assign(DEMO_PLANNING_OPGAVER[8], { krav: { kompetencer: ["basis"], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: true, typer: ["personbil"], kapacitet: {} } } });
Object.assign(DEMO_PLANNING_OPGAVER[9], { krav: { kompetencer: ["basis"], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: true, typer: ["personbil"], kapacitet: { personer: 2 } } } });
Object.assign(DEMO_PLANNING_OPGAVER[11], { afhaengigheder: [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: opgaveRef(11), niveau: REGELNIVEAU.HARD }] });
Object.assign(DEMO_PLANNING_OPGAVER[12], { afhaengigheder: [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: opgaveRef(12), niveau: REGELNIVEAU.HARD }] });
Object.assign(DEMO_PLANNING_OPGAVER[13], { gentagelse: { art: GENTAGELSESART.DAGLIG, interval: 1 } });
Object.assign(DEMO_PLANNING_OPGAVER[14], { gentagelse: { art: GENTAGELSESART.UGEDAGE, ugedage: [1, 3, 5] } });
Object.assign(DEMO_PLANNING_OPGAVER[16], { afhaengigheder: [{ art: AFHAENGIGHEDSART.AFHENTNING_FOER_LEVERING, opgaveRef: opgaveRef(16), niveau: REGELNIVEAU.HARD }] });
Object.assign(DEMO_PLANNING_OPGAVER[17], { afhaengigheder: [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: opgaveRef(17), niveau: REGELNIVEAU.HARD }] });
Object.assign(DEMO_PLANNING_OPGAVER[18], { gentagelse: { art: GENTAGELSESART.HVER_N_UGE, interval: 2, ugedage: [2, 4] } });
Object.assign(DEMO_PLANNING_OPGAVER[19], { prioritet: "akut", varighedMin: 20 });
Object.assign(DEMO_PLANNING_OPGAVER[20], { gentagelse: { art: GENTAGELSESART.HVER_N_MAANED, interval: 1, maanedsdag: 18 } });
Object.assign(DEMO_PLANNING_OPGAVER[21], { gentagelse: { art: GENTAGELSESART.KOPI, kildeDagsplanId: "pb-dagsplan-tidligere" } });
Object.assign(DEMO_PLANNING_OPGAVER[22], { kontinuitet: { noegle: "demo-praef-1", niveau: REGELNIVEAU.PREFERENCE } });
Object.assign(DEMO_PLANNING_OPGAVER[23], { kontinuitet: { noegle: "demo-praef-1", niveau: REGELNIVEAU.PREFERENCE } });
Object.assign(DEMO_PLANNING_OPGAVER[25], { krav: { kompetencer: ["umulig-demo-kompetence"], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } } });

export const DEMO_PLANNING_FOREKOMSTER = DEMO_PLANNING_OPGAVER.map((o, i) => ({
  id: idFor("pb-forekomst", i + 1), opgaveRef: o.reference, dato: DEMO_PLANLAGT_DATO,
  status: i < 12 ? FOREKOMSTSTATUS.PLANLAGT : FOREKOMSTSTATUS.IKKE_PLANLAGT,
}));

const stop = (nr, start, slut) => ({
  id: idFor("pb-stop", nr), raekkefoelge: ((nr - 1) % 4) + 1,
  opgaveforekomstId: idFor("pb-forekomst", nr), opgaveRef: opgaveRef(nr),
  lokationRef: pRef(REFERENCEART.LOKATION, idFor("pb-lok", ((nr - 1) % 10) + 1)),
  fraMs: tid(start), tilMs: tid(slut),
});
const brug = (id, ressourceRef, fra, til) => ({ id, ressourceRef, fraMs: tid(fra), tilMs: tid(til) });
const fleetRef = (id) => ref(KILDE.FLEET, REFERENCEART.KOERETOEJ, id);

const rute1 = {
  id: "pb-rute-001", reference: pRef(REFERENCEART.RUTE, "pb-rute-001"), dagsplanId: "pb-dagsplan-001",
  status: RUTESTATUS.FRIGIVET, fraMs: tid(5, 45), tilMs: tid(10),
  kandidatTeamRef: pRef(REFERENCEART.TEAM, "pb-team-nord"), medarbejderRefs: [wfRef("wf-demo-001")],
  koeretoejRefs: [fleetRef("fleet-demo-001")], udstyrRefs: [pRef(REFERENCEART.UDSTYR, "pb-udstyr-001")],
  startLokationRef: pRef(REFERENCEART.LOKATION, "pb-depot-nord"), slutLokationRef: pRef(REFERENCEART.LOKATION, "pb-depot-nord"),
  stop: [stop(1, 6, 6.5), stop(2, 7, 7.5), stop(3, 8, 8.5), stop(4, 9, 9.5)],
  ressourcebrug: [
    brug("r1-med", wfRef("wf-demo-001"), 5.75, 10), brug("r1-bil", fleetRef("fleet-demo-001"), 5.75, 10),
    brug("r1-udstyr", pRef(REFERENCEART.UDSTYR, "pb-udstyr-001"), 8.75, 9.75),
  ],
};
const rute2 = {
  id: "pb-rute-002", reference: pRef(REFERENCEART.RUTE, "pb-rute-002"), dagsplanId: "pb-dagsplan-001",
  status: RUTESTATUS.KLADDE, fraMs: tid(8), tilMs: tid(12),
  kandidatTeamRef: pRef(REFERENCEART.TEAM, "pb-team-midt"), medarbejderRefs: [], koeretoejRefs: [], udstyrRefs: [],
  startLokationRef: pRef(REFERENCEART.LOKATION, "pb-depot-midt"), slutLokationRef: pRef(REFERENCEART.LOKATION, "pb-depot-midt"),
  stop: [], ressourcebrug: [],
};
const rute3 = {
  id: "pb-rute-003", reference: pRef(REFERENCEART.RUTE, "pb-rute-003"), dagsplanId: "pb-dagsplan-001",
  status: RUTESTATUS.FRIGIVET, fraMs: tid(10), tilMs: tid(12.5),
  kandidatTeamRef: pRef(REFERENCEART.TEAM, "pb-team-syd"), medarbejderRefs: [pRef(REFERENCEART.MEDARBEJDER, "pb-med-005")],
  koeretoejRefs: [], udstyrRefs: [], startLokationRef: pRef(REFERENCEART.LOKATION, "pb-depot-syd"), slutLokationRef: pRef(REFERENCEART.LOKATION, "pb-depot-syd"),
  stop: [stop(5, 10.25, 10.75), stop(6, 11, 11.5), stop(7, 11.5, 12), stop(8, 12, 12.5)],
  ressourcebrug: [brug("r3-med", pRef(REFERENCEART.MEDARBEJDER, "pb-med-005"), 10, 12.5)],
};
const rute4 = {
  id: "pb-rute-004", reference: pRef(REFERENCEART.RUTE, "pb-rute-004"), dagsplanId: "pb-dagsplan-001",
  status: RUTESTATUS.FRIGIVET, fraMs: tid(12), tilMs: tid(15),
  kandidatTeamRef: pRef(REFERENCEART.TEAM, "pb-team-midt"), medarbejderRefs: [wfRef("wf-demo-002")],
  koeretoejRefs: [pRef(REFERENCEART.KOERETOEJ, "pb-bil-005")], udstyrRefs: [],
  startLokationRef: pRef(REFERENCEART.LOKATION, "pb-depot-midt"), slutLokationRef: pRef(REFERENCEART.LOKATION, "pb-depot-midt"),
  stop: [stop(9, 12.25, 12.75), stop(10, 13, 13.5), stop(11, 13.5, 14), stop(12, 14.25, 14.75)],
  ressourcebrug: [brug("r4-med", wfRef("wf-demo-002"), 12, 15), brug("r4-bil", pRef(REFERENCEART.KOERETOEJ, "pb-bil-005"), 12, 15)],
};

export const DEMO_DAGSPLAN = {
  id: "pb-dagsplan-001", dato: DEMO_PLANLAGT_DATO, tidszone: DEMO_TIDSZONE,
  version: 1, status: DAGSPLANSTATUS.KLAR, beregnetMs: DEMO_BEREGNING_MS,
  depotRef: pRef(REFERENCEART.LOKATION, "pb-depot-midt"), omraade: "syntetisk testområde",
  ruter: [rute1, rute2, rute3, rute4],
  ikkeTildelteForekomstIder: DEMO_PLANNING_FOREKOMSTER.slice(12).map((f) => f.id),
};

const workforceRessourcer = fraWorkforceMedarbejdere(DEMO_WORKFORCE_KILDE.personale, {
  kompetencer: DEMO_WORKFORCE_KILDE.kompetencer,
  fravaer: DEMO_WORKFORCE_KILDE.fravaer,
  vagter: DEMO_WORKFORCE_KILDE.vagter,
});
const fleetRessourcer = fraFleetKoeretoejer(DEMO_FLEET_KILDE_KOERETOEJER);

const providersvar = samlProviderSnapshots([
  opretStatiskPlanningProvider({
    id: "demo-planning", kilde: KILDE.PLANNING,
    snapshot: {
      opgaver: DEMO_PLANNING_OPGAVER, opgaveforekomster: DEMO_PLANNING_FOREKOMSTER,
      ressourcer: [...DEMO_PLANNING_EGNE_RESSOURCER, ...DEMO_PLANNING_TEAMS],
      kunder: DEMO_PLANNING_KUNDER,
      lokationer: [...DEMO_PLANNING_LOKATIONER, ...DEMO_PLANNING_DEPOTER],
      dagsplaner: [DEMO_DAGSPLAN],
    },
  }),
  opretStatiskPlanningProvider({ id: "demo-fleet", kilde: KILDE.FLEET, snapshot: { ressourcer: fleetRessourcer } }),
  opretStatiskPlanningProvider({ id: "demo-workforce", kilde: KILDE.WORKFORCE, snapshot: { ressourcer: workforceRessourcer } }),
]);

if (!providersvar.ok) throw new Error(`Det syntetiske providersnapshot er ugyldigt: ${providersvar.fund.map((f) => f.tekst).join(" ")}`);

function dybfrys(v) {
  if (!v || typeof v !== "object" || Object.isFrozen(v)) return v;
  Object.freeze(v);
  for (const x of Object.values(v)) dybfrys(x);
  return v;
}

export const DEMO_PLANNING_BASIC = dybfrys({
  ...providersvar.snapshot,
  metadata: {
    syntetisk: true, brancheuafhaengig: true, geokodet: false,
    vejberegnet: false, beregningMs: DEMO_BEREGNING_MS,
  },
  kildedata: {
    workforce: DEMO_WORKFORCE_KILDE,
    fleet: DEMO_FLEET_KILDE_KOERETOEJER,
  },
});

export function opretDemoPlanningBasic() {
  return JSON.parse(JSON.stringify(DEMO_PLANNING_BASIC));
}

selvkontrol("demo-planning-basic", () => {
  const opgaveIder = new Set(DEMO_PLANNING_OPGAVER.map((opgave) => opgave.reference.id));
  const foraeldreloese = DEMO_PLANNING_FOREKOMSTER
    .filter((forekomst) => !opgaveIder.has(forekomst.opgaveRef?.id));
  if (foraeldreloese.length) {
    console.warn(
      `demo-planning-basic: ${foraeldreloese.length} forekomster peger på ukendte opgaver `
      + `(${foraeldreloese.map((forekomst) => forekomst.id).join(", ")}).`,
    );
  }
});
