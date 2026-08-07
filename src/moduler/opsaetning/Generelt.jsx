/* src/moduler/opsaetning/Generelt.jsx
 * Opsætning – generelt
 *
 * SKELET. Der findes INGEN mockup for denne skærm.
 *
 * Ikke tegnet. Tenant-id er immutabelt. Afdelinger og stamdata hører her.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";

export default function Generelt() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Opsætning – generelt">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
