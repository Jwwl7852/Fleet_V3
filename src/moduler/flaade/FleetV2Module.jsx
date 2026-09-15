import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FleetV2App } from "../../../fleet-v2/src/FleetV2App.jsx";
import { createIndexedDbUnitRepository } from "../../../fleet-v2/src/data/unitRepository.js";
import "../../../fleet-v2/src/styles/fleet-v2.css";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harModul } from "../../fleet/moduler.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { useFleetSharedData } from "./useFleetSharedData.js";
import {
  createFleetServiceClient,
  mapServerOccurrenceToFleet,
  mapServerRequirementToFleet,
  mapSharedUnitToFleet,
} from "../../fleet/fleet-service-client.js";
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
  const mayCreateSuppliers = harPerm(bruger?.perms, PERM.leverandoererSkriv);
  const mayManageService = harPerm(bruger?.perms, PERM.koeretoejerSkriv);
  const { categories, suppliers, service } = useFleetSharedData({
    mayReadCategories: hasPermission,
    mayReadSuppliers,
    mayReadService: hasPermission,
  });
  const databaseName = import.meta.env.VITE_FLEET_V2_DATABASE_NAME
    || FLEET_V2_INTEGRATION_DATABASE;
  const supplierPayload = JSON.stringify(suppliers.data);
  const sharedSuppliers = useMemo(
    () => suppliers.henter ? undefined : JSON.parse(supplierPayload),
    [supplierPayload, suppliers.henter],
  );
  const categoryPayload = JSON.stringify(categories.data);
  const sharedCategories = useMemo(
    () => categories.henter ? undefined : JSON.parse(categoryPayload),
    [categoryPayload, categories.henter],
  );
  const basePath = location.pathname.startsWith("/opsaetning/enheder")
    ? "/opsaetning" : FLEET_V2_ROUTE_PREFIX;
  const repository = useMemo(() => createIndexedDbUnitRepository({
    databaseName,
    tenantId,
    sharedSuppliers,
    sharedCategories,
  }), [databaseName, sharedCategories, sharedSuppliers, tenantId]);
  const actor = useMemo(() => fleetV2ActorFromUser(bruger), [bruger]);
  const serviceUnitsPayload = JSON.stringify(service.units.data);
  const serviceRequirementsPayload = JSON.stringify(service.requirements.data);
  const serviceOccurrencesPayload = JSON.stringify(service.occurrences.data);
  const serviceBackend = useMemo(() => {
    const units = JSON.parse(serviceUnitsPayload).map(mapSharedUnitToFleet);
    const requirements = JSON.parse(serviceRequirementsPayload).map(mapServerRequirementToFleet);
    const occurrences = JSON.parse(serviceOccurrencesPayload).map(mapServerOccurrenceToFleet);
    const client = createFleetServiceClient();
    const reload = () => {
      service.requirements.genindlaes();
      service.occurrences.genindlaes();
    };
    return {
      kind: "server",
      units,
      relations: { serviceRequirements: requirements, serviceOccurrences: occurrences },
      loading: service.units.henter || service.requirements.henter || service.occurrences.henter,
      error: service.units.fejl || service.requirements.fejl || service.occurrences.fejl || null,
      capabilities: {
        saveRequirement: mayManageService,
        runAutomation: mayManageService,
        planService: false,
        saveHistory: false,
        saveSettings: false,
      },
      async saveRequirement(input) {
        const current = requirements.find((item) => item.id === input.id) || null;
        const result = await client.saveRequirement(input, units, current);
        reload();
        return result;
      },
      async runAutomation() {
        const result = await client.runAutomation();
        reload();
        return result;
      },
    };
  }, [service.units.henter, service.units.fejl, service.requirements.henter,
    service.requirements.fejl, service.occurrences.henter, service.occurrences.fejl,
    serviceUnitsPayload, serviceRequirementsPayload, serviceOccurrencesPayload,
    service.requirements.genindlaes, service.occurrences.genindlaes, mayManageService]);

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
      canCreateSupplier={mayCreateSuppliers}
      onCreateSupplier={(returnPath) => {
        const params = new URLSearchParams({
          ny: "1",
          kategori: "vaerksted",
          retur: returnPath,
        });
        navigate(`/indkoeb/leverandoerer?${params.toString()}`);
      }}
      onNavigate={navigate}
      pathname={`${location.pathname}${location.search}`}
      repository={repository}
      serviceBackend={serviceBackend}
    />
  );
}
