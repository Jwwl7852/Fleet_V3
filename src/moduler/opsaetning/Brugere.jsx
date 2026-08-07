/* src/moduler/opsaetning/Brugere.jsx
 * Brugere & roller
 *
 * SKELET. Der findes INGEN mockup for denne skærm.
 *
 * Ikke tegnet. Roller: casehandler, disponent, koordinator, admin (se
 * booking-state.js). Tenant og rolle sættes som custom claims server-side,
 * aldrig fra klienten, og rolleskift skal kalde revokeRefreshTokens —
 * ellers beholder brugeren sin gamle adgang indtil tokenet udløber.
 *
 * Dennis skal have adgang til GitHub, Firebase, Netlify og domæneregistrator.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";

export default function Brugere() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Brugere & roller">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
