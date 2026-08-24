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
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SKIVE 2A (V1-redesign) — GRUPPEOVERSKRIFTER, IKKE EN NY MEKANISME.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hvert topniveaupunkt bærer nu et `gruppe`-felt (`faelles` | `drift` |
 * `admin` | `hjaelp`). AppShell render'er én overskrift pr. gruppe i
 * `GRUPPE_ORDEN`s rækkefølge, og punkterne INDEN i en gruppe i den
 * rækkefølge de allerede står i `NAV` — grupperingen er et RENDER-lag oven
 * på den eksisterende flade liste, ikke en ny node/permission/regel.
 * `kraeverModul` og `kraeverPerm` er UÆNDREDE mekanismer: de får blot flere
 * punkter at stå på (se `kunderOversigt` og `fakturacenter` nedenfor, som nu
 * er TOPNIVEAUPUNKTER uden `born`, ligesom Dashboard).
 *
 * ⚠ ET TOPNIVEAUPUNKT UDEN BØRN KAN OGSÅ VÆRE SPÆRRET. Før i dag filtrerede
 * AppShell kun BØRN på `kraeverPerm`/`kraeverModul` — et topniveaupunkt uden
 * `born` blev altid tegnet. Det holdt, så længe intet topniveaupunkt bar et
 * af felterne. `kunderOversigt` (kraeverModul) og `fakturacenter`
 * (kraeverPerm) er de to FØRSTE der gør, og AppShell.jsx er derfor udvidet
 * til at spørge om begge felter på ALLE topniveaupunkter — se filens egen
 * kommentar. Uden den udvidelse ville Fakturaer & bilag stå åben for en
 * chauffør, som ikke har `indkoeb.laes` — præcis den eksponering
 * beslutning 105 findes for at forhindre.
 *
 * ⚠ FAKTURAER & BILAG ER EN BEVIDST OVERGANGSTILSTAND. Målplanen
 * (02_TARGET_NAVIGATION.md) erstatter `kraeverPerm: "indkoeb.laes"` med en
 * ny, delt permission-familie (`fakturaer.laes`/`.skriv`/`.godkend`) — det
 * er PERMISSION_MODEL-arbejde og hører til en senere delskive. Skive 2A
 * FLYTTER kun menupunktet; adgangen er UÆNDRET (samme `kraeverPerm`, samme
 * rute `/oekonomi/fakturacenter`), så punktet er hverken bredere eller
 * smallere tilgængeligt end før flytningen.
 *
 * ⚠ RUTERNE ER MED VILJE UÆNDREDE I DENNE SKIVE. Målplanen foreslår nye
 * kanoniske stier (`/kunder`, `/fakturaer`) — de er IKKE indført her.
 * "Kun den strukturelle navigation" betyder at kun HVOR et punkt står i
 * træet flytter, ikke dets URL. Eksisterende links til `/opsaetning/kunder`
 * og `/oekonomi/fakturacenter` virker derfor uændret, uden en ny REDIRECTS-
 * indgang.
 *
 * ⚠ SKIVE 1's HIDE/LATER-BESLUTNINGER RØRES IKKE. `skjulINav: true` på
 * `oekonomiOversigt`, `bemandingPlan`, `klima`, `integrationer`,
 * `supportOverblik` står uændret.
 */

/** Fast rækkefølge for gruppeoverskrifterne i sidebaren. */
export const GRUPPE_ORDEN = ["faelles", "drift", "admin", "hjaelp"];

/** Overskriftstekst pr. gruppe. */
export const GRUPPE_LABEL = {
  faelles: "Fælles",
  drift: "Driftsmoduler",
  admin: "Administration",
  hjaelp: "Hjælp",
};

export const NAV = [
  {
    key: "dashboard", sti: "/", label: "Dashboard", titel: "Dashboard",
    under: "Operativt overblik og økonomi", gruppe: "faelles",
  },
  /* ⚠ KUNDER STOD SOM ET BARN UNDER OPSÆTNING (se historikken i git og i
     04_DATA_AND_PERMISSION_IMPACT.md) — kundekartoteket er stamdata, men
     bruges dagligt på tværs af Planning, Procure og Warehouse, og hørte
     derfor til blandt de fælles arbejdsindgange, ikke gemt i opsætningen.
     `kraeverModul: "kunder"` er UÆNDRET: samme kommercielle gate som før,
     kun menupladsen flyttede. Standardpriser og Kundepriser BLIVER stående
     under Opsætning i denne skive — at flytte dem kræver en fane på
     kundens profil (matrix-# 48), som er en senere MERGE/FINISH-opgave. */
  {
    key: "kunderOversigt", sti: "/opsaetning/kunder", label: "Kunder",
    kraeverModul: "kunder", gruppe: "faelles",
    titel: "Kunder", under: "Kundekartotek og aftaler.",
  },
  /* ⚠ FAKTURAER & BILAG — se filens hoved om overgangstilstanden.
     `kraeverPerm: "indkoeb.laes"` er UÆNDRET fra dengang punktet hed
     "Fakturacenter" og lå under Økonomi & Rapporter. */
  {
    key: "fakturacenter", kraeverPerm: "indkoeb.laes", sti: "/oekonomi/fakturacenter",
    label: "Fakturaer & bilag", gruppe: "faelles",
    titel: "Fakturaer & bilag",
    under: "Ét fælles sted til fakturaer, bilag og match på tværs af Fleet, Facility og Procure.",
  },
  {
    key: "oekonomi", sti: "/oekonomi/fakturering", label: "Økonomi / Fakturagrundlag",
    titel: "Økonomi / Fakturagrundlag", gruppe: "faelles",
    under: "Faktureringsgrundlag på tværs af drift og opgaver — det vi SENDER.",
    born: [
      { key: "oekonomiOversigt", sti: "/oekonomi", label: "Overblik", skjulINav: true,
        titel: "Økonomi & Rapporter",
        under: "Overblik over økonomi, driftsomkostninger og faktureringsgrundlag på tværs af drift og opgaver." },
      /* ⚠ FAKTURACENTERET ER FLYTTET UD — se Fælles > Fakturaer & bilag
         ovenfor. Fakturering er nu ENESTE synlige barn i denne gruppe, og
         bærer derfor det navn gruppen selv går under. */
      { key: "fakturering", kraeverPerm: "grundlag.laes", sti: "/oekonomi/fakturering", label: "Fakturagrundlag",
        titel: "Fakturagrundlag", under: "Opgaver klar til fakturering — det vi SENDER" },
    ],
  },
  {
    key: "booking", sti: "/booking", label: "Planning",
    titel: "Planning", gruppe: "drift",
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
      { key: "bookingopsaetning", kraeverPerm: "satser.laes", sti: "/booking/opsaetning", label: "Bookingopsætning",
        titel: "Bookingopsætning", under: "Vedligehold standardomkostninger og automatiske regelsæt til brug i bookinger." },
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

       ⚠ skjulFirma/skjulPeriode STOD HER OG ER VÆK IGEN. Flagene skjulte
       firma- og periodevælgeren på Fleets skærme; nu er de tre kontroller
       fjernet fra HVER side, og et flag der altid er sandt, er en mekanisme
       uden variation. Se AppShell. */
    key: "flaade", sti: "/flaade", label: "Fleet", titel: "Fleet",
    under: "Driftskalender og indberetninger", gruppe: "drift",
    /* ⚠ HER STOD `udenDivision: true` — flaget der slog Gods/Bus-vaelgeren fra
       for netop dette modul, fordi beslutning 19 forbyder division paa
       `personale/` og `koeretoejer/`, og knappen derfor ville skifte en
       tilstand ingen af skaermene laeser.

       Argumentet var rigtigt og gjaldt bredere end nogen saa: naar aksen ikke
       kunne baere Fleets egne skaerme, var den heller ikke den akse kunden
       arbejder paa. Den er fjernet helt i beslutning 70, og flaget har dermed
       intet at slaa fra. Undtagelsen var det foerste sted maskineriet gav
       efter — den slags er vaerd at laegge maerke til, foer man bygger flere
       undtagelser. */
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
    gruppe: "drift",
    born: [
      { key: "facilityOversigt", sti: "/facility", label: "Overblik & fejl",
        titel: "Facility – overblik, fejl & klima",
        under: "Registrér fejl, planlæg reparationer, overvåg klima og dokumentér drift." },
      { key: "servicekalender", sti: "/facility/servicekalender", label: "Servicekalender",
        titel: "Facility – servicekalender & reparationer",
        under: "Planlæg reparationer, koordinér eksterne firmaer og reservér tid." },
      { key: "klima", sti: "/facility/klima", label: "Klima & energi", skjulINav: true,
        titel: "Facility – klimaovervågning & energistatistik",
        under: "Overvåg temperatur, fugt og energiforbrug — dokumentér stabile forhold." },
    ],
  },
  {
    key: "indkoeb", sti: "/indkoeb", label: "Procure", titel: "Procure & vareforbrug",
    under: "Registrér indkøb og tilknyt fakturaer og rapportering.", gruppe: "drift",
    born: [
      { key: "indkoebOversigt", kraeverPerm: "indkoeb.laes", sti: "/indkoeb", label: "Procure & vareforbrug",
        titel: "Procure & vareforbrug", under: "Registrér indkøb og tilknyt fakturaer og rapportering." },
      /* ⚠ TRIN 1 AF FEM, og den staar foerst efter overblikket — som paa
         planche 5. Raekkefoelgen i menuen ER processen: behov, bestilling,
         godkendelse, faktura. En menu der er sorteret efter hvad der blev
         bygget foerst, laerer ingen hvordan det haenger sammen.
         Se beslutning 78. */
      { key: "indkoebsbehov", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/behov", label: "Indkøbsbehov",
        titel: "Indmeldte behov",
        under: "Behov indsendt fra snedkeri, lager, kontor eller som kontantkøb." },
      /* ⚠ TRIN 2. Raekkefoelgen i menuen ER processen — se noten ovenfor. */
      { key: "bestillinger", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/bestillinger", label: "Bestillinger",
        titel: "Bestillingskladder & leverandørforslag",
        under: "Åbne behov med automatisk leverandørforslag, samlet i én bestilling pr. leverandør." },
      /* ⚠ TRIN 3. Raekkefoelgen i menuen ER processen — se noten ovenfor. */
      { key: "godkendelser", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/godkendelser", label: "Godkendelse af indkøb",
        titel: "Godkendelse af indkøb",
        under: "Godkend indkøb, der kræver din godkendelse — og sæt virksomhedens beløbsgrænse." },
      { key: "fakturaer", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/fakturaer", label: "Fakturaer, match & kontantkøb",
        titel: "Fakturaer, match & kontantkøb",
        under: "Match fakturaer mod bestillinger, godkend dem — eller registrér et kontant køb." },
      { key: "leverandoerer", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/leverandoerer", label: "Leverandører",
        titel: "Leverandører", under: "Performance, aftaler og priser" },
      /* ⚠ VORES EGNE FORBRUGSVARER — ikke Warehouses gods, som er KUNDENS.
         Fjerde gang et lagernavn skal skilles fra et andet i den her base;
         se forbrugsvarer.js og beslutning 85. */
      { key: "varelager", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/varelager", label: "Varelager",
        titel: "Varelager — vores egne forbrugsvarer",
        under: "Beholdning, minimum og bevægelser. Et lavt lager bliver til et indkøbsbehov." },
    ],
  },
  {
    key: "warehouse", sti: "/warehouse", label: "Warehouse", titel: "Warehouse",
    under: "Lagerhotel: kundens varer, lokationer og bevægelser", gruppe: "drift",
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
      /* ⚠ LABELEN ER IKKE EN NODE. Typen udledes af etapekaeden, felterne
         slaas op, og intet gemmes — et gemt maerkat ville drive fra sin
         booking foerste gang nogen rettede et slutmaal. */
      { key: "warehouseLabels", sti: "/warehouse/labels", label: "Transportlabels",
        titel: "Warehouse – transportlabels",
        under: "De tre transporttyper, og hvad der mangler før godset kan mærkes" },
      /* ⚠ AFREGNING, IKKE FAKTURERING. Skaermen viser hvad lageret KAN
         faktureres for; godkendelsen hoerer eet sted, i Indkoeb → Fakturaer
         (beslutning 12). To godkendelsesflows er den fejl beslutningen
         lukkede. */
      { key: "warehouseAfregning", kraeverPerm: "satser.laes", sti: "/warehouse/afregning", label: "Afregning",
        titel: "Warehouse – afregning",
        under: "Hvad lageret kan faktureres for i perioden, pr. kunde" },
      /* ⚠ SPORBARHED, IKKE "Sporbarhed & optaelling". Planchen hedder det
         sidste, men optaellingen ER sin egen skaerm — to navne til det samme
         ville vaere sjette gang det moenster dukker op. */
      /* ⚠ VOLUMEN, IKKE "Tilbud". Skaermen REGNER et tal; den opretter
         ikke et tilbud — nodeformen er ikke besluttet, og et navn der lovede
         et tilbud, ville love noget platformen ikke kan. Se DEMO_TILBUD. */
      { key: "warehouseVolumen", kraeverPerm: "satser.laes", sti: "/warehouse/volumen", label: "Volumen",
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
    key: "unitbooking", sti: "/unitbooking", label: "Unitbooking", titel: "Unitbooking",
    under: "Transportkasser, reolpladser og udlån", gruppe: "drift",
    born: [
      /* ⚠ KASSELISTEN ER FLYTTET TIL OPSAETNING (planche 1, UNITBOOKING.md
         6.1). Kalenderen er nu modulets FORSIDE og ligger paa /unitbooking,
         hvor Kasser laa — samme snit som da Driftskalenderen overtog /flaade,
         da Enheder gik til Opsaetning. /unitbooking/kalender lever videre som
         redirect, saa et bogmaerke ikke doer af en menuomlaegning.
         ⚠ Reolpladser BLIVER staaende her, og det er ikke en forglemmelse:
         noden deles med Warehouse, og `kraeverModul` tager EEN streng. Under
         Opsaetning med "unitbooking" ville hylderne forsvinde for en kunde
         der kun har WMS — praecis den faelde `reolpladser.skriv` lukkede. */
      { key: "unitbookingKalender", sti: "/unitbooking", label: "Kalender",
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
    key: "bemanding", sti: "/bemanding/kompetencer", label: "Workforce", titel: "Workforce",
    under: "Overblik over bemanding og kapacitet", gruppe: "drift",
    born: [
      { key: "bemandingPlan", sti: "/bemanding", label: "Bemandingsplan", skjulINav: true,
        titel: "Workforce", under: "Overblik over bemanding og kapacitet" },
      { key: "kompetencer", sti: "/bemanding/kompetencer", label: "Kompetencer",
        titel: "Kompetencer & certifikater", under: "Gyldighed, udløb og påmindelser" },
      { key: "fravaer", sti: "/bemanding/fravaer", label: "Ferie & fravær",
        titel: "Ferie & fravær", under: "Fravær blokerer chaufføren i disponeringen" },
    ],
  },
  {
    key: "opsaetning", sti: "/opsaetning", label: "Opsætning", titel: "Opsætning",
    under: "Stamdata, brugere, roller og integrationer", gruppe: "admin",
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
      /* ⚠ KASSELISTEN ER STAMDATA — samme snit som Enheder ovenfor. Planche 1
         flytter den hertil, og typerne oprettes samme sted. En kasse oprettes
         een gang og roeres sjaeldent; det operationelle er udlaanet. */
      { key: "unitbookingKasser", sti: "/opsaetning/kasser", label: "Kasseliste",
        kraeverModul: "unitbooking",
        titel: "Kasseliste", under: "Transportkasser: type, undertype, mål, status og plads" },
      /* ⚠ MEDARBEJDERE ER STAMDATA — DERFOR HER, IKKE I WORKFORCE.
         Samme snit som Enheder ovenfor: en person oprettes én gang og røres
         sjældent igen, mens bemandingsplanen bruges hver dag. Stod de side
         om side, lå den daglige skærm nummer to i en menu hvor nummer ét
         knap bruges.

         ⚠ OG DET ER STADIG IKKE DET SAMME SOM BRUGERE & ROLLER, selv om de
         nu er naboer. Her oprettes PERSONEN, dér et LOGIN. En chauffør har
         måske aldrig et login, en vikar sjældent. `personId` er hvem det
         handler om, `uid` er hvem der gjorde noget — se beslutning 18.
         Naboskabet gør forvekslingen lettere, ikke sværere, så begge punkter
         siger det i deres undertekst. */
      { key: "medarbejdere", sti: "/opsaetning/medarbejdere", label: "Medarbejdere",
        kraeverModul: "bemanding",
        titel: "Medarbejdere",
        under: "Personalets stamdata. Et LOGIN oprettes ved siden af under Brugere & roller — en chauffør har måske aldrig et." },

      /* ⚠ KUNDEKARTOTEKET SELV ER FLYTTET UD (Skive 2A) — se Fælles > Kunder
         øverst i denne fil. Standardpriser og Kundepriser er STAMDATA og
         bliver stående her: de to skærme har ikke fået en ny placering i
         denne skive (kræver en fane på kundens profil, matrix-# 48 — en
         senere MERGE/FINISH-opgave), og bærer fortsat `kraeverModul:
         "kunder"` af samme grund som før — Opsætning er `altid: true` og
         kan ikke fravælges, så uden leddet ville en kunde der aldrig har
         købt modulet, få et menupunkt i sin egen opsætning der åbner en
         afvist læsning. */
      { key: "standardpriser", kraeverPerm: "satser.laes", sti: "/opsaetning/priser", label: "Standardpriser",
        kraeverModul: "kunder",
        titel: "Standardpriser",
        under: "Priser for alle platformens ydelser. Afvigelser saettes paa kunden." },
      /* ⚠ TO LAG, IKKE TRE. Standardprisen gaelder alle; her saettes den
         enkelte kundes afvigelse — enten en egen pris eller en rabat.
         Prisgruppen baerer ikke laengere en pris. Se PRISER.md punkt 4.1. */
      { key: "kundepriser", kraeverPerm: "satser.laes", sti: "/opsaetning/aftalepriser", label: "Kundepriser",
        kraeverModul: "kunder",
        titel: "Kundepriser",
        under: "Den enkelte kundes egen pris eller rabat. Standarden bliver staaende." },
      { key: "kundepriserEn", kraeverPerm: "satser.laes", sti: "/opsaetning/aftalepriser/:kundeId", label: "Kundepriser",
        kraeverModul: "kunder", skjulINav: true, titel: "Kundepriser",
        under: "Den enkelte kundes egen pris eller rabat. Standarden bliver staaende." },

      { key: "brugere", sti: "/opsaetning/brugere", label: "Brugere & roller",
        titel: "Brugere & roller",
        under: "Logins, adgang og tenant-tilknytning. Medarbejdere uden login oprettes ved siden af under Medarbejdere." },
      { key: "integrationer", sti: "/opsaetning/integrationer", label: "Integrationer", skjulINav: true,
        titel: "Integrationer", under: "Kort, brændstofkort, regnskab og løn" },
    ],
  },
  {
    key: "support", sti: "/support", label: "Hjælp", titel: "Hjælp & Support",
    under: "Kom videre selv, eller find ud af hvordan I får fat i FleetControl.",
    gruppe: "hjaelp",
    born: [
      { key: "hjaelp", sti: "/support", label: "Hjælp & Support",
        titel: "Hjælp & Support", under: "Kom videre selv, eller find ud af hvordan I får fat i FleetControl." },
      /* Vores egne to. De SKJULES ikke for en kunde — de viser en "din rolle
         har ikke adgang"-tilstand, som Medarbejdere gør. Nav-filtrering på
         permission er en selvstændig ændring. */
      { key: "supportOverblik", sti: "/support/overblik", label: "Supportoverblik", skjulINav: true,
        titel: "Supportoverblik", under: "Sager på tværs af kunder. Kræver support.laes." },
      { key: "supportSag", sti: "/support/sag/:id", label: "Supportsag", skjulINav: true,
        titel: "Supportsag", under: "Tråd, kontekst, aktivitetsudtræk og supportadgang." },
    ],
  },
];

/** Flad liste over alt der har en rute. */
export const ALLE = NAV.flatMap((m) => (m.born ? m.born : [m]));

/* ══════════════════════════════════════════════════════════════════════════
   kraeverPerm — ET PUNKT HVIS EMNE ER SPÆRRET. Beslutning 105.
   ══════════════════════════════════════════════════════════════════════════

   Beslutning 104 gav `satser`, `grundlag` og de otte Procure-noder hver en
   læse-permission. Målt bagefter: **18 af 59 skærme havde mindst én afvist
   læsning for en chauffør** — han så alle 54 menupunkter, og en femtedel af
   dem åbnede en spærring.

   Det er nøjagtig den sætning jeg brugte i beslutning 103 til at nægte
   chaufførappen en sidebar: *en menu der mest består af døre der ikke kan
   åbnes, er værre end ingen menu.* Den gjaldt også kontorskærmen.

   ⚠ MENUEN TIER, ADGANGEN ÆNDRES IKKE. Ruten findes uændret, og taster man
   stien, svarer skærmen med `<Datatilstand art="naegtet">`. Præcis som
   `kraeverModul`: håndhævelsen ligger i `firebase.rules.json`, og et
   menupunkt der forsvandt, må aldrig være det eneste der spærrer. En prøve
   kræver at reglen stadig afviser.

   ⚠ OG DET ER IKKE LÆNGERE "EN PÆN KNAP". Beslutning 43 og 44 afviste et
   rollefilter i widgetvælgeren med netop den begrundelse — *kortet væk,
   tallet åbent*. Præmissen var at ingen regel spurgte om rollen. Efter 104
   gør ti noder det, og for **de tre permissioner** er filteret derfor en
   afspejling frem for en attrap. Det gælder ikke for de øvrige: et punkt må
   kun bære `kraeverPerm` hvis reglen faktisk kræver den.

   ⚠ FELTET SÆTTES HVOR SKÆRMENS EMNE ER SPÆRRET — ikke hvor den tilfældigvis
   læser en spærret node. Disponering slår op i `leverandoerer` for at skrive
   et navn; uden `indkoeb.laes` mangler en kolonne, og skærmen er stadig
   disponentens vigtigste. Værkstedskalenderen og Servicekalenderen det samme.
   `test/navadgang.test.mjs` kræver en skreven grund for hver af dem — en
   udeladelse man kan se, er et valg; en man ikke kan se, er en fejl. */

/** Gamle stier → nye. Lægges som <Navigate> så v1.4-links overlever. */
export const REDIRECTS = [
  { fra: "/dispatch", til: "/booking/disponering" },
  { fra: "/tracking", til: "/booking/live-kort" },
  /* Driftskalenderen flyttede op paa /flaade, da Enheder gik til Opsaetning.
     Stien har staaet i sidebaren siden v3.0 og ligger i mindst een supportsags
     kontekst (demo-sag.js) — den doer ikke af en menuomlaegning. */
  { fra: "/flaade/vaerksted", til: "/flaade" },

  /* ⚠ STAMDATA SAMLEDES UNDER OPSÆTNING. De fem stier her har stået i
     sidebaren siden v3.0 og ligger i bogmærker, i mails og i mindst én
     supportsags kontekst. En menuomlægning må ikke slå dem ihjel — det var
     hele pointen med at /flaade/vaerksted overlevede sin egen flytning.

     ⚠ OG ID'ET SKAL MED. `/kunder/aftalepriser/:kundeId` peger på ÉN kundes
     priser. En redirect uden parameteren ville sende hvert eneste af de
     links til den tomme oversigt — og fejlen ville se ud som et forældet
     link frem for en redirect der tabte noget. Videresend() i App.jsx
     bygger målet af de samme parametre. */
  /* ⚠ KALENDEREN OVERTOG /unitbooking, da Kasselisten gik til Opsaetning.
     Stien /unitbooking/kalender har staaet i sidebaren siden modulet kom.
     ⚠ Og prisen ved flytningen staar her, saa ingen tror den er gratis: et
     bogmaerke til /unitbooking, sat da det var KASSELISTEN, lander nu paa
     kalenderen. De to kan ikke skelnes — stien er den samme. Samme
     omkostning som da Driftskalenderen overtog /flaade fra Enheder. */
  { fra: "/unitbooking/kalender", til: "/unitbooking" },
  { fra: "/bemanding/medarbejdere", til: "/opsaetning/medarbejdere" },
  { fra: "/kunder", til: "/opsaetning/kunder" },
  { fra: "/kunder/priser", til: "/opsaetning/priser" },
  { fra: "/kunder/aftalepriser", til: "/opsaetning/aftalepriser" },
  { fra: "/kunder/aftalepriser/:kundeId", til: "/opsaetning/aftalepriser/:kundeId" },
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
