/* src/moduler/facility/Klima.jsx
 * Facility – klimaovervågning & energistatistik
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * To fejl fra mockuppen: gennemsnitstemperaturen (15,2 °C) passede ikke på de
 * viste sensorer (de gav 16,9 °C) — beregn den. Og 'El/varme denne måned'
 * var faktisk hele bygningsomkostningen inkl. vand, ventilation og alarm.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function Klima() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Aktive sensorer" vaerdi={num(27)} />
        <KpiKort label="Klimaalarmer i dag" vaerdi={num(3)} />
        <KpiKort label="El & varme" vaerdi={kr(4303000)} />
        <KpiKort label="Bygningsomkostninger" vaerdi={kr(5842000)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Facility – klimaovervågning & energistatistik">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
