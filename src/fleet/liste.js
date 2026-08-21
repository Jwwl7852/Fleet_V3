/* src/fleet/liste.js
 * Forespørgslen bag useListe — uden React.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR DEN BLEV SKILT UD
 *
 * `useListe.js` importerer `FleetContext.jsx`, og Node kan ikke indlæse .jsx.
 * Hele forespørgselsbyggeriet var derfor uprøveligt: der fandtes ikke en test
 * i huset der kunne se hvad der blev sendt til RTDB.
 *
 * Det kostede. `byg()` lagde et `startAt`/`endAt` på en forespørgsel UDEN
 * `orderByChild()`, og dermed på NØGLEN — så fem skærme hentede nul rækker
 * fra en base fuld af data, mens demo-vejen (`somServeren`) gjorde det
 * rigtige og fik det til at se fint ud. Se test/useliste.test.mjs.
 *
 * Det er samme grund som demo-kpi.js, permissions.js og audit-regler.js har:
 * en politik eller en beregning skal kunne læses af en test uden at trække en
 * hel frontend med.
 *
 * INGEN IMPORTS.
 * ---------------------------------------------------------------------------
 */

const DAG = 86400000;

/** Loft på antal månedsopslag. Rammes det, er perioden for bred til en rå
 *  liste — så hører tallet hjemme i kpi/. Vi afkorter ikke i stilhed. */
export const MAX_PARTITIONER = 24;

export const FAELLES = "faelles";

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
export function beregnVindue(vindue, periode, fremDage, vindueDage) {
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
   lidt. Samme retning som vindueDage i hentReservationer().

   ⚠ ET INTERVAL UDEN `ordnPaa` FILTRERER PÅ NØGLEN — og det gav en TOM LISTE.
   Uden orderByChild() ordner RTDB efter nøgle, og `startAt(1786…)` mod nøgler
   som "p-a-01-02" eller "CRR-100245" matcher ingenting. Hver skærm der kaldte
   useListe uden både `ordnPaa` og `vindue: "alle"` — Lokationer, Bevægelser,
   Optælling, Pluk, Standardpriser — hentede derfor NUL rækker.

   Fejlen var usynlig i demo-mode, hvor `somServeren()` nedenfor bruges i
   stedet — og den har ALTID kun anvendt intervallet under `if (ordnPaa)`. De
   to veje sagde hver sit om det samme kald, og det var demo-vejen der havde
   ret. En tom tabel ligner et tomt lager, så ingen så det.

   Vinduet slås derfor fra når der ikke er et felt at lægge det på: et
   tidsinterval uden et tidsfelt er ikke en indsnævring, det er en fejl. */
export function byg(ref, { ordnPaa, interval, lig, graense }) {
  let q = ref;
  if (ordnPaa) q = q.orderByChild(ordnPaa);
  if (lig !== undefined) q = q.equalTo(lig);
  else if (interval && ordnPaa) q = q.startAt(interval.fra).endAt(interval.til);
  if (graense) q = q.limitToLast(graense);
  return q;
}

/** ⚠ id'et kommer af NØGLEN, ikke af værdien. To kilder til samme felt er
 *  præcis den slags der kan nå at blive uenige — og nøglen er den der bruges
 *  i stier. */
export function laes(snap) {
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
  const dele = await Promise.all(
    stier.map((sti) => byg(database.ref(path(sti)), o).once("value")));
  return dele.flatMap(laes);
}

/* Hvad serveren ville have leveret. Kun til demo-data, så et datasæt uden
   database opfører sig som ét med.

   ⚠ DEN HER VAR DEN RIGTIGE HELE TIDEN. Intervallet anvendes kun når der er
   et `ordnPaa` at anvende det på — se noten ved byg(). */
export function somServeren(raekker, { ordnPaa, interval, lig, graense }) {
  let ud = raekker;
  if (ordnPaa) {
    if (lig !== undefined) ud = ud.filter((r) => r[ordnPaa] === lig);
    else if (interval) ud = ud.filter((r) => r[ordnPaa] >= interval.fra && r[ordnPaa] <= interval.til);
    ud = [...ud].sort((a, b) => stigende(a[ordnPaa], b[ordnPaa]));
  }
  if (graense) ud = ud.slice(-graense);
  return ud;
}

/* ⚠ HER LÅ divisionsfilter() — fjernet i beslutning 70.

   Reglen var: den valgte division PLUS fælles, og en post UDEN division i
   BEGGE. Det led var det vigtigste i hele funktionen — beslutning 19 fjernede
   division fra bilerne, og uden det ville biltabellen have stået tom i både
   Gods og Bus uden at nogen havde slettet en bil.

   ⚠ OG DET ER VÆRD AT LÆGGE MÆRKE TIL HVAD DET LED VAR. "Vis den i begge" er
   svaret man giver, når aksen ikke passer på dataene. Det gjaldt stamdata fra
   19, det gjaldt facility, og til sidst gjaldt det flåden og bemandingen
   (beslutning 69). Hver gang aksen ikke passede, var svaret "begge" — og en
   opdeling hvor svaret ofte er "begge", deler ikke noget.

   Aksen er fjernet. Kunden er enten godsvognmand eller busvognmand, og det
   han HAR, står i hans moduler. */

/* Klientsidedelen. Køres på BÅDE ægte og demo-data, så en fejl i et filter
   dukker op i demo-mode i stedet for først i produktion. */
export function efterbehandl(raekker, {
  ordnPaa, interval, lig, filtrer, sorter,
}) {
  let ud = raekker;
  if (ordnPaa && lig === undefined && interval) {
    ud = ud.filter((r) => r[ordnPaa] >= interval.fra && r[ordnPaa] < interval.til);
  }
  if (filtrer) ud = ud.filter(filtrer);
  if (sorter) ud = [...ud].sort(sorter);
  return ud;
}
