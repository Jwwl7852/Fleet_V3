import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { FacilityV2App } from '../../../facility-v2/src/FacilityV2App.jsx';
import { createFacilityRepository } from '../../../facility-v2/src/data/facilityRepositoryV2.js';
import '../../../facility-v2/src/styles/tokens.css';
import '../../../facility-v2/src/styles/facility-v2.css';
import { useFleet } from '../../fleet/FleetContext.jsx';
import {
  FACILITY_V2_INTEGRATION_DATABASE,
  FACILITY_V2_ROUTE_PREFIX,
  facilityV2ActorFromUser,
  facilityV2PermissionForPath,
} from '../../fleet/facility-v2-integration.js';
import { harModul } from '../../fleet/moduler.js';
import { harPerm } from '../../fleet/permissions.js';

export default function FacilityV2Module() {
  const { tenantId, bruger, moduler } = useFleet();
  const location = useLocation();
  const requiredPermission = facilityV2PermissionForPath(location.pathname);
  const hasModule = harModul(moduler, 'facility');
  const hasPermission = harPerm(bruger?.perms, requiredPermission);
  const databaseName = import.meta.env.VITE_FACILITY_V2_DATABASE_NAME
    || FACILITY_V2_INTEGRATION_DATABASE;
  const actor = useMemo(() => facilityV2ActorFromUser(bruger), [bruger]);
  const repository = useMemo(() => createFacilityRepository({
    actor,
    databaseName,
    tenantId,
  }), [actor, databaseName, tenantId]);

  if (!hasModule || !hasPermission) {
    return (
      <section className="fc-card" aria-labelledby="facility-v2-adgang-afvist">
        <h1 id="facility-v2-adgang-afvist">Ingen adgang til FACILITY</h1>
        <p>
          {hasModule
            ? `Ruten kræver permissionen ${requiredPermission}.`
            : 'Tenantens abonnement omfatter ikke FACILITY.'}
        </p>
        <p>Et direkte link giver ikke adgang til modulets lokale prototypedata.</p>
      </section>
    );
  }

  return (
    <FacilityV2App
      basePath={FACILITY_V2_ROUTE_PREFIX}
      embedded
      repository={repository}
    />
  );
}
