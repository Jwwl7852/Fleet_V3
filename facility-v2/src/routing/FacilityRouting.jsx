import { createContext, useCallback, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export const FACILITY_STANDALONE_ROUTE_PREFIX = '/facility';

const FacilityRouteContext = createContext(FACILITY_STANDALONE_ROUTE_PREFIX);

export function facilityPathForBase(path, basePath = FACILITY_STANDALONE_ROUTE_PREFIX) {
  if (typeof path !== 'string') return path;
  if (path === FACILITY_STANDALONE_ROUTE_PREFIX) return basePath;
  if (path.startsWith(`${FACILITY_STANDALONE_ROUTE_PREFIX}/`)
      || path.startsWith(`${FACILITY_STANDALONE_ROUTE_PREFIX}?`)
      || path.startsWith(`${FACILITY_STANDALONE_ROUTE_PREFIX}#`)) {
    return `${basePath}${path.slice(FACILITY_STANDALONE_ROUTE_PREFIX.length)}`;
  }
  return path;
}

export function FacilityRouteProvider({ basePath = FACILITY_STANDALONE_ROUTE_PREFIX, children }) {
  return <FacilityRouteContext.Provider value={basePath}>{children}</FacilityRouteContext.Provider>;
}

export function useFacilityPath() {
  const basePath = useContext(FacilityRouteContext);
  return useCallback((path) => facilityPathForBase(path, basePath), [basePath]);
}

export function FacilityLink({ to, ...props }) {
  const facilityPath = useFacilityPath();
  return <Link to={facilityPath(to)} {...props} />;
}

export function useFacilityNavigate() {
  const navigate = useNavigate();
  const facilityPath = useFacilityPath();
  return useCallback((to, options) => navigate(facilityPath(to), options), [facilityPath, navigate]);
}
