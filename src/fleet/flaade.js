/* src/fleet/flaade.js
 * Flåden som entitet. Beslutning 18.
 *
 * INGEN IMPORTS — samme grund som personale.js.
 *
 * Flåden er ikke en liste af biler. En scooter har ingen tachograf og ingen
 * køre-hviletid; en trailer har eget registreringsnummer, egen synsfrist og
 * egne dæk, men ingen motor og kan ikke disponeres alene.
 *
 * ART STYRER SKEMAET — samme afgørelse som `art` på opgaver. Ikke ét skema
 * med tomme felter, og ikke syv modeller: en fælles kerne plus en art-styret
 * udvidelse. Kernen står i reglerne, udvidelsen står her.
 *
 * Reglerne håndhæver kun det der ville ødelægge en beregning eller en
 * sikkerhedsvurdering — art, status, division, længde. At kode hvert felts
 * lovlige arter ind i RTDB-regler ville gøre filen ulæselig uden at gøre
 * noget sikrere.
 */

export const GRUPPE = {
  motoriseret: "motoriseret",
  /* Kan ikke bevæge sig selv. Reserveres selvstændigt, men disponeres aldrig
     alene — se kanDisponeres(). */
  paahaengt: "paahaengt",
};

export const ENHEDSART = {
  traekker:  { label: "Trækker",      gruppe: GRUPPE.motoriseret, tachograf: true,  koereHviletid: true },
  lastbil:   { label: "Lastbil",      gruppe: GRUPPE.motoriseret, tachograf: true,  koereHviletid: true },
  varevogn:  { label: "Varevogn",     gruppe: GRUPPE.motoriseret, tachograf: false, koereHviletid: false },
  scooter:   { label: "Scooter",      gruppe: GRUPPE.motoriseret, tachograf: false, koereHviletid: false },
  truck:     { label: "Truck",        gruppe: GRUPPE.motoriseret, tachograf: false, koereHviletid: false },
  trailer:   { label: "Trailer",      gruppe: GRUPPE.paahaengt,   tachograf: false, koereHviletid: false },
  paahaeng:  { label: "Påhængsvogn",  gruppe: GRUPPE.paahaengt,   tachograf: false, koereHviletid: false },
};

export const ALLE_ARTER = Object.keys(ENHEDSART);

export const gruppeFor = (art) => ENHEDSART[art]?.gruppe ?? null;
export const erMotoriseret = (enhed) => gruppeFor(enhed?.art) === GRUPPE.motoriseret;
export const erPaahaengt = (enhed) => gruppeFor(enhed?.art) === GRUPPE.paahaengt;

/* En solgt bil HARDSLETTES ALDRIG — der hænger indberetninger, service- og
   omkostningshistorik på id'et. Reglerne håndhæver det med newData.exists(). */
export const KOERETOEJ_STATUS = {
  aktiv:       { label: "Aktiv",         pill: "ok",   disponerbar: true },
  vaerksted:   { label: "På værksted",   pill: "warn", disponerbar: false },
  udeAfDrift:  { label: "Ude af drift",  pill: "bad",  disponerbar: false },
  solgt:       { label: "Solgt",         pill: "info", disponerbar: false },
  skrottet:    { label: "Skrottet",      pill: "info", disponerbar: false },
};

export const ALLE_STATUS = Object.keys(KOERETOEJ_STATUS);

/**
 * Må disse enheder disponeres sammen?
 *
 * En trailer er en helt almindelig EKSKLUSIV ressource — to biler kan ikke få
 * den samme, fordi overlap er en konflikt. Reservationsmodellen behøver
 * derfor ingen nye begreber.
 *
 * "Kan ikke køre alene" er ikke en reservationsegenskab, men en
 * disponeringsregel, og den hører her.
 *
 * → { ok, aarsag }
 */
export function kanDisponeres(enheder = []) {
  const aktive = enheder.filter(Boolean);
  if (!aktive.length) return { ok: false, aarsag: "Ingen enheder valgt." };

  const ikkeDisponerbar = aktive.find((e) => !KOERETOEJ_STATUS[e.status]?.disponerbar);
  if (ikkeDisponerbar) {
    return {
      ok: false,
      aarsag: `${ikkeDisponerbar.registrering || ikkeDisponerbar.id} er ` +
              `${(KOERETOEJ_STATUS[ikkeDisponerbar.status]?.label || "ukendt").toLowerCase()}.`,
    };
  }

  if (aktive.some(erPaahaengt) && !aktive.some(erMotoriseret)) {
    return { ok: false, aarsag: "En trailer eller påhængsvogn kan ikke disponeres uden en trækkende enhed." };
  }
  return { ok: true };
}

/**
 * Samlet længde i MILLIMETER.
 *
 * Millimeter som integer, ikke meter som float. Færgetakster har
 * intervalgrænser ved 10 m og 20 m, og 9,998 mod 10,002 afgør prisen — på
 * Rødby–Puttgarden er forskellen over tusind kroner. Samme disciplin som øre
 * i beslutning 2: en float ved en grænse er en fejl der venter.
 *
 * Længden SKAL snapshottes på bookingen sammen med satserne. Retter nogen en
 * trailers længde i morgen, må en faktura fra i går ikke ændre sig — det er
 * beslutning 7 anvendt på en måling i stedet for en pris.
 */
export const samletLaengdeMm = (enheder = []) =>
  enheder.filter(Boolean).reduce((s, e) => s + (e.laengdeMm || 0), 0);

/**
 * Turens driftsomkostning pr. km — summen over enhederne.
 *
 * ÉT feltnavn og ikke to. Trækkerens driftPrKmOere er det man ellers ville
 * kalde koeretoejKostPrKmOere, trailerens er trailerKostPrKmOere — samme tal.
 * Med to navne skal man vide hvilket der læses for hvilken art, og et
 * modulvogntog med to trailere skal læse ét af det ene og to af det andet.
 * Med ét navn virker summen for en scooter, en lastbil og et modulvogntog.
 *
 * BEMÆRK NAVNET: driftPrKmOere er driftsomkostning UDEN chauffør —
 * beslutning 11's 3,42 kr. Kalkulationsprisen på 8,40 kr inkl. chauffør
 * ligger i Bookingopsætnings kmPrisSatser. To felter der begge hed "kr/km"
 * var netop den fejl beslutning 11 løste.
 */
export const driftPrKmOere = (enheder = []) =>
  enheder.filter(Boolean).reduce((s, e) => s + (e.driftPrKmOere || 0), 0);

/* ---- Kapacitet ------------------------------------------------------ */

/**
 * Hvad kombinationen kan bære: { m3, kg }.
 *
 * Feltet `kapacitet` sidder på hver enhed. En trækker alene bærer næsten
 * intet — lasten ligger på traileren — så det er summen der tæller, ikke
 * den enkelte enheds tal.
 *
 * Samme enheder som lagerreservationen bruger (`maengde: { m3, kg }`), så
 * godset kan sammenlignes med både en hal og et vogntog uden omregning.
 */
export const samletKapacitet = (enheder = []) =>
  enheder.filter(Boolean).reduce(
    (s, e) => ({ m3: s.m3 + (e.kapacitet?.m3 || 0), kg: s.kg + (e.kapacitet?.kg || 0) }),
    { m3: 0, kg: 0 }
  );

/**
 * Kan kombinationen bære godset?  → { ok, mangler: { m3, kg } }
 *
 * m3 og kg tjekkes hver for sig: en palle kan være let og fylde meget, eller
 * tung og fylde lidt. Samme grund som i lagerets kapacitetstjek.
 */
export function kanBaere(enheder = [], gods = {}) {
  const k = samletKapacitet(enheder);
  const mangler = {
    m3: Math.max(0, (gods.m3 || 0) - k.m3),
    kg: Math.max(0, (gods.kg || 0) - k.kg),
  };
  return { ok: !mangler.m3 && !mangler.kg, kapacitet: k, mangler };
}

/* ---- Kompetencekrav ------------------------------------------------- */

/**
 * Hvilke kompetencer en enhed kræver af den der fører den.
 *
 * Katalog og ikke logik i skærmen: kravet skal være det samme, uanset om det
 * er Disponering, en Cloud Function eller en test der spørger.
 */
export const KOMPETENCE = {
  c: "c",                       // stort kørekort
  ce: "ce",                     // stort kørekort med påhæng
  d: "d",                       // bus
  adr: "adr",                   // farligt gods
  tachografkort: "tachografkort",
  truckcertifikat: "truckcertifikat",
};

const ART_KRAV = {
  traekker: [KOMPETENCE.c, KOMPETENCE.tachografkort],
  lastbil: [KOMPETENCE.c, KOMPETENCE.tachografkort],
  varevogn: [],
  scooter: [],
  truck: [KOMPETENCE.truckcertifikat],
  trailer: [KOMPETENCE.ce],
  paahaeng: [KOMPETENCE.ce],
};

/**
 * Hvad kombinationen og godset tilsammen kræver.
 *
 * gods.farligt → ADR. Det er ikke en egenskab ved bilen, men ved lasten, og
 * derfor kan kravet ikke udledes af enhederne alene.
 */
export function kraevedeKompetencer(enheder = [], gods = {}) {
  const krav = new Set();
  for (const e of enheder.filter(Boolean)) {
    for (const k of ART_KRAV[e.art] || []) krav.add(k);
  }
  if (gods.farligt) krav.add(KOMPETENCE.adr);
  return [...krav].sort();
}
