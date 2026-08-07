/* src/fleet/useKpi.js
 * Nøgletal læses ÉT sted: tenants/<id>/kpi/<gods|bus>/current
 *
 * Dashboard og modulerne læser samme felter. Derfor kan Dashboard ikke
 * længere sige "3 servicepunkter forfalder" mens Facility siger 18 —
 * det er samme kilde, og afledte tal (kapacitetsgrad, budgetafvigelse)
 * beregnes hos forbrugeren i stedet for at blive skrevet ind to steder.
 *
 * once() frem for on() — egress koster, og disse tal skal ikke være live.
 */
import { useEffect, useState, useCallback } from "react";
import { useFleet } from "./FleetContext.jsx";
import { db } from "../firebase.js";

export function useKpi() {
  const { tenantId, division, path, dage } = useFleet();
  const [data, setData] = useState(null);
  const [henter, setHenter] = useState(true);
  const [fejl, setFejl] = useState(null);
  const [nonce, setNonce] = useState(0);

  const genindlaes = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let aktiv = true;
    setHenter(true);
    setFejl(null);

    (async () => {
      if (!db) {
        if (aktiv) { setData(DEMO_KPI); setHenter(false); }
        return;
      }
      try {
        const snap = await db.ref(path(`kpi/${division}/current`)).once("value");
        if (!aktiv) return;
        setData(snap.val() || DEMO_KPI);
      } catch (e) {
        if (!aktiv) return;
        setFejl(e);
        setData(DEMO_KPI);
      } finally {
        if (aktiv) setHenter(false);
      }
    })();

    return () => { aktiv = false; };
  }, [tenantId, division, dage, path, nonce]);

  return { kpi: data, henter, fejl, genindlaes };
}

/* Ét internt konsistent demo-sæt. Beløb i øre.
   Bemærk: ingen af tallene er 48 flere gange — i mockupsene var åbne
   opgaver, aktive køretøjer, aktive kunder og disponerede folk alle 48,
   hvilket læser som demo-data frem for en virksomhed. */
export const DEMO_KPI = {
  opgaver: {
    aabne: 47, indberettet: 12, planlagt: 10, igang: 9, afventer: 7, udfoert: 9,
    forsinkede: 4, nyeBookinger: 6, igangIDag: 18, uplanlagte: 8, klarTilFakturering: 12,
  },
  flaade: {
    aktive: 42, udeAfDrift: 6, paaVaerksted: 3, serviceInden30: 9,
    omkostningPrKmOere: 342, omkostningPrKmDeltaOere: 21, nedetidPct: 3.8,
  },
  bemanding: {
    planlagt: 58, disponeret: 48, ledig: 10, underbemandede: 6,
    chauffoerPlanlagt: 20, chauffoerDisponeret: 18, kompetencerUdloeber: 5,
  },
  facility: { aktiver: 287, servicepunkterForfalder: 18, aabneSager: 7, planlagtVedligehold: 12 },
  indkoeb: {
    aabneOrdrer: 18, fakturaerTilGodkendelse: 7, prisafvigelser: 5,
    leveranceTilTidenPct: 92, prisafvigelseSnitPct: 7,
  },
  kunder: {
    aktive: 51, aftalerUdloeber: 7, tilbud: 12, tilbudKraeverOpfoelgning: 5,
    daekningsbidragOere: 31184000,
  },
  oekonomi: {
    driftsomkostningerOere: 84261500, budgetOere: 77005500,
    ikkeFaktureretOere: 18624000, daekningsgradPct: 72, maalDaekningsgradPct: 70,
    planlagtVedligeholdPct: 72,
  },
  disponering: { planlagteOpgaver: 22, ledigKapacitetPct: 18, forsinkelsesrisiko: 2, konflikter: 4 },
};
