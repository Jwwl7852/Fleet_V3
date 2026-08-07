/* src/moduler/facility/Servicekalender.jsx
 * Facility – servicekalender & reparationer
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * 'Reserveret fra sag #1245' skal skrive en reservation med kilde 'facilitySag'
 * på aktivet eller lokationen — samme node som booking og værksted bruger.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function Servicekalender() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Planlagte besøg" vaerdi={num(k.facility.planlagtVedligehold)} />
        <KpiKort label="Eksterne leverandører" vaerdi={num(8)} />
        <KpiKort label="Reserveret fra sager" vaerdi={num(k.facility.aabneSager)} />
        <KpiKort label="Anslået omkostning" vaerdi={kr(12845000)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Facility – servicekalender & reparationer">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
