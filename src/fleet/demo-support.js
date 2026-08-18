/* src/fleet/demo-support.js
 * Demo-supportsager. TO TENANTS med vilje.
 *
 * ⚠ HELE POINTEN MED SÆTTET er at der er sager fra mere end én kunde. Med kun
 * én kan man ikke se at tenant-grænsen holder — og maaLaeseSag() ville se
 * rigtig ud uanset hvad den gjorde.
 *
 * FORMEN ER NODENS:
 *   support/sager/<sagId>          i toppen, med tenantId
 *   support/beskeder/<sagId>/<id>  tråden
 *   tenants/<t>/supportsager/<id>  indeks — kun id'er
 *
 * ⚠ KONTEKSTEN ER FILTRERET. Hver sag bærer kun felter fra
 * SUPPORT_KONTEKST-allowlisten. En af sagerne herunder har med vilje et
 * forsøg på at sende noget der ikke er tilladt, så selvkontrollen kan ses
 * fange det.
 *
 * ⚠ AUDITUDTRÆKKET ER ET UDTRÆK, IKKE EN ADGANG (beslutning 24). Posterne
 * herunder er dem en Cloud Function ville have hentet for ÉN bruger i et
 * fast vindue omkring fejltidspunktet — ikke tenantens log.
 */
import {
  SUPPORT_KATEGORI, SUPPORT_PRIORITET, SUPPORT_STATUS, KONTEKSTFELTER,
  SUPPORT_NUMMER, kontekstFilter, klipUdtraek, adgangAktiv,
} from "./support.js";

const MIN = 60000;
const T = 3600000;
const DAG = 86400000;

const iDag = new Date();
iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();
const dag = (n, time = 0, min = 0) => D0 + n * DAG + time * T + min * MIN;

/* De to tenants. "demo" er den vi selv kører som; "nordisk" findes kun her,
   fordi supportoverblikket skal kunne vise sager på tværs. */
export const DEMO_TENANTS = {
  demo: "DEMO Transport ApS",
  nordisk: "Nordisk Logistik A/S",
};

/* ---- Sagerne ----------------------------------------------------------- */

export const DEMO_SUPPORTSAGER = [
  {
    id: "sup-1024", nummer: "SUP-2026-01024", tenantId: "demo",
    kategori: "virkerIkke", prioritet: "hoej", status: "undersoeges",
    emne: "Køretøj kan ikke gemmes",
    beskrivelse:
      "Jeg kan ikke gemme Bil 104. Når jeg trykker Gem, sker der ingenting — " +
      "ingen fejlbesked, siden bliver bare stående.",
    oprettetMs: dag(0, 9, 14), oprettetAf: "Line Aggerholm",
    ansvarlig: "Martin K.",
    fejlMs: dag(0, 9, 14),
    kontekst: {
      kunde: "DEMO Transport ApS", side: "/flaade", modul: "Fleet",
      browser: "Chrome 126", version: "FleetControl 3.0.0",
      brugerId: "uid-line", tidspunkt: "18-08-2026 09:14",
      fejlId: "FC-ERR-SAVE-VEH-001",
    },
    checkliste: [
      { id: "c1", tekst: "Kontrollér valideringsreglerne på koeretoejer/", klaret: true },
      { id: "c2", tekst: "Reproducér i DEV", klaret: true },
      { id: "c3", tekst: "Skriv en regeltest der fanger det", klaret: false },
      { id: "c4", tekst: "Bekræft hos kunden", klaret: false },
    ],
  },
  {
    id: "sup-1023", nummer: "SUP-2026-01023", tenantId: "nordisk",
    kategori: "booking", prioritet: "medium", status: "afventerKunde",
    emne: "Dobbeltbooking vises ikke som konflikt",
    beskrivelse:
      "Vi har booket samme trailer to gange i samme uge, og systemet siger " +
      "ikke fra. Vi kan se begge bookinger i listen.",
    oprettetMs: dag(-1, 8, 52), oprettetAf: "Preben Storm",
    ansvarlig: "Line A.",
    fejlMs: dag(-1, 8, 52),
    kontekst: {
      kunde: "Nordisk Logistik A/S", side: "/booking", modul: "Planning",
      browser: "Edge 127", version: "FleetControl 3.0.0",
      brugerId: "uid-preben", tidspunkt: "17-08-2026 08:52",
      fejlId: null,
    },
    checkliste: [
      { id: "c1", tekst: "Bekræft at etaper er .write: false — der skrives ikke reservationer endnu", klaret: true },
      { id: "c2", tekst: "Forklar kunden at konfliktkontrollen hører i Cloud Function", klaret: false },
    ],
  },
  {
    id: "sup-1022", nummer: "SUP-2026-01022", tenantId: "demo",
    kategori: "rettigheder", prioritet: "lav", status: "ny",
    emne: "Disponent kan ikke godkende forslag",
    beskrivelse:
      "En af vores disponenter siger at Godkend-knappen ikke er der på " +
      "forslagsskærmen. Er det en fejl?",
    oprettetMs: dag(0, 11, 5), oprettetAf: "Mette Kjær",
    ansvarlig: null,
    fejlMs: null,
    kontekst: {
      kunde: "DEMO Transport ApS", side: "/booking/forslag", modul: "Planning",
      browser: "Chrome 126", version: "FleetControl 3.0.0",
      brugerId: "uid-mette", tidspunkt: "18-08-2026 11:05", fejlId: null,
    },
    checkliste: [
      { id: "c1", tekst: "Bekræft: det er beslutning 5, ikke en fejl", klaret: false },
    ],
  },
  {
    id: "sup-1019", nummer: "SUP-2026-01019", tenantId: "nordisk",
    kategori: "integration", prioritet: "kritisk", status: "afventerIntern",
    emne: "Mail på sag lander i karantæne",
    beskrivelse:
      "Vores værksted svarer på sagsmails, men svarene dukker ikke op på " +
      "sagen. De står i karantæne.",
    oprettetMs: dag(-2, 15, 33), oprettetAf: "Preben Storm",
    ansvarlig: "Martin K.",
    fejlMs: dag(-2, 15, 33),
    kontekst: {
      kunde: "Nordisk Logistik A/S", side: "/flaade/vaerksted", modul: "Fleet",
      browser: "Edge 127", version: "FleetControl 3.0.0",
      brugerId: "uid-preben", tidspunkt: "16-08-2026 15:33",
      fejlId: "FC-SAG-KARANTAENE",
    },
    checkliste: [
      { id: "c1", tekst: "Bekræft afsenderadressen mod sagens parter[]", klaret: true },
      { id: "c2", tekst: "Vejled kunden i at frigive og tilføje parten", klaret: false },
    ],
  },
  {
    id: "sup-1016", nummer: "SUP-2026-01016", tenantId: "demo",
    kategori: "brugerspoergsmaal", prioritet: "lav", status: "loest",
    emne: "Hvordan opretter jeg en trailer?",
    beskrivelse: "Jeg kan ikke finde stedet hvor man opretter en påhængsvogn.",
    oprettetMs: dag(-6, 10, 12), oprettetAf: "Benjamin Holm",
    ansvarlig: "Line A.",
    fejlMs: null,
    kontekst: {
      kunde: "DEMO Transport ApS", side: "/flaade", modul: "Fleet",
      browser: "Firefox 129", version: "FleetControl 3.0.0",
      brugerId: "uid-benjamin", tidspunkt: "12-08-2026 10:12", fejlId: null,
    },
    checkliste: [{ id: "c1", tekst: "Henvist til Fleet → Ny enhed", klaret: true }],
  },
];

/* ---- Tråden ------------------------------------------------------------ */

export const DEMO_SUPPORTBESKEDER = {
  "sup-1024": [
    { id: "b1", ms: dag(0, 9, 14), fra: "kunde", navn: "Line Aggerholm",
      tekst: "Jeg kan ikke gemme Bil 104. Når jeg trykker Gem, sker der ingenting." },
    { id: "b2", ms: dag(0, 9, 18), fra: "support", navn: "Martin K.",
      tekst: "Tak — vi kigger på det. Kan du bekræfte at du er logget ind som administrator?" },
    { id: "b3", ms: dag(0, 9, 26), fra: "kunde", navn: "Line Aggerholm",
      tekst: "Ja, jeg er administrator.", vedhaeftning: "skaermbillede-gem.png" },
    { id: "b4", ms: dag(0, 10, 2), fra: "support", navn: "Martin K.",
      tekst: "Vi kan se i aktivitetsudtrækket at skrivningen blev afvist af reglerne. " +
             "Feltet 'division' står på posten, og det afviser reglerne på koeretoejer/ " +
             "med vilje — se beslutning 19. Vi vender tilbage med en bedre fejlbesked." },
  ],
  "sup-1023": [
    { id: "b1", ms: dag(-1, 8, 52), fra: "kunde", navn: "Preben Storm",
      tekst: "Samme trailer booket to gange. Systemet siger ikke fra." },
    { id: "b2", ms: dag(-1, 9, 30), fra: "support", navn: "Line A.",
      tekst: "Konfliktkontrollen er bygget, men den håndhæves først når " +
             "reservationerne skrives af en Cloud Function. Indtil da skrives der " +
             "ingen reservationer, og derfor er der intet at kollidere med." },
  ],
  "sup-1022": [
    { id: "b1", ms: dag(0, 11, 5), fra: "kunde", navn: "Mette Kjær",
      tekst: "Disponenten kan ikke se Godkend-knappen. Er det en fejl?" },
  ],
  "sup-1019": [
    { id: "b1", ms: dag(-2, 15, 33), fra: "kunde", navn: "Preben Storm",
      tekst: "Svar fra værkstedet lander i karantæne." },
    { id: "b2", ms: dag(-2, 16, 10), fra: "support", navn: "Martin K.",
      tekst: "Afsenderen står ikke som part på sagen. Det er sådan det skal virke — " +
             "et gyldigt sagsnummer er en adresse, ikke en adgang." },
  ],
  "sup-1016": [
    { id: "b1", ms: dag(-6, 10, 12), fra: "kunde", navn: "Benjamin Holm",
      tekst: "Hvor opretter man en påhængsvogn?" },
    { id: "b2", ms: dag(-6, 10, 40), fra: "support", navn: "Line A.",
      tekst: "Under Fleet → Ny enhed. Vælg arten 'Påhængsvogn'." },
  ],
};

/* ---- Auditudtrækket ---------------------------------------------------- */

/**
 * BESLUTNING 24: et UDTRÆK, ikke en adgang.
 *
 * Posterne er dem en Cloud Function ville have hentet for ÉN bruger i vinduet
 * ±5 minutter omkring fejltidspunktet, højst 50 stk. De ligger PÅ SAGEN —
 * support læser sagen, aldrig audit/.
 *
 * Formen er auditpostens, uden felter der ikke må rejse: ingen `foer`/`efter`
 * med fritekst, ingen ip.
 */
export const DEMO_AUDITUDTRAEK = {
  "sup-1024": [
    { ms: dag(0, 9, 11), handling: "laes", objekt: "koeretoejer", antal: 16, resultat: "ok" },
    { ms: dag(0, 9, 13), handling: "laes", objekt: "koeretoejer", objektId: "kt-104", resultat: "ok" },
    { ms: dag(0, 9, 14), handling: "aendre", objekt: "koeretoejer", objektId: "kt-104",
      resultat: "afvist", aendrede: ["division", "laengdeMm"] },
    { ms: dag(0, 9, 14), handling: "adgangNaegtet", objekt: "koeretoejer", objektId: "kt-104",
      resultat: "afvist" },
    /* Uden for vinduet med vilje — selvkontrollen fastholder at den klippes. */
    { ms: dag(0, 8, 40), handling: "login", objekt: "auth", resultat: "ok" },
  ],
  "sup-1019": [
    { ms: dag(-2, 15, 31), handling: "laes", objekt: "sager", antal: 4, resultat: "ok" },
    { ms: dag(-2, 15, 33), handling: "adgangNaegtet", objekt: "sager", resultat: "afvist" },
  ],
};

/* ---- Supportadgang ----------------------------------------------------- */

export const DEMO_BEVILLINGER = {
  /* Aktiv nu — givet af kundens administrator, udløber om et par timer. */
  "sup-1024": {
    sagId: "sup-1024", sagsnummer: "SUP-2026-01024", tenantId: "demo",
    givetAf: "uid-dennis", givetMs: dag(0, 9, 40),
    udloeberMs: Date.now() + 2 * T,
    type: "readOnly", formaal: "Undersøge afvist skrivning på Bil 104",
    tilbagekaldtMs: null,
  },
  /* Udløbet — står som spor, den slettes ikke. */
  "sup-1019": {
    sagId: "sup-1019", sagsnummer: "SUP-2026-01019", tenantId: "nordisk",
    givetAf: "uid-preben", givetMs: dag(-2, 16, 0),
    udloeberMs: dag(-2, 20, 0),
    type: "readOnly", formaal: "Se karantænelisten på sagen",
    tilbagekaldtMs: null,
  },
};

/* ---- Indeks pr. tenant ------------------------------------------------- */

/** tenants/<t>/supportsager/<sagId>: true — kun id'er. Det er den kunden kan
 *  LISTE; selve sagen læses derefter ét ad gangen. */
export const demoIndeksFor = (tenantId) =>
  DEMO_SUPPORTSAGER.filter((s) => s.tenantId === tenantId).map((s) => s.id);

export const demoSupportsag = (id) => DEMO_SUPPORTSAGER.find((s) => s.id === id) || null;
export const demoBeskeder = (sagId) => DEMO_SUPPORTBESKEDER[sagId] || [];
export const demoBevilling = (sagId) => DEMO_BEVILLINGER[sagId] || null;

/** Udtrækket klippet til grænserne. Rammes loftet, siges det. */
export const demoUdtraek = (sag) =>
  klipUdtraek(DEMO_AUDITUDTRAEK[sag?.id] || [], sag?.fejlMs);

/* ---- Selvkontrol ------------------------------------------------------- */

if (import.meta.env?.DEV) {
  const tenantIder = Object.keys(DEMO_TENANTS);

  for (const s of DEMO_SUPPORTSAGER) {
    if (!SUPPORT_NUMMER.test(s.nummer)) {
      console.warn(
        `demo-support: ${s.nummer} følger ikke SUP-ÅÅÅÅ-NNNNN. Fem cifre — ` +
        `beslutning 8's format gælder alle serier.`
      );
    }
    if (!tenantIder.includes(s.tenantId)) {
      console.warn(`demo-support: ${s.nummer} peger på ukendt tenant "${s.tenantId}".`);
    }
    if (!SUPPORT_KATEGORI[s.kategori]) console.warn(`demo-support: ${s.nummer} har ukendt kategori.`);
    if (!SUPPORT_PRIORITET[s.prioritet]) console.warn(`demo-support: ${s.nummer} har ukendt prioritet.`);
    if (!SUPPORT_STATUS[s.status]) console.warn(`demo-support: ${s.nummer} har ukendt status.`);

    /* Konteksten må kun indeholde felter fra allowlisten. En supportsag er en
       ny kanal ud af systemet. */
    const { afvist } = kontekstFilter(s.kontekst || {});
    if (afvist.length) {
      console.warn(
        `demo-support: ${s.nummer} har felter uden for allowlisten: ${afvist.join(", ")}. ` +
        `Se SUPPORT_KONTEKST i support.js.`
      );
    }
    for (const forbudt of ["password", "token", "adgangskode", "feltvaerdier"]) {
      if (JSON.stringify(s.kontekst || {}).toLowerCase().includes(forbudt)) {
        console.warn(`demo-support: ${s.nummer} ser ud til at bære "${forbudt}" i konteksten.`);
      }
    }

    if (!DEMO_SUPPORTBESKEDER[s.id]?.length) {
      console.warn(`demo-support: ${s.nummer} har ingen beskeder. En sag uden tråd kan ikke vises.`);
    }
  }

  /* Uden sager fra mere end én tenant kan tenant-grænsen ikke ses virke. */
  const tenantsMedSager = new Set(DEMO_SUPPORTSAGER.map((s) => s.tenantId));
  if (tenantsMedSager.size < 2) {
    console.warn(
      `demo-support: alle sager ligger i samme tenant. Så kan man ikke se at ` +
      `maaLaeseSag() faktisk skiller dem ad.`
    );
  }

  /* Udtrækket skal faktisk blive klippet et sted, ellers er grænsen udokumenteret. */
  const medUdtraek = DEMO_SUPPORTSAGER.filter((s) => DEMO_AUDITUDTRAEK[s.id]?.length);
  if (!medUdtraek.some((s) => {
    const raa = DEMO_AUDITUDTRAEK[s.id].length;
    return demoUdtraek(s).poster.length < raa;
  })) {
    console.warn(
      `demo-support: ingen af udtrækkene bliver klippet af vinduet. Så kan man ikke ` +
      `se at ±${5} minutter faktisk er en grænse.`
    );
  }

  /* Bevillingerne skal dække både en aktiv og en udløbet — ellers kan man ikke
     se at adgangen udløber af sig selv. */
  const bev = Object.values(DEMO_BEVILLINGER);
  if (!bev.some((b) => adgangAktiv(b))) console.warn("demo-support: ingen aktiv bevilling.");
  if (!bev.some((b) => !adgangAktiv(b))) {
    console.warn("demo-support: ingen udløbet bevilling — at adgangen udløber kan ikke ses.");
  }
  for (const b of bev) {
    if (!b.formaal?.trim()) {
      console.warn(`demo-support: bevilling på ${b.sagsnummer} mangler et formål.`);
    }
    if (!(b.udloeberMs > b.givetMs)) {
      console.warn(`demo-support: bevilling på ${b.sagsnummer} udløber før den blev givet.`);
    }
  }
}
