/* src/fleet/kpi-aggregering.js
 * Nøgletallene, regnet ud af noderne. Beslutning 6.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ ET FELT UDEN KILDE ER `null` — IKKE NUL.
 *
 * `kpi/` har været seedet fra demo-sættet, og hvert felt har derfor haft en
 * værdi. Aggregeringen kan ikke det: `opgaver`, `indkoeb` og `facility`
 * findes ikke som noder endnu, og de bærer tilsammen over tyve felter.
 *
 * Skrev vi 0, ville skærmen sige "0 åbne ordrer" — en tom liste, ikke et
 * ubesvaret spørgsmål. `num()` skriver nu `INTET` for null netop derfor; se
 * format.js. Feltet SKAL med i objektet, så man kan se af noden hvad der
 * mangler — udelades det, får skærmen `undefined` og samme streg, men
 * spørgsmålet står ingen steder.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ OG NOGET KAN SLET IKKE DELES PÅ DIVISION.
 *
 * Beslutning 15: division er et FELT. Beslutning 19: stamdata har ikke et.
 * Målt på den udrullede base bærer `kunder`, `etaper`, `bookinger`,
 * `grundlag` og `omkostninger` en division — mens `koeretoejer`, `personale`,
 * `fravaer`, `carriers`, `varer` og `kompetencer` ikke gør.
 *
 * `kpi/gods/flaade.aktive` kan derfor ikke regnes. Et køretøj er ikke gods
 * eller bus; det er en lastbil. At udlede divisionen af ARTEN — bus og
 * minibus er bus, resten er gods — ville være et gæt: en varevogn kan køre
 * for busafdelingen, og en minibus kan køre kurér. Se `UDEN_DIVISION` og
 * det åbne spørgsmål i README.
 *
 * Filen er ren: den kender ingen database og skriver ingenting. Jobbet i
 * functions/index.js henter noderne og kalder den — så kan hele regnestykket
 * prøves uden en emulator.
 */

/**
 * Kilder der IKKE bærer en division, og derfor ikke kan deles.
 *
 * ⚠ LISTEN ER MÅLT, IKKE GÆTTET. Den blev talt op mod den udrullede base:
 * 0 af 16 køretøjer, 0 af 35 medarbejdere og 0 af 80 kompetencer har feltet,
 * mens 14 af 14 kunder og 8 af 8 etaper har det.
 */
export const UDEN_DIVISION = [
  "koeretoejer", "personale", "fravaer", "carriers", "varer", "kompetencer",
];

/** Kilder der endnu ikke findes som node. Deres felter bliver `null`. */
export const KILDER_DER_MANGLER = [
  "opgaver", "indkoeb", "facility", "lagre", "leverandoerer",
];

const DAG = 86400000;

/**
 * Hører posten til divisionen?
 *
 * ⚠ EN POST UDEN DIVISION HØRER TIL BEGGE — ikke til ingen. Det er samme
 * regel som divisionsfilteret i `useListe`, og den er ikke en detalje: da
 * beslutning 19 fjernede feltet fra bilerne, ville en kopi uden det her led
 * have vist en tom biltabel i både Gods og Bus, uden at nogen havde slettet
 * en bil.
 */
export const iDivision = (post, division) =>
  !post?.division || post.division === division || post.division === "faelles";

/**
 * Felterne der ikke kan regnes, med `null` og et navn.
 *
 * De står her og ikke som spredte `null` ude i beregningen, så man kan SE
 * hvor mange der venter — og så et felt der får en kilde, fjernes ét sted.
 */
export function udenKilde() {
  return {
    opgaver: {
      aabne: null, indberettet: null, planlagt: null, igang: null,
      afventer: null, udfoert: null, forsinkede: null, nyeBookinger: null,
      igangIDag: null, uplanlagte: null, udenTidsfrist: null,
    },
    facility: {
      aktiver: null, servicepunkterForfalder: null, aabneSager: null,
      planlagtVedligehold: null, aabneFejl: null, klimaalarmerIDag: null,
      sensorerAktive: null, eksterneLeverandoerer: null,
      facilityOmkostningOere: null, anslaaetServiceOere: null,
      aktiverDeltaPct: null, servicepunkterDelta: null, aabneSagerDelta: null,
      planlagtVedligeholdDelta: null,
    },
    indkoeb: {
      aabneOrdrer: null, fakturaerTilGodkendelse: null,
      indkoebsprisafvigelser: null, varerTilGodkendelse: null,
      manglerFaktura: null, leveranceTilTidenPct: null,
      aabneOrdrerDeltaPct: null, fakturaerTilGodkendelseDeltaPct: null,
      prisafvigelserDelta: null, leveranceTilTidenDeltaPoint: null,
    },
    /* ⚠ FLÅDEN OG BEMANDINGEN KAN IKKE DELES PÅ DIVISION — se hovedet.
       Felterne står med null frem for at blive udeladt: så kan man se af
       noden at spørgsmålet er stillet og ikke besvaret. */
    flaade: {
      aktive: null, udeAfDrift: null, paaVaerksted: null, serviceInden30: null,
      omkostningPrKmOere: null, omkostningPrKmDeltaOere: null,
      nedetidPct: null, ikkeLinkedeFakturaer: null,
    },
    bemanding: {
      planlagt: null, disponeret: null, ledig: null, underbemandede: null,
      chauffoerPlanlagt: null, chauffoerDisponeret: null,
      kompetencerUdloeber: null, medarbejdereAktive: null, fravaerIDag: null,
    },
  };
}

/* ---- Det der KAN regnes ------------------------------------------------ */

/**
 * Kunder i divisionen.
 *
 * ⚠ `tilbud` ER null OG IKKE NUL. Der findes ingen `tilbud`-node — formen er
 * ikke besluttet, og et tilbud kan gå til et EMNE der ikke er kunde endnu.
 * Se demo-kunder.js.
 */
export function kundetal(kunder = [], division, nu = Date.now()) {
  const mine = kunder.filter((k) => iDivision(k, division));
  return {
    aktive: mine.filter((k) => k.aktiv !== false).length,
    aftalerUdloeber: mine.filter(
      (k) => Number.isFinite(k.aftaleUdloeberMs)
        && k.aftaleUdloeberMs > nu
        && k.aftaleUdloeberMs - nu <= 30 * DAG).length,
    tilbud: null,
    tilbudKraeverOpfoelgning: null,
    daekningsbidragOere: null,
    aktiveDeltaPct: null,
    daekningsbidragDeltaPct: null,
  };
}

/**
 * ⚠ `ikkeFaktureretOere` ER UDFØRT ARBEJDE UDEN ET LÅST GRUNDLAG.
 *
 * Ikke "ufaktureret omsætning", og ikke summen af åbne bookinger. Beslutning
 * 25 skærpede betydningen: en etape der er kørt, tæller først som faktureret
 * når det grundlag den ligger på, er LÅST — godkendt er ikke nok, for et
 * godkendt grundlag kan stadig erstattes.
 *
 * ⚠ OG ET ERSTATTET GRUNDLAG TÆLLER IKKE. `erstattetAfId` gør det ugyldigt;
 * regnede vi det med, ville en rettelse pynte på tallet.
 *
 * ⚠ BELØBET KOMMER FRA GRUNDLAGET, IKKE FRA ETAPEN. En etape bærer ingen
 * pris. Kan vi ikke se hvad et forløb er værd, kan vi ikke lægge det til — og
 * så er svaret `null` for HELE feltet frem for en sum der mangler noget.
 * `forloeb` står ved siden af, så man kan se hvor meget der ikke kunne
 * prissættes.
 */
export function ikkeFaktureretOere(etaper = [], grundlag = [], division) {
  const laasteForloeb = new Set(
    grundlag
      .filter((g) => g.tilstand === "laast" && !g.erstattetAfId && g.bookingId)
      .map((g) => g.bookingId));

  const udfoerte = etaper.filter(
    (e) => iDivision(e, division) && e.tilstand === "udfoert" && e.bookingId);

  const ufaktureret = [
    ...new Set(udfoerte.filter((e) => !laasteForloeb.has(e.bookingId)).map((e) => e.bookingId)),
  ];

  let sum = 0;
  for (const bookingId of ufaktureret) {
    const g = grundlag.find(
      (x) => x.bookingId === bookingId && !x.erstattetAfId
        && Number.isFinite(x.beloebOere));
    if (!g) return { oere: null, forloeb: ufaktureret.length, udenPris: true };
    sum += g.beloebOere;
  }
  return { oere: sum, forloeb: ufaktureret.length, udenPris: false };
}

/** Disponeringen, af etaperne. */
export function disponeringstal(etaper = [], division) {
  const mine = etaper.filter((e) => iDivision(e, division));
  return {
    planlagteOpgaver: mine.filter((e) => e.tilstand === "reserveret").length,
    aabneEtaper: mine.filter((e) => e.tilstand === "aaben").length,
    ledigKapacitetPct: null,
    forsinkelsesrisiko: null,
    konflikter: null,
  };
}

/* ---- Deltaerne --------------------------------------------------------- */

/**
 * Periodeafvigelse i PROCENT — eller `null`.
 *
 * ⚠ NULL VED FØRSTE KØRSEL. Der er ingen forrige at måle imod, og 0 % ville
 * betyde "uændret" — en påstand vi ikke kan bakke op.
 *
 * ⚠ OG NULL NÅR GRUNDLAGET VAR NUL. En stigning fra 0 til 5 er ikke
 * "uendelig procent"; den er ikke en procent. Antallet står ved siden af.
 */
export const deltaPct = (nyt, gammelt) => {
  if (!Number.isFinite(nyt) || !Number.isFinite(gammelt) || gammelt === 0) return null;
  return Math.round(((nyt - gammelt) / gammelt) * 1000) / 10;
};

/**
 * Periodeafvigelse i PROCENTPOINT — eller `null`.
 *
 * ⚠ IKKE DET SAMME SOM deltaPct. 68 % der bliver til 72 % er +4 POINT, ikke
 * +5,9 %. Feltnavnet siger hvilket, og blandes de to, er tallet rigtigt på
 * den ene læsning og forkert på den anden — uden at nogen kan se hvilken.
 */
export const deltaPoint = (nyt, gammelt) => {
  if (!Number.isFinite(nyt) || !Number.isFinite(gammelt)) return null;
  return Math.round((nyt - gammelt) * 10) / 10;
};

/**
 * Hele nøgletalsobjektet for én division.
 *
 * `forrige` er sidste kørsels objekt for samme division, eller null. Deltaer
 * regnes af den; første kørsel giver `null` overalt.
 */
export function beregnKpi({
  division, kunder = [], etaper = [], grundlag = [], forrige = null,
  nu = Date.now(),
}) {
  const tomme = udenKilde();
  const kunde = kundetal(kunder, division, nu);
  const ikkeFakt = ikkeFaktureretOere(etaper, grundlag, division);
  const disp = disponeringstal(etaper, division);

  return {
    ...tomme,
    beregnetMs: nu,
    kunder: {
      ...kunde,
      aktiveDeltaPct: deltaPct(kunde.aktive, forrige?.kunder?.aktive),
    },
    oekonomi: {
      /* ⚠ BESLUTNING 25's BETYDNING. Se ikkeFaktureretOere(). */
      ikkeFaktureretOere: ikkeFakt.oere,
      ikkeFaktureretForloeb: ikkeFakt.forloeb,
      ikkeFaktureretDeltaPct: deltaPct(ikkeFakt.oere, forrige?.oekonomi?.ikkeFaktureretOere),
      /* Uden `indkoeb` er der ingen driftsomkostninger at lægge sammen. */
      driftsomkostningerOere: null,
      driftsomkostningerDeltaPct: null,
      budgetOere: null,
      daekningsgradPct: null,
      maalDaekningsgradPct: null,
      daekningsgradDeltaPoint: null,
      driftstimer: null,
      planlagtPct: null,
      akutPct: null,
    },
    disponering: {
      ...disp,
      planlagteOpgaverDeltaPct: deltaPct(
        disp.planlagteOpgaver, forrige?.disponering?.planlagteOpgaver),
    },
    /* ⚠ TOM LISTE, IKKE null. Afvigelserne er en LISTE — findes der ingen,
       er svaret en tom liste, og det er et svar. Se demo-kpi.js. */
    afvigelser: [],
    warehouse: { carriereUdenLokationDelta: null },
  };
}
