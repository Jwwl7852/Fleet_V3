/* src/moduler/facility/Klima.jsx
 * Facility – klimaovervågning & energistatistik
 *
 * TO FEJL FRA MOCKUPPEN, BEGGE LUKKET STRUKTURELT FREM FOR RETTET.
 *
 * ⚠ 1. GENNEMSNITTET BEREGNES, DET SKRIVES IKKE.
 * Mockuppen viste 15,2 °C over en tabel hvis sensorer gav 16,9. Tallet var
 * skrevet i hånden — og 15,2 er faktisk ÉN zones værdi (Kontor Kolding), som
 * blev læst som gennemsnittet af dem alle. Skærmen regner nu på den samme
 * liste den viser, så de to kan ikke være uenige.
 *
 * ⚠ OG DET ER PR. ZONEART. Et gennemsnit på tværs af en fryser på −19,8 °C og
 * et kontor på 15,2 °C giver 3 °C, og det tal beskriver ingenting. Det er
 * beslutning 11 og 14 igen: to størrelser med hver sin betydning må ikke
 * lægges sammen, blot fordi de deler enhed. Derfor ét snit pr. art og aldrig
 * ét samlet.
 *
 * ⚠ 2. EL/VARME ER IKKE BYGNINGSOMKOSTNINGEN.
 * Mockuppens "El/varme denne måned 58.420 kr" var hele bygningen — el, varme,
 * vand, ventilation og alarm. El og varme alene er 43.030 kr. To tal med hver
 * sin betydning under ét navn.
 * Komponenterne gemmes, begge totaler beregnes. Lagrede vi dem, kunne de drive
 * fra komponenterne, og en post kunne mangle uden at totalen afslørede det.
 *
 * SENSORVÆRDIERNE KOMMER FRA SAMME NODE SOM OVERBLIK — se zonePar().
 */
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, klokke } from "../../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Gitter, MiniLinje, Soejlegraf,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  ZONE_ART, OMKOSTNINGSPOST, alarmTilstand, aktiveAlarmer,
  gennemsnitPrZoneArt, elVarmeOere, bygningsomkostningOere, zonePar,
} from "../../fleet/facility.js";
import { demoLokation } from "../../fleet/demo-facility.js";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";

const grader = (t) => (Number.isFinite(t) ? `${t.toFixed(1)} °C` : "—");

export default function Klima() {
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();

  /* ⚠ SAMME TO NODER SOM OVERBLIK, OG SAMME zonePar(). Regnestykket lå i
     demo-facility.js og tog ingen argumenter — så skærmen viste demofilen
     også efter at noden var seedet. Nu tager den zoner og sensorer ind, og de
     to skærme kan ikke længere parre forskelligt.

     Facility er fælles, og reglerne forbyder `division` på noderne. */
  const felles = { vindue: "alle", graense: 500 };
  const zon = useListe("facility/zoner", { ordnPaa: "lokationId", ...felles });
  const sen = useListe("facility/sensorer", felles);

  /* ⚠ ET OBJEKT, IKKE EN LISTE. `facility/omkostning` er fem navngivne
     poster — el, varme, vand, ventilation, alarm — ikke rækker med id.
     useListe ville have gjort hver komponent til en "post" med et tal som
     krop, og så ville el og varme se ud som to aktiver. */
  const omk = usePost("facility", "omkostning");

  if (henter || zon.henter || sen.henter || omk.henter) {
    return <Henter hvad="klimadata" />;
  }
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  const par = zonePar(zon.data, sen.data);
  const alarmer = aktiveAlarmer(par);
  const snit = gennemsnitPrZoneArt(par);

  /* ⚠ BEGGE BEREGNES HER, IKKE I kpi/. Et gemt totalfelt kunne drive fra de
     komponenter det beskriver — og kpi-feltet `facilityOmkostningOere` var
     netop dét, så det er fjernet. Se "Skal UD af aggregeringen" i README. */
  const poster = omk.post || {};
  const elVarme = elVarmeOere(poster);
  const bygning = bygningsomkostningOere(poster);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {k && (
        <KpiRaekke>
          <KpiKort label="Aktive sensorer" vaerdi={num(k.facility.sensorerAktive)} />
          {/* Afledt af måling + grænse, ikke gemt. kpi'ens klimaalarmerIDag er et
              andet tal: det kræver historik. */}
          <KpiKort label="Klimaalarmer nu" vaerdi={num(alarmer.length)} note="beregnet" />
          <KpiKort label="Klimaalarmer i dag" vaerdi={num(k.facility.klimaalarmerIDag)} />
          {/* TO KORT, TO TAL. Aldrig ét felt der hedder begge dele. */}
          <KpiKort label="El & varme" vaerdi={kr(elVarme)} note="denne måned, ekskl. moms" />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel="Zoner">
          <Tabel
            kolonner={[
              { key: "navn", label: "Zone", render: (r) => <b>{r.zone.navn}</b> },
              { key: "sted", label: "Sted",
                render: (r) => demoLokation(r.zone.lokationId)?.navn || "—" },
              { key: "art", label: "Art",
                render: (r) => <Pille tone="info">{ZONE_ART[r.zone.art]?.label}</Pille> },
              { key: "temp", label: "Temperatur", num: true,
                render: (r) => grader(r.maaling?.tempC) },
              { key: "graense", label: "Grænse", num: true,
                render: (r) => `${r.zone.graenser.minC} – ${r.zone.graenser.maksC} °C` },
              { key: "fugt", label: "Fugt", num: true,
                render: (r) => (r.maaling ? `${num(r.maaling.fugtPct)} %` : "—") },
              { key: "maalt", label: "Målt", render: (r) => (r.maaling ? klokke(r.maaling.ms) : "—") },
              { key: "status", label: "Status", render: (r) => {
                  const a = alarmTilstand(r.zone, r.maaling);
                  return <Pille tone={a.tone}>{a.tekst}</Pille>;
                } },
            ]}
            raekker={par}
            noegle={(r) => r.zone.id}
            tom="Ingen zoner."
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            <b>Grænsen står på zonen, målingen på sensoren.</b> Alarmen er afledt af
            de to og gemmes ikke — lå tærsklen på sensornoden, ville en justering
            skrive i måledata, og man kunne bagefter ikke sige hvad temperaturen
            faktisk var. Samme tal som{" "}
            <Link className="fc-a" to="/facility">Overblik</Link> viser.
          </p>
        </Kort>

        <div className="fc-grid">
          <Kort titel="Gennemsnit pr. zoneart">
            {Object.entries(snit).map(([art, v]) => (
              <MiniLinje key={art}
                         label={`${ZONE_ART[art]?.label} (${v.antal})`}
                         vaerdi={<b>{grader(v.snit)}</b>} />
            ))}
            <p className="fc-hint" style={{ marginTop: 10 }}>
              ⚠ <b>Ét samlet gennemsnit ville være meningsløst.</b> Et snit på tværs af
              en fryser og et kontor beskriver ingen af dem. Tallene her er beregnet
              af den samme liste som tabellen ved siden af — de kan ikke være uenige
              med den, sådan som mockuppens 15,2 °C var med sine egne 16,9.
            </p>
          </Kort>

          <Kort titel="Bygningsomkostninger denne måned">
            {Object.entries(OMKOSTNINGSPOST).map(([n, label]) => (
              <MiniLinje key={n} label={label}
                         vaerdi={kr(poster[n] || 0)} />
            ))}
            <div className="fc-sum">
              <span>El &amp; varme</span>
              <span className="fc-sum-v">{kr(elVarme)}</span>
            </div>
            <div className="fc-sum">
              <span>Bygningen i alt</span>
              <span className="fc-sum-v">{kr(bygning)}</span>
            </div>
            <p className="fc-hint" style={{ marginTop: 10 }}>
              ⚠ <b>De to er ikke det samme tal.</b> Mockuppen skrev "El/varme denne
              måned {kr(bygning)}", men det var hele bygningen inkl. vand, ventilation
              og alarm. El og varme alene er <b>{kr(elVarme)}</b>. Komponenterne gemmes;
              begge totaler beregnes her, så de ikke kan drive fra hinanden.
            </p>
          </Kort>
        </div>
      </Gitter>

      <Kort titel="Forbrug pr. post">
        <Soejlegraf
          punkter={Object.entries(OMKOSTNINGSPOST).map(([n, label]) => ({
            label, vaerdier: [(poster[n] || 0) / 100],
          }))}
          serier={[{ navn: "Denne måned (kr.)", tone: "brand" }]}
          format={(v) => `${num(v)} kr.`}
        />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Nulpunktet er altid 0 — en afkortet akse får to procentpoint til at ligne
          en halvering. Alle beløb er ekskl. moms.
        </p>
      </Kort>
    </div>
  );
}
