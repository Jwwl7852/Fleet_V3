/* src/moduler/Oekonomi.jsx
 * Økonomi & Rapporter
 *
 * I mockuppen stod budgetafvigelsen som '-72.560 kr' på KPI-kortet og '+72.560'
 * i tabellen nedenunder — samme tal, samme side, modsat fortegn.
 * Gem altid (faktisk − budget) og lad deviation() bestemme visningen.
 *
 * Her er den regel gennemført: budgetafvigelsen beregnes ÉN gang i
 * budgetAfvigelseOere og bruges både på KPI-kortet og i totalrækken. Der er
 * ikke to steder at skrive tallet, så de kan ikke få hvert sit fortegn.
 *
 * Denne skærm er den modsatte pol af Kunder & Priser: omkostninger har
 * betterWhen 'lower', dækningsgrad 'higher'. Derfor står +72.560 kr rødt og
 * +2 pct-point grønt ved siden af hinanden i samme KPI-række, mens −5.600 kr
 * på Forsikring er grønt og −18.400 kr på Kunder er rødt. Samme deviation(),
 * kun flaget skifter.
 *
 * Tre ting mere fra mockuppen:
 *
 *  1. 'Største afvigelser' havde sin EGEN liste, hvor +18.400 kr hed
 *     "Reparationer – Bil 1", mens Dashboard kaldte samme beløb
 *     "Bil 155 – Dækudskiftning". Kortet er tilbage — men det læser
 *     `k.afvigelser`, SAMME felt som Dashboard. Fejlen var ikke kortet; den
 *     var en anden liste med sine egne navne. Med én kilde kan de to skærme
 *     ikke give det samme beløb hvert sit navn.
 *
 *  2. Tabellen havde en dækningsgradkolonne pr. omkostningskategori.
 *     Dækningsgrad er et forholdstal mellem omsætning og omkostninger —
 *     Værksted og Dæk har ingen omsætning. Totalrækken får tallet fra
 *     KPI-noden, kategorirækkerne får '—'.
 *
 *  3. 'Pr. km' er driftsomkostning UDEN chauffør (3,42 kr) — ikke
 *     kalkulationsprisen i Bookingopsætning (8,40 kr, inkl. chauffør).
 *     Beslutning 11. Kortet skriver forskellen frem og linker derhen.
 *
 * Graferne viser faste 12 måneder og følger ikke periodevælgeren: budget
 * følger regnskabsår, ikke et rullende vindue på 7 eller 90 dage. Den
 * nyeste måned hentes fra KPI-noden, så grafens sidste søjle og KPI-kortet
 * ovenfor ikke kan vise hver sit.
 *
 * ---------------------------------------------------------------------------
 * FILTERKORTET HAR ÉN RIGTIG VÆLGER, IKKE FIRE
 *
 * Mockuppen har Virksomhed, Periode, Afdeling og Rapporttype. De TRE FØRSTE
 * ejer shellen allerede: virksomheden er tenantvælgeren, perioden er
 * periodevælgeren, og afdelingen er Gods/Bus-toggle'en. Bygget om her ville
 * de være de samme valg to steder — og to vælgere kan blive uenige om hvilken
 * der gjaldt, uden at nogen kan se hvilken.
 *
 * Kun `Rapporttype` hører denne skærm til, og den står derfor alene.
 *
 * ⚠ KPI-KORTENE SAMMENLIGNER MED FORRIGE PERIODE, IKKE MED BUDGET. Kort nr. 3
 * ER budgetsammenligningen; viste kort nr. 1 den også, stod samme oplysning to
 * gange, og skærmen ville se ud som om den havde fire tal og kun have tre.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import {
   DEMO_DAEKNINGSGRAD_HISTORIK, DEMO_KLAR_TIL_FAKTURERING,
  omkostningsserie, maanedsEtiketter
} from "../fleet/demo-oekonomi.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { kr, num, pct, dato, deviation, deviationPct, alvorTone, ALVOR } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, MiniLinje, Gitter,
  Afvigelse, Soejlegraf, Linjegraf, MiniKurve, Ikon, Knap, Tom
} from "../fleet/ui.jsx";

/* Rapporttype. Filteret rammer tabellen og omkostningsgrafen — ikke
   dækningsgradsgrafen, som ikke findes pr. omkostningskategori. */
const RAPPORTER = [
  { key: "alle", label: "Samlet drift" },
  { key: "vaerksted", label: "Værksted" },
  { key: "braendstof", label: "Brændstof" },
  { key: "daek", label: "Dæk" },
  { key: "forsikring", label: "Forsikring" },
  { key: "oevrige", label: "Øvrige" },
];

/* Omkostningskategorier — ét sæt PR. DIVISION, som KPI-noden.
   Var det ét fælles sæt, ville Økonomi vise godsomkostninger under Bus,
   og så havde vi flyttet inkonsistensen i stedet for at fjerne den.

   Hvert sæts faktiskOere og budgetOere summer PRÆCIS til divisionens
   k.oekonomi.driftsomkostningerOere og k.oekonomi.budgetOere — ellers ville
   tabellens rækker og dens totalrække sige hver sit, hvilket er den fejl
   hele skærmen handler om.
     gods: 842.615 kr faktisk / 770.055 kr budget
     bus:  343.460 kr faktisk / 333.500 kr budget

   historik er de 11 foregående måneder; den 12. er det aktuelle tal, så
   grafen ender i det samme som nøgletallet. budgetOere er månedligt og fladt
   (årsbudget delt med 12). forrigeOere = sidste element i historik. */

/* Månedsetiketter regnes ud fra i dag. setDate(1) først, ellers ruller
   31. august tilbage til 3. marts. */
const MAANEDER = maanedsEtiketter(12);

/* Nævnerne til omkostning pr. enhed ligger i demo-kpi.js som
   oekonomi.driftstimer og opgaver.udfoerteOpgaver — ikke som konstanter her.

   Reglen: et manglende KPI-tal DEFINERES i demo-kpi.js, det hardkodes ikke i
   en skærm. Så er skærmen rigtig, og kun aggregeringen mangler. Begge felter
   står på KPI-efterslæbet i README. De står stadig synligt i labelen, så det
   fremgår hvad der er divideret med. */

/* Klar til fakturering. Nummerformatet er PRÆFIKS-ÅÅÅÅ-NNNNN (beslutning 8).
   En faktureringsklar opgave er en transaktion, så division er altid gods
   eller bus — aldrig "faelles".
   De viste må aldrig summe til mere end divisionens ikkeFaktureretOere —
   ellers ville de resterende opgaver have negativ værdi.
   gods 140.240 af 186.240 kr · bus 55.000 af 72.400 kr. */

/**
 * En afvigelse man ikke har, er ikke en afvigelse på nul.
 * Samme note som på Facility, Indkøb og Kunder.
 */
const afvig = (vaerdi, opts, note = "vs. forrige periode") =>
  Number.isFinite(vaerdi)
    ? { afvigelse: deviation(vaerdi, opts), note }
    : { note: "afvigelsen er ikke aggregeret endnu" };

export default function Oekonomi() {
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();
  const { dage } = useFleet();
  const [rapport, setRapport] = useState("alle");

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* ÉN beregning. KPI-kortet og totalrækken læser begge herfra. */
  const budgetAfvigelseOere = k.oekonomi.driftsomkostningerOere - k.oekonomi.budgetOere;
  const budgetAfvigelsePct = deviationPct(k.oekonomi.driftsomkostningerOere, k.oekonomi.budgetOere);
  /* ⚠ HER STOD "REGNET, MEN VISES IKKE". Tallet blev beregnet og tabt, og
     noten forklarede hvad det betød — til ingen. Det står nu under grafen i
     "Dækningsgrad mod målsætning", som er det ene sted på skærmen hvor målet
     overhovedet nævnes. Se beslutning 67.

     ⚠ OG SUBTRAKTIONEN VAR SELV EN FÆLDE. `daekningsgradPct - null` er
     `daekningsgradPct`, og `null - maal` er `-maal` — begge ser ud som
     MÅLINGER, og gaten i `pct()` nås aldrig, fordi tallet er blevet rigtigt
     på vejen. Der skal tjekkes FØR regnestykket, ikke efter. Fejlen var
     usynlig så længe tallet ikke blev vist; det er den slags der venter på
     at nogen finder brug for den. */
  const daekningsgradAfv =
    Number.isFinite(k.oekonomi.daekningsgradPct)
    && Number.isFinite(k.oekonomi.maalDaekningsgradPct)
      ? k.oekonomi.daekningsgradPct - k.oekonomi.maalDaekningsgradPct
      : null;

  /* Kategorierne foldes ud til den valgte division. Ét sæt tal, ikke to
     der kan drive fra hinanden. */
  const { kategorier, historik: historikTotal } = omkostningsserie();
  const forrigeSum = kategorier.reduce((s, c) => s + c.forrigeOere, 0);

  const valgt = kategorier.find((c) => c.id === rapport) || null;

  const total = {
    id: "alle",
    navn: "Driftsomkostninger i alt",
    faktiskOere: k.oekonomi.driftsomkostningerOere,
    budgetOere: k.oekonomi.budgetOere,
    forrigeOere: forrigeSum,
    historik: historikTotal,
    daekningsgradPct: k.oekonomi.daekningsgradPct
  };
  const raekker = valgt ? [valgt] : [total, ...kategorier];

  const omkostningSerie = valgt ? [...valgt.historik, valgt.faktiskOere]
                                : [...historikTotal, k.oekonomi.driftsomkostningerOere];
  const budgetMaanedligOere = valgt ? valgt.budgetOere : k.oekonomi.budgetOere;

  const dgHistorik = DEMO_DAEKNINGSGRAD_HISTORIK;
  const omkostningPunkter = MAANEDER.map((m, i) => ({
    label: m, vaerdier: [omkostningSerie[i]]
  }));
  /* ⚠ MÅLET ER EN SERIE, IKKE EN ETIKET. Tegnes det som en stiplet linje ved
     siden af den faktiske, kan man se hvornår man krydsede den — en pille der
     siger "over mål" fortæller kun hvordan det står lige nu. */
  const daekningsgradPunkter = MAANEDER.map((m, i) => ({
    label: m,
    vaerdier: [i < 11 ? dgHistorik[i] : k.oekonomi.daekningsgradPct,
               k.oekonomi.maalDaekningsgradPct]
  }));

  const timer = k.oekonomi.driftstimer;
  const udfoerte = k.opgaver.udfoerteOpgaver;
  const prDriftstimeOere = Math.round(k.oekonomi.driftsomkostningerOere / timer);
  const prOpgaveOere = Math.round(k.oekonomi.driftsomkostningerOere / udfoerte);

  /* Faktureringsklare opgaver er transaktioner — ingen "faelles". */
  const klarTilFakturering = DEMO_KLAR_TIL_FAKTURERING
    /* ⚠ HER STOD `.filter((r) => r.division === division)`, hvor BEGGE sider
       var `undefined` efter beslutning 70 — filteret slap kun igennem fordi
       `undefined === undefined` er sandt. Et filter der virker ved et
       tilfælde, holder op med at virke uden varsel. Se beslutning 87. */
    .slice(0, 5);

  /* ⚠ SAMME FELT SOM DASHBOARD. Mockuppens fejl var ikke kortet — den var en
     SELVSTÆNDIG liste, hvor +18.400 kr hed noget andet end på Dashboard. */
  const afvigelser = k.afvigelser || [];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <KpiRaekke>
        {/* ⚠ KORT 1 OG 4 SAMMENLIGNER MED FORRIGE PERIODE. Kort 3 ER
            budgetsammenligningen — viste kort 1 den også, stod samme
            oplysning to gange. */}
        <KpiKort label="Driftsomkostninger" vaerdi={kr(k.oekonomi.driftsomkostningerOere)}
                 ikon={<Ikon navn="kasse" />} tone="ikon-4" rund til="/oekonomi"
                 {...afvig(k.oekonomi.driftsomkostningerDeltaPct, { betterWhen: "lower", unit: "pct" })} />
        <KpiKort label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)}
                 ikon={<Ikon navn="dokument" />} tone="ikon-2" rund til="/oekonomi/fakturering"
                 {...afvig(k.oekonomi.ikkeFaktureretDeltaPct, { betterWhen: "lower", unit: "pct" })} />
        {/* BEREGNET af de to felter, ikke gemt. Det var mockuppens fejl: samme
            tal med modsat fortegn to steder på samme side. */}
        <KpiKort label="Budgetafvigelse"
                 vaerdi={deviation(budgetAfvigelseOere, { betterWhen: "lower", unit: "kr" }).text}
                 ikon={<Ikon navn="seddel" />} tone="ikon-5" rund til="/oekonomi"
                 afvigelse={deviation(budgetAfvigelsePct, { betterWhen: "lower", unit: "pct" })}
                 note="vs. budget · faktisk − budget" />
        {/* ⚠ PROCENTPOINT. 68 % der bliver til 72 % er +4 point, ikke +4 %. */}
        <KpiKort label="Dækningsgrad" vaerdi={pct(k.oekonomi.daekningsgradPct)}
                 ikon={<Ikon navn="skjold" />} tone="ikon-6" rund til="/opsaetning/kunder"
                 {...afvig(k.oekonomi.daekningsgradDeltaPoint, { betterWhen: "higher" },
                           "procentpoint vs. forrige periode")} />
      </KpiRaekke>

      <Kort>
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="oe-rapport">Rapporttype</label>
            <select id="oe-rapport" value={rapport} onChange={(e) => setRapport(e.target.value)}>
              {RAPPORTER.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div className="fc-filtre-knapper">
            <Knap variant="primaer" disabled
                  title="Eksport er ikke bygget endnu — formatet skal aftales med bogholderiet først.">
              Eksportér rapport
            </Knap>
          </div>
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Mockuppen har fire vælgere her. De tre ejer <b>shellen</b> allerede:{" "}
          <b>virksomhed</b> er tenantvælgeren, <b>periode</b> er periodevælgeren, og{" "}
          <b>afdeling</b> er Gods/Bus-toggle'en — alle tre i toppen. Bygget om her ville
          de være de samme valg to steder, og to vælgere kan blive uenige om hvilken der
          gjaldt uden at nogen kan se hvilken. Kun <b>rapporttypen</b> hører denne skærm
          til.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,1.15fr) minmax(0,1.15fr) minmax(0,0.85fr)">
        <Kort titel={`Driftsomkostninger vs. budget — ${valgt ? valgt.navn : "samlet drift"}`}>
          <Soejlegraf
            punkter={omkostningPunkter}
            serier={[{ navn: "Omkostninger", tone: "brand" }]}
            maal={{ vaerdi: budgetMaanedligOere, navn: `Budget ${kr(budgetMaanedligOere)}/md.` }}
            format={(v) => kr(v)}
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Seneste 12 måneder. Grafen følger <b>ikke</b> periodevælgeren — budget lægges
            pr. regnskabsår, ikke pr. rullende vindue på 7 eller 90 dage. Nyeste søjle er
            samme tal som nøgletallet ovenfor, så de to ikke kan vise hver sit.
            Budgettet er <b>en linje og ikke en søjle</b>: det er et niveau man ligger
            over eller under, ikke en mængde man kan lægge sammen.
          </p>
        </Kort>

        <Kort titel="Dækningsgrad mod målsætning">
          <Linjegraf
            punkter={daekningsgradPunkter}
            serier={[{ navn: "Dækningsgrad" }, { navn: `Mål ${pct(k.oekonomi.maalDaekningsgradPct)}`, stiplet: true }]}
            format={(v) => pct(v)}
          />
          {/* ⚠ PROCENTPOINT, IKKE PROCENT — og `deviation()` frem for en
              håndskrevet streng, så fortegnets farve er den samme her som i
              hvert andet af appens tal. Grafen viser HVORNÅR man krydsede
              målet; tallet viser HVOR LANGT der er lige nu, og de to
              spørgsmål har hver sit svar. */}
          <p className="fc-row" style={{ marginTop: 10 }}>
            <span className="fc-hint">
              Mod målet på {pct(k.oekonomi.maalDaekningsgradPct)}, i procentpoint
            </span>
            <Afvigelse vaerdi={deviation(daekningsgradAfv,
              { betterWhen: "higher", dec: 1 })} />
          </p>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Står uden for rapportfilteret: dækningsgrad er forholdet mellem omsætning og
            omkostninger og findes ikke pr. omkostningskategori. <b>Målet er tegnet som
            en serie</b>, ikke som en etiket — så kan man se hvornår man krydsede det. En
            pille der siger "over mål" fortæller kun hvordan det står lige nu.
          </p>
        </Kort>

        <Kort titel="Største afvigelser"
              handling={<Link className="fc-a" to="/">Se på Dashboard</Link>}>
          {!afvigelser.length ? (
            <Tom>Ingen afvigelser i perioden.</Tom>
          ) : (
            <Tabel
              kolonner={[
                { key: "emne", label: "Emne", render: (r) => (
                    <div className="fc-tolinje">
                      <b>{r.emne}</b>
                      <span>{r.kilde}</span>
                    </div>
                  ) },
                { key: "beloeb", label: "Afvigelse", num: true, render: (r) => (
                    r.beloebOere == null
                      /* ⚠ IKKE ALLE AFVIGELSER ER ET BELØB. "Ni gange på 30
                         dage" er en hyppighed; et beløb på nul ville påstå at
                         den var gratis. */
                      ? <span className="fc-neutral">ikke opgjort</span>
                      : <Afvigelse vaerdi={r.beloebOere} betterWhen="lower" unit="kr" />
                  ) },
                { key: "alvor", label: "Alvor", render: (r) => (
                    <Pille tone={alvorTone(r.alvor)}>{ALVOR[r.alvor]}</Pille>
                  ) },
              ]}
              raekker={afvigelser}
              tom="Ingen afvigelser i perioden."
            />
          )}
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ Listen læser <b>samme felt som Dashboard</b>. Mockuppens fejl var ikke
            kortet — den var en <b>selvstændig</b> liste, hvor de +18.400 kr hed
            "Reparationer – Bil 1" her og "Bil 155 – Dækudskiftning" på Dashboard. Med én
            kilde kan de to skærme ikke give det samme beløb hvert sit navn.
          </p>
        </Kort>
      </Gitter>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel="Økonomiske nøgletal">
          <Tabel
            kolonner={[
              { key: "navn", label: "Rapport",
                render: (r) => (r.id === "alle" ? <b>{r.navn}</b> : r.navn) },
              { key: "periode", label: "Periode", render: () => `Seneste ${dage} dage` },
              { key: "omkostninger", label: "Omkostninger", num: true,
                render: (r) => kr(r.faktiskOere) },
              { key: "budget", label: "Budget", num: true, render: (r) => kr(r.budgetOere) },
              { key: "afvKr", label: "Afvigelse", num: true,
                render: (r) => <Afvigelse vaerdi={r.faktiskOere - r.budgetOere}
                                          betterWhen="lower" unit="kr" /> },
              { key: "afvPct", label: "Afvigelse %", num: true,
                render: (r) => <Afvigelse vaerdi={deviationPct(r.faktiskOere, r.budgetOere)}
                                          betterWhen="lower" unit="pct" /> },
              { key: "daekningsgrad", label: "Dækningsgrad", num: true,
                render: (r) => (r.daekningsgradPct == null
                  ? <span className="fc-neutral">—</span>
                  : pct(r.daekningsgradPct)) },
              /* ⚠ KURVEN STÅR ALDRIG ALENE. Tallet bærer retning og størrelse;
                 kurven er et form-indtryk. En kurve uden akse kan vise hvad
                 som helst, og læses den som et niveau, er den løgn. */
              { key: "trend", label: "Trend", render: (r) => {
                  const t = deviationPct(r.faktiskOere, r.forrigeOere);
                  const d = deviation(t, { betterWhen: "lower", unit: "pct" });
                  return (
                    <span className="fc-trend">
                      <MiniKurve punkter={[...(r.historik || []), r.faktiskOere]} tone={d.tone} />
                      <span className={`fc-${d.tone}`}>{d.pil} {d.text}</span>
                    </span>
                  );
                } },
            ]}
            raekker={raekker}
            tom="Ingen rapportdata i perioden."
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Afvigelsen er <b>faktisk − budget</b>, og omkostninger har{" "}
            <b>betterWhen: lower</b> — plus er rødt, minus er grønt. På Kunder &amp;
            Priser er det omvendt, fordi tallet dér er omsætning. Kategorirækkerne summer
            til totalrækken, som kommer fra KPI-noden. <b>Trend</b> er mod forrige måned;
            kurven ved siden af er de tolv måneder og er et <b>form-indtryk</b>, ikke en
            aflæsning — derfor står tallet altid ved siden af. Dækningsgrad står kun på
            totalrækken: Værksted og Dæk har ingen omsætning at sætte omkostningen i
            forhold til.
          </p>
        </Kort>

        <div className="fc-grid">
          <Kort titel="Omkostninger pr. enhed">
            <MiniLinje label="Pr. km (uden chauffør)"
                       vaerdi={`${kr(k.flaade.omkostningPrKmOere, 2)}/km`} />
            <MiniLinje label={`Pr. driftstime (${num(timer)})`}
                       vaerdi={kr(prDriftstimeOere, 2)} />
            <MiniLinje label={`Pr. udført opgave (${num(udfoerte)})`}
                       vaerdi={kr(prOpgaveOere, 2)} />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Alle tre er <b>beregnet</b> af driftsomkostningen divideret med nævneren i
              parentes — de er ikke gemte felter. Km-tallet er{" "}
              <b>driftsomkostning uden chauffør</b>. Kalkulationsprisen pr. km i{" "}
              <Link className="fc-a" to="/booking/opsaetning">Bookingopsætning</Link> er
              inkl. chauffør og derfor et andet, højere tal. To felter der begge hed
              "kr/km" i mockupsene — beslutning 11.
            </p>
          </Kort>

          <Kort titel="Opgaver klar til fakturering"
                handling={<Link className="fc-a" to="/oekonomi/fakturering">
                  Gå til fakturering
                </Link>}>
            {/* Mockuppens to store tal side om side. Begge kommer fra kpi/ —
                de summes ikke ud af rækkerne nedenfor, som er et udsnit. */}
            <div className="fc-fakt">
              <span className="fc-fakt-ico fc-tone-ikon-4"><Ikon navn="dokument" /></span>
              <div className="fc-fakt-tal">
                <b>{num(k.opgaver.klarTilFakturering)}</b>
                <span>opgaver</span>
              </div>
              <div className="fc-fakt-tal">
                <b>{kr(k.oekonomi.ikkeFaktureretOere)}</b>
                <span>samlet beløb</span>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Tabel
                kolonner={[
                  { key: "id", label: "Nummer" },
                  { key: "kunde", label: "Kunde" },
                  { key: "afsluttet", label: "Afsluttet", render: (r) => dato(r.afsluttetMs) },
                  { key: "beloeb", label: "Beløb", num: true, render: (r) => kr(r.beloebOere) },
                ]}
                raekker={klarTilFakturering}
                tom="Ingen opgaver afventer fakturering."
              />
            </div>
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Viser de {num(klarTilFakturering.length)} ældste. Antal og beløb ovenfor
              kommer fra <b>kpi/</b> — de summes <b>ikke</b> ud af rækkerne, som er et
              udsnit. En total ud af et udsnit er beslutning 6 brudt.
            </p>
          </Kort>
        </div>
      </Gitter>

      <p className="fc-hint">Alle beløb er ekskl. moms, medmindre andet er angivet.</p>
    </div>
  );
}
