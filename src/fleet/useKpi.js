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
    const demo = DEMO_KPI[division] || DEMO_KPI.gods;

    (async () => {
      if (!db) {
        if (aktiv) { setData(demo); setHenter(false); }
        return;
      }
      try {
        const snap = await db.ref(path(`kpi/${division}/current`)).once("value");
        if (!aktiv) return;
        setData(snap.val() || demo);
      } catch (e) {
        if (!aktiv) return;
        setFejl(e);
        setData(demo);
      } finally {
        if (aktiv) setHenter(false);
      }
    })();

    return () => { aktiv = false; };
  }, [tenantId, division, dage, path, nonce]);

  return { kpi: data, henter, fejl, genindlaes };
}

/* To internt konsistente demo-sæt, ét pr. division. Beløb i øre.

   Bemærk: ingen af tallene er 48 flere gange — i mockupsene var åbne
   opgaver, aktive køretøjer, aktive kunder og disponerede folk alle 48,
   hvilket læser som demo-data frem for en virksomhed.

   Bemærk også at facility-tallene er ENS i de to sæt. Værkstedet, portene
   og vaskehallen er fælles aktiver (division: "faelles"), og de bliver ikke
   flere af at man skifter toggle. Det er ikke en fejl i demo-data — det er
   fælles-begrebet der slår igennem i aggregeringen. */
export const DEMO_KPI = {
  gods: {
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
      /* kompetencerUdloeber er IKKE delt på division (beslutning 19). Staben
         er én, så tallet er det samme her og under bus. Stod der to
         forskellige, ville Bemanding vise et andet tal ved et toggle-skift
         uden at en eneste kompetence havde ændret sig. */
      chauffoerPlanlagt: 20, chauffoerDisponeret: 18, kompetencerUdloeber: 8,
    },
    facility: { aktiver: 287, servicepunkterForfalder: 18, aabneSager: 7, planlagtVedligehold: 12 },
    indkoeb: {
      aabneOrdrer: 18, fakturaerTilGodkendelse: 7, indkoebsprisafvigelser: 5,
      leveranceTilTidenPct: 92, indkoebsprisafvigelseSnitPct: 7,
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
  },

  bus: {
    opgaver: {
      aabne: 19, indberettet: 5, planlagt: 4, igang: 3, afventer: 3, udfoert: 4,
      forsinkede: 2, nyeBookinger: 3, igangIDag: 8, uplanlagte: 3, klarTilFakturering: 6,
    },
    flaade: {
      aktive: 18, udeAfDrift: 2, paaVaerksted: 1, serviceInden30: 4,
      omkostningPrKmOere: 268, omkostningPrKmDeltaOere: -9, nedetidPct: 2.4,
    },
    bemanding: {
      planlagt: 26, disponeret: 22, ledig: 4, underbemandede: 2,
      /* Samme tal som under gods — se noten der. */
      chauffoerPlanlagt: 24, chauffoerDisponeret: 21, kompetencerUdloeber: 8,
    },
    facility: { aktiver: 287, servicepunkterForfalder: 18, aabneSager: 7, planlagtVedligehold: 12 },
    indkoeb: {
      aabneOrdrer: 7, fakturaerTilGodkendelse: 3, indkoebsprisafvigelser: 2,
      leveranceTilTidenPct: 95, indkoebsprisafvigelseSnitPct: 4,
    },
    kunder: {
      aktive: 17, aftalerUdloeber: 3, tilbud: 6, tilbudKraeverOpfoelgning: 2,
      daekningsbidragOere: 11460000,
    },
    /* Dækningsgrad UNDER mål her, over mål på gods. Samme kort, modsat farve
       — betterWhen:'higher' afgør det, ikke fortegnet. */
    oekonomi: {
      driftsomkostningerOere: 34346000, budgetOere: 33350000,
      ikkeFaktureretOere: 7240000, daekningsgradPct: 68, maalDaekningsgradPct: 70,
      planlagtVedligeholdPct: 64,
    },
    disponering: { planlagteOpgaver: 9, ledigKapacitetPct: 12, forsinkelsesrisiko: 1, konflikter: 2 },
  },
};
