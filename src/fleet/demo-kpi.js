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
   og vaskehallen er fælles aktiver, og de bliver ikke
   flere af at man skifter toggle. Det er ikke en fejl i demo-data — det er
   fælles-begrebet der slår igennem i aggregeringen. */
export const DEMO_KPI = {
/* ⚠ HER LÅ TO SÆT — `gods` og `bus` — fordi noden var stiformet efter
   division. Aksen er fjernet i beslutning 70, og sættet er dermed ét.

   ⚠ OG DE TO SÆT VAR SELV ET ARGUMENT. For flåden og bemandingen stod der
   de SAMME tal i begge (beslutning 19: "ét tal, ikke fem i gods og tre i
   bus"), for facility ligeså — og forskellene stod kun dér hvor posterne
   bar feltet. Halvdelen af demofilen var altså en kopi, vedligeholdt i
   hånden, af noget der ikke var forskelligt. Det er den slags der driver.

   ⚠ BUS-SÆTTET ER IKKE FLYTTET OVER — det er SLETTET. Der er ingen kunde
   der har begge, så tallene beskrev en forretning ingen abonnent havde. */
  opgaver: {
    aabne: 47, indberettet: 12, planlagt: 10, igang: 9, afventer: 7, udfoert: 9,
    forsinkede: 4, nyeBookinger: 6, igangIDag: 18, uplanlagte: 8, udenTidsregistrering: 7, klarTilFakturering: 12,
    udfoerteOpgaver: 214,
    /* ⚠ TRE FELTER AGGREGERINGEN SKREV, SOM DEMOFILEN IKKE KENDTE — og
       demo-mode viste derfor `undefined` for dem. Fundet af den omvendte
       prøve; se beslutning 60. */
    annulleret: 3, udenTidsfrist: 5, aabneDeltaPct: -4.5,
  },
  flaade: {
    /* ⚠ TALLENE ER HELE FLÅDEN NU, ikke gods-halvdelen.
       Da de to grene blev til én (beslutning 70), blev de gamle gods-tal
       pludselig et loft for HELE demo-rosteren — og rosteren har 12 biler til
       service inden 30 dage, mens gods-grenen sagde 9. **Loftet var blevet
       for lavt uden at nogen havde ændret et tal.** Det er den slags en
       sammenlægning gør ved et tal ingen kigger på.

       ⚠ ANTALLENE ER LAGT SAMMEN (42+18, 6+2, 3+1, 9+4). PROCENTERNE OG
       SATSERNE ER IKKE: 3,8 % og 2,4 % giver ikke 6,2 % — et forholdstal skal
       vægtes, og vægten findes ikke her. De står som gods-tallet, der var den
       største af de to flåder. */
    aktive: 60, udeAfDrift: 8, paaVaerksted: 4, serviceInden30: 13,
    omkostningPrKmOere: 342, omkostningPrKmDeltaOere: 21, nedetidPct: 3.8,
    /* ⚠ STOD SOM ET HARDKODET 3 I Dashboard.jsx. Kortet sagde "3 nye
       indberetninger" uanset basen. Feltet hører her — så er skærmen rigtig
       med det samme, og det eneste der mangler, er aggregeringen. */
    nyeIndberetninger: 3,
    /* ⚠ PROCENTPOINT, ikke procent — og feltet stod som et HARDKODET
       deviation(-0.6, …) i Dashboard.jsx. En afvigelse ligner en måling af
       noget der har ændret sig; hardkodet pegede pilen samme vej i hver
       tenant, under et nøgletal der var ubesvaret. */
    nedetidDeltaPoint: -0.6,
    ikkeLinkedeFakturaer: 5,
    /* Beslutning 25: Indberetninger viser periodens braendstofudgift. Feltet
       defineres HER frem for at blive hardkodet i skaermen — saa er skaermen
       rigtig, og det eneste der mangler, er aggregeringen. Se KPI-efterslaebet. */
    braendstofOere: 184240000,
  },
  bemanding: {
    /* ⚠ `ledig: 10` STOD HER — 58 − 48. Feltet forlod `kpi/` i beslutning 71
       fordi det er AFLEDT, og demofilen skal passe i begge retninger: lovede
       den et felt aggregeringen ikke skriver, ville skærmen vise et tal i demo
       og en streg i drift. */
    /* ⚠ HELE STABEN, ikke gods-halvdelen — samme rettelse som flåden fik.
       Ugeplanen summer til 84 planlagte og 70 disponerede; stod her 58 og 48,
       ville selvkontrollen sige at skærmen modsiger sin egen tabel, og den
       ville have ret. 58+26 og 48+22. */
    /* ⚠ underbemandede ER 7, IKKE 6+2. De to andre tal er ANTAL og kunne
       lægges sammen; det her er et AFLEDT tal — summen af (planlagt −
       disponeret) pr. dag — og det regnes af den SAMLEDE plan, ikke som en
       sum af to delsummer. Selvkontrollen regner det og sagde 7 ≠ 8. */
    planlagt: 84, disponeret: 70, underbemandede: 7,
    /* kompetencerUdloeber er IKKE delt på division (beslutning 19). Staben
       er én, så tallet er det samme her og under bus. Stod der to
       forskellige, ville Bemanding vise et andet tal ved et toggle-skift
       uden at en eneste kompetence havde ændret sig. */
    chauffoerPlanlagt: 20, chauffoerDisponeret: 18, kompetencerUdloeber: 8,
    /* ⚠ TO FELTER TIL DER MANGLEDE. De er null i aggregeringen — flåden og
       bemandingen kan ikke deles på division (beslutning 19) — men de skal
       stå i demofilen, for den ER nodens form. */
    medarbejdereAktive: 35, fravaerIDag: 4,
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
    /* ⚠ HELE INDKØBET: 18+7 og 7+3. Demo-sættet har 53 linjer, og et udsnit
       kan ikke være større end totalen — se selvkontrollen i demo-indkoeb.js. */
    aabneOrdrer: 25, fakturaerTilGodkendelse: 10, indkoebsprisafvigelser: 7,
    varerTilGodkendelse: 8, manglerFaktura: 24, godkendtDenneMaaned: 86,
    maanedensForbrugOere: 12284500,
    leveranceTilTidenPct: 92, indkoebsprisafvigelseSnitPct: 7,
    /* ⚠ INGEN KILDE: `forbrugsvarer` findes ikke endnu, og Warehouses
       `varer`/`beholdning` er KUNDENS gods — ikke vores. Se beslutning 84.
       Feltet står her fordi demofilen ER nodens form, i BEGGE retninger
       (beslutning 60): skriver aggregeringen et felt, skal demoen kende det. */
    lavBeholdning: null,
    /* Periodeafvigelser. De KRAEVER historik og hoerer derfor i kpi/.
       ⚠ leveranceTilTidenDeltaPoint er PROCENTPOINT, ikke procent. 92 %
       der stiger til 97 % er +5 point, ikke +5 %. Blandes de to, staar der
       et tal der er rigtigt paa den ene laesning og forkert paa den anden —
       og ingen kan se hvilken. Feltnavnet siger hvilket. */
    aabneOrdrerDeltaPct: 13, fakturaerTilGodkendelseDeltaPct: 40,
    prisafvigelserDelta: 2, leveranceTilTidenDeltaPoint: 5,
  },
  kunder: {
    /* ⚠ HELE KUNDEKARTOTEKET: 51+17, 7+3, 12+6, 5+2. */
    aktive: 68, aftalerUdloeber: 10, tilbud: 18, tilbudKraeverOpfoelgning: 7,
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
    /* ⚠ TRE FELTER AGGREGERINGEN SKREV, SOM DEMOFILEN IKKE KENDTE.
       `ikkeFaktureretForloeb` er ANTALLET bag `ikkeFaktureretOere` — se
       beslutning 25 om hvad beløbet betyder. */
    ikkeFaktureretForloeb: 6, planlagtPct: 64, akutPct: 36,
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
  /* ⚠ `udenEtaEllerFrist` ER HULLET VED SIDEN AF TALLET. En etape uden ETA
     eller uden frist kan ikke vurderes for forsinkelse, og den tælles derfor
     ikke med i risikoen — men den skal kunne SES, ellers ser et lille tal ud
     som et rent hus. Samme greb som opgaver.udenTidsregistrering. */
  disponering: {
    planlagteOpgaver: 22, aabneEtaper: 5, planlagteOpgaverDeltaPct: 8.3,
    ledigKapacitetPct: 18, forsinkelsesrisiko: 2, udenEtaEllerFrist: 3,
    konflikter: 4,
  },
};
