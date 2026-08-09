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
 */
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, dato, serviceTone } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import {
  AKTIV_ART, AKTIV_STATUS, FEJL_STATUS, ZONE_ART,
  alarmTilstand, aktiveAlarmer,
} from "../../fleet/facility.js";
import { alvorTone, ALVOR } from "../../fleet/format.js";
import {
  DEMO_FEJL, DEMO_AKTIVER, zonePar, demoAktiv, demoLokation, demoAabneFejl,
} from "../../fleet/demo-facility.js";

export default function FacilityOversigt() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  /* ÉN kilde. Klima-skærmen kalder den samme funktion. */
  const par = zonePar();
  const alarmer = aktiveAlarmer(par);
  const aabne = demoAabneFejl();

  /* Service inden for 30 dage — udledt af aktivernes naesteServiceMs med
     samme tærskler som Flåde og Kompetencer bruger. */
  const forfalder = DEMO_AKTIVER
    .filter((a) => serviceTone(a.naesteServiceMs).dage <= 30)
    .sort((a, b) => a.naesteServiceMs - b.naesteServiceMs);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Åbne fejl" vaerdi={num(k.facility.aabneFejl)} />
        <KpiKort label="Planlagte servicebesøg" vaerdi={num(k.facility.planlagtVedligehold)} />
        {/* AFLEDT, ikke fra kpi/ — se noten i toppen. */}
        <KpiKort label="Aktive klimaalarmer" vaerdi={num(alarmer.length)} note="beregnet nu" />
        <KpiKort label="Facility-omkostninger" vaerdi={kr(k.facility.facilityOmkostningOere)}
                 note="ekskl. moms" />
      </KpiRaekke>

      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}

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

        <div className="fc-grid">
          <Kort
            titel="Klima nu"
            handling={<Link className="fc-a" to="/facility/klima">Se klima & energi</Link>}
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
              Tallene kommer fra <b>facility/sensorer</b> — samme node som Klima
              læser. I mockupsene viste de to skærme forskellige temperaturer for
              samme zoner; nu er der kun ét sted at hente dem.
            </p>
          </Kort>

          <Kort titel="Service forfalder">
            {forfalder.length === 0 ? (
              <Tom>Intet anlæg har service inden for 30 dage.</Tom>
            ) : forfalder.map((a) => {
              const s = serviceTone(a.naesteServiceMs);
              return (
                <MiniLinje key={a.id} label={a.navn}
                           vaerdi={<Pille tone={s.tone}>{s.tekst}</Pille>} />
              );
            })}
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Tærsklerne kommer fra <b>serviceTone()</b> — samme tre trin som Flåde og
              Kompetencer. {num(k.facility.servicepunkterForfalder)} er platformens tal.
            </p>
          </Kort>

          <Kort titel="Aktiver">
            {Object.entries(
              DEMO_AKTIVER.reduce((m, a) => ({ ...m, [a.status]: (m[a.status] || 0) + 1 }), {})
            ).map(([status, antal]) => (
              <MiniLinje key={status}
                         label={AKTIV_STATUS[status]?.label || status}
                         vaerdi={<Pille tone={AKTIV_STATUS[status]?.pill}>{antal}</Pille>} />
            ))}
            <p className="fc-hint" style={{ marginTop: 10 }}>
              {num(DEMO_AKTIVER.length)} hentede af {num(k.facility.aktiver)} aktiver i alt.
              Facility er <b>fælles</b> — tallet er det samme under Gods og Bus, fordi
              porten er den samme uanset hvem der kører igennem den.
            </p>
          </Kort>
        </div>
      </Gitter>
    </div>
  );
}
