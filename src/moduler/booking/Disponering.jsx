/* src/moduler/booking/Disponering.jsx
 * Disponering
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * TO DOMÆNER, én skærm. Dagsvisningen er værkstedsopgaver med varighed i timer.
 * Ugesvisningen er langtur med ETA over døgngrænser, grænseovergange og
 * køre-hviletid. Det er ikke to zoomniveauer af samme datamodel — opgaver
 * skal have en `art` ('vaerksted' | 'langtur') der styrer hvilke felter
 * der findes. Bygges de som ét, er det den beslutning der bider senere.
 *
 * Konfliktlisten nederst skal komme fra tjekLedig() i reservations.js.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function Disponering() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Planlagte opgaver" vaerdi={num(k.disponering.planlagteOpgaver)} />
        <KpiKort label="Uplanlagte" vaerdi={num(k.opgaver.uplanlagte)} />
        <KpiKort label="Ledig kapacitet" vaerdi={pct(k.disponering.ledigKapacitetPct)} />
        <KpiKort label="Konflikter" vaerdi={num(k.disponering.konflikter)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Disponering">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
