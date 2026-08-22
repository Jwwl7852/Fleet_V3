/* src/App.jsx
 * Alle ruter på ét sted. Rækkefølgen følger nav.js, så sidebar og ruter
 * ikke kan komme ud af sync.
 */
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { FleetProvider } from "./fleet/FleetContext.jsx";
import AppShell from "./fleet/AppShell.jsx";
import { REDIRECTS } from "./fleet/nav.js";
import { erAktiv, laasetekst, opbevaresTil } from "./fleet/abonnement.js";
import { dato } from "./fleet/format.js";
import { auth, db, demoMode, miljoe, hentBrugerContext } from "./firebase.js";

import Dashboard from "./moduler/Dashboard.jsx";
import BookingOversigt from "./moduler/booking/Oversigt.jsx";
import NyForespoergsel from "./moduler/booking/NyForespoergsel.jsx";
import Forslag from "./moduler/booking/Forslag.jsx";
import Disponering from "./moduler/booking/Disponering.jsx";
import LiveKort from "./moduler/booking/LiveKort.jsx";
import Bookingopsaetning from "./moduler/booking/Bookingopsaetning.jsx";
import Bemanding from "./moduler/Bemanding.jsx";
import Medarbejdere from "./moduler/Medarbejdere.jsx";
import Kompetencer from "./moduler/Kompetencer.jsx";
import Fravaer from "./moduler/Fravaer.jsx";
import FlaadeOversigt from "./moduler/flaade/Oversigt.jsx";
import Vaerkstedskalender from "./moduler/flaade/Vaerkstedskalender.jsx";
import Indberetninger from "./moduler/flaade/Indberetninger.jsx";
import Arbejdskoe from "./moduler/flaade/Arbejdskoe.jsx";
import FacilityOversigt from "./moduler/facility/Oversigt.jsx";
import Servicekalender from "./moduler/facility/Servicekalender.jsx";
import Klima from "./moduler/facility/Klima.jsx";
import IndkoebOversigt from "./moduler/indkoeb/Oversigt.jsx";
import Indkoebsbehov from "./moduler/indkoeb/Behov.jsx";
import Bestillinger from "./moduler/indkoeb/Bestillinger.jsx";
import Fakturaer from "./moduler/indkoeb/Fakturaer.jsx";
import Leverandoerer from "./moduler/indkoeb/Leverandoerer.jsx";
import UnitbookingKasser from "./moduler/unitbooking/Kasser.jsx";
import Reolpladser from "./moduler/unitbooking/Reolpladser.jsx";
import Kasseudlaan from "./moduler/unitbooking/Udlaan.jsx";
import Unitbookingkalender from "./moduler/unitbooking/Kalender.jsx";
import Unitbookinghistorik from "./moduler/unitbooking/Historik.jsx";
import Wmsvarer from "./moduler/warehouse/Varer.jsx";
import Wmslokationer from "./moduler/warehouse/Lokationer.jsx";
import Wmsbevaegelser from "./moduler/warehouse/Bevaegelser.jsx";
import Wmspluk from "./moduler/warehouse/Pluk.jsx";
import Wmsoptaelling from "./moduler/warehouse/Optaelling.jsx";
import Wmscarriers from "./moduler/warehouse/Carriers.jsx";
import Wmslabels from "./moduler/warehouse/Transportlabels.jsx";
import Wmsmodtagelse from "./moduler/warehouse/Modtagelse.jsx";
import Wmsafregning from "./moduler/warehouse/Afregning.jsx";
import Wmssporbarhed from "./moduler/warehouse/Sporbarhed.jsx";
import Wmsvolumen from "./moduler/warehouse/Volumen.jsx";
import Standardpriser from "./moduler/kunder/Standardpriser.jsx";
import Kundepriser from "./moduler/kunder/Kundepriser.jsx";
import Kunder from "./moduler/Kunder.jsx";
import Oekonomi from "./moduler/Oekonomi.jsx";
import Fakturering from "./moduler/Fakturering.jsx";
import Generelt from "./moduler/opsaetning/Generelt.jsx";
import Brugere from "./moduler/opsaetning/Brugere.jsx";
import Integrationer from "./moduler/opsaetning/Integrationer.jsx";
import Hjaelp from "./moduler/support/Hjaelp.jsx";
import Supportoverblik from "./moduler/support/Overblik.jsx";
import Supportsag from "./moduler/support/Sag.jsx";
import Login from "./moduler/Login.jsx";
import Konsol from "./moduler/udbyder/Konsol.jsx";
import Prisliste from "./moduler/udbyder/Prisliste.jsx";
import { permStrengFraRolle } from "./fleet/permissions.js";

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
          <span className="fc-brand">FleetControl</span>
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
        <h1 className="fc-brand fc-login-brand">FleetControl</h1>
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

  /* ⚠ EJEREN KOMMER FØRST. En konto der er begge dele — det sker i dev — skal
     lande i konsollen, ikke i sin egen tenant. Ellers ville man skulle logge
     ud for at komme til den, og så ville nogen give ejerkontoen en tenant
     for at slippe. */
  if (erUdbyder) {
    return (
      <BrowserRouter>
        <Udbyderramme bruger={bruger} logUd={() => auth?.signOut()}>
          <Routes>
            <Route path="/main" element={<Konsol bruger={bruger} />} />
            <Route path="/main/priser" element={<Prisliste />} />
            <Route path="*" element={<Navigate to="/main" replace />} />
          </Routes>
        </Udbyderramme>
      </BrowserRouter>
    );
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
          {harAdgang && (
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />

            <Route path="booking" element={<BookingOversigt />} />
            <Route path="booking/ny" element={<NyForespoergsel />} />
            <Route path="booking/forslag/:id" element={<Forslag />} />
            <Route path="booking/disponering" element={<Disponering />} />
            <Route path="booking/live-kort" element={<LiveKort />} />
            <Route path="booking/opsaetning" element={<Bookingopsaetning />} />

            <Route path="bemanding" element={<Bemanding />} />
            <Route path="bemanding/kompetencer" element={<Kompetencer />} />
            <Route path="bemanding/fravaer" element={<Fravaer />} />

            {/* ⚠ DRIFTSKALENDEREN ER FLEETS FORSIDE. Enheder laa her og ligger nu
                under Opsaetning — se nav.js. /flaade/vaerksted er en redirect i
                REDIRECTS, ikke en rute, saa der er eet sted skaermen naas fra. */}
            <Route path="flaade" element={<Vaerkstedskalender />} />
            <Route path="flaade/indberetninger" element={<Indberetninger />} />
            <Route path="flaade/koe" element={<Arbejdskoe />} />

            <Route path="facility" element={<FacilityOversigt />} />
            <Route path="facility/servicekalender" element={<Servicekalender />} />
            <Route path="facility/klima" element={<Klima />} />

            <Route path="indkoeb" element={<IndkoebOversigt />} />
            <Route path="indkoeb/behov" element={<Indkoebsbehov />} />

            <Route path="indkoeb/bestillinger" element={<Bestillinger />} />
            <Route path="indkoeb/fakturaer" element={<Fakturaer />} />
            <Route path="indkoeb/leverandoerer" element={<Leverandoerer />} />

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

            {/* v1.4-stier holdes i live, så gamle links og bogmærker virker */}
            {REDIRECTS.map((r) => (
              <Route key={r.fra} path={r.fra.slice(1)}
                     element={<Videresend til={r.til} />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          )}
        </Routes>
      </BrowserRouter>
    </FleetProvider>
  );
}
