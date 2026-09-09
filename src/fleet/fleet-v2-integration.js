import { PERM } from "./permissions.js";

export const FLEET_V2_ROUTE_PREFIX = "/fleet-v2";
export const FLEET_V2_INTEGRATION_DATABASE = "veyro-fleet-v2-integration-v1";
export const FLEET_V2_TEST_DATABASE = "veyro-fleet-v2-integration-tests-v1";

const relativeFleetPath = (pathname = "") => {
  const clean = String(pathname).split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === FLEET_V2_ROUTE_PREFIX) return "/";
  return clean.startsWith(`${FLEET_V2_ROUTE_PREFIX}/`)
    ? clean.slice(FLEET_V2_ROUTE_PREFIX.length)
    : clean;
};

/**
 * Existing platform permissions applied to the local FLEET prototype.
 * This is client-side route/UI gating only; milestone B still requires
 * server-side storage and rule enforcement for shared FLEET data.
 */
export function fleetV2PermissionForPath(pathname) {
  const path = relativeFleetPath(pathname);
  if (path === "/indberetninger/ny" || path.startsWith("/mobil")) {
    return PERM.indberetningerSkriv;
  }
  if (path.startsWith("/indberetninger")) return PERM.indberetningerSkrivAlle;
  if (path.startsWith("/arbejdsko") || path.startsWith("/sager")) return PERM.sagLaes;
  return PERM.koeretoejerLaes;
}

export function fleetV2ActorFromUser(bruger) {
  return {
    id: bruger?.uid || "ukendt-bruger",
    name: bruger?.navn || bruger?.email || "Ukendt bruger",
    role: bruger?.rolleLabel || bruger?.rolle || "Veyro-bruger",
  };
}
