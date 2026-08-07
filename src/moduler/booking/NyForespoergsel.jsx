/* src/moduler/booking/NyForespoergsel.jsx
 * Booking – ny transportforespørgsel
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * Rolle: casehandler. Gem-knappen skal kalde byggSkifte(..., 'afventerPlan') fra booking-state.js.
 * Bookingnummer hentes med naesteBookingnummer() — aldrig ved at taelle eksisterende.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";

export default function NyForespoergsel() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Booking – ny transportforespørgsel">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
