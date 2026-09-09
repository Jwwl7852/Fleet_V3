import { PERM } from "./permissions.js";

export const PLANNING_V2_ROUTE_PREFIX = "/planning-v2";
export const PLANNING_V2_INTEGRATION_ENVIRONMENT = "veyro-integration-v1";

export const PLANNING_V2_ROUTES = Object.freeze({
  overblik: PLANNING_V2_ROUTE_PREFIX,
  kalender: `${PLANNING_V2_ROUTE_PREFIX}/livekalender`,
  opgaver: `${PLANNING_V2_ROUTE_PREFIX}/opgaver`,
  planlaegning: `${PLANNING_V2_ROUTE_PREFIX}/planlaegning`,
  optimering: `${PLANNING_V2_ROUTE_PREFIX}/optimering`,
  "faste-ruter": `${PLANNING_V2_ROUTE_PREFIX}/faste-ruter`,
  ressourcer: `${PLANNING_V2_ROUTE_PREFIX}/ressourcer`,
  rapporter: `${PLANNING_V2_ROUTE_PREFIX}/rapporter`,
  mobil: `${PLANNING_V2_ROUTE_PREFIX}/mobilvisning`,
});

const PATH_TO_VIEW = Object.freeze(Object.fromEntries(
  Object.entries(PLANNING_V2_ROUTES).map(([view, path]) => [path, view]),
));

function normaliserPath(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");
  return path || "/";
}

export function planningV2ViewForPath(pathname) {
  return PATH_TO_VIEW[normaliserPath(pathname)] || "overblik";
}

export function planningV2PathForView(view) {
  return PLANNING_V2_ROUTES[view] || PLANNING_V2_ROUTE_PREFIX;
}

export function planningV2PermissionForPath() {
  return PERM.bookingLaes;
}

function kanalDel(value) {
  return encodeURIComponent(String(value || "ukendt"));
}

export function planningV2ChannelName({
  environment = PLANNING_V2_INTEGRATION_ENVIRONMENT,
  tenantId,
  userId,
}) {
  return ["veyro-planning-week", environment, tenantId, userId].map(kanalDel).join(":");
}

export function planningV2LocalUrl({ view = "planlaegning", search = "" } = {}) {
  const path = planningV2PathForView(view);
  const query = String(search || "").replace(/^\?/, "");
  return `${window.location.origin}${path}${query ? `?${query}` : ""}`;
}
