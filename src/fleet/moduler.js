/* src/fleet/moduler.js
 * Hvilke moduler en kunde har købt.
 *
 * INGEN IMPORTS — som permissions.js og steder.js. Både klienten, reglerne
 * (gennem provisioneren) og en fremtidig udbyderkonsol skal bruge samme
 * katalog, og en delt fil med imports kan ikke kopieres ind i functions/.
 *
 * ---------------------------------------------------------------------------
 * ⚠ MODULAFKRYDSNING ER EN KOMMERCIEL KONTROL, IKKE EN SIKKERHEDSKONTROL.
 *
 * Det er værd at holde adskilt, fordi de to bliver blandet sammen og så
 * tror man at det ene løser det andet.
 *
 * En kunde der ikke har købt Facility og taster /facility, ser SIN EGEN tomme
 * facility-node. Det er en salgsflade, ikke et databrud. At kunder ikke kan nå
 * HINANDENS data er en helt anden mekanisme: `auth.token.tenant === $tenantId`
 * i hver eneste regel, prøvet på hver node i begge retninger
 * (test/rules.tenant.test.mjs, punkt 1 i den låste rækkefølge).
 *
 * Slutstillingen er begge dele — en kontrol der kun findes i frontend, er en
 * pæn knap — men modulspærringen i reglerne haster ikke på samme måde, og den
 * må ikke bruges som argument for at isolationen er i orden.
 * ---------------------------------------------------------------------------
 *
 * ⚠ DASHBOARD OG OPSÆTNING KAN IKKE FRAVÆLGES. Et system uden forside er
 * ikke et system, og en kunde der har fravalgt Opsætning kan ikke se sine
 * egne brugere. De står derfor som `altid: true` og kan ikke slås fra —
 * hverken her eller i konsollen.
 */

export const MODUL = {
  dashboard: {
    navKey: "dashboard",
    label: "Dashboard",
    hvad: "Forsiden med nøgletal og det der kræver handling.",
    altid: true,
  },
  booking: {
    navKey: "booking",
    label: "Booking & Opgaver",
    hvad: "Forespørgsler, forslag, disponering og ruteoverblik.",
  },
  bemanding: {
    navKey: "bemanding",
    label: "Bemanding",
    hvad: "Vagtplan, medarbejdere, kompetencer og fravær.",
  },
  flaade: {
    navKey: "flaade",
    label: "Flåde",
    hvad: "Køretøjer, værkstedskalender og indberetninger.",
  },
  facility: {
    navKey: "facility",
    label: "Facility",
    hvad: "Bygninger, anlæg, klima og servicekalender.",
  },
  indkoeb: {
    navKey: "indkoeb",
    label: "Indkøb",
    hvad: "Indkøb, fakturaafstemning og leverandører.",
  },
  kunder: {
    navKey: "kunder",
    label: "Kunder & Priser",
    hvad: "Kundekartotek, aftaler, prisgrupper og tilbud.",
  },
  oekonomi: {
    navKey: "oekonomi",
    label: "Økonomi & Rapporter",
    hvad: "Driftsomkostninger, budget, dækningsgrad og fakturagrundlag.",
  },
  support: {
    navKey: "support",
    label: "Support",
    hvad: "Hjælp og sager med FleetControl.",
    altid: true,
  },
  opsaetning: {
    navKey: "opsaetning",
    label: "Opsætning",
    hvad: "Virksomhed, brugere og roller.",
    altid: true,
  },
};

export const ALLE_MODULER = Object.keys(MODUL);

/** De moduler en kunde kan vælge til og fra. */
export const VALGFRIE_MODULER = ALLE_MODULER.filter((m) => !MODUL[m].altid);

/** De moduler enhver kunde altid har. */
export const OBLIGATORISKE_MODULER = ALLE_MODULER.filter((m) => MODUL[m].altid);

/**
 * Har tenanten det her modul?
 *
 * ⚠ FEJLER ÅBENT, OG DET ER MED VILJE — modsat permissions.js, som fejler
 * lukket. Forskellen er hvad en manglende oplysning betyder:
 *
 *   En manglende PERMISSION betyder "du må ikke". Fejler den åbent, giver
 *   man adgang til noget nogen skulle have stoppet.
 *   En manglende MODULLISTE betyder "vi ved ikke hvad kunden har købt" —
 *   typisk fordi noden ikke er skrevet endnu. Fejler den lukket, står en
 *   betalende kunde med en tom sidebar og tror systemet er væk.
 *
 * Det er derfor det ikke er en sikkerhedskontrol: den forkerte fejlretning
 * er en salgsflade, ikke et databrud.
 */
export function harModul(moduler, modul) {
  if (MODUL[modul]?.altid) return true;
  if (!moduler) return true;
  return moduler[modul] === true;
}

/** Modulsættet til en ny kunde: de obligatoriske plus de valgte. */
export function modulsaet(valgte = []) {
  const ud = {};
  for (const m of OBLIGATORISKE_MODULER) ud[m] = true;
  for (const m of valgte) {
    if (MODUL[m]) ud[m] = true;
  }
  return ud;
}

/** Navnene på de moduler der IKKE findes i kataloget. Til validering. */
export const ukendteModuler = (valgte = []) => valgte.filter((m) => !MODUL[m]);
