import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FleetV2App } from "../../../fleet-v2/src/FleetV2App.jsx";
import { createIndexedDbUnitRepository } from "../../../fleet-v2/src/data/unitRepository.js";
import "../../../fleet-v2/src/styles/fleet-v2.css";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harModul } from "../../fleet/moduler.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { useFleetSharedData } from "./useFleetSharedData.js";
import { afgoerRetur, opretReturtilstand } from "../../../fleet-v2/src/data/navigationHistory.js";
import {
  createFleetServiceClient,
  fleetServiceProjectionState,
  mapServerCaseToFleet,
  mapServerOccurrenceToFleet,
  mapServerReportToFleet,
  mapServerRequirementToFleet,
  mapServerServiceHistoryToFleet,
  mapSharedUnitToFleet,
  mapFleetUnitToShared,
} from "../../fleet/fleet-service-client.js";
import { gemTransaktion } from "../../fleet/skriv.js";
import { tilknytRessourceHardware } from "../../fleet/ressource-hardware.js";
import { AUDIT } from "../../fleet/audit.js";
import {
  FLEET_V2_INTEGRATION_DATABASE,
  FLEET_V2_ROUTE_PREFIX,
  fleetV2ActorFromUser,
  fleetV2PermissionForPath,
} from "../../fleet/fleet-v2-integration.js";

export default function FleetV2Module() {
  const { tenantId, bruger, moduler, path } = useFleet();
  const location = useLocation();
  const navigate = useNavigate();
  const afventetScroll = useRef(null);
  const aktuelSti = `${location.pathname}${location.search}${location.hash}`;
  const requiredPermission = fleetV2PermissionForPath(location.pathname);
  const resourceRoute = location.pathname.startsWith("/ressourcer/enheder");
  const hasModule = harModul(moduler, "flaade")
    || (resourceRoute && harModul(moduler, "booking"));
  const hasPermission = harPerm(bruger?.perms, requiredPermission);
  const mayReadSuppliers = harPerm(bruger?.perms, PERM.leverandoererLaes);
  const mayCreateSuppliers = harPerm(bruger?.perms, PERM.leverandoererSkriv);
  const mayManageService = harPerm(bruger?.perms, PERM.koeretoejerSkriv);
  const { categories, suppliers, resourceCategories, obdHardware, service } = useFleetSharedData({
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
  const resourceCategoryPayload = JSON.stringify(resourceCategories.data);
  const sharedResourceCategories = useMemo(
    () => resourceCategories.henter ? [] : JSON.parse(resourceCategoryPayload),
    [resourceCategoryPayload, resourceCategories.henter],
  );
  const obdHardwarePayload = JSON.stringify(obdHardware.data);
  const sharedObdHardware = useMemo(
    () => obdHardware.henter ? [] : JSON.parse(obdHardwarePayload),
    [obdHardwarePayload, obdHardware.henter],
  );
  const basePath = resourceRoute ? "/ressourcer" : FLEET_V2_ROUTE_PREFIX;
  useEffect(() => {
    if (afventetScroll.current == null) return undefined;
    const scrollY = afventetScroll.current;
    afventetScroll.current = null;
    const foerste = requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
    }));
    return () => cancelAnimationFrame(foerste);
  }, [aktuelSti]);
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
  const serviceReportsPayload = JSON.stringify(service.reports.data);
  const serviceCasesPayload = JSON.stringify(service.cases.data);
  const serviceHistoryPayload = JSON.stringify(service.history.data);
  const serviceState = fleetServiceProjectionState(service);
  const serviceBackend = useMemo(() => {
    const rawUnits = JSON.parse(serviceUnitsPayload);
    const units = rawUnits.map(mapSharedUnitToFleet);
    const requirements = JSON.parse(serviceRequirementsPayload).map(mapServerRequirementToFleet);
    const occurrences = JSON.parse(serviceOccurrencesPayload).map(mapServerOccurrenceToFleet);
    const reports = JSON.parse(serviceReportsPayload).map(mapServerReportToFleet);
    const cases = JSON.parse(serviceCasesPayload).map(mapServerCaseToFleet);
    const caseEvents = JSON.parse(serviceHistoryPayload).map(mapServerServiceHistoryToFleet);
    const client = createFleetServiceClient();
    const reload = () => {
      service.units.genindlaes();
      service.requirements.genindlaes();
      service.occurrences.genindlaes();
      service.reports.genindlaes();
      service.cases.genindlaes();
      service.history.genindlaes();
    };
    return {
      kind: "server",
      units,
      resourceOptions: { categories: sharedResourceCategories, obdHardware: sharedObdHardware },
      relations: {
        serviceRequirements: requirements,
        serviceOccurrences: occurrences,
        reports,
        cases,
        caseEvents,
      },
      loading: serviceState.loading,
      error: serviceState.error,
      capabilities: {
        saveUnit: mayManageService,
        saveRequirement: mayManageService,
        runAutomation: mayManageService,
        planService: false,
        saveHistory: false,
        saveSettings: false,
      },
      async saveUnit(input, { openedUnit = null } = {}) {
        if (!mayManageService) throw new Error("Du har ikke adgang til at gemme enheder.");
        const result = await gemTransaktion({
          sti: path(`koeretoejer/${input.id}`),
          opdater: (aktuel) => mapFleetUnitToShared(input, aktuel, { openedUnit }),
          objekt: "koeretoejer",
          objektId: input.id,
          handling: openedUnit ? AUDIT.aendre : AUDIT.opret,
        });
        if (!result.ok) throw new Error(result.besked || "Enheden kunne ikke gemmes i det fælles register.");
        const tidligereHardwareId = openedUnit?.obdHardwareId || null;
        const valgtHardwareId = input.obdHardwareId || null;
        if (tidligereHardwareId !== valgtHardwareId) {
          const hardwareResultat = await tilknytRessourceHardware({
            art: "obd", hardwareId: valgtHardwareId,
            ressourceType: "enhed", ressourceId: input.id,
          });
          if (!hardwareResultat.ok) {
            throw new Error(`Enhedens stamdata er gemt, men OBD-tilknytningen blev afvist: ${hardwareResultat.besked}`);
          }
        }
        reload();
        resourceCategories.genindlaes();
        obdHardware.genindlaes();
        return mapSharedUnitToFleet({ id: input.id, tenantId, ...result.data, obdHardwareId: valgtHardwareId });
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
    service.reports.henter, service.reports.fejl, service.cases.henter,
    service.cases.fejl, service.history.henter, service.history.fejl,
    serviceUnitsPayload, serviceRequirementsPayload, serviceOccurrencesPayload,
    serviceReportsPayload, serviceCasesPayload, serviceHistoryPayload,
    service.units.genindlaes, service.requirements.genindlaes, service.occurrences.genindlaes,
    service.reports.genindlaes, service.cases.genindlaes, service.history.genindlaes,
    mayManageService, path, tenantId, sharedResourceCategories, sharedObdHardware,
    resourceCategories.genindlaes, obdHardware.genindlaes]);

  if (!hasModule || !hasPermission) {
    return (
      <section className="fc-card" aria-labelledby="fleet-v2-adgang-afvist">
        <h2 id="fleet-v2-adgang-afvist">Ingen adgang til FLEET</h2>
        <p>
          {hasModule
            ? `Ruten kræver permissionen ${requiredPermission}.`
            : resourceRoute
              ? "Tenantens abonnement omfatter hverken FLEET eller PLANNING."
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
      navigationState={location.state}
      onBack={(fallback) => {
        const retur = afgoerRetur({
          tilstand: location.state,
          fallback,
          tilladteRodstier: [FLEET_V2_ROUTE_PREFIX, "/ressourcer"],
        });
        if (retur.handling === "historik") {
          afventetScroll.current = retur.scrollY;
          navigate(-1);
        } else {
          navigate(retur.sti, { replace: true });
        }
      }}
      onNavigate={(target, options = {}) => {
        const sharedUnitTarget = target === `${FLEET_V2_ROUTE_PREFIX}/enheder`
          || target.startsWith(`${FLEET_V2_ROUTE_PREFIX}/enheder/`)
          ? target.replace(FLEET_V2_ROUTE_PREFIX, "/ressourcer")
          : target;
        const resourceTarget = resourceRoute && sharedUnitTarget.startsWith("/ressourcer/")
          && !sharedUnitTarget.startsWith("/ressourcer/enheder")
          ? sharedUnitTarget.replace("/ressourcer", FLEET_V2_ROUTE_PREFIX)
          : sharedUnitTarget;
        navigate(resourceTarget, {
          ...options,
          state: { ...(options.state || {}), ...opretReturtilstand(aktuelSti, window.scrollY) },
        });
      }}
      pathname={`${location.pathname}${location.search}`}
      repository={repository}
      serviceBackend={serviceBackend}
    />
  );
}
