/* src/fleet/useKpi.js
 * Nøgletal læses ÉT sted: tenants/<id>/kpi/<gods|bus>/current
 *
 * Dashboard og modulerne læser samme felter. Derfor kan Dashboard ikke
 * længere sige "3 servicepunkter forfalder" mens Facility siger 18 —
 * det er samme kilde, og afledte tal (kapacitetsgrad, budgetafvigelse)
 * beregnes hos forbrugeren i stedet for at blive skrevet ind to steder.
 *
 * once() frem for on() — egress koster, og disse tal skal ikke være live.
 *
 * Demo-sættet er delt på division ligesom den rigtige node. Var det ét
 * fælles sæt, ville Gods/Bus-skiftet ikke ændre et eneste tal i demo-mode,
 * og beslutning 9 ville kun være implementeret på stien.
 */
import { useEffect, useState, useCallback } from "react";
import { useFleet } from "./FleetContext.jsx";
import { db, miljoe } from "../firebase.js";
import { DEMO_KPI } from "./demo-kpi.js";
import { TILSTAND, dataTilstand } from "./datatilstand.js";

export function useKpi() {
  const { tenantId, division, path, dage, bruger } = useFleet();
  const [data, setData] = useState(null);
  const [henter, setHenter] = useState(true);
  const [fejl, setFejl] = useState(null);
  const [tilstand, setTilstand] = useState({ art: TILSTAND.ok, visDemo: false });
  const [nonce, setNonce] = useState(0);

  const genindlaes = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let aktiv = true;
    setHenter(true);
    setFejl(null);
    const demo = DEMO_KPI[division] || DEMO_KPI.gods;

    /* FØR forespørgslen. Manglende database og manglende bruger er begge
       tilstande vi kender op front — de skal ikke fanges som fejl, og uden
       bruger sendes forespørgslen slet ikke. Så kan vi heller ikke komme til
       at kalde en afvisning for et netværksproblem. Se datatilstand.js. */
    const foer = dataTilstand({ harDb: Boolean(db), harBruger: Boolean(bruger), miljoe });
    if (foer.art !== TILSTAND.ok) {
      if (aktiv) {
        setTilstand(foer);
        setData(foer.visDemo ? demo : null);
        setHenter(false);
      }
      return () => { aktiv = false; };
    }

    (async () => {
      try {
        const snap = await db.ref(path(`kpi/${division}/current`)).once("value");
        if (!aktiv) return;
        setTilstand({ art: TILSTAND.ok, visDemo: false });
        /* Tom node → demo. Det er IKKE samme sag som en afvisning: her har
           serveren svaret, og der står bare ikke noget endnu, fordi
           KPI-aggregeringen mangler (se efterslæbet i README). Skal det
           falde bort, skal aggregeringen findes først — ellers står hele
           appen tom for en bruger der er logget korrekt ind. */
        setData(snap.val() || demo);
      } catch (e) {
        if (!aktiv) return;
        setFejl(e);
        setTilstand(dataTilstand({ harDb: true, harBruger: true, miljoe, fejl: e }));
        /* Ingen tal oven på en afvisning. Det er hele pointen. */
        setData(null);
      } finally {
        if (aktiv) setHenter(false);
      }
    })();

    return () => { aktiv = false; };
  }, [tenantId, division, dage, path, nonce, bruger]);

  return { kpi: data, henter, fejl, tilstand, genindlaes };
}

/* Demo-sættet ligger i demo-kpi.js — rent data, uden React, så en test og
   demo-filerne kan læse det uden at trække FleetContext med. Det re-eksporteres
   her, så alt der importerede DEMO_KPI herfra virker uændret. */
export { DEMO_KPI };
