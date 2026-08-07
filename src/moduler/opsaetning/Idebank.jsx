/* src/moduler/opsaetning/Idebank.jsx
 * Idébank
 *
 * SKELET. Der findes INGEN mockup for denne skærm.
 *
 * Ikke tegnet her endnu — findes som selvstændig idebank.html. Flyt den ind,
 * så den arver Firebase-configen fra shellen i stedet for at have sin egen
 * (FIREBASE_CONFIG = null er stadig en åben risiko i den fil).
 *
 * Prioritering: værdi ÷ indsats. Kilde-feltet er signal om product-market fit.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";

export default function Idebank() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Idébank">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
