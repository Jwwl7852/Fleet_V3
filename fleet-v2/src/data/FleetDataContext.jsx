import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { defaultUnitRepository } from "./unitRepository";

const FleetDataContext = createContext(null);

export function FleetDataProvider({ children, repository = defaultUnitRepository() }) {
  const [dataset, setDataset] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    repository.load().then((next) => {
      if (active) setDataset(next);
    }).catch((cause) => {
      if (active) setError(cause);
    });
    return () => { active = false; };
  }, [repository]);

  const saveUnit = useCallback(async (unit) => {
    const saved = await repository.saveUnit(unit);
    setDataset((current) => {
      const units = [...current.units];
      const index = units.findIndex((item) => item.id === saved.id);
      if (index >= 0) units[index] = saved;
      else units.push(saved);
      return { ...current, units };
    });
    return saved;
  }, [repository]);

  const value = useMemo(() => ({
    dataset,
    units: dataset?.units || [],
    relations: dataset?.relations || {},
    tenantId: dataset?.tenantId || repository.tenantId,
    loading: !dataset && !error,
    error,
    saveUnit,
    repositoryKind: repository.kind,
  }), [dataset, error, repository.kind, repository.tenantId, saveUnit]);

  return <FleetDataContext.Provider value={value}>{children}</FleetDataContext.Provider>;
}

export function useFleetData() {
  const value = useContext(FleetDataContext);
  if (!value) throw new Error("useFleetData skal bruges under FleetDataProvider.");
  return value;
}
