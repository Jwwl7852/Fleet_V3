/* src/moduler/support/Sag.jsx
 * Supportsag — skjult fra normal navigation i FleetControl V1.
 *
 * Ruten findes stadig (App.jsx), så et link til en konkret sag ikke ender i
 * en 404 — men Support-modulet er fase 0 fra ende til anden (ingen reel
 * læse-/skrivevej), så skærmen viser en ærlig besked uanset :id, i stedet
 * for de permanente demo-supportsager (`demo-support.js`'s
 * DEMO_SUPPORTSAGER/DEMO_TENANTS + demoSupportsag/demoBeskeder/
 * demoBevilling/demoUdtraek). Koden ligger i git-historikken. Se Skive 1 i
 * docs/product-redesign-v1/05_IMPLEMENTATION_SLICES.md.
 */
import { Tom } from "../../fleet/ui.jsx";

export default function Supportsag() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Tom>
        Supportsager er ikke en del af FleetControl V1 endnu.
      </Tom>
    </div>
  );
}
