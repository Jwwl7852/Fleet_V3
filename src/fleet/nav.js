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
    key: "booking", sti: "/booking", label: "Planning",
    titel: "Planning",
    under: "Fra forespørgsel til udført arbejde, dokumentation og fakturering.",
    born: [
      { key: "bookingOversigt", sti: "/booking", label: "Alle opgaver",
        titel: "Planning", under: "Fra forespørgsel til udført arbejde, dokumentation og fakturering." },
      { key: "nyForespoergsel", sti: "/booking/ny", label: "Ny forespørgsel",
        titel: "Planning – ny transportforespørgsel", under: "Case-håndterer indsender forespørgsel til planlægning." },
      { key: "forslag", sti: "/booking/forslag/:id", label: "Forslag & reservation", skjulINav: true,
        titel: "Planning – forslag & reservation", under: "Disponent har udarbejdet forslag. Koordinator godkender." },
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
    key: "bemanding", sti: "/bemanding", label: "Workforce", titel: "Workforce",
    under: "Overblik over bemanding og kapacitet",
    born: [
      { key: "bemandingPlan", sti: "/bemanding", label: "Bemandingsplan",
        titel: "Workforce", under: "Overblik over bemanding og kapacitet" },
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
    /* ⚠ FLEET ER DE TO DRIFTSSKÆRME — ENHEDER LIGGER UNDER OPSÆTNING.
       Menuen skal kun vise det personalet ARBEJDER i. Enhedskartoteket er
       stamdata: en bil oprettes én gang og røres sjældent igen, mens
       disponenten er i Driftskalenderen hver dag. Stod de side om side, lå
       den daglige skærm nummer to i en menu hvor nummer ét knap bruges.
       Se `enheder` under opsaetning — modulnøglen `flaade`, noden
       `koeretoejer` og permissionen `koeretoejer.laes` er UÆNDREDE. Det er
       kun MENUPLADSEN der flyttede.

       ⚠ skjulFirma/skjulPeriode ejes af shellen, også når kontrollerne skal
       væk. Et modul der skjulte dem selv, skulle tegne sin egen topbar for
       at gøre det — og så ville det eje en af de tre ting shellen ejer. */
    key: "flaade", sti: "/flaade", label: "Fleet", titel: "Fleet",
    under: "Driftskalender og indberetninger",
    skjulFirma: true, skjulPeriode: true,
    born: [
      { /* Beslutning 22's moenster igen: skaermen skifter navn, RUTEN goer ikke.
           Driftskalenderen er nu Fleets FORSIDE og ligger paa /flaade, hvor
           Enheder laa. /flaade/vaerksted lever videre som redirect (se
           REDIRECTS), saa bogmaerker og links ikke doer af en flytning —
           praecis som da Live-kort blev til Rute & status. */
        key: "vaerksted", sti: "/flaade", label: "Driftskalender",
        titel: "Fleet – driftskalender",
        under: "Planlæg, følg op og håndtér driftsopgaver på tværs af enheder og værksteder." },
      { key: "indberetninger", sti: "/flaade/indberetninger", label: "Indberetninger",
        titel: "Indberetninger", under: "Reparation, skade, brændstof og fejl" },
      /* ⚠ skjulINav: KØEN ER ET MÅL, IKKE ET MENUPUNKT. Man kommer hertil fra
         en af Driftskalenderens fem kasser — enten i samme vindue eller i et
         nyt — og udsnittet staar i ?vis=. Et menupunkt uden det ville aabne
         "nye" for alle, uanset hvad man kiggede paa, og saa ville de fem tal
         og listen kunne vaere uenige uden at nogen kunne se hvorfor.
         Ruten SKAL findes: "Aabn i nyt vindue" er et rigtigt browservindue,
         og et nyt vindue arver ingen React-tilstand. */
      { key: "arbejdskoe", sti: "/flaade/koe", label: "Arbejdskø", skjulINav: true,
        titel: "Fleet – arbejdskø",
        under: "Én samlet kø for alle hændelser. Filtrér og prioritér." },
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
    key: "indkoeb", sti: "/indkoeb", label: "Procure", titel: "Procure & vareforbrug",
    under: "Registrér indkøb og tilknyt fakturaer og rapportering.",
    born: [
      { key: "indkoebOversigt", sti: "/indkoeb", label: "Procure & vareforbrug",
        titel: "Procure & vareforbrug", under: "Registrér indkøb og tilknyt fakturaer og rapportering." },
      { key: "fakturaer", sti: "/indkoeb/fakturaer", label: "Fakturaer & afstemning",
        titel: "Fakturagodkendelse & afstemning",
        under: "Indkøb matches med leverandørfakturaer, godkendes og afstemmes mod regnskabsgrundlaget." },
      { key: "leverandoerer", sti: "/indkoeb/leverandoerer", label: "Leverandører",
        titel: "Leverandører", under: "Performance, aftaler og priser" },
    ],
  },
  {
    key: "unitbooking", sti: "/unitbooking", label: "Unitbooking", titel: "Unitbooking",
    under: "Transportkasser, reolpladser og udlån",
    born: [
      { key: "unitbookingKasser", sti: "/unitbooking", label: "Kasser",
        titel: "Unitbooking – kasser", under: "Transportkasser, type, status og plads" },
      { key: "unitbookingKalender", sti: "/unitbooking/kalender", label: "Kalender",
        titel: "Unitbooking – kalender",
        under: "Kasser × dage, og listen over hvad der skal ud og hjem" },
      { key: "kasseudlaan", sti: "/unitbooking/udlaan", label: "Udlån",
        titel: "Unitbooking – udlån",
        under: "Søg ledige i periode, reservér, klargør, udlevér og modtag retur" },
      { key: "unitbookingHistorik", sti: "/unitbooking/historik", label: "Historik",
        titel: "Unitbooking – historik",
        under: "Hvor har kassen været, og hvilke kasser var med på sagen" },
      { key: "reolpladser", sti: "/unitbooking/reolpladser", label: "Reolpladser",
        titel: "Unitbooking – reolpladser & kassetyper",
        under: "Hal, reol, fag, hylde og plads. Navnet udledes af felterne." },
    ],
  },
  {
    key: "warehouse", sti: "/warehouse", label: "Warehouse", titel: "Warehouse",
    under: "Lagerhotel: kundens varer, lokationer og bevægelser",
    born: [
      { key: "warehouseVarer", sti: "/warehouse", label: "Varer",
        titel: "Warehouse – varer", under: "Kundens varekartotek, enheder og sporing" },
      { key: "warehousePluk", sti: "/warehouse/pluk", label: "Pluk & afsend",
        titel: "Warehouse – pluk & afsend",
        under: "Plukordrer, fremdrift og afsendelse" },
      { key: "warehouseBevaegelser", sti: "/warehouse/bevaegelser", label: "Bevægelser",
        titel: "Warehouse – bevægelser",
        under: "Modtag, sæt på plads, flyt, pluk og afsend" },
      { key: "warehouseOptaelling", sti: "/warehouse/optaelling", label: "Optælling",
        titel: "Warehouse – optælling",
        under: "Cycle count, afvigelser og lagernøjagtighed" },
      /* ⚠ CARRIER-OVERBLIK, IKKE "OVERBLIK". Planchen "Overblik" i
         WAREHOUSE.md punkt 1 er en ANDEN flade — aktive lokationer,
         varelinjer, aabne modtagelser, opgavekoe — og den er ikke bygget.
         Den her viser BEHOLDERE. To skaerme, ikke to navne til een. */
      /* ⚠ MODTAGELSE, IKKE "VAREMODTAGELSE". Planche 3 i punkt 1 hedder
         "Varemodtagelse & putaway" og handler om PO'er og kvalitetskontrol —
         den er ikke bygget. Den her er transit & placering: beholderen kommer
         ind og skal staa et sted. */
      { key: "warehouseModtagelse", sti: "/warehouse/modtagelse", label: "Modtagelse",
        titel: "Warehouse – transit & placering",
        under: "Beholdere der venter paa en plads — og hvor de skal staa" },
      { key: "warehouseCarriers", sti: "/warehouse/carriers", label: "Beholdere",
        titel: "Warehouse – beholdere",
        under: "Carriers: indhold, placering og hvad der mangler at komme paa plads" },
      /* ⚠ AFREGNING, IKKE FAKTURERING. Skaermen viser hvad lageret KAN
         faktureres for; godkendelsen hoerer eet sted, i Indkoeb → Fakturaer
         (beslutning 12). To godkendelsesflows er den fejl beslutningen
         lukkede. */
      { key: "warehouseAfregning", sti: "/warehouse/afregning", label: "Afregning",
        titel: "Warehouse – afregning",
        under: "Hvad lageret kan faktureres for i perioden, pr. kunde" },
      /* ⚠ SPORBARHED, IKKE "Sporbarhed & optaelling". Planchen hedder det
         sidste, men optaellingen ER sin egen skaerm — to navne til det samme
         ville vaere sjette gang det moenster dukker op. */
      /* ⚠ VOLUMEN, IKKE "Tilbud". Skaermen REGNER et tal; den opretter
         ikke et tilbud — nodeformen er ikke besluttet, og et navn der lovede
         et tilbud, ville love noget platformen ikke kan. Se DEMO_TILBUD. */
      { key: "warehouseVolumen", sti: "/warehouse/volumen", label: "Volumen",
        titel: "Warehouse – volumenkalkulator",
        under: "Paller, m3 eller m2 til en maanedspris. Et estimat, ikke et tilbud" },
      { key: "warehouseSporbarhed", sti: "/warehouse/sporbarhed", label: "Sporbarhed",
        titel: "Warehouse – sporbarhed",
        under: "Hvor er partiet nu, og hvor har det vaeret" },
      { key: "warehouseLokationer", sti: "/warehouse/lokationer", label: "Lokationer",
        titel: "Warehouse – lokationer",
        under: "Zoner, hylder, belægning og status. Deles med Unitbooking." },
    ],
  },
  {
    key: "kunder", sti: "/kunder", label: "Kunder & Priser", titel: "Kunder & Priser",
    under: "Overblik over kunder, aftaler og priser",
    born: [
      { key: "kunderOversigt", sti: "/kunder", label: "Kunder",
        titel: "Kunder & Priser", under: "Overblik over kunder, aftaler og priser" },
      /* ⚠ ALLE PRISER SAMLES HER. Plancherne til Warehouse har en egen
         "Rater"-skaerm; den bygges ikke. Et andet sted at saette den samme
         slags pris ville betyde at en vognmand skulle vedligeholde sine
         priser to steder. Se PRISER.md. */
      { key: "standardpriser", sti: "/kunder/priser", label: "Standardpriser",
        titel: "Standardpriser",
        under: "Priser for alle platformens ydelser. Afvigelser saettes paa kunden." },
      /* ⚠ TO LAG, IKKE TRE. Standardprisen gaelder alle; her saettes den
         enkelte kundes afvigelse — enten en egen pris eller en rabat.
         Prisgruppen baerer ikke laengere en pris. Se PRISER.md punkt 4.1. */
      { key: "kundepriser", sti: "/kunder/aftalepriser", label: "Kundepriser",
        titel: "Kundepriser",
        under: "Den enkelte kundes egen pris eller rabat. Standarden bliver staaende." },
      { key: "kundepriserEn", sti: "/kunder/aftalepriser/:kundeId", label: "Kundepriser",
        skjulINav: true, titel: "Kundepriser",
        under: "Den enkelte kundes egen pris eller rabat. Standarden bliver staaende." },
    ],
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
      /* ⚠ ENHEDER HØRER I OPSÆTNING, MEN NODEN ER FLEETS.
         `koeretoejer` er modulspærret på `flaade` i firebase.rules.json —
         både .read og .write. Opsætning er `altid: true` og kan ikke
         fravælges, så uden `kraeverModul` ville en kunde UDEN Fleet få et
         menupunkt der åbner en afvist læsning i sin egen opsætning. En
         permission-denied er reglerne der VIRKER; den skal bare ikke
         fremprovokeres af en menu vi selv har tegnet.

         RUTEN findes uanset: taster han /opsaetning/enheder alligevel, får
         han <Datatilstand> og ikke en hvid skærm. Menuen er en KOMMERCIEL
         kontrol, reglerne er sikkerhedskontrollen — se moduler.js. */
      { key: "enheder", sti: "/opsaetning/enheder", label: "Enheder",
        kraeverModul: "flaade",
        titel: "Enheder", under: "Stamdata for flåden. Arten styrer feltskemaet." },
      { key: "brugere", sti: "/opsaetning/brugere", label: "Brugere & roller",
        titel: "Brugere & roller",
        under: "Logins, adgang og tenant-tilknytning. Medarbejdere uden login oprettes under Workforce → Medarbejdere." },
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
  /* Driftskalenderen flyttede op paa /flaade, da Enheder gik til Opsaetning.
     Stien har staaet i sidebaren siden v3.0 og ligger i mindst een supportsags
     kontekst (demo-sag.js) — den doer ikke af en menuomlaegning. */
  { fra: "/flaade/vaerksted", til: "/flaade" },
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
