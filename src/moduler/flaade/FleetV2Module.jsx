import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FleetV2App } from "../../../fleet-v2/src/FleetV2App.jsx";
import { createIndexedDbUnitRepository } from "../../../fleet-v2/src/data/unitRepository.js";
import "../../../fleet-v2/src/styles/fleet-v2.css";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harModul } from "../../fleet/moduler.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { useListe } from "../../fleet/useListe.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import {
  FLEET_V2_INTEGRATION_DATABASE,
  FLEET_V2_ROUTE_PREFIX,
  fleetV2ActorFromUser,
  fleetV2PermissionForPath,
} from "../../fleet/fleet-v2-integration.js";

export default function FleetV2Module() {
  const { tenantId, bruger, moduler } = useFleet();
  const location = useLocation();
  const navigate = useNavigate();
  const requiredPermission = fleetV2PermissionForPath(location.pathname);
  const hasModule = harModul(moduler, "flaade");
  const hasPermission = harPerm(bruger?.perms, requiredPermission);
  const mayReadSuppliers = harPerm(bruger?.perms, PERM.leverandoererLaes);
  const suppliers = useListe("leverandoerer", {
    ordnPaa: "navn",
    vindue: "alle",
    graense: 500,
    demo: DEMO_LEVERANDOERER,
    hent: mayReadSuppliers,
  });
  const databaseName = import.meta.env.VITE_FLEET_V2_DATABASE_NAME
    || FLEET_V2_INTEGRATION_DATABASE;
  const supplierPayload = JSON.stringify(suppliers.data);
  const sharedSuppliers = useMemo(
    () => suppliers.henter ? undefined : JSON.parse(supplierPayload),
    [supplierPayload, suppliers.henter],
  );
  const basePath = location.pathname.startsWith("/opsaetning/enheder")
    ? "/opsaetning" : FLEET_V2_ROUTE_PREFIX;
  const repository = useMemo(() => createIndexedDbUnitRepository({
    databaseName,
    tenantId,
    sharedSuppliers,
  }), [databaseName, sharedSuppliers, tenantId]);
  const actor = useMemo(() => fleetV2ActorFromUser(bruger), [bruger]);

  if (!hasModule || !hasPermission) {
    return (
      <section className="fc-card" aria-labelledby="fleet-v2-adgang-afvist">
        <h1 id="fleet-v2-adgang-afvist">Ingen adgang til FLEET</h1>
        <p>
          {hasModule
            ? `Ruten kræver permissionen ${requiredPermission}.`
            : "Tenantens abonnement omfatter ikke FLEET."}
        </p>
        <p>Et direkte link giver ikke adgang til modulets lokale prototypedata.</p>
      </section>
    );
  }

  return (
    <FleetV2App
      actor={actor}
      basePath={basePath}
      embedded
      onNavigate={navigate}
      pathname={`${location.pathname}${location.search}`}
      repository={repository}
    />
  );
}
