/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/flaade.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
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
  /* Kranens loefteevne i TONMETER. Findes kun paa traekker og lastbil, og er
     null paa dem uden kran — se de to slags "har ikke" i kraevedeKompetencer(). */
  kranTonmeter: "kranTonmeter",
};

/* Rækkefølgen her er den rækkefølge felterne vises i. Ét sted, så to skærme
   ikke lister de samme fem felter forskelligt. */
const ALLE_FELTER = [
  FELT.kmStand, FELT.driftPrKmOere, FELT.kapacitet, FELT.saeder,
  FELT.kranTonmeter, FELT.naesteServiceMs, FELT.synMs, FELT.tachografNr,
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

/* Kun traekker og lastbil kan baere en kran. En bus med kran findes ikke, og
   en trailer har ingen motor at drive den med. */
const MED_KRAN = [...GODS_MOTOR, FELT.kranTonmeter];

export const ART_FELTER = {
  traekker: MED_KRAN,
  lastbil: MED_KRAN,
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

  /* ⚠ RETTET I BESLUTNING 25 — eubevis og kran blokerer nu.
   *
   * Her stod at eubevis, kran og førstehjælp kun REGISTRERES, og at ingen
   * enhed kan kræve dem. Begrundelsen var rigtig — et krav skal kunne udledes
   * af enhederne plus godset — men slutningen var forkert for to af de tre:
   *
   *   eubevis  EU-kvalifikationsbeviset følger af at køre ERHVERVSMÆSSIGT med
   *            C eller D. Det kan altså udledes af arten, præcis som C og
   *            tachografkort kan. Kommentaren blev skrevet før den slutning.
   *   kran     Kranførerbevis er lovpligtigt over 8 tonmeter. Kravet kommer
   *            fra BILENS KRAN — se kranTonmeter i ART_FELTER — og er dermed
   *            samme mønster som ADR fra godset.
   *
   * Førstehjælp står stadig her, og konsekvensen er uændret: en medarbejder
   * hvis førstehjælpsbevis er udløbet, BLOKERES IKKE. Der findes ingen bil der
   * gør førstehjælp til en betingelse for at køre — kravet kommer fra
   * virksomheden eller kunden, og den slags ADVARER med en begrundet override.
   *
   * Reglen efter beslutning 25 er skarpere end "lovkritisk mod virksomhedskrav":
   * ALT hvad kraevedeKompetencer() udleder af enheden og godset, blokerer.
   * Alt andet advarer. Linjen er hvad kravet KOMMER FRA. */
  eubevis: "eubevis",           // chaufføruddannelse, EU-kvalifikationsbevis
  kran: "kran",                 // kran og hejs — over KRAN_KRAEVER_BEVIS_TONMETER
  foerstehjaelp: "foerstehjaelp",
};

/**
 * Kranførerbevis er lovpligtigt over 8 tonmeter.
 *
 * Tallet står som en navngiven konstant og ikke i en if: en tærskel gemt i et
 * udtryk kan ikke findes af den der skal ændre den, og den kan ikke forklares
 * af den der undrer sig over hvorfor netop denne bil kræver et bevis.
 */
export const KRAN_KRAEVER_BEVIS_TONMETER = 8;

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

/**
 * Kompetencer der kan UDLEDES af enheden eller godset — og som derfor
 * blokerer. Resten advarer.
 *
 * ⚠ Listen er ikke et valg om hvad der er "vigtigt nok". Den er facit for
 * hvad kraevedeKompetencer() kan udsende, og de to skal stemme: står en type
 * her uden at kunne udledes, blokerer den aldrig, og en der kan udledes uden
 * at stå her, blokerer uden at være erklæret. Der er en test der holder dem
 * sammen.
 */
export const BLOKERENDE_KOMPETENCER = [
  KOMPETENCE.c, KOMPETENCE.ce, KOMPETENCE.d1, KOMPETENCE.d,
  KOMPETENCE.adr, KOMPETENCE.tachografkort, KOMPETENCE.truckcertifikat,
  /* Beslutning 25 — begge kan udledes. Se noten ved KOMPETENCE. */
  KOMPETENCE.eubevis, KOMPETENCE.kran,
];

export const kanBlokere = (type) => BLOKERENDE_KOMPETENCER.includes(type);

/* eubevis står på de arter der køres ERHVERVSMÆSSIGT med C eller D —
   trækker, lastbil, bus og minibus. Ikke på varevogn, scooter og truck, hvor
   kørslen ikke kræver et kvalifikationsbevis, og ikke på påhængt materiel,
   som ikke føres af nogen alene. Se rettelsen ved KOMPETENCE. */
const ART_KRAV = {
  traekker: [KOMPETENCE.c, KOMPETENCE.tachografkort, KOMPETENCE.eubevis],
  lastbil: [KOMPETENCE.c, KOMPETENCE.tachografkort, KOMPETENCE.eubevis],
  varevogn: [],
  bus: [KOMPETENCE.d, KOMPETENCE.tachografkort, KOMPETENCE.eubevis],
  /* D1 og ikke D: det er dét der gør minibussen til sin egen art. */
  minibus: [KOMPETENCE.d1, KOMPETENCE.eubevis],
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

    /* ⚠ TO SLAGS "HAR IKKE" — de må ikke forveksles.
       harFelt(art, kranTonmeter) siger at ARTEN kan have en kran.
       kranTonmeter == null siger at DENNE bil ikke har en.
       Blandes de, kræver vi kranbevis af hver eneste lastbil. */
    if (harFelt(e.art, FELT.kranTonmeter)
        && Number.isFinite(e.kranTonmeter)
        && e.kranTonmeter > KRAN_KRAEVER_BEVIS_TONMETER) {
      krav.add(KOMPETENCE.kran);
    }
  }
  if (gods.farligt) krav.add(KOMPETENCE.adr);
  return [...krav].sort();
}

/* ---- Nedetid ---------------------------------------------------------- */

/**
 * nedetidMs(besoeg, koeretoejId, fraMs, tilMs) → millisekunder i vinduet
 *
 * ⚠ NEDETID ER AFLEDT, IKKE ET FELT. Der stod ingen `nedetidDage` på bilen, og
 * det skal der heller ikke: et gemt afledt tal driver fra sit grundlag, og det
 * er præcis fejlen i `bemanding.ledig`. Værkstedsbesøget ER grundlaget — det
 * har `fra` og `til` — så tallet regnes hos den der viser det.
 *
 * KUN FAKTISK NEDETID TÆLLER. Et `planlagt` besøg er ikke nedetid endnu; bilen
 * kører stadig. Tælles det med, står en bil med to dages nedetid i næste uge,
 * og så ser en beslutning om at udskifte den bedre begrundet ud end den er.
 *
 * Vinduet klippes: et besøg der starter før fraMs eller slutter efter tilMs,
 * tæller kun den del der ligger i perioden. Halvåbent [fra, til) som alt andet
 * — ellers tæller et besøg der slutter kl. 16 og et der starter kl. 16 samme
 * millisekund to gange.
 */
export function nedetidMs(besoeg = [], koeretoejId, fraMs, tilMs) {
  if (!(fraMs < tilMs)) return 0;
  let sum = 0;
  for (const b of besoeg) {
    if (!b || b.koeretoejId !== koeretoejId) continue;
    /* Et besøg uden tider er ikke et besøg af nul længde — det er et besøg vi
       ikke kender længden på. Se vb-005, der får sine tider fra en sag. */
    if (b.fra == null || b.til == null) continue;
    if (b.status !== "igang" && b.status !== "udfoert") continue;
    const start = Math.max(b.fra, fraMs);
    const slut = Math.min(b.til, tilMs);
    if (slut > start) sum += slut - start;
  }
  return sum;
}

/** Nedetiden i dage med én decimal — det format tabellen viser. */
export const nedetidDage = (besoeg, koeretoejId, fraMs, tilMs) =>
  nedetidMs(besoeg, koeretoejId, fraMs, tilMs) / 86400000;

/* ---- Ikoner ----------------------------------------------------------- */

/**
 * Ikon pr. art. Ligger HER ved siden af ENHEDSART, ikke i den skærm der først
 * fik brug for det — samme begrundelse som FUNKTION_IKON i personale.js.
 * Flåde, Værkstedskalender og Disponering viser alle en art, og tre skærme med
 * hvert sit ikonsæt driver uden at nogen ser det.
 *
 * Navnene slås op i IKON i ui.jsx.
 *
 * `truck` er en gaffeltruck og har ingen egen glyf — den låner `kasse`, fordi
 * det den gør, er at flytte gods. Hellere et ikon der er lidt for generelt end
 * et der ligner en lastbil: to arter med samme billede er værre end ét
 * upræcist.
 */
export const ART_IKON = {
  traekker: "lastbil",
  lastbil: "lastbil",
  varevogn: "varevogn",
  bus: "bus",
  minibus: "bus",
  scooter: "scooter",
  truck: "kasse",
  trailer: "trailer",
  paahaeng: "trailer",
};

export const ikonForArt = (art) => ART_IKON[art] || "vogn";

/* ---- Validering før skrivning ----------------------------------------- */

/**
 * ⚠ DEN HER SPEJLER firebase.rules.json. Den afgør ingenting.
 *
 * Serveren validerer igen, og hvis de to er uenige, er reglerne rigtige.
 * Formålet er at svare hurtigt og i marginen frem for at sende en skrivning
 * afsted der bliver afvist med "permission-denied" — en fejl brugeren ikke
 * kan handle på.
 *
 * ⚠ SKRIV ALDRIG EN KONTROL HER SOM IKKE OGSÅ STÅR I REGLERNE. Så ville
 * formularen enten love noget serveren afviser, eller — værre — tillade noget
 * serveren skulle have stoppet, og så er den en pæn knap.
 *
 * Grænserne står som konstanter, så de kan sammenlignes med regelfilen af et
 * menneske der læser begge dele.
 */
export const GRAENSE = {
  kaldenavn: 60,
  navn: 120,
  registrering: 20,
  hjemsted: 60,
  tachografNr: 40,
  afgangAarsag: 200,
};

const tal = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/** Kræver en ikke-tom streng inden for længden. */
function tekstFejl(v, maks, navn) {
  if (typeof v !== "string" || !v.trim()) return `${navn} skal udfyldes.`;
  if (v.length > maks) return `${navn} må højst være ${maks} tegn.`;
  return null;
}

function talFejl(v, { min = 0, kraevet = false, navn, heltal = false }) {
  if (v === null) return kraevet ? `${navn} skal udfyldes.` : null;
  if (!Number.isFinite(v)) return `${navn} skal være et tal.`;
  if (v < min) return `${navn} kan ikke være under ${min}.`;
  if (heltal && !Number.isInteger(v)) return `${navn} skal være et helt tal.`;
  return null;
}

/**
 * valideKoeretoej(post) → { [felt]: tekst }. Tom = i orden.
 *
 * `post` er formularens råtekst; tal må gerne komme som strenge.
 */
export function valideKoeretoej(post = {}) {
  const f = {};

  if (!ENHEDSART[post.art]) f.art = "Vælg en art.";
  if (!KOERETOEJ_STATUS[post.status]) f.status = "Vælg en status.";

  f.kaldenavn = tekstFejl(post.kaldenavn, GRAENSE.kaldenavn, "Kaldenavn");
  f.navn = tekstFejl(post.navn, GRAENSE.navn, "Model");
  /* ⚠ NUMMERPLADEN ER DEN MAN SLÅR OP PÅ. Bil 104 havde to i prototypen. */
  f.registrering = tekstFejl(post.registrering, GRAENSE.registrering, "Registreringsnummer");
  f.hjemsted = tekstFejl(post.hjemsted, GRAENSE.hjemsted, "Hjemsted");

  /* Længden er millimeter som integer — færgetakster har grænser ved 10 og
     20 m, og 9,998 mod 10,002 afgør prisen. Beslutning 2's disciplin. */
  f.laengdeMm = talFejl(tal(post.laengdeMm), { min: 1, kraevet: true, navn: "Længde", heltal: true });
  f.driftPrKmOere = talFejl(tal(post.driftPrKmOere), { kraevet: true, navn: "Driftsomkostning", heltal: true });

  /* ⚠ ARTEN STYRER SKEMAET. Et felt der ikke findes på arten, valideres
     ikke — og det sendes heller ikke. En trailer har ingen kilometerstand. */
  if (harFelt(post.art, FELT.kmStand)) {
    f.kmStand = talFejl(tal(post.kmStand), { kraevet: true, navn: "Kilometerstand", heltal: true });
    f.naesteServiceKm = talFejl(tal(post.naesteServiceKm), { navn: "Service ved", heltal: true });
    const km = tal(post.kmStand);
    const svc = tal(post.naesteServiceKm);
    /* Ikke en regel på serveren — den kan ikke se de to felter mod hinanden
       uden en .validate på forældrenoden. Her er den en hjælp, ikke en
       spærring, og teksten siger det. */
    if (!f.kmStand && !f.naesteServiceKm && km !== null && svc !== null && svc < km) {
      f.naesteServiceKm = "Servicemålet ligger bag kilometerstanden — er tallet rigtigt?";
    }
  }
  if (harFelt(post.art, FELT.saeder)) {
    f.saeder = talFejl(tal(post.saeder), { kraevet: true, navn: "Sæder", heltal: true });
  }
  if (harFelt(post.art, FELT.tachografNr) && post.tachografNr) {
    if (String(post.tachografNr).length > GRAENSE.tachografNr) {
      f.tachografNr = `Tachografnummer må højst være ${GRAENSE.tachografNr} tegn.`;
    }
  }
  if (harFelt(post.art, FELT.kranTonmeter)) {
    f.kranTonmeter = talFejl(tal(post.kranTonmeter), { navn: "Kran (tonmeter)" });
  }

  /* ⚠ AFGANG SLETTER IKKE, men den kræver en årsag. En bil der bare
     forsvandt ud af drift, kan ingen forklare et halvt år senere. */
  const erAfgaaet = post.status === "solgt" || post.status === "skrottet";
  if (erAfgaaet) {
    f.afgangAarsag = tekstFejl(post.afgangAarsag, GRAENSE.afgangAarsag, "Årsag til afgang");
  }

  /* ⚠ DIVISION ER FORBUDT PÅ ET KØRETØJ (beslutning 19). Reglerne afviser
     feltet med .validate: false. Står det i formularen, er det en fejl i
     koden — ikke noget brugeren har gjort. */
  if (post.division !== undefined && post.division !== null) {
    f.division = "Et køretøj har ingen division. Feltet må ikke sendes.";
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/**
 * Formularens felter → posten der skrives.
 *
 * ⚠ FELTER ARTEN IKKE HAR, SENDES IKKE. Et tomt felt på en trailer ville
 * blive gemt som null og derefter vist som "—" i en tabel, og et "—" ligner
 * en mangel nogen bør udfylde. Rækken skal udelades helt.
 */
export function byggKoeretoej(post) {
  const ud = {
    art: post.art,
    status: post.status,
    kaldenavn: post.kaldenavn.trim(),
    navn: post.navn.trim(),
    registrering: post.registrering.trim(),
    hjemsted: post.hjemsted.trim(),
    laengdeMm: Number(post.laengdeMm),
    driftPrKmOere: Number(post.driftPrKmOere),
    securityLevel: post.securityLevel || "normal",
  };

  if (harFelt(post.art, FELT.kmStand)) {
    ud.kmStand = Number(post.kmStand);
    if (tal(post.naesteServiceKm) !== null) ud.naesteServiceKm = Number(post.naesteServiceKm);
  }
  if (harFelt(post.art, FELT.saeder)) ud.saeder = Number(post.saeder);
  if (harFelt(post.art, FELT.tachografNr) && post.tachografNr) {
    ud.tachografNr = String(post.tachografNr).trim();
  }
  if (harFelt(post.art, FELT.kranTonmeter) && tal(post.kranTonmeter) !== null) {
    ud.kranTonmeter = Number(post.kranTonmeter);
  }
  if (harFelt(post.art, FELT.kapacitet)) {
    ud.kapacitet = { m3: Number(post.kapacitetM3) || 0, kg: Number(post.kapacitetKg) || 0 };
  }
  if (Number.isFinite(tal(post.naesteServiceMs))) ud.naesteServiceMs = Number(post.naesteServiceMs);
  if (Number.isFinite(tal(post.synMs))) ud.synMs = Number(post.synMs);

  if (post.status === "solgt" || post.status === "skrottet") {
    ud.afgangMs = Number(post.afgangMs) || Date.now();
    ud.afgangAarsag = post.afgangAarsag.trim();
  }

  /* ⚠ ALDRIG division. Se valideKoeretoej(). */
  return ud;
}
