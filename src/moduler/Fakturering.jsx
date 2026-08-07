/* src/moduler/Fakturering.jsx
 * Fakturering
 *
 * SKELET. Der findes INGEN mockup for denne skærm.
 *
 * Ikke tegnet. 'Opgaver klar til fakturering' på Økonomi-skærmen linker hertil.
 * Fakturanumre fra en counter i en transaction, aldrig fra en optælling.
 * Bogførte poster slettes ikke — kun soft delete.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../fleet/ui.jsx";

export default function Fakturering() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Fakturering">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
