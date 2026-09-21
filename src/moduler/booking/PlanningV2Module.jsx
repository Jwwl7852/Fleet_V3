import { useMemo } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import PlanningDemo from "../../fleet/planning-ui/PlanningDemo.jsx";
import "../../fleet/planning-ui/planning-demo.css";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harModul } from "../../fleet/moduler.js";
import { harPerm } from "../../fleet/permissions.js";
import { workforcePlanningCheck } from "../../fleet/workforce-v2-integration.js";
import { useListe } from "../../fleet/useListe.js";
import { fraFleetKoeretoejer } from "../../fleet/planning-adapters/fleet.js";
import {
  PLANNING_V2_INTEGRATION_ENVIRONMENT,
  PLANNING_V2_LEGACY_RESOURCE_PATH,
  planningV2ChannelName,
  planningV2LocalUrl,
  planningV2PathForView,
  planningV2PermissionForPath,
  planningV2ViewForPath,
} from "../../fleet/planning-v2-integration.js";

export default function PlanningV2Module() {
  const { tenantId, bruger, moduler } = useFleet();
  const location = useLocation();
  const navigate = useNavigate();
  const requiredPermission = planningV2PermissionForPath(location.pathname);
  const hasModule = harModul(moduler, "booking");
  const hasPermission = harPerm(bruger?.perms, requiredPermission);
  const userId = bruger?.uid || bruger?.id || bruger?.email || "ukendt-bruger";
  const activeView = planningV2ViewForPath(location.pathname);
  const sharedUnits = useListe("koeretoejer", {
    vindue: "alle",
    hent: hasModule && hasPermission,
  });
  const sharedUnitTypes = useListe("ressourceKategorier/enheder", {
    vindue: "alle",
    hent: hasModule && hasPermission,
  });
  const fleetResources = useMemo(
    () => fraFleetKoeretoejer(sharedUnits.data, sharedUnitTypes.data),
    [sharedUnits.data, sharedUnitTypes.data],
  );
  const syncChannelName = useMemo(() => planningV2ChannelName({
    environment: PLANNING_V2_INTEGRATION_ENVIRONMENT,
    tenantId,
    userId,
  }), [tenantId, userId]);

  if (location.pathname.replace(/\/+$/, "") === PLANNING_V2_LEGACY_RESOURCE_PATH) {
    return <Navigate to="/ressourcer/enheder?fra=planning" replace />;
  }

  if (!hasModule || !hasPermission) {
    return (
      <section className="fc-card" aria-labelledby="planning-v2-adgang-afvist">
        <h2 id="planning-v2-adgang-afvist">Ingen adgang til PLANNING</h2>
        <p>
          {hasModule
            ? `Ruten kræver permissionen ${requiredPermission}.`
            : "Tenantens abonnement omfatter ikke PLANNING."}
        </p>
        <p>Et direkte link giver ikke adgang til modulets lokale prototypedata.</p>
      </section>
    );
  }

  return (
    <section className="veyro-module--planning" data-planning-environment={PLANNING_V2_INTEGRATION_ENVIRONMENT}>
      <PlanningDemo
        key={`${PLANNING_V2_INTEGRATION_ENVIRONMENT}:${tenantId}:${userId}`}
        activeView={activeView}
        createLocalUrl={planningV2LocalUrl}
        embedded
        onNavigate={(view) => navigate(planningV2PathForView(view))}
        workforceAvailabilityCheck={workforcePlanningCheck}
        fleetResources={fleetResources}
        fleetResourcesLoading={sharedUnits.henter || sharedUnitTypes.henter}
        fleetResourcesError={sharedUnits.fejl || sharedUnitTypes.fejl}
        syncChannelName={syncChannelName}
      />
    </section>
  );
}
