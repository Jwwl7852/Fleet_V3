/* src/moduler/Bemanding.jsx
 * Bemanding
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * Kapacitetsgrad BEREGNES: disponeret / planlagt. Skriv den ikke ind — det var
 * derfor Dashboard sagde 84 % og Bemanding 83 %.
 */
import { useKpi } from "../fleet/useKpi.js";
import { kr, num, pct } from "../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../fleet/ui.jsx";
import { Henter, Fejl } from "../fleet/ui.jsx";

export default function Bemanding() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Disponeret i dag" vaerdi={num(k.bemanding.disponeret)} />
        <KpiKort label="Ledig kapacitet" vaerdi={num(k.bemanding.ledig)} />
        <KpiKort label="Underbemandede vagter" vaerdi={num(k.bemanding.underbemandede)} />
        <KpiKort label="Kompetencer udløber" vaerdi={num(k.bemanding.kompetencerUdloeber)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Bemanding">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
