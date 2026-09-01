/* src/moduler/facility/Klima.jsx
 * Klima & energi — skjult i navigationen i FleetControl V1.
 *
 * Ruten findes stadig (App.jsx); "Facility" i sidebaren peger uændret på
 * Overblik. Skærmen læste rigtige zoner og sensorer, men
 * zone-/sensoropsætningen er endnu ikke moden nok til V1. Koden ligger i
 * git-historikken og kan genindføres, når opsætningen er klar. Se Skive 1 i
 * docs/product-redesign-v1/05_IMPLEMENTATION_SLICES.md.
 */
import { Tom } from "../../fleet/ui.jsx";

export default function Klima() {
  return (
    <div className="fc-grid" style={{ gap: 11 }}>
      <Tom>
        Klima & energi er ikke en del af FleetControl V1 endnu.
      </Tom>
    </div>
  );
}
