import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createFacilityRepository } from './facilityRepositoryV2';

const FacilityDataContext = createContext(null);

export function FacilityDataProvider({ children, repository: repositoryOverride }) {
  const repository = useMemo(
    () => repositoryOverride ?? createFacilityRepository(),
    [repositoryOverride],
  );
  const [dataset, setDataset] = useState(null);
  const [error, setError] = useState(null);
  const catchUpStarted = useRef(false);

  useEffect(() => {
    let active = true;
    setDataset(null);
    setError(null);
    catchUpStarted.current = false;
    repository.load()
      .then((value) => { if (active) setDataset(value); })
      .catch((reason) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [repository]);

  useEffect(() => {
    const unsubscribe = repository.subscribe?.(() => {
      repository.load().then(setDataset).catch(setError);
    });
    return () => unsubscribe?.();
  }, [repository]);

  useEffect(() => {
    if (!dataset || catchUpStarted.current) return undefined;
    catchUpStarted.current = true;
    const today = () => new Date().toLocaleDateString('sv-SE');
    repository.runServiceCatchUp?.(today()).then((result) => setDataset(result.dataset)).catch(setError);
    const timer = window.setInterval(() => repository.runServiceCatchUp?.(today()).then((result) => setDataset(result.dataset)).catch(setError), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [dataset, repository]);

  async function runMutation(method, ...args) {
    const result = await repository[method](...args);
    setDataset(result.dataset);
    return result;
  }

  const value = useMemo(() => ({ dataset, error, repository, setDataset, runMutation }), [dataset, error, repository]);

  return <FacilityDataContext.Provider value={value}>{children}</FacilityDataContext.Provider>;
}

export function useFacilityData() {
  const context = useContext(FacilityDataContext);
  if (!context) throw new Error('useFacilityData skal bruges i FacilityDataProvider.');
  return context;
}
