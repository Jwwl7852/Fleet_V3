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
 * KENDT HUL: Gods/Bus (beslutning 9) er ikke en del af entitetsmodellen —
 * kun kpi/ er delt på division. Lister er derfor ikke divisionsopdelte. Får
 * kunder, opgaver og køretøjer et division-felt, hører det som ordnPaa+lig
 * eller som et klientsidefilter, ikke som en ny sti.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFleet } from "./FleetContext.jsx";
import { db } from "../firebase.js";

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

/* Klientsidedelen. Køres på BÅDE ægte og demo-data, så en fejl i et filter
   dukker op i demo-mode i stedet for først i produktion. */
function efterbehandl(raekker, { ordnPaa, interval, lig, filtrer, sorter }) {
  let ud = raekker;
  if (ordnPaa && lig === undefined && interval) {
    ud = ud.filter((r) => r[ordnPaa] >= interval.fra && r[ordnPaa] < interval.til);
  }
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
 *     partition    "maaned" — læser /<år>/<måned>/ i vinduet
 *     live         false (once) | true (on + off i cleanup)
 *     demo         array eller () => array, når db er null
 *
 * → { data, henter, fejl, genindlaes, afkortet }
 *
 * afkortet betyder at graense blev ramt og der kan være flere rækker.
 * Skriv det til brugeren — tavs afkortning opdages først når nogen spørger
 * hvorfor en booking mangler.
 */
export function useListe(node, indstillinger = {}) {
  const { periode, path, tenantId } = useFleet();
  const {
    ordnPaa, vindue, lig, fremDage = 30, vindueDage = 0, graense,
    filtrer, sorter, partition, live = false, demo,
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

    const modtag = (raekker) => {
      if (!aktiv) return;
      setRaa(raekker);
      setAfkortet(Boolean(graense) && raekker.length >= graense);
      setHenter(false);
    };

    const demoData = () => {
      const d = demoRef.current;
      return somServeren(typeof d === "function" ? d() : d || [], o);
    };

    if (!db) {
      modtag(demoData());
      return () => { aktiv = false; };
    }

    if (live) {
      const q = byg(db.ref(path(node)), o);
      const cb = q.on(
        "value",
        (snap) => modtag(laes(snap)),
        (e) => { if (aktiv) { setFejl(e); modtag(demoData()); } }
      );
      return () => { aktiv = false; q.off("value", cb); };
    }

    (async () => {
      try {
        modtag(await hentListe(db, path, node, o));
      } catch (e) {
        if (!aktiv) return;
        setFejl(e);
        modtag(demoData());
      }
    })();

    return () => { aktiv = false; };
  }, [node, ordnPaa, lig, graense, partition, live, fra, til, path, tenantId, nonce]);

  return { data: efterbehandl(raa, { ordnPaa, interval, lig, filtrer, sorter }), henter, fejl, genindlaes, afkortet };
}
