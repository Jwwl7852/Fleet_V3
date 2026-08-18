/* src/fleet/demo-kpi.js
 * Demo-nøgletallene. Rent data — INGEN IMPORTS, og ingen React.
 *
 * De lå i useKpi.js, som importerer FleetContext.jsx. Det gjorde datasættet
 * uindlæseligt uden for en browser: demo-personale.js måtte hente det med et
 * dynamisk import inde i sin DEV-blok, og en test kunne slet ikke få fat i
 * det — node kan ikke indlæse .jsx.
 *
 * Det er samme grund som permissions.js og audit-regler.js har: et datasæt
 * eller en politik skal kunne læses af en test eller en Cloud Function uden
 * at trække en hel frontend med. Selvkontrollen i demo-filerne er kun så
 * meget værd som antallet af steder der kan køre den.
 *
 * useKpi.js re-eksporterer DEMO_KPI, så eksisterende importer virker uændret.
 */

/* To internt konsistente demo-sæt, ét pr. division. Beløb i øre.

   Bemærk: ingen af tallene er 48 flere gange — i mockupsene var åbne
   opgaver, aktive køretøjer, aktive kunder og disponerede folk alle 48,
   hvilket læser som demo-data frem for en virksomhed.

   Bemærk også at facility-tallene er ENS i de to sæt. Værkstedet, portene
   og vaskehallen er fælles aktiver (division: "faelles"), og de bliver ikke
   flere af at man skifter toggle. Det er ikke en fejl i demo-data — det er
   fælles-begrebet der slår igennem i aggregeringen. */
export const DEMO_KPI = {
  gods: {
    opgaver: {
      aabne: 47, indberettet: 12, planlagt: 10, igang: 9, afventer: 7, udfoert: 9,
      forsinkede: 4, nyeBookinger: 6, igangIDag: 18, uplanlagte: 8, udenTidsregistrering: 7, klarTilFakturering: 12,
      udfoerteOpgaver: 214,
    },
    flaade: {
      aktive: 42, udeAfDrift: 6, paaVaerksted: 3, serviceInden30: 9,
      omkostningPrKmOere: 342, omkostningPrKmDeltaOere: 21, nedetidPct: 3.8,
      ikkeLinkedeFakturaer: 5,
      /* Beslutning 25: Indberetninger viser periodens braendstofudgift. Feltet
         defineres HER frem for at blive hardkodet i skaermen — saa er skaermen
         rigtig, og det eneste der mangler, er aggregeringen. Se KPI-efterslaebet. */
      braendstofOere: 184240000,
    },
    bemanding: {
      planlagt: 58, disponeret: 48, ledig: 10, underbemandede: 6,
      /* kompetencerUdloeber er IKKE delt på division (beslutning 19). Staben
         er én, så tallet er det samme her og under bus. Stod der to
         forskellige, ville Bemanding vise et andet tal ved et toggle-skift
         uden at en eneste kompetence havde ændret sig. */
      chauffoerPlanlagt: 20, chauffoerDisponeret: 18, kompetencerUdloeber: 8,
    },
    /* Facility er FAELLES: tallene er ens under gods og bus, fordi porten er
       den samme uanset hvem der koerer igennem den. */
    /* ⚠ HER STOD facilityOmkostningOere. Den er FJERNET, ikke glemt: den var
       summen af `facility/omkostning`s fem komponenter — et AFLEDT tal, gemt.
       bygningsomkostningOere() regner den hos forbrugeren af de komponenter
       den beskriver, og ingen skærm læste kpi-feltet. Et gemt afledt tal
       driver fra sit grundlag; det er fejlen i `bemanding.ledig`, og den var
       på vej til at blive lavet en gang til. Se "Skal UD af aggregeringen". */
    facility: {
      aktiver: 287, servicepunkterForfalder: 18, aabneSager: 7, planlagtVedligehold: 12,
      aabneFejl: 24, klimaalarmerIDag: 3, sensorerAktive: 27,
      eksterneLeverandoerer: 8,
      anslaaetServiceOere: 12845000,
      /* Periodeafvigelser. De KRAEVER historik og hoerer derfor i kpi/ — de kan
         ikke regnes af de elleve demo-aktiver skaermen har. aktiverDeltaPct er
         procent, de tre andre er antal. Se KPI-efterslaebet i README. */
      aktiverDeltaPct: 8, servicepunkterDelta: 3, aabneSagerDelta: 2,
      planlagtVedligeholdDelta: -2,
      /* Fordelingen af HELE aktivbasen paa art — donutten paa Facility.
         Summen SKAL vaere `aktiver`; selvkontrollen i demo-facility.js
         holder den. Kategorierne er vores egne fra AKTIV_ART, ikke
         mockuppens "El & Tavler": et katalog vi ikke har, kan vi ikke
         fordele paa. `oevrige` samler vaskehal og truckoplader. */
      aktiverPrArt: {
        ventilation: 76, port: 62, ladestander: 48, koeleanlaeg: 41,
        alarm: 32, oevrige: 28,
      },
    },
    indkoeb: {
      aabneOrdrer: 18, fakturaerTilGodkendelse: 7, indkoebsprisafvigelser: 5,
      varerTilGodkendelse: 8, manglerFaktura: 24, godkendtDenneMaaned: 86,
      maanedensForbrugOere: 12284500,
      leveranceTilTidenPct: 92, indkoebsprisafvigelseSnitPct: 7,
      /* Periodeafvigelser. De KRAEVER historik og hoerer derfor i kpi/.
         ⚠ leveranceTilTidenDeltaPoint er PROCENTPOINT, ikke procent. 92 %
         der stiger til 97 % er +5 point, ikke +5 %. Blandes de to, staar der
         et tal der er rigtigt paa den ene laesning og forkert paa den anden —
         og ingen kan se hvilken. Feltnavnet siger hvilket. */
      aabneOrdrerDeltaPct: 13, fakturaerTilGodkendelseDeltaPct: 40,
      prisafvigelserDelta: 2, leveranceTilTidenDeltaPoint: 5,
    },
    kunder: {
      aktive: 51, aftalerUdloeber: 7, tilbud: 12, tilbudKraeverOpfoelgning: 5,
      daekningsbidragOere: 31184000,
      /* Periodeafvigelser — de kraever historik og kan ikke regnes af de
         hentede kunder. aktiveDeltaPct er procent; daekningsbidragDeltaPct
         ogsaa. ⚠ Bland dem ikke med daekningsgradAfvigelsen, som er
         PROCENTPOINT mod maalet og staar under oekonomi. */
      aktiveDeltaPct: 8, daekningsbidragDeltaPct: 36,
    },
    oekonomi: {
      driftsomkostningerOere: 84261500, budgetOere: 77005500,
      ikkeFaktureretOere: 18624000, daekningsgradPct: 72, maalDaekningsgradPct: 70,
      driftstimer: 2840,
      planlagtVedligeholdPct: 72,
      /* PERIODEAFVIGELSER, og de er noget ANDET end budgetafvigelsen.
         Budgetafvigelsen udledes af de to felter ovenfor og staar derfor
         ikke her. De tre nedenfor sammenligner med FORRIGE PERIODE og
         kraever historik laengere tilbage end de tolv maaneder graferne
         har — derfor kpi/ og ikke en beregning i skaermen.
         ⚠ daekningsgradDeltaPoint er PROCENTPOINT. Samme faelde som
         leveranceTilTidenDeltaPoint paa Indkoeb. */
      driftsomkostningerDeltaPct: 8.6, ikkeFaktureretDeltaPct: -14.6,
      daekningsgradDeltaPoint: 5,
    },
    /* ⚠ TOP 5 PÅ TVÆRS AF MODULERNE — flåde, facility, indkøb, værksted.
       Den kan derfor IKKE udledes af det Dashboard allerede har, og
       undtagelsen for afledte tal gælder ikke. Feltet defineres her, så
       skærmen er rigtig og kun aggregeringen mangler (beslutning 6).
       Enhederne er de rigtige fra demo-flaade og demo-facility — en opdigtet
       'Bil 155' der ikke findes i flåden, er den fejl demo-kilder-prøven
       findes for.
       Beløb i ØRE. 'pct' bruges når afvigelsen ikke er et beløb; præcis ét
       af de to felter er sat. */
    afvigelser: [
      { id: "a1", emne: "Bil 155 – Dækudskiftning", kilde: "Over estimat", beloebOere: 1840000, alvor: "hoej" },
      { id: "a2", emne: "Port 3 – Service overskredet", kilde: "Teknisk Facility", alvor: "hoej" },
      { id: "a3", emne: "Lastbil 106 – Øget brændstofforbrug", kilde: "vs. norm", pct: 12, alvor: "mellem" },
      { id: "a4", emne: "Faktura #2458 – Hydraulikolie", kilde: "Over aftalt pris", beloebOere: 725000, alvor: "lav" },
      { id: "a5", emne: "Værksted – Kapacitetsudnyttelse lav", kilde: "58 % udnyttelse", alvor: "lav" },
    ],
    /* ⚠ KUN ÉT WAREHOUSE-FELT, OG DET ER MED VILJE.
       De fem tal på Carrier-overblik — aktive, i transit, engangs, uden
       lokation, med indhold — er AFLEDT af de beholdere og beholdningsposter
       skærmen allerede har hentet. De hører derfor hos forbrugeren og IKKE i
       kpi/; et gemt tal ville drive fra sit grundlag, som bemanding.ledig.

       Det her felt er undtagelsen: en ændring "siden i går" kræver GÅRSDAGENS
       tal, og dem har skærmen ikke. Delta er et ANTAL og ikke en procent —
       11 beholdere der bliver til 13, er +2, og en procent af et lille tal er
       støj. Planchen viser et delta på alle fem kort; de fire andre er ikke
       bygget, fordi hvert felt er et løfte om en aggregering, og et delta på
       "aktive beholdere" siger mindre end tallet selv.

       ⚠ ENS I BEGGE DIVISIONER, som facility-tallene: lageret er fælles, og
       en beholder bliver ikke til to af at man skifter toggle. */
    warehouse: { carriereUdenLokationDelta: 3 },
    disponering: { planlagteOpgaver: 22, ledigKapacitetPct: 18, forsinkelsesrisiko: 2, konflikter: 4 },
  },

  bus: {
    opgaver: {
      aabne: 19, indberettet: 5, planlagt: 4, igang: 3, afventer: 3, udfoert: 4,
      forsinkede: 2, nyeBookinger: 3, igangIDag: 8, uplanlagte: 3, udenTidsregistrering: 3, klarTilFakturering: 6,
      udfoerteOpgaver: 96,
    },
    flaade: {
      aktive: 18, udeAfDrift: 2, paaVaerksted: 1, serviceInden30: 4,
      omkostningPrKmOere: 268, omkostningPrKmDeltaOere: -9, nedetidPct: 2.4,
      ikkeLinkedeFakturaer: 2,
      braendstofOere: 74960000,
    },
    bemanding: {
      planlagt: 26, disponeret: 22, ledig: 4, underbemandede: 2,
      /* Samme tal som under gods — se noten der. */
      chauffoerPlanlagt: 24, chauffoerDisponeret: 21, kompetencerUdloeber: 8,
    },
    /* Facility er FAELLES: tallene er ens under gods og bus, fordi porten er
       den samme uanset hvem der koerer igennem den. */
    facility: {
      aktiver: 287, servicepunkterForfalder: 18, aabneSager: 7, planlagtVedligehold: 12,
      aabneFejl: 24, klimaalarmerIDag: 3, sensorerAktive: 27,
      eksterneLeverandoerer: 8,
      anslaaetServiceOere: 12845000,
      /* Periodeafvigelser. De KRAEVER historik og hoerer derfor i kpi/ — de kan
         ikke regnes af de elleve demo-aktiver skaermen har. aktiverDeltaPct er
         procent, de tre andre er antal. Se KPI-efterslaebet i README. */
      aktiverDeltaPct: 8, servicepunkterDelta: 3, aabneSagerDelta: 2,
      planlagtVedligeholdDelta: -2,
      /* Fordelingen af HELE aktivbasen paa art — donutten paa Facility.
         Summen SKAL vaere `aktiver`; selvkontrollen i demo-facility.js
         holder den. Kategorierne er vores egne fra AKTIV_ART, ikke
         mockuppens "El & Tavler": et katalog vi ikke har, kan vi ikke
         fordele paa. `oevrige` samler vaskehal og truckoplader. */
      aktiverPrArt: {
        ventilation: 76, port: 62, ladestander: 48, koeleanlaeg: 41,
        alarm: 32, oevrige: 28,
      },
    },
    indkoeb: {
      /* Samme fire felter som under gods — se noten der om procentpoint. */
      aabneOrdrerDeltaPct: -6, fakturaerTilGodkendelseDeltaPct: 12,
      prisafvigelserDelta: 1, leveranceTilTidenDeltaPoint: -2,
      aabneOrdrer: 7, fakturaerTilGodkendelse: 3, indkoebsprisafvigelser: 2,
      varerTilGodkendelse: 3, manglerFaktura: 9, godkendtDenneMaaned: 34,
      maanedensForbrugOere: 4820000,
      leveranceTilTidenPct: 95, indkoebsprisafvigelseSnitPct: 4,
    },
    kunder: {
      aktive: 17, aftalerUdloeber: 3, tilbud: 6, tilbudKraeverOpfoelgning: 2,
      daekningsbidragOere: 11460000,
      /* Samme to felter som under gods — se noten der. */
      aktiveDeltaPct: -3, daekningsbidragDeltaPct: 11,
    },
    /* Dækningsgrad UNDER mål her, over mål på gods. Samme kort, modsat farve
       — betterWhen:'higher' afgør det, ikke fortegnet. */
    oekonomi: {
      driftsomkostningerOere: 34346000, budgetOere: 33350000,
      ikkeFaktureretOere: 7240000, daekningsgradPct: 68, maalDaekningsgradPct: 70,
      driftstimer: 1120,
      planlagtVedligeholdPct: 64,
      /* Samme tre felter som under gods — se noten der om procentpoint. */
      driftsomkostningerDeltaPct: 2.9, ikkeFaktureretDeltaPct: 6.2,
      daekningsgradDeltaPoint: -2,
    },
    /* Bussernes egne fem. Enhederne er busser og bus-lokationer — ikke
       lastbiler, som ville afsløre at sættet blev kopieret. */
    afvigelser: [
      { id: "b1", emne: "Bus 12 – Fordør lukker ikke", kilde: "Gentagen fejl", beloebOere: 540000, alvor: "hoej" },
      { id: "b2", emne: "Rute 214 – Forsinket afgang", kilde: "Ni gange på 30 dage", alvor: "hoej" },
      { id: "b3", emne: "Bus 8 – Øget brændstofforbrug", kilde: "vs. norm", pct: 9, alvor: "mellem" },
      { id: "b4", emne: "Faktura #2471 – Ruderest", kilde: "Over aftalt pris", beloebOere: 312000, alvor: "lav" },
      { id: "b5", emne: "Garage syd – Lav pladsudnyttelse", kilde: "61 % udnyttelse", alvor: "lav" },
    ],
    /* Samme felt som under gods — lageret er fælles. Se noten der. */
    warehouse: { carriereUdenLokationDelta: 3 },
    disponering: { planlagteOpgaver: 9, ledigKapacitetPct: 12, forsinkelsesrisiko: 1, konflikter: 2 },
  },
};
