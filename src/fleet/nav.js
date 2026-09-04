/* src/fleet/nav.js
 * ÉN informationsarkitektur. Én kilde til sidebar OG ruter.
 *
 * ⚠ ÉT IMPORT — `MODUL` fra moduler.js, brugt kun af `modulNavnFor()`
 * nedenfor. nav.js kopieres IKKE til functions/delt/ (se
 * scripts/kopier-delt.mjs) og har derfor ingen deploy-konsekvens af dette;
 * det er stadig et rent klientmodul, aldrig en Cloud Function-afhængighed.
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
 * ⚠ FAKTURAER & BILAG'S OVERGANGSTILSTAND ER AFSLUTTET — SKIVE 4A.
 * Målplanen (02_TARGET_NAVIGATION.md, Korrektion 2) er nu ført ud:
 * `kraeverPerm` er `fakturaer.laes`, en ny, delt permission-familie
 * (`fakturaer.laes`/`.skriv`/`.godkend`) der dækker begge forbrugere
 * (Procures Fakturaer og Fakturacenteret), ikke længere `indkoeb.laes`.
 * Ruten er UÆNDRET (`/oekonomi/fakturacenter`). Målplanens forslåede
 * `/fakturaer` er selv markeret "IKKE PÅVIST" dér — en URL-omdøbning er en
 * selvstændig, kontrolleret routing-migration, ikke en del af 4A.
 * Rollefordelingen er bevidst identisk med hvem der havde `indkoeb.laes` i
 * forvejen — ingen mistede eller fik adgang ved skiftet.
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
 *
 * ⚠ MASTEROPGAVE §5 LÆGGER `oekonomi`-GRUPPEN SELV PÅ PAUSE. `fakturering`
 * fik nu også `skjulINav: true` — begge børn er skjulte, og topniveaupunktet
 * forsvinder derfor af sig selv (beslutning 105). Ruten `/oekonomi/fakturering`
 * virker stadig som direkte link.
 */
import { MODUL } from "./moduler.js";

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
  /* ⚠ KUNDER ER FLYTTET TILBAGE UNDER ADMINISTRATION — V1-brugertest,
     31/8: "Kunder skal efter min mening ligge under Administration. Dette
     program er ikke et regnskabsprogram eller salgsprogram... det er
     vigtigt at man kan vælge moduler fra alt efter hvilken kunde vi skal
     sælge dette program til." En kunde der kun har købt Fleet eller
     Facility har ingen daglig brug for et kundekartotek-menupunkt.
     Dette OMGØR en tidligere skive (se git-historikken og
     04_DATA_AND_PERMISSION_IMPACT.md), der flyttede Kunder FRA Opsætning
     TIL Fælles med den modsatte begrundelse — produktejerne har siden
     vurderet det anderledes, direkte på skærmbilledet. `kraeverModul:
     "kunder"` og ruten (`/opsaetning/kunder`) er UÆNDRET: kun
     menugruppen flyttede. Planning/Procure/Warehouse kan stadig søge og
     vælge kunder fra samme fælles database — det kræver ikke et
     nav-punkt, kun opslaget i `kunder`-noden. */
  {
    key: "kunderOversigt", sti: "/opsaetning/kunder", label: "Kunder",
    kraeverModul: "kunder", gruppe: "admin",
    titel: "Kunder", under: "Kundekartotek og aftaler.",
  },
  /* ⚠ FAKTURAER & BILAG — se filens hoved. Skive 4A: `kraeverPerm` er nu
     `fakturaer.laes`, ikke `indkoeb.laes`. */
  {
    key: "fakturacenter", kraeverPerm: "fakturaer.laes", sti: "/oekonomi/fakturacenter",
    label: "Fakturaer & bilag", gruppe: "faelles",
    titel: "Fakturaer & bilag",
    under: "Ét fælles sted til fakturaer, bilag og match på tværs af Fleet, Facility og Procure.",
  },
  /* ⚠ LEVERANDØRER — SKIVE 4B, Model B (Korrektion 3), flyttet ud af
     Procure-undermenuen til et Fælles-topniveaupunkt. V1-brugertest,
     31/8, flytter den ét skridt videre: "Denne del skal også rykket til
     Administrations/opsætning" — samme begrundelse og samme afgørelse som
     for Kunder ovenfor. Ruten er FORSAT MED VILJE uændret
     (`/indkoeb/leverandoerer`); kun menugruppen flyttede, ikke
     permissionen (`leverandoerer.laes`, uændret siden Skive 4B) — kartoteket
     er stadig fælles masterdata for Fleet, Facility og Procure, kun gemt et
     andet sted i menuen. */
  {
    key: "leverandoerer", kraeverPerm: "leverandoerer.laes", sti: "/indkoeb/leverandoerer",
    label: "Leverandører", gruppe: "admin",
    titel: "Leverandører",
    under: "Fælles leverandørkartotek for Fleet, Facility og Procure.",
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
         ovenfor. Fakturering var ENESTE synlige barn i denne gruppe.
         ⚠ MASTEROPGAVE §5 SÆTTER GRUPPEN PÅ PAUSE — brugertesten pegede på
         at "Økonomi / Fakturagrundlag" stod synlig i FÆLLES uden at være
         klar. Begge børn er nu skjulINav, og per beslutning 105's
         "ET PUNKT HVIS BØRN ALLE ER SKJULT, TEGNES IKKE" forsvinder derfor
         hele topniveaupunktet fra sidebaren af sig selv — ruten findes
         stadig, det er kun menuen der tier. */
      { key: "fakturering", kraeverPerm: "grundlag.laes", sti: "/oekonomi/fakturering", label: "Fakturagrundlag",
        titel: "Fakturagrundlag", under: "Opgaver klar til fakturering — det vi SENDER", skjulINav: true },
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
        titel: "Planning – ny transportforespørgsel", under: "Koordinator indsender forespørgsel til planlægning." },
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
    /* ⚠ FLEET TARGET (masterbrief §1/§9, produktejer-review 2026-09-01) —
       MODULNAVIGATION, IKKE SIDEBAR-UNDERPUNKTER. "Venstre sidebar bruges
       primært til hovedområder/moduler. Når brugeren går ind i et modul,
       skifter vedkommende mellem modulets arbejdsflader via en kompakt
       horisontal modulnavigation øverst" — se `fleet/modulfaner.js` og
       `ModulNav` i ui.jsx. Kun ÉT barn (Overblik, sti /flaade — samme sti
       som toppunktet selv) er derfor ikke `skjulINav` — de andre seks er.
       AppShells `visBorn` kræver
       `born.length > 1` for overhovedet at tegne en undermenu/chevron
       (se dens egen note), så ét synligt barn er i praksis usynligt: der
       renderes ingen undermenu, kun "Fleet" selv som ét link. Nul synlige
       børn ville derimod have fjernet HELE toppunktet — `synligeToppunkter`
       i AppShell.jsx kræver mindst ét, se dens filter — og det er derfor
       ikke alle syv der er skjulte.
       Rækkerne findes stadig ALLE HER, fordi `findModul()`/`ALLE` (nav.js'
       flade rute→titel-opslag til AppShell's sidehoved) læser dem uanset
       `skjulINav` — kun selve SIDEBAR-VISNINGEN filtrerer på flaget.

       Se `enheder` under opsaetning — modulnøglen `flaade`, noden
       `koeretoejer` og permissionen `koeretoejer.laes` er UÆNDREDE; kun
       menupladsen (nu OGSÅ Fleets egen fanebjælke) er ny.

       ⚠ skjulFirma/skjulPeriode STOD HER OG ER VÆK IGEN. Flagene skjulte
       firma- og periodevælgeren på Fleets skærme; nu er de tre kontroller
       fjernet fra HVER side, og et flag der altid er sandt, er en mekanisme
       uden variation. Se AppShell. */
    key: "flaade", sti: "/flaade", label: "Fleet", titel: "Fleet",
    under: "Nye indberetninger, driftskalender og enheder", gruppe: "drift",
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
      /* ⚠ OVERBLIK ER NU FORSIDEN (samme sti Driftskalenderen havde før) —
         den absorberede de fem "kasser"/arbejdskøen, som ikke længere er en
         underside man skal klikke sig hen til. Se Overblik.jsx.
         ⚠ DET ENE IKKE-SKJULTE BARN — se topniveaupunktets egen note.
         Sitien er DEN SAMME som forælderens (/flaade): et topniveaupunkts
         egen NavLink skal pege på et barn der rent faktisk er synligt
         (test/skive1-navigation.test.mjs), og Overblik ER modulets forside. */
      { key: "flaadeOverblik", sti: "/flaade", label: "Overblik",
        titel: "Fleet – overblik",
        under: "Nye indberetninger, hvad kræver handling, og hvad er planlagt." },
      { key: "vaerksted", sti: "/flaade/driftskalender", label: "Driftskalender",
        skjulINav: true, titel: "Fleet – driftskalender",
        under: "Planlæg, følg op og håndtér driftsopgaver på tværs af enheder og værksteder." },
      { key: "indberetninger", sti: "/flaade/indberetninger", label: "Indberetninger",
        skjulINav: true, titel: "Indberetninger",
        under: "Reparation, skade, brændstof og fejl" },
      { key: "servicebog", sti: "/flaade/servicebog", label: "Servicebog",
        skjulINav: true, titel: "Fleet – servicebog",
        under: "Tilbagevendende service- og synskrav pr. enhed." },
      { key: "flaadeStatistik", sti: "/flaade/statistik", label: "Statistik",
        skjulINav: true, titel: "Fleet – statistik",
        under: "Udgifter og hændelser over tid." },
      { key: "flaadeKontakter", sti: "/flaade/kontakter", label: "Kontakter",
        skjulINav: true, titel: "Fleet – kontakter",
        under: "Værksteder, dækcentre og chauffører." },
      /* ⚠ skjulINav: KØEN ER ET MÅL, IKKE ET MENUPUNKT — uændret begrundelse.
         Man kommer hertil via "Åbn i nyt vindue" (et rigtigt browservindue,
         ingen React-tilstand at arve) eller et gammelt dybt link; modulets
         forside (Overblik.jsx) bruger den samme ArbejdskoeIndhold direkte,
         uden om denne rute. */
      { key: "arbejdskoe", sti: "/flaade/koe", label: "Arbejdskø", skjulINav: true,
        titel: "Fleet – arbejdskø",
        under: "Én samlet kø for alle hændelser. Filtrér og prioritér." },
    ],
  },
  {
    key: "facility", sti: "/facility", label: "Facility", titel: "Facility",
    under: "Inventar, service & reparation og planlagt vedligehold.",
    gruppe: "drift",
    born: [
      /* ⚠ FACILITY TARGET (produktejer-review 2026-09-02) — SAMME MØNSTER SOM
         FLEET: flad modulstruktur, vandret ModulNav øverst på hver skærm (se
         fleet/modulfaner.js's FACILITY_FANER), sidebar viser kun modulet selv.
         Kun ÉT barn må stå uden `skjulINav` — visBorn() i AppShell.jsx kræver
         `born.length > 1` for at tegne en undermenu, så et eneste synligt
         barn giver præcis den flade sidebar-visning uden at ændre AppShell.
         Det synlige barn er `facilityOversigt`, fordi dens sti (`/facility`)
         er DEN SAMME som forælderens — samme trick som Fleets `flaadeOverblik`. */
      { key: "facilityOversigt", sti: "/facility", label: "Overblik",
        titel: "Facility – overblik",
        under: "Kommende og overskredne services, åbne fejl og drift." },
      { key: "servicekalender", sti: "/facility/servicekalender", label: "Service & reparation",
        skjulINav: true,
        titel: "Facility – service & reparation",
        under: "Planlæg reparationer, koordinér eksterne firmaer og reservér tid." },
      { key: "facilityInventar", sti: "/facility/inventar", label: "Inventar",
        skjulINav: true,
        titel: "Facility – inventar",
        under: "Anlæg og deres stamdata — filtrérbar oversigt." },
      { key: "facilityPlanlagt", sti: "/facility/planlagt", label: "Planlagt",
        skjulINav: true,
        titel: "Facility – planlagt",
        under: "Planlagte og igangværende servicebesøg." },
      { key: "facilityStatistik", sti: "/facility/statistik", label: "Statistik",
        skjulINav: true,
        titel: "Facility – statistik",
        under: "Servicebesøg, omkostninger og bygningsdrift over tid." },
      { key: "klima", sti: "/facility/klima", label: "Klima & energi", skjulINav: true,
        titel: "Facility – klimaovervågning & energistatistik",
        under: "Overvåg temperatur, fugt og energiforbrug — dokumentér stabile forhold." },
    ],
  },
  /* ⚠ PROCURE TARGET (produktejer-review 2026-09-02) — samme flade mønster
     som Fleet/Facility: ét synligt barn (samme `sti` som forælderen), resten
     `skjulINav: true`, navigation sker via den vandrette `ModulNav`
     (fleet/modulfaner.js's `PROCURE_FANER`). Se den fils note for hvorfor
     fanelisten IKKE er TARGET-dokumentets ordrette forslag.

     ⚠ TRIN-KOMMENTARERNE FRA FØR ER VÆK, MED VILJE. De beskrev en menu hvor
     Behov/Bestillinger/Godkendelser var TRE SEPARATE PUNKTER i selve
     rækkefølgen "behov, bestilling, godkendelse, faktura". De tre er nu ÉN
     arbejdsflade (`bestillinger`) — processen står i DENS egne sektioner,
     ikke i menurækkefølgen. */
  {
    key: "indkoeb", sti: "/indkoeb", label: "Procure", titel: "Procure & vareforbrug",
    under: "Hele indkøbspipelinen: behov, bestilling, godkendelse, varer og forbrug.",
    gruppe: "drift",
    born: [
      { key: "indkoebOversigt", kraeverPerm: "indkoeb.laes", sti: "/indkoeb", label: "Overblik",
        titel: "Procure – overblik",
        under: "Hele indkøbspipelinen på fem sekunder — og den enkelte posts næste handling." },
      { key: "bestillinger", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/bestillinger", label: "Bestillinger",
        skjulINav: true, titel: "Procure – bestillinger",
        under: "Behov, bestillingskladder, godkendelse og afsendelse — Procures primære arbejdsflade." },
      { key: "indkoebVarer", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/varer", label: "Varer",
        skjulINav: true, titel: "Procure – varer",
        under: "Varekatalog, leverandørpriser og indkøbsregistrering." },
      { key: "indkoebArkiv", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/arkiv", label: "Arkiv",
        skjulINav: true, titel: "Procure – arkiv",
        under: "Afsluttede behov, bestillinger og kontantkøb — read-only historik." },
      { key: "indkoebStatistik", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/statistik", label: "Statistik",
        skjulINav: true, titel: "Procure – statistik",
        under: "Forbrug, leverandørperformance og prisudvikling over tid." },
      /* ⚠ SKIVE 4A — INDSKRÆNKET, OG STADIG UDEN FOR FANEBJÆLKEN.
         Faktura-listen/status/godkendelse er i det fælles Fakturacenter;
         denne skærm har kun match-til-bestilling, kontantkøb og
         brændstofmatch tilbage — reelt Procure-specifikt, ikke duplikeret.
         Nås via et kontekstuelt link fra Bestillinger, ikke en egen fane —
         se PROCURE_FANER's note om hvorfor. */
      { key: "fakturaer", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/fakturaer", label: "Match & kontantkøb",
        skjulINav: true, titel: "Match & kontantkøb",
        under: "Match fakturaer mod bestillinger, registrér et kontant køb, eller match brændstoflinjer." },
      /* ⚠ VORES EGNE FORBRUGSVARER — ikke Warehouses gods, som er KUNDENS,
         og ikke den nye globale varemaster (`indkoebVarer` ovenfor), som er
         KATALOG + LEVERANDØRPRISER. Dette er EGEN BEHOLDNING med minimum og
         bevægelser — en tredje, adskilt ting. Se forbrugsvarer.js og
         beslutning 85. Stadig uden for fanebjælken, nås via et kontekstuelt
         link fra Varer. */
      { key: "varelager", kraeverPerm: "indkoeb.laes", sti: "/indkoeb/varelager", label: "Varelager",
        skjulINav: true, titel: "Varelager — vores egne forbrugsvarer",
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
      /* ⚠ PROCURE TARGET, TRIN 4 (produktejer-review 2026-09-02) — FLYTTET
         HERTIL FRA Godkendelser.jsx. Dette er kun ADMINISTRATIONS-UI'et: hvem
         der må godkende, og hvornår. Selve KØEN af ordrer der venter, og
         handlingerne på dem, hører til det daglige arbejde og blev derfor
         IKKE flyttet — de bor i Procures egen Bestillinger-fane. Reglens
         håndhævelse (`godkendelsesregelskriv`, `kraeverGodkendelse()`,
         `kanSkifteIndkoebsordre()`) er UÆNDRET; dette er informationsarkitektur,
         ikke en ny godkendelsesmotor. `kraeverPerm` matcher stadig kun LÆSNINGEN
         (`indkoeb.laes`, samme regel som `godkendelsesregler`-noden selv
         kræver) — hvem der må ÆNDRE reglerne (`brugere.skriv`) håndhæves i
         skærmen, som Godkendelser.jsx altid har gjort det. */
      { key: "procureGodkendelsesregler", kraeverPerm: "indkoeb.laes",
        sti: "/opsaetning/procure/godkendelsesregler", kraeverModul: "indkoeb",
        label: "Godkendelsesregler", titel: "Procure – godkendelsesregler",
        under: "Beløbsgrænse og fakturagodkendelse for indkøb. Sættes af en administrator." },
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

/**
 * Hvilket modul (hvis noget) gater et TOPNIVEAUpunkt? `null` = intet modul.
 *
 * ⚠ `m.key` ER IKKE ALTID ET MODULNAVN. Før Skive 2A var det altid sandt —
 * hvert topniveaupunkts key VAR modulets — men `fakturacenter` er med vilje
 * UDEN modulklausul (samme grund som noden selv i firebase.rules.json).
 * `m.kraeverModul || m.key` ville have brugt "fakturacenter" som et påstået
 * modulnavn, og `harModul()` fejler LUKKET på et ukendt navn — punktet ville
 * forsvinde for ALLE, uanset moduler. Denne funktion spørger derfor kun
 * MODUL-kataloget, aldrig NAV selv, før den falder tilbage på nøglen.
 *
 * ⚠ KUN TIL TOPNIVEAUET. Et BARN filtreres fortsat udelukkende på sit eget
 * eksplicitte `kraeverModul` (ingen nøgle-fallback) — se AppShell.jsx's
 * `synligeBorn`. Ingen af de ca. 45 børns nøgler matcher i dag et rigtigt
 * modulnavn, men fallback'et er bevidst IKKE udvidet til børn: de har aldrig
 * haft brug for det, og en uprøvet udvidelse er en risiko uden en gevinst.
 */
export function modulNavnFor(punkt) {
  return punkt.kraeverModul || (MODUL[punkt.key] ? punkt.key : null);
}

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
  /* Driftskalenderen flyttede op paa /flaade, da Enheder gik til Opsaetning,
     og flyttede saa VIDERE til /flaade/driftskalender da Overblik.jsx blev
     Fleets forside (Fleet TARGET, produktejer-review 2026-09-01) — se
     modulfaner.js. Stien har staaet i sidebaren siden v3.0 og ligger i
     mindst een supportsags kontekst (demo-sag.js) — den doer ikke af en
     menuomlaegning, uanset hvor mange gange forsiden selv flytter. */
  { fra: "/flaade/vaerksted", til: "/flaade/driftskalender" },

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
