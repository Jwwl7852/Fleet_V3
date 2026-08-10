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
 *
 * ---------------------------------------------------------------------------
 * MOCKUPPEN, OG HVOR JEG IKKE FULGTE DEN
 *
 * 1. INGEN PERIODEVÆLGER I FILTERKORTET. Shellen ejer den, og kolonnernes
 *    labels bygges allerede af `dage`. To vælgere kunne blive uenige om
 *    hvilken periode "Omsætning (30 dage)" så handlede om.
 * 2. MOCKUPPENS "KUNDEGRUPPE" ER PRISGRUPPE. Vi har ikke et gruppebegreb ved
 *    siden af prisgruppen, og at opfinde et ville være to måder at inddele
 *    de samme kunder på. Filtrene er PRISGRUPPE, AFTALETYPE og ANSVARLIG —
 *    tre felter der findes på posten.
 * 3. "VIS" ÅBNER ET DETALJEKORT under tabellen frem for at gå et sted hen.
 *    Der er ingen kundeskærm at gå til, og en knap der fører til en 404 er
 *    værre end en der folder ud.
 * 4. PRISAFVIGELSERNES Høj/Mellem/Lav er AFLEDT af beløbets størrelse — ikke
 *    et gemt alvorsfelt. Et felt ville drive fra tallet ved siden af, og så
 *    stod der "Lav" ud for 18.400 kr.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import { useListe } from "../fleet/useListe.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { DEMO_KUNDER, DEMO_TILBUD, TILBUD_STATUS } from "../fleet/demo-kunder.js";
import { kr, num, pct, dato, deviation, serviceTone, alvorTone, ALVOR } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, MiniLinje, Gitter,
  Afvigelse, Knap, Ikon, Tom,
} from "../fleet/ui.jsx";
import { vaerste } from "../fleet/datatilstand.js";

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

/* Demo-kunderne OG tilbuddene ligger i fleet/demo-kunder.js — ikke her.
   Tilbuddene stod som `const TILBUD` i denne fil og overlevede kun fordi
   navnet manglede DEMO_-præfikset og gled forbi linten. Et navn er ikke en
   beskyttelse; se noten i demo-kunder.js. */

/* Margin beregnes hos forbrugeren — den skrives ikke ind i basen ved siden
   af omsætning og dækningsbidrag, hvor den kunne nå at komme ud af sync. */
const margin = (r) => (r.omsaetningOere ? (r.daekningsbidragOere / r.omsaetningOere) * 100 : 0);

/**
 * En afvigelse man ikke har, er ikke en afvigelse på nul.
 * Samme note som på Facility og Indkøb: deviation(undefined) giver "0" med
 * neutral tone — altså påstanden "ingen ændring" om et tal vi ikke har.
 */
const afvig = (vaerdi, opts, note = "vs. forrige periode") =>
  Number.isFinite(vaerdi)
    ? { afvigelse: deviation(vaerdi, opts), note }
    : { note: "afvigelsen er ikke aggregeret endnu" };

/**
 * Alvoren af en salgsprisafvigelse. AFLEDT af beløbet.
 *
 * ⚠ IKKE ET GEMT FELT. Mockuppen mærker hver linje Høj/Mellem/Lav; et lagret
 * alvorsflag ville drive fra beløbet ved siden af, og så stod der "Lav" ud
 * for 18.400 kr. Tærsklerne står ÉT sted, her, så de tre trin betyder det
 * samme hver gang de vises.
 *
 * Tærsklerne måler den ABSOLUTTE afvigelse: 18.400 kr for lidt og 18.400 kr
 * for meget er lige store fejl i en aftale. Fortegnet bærer retningen, og
 * det står i beløbet.
 */
const AFVIGELSE_HOEJ_OERE = 1000000;   /* 10.000 kr */
const AFVIGELSE_MELLEM_OERE = 200000;  /*  2.000 kr */

export function afvigelseAlvor(oere) {
  const abs = Math.abs(oere || 0);
  if (abs >= AFVIGELSE_HOEJ_OERE) return "hoej";
  if (abs >= AFVIGELSE_MELLEM_OERE) return "mellem";
  return "lav";
}

export default function Kunder() {
  const { kpi: k, henter: henterKpi, tilstand: kpiTilstand, genindlaes: genindlaesKpi } = useKpi();
  const { dage, division } = useFleet();
  const [prisgruppe, setPrisgruppe] = useState("");
  const [aftale, setAftale] = useState("");
  const [ansvarlig, setAnsvarlig] = useState("");
  const [valgtId, setValgtId] = useState(null);

  /* ÉT opslag. Server-side filtreres på `aktiv` — en kundebase er dusinvis
     af rækker, så equalTo er mere selektivt end et tidsvindue, og resten
     sorteres og filtreres i klienten. Var det `indberetninger`, der vokser
     med tiden, ville tidsvinduet være det rigtige felt i stedet.
     Kræver ".indexOn": ["aktiv"] på kunder — uden indeks henter RTDB hele
     noden ned og filtrerer i klienten, uden at fejle. */
  const {
    data: kunder, henter: henterKunder, tilstand: kundeTilstand,
    genindlaes: genindlaesKunder, afkortet,
  } = useListe("kunder", {
    ordnPaa: "aktiv",
    lig: true,
    graense: 200,
    sorter: (a, b) => b.omsaetningOere - a.omsaetningOere,
    demo: DEMO_KUNDER,
  });

  if (henterKpi || henterKunder) return <Henter hvad="kunder og nøgletal" />;
  if (!k) return <Datatilstand tilstand={kpiTilstand} genprov={genindlaesKpi} tom="Nøgletallene kunne ikke hentes." />;

  const genindlaesAlt = () => { genindlaesKpi(); genindlaesKunder(); };

  /* Filtrene arbejder på de hentede rækker. Værdilisterne udledes af samme
     rækker — står der ingen kunde på Peter Lund i denne division, skal han
     ikke kunne vælges og give nul rækker. */
  const aftaletyper = [...new Set(kunder.map((r) => r.aftale).filter(Boolean))].sort((a, b) => a.localeCompare(b, "da"));
  const ansvarlige = [...new Set(kunder.map((r) => r.ansvarlig).filter(Boolean))].sort((a, b) => a.localeCompare(b, "da"));

  const filtrerede = kunder.filter((r) =>
    (!prisgruppe || r.prisgruppe === prisgruppe) &&
    (!aftale || r.aftale === aftale) &&
    (!ansvarlig || r.ansvarlig === ansvarlig));

  const harFilter = Boolean(prisgruppe || aftale || ansvarlig);
  const nulstil = () => { setPrisgruppe(""); setAftale(""); setAnsvarlig(""); };

  /* Fire visninger, ét datasæt. Kun hovedtabellen filtreres — de tre
     nederste kort er faste udsnit og skal ikke skifte under et filter, som
     var de en anden liste. */
  const hovedtabel = filtrerede.slice(0, 10);
  const valgt = filtrerede.find((r) => r.id === valgtId) || null;
  const top5 = kunder.slice(0, 5);
  const udloeber = kunder
    .filter((r) => serviceTone(r.aftaleUdloeberMs).dage <= 30)
    .sort((a, b) => a.aftaleUdloeberMs - b.aftaleUdloeberMs);
  const salgsafvigelser = kunder
    .filter((r) => r.aftaltOere != null)
    .map((r) => ({ ...r, salgsafvigelseOere: r.faktureretOere - r.aftaltOere }))
    .sort((a, b) => Math.abs(b.salgsafvigelseOere) - Math.abs(a.salgsafvigelseOere));
  const salgsafvigelseSum = salgsafvigelser.reduce((s, r) => s + r.salgsafvigelseOere, 0);

  /* Tilbud følger samme visningsregel. Et tilbud er en transaktion, så der
     er ingen "faelles" at tage højde for. */
  const tilbud = DEMO_TILBUD
    .filter((t) => t.division === division)
    .sort((a, b) => a.gyldigTilMs - b.gyldigTilMs);

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
      <KpiRaekke>
        {/* Runde ikoner med chevron, som resten af appen. Tonerne er
            IKONACCENTER — farven forstærker, tallet og teksten bærer. */}
        <KpiKort label="Aktive kunder" vaerdi={num(k.kunder.aktive)}
                 ikon={<Ikon navn="personer" />} tone="ikon-5" rund til="/kunder"
                 {...afvig(k.kunder.aktiveDeltaPct, { betterWhen: "higher", unit: "pct" })} />
        <KpiKort label="Aftaler udløber" vaerdi={num(k.kunder.aftalerUdloeber)}
                 ikon={<Ikon navn="kalender" />} tone="ikon-2" rund
                 note="inden for 30 dage" til="/kunder" />
        <KpiKort label="Aktuelle tilbud" vaerdi={num(k.kunder.tilbud)}
                 ikon={<Ikon navn="maerkat" />} tone="ikon-4" rund
                 note={`${num(k.kunder.tilbudKraeverOpfoelgning)} kræver opfølgning`}
                 til="/booking/ny" />
        {/* ⚠ TO FORSKELLIGE AFVIGELSER, og de må ikke blandes. Her står
            dækningsbidragets ændring mod forrige periode, i PROCENT. Kortet
            "Dækningsbidrag og margin" nedenfor viser afvigelsen mod MÅLET, i
            PROCENTPOINT. Samme ord, to regnestykker. */}
        <KpiKort label={`Dækningsbidrag (${dage} dage)`} vaerdi={kr(k.kunder.daekningsbidragOere)}
                 ikon={<Ikon navn="seddel" />} tone="ikon-6" rund til="/oekonomi"
                 {...afvig(k.kunder.daekningsbidragDeltaPct, { betterWhen: "higher", unit: "pct" })} />
      </KpiRaekke>

      <Datatilstand tilstand={vaerste(kpiTilstand, kundeTilstand)} genprov={genindlaesAlt} />

      <Kort>
        <div className="fc-filtre">
          {/* Mockuppens "Kundegruppe" er PRISGRUPPE. Vi har ikke et
              gruppebegreb ved siden af den, og at opfinde et ville være to
              måder at inddele de samme kunder på. */}
          <div className="fc-felt">
            <label htmlFor="ku-gruppe">Prisgruppe</label>
            <select id="ku-gruppe" value={prisgruppe} onChange={(e) => setPrisgruppe(e.target.value)}>
              <option value="">Alle</option>
              {Object.entries(PRISGRUPPER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="ku-aftale">Aftaletype</label>
            <select id="ku-aftale" value={aftale} onChange={(e) => setAftale(e.target.value)}>
              <option value="">Alle</option>
              {aftaletyper.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="ku-ansv">Ansvarlig</label>
            <select id="ku-ansv" value={ansvarlig} onChange={(e) => setAnsvarlig(e.target.value)}>
              <option value="">Alle</option>
              {ansvarlige.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="fc-filtre-knapper">
            <Knap disabled={!harFilter} onClick={nulstil}>Nulstil filtre</Knap>
          </div>
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Filtrene virker med det samme og gælder <b>kun kundetabellen</b> — de tre
          kort nederst er faste udsnit, og at lade dem skifte under et filter ville
          få dem til at ligne en anden liste. <b>Perioden</b> vælges i toppen: den er
          shellens, og kolonneoverskrifterne bygges af den, så de ikke kan påstå 30
          dage mens tallene dækker 90.
        </p>
      </Kort>

      <Kort titel="Kunder og aftaler"
            handling={<Link className="fc-a" to="/booking/opsaetning">Se satser og prisgrupper</Link>}>
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          Viser de {num(hovedtabel.length)} største af {num(filtrerede.length)} filtrerede,
          {" "}{num(k.kunder.aktive)} aktive i alt i{" "}
          {division === "bus" ? "busafdelingen" : "godsafdelingen"}. Kunder mærket{" "}
          <Pille tone="info">Fælles</Pille> køber begge dele og står på begge lister med
          samme tal — det er én kunde, ikke en dublet. Prisgruppen bestemmer hvilket
          satssæt en booking regner med; satserne redigeres i Bookingopsætning, hvor de
          får <b>gyldigFra</b> og aldrig overskrives. Ellers ændrer en rettelse i dag
          prisen på en faktura fra sidste kvartal.
        </p>
        <Tabel
          kolonner={[
            { key: "navn", label: "Kunde", render: (r) => (
                <>
                  <b>{r.navn}</b>
                  {r.division === "faelles" && (
                    <> <Pille tone="info">Fælles</Pille></>
                  )}
                </>
              ) },
            { key: "aftale", label: "Aftaletype" },
            { key: "prisgruppe", label: "Prisgruppe", render: (r) => PRISGRUPPER[r.prisgruppe] },
            { key: "sidsteAktivitetMs", label: "Sidste aktivitet", render: (r) => dato(r.sidsteAktivitetMs) },
            { key: "omsaetning", label: `Omsætning (${dage} dage)`, num: true,
              render: (r) => kr(r.omsaetningOere) },
            /* Margin er BEREGNET af omsætning og dækningsbidrag. Grøn er ikke
               en vurdering af niveauet — det er samme farve for alle, fordi
               vi ikke har en målmargin at holde den op mod. */
            { key: "margin", label: "Margin", num: true,
              render: (r) => <span className="fc-good">{pct(margin(r), 0)}</span> },
            { key: "aftalestatus", label: "Status", render: (r) => {
                const s = AFTALESTATUS[r.aftalestatus] || AFTALESTATUS.aktiv;
                return <Pille tone={s.tone}>{s.label}</Pille>;
              } },
            { key: "ansvarlig", label: "Ansvarlig" },
            { key: "vis", label: "", render: (r) => (
                <Knap onClick={() => setValgtId(r.id === valgtId ? null : r.id)}
                      aria-pressed={r.id === valgtId}>
                  {r.id === valgtId ? "Skjul" : "Vis"}
                </Knap>
              ) },
          ]}
          raekker={hovedtabel}
          tom={harFilter ? "Ingen kunder passer på filtrene." : "Ingen kunder med aktivitet i perioden."}
        />
        {afkortet && (
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Der er flere end de 200 hentede kunder. Listen er afkortet — snævr perioden
            eller filteret ind for at se resten.
          </p>
        )}
      </Kort>

      {/* "Vis" folder ud her frem for at gå et sted hen: der er ingen
          kundeskærm at gå til, og en knap der fører til en 404 er værre end
          en der folder ud. */}
      {valgt && (
        <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
          <Kort titel={valgt.navn}
                handling={<Pille tone={(AFTALESTATUS[valgt.aftalestatus] || AFTALESTATUS.aktiv).tone}>
                  {(AFTALESTATUS[valgt.aftalestatus] || AFTALESTATUS.aktiv).label}
                </Pille>}>
            <MiniLinje label="Aftaletype" vaerdi={valgt.aftale} />
            <MiniLinje label="Prisgruppe" vaerdi={PRISGRUPPER[valgt.prisgruppe] || valgt.prisgruppe} />
            <MiniLinje label="Ansvarlig" vaerdi={valgt.ansvarlig} />
            <MiniLinje label="Division"
                       vaerdi={valgt.division === "faelles" ? "Fælles — gods og bus" : (valgt.division === "bus" ? "Bus" : "Gods")} />
            <MiniLinje label="Sidste aktivitet" vaerdi={dato(valgt.sidsteAktivitetMs)} />
            <MiniLinje label="Aftalen udløber"
                       vaerdi={<>{dato(valgt.aftaleUdloeberMs)}{" "}
                         <Pille tone={serviceTone(valgt.aftaleUdloeberMs).tone}>
                           {serviceTone(valgt.aftaleUdloeberMs).tekst}
                         </Pille></>} />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Satserne for <b>{PRISGRUPPER[valgt.prisgruppe] || valgt.prisgruppe}</b>{" "}
              redigeres i <Link className="fc-a" to="/booking/opsaetning">Bookingopsætning</Link>,
              ikke her — de versioneres med <b>gyldigFra</b> og overskrives aldrig.
            </p>
          </Kort>

          <Kort titel={`Økonomi (${dage} dage)`}>
            <MiniLinje label="Omsætning" vaerdi={kr(valgt.omsaetningOere)} />
            <MiniLinje label="Dækningsbidrag" vaerdi={kr(valgt.daekningsbidragOere)} />
            {/* BEREGNET af de to ovenfor. Skrevet ind i basen ved siden af dem
                kunne den nå at komme ud af sync med sit eget grundlag. */}
            <MiniLinje label="Margin" vaerdi={pct(margin(valgt), 1)} />
            {valgt.aftaltOere != null ? (
              <>
                <MiniLinje label="Aftalt" vaerdi={kr(valgt.aftaltOere)} />
                <MiniLinje label="Faktureret" vaerdi={kr(valgt.faktureretOere)} />
                <MiniLinje label="Salgsprisafvigelse"
                           vaerdi={<Afvigelse vaerdi={valgt.faktureretOere - valgt.aftaltOere}
                                              betterWhen="higher" unit="kr" />} />
                <p className="fc-hint" style={{ marginTop: 10 }}>
                  Årsag: {valgt.afvigelsesAarsag}
                </p>
              </>
            ) : (
              <p className="fc-hint" style={{ marginTop: 10 }}>
                Ingen salgsprisafvigelse i perioden — faktureret svarer til aftalt.
              </p>
            )}
          </Kort>
        </Gitter>
      )}

      <Gitter kolonner="repeat(auto-fit, minmax(310px, 1fr))">
        <Kort titel="Salgsprisafvigelser"
              handling={<Link className="fc-a" to="/oekonomi">Se alle afvigelser</Link>}>
          <Tabel
            kolonner={[
              { key: "navn", label: "Kunde", render: (r) => <b>{r.navn}</b> },
              { key: "salgsafvigelse", label: "Afvigelse", num: true,
                render: (r) => <Afvigelse vaerdi={r.salgsafvigelseOere} betterWhen="higher" unit="kr" /> },
              /* AFLEDT af beløbet — ikke et gemt alvorsfelt. Se
                 afvigelseAlvor(): et lagret flag ville drive fra tallet ved
                 siden af, og så stod der "Lav" ud for 18.400 kr. */
              { key: "alvor", label: "Alvor", render: (r) => {
                  const a = afvigelseAlvor(r.salgsafvigelseOere);
                  return <Pille tone={alvorTone(a)}>{ALVOR[a]}</Pille>;
                } },
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
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Her er minus <b>rødt</b>: der er kommet mindre ind end aftalt. På Økonomi er
            minus grønt, fordi tallet dér er omkostninger under budget. Samme
            regnestykke — kun <b>betterWhen</b> skifter. Leverandørsidens{" "}
            <b>indkøbsprisafvigelse</b> er et andet tal og ligger på Indkøb.
            Alvoren er <b>afledt af beløbets størrelse</b>, ikke et felt.
          </p>
        </Kort>

        <Kort titel={`Topkunder (omsætning, ${dage} dage)`}
              handling={<Link className="fc-a" to="/oekonomi">Se alle topkunder</Link>}>
          <Tabel
            kolonner={[
              { key: "rang", label: "", bredde: "44px", render: (r) => {
                  const i = top5.indexOf(r) + 1;
                  return <span className={`fc-rang fc-rang-${Math.min(i, 3)}`}>{i}</span>;
                } },
              { key: "navn", label: "Kunde", render: (r) => <b>{r.navn}</b> },
              { key: "omsaetning", label: "Omsætning", num: true, render: (r) => kr(r.omsaetningOere) },
            ]}
            raekker={top5}
            tom="Ingen kunder i perioden."
          />
          <div className="fc-sum">
            <div>
              <div style={{ fontWeight: 650 }}>Top 5 af dækningsbidraget</div>
              <div className="fc-hint">af {kr(k.kunder.daekningsbidragOere)} i alt</div>
            </div>
            <div className="fc-sum-v">{pct(top5Andel, 1)}</div>
          </div>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Andelen regnes mod <b>kpi/</b>'s dækningsbidrag: tælleren kommer fra
            rækkerne, nævneren fra kilden. En total må ikke summeres ud af et udsnit
            — derfor står der heller ingen sumlinje under kundetabellen.
          </p>
        </Kort>

        <Kort titel="Tilbud der kræver opfølgning"
              handling={<Link className="fc-a" to="/booking/ny">Ny forespørgsel</Link>}>
          <Tabel
            kolonner={[
              { key: "kunde", label: "Kunde", render: (r) => (
                  <div className="fc-tolinje">
                    <b>{r.kunde}</b>
                    <span>Gyldig til {dato(r.gyldigTilMs)}</span>
                  </div>
                ) },
              { key: "status", label: "Status", render: (r) => (
                  <Pille tone={TILBUD_STATUS[r.status]?.tone || "info"}>
                    {TILBUD_STATUS[r.status]?.label || r.status}
                  </Pille>
                ) },
              { key: "beloeb", label: "Beløb", num: true, render: (r) => kr(r.beloebOere) },
              { key: "aabn", label: "", render: () => (
                  <Knap disabled title="Tilbudsskærmen er ikke bygget — der findes ingen tilbudsnode endnu.">
                    Åbn
                  </Knap>
                ) },
            ]}
            raekker={tilbud}
            tom="Ingen tilbud i divisionen."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            {num(k.kunder.tilbudKraeverOpfoelgning)} af {num(k.kunder.tilbud)} aktuelle
            tilbud mangler svar ifølge <b>kpi/</b>; listen her er de{" "}
            {num(tilbud.length)} hentede. <b>Et tilbud er ikke en booking</b> — det kan
            gå til et emne der ikke er kunde endnu, og derfor findes der ingen
            tilbudsnode i datamodellen. Nodeformen skal besluttes, før knappen kan
            gøre noget.
          </p>
        </Kort>
      </Gitter>

      <Gitter kolonner="repeat(auto-fit, minmax(310px, 1fr))">
        <Kort titel="Aftaler der udløber">
          <Tabel
            kolonner={[
              { key: "navn", label: "Kunde", render: (r) => <b>{r.navn}</b> },
              { key: "udloeber", label: "Udløber", render: (r) => dato(r.aftaleUdloeberMs) },
              { key: "frist", label: "Frist", render: (r) => {
                  const s = serviceTone(r.aftaleUdloeberMs);
                  return <Pille tone={s.tone}>{s.tekst}</Pille>;
                } },
              { key: "ansvarlig", label: "Ansvarlig" },
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
            ⚠ <b>To forskellige afvigelser.</b> Den her er mod <b>målet</b> og måles i
            procentpoint. Kortet øverst viser dækningsbidragets ændring mod{" "}
            <b>forrige periode</b>, i procent. Samme ord, to regnestykker — og de kan
            pege hver sin vej. Dækningsgraden er samme felt som Økonomi læser;
            dækningsbidraget er kundernes eget tal, ikke driftsomkostningerne som
            mockuppen viste.
          </p>
        </Kort>
      </Gitter>

      <p className="fc-hint">Alle beløb er ekskl. moms. Satser vedligeholdes i Bookingopsætning.</p>
    </div>
  );
}
