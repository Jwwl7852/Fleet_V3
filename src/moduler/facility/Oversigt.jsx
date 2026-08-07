/* src/moduler/facility/Oversigt.jsx
 * Facility – overblik, fejl & klima
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * Sensorværdierne skal komme fra samme node som Klima-skærmen. I mockupsene
 * viste de to skærme forskellige temperaturer for samme zoner — kun Depot 2
 * stemte.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function FacilityOversigt() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Åbne fejl" vaerdi={num(24)} />
        <KpiKort label="Planlagte servicebesøg" vaerdi={num(k.facility.planlagtVedligehold)} />
        <KpiKort label="Aktive klimaalarmer" vaerdi={num(5)} />
        <KpiKort label="Facility-omkostninger" vaerdi={kr(12684000)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Facility – overblik, fejl & klima">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
