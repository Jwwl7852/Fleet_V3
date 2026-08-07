/* src/moduler/flaade/Indberetninger.jsx
 * Indberetninger
 *
 * SKELET. Der findes INGEN mockup for denne skærm.
 *
 * Ikke tegnet. De fire indberetningstyper (reparation, køretøjsskade, godsskade,
 * brændstof) er én generisk motor med forskellige feltskemaer.
 *
 * VIGTIGT om brændstof: km-feltet er totalt kilometertal, ikke km siden sidste
 * tankning. Økonomi (km/l) skal regnes på differencen mellem to på hinanden
 * følgende målerstande. AdBlue tælles ikke med i km/l.
 */
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";

export default function Indberetninger() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Indberetninger">
        <Tom>Denne skærm er ikke bygget endnu.</Tom>
      </Kort>
    </div>
  );
}
