/* src/moduler/indkoeb/Oversigt.jsx
 * Indkøb & vareforbrug
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * Priser pr. enhed i øre. Mockuppen viste 18,50 kr/stk — det er 1850 øre.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function IndkoebOversigt() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Åbne indkøb" vaerdi={num(36)} />
        <KpiKort label="Varer til godkendelse" vaerdi={num(8)} />
        <KpiKort label="Mangler faktura" vaerdi={num(24)} />
        <KpiKort label="Månedens forbrug" vaerdi={kr(12284500)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Indkøb & vareforbrug">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
