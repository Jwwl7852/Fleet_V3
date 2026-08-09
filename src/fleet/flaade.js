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
 * sikkerhedsvurdering — art, status, længde. At kode hvert felts lovlige
 * arter ind i RTDB-regler ville gøre filen ulæselig uden at gøre noget
 * sikrere.
 *
 * INGEN DIVISION på et køretøj — beslutning 19. Feltet var påkrævet indtil da.
 * En påhængsvogn eller en varevogn kan tilhøre både en gods- og en
 * busvognmand, så værdien kunne ikke begrundes på den enkelte bil: den ville
 * skulle tastes, og derefter blive læst af nogen. Arten siger det der kan
 * siges. Reglerne afviser feltet med .validate: false.
 */

export const GRUPPE = {
  motoriseret: "motoriseret",
  /* Kan ikke bevæge sig selv. Reserveres selvstændigt, men disponeres aldrig
     alene — se kanDisponeres(). */
  paahaengt: "paahaengt",
};

/**
 * ⚠ tachograf og koereHviletid er ARTENS TYPISKE krav, ikke en juridisk
 * afgørelse. Om en konkret enhed er omfattet afhænger af totalvægt og
 * sædeantal på registreringsattesten — en minibus til 9 personer og en til 16
 * er ikke det samme. Skal det være præcist, hører det som felter på enheden
 * og ikke på arten. Noteret som kendt hul.
 */
export const ENHEDSART = {
  traekker:  { label: "Trækker",      gruppe: GRUPPE.motoriseret, tachograf: true,  koereHviletid: true },
  lastbil:   { label: "Lastbil",      gruppe: GRUPPE.motoriseret, tachograf: true,  koereHviletid: true },
  varevogn:  { label: "Varevogn",     gruppe: GRUPPE.motoriseret, tachograf: false, koereHviletid: false },
  /* Bus-divisionen havde ingen enhedstype at pege på. Samme klasse fund som
     chauffør/medarbejder: modellen dækkede ikke det den påstod. */
  bus:       { label: "Bus",          gruppe: GRUPPE.motoriseret, tachograf: true,  koereHviletid: true },
  /* Ligger mellem varevogn og bus i BÅDE kørekortkrav og færgetakst, og må
     derfor ikke rundes til nogen af dem. Rundes den ned til varevogn, mangler
     der et kørekortkrav; rundes den op til bus, bliver færgetaksten for høj. */
  minibus:   { label: "Minibus",      gruppe: GRUPPE.motoriseret, tachograf: false, koereHviletid: false },
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

/* ---- Art styrer feltskemaet ----------------------------------------- */

/**
 * Hvilke felter der overhovedet FINDES på en art.
 *
 * Det her er den konkrete udmøntning af "art styrer skemaet" fra toppen af
 * filen. Reglerne håndhæver kun det der kan ødelægge en beregning — art,
 * status, laengdeMm, driftPrKmOere, kapacitet. Resten er formularlogik, og
 * den hører i et katalog frem for i en skærm: spørger Flåde, Disponering og
 * en fremtidig formular hver for sig, får man tre svar på om en scooter har
 * en tachograf.
 *
 * ⚠ ET FELT DER IKKE FINDES ER IKKE ET TOMT FELT. En trailer har ingen
 * kilometerstand, fordi den ikke har en motor — ikke fordi ingen har tastet
 * den. Vises den som "—", ligner det en mangel nogen bør udfylde, og så bliver
 * den udfyldt. Brug harFelt() til at udelade rækken helt.
 */
export const FELT = {
  kmStand: "kmStand",                 // målerstand. Kun motoriserede
  driftPrKmOere: "driftPrKmOere",     // også påhæng: dæk og slid koster pr. km
  kapacitet: "kapacitet",             // { m3, kg } — det der kan lastes
  saeder: "saeder",                   // bus og minibus. Passagerer, ikke m³
  naesteServiceMs: "naesteServiceMs",
  synMs: "synMs",                     // påhængt materiel har sit EGET syn
  tachografNr: "tachografNr",
};

/* Rækkefølgen her er den rækkefølge felterne vises i. Ét sted, så to skærme
   ikke lister de samme fem felter forskelligt. */
const ALLE_FELTER = [
  FELT.kmStand, FELT.driftPrKmOere, FELT.kapacitet, FELT.saeder,
  FELT.naesteServiceMs, FELT.synMs, FELT.tachografNr,
];

/* Godsbærende motoriseret materiel. Bus og minibus står IKKE her: de bærer
   passagerer, og en kapacitet i m³ på en turistbus er et tal ingen kan bruge
   til noget — bagagerummet er ikke det man disponerer efter. */
const GODS_MOTOR = [
  FELT.kmStand, FELT.driftPrKmOere, FELT.kapacitet,
  FELT.naesteServiceMs, FELT.synMs, FELT.tachografNr,
];

const PASSAGER = [
  FELT.kmStand, FELT.driftPrKmOere, FELT.saeder,
  FELT.naesteServiceMs, FELT.synMs, FELT.tachografNr,
];

export const ART_FELTER = {
  traekker: GODS_MOTOR,
  lastbil: GODS_MOTOR,
  /* Ingen tachograf — se ENHEDSART. Feltet findes derfor slet ikke. */
  varevogn: [FELT.kmStand, FELT.driftPrKmOere, FELT.kapacitet, FELT.naesteServiceMs, FELT.synMs],
  bus: PASSAGER,
  minibus: [FELT.kmStand, FELT.driftPrKmOere, FELT.saeder, FELT.naesteServiceMs, FELT.synMs],
  scooter: [FELT.kmStand, FELT.driftPrKmOere, FELT.naesteServiceMs],
  /* En truck kører på matriklen. Intet syn, ingen tachograf. */
  truck: [FELT.kmStand, FELT.driftPrKmOere, FELT.kapacitet, FELT.naesteServiceMs],
  /* Påhængt: ingen motor og dermed ingen kilometerstand — men eget
     registreringsnummer, eget syn og egne dæk. Det er hele grunden til at de
     er selvstændige enheder og ikke et felt på trækkeren. */
  trailer: [FELT.driftPrKmOere, FELT.kapacitet, FELT.naesteServiceMs, FELT.synMs],
  paahaeng: [FELT.driftPrKmOere, FELT.kapacitet, FELT.naesteServiceMs, FELT.synMs],
};

/** Har denne art overhovedet feltet? Brug den frem for at tjekke på om
 *  værdien er udfyldt — se advarslen ved FELT. */
export const harFelt = (art, felt) => (ART_FELTER[art] || []).includes(felt);

/** Felterne for en art, i katalogets rækkefølge. */
export const felterFor = (art) =>
  ALLE_FELTER.filter((f) => harFelt(art, f));

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
  d1: "d1",                     // minibus
  d: "d",                       // bus
  adr: "adr",                   // farligt gods
  tachografkort: "tachografkort",
  truckcertifikat: "truckcertifikat",

  /* HERFRA OG NED: typer der REGISTRERES, men som ingen enhed kan kræve.
     De står med vilje i samme katalog — to vokabularer for samme begreb er
     beslutning 11 og 14 om igen — men de optræder IKKE i ART_KRAV nedenfor,
     og kraevedeKompetencer() udsender dem derfor aldrig.

     Konsekvensen skal være tydelig, for den er nem at læse forkert: en
     medarbejder hvis førstehjælpsbevis er udløbet, BLOKERES IKKE i
     disponeringen. Det er ikke en forglemmelse. Kravet skal kunne udledes af
     enhederne plus godset — og der findes ingen lastbil der gør førstehjælp
     til en betingelse for at køre. Skal et af dem begynde at blokere, hører
     det i ART_KRAV eller i kraevedeKompetencer()'s gods-gren, ikke i en
     skærm. */
  eubevis: "eubevis",           // chaufføruddannelse, EU-kvalifikationsbevis
  kran: "kran",                 // kran og hejs
  foerstehjaelp: "foerstehjaelp",
};

/** Labels ét sted, som FUNKTION_LABEL i personale.js. En skærm skriver ikke
 *  "ADR — farligt gods" i hånden; så står der noget andet på den næste. */
export const KOMPETENCE_LABEL = {
  c: "C – stort kørekort",
  ce: "C/E – stort kørekort med påhæng",
  d1: "D1 – minibus",
  d: "D – bus",
  adr: "ADR — farligt gods",
  tachografkort: "Tachografkort",
  truckcertifikat: "Truckcertifikat",
  eubevis: "Chaufføruddannelse (EU-bevis)",
  kran: "Kran og hejs",
  foerstehjaelp: "Førstehjælp",
};

/** Kompetencer en enhed kan kræve — altså dem der kan BLOKERE en etape.
 *  Resten af kataloget registreres kun. */
export const BLOKERENDE_KOMPETENCER = [
  KOMPETENCE.c, KOMPETENCE.ce, KOMPETENCE.d1, KOMPETENCE.d,
  KOMPETENCE.adr, KOMPETENCE.tachografkort, KOMPETENCE.truckcertifikat,
];

export const kanBlokere = (type) => BLOKERENDE_KOMPETENCER.includes(type);

const ART_KRAV = {
  traekker: [KOMPETENCE.c, KOMPETENCE.tachografkort],
  lastbil: [KOMPETENCE.c, KOMPETENCE.tachografkort],
  varevogn: [],
  bus: [KOMPETENCE.d, KOMPETENCE.tachografkort],
  /* D1 og ikke D: det er dét der gør minibussen til sin egen art. */
  minibus: [KOMPETENCE.d1],
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
