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

/* ---- Lokationens tilstand --------------------------------------------- */

/**
 * lokationTilstand(lokationId, { aktiver, aabneFejl, par }) → { tone, tekst }
 *
 * ⚠ AFLEDT, ALDRIG GEMT. Et statusfelt på lokationen ville drive fra
 * anlæggene under den i det sekund et af dem blev meldt i orden — og så stod
 * der Kritisk på en hal hvor alt virkede, eller Normal på en hvor intet gjorde.
 * Samme grund som alarmTilstand() ikke er et flag: se noten der.
 *
 * TRE TRIN, og rækkefølgen er meningsbærende:
 *
 *   Kritisk    en aktiv klimaalarm, en fejl af høj alvor, eller et anlæg
 *              der er ude af drift. Alle tre betyder at noget IKKE virker nu.
 *   Advarsel   en åben fejl af lavere alvor, eller et anlæg til service.
 *              Noget kræver handling, men stedet fungerer.
 *   Normal     ingen af delene.
 *
 * En klimaalarm er kritisk uanset alvorsgrad på fejlen: står et kølerum for
 * varmt, er varen i fare, og det er ikke et spørgsmål om hvem der meldte det.
 */
export function lokationTilstand(lokationId, { aktiver = [], aabneFejl = [], par = [] } = {}) {
  const mine = aktiver.filter((a) => a.lokationId === lokationId);
  const mineIder = new Set(mine.map((a) => a.id));
  const fejl = aabneFejl.filter((f) => mineIder.has(f.aktivId));

  const alarm = par.some(
    (p) => p.zone?.lokationId === lokationId && alarmTilstand(p.zone, p.maaling).alarm
  );
  const udeAfDrift = mine.some((a) => a.status === "udeAfDrift");
  const hoejFejl = fejl.some((f) => f.alvor === "hoej");

  if (alarm || udeAfDrift || hoejFejl) {
    return { tone: "bad", tekst: "Kritisk",
             grund: alarm ? "aktiv klimaalarm"
                  : udeAfDrift ? "anlæg ude af drift"
                  : "fejl af høj alvor" };
  }
  if (fejl.length || mine.some((a) => a.status === "fejl" || a.status === "service")) {
    return { tone: "warn", tekst: "Advarsel",
             grund: fejl.length ? `${fejl.length} åben${fejl.length === 1 ? "" : "e"} fejl`
                                : "anlæg til service" };
  }
  return { tone: "ok", tekst: "Normal", grund: "ingen åbne fejl eller alarmer" };
}

/**
 * driftsforhold(lokationId, { aktiver, aabneFejl, par }) → rækker til kortet
 *
 * Hver række er { ikon, label, vaerdi, tone, tekst } — ikonnavnet slås op i
 * IKON i ui.jsx, som ART_IKON gør det i flaade.js. Logikken hører her, så
 * Overblik og en fremtidig detaljeret driftsstatus ikke kan svare forskelligt
 * på det samme spørgsmål.
 *
 * ⚠ MOCKUPPENS "78 % KAPACITET" PÅ VENTILATIONEN ER IKKE MED. Der findes
 * ingen kapacitetsmåling — hverken i sensorer/ eller på aktivet — og et
 * procenttal opfundet til lejligheden ville se ud som en måling. Rækken siger
 * i stedet hvor mange ventilationsanlæg der kører, hvilket VI kan se.
 */
export function driftsforhold(lokationId, { aktiver = [], aabneFejl = [], par = [] } = {}) {
  const mine = aktiver.filter((a) => a.lokationId === lokationId);
  const mineZoner = par.filter((p) => p.zone?.lokationId === lokationId);

  /* Temperaturen: den koldeste zone på stedet er den der har noget på spil.
     Et kontor på 21 grader siger intet om et kølerum ved siden af. */
  const medMaaling = mineZoner.filter((p) => p.maaling);
  const koldest = medMaaling.length
    ? medMaaling.reduce((a, b) => (b.maaling.tempC < a.maaling.tempC ? b : a))
    : null;
  const tempAlarm = koldest ? alarmTilstand(koldest.zone, koldest.maaling) : null;

  const raekker = [];

  raekker.push(koldest
    ? { ikon: "termometer", label: koldest.zone.navn,
        vaerdi: `${koldest.maaling.tempC.toFixed(1)} °C`,
        tone: tempAlarm.tone, tekst: tempAlarm.tekst }
    : { ikon: "termometer", label: "Temperatur", vaerdi: "Ingen sensor",
        tone: "info", tekst: "Ikke målt" });

  const gruppe = (art, ikon, label, ordEt, ordFlere) => {
    const dem = mine.filter((a) => a.art === art);
    if (!dem.length) return null;
    const nede = dem.filter((a) => !AKTIV_STATUS[a.status]?.driftsklar);
    return {
      ikon, label,
      vaerdi: nede.length
        ? `${nede.length} af ${dem.length} ${dem.length === 1 ? ordEt : ordFlere} nede`
        : `Alle ${dem.length} ${dem.length === 1 ? ordEt : ordFlere} OK`,
      tone: nede.length ? "bad" : "ok",
      tekst: nede.length ? "Kritisk" : "Normal",
    };
  };

  const porte = gruppe("port", "port", "Porte", "port", "porte");
  if (porte) raekker.push(porte);
  const vent = gruppe("ventilation", "ventilator", "Ventilation", "anlæg", "anlæg");
  if (vent) raekker.push(vent);

  const alarmer = mineZoner.filter((p) => alarmTilstand(p.zone, p.maaling).alarm);
  raekker.push({
    ikon: "klokke", label: "Klimaalarmer",
    vaerdi: alarmer.length
      ? `${alarmer.length} aktiv${alarmer.length === 1 ? "" : "e"} alarm${alarmer.length === 1 ? "" : "er"}`
      : "Ingen aktive",
    tone: alarmer.length ? "bad" : "ok",
    tekst: alarmer.length ? "Kritisk" : "Normal",
  });

  return raekker;
}

/* ---- Fordelingen af aktivbasen ---------------------------------------- */

/**
 * aktivFordeling(prArt, maks) → [{ id, label, antal }], størst først
 *
 * ⚠ HØJST `maks` SLICES, RESTEN FOLDES TIL "ØVRIGE". Seriepaletten har fem
 * farver, og de fem er valgt fordi de kan skelnes fra hinanden — også af den
 * der ikke ser rødt og grønt (beslutning 30). En sjette kategori ville
 * genbruge farve nummer ét, og så betyder to slices i samme figur det samme
 * uden at gøre det. Folder man i stedet, kan legenden sige hvad Øvrige er.
 *
 * Summen bevares: Øvrige er præcis resten, ikke et afrundet tal.
 */
export function aktivFordeling(prArt = {}, maks = 5) {
  const poster = Object.entries(prArt)
    .filter(([, n]) => n > 0)
    .map(([id, antal]) => ({
      id, antal,
      label: id === "oevrige" ? "Øvrige" : AKTIV_ART[id]?.label || id,
    }))
    .sort((a, b) => b.antal - a.antal);

  if (poster.length <= maks) return poster;

  const beholdt = poster.slice(0, maks - 1);
  const rest = poster.slice(maks - 1);
  return [
    ...beholdt,
    {
      id: "oevrige", label: "Øvrige",
      antal: rest.reduce((s, p) => s + p.antal, 0),
      /* Hvad der ligger i den. Legenden skal kunne sige det — ellers er
         Øvrige bare et hul man ikke kan spørge ind til. */
      dele: rest.map((p) => p.label),
    },
  ];
}
