/* src/moduler/Bemanding.jsx
 * Bemandingsplan — skjult i navigationen i FleetControl V1.
 *
 * Ruten findes stadig (App.jsx); kun menupunktet er væk, og "Workforce" i
 * sidebaren peger nu på Kompetencer. Den tidligere ugevisning byggede på et
 * permanent demo-datasæt (`demo-bemanding.js`'s DEMO_BEMANDINGSPLAN) uden en
 * rigtig vagtnode bag. Koden ligger i git-historikken og kan genindføres,
 * når en rigtig plan findes at vise. Se Skive 1 i
 * docs/product-redesign-v1/05_IMPLEMENTATION_SLICES.md.
 */
import { Link } from "react-router-dom";
import { Tom } from "../fleet/ui.jsx";

export default function Bemanding() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Tom handling={<Link className="fc-a" to="/bemanding/kompetencer">Gå til Kompetencer</Link>}>
        Bemandingsplan er ikke en del af FleetControl V1 endnu.
      </Tom>
    </div>
  );
}
