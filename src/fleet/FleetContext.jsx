/* src/fleet/FleetContext.jsx
 * Tenant, periode og Gods/Bus bor her — ikke i hvert modul.
 * Derfor kan Flåde ikke længere stå i 2024 mens Facility står i 2026.
 *
 * Brug: pak <FleetProvider> om din router, og læs med useFleet() i modulerne.
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { permStrengFraRolle, ROLLE_PERMS } from "./permissions.js";

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

/** Rollerne man kan skifte mellem i demo-mode. Udledt af presettene, så
 *  listen ikke kan komme ud af sync med permissions.js. */
export const DEMO_ROLLER = Object.keys(ROLLE_PERMS);

export function FleetProvider({
  children, tenants = [], bruger = null, logUd = () => {}, rolleskifte = false,
}) {
  /* Beholdt som lokalt navn, så resten af filen læses som før. Betingelsen er
     nu "ikke produktion" og ikke "demo" — se saetDemoRolle. */
  const demo = rolleskifte;
  const start = gemt();
  const [tenantId, setTenantId] = useState(start.tenantId || tenants[0]?.id || "demo");
  const [dage, setDage] = useState(start.dage || 30);
  const [division, setDivision] = useState(start.division || "gods");
  /* Kun meningsfuld i demo-mode — se saetDemoRolle nedenfor. */
  const [demoRolle, setDemoRolle] = useState(demo ? (start.demoRolle || null) : null);

  useEffect(() => {
    localStorage.setItem(LS, JSON.stringify({ tenantId, dage, division, demoRolle }));
  }, [tenantId, dage, division, demoRolle]);

  /**
   * ⚠ NO-OP I PRODUKTION. RØR IKKE DEN BETINGELSE.
   *
   * Vælgeren findes for at gøre adgangsmodellen synlig: skifter man rolle,
   * ændrer knapperne sig på HVER skærm, fordi de alle spørger efter en
   * permission frem for efter en rolle.
   *
   * ⚠ DEN GATEDE FØRST PÅ demoMode ALENE, OG DET VAR FORKERT.
   * En udvikler kører normalt mod DEV med rigtige nøgler — README siger det
   * udtrykkeligt — og så var vælgeren usynlig præcis dér hvor man har brug
   * for den. Betingelsen er nu "ikke produktion".
   *
   * I dev er der et rigtigt token, og claim'et er URØRT: serveren afviser
   * stadig det rollen ikke må. Det er ikke en ulempe, men selve nytten —
   * man kan se at UI og regler er enige. Teksten i shellen siger det.
   *
   * I PRODUKTION må den ikke findes. Dér ville den ligne at man skiftede sin
   * egen adgang, og en kontrol der ligner en rettighedsændring uden at være
   * det, bliver før eller siden læst som en. Skal en rigtig bruger have anden
   * adgang, ændres rollen i tenantens roller/ og claim'et fornys.
   */
  const saetDemoRolle = useCallback((rolle) => {
    if (!demo) return;
    setDemoRolle(rolle && ROLLE_PERMS[rolle] ? rolle : null);
  }, [demo]);

  /* Perms udledes ALTID af presettet, aldrig skrevet i hånden — ellers ville
     demo-brugeren kunne have en anden adgang end en rigtig bruger med samme
     rolle, og så tester man noget andet end det man leverer. */
  const effektivBruger = useMemo(() => {
    if (!demo || !demoRolle || !bruger) return bruger;
    return {
      ...bruger,
      rolle: demoRolle,
      rolleLabel: `${demoRolle} (demo)`,
      perms: permStrengFraRolle(demoRolle),
    };
  }, [demo, demoRolle, bruger]);

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
      path, bruger: effektivBruger, logUd,
      /* demo er false i produktion, og så er demoRolle altid null og
         saetDemoRolle en no-op. Shellen render kun vælgeren når demo er sand. */
      demo, demoRolle, saetDemoRolle,
    }),
    [tenantId, tenant, tenants, dage, periode, division, path, effektivBruger,
     logUd, demo, demoRolle, saetDemoRolle]
  );

  return <FleetCtx.Provider value={value}>{children}</FleetCtx.Provider>;
}

export function useFleet() {
  const v = useContext(FleetCtx);
  if (!v) throw new Error("useFleet skal bruges inde i <FleetProvider>.");
  return v;
}
