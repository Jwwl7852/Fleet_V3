/* src/fleet/useListe.js
 * Lister fra RTDB, ét sted. Modulerne bygger ikke selv forespørgsler.
 *
 * Mønsteret er kopieret fra hentReservationer() i reservations.js, ikke
 * opfundet: ÉT felt server-side, et vindue der er bredt nok, og resten
 * filtreret i klienten. RTDB kan kun filtrere på ét felt, og det kan man
 * ikke abstrahere væk — API'et gør begrænsningen synlig i stedet for at
 * skjule den. Sender du to felter, kaster hooket.
 *
 * Egress: RTDB koster på data UD, ikke på antal forespørgsler. Derfor er
 * tolv små månedsopslag billigere end ét der trækker hele historikken, og
 * derfor er once() standard. on() kun hvis kalderen beder om det.
 *
 * ADVARSEL: et manglende .indexOn får IKKE forespørgslen til at fejle.
 * RTDB henter hele noden ned til klienten og sorterer der, med en advarsel
 * i konsollen. Regningen kommer stille. Hvert ordnPaa-felt herunder skal
 * have en tilsvarende regel i firebase.rules.json.
 *
 * Division (beslutning 15) er et FELT, ikke en sti, og filtreres altid
 * klientside. Den optager derfor aldrig det ene server-side felt, og et
 * skift mellem Gods og Bus genhenter ikke — filteret ligger i render.
 * Prisen er at en divisionsopdelt liste henter ca. dobbelt så meget som
 * den viser. Det er den pris analysen valgte, frem for to kalendere for
 * én chauffør med C+D.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFleet } from "./FleetContext.jsx";
import { db } from "../firebase.js";
import { laes as auditLaes, adgangNaegtet as auditNaegtet } from "./audit.js";
import { TILSTAND, dataTilstand } from "./datatilstand.js";

const DAG = 86400000;

/** Loft på antal månedsopslag. Rammes det, er perioden for bred til en
 *  rå liste — så hører tallet hjemme i kpi/. Vi afkorter ikke i stilhed. */
export const MAX_PARTITIONER = 24;

const stigende = (a, b) => (a > b ? 1 : a < b ? -1 : 0);

/** Segmenterne <år>/<måned> i et halvåbent interval [fra, til). */
export function maanedsSegmenter(fra, til) {
  const ud = [];
  const d = new Date(fra);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  while (d.getTime() < til) {
    ud.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
    if (ud.length > MAX_PARTITIONER) break;
  }
  return ud;
}

/* Vinduet kommer fra shellen, aldrig fra modulet.
   "fremad" bruger periode.til som nu — ikke Date.now(). periode er memoiseret
   på `dage`, så tallet er stabilt mellem renders. Med Date.now() ville
   effekten få nye deps hver render og hente i en løkke. */
function beregnVindue(vindue, periode, fremDage, vindueDage) {
  if (vindue === "alle") return null;
  const bagud = vindueDage * DAG;
  if (vindue === "fremad") {
    return { fra: periode.til - bagud, til: periode.til + fremDage * DAG };
  }
  return { fra: periode.fra - bagud, til: periode.til };
}

/* Præcis ét server-side felt: enten equalTo eller et interval, aldrig begge.
   endAt er inklusiv i RTDB; det halvåbne [fra, til) strammes klientside i
   efterbehandl(), så serveren hellere leverer en række for meget end en for
   lidt. Samme retning som vindueDage i hentReservationer(). */
function byg(ref, { ordnPaa, interval, lig, graense }) {
  let q = ref;
  if (ordnPaa) q = q.orderByChild(ordnPaa);
  if (lig !== undefined) q = q.equalTo(lig);
  else if (interval) q = q.startAt(interval.fra).endAt(interval.til);
  if (graense) q = q.limitToLast(graense);
  return q;
}

function laes(snap) {
  const ud = [];
  snap.forEach((barn) => { ud.push({ id: barn.key, ...barn.val() }); });
  return ud;
}

/**
 * Ren async-udgave, uden React. Samme opdeling som reservations.js, så den
 * kan bruges fra en Cloud Function eller en test.
 */
export async function hentListe(database, path, node, o = {}) {
  const stier = o.partition === "maaned"
    ? maanedsSegmenter(o.interval.fra, o.interval.til).map((s) => `${node}/${s}`)
    : [node];

  if (stier.length > MAX_PARTITIONER) {
    throw new Error(
      `useListe: "${node}" ville kræve over ${MAX_PARTITIONER} månedsopslag. ` +
      `Snævr perioden ind, eller læs et aggregeret tal fra kpi/.`
    );
  }

  /* Ét opslag pr. partition. Forsvarligt netop fordi egress koster på data
     ud og ikke på forespørgsler — alternativet er at hente hele historikken. */
  const dele = await Promise.all(stier.map((sti) => byg(database.ref(path(sti)), o).once("value")));
  return dele.flatMap(laes);
}

/* Hvad serveren ville have leveret. Kun til demo-data, så et datasæt uden
   database opfører sig som ét med. */
function somServeren(raekker, { ordnPaa, interval, lig, graense }) {
  let ud = raekker;
  if (ordnPaa) {
    if (lig !== undefined) ud = ud.filter((r) => r[ordnPaa] === lig);
    else if (interval) ud = ud.filter((r) => r[ordnPaa] >= interval.fra && r[ordnPaa] <= interval.til);
    ud = [...ud].sort((a, b) => stigende(a[ordnPaa], b[ordnPaa]));
  }
  if (graense) ud = ud.slice(-graense);
  return ud;
}

export const FAELLES = "faelles";

/* Visningsreglen: den valgte division PLUS fælles. En kunde der køber både
   gods og bus står på begge lister med samme tal.
   En post UDEN division vises i begge — ikke i ingen. Skjuler den sig,
   forsvinder en fejlskrevet booking fra begge toggles, og fejlen opdages
   først når nogen spørger hvorfor en tur mangler. */
function divisionsfilter(raekker, valgt, tilstand) {
  if (tilstand === "alle") return raekker;
  return raekker.filter(
    (r) => r.division == null || r.division === valgt || r.division === FAELLES
  );
}

/* Klientsidedelen. Køres på BÅDE ægte og demo-data, så en fejl i et filter
   dukker op i demo-mode i stedet for først i produktion. */
function efterbehandl(raekker, { ordnPaa, interval, lig, filtrer, sorter, valgtDivision, divisionsTilstand }) {
  let ud = raekker;
  if (ordnPaa && lig === undefined && interval) {
    ud = ud.filter((r) => r[ordnPaa] >= interval.fra && r[ordnPaa] < interval.til);
  }
  ud = divisionsfilter(ud, valgtDivision, divisionsTilstand);
  if (filtrer) ud = ud.filter(filtrer);
  if (sorter) ud = [...ud].sort(sorter);
  return ud;
}

/**
 * useListe(node, indstillinger)
 *
 *   SERVER-SIDE — præcis ét felt:
 *     ordnPaa      felt til orderByChild. En streng, aldrig et array.
 *     vindue       "periode" (standard) | "fremad" | "alle"
 *     lig          equalTo på ordnPaa. Udelukker vindue.
 *     fremDage     længden af "fremad"-vinduet (30)
 *     vindueDage   udvider startAt bagud, som maxVarighedDage i reservations
 *     graense      limitToLast
 *
 *   KLIENTSIDE:
 *     filtrer      (r) => bool
 *     sorter       (a, b) => number
 *
 *     division     "shell" (standard: valgt division + faelles) | "alle"
 *     partition    "maaned" — læser /<år>/<måned>/ i vinduet
 *     live         false (once) | true (on + off i cleanup)
 *     demo         array eller () => array, når db er null
 *     auditerSom   objektnavn — logger LÆSNINGEN i auditloggen
 *     hent         false → spørg slet ikke. Tom liste, ingen fejl
 *
 * ⚠ `hent: false` ER TIL EN NODE DER ER SPÆRRET AF ET FRAVALGT MODUL — ikke
 * til at skjule en afvisning. Warehouses lokationsskærm tæller både kasser og
 * carriers på hylden; hos en kunde uden Turtlebooking findes `kasser` ikke,
 * og reglerne ville svare `permission-denied`. Den tomme liste er dér det
 * RIGTIGE svar: der er ingen kasser, ikke en fejl at vise.
 *
 * Bruges den til at dæmpe en afvisning på en node kunden HAR, er det
 * beslutning 26 om igen — en spærring der oversættes til ingenting.
 *
 * auditerSom hører her og ikke i skærmen. Bad vi hver skærm om selv at kalde
 * audit.laes(), ville det blive glemt — og så var audit eftermonteret, hvilket
 * er præcis det punkt 4 skulle undgå. Som en egenskab ved forespørgslen kan
 * den ikke overses. Der logges ÉN post pr. hentning med antal rækker, aldrig
 * rækkerne selv.
 *
 * → { data, henter, fejl, genindlaes, afkortet }
 *
 * afkortet betyder at graense blev ramt og der kan være flere rækker.
 * Skriv det til brugeren — tavs afkortning opdages først når nogen spørger
 * hvorfor en booking mangler.
 */
export function useListe(node, indstillinger = {}) {
  const { periode, path, tenantId, division: valgtDivision, bruger } = useFleet();
  const {
    ordnPaa, vindue, lig, fremDage = 30, vindueDage = 0, graense,
    filtrer, sorter, division: divisionsTilstand = "shell",
    partition, live = false, demo, auditerSom, hent = true,
  } = indstillinger;

  /* Konfigurationsfejl er statiske pr. kaldsted — de skal fejle højlydt
     første gang skærmen åbnes, ikke give et halvt resultat. */
  if (Array.isArray(ordnPaa)) {
    throw new Error(
      "useListe: ordnPaa skal være ét felt. RTDB kan kun filtrere på ét — resten hører i filtrer()."
    );
  }
  if (lig !== undefined && vindue !== undefined) {
    throw new Error("useListe: brug enten lig (equalTo) eller vindue (interval) på ordnPaa — ikke begge.");
  }
  if (lig !== undefined && !ordnPaa) {
    throw new Error("useListe: lig kræver et ordnPaa at sammenligne på.");
  }
  if (partition && live) {
    throw new Error("useListe: live på en tidspartitioneret node er ikke understøttet.");
  }

  const interval = lig !== undefined
    ? null
    : beregnVindue(vindue ?? "periode", periode, fremDage, vindueDage);

  if (partition === "maaned" && !interval) {
    throw new Error("useListe: partition kræver et vindue — vindue:'alle' kan ikke partitioneres.");
  }

  const [raa, setRaa] = useState([]);
  const [henter, setHenter] = useState(true);
  const [fejl, setFejl] = useState(null);
  const [tilstand, setTilstand] = useState({ art: TILSTAND.ok, visDemo: false });
  const [afkortet, setAfkortet] = useState(false);
  const [nonce, setNonce] = useState(0);
  const genindlaes = useCallback(() => setNonce((n) => n + 1), []);

  /* filtrer/sorter/demo er typisk inline-literaler og skifter identitet hver
     render. De må ikke stå i effektens deps, ellers henter den i en løkke.
     filtrer og sorter er rent klientside og køres i render; demo læses via
     en ref. */
  const demoRef = useRef(demo);
  demoRef.current = demo;

  const fra = interval ? interval.fra : null;
  const til = interval ? interval.til : null;

  useEffect(() => {
    let aktiv = true;
    setHenter(true);
    setFejl(null);

    const o = { ordnPaa, interval: fra == null ? null : { fra, til }, lig, graense, partition };

    /* egteLaesning er falsk når rækkerne kommer fra demo-sættet uden at
       serveren er spurgt. Så må der ikke skrives en auditpost: den ville
       registrere en læsning der aldrig fandt sted. */
    const modtag = (raekker, egteLaesning = true) => {
      if (!aktiv) return;
      /* Drift-detektor: har NOGLE rækker division og andre ikke, er feltet
         ved at glide. De divisionsløse vises i begge, så fejlen er synlig —
         men den skal også være hørbar for udvikleren. */
      if (import.meta.env.DEV) {
        const uden = raekker.filter((r) => r.division == null).length;
        if (uden && uden < raekker.length) {
          console.warn(
            `useListe("${node}"): ${uden} af ${raekker.length} poster mangler division. ` +
            `De vises i BEGGE divisioner — se beslutning 15.`
          );
        }
      }
      if (egteLaesning) setTilstand({ art: TILSTAND.ok, visDemo: false });
      setRaa(raekker);
      setAfkortet(Boolean(graense) && raekker.length >= graense);
      setHenter(false);

      /* Antallet, ikke rækkerne. En audit-post må ikke indeholde det den
         registrerer at nogen har set. audit.laes kaster aldrig. */
      if (auditerSom && egteLaesning) auditLaes({ objekt: auditerSom, antal: raekker.length });
    };

    const demoData = () => {
      const d = demoRef.current;
      return somServeren(typeof d === "function" ? d() : d || [], o);
    };

    /* Et afvist forsøg på en auditeret node er selv en hændelse. Reglerne
       kan ikke skrive til auditloggen, så det må komme herfra — svagere end
       serverlogning, men bedre end tavshed. Se noten på audit.adgangNaegtet. */
    const fejlet = (e) => {
      if (!aktiv) return;
      setFejl(e);
      setTilstand(dataTilstand({ harDb: true, harBruger: true, fejl: e }));
      if (auditerSom) {
        auditNaegtet({ objekt: auditerSom, aarsag: e?.code || "ukendt" });
      }
      /* INGEN demo-data. En afvist læsning skal ses som en afvisning, ikke
         som en tabel med opdigtede rækker. Se datatilstand.js. */
      setRaa([]);
      setAfkortet(false);
      setHenter(false);
    };

    /* ⚠ FØRST AF ALT: skal noden overhovedet spørges? En node der er spærret
       af et fravalgt modul, ville svare permission-denied, og den afvisning
       er ikke en fejl brugeren skal se — den er svaret "modulet er ikke
       købt". Ingen forespørgsel, ingen auditpost: en læsning der aldrig
       fandt sted, må ikke registreres som en. */
    if (!hent) {
      setTilstand({ art: TILSTAND.ok, visDemo: false });
      setRaa([]);
      setAfkortet(false);
      setHenter(false);
      return () => { aktiv = false; };
    }

    /* FØR forespørgslen — manglende database og manglende bruger er begge
       kendt op front. Uden bruger sendes forespørgslen slet ikke. */
    const foer = dataTilstand({ harDb: Boolean(db), harBruger: Boolean(bruger) });
    if (foer.art !== TILSTAND.ok) {
      setTilstand(foer);
      modtag(foer.visDemo ? demoData() : [], false);
      return () => { aktiv = false; };
    }

    if (live) {
      const q = byg(db.ref(path(node)), o);
      const cb = q.on(
        "value",
        (snap) => modtag(laes(snap)),
        (e) => { if (aktiv) fejlet(e); }
      );
      return () => { aktiv = false; q.off("value", cb); };
    }

    (async () => {
      try {
        modtag(await hentListe(db, path, node, o));
      } catch (e) {
        if (!aktiv) return;
        fejlet(e);
      }
    })();

    return () => { aktiv = false; };
  }, [node, ordnPaa, lig, graense, partition, live, fra, til, path, tenantId, nonce, auditerSom, bruger, hent]);

  /* Divisionen filtreres HER, ikke i effekten. Derfor genhenter et skift
     mellem Gods og Bus ikke — det er øjeblikkeligt og koster ingen egress. */
  const data = efterbehandl(raa, {
    ordnPaa, interval, lig, filtrer, sorter, valgtDivision, divisionsTilstand,
  });
  return { data, henter, fejl, tilstand, genindlaes, afkortet };
}
