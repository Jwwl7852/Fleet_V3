/* src/moduler/Oekonomi.jsx
 * Økonomi & Rapporter
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * I mockuppen stod budgetafvigelsen som '-72.560 kr' på KPI-kortet og '+72.560'
 * i tabellen nedenunder — samme tal, samme side, modsat fortegn.
 * Gem altid (faktisk − budget) og lad deviation() bestemme visningen.
 */
import { useKpi } from "../fleet/useKpi.js";
import { kr, num, pct } from "../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../fleet/ui.jsx";
import { Henter, Fejl } from "../fleet/ui.jsx";

export default function Oekonomi() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Driftsomkostninger" vaerdi={kr(k.oekonomi.driftsomkostningerOere)} />
        <KpiKort label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)} />
        <KpiKort label="Budgetafvigelse" vaerdi={kr(k.oekonomi.driftsomkostningerOere-k.oekonomi.budgetOere)} />
        <KpiKort label="Dækningsgrad" vaerdi={pct(k.oekonomi.daekningsgradPct)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Økonomi & Rapporter">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
