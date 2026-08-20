/* src/fleet/transportlabel.js
 * Transportlabelen — mærkatet der følger godset. WAREHOUSE.md etape 15.
 *
 * ---------------------------------------------------------------------------
 * ⚠ EN TRANSPORT ER EN ETAPE. Det var det åbne spørgsmål i WAREHOUSE.md 6.4,
 * og det er nu afgjort (beslutning 46): carrieren peger på `etapeId`, og der
 * kommer INGEN transport-node ved siden af etapen.
 *
 * Planchen viste to id-serier på én gang — `TRP-2024-0513` i carrier-tabellen
 * og `BK-2026-0513` på labelen — for det samme: hvilken kørsel godset følger.
 * To poster for én tildeling er prototypens DE-QR 777 mod DE-KL 404, som
 * beslutning 16 lukkede, og beslutning 21 lukkede igen for langturen. Alt en
 * transport har brug for — fraSted, tilSted, etaMs, koeretoejIder, bookingId —
 * står allerede på etapen.
 *
 * ---------------------------------------------------------------------------
 * ⚠ STREGKODEN BÆRER IKKE PLANCHENS NUMMER, OG DET ER MED VILJE.
 *
 * Planchen skriver `BK-2026-0513-C-000245`. Den kode indeholder to opfindelser:
 *
 *   1. `BK-` er et femte nummerformat. Husets bookingnummer er `BKG-ÅÅÅÅ-NNNNN`
 *      fra counteren i beslutning 8 — hele grunden til at der er ét format, er
 *      at der var fire i brug i v2.
 *   2. `C-000245` er et løbenummer for beholderen ved siden af dens id
 *      (`CRR-100245`). Samme kendsgerning, to numre — og så driver de.
 *
 * Koden bygges derfor af de to id'er der ALLEREDE findes og allerede er
 * entydige. En scanning skal kunne slås direkte op; en kode man først skal
 * oversætte, er en kode nogen oversætter forkert.
 *
 * ---------------------------------------------------------------------------
 * ⚠ DER GÆTTES IKKE PÅ EN LABEL. `byggLabel()` svarer `{ felter, mangler }`
 * som `satsOpslag()` svarer `{ sats, mangler }`. Et slutmål der ikke kendes,
 * må ikke blive til afsenderadressen eller til en tom streng: godset kører
 * efter det der står på mærkatet, og en forkert adresse på en palle opdages
 * på rampen i Hamburg, ikke her.
 *
 * INGEN IMPORTS. Som reolplads.js, permissions.js og steder.js — så den kan
 * kopieres til `functions/delt/`, hvis en Cloud Function en dag skal udstede
 * labelen i stedet for skærmen.
 * ---------------------------------------------------------------------------
 */

/* ---- De tre typer ------------------------------------------------------ */

/**
 * Planchens tre transporttyper. Nøglerne er nodeord, `label` er dansk UI.
 *
 * ⚠ TYPEN ER UDLEDT, IKKE ET FELT. Skrev vi den på carrieren, ville den drive
 * fra etapekæden første gang en booking fik en etape mere — `bemanding.ledig`
 * en gang til. Den regnes derfor hver gang, af kæden og af beholderens plads.
 */
export const LABELTYPE = {
  direkte: {
    label: "Direkte A → B",
    beskrivelse: "Ét led. Godset rører aldrig lageret.",
  },
  viaTransit: {
    label: "Via transit → destination",
    beskrivelse: "Godset skifter transport på terminalen og kører videre.",
  },
  storage: {
    label: "Storage via transit",
    beskrivelse: "Godset kom ind via en transit og står på lageret.",
  },
};

export const ALLE_LABELTYPER = Object.keys(LABELTYPE);

export const labeltypeLabel = (n) => LABELTYPE[n]?.label || n;

/** Etaperne i den rækkefølge de køres. `nr` er kædens ledtal. */
export const sorteretKaede = (etaper = []) =>
  [...etaper].sort((a, b) => (a?.nr || 0) - (b?.nr || 0));

/**
 * Hvilken af de tre typer er det?
 *
 * ⚠ FORSKELLEN PÅ viaTransit OG storage ER HYLDEN — ikke en status ved siden
 * af. En beholder der har fået en `pladsId`, er sat på plads; en der kun
 * læsses om på terminalen, får aldrig en. Det er samme svar som WAREHOUSE.md
 * 6.4 gav på "ingen lokation": fraværet af `pladsId` ER tilstanden.
 *
 * `placeret` kan gives med, hvis kaldstedet har set en `putaway` i
 * `bevaegelser` — en beholder der HAR stået på hylden og er kørt videre, har
 * ingen `pladsId` længere, og kun historikken ved det.
 *
 * Svarer `{ type: null, mangler }` når kæden ikke kendes. Der gættes ikke:
 * uden etapen ved vi ikke om godset skal videre.
 */
export function labeltypeFor({ carrier, etaper = [], placeret } = {}) {
  if (!carrier) return { type: null, mangler: "carrier" };

  const kaede = sorteretKaede(etaper);
  if (!kaede.length) return { type: null, mangler: "etape" };
  if (!carrier.etapeId) return { type: null, mangler: "etapeId" };

  const paaKaeden = kaede.some((e) => e?.id === carrier.etapeId);
  if (!paaKaeden) return { type: null, mangler: "etape" };

  /* Ét led: godset kører fra afsender til modtager uden om os. */
  if (kaede.length === 1) return { type: "direkte", mangler: null };

  const staarPaaHylden =
    placeret === undefined ? Boolean(carrier.pladsId) : Boolean(placeret);

  return {
    type: staarPaaHylden ? "storage" : "viaTransit",
    mangler: null,
  };
}

/* ---- Stregkoden -------------------------------------------------------- */

/**
 * `BKG-2026-00317` + `CRR-100245` → `BKG-2026-00317-CRR-100245`.
 *
 * To id'er der allerede er entydige, sat sammen med den samme bindestreg som
 * nummerformatet i beslutning 8 bruger. Ingen ny serie, ingen oversættelse.
 *
 * ⚠ BOOKINGENS NUMMER, IKKE DENS ID. `bk-2026-00311` er en databasenøgle;
 * `BKG-2026-00311` er det nummer kunden og chaufføren taler om. Scannes
 * nøglen, kan den ikke slås op i en mail eller på et fragtbrev.
 */
export function stregkode(bookingNummer, carrierId) {
  if (!bookingNummer || !carrierId) return null;
  return `${bookingNummer}-${carrierId}`;
}

/**
 * Modstykket: en scanning skal kunne opløses igen.
 *
 * ⚠ DER SKILLES VED BEHOLDERENS PRÆFIKS, ikke ved den sidste bindestreg.
 * Bookingnummeret bærer selv to bindestreger, og en beholder hedder altid
 * `CRR-…` — splittes der på tegnet, bliver `BKG-2026-00317` til `BKG-2026`.
 */
export function laesStregkode(kode) {
  if (typeof kode !== "string") return null;
  const skille = kode.lastIndexOf("-CRR-");
  if (skille <= 0) return null;
  return {
    bookingNummer: kode.slice(0, skille),
    carrierId: kode.slice(skille + 1),
  };
}

/* ---- Selve labelen ----------------------------------------------------- */

/**
 * Felterne på mærkatet, og hvad der mangler for at det kan trykkes.
 *
 * Planchens felter: booking, carrier, kunde, fra/transit/slutmål, lokation
 * efter transit og stregkoden.
 *
 * ⚠ `mangler` ER IKKE EN FEJLLISTE, DET ER EN SPÆRRING. `kanTrykkes` er falsk,
 * så længe der er ét felt tilbage. En halv label er værre end ingen: den ser
 * ud som en hel, og godset kører efter den.
 */
export function byggLabel({
  carrier, etaper = [], booking = null, kunde = null, plads = null, placeret,
} = {}) {
  const mangler = [];
  const kaede = sorteretKaede(etaper);
  const { type, mangler: typeMangler } = labeltypeFor({ carrier, etaper, placeret });

  if (typeMangler) mangler.push(typeMangler);

  const foerste = kaede[0] || null;
  const sidste = kaede.length ? kaede[kaede.length - 1] : null;

  /* ⚠ TRANSITTEN ER LEDDETS ENDE, IKKE ET FELT. Et forløb med to etaper
     skifter transport dér hvor den første slutter — og det sted står allerede
     som `tilSted` på etape 1. Et selvstændigt transitfelt ville være det
     samme sted skrevet to gange. */
  const transit = kaede.length > 1 ? foerste?.tilSted || null : null;

  const bookingNummer = booking?.nummer || null;
  if (!bookingNummer) mangler.push("bookingNummer");
  if (!carrier?.id) mangler.push("carrierId");
  if (!kunde?.navn) mangler.push("kunde");
  if (!foerste?.fraSted) mangler.push("fraSted");
  if (!sidste?.tilSted) mangler.push("slutmaal");
  if (kaede.length > 1 && !transit) mangler.push("transit");

  /* Lokationen efter transit står kun på en storage-label — de to andre typer
     ender ikke på en hylde, og et tomt felt på mærkatet læses som "mangler". */
  const lokation = type === "storage" ? plads?.navn || plads?.id || null : null;
  if (type === "storage" && !lokation) mangler.push("lokation");

  return {
    type,
    typeLabel: type ? LABELTYPE[type].label : null,
    felter: {
      bookingNummer,
      carrierId: carrier?.id || null,
      kunde: kunde?.navn || null,
      fraSted: foerste?.fraSted || null,
      transit,
      slutmaal: sidste?.tilSted || null,
      lokation,
      stregkode: stregkode(bookingNummer, carrier?.id),
    },
    mangler,
    kanTrykkes: mangler.length === 0,
  };
}
