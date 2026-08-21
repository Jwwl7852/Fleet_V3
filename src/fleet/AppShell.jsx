/* src/fleet/AppShell.jsx
 * Layout-rute: sidebar + topbar + <Outlet/>.
 *
 * ⚠ TOPBAREN HAR INGEN KONTROLLER LÆNGERE. Firmavælgeren, periodevælgeren og
 * "Opdateret 22.43" er væk fra hver side — se noten nede ved <header>.
 * Reglen står ved magt: et modul må stadig ikke bygge sin egen sidebar,
 * tenant-vælger eller periodevælger. Skal en af dem tilbage, hører den HER.
 */
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useFleet, DEMO_ROLLER } from "./FleetContext.jsx";
import { findModul, findHovedmodul, NAV } from "./nav.js";
import { harModul } from "./moduler.js";
import Brugervaelger from "./Brugervaelger.jsx";
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

  return (
    <>
      <MiljoeBjaelke />
      <div className="fc-app">
        <aside className="fc-side">
          <div className="fc-brand">Fleet<b>Control</b></div>
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
                Se fleet/moduler.js. */}
            {NAV.filter((m) => harModul(moduler, m.key)).map((m) => {
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
              const born = (m.born || [])
                .filter((b) => !b.skjulINav)
                .filter((b) => !b.kraeverModul || harModul(moduler, b.kraeverModul));
              return (
                <div key={m.key}>
                  <NavLink to={m.sti} end={m.sti === "/"} className={aktiv ? "fc-link fc-on" : "fc-link"}>
                    <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={ICO[m.key]} />
                    </svg>
                    <span>{m.label}</span>
                  </NavLink>
                  {aktiv && born.length > 1 && (
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
                ændre perms på, fordi de står i tokenet. */}
            {miljoe === "dev" && <Brugervaelger email={bruger?.email} />}
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
          <main className="fc-slot"><Outlet /></main>
        </div>
      </div>
    </>
  );
}
