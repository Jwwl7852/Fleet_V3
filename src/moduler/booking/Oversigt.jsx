/* src/moduler/booking/Oversigt.jsx
 * Booking & Opgaver
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * Tabellen skal vise bookingens TILSTAND (se booking-state.js), ikke en fri statusstreng.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function BookingOversigt() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Nye bookinger" vaerdi={num(k.opgaver.nyeBookinger)} />
        <KpiKort label="I gang i dag" vaerdi={num(k.opgaver.igangIDag)} />
        <KpiKort label="Forsinkede" vaerdi={num(k.opgaver.forsinkede)} />
        <KpiKort label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Booking & Opgaver">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
