/* src/fleet/nav.js
 * ÉN informationsarkitektur. Én kilde til sidebar OG ruter.
 *
 * BESLUTNING (v3.0): flad sidebar med undermenuer. Ingen topfaner.
 * Designsættet havde tre konkurrerende navigationsmodeller — v1.4's
 * grupperede sidebar, v2.0's flade, og en variant med otte topfaner
 * ovenpå. Topfanerne overlappede sidebaren (Service/Værkstedskalender,
 * Lastbiler/Fleet Management, Booking/Booking), så de er væk.
 *
 * `legacy` bevarer de stier der findes deployet i dag, som redirects.
 */

export const NAV = [
  {
    key: "dashboard", sti: "/", label: "Dashboard", titel: "Dashboard",
    under: "Operativt overblik og økonomi",
  },
  {
    key: "booking", sti: "/booking", label: "Booking & Opgaver",
    titel: "Booking & Opgaver",
    under: "Fra forespørgsel til udført arbejde, dokumentation og fakturering.",
    born: [
      { key: "bookingOversigt", sti: "/booking", label: "Alle opgaver",
        titel: "Booking & Opgaver", under: "Fra forespørgsel til udført arbejde, dokumentation og fakturering." },
      { key: "nyForespoergsel", sti: "/booking/ny", label: "Ny forespørgsel",
        titel: "Booking – ny transportforespørgsel", under: "Case-håndterer indsender forespørgsel til planlægning." },
      { key: "forslag", sti: "/booking/forslag/:id", label: "Forslag & reservation", skjulINav: true,
        titel: "Booking – forslag & reservation", under: "Disponent har udarbejdet forslag. Koordinator godkender." },
      { key: "disponering", sti: "/booking/disponering", label: "Disponering",
        titel: "Disponering", under: "Planlæg og disponér opgaver på biler og chauffører" },
      { /* Beslutning 22: skaermen hed Live-kort, og navnet lovede en sporing der
           ikke findes. RUTEN er uaendret, saa /tracking-redirecten og alle
           eksisterende links overlever. */
        key: "livekort", sti: "/booking/live-kort", label: "Rute & status",
        titel: "Rute & status", under: "Planlagt rute og chaufførens meldinger — ingen GPS" },
      { key: "bookingopsaetning", sti: "/booking/opsaetning", label: "Bookingopsætning",
        titel: "Bookingopsætning", under: "Vedligehold standardomkostninger og automatiske regelsæt til brug i bookinger." },
    ],
  },
  {
    key: "bemanding", sti: "/bemanding", label: "Bemanding", titel: "Bemanding",
    under: "Overblik over bemanding og kapacitet",
    born: [
      { key: "bemandingPlan", sti: "/bemanding", label: "Bemandingsplan",
        titel: "Bemanding", under: "Overblik over bemanding og kapacitet" },
      /* Medarbejdere er IKKE det samme som Brugere & roller under Opsætning.
         Her oprettes personen; dér oprettes et login. En chauffør har måske
         aldrig et login, en vikar sjældent. Se beslutning 18. */
      { key: "medarbejdere", sti: "/bemanding/medarbejdere", label: "Medarbejdere",
        titel: "Medarbejdere", under: "Opret og vedligehold personalet. Login oprettes under Opsætning → Brugere & roller." },
      { key: "kompetencer", sti: "/bemanding/kompetencer", label: "Kompetencer",
        titel: "Kompetencer & certifikater", under: "Gyldighed, udløb og påmindelser" },
      { key: "fravaer", sti: "/bemanding/fravaer", label: "Ferie & fravær",
        titel: "Ferie & fravær", under: "Fravær blokerer chaufføren i disponeringen" },
    ],
  },
  {
    key: "flaade", sti: "/flaade", label: "Flåde", titel: "Flåde",
    under: "Overblik over køretøjer, drift og økonomi",
    born: [
      { key: "flaadeOversigt", sti: "/flaade", label: "Køretøjer",
        titel: "Flåde", under: "Overblik over køretøjer, drift og økonomi" },
      { key: "vaerksted", sti: "/flaade/vaerksted", label: "Værkstedskalender",
        titel: "Flåde – service, reservationer & fakturaer",
        under: "Værkstedsaktiviteter, bookingintegration og fakturalink." },
      { key: "indberetninger", sti: "/flaade/indberetninger", label: "Indberetninger",
        titel: "Indberetninger", under: "Reparation, skade, brændstof og fejl" },
    ],
  },
  {
    key: "facility", sti: "/facility", label: "Facility", titel: "Facility – overblik, fejl & klima",
    under: "Registrér fejl, planlæg reparationer, overvåg klima og dokumentér drift.",
    born: [
      { key: "facilityOversigt", sti: "/facility", label: "Overblik & fejl",
        titel: "Facility – overblik, fejl & klima",
        under: "Registrér fejl, planlæg reparationer, overvåg klima og dokumentér drift." },
      { key: "servicekalender", sti: "/facility/servicekalender", label: "Servicekalender",
        titel: "Facility – servicekalender & reparationer",
        under: "Planlæg reparationer, koordinér eksterne firmaer og reservér tid." },
      { key: "klima", sti: "/facility/klima", label: "Klima & energi",
        titel: "Facility – klimaovervågning & energistatistik",
        under: "Overvåg temperatur, fugt og energiforbrug — dokumentér stabile forhold." },
    ],
  },
  {
    key: "indkoeb", sti: "/indkoeb", label: "Indkøb", titel: "Indkøb & vareforbrug",
    under: "Registrér indkøb og tilknyt fakturaer og rapportering.",
    born: [
      { key: "indkoebOversigt", sti: "/indkoeb", label: "Indkøb & vareforbrug",
        titel: "Indkøb & vareforbrug", under: "Registrér indkøb og tilknyt fakturaer og rapportering." },
      { key: "fakturaer", sti: "/indkoeb/fakturaer", label: "Fakturaer & afstemning",
        titel: "Fakturagodkendelse & afstemning",
        under: "Indkøb matches med leverandørfakturaer, godkendes og afstemmes mod regnskabsgrundlaget." },
      { key: "leverandoerer", sti: "/indkoeb/leverandoerer", label: "Leverandører",
        titel: "Leverandører", under: "Performance, aftaler og priser" },
    ],
  },
  {
    key: "warehouse", sti: "/warehouse", label: "Warehouse", titel: "Warehouse",
    under: "Transportkasser, reolpladser og udlån",
    born: [
      { key: "warehouseKasser", sti: "/warehouse", label: "Kasser",
        titel: "Warehouse – kasser", under: "Transportkasser, type, status og plads" },
      { key: "kasseudlaan", sti: "/warehouse/udlaan", label: "Udlån",
        titel: "Warehouse – udlån",
        under: "Søg ledige i periode, reservér, klargør, udlevér og modtag retur" },
      { key: "reolpladser", sti: "/warehouse/reolpladser", label: "Reolpladser",
        titel: "Warehouse – reolpladser & kassetyper",
        under: "Hal, reol, fag, hylde og plads. Navnet udledes af felterne." },
    ],
  },
  {
    key: "kunder", sti: "/kunder", label: "Kunder & Priser", titel: "Kunder & Priser",
    under: "Overblik over kunder, aftaler og priser",
  },
  {
    key: "oekonomi", sti: "/oekonomi", label: "Økonomi & Rapporter",
    titel: "Økonomi & Rapporter",
    under: "Overblik over økonomi, driftsomkostninger og faktureringsgrundlag på tværs af drift og opgaver.",
    born: [
      { key: "oekonomiOversigt", sti: "/oekonomi", label: "Overblik",
        titel: "Økonomi & Rapporter",
        under: "Overblik over økonomi, driftsomkostninger og faktureringsgrundlag på tværs af drift og opgaver." },
      { key: "fakturering", sti: "/oekonomi/fakturering", label: "Fakturering",
        titel: "Fakturering", under: "Opgaver klar til fakturering" },
    ],
  },
  {
    key: "support", sti: "/support", label: "Support", titel: "Hjælp & Support",
    under: "Opret en supportsag og følg den.",
    born: [
      { key: "hjaelp", sti: "/support", label: "Hjælp & Support",
        titel: "Hjælp & Support", under: "Opret en supportsag og følg den." },
      /* Vores egne to. De SKJULES ikke for en kunde — de viser en "din rolle
         har ikke adgang"-tilstand, som Medarbejdere gør. Nav-filtrering på
         permission er en selvstændig ændring. */
      { key: "supportOverblik", sti: "/support/overblik", label: "Supportoverblik",
        titel: "Supportoverblik", under: "Sager på tværs af kunder. Kræver support.laes." },
      { key: "supportSag", sti: "/support/sag/:id", label: "Supportsag", skjulINav: true,
        titel: "Supportsag", under: "Tråd, kontekst, aktivitetsudtræk og supportadgang." },
    ],
  },
  {
    key: "opsaetning", sti: "/opsaetning", label: "Opsætning", titel: "Opsætning",
    under: "Virksomhed, brugere, roller og integrationer",
    born: [
      { key: "generelt", sti: "/opsaetning", label: "Generelt",
        titel: "Opsætning – generelt", under: "Virksomhed, afdelinger og stamdata" },
      { key: "brugere", sti: "/opsaetning/brugere", label: "Brugere & roller",
        titel: "Brugere & roller",
        under: "Logins, adgang og tenant-tilknytning. Medarbejdere uden login oprettes under Bemanding → Medarbejdere." },
      { key: "integrationer", sti: "/opsaetning/integrationer", label: "Integrationer",
        titel: "Integrationer", under: "Kort, brændstofkort, regnskab og løn" },
    ],
  },
];

/** Flad liste over alt der har en rute. */
export const ALLE = NAV.flatMap((m) => (m.born ? m.born : [m]));

/** Gamle stier → nye. Lægges som <Navigate> så v1.4-links overlever. */
export const REDIRECTS = [
  { fra: "/dispatch", til: "/booking/disponering" },
  { fra: "/tracking", til: "/booking/live-kort" },
];

/** Slår modulet op ud fra pathname. Længste match vinder. */
export function findModul(pathname) {
  const kandidater = ALLE.filter((m) => {
    const sti = m.sti.split("/:")[0];
    return pathname === sti || pathname.startsWith(sti + "/");
  }).sort((a, b) => b.sti.length - a.sti.length);
  return kandidater[0] || NAV[0];
}

/** Hvilket hovedmodul er aktivt (til at fremhæve i sidebaren). */
export function findHovedmodul(pathname) {
  const m = findModul(pathname);
  return NAV.find((h) => h.key === m.key || h.born?.some((b) => b.key === m.key)) || NAV[0];
}
