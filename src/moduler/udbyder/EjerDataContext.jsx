import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hentEjerCrm, hentEjerprofiler } from "../../fleet/ejer-crm.js";
import { hentTilbud } from "../../fleet/ejer-tilbud.js";

const EjerDataContext = createContext(null);

export function EjerDataProvider({ children }) {
  const [crm, setCrm] = useState(null);
  const [profiler, setProfiler] = useState(null);
  const [tilbud, setTilbud] = useState(null);
  const [fejl, setFejl] = useState(null);
  const [henter, setHenter] = useState(false);

  const genindlaes = useCallback(async () => {
    setHenter(true);
    try {
      const [naesteCrm, naesteProfiler, naesteTilbud] = await Promise.all([
        hentEjerCrm(), hentEjerprofiler(), hentTilbud(),
      ]);
      setCrm(naesteCrm);
      setProfiler(naesteProfiler);
      setTilbud(naesteTilbud);
      setFejl(null);
    } catch (aarsag) {
      setFejl(aarsag);
    } finally {
      setHenter(false);
    }
  }, []);

  useEffect(() => { genindlaes(); }, [genindlaes]);

  const vaerdi = useMemo(() => ({
    crm, profiler, tilbud, fejl, henter, genindlaes,
  }), [crm, profiler, tilbud, fejl, henter, genindlaes]);

  return <EjerDataContext.Provider value={vaerdi}>{children}</EjerDataContext.Provider>;
}

export function useEjerData() {
  const vaerdi = useContext(EjerDataContext);
  if (!vaerdi) throw new Error("useEjerData skal bruges inde i EjerDataProvider.");
  return vaerdi;
}
