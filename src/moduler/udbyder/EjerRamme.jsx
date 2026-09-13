import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import VeyroLogo from "../../fleet/VeyroLogo.jsx";
import { EjerDataProvider } from "./EjerDataContext.jsx";
import EjerIkon from "./EjerIkon.jsx";
import { erEjerNavgruppeAaben, ejerInitialer, ejerVisningsnavn } from "../../fleet/ejer-navigation.js";
import { useVisningsvalg } from "../../fleet/useVisningsvalg.js";
import { begraensZoom } from "../../fleet/visningsvalg.js";

const NAV = [
  { label: null, punkter: [{ to: "/main", label: "Overblik", slut: true, ikon: "home" }] },
  {
    label: "Mail", ikon: "mail",
    punkter: [
      { to: "/main/mail/indbakker", label: "Indbakker", ikon: "inbox" },
      { to: "/main/mail/opfoelgning", label: "Opfølgning", ikon: "clock" },
      { to: "/main/mail/sager", label: "Sager og mapper", ikon: "document" },
      { to: "/main/mail/sendt", label: "Sendt", ikon: "send" },
    ],
  },
  { label: null, punkter: [{ to: "/main/support", label: "Support", ikon: "info" }] },
  {
    label: "Salg", ikon: "pipeline",
    punkter: [
      { to: "/main/salg/pipeline", label: "Pipeline", ikon: "pipeline" },
      { to: "/main/salg/aktiviteter", label: "Aktiviteter", ikon: "calendar" },
      { to: "/main/salg/tilbud", label: "Tilbud", ikon: "document" },
      { to: "/main/priser", label: "Rateblad", ikon: "tag" },
    ],
  },
  { label: "Kunder", ikon: "users", punkter: [{ to: "/main/salg/kunder", label: "Kundekort", ikon: "users" }, { to: "/main/abonnementer", label: "Abonnementer", ikon: "layers" }] },
  {
    label: "Økonomi", ikon: "chart",
    punkter: [
      { to: "/main/oekonomi", label: "Økonomioverblik", slut: true, ikon: "chart" },
      { to: "/main/oekonomi/fakturaer", label: "Fakturaer", ikon: "invoice" },
      { to: "/main/oekonomi/kreditnotaer", label: "Kreditnotaer", ikon: "undo" },
      { to: "/main/oekonomi/bilag", label: "Bilagsindbakke", ikon: "inbox" },
      { to: "/main/rapporter", label: "Rapporter", ikon: "chart" },
    ],
  },
  { label: "Vidensbase", ikon: "book", punkter: [{ to: "/main/salg/vidensbase", label: "Godkendt viden", ikon: "book" }] },
  { label: "Indstillinger", ikon: "link", punkter: [{ to: "/main/indstillinger/mail-signatur", label: "Mail og signatur", ikon: "mail" }, { to: "/main/integrationer", label: "Integrationer", ikon: "link" }, { to: "/main/indstillinger/leverandoerer", label: "Leverandører", ikon: "building" }] },
];

const TITLER = {
  "/main": ["Overblik", "Din arbejdsdag, kunderne og økonomien samlet"],
  "/main/salg/pipeline": ["Salgspipeline", "Muligheder, næste handling og forventet værdi"],
  "/main/salg/indbakke": ["Salgsindbakke", "info@veyrosystems.com · Microsoft 365 · Eksempelvisning"],
  "/main/mail/indbakker": ["Din arbejdsindbakke", "Mail, fælles kundekorrespondance og ansvar samlet"],
  "/main/mail/opfoelgning": ["Opfølgning", "Det, der kræver din eller Jørns handling"],
  "/main/mail/sager": ["Sager og mapper", "Intern korrespondance holdt adskilt fra kundesager"],
  "/main/mail/sendt": ["Sendt", "Dokumenterede afsendelser fra tilsluttede postkasser"],
  "/main/support": ["Support", "Fælles supportkø, ansvar og frister"],
  "/main/salg/kunder": ["Kunder", "CRM-virksomheder, kontakter og samlet historik"],
  "/main/kunder": ["Kundekonto", "Profil, adgang, abonnement og administratorer samlet"],
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
  "/main/rapporter": ["Statistik og rapporter", "Salg, pilotforløb, mail og support på et dokumenteret grundlag"],
  "/main/integrationer": ["Integrationer", "Forbindelser, synkronisering og fejl"],
  "/main/indstillinger/leverandoerer": ["Leverandører", "Veyros egne leverandører og aftaler"],
  "/main/indstillinger/mail-signatur": ["Mail og signatur", "Din personlige afsenderidentitet og signatur"],
};

export default function EjerRamme({ bruger, logUd, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [soegning, setSoegning] = useState("");
  const [ejerfilter, setEjerfilter] = useState("Alle");
  const [mobilmenuAaben, setMobilmenuAaben] = useState(false);
  const [aabneGrupper, setAabneGrupper] = useVisningsvalg({
    brugerId: bruger?.uid, kontekst: "ejer", skaerm: "ejershell", egenskab: "grupper", standard: {},
  });
  const [menuvisning, setMenuvisning, nulstilMenuvisning] = useVisningsvalg({
    brugerId: bruger?.uid, kontekst: "ejer", skaerm: "ejershell", egenskab: "menu", standard: "normal",
  });
  const [zoom, setZoom, nulstilZoom] = useVisningsvalg({
    brugerId: bruger?.uid, kontekst: "ejer", skaerm: location.pathname, egenskab: "zoom", standard: 100,
  });
  const menuKompakt = menuvisning === "kompakt";
  const skiftZoom = (retning) => setZoom((aktuel) => begraensZoom(Number(aktuel) + retning));
  const nulstilVisning = () => {
    nulstilMenuvisning(); nulstilZoom();
    window.dispatchEvent(new CustomEvent("veyro:nulstil-visning", { detail: { skaerm: location.pathname } }));
  };
  const mobilmenuknap = useRef(null);
  const [titel, undertekst] = TITLER[location.pathname]
    || (location.pathname.startsWith("/main/kunder/") ? TITLER["/main/kunder"] : TITLER["/main"]);
  const soeg = (event) => {
    event.preventDefault();
    const q = soegning.trim().toLowerCase();
    if (!q) return;
    if (q.includes("bilag")) navigate(`/main/oekonomi/bilag?q=${encodeURIComponent(soegning.trim())}`);
    else if (q.includes("tilbud") || /^t-\d/.test(q)) navigate(`/main/salg/tilbud?q=${encodeURIComponent(soegning.trim())}`);
    else navigate(`/main/salg/kunder?q=${encodeURIComponent(soegning.trim())}`);
  };

  useEffect(() => setMobilmenuAaben(false), [location.pathname]);
  useEffect(() => {
    document.body.classList.add("ejer-body");
    return () => document.body.classList.remove("ejer-body");
  }, []);
  useEffect(() => {
    if (!mobilmenuAaben) return undefined;
    const lukMedEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobilmenuAaben(false);
      requestAnimationFrame(() => mobilmenuknap.current?.focus());
    };
    document.addEventListener("keydown", lukMedEscape);
    return () => document.removeEventListener("keydown", lukMedEscape);
  }, [mobilmenuAaben]);

  return (
    <EjerDataProvider ansvarligFilter={ejerfilter}>
      <div className={`fc-app ejer-app${menuKompakt ? " ejer-menu-kompakt" : ""}`}>
        <aside className={`ejer-side${mobilmenuAaben ? " ejer-side-aaben" : ""}`}>
          <NavLink className="ejer-logo" to="/main" aria-label="Veyro ejerkonsol, overblik">
            <VeyroLogo variant="sidebar" />
          </NavLink>
          <div className="ejer-produkt">Ejerkonsol</div>
          <button type="button" className="fc-menu-toggle ejer-menu-toggle"
            aria-label={menuKompakt ? "Åbn normal ejermenu" : "Fold ejermenuen sammen"}
            aria-pressed={menuKompakt}
            onClick={() => setMenuvisning(menuKompakt ? "normal" : "kompakt")}>{menuKompakt ? "›" : "‹"}</button>
          <button
            ref={mobilmenuknap}
            type="button"
            className="ejer-mobilmenuknap"
            aria-expanded={mobilmenuAaben}
            aria-controls="ejer-mobilmenu"
            aria-label={mobilmenuAaben ? "Luk navigation" : "Åbn navigation"}
            onClick={() => setMobilmenuAaben((aaben) => !aaben)}
          >{mobilmenuAaben ? "×" : "☰"}</button>
          <div className="ejer-menuindhold" id="ejer-mobilmenu">
            <nav className="ejer-nav" aria-label="Ejerkonsollens hovednavigation">
              {NAV.map((gruppe) => {
                const aktivGruppe = gruppe.punkter.some((punkt) => punkt.slut ? location.pathname === punkt.to : location.pathname.startsWith(punkt.to));
                const noegle = gruppe.label || gruppe.punkter[0].to;
                const aaben = !gruppe.label || erEjerNavgruppeAaben({ gemt: aabneGrupper, noegle, aktiv: aktivGruppe });
                return (
                <section key={gruppe.label || gruppe.punkter[0].to} data-gruppe-label={gruppe.label || gruppe.punkter[0].label} className={gruppe.separat ? "ejer-nav-separat" : ""}>
                  {gruppe.label && <button type="button" className="ejer-navgruppe" aria-expanded={aaben} onClick={() => setAabneGrupper((gamle) => ({ ...gamle, [noegle]: !aaben }))}><EjerIkon navn={gruppe.ikon} size={20}/><span>{gruppe.label}</span><b>{aaben ? "⌃" : "⌄"}</b></button>}
                  {(aaben || menuKompakt) && <div className="ejer-navpunkter">
                    <strong className="ejer-kompakt-gruppenavn">{gruppe.label || gruppe.punkter[0].label}</strong>
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
                  </div>}
                </section>
                );
              })}
            </nav>
            <div className="ejer-identitet">
              <span className="ejer-avatar">{ejerInitialer(bruger)}</span>
              <span className="ejer-identitetstekst"><strong>{ejerVisningsnavn(bruger)}</strong><small>Ejer</small></span>
              <button type="button" className="ejer-profilmenu" onClick={logUd} aria-label="Åbn profilmenu eller log ud">⌄</button>
            </div>
          </div>
        </aside>
        {mobilmenuAaben && <button type="button" className="ejer-mobiloverlay" aria-label="Luk navigation" onClick={() => setMobilmenuAaben(false)} />}
        <div className="ejer-hoved">
          <header className="ejer-top">
            <form className="ejer-globalsoeg" role="search" onSubmit={soeg}><EjerIkon navn="search" size={23} /><input aria-label="Søg i ejerkonsollen" value={soegning} onChange={(event) => setSoegning(event.target.value)} placeholder="Søg kunde, tilbud eller bilag..." /></form>
            <div className="ejer-tophandlinger"><div className="fc-zoomkontroller ejer-zoomkontroller" role="group" aria-label="Arbejdsområdezoom"><button type="button" onClick={() => skiftZoom(-5)} aria-label="Zoom ud">−</button><output>{begraensZoom(zoom)} %</output><button type="button" onClick={() => skiftZoom(5)} aria-label="Zoom ind">+</button></div><button type="button" className="fc-nulstil-visning ejer-nulstil-visning" onClick={nulstilVisning}>Nulstil visning</button><select className="ejer-ejerfilter" value={ejerfilter} onChange={(event) => setEjerfilter(event.target.value)} aria-label="Filtrér på ansvarlig"><option value="Alle">Alle ansvarlige</option><option value="Dennis">Dennis</option><option value="Jørn">Jørn</option></select><button type="button" className="ejer-notifikation" aria-label="Åbn opgaver og notifikationer" onClick={() => navigate("/main/mail/opfoelgning")}><EjerIkon navn="bell" size={25} /><b>3</b></button><span className="ejer-avatar">{ejerInitialer(bruger)}</span></div>
          </header>
          <main className="ejer-indhold fc-workspace-zoom" id="ejer-indhold"
            style={{ "--fc-workspace-zoom": begraensZoom(zoom) / 100 }}
            onWheel={(event) => { if (!event.shiftKey || event.ctrlKey || event.metaKey) return; event.preventDefault(); skiftZoom(event.deltaY > 0 ? -5 : 5); }}>
            <div className="ejer-sidehoved"><div><h1>{titel}</h1><p>{undertekst}</p></div><div className="ejer-eksempelmaerke"><span>DESIGNFORSLAG&nbsp; · &nbsp;EKSEMPELDATA</span></div></div>
            {children}
          </main>
        </div>
      </div>
    </EjerDataProvider>
  );
}
