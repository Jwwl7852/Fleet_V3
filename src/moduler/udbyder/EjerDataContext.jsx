import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hentEjerCrm, hentEjerprofiler } from "../../fleet/ejer-crm.js";
import { hentTilbud, hentTilbudsPrislister } from "../../fleet/ejer-tilbud.js";

const EjerDataContext = createContext(null);

export function EjerDataProvider({ children, ansvarligFilter = "Alle" }) {
  const [crm, setCrm] = useState(null);
  const [profiler, setProfiler] = useState(null);
  const [tilbud, setTilbud] = useState(null);
  const [prislister, setPrislister] = useState(null);
  const [fejl, setFejl] = useState(null);
  const [henter, setHenter] = useState(false);

  const genindlaes = useCallback(async () => {
    setHenter(true);
    try {
      const [naesteCrm, naesteProfiler, naesteTilbud, naestePrislister] = await Promise.all([
        hentEjerCrm(), hentEjerprofiler(), hentTilbud(), hentTilbudsPrislister(),
      ]);
      setCrm(naesteCrm);
      setProfiler(naesteProfiler);
      setTilbud(naesteTilbud);
      setPrislister(naestePrislister);
      setFejl(null);
    } catch (aarsag) {
      setFejl(aarsag);
    } finally {
      setHenter(false);
    }
  }, []);

  useEffect(() => { genindlaes(); }, [genindlaes]);

  const vaerdi = useMemo(() => ({
    crm, profiler, tilbud, prislister, fejl, henter, genindlaes, ansvarligFilter,
  }), [crm, profiler, tilbud, prislister, fejl, henter, genindlaes, ansvarligFilter]);

  return <EjerDataContext.Provider value={vaerdi}>{children}</EjerDataContext.Provider>;
}

export function useEjerData() {
  const vaerdi = useContext(EjerDataContext);
  if (!vaerdi) throw new Error("useEjerData skal bruges inde i EjerDataProvider.");
  return vaerdi;
}
