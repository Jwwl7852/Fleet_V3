/* src/moduler/flaade/Oversigt.jsx
 * Flåde
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * 'Omkostning pr. km' her er DRIFTSOMKOSTNING uden chauffør. Kalkulationsprisen
 * inkl. chauffør ligger i Bookingopsætning. Hold navnene adskilt.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function FlaadeOversigt() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Aktive køretøjer" vaerdi={num(k.flaade.aktive)} />
        <KpiKort label="Ude af drift" vaerdi={num(k.flaade.udeAfDrift)} />
        <KpiKort label="Service inden 30 dage" vaerdi={num(k.flaade.serviceInden30)} />
        <KpiKort label="Driftsomk. pr. km" vaerdi={kr(k.flaade.omkostningPrKmOere,2)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Flåde">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
