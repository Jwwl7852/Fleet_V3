/* src/moduler/booking/Forslag.jsx
 * Booking – forslag & reservation
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * Rolle: koordinator. Godkend-knappen skal:
 *   1. kalde kanSkifte() — disponenten maa IKKE godkende sit eget forslag
 *   2. oprette reservationen via reserver() i reservations.js
 * De to ting skal ske atomisk i en Cloud Function, ikke i to klientkald.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";

export default function Forslag() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Booking – forslag & reservation">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
