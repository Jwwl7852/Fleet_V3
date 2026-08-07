/* src/moduler/Kunder.jsx
 * Kunder & Priser
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * 'Dækningsbidrag (30 dage)' viste 842.615 kr i mockuppen — samme tal som
 * driftsomkostningerne. Det er sit eget felt: kunder.daekningsbidragOere.
 *
 * Prisafvigelser her har betterWhen:'higher' (mistet omsætning er dårligt),
 * mens Økonomis budgetafvigelser har betterWhen:'lower'. Derfor kan minus
 * være rødt her og grønt der — konventionen ligger i deviation().
 */
import { useKpi } from "../fleet/useKpi.js";
import { kr, num, pct } from "../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../fleet/ui.jsx";
import { Henter, Fejl } from "../fleet/ui.jsx";

export default function Kunder() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Aktive kunder" vaerdi={num(k.kunder.aktive)} />
        <KpiKort label="Aftaler udløber" vaerdi={num(k.kunder.aftalerUdloeber)} />
        <KpiKort label="Aktuelle tilbud" vaerdi={num(k.kunder.tilbud)} />
        <KpiKort label="Dækningsbidrag" vaerdi={kr(k.kunder.daekningsbidragOere)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Kunder & Priser">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
