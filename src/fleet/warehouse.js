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
    art: "modtag", label: "Modtagelse", kraeverFra: false, kraeverTil: true,
  },
  putaway: {
    art: "putaway", label: "Putaway", kraeverFra: true, kraeverTil: true,
  },
  flyt: {
    art: "flyt", label: "Flytning", kraeverFra: true, kraeverTil: true,
  },
  pluk: {
    art: "pluk", label: "Pluk", kraeverFra: true, kraeverTil: true,
  },
  afsend: {
    art: "afsend", label: "Afsendelse", kraeverFra: true, kraeverTil: false,
  },
  retur: {
    art: "retur", label: "Retur", kraeverFra: false, kraeverTil: true,
  },
  /* ⚠ OPTÆLLING OG JUSTERING ER TO TING. En optælling er et TAL man har talt
     sig frem til; en justering er en RETTELSE med en årsag. Slås de sammen,
     kan et svind bogføres som "vi talte bare forkert". */
  optael: {
    art: "optael", label: "Optælling", kraeverFra: false, kraeverTil: true,
  },
  justering: {
    art: "justering", label: "Justering", kraeverFra: false, kraeverTil: true,
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

export function valideBevaegelse(post = {}, { varer = [], kunder = [], pladser = [], vare = null } = {}) {
  const f = {};

  const art = BEVAEGELSE_ART[post.art];
  if (!art) f.art = "Vælg en art.";

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

  if (art?.kraeverFra && !post.fraPladsId) f.fraPladsId = "Vælg hvor varen tages fra.";
  if (!art?.kraeverFra && post.fraPladsId) {
    f.fraPladsId = `En ${art?.label.toLowerCase() || "bevægelse"} kommer ikke fra en plads.`;
  }
  if (art?.kraeverTil && !post.tilPladsId) f.tilPladsId = "Vælg hvor varen sættes.";
  if (!art?.kraeverTil && post.tilPladsId) {
    f.tilPladsId = `En ${art?.label.toLowerCase() || "bevægelse"} går ikke til en plads.`;
  }
  for (const felt of ["fraPladsId", "tilPladsId"]) {
    if (post[felt] && pladser.length && !pladser.includes(post[felt])) {
      f[felt] = "Ukendt reolplads.";
    }
  }
  if (post.fraPladsId && post.fraPladsId === post.tilPladsId) {
    f.tilPladsId = "Fra og til er den samme plads.";
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
export const beholdningsNoegle = (pladsId, vareId, batch) =>
  `${pladsId}__${vareId}__${batch || UDEN_BATCH}`;

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

  if (ABSOLUTTE_ARTER.includes(post.art)) {
    ud.push({
      noegle: beholdningsNoegle(post.tilPladsId, post.vareId, batch),
      pladsId: post.tilPladsId, vareId: post.vareId, batch,
      saet: post.antal,
    });
    return ud;
  }

  if (post.fraPladsId) {
    ud.push({
      noegle: beholdningsNoegle(post.fraPladsId, post.vareId, batch),
      pladsId: post.fraPladsId, vareId: post.vareId, batch,
      aendring: -post.antal,
    });
  }
  if (post.tilPladsId) {
    ud.push({
      noegle: beholdningsNoegle(post.tilPladsId, post.vareId, batch),
      pladsId: post.tilPladsId, vareId: post.vareId, batch,
      aendring: post.antal,
    });
  }
  return ud;
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

/** Beholdningen på én plads, pr. vare og batch. */
export const beholdningPaaPlads = (poster = [], pladsId) =>
  poster.filter((p) => p.pladsId === pladsId && (p.antal || 0) !== 0);

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
