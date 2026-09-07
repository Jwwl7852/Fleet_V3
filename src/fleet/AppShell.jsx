/* src/fleet/AppShell.jsx
 * Layout-rute: sidebar + topbar + <Outlet/>.
 *
 * ⚠ TOPBAREN HAR INGEN KONTROLLER LÆNGERE. Firmavælgeren, periodevælgeren og
 * "Opdateret 22.43" er væk fra hver side — se noten nede ved <header>.
 * Reglen står ved magt: et modul må stadig ikke bygge sin egen sidebar,
 * tenant-vælger eller periodevælger. Skal en af dem tilbage, hører den HER.
 */
import { Suspense, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useFleet, DEMO_ROLLER } from "./FleetContext.jsx";
import { findModul, findHovedmodul, NAV, GRUPPE_ORDEN, GRUPPE_LABEL, modulNavnFor } from "./nav.js";
import { harModul } from "./moduler.js";
import { harPerm } from "./permissions.js";
import { usePost } from "./usePost.js";
import { erSkjultVedNavvisning } from "./navvisning.js";
import Brugervaelger from "./Brugervaelger.jsx";
import VeyroLogo from "./VeyroLogo.jsx";
import { miljoe, projektId, paaLokalMaskine, netlifyKontekst, erProduktionsdeploy } from "../firebase.js";

/**
 * Miljøbjælke — over hele bredden, over sidebaren, umulig at overse.
 *
 * Den farlige situation er ikke "jeg troede jeg var på prod". Det er
 * "jeg troede jeg var på dev" — og så skriver man testdata ind i rigtige
 * kunders base. Derfor råber den højest ved PRODUKTIONSNØGLER ET STED DE
 * IKKE HØRER HJEMME, ikke ved dev.
 *
 * To sådanne steder, og begge fanges:
 *   1. en udviklermaskine        (localhost eller vite dev)
 *   2. en deploy-preview eller branch-deploy
 *
 * Nr. 2 kan kun ses, fordi netlify.toml mapper Netlifys CONTEXT ned i en
 * VITE_-variabel. Uden den ligner en preview et helt almindeligt
 * produktionsdeploy — samme netlify.app-domæne, samme alt.
 *
 * Produktion fra et bekræftet produktionsdeploy viser INGEN bjælke. En
 * advarsel man ser hele tiden, holder man op med at se.
 */
function MiljoeBjaelke() {
  const udvikling = paaLokalMaskine || import.meta.env.DEV;
  /* Bemærk: kun hvis konteksten er KENDT og ikke er produktion. Er den ukendt
     — et build hostet et sted vi ikke kender — falder vi tilbage på
     localhost-tjekket frem for at give falsk alarm på det rigtige site. */
  const forkertKontekst = netlifyKontekst !== null && !erProduktionsdeploy;

  if (miljoe === "prod" && (udvikling || forkertKontekst)) {
    return (
      <div className="fc-miljoe fc-miljoe-fare" role="alert">
        <b>Produktion</b>
        <span>
          Du kører mod <b>{projektId}</b>{" "}
          {udvikling ? "fra en udviklermaskine" : `i en ${netlifyKontekst}`}.
          Alt du gør, rammer rigtige kunders data.
        </span>
      </div>
    );
  }
  if (miljoe === "dev") {
    return (
      <div className="fc-miljoe fc-miljoe-dev" role="status">
        <b>Dev{netlifyKontekst && !erProduktionsdeploy ? ` · ${netlifyKontekst}` : ""}</b>
        <span>{projektId} — data her er til at smide væk.</span>
      </div>
    );
  }
  if (miljoe === "demo") {
    return (
      <div className="fc-miljoe fc-miljoe-demo" role="status">
        <b>Demo</b>
        <span>Ingen databaseforbindelse. Tallene kommer fra datasættene i fleet/demo-*.js.</span>
      </div>
    );
  }
  return null;
}

const ICO = {
  dashboard: "M3 11 12 3l9 8M5 10v10h14V10",
  booking: "M7 3v4m10-4v4M3 9h18M5 5h14v16H5z",
  bemanding: "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  flaade: "M3 16V7h11v9M14 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4m11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  facility: "M4 21V5l8-3v19M12 21h8V9l-8-3M7 9h1m-1 4h1m-1 4h1",
  indkoeb: "M3 4h2l2.5 11h10L21 7H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2m8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
  unitbooking: "M3 4h18v16H3zM3 10h18M3 15h18M8 4v6M15 10v5M11 15v5",
  warehouse: "M3 21V9l9-6 9 6v12M3 21h18M9 21v-6h6v6M6 12h3m6 0h3",
  /* ⚠ `kunder` STOD HER OG ER VÆK. Kundekartoteket og de to prisskærme er
     stamdata og ligger nu under Opsætning, så modulet har ikke længere et
     hovedpunkt at tegne et ikon ved siden af. Et ikon til et punkt der er
     fjernet, er en rest ingen opdager — idébanken efterlod netop sådan en
     (beslutning 22), og prøven `har ingen ikoner tilovers` fandt den her. */
  oekonomi: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  /* Skive 2A: kunderOversigt og fakturacenter er topniveaupunkter nu, ikke
     børn — se nav.js's hoved. Begge har derfor brug for deres eget ikon her,
     ellers tegnes de uden (se prøven "hvert menupunkt har et ikon"). */
  kunderOversigt: "M2 10l10-7 10 7M4 10V21h16V10M9 21v-6h6v6",
  fakturacenter: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h3",
  leverandoerer: "M3 16V6a1 1 0 0 1 1-1h9v11M14 9h4l3 3v4h-2M3 16h2m9 0h5M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  support: "M12 18h.01M12 14a2.5 2.5 0 1 0-2.5-2.5M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
  opsaetning: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9a2 2 0 1 1 0 4",
};

export default function AppShell() {
  const { tenant, bruger, logUd, demo, demoRolle, saetDemoRolle, moduler } = useFleet();
  const { pathname } = useLocation();
  const modul = findModul(pathname);
  const hoved = findHovedmodul(pathname);
  const initialer = (bruger?.navn || bruger?.email || "?")
    .split(/[ .@]/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase();

  /* ⚠ SKIVE 2B — NAVVISNING ER BRUGERENS EGEN, ÉT EKSTRA OPSLAG.
     `usePost` med `id = null` (ingen bruger endnu) henter slet ikke —
     samme "spørg ikke"-greb som resten af appen. Manglende post (`null`)
     er IKKE det samme som "alt skjult": se navvisning.js's egen note om at
     en manglende indstilling betyder "opfør dig som Skive 2A", som er
     præcis hvad `erSkjultVedNavvisning()` gør for et tomt/manglende
     opslag. */
  const { post: navvisning } = usePost("navvisning", bruger?.uid || null);

  /**
   * Sidebar-gruppernes fold-tilstand (V1-brugertest: "FÆLLES/DRIFTMODULER/
   * ADMINISTRATION skal kunne foldes sammen"). Rent visnings-lag, ingen
   * permission ændres af at folde en gruppe sammen — samme skel som
   * navvisning holder mellem hvad der TEGNES og hvad der er TILLADT.
   *
   * Huskes lokalt pr. bruger/browser i localStorage, navngivet med uid så
   * to brugere på samme maskine ikke arver hinandens fold-tilstand. Læses
   * kun ved mount — AppShell tegnes først når `bruger` findes (harAdgang
   * kræver et tenant-claim), så uid'et er stabilt fra første render.
   */
  const gruppeNoegle = `fc-nav-gruppe-lukket:${bruger?.uid || "anon"}`;
  const [gruppeLukket, saetGruppeLukket] = useState(() => {
    try {
      const raa = window.localStorage.getItem(gruppeNoegle);
      return raa ? JSON.parse(raa) : {};
    } catch {
      return {};
    }
  });
  const skifGruppe = (gruppe) => {
    saetGruppeLukket((forrige) => {
      const naeste = { ...forrige, [gruppe]: !forrige[gruppe] };
      try {
        window.localStorage.setItem(gruppeNoegle, JSON.stringify(naeste));
      } catch {
        /* localStorage utilgængelig (privat vindue e.l.) — fold-tilstanden
           virker stadig i sessionen, den huskes bare ikke til næste besøg. */
      }
      return naeste;
    });
  };

  /* Et enkelt topniveaupunkts egen undermenu (fx Facility) rulles ud når
     ruten er aktiv der. V1-brugertest: "man kan ikke klikke på den igen for
     at rulle den sammen igen" — modulLukket er brugerens eksplicitte
     overstyring af den ellers automatiske "aktiv ⇒ åben"-visning, IKKE en
     ny synlighedsregel; ruten og dens permissions er upåvirkede. */
  const [modulLukket, saetModulLukket] = useState({});
  const skifModul = (key) =>
    saetModulLukket((forrige) => ({ ...forrige, [key]: !forrige[key] }));

  /**
   * De underpunkter der faktisk tegnes — ÉT sted, fordi svaret bruges to
   * gange: til at tegne undermenuen, og til at afgøre om overskriften
   * overhovedet skal stå. Regnede de to hver sin gang, kunne et toppunkt
   * blive stående over en tom liste. Se de tre grunde nedenfor.
   */
  const synligeBorn = (m) => (m.born || [])
    .filter((b) => !b.skjulINav)
    .filter((b) => !b.kraeverModul || harModul(moduler, b.kraeverModul))
    .filter((b) => !b.kraeverPerm || harPerm(bruger?.perms, b.kraeverPerm));

  /* ⚠ SKIVE 2A: ET TOPNIVEAUPUNKT KAN NU OGSÅ VÆRE SPÆRRET, IKKE KUN ET
     BARN. Før i dag blev kun `synligeBorn()` spurgt om `kraeverModul`/
     `kraeverPerm` — ethvert topniveaupunkt blev tegnet, fordi intet af dem
     bar felterne. `kunderOversigt` (kraeverModul) og `fakturacenter`
     (kraeverPerm) er de to FØRSTE topniveaupunkter uden `born` der gør, og
     uden udvidelsen her ville Fakturaer & bilag stå åben for en chauffør,
     som ikke har `indkoeb.laes` — se nav.js's hoved.

     ⚠ OG `m.key` ER IKKE ALTID ET MODULNAVN — se `modulNavnFor()` i nav.js
     for hvorfor et rå `m.kraeverModul || m.key`-fallback var forkert.

     ⚠ OG SKIVE 2B: `erSkjultVedNavvisning()` STÅR SIDST, ALDRIG FØRST.
     Rækkefølgen ER garantien "OG, ikke ELLER" — et punkt der allerede er
     filtreret væk af modul/perm/børn ovenfor, kommer aldrig frem til
     navvisning-tjekket, og navvisning kan derfor kun fjerne FLERE af de
     punkter der overlevede de eksisterende kontroller, aldrig genindsætte
     et der ikke gjorde. Se navvisning.js's hoved. */
  const synligeToppunkter = NAV
    .filter((m) => { const n = modulNavnFor(m); return !n || harModul(moduler, n); })
    .filter((m) => !m.kraeverPerm || harPerm(bruger?.perms, m.kraeverPerm))
    .filter((m) => !m.born?.length || synligeBorn(m).length)
    .filter((m) => !erSkjultVedNavvisning(m.key, navvisning));

  return (
    <>
      <MiljoeBjaelke />
      <div className="fc-app">
        <aside className="fc-side">
          <div className="fc-brand-logo"><VeyroLogo variant="sidebar" /></div>
          <div className="fc-ver">version 3.0</div>
          <div className="fc-tenant">{tenant?.kort || tenant?.navn || "—"}</div>

          {/* ⚠ HER STOD GODS/BUS-VÆLGEREN — beslutning 9, fjernet i 70.
              Argumentet der bar den, faldt sammen med sin egen præmis:
              beslutning 19 skrev at "ingen abonnent har både gods og bus", og
              en vælger mellem to ting hvoraf kunden kun har den ene, vælger
              ikke noget. Den skiftede en tilstand der filtrerede en liste,
              hvor den ene af de to udgaver altid var tom.

              ⚠ OG DET VAR IKKE EN KOSMETISK KNAP. Den bar et FELT på syv
              noder, en sti i `kpi/`, et filter i `useListe` og en
              `udenDivision`-undtagelse på hvert modul. Alt sammen for en akse
              der duplikerede den kunden allerede har: sine MODULER. Se
              beslutning 70. */}

          <nav className="fc-nav" aria-label="Moduler">
            {/* ⚠ MENUEN SKJULER ET MODUL KUNDEN IKKE HAR KØBT — men det er en
                KOMMERCIEL kontrol, ikke en sikkerhedskontrol. Taster kunden
                /facility alligevel, ser han SIN EGEN tomme facility-node, ikke
                en andens. At kunder ikke kan nå hinandens data er en helt
                anden mekanisme: auth.token.tenant === $tenantId i hver regel,
                prøvet på hver node i begge retninger. De to må ikke forveksles.
                Se fleet/moduler.js.

                ⚠ OG ET PUNKT HVIS BØRN ALLE ER SKJULT, TEGNES IKKE —
                beslutning 105. En chauffør mangler `indkoeb.laes`, og så er
                alle syv Procure-punkter væk; blev overskriften stående,
                førte den til en afvist læsning og lovede seks punkter der
                ikke fandtes. Et punkt UDEN børn (Dashboard) er upåvirket.
                Se `synligeToppunkter` ovenfor.

                ⚠ GRUPPEOVERSKRIFTERNE (Skive 2A) ER ET RENDER-LAG, IKKE EN
                NY FILTRERINGSREGEL. `synligeToppunkter` er allerede den
                fulde, filtrerede liste; grupperingen herunder bestemmer kun
                HVOR i sidebaren hvert punkt tegnes. En gruppe uden et eneste
                synligt punkt får ingen overskrift — se GRUPPE_ORDEN i
                nav.js. */}
            {GRUPPE_ORDEN.map((gruppe) => {
              const punkter = synligeToppunkter.filter((m) => m.gruppe === gruppe);
              if (!punkter.length) return null;
              const lukket = !!gruppeLukket[gruppe];
              return (
                <div key={gruppe} className="fc-nav-gruppe-blok">
                  <button type="button" className="fc-nav-gruppe-toggle"
                          onClick={() => skifGruppe(gruppe)} aria-expanded={!lukket}>
                    <span className="fc-nav-gruppe">{GRUPPE_LABEL[gruppe]}</span>
                    <svg className={lukket ? "fc-chevron fc-chevron-lukket" : "fc-chevron"}
                         viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <div className={lukket ? "fc-nav-gruppe-punkter fc-lukket" : "fc-nav-gruppe-punkter"}>
                  {punkter.map((m) => {
                    const aktiv = hoved.key === m.key;
                    /* ⚠ TO GRUNDE TIL AT ET UNDERPUNKT IKKE TEGNES, OG DE ER IKKE
                       DEN SAMME. `skjulINav` er en detaljerute uden egen plads i
                       menuen (/booking/forslag/:id). `kraeverModul` er et punkt der
                       ligger under ET modul, men laeser EN ANDENS node — Enheder
                       under Opsaetning laeser `koeretoejer`, som er modulspaerret
                       paa `flaade` i reglerne. Opsaetning kan ikke fravaelges, saa
                       uden det led ville en kunde uden Fleet faa et menupunkt der
                       aabner en afvist laesning i sin egen opsaetning.
                       Ruten findes stadig — det er menuen der tier, ikke adgangen
                       der aendres. Se nav.js og moduler.js. */
                    /* ⚠ OG EN TREDJE GRUND — beslutning 105. `kraeverPerm` er et
                       punkt hvis EMNE er spærret for brugeren: efter beslutning 104
                       kræver ti noder en læse-permission, og en chauffør havde
                       **18 af 59 skærme** med mindst én afvist læsning. Menuen tier;
                       ruten findes uændret, og skærmen svarer med en afvisning hvis
                       man taster stien. Håndhævelsen ligger i reglerne. */
                    const born = synligeBorn(m);
                    const visBorn = aktiv && born.length > 1 && !modulLukket[m.key];
                    return (
                      <div key={m.key}>
                        <NavLink to={m.sti} end={m.sti === "/"} className={aktiv ? "fc-link fc-on" : "fc-link"}
                                 onClick={(e) => {
                                   /* Klik på et allerede-aktivt punkt med undermenu skal folde
                                      den sammen/ud igen, ikke bare navigere til sig selv. */
                                   if (aktiv && born.length > 1) {
                                     e.preventDefault();
                                     skifModul(m.key);
                                   }
                                 }}>
                          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={ICO[m.key]} />
                          </svg>
                          <span>{m.label}</span>
                          {born.length > 1 && (
                            <svg className={visBorn ? "fc-chevron" : "fc-chevron fc-chevron-lukket"}
                                 viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          )}
                        </NavLink>
                        {visBorn && (
                          <div className="fc-sub">
                            {born.map((b) => (
                              <NavLink key={b.key} to={b.sti} end
                                       className={modul.key === b.key ? "fc-sublink fc-on" : "fc-sublink"}>
                                {b.label}
                              </NavLink>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="fc-foot">
            <div className="fc-who">
              <div className="fc-av">{initialer}</div>
              <div className="fc-who-txt">
                <div className="fc-who-n">{bruger?.navn || "Ikke logget ind"}</div>
                <div className="fc-who-r">{bruger?.rolleLabel || bruger?.email || "—"}</div>
              </div>
            </div>
            {/* ⚠ KUN DEMO-MODE. Klientside-overstyringen af perms er
                meningsløs alle andre steder: perms kommer fra tokenets claims,
                og en klient kan ikke ændre sit eget token. Med en rigtig
                server ville den vise knapper serveren afviser.

                I demo er der ingen server at være uenig med, og at kunne vise
                platformen som en disponent er hele pointen med en demo.
                I dev afløser Brugervaelger den — se beslutning 28.
                saetDemoRolle er en no-op uden flaget; se FleetContext. */}
            {demo && (
              <div className="fc-demo-rolle">
                <label htmlFor="fc-rolle">Se platformen som</label>
                <select id="fc-rolle" value={demoRolle || bruger?.rolle || "admin"}
                        onChange={(e) => saetDemoRolle(e.target.value)}>
                  {DEMO_ROLLER.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <span>Ændrer kun hvad UI'et viser. Der er ingen server at spørge.</span>
              </div>
            )}

            {/* Dev skifter SESSION frem for visning. Det er den eneste måde at
                ændre perms på, fordi de står i tokenet.
                ⚠ devTester STYRER KUN OM SKIFTET SKER FJERNT (custom token
                via en Cloud Function) I STEDET FOR LOKALT (email+kode). Se
                Brugervaelger.jsx's eget hoved. */}
            {miljoe === "dev" && (
              <Brugervaelger email={bruger?.email} devTester={bruger?.devTester} />
            )}
            <button type="button" className="fc-side-btn" onClick={logUd}>Log ud</button>
          </div>
        </aside>

        <div className="fc-main">
          <header className="fc-top">
            <div className="fc-top-h">
              <h1>{modul.titel}</h1>
              <p>{modul.under}</p>
            </div>
            {/* ⚠ HER LÅ FIRMAVÆLGEREN, PERIODEVÆLGEREN OG "Opdateret 22.43".
                Alle tre er væk fra HVER side — ikke skjult pr. modul.

                De tre var shellens, og det var rigtigt: et modul må ikke eje
                dem. Men de var også de eneste tre kontroller i topbaren, og
                de stod på hver eneste skærm uden at nogen brugte dem:

                  Firmavælgeren  havde ÉN post uden for demo. Tenanten kommer
                                 fra tokenets claim — en vælger med ét valg
                                 er en kontrol der ligner et valg.
                  Periodevælgeren blev læst af useListe og af INGEN skærm som
                                 tekst. Perioden er der stadig; den står nu
                                 fast på sin standard i FleetContext.
                  Stemplet       sagde hvornår siden blev tegnet, ikke hvornår
                                 tallene blev aggregeret. To forskellige ting,
                                 ét klokkeslæt.

                ⚠ TILSTANDEN ER IKKE FJERNET. `dage`, `tenantId` og `periode`
                ligger stadig i FleetContext og driver stadig useListes
                vinduer. Det er KONTROLLERNE der er væk, ikke begrebet — og
                skal en periodevælger tilbage, hører den her i shellen igen,
                aldrig i et modul. */}
          </header>
          {/* ⚠ Suspense LIGGER HER, IKKE OM HELE RUTETRÆET.
              Skærmene hentes når de åbnes (beslutning 97), og React
              venter ved den NÆRMESTE grænse. Lå den om <Routes> i
              App.jsx, ville sidebaren, topbaren og periodevælgeren
              forsvinde og blive tegnet om ved hvert eneste skift — og
              en shell der blinker, føles som en app der genstarter.
              Her skiftes kun indholdsfeltet ud. */}
          <main className="fc-slot">
            <Suspense fallback={<div className="fc-empty">Henter skærmen …</div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </>
  );
}
