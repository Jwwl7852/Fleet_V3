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
     efter beslutning 28 igen "demo" — og denne gang af den rigtige grund.
     Se saetDemoRolle. */
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
   * ⚠ NO-OP UDEN FOR DEMO-MODE. RØR IKKE DEN BETINGELSE.
   *
   * Overstyringen tegner UI'et som en anden rolle. Den kan IKKE ændre adgang:
   * perms kommer fra tokenets claims, og en klient kan ikke ændre sit eget
   * token. Det er ikke et forbud der gælder ét sted — det er en umulighed der
   * gælder overalt hvor der er en server.
   *
   * ⚠ DEN HAR VÆRET GATET FORKERT TO GANGE. Først på demoMode alene, hvilket
   * gjorde den usynlig i dev. Så på "ikke produktion", hvilket gjorde den
   * SYNLIG i dev — hvor den viste knapper serveren afviser, og hvor det så ud
   * som om man skiftede sin egen adgang. Begge gange blev symptomet rettet.
   *
   * Betingelsen er nu "demo", og denne gang af den rigtige grund: i demo er
   * der ingen server at være uenig med, og at kunne vise platformen som en
   * disponent er hele pointen med en demo.
   *
   * I DEV skifter man i stedet SESSION — se fleet/Brugervaelger.jsx. Log ud,
   * log ind som en anden seedet bruger, hent nyt token. Så skifter perms fordi
   * tokenet skifter, og det er dér man kan se at UI og regler er enige.
   * Beslutning 28.
   *
   * Skal en rigtig bruger have anden adgang, ændres rollen i tenantens
   * roller/ og claim'et fornys.
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
