import { NavLink, useLocation } from "react-router-dom";
import VeyroLogo from "../../fleet/VeyroLogo.jsx";
import { EjerDataProvider } from "./EjerDataContext.jsx";

const NAV = [
  { label: "Overblik", punkter: [{ to: "/main", label: "Dagens overblik", slut: true }] },
  {
    label: "Salg",
    punkter: [
      { to: "/main/salg/pipeline", label: "Pipeline" },
      { to: "/main/salg/kunder", label: "Kunder" },
      { to: "/main/salg/aktiviteter", label: "Aktiviteter" },
      { to: "/main/salg/tilbud", label: "Tilbud" },
      { to: "/main/priser", label: "Rateblad" },
    ],
  },
  { label: "Administration", punkter: [{ to: "/main/abonnementer", label: "Abonnementer" }] },
  {
    label: "Økonomi",
    punkter: [
      { to: "/main/oekonomi", label: "Økonomioverblik", slut: true },
      { to: "/main/oekonomi/fakturaer", label: "Fakturaer" },
      { to: "/main/oekonomi/kreditnotaer", label: "Kreditnotaer" },
      { to: "/main/oekonomi/bilag", label: "Bilagsindbakke" },
      { to: "/main/oekonomi/omkostninger", label: "Omkostninger" },
    ],
  },
  { label: "System", punkter: [{ to: "/main/integrationer", label: "Integrationer" }] },
];

const TITLER = {
  "/main": ["Overblik", "Det, der kræver handling i dag"],
  "/main/salg/pipeline": ["Salgspipeline", "Muligheder, næste handling og forventet værdi"],
  "/main/salg/kunder": ["Kunder", "CRM-virksomheder, kontakter og samlet historik"],
  "/main/salg/aktiviteter": ["Aktiviteter", "Opfølgninger, møder og opgaver"],
  "/main/salg/tilbud": ["Tilbud", "Versionerede tilbud og opfølgning"],
  "/main/priser": ["Rateblad", "Prislister og fakturagrundlag"],
  "/main/abonnementer": ["Kunder og abonnementer", "Provisionerede tenants og moduladgang"],
  "/main/oekonomi": ["Økonomioverblik", "Afstemte tal fra Veyro og Dinero"],
  "/main/oekonomi/fakturaer": ["Fakturaer", "Frigivelse, afsendelse og betaling"],
  "/main/oekonomi/kreditnotaer": ["Kreditnotaer", "Hel og delvis kreditering"],
  "/main/oekonomi/bilag": ["Bilagsindbakke", "Veyros egne udgiftsbilag"],
  "/main/oekonomi/omkostninger": ["Omkostninger", "Bogførte udgifter og bilagsmatch"],
  "/main/integrationer": ["Integrationer", "Forbindelser, synkronisering og fejl"],
};

export default function EjerRamme({ bruger, logUd, children }) {
  const location = useLocation();
  const [titel, undertekst] = TITLER[location.pathname] || TITLER["/main"];

  return (
    <EjerDataProvider>
      <div className="fc-app ejer-app">
        <aside className="ejer-side">
          <NavLink className="ejer-logo" to="/main" aria-label="Veyro ejerkonsol, overblik">
            <VeyroLogo variant="sidebar" />
          </NavLink>
          <div className="ejer-produkt">Ejerkonsol</div>
          <nav className="ejer-nav" aria-label="Ejerkonsollens hovednavigation">
            {NAV.map((gruppe) => (
              <section key={gruppe.label}>
                <h2>{gruppe.label}</h2>
                {gruppe.punkter.map((punkt) => (
                  <NavLink
                    key={punkt.to}
                    to={punkt.to}
                    end={punkt.slut}
                    className={({ isActive }) => `ejer-link${isActive ? " ejer-link-aktiv" : ""}`}
                  >
                    {punkt.label}
                  </NavLink>
                ))}
              </section>
            ))}
          </nav>
          <div className="ejer-identitet">
            <strong>{bruger?.navn || "Ejer"}</strong>
            <span>{bruger?.email}</span>
            <span>Tenantløs ejeridentitet</span>
            <button type="button" className="fc-btn" onClick={logUd}>Log ud</button>
          </div>
        </aside>
        <div className="ejer-hoved">
          <header className="ejer-top">
            <div>
              <h1>{titel}</h1>
              <p>{undertekst}</p>
            </div>
            <span className="ejer-sikkerhed">Intern administration · ejeradgang</span>
          </header>
          <main className="ejer-indhold" id="ejer-indhold">{children}</main>
        </div>
      </div>
    </EjerDataProvider>
  );
}

