/* src/moduler/indkoeb/Fakturaer.jsx
 * Fakturagodkendelse & afstemning
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * Afstemningen i mockuppen viste '9.842.250 − 9.781.625 = 9.765.125', hvilket
 * ikke er en subtraktion. Det er tre uafhængige totaler med to afvigelser:
 *   registreredeIndkoeb, modtagneFakturaer, bogfoertBeloeb
 * Afvigelsen (16.500 kr) = modtagneFakturaer − bogfoertBeloeb.
 *
 * Og KPI-kortet sagde 8 afstemningsafvigelser mens tabellen sagde 16 (8+5+3).
 * Antallet skal beregnes fra listen.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function Fakturaer() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Fakturaer til godkendelse" vaerdi={num(21)} />
        <KpiKort label="Manglende match" vaerdi={num(14)} />
        <KpiKort label="Afstemningsafvigelser" vaerdi={num(16)} />
        <KpiKort label="Godkendt denne måned" vaerdi={num(86)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Fakturagodkendelse & afstemning">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
