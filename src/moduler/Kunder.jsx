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
 */
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
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

/* ÉT kundedatasæt. Både hovedtabellen, topkunderne, salgsprisafvigelserne
   og listen over udløbende aftaler læser herfra — så de kan ikke nå at sige
   hver sit om samme kunde. Beløb i hele øre, ekskl. moms. */
const KUNDER = [
  { id: "nordiskFragt", navn: "Nordisk Fragt A/S", aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 1 * D, aftaleUdloeberMs: NU + 243 * D,
    omsaetningOere: 14250000, daekningsbidragOere: 4132500,
    status: "Aktiv", statusTone: "ok", ansvarlig: "Mette Kjær" },
  { id: "skagenSeafood", navn: "Skagen Seafood ApS", aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 2 * D, aftaleUdloeberMs: NU + 152 * D,
    omsaetningOere: 11840000, daekningsbidragOere: 3078400,
    status: "Aktiv", statusTone: "ok", ansvarlig: "Søren Dahl" },
  { id: "jyskByggecenter", navn: "Jysk Byggecenter A/S", aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 3 * D, aftaleUdloeberMs: NU + 30 * D,
    omsaetningOere: 9620000, daekningsbidragOere: 2212600,
    status: "Genforhandling", statusTone: "warn", ansvarlig: "Mette Kjær" },
  { id: "fynKoel", navn: "Fyn Køl & Frost A/S", aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 5 * D, aftaleUdloeberMs: NU + 334 * D,
    omsaetningOere: 8875000, daekningsbidragOere: 2751200,
    status: "Aktiv", statusTone: "ok", ansvarlig: "Anne Bøgh" },
  { id: "hamburgHandel", navn: "Hamburg Handel GmbH", aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 6 * D, aftaleUdloeberMs: NU + 6 * D,
    omsaetningOere: 7430000, daekningsbidragOere: 1337400,
    status: "Udløber", statusTone: "warn", ansvarlig: "Søren Dahl" },
  { id: "vestjyskLandbrug", navn: "Vestjysk Landbrug AmbA", aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 8 * D, aftaleUdloeberMs: NU + 24 * D,
    omsaetningOere: 6190000, daekningsbidragOere: 1547500,
    status: "Genforhandling", statusTone: "warn", ansvarlig: "Peter Lund" },
  { id: "aalborgIndustri", navn: "Aalborg Industri A/S", aftale: "Fastaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 9 * D, aftaleUdloeberMs: NU + 28 * D,
    omsaetningOere: 5420000, daekningsbidragOere: 1463400,
    status: "Genforhandling", statusTone: "warn", ansvarlig: "Anne Bøgh" },
  { id: "bornholmsMejeri", navn: "Bornholms Mejeri", aftale: "Rammeaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 12 * D, aftaleUdloeberMs: NU + 11 * D,
    omsaetningOere: 4380000, daekningsbidragOere: 919800,
    status: "Udløber", statusTone: "warn", ansvarlig: "Peter Lund" },
  { id: "koldingStaal", navn: "Kolding Stål ApS", aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 16 * D, aftaleUdloeberMs: NU - 3 * D,
    omsaetningOere: 3860000, daekningsbidragOere: 617600,
    status: "Udløbet", statusTone: "bad", ansvarlig: "Søren Dahl" },
  { id: "sjaellandRetail", navn: "Sjælland Retail A/S", aftale: "Fastaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 21 * D, aftaleUdloeberMs: NU + 19 * D,
    omsaetningOere: 3240000, daekningsbidragOere: 874800,
    status: "Udløber", statusTone: "warn", ansvarlig: "Mette Kjær" },
];

const NAVN = Object.fromEntries(KUNDER.map((r) => [r.id, r.navn]));

/* Margin beregnes hos forbrugeren — den skrives ikke ind i basen ved siden
   af omsætning og dækningsbidrag, hvor den kunne nå at komme ud af sync. */
const margin = (r) => (r.omsaetningOere ? (r.daekningsbidragOere / r.omsaetningOere) * 100 : 0);

/* Udløbende aftaler filtreres ud af KUNDER med samme tærskler som Flåde og
   Facility bruger til servicevarsling. Ingen egen datering, ingen egne trin. */
const UDLOEBER = KUNDER
  .filter((r) => serviceTone(r.aftaleUdloeberMs).dage <= 30)
  .sort((a, b) => a.aftaleUdloeberMs - b.aftaleUdloeberMs);

const TOP5 = [...KUNDER].sort((a, b) => b.omsaetningOere - a.omsaetningOere).slice(0, 5);
const TOP5_DB = TOP5.reduce((s, r) => s + r.daekningsbidragOere, 0);

/* Salgsprisafvigelse = faktureret − aftalt. Kundesiden: kommer der mindre
   ind end aftalt, er det mistet omsætning. Fortegnet gemmes som det er;
   farven sættes af betterWhen:'higher' i visningen.
   Leverandørsidens indkoebsprisafvigelse er et andet tal med modsat
   betterWhen — se k.indkoeb.indkoebsprisafvigelseSnitPct. */
const SALGSAFVIGELSER = [
  { id: "hamburgHandel", aftaltOere: 7430000, faktureretOere: 5590000,
    aarsag: "Spotpris under aftalt minimum" },
  { id: "koldingStaal", aftaltOere: 3860000, faktureretOere: 3612000,
    aarsag: "Ventetid ikke faktureret" },
  { id: "jyskByggecenter", aftaltOere: 9620000, faktureretOere: 9913000,
    aarsag: "Tillæg for ekstra stop" },
  { id: "bornholmsMejeri", aftaltOere: 4380000, faktureretOere: 4380000,
    aarsag: "Ingen afvigelse" },
  { id: "vestjyskLandbrug", aftaltOere: 6190000, faktureretOere: 6560500,
    aarsag: "Færgetillæg viderefaktureret" },
].map((a) => ({ ...a, navn: NAVN[a.id], salgsafvigelseOere: a.faktureretOere - a.aftaltOere }));

const SALGSAFVIGELSE_SUM = SALGSAFVIGELSER.reduce((s, a) => s + a.salgsafvigelseOere, 0);

/* Tilbud kan gå til emner der endnu ikke er kunder — derfor eget navnefelt. */
const TILBUD = [
  { id: "t1", kunde: "Djursland Transport ApS", beloebOere: 8450000, sendtMs: NU - 18 * D },
  { id: "t2", kunde: "Skagen Seafood ApS", beloebOere: 5620000, sendtMs: NU - 15 * D },
  { id: "t3", kunde: "Randers Papir A/S", beloebOere: 3980000, sendtMs: NU - 11 * D },
  { id: "t4", kunde: "Hamburg Handel GmbH", beloebOere: 12400000, sendtMs: NU - 9 * D },
  { id: "t5", kunde: "Esbjerg Offshore A/S", beloebOere: 7150000, sendtMs: NU - 6 * D },
];

export default function Kunder() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  const { dage } = useFleet();

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  /* Afledte tal beregnes her — de skrives ikke ind i basen et andet sted.
     Dækningsgraden er Økonomis felt; den læses, ikke genudregnet. */
  const daekningsgradAfv = k.oekonomi.daekningsgradPct - k.oekonomi.maalDaekningsgradPct;

  /* Andelen regnes mod KPI-nodens dækningsbidrag. Tælleren kommer fra
     rækkerne, nævneren fra kilden — en total må ikke summeres ud af et
     udsnit. Derfor står der heller ingen sumlinje under hovedtabellen. */
  const top5Andel = (TOP5_DB / k.kunder.daekningsbidragOere) * 100;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}

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
            Viser de {num(KUNDER.length)} største af {num(k.kunder.aktive)} aktive kunder.
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
              { key: "status", label: "Status",
                render: (r) => <Pille tone={r.statusTone}>{r.status}</Pille> },
              { key: "ansvarlig", label: "Ansvarlig" },
            ]}
            raekker={KUNDER}
            tom="Ingen kunder med aktivitet i perioden."
          />
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
              raekker={UDLOEBER}
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
              { key: "aarsag", label: "Årsag" },
            ]}
            raekker={SALGSAFVIGELSER}
            tom="Ingen salgsprisafvigelser i perioden."
          />
          <div className="fc-sum">
            <div>
              <div style={{ fontWeight: 650 }}>Samlet salgsprisafvigelse</div>
              <div className="fc-hint">faktureret − aftalt, ekskl. moms</div>
            </div>
            <div className="fc-sum-v">
              <Afvigelse vaerdi={SALGSAFVIGELSE_SUM} betterWhen="higher" unit="kr" />
            </div>
          </div>
        </Kort>

        <Kort titel={`Topkunder (omsætning, ${dage} dage)`}>
          {TOP5.map((r) => (
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
