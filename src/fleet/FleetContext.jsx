/* src/fleet/FleetContext.jsx
 * Tenant, periode og Gods/Bus bor her — ikke i hvert modul.
 * Derfor kan Flåde ikke længere stå i 2024 mens Facility står i 2026.
 *
 * Brug: pak <FleetProvider> om din router, og læs med useFleet() i modulerne.
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

const LS = "fc.ctx.v2";
const FleetCtx = createContext(null);

export const PERIODER = [
  { dage: 7, label: "Seneste 7 dage" },
  { dage: 30, label: "Seneste 30 dage" },
  { dage: 90, label: "Seneste 90 dage" },
  { dage: 365, label: "Seneste 12 mdr." },
];

function gemt() {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}

export function FleetProvider({ children, tenants = [], bruger = null, logUd = () => {} }) {
  const start = gemt();
  const [tenantId, setTenantId] = useState(start.tenantId || tenants[0]?.id || "demo");
  const [dage, setDage] = useState(start.dage || 30);
  const [division, setDivision] = useState(start.division || "gods");

  useEffect(() => {
    localStorage.setItem(LS, JSON.stringify({ tenantId, dage, division }));
  }, [tenantId, dage, division]);

  /* Perioden regnes ét sted. Alle moduler filtrerer på de samme
     epoch-millisekunder, så de kan ikke vise hver sit tidsrum. */
  const periode = useMemo(() => {
    const til = Date.now();
    const fra = til - dage * 86400000;
    return { fra, til, dage };
  }, [dage]);

  /* Databasesti. Modulerne bygger aldrig selv "tenants/…"-strenge —
     så kan de heller ikke ramme forkert tenant. */
  const path = useCallback((sub) => `tenants/${tenantId}/${sub}`, [tenantId]);

  const tenant = tenants.find((t) => t.id === tenantId) || tenants[0] || null;

  const value = useMemo(
    () => ({
      tenantId, tenant, tenants, setTenantId,
      dage, periode, setDage,
      division, setDivision,
      path, bruger, logUd,
    }),
    [tenantId, tenant, tenants, dage, periode, division, path, bruger, logUd]
  );

  return <FleetCtx.Provider value={value}>{children}</FleetCtx.Provider>;
}

export function useFleet() {
  const v = useContext(FleetCtx);
  if (!v) throw new Error("useFleet skal bruges inde i <FleetProvider>.");
  return v;
}
