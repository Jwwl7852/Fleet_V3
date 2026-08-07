/* src/moduler/Kompetencer.jsx
 * Kompetencer & certifikater
 *
 * SKELET. Der findes INGEN mockup for denne skærm.
 *
 * Ikke tegnet. Brug serviceTone() fra format.js til udløbsvarsling, så tærsklerne
 * (overskredet / ≤14 / ≤30 dage) er de samme som i Flåde og Facility.
 * En udløbet kompetence skal blokere chaufføren i disponeringen.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../fleet/ui.jsx";

export default function Kompetencer() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Kompetencer & certifikater">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
