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
/* ⚠ ADRESSEN KOMMER FRA STOPPET — beslutning 110. Den laa i `fraAdresse`,
   som var struktureret, valideret og skrevet af ingenting: 2 af 8 etaper
   havde den, og kun denne fil laeste den. Maerkatet trykte altsaa en adresse
   der i praksis aldrig var udfyldt. */
import { stopListe } from "./stop.js";

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

/* ---- Rutelogikken og håndteringsmærkerne ------------------------------- */

/**
 * Linjen "STATUS / RUTELOGIK" nederst på mærkatet. Den er UDLEDT af typen —
 * en gemt tekst ville sige noget andet end ruten første gang en etape kom til.
 */
export const RUTELOGIK = {
  direkte: "Direkte transport fra A til B – ingen transit.",
  viaTransit: "Via transit. Gods sendes A → Transit Hub → B.",
  storage: "Via transit til lageropbevaring. Godset lagres efter ankomst.",
};

/**
 * Håndteringsmærkerne. Nøglerne er nodeord; teksten er den engelske, der står
 * på mærkatet, fordi et håndteringsmærke skal kunne læses på en rampe i
 * Hamborg. Den danske forklaring er til skærmen.
 *
 * ⚠ EN ALLOWLISTE, IKKE FRI TEKST. Reglerne håndhæver den samme liste: et
 * mærke ingen kender, ville blive trykt som et tomt felt på pallen.
 */
export const HAANDTERING = {
  fragile: { label: "FRAGILE", dansk: "Skrøbeligt" },
  denneSideOp: { label: "THIS SIDE UP", dansk: "Denne side op" },
  holdToer: { label: "KEEP DRY", dansk: "Holdes tørt" },
  gaffeltruck: { label: "FORKLIFT HERE", dansk: "Løft med gaffeltruck her" },
  temperatur: { label: "TEMPERATURE SENSITIVE", dansk: "Temperaturfølsomt" },
};

export const ALLE_HAANDTERINGER = Object.keys(HAANDTERING);

/** Mærkerne på beholderen, i katalogets rækkefølge — ikke i nøglernes. */
export const haandteringerFor = (carrier) =>
  ALLE_HAANDTERINGER.filter((m) => carrier?.haandtering?.[m] === true);

/* ---- Adresser og mål --------------------------------------------------- */

/**
 * En adresseblok til mærkatet: navn, gade, "postnr by".
 *
 * ⚠ BYEN KOMMER UDEFRA. Etapen bærer byen som `fraSted`/`tilSted` og adressen
 * uden by — samme kendsgerning må ikke stå to steder. Her sættes de sammen.
 */
/**
 * Adressen på etapens FØRSTE stop af en art — eller null.
 *
 * ⚠ FØRSTE, IKKE SIDSTE. Et multi-drop har flere leveringer, og mærkatet har
 * én celle. Den første er den etapen er navngivet efter; de øvrige står på
 * turplanen, hvor der er plads til dem alle.
 */
function stopAdresse(etape, art) {
  return stopListe(etape).find((s) => s.art === art) || null;
}

export function adresseblok(adresse, by) {
  if (!adresse && !by) return null;
  const postnrBy = [adresse?.postnr, by].filter(Boolean).join(" ");
  return {
    navn: adresse?.navn || null,
    gade: adresse?.gade || null,
    postnrBy: postnrBy || null,
  };
}

/** "120 x 80 x 95 cm" — millimeter er nodens enhed, centimeter er mærkatets. */
export function maalTekst(carrier) {
  const { laengdeMm, breddeMm, hoejdeMm } = carrier || {};
  if (![laengdeMm, breddeMm, hoejdeMm].every((v) => Number.isFinite(v))) return null;
  const cm = (mm) => String(Math.round(mm / 10));
  return `${cm(laengdeMm)} x ${cm(breddeMm)} x ${cm(hoejdeMm)} cm`;
}

/** "3 kolli" eller "8 kolli + 1 stk." — som planchen skriver det. */
export function kolliTekst(carrier) {
  const kolli = carrier?.kolli;
  const loese = carrier?.loesEnheder || 0;
  if (!Number.isFinite(kolli)) return null;
  return loese > 0 ? `${kolli} kolli + ${loese} stk.` : `${kolli} kolli`;
}

/**
 * Serienummer og batch UDLEDES af beholdningen — de er ikke felter på
 * beholderen.
 *
 * ⚠ FLERE ER IKKE ÉT. Bærer beholderen to batches, må mærkatet ikke vælge den
 * ene: svaret er "flere", og så må man slå den op. Et gæt her ville sende en
 * tilbagekaldelse efter det forkerte parti.
 */
export function sporing(poster = []) {
  const unik = (felt) => [...new Set(poster.map((p) => p?.[felt]).filter(Boolean))];
  const batches = unik("batch");
  const serier = unik("serienr");
  const svar = (v) => (v.length === 0 ? null : v.length === 1 ? v[0] : "flere");
  return { batch: svar(batches), serienr: svar(serier) };
}

/* ---- Hvad der er plads til på arket ------------------------------------ */

/**
 * ⚠ MÆRKATET ER 100 × 200 mm, OG DET SÆTTER EN GRÆNSE FOR TEKSTEN.
 *
 * Målt i browseren på den færdige label: fire linjer godsbeskrivelse giver
 * 182,8 mm, og hver linje derefter koster 4,6 mm. Syv linjer er 196,5 mm og
 * passer; otte er 201,1 mm og løber over på etiket nummer to.
 *
 * Godsbeskrivelsen ombrydes ved 61 tegn med små bogstaver. 55 er sat som
 * grænse, fordi store bogstaver og brede tegn ombryder tidligere — et estimat
 * der er for optimistisk, ville lade et mærkat løbe over uden varsel.
 *
 * ⚠ OG DER KLIPPES IKKE. En godsbeskrivelse der bliver forkortet i tavshed,
 * er værre end en der spærrer trykket: "Må ikke vendes" kan stå i den linje
 * der forsvandt. Overskrides grænsen, kommer `godsbeskrivelse` i `mangler`,
 * og knappen er lukket — samme regel som et manglende slutmål.
 */
export const MAKS_GODSLINJER = 7;
export const TEGN_PR_LINJE = 55;

/** Hvor mange linjer fylder beskrivelsen, når den ombrydes? */
export function godsLinjer(tekst) {
  if (!tekst) return 0;
  return String(tekst).split("\n").reduce(
    (sum, linje) => sum + Math.max(1, Math.ceil(linje.length / TEGN_PR_LINJE)),
    0,
  );
}

/* ---- Formularen -------------------------------------------------------- */

/** Reglernes grænse. Står her, så formularen og serveren siger det samme. */
export const MAKS_GODSTEGN = 600;

/**
 * Validering af mærkatets felter på beholderen.
 *
 * ⚠ DEN AFGØR INGENTING — reglerne gør. Den findes for at svare hurtigt, og
 * hvert led her har sit modstykke i `firebase.rules.json` under `carriers`.
 * Er de to uenige, er reglerne rigtige. Se CLAUDE.md.
 *
 * ⚠ VÆGTEN TASTES I KILO OG GEMMES I GRAM. Et komma i en vægt er samme fejl
 * som et komma i et beløb: 74,5 kg bliver til 74 eller 745 alt efter hvem der
 * læser. Derfor tages kilo som tekst her, med både komma og punktum, og
 * omregnes ét sted — `gramFraKilo()`.
 *
 * ⚠ FOR LANG GODSBESKRIVELSE SPÆRRER IKKE FOR AT GEMME. Teksten er lovlig data
 * op til 600 tegn; det er MÆRKATET der kun har plads til syv linjer. To
 * forskellige spørgsmål, og de må ikke blandes: en beskrivelse man ikke kan
 * gemme, ville presse folk til at forkorte den — og så mister lageret
 * oplysningen, ikke bare papiret.
 */
export function valideMaerkatfelter(post = {}) {
  const f = {};
  const heltal = (v) => v === "" || v === null || v === undefined
    ? null
    : Number(String(v).replace(",", "."));

  for (const [felt, navn] of [["kolli", "Kolli"], ["loesEnheder", "Løse enheder"]]) {
    const v = heltal(post[felt]);
    if (v === null) continue;
    if (!Number.isFinite(v)) f[felt] = `${navn} skal være et tal.`;
    else if (v < 0) f[felt] = `${navn} kan ikke være negativt.`;
    else if (v % 1 !== 0) f[felt] = `${navn} tælles i hele stykker.`;
  }

  const kg = heltal(post.vaegtKg);
  if (kg !== null) {
    if (!Number.isFinite(kg)) f.vaegtKg = "Vægten skal være et tal.";
    else if (kg < 0) f.vaegtKg = "Vægten kan ikke være negativ.";
    else if (Math.round(kg * 1000) !== kg * 1000) {
      /* Under ét gram er under termovægtens opløsning — og reglen tager kun
         hele gram. */
      f.vaegtKg = "Vægten kan højst have tre decimaler (ét gram).";
    }
  }

  const tekst = post.godsbeskrivelse || "";
  if (tekst.length > MAKS_GODSTEGN) {
    f.godsbeskrivelse =
      `Godsbeskrivelsen er ${tekst.length} tegn. Der er plads til ${MAKS_GODSTEGN}.`;
  }

  return f;
}

/** Kilo som tekst → hele gram. Null når feltet er tomt. */
export function gramFraKilo(vaegtKg) {
  if (vaegtKg === "" || vaegtKg === null || vaegtKg === undefined) return null;
  const kg = Number(String(vaegtKg).replace(",", "."));
  if (!Number.isFinite(kg)) return null;
  return Math.round(kg * 1000);
}

/** Gram → kilo som tekst til formularen. Komma, som resten af dansk UI. */
export function kiloFraGram(gram) {
  if (!Number.isFinite(gram)) return "";
  const kg = gram / 1000;
  return (Number.isInteger(kg) ? String(kg) : String(kg)).replace(".", ",");
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
  carrier, etaper = [], booking = null, kunde = null, plads = null,
  beholdning = [], placeret,
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
  const harTransit = kaede.length > 1;
  const transitBy = harTransit ? foerste?.tilSted || null : null;

  const bookingNummer = booking?.nummer || null;
  if (!bookingNummer) mangler.push("bookingNummer");
  if (!carrier?.id) mangler.push("carrierId");
  if (!kunde?.navn) mangler.push("kunde");
  if (!foerste?.fraSted) mangler.push("fraSted");
  if (!sidste?.tilSted) mangler.push("slutmaal");
  if (harTransit && !transitBy) mangler.push("transit");

  /* Lokationen efter transit står kun på en storage-label — de to andre typer
     ender ikke på en hylde, og et tomt felt på mærkatet læses som "mangler". */
  const lokation = type === "storage" ? plads?.navn || plads?.id || null : null;
  if (type === "storage" && !lokation) mangler.push("lokation");

  /* Beskrivelsen må ikke skubbe mærkatet ud over de 200 mm — se
     MAKS_GODSLINJER. Der klippes ikke; trykket spærres. */
  const linjer = godsLinjer(carrier?.godsbeskrivelse);
  if (linjer > MAKS_GODSLINJER) mangler.push("godsbeskrivelse");

  const { batch, serienr } = sporing(beholdning);

  return {
    type,
    typeLabel: type ? LABELTYPE[type].label : null,
    rutelogik: type ? RUTELOGIK[type] : null,
    felter: {
      /* Øverste række: de tre numre. */
      bookingNummer,
      carrierId: carrier?.id || null,
      kundeRef: booking?.kundeRef || null,

      /* Kunden og mængden. */
      kunde: kunde?.navn || null,
      kundeAdresse: kunde
        ? adresseblok(
          { gade: kunde.adresse, postnr: kunde.postnr }, kunde.by,
        )
        : null,
      kolli: kolliTekst(carrier),

      /* Ruten — tre celler på de to transit-typer, to på den direkte.

         ⚠ ADRESSEN ER STOPPETS. `adresseblok()` falder tilbage på
         stedsnavnet, så et mærkat på en etape uden stop ser ud som før —
         det er dét der gør ændringen sikker at udrulle. */
      fra: adresseblok(stopAdresse(foerste, "afhentning"), foerste?.fraSted),
      transit: harTransit
        ? adresseblok(stopAdresse(foerste, "levering"), transitBy) : null,
      til: adresseblok(stopAdresse(sidste, "levering"), sidste?.tilSted),
      fraSted: foerste?.fraSted || null,
      transitSted: transitBy,
      slutmaal: sidste?.tilSted || null,
      lokation,

      /* Vægt, mål og sporing. */
      vaegtGram: Number.isFinite(carrier?.vaegtGram) ? carrier.vaegtGram : null,
      maal: maalTekst(carrier),
      batch,
      serienr,

      godsbeskrivelse: carrier?.godsbeskrivelse || null,
      godsLinjer: linjer,
      stregkode: stregkode(bookingNummer, carrier?.id),
    },
    haandtering: haandteringerFor(carrier),
    mangler,
    kanTrykkes: mangler.length === 0,
  };
}
