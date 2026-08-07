/* src/moduler/Dashboard.jsx
 * REFERENCEMODUL. Sådan ser et modul ud i v3.
 *
 * Læg mærke til hvad der IKKE er her: ingen sidebar, ingen tenant-vælger,
 * ingen periodevælger, ingen egen Firebase-init, ingen egne farver, ingen
 * håndskrevne afvigelsesstrenge, ingen egne nøgletal.
 *
 * Alle tal på Dashboard er de SAMME felter som modulerne selv læser. Derfor
 * kan Dashboard ikke længere sige "3 servicepunkter forfalder" mens Facility
 * siger 18 — det var tilfældet i mockupsene.
 */
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { kr, num, pct, dato, deviation, deviationPct } from "../fleet/format.js";
import { Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, MiniLinje, Gitter } from "../fleet/ui.jsx";

const HANDLINGER = (k) => [
  { n: 3, t: "nye indberetninger", til: "/flaade/indberetninger", link: "Se indberetninger", tone: "bad", ikon: "!" },
  { n: k.flaade.udeAfDrift, t: "køretøjer ude af drift", til: "/flaade", link: "Se køretøjer", tone: "warn", ikon: "▲" },
  { n: k.opgaver.forsinkede, t: "opgaver forsinket", til: "/booking", link: "Se opgaver", tone: "warn", ikon: "◷" },
  { n: k.indkoeb.fakturaerTilGodkendelse, t: "fakturaer til godkendelse", til: "/indkoeb/fakturaer", link: "Se fakturaer", tone: "info", ikon: "kr" },
  { n: k.facility.servicepunkterForfalder, t: "servicepunkter forfalder", til: "/facility/servicekalender", link: "Se servicekalender", tone: "brand", ikon: "⚙" },
];

/* division står eksplicit på hver post — ingen arver en default.
   Port 3 er "faelles": porten er den samme uanset om det er en lastbil
   eller en bus der skal igennem den, så opgaven står på begge lister.
   Fælles omkostninger skal fordeles før de kan læses som divisionens egne —
   fordelingsnøglen er udskudt, se beslutning 15. */
const OPGAVER = [
  { id: 1, ms: Date.now() - 3 * 864e5, division: "gods", enhed: "Bil 155", type: "Reparation", besk: "Palleløfter vil ikke løfte", ansv: "Lars Aage", status: "Indberettet", tone: "warn", est: 650000, alvor: "hoej" },
  { id: 2, ms: Date.now() - 4 * 864e5, division: "gods", enhed: "Bil 104", type: "Service", besk: "Serviceeftersyn 30.000 km", ansv: "Rene Thomsen", status: "Planlagt", tone: "info", est: 320000, alvor: "mellem" },
  { id: 3, ms: Date.now() - 5 * 864e5, division: "faelles", enhed: "Porte – Port 3", type: "Facility", besk: "Port lukker langsomt", ansv: "Benjamin", status: "Afventer", tone: "warn", est: 480000, alvor: "hoej" },
  { id: 4, ms: Date.now() - 6 * 864e5, division: "gods", enhed: "Lastbil 106", type: "Reparation", besk: "Motorlampe lyser", ansv: "Lars Aage", status: "I gang", tone: "ok", est: 1200000, alvor: "hoej" },
  { id: 5, ms: Date.now() - 7 * 864e5, division: "gods", enhed: "Truck 2", type: "Service", besk: "Gaffeljustering og smøring", ansv: "Benjamin", status: "Planlagt", tone: "info", est: 180000, alvor: "lav" },
  { id: 6, ms: Date.now() - 8 * 864e5, division: "bus", enhed: "Bus 12", type: "Reparation", besk: "Fordør lukker ikke i", ansv: "Rene Thomsen", status: "Indberettet", tone: "warn", est: 540000, alvor: "hoej" },
];

export default function Dashboard() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  const { division } = useFleet();

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  /* Afledte tal BEREGNES her — de skrives ikke ind i basen to steder.
     Det er derfor kapacitetsgraden ikke længere kan være 84 % på Dashboard
     og 83 % i Bemanding. */
  const budgetAfv = k.oekonomi.driftsomkostningerOere - k.oekonomi.budgetOere;
  const budgetAfvPct = deviationPct(k.oekonomi.driftsomkostningerOere, k.oekonomi.budgetOere);
  const kapacitet = (k.bemanding.disponeret / k.bemanding.planlagt) * 100;

  /* Samme visningsregel som useListe: valgt division plus fælles. */
  const opgaver = OPGAVER.filter((o) => o.division === division || o.division === "faelles");

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — der er ikke forbindelse til databasen.</Fejl>}

      <Kort titel="Kræver handling">
        <KpiRaekke>
          {HANDLINGER(k).map((h) => (
            <div key={h.t} className="fc-card fc-kpi" style={{ boxShadow: "none" }}>
              <div className={`fc-kpi-ico fc-tone-${h.tone}`}>{h.ikon}</div>
              <div className="fc-kpi-txt">
                <div style={{ fontWeight: 650 }}>{h.n} {h.t}</div>
                <Link className="fc-a" style={{ fontSize: 12.5 }} to={h.til}>{h.link}</Link>
              </div>
            </div>
          ))}
        </KpiRaekke>
      </Kort>

      <KpiRaekke>
        <KpiKort label="Åbne opgaver" vaerdi={num(k.opgaver.aabne)} />
        <KpiKort label="Nedetid" vaerdi={pct(k.flaade.nedetidPct, 1)}
                 afvigelse={deviation(-0.6, { betterWhen: "lower", unit: "pct" })} note="%-point" />
        <KpiKort label="Driftsomkostninger" vaerdi={kr(k.oekonomi.driftsomkostningerOere)}
                 afvigelse={deviation(budgetAfvPct, { betterWhen: "lower", unit: "pct" })} note="vs. budget" />
        <KpiKort label="Omkostning pr. km" vaerdi={kr(k.flaade.omkostningPrKmOere, 2)}
                 afvigelse={deviation(k.flaade.omkostningPrKmDeltaOere / 100, { betterWhen: "lower", dec: 2 })}
                 note="vs. sidste periode" />
        <KpiKort label="Budgetafvigelse"
                 vaerdi={deviation(budgetAfv, { betterWhen: "lower", unit: "kr" }).text}
                 afvigelse={deviation(budgetAfvPct, { betterWhen: "lower", unit: "pct" })} note="vs. budget" />
        <KpiKort label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)}
                 note="ekskl. moms" />
      </KpiRaekke>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel="Åbne opgaver der kræver opfølgning"
              handling={<Link className="fc-a" to="/booking">Se alle opgaver</Link>}>
          <Tabel
            kolonner={[
              { key: "ms", label: "Dato", render: (r) => dato(r.ms) },
              { key: "enhed", label: "Enhed", render: (r) => <b>{r.enhed}</b> },
              { key: "type", label: "Type" },
              { key: "besk", label: "Beskrivelse" },
              { key: "ansv", label: "Ansvarlig" },
              { key: "status", label: "Status", render: (r) => <Pille tone={r.tone}>{r.status}</Pille> },
              { key: "est", label: "Estimat", num: true, render: (r) => kr(r.est) },
              { key: "alvor", label: "Prioritet", render: (r) => (
                  <Pille tone={r.alvor === "hoej" ? "bad" : r.alvor === "mellem" ? "warn" : "ok"}>
                    {r.alvor === "hoej" ? "Høj" : r.alvor === "mellem" ? "Mellem" : "Lav"}
                  </Pille>) },
            ]}
            raekker={opgaver}
            tom="Ingen åbne opgaver i perioden."
          />
        </Kort>

        <div className="fc-grid">
          <Kort titel="Bemanding i dag"
                handling={<Link className="fc-a" to="/bemanding">Se bemanding</Link>}>
            <MiniLinje label="Chauffører disponeret"
                       vaerdi={`${k.bemanding.chauffoerDisponeret} / ${k.bemanding.chauffoerPlanlagt}`} />
            <MiniLinje label="Underbemandede vagter" vaerdi={k.bemanding.underbemandede} />
            <MiniLinje label="Ledig kapacitet" vaerdi={`${k.bemanding.ledig} personer`} />
            <MiniLinje label="Kapacitetsgrad" vaerdi={pct(kapacitet, 0)} />
          </Kort>

          <Kort titel="Facility"
                handling={<Link className="fc-a" to="/facility">Gå til Facility</Link>}>
            <MiniLinje label="Servicepunkter forfalder" vaerdi={k.facility.servicepunkterForfalder} />
            <MiniLinje label="Åbne facility-sager" vaerdi={k.facility.aabneSager} />
            <MiniLinje label="Planlagt vedligehold" vaerdi={k.facility.planlagtVedligehold} />
            <MiniLinje label="Aktiver i drift" vaerdi={num(k.facility.aktiver)} />
          </Kort>

          <Kort titel="Indkøb"
                handling={<Link className="fc-a" to="/indkoeb">Gå til Indkøb</Link>}>
            <MiniLinje label="Fakturaer til godkendelse" vaerdi={k.indkoeb.fakturaerTilGodkendelse} />
            <MiniLinje label="Åbne ordrer" vaerdi={k.indkoeb.aabneOrdrer} />
            {/* Indkøbsprisafvigelse — leverandørsiden, betterWhen 'lower'. Ikke det
                samme tal som salgsprisafvigelsen på Kunder & Priser. */}
            <MiniLinje label="Indkøbsprisafvigelse (snit)"
                       vaerdi={deviation(k.indkoeb.indkoebsprisafvigelseSnitPct, { betterWhen: "lower", unit: "pct" }).text} />
            <MiniLinje label="Leverance til tiden" vaerdi={pct(k.indkoeb.leveranceTilTidenPct)} />
          </Kort>
        </div>
      </Gitter>

      <p className="fc-hint">Alle beløb er ekskl. moms, medmindre andet er angivet.</p>
    </div>
  );
}
