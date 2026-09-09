/* src/App.jsx
 * Alle ruter på ét sted. Rækkefølgen følger nav.js, så sidebar og ruter
 * ikke kan komme ud af sync.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { FleetProvider } from "./fleet/FleetContext.jsx";
import AppShell from "./fleet/AppShell.jsx";
import VeyroLogo from "./fleet/VeyroLogo.jsx";
import { REDIRECTS } from "./fleet/nav.js";
import { erAktiv, laasetekst, opbevaresTil } from "./fleet/abonnement.js";
import { dato } from "./fleet/format.js";
import { auth, db, demoMode, miljoe, hentBrugerContext } from "./firebase.js";

import { permStrengFraRolle } from "./fleet/permissions.js";
import Login from "./moduler/Login.jsx";
import DevTesterVaelger from "./moduler/DevTesterVaelger.jsx";

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMENE HENTES NÅR DE ÅBNES — beslutning 97
   ══════════════════════════════════════════════════════════════════════════

   Hver skærm stod som en almindelig import, og så lå de alle sammen i ét
   bundt: **1,59 MB, heraf 935 kB vores egen kode.** En vognmand med Fleet
   og Facility hentede Warehouses elleve skærme, Unitbookings fire,
   Procures syv og ejerkonsollen — hver gang han åbnede appen.

   Det er den samme sætning som beslutning 94 og 95 handler om, et lag
   længere ude: **en kunde skal ikke betale for et modul han ikke har.**
   Dér var det forespørgsler; her er det kilobytes over en mobilforbindelse
   i en lastbil.

   ⚠ `lazy()` KRÆVER ET DEFAULT-EKSPORT, og det har hver skærm. Får en fil
   et navngivet eksport i stedet, fejler den ikke ved build — den fejler når
   ruten åbnes. `test/rutedeling.test.mjs` holder de to ender sammen.

   ⚠ LOGIN ER IKKE DOVEN. Den er den første skærm en uautentificeret bruger
   ser, og et ekstra netværkskald før login ville vise en tom ramme dér hvor
   folk i forvejen er usikre på om de tastede rigtigt.
   ══════════════════════════════════════════════════════════════════════════ */
const Dashboard = lazy(() => import("./moduler/Dashboard.jsx"));
const BookingOversigt = lazy(() => import("./moduler/booking/Oversigt.jsx"));
const NyForespoergsel = lazy(() => import("./moduler/booking/NyForespoergsel.jsx"));
const Forslag = lazy(() => import("./moduler/booking/Forslag.jsx"));
const Disponering = lazy(() => import("./moduler/booking/Disponering.jsx"));
const LiveKort = lazy(() => import("./moduler/booking/LiveKort.jsx"));
const Bookingopsaetning = lazy(() => import("./moduler/booking/Bookingopsaetning.jsx"));
const PlanningV2Module = lazy(() => import("./moduler/booking/PlanningV2Module.jsx"));
const Bemanding = lazy(() => import("./moduler/Bemanding.jsx"));
const Medarbejdere = lazy(() => import("./moduler/Medarbejdere.jsx"));
const Kompetencer = lazy(() => import("./moduler/Kompetencer.jsx"));
const Fravaer = lazy(() => import("./moduler/Fravaer.jsx"));
const FlaadeOversigt = lazy(() => import("./moduler/flaade/Oversigt.jsx"));
const FlaadeOverblik = lazy(() => import("./moduler/flaade/Overblik.jsx"));
const Vaerkstedskalender = lazy(() => import("./moduler/flaade/Vaerkstedskalender.jsx"));
const Indberetninger = lazy(() => import("./moduler/flaade/Indberetninger.jsx"));
const Arbejdskoe = lazy(() => import("./moduler/flaade/Arbejdskoe.jsx"));
const Servicebog = lazy(() => import("./moduler/flaade/Servicebog.jsx"));
const FlaadeStatistik = lazy(() => import("./moduler/flaade/Statistik.jsx"));
const FlaadeKontakter = lazy(() => import("./moduler/flaade/Kontakter.jsx"));
const FleetV2Module = lazy(() => import("./moduler/flaade/FleetV2Module.jsx"));
const FacilityOversigt = lazy(() => import("./moduler/facility/Oversigt.jsx"));
const Servicekalender = lazy(() => import("./moduler/facility/Servicekalender.jsx"));
const FacilityInventar = lazy(() => import("./moduler/facility/Inventar.jsx"));
const FacilityPlanlagt = lazy(() => import("./moduler/facility/Planlagt.jsx"));
const FacilityStatistik = lazy(() => import("./moduler/facility/Statistik.jsx"));
const Klima = lazy(() => import("./moduler/facility/Klima.jsx"));
const FacilityV2Module = lazy(() => import("./moduler/facility/FacilityV2Module.jsx"));
const IndkoebOversigt = lazy(() => import("./moduler/indkoeb/Oversigt.jsx"));
const Bestillinger = lazy(() => import("./moduler/indkoeb/Bestillinger.jsx"));
const IndkoebVarer = lazy(() => import("./moduler/indkoeb/Varer.jsx"));
const IndkoebArkiv = lazy(() => import("./moduler/indkoeb/Arkiv.jsx"));
const IndkoebStatistik = lazy(() => import("./moduler/indkoeb/Statistik.jsx"));
const Varelager = lazy(() => import("./moduler/indkoeb/Varelager.jsx"));
const Fakturaer = lazy(() => import("./moduler/indkoeb/Fakturaer.jsx"));
const Leverandoerer = lazy(() => import("./moduler/indkoeb/Leverandoerer.jsx"));
const ProcureGodkendelsesregler = lazy(() => import("./moduler/opsaetning/ProcureGodkendelsesregler.jsx"));
const UnitbookingKasser = lazy(() => import("./moduler/unitbooking/Kasser.jsx"));
const Reolpladser = lazy(() => import("./moduler/unitbooking/Reolpladser.jsx"));
const Kasseudlaan = lazy(() => import("./moduler/unitbooking/Udlaan.jsx"));
const Unitbookingkalender = lazy(() => import("./moduler/unitbooking/Kalender.jsx"));
const Unitbookinghistorik = lazy(() => import("./moduler/unitbooking/Historik.jsx"));
const Wmsvarer = lazy(() => import("./moduler/warehouse/Varer.jsx"));
const Wmslokationer = lazy(() => import("./moduler/warehouse/Lokationer.jsx"));
const Wmsbevaegelser = lazy(() => import("./moduler/warehouse/Bevaegelser.jsx"));
const Wmspluk = lazy(() => import("./moduler/warehouse/Pluk.jsx"));
const Wmsoptaelling = lazy(() => import("./moduler/warehouse/Optaelling.jsx"));
const Wmscarriers = lazy(() => import("./moduler/warehouse/Carriers.jsx"));
const Wmslabels = lazy(() => import("./moduler/warehouse/Transportlabels.jsx"));
const Wmsmodtagelse = lazy(() => import("./moduler/warehouse/Modtagelse.jsx"));
const Wmsafregning = lazy(() => import("./moduler/warehouse/Afregning.jsx"));
const Wmssporbarhed = lazy(() => import("./moduler/warehouse/Sporbarhed.jsx"));
const Wmsvolumen = lazy(() => import("./moduler/warehouse/Volumen.jsx"));
const Standardpriser = lazy(() => import("./moduler/kunder/Standardpriser.jsx"));
const Kundepriser = lazy(() => import("./moduler/kunder/Kundepriser.jsx"));
const Kunder = lazy(() => import("./moduler/Kunder.jsx"));
const Oekonomi = lazy(() => import("./moduler/Oekonomi.jsx"));
const Fakturacenter = lazy(() => import("./moduler/oekonomi/Fakturacenter.jsx"));
const Fakturering = lazy(() => import("./moduler/Fakturering.jsx"));
const Generelt = lazy(() => import("./moduler/opsaetning/Generelt.jsx"));
const Brugere = lazy(() => import("./moduler/opsaetning/Brugere.jsx"));
const Integrationer = lazy(() => import("./moduler/opsaetning/Integrationer.jsx"));
const Hjaelp = lazy(() => import("./moduler/support/Hjaelp.jsx"));
const Supportoverblik = lazy(() => import("./moduler/support/Overblik.jsx"));
const Supportsag = lazy(() => import("./moduler/support/Sag.jsx"));
const Konsol = lazy(() => import("./moduler/udbyder/Konsol.jsx"));
const Prisliste = lazy(() => import("./moduler/udbyder/Prisliste.jsx"));
/* Chaufførappen — beslutning 103. Doven som resten: en telefon på en
   landevej skal ikke hente 55 kontorskærme for at melde afgang. */
const AppForside = lazy(() => import("./moduler/app/Forside.jsx"));
/* ⚠ Turplan AFLØSER MinTur — beslutning 110. MinTur viste etaperne og
   meldingerne, fordi stoppene ikke fandtes som model. Nu gør de, og
   meldingerne ligger dér hvor de hører til: på stoppet. */
const Turplan = lazy(() => import("./moduler/app/Turplan.jsx"));
const AppIndberetning = lazy(() => import("./moduler/app/Indberetning.jsx"));
const AppTid = lazy(() => import("./moduler/app/Timeregistrering.jsx"));
const AppFrihed = lazy(() => import("./moduler/app/Frihed.jsx"));
/* Leverandørportalen — tillægskrav "EXTERNAL SUPPLIER / VÆRKSTEDSPORTAL".
   Samme dovenhedsdisciplin: en ekstern leverandørbruger skal ikke hente
   kontorprogrammets øvrige bundt for at se sine egne opgaver. */
const LeverandoerLogin = lazy(() => import("./moduler/leverandoerportal/LeverandoerLogin.jsx"));
const LeverandoerPortal = lazy(() => import("./moduler/leverandoerportal/LeverandoerPortal.jsx"));


/* ⚠ KUN TIL DEMO-MODE. Uden database findes der ingen tenant at hente, og
   sidebaren skal stadig kunne skrive et navn. I dev og produktion kommer
   navnet fra tenants/<id>/virksomhed — se noten i App(). */
const DEMO_TENANT = { id: "demo", navn: "DEMO Transport ApS", kort: "DEMO Transport" };

/* perms udledes af rollen via presettet — den skrives ikke i hånden her.
   Ellers ville demo-brugeren kunne have en anden adgang end en rigtig admin,
   og så tester man noget andet end det man leverer. */
const DEMO_BRUGER = {
  uid: "demo", navn: "Dennis Christensen", email: "dch@fleetcontrol.dk",
  rolle: "admin", rolleLabel: "Administrator", tenant: "demo",
  perms: permStrengFraRolle("admin"),
};

/**
 * Rammen om ejerkonsollen.
 *
 * ⚠ IKKE AppShell. Shellen ejer sidebar, tenant-vælger og periodevælger, og
 * alle tre hører til en KUNDEKONTEKST. En ejer står ikke i en — han har ingen
 * tenant. En sidebar med kundens moduler ville desuden antyde at han kunne
 * klikke sig ind i dem, og det kan han ikke: reglerne kender kun hans claim,
 * og det rækker til tre noder pr. kunde.
 */
function Udbyderramme({ bruger, logUd, children }) {
  return (
    <div className="fc-app fc-udbyder">
      <header className="fc-top">
        <div className="fc-med-ikon" style={{ gap: 12 }}>
          <VeyroLogo variant="header" />
          <span className="fc-hint">Ejerkonsol</span>
        </div>
        <div className="fc-med-ikon" style={{ gap: 12 }}>
          <span className="fc-hint">{bruger?.email}</span>
          <button type="button" className="fc-btn" onClick={logUd}>Log ud</button>
        </div>
      </header>
      <main className="fc-slot">{children}</main>
    </div>
  );
}

/**
 * Låseskærmen. Vises når kundens abonnement ikke er aktivt.
 *
 * ⚠ DEN SPÆRRER INGENTING. Spærringen står i `firebase.rules.json`, hvor hver
 * eneste regel under tenanten kræver `status === 'aktiv'` — prøvet mod den
 * udrullede base, ikke kun mod filen. Skærmen her er FORKLARINGEN.
 *
 * Uden den ville en lukket kunde se shellen fyldt med "adgang nægtet", og det
 * er sandt men ubrugeligt: det ligner et system i stykker, og så ringer han
 * og siger at FleetControl er nede. Reglerne holder tre noder læsbare netop
 * for at den her skærm kan skrive hvem han er og hvorfor han er lukket.
 *
 * ⚠ INGEN "PRØV IGEN"-KNAP. Der er intet at prøve igen — det er ikke en fejl,
 * og en knap der ikke kan virke, lærer brugeren at systemet er upålideligt.
 * Der er en vej UD (log ud) og en vej VIDERE (kontakt os).
 */
function Abonnementslaas({ abonnement, virksomhed, paaLogUd }) {
  const t = laasetekst(abonnement);
  const til = opbevaresTil(abonnement);
  return (
    <div className="fc-boot">
      <div className="fc-login">
        <VeyroLogo variant="login" />
        <div className="fc-empty fc-empty-info">
          <p><b>{virksomhed?.navn || "Din virksomhed"}</b></p>
          <p style={{ marginTop: 8 }}><b>{t.besked}</b></p>
          {/* ⚠ "TIDLIGST", IKKE "DEN". Der slettes intet automatisk, og en
              skærm der lovede en sletning der ikke findes, ville være samme
              slags løgn som at kalde en afvist læsning for en netværksfejl.
              Se OPBEVARING_DAGE i abonnement.js. */}
          {til && (
            <p className="fc-hint" style={{ marginTop: 8 }}>
              Data er <b>ikke slettet</b> og slettes tidligst <b>{dato(til)}</b>.
            </p>
          )}
          <p className="fc-hint" style={{ marginTop: 8 }}>{t.naeste}</p>
        </div>
        <button type="button" className="fc-btn" onClick={paaLogUd} style={{ marginTop: 14 }}>
          Log ud
        </button>
      </div>
    </div>
  );
}

/* Gemmer hvor man var på vej hen, så et dybt link ikke koster en ekstra
   navigation efter login. */
/**
 * En redirect der bærer sine parametre med.
 *
 * ⚠ <Navigate to="/opsaetning/aftalepriser"> VILLE TABE KUNDE-ID'ET.
 * `/kunder/aftalepriser/:kundeId` peger på ÉN kundes priser, og et link
 * uden parameteren lander på den tomme oversigt. Fejlen ville se ud som et
 * forældet link frem for en redirect der tabte noget — og det er den slags
 * forskel ingen kan se på skærmen.
 *
 * Målet bygges af de SAMME parametre som stien matchede med, så
 * REDIRECTS kan skrive `:kundeId` i begge ender og betyde det samme.
 */
function Videresend({ til }) {
  const params = useParams();
  const maal = til
    .split("/")
    .map((del) => (del.startsWith(":") ? params[del.slice(1)] : del))
    .join("/");
  return <Navigate to={maal} replace />;
}
function TilLogin() {
  const l = useLocation();
  return <Navigate to="/login" replace state={{ fra: l.pathname + l.search }} />;
}

/* Er man logget ind og lander på /login — typisk lige efter et login — så
   videre til det man kom fra. */
function EfterLogin() {
  const l = useLocation();
  return <Navigate to={l.state?.fra || "/"} replace />;
}

/**
 * Rammen om chaufførappen — beslutning 103.
 *
 * ⚠ IKKE AppShell, af samme grund som Udbyderramme ikke er det. Shellen ejer
 * sidebar, tenant-vælger og periodevælger, og alle tre er forkerte her: en
 * chauffør har seks permissions, så elleve af tolv menupunkter ville føre til
 * en afvist læsning, og han har ét tidsrum — i dag og i morgen.
 *
 * ⚠ MEN ADGANGSVEJEN ER DEN SAMME. Ruten ligger inde i `harAdgang`, som
 * uændret kræver et tenant-claim. Der er ingen chaufførvariant af spærringen,
 * og reglerne kender ikke rammen — kun tokenet. Rammen afgør hvad der TEGNES.
 */
function Chauffoerramme({ bruger, tenant, logUd, children }) {
  return (
    <div className="fc-app fc-chauffoer">
      <header className="fc-top">
        {/* ⚠ FIRMANAVNET STÅR UNDER MÆRKET. En chauffør kan køre for to
            vognmænd og have to konti; uden navnet kan han ikke se hvilken
            han er logget ind i, og en melding lander det forkerte sted. */}
        <div>
          <VeyroLogo variant="header" />
          {tenant?.kort && <span className="fc-app-tenant">{tenant.kort}</span>}
        </div>
        <div className="fc-med-ikon" style={{ gap: 12 }}>
          <span className="fc-hint">{bruger?.navn || bruger?.email}</span>
          <button type="button" className="fc-btn" onClick={logUd}>Log ud</button>
        </div>
      </header>
      <main className="fc-main fc-app-main">{children}</main>
    </div>
  );
}

/**
 * Rammen om leverandørportalen — tillægskrav "EXTERNAL SUPPLIER /
 * VÆRKSTEDSPORTAL".
 *
 * ⚠ IKKE AppShell, IKKE Chauffoerramme — sin egen, af samme grund som
 * Chauffoerramme ikke er AppShell: sidebar, tenant-vælger og periodevælger
 * giver ingen mening for en bruger der ikke er en del af kundens
 * organisation.
 *
 * ⚠ INGEN FIRMANAVN-VISNING HER, MODSAT Chauffoerramme. Hvilken kunde
 * (tenant) og hvilken leverandør en session hører til, kommer fra
 * `leverandoerPortalTenanter()` — et Cloud Function-kald `LeverandoerPortal`
 * selv laver, ikke noget App.jsx kan slå op før ruten overhovedet tegnes.
 * En ekstern bruger med ét grant ser det stadig i selve skærmen; rammen her
 * er bevidst holdt uafhængig af den data.
 */
function Leverandoerramme({ bruger, logUd, children }) {
  return (
    <div className="fc-app fc-chauffoer">
      <header className="fc-top">
        <div>
          <VeyroLogo variant="header" />
          <span className="fc-app-tenant">Leverandørportal</span>
        </div>
        <div className="fc-med-ikon" style={{ gap: 12 }}>
          <span className="fc-hint">{bruger?.navn || bruger?.email}</span>
          <button type="button" className="fc-btn" onClick={logUd}>Log ud</button>
        </div>
      </header>
      <main className="fc-main fc-app-main">{children}</main>
    </div>
  );
}

export default function App() {
  const [bruger, setBruger] = useState(demoMode ? DEMO_BRUGER : null);
  const [klar, setKlar] = useState(demoMode);
  /**
   * ⚠ TENANTEN KOMMER FRA BRUGERENS CLAIM, IKKE FRA EN KONSTANT.
   *
   * TENANTS var hardkodet til ét element, og så hed hver eneste kunde "DEMO
   * Transport ApS" i sidebaren. Navnet ligger nu i tenants/<id>/virksomhed —
   * ét sted, som kunden selv læser og udbyderen kan vise i en kundeliste.
   *
   * Der hentes KUN den tenant claim'et peger på. Der findes ingen liste at
   * vælge fra: reglerne sammenligner auth.token.tenant === $tenantId, så en
   * vælger kunne alligevel ikke skifte noget. Skal man se en anden kunde,
   * logger man ind som en bruger der hører til den — beslutning 28's model,
   * nu med to rigtige tenants at prøve den på.
   */
  const [virksomhed, setVirksomhed] = useState(null);
  const [moduler, setModuler] = useState(null);
  /**
   * Abonnementet.
   *
   * ⚠ TRE TILSTANDE, IKKE TO. `undefined` er "ikke læst endnu" og `null` er
   * "læst, og der er ingen node" — som betyder AKTIV, præcis som reglerne
   * behandler den (se erAktiv() i abonnement.js). Blandede vi de to, ville
   * en lukket kunde se shellen i et halvt sekund før låseskærmen kom, og et
   * glimt af noget man ikke må se, er ikke en detalje.
   */
  const [abonnement, setAbonnement] = useState(demoMode ? null : undefined);

  useEffect(() => {
    if (demoMode || !auth) return;
    return auth.onAuthStateChanged(async (u) => {
      setBruger(u ? await hentBrugerContext(u) : null);
      setKlar(true);
    });
  }, []);

  useEffect(() => {
    const t = bruger?.tenant;
    if (demoMode || !db || !t) { setVirksomhed(null); setModuler(null); setAbonnement(null); return; }
    setAbonnement(undefined);
    let aktiv = true;
    (async () => {
      try {
        /* ⚠ DE TRE NODER DER BLIVER LÆSBARE NÅR ALT ANDET LUKKER. Det er med
           vilje netop dem: uden virksomhed kan låseskærmen ikke skrive
           kundens navn, og uden abonnement kan den ikke sige hvorfor. En
           spærring der ikke kan forklare sig selv, ligner en fejl. */
        const [v, m, a] = await Promise.all([
          db.ref(`tenants/${t}/virksomhed`).once("value"),
          db.ref(`tenants/${t}/moduler`).once("value"),
          db.ref(`tenants/${t}/abonnement`).once("value"),
        ]);
        if (!aktiv) return;
        setVirksomhed(v.val());
        /* null = "ved ikke endnu". harModul() behandler det som ALT — en
           betalende kunde med tom sidebar er værre end en salgsflade der
           står åben. Se noten i moduler.js om hvorfor den fejler åbent. */
        setModuler(m.val());
        setAbonnement(a.val());
      } catch {
        /* En afvist eller fejlet læsning må ikke tømme menuen. Kunden er
           logget korrekt ind; det er os der ikke kunne svare. */
        if (aktiv) { setVirksomhed(null); setModuler(null); setAbonnement(null); }
      }
    })();
    return () => { aktiv = false; };
  }, [bruger?.tenant]);

  if (!klar) return <div className="fc-boot">Henter…</div>;

  /**
   * ⚠ LEVERANDØRPORTALEN — SIDEORDNET MED ALT ANDET, AFGJORT FØR harAdgang.
   *
   * En ekstern leverandørbruger bærer INTET {tenant, rolle, perms}-claim
   * overhovedet (se functions/index.js's leverandoerPortalInviter) —
   * `harAdgang` ville derfor ALTID være falsk for ham, og uden denne gren
   * ville han enten lande på /login's "uprovisioneret"-dødvande (forkert
   * besked for hans situation, se LeverandoerLogin.jsx's egen note) eller,
   * hvis han ikke er logget ind endnu, på den interne Login.jsx.
   *
   * ⚠ SIKKERHEDEN LIGGER 100% SERVER-SIDE, IKKE HER. Denne gren afgør kun
   * hvad der TEGNES — samme figur som `erUdbyder`/`erChauffoer` nedenfor.
   * Hver eneste portal-Cloud-Function slår selv sit grant op fra det
   * verificerede `auth.uid` (kraevLeverandoerGrant); en klient der lander
   * her uden noget grant, ser blot en tom "ingen adgang"-besked fra
   * LeverandoerPortal.jsx, aldrig andres data.
   *
   * ⚠ FØR harAdgang, IKKE EN UDVIDELSE AF DEN. Bevidst placeret her — før
   * FleetProvider/tenantListe overhovedet bygges — så en ekstern brugers
   * manglende tenant aldrig får FleetProvider til stille at falde tilbage
   * på en gættet tenant (se FleetContext.jsx). Portalen bruger ikke
   * useFleet() og har derfor ikke brug for den kontekst.
   */
  if (window.location.pathname.startsWith("/leverandoerportal")) {
    return (
      <BrowserRouter>
        {!bruger ? (
          <Routes>
            <Route path="/leverandoerportal/login" element={<LeverandoerLogin />} />
            <Route path="*" element={<Navigate to="/leverandoerportal/login" replace />} />
          </Routes>
        ) : (
          <Leverandoerramme bruger={bruger} logUd={() => auth?.signOut()}>
            <Suspense fallback={<div className="fc-empty">Henter …</div>}>
              <Routes>
                <Route path="/leverandoerportal" element={<LeverandoerPortal logUd={() => auth?.signOut()} />} />
                <Route path="*" element={<Navigate to="/leverandoerportal" replace />} />
              </Routes>
            </Suspense>
          </Leverandoerramme>
        )}
      </BrowserRouter>
    );
  }

  /**
   * ⚠ MILJØUAFHÆNGIG. RØR IKKE DEN BETINGELSE.
   *
   * Adgang kræver et tenant-claim — ikke "en bruger", og ikke "ikke
   * produktion". En bruger uden claim må ingenting (se hentBrugerContext:
   * perms er tom streng, ikke udledt af rollen), så at lukke den ind i
   * shellen ville give en app hvor hver eneste læsning bliver afvist.
   *
   * Der er med vilje ikke en dev-variant og en prod-variant af den her gren.
   * Det er præcis den slags forskel der får en spærring til at gælde alle
   * andre steder end dér hvor den betyder noget. Den eneste tilbageværende
   * miljøafhængighed i adgangsvejen er om brugervælgeren TEGNES.
   */
  const harAdgang = Boolean(bruger?.tenant);

  /**
   * Ejerkonsollen — beslutning 35.
   *
   * ⚠ SIDEORDNET, IKKE EN UDVIDELSE. `harAdgang` er ikke løsnet, og må ikke
   * blive det. En ejerkonto har INGEN tenant, kan derfor ikke nå kundeshellen,
   * og reglerne sammenligner `auth.token.tenant === $tenantId` — så den kan
   * ikke læse én eneste kundes data uanset hvad klienten sender.
   *
   * ⚠ DEN HER LINJE GIVER INGEN ADGANG. Claim'et kommer fra tokenet, og en
   * klient kan ikke ændre sit eget. De fire ejerfunktioner tjekker det SAMME
   * claim server-side som det første de gør. Linjen afgør kun om konsollen
   * TEGNES — som `rolleskifte` i demo (beslutning 28).
   */
  const erUdbyder = bruger?.udbyder === true;

  /**
   * ⚠ CHAUFFØREN MÅ KUN NÅ /app — beslutning 117.
   *
   * `harAdgang` løses stadig ikke op: en chauffør har fortsat et
   * tenant-claim og kan læse det hans seks permissions tillader. Det her
   * afgør kun hvad der TEGNES, som `erUdbyder` gør for konsollen — reglerne
   * kender ikke rollen, kun claims og permissions.
   *
   * ⚠ RETTET PÅ ROLLEN, IKKE PÅ EN SKÆRM. `Chauffoerramme` var allerede
   * sideordnet AppShell — men intet forhindrede en chauffør i at NAVIGERE
   * til en AppShell-rute selv. De fleste læsninger ville blive afvist
   * (BASIS_LAES + indberetningerSkriv er hele hans sæt), men en afvist
   * læsning er ikke det samme som en spærret dør — skærmen ville stå der,
   * delvist tom, i stedet for slet ikke at findes for ham.
   */
  const erChauffoer = bruger?.rolle === "chauffoer";

  /* ⚠ EJEREN KOMMER FØRST. En konto der er begge dele — det sker i dev — skal
     lande i konsollen, ikke i sin egen tenant. Ellers ville man skulle logge
     ud for at komme til den, og så ville nogen give ejerkontoen en tenant
     for at slippe. */
  if (erUdbyder) {
    return (
      <BrowserRouter>
        <Udbyderramme bruger={bruger} logUd={() => auth?.signOut()}>
          <Suspense fallback={<div className="fc-empty">Henter skærmen …</div>}>
          <Routes>
            <Route path="/main" element={<Konsol bruger={bruger} />} />
            <Route path="/main/priser" element={<Prisliste />} />
            <Route path="*" element={<Navigate to="/main" replace />} />
          </Routes>
          </Suspense>
        </Udbyderramme>
      </BrowserRouter>
    );
  }

  /* ⚠ EN REN DEV-TESTER (devTester, INGEN TENANT) VÆLGER ROLLE HER — FØR
     harAdgang. Kontoen har med vilje ingen tenant af sin egen, se
     scripts/dev-tester.mjs og DevTesterVaelger.jsx's eget hoved. Uden den
     her gren ville harAdgang være falsk, og /login's "uprovisioneret"-skærm
     ville spærre kontoen permanent — den bliver aldrig provisioneret, det
     er ikke meningen med den. */
  if (bruger?.devTester && !bruger?.tenant) {
    return <DevTesterVaelger bruger={bruger} logUd={() => auth?.signOut()} />;
  }

  /* Stamdataene er ikke læst endnu. Uden den her ville en lukket kunde se
     shellen i et glimt, før låseskærmen nåede frem. */
  if (harAdgang && abonnement === undefined) return <div className="fc-boot">Henter…</div>;

  /* ⚠ FORKLARINGEN, IKKE SPÆRRINGEN. Reglerne afviser allerede hver læsning;
     det her er kun det brugeren får at se i stedet for tredive fejlbeskeder.
     Se noten på Abonnementslaas. */
  if (harAdgang && !erAktiv(abonnement)) {
    return <Abonnementslaas abonnement={abonnement} virksomhed={virksomhed}
                            paaLogUd={() => auth?.signOut()} />;
  }

  /* Én tenant — den claim'et peger på. Navnet kommer fra basen; falder
     læsningen ud, bruges tenant-id'et, så sidebaren aldrig står tom. */
  const tenantListe = demoMode
    ? [DEMO_TENANT]
    : bruger?.tenant
      ? [{
          id: bruger.tenant,
          navn: virksomhed?.navn || bruger.tenant,
          kort: virksomhed?.navn || bruger.tenant,
        }]
      : [];

  return (
    /* rolleskifte er nu KUN demo. Klientside-overstyringen af perms er
       meningsløs alle andre steder: claims kommer fra tokenet, og klienten
       kan ikke ændre sit eget token. I dev skifter man bruger i stedet — se
       Brugervaelger og beslutning 28. */
    <FleetProvider tenants={tenantListe} moduler={moduler} bruger={bruger}
                   rolleskifte={miljoe === "demo"}
                   logUd={() => auth?.signOut()}>
      <BrowserRouter>
        {/* ⚠ INGEN Suspense HER. Den ligger i AppShell om indholdsfeltet,
            så sidebaren ikke blinker ved hvert skærmskift — se noten dér.
            Login-ruten er derfor IKKE doven: uden en grænse omkring sig
            ville en doven Login vise et tomt vindue. Beslutning 97. */}
        <Routes>
          {!harAdgang && (
            <>
              {/* Logget ind uden tenant-claim er en ANDEN fejl end forkert
                  kode, og skærmen siger noget andet. Se Login.jsx. */}
              <Route path="/login" element={<Login uprovisioneret={Boolean(bruger)} />} />
              <Route path="*" element={<TilLogin />} />
            </>
          )}
          {harAdgang && <Route path="/login" element={<EfterLogin />} />}
          {/* ⚠ SIDEORDNET MED SHELLEN, ikke under den. Se Chauffoerramme.
              Suspense ligger i AppShell om <Outlet/>, og den her rute er
              udenfor — derfor sin egen grænse, ellers ville en doven Turplan
              vise et tomt vindue. Beslutning 97 og 103.

              ⚠ FORTSAT ÅBEN FOR ENHVER MED ADGANG — RØR IKKE DEN BETINGELSE.
              En anden rolle der navigerer hertil i hånden, skal stadig kunne
              se den; se test/chaufforadgang.test.mjs. Den fejl der gjorde at
              ALLE roller endte her efter et rolleskifte, lå ikke i den her
              rute — den lå i et gammelt "fra"-genstartspunkt, rettet i
              DevTesterVaelger.jsx. */}
          {harAdgang && (
            <Route path="/app/*" element={(
              <Chauffoerramme bruger={bruger} tenant={tenantListe[0]} logUd={() => auth?.signOut()}>
                <Suspense fallback={<div className="fc-empty">Henter dine ture …</div>}>
                  <Routes>
                    <Route index element={<AppForside />} />
                    <Route path="tur" element={<Turplan />} />
                    <Route path="tid" element={<AppTid />} />
                    <Route path="frihed" element={<AppFrihed />} />
                    <Route path="indberetning" element={<AppIndberetning />} />
                    <Route path="*" element={<Navigate to="/app" replace />} />
                  </Routes>
                </Suspense>
              </Chauffoerramme>
            )} />
          )}
          {/* ⚠ !erChauffoer — beslutning 117. En chauffør skal kun nå /app;
              se noten ved erChauffoer ovenfor. */}
          {harAdgang && !erChauffoer && (
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />

            <Route path="booking" element={<BookingOversigt />} />
            <Route path="booking/ny" element={<NyForespoergsel />} />
            <Route path="booking/forslag/:id" element={<Forslag />} />
            <Route path="booking/disponering" element={<Disponering />} />
            <Route path="booking/live-kort" element={<LiveKort />} />
            <Route path="booking/opsaetning" element={<Bookingopsaetning />} />

            {/* Det sikrede PLANNING-checkpoint er monteret på et nyt prefix.
                De eksisterende /booking-ruter bevares ovenfor, mens den
                fælles AppShell ejer navigation, logo, auth og temakilde. */}
            <Route path="planning-v2/*" element={<PlanningV2Module />} />

            <Route path="bemanding" element={<Bemanding />} />
            <Route path="bemanding/kompetencer" element={<Kompetencer />} />
            <Route path="bemanding/fravaer" element={<Fravaer />} />

            {/* ⚠ OVERBLIK ER FLEETS FORSIDE (Fleet TARGET, produktejer-review
                2026-09-01) — IKKE LÆNGERE DRIFTSKALENDEREN. Se
                fleet/modulfaner.js. Driftskalenderen flyttede til sin egen
                rute; /flaade/vaerksted er stadig en redirect i REDIRECTS,
                nu til /flaade/driftskalender. Enheder ligger fortsat under
                Opsaetning — se nav.js — men vises også som en fane i Fleets
                egen modulnavigation. */}
            <Route path="flaade" element={<FlaadeOverblik />} />
            <Route path="flaade/driftskalender" element={<Vaerkstedskalender />} />
            <Route path="flaade/indberetninger" element={<Indberetninger />} />
            <Route path="flaade/koe" element={<Arbejdskoe />} />
            <Route path="flaade/servicebog" element={<Servicebog />} />
            <Route path="flaade/statistik" element={<FlaadeStatistik />} />
            <Route path="flaade/kontakter" element={<FlaadeKontakter />} />

            {/* Det sikrede FLEET v2-checkpoint monteres på et nyt prefix, så
                de eksisterende /flaade-ruter og gamle dybe links bevares. */}
            <Route path="fleet-v2" element={<FleetV2Module />} />
            <Route path="fleet-v2/enheder" element={<FleetV2Module />} />
            <Route path="fleet-v2/enheder/:id" element={<FleetV2Module />} />
            <Route path="fleet-v2/indberetninger" element={<FleetV2Module />} />
            <Route path="fleet-v2/indberetninger/ny" element={<FleetV2Module />} />
            <Route path="fleet-v2/arbejdsko" element={<FleetV2Module />} />
            <Route path="fleet-v2/vaerksted" element={<FleetV2Module />} />
            <Route path="fleet-v2/service" element={<FleetV2Module />} />
            <Route path="fleet-v2/dokumenter" element={<FleetV2Module />} />
            <Route path="fleet-v2/leasing" element={<FleetV2Module />} />
            <Route path="fleet-v2/livekort" element={<FleetV2Module />} />
            <Route path="fleet-v2/mobil" element={<FleetV2Module />} />
            <Route path="fleet-v2/oekonomi" element={<FleetV2Module />} />
            <Route path="fleet-v2/sager/:id" element={<FleetV2Module />} />
            <Route path="fleet-v2/*" element={<FleetV2Module />} />

            {/* FACILITY v2 bruger samme AppShell og React Router som resten
                af platformen. Det nye prefix bevarer de ældre /facility-
                ruter, mens modulets egen kode fortsat kan bygges alene. */}
            <Route path="facility-v2/*" element={<FacilityV2Module />} />

            <Route path="facility" element={<FacilityOversigt />} />
            <Route path="facility/servicekalender" element={<Servicekalender />} />
            <Route path="facility/inventar" element={<FacilityInventar />} />
            <Route path="facility/planlagt" element={<FacilityPlanlagt />} />
            <Route path="facility/statistik" element={<FacilityStatistik />} />
            <Route path="facility/klima" element={<Klima />} />

            <Route path="indkoeb" element={<IndkoebOversigt />} />
            <Route path="indkoeb/bestillinger" element={<Bestillinger />} />
            <Route path="indkoeb/varer" element={<IndkoebVarer />} />
            <Route path="indkoeb/arkiv" element={<IndkoebArkiv />} />
            <Route path="indkoeb/statistik" element={<IndkoebStatistik />} />
            <Route path="indkoeb/fakturaer" element={<Fakturaer />} />
            <Route path="indkoeb/leverandoerer" element={<Leverandoerer />} />
            <Route path="indkoeb/varelager" element={<Varelager />} />

            {/* Kalenderen er modulets forside; kasselisten er stamdata og
                ligger under Opsaetning. Se nav.js og REDIRECTS. */}
            <Route path="unitbooking" element={<Unitbookingkalender />} />
            <Route path="unitbooking/udlaan" element={<Kasseudlaan />} />
            <Route path="opsaetning/kasser" element={<UnitbookingKasser />} />
            <Route path="unitbooking/historik" element={<Unitbookinghistorik />} />
            <Route path="unitbooking/reolpladser" element={<Reolpladser />} />
            <Route path="warehouse" element={<Wmsvarer />} />
            <Route path="warehouse/lokationer" element={<Wmslokationer />} />
            <Route path="warehouse/bevaegelser" element={<Wmsbevaegelser />} />
            <Route path="warehouse/pluk" element={<Wmspluk />} />
            <Route path="warehouse/optaelling" element={<Wmsoptaelling />} />
            <Route path="warehouse/carriers" element={<Wmscarriers />} />
            <Route path="warehouse/labels" element={<Wmslabels />} />
            <Route path="warehouse/modtagelse" element={<Wmsmodtagelse />} />
            <Route path="warehouse/afregning" element={<Wmsafregning />} />
            <Route path="warehouse/sporbarhed" element={<Wmssporbarhed />} />
            <Route path="warehouse/volumen" element={<Wmsvolumen />} />


            <Route path="oekonomi" element={<Oekonomi />} />
            <Route path="oekonomi/fakturacenter" element={<Fakturacenter />} />
            <Route path="oekonomi/fakturering" element={<Fakturering />} />

            <Route path="support" element={<Hjaelp />} />
            <Route path="support/overblik" element={<Supportoverblik />} />
            <Route path="support/sag/:id" element={<Supportsag />} />

            <Route path="opsaetning" element={<Generelt />} />
            {/* Enhedskartoteket. Komponenten bliver liggende i moduler/flaade/,
                fordi modulnoeglen, noden og permissionen alle hedder flaade —
                det er MENUPLADSEN der flyttede, ikke ejerskabet. */}
            <Route path="opsaetning/enheder" element={<FlaadeOversigt />} />
            {/* ⚠ STAMDATA. Komponenterne bliver liggende i moduler/ og
                moduler/kunder/, fordi modulnoeglerne, noderne og
                permissionerne er uaendrede — det er MENUPLADSEN der
                flyttede, ikke ejerskabet. De gamle stier lever videre som
                REDIRECTS. */}
            <Route path="opsaetning/medarbejdere" element={<Medarbejdere />} />
            <Route path="opsaetning/kunder" element={<Kunder />} />
            <Route path="opsaetning/priser" element={<Standardpriser />} />
            <Route path="opsaetning/aftalepriser" element={<Kundepriser />} />
            <Route path="opsaetning/aftalepriser/:kundeId" element={<Kundepriser />} />
            <Route path="opsaetning/brugere" element={<Brugere />} />
            <Route path="opsaetning/integrationer" element={<Integrationer />} />
            <Route path="opsaetning/procure/godkendelsesregler" element={<ProcureGodkendelsesregler />} />

            {/* v1.4-stier holdes i live, så gamle links og bogmærker virker */}
            {REDIRECTS.map((r) => (
              <Route key={r.fra} path={r.fra.slice(1)}
                     element={<Videresend til={r.til} />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          )}
          {/* ⚠ EN CHAUFFØR DER RAMMER EN AppShell-STI, SENDES TIL /app —
              ikke til "/", som ville lande i den blok han netop blev
              udelukket fra og loope. Se erChauffoer ovenfor. */}
          {harAdgang && erChauffoer && (
            <Route path="*" element={<Navigate to="/app" replace />} />
          )}
        </Routes>
      </BrowserRouter>
    </FleetProvider>
  );
}
