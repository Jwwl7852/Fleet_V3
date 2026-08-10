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
 *  1. 'Største afvigelser' var en selvstændig liste, hvor +18.400 kr hed
 *     "Reparationer – Bil 1", mens Dashboard kaldte samme beløb
 *     "Bil 155 – Dækudskiftning". Listen findes ikke længere. Den største
 *     afvigelse udledes af tabellens egne rækker og står i kortets hoved, så
 *     der ikke er noget andet sted at give beløbet et andet navn.
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
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import {
  DEMO_OMKOSTNINGSKATEGORIER, DEMO_DAEKNINGSGRAD_HISTORIK, DEMO_KLAR_TIL_FAKTURERING,
  omkostningsserie, maanedsEtiketter,
} from "../fleet/demo-oekonomi.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { kr, num, pct, dato, deviation, deviationPct } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Henter, Datatilstand, MiniLinje, Gitter, Afvigelse, Soejlegraf,
} from "../fleet/ui.jsx";

const NU = Date.now();
const D = 86400000;

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

/* Dækningsgrad pr. måned, pr. division. Sidste punkt kommer fra KPI-noden.
   Gods ender over målet, bus under — samme graf, modsat side af stregen. */

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

export default function Oekonomi() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();
  const { dage, division } = useFleet();
  const [rapport, setRapport] = useState("alle");

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* ÉN beregning. KPI-kortet og totalrækken læser begge herfra. */
  const budgetAfvigelseOere = k.oekonomi.driftsomkostningerOere - k.oekonomi.budgetOere;
  const budgetAfvigelsePct = deviationPct(k.oekonomi.driftsomkostningerOere, k.oekonomi.budgetOere);
  const daekningsgradAfv = k.oekonomi.daekningsgradPct - k.oekonomi.maalDaekningsgradPct;

  /* Kategorierne foldes ud til den valgte division. Ét sæt tal, ikke to
     der kan drive fra hinanden. */
  const { kategorier, historik: historikTotal } = omkostningsserie(division);
  const forrigeSum = kategorier.reduce((s, c) => s + c.forrigeOere, 0);

  const valgt = kategorier.find((c) => c.id === rapport) || null;

  const total = {
    id: "alle",
    navn: "Driftsomkostninger i alt",
    faktiskOere: k.oekonomi.driftsomkostningerOere,
    budgetOere: k.oekonomi.budgetOere,
    forrigeOere: forrigeSum,
    daekningsgradPct: k.oekonomi.daekningsgradPct,
  };
  const raekker = valgt ? [valgt] : [total, ...kategorier];

  /* Største afvigelse udledes af rækkerne — den skrives ikke som sin egen
     post, som mockuppens "Største afvigelser" gjorde. */
  const stoerste = [...kategorier].sort(
    (a, b) => Math.abs(b.faktiskOere - b.budgetOere) - Math.abs(a.faktiskOere - a.budgetOere)
  )[0];

  const omkostningSerie = valgt ? [...valgt.historik, valgt.faktiskOere]
                                : [...historikTotal, k.oekonomi.driftsomkostningerOere];
  const budgetMaanedligOere = valgt ? valgt.budgetOere : k.oekonomi.budgetOere;

  const dgHistorik = DEMO_DAEKNINGSGRAD_HISTORIK[division] || DEMO_DAEKNINGSGRAD_HISTORIK.gods;
  const omkostningPunkter = MAANEDER.map((m, i) => ({
    label: m, vaerdier: [omkostningSerie[i], budgetMaanedligOere],
  }));
  const daekningsgradPunkter = MAANEDER.map((m, i) => ({
    label: m,
    vaerdier: [i < 11 ? dgHistorik[i] : k.oekonomi.daekningsgradPct],
  }));

  const timer = k.oekonomi.driftstimer;
  const udfoerte = k.opgaver.udfoerteOpgaver;
  const prDriftstimeOere = Math.round(k.oekonomi.driftsomkostningerOere / timer);
  const prOpgaveOere = Math.round(k.oekonomi.driftsomkostningerOere / udfoerte);

  /* Faktureringsklare opgaver er transaktioner — ingen "faelles". */
  const klarTilFakturering = DEMO_KLAR_TIL_FAKTURERING
    .filter((r) => r.division === division)
    .slice(0, 5);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <KpiRaekke>
        <KpiKort label="Driftsomkostninger" vaerdi={kr(k.oekonomi.driftsomkostningerOere)}
                 afvigelse={deviation(budgetAfvigelsePct, { betterWhen: "lower", unit: "pct" })}
                 note="vs. budget" />
        <KpiKort label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)}
                 note={`${num(k.opgaver.klarTilFakturering)} opgaver, ekskl. moms`} />
        <KpiKort label="Budgetafvigelse"
                 vaerdi={deviation(budgetAfvigelseOere, { betterWhen: "lower", unit: "kr" }).text}
                 afvigelse={deviation(budgetAfvigelsePct, { betterWhen: "lower", unit: "pct" })}
                 note="faktisk − budget" />
        <KpiKort label="Dækningsgrad" vaerdi={pct(k.oekonomi.daekningsgradPct)}
                 afvigelse={deviation(daekningsgradAfv, { betterWhen: "higher", unit: "pct" })}
                 note="%-point vs. mål" />
      </KpiRaekke>

      <div className="fc-faner" role="tablist" style={{ marginBottom: 0 }}>
        {RAPPORTER.map((r) => (
          <button key={r.key} role="tab" className="fc-fane" aria-selected={rapport === r.key}
                  onClick={() => setRapport(r.key)}>{r.label}</button>
        ))}
      </div>

      <Gitter kolonner="repeat(auto-fit, minmax(330px, 1fr))">
        <Kort titel={`Driftsomkostninger vs. budget — ${valgt ? valgt.navn : "samlet drift"}`}>
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Seneste 12 måneder. Grafen følger ikke periodevælgeren — budget lægges pr.
            regnskabsår, ikke pr. rullende vindue. Nyeste måned er samme tal som nøgletallet
            ovenfor.
          </p>
          <Soejlegraf
            punkter={omkostningPunkter}
            serier={[{ navn: "Faktisk", tone: "brand" }, { navn: "Budget", tone: "neutral" }]}
            format={(v) => kr(v)}
          />
        </Kort>

        <Kort titel="Dækningsgrad mod målsætning">
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Står uden for rapportfilteret: dækningsgrad er forholdet mellem omsætning og
            omkostninger og findes ikke pr. omkostningskategori.
          </p>
          <Soejlegraf
            punkter={daekningsgradPunkter}
            serier={[{ navn: "Dækningsgrad", tone: "ok" }]}
            maal={{ vaerdi: k.oekonomi.maalDaekningsgradPct,
                    navn: `Mål ${pct(k.oekonomi.maalDaekningsgradPct)}` }}
            format={(v) => pct(v)}
          />
        </Kort>
      </Gitter>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel="Økonomiske nøgletal"
              handling={
                <span className="fc-hint">
                  Største afvigelse: {stoerste.navn}{" "}
                  <Afvigelse vaerdi={stoerste.faktiskOere - stoerste.budgetOere}
                             betterWhen="lower" unit="kr" />
                </span>
              }>
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Afvigelsen er <b>faktisk − budget</b>, og omkostninger har <b>betterWhen: lower</b>
            {" "}— plus er rødt, minus er grønt. På Kunder &amp; Priser er det omvendt, fordi
            tallet dér er omsætning. Kategorirækkerne summer til totalrækken, som kommer fra
            KPI-noden.
          </p>
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
                render: (r) => (r.daekningsgradPct == null ? "—" : pct(r.daekningsgradPct)) },
              { key: "trend", label: "Trend", num: true,
                render: (r) => <Afvigelse vaerdi={deviationPct(r.faktiskOere, r.forrigeOere)}
                                          betterWhen="lower" unit="pct" /> },
            ]}
            raekker={raekker}
            tom="Ingen rapportdata i perioden."
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Trend er mod forrige måned. Dækningsgrad står kun på totalrækken — Værksted og
            Dæk har ingen omsætning at sætte omkostningen i forhold til.
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
              Km-tallet er <b>driftsomkostning uden chauffør</b>. Kalkulationsprisen pr. km
              i <Link className="fc-a" to="/booking/opsaetning">Bookingopsætning</Link> er
              inkl. chauffør og derfor et andet, højere tal. To felter der begge hed "kr/km"
              i mockupsene.
            </p>
          </Kort>

          <Kort titel="Opgaver klar til fakturering"
                handling={<Link className="fc-a" to="/oekonomi/fakturering">
                  Se alle {num(k.opgaver.klarTilFakturering)}
                </Link>}>
            <MiniLinje label="Opgaver" vaerdi={num(k.opgaver.klarTilFakturering)} />
            <MiniLinje label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)} />
            <div style={{ marginTop: 12 }}>
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
              Viser de {num(klarTilFakturering.length)} ældste. Antal og beløb kommer fra
              KPI-noden — de summes ikke ud af rækkerne her.
            </p>
          </Kort>
        </div>
      </Gitter>

      <p className="fc-hint">Alle beløb er ekskl. moms.</p>
    </div>
  );
}
