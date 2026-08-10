/* src/fleet/demo-facility.js
 * ÉT demo-facility. Alle tre skærme læser herfra.
 *
 * Det er filens hele formål. I mockupsene viste Overblik og Klima FORSKELLIGE
 * temperaturer for de samme zoner — kun Depot 2 stemte. Med ét datasæt kan de
 * ikke være uenige, for der er kun ét sted at hente tallet.
 *
 * FORMEN ER NODENS: lokationer, aktiver, zoner og sensorer ser ud som
 * facility/… i ARKITEKTUR.
 *
 * ⚠ GRÆNSERNE LIGGER PÅ ZONEN, MÅLINGERNE PÅ SENSOREN. En ændret alarmtærskel
 * må ikke skrive i måledata — se facility.js.
 *
 * ⚠ INTET GENNEMSNIT ER GEMT HER. Mockuppens 15,2 °C stod over en tabel hvis
 * sensorer gav 16,9. Tallet beregnes af skærmen på den samme liste den viser.
 *
 * ⚠ BYGNINGSOMKOSTNINGEN ER IKKE GEMT SOM ÉT TAL. Komponenterne står herunder;
 * el/varme og totalen beregnes. Mockuppens "El/varme 58.420 kr" var hele
 * bygningen — el og varme alene er 43.030 kr.
 *
 * FACILITY ER FÆLLES. Aktiverne er de samme uanset division, og kpi.facility
 * er derfor identisk under gods og bus.
 */
import { DEMO_KPI } from "./demo-kpi.js";
import { STED, erSted } from "./steder.js";
import {
  AKTIV_ART, AKTIV_STATUS, ZONE_ART, LOKATION_TYPE, FEJL_STATUS,
  alarmTilstand, gennemsnitTemperatur, elVarmeOere, bygningsomkostningOere,
  OMKOSTNINGSPOST,
} from "./facility.js";
import { opgaveMangler } from "./opgaver.js";

const DAG = 86400000;
const T = 3600000;
const MIN = 60000;

const iDag = new Date();
iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();
const dag = (n, time = 0) => D0 + n * DAG + time * T;

/* ---- Lokationer -------------------------------------------------------- */

/**
 * `sted` binder lokationen til STED-kataloget i steder.js — samme fire steder
 * som personalet er stationeret på og køretøjerne har hjemme.
 *
 * ⚠ ALLE FIRE STEDER HAR EN FACILITET, og det er ikke pynt. Køretøjerne fik
 * `hjemsted` i Vejle og Odense; havde facility kun kendt Kolding og Aalborg,
 * ville halvdelen af flåden stå på et sted der ikke fandtes i bygningsdata.
 * Mockuppen skrev Greve, Taastrup og København — de findes stadig ikke.
 *
 * `arealM2` er kvadratmeter som integer. Ingen decimaler: et areal måles i
 * hele meter i BBR, og et komma her ville antyde en præcision vi ikke har.
 */
export const DEMO_LOKATIONER = [
  { id: "lok-kolding", navn: "Hovedkontor Kolding", type: "hovedkontor", sted: STED.kolding,
    arealM2: 2100,  adresse: "Vejlevej 112, 6000 Kolding" },
  { id: "lok-halb",    navn: "Hal B, Kolding",      type: "lager",       sted: STED.kolding,
    arealM2: 12450, adresse: "Vejlevej 112, 6000 Kolding" },
  { id: "lok-aalborg", navn: "Depot 2, Aalborg",    type: "depot",       sted: STED.aalborg,
    arealM2: 8200,  adresse: "Havnegade 44, 9000 Aalborg" },
  { id: "lok-vejle",   navn: "Værksted Vejle",      type: "vaerksted",   sted: STED.vejle,
    arealM2: 1350,  adresse: "Boulevarden 9, 7100 Vejle" },
  { id: "lok-odense",  navn: "Kølehus Odense",      type: "lager",       sted: STED.odense,
    arealM2: 1200,  adresse: "Havnegade 21, 5000 Odense" },
];

/* ---- Aktiver ----------------------------------------------------------- */

export const DEMO_AKTIVER = [
  { id: "fa-port1", navn: "Port 1", art: "port", lokationId: "lok-kolding", status: "idrift",
    serviceIntervalDage: 180, naesteServiceMs: dag(24),
    ansvarligPersonId: "benjaminHolm" },
  /* Dashboard har "Porte – Port 3" med "Port lukker langsomt". Samme anlæg. */
  { id: "fa-port3", navn: "Port 3", art: "port", lokationId: "lok-halb", status: "fejl",
    serviceIntervalDage: 180, naesteServiceMs: dag(3),
    ansvarligPersonId: "benjaminHolm" },
  { id: "fa-port5", navn: "Port 5", art: "port", lokationId: "lok-aalborg", status: "idrift",
    serviceIntervalDage: 180, naesteServiceMs: dag(61),
    ansvarligPersonId: "nadiaKrarup" },
  { id: "fa-koel1", navn: "Køleanlæg 1", art: "koeleanlaeg", lokationId: "lok-halb", status: "idrift",
    zoneId: "zo-koel1", serviceIntervalDage: 90, naesteServiceMs: dag(11),
    ansvarligPersonId: "metteSoerensen" },
  { id: "fa-frost1", navn: "Fryseanlæg", art: "koeleanlaeg", lokationId: "lok-halb", status: "service",
    zoneId: "zo-frost", serviceIntervalDage: 90, naesteServiceMs: dag(1),
    ansvarligPersonId: "metteSoerensen" },
  { id: "fa-koel2", navn: "Køleanlæg 2", art: "koeleanlaeg", lokationId: "lok-aalborg", status: "idrift",
    zoneId: "zo-depot2", serviceIntervalDage: 90, naesteServiceMs: dag(38),
    ansvarligPersonId: "nadiaKrarup" },
  { id: "fa-vent1", navn: "Ventilation, kontor", art: "ventilation", lokationId: "lok-kolding", status: "idrift",
    zoneId: "zo-kontor", serviceIntervalDage: 365, naesteServiceMs: dag(92),
    ansvarligPersonId: "emilBrandt" },
  { id: "fa-vask",  navn: "Vaskehal", art: "vaskehal", lokationId: "lok-kolding", status: "udeAfDrift",
    serviceIntervalDage: 120, naesteServiceMs: dag(-6),
    ansvarligPersonId: "ibSoerensen" },
  { id: "fa-lade1", navn: "Ladestander 1", art: "ladestander", lokationId: "lok-kolding", status: "idrift",
    serviceIntervalDage: 365, naesteServiceMs: dag(140),
    ansvarligPersonId: "emilBrandt" },
  { id: "fa-lade2", navn: "Ladestander 2", art: "ladestander", lokationId: "lok-kolding", status: "fejl",
    serviceIntervalDage: 365, naesteServiceMs: dag(140),
    ansvarligPersonId: "emilBrandt" },
  { id: "fa-alarm", navn: "Alarmanlæg", art: "alarm", lokationId: "lok-kolding", status: "idrift",
    serviceIntervalDage: 365, naesteServiceMs: dag(210),
    ansvarligPersonId: "benjaminHolm" },
  /* --- Vejle og Odense. Uden aktiver ville de to lokationer vaere tomme
         raekker, og Driftsforhold-kortet kunne ikke sige noget om dem. --- */
  { id: "fa-port7", navn: "Port 7", art: "port", lokationId: "lok-vejle", status: "idrift",
    serviceIntervalDage: 180, naesteServiceMs: dag(47),
    ansvarligPersonId: "janHolmgaard" },
  { id: "fa-lade3", navn: "Ladestander 3", art: "ladestander", lokationId: "lok-vejle", status: "idrift",
    serviceIntervalDage: 365, naesteServiceMs: dag(118),
    ansvarligPersonId: "janHolmgaard" },
  { id: "fa-koel3", navn: "Køleanlæg 3", art: "koeleanlaeg", lokationId: "lok-odense", status: "idrift",
    zoneId: "zo-koelodense", serviceIntervalDage: 90, naesteServiceMs: dag(19),
    ansvarligPersonId: "peterIversen" },
  { id: "fa-vent2", navn: "Ventilation, kølehus", art: "ventilation", lokationId: "lok-odense", status: "idrift",
    zoneId: "zo-koelodense", serviceIntervalDage: 365, naesteServiceMs: dag(74),
    ansvarligPersonId: "peterIversen" },
];

/* ---- Zoner: GRÆNSERNE -------------------------------------------------- */

export const DEMO_ZONER = [
  { id: "zo-frost",  navn: "Frost, Hal B",   art: "frost",      lokationId: "lok-halb",    graenser: { minC: -22, maksC: -18 } },
  { id: "zo-koel1",  navn: "Køl 1, Hal B",   art: "koel",       lokationId: "lok-halb",    graenser: { minC: 2,   maksC: 6   } },
  { id: "zo-halb",   navn: "Hal B",          art: "tempereret", lokationId: "lok-halb",    graenser: { minC: 5,   maksC: 25  } },
  { id: "zo-depot2", navn: "Depot 2",        art: "tempereret", lokationId: "lok-aalborg", graenser: { minC: 5,   maksC: 25  } },
  { id: "zo-kontor", navn: "Kontor Kolding", art: "tempereret", lokationId: "lok-kolding", graenser: { minC: 5,   maksC: 25  } },
  /* ⚠ ART koel, IKKE tempereret. De tre tempererede zoner giver praecis
     16,9 gr. i gennemsnit, og det tal er mockup-fejlen rekonstrueret og
     pinnet i en proeve. En fjerde tempereret zone ville flytte det. */
  { id: "zo-koelodense", navn: "Kølerum, Odense", art: "koel", lokationId: "lok-odense", graenser: { minC: 2, maksC: 6 } },
];

/* ---- Sensorer: MÅLINGERNE ---------------------------------------------- */

/**
 * ⚠ DE TRE TEMPEREREDE ZONER GIVER PRÆCIS 16,9 °C I GENNEMSNIT.
 *
 *   Hal B 18,4 · Depot 2 17,1 · Kontor 15,2   →   50,7 / 3 = 16,9
 *
 * Det er mockuppens fejl rekonstrueret: 15,2 var ÉN zones værdi, som blev
 * skrevet som gennemsnittet af dem alle. Regner skærmen selv, kan de to ikke
 * være uenige — og der er en test der fastholder de 16,9.
 *
 * Frost og køl står med vilje udenfor: et gennemsnit på tværs af en fryser på
 * −19,8 °C og et kontor på 15,2 °C giver 3 °C, og det tal beskriver ingenting.
 * Se gennemsnitPrZoneArt().
 */
export const DEMO_SENSORER = {
  "zo-frost":  { aktuel: { tempC: -19.8, fugtPct: 82, ms: Date.now() - 4 * MIN } },
  /* Over 6 °C — en alarm der er AFLEDT af zonens grænse, ikke et gemt flag. */
  "zo-koel1":  { aktuel: { tempC: 7.4,   fugtPct: 74, ms: Date.now() - 3 * MIN } },
  "zo-halb":   { aktuel: { tempC: 18.4,  fugtPct: 51, ms: Date.now() - 5 * MIN } },
  "zo-depot2": { aktuel: { tempC: 17.1,  fugtPct: 54, ms: Date.now() - 6 * MIN } },
  "zo-kontor": { aktuel: { tempC: 15.2,  fugtPct: 43, ms: Date.now() - 2 * MIN } },
  /* Inden for 2-6 gr.: ingen alarm. Der skal blive ved med at vaere
     PRAECIS én aktiv klimaalarm — zo-koel1 paa 7,4 gr. */
  "zo-koelodense": { aktuel: { tempC: 4.1, fugtPct: 79, ms: Date.now() - 7 * MIN } },
};

/** Zone + måling parret. DEN ENE kilde begge skærme læser. */
export const zonePar = () =>
  DEMO_ZONER.map((zone) => ({ zone, maaling: DEMO_SENSORER[zone.id]?.aktuel || null }));

/* ---- Fejl -------------------------------------------------------------- */

export const DEMO_FEJL = [
  { id: "fe-001", aktivId: "fa-port3", status: "planlagt", meldtMs: dag(-5),
    beskrivelse: "Port lukker langsomt og står stille på halvvejs", alvor: "hoej", meldtAf: "Benjamin Holm" },
  { id: "fe-002", aktivId: "fa-lade2", status: "ny", meldtMs: dag(-1),
    beskrivelse: "Ladestander viser fejlkode E14 og lader ikke", alvor: "mellem", meldtAf: "Mette Sørensen" },
  { id: "fe-003", aktivId: "fa-vask", status: "igang", meldtMs: dag(-9),
    beskrivelse: "Vaskehal: højtryksdyse utæt, vand på gulvet", alvor: "hoej", meldtAf: "Ib Sørensen" },
  { id: "fe-004", aktivId: "fa-frost1", status: "planlagt", meldtMs: dag(-2),
    beskrivelse: "Fryseanlæg larmer ved opstart", alvor: "lav", meldtAf: "Emil Brandt" },
  { id: "fe-005", aktivId: "fa-port1", status: "udbedret", meldtMs: dag(-18),
    beskrivelse: "Fotocelle justeret", alvor: "lav", meldtAf: "Benjamin Holm" },
];

/* ---- Servicebesøg: OPGAVER MED ART facility ----------------------------- */

/**
 * Beslutning 21. Posterne bærer `art` og `division` og valideres mod
 * opgaveMangler() i selvkontrollen — kunne de ikke gemmes i opgaver/, er
 * formen forkert her.
 *
 * `sagsnummer` er "Reserveret fra sag #1245" fra mockuppen. Reservationen
 * bygges af reservationFraOpgave() med kilde `facilitySag` og prioritet 20 —
 * den fjerde kilde krævede ingen ny kode.
 *
 * Et besøg på `lokationId` uden `aktivId` spærrer HELE stedet: lukker man
 * hallen, er alle porte i den også optaget.
 */
export const DEMO_SERVICEBESOEG = [
  { id: "fs-001", art: "facility", division: "faelles", status: "planlagt",
    aktivId: "fa-port3", lokationId: "lok-halb",
    fra: dag(1, 8), til: dag(1, 12), leverandoerId: "lv-crawford",
    beskrivelse: "Udskiftning af portmotor", sagsnummer: "FAC-2026-00127", estimatOere: 1840000 },
  { id: "fs-002", art: "facility", division: "faelles", status: "planlagt",
    aktivId: "fa-frost1", lokationId: "lok-halb",
    fra: dag(1, 7), til: dag(1, 15), leverandoerId: "lv-koelecenter",
    beskrivelse: "Halvårligt serviceeftersyn på fryseanlæg", estimatOere: 960000 },
  { id: "fs-003", art: "facility", division: "faelles", status: "igang",
    aktivId: "fa-vask", lokationId: "lok-kolding",
    fra: dag(-1, 7), til: dag(2, 16), leverandoerId: "lv-wash",
    beskrivelse: "Vaskehal ude af drift — dysebom udskiftes", estimatOere: 3120000 },
  { id: "fs-004", art: "facility", division: "faelles", status: "planlagt",
    /* INGEN aktivId: hele hallen spærres, ikke ét anlæg. */
    lokationId: "lok-halb",
    fra: dag(4, 6), til: dag(4, 18), leverandoerId: "lv-gulv",
    beskrivelse: "Epoxybehandling af gulv — hallen kan ikke bruges", estimatOere: 4450000 },
  { id: "fs-005", art: "facility", division: "faelles", status: "planlagt",
    aktivId: "fa-lade2", lokationId: "lok-kolding",
    fra: dag(2, 9), til: dag(2, 13), leverandoerId: "lv-clever",
    beskrivelse: "Fejlsøgning E14 på ladestander", estimatOere: 620000 },
  { id: "fs-006", art: "facility", division: "faelles", status: "planlagt",
    aktivId: "fa-port5", lokationId: "lok-aalborg",
    fra: dag(5, 8), til: dag(5, 11), leverandoerId: "lv-crawford",
    beskrivelse: "Årligt eftersyn", estimatOere: 740000 },
];

/* ---- Bygningsomkostninger: KOMPONENTERNE ------------------------------- */

/**
 * Hele øre, ekskl. moms. TOTALERNE GEMMES IKKE — se elVarmeOere() og
 * bygningsomkostningOere() i facility.js.
 *
 *   el + varme                              = 4.303.000 øre = 43.030 kr
 *   + vand + ventilation + alarm            = 5.842.000 øre = 58.420 kr
 *
 * Det sidste tal er mockuppens "El/varme denne måned 58.420 kr". Det var hele
 * bygningen.
 */
export const DEMO_BYGNINGSOMKOSTNING = {
  el: 2180000,
  varme: 2123000,
  vand: 412000,
  ventilation: 689000,
  alarm: 438000,
};

/* ---- Opslag ------------------------------------------------------------ */

export const demoAktiv = (id) => DEMO_AKTIVER.find((a) => a.id === id) || null;
export const demoLokation = (id) => DEMO_LOKATIONER.find((l) => l.id === id) || null;
export const demoAabneFejl = () => DEMO_FEJL.filter((f) => f.status !== "udbedret");

/* ---- Selvkontrol ------------------------------------------------------- */

if (import.meta.env?.DEV) {
  const lokIder = new Set(DEMO_LOKATIONER.map((l) => l.id));
  const aktivIder = new Set(DEMO_AKTIVER.map((a) => a.id));
  const zoneIder = new Set(DEMO_ZONER.map((z) => z.id));

  for (const l of DEMO_LOKATIONER) {
    if (!LOKATION_TYPE[l.type]) console.warn(`demo-facility: ${l.id} har ukendt type "${l.type}".`);
    /* ⚠ SAMME STEDKATALOG SOM PERSONALE OG FLAADE. Et opdigtet stednavn her
       ville betyde at en bil med hjemsted i Vejle stod paa et sted
       bygningsdata ikke kendte — og det opdages foerst naar nogen leder. */
    if (!erSted(l.sted)) {
      console.warn(`demo-facility: ${l.id} staar i "${l.sted}", som ikke er i STED.`);
    }
    if (!Number.isInteger(l.arealM2) || l.arealM2 <= 0) {
      console.warn(`demo-facility: ${l.id} har arealM2 "${l.arealM2}" — skal vaere et helt positivt tal.`);
    }
  }

  for (const a of DEMO_AKTIVER) {
    if (!AKTIV_ART[a.art]) console.warn(`demo-facility: ${a.id} har ukendt art "${a.art}".`);
    if (!AKTIV_STATUS[a.status]) console.warn(`demo-facility: ${a.id} har ukendt status "${a.status}".`);
    if (!lokIder.has(a.lokationId)) {
      console.warn(`demo-facility: ${a.id} peger på ukendt lokation "${a.lokationId}".`);
    }
    if (a.zoneId && !zoneIder.has(a.zoneId)) {
      console.warn(`demo-facility: ${a.id} peger på ukendt zone "${a.zoneId}".`);
    }
    /* Et anlæg der måles i en zone, skal HAVE en zone — ellers kan Klima ikke
       vise hvad køleanlægget faktisk holder. */
    if (AKTIV_ART[a.art]?.maalesZone && !a.zoneId) {
      console.warn(`demo-facility: ${a.id} er et ${a.art} uden zoneId. Klima kan ikke vise dets temperatur.`);
    }
  }

  for (const z of DEMO_ZONER) {
    if (!ZONE_ART[z.art]) console.warn(`demo-facility: ${z.id} har ukendt art "${z.art}".`);
    if (!lokIder.has(z.lokationId)) {
      console.warn(`demo-facility: ${z.id} peger på ukendt lokation "${z.lokationId}".`);
    }
    /* Grænsen hører PÅ ZONEN. Mangler den, falder alarmTilstand() tilbage på
       artens standard — og så er zonens egen grænse en illusion. */
    if (!Number.isFinite(z.graenser?.minC) || !Number.isFinite(z.graenser?.maksC)) {
      console.warn(`demo-facility: ${z.id} mangler grænser. Alarmen ville komme fra artens standard.`);
    }
    if (!DEMO_SENSORER[z.id]) {
      console.warn(`demo-facility: zone ${z.id} har ingen sensor. Begge skærme ville vise et hul.`);
    }
  }

  for (const id of Object.keys(DEMO_SENSORER)) {
    if (!zoneIder.has(id)) {
      console.warn(`demo-facility: sensor "${id}" har ingen zone. Grænsen er ukendt, og alarmen kan ikke afgøres.`);
    }
  }

  for (const f of DEMO_FEJL) {
    if (!FEJL_STATUS[f.status]) console.warn(`demo-facility: ${f.id} har ukendt status "${f.status}".`);
    if (!aktivIder.has(f.aktivId)) console.warn(`demo-facility: ${f.id} peger på ukendt aktiv "${f.aktivId}".`);
  }

  /* Servicebesøgene er opgaver med art facility. Kunne de ikke gemmes i
     opgaver/, er formen forkert her. */
  for (const b of DEMO_SERVICEBESOEG) {
    const mangler = opgaveMangler(b);
    if (mangler.length) {
      console.warn(`demo-facility: ${b.id} mangler ${mangler.join(", ")} og kunne ikke gemmes i opgaver/.`);
    }
    if (b.aktivId && !aktivIder.has(b.aktivId)) {
      console.warn(`demo-facility: ${b.id} peger på ukendt aktiv "${b.aktivId}".`);
    }
    if (!lokIder.has(b.lokationId)) {
      console.warn(`demo-facility: ${b.id} peger på ukendt lokation "${b.lokationId}".`);
    }
    if (!(b.til > b.fra)) console.warn(`demo-facility: ${b.id} har til <= fra.`);
  }

  /* Et anlæg kan ikke serviceres to gange samtidig — eksklusiv ressource. */
  for (const id of new Set(DEMO_SERVICEBESOEG.map((b) => b.aktivId).filter(Boolean))) {
    const mine = DEMO_SERVICEBESOEG.filter((b) => b.aktivId === id);
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        if (mine[i].fra < mine[j].til && mine[j].fra < mine[i].til) {
          console.warn(`demo-facility: ${mine[i].id} og ${mine[j].id} overlapper på ${id}.`);
        }
      }
    }
  }

  /* Et aktiv med status `fejl` bør have en åben fejlmelding — ellers siger
     Overblik og aktivlisten hver sit om samme anlæg. */
  const medAabenFejl = new Set(demoAabneFejl().map((f) => f.aktivId));
  for (const a of DEMO_AKTIVER) {
    if (a.status === "fejl" && !medAabenFejl.has(a.id)) {
      console.warn(`demo-facility: ${a.id} har status "fejl", men ingen åben fejlmelding.`);
    }
  }

  /* Det tal mockuppen tog fejl af. Holder rekonstruktionen ikke, er noten
     ved DEMO_SENSORER forkert. */
  const tempererede = zonePar().filter((p) => p.zone.art === "tempereret");
  const snit = gennemsnitTemperatur(tempererede);
  if (Math.abs(snit - 16.9) > 0.05) {
    console.warn(
      `demo-facility: de tempererede zoner giver ${snit?.toFixed(1)} °C, ikke 16,9. ` +
      `Rekonstruktionen af mockup-fejlen holder ikke længere.`
    );
  }

  /* Komponenterne skal summe til totalen. Et gemt totalfelt ville kunne drive
     fra dem; her er der ingen at drive fra. */
  const sum = Object.values(DEMO_BYGNINGSOMKOSTNING).reduce((s, v) => s + v, 0);
  if (sum !== bygningsomkostningOere(DEMO_BYGNINGSOMKOSTNING)) {
    console.warn(`demo-facility: bygningsomkostningOere() summer ikke komponenterne.`);
  }
  if (elVarmeOere(DEMO_BYGNINGSOMKOSTNING) >= sum) {
    console.warn(
      `demo-facility: el/varme er ikke mindre end bygningsomkostningen. ` +
      `De to skal være forskellige tal — det var netop mockuppens fejl.`
    );
  }
  for (const k of Object.keys(DEMO_BYGNINGSOMKOSTNING)) {
    if (!OMKOSTNINGSPOST[k]) console.warn(`demo-facility: ukendt omkostningspost "${k}".`);
  }

  /* Fordelingen paa art SKAL summe til totalen. Goer den ikke det, viser
     donutten en anden aktivbase end nøgletallet over den — og det er
     84-mod-83 i en cirkel. */
  const prArt = DEMO_KPI.gods?.facility?.aktiverPrArt || {};
  const artSum = Object.values(prArt).reduce((s, v) => s + v, 0);
  if (artSum !== (DEMO_KPI.gods?.facility?.aktiver || 0)) {
    console.warn(
      `demo-facility: aktiverPrArt summer til ${artSum}, men kpi.facility.aktiver ` +
      `siger ${DEMO_KPI.gods?.facility?.aktiver}. Donutten og noegletallet ville ` +
      `beskrive hver sin aktivbase.`
    );
  }

  /* Loft mod kpi/, som flåden og fraværet. Facility er fælles, så tallet står
     ens under begge divisioner — derfor ét og ikke en sum. */
  const iAlt = DEMO_KPI.gods?.facility?.aktiver || 0;
  if (DEMO_AKTIVER.length > iAlt) {
    console.warn(
      `demo-facility: ${DEMO_AKTIVER.length} aktiver i demo, men kpi/ siger ${iAlt} i alt. ` +
      `Et udsnit kan ikke være større end totalen.`
    );
  }
  if ((DEMO_KPI.gods?.facility?.aktiver || 0) !== (DEMO_KPI.bus?.facility?.aktiver || 0)) {
    console.warn(
      `demo-facility: kpi.facility.aktiver er forskellig under gods og bus. ` +
      `Facility er fælles — porten er den samme uanset hvem der kører igennem den.`
    );
  }
}
