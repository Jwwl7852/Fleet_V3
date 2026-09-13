import { useCallback, useEffect, useMemo, useState } from "react";
import { gemVisningsvalg, laesVisningsvalg, nulstilVisningsvalg, visningsnoegle } from "./visningsvalg.js";
import { miljoe } from "../firebase.js";

export function useVisningsvalg({ brugerId, kontekst, skaerm, egenskab, standard }) {
  const noegle = useMemo(() => visningsnoegle({ miljoe, brugerId, kontekst, skaerm, egenskab }), [brugerId, kontekst, skaerm, egenskab]);
  const lager = typeof window === "undefined" ? null : window.localStorage;
  const [vaerdi, setVaerdi] = useState(() => laesVisningsvalg(lager, noegle, standard));

  /* Et identitets- eller tenantskift læser den nye nøgle og slipper dermed
     den tidligere konteksts indlæste visningstilstand med det samme. */
  useEffect(() => setVaerdi(laesVisningsvalg(lager, noegle, standard)), [noegle]);

  const saet = useCallback((naeste) => {
    setVaerdi((forrige) => {
      const beregnet = typeof naeste === "function" ? naeste(forrige) : naeste;
      gemVisningsvalg(lager, noegle, beregnet);
      return beregnet;
    });
  }, [noegle]);

  const nulstil = useCallback(() => {
    nulstilVisningsvalg(lager, noegle);
    setVaerdi(standard);
  }, [noegle, standard]);

  return [vaerdi, saet, nulstil, noegle];
}
