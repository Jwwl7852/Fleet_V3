import { PERM } from './permissions.js';

export const FACILITY_V2_ROUTE_PREFIX = '/facility-v2';
export const FACILITY_V2_INTEGRATION_DATABASE = 'veyro-facility-v2-integration-v1';
export const FACILITY_V2_TEST_DATABASE = 'veyro-facility-v2-test-e2e';

/**
 * FACILITY v2's local working surfaces all permit mutations. The platform has
 * no separate facility read permission, so the existing facility.skriv claim
 * is the narrowest honest gate until milestone B adds server-side resources.
 */
export function facilityV2PermissionForPath() {
  return PERM.facilitySkriv;
}

export function facilityV2ActorFromUser(bruger) {
  return {
    id: bruger?.uid || 'ukendt-bruger',
    name: bruger?.navn || bruger?.email || 'Ukendt bruger',
    verified: Boolean(bruger?.uid),
  };
}
