/* src/moduler/Fravaer.jsx
 * Ferie & fravær
 *
 * SKELET. Der findes INGEN mockup for denne skærm.
 *
 * Ikke tegnet. Fravær skal skrive en reservation med kilde 'fravaer' på
 * chaufføren (se reservations.js) — ellers kan en syg chauffør disponeres.
 * Fravær har højere prioritet end booking.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../fleet/ui.jsx";

export default function Fravaer() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Ferie & fravær">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
