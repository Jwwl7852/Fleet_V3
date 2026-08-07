/* src/moduler/Kunder.jsx
 * Kunder & Priser
 *
 * 'Dækningsbidrag (30 dage)' viste 842.615 kr i mockuppen — samme tal som
 * driftsomkostningerne. Det er sit eget felt: kunder.daekningsbidragOere.
 *
 * Salgsprisafvigelser her har betterWhen:'higher' (mistet omsætning er
 * dårligt), mens Økonomis budgetafvigelser har betterWhen:'lower'. Derfor
 * kan minus være rødt her og grønt der — konventionen ligger i deviation().
 *
 * Tre ting mere fra mockuppen der er rettet her:
 *
 *  1. 'Aktive kunder 48'. 48 var også åbne opgaver, aktive køretøjer og
 *     disponerede folk i mockupsene — se noten i useKpi.js. Skærmen læser
 *     kunder.aktive og viser hvad feltet siger, ikke 48.
 *
 *  2. '(30 dage)' stod som fast tekst i overskrifterne. Perioden ejes af
 *     shellen, og useKpi() henter forfra når den skifter. Labels bygges
 *     derfor af `dage` fra useFleet() — ellers påstår kolonnen 30 dage mens
 *     tallene dækker 90.
 *
 *  3. To tal hed "prisafvigelse". De hedder det ikke længere (beslutning 14):
 *     indkoebsprisafvigelse er leverandørsiden — vi betaler, betterWhen
 *     'lower'. salgsprisafvigelse er kundesiden — vi modtager, betterWhen
 *     'higher'. Samme fejl som kr/km i beslutning 11.
 *
 * Satser redigeres ikke på denne skærm. Prisgruppen peger på et satssæt i
 * Bookingopsætning; satserne selv versioneres med gyldigFra (beslutning 7).
 *
 * DATAKILDE: ÉT useListe()-kald. Hovedtabellen, udløbende aftaler,
 * topkunderne og salgsprisafvigelserne er fire visninger af samme hentede
 * datasæt — ikke fire forespørgsler. De kan derfor ikke sige hver sit om
 * samme kunde, og de koster ét opslag.
 */
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import { useListe } from "../fleet/useListe.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { kr, num, pct, dato, deviation, serviceTone } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, MiniLinje, Gitter, Afvigelse,
} from "../fleet/ui.jsx";

const NU = Date.now();
const D = 86400000;

/* Prisgruppen vælger hvilket satssæt en booking regner med. Selve satserne
   ligger i Bookingopsætning — de har gyldigFra og overskrives aldrig. */
const PRISGRUPPER = { A: "A – Fastpris", B: "B – Volumen", C: "C – Spot" };

/* aftalestatus er aftalens tilstand. `aktiv` er noget andet: om kunden
   overhovedet er en levende kunde. Det er `aktiv` der forespørges på
   server-side, for en kunde under genforhandling er stadig en kunde. */
const AFTALESTATUS = {
  aktiv: { label: "Aktiv", tone: "ok" },
  genforhandling: { label: "Genforhandling", tone: "warn" },
  udloeber: { label: "Udløber", tone: "warn" },
  udloebet: { label: "Udløbet", tone: "bad" },
};

/* Demo-datasæt til useListe(). Bruges når der ikke er en database, og som
   fallback hvis læsningen fejler. Beløb i hele øre, ekskl. moms.

   aftaltOere/faktureretOere står kun på de kunder der HAR en afvigelse i
   perioden — salgsprisafvigelseskortet er et filter på samme datasæt, ikke
   en selvstændig liste. */
const DEMO_KUNDER = [
  { id: "nordiskFragt", navn: "Nordisk Fragt A/S", aktiv: true, aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 1 * D, aftaleUdloeberMs: NU + 243 * D,
    omsaetningOere: 14250000, daekningsbidragOere: 4132500,
    aftalestatus: "aktiv", ansvarlig: "Mette Kjær" },
  { id: "skagenSeafood", navn: "Skagen Seafood ApS", aktiv: true, aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 2 * D, aftaleUdloeberMs: NU + 152 * D,
    omsaetningOere: 11840000, daekningsbidragOere: 3078400,
    aftalestatus: "aktiv", ansvarlig: "Søren Dahl" },
  { id: "jyskByggecenter", navn: "Jysk Byggecenter A/S", aktiv: true, aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 3 * D, aftaleUdloeberMs: NU + 30 * D,
    omsaetningOere: 9620000, daekningsbidragOere: 2212600,
    aftalestatus: "genforhandling", ansvarlig: "Mette Kjær",
    aftaltOere: 9620000, faktureretOere: 9913000, afvigelsesAarsag: "Tillæg for ekstra stop" },
  { id: "fynKoel", navn: "Fyn Køl & Frost A/S", aktiv: true, aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 5 * D, aftaleUdloeberMs: NU + 334 * D,
    omsaetningOere: 8875000, daekningsbidragOere: 2751200,
    aftalestatus: "aktiv", ansvarlig: "Anne Bøgh" },
  { id: "hamburgHandel", navn: "Hamburg Handel GmbH", aktiv: true, aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 6 * D, aftaleUdloeberMs: NU + 6 * D,
    omsaetningOere: 7430000, daekningsbidragOere: 1337400,
    aftalestatus: "udloeber", ansvarlig: "Søren Dahl",
    aftaltOere: 7430000, faktureretOere: 5590000, afvigelsesAarsag: "Spotpris under aftalt minimum" },
  { id: "vestjyskLandbrug", navn: "Vestjysk Landbrug AmbA", aktiv: true, aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 8 * D, aftaleUdloeberMs: NU + 24 * D,
    omsaetningOere: 6190000, daekningsbidragOere: 1547500,
    aftalestatus: "genforhandling", ansvarlig: "Peter Lund",
    aftaltOere: 6190000, faktureretOere: 6560500, afvigelsesAarsag: "Færgetillæg viderefaktureret" },
  { id: "aalborgIndustri", navn: "Aalborg Industri A/S", aktiv: true, aftale: "Fastaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 9 * D, aftaleUdloeberMs: NU + 28 * D,
    omsaetningOere: 5420000, daekningsbidragOere: 1463400,
    aftalestatus: "genforhandling", ansvarlig: "Anne Bøgh" },
  { id: "bornholmsMejeri", navn: "Bornholms Mejeri", aktiv: true, aftale: "Rammeaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 12 * D, aftaleUdloeberMs: NU + 11 * D,
    omsaetningOere: 4380000, daekningsbidragOere: 919800,
    aftalestatus: "udloeber", ansvarlig: "Peter Lund",
    aftaltOere: 4380000, faktureretOere: 4380000, afvigelsesAarsag: "Ingen afvigelse" },
  { id: "koldingStaal", navn: "Kolding Stål ApS", aktiv: true, aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 16 * D, aftaleUdloeberMs: NU - 3 * D,
    omsaetningOere: 3860000, daekningsbidragOere: 617600,
    aftalestatus: "udloebet", ansvarlig: "Søren Dahl",
    aftaltOere: 3860000, faktureretOere: 3612000, afvigelsesAarsag: "Ventetid ikke faktureret" },
  { id: "sjaellandRetail", navn: "Sjælland Retail A/S", aktiv: true, aftale: "Fastaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 21 * D, aftaleUdloeberMs: NU + 19 * D,
    omsaetningOere: 3240000, daekningsbidragOere: 874800,
    aftalestatus: "udloeber", ansvarlig: "Mette Kjær" },
];

/* Tilbud er IKKE lagt om til useListe() endnu. De har ingen node i
   ARKITEKTUR.md — 'tilbud' er ikke en bookingtilstand, og de kan gå til
   emner der ikke er kunder endnu. Nodeformen skal besluttes før den
   forespørgsel kan skrives. */
const TILBUD = [
  { id: "t1", kunde: "Djursland Transport ApS", beloebOere: 8450000, sendtMs: NU - 18 * D },
  { id: "t2", kunde: "Skagen Seafood ApS", beloebOere: 5620000, sendtMs: NU - 15 * D },
  { id: "t3", kunde: "Randers Papir A/S", beloebOere: 3980000, sendtMs: NU - 11 * D },
  { id: "t4", kunde: "Hamburg Handel GmbH", beloebOere: 12400000, sendtMs: NU - 9 * D },
  { id: "t5", kunde: "Esbjerg Offshore A/S", beloebOere: 7150000, sendtMs: NU - 6 * D },
];

/* Margin beregnes hos forbrugeren — den skrives ikke ind i basen ved siden
   af omsætning og dækningsbidrag, hvor den kunne nå at komme ud af sync. */
const margin = (r) => (r.omsaetningOere ? (r.daekningsbidragOere / r.omsaetningOere) * 100 : 0);

export default function Kunder() {
  const { kpi: k, henter: henterKpi, fejl: kpiFejl, genindlaes: genindlaesKpi } = useKpi();
  const { dage } = useFleet();

  /* ÉT opslag. Server-side filtreres på `aktiv` — en kundebase er dusinvis
     af rækker, så equalTo er mere selektivt end et tidsvindue, og resten
     sorteres og filtreres i klienten. Var det `indberetninger`, der vokser
     med tiden, ville tidsvinduet være det rigtige felt i stedet.
     Kræver ".indexOn": ["aktiv"] på kunder — uden indeks henter RTDB hele
     noden ned og filtrerer i klienten, uden at fejle. */
  const {
    data: kunder, henter: henterKunder, fejl: kundeFejl,
    genindlaes: genindlaesKunder, afkortet,
  } = useListe("kunder", {
    ordnPaa: "aktiv",
    lig: true,
    graense: 200,
    sorter: (a, b) => b.omsaetningOere - a.omsaetningOere,
    demo: DEMO_KUNDER,
  });

  if (henterKpi || henterKunder) return <Henter hvad="kunder og nøgletal" />;
  if (!k) return <Fejl genprov={genindlaesKpi}>Nøgletallene kunne ikke hentes.</Fejl>;

  const genindlaesAlt = () => { genindlaesKpi(); genindlaesKunder(); };

  /* Fire visninger, ét datasæt. */
  const hovedtabel = kunder.slice(0, 10);
  const top5 = kunder.slice(0, 5);
  const udloeber = kunder
    .filter((r) => serviceTone(r.aftaleUdloeberMs).dage <= 30)
    .sort((a, b) => a.aftaleUdloeberMs - b.aftaleUdloeberMs);
  const salgsafvigelser = kunder
    .filter((r) => r.aftaltOere != null)
    .map((r) => ({ ...r, salgsafvigelseOere: r.faktureretOere - r.aftaltOere }))
    .sort((a, b) => Math.abs(b.salgsafvigelseOere) - Math.abs(a.salgsafvigelseOere));
  const salgsafvigelseSum = salgsafvigelser.reduce((s, r) => s + r.salgsafvigelseOere, 0);

  /* Afledte tal beregnes her — de skrives ikke ind i basen et andet sted.
     Dækningsgraden er Økonomis felt; den læses, ikke genudregnet. */
  const daekningsgradAfv = k.oekonomi.daekningsgradPct - k.oekonomi.maalDaekningsgradPct;

  /* Andelen regnes mod KPI-nodens dækningsbidrag. Tælleren kommer fra
     rækkerne, nævneren fra kilden — en total må ikke summeres ud af et
     udsnit. Derfor står der heller ingen sumlinje under hovedtabellen. */
  const top5Db = top5.reduce((s, r) => s + r.daekningsbidragOere, 0);
  const top5Andel = (top5Db / k.kunder.daekningsbidragOere) * 100;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {(kpiFejl || kundeFejl) && (
        <Fejl genprov={genindlaesAlt}>Viser demo-data — ingen forbindelse til databasen.</Fejl>
      )}

      <KpiRaekke>
        <KpiKort label="Aktive kunder" vaerdi={num(k.kunder.aktive)} note="i perioden" />
        <KpiKort label="Aftaler udløber" vaerdi={num(k.kunder.aftalerUdloeber)}
                 note="inden for 30 dage" />
        <KpiKort label="Aktuelle tilbud" vaerdi={num(k.kunder.tilbud)}
                 note={`${num(k.kunder.tilbudKraeverOpfoelgning)} kræver opfølgning`} />
        <KpiKort label={`Dækningsbidrag (${dage} dage)`} vaerdi={kr(k.kunder.daekningsbidragOere)}
                 afvigelse={deviation(daekningsgradAfv, { betterWhen: "higher", unit: "pct" })}
                 note="%-point dækningsgrad vs. mål" />
      </KpiRaekke>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel="Kunder og aftaler"
              handling={<Link className="fc-a" to="/booking/opsaetning">Se satser og prisgrupper</Link>}>
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Viser de {num(hovedtabel.length)} største af {num(k.kunder.aktive)} aktive kunder.
            Prisgruppen bestemmer hvilket satssæt en booking regner med — satserne redigeres
            i Bookingopsætning, hvor de får <b>gyldigFra</b> og aldrig overskrives. Ellers
            ændrer en rettelse i dag prisen på en faktura fra sidste kvartal.
          </p>
          <Tabel
            kolonner={[
              { key: "navn", label: "Kunde", render: (r) => <b>{r.navn}</b> },
              { key: "aftale", label: "Aftaletype" },
              { key: "prisgruppe", label: "Prisgruppe", render: (r) => PRISGRUPPER[r.prisgruppe] },
              { key: "sidsteAktivitetMs", label: "Sidste aktivitet", render: (r) => dato(r.sidsteAktivitetMs) },
              { key: "omsaetning", label: `Omsætning (${dage} dage)`, num: true,
                render: (r) => kr(r.omsaetningOere) },
              { key: "db", label: "Dækningsbidrag", num: true, render: (r) => kr(r.daekningsbidragOere) },
              { key: "margin", label: "Margin", num: true, render: (r) => pct(margin(r), 1) },
              { key: "aftalestatus", label: "Status", render: (r) => {
                  const s = AFTALESTATUS[r.aftalestatus] || AFTALESTATUS.aktiv;
                  return <Pille tone={s.tone}>{s.label}</Pille>;
                } },
              { key: "ansvarlig", label: "Ansvarlig" },
            ]}
            raekker={hovedtabel}
            tom="Ingen kunder med aktivitet i perioden."
          />
          {afkortet && (
            <p className="fc-hint" style={{ marginTop: 12 }}>
              Der er flere end de 200 hentede kunder. Listen er afkortet — snævr perioden
              eller filteret ind for at se resten.
            </p>
          )}
        </Kort>

        <div className="fc-grid">
          <Kort titel="Aftaler der udløber">
            <Tabel
              kolonner={[
                { key: "navn", label: "Kunde" },
                { key: "udloeber", label: "Udløber", render: (r) => dato(r.aftaleUdloeberMs) },
                { key: "frist", label: "Frist", render: (r) => {
                    const s = serviceTone(r.aftaleUdloeberMs);
                    return <Pille tone={s.tone}>{s.tekst}</Pille>;
                  } },
              ]}
              raekker={udloeber}
              tom="Ingen aftaler udløber inden for 30 dage."
            />
          </Kort>

          <Kort titel="Dækningsbidrag og margin"
                handling={<Link className="fc-a" to="/oekonomi">Gå til Økonomi</Link>}>
            <MiniLinje label={`Dækningsbidrag (${dage} dage)`} vaerdi={kr(k.kunder.daekningsbidragOere)} />
            <MiniLinje label="Dækningsgrad" vaerdi={pct(k.oekonomi.daekningsgradPct)} />
            <MiniLinje label="Mål" vaerdi={pct(k.oekonomi.maalDaekningsgradPct)} />
            <MiniLinje label="Afvigelse vs. mål (%-point)"
                       vaerdi={<Afvigelse vaerdi={daekningsgradAfv} betterWhen="higher" unit="pct" />} />
            <MiniLinje label="Aktive kunder" vaerdi={num(k.kunder.aktive)} />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Dækningsgraden er samme felt som Økonomi læser. Dækningsbidraget er kundernes
              eget tal — ikke driftsomkostningerne, som mockuppen viste.
            </p>
          </Kort>
        </div>
      </Gitter>

      <Gitter kolonner="repeat(auto-fit, minmax(310px, 1fr))">
        <Kort titel="Salgsprisafvigelser">
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Salgsprisafvigelsen er <b>faktureret − aftalt</b>. Her er minus rødt: der er
            kommet mindre ind end aftalt. På Økonomi er minus grønt, fordi tallet dér er
            omkostninger under budget. Samme regnestykke — kun <b>betterWhen</b> skifter.
            Leverandørsidens <b>indkøbsprisafvigelse</b> er et andet tal og ligger på Indkøb.
          </p>
          <Tabel
            kolonner={[
              { key: "navn", label: "Kunde" },
              { key: "aftalt", label: "Aftalt", num: true, render: (r) => kr(r.aftaltOere) },
              { key: "faktureret", label: "Faktureret", num: true, render: (r) => kr(r.faktureretOere) },
              { key: "salgsafvigelse", label: "Salgsprisafvigelse", num: true,
                render: (r) => <Afvigelse vaerdi={r.salgsafvigelseOere} betterWhen="higher" unit="kr" /> },
              { key: "afvigelsesAarsag", label: "Årsag" },
            ]}
            raekker={salgsafvigelser}
            tom="Ingen salgsprisafvigelser i perioden."
          />
          <div className="fc-sum">
            <div>
              <div style={{ fontWeight: 650 }}>Samlet salgsprisafvigelse</div>
              <div className="fc-hint">faktureret − aftalt, ekskl. moms</div>
            </div>
            <div className="fc-sum-v">
              <Afvigelse vaerdi={salgsafvigelseSum} betterWhen="higher" unit="kr" />
            </div>
          </div>
        </Kort>

        <Kort titel={`Topkunder (omsætning, ${dage} dage)`}>
          {top5.map((r) => (
            <MiniLinje key={r.id} label={r.navn} vaerdi={kr(r.omsaetningOere)} />
          ))}
          <div className="fc-sum">
            <div>
              <div style={{ fontWeight: 650 }}>Top 5 af dækningsbidraget</div>
              <div className="fc-hint">af {kr(k.kunder.daekningsbidragOere)} i alt</div>
            </div>
            <div className="fc-sum-v">{pct(top5Andel, 1)}</div>
          </div>
        </Kort>

        <Kort titel="Tilbud der kræver opfølgning"
              handling={<Link className="fc-a" to="/booking/ny">Ny forespørgsel</Link>}>
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            {num(k.kunder.tilbudKraeverOpfoelgning)} af {num(k.kunder.tilbud)} aktuelle
            tilbud mangler svar.
          </p>
          <Tabel
            kolonner={[
              { key: "kunde", label: "Kunde" },
              { key: "beloeb", label: "Beløb", num: true, render: (r) => kr(r.beloebOere) },
              { key: "sendt", label: "Sendt", render: (r) => dato(r.sendtMs) },
            ]}
            raekker={TILBUD}
            tom="Ingen tilbud afventer opfølgning."
          />
        </Kort>
      </Gitter>

      <p className="fc-hint">Alle beløb er ekskl. moms. Satser vedligeholdes i Bookingopsætning.</p>
    </div>
  );
}
