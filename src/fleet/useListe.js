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
import { modulerForNode, harModul } from "./moduler.js";
/* ⚠ FORESPØRGSLEN LIGGER I liste.js — uden React, så den kan PRØVES. Hele
   byggeriet var uprøveligt her, fordi filen importerer FleetContext.jsx og
   Node ikke kan indlæse .jsx. Det kostede fem tomme skærme; se noten ved
   byg() derovre. */
import {
  MAX_PARTITIONER, FAELLES, maanedsSegmenter, beregnVindue, byg, laes,
  hentListe, somServeren, efterbehandl,
} from "./liste.js";

export { MAX_PARTITIONER, FAELLES, maanedsSegmenter, hentListe };

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
 * carriers på hylden; hos en kunde uden Unitbooking findes `kasser` ikke,
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
  const { periode, path, tenantId, bruger, moduler } = useFleet();
  const {
    ordnPaa, vindue, lig, fremDage = 30, vindueDage = 0, graense,
    filtrer, sorter,
    partition, live = false, demo, auditerSom, hent = true,
    ...ukendte
  } = indstillinger;

  /* ⚠ `division` VAR EN INDSTILLING HER ("shell" | "alle"), og den er væk med
     beslutning 70. Et kaldsted der stadig sender den, filtrerer ikke noget —
     og det ville være tavst. Derfor fejler den højlydt: konfigurationsfejl er
     statiske pr. kaldsted og skal ses første gang skærmen åbnes. */
  const uventede = Object.keys(ukendte);
  if (uventede.length) {
    throw new Error(
      `useListe("${node}"): ukendte indstillinger: ${uventede.join(", ")}. `
      + "division blev fjernet i beslutning 70 — aksen findes ikke længere."
    );
  }

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
       fandt sted, må ikke registreres som en.

       ⚠ OG DET AFGØRES HER, IKKE PÅ HVERT KALDSTED. Sætningen ovenfor stod
       skrevet fra begyndelsen, og `hent:`-flaget var bygget til netop det —
       men det blev sat **6 steder ud af 36**. De 30 andre spurgte om en node
       et andet modul ejer, uden at vide om kunden havde det.

       En kunde med Fleet men uden Procure fik en `permission-denied` på
       `leverandoerer` hver gang han åbnede Arbejdskøen; en med Planning men
       uden Workforce fik en på `kompetencer` i Disponering. Beslutning 44
       siger hvorfor det ikke går: *"hver sideindlæsning ville udløse en
       håndfuld permission-denied, og en afvisning skal betyde noget."*
       `useKpi()` løser det allerede med `laesbareDomaener()`; det her er den
       samme løsning for lister.

       ⚠ VÆRRE END STØJ: er `auditerSom` sat, skrev hver af de afvisninger en
       **auditpost** om nægtet adgang. Loggen ville fyldes med hændelser der
       ikke er hændelser, og den der en dag leder efter en RIGTIG afvisning,
       skal grave i dem.

       ⚠ EN MANGLENDE `moduler`-NODE BETYDER ALLE. `harModul()` fejler åbent,
       som reglerne gør — ellers ville en kunde oprettet før feltet fandtes
       få tomme lister overalt. Se beslutning 94. */
    const ejere = modulerForNode(node);
    const maaLaese = !ejere || ejere.some((m) => harModul(moduler, m));

    if (!hent || !maaLaese) {
      /* ⚠ TOM AF ÉN GRUND ELLER AF EN ANDEN — og skærmen skal kunne se
         hvilken. `modulMangler` er ikke en fejl og blokerer ikke; den er
         svaret "kunden har ikke købt det her".

         Uden den blev et fravalgt modul til en tom liste, og en tom liste
         ligner data der mangler. Værst i `leverandoerNavn()`, som skrev
         **"ukendt leverandør (lv-hydra)"** på hver eneste værkstedsopgave hos
         en kunde uden Procure — en påstand om at hans data er i stykker.
         Se beslutning 95. */
      setTilstand(maaLaese
        ? { art: TILSTAND.ok, visDemo: false }
        : { art: TILSTAND.modulMangler, visDemo: false, moduler: ejere });
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
  /* ⚠ `moduler` HØRER I DEPS. Konteksten henter den asynkront: uden den
     ville hooken huske sit svar fra før modulerne var kendt, og en kunde
     ville se en tom liste indtil han genindlæste siden. */
  }, [node, ordnPaa, lig, graense, partition, live, fra, til, path, tenantId, nonce, auditerSom, bruger, hent, moduler]);

  /* ⚠ HER STOD DIVISIONSFILTERET, og noten forklarede at et skift mellem Gods
     og Bus var øjeblikkeligt fordi filtreringen lå her og ikke i effekten. Det
     var rigtigt, og hele den optimering er nu overflødig: der er ikke noget at
     skifte mellem. Se beslutning 70. */
  const data = efterbehandl(raa, { ordnPaa, interval, lig, filtrer, sorter });
  /* ⚠ VINDUET GIVES MED TILBAGE. En kalender der kan bladres, kan bladres
     UD af det interval der blev hentet — og så står gitteret tomt uden at
     noget er tomt. Det er tavs afkortning med et ekstra trin, præcis som
     `afkortet` findes for. Skærmen kan nu sige det i stedet for at lade som
     om der ikke er noget. null når vindue:"alle". */
  return { data, henter, fejl, tilstand, genindlaes, afkortet, interval };
}
