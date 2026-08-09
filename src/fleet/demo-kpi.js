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
      forsinkede: 4, nyeBookinger: 6, igangIDag: 18, uplanlagte: 8, klarTilFakturering: 12,
      udfoerteOpgaver: 214,
    },
    flaade: {
      aktive: 42, udeAfDrift: 6, paaVaerksted: 3, serviceInden30: 9,
      omkostningPrKmOere: 342, omkostningPrKmDeltaOere: 21, nedetidPct: 3.8,
      ikkeLinkedeFakturaer: 5,
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
    facility: {
      aktiver: 287, servicepunkterForfalder: 18, aabneSager: 7, planlagtVedligehold: 12,
      aabneFejl: 24, klimaalarmerIDag: 3, sensorerAktive: 27,
      eksterneLeverandoerer: 8, facilityOmkostningOere: 12684000,
      anslaaetServiceOere: 12845000,
    },
    indkoeb: {
      aabneOrdrer: 18, fakturaerTilGodkendelse: 7, indkoebsprisafvigelser: 5,
      varerTilGodkendelse: 8, manglerFaktura: 24, godkendtDenneMaaned: 86,
      maanedensForbrugOere: 12284500,
      leveranceTilTidenPct: 92, indkoebsprisafvigelseSnitPct: 7,
    },
    kunder: {
      aktive: 51, aftalerUdloeber: 7, tilbud: 12, tilbudKraeverOpfoelgning: 5,
      daekningsbidragOere: 31184000,
    },
    oekonomi: {
      driftsomkostningerOere: 84261500, budgetOere: 77005500,
      ikkeFaktureretOere: 18624000, daekningsgradPct: 72, maalDaekningsgradPct: 70,
      driftstimer: 2840,
      planlagtVedligeholdPct: 72,
    },
    disponering: { planlagteOpgaver: 22, ledigKapacitetPct: 18, forsinkelsesrisiko: 2, konflikter: 4 },
  },

  bus: {
    opgaver: {
      aabne: 19, indberettet: 5, planlagt: 4, igang: 3, afventer: 3, udfoert: 4,
      forsinkede: 2, nyeBookinger: 3, igangIDag: 8, uplanlagte: 3, klarTilFakturering: 6,
      udfoerteOpgaver: 96,
    },
    flaade: {
      aktive: 18, udeAfDrift: 2, paaVaerksted: 1, serviceInden30: 4,
      omkostningPrKmOere: 268, omkostningPrKmDeltaOere: -9, nedetidPct: 2.4,
      ikkeLinkedeFakturaer: 2,
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
      eksterneLeverandoerer: 8, facilityOmkostningOere: 12684000,
      anslaaetServiceOere: 12845000,
    },
    indkoeb: {
      aabneOrdrer: 7, fakturaerTilGodkendelse: 3, indkoebsprisafvigelser: 2,
      varerTilGodkendelse: 3, manglerFaktura: 9, godkendtDenneMaaned: 34,
      maanedensForbrugOere: 4820000,
      leveranceTilTidenPct: 95, indkoebsprisafvigelseSnitPct: 4,
    },
    kunder: {
      aktive: 17, aftalerUdloeber: 3, tilbud: 6, tilbudKraeverOpfoelgning: 2,
      daekningsbidragOere: 11460000,
    },
    /* Dækningsgrad UNDER mål her, over mål på gods. Samme kort, modsat farve
       — betterWhen:'higher' afgør det, ikke fortegnet. */
    oekonomi: {
      driftsomkostningerOere: 34346000, budgetOere: 33350000,
      ikkeFaktureretOere: 7240000, daekningsgradPct: 68, maalDaekningsgradPct: 70,
      driftstimer: 1120,
      planlagtVedligeholdPct: 64,
    },
    disponering: { planlagteOpgaver: 9, ledigKapacitetPct: 12, forsinkelsesrisiko: 1, konflikter: 2 },
  },
};
