import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import VeyroLogo from "../../fleet/VeyroLogo.jsx";
import { EjerDataProvider } from "./EjerDataContext.jsx";
import EjerIkon from "./EjerIkon.jsx";

const NAV = [
  { label: null, punkter: [{ to: "/main", label: "Overblik", slut: true, ikon: "home" }] },
  {
    label: "Salg",
    punkter: [
      { to: "/main/salg/indbakke", label: "Salgsindbakke", ikon: "inbox" },
      { to: "/main/salg/pipeline", label: "Pipeline", ikon: "pipeline" },
      { to: "/main/salg/kunder", label: "Kunder", ikon: "users" },
      { to: "/main/salg/aktiviteter", label: "Aktiviteter", ikon: "calendar" },
      { to: "/main/salg/tilbud", label: "Tilbud", ikon: "document" },
      { to: "/main/priser", label: "Rateblad", ikon: "tag" },
    ],
  },
  { label: "Administration", punkter: [{ to: "/main/abonnementer", label: "Abonnementer", ikon: "layers" }] },
  {
    label: "Økonomi",
    punkter: [
      { to: "/main/oekonomi", label: "Økonomioverblik", slut: true, ikon: "chart" },
      { to: "/main/oekonomi/fakturaer", label: "Fakturaer", ikon: "invoice" },
      { to: "/main/oekonomi/kreditnotaer", label: "Kreditnotaer", ikon: "undo" },
      { to: "/main/oekonomi/bilag", label: "Bilagsindbakke", ikon: "inbox" },
    ],
  },
  { label: null, separat: true, punkter: [
    { to: "/main/salg/vidensbase", label: "Vidensbase", ikon: "book" },
    { to: "/main/integrationer", label: "Integrationer", ikon: "link" },
  ] },
];

const TITLER = {
  "/main": ["Overblik", "Din arbejdsdag, kunderne og økonomien samlet"],
  "/main/salg/pipeline": ["Salgspipeline", "Muligheder, næste handling og forventet værdi"],
  "/main/salg/indbakke": ["Salgsindbakke", "info@veyrosystems.com · Microsoft 365 · Eksempelvisning"],
  "/main/salg/kunder": ["Kunder", "CRM-virksomheder, kontakter og samlet historik"],
  "/main/salg/aktiviteter": ["Opfølgninger til godkendelse", "Gennemgå og godkend AI-udkast til opfølgningsmails, før de sendes."],
  "/main/salg/tilbud": ["Tilbud", "Versionerede tilbud og opfølgning"],
  "/main/salg/vidensbase": ["Veyro-vidensbase", "Godkendte tekster, kilder og leveringsstatus"],
  "/main/priser": ["Rateblad", "Prislister og fakturagrundlag"],
  "/main/abonnementer": ["Kunder og abonnementer", "Provisionerede tenants og moduladgang"],
  "/main/oekonomi": ["Økonomioverblik", "September 2026 · Dinero-data · eksempelvisning"],
  "/main/oekonomi/fakturaer": ["Fakturaer", "Frigivelse, afsendelse og betaling"],
  "/main/oekonomi/kreditnotaer": ["Kreditnotaer", "Hel og delvis kreditering"],
  "/main/oekonomi/bilag": ["Bilagsindbakke", "Veyros egne udgiftsbilag"],
  "/main/oekonomi/omkostninger": ["Omkostninger", "Bogførte udgifter og bilagsmatch"],
  "/main/integrationer": ["Integrationer", "Forbindelser, synkronisering og fejl"],
};

export default function EjerRamme({ bruger, logUd, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [soegning, setSoegning] = useState("");
  const [ejerfilter, setEjerfilter] = useState("Alle");
  const [titel, undertekst] = TITLER[location.pathname] || TITLER["/main"];
  const soeg = (event) => {
    event.preventDefault();
    const q = soegning.trim().toLowerCase();
    if (!q) return;
    if (q.includes("bilag")) navigate(`/main/oekonomi/bilag?q=${encodeURIComponent(soegning.trim())}`);
    else if (q.includes("tilbud") || /^t-\d/.test(q)) navigate(`/main/salg/tilbud?q=${encodeURIComponent(soegning.trim())}`);
    else navigate(`/main/salg/kunder?q=${encodeURIComponent(soegning.trim())}`);
  };

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
              <section key={gruppe.label || gruppe.punkter[0].to} className={gruppe.separat ? "ejer-nav-separat" : ""}>
                {gruppe.label && <h2>{gruppe.label}</h2>}
                {gruppe.punkter.map((punkt) => (
                  <NavLink
                    key={punkt.to}
                    to={punkt.to}
                    end={punkt.slut}
                    className={({ isActive }) => `ejer-link${isActive ? " ejer-link-aktiv" : ""}`}
                  >
                    <EjerIkon navn={punkt.ikon} size={24} />
                    <span>{punkt.label}</span>
                  </NavLink>
                ))}
              </section>
            ))}
          </nav>
          <div className="ejer-identitet">
            <span className="ejer-avatar">DC</span>
            <span className="ejer-identitetstekst"><strong>{bruger?.navn || "Dennis Christensen"}</strong><small>Ejer</small></span>
            <button type="button" className="ejer-profilmenu" onClick={logUd} aria-label="Åbn profilmenu eller log ud">⌄</button>
          </div>
        </aside>
        <div className="ejer-hoved">
          <header className="ejer-top">
            <form className="ejer-globalsoeg" role="search" onSubmit={soeg}><EjerIkon navn="search" size={23} /><input aria-label="Søg i ejerkonsollen" value={soegning} onChange={(event) => setSoegning(event.target.value)} placeholder="Søg kunde, tilbud eller bilag..." /></form>
            <div className="ejer-tophandlinger"><select className="ejer-ejerfilter" value={ejerfilter} onChange={(event) => setEjerfilter(event.target.value)} aria-label="Filtrér på ansvarlig"><option value="Alle">Alle / Dennis / Jørn</option><option value="Dennis">Dennis</option><option value="Jørn">Jørn</option></select><button type="button" className="ejer-notifikation" aria-label="Åbn opgaver og notifikationer" onClick={() => navigate("/main/salg/aktiviteter")}><EjerIkon navn="bell" size={25} /><b>3</b></button><span className="ejer-avatar">DC</span></div>
          </header>
          <main className="ejer-indhold" id="ejer-indhold">
            <div className="ejer-sidehoved"><div><h1>{titel}</h1><p>{undertekst}</p></div><div className="ejer-eksempelmaerke"><span>DESIGNFORSLAG&nbsp; · &nbsp;EKSEMPELDATA</span></div></div>
            {children}
          </main>
        </div>
      </div>
    </EjerDataProvider>
  );
}
