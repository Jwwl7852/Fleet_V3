/* src/moduler/Oekonomi.jsx
 * Økonomi & Rapporter — skjult i navigationen i FleetControl V1.
 *
 * Ruten findes stadig (App.jsx), så et gammelt link ikke ender i en 404 —
 * men menupunktet er væk, og "Økonomi & Rapporter" i sidebaren peger nu på
 * Fakturacenter. Den tidligere skærm viste en omkostningstabel og en
 * "klar til fakturering"-liste bygget på permanente demo-datasæt
 * (`demo-oekonomi.js`'s DEMO_DAEKNINGSGRAD_HISTORIK og
 * DEMO_KLAR_TIL_FAKTURERING) — ikke rigtige tal. Koden ligger i
 * git-historikken og kan genindføres som rapporthub, når den er klar. Se
 * Skive 1 i docs/product-redesign-v1/05_IMPLEMENTATION_SLICES.md.
 */
import { Link } from "react-router-dom";
import { Tom } from "../fleet/ui.jsx";

export default function Oekonomi() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Tom handling={<Link className="fc-a" to="/oekonomi/fakturacenter">Gå til Fakturacenter</Link>}>
        Økonomi & Rapporter er ikke en del af FleetControl V1 endnu.
      </Tom>
    </div>
  );
}
