/* src/moduler/app/Forside.jsx
 * Chaufførappens forside: de fire kort.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ KUN DE KORT DER FØRER ET STED HEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Specifikationen har fire: Timeregistrering, Turplan, Indberetning og Anmod
 * om frihed. To af dem er bygget, to er ikke — og de to sidste står ikke som
 * grå kort med "kommer snart".
 *
 * Det er beslutning 105's regel, én skærm længere inde: **en menu der mest
 * består af døre der ikke kan åbnes, er værre end ingen menu.** Et kort der
 * fortæller chaufføren at han ikke kan gøre det han skulle, er ikke en
 * oplysning til ham — det er en note til os, og den hører i README.
 *
 * ⚠ "MINE TURE" ER TURPLANENS FORLØBER. Den viser etaperne og chaufførens
 * meldinger (beslutning 103). Turplanen skal vise STOP med tidsvindue,
 * kontakt, ordrelinjer og scan — en model der ikke findes endnu. Kortet
 * skifter navn den dag den gør; det lover ikke noget det ikke kan.
 *
 * Se beslutning 106.
 */
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harModul, modulerForNode } from "../../fleet/moduler.js";

/**
 * ⚠ REKKEFØLGEN ER DAGENS, IKKE ALFABETETS. Chaufføren stempler ind, kører
 * sine ture, og melder det der gik galt undervejs. Et kort han bruger én gang
 * om måneden — frihed — står nederst.
 */
const KORT = [
  {
    til: "/app/tid",
    node: "stemplinger",
    ikon: "⏱️",
    titel: "Timeregistrering",
    under: "Stempl ind og ud. Der registreres ingen position.",
  },
  {
    til: "/app/tur",
    ikon: "🗺️",
    titel: "Mine ture",
    under: "Se dine ture for dagen, som de er planlagt i disponeringen.",
  },
  {
    til: "/app/indberetning",
    ikon: "📥",
    titel: "Indberetning",
    under: "Indberet service, skade, tankning m.m. direkte til driften.",
  },
];

export default function Forside() {
  const { bruger, moduler } = useFleet();
  /* Fornavnet alene. "Hej Lars Aage Nielsen" læses som en formular. */
  const fornavn = (bruger?.navn || "").split(" ")[0];

  /* ⚠ ET KORT HVIS NODE KUNDEN IKKE HAR, TEGNES IKKE. Det er beslutning 105
     én skærm længere inde: et kort der åbner en tom skærm med "virksomheden
     har ikke modulet", er en dør chaufføren ikke kan gøre noget ved. Kortene
     uden  hører til hele produktet. */
  const synlige = KORT.filter((k) => {
    if (!k.node) return true;
    const ejere = modulerForNode(k.node);
    return !ejere || ejere.some((m) => harModul(moduler, m));
  });

  return (
    <div className="fc-app-forside">
      {fornavn && <p className="fc-hint">Hej {fornavn} 👋</p>}
      {synlige.map((k) => (
        <Link key={k.til} to={k.til} className="fc-app-kort fc-app-genvej">
          <span className="fc-app-ikon" aria-hidden="true">{k.ikon}</span>
          <h2 className="fc-app-titel">{k.titel}</h2>
          <p className="fc-hint">{k.under}</p>
        </Link>
      ))}
    </div>
  );
}
