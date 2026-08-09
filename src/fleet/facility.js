/* src/fleet/facility.js
 * Facility som entitet. Tredje gang mønstret fra beslutning 18 dukker op:
 * der var aktiver, lokationer og zoner i skærmene, men ingen node de kom fra.
 *
 * INGEN IMPORTS ud over reservations.js — samme grund som opgaver.js,
 * fravaer.js og etaper.js.
 *
 * FIRE NODER, OG DE KAN IKKE SLÅS SAMMEN:
 *
 *   facility/lokationer/<id>   et STED. Reserverbart som RESSOURCE.lokation
 *   facility/aktiver/<id>      et ANLÆG. Reserverbart som RESSOURCE.facilityAktiv
 *   facility/zoner/<id>        et måleområde. Bærer GRÆNSERNE
 *   facility/sensorer/<id>     målingerne. Fandtes allerede
 *
 * Lokation og aktiv er hver sin reserverbare type i RESSOURCE — et
 * servicebesøg optager enten et anlæg eller et helt sted. De kan derfor ikke
 * være samme node.
 *
 * ⚠ GRÆNSEN LIGGER PÅ ZONEN, MÅLINGEN PÅ SENSOREN. Det er den vigtigste af de
 * fire adskillelser. Lå alarmtærsklen på sensornoden, ville en ændring af hvad
 * der tæller som alarm SKRIVE I MÅLEDATA — og så kan man bagefter ikke sige
 * hvad temperaturen faktisk var. En alarm er AFLEDT af måling + grænse. Den
 * gemmes ikke.
 *
 * ⚠ `aktiv.art` ER IKKE `opgave.art`. Aktivets art er udstyrstypen (port,
 * køleanlæg, vaskehal); opgavens art er `facility` (beslutning 21). Samme
 * feltnavn, to vokabularer, to noder — som `division` optræder flere steder.
 * Slå dem ikke sammen.
 *
 * FACILITY ER FÆLLES. kpi.facility er identisk under gods og bus, fordi porten
 * er den samme uanset hvem der kører igennem den. Skærmene reagerer derfor
 * ikke på Gods/Bus-toggle'en.
 */

import { RESSOURCE } from "./reservations.js";

/* ---- Lokationer -------------------------------------------------------- */

export const LOKATION_TYPE = {
  hovedkontor: "Hovedkontor",
  depot: "Depot",
  lager: "Lagerhal",
  vaerksted: "Værksted",
};

/* ---- Aktiver ----------------------------------------------------------- */

/** Udstyrstypen. Styrer hvilke felter der giver mening — samme tanke som
 *  ENHEDSART på flåden, men et andet katalog. */
export const AKTIV_ART = {
  port:         { label: "Port",          maalesZone: false },
  koeleanlaeg:  { label: "Køleanlæg",     maalesZone: true  },
  ventilation:  { label: "Ventilation",   maalesZone: true  },
  vaskehal:     { label: "Vaskehal",      maalesZone: false },
  ladestander:  { label: "Ladestander",   maalesZone: false },
  alarm:        { label: "Alarmanlæg",    maalesZone: false },
  truck:        { label: "Truckoplader",  maalesZone: false },
};

export const ALLE_AKTIV_ARTER = Object.keys(AKTIV_ART);

export const AKTIV_STATUS = {
  idrift:     { label: "I drift",      pill: "ok",   driftsklar: true  },
  fejl:       { label: "Fejl",         pill: "bad",  driftsklar: false },
  service:    { label: "Til service",  pill: "warn", driftsklar: false },
  udeAfDrift: { label: "Ude af drift", pill: "bad",  driftsklar: false },
};

export const ALLE_AKTIV_STATUS = Object.keys(AKTIV_STATUS);

/* ---- Zoner og klima ---------------------------------------------------- */

/**
 * Zonens art. Den afgør hvilke zoner der kan SAMMENLIGNES — se
 * gennemsnitTemperatur().
 */
export const ZONE_ART = {
  frost:      { label: "Frost",      minC: -22, maksC: -18 },
  koel:       { label: "Køl",        minC: 2,   maksC: 6   },
  tempereret: { label: "Tempereret", minC: 5,   maksC: 25  },
  kontor:     { label: "Kontor",     minC: 20,  maksC: 24  },
};

export const ALLE_ZONE_ARTER = Object.keys(ZONE_ART);

/**
 * alarmTilstand(zone, maaling) → { alarm, tone, tekst }
 *
 * AFLEDT af måling + grænse. Den gemmes ikke, og den må ikke gemmes: et
 * lagret alarmflag ville drive fra målingen i det sekund nogen justerer
 * grænsen, og så står der rødt på noget der er i orden — eller værre, grønt
 * på noget der ikke er.
 *
 * Grænserne kommer fra zonen; findes de ikke, falder vi tilbage på artens
 * standard. Uden nogen af delene kan vi ikke svare, og så siger vi det.
 */
export function alarmTilstand(zone, maaling) {
  const t = maaling?.tempC;
  if (!Number.isFinite(t)) {
    return { alarm: false, tone: "info", tekst: "Ingen måling" };
  }
  const min = zone?.graenser?.minC ?? ZONE_ART[zone?.art]?.minC;
  const maks = zone?.graenser?.maksC ?? ZONE_ART[zone?.art]?.maksC;
  if (!Number.isFinite(min) || !Number.isFinite(maks)) {
    return { alarm: false, tone: "info", tekst: "Ingen grænse sat" };
  }
  if (t < min) return { alarm: true, tone: "bad", tekst: `Under ${min} °C` };
  if (t > maks) return { alarm: true, tone: "bad", tekst: `Over ${maks} °C` };
  /* Tæt på kanten er ikke en alarm, men det er værd at se. */
  const spaend = maks - min;
  if (spaend > 0 && (t - min < spaend * 0.1 || maks - t < spaend * 0.1)) {
    return { alarm: false, tone: "warn", tekst: "Tæt på grænsen" };
  }
  return { alarm: false, tone: "ok", tekst: "Inden for grænsen" };
}

/**
 * gennemsnitTemperatur(par) → tal | null
 *
 * BEREGNES, GEMMES ALDRIG. Mockuppen viste 15,2 °C over en tabel hvis sensorer
 * gav 16,9 — to tal om samme sag, hvor det ene var skrevet i hånden. Regner
 * skærmen på den samme liste den viser, kan de ikke være uenige.
 *
 * ⚠ OG DET SKAL VÆRE PR. ZONEART. Et gennemsnit på tværs af en fryser på
 * −20 °C og et kontor på 22 °C giver 1 °C, og det tal beskriver ingenting.
 * Det er beslutning 11 og 14 en gang til: to størrelser med hver sin betydning
 * må ikke lægges sammen, blot fordi de har samme enhed. Derfor tager
 * funktionen en liste der ALLEREDE er filtreret til sammenlignelige zoner —
 * se gennemsnitPrZoneArt().
 *
 * par: [{ zone, maaling }]
 */
export function gennemsnitTemperatur(par = []) {
  const tal = par
    .map((p) => p?.maaling?.tempC)
    .filter((t) => Number.isFinite(t));
  if (!tal.length) return null;
  return tal.reduce((s, t) => s + t, 0) / tal.length;
}

/**
 * Ét gennemsnit pr. zoneart. → { [art]: { snit, antal } }
 *
 * Brug den frem for ét samlet tal. En skærm der viser "gennemsnitstemperatur"
 * uden at sige hvilke zoner, viser et tal ingen kan bruge.
 */
export function gennemsnitPrZoneArt(par = []) {
  const grupper = new Map();
  for (const p of par) {
    if (!p?.zone?.art || !Number.isFinite(p?.maaling?.tempC)) continue;
    if (!grupper.has(p.zone.art)) grupper.set(p.zone.art, []);
    grupper.get(p.zone.art).push(p);
  }
  const ud = {};
  for (const [art, liste] of grupper) {
    ud[art] = { snit: gennemsnitTemperatur(liste), antal: liste.length };
  }
  return ud;
}

/** Aktive alarmer lige nu. AFLEDT — hører ikke i kpi/, af samme grund som
 *  bemanding.ledig ikke gør: et gemt afledt tal driver fra sit grundlag. */
export const aktiveAlarmer = (par = []) =>
  par.filter((p) => alarmTilstand(p.zone, p.maaling).alarm);

/* ---- Bygningsomkostninger ---------------------------------------------- */

/**
 * ⚠ EL/VARME ER IKKE BYGNINGSOMKOSTNINGEN.
 *
 * Mockuppen skrev "El/varme denne måned 58.420 kr", men tallet var hele
 * bygningen — el, varme, vand, ventilation og alarm tilsammen. El og varme
 * alene er 43.030 kr. To tal med hver sin betydning under ét navn er præcis
 * beslutning 11 og 14.
 *
 * KOMPONENTERNE GEMMES, TOTALERNE BEREGNES. Lagrede vi begge totaler, kunne
 * de drive fra komponenterne — og så ville en post kunne mangle uden at nogen
 * så det på totalen.
 */
export const OMKOSTNINGSPOST = {
  el: "El",
  varme: "Varme",
  vand: "Vand",
  ventilation: "Ventilation",
  alarm: "Alarm og overvågning",
};

/** Kun el og varme. Det tal mockuppen troede den viste. */
export const elVarmeOere = (p = {}) => (p.el || 0) + (p.varme || 0);

/** Hele bygningen. Summen af samtlige poster — aldrig et gemt felt. */
export const bygningsomkostningOere = (p = {}) =>
  Object.keys(OMKOSTNINGSPOST).reduce((s, k) => s + (p[k] || 0), 0);

/* ---- Fejl -------------------------------------------------------------- */

export const FEJL_STATUS = {
  ny:        { label: "Ny",           pill: "bad"  },
  planlagt:  { label: "Planlagt",     pill: "info" },
  igang:     { label: "I gang",       pill: "warn" },
  udbedret:  { label: "Udbedret",     pill: "ok"   },
};

/* ---- Reservationen ----------------------------------------------------- */

/**
 * Hvilken ressourcetype en facility-opgave binder.
 *
 * Et servicebesøg på et anlæg optager anlægget; et besøg der spærrer et helt
 * sted optager lokationen. Begge findes i RESSOURCE, og de er ikke det samme:
 * lukker man hallen, er alle porte i den også optaget.
 *
 * Selve reservationen bygges af reservationFraOpgave() i opgaver.js — kilde
 * `facilitySag`, prioritet 20. Den fjerde kilde krævede ingen ny kode.
 */
export const ressourceTypeForFacility = (opgave) =>
  opgave?.aktivId ? RESSOURCE.facilityAktiv : RESSOURCE.lokation;
