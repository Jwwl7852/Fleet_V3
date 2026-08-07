/* src/moduler/booking/LiveKort.jsx
 * Live-kort
 *
 * SKELET. Der findes INGEN mockup for denne skærm.
 *
 * Findes deployet på /tracking i v1.4, men mangler i alle 20 mockups.
 * Kortudsnittet nederst til højre i Booking-mockuppen hører formentlig her.
 * HERE-integrationen (valgt frem for TomTom) hører også her.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";

export default function LiveKort() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Live-kort">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
