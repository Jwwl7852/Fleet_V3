/* src/moduler/facility/Oversigt.jsx
 * Facility – overblik, fejl & klima
 *
 * ⚠ SENSORVÆRDIERNE KOMMER FRA SAMME NODE SOM KLIMA-SKÆRMEN.
 *
 * I mockupsene viste de to skærme FORSKELLIGE temperaturer for de samme
 * zoner — kun Depot 2 stemte. Begge læser nu facility/sensorer/<zoneId>, i
 * demo gennem zonePar() i demo-facility.js. Der er ét sted at hente tallet,
 * så de kan ikke være uenige.
 *
 * ALARMEN ER AFLEDT, ikke gemt. alarmTilstand() sammenholder målingen med
 * ZONENS grænse. Et lagret alarmflag ville drive fra målingen i det sekund
 * nogen justerede grænsen — og så stod der grønt på noget der ikke var det.
 *
 * "Aktive klimaalarmer" beregnes derfor HER og står ikke i kpi/. Det er samme
 * slags tal som bemanding.ledig: afledt, og dermed noget der ikke skal gemmes.
 * `klimaalarmerIDag` er derimod et rigtigt nøgletal — det kræver historik.
 *
 * FACILITY ER FÆLLES. Skærmen reagerer ikke på Gods/Bus-toggle'en.
 *
 * ---------------------------------------------------------------------------
 * MOCKUPPEN, OG HVAD DER IKKE BLEV SOM DEN
 *
 * 1. LOKATIONERNE ER VORES. Mockuppen skrev Hovedlager–Greve, Terminal–
 *    Taastrup, Værksted–Greve, Kontor–København og Kølehus–Greve. Ingen af
 *    dem findes. Stederne kommer fra STED i fleet/steder.js — samme fire som
 *    personalet er stationeret på og køretøjerne har hjemme, og nu har alle
 *    fire en facilitet. Havde de ikke det, ville halvdelen af flåden stå på
 *    et sted der ikke fandtes i bygningsdata.
 * 2. LOKATIONENS STATUS ER AFLEDT. Mockuppens Normal/Advarsel/Kritisk ligner
 *    et felt; det er lokationTilstand() over anlæg, åbne fejl og klimaalarmer.
 *    Et gemt statusfelt ville drive fra anlæggene under det.
 * 3. DONUTTEN HAR FEM SLICES, IKKE SEKS. Seriepaletten har fem farver, valgt
 *    fordi de kan skelnes — også uden farvesyn (beslutning 30). En sjette
 *    ville genbruge farve ét. aktivFordeling() folder resten til Øvrige og
 *    fortæller i legenden hvad den indeholder.
 * 4. "78 % KAPACITET" PÅ VENTILATIONEN ER IKKE MED. Der findes ingen
 *    kapacitetsmåling. Et procenttal opfundet til lejligheden ville se ud som
 *    en måling — rækken siger i stedet hvor mange anlæg der kører.
 * 5. ESTIMERET OMKOSTNING ER AFLEDT af det planlagte servicebesøg på anlægget,
 *    ikke et felt på anlægget selv. Et anlæg uden planlagt besøg har ikke et
 *    estimat på nul — det har intet estimat, og der står en streg.
 * 6. INGEN ⋮-MENU. Skrivning er ikke bygget; en menu med grå punkter er værre
 *    end ingen menu. Rækken er til gengæld klikbar og styrer driftskortet.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, dato, deviation, serviceTone } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Gitter,
  MiniLinje, Donut, Ikon, Sider,
} from "../../fleet/ui.jsx";
import {
  AKTIV_ART, AKTIV_STATUS, FEJL_STATUS, LOKATION_TYPE,
  alarmTilstand, aktiveAlarmer, lokationTilstand, driftsforhold, aktivFordeling,
} from "../../fleet/facility.js";
import { alvorTone, ALVOR } from "../../fleet/format.js";
import {
  DEMO_FEJL, DEMO_AKTIVER, DEMO_LOKATIONER, DEMO_SERVICEBESOEG,
  zonePar, demoAktiv, demoLokation, demoAabneFejl,
} from "../../fleet/demo-facility.js";
import { DEMO_PERSONALE } from "../../fleet/demo-personale.js";

const PR_SIDE = 5;

/**
 * En afvigelse man ikke har, er ikke en afvigelse på nul.
 *
 * ⚠ deviation(undefined) giver "0" og tonen neutral — altså påstanden "ingen
 * ændring". Det er en oplysning vi ikke har, skrevet som om vi havde den, og
 * det er samme fejl som at oversætte en afvist læsning til "ingen
 * forbindelse". Mangler feltet, siger noten det i stedet.
 *
 * Det ER en tilstand man møder: appen læser kpi/ fra basen, og en base der er
 * seedet før feltet fandtes, har det ikke. Nøjagtig sådan stod donutten tom.
 */
const afvig = (vaerdi, opts) =>
  Number.isFinite(vaerdi)
    ? { afvigelse: deviation(vaerdi, opts), note: "vs. forrige periode" }
    : { note: "afvigelsen er ikke aggregeret endnu" };

/* Navnet på den ansvarlige. ⚠ personId, ALDRIG uid — det er hvem det HANDLER
   om, ikke hvem der gjorde noget. En facilityansvarlig har måske intet login. */
const personNavn = (personId) =>
  DEMO_PERSONALE.find((p) => p.id === personId)?.navn || "—";

/**
 * Estimatet på et anlægs NÆSTE planlagte servicebesøg.
 *
 * AFLEDT, og det skal det blive: prisen står på besøget, hvor den blev aftalt
 * med leverandøren. Kopieret op på anlægget ville den ligge to steder, og den
 * ene ville blive stående når besøget blev ombooket.
 */
function estimatForAktiv(besoeg, aktivId, nu = Date.now()) {
  const mine = besoeg
    .filter((b) => b.aktivId === aktivId && b.status !== "aflyst" && b.til >= nu)
    .sort((a, b) => a.fra - b.fra);
  return mine.length ? mine[0].estimatOere : null;
}

export default function FacilityOversigt() {
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();
  const [valgtLokId, setValgtLokId] = useState(DEMO_LOKATIONER[0]?.id || null);
  const [side, setSide] = useState(1);

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* ÉN kilde. Klima-skærmen kalder den samme funktion. */
  const par = zonePar();
  const alarmer = aktiveAlarmer(par);
  const aabne = demoAabneFejl();
  const ctx = { aktiver: DEMO_AKTIVER, aabneFejl: aabne, par };

  const valgtLok = DEMO_LOKATIONER.find((l) => l.id === valgtLokId) || DEMO_LOKATIONER[0];
  const drift = valgtLok ? driftsforhold(valgtLok.id, ctx) : [];

  const fordeling = aktivFordeling(k.facility.aktiverPrArt || {});

  /* Aktivtabellen sorteres efter hvornår service forfalder — det er den
     rækkefølge man arbejder listen i. */
  const aktiver = [...DEMO_AKTIVER].sort((a, b) => a.naesteServiceMs - b.naesteServiceMs);
  const sider = Math.max(1, Math.ceil(aktiver.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = aktiver.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        {/* Runde ikoner med chevron, som resten af appen. Tonerne er
            IKONACCENTER: farven forstærker, tallet og teksten bærer.
            Afvigelserne KRÆVER historik og kommer derfor fra kpi/ — de kan
            ikke regnes af de femten demo-aktiver skærmen har. */}
        <KpiKort label="Aktiver i drift" vaerdi={num(k.facility.aktiver)}
                 ikon={<Ikon navn="bygning" />} tone="ikon-5" rund til="/facility"
                 {...afvig(k.facility.aktiverDeltaPct, { betterWhen: "higher", unit: "pct" })} />
        <KpiKort label="Servicepunkter forfalder" vaerdi={num(k.facility.servicepunkterForfalder)}
                 ikon={<Ikon navn="skruenoegle" />} tone="ikon-2" rund
                 til="/facility/servicekalender"
                 {...afvig(k.facility.servicepunkterDelta, { betterWhen: "lower" })} />
        <KpiKort label="Åbne facility-sager" vaerdi={num(k.facility.aabneSager)}
                 ikon={<Ikon navn="udraab" />} tone="ikon-1" rund
                 til="/facility/servicekalender"
                 {...afvig(k.facility.aabneSagerDelta, { betterWhen: "lower" })} />
        <KpiKort label="Planlagt vedligehold" vaerdi={num(k.facility.planlagtVedligehold)}
                 ikon={<Ikon navn="kalender" />} tone="ikon-6" rund
                 til="/facility/servicekalender"
                 {...afvig(k.facility.planlagtVedligeholdDelta, { betterWhen: "higher" })} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
        <Kort titel="Lokationer"
              handling={<Link className="fc-a" to="/facility/servicekalender">Se servicekalenderen</Link>}>
          {/* Rækken er klikbar og styrer driftskortet til højre. Mockuppen
              har et fast "Hovedlager Greve"; her følger kortet det sted man
              spørger om, så de to ikke kan komme til at handle om hver sit. */}
          {DEMO_LOKATIONER.map((l) => {
            const t = lokationTilstand(l.id, ctx);
            const valgt = l.id === valgtLokId;
            return (
              <button key={l.id} type="button"
                      className={`fc-lokrk${valgt ? " fc-lokrk-nu" : ""}`}
                      aria-pressed={valgt}
                      onClick={() => setValgtLokId(l.id)}>
                <span className="fc-med-ikon"><Ikon navn="bygning" /></span>
                <span className="fc-lokrk-txt">
                  <b>{l.navn}</b>
                  <span>{LOKATION_TYPE[l.type] || l.type}</span>
                </span>
                <span className="fc-lokrk-m2">{num(l.arealM2)} m²</span>
                <Pille tone={t.tone}>{t.tekst}</Pille>
              </button>
            );
          })}
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Statussen er <b>afledt</b> af anlæg, åbne fejl og klimaalarmer på stedet
            — den er ikke et felt. Et gemt statusfelt ville stå Kritisk på en hal
            hvor alt virkede, så snart den sidste fejl blev lukket. Stederne kommer
            fra <b>STED</b>, samme katalog som personale og flåde bruger.
          </p>
        </Kort>

        <Kort titel="Aktivoversigt"
              handling={<Link className="fc-a" to="/facility/servicekalender">Se alle aktiver</Link>}>
          {/* ⚠ ET MANGLENDE FELT ER IKKE "INGEN DATA I PERIODEN".
              Donut-primitivet siger det sidste, når listen er tom, og det er
              rigtigt for en periode uden aktivitet — men forkert her: feltet
              er ikke aggregeret endnu, og det er en helt anden ting at gøre
              noget ved. Samme skelnen som dataTilstand() laver mellem en
              afvist læsning og en manglende forbindelse.
              Det ER sket: appen læser kpi/ fra basen, og en base seedet før
              aktiverPrArt fandtes, har feltet ikke. Kør npm run
              provisioner:dev. */}
          {!fordeling.length ? (
            <Tom>
              <b>aktiverPrArt</b> findes ikke i <code>kpi/</code> for denne tenant.
              Fordelingen er ikke aggregeret endnu — det er ikke det samme som
              at der ingen aktiver er; nøgletallet ovenfor siger{" "}
              {num(k.facility.aktiver)}.
            </Tom>
          ) : (
            <Donut
              dele={fordeling}
              total={k.facility.aktiver}
              midteTekst="aktive"
              format={(v) => num(v)}
            />
          )}
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Fordelingen af alle <b>{num(k.facility.aktiver)}</b> aktiver kommer fra{" "}
            <b>kpi/</b> — den kan ikke regnes af de {num(DEMO_AKTIVER.length)} hentede.
            Højst fem slices: seriepaletten har fem farver der kan skelnes fra
            hinanden, også uden farvesyn, og en sjette ville genbruge den første.
            {fordeling.find((d) => d.dele)
              ? ` Øvrige er ${fordeling.find((d) => d.dele).dele.join(" og ")}.`
              : ""}
          </p>
        </Kort>

        <Kort titel={`Driftsforhold — ${valgtLok?.navn || "—"}`}
              handling={<Link className="fc-a" to="/facility/klima">Se klima &amp; energi</Link>}>
          {!drift.length ? (
            <Tom>Ingen anlæg registreret på lokationen.</Tom>
          ) : drift.map((r) => (
            <MiniLinje
              key={r.label}
              label={<span className="fc-med-ikon fc-med-ikon-svag">
                <Ikon navn={r.ikon} />{r.label}
              </span>}
              vaerdi={<>{r.vaerdi} <Pille tone={r.tone}>{r.tekst}</Pille></>}
            />
          ))}
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Temperaturen er lokationens <b>koldeste</b> zone — et kontor på 21 grader
            siger intet om et kølerum ved siden af. Tallene kommer fra{" "}
            <b>facility/sensorer</b>, samme node som Klima læser. Mockuppens{" "}
            <b>78 % kapacitet</b> på ventilationen findes ikke som måling, og et
            opfundet procenttal ville ligne en.
          </p>
        </Kort>
      </Gitter>

      <Kort titel={`Aktiver (${num(DEMO_AKTIVER.length)} hentede af ${num(k.facility.aktiver)})`}>
        <Tabel
          kolonner={[
            { key: "navn", label: "Aktiv", render: (r) => <b>{r.navn}</b> },
            { key: "art", label: "Kategori", render: (r) => AKTIV_ART[r.art]?.label || r.art },
            { key: "lokationId", label: "Lokation", render: (r) => (
                <span className="fc-med-ikon fc-med-ikon-svag">
                  <Ikon navn="bygning" />{demoLokation(r.lokationId)?.navn || "—"}
                </span>
              ) },
            /* Dato OG frist. serviceTone() ét sted — samme tre trin som Flåde,
               Kompetencer og Facility-kalenderen bruger. */
            { key: "naesteServiceMs", label: "Næste service", render: (r) => {
                const s = serviceTone(r.naesteServiceMs);
                return (
                  <div className="fc-tolinje">
                    <b className={s.tone === "bad" ? "fc-bad" : undefined}>
                      {dato(r.naesteServiceMs)}
                    </b>
                    <span className={s.tone === "bad" ? "fc-bad" : undefined}>{s.tekst}</span>
                  </div>
                );
              } },
            /* ⚠ personId, ikke uid. Se noten ved personNavn(). */
            { key: "ansvarligPersonId", label: "Ansvarlig",
              render: (r) => personNavn(r.ansvarligPersonId) },
            { key: "status", label: "Status", render: (r) => (
                <Pille tone={AKTIV_STATUS[r.status]?.pill}>
                  {AKTIV_STATUS[r.status]?.label || r.status}
                </Pille>
              ) },
            { key: "estimat", label: "Estimeret omkostning", num: true, render: (r) => {
                const oere = estimatForAktiv(DEMO_SERVICEBESOEG, r.id);
                /* Intet planlagt besøg er ikke et estimat på nul. */
                return oere == null
                  ? <span className="fc-neutral">—</span>
                  : kr(oere);
              } },
          ]}
          raekker={paaSiden}
          tom="Ingen aktiver oprettet endnu."
        />
        <div className="fc-row" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
          <p className="fc-hint" style={{ margin: 0 }}>
            Viser {num((nuSide - 1) * PR_SIDE + 1)}–{num((nuSide - 1) * PR_SIDE + paaSiden.length)}{" "}
            af {num(aktiver.length)} hentede. Platformens tal er{" "}
            <b>{num(k.facility.aktiver)}</b>, og de to skal ikke gå op mod hinanden:
            listen er et udsnit. Sorteret efter hvornår service forfalder.
          </p>
          <Sider side={nuSide} antal={aktiver.length} prSide={PR_SIDE} saet={setSide} />
        </div>
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Estimeret omkostning</b> er prisen på anlæggets næste planlagte
          servicebesøg — den står på besøget, hvor den blev aftalt med
          leverandøren. Kopieret op på anlægget ville den blive stående, når
          besøget blev ombooket. Beløb er ekskl. moms.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel={`Åbne fejl (${aabne.length})`}
          handling={<Link className="fc-a" to="/facility/servicekalender">Se servicekalenderen</Link>}
        >
          <Tabel
            kolonner={[
              { key: "meldtMs", label: "Meldt", render: (r) => dato(r.meldtMs) },
              { key: "aktivId", label: "Anlæg", render: (r) => {
                  const a = demoAktiv(r.aktivId);
                  return <><b>{a?.navn}</b> <span className="fc-neutral">
                    · {demoLokation(a?.lokationId)?.navn}</span></>;
                } },
              { key: "beskrivelse", label: "Beskrivelse" },
              { key: "meldtAf", label: "Meldt af" },
              { key: "alvor", label: "Prioritet",
                render: (r) => <Pille tone={alvorTone(r.alvor)}>{ALVOR[r.alvor]}</Pille> },
              { key: "status", label: "Status",
                render: (r) => <Pille tone={FEJL_STATUS[r.status]?.pill}>{FEJL_STATUS[r.status]?.label}</Pille> },
            ]}
            raekker={aabne}
            tom="Ingen åbne fejl."
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Viser {num(aabne.length)} af {num(DEMO_FEJL.length)} hentede fejl.{" "}
            <b>{num(k.facility.aabneFejl)}</b> er platformens tal fra <code>kpi/</code> —
            listen her er et udsnit og skal ikke gå op mod det.
          </p>
        </Kort>

        <Kort
          titel="Klima nu"
          handling={<Link className="fc-a" to="/facility/klima">Se klima &amp; energi</Link>}
        >
          {/* SAMME liste som Klima-skærmen viser. Ét opslag, to visninger. */}
          {par.map(({ zone, maaling }) => {
            const a = alarmTilstand(zone, maaling);
            return (
              <MiniLinje
                key={zone.id}
                label={zone.navn}
                vaerdi={maaling
                  ? <>{maaling.tempC.toFixed(1)} °C <Pille tone={a.tone}>{a.tekst}</Pille></>
                  : <span className="fc-neutral">ingen måling</span>}
              />
            );
          })}
          <p className="fc-hint" style={{ marginTop: 10 }}>
            <b>{num(alarmer.length)}</b> aktive alarmer, beregnet nu — tallet står{" "}
            <b>ikke</b> i <code>kpi/</code>, fordi det er afledt af målingen og zonens
            grænse. Tallene kommer fra <b>facility/sensorer</b>, samme node som Klima
            læser. I mockupsene viste de to skærme forskellige temperaturer for samme
            zoner; nu er der kun ét sted at hente dem.
          </p>
        </Kort>
      </Gitter>
    </div>
  );
}
