/* src/moduler/support/Overblik.jsx
 * Supportoverblik — skjult i navigationen i FleetControl V1.
 *
 * Ruten findes stadig (App.jsx); den kræver support.laes, som ingen rolle
 * har i dag. Skærmen viste permanente demo-supportsager på tværs af kunder
 * (`demo-support.js`'s DEMO_SUPPORTSAGER/DEMO_TENANTS) — Support-modulet har
 * ingen reel læse-/skrivevej endnu. Koden ligger i git-historikken. Se
 * Skive 1 i docs/product-redesign-v1/05_IMPLEMENTATION_SLICES.md.
 */
import { Tom } from "../../fleet/ui.jsx";

export default function Supportoverblik() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Tom>
        Supportoverblik er ikke en del af FleetControl V1 endnu.
      </Tom>
    </div>
  );
}
