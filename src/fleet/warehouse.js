/* src/fleet/warehouse.js
 * Warehouse (WMS) — lagerhotel. Kundens gods ind, på plads, ud og afregnet.
 *
 * Se WAREHOUSE.md for hele planen og de spørgsmål der blev afgjort først.
 *
 * ---------------------------------------------------------------------------
 * ⚠ DET ER 3PL. VAREN ER KUNDENS.
 *
 * Warehouse opbevarer ANDRES varer og afregner for håndtering ind, opbevaring
 * og håndtering ud. Det er ikke det samme som `lagre` under Indkøb — dér er
 * varen VORES egen reservedel, og forbruget er en omkostning på en bil. Her er
 * bevægelsen en indtægt.
 *
 * To noder, ikke én med et flag: de to har forskellig ejer, forskellig
 * modpart og forskelligt regnskabsmæssigt fortegn.
 *
 * ---------------------------------------------------------------------------
 * ⚠ `kundeId` STÅR PÅ BEVÆGELSEN, IKKE KUN PÅ VAREN.
 *
 * Det ligner en kopi, og det er det ikke. Bevægelsen er et HISTORISK FAKTUM:
 * hvem varen tilhørte DA den blev flyttet. Skifter en vare ejer — kunden
 * sælger sit lager, eller varen flyttes til et andet kundenummer — må sidste
 * kvartals fakturagrundlag ikke ændre sig med tilbagevirkende kraft.
 *
 * Det er samme grund som at satsen skrives MED på en grundlagslinje frem for
 * at blive slået op igen når fakturaen læses.
 *
 * ---------------------------------------------------------------------------
 * ⚠ BEHOLDNINGEN ER IKKE ET TAL DER TÆLLES OP OG NED.
 *
 * Den er summen af bevægelserne, gemt pr. (plads, vare, batch) af den samme
 * Cloud Function der skriver bevægelsen, i ÉN atomisk skrivning. Der findes
 * ikke et totaltal pr. vare nogen steder — det er en sum, hver gang.
 *
 * Gemtes totalen ved siden af, ville de to drive fra hinanden, og så er det
 * `bemanding.ledig` igen — denne gang med lagerværdi på. Cycle count er
 * derfor ikke pynt: den er den kontrol der beviser at det gemte saldotal
 * stadig svarer til virkeligheden på hylden.
 *
 * INGEN IMPORTS. Filen prøves i Node og kopieres til functions/delt/, fordi
 * serveren skal validere mod NØJAGTIG de samme regler som skærmen viser.
 */

/* ---- Varen ------------------------------------------------------------- */

/**
 * ⚠ ENHEDEN ER IKKE FRITEKST. "stk", "STK", "Stk." og "styk" ville være fire
 * enheder på samme hylde, og en afregning pr. enhed ville lægge dem sammen
 * som om de var det samme.
 */
export const ENHED = {
  stk: { enhed: "stk", label: "Stk.", helTal: true },
  kolli: { enhed: "kolli", label: "Kolli", helTal: true },
  palle: { enhed: "palle", label: "Palle", helTal: true },
  kasse: { enhed: "kasse", label: "Kasse", helTal: true },
  /* ⚠ DE TO HER KAN VÆRE BRØKDELE. 12,5 kg er en gyldig mængde; 12,5 paller
     er det ikke. `helTal` er derfor ikke pynt — den er den validering der
     forhindrer en halv palle i at komme på et fakturagrundlag. */
  kg: { enhed: "kg", label: "Kilo", helTal: false },
  m3: { enhed: "m3", label: "m³", helTal: false },
};

export const ALLE_ENHEDER = Object.keys(ENHED);

/**
 * Hvor fint varen spores.
 *
 * ⚠ VALGET KAN IKKE LAVES OM BAGUD. Sættes en vare op uden batch og får
 * batch et år senere, findes der bevægelser uden batch — og så kan et
 * tilbagekald ikke svare på hvilke kolli der var i det parti. Feltet er
 * derfor en beslutning ved oprettelsen, ikke en indstilling.
 */
export const SPORING = {
  ingen: { sporing: "ingen", label: "Ingen", kraeverBatch: false, kraeverSerie: false },
  batch: { sporing: "batch", label: "Batch / lot", kraeverBatch: true, kraeverSerie: false },
  serie: { sporing: "serie", label: "Serienummer", kraeverBatch: false, kraeverSerie: true },
};

export const ALLE_SPORINGER = Object.keys(SPORING);

/* Bogstaver, tal, bindestreg og underscore. ⚠ IKKE PUNKTUM: batchen indgår i
   en databasenøgle, og RTDB tillader hverken . # $ [ ] eller / i en nøgle. En
   batch med punktum ville give en skrivning der fejler et helt andet sted. */
export const BATCH_MOENSTER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

export function valideVare(post = {}, { kunder = [] } = {}) {
  const f = {};

  if (!post.kundeId) f.kundeId = "Vælg hvilken kunde varen tilhører.";
  else if (kunder.length && !kunder.includes(post.kundeId)) f.kundeId = "Ukendt kunde.";

  if (!post.varenummer?.trim()) f.varenummer = "Varenummer skal udfyldes.";
  else if (post.varenummer.length > 40) f.varenummer = "Højst 40 tegn.";

  if (!post.navn?.trim()) f.navn = "Navn skal udfyldes.";
  else if (post.navn.length > 120) f.navn = "Højst 120 tegn.";

  if (!ALLE_ENHEDER.includes(post.enhed)) f.enhed = "Vælg en enhed.";
  if (!ALLE_SPORINGER.includes(post.sporing)) f.sporing = "Vælg hvordan varen spores.";

  for (const felt of ["laengdeMm", "breddeMm", "hoejdeMm", "vaegtG"]) {
    const v = post[felt];
    if (v == null || v === "") continue;
    /* ⚠ MILLIMETER OG GRAM SOM INTEGER. Samme regel som samletLaengdeMm() i
       flaade.js: en float ved en volumengrænse er en fejl der venter, og
       volumenkalkulatoren skal kunne regne m³ uden at samle afrundinger op. */
    if (!Number.isInteger(v) || v < 0) f[felt] = "Heltal i mm/gram, mindst 0.";
    else if (v > 100000000) f[felt] = "Urealistisk stor.";
  }

  if (post.minimum != null && post.minimum !== "") {
    if (!Number.isInteger(post.minimum) || post.minimum < 0) {
      f.minimum = "Heltal, mindst 0.";
    }
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/** Rumfanget af én enhed i kubikmillimeter, eller null hvis målene mangler. */
export function rumfangMm3(vare = {}) {
  const { laengdeMm: l, breddeMm: b, hoejdeMm: h } = vare;
  if (![l, b, h].every((v) => Number.isInteger(v) && v > 0)) return null;
  return l * b * h;
}

/* ---- Reolpladsen — den DELTE node -------------------------------------- */

/**
 * ⚠ FELTERNE HER ER VALGFRIE, OG DET ER HELE POINTEN.
 *
 * `reolpladser` blev bygget til Turtlebookings transportkasser med
 * `hal · reol · fag · hylde · plads`. Warehouse står på de samme hylder, og
 * derfor blev noden UDVIDET frem for kopieret: to reolnoder ville betyde at
 * "Hal 1 · Reol 2" fandtes to steder der kunne blive uenige, og at en
 * vognmand med begge moduler skulle vedligeholde sit lager to gange.
 *
 * Er felterne påkrævede, går Turtlebooking i stykker. Derfor: valgfrie, og
 * en plads uden dem opfører sig præcis som før.
 */
export const PLADS_TYPE = {
  hylde: { type: "hylde", label: "Hylde" },
  gulvplads: { type: "gulvplads", label: "Gulvplads" },
  bulk: { type: "bulk", label: "Bulk" },
};

export const ALLE_PLADS_TYPER = Object.keys(PLADS_TYPE);

/**
 * ⚠ `karantaene` BLOKERER, DEN ADVARER IKKE. En plads i karantæne må ikke
 * kunne plukkes fra: varen dér er under mistanke, og en pluk der bare
 * advarer, bliver klikket væk. Samme regel som en udløbet kompetence.
 */
export const PLADS_STATUS = {
  aktiv: { status: "aktiv", label: "Aktiv", pill: "ok", kanPlukkes: true },
  karantaene: { status: "karantaene", label: "Karantæne", pill: "bad", kanPlukkes: false },
  lukket: { status: "lukket", label: "Lukket", pill: "info", kanPlukkes: false },
};

export const ALLE_PLADS_STATUS = Object.keys(PLADS_STATUS);

export const kanPlukkesFra = (plads) =>
  PLADS_STATUS[plads?.status ?? "aktiv"]?.kanPlukkes === true;

/** Validering af DE UDVIDEDE felter. Turtlebookings egne prøves i turtlebooking.js. */
export function valideLagerfelter(post = {}) {
  const f = {};

  if (post.zone != null && post.zone !== "") {
    if (typeof post.zone !== "string" || post.zone.length > 40) f.zone = "Højst 40 tegn.";
  }
  if (post.type != null && post.type !== "" && !ALLE_PLADS_TYPER.includes(post.type)) {
    f.type = "Ukendt pladstype.";
  }
  if (post.status != null && post.status !== "" && !ALLE_PLADS_STATUS.includes(post.status)) {
    f.status = "Ukendt status.";
  }
  if (post.temperatur != null && post.temperatur !== "") {
    if (!Number.isFinite(post.temperatur)) f.temperatur = "Temperatur skal være et tal.";
    else if (post.temperatur < -60 || post.temperatur > 80) {
      f.temperatur = "Mellem −60 og 80 grader.";
    }
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/* ---- Bevægelsen — kernen ----------------------------------------------- */

/**
 * ⚠ `fra` OG `til` ER IKKE FRIE FELTER PR. ART.
 *
 * En modtagelse kommer ikke FRA en plads; en afsendelse går ikke TIL en. Stod
 * det ikke skrevet ned, ville en modtagelse med en fra-plads trække varer ud
 * af en hylde der aldrig havde dem — og beholdningen ville gå i minus uden at
 * nogen kunne se hvorfor.
 *
 * `fortegn` siger hvad bevægelsen gør ved beholdningen på hver side.
 */
export const BEVAEGELSE_ART = {
  modtag: {
    art: "modtag", label: "Modtagelse",
    kraeverFraCarrier: false, kraeverTilCarrier: true,
  },
  /* ⚠ PUTAWAY FLYTTER BEHOLDEREN, IKKE GODSET — og det er den ENE art der
     skiftede betydning, da beholdningen flyttede til carrier-niveau.

     Før lå godset på hylden, og en putaway var en beholdningsbevægelse fra
     modtagepladsen til lagerpladsen. Nu ligger godset I carrieren, og
     carrieren står på hylden: at sætte den på plads ændrer `carriers/<id>
     .pladsId` og rører ikke ét eneste beholdningstal.

     Den bliver stående som en bevægelse, fordi den ER en hændelse man skal
     kunne spore — "Placeret på lokation" er linjen på planchen — og fordi
     den er en håndtering der kan afregnes. Men den har hverken vare eller
     antal, og det er derfor `valideBevaegelse()` deler sig i to. */
  putaway: {
    art: "putaway", label: "Placering", flytterCarrier: true,
    kraeverFraCarrier: false, kraeverTilCarrier: false,
  },
  /* ⚠ OG DERFOR ER `flyt` NU OMSTUVNING — gods fra én beholder til en anden.
     At flytte en carrier hen på en anden hylde er en `putaway`; det er den
     samme handling som den første placering, og to arter for det ville være
     to navne for én hændelse. */
  flyt: {
    art: "flyt", label: "Flytning mellem beholdere",
    kraeverFraCarrier: true, kraeverTilCarrier: true,
  },
  pluk: {
    art: "pluk", label: "Pluk",
    kraeverFraCarrier: true, kraeverTilCarrier: true,
  },
  afsend: {
    art: "afsend", label: "Afsendelse",
    kraeverFraCarrier: true, kraeverTilCarrier: false,
  },
  retur: {
    art: "retur", label: "Retur",
    kraeverFraCarrier: false, kraeverTilCarrier: true,
  },
  /* ⚠ OPTÆLLING OG JUSTERING ER TO TING. En optælling er et TAL man har talt
     sig frem til; en justering er en RETTELSE med en årsag. Slås de sammen,
     kan et svind bogføres som "vi talte bare forkert". */
  optael: {
    art: "optael", label: "Optælling",
    kraeverFraCarrier: false, kraeverTilCarrier: true,
  },
  justering: {
    art: "justering", label: "Justering",
    kraeverFraCarrier: false, kraeverTilCarrier: true,
  },
};

export const ALLE_BEVAEGELSE_ARTER = Object.keys(BEVAEGELSE_ART);

/** Arter hvor `antal` er den NYE beholdning frem for en ændring. */
export const ABSOLUTTE_ARTER = ["optael"];

/**
 * ⚠ MÆNGDEN ER SKALERET, OG SKALAEN ER DEN SAMME SOM RESTEN AF HUSET.
 *
 * `ANTAL_SKALA` i beloeb.js er 1000, og den bruges af hver eneste
 * fakturagrundlagslinje. Warehouse afregner pr. håndtering og pr. mængde, og
 * en anden skala her ville fakturere 1000× forkert på den linje der bandt de
 * to sammen. Værdien står med vilje som et TAL og ikke som en import: filen
 * er importfri, fordi den skal kunne kopieres til serveren.
 *
 * Ændres den ét sted, skal den ændres begge — og prøven `samme skala som
 * beloeb.js` fejler hvis ikke.
 */
export const MAENGDE_SKALA = 1000;

export const maengdeFraTal = (n) => Math.round((Number(n) || 0) * MAENGDE_SKALA);
export const talFraMaengde = (m) => (Number(m) || 0) / MAENGDE_SKALA;

export function valideBevaegelse(
  post = {},
  { varer = [], kunder = [], pladser = [], carriers = [], vare = null } = {}
) {
  const f = {};

  const art = BEVAEGELSE_ART[post.art];
  if (!art) f.art = "Vælg en art.";

  /* ⚠ EN PLACERING ER EN ANDEN SLAGS BEVÆGELSE, og derfor deler funktionen
     sig her. Den flytter en BEHOLDER hen på en hylde og rører hverken vare,
     antal eller batch — de felter ville være tomme rubrikker der inviterede
     til at blive udfyldt, og et antal på en placering ville være et tal ingen
     kunne forklare. Se noten ved `putaway` i BEVAEGELSE_ART. */
  if (art?.flytterCarrier) return validePlacering(post, { pladser, carriers });

  if (!post.vareId) f.vareId = "Vælg en vare.";
  else if (varer.length && !varer.includes(post.vareId)) f.vareId = "Ukendt vare.";

  /* ⚠ HISTORISK FAKTUM, IKKE ET OPSLAG. Se hovedet: bevægelsen bærer den
     kunde varen tilhørte DA den skete. */
  if (!post.kundeId) f.kundeId = "Bevægelsen mangler en kunde.";
  else if (kunder.length && !kunder.includes(post.kundeId)) f.kundeId = "Ukendt kunde.";

  if (!Number.isInteger(post.antal)) f.antal = "Mængden mangler.";
  else if (post.antal <= 0 && !ABSOLUTTE_ARTER.includes(post.art)) {
    /* En optælling KAN være nul — hylden var tom. En pluk på nul er en fejl. */
    f.antal = "Mængden skal være større end nul.";
  } else if (post.antal < 0) f.antal = "Mængden kan ikke være negativ.";
  else if (vare && ENHED[vare.enhed]?.helTal && post.antal % MAENGDE_SKALA !== 0) {
    /* ⚠ EN HALV PALLE FINDES IKKE. Uden det her kunne 0,5 palle lande på et
       fakturagrundlag, og ingen ville kunne finde den halve palle på hylden. */
    f.antal = `${ENHED[vare.enhed].label} kan ikke deles.`;
  }

  /* ⚠ GODSET FLYTTER MELLEM BEHOLDERE, IKKE MELLEM HYLDER. Hylden er
     carrierens adresse, ikke godsets — det er hele etape 12. En bevægelse der
     stadig pegede på en plads, ville skrive et beholdningstal et sted hvor
     der ikke ligger noget. */
  if (art?.kraeverFraCarrier && !post.fraCarrierId) {
    f.fraCarrierId = "Vælg hvilken beholder varen tages fra.";
  }
  if (!art?.kraeverFraCarrier && post.fraCarrierId) {
    f.fraCarrierId = `En ${art?.label.toLowerCase() || "bevægelse"} kommer ikke fra en beholder.`;
  }
  if (art?.kraeverTilCarrier && !post.tilCarrierId) {
    f.tilCarrierId = "Vælg hvilken beholder varen lægges i.";
  }
  if (!art?.kraeverTilCarrier && post.tilCarrierId) {
    f.tilCarrierId = `En ${art?.label.toLowerCase() || "bevægelse"} går ikke til en beholder.`;
  }
  for (const felt of ["fraCarrierId", "tilCarrierId"]) {
    if (post[felt] && carriers.length && !carriers.includes(post[felt])) {
      f[felt] = "Ukendt beholder.";
    }
  }
  if (post.fraCarrierId && post.fraCarrierId === post.tilCarrierId) {
    f.tilCarrierId = "Fra og til er den samme beholder.";
  }
  /* ⚠ EN PLADS PÅ EN GODSBEVÆGELSE ER EN REST FRA DEN GAMLE MODEL. Den
     afvises frem for at blive ignoreret: et felt der tages imod og ikke
     bruges, får den næste til at tro at det virker. */
  for (const felt of ["fraPladsId", "tilPladsId"]) {
    if (post[felt]) {
      f[felt] = "Godset ligger i en beholder, ikke på en hylde. Angiv en beholder.";
    }
  }

  /* Sporingen er varens, ikke bevægelsens — men den håndhæves her, fordi det
     er her den kan overtrædes. */
  if (vare) {
    const s = SPORING[vare.sporing];
    if (s?.kraeverBatch && !post.batch) f.batch = "Varen spores på batch.";
    if (s?.kraeverSerie && !post.serienummer) f.serienummer = "Varen spores på serienummer.";
  }
  if (post.batch && !BATCH_MOENSTER.test(post.batch)) {
    f.batch = "Bogstaver, tal, bindestreg og underscore — ikke punktum.";
  }
  if (post.serienummer && post.serienummer.length > 60) f.serienummer = "Højst 60 tegn.";
  if (post.note && post.note.length > 300) f.note = "Højst 300 tegn.";
  if (post.reference && post.reference.length > 60) f.reference = "Højst 60 tegn.";

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/* ---- Beholdningen ------------------------------------------------------ */

/**
 * Sentinel for en vare uden batch.
 *
 * ⚠ EN TOM STRENG KAN IKKE VÆRE EN RTDB-NØGLE, og `null` kan heller ikke. Uden
 * en sentinel ville nøglen for en usporet vare være ugyldig, og skrivningen
 * ville fejle et helt andet sted end der hvor fejlen blev lavet.
 */
export const UDEN_BATCH = "_";

/**
 * Nøglen til en beholdningspost.
 *
 * ⚠ SAMMENSAT OG DETERMINISTISK, så serveren kan skrive direkte uden først at
 * slå op — og så den samme (plads, vare, batch) ALDRIG kan få to poster. To
 * poster for samme hylde og vare er DE-QR 777 mod DE-KL 404 igen, denne gang
 * med et lagertal.
 */
export const beholdningsNoegle = (carrierId, vareId, batch) =>
  `${carrierId}__${vareId}__${batch || UDEN_BATCH}`;

/**
 * Placeringen — carrieren sættes på en hylde.
 *
 * ⚠ EN PLACERING HAR HVERKEN VARE ELLER ANTAL. Den flytter beholderen med alt
 * hvad der er i den, og godset skifter ikke ejer, mængde eller batch af at
 * blive båret hen på en anden hylde. Et antal her ville være et tal ingen
 * kunne forklare bagefter.
 */
export function validePlacering(post = {}, { pladser = [], carriers = [] } = {}) {
  const f = {};

  if (!post.carrierId) f.carrierId = "Vælg beholderen der skal placeres.";
  else if (carriers.length && !carriers.includes(post.carrierId)) {
    f.carrierId = "Ukendt beholder.";
  }

  if (!post.tilPladsId) f.tilPladsId = "Vælg hvor beholderen sættes.";
  else if (pladser.length && !pladser.includes(post.tilPladsId)) {
    f.tilPladsId = "Ukendt reolplads.";
  }

  /* ⚠ FELTER DER IKKE HØRER TIL, AFVISES. En placering med et antal ville
     ligne en beholdningsbevægelse — og den næste der læste posten, ville tro
     at der var flyttet gods. */
  for (const felt of ["vareId", "antal", "batch", "fraCarrierId", "tilCarrierId"]) {
    if (post[felt] != null && post[felt] !== "") {
      f[felt] = "En placering flytter beholderen, ikke godset i den.";
    }
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/**
 * Hvad bevægelsen gør ved beholdningen: en liste af (nøgle, ændring).
 *
 * ⚠ DEN HER AFGØR INGENTING — den svarer. Håndhævelsen hører i den Cloud
 * Function der skriver bevægelsen: beholdningen og bevægelsen skal skrives
 * sammen eller slet ikke, og to lagermænd kan ramme samme sekund. Samme
 * forbehold som `konflikter()` i turtlebooking.js.
 *
 * `optael` er absolut: `antal` ER den nye beholdning, ikke en ændring. Derfor
 * bærer den `saet` frem for `aendring`, og kalderen skal kende forskellen.
 */
export function virkningPaaBeholdning(post = {}) {
  const batch = post.batch || UDEN_BATCH;
  const ud = [];

  /* ⚠ EN PLACERING RØRER INGEN SALDO. Beholderen flytter med alt hvad der er
     i den; tallene følger med uden at blive skrevet om. Det er hele gevinsten
     ved at lægge beholdningen på carrieren — før var en flytning N
     saldoændringer der skulle lykkes sammen, og atomiciteten var kun delvis. */
  if (BEVAEGELSE_ART[post.art]?.flytterCarrier) return ud;

  if (ABSOLUTTE_ARTER.includes(post.art)) {
    ud.push({
      noegle: beholdningsNoegle(post.tilCarrierId, post.vareId, batch),
      carrierId: post.tilCarrierId, vareId: post.vareId, batch,
      saet: post.antal,
    });
    return ud;
  }

  if (post.fraCarrierId) {
    ud.push({
      noegle: beholdningsNoegle(post.fraCarrierId, post.vareId, batch),
      carrierId: post.fraCarrierId, vareId: post.vareId, batch,
      aendring: -post.antal,
    });
  }
  if (post.tilCarrierId) {
    ud.push({
      noegle: beholdningsNoegle(post.tilCarrierId, post.vareId, batch),
      carrierId: post.tilCarrierId, vareId: post.vareId, batch,
      aendring: post.antal,
    });
  }
  return ud;
}

/**
 * Hvad en placering gør ved carrieren — eller `null`.
 *
 * ⚠ SAMME FORBEHOLD SOM virkningPaaBeholdning(): den AFGØR ingenting. Den
 * svarer. Håndhævelsen hører i den Cloud Function der skriver bevægelsen, hvor
 * placeringen og bevægelsen lander i ÉN skrivning — ellers står carrieren et
 * sted uden at nogen kan se hvornår den kom.
 */
export function virkningPaaCarrier(post = {}) {
  if (!BEVAEGELSE_ART[post.art]?.flytterCarrier) return null;
  if (!post.carrierId || !post.tilPladsId) return null;
  return { carrierId: post.carrierId, pladsId: post.tilPladsId };
}

/**
 * Beholdningen pr. vare — SUMMERET, aldrig gemt.
 *
 * ⚠ DER FINDES IKKE ET TOTALTAL. Gemtes summen ved siden af posterne, ville
 * de to drive fra hinanden ved den første skrivning der ramte den ene og ikke
 * den anden. Det er `bemanding.ledig` igen, denne gang med lagerværdi på.
 */
export function beholdningPrVare(poster = []) {
  const ud = {};
  for (const p of poster) {
    if (!p?.vareId) continue;
    ud[p.vareId] = (ud[p.vareId] || 0) + (p.antal || 0);
  }
  return ud;
}

/** Beholdningen i én beholder, pr. vare og batch. */
export const beholdningPaaCarrier = (poster = [], carrierId) =>
  poster.filter((p) => p.carrierId === carrierId && (p.antal || 0) !== 0);

/**
 * Beholdningen på én hylde — gennem de beholdere der står på den.
 *
 * ⚠ TO LED, OG DET ER MED VILJE. Godset ligger i en carrier, carrieren står
 * på en plads. Gemte vi pladsen PÅ beholdningsposten også, ville den drive
 * fra carrieren første gang nogen flyttede beholderen — og så ville en hylde
 * vise varer der fysisk stod et andet sted. Det er `bemanding.ledig` igen.
 */
export function beholdningPaaPlads(poster = [], pladsId, carriers = []) {
  const paaPladsen = new Set(
    carriers.filter((c) => c.pladsId === pladsId).map((c) => c.id));
  return poster.filter((p) => paaPladsen.has(p.carrierId) && (p.antal || 0) !== 0);
}

/**
 * Varer under deres minimum. Grundlaget for genbestillingsalerts.
 *
 * ⚠ EN VARE UDEN `minimum` ER IKKE LAV — den er uden grænse. Uden det her
 * ville hver eneste vare uden opsætning stå som en alarm, og så læser ingen
 * listen. Samme grund som `MINDSTE_GRUNDLAG` i leverandoerer.js.
 */
export function underMinimum(varer = [], poster = []) {
  const total = beholdningPrVare(poster);
  return varer
    .filter((v) => Number.isInteger(v.minimum) && v.minimum > 0)
    .map((v) => ({ vare: v, beholdning: total[v.id] || 0 }))
    .filter((r) => r.beholdning < r.vare.minimum * MAENGDE_SKALA)
    .sort((a, b) => a.beholdning / a.vare.minimum - b.beholdning / b.vare.minimum);
}

/* ---- Svaret fra bevaegelseskriv ---------------------------------------- */

/**
 * ⚠ TOLKNINGEN LIGGER HER OG IKKE I EN EGEN `-regler.js`-FIL.
 *
 * Mønstret i huset er politik i `*-regler.js` og transport i `*.js`. Her ER
 * `warehouse.js` politikfilen: den er importfri, prøves i Node og kopieres til
 * serveren. En femte regler-fil ville have været en fil mere at holde ved lige
 * for tyve linjer, og teksterne hører sammen med den model de forklarer.
 *
 * ⚠ EN AFVIST BEVÆGELSE ER IKKE EN NETVÆRKSFEJL. `failed-precondition`
 * betyder at lageret siger fra — der er ikke dækning, eller pladsen er i
 * karantæne. "Prøv igen" ville lære brugeren at systemet er i stykker.
 */
export const LAGERSVAR = {
  ok: "ok",
  /* Lageret sagde fra. Serverens egen tekst ER svaret: hvor meget der står,
     og hvorfor der ikke kan tages mere. */
  afvist: "afvist",
  naegtet: "naegtet",
  ugyldig: "ugyldig",
  forbindelse: "forbindelse",
  demo: "demo",
};

const LAGERBESKED = {
  [LAGERSVAR.naegtet]:
    "Du må ikke registrere bevægelser her. Serveren afviste — det er ikke en fejl.",
  [LAGERSVAR.ugyldig]:
    "Serveren afviste formen på det der blev sendt. Det er en fejl hos os, og " +
    "den bliver ikke bedre af at prøve igen.",
  [LAGERSVAR.forbindelse]:
    "Kunne ikke nå serveren. Intet blev registreret. Prøv igen.",
  [LAGERSVAR.demo]:
    "Demo-tilstand: der er ingen server, så intet blev registreret.",
};

export const lagerBesked = (art) => LAGERBESKED[art] || null;

export function tolkLagerfejl(fejl) {
  const kode = String(fejl?.code || "").replace(/^functions\//, "");
  const besked = fejl?.message || null;

  if (kode === "permission-denied" || kode === "unauthenticated") {
    return { art: LAGERSVAR.naegtet, besked: besked || LAGERBESKED[LAGERSVAR.naegtet] };
  }
  /* ⚠ SERVERENS EGEN TEKST. Den siger hvor meget der står på hylden. */
  if (kode === "failed-precondition") return { art: LAGERSVAR.afvist, besked };
  if (kode === "invalid-argument" || kode === "not-found") {
    return { art: LAGERSVAR.ugyldig, besked: besked || LAGERBESKED[LAGERSVAR.ugyldig] };
  }
  return { art: LAGERSVAR.forbindelse, besked: LAGERBESKED[LAGERSVAR.forbindelse] };
}

/* ══════════════════════════════════════════════════════════════════════════
   PLUKORDREN — det udgående flow
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DEN HEDDER `plukordrer` OG IKKE `ordrer`. Plancherne siger "Ordrer", men
   `bookinger` er allerede en ORDRE i dette hus: en transportopgave med etaper,
   køretøj og chauffør (beslutning 16 og 21). En plukordre er noget andet — den
   siger hvad der skal UD AF LAGERET, ikke hvem der kører det hvorhen. En 3PL
   der både opbevarer og kører, har begge dele, og de må kunne skelnes.

   ⚠ FREMDRIFTEN ER UDLEDT, IKKE GEMT. Hvor meget der er plukket på en linje,
   regnes af de BEVÆGELSER der peger på ordren — ikke af et `plukketAntal` på
   linjen. Et gemt tal ville drive fra bevægelserne ved den første pluk der
   ramte den ene og ikke den anden, og så ville en ordre se færdig ud mens
   varerne stod på hylden. Det er `bemanding.ledig` igen.

   ⚠ PLUK FLYTTER, DET FJERNER IKKE. En pluk går FRA lagerbeholderen TIL en
   afsendelsesbeholder. Først afsendelsen tager varen ud af huset. Var pluk en
   ren fjernelse, ville der være et hul mellem hylden og bilen hvor godset
   ikke stod nogen steder — og det er præcis dér det bliver væk.
   ══════════════════════════════════════════════════════════════════════════ */

export const ORDRE_TILSTAND = {
  kladde: { tilstand: "kladde", label: "Kladde", pill: "info", kanPlukkes: false },
  frigivet: { tilstand: "frigivet", label: "Frigivet", pill: "warn", kanPlukkes: true },
  afsendt: { tilstand: "afsendt", label: "Afsendt", pill: "ok", kanPlukkes: false },
  annulleret: { tilstand: "annulleret", label: "Annulleret", pill: "bad", kanPlukkes: false },
};

export const ALLE_ORDRE_TILSTANDE = Object.keys(ORDRE_TILSTAND);

/**
 * ⚠ `afsendt` STÅR IKKE PÅ LISTEN, OG DET ER HELE POINTEN.
 *
 * En ordre bliver afsendt fordi varerne FORLADER huset — altså fordi der
 * skrives afsendelsesbevægelser. Kunne en klient sætte tilstanden direkte,
 * ville en ordre kunne meldes afsendt uden at en eneste palle var rørt, og
 * lageret ville stadig stå med godset. Reglerne håndhæver listen; serveren
 * går uden om den, fordi den skriver bevægelserne i samme ombæring.
 *
 * Samme greb som `SELVVALGT_KASSE_STATUS` i turtlebooking.js.
 */
export const KLIENT_ORDRE_TILSTANDE = ["kladde", "frigivet", "annulleret"];

export const ORDRE_SKIFT = {
  kladde: ["frigivet", "annulleret"],
  /* ⚠ TILBAGE TIL KLADDE ER TILLADT — men kun så længe intet er plukket.
     Det håndhæves af `kanFortrydeFrigivelse()`, ikke af tabellen: en ordre
     med varer på afsendelsespladsen kan ikke bare lukkes ned igen. */
  frigivet: ["kladde", "afsendt", "annulleret"],
  afsendt: [],
  annulleret: [],
};

export const kanSkifteOrdre = (fra, til) =>
  Array.isArray(ORDRE_SKIFT[fra]) && ORDRE_SKIFT[fra].includes(til);

export const PRIORITET = {
  lav: { prioritet: "lav", label: "Lav", pill: "info", vaegt: 3 },
  normal: { prioritet: "normal", label: "Normal", pill: "info", vaegt: 2 },
  hoej: { prioritet: "hoej", label: "Høj", pill: "bad", vaegt: 1 },
};

export const ALLE_PRIORITETER = Object.keys(PRIORITET);

export function valideOrdre(post = {}, { kunder = [], varer = [], carriers = [] } = {}) {
  const f = {};

  if (!post.kundeId) f.kundeId = "Vælg hvilken kunde ordren er til.";
  else if (kunder.length && !kunder.includes(post.kundeId)) f.kundeId = "Ukendt kunde.";

  if (!post.nummer?.trim()) f.nummer = "Ordrenummer skal udfyldes.";
  else if (post.nummer.length > 40) f.nummer = "Højst 40 tegn.";

  if (!ALLE_PRIORITETER.includes(post.prioritet)) f.prioritet = "Vælg en prioritet.";
  if (!ALLE_ORDRE_TILSTANDE.includes(post.tilstand)) f.tilstand = "Vælg en tilstand.";

  if (!Number.isFinite(post.afgangMs)) f.afgangMs = "Vælg en afgangsdato.";

  /* ⚠ AFSENDELSESBEHOLDEREN ER PÅKRÆVET. En pluk flytter varen HEN et sted;
     uden den ville plukket ikke vide hvad godset skal ligge i, indtil bilen
     kommer. Det var en PLADS indtil etape 12 — nu ligger alt gods i en
     beholder, og afsendelsesstedet er ikke en undtagelse. */
  if (!post.afsendCarrierId) f.afsendCarrierId = "Vælg hvad det plukkede lægges i.";
  else if (carriers.length && !carriers.includes(post.afsendCarrierId)) {
    f.afsendCarrierId = "Ukendt beholder.";
  }

  const linjer = Object.values(post.linjer || {});
  if (!linjer.length) f.linjer = "Ordren har ingen linjer.";
  for (const l of linjer) {
    if (!l?.vareId || (varer.length && !varer.includes(l.vareId))) {
      f.linjer = "En linje peger på en vare der ikke findes.";
      break;
    }
    if (!Number.isInteger(l.antal) || l.antal <= 0) {
      f.linjer = "En linje mangler en mængde.";
      break;
    }
  }

  if (post.note && post.note.length > 300) f.note = "Højst 300 tegn.";

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/**
 * Hvor meget der er plukket pr. vare på en ordre — UDLEDT af bevægelserne.
 *
 * ⚠ AFSENDELSER TÆLLER IKKE MED SOM PLUK. De to arter peger begge på ordren,
 * og lagde man dem sammen, ville en fuldt plukket og afsendt ordre se ud som
 * om der var plukket dobbelt.
 */
export function plukketPrVare(bevaegelser = [], ordreId) {
  const ud = {};
  for (const b of bevaegelser) {
    if (b.reference !== ordreId || b.art !== "pluk") continue;
    ud[b.vareId] = (ud[b.vareId] || 0) + (b.antal || 0);
  }
  return ud;
}

/**
 * Ordrens fremdrift: hver linje med bestilt, plukket og resten.
 *
 * ⚠ `mangler` KAN IKKE BLIVE NEGATIV her, men et OVERPLUK kan godt opstå — en
 * scanner kan læse den samme palle to gange. Det skal kunne SES frem for at
 * blive klippet væk, og derfor bærer linjen `plukket` råt.
 */
export function ordreFremdrift(ordre = {}, bevaegelser = []) {
  const plukket = plukketPrVare(bevaegelser, ordre.id);
  const linjer = Object.entries(ordre.linjer || {}).map(([id, l]) => {
    const p = plukket[l.vareId] || 0;
    return {
      id, ...l, plukket: p,
      mangler: Math.max(0, (l.antal || 0) - p),
      overplukket: Math.max(0, p - (l.antal || 0)),
    };
  });
  const bestiltIalt = linjer.reduce((s, l) => s + (l.antal || 0), 0);
  const plukketIalt = linjer.reduce((s, l) => s + Math.min(l.plukket, l.antal || 0), 0);
  return {
    linjer,
    bestiltIalt,
    plukketIalt,
    /* 0 bestilt giver 0 — ikke NaN og ikke 100 %. En tom ordre er ikke færdig. */
    andel: bestiltIalt > 0 ? plukketIalt / bestiltIalt : 0,
    faerdig: bestiltIalt > 0 && plukketIalt >= bestiltIalt,
    harOverpluk: linjer.some((l) => l.overplukket > 0),
  };
}

/**
 * ⚠ EN FRIGIVET ORDRE MED PLUK PÅ KAN IKKE TRÆKKES TILBAGE TIL KLADDE.
 * Varerne står på afsendelsespladsen; lukkes ordren ned, står de dér uden en
 * ordre der forklarer hvorfor. De skal føres tilbage først — som bevægelser,
 * så historikken viser at de var ude og kom tilbage.
 */
export const kanFortrydeFrigivelse = (fremdrift) =>
  (fremdrift?.plukketIalt || 0) === 0;

/** Ordrer der venter på at blive plukket, vigtigst først. */
export const plukkoe = (ordrer = []) =>
  ordrer
    .filter((o) => ORDRE_TILSTAND[o.tilstand]?.kanPlukkes)
    .sort((a, b) =>
      (PRIORITET[a.prioritet]?.vaegt ?? 9) - (PRIORITET[b.prioritet]?.vaegt ?? 9) ||
      (a.afgangMs || 0) - (b.afgangMs || 0));

/* ══════════════════════════════════════════════════════════════════════════
   OPTÆLLINGEN — beviset for at beholdningen passer
   ══════════════════════════════════════════════════════════════════════════

   ⚠ HVORFOR DET IKKE ER NOK MED EN `optael`-BEVÆGELSE.

   Bevægelsen sætter den nye saldo, og den er nødvendig. Men den siger ikke
   hvad der var FORVENTET — og uden det tal kan ingen bagefter svare på om
   lageret passer. "Vi talte 118" er ikke en måling; "vi forventede 128 og
   talte 118" er.

   Derfor er `optaellinger` sin egen node, med forventet, talt og afvigelse
   gemt SOM DE VAR i det øjeblik der blev talt. Det ligner et afledt tal og er
   det ikke: forventningen kan ikke regnes ud bagefter uden at afspille hver
   eneste bevægelse — og var den regnet ud bagefter, ville den afspejle
   nutiden frem for tælletidspunktet. Samme slags som `udleveretMs`.

   ⚠ FORVENTNINGEN LÆSES AF SERVEREN, ALDRIG AF KLIENTEN.
   Sendte skærmen den med, ville afvigelsen være forskellen mellem hvad
   brugeren TROEDE der stod, og hvad han talte — og så måler den ingenting.

   ⚠ EN AFVIGELSE SKAL HAVE EN ÅRSAG, OG ÅRSAGEN ER EN ALLOWLISTE.
   Fritekst kan ikke summeres: "svind" og "Svind?" og "vist nok stjålet"
   bliver tre kategorier, og så kan ingen se om det er det samme problem.
   Samme grund som `LOGBARE_FELTER` i audit-regler.js.

   ⚠ MEN OPTÆLLINGEN BLOKERES IKKE AF EN STOR AFVIGELSE.
   Det er fristende at kræve godkendelse over en grænse. Det ville betyde at
   den der finder det største hul, er den der ikke kan lukke sin optælling —
   og så bliver der talt mindre. Hylden er sandheden; rettelsen sker med det
   samme, og afvigelsen står som sin egen kendsgerning der ikke kan slettes.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ `ukendt` STÅR MED VILJE PÅ LISTEN. Tvinges folk til at vælge en årsag de
 * ikke kender, vælger de en tilfældig — og så er statistikken værre end
 * ingen. En ærlig "ukendt" kan tælles for sig og undersøges.
 */
export const AFVIGELSESAARSAG = {
  svind: { aarsag: "svind", label: "Svind", tone: "bad" },
  fejlpluk: { aarsag: "fejlpluk", label: "Fejlpluk", tone: "warn" },
  fejlmodtagelse: { aarsag: "fejlmodtagelse", label: "Fejl ved modtagelse", tone: "warn" },
  skade: { aarsag: "skade", label: "Skade / kassation", tone: "bad" },
  fundet: { aarsag: "fundet", label: "Fundet igen", tone: "ok" },
  tastefejl: { aarsag: "tastefejl", label: "Tastefejl", tone: "info" },
  ukendt: { aarsag: "ukendt", label: "Ukendt", tone: "info" },
};

export const ALLE_AFVIGELSESAARSAGER = Object.keys(AFVIGELSESAARSAG);

export function valideOptaelling(post = {}, { vare = null } = {}) {
  const f = {};

  /* ⚠ DER TÆLLES I EN BEHOLDER, IKKE PÅ EN HYLDE. Det er beholderen der
     bærer godset, og en optælling af "hylden" ville skulle summere alt hvad
     der stod på den — og så kunne en afvigelse ikke henføres til den beholder
     hvor den opstod. Hylden findes stadig: den er carrierens adresse. */
  if (!post.carrierId) f.carrierId = "Vælg beholderen der tælles.";
  if (!post.vareId) f.vareId = "Vælg en vare.";

  if (!Number.isInteger(post.taeltAntal)) f.taeltAntal = "Skriv hvad der blev talt.";
  else if (post.taeltAntal < 0) f.taeltAntal = "En optælling kan ikke være negativ.";
  else if (vare && ENHED[vare.enhed]?.helTal && post.taeltAntal % MAENGDE_SKALA !== 0) {
    f.taeltAntal = `${ENHED[vare.enhed].label} kan ikke deles.`;
  }

  if (post.batch && !BATCH_MOENSTER.test(post.batch)) {
    f.batch = "Bogstaver, tal, bindestreg og underscore — ikke punktum.";
  }
  if (vare && SPORING[vare.sporing]?.kraeverBatch && !post.batch) {
    f.batch = "Varen spores på batch — tæl ét parti ad gangen.";
  }

  /* ⚠ ÅRSAGEN KRÆVES KUN NÅR DER ER EN AFVIGELSE, og kun når klienten kender
     den. Serveren prøver igen med sin EGEN forventning — se noten i hovedet
     om hvorfor klientens forventning ikke tæller. */
  if (Number.isFinite(post.forventet) && post.forventet !== post.taeltAntal) {
    if (!ALLE_AFVIGELSESAARSAGER.includes(post.aarsag)) {
      f.aarsag = "En afvigelse skal have en årsag.";
    }
  } else if (post.aarsag && !ALLE_AFVIGELSESAARSAGER.includes(post.aarsag)) {
    f.aarsag = "Ukendt årsag.";
  }

  if (post.note && post.note.length > 300) f.note = "Højst 300 tegn.";

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/**
 * Lagernøjagtighed: andelen af optællinger der ramte plet.
 *
 * ⚠ DEN MÅLER OS, IKKE LAGERET. Falder den, er det fordi bevægelser ikke
 * bliver registreret — ikke fordi hylderne opfører sig dårligt.
 *
 * ⚠ RETURNERER null UNDER `MINDSTE_OPTAELLINGER`. To optællinger og to
 * hundrede ser ens ud som en procent, og så skiftes der arbejdsgang på
 * grundlag af én uenighed. Samme regel som `MINDSTE_GRUNDLAG` i
 * leverandoerer.js — skærmen skal skrive "for lidt grundlag", ikke en streg.
 */
export const MINDSTE_OPTAELLINGER = 10;

export function noejagtighed(optaellinger = []) {
  const n = optaellinger.length;
  if (n < MINDSTE_OPTAELLINGER) return null;
  const ramte = optaellinger.filter((o) => (o.afvigelse || 0) === 0).length;
  return ramte / n;
}

/** Afvigelserne fordelt på årsag, størst først. Grundlaget for at handle. */
export function afvigelserPrAarsag(optaellinger = []) {
  const ud = {};
  for (const o of optaellinger) {
    if (!o.afvigelse) continue;
    const a = ALLE_AFVIGELSESAARSAGER.includes(o.aarsag) ? o.aarsag : "ukendt";
    ud[a] = ud[a] || { aarsag: a, antal: 0, sum: 0 };
    ud[a].antal += 1;
    /* Summen er FORTEGNSBÆRENDE: fundet og svind må ikke udligne hinanden i
       antal, men i mængde er det netop forskellen der er interessant. */
    ud[a].sum += o.afvigelse;
  }
  return Object.values(ud).sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
}

/** Hvor længe en lokation må gå uden at blive talt. */
export const OPTAELLINGSINTERVAL_DAGE = 90;

/**
 * Lokationer der skal tælles — vigtigst først.
 *
 * ⚠ EN NEGATIV SALDO ER ALTID FORFALDEN, uanset hvornår der sidst blev talt.
 * Den er beviset på at en bevægelse mangler, og den fejl vokser indtil nogen
 * går ud og kigger. Se noten i functions/index.js om vinduet der ikke kan
 * lukkes med en transaktion.
 */
export function forfaldneOptaellinger(beholdning = [], optaellinger = [], naa = 0) {
  const senest = {};
  for (const o of optaellinger) {
    const n = beholdningsNoegle(o.carrierId, o.vareId, o.batch);
    senest[n] = Math.max(senest[n] || 0, o.tidspunktMs || 0);
  }
  const graense = naa - OPTAELLINGSINTERVAL_DAGE * 86400000;
  return beholdning
    .map((b) => ({
      ...b,
      /* ⚠ NØGLEN REGNES AF FELTERNE, IKKE AF `b.id`. De to er de samme i
         databasen — id'et ER den sammensatte nøgle — men en funktion der
         stoler på det, går i stykker første gang nogen loader posterne på en
         anden måde. Og fejlen ville være tavs: alt ville se forfaldent ud,
         og ingen ville undre sig over at der skulle tælles. */
      senestOptaltMs: senest[beholdningsNoegle(b.carrierId, b.vareId, b.batch)] || null,
      negativ: (b.antal || 0) < 0,
    }))
    .filter((b) => b.negativ || !b.senestOptaltMs || b.senestOptaltMs < graense)
    .sort((a, b) =>
      (b.negativ ? 1 : 0) - (a.negativ ? 1 : 0) ||
      (a.senestOptaltMs || 0) - (b.senestOptaltMs || 0));
}

/* ══════════════════════════════════════════════════════════════════════════
   RATERNE OG AFREGNINGEN
   ══════════════════════════════════════════════════════════════════════════

   ⚠ RATERNE DEFINERES PÅ KUNDEN, I KUNDER & PRISER — IKKE HER.

   Der er to slags priser i platformen, og de må ikke blandes sammen:

     · UDBYDERENS priser på modulerne (`udbyder/prisliste`). Dem sætter vi
       som ejere, og de handler om hvad abonnementet koster.
     · KUNDENS priser til SIN kunde. Dem sætter vognmanden selv, og de
       defineres ét sted: på kunden i Kunder & Priser. Det gælder ALLE
       kundens priser — også lagerydelserne.

   Plancherne har en selvstændig "Rater & afregning"-skærm. Den bygges IKKE:
   den ville være et andet sted at sætte den samme slags pris, og så ville en
   vognmand skulle vedligeholde sine priser to steder.

   ⚠ OG SATSOPSLAGET SKRIVES IKKE AF. `satsPaa()` i pricing.js er husets ene
   funktion til "hvilken sats gjaldt på det her tidspunkt", og den bærer
   allerede reglen om at satser aldrig overskrives (beslutning 7). Filen her
   er importfri og kan ikke importere den — derfor tager `afregningslinjer()`
   opslaget som en PARAMETER frem for at lave sin egen. En kopi ville være to
   steder der afgør hvilken pris der gjaldt.

   ⚠ pricing.js KAN I FORVEJEN LAGERDØGN. `METODER.prLagerdoegn`,
   `lagerdoegn()` (påbegyndte døgn, rundet OP) og `lagerUd()` findes og er
   prøvet. Opbevaringsafregningen skal bygge på dem — ikke på noget nyt.

   ---------------------------------------------------------------------------
   ⚠ TO TING KAN IKKE REGNES BAGUD, OG DE ER IKKE BYGGET HER.

   1. OPBEVARING PR. PALLE PR. DAG kræver en daglig måling af hvad der stod på
      lageret. Den kan ikke rekonstrueres troværdigt bagefter: bevægelser kan
      være registreret for sent, og en genberegning ville give et andet tal
      hver gang historikken blev rettet. Det er samme lærestreg som
      `maalnu` — målingen kan ikke laves bagud.

   2. HVOR AFREGNINGEN SKAL LANDE. `grundlag.js` bygger et fakturagrundlag,
      men `byggGrundlag()` KASTER uden et `bookingId`: "et grundlag hører til
      et forløb". En lagerafregning har ingen booking — den har en periode og
      en kunde. Og den tenant-nære `fakturagrundlag`-node findes slet ikke
      endnu; `Fakturering.jsx` læser demo-data.

   Derfor regner det her modul HÅNDTERINGEN — den kan udledes af bevægelserne,
   som bærer deres eget tidsstempel — og stopper før dokumentet. Se WAREHOUSE.md.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * De ydelser der kan afregnes.
 *
 * ⚠ `grundlag` SIGER HVAD SATSEN GANGES MED, og det er ikke pynt: en sats pr.
 * palle og en sats pr. håndtering giver vidt forskellige beløb af de samme
 * bevægelser. Stod det ikke i modellen, ville hver skærm gætte.
 */
export const YDELSE = {
  modtagelse: {
    ydelse: "modtagelse", label: "Modtagelse", grundlag: "maengde",
    arter: ["modtag"], enhed: "enhed",
  },
  haandtering: {
    ydelse: "haandtering", label: "Håndtering", grundlag: "haendelse",
    arter: ["putaway", "flyt"], enhed: "håndtering",
  },
  pluk: {
    ydelse: "pluk", label: "Pluk", grundlag: "haendelse",
    arter: ["pluk"], enhed: "pluklinje",
  },
  afsendelse: {
    ydelse: "afsendelse", label: "Afsendelse", grundlag: "maengde",
    arter: ["afsend"], enhed: "enhed",
  },
  retur: {
    ydelse: "retur", label: "Returhåndtering", grundlag: "haendelse",
    arter: ["retur"], enhed: "retur",
  },
};

export const ALLE_YDELSER = Object.keys(YDELSE);

/**
 * ⚠ OPTÆLLING OG JUSTERING AFREGNES IKKE.
 *
 * De er VORES kontrol af vores eget lager, ikke en ydelse kunden har bedt om.
 * Kunne de afregnes, ville en optælling være en indtægt — og så ville der
 * blive talt af de forkerte grunde. Listen står eksplicit, så en ny art ikke
 * lydløst bliver fakturerbar.
 */
export const IKKE_AFREGNEDE_ARTER = ["optael", "justering"];

/**
 * Afregningslinjerne for én kunde i én periode.
 *
 * `satser` er `{ <ydelse>: [{ gyldigFra, satsOere }] }`.
 * Perioden er halvåben `[fra, til)` — som alt andet der regner i tid her.
 *
 * ⚠ EN LINJE UDEN SATS UDELADES IKKE — den kommer med, med `satsOere: null`.
 * Udelod vi den, ville fakturaen se komplet ud mens en ydelse manglede en
 * pris, og ingen ville opdage det før kunden ringede. Beløbet er så også
 * null, og summen kan ikke gøres op. Det er det rigtige svar.
 */
export function afregningslinjer({
  bevaegelser = [], satsFor, kundeId, fra, til,
}) {
  if (typeof satsFor !== "function") {
    throw new Error(
      "afregningslinjer: satsFor(ydelse, tidspunktMs) mangler. Satsen slås op " +
      "af kaldereren — se noten om hvor kundens priser bor.");
  }
  const ud = [];
  for (const ydelse of ALLE_YDELSER) {
    const y = YDELSE[ydelse];
    const mine = bevaegelser.filter((b) =>
      b.kundeId === kundeId &&
      y.arter.includes(b.art) &&
      !IKKE_AFREGNEDE_ARTER.includes(b.art) &&
      Number.isFinite(b.tidspunktMs) &&
      b.tidspunktMs >= fra && b.tidspunktMs < til);
    if (!mine.length) continue;

    /* ⚠ SATSEN SLÅS OP PR. BEVÆGELSE, ikke én gang for perioden. Skifter en
       sats midt i en måned, skal de to halvdele afregnes hver for sig — og en
       enkelt sats for hele perioden ville fakturere den forkerte pris for den
       ene halvdel. Derfor grupperes bevægelserne PR. SATS. */
    const pr = new Map();
    for (const b of mine) {
      /* ⚠ OPSLAGET SKER UDEFRA. Kundens priser bor i Kunder & Priser, og
         satsPaa() i pricing.js er husets ene opslagsfunktion. En kopi her
         ville være to steder der afgør hvilken sats der gjaldt. */
      const sats = satsFor(ydelse, b.tidspunktMs);
      const noegle = sats ? String(sats.gyldigFra) : "ingen";
      const g = pr.get(noegle) || {
        satsOere: sats ? (sats.beloebOere ?? sats.satsOere ?? null) : null,
        gyldigFra: sats ? sats.gyldigFra : null,
        antal: 0, haendelser: 0,
      };
      g.haendelser += 1;
      g.antal += y.grundlag === "haendelse" ? MAENGDE_SKALA : (b.antal || 0);
      pr.set(noegle, g);
    }

    for (const [, g] of pr) {
      ud.push({
        ydelse,
        label: y.label,
        enhed: y.enhed,
        antal: g.antal,
        haendelser: g.haendelser,
        satsOere: g.satsOere,
        gyldigFra: g.gyldigFra,
        /* ⚠ null, IKKE 0, når satsen mangler. Et beløb på nul ligner en
           gratis ydelse; null er et ubesvaret spørgsmål. */
        beloebOere: g.satsOere == null
          ? null
          : Math.round((g.antal * g.satsOere) / MAENGDE_SKALA),
      });
    }
  }
  return ud.sort((a, b) => ALLE_YDELSER.indexOf(a.ydelse) - ALLE_YDELSER.indexOf(b.ydelse));
}

/**
 * Summen af afregningslinjer — eller `null` hvis bare én mangler sin sats.
 *
 * ⚠ SAMME REGEL SOM MOMSEN DER MANGLER. Et system der lægger de kendte tal
 * sammen og lader det manglende stå som nul, giver et tal der ser rigtigt ud
 * og er for lavt. Så hellere ingen sum og en tydelig grund.
 */
export function afregningssum(linjer = []) {
  if (linjer.some((l) => l.beloebOere == null)) {
    return { beloebOere: null, mangler: linjer.filter((l) => l.beloebOere == null).length };
  }
  return {
    beloebOere: linjer.reduce((s, l) => s + l.beloebOere, 0),
    mangler: 0,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   CARRIEREN — beholderen kundens gods står i
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DET ER `kasse` ÉN GANG TIL, OG SVARET BLEV ALLIGEVEL TO NODER.

   Turtlebooking har `kasser`: en fysisk beholder med type, status og en
   reolplads. Fysisk er en carrier den samme ting. De to bærer alligevel hver
   sin forretning — kassen udlejes pr. sag og har sin egen tilstandsmaskine
   med klargøring og returnering (beslutning 37), carrieren bærer KUNDENS gods
   og har ejerforhold og indhold. Én node ville have båret to tilstandsmaskiner
   og to formål, og så afgør et felt hvilken halvdel af reglerne der gælder.

   ⚠ PRISEN FOR TO NODER BETALES I `reolplads.js`, IKKE HER. Begge står på de
   SAMME `reolpladser`, så "er hylden optaget?" har to kilder. Det spørgsmål
   besvares ét sted — se `belaegningPaaPlads()`. Ellers ser en hylde ledig ud
   i Turtlebooking og optaget ud i Warehouse, og ingen af skærmene kan se at
   de er uenige.

   ⚠ INDHOLDET ER IKKE HER ENDNU. Beholdningen hænger i dag på PLADSEN
   (`beholdningsNoegle`), og planchens "flyt carrieren, indholdet følger med"
   kræver at nøglen flytter til carrieren. Det er etape 12, og det er en
   migrering af fire ting der virker. Carrieren findes først; indholdet
   flytter bagefter. Se WAREHOUSE.md punkt 6.3.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ TYPEN ER EN ENUM OG IKKE EN NODE — for nu.
 *
 * Turtlebooking har `kassetyper` som en node, fordi en museumskasse er
 * vognmandens eget inventar med sine egne mål. De her fem er generiske
 * kategorier af transportemballage, og målene står på den ENKELTE carrier,
 * fordi to pallekasser kan være forskellige.
 *
 * Skal en vognmand kunne oprette sine egne typer med standardmål, bliver det
 * en node som `kassetyper` — og det er en beslutning, ikke en oprydning.
 * `kassetyper` kan ikke genbruges: den node er spærret af turtlebooking-modulet,
 * og en kunde med kun Warehouse kan ikke læse den.
 */
export const CARRIER_TYPE = {
  pallekasse: { type: "pallekasse", label: "Pallekasse" },
  gitterbur:  { type: "gitterbur",  label: "Gitterbur" },
  plastkasse: { type: "plastkasse", label: "Plastkasse" },
  kartonkasse:{ type: "kartonkasse",label: "Kartonkasse" },
  traekasse:  { type: "traekasse",  label: "Trækasse" },
};

export const ALLE_CARRIER_TYPER = Object.keys(CARRIER_TYPE);

/**
 * Egen beholder eller engangsemballage.
 *
 * ⚠ FORSKELLEN ER IKKE KOSMETISK. En egen carrier kommer retur og skal kunne
 * genbruges; en engangs bliver hos modtageren eller kasseres. Kun en engangs
 * kan derfor ende som `opbrugt`.
 */
export const EJERFORHOLD = {
  ejet:   { ejerforhold: "ejet",   label: "Ejet",   pill: "ok" },
  engang: { ejerforhold: "engang", label: "Engang", pill: "info" },
};

export const ALLE_EJERFORHOLD = Object.keys(EJERFORHOLD);

/**
 * Carrierens tilstand.
 *
 * ⚠ "INGEN LOKATION" ER IKKE EN STATUS. Planchen viser den som en rød pille,
 * men den er FRAVÆRET af `pladsId` på en carrier der burde stå et sted — og
 * en kendsgerning gemt to steder driver fra sig selv (`bemanding.ledig`).
 * Se `udenLokation()`.
 *
 * ⚠ "DELVIST TØMT" ER HELLER IKKE HER. Den kræver et referencetal — delvist i
 * forhold til hvad? — og det tal findes ikke, før indholdet ligger på
 * carrieren. Se WAREHOUSE.md punkt 6.4. En status vi gemmer nu, ville være
 * gættet før spørgsmålet var besvaret.
 */
export const CARRIER_STATUS = {
  paaLager:   { status: "paaLager",   label: "På lager",     pill: "ok",   paaPlads: true },
  iTransit:   { status: "iTransit",   label: "I transit",    pill: "info", paaPlads: false },
  udeAfDrift: { status: "udeAfDrift", label: "Ude af drift", pill: "bad",  paaPlads: true },
  /* En engangs-carrier der er brugt op. ⚠ DEN SLETTES IKKE: bevægelses-
     historikken hænger på id'et, og et id der forsvinder, gør historikken
     uforklarlig. Samme regel som en kasse der går i stykker. */
  opbrugt:    { status: "opbrugt",    label: "Opbrugt",      pill: "bad",  paaPlads: false },
};

export const ALLE_CARRIER_STATUS = Object.keys(CARRIER_STATUS);

/** Skal carrieren stå på en reolplads i den her tilstand? */
export const kraeverLokation = (status) => CARRIER_STATUS[status]?.paaPlads === true;

/**
 * Carrieren burde stå et sted, men gør det ikke.
 *
 * ⚠ AFLEDT, IKKE GEMT. Det er scanningen der er sket uden en placering — og
 * det er præcis det tal nøgletallet "uden lokation" tæller. Gemte vi det som
 * en status, kunne den blive stående efter placeringen.
 */
export const udenLokation = (carrier = {}) =>
  kraeverLokation(carrier.status) && !carrier.pladsId;

const CARRIER_ID_MOENSTER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

/**
 * ⚠ EN CARRIER I TRANSIT OPTAGER IKKE EN HYLDE.
 *
 * Præcis samme regel som en udlånt kasse, og den findes af samme grund:
 * prototypen skrev "Udlånt hos kunde" SOM plads, og så kunne ledige pladser
 * ikke tælles. Reglen står også i `firebase.rules.json` — en kontrol der kun
 * findes i frontend, er ikke adgangskontrol.
 */
export function valideCarrier(post = {}, { pladser = [], kunder = [] } = {}) {
  const f = {};

  const id = (post.id || "").trim();
  if (!id) f.id = "Carrier-id skal udfyldes.";
  else if (!CARRIER_ID_MOENSTER.test(id)) {
    f.id = "Bogstaver, tal, bindestreg og understreg — fx CRR-100245.";
  }

  if (!ALLE_CARRIER_TYPER.includes(post.type)) f.type = "Vælg en carriertype.";
  if (!ALLE_EJERFORHOLD.includes(post.ejerforhold)) f.ejerforhold = "Vælg ejerforhold.";
  if (!ALLE_CARRIER_STATUS.includes(post.status)) f.status = "Vælg en status.";

  /* ⚠ KUN EN ENGANGS KAN VÆRE OPBRUGT. En egen beholder kommer retur; er den
     ødelagt, er den ude af drift, og de to må ikke kunne bruges i flæng —
     ellers kan man ikke tælle hvor mange beholdere man faktisk har. */
  if (post.status === "opbrugt" && post.ejerforhold !== "engang") {
    f.status = "Kun en engangs-carrier kan være opbrugt. En egen tages ude af drift.";
  }

  if (post.pladsId && pladser.length && !pladser.includes(post.pladsId)) {
    f.pladsId = "Ukendt reolplads.";
  }
  if (post.pladsId && !kraeverLokation(post.status)) {
    f.pladsId = `En carrier der er ${CARRIER_STATUS[post.status]?.label.toLowerCase() || "ude"}, optager ikke en reolplads.`;
  }

  /* ⚠ pladsId ER IKKE PÅKRÆVET PÅ EN CARRIER PÅ LAGERET. En carrier der er
     scannet ind, men endnu ikke placeret, er en RIGTIG tilstand — det er de
     elleve på planchen. Kræver man en plads, kan modtagelsen ikke gemme det
     der faktisk er sket. */

  if (post.kundeId && kunder.length && !kunder.includes(post.kundeId)) {
    f.kundeId = "Ukendt kunde.";
  }

  /* Millimeter som INTEGER — samme regel som varens mål og
     samletLaengdeMm() i flaade.js. En float ved en volumengrænse er en fejl
     der venter, og volumenkalkulatoren skal regne på dem. */
  for (const felt of ["laengdeMm", "breddeMm", "hoejdeMm"]) {
    const v = post[felt];
    if (v == null || v === "") continue;
    if (!Number.isInteger(v) || v < 0) f[felt] = "Mål i hele millimeter.";
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/**
 * Carrier-overblikkets fem tal.
 *
 * ⚠ AFLEDT HOS FORBRUGEREN, IKKE GEMT I `kpi/`. Skærmen har både beholderne
 * og beholdningsposterne i forvejen, og et gemt tal ved siden af ville drive
 * fra sit grundlag ved den første bevægelse der ramte det ene og ikke det
 * andet. Det er `bemanding.ledig` igen. Undtagelsen i CLAUDE.md gælder
 * præcis her.
 *
 * ⚠ MEN "SIDEN I GÅR" KAN IKKE REGNES HERAF. Et delta kræver gårsdagens tal,
 * og dem har skærmen ikke — det ene felt hører i `kpi/`. Se demo-kpi.js.
 *
 * ⚠ OG PLANCHENS "DELVIST TØMT" ER IKKE MED. Den kræver et referencetal —
 * delvist i forhold til hvad? — og det findes ikke. Et gæt ville se ud som en
 * måling. Se WAREHOUSE.md punkt 6.4.
 */
export function carrieroverblik(carriers = [], beholdning = []) {
  const medIndhold = new Set(
    beholdning.filter((b) => (b.antal || 0) > 0).map((b) => b.carrierId));

  const ud = {
    ialt: carriers.length,
    aktive: 0, iTransit: 0, engangs: 0, udenLokation: 0, medIndhold: 0,
  };

  for (const c of carriers) {
    /* "Aktiv" er en beholder der stadig er i omløb. En opbrugt engangskasse
       og en der er ude af drift, er det ikke — de tælles med i `ialt`, fordi
       de stadig findes og bærer historik. */
    if (c.status === "paaLager" || c.status === "iTransit") ud.aktive += 1;
    if (c.status === "iTransit") ud.iTransit += 1;
    if (c.ejerforhold === "engang" && c.status !== "opbrugt") ud.engangs += 1;
    if (udenLokation(c)) ud.udenLokation += 1;
    if (medIndhold.has(c.id)) ud.medIndhold += 1;
  }
  return ud;
}
