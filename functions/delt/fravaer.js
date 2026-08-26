/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/fravaer.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/fravaer.js
 * Ferie og fravær. Beslutning 4, 17 og 18 mødes her.
 *
 * FRAVÆR RAMMER ALLE MEDARBEJDERE, ikke kun chauffører. En lagermedarbejders
 * ferie skal blokere hende lige så meget som en chaufførs — ressourcen hedder
 * `medarbejder` og ikke `chauffoer` netop derfor (se RESSOURCE i
 * reservations.js). Hed den `chauffoer`, var halvdelen af personalet usynligt
 * for disponeringen.
 *
 * NØGLEN ER ET personId, ikke et uid og ikke et chauffoerId. `uid` er hvem der
 * GJORDE noget; `personId` er hvem det HANDLER OM. En chauffør har måske slet
 * intet login, og et fravær skal virke alligevel. Reglerne kræver `personId`.
 *
 * ⚠ ÅRSAGEN LIGGER I sensitive/fravaer/<id>. Reglerne afviser `art` i
 * general-noden med .validate: false, så den kan ikke ende her ved et uheld.
 * Disponeringen skal vide AT medarbejderen er utilgængelig 14.–18. juli —
 * ikke hvorfor.
 *
 * OG DET ER ALLE ÅRSAGER DER SKJULES, IKKE KUN SYGDOM. Det er ikke overdrevet
 * forsigtighed: viste vi `ferie` og `kursus` på general og skjulte kun
 * `sygdom`, ville et MANGLENDE felt betyde sygdom. Delvis afsløring lækker
 * gennem udeladelsen, og den der læser listen, kan regne resten ud. Enten er
 * hele feltet klassificeret, eller også er intet af det.
 */

import { RESSOURCE, KILDE, prioritetFor } from "./reservations.js";


/* ---- Årsager. HØRER I sensitive/, aldrig i general. ------------------ */

/**
 * Vokabular for sensitive/fravaer/<id>.art.
 *
 * `sygdom` og `barnSyg` er helbredsoplysninger efter GDPR art. 9 — særlig
 * kategori. `barsel` er det i praksis også. De øvrige er det ikke, men de
 * ligger samme sted alligevel; se noten om udeladelse i toppen af filen.
 */
export const FRAVAER_ART = {
  sygdom:   { label: "Sygdom",            pill: "bad",  helbred: true },
  barnSyg:  { label: "Barns 1. sygedag",  pill: "bad",  helbred: true },
  barsel:   { label: "Barsel",            pill: "info", helbred: true },
  ferie:    { label: "Ferie",             pill: "ok",   helbred: false },
  /* ⚠ TO NYE ARTER — beslutning 108. De kom af at chaufføren skal kunne
     ANSØGE: specifikationens kort siger "ferie, feriefridage eller
     afspadsering", og de to sidste fandtes ikke. De ville ellers være landet
     som `andet`, og en afspadseringssaldo kan ikke gøres op af poster der
     hedder andet. */
  feriefridag:   { label: "Feriefridag",   pill: "ok",   helbred: false },
  afspadsering:  { label: "Afspadsering",  pill: "ok",   helbred: false },
  kursus:   { label: "Kursus",            pill: "info", helbred: false },
  andet:    { label: "Andet",             pill: "info", helbred: false },
};

export const ALLE_FRAVAER_ARTER = Object.keys(FRAVAER_ART);

export const erHelbredsoplysning = (art) => Boolean(FRAVAER_ART[art]?.helbred);

/* ---- Tilstand. AFLEDT, aldrig gemt. ---------------------------------- */

/**
 * fravaerTilstand(f, nu) → "kommende" | "igangvaerende" | "afsluttet"
 *
 * Udledt af fra/til, ikke gemt som felt. Samme regel som at der ikke findes
 * en `forfalden`-tilstand på en etape: vi gemmer ikke det vi kan regne ud, og
 * et gemt statusfelt ville drive fra datoerne i det sekund nogen retter en
 * dato uden at røre feltet.
 *
 * ⚠ INTERVALLET ER HALVÅBENT: [fra, til). Et fravær der slutter kl. 00.00 den
 * 19. dækker til og med den 18. — se noten ved sidsteDag().
 */
export const TILSTAND = {
  kommende:      { label: "Kommende",      pill: "info" },
  igangvaerende: { label: "I gang",        pill: "warn" },
  afsluttet:     { label: "Afsluttet",     pill: "ok"   },
};

export function fravaerTilstand(f, nu = Date.now()) {
  if (nu < f.fra) return "kommende";
  if (nu < f.til) return "igangvaerende";
  return "afsluttet";
}

export const erAktivt = (f, nu = Date.now()) => nu >= f.fra && nu < f.til;

/* ---- Visning: inklusivt. Lagring: eksklusivt. ------------------------ */

/**
 * sidsteDag(f) → ms på den SIDSTE dag fraværet dækker.
 *
 * ⚠ DEN HER ER EN FÆLDE, OG DEN ER VÆRD AT LÆSE TO GANGE.
 *
 * Et fravær 14.–18. juli gemmes med til = 19. juli kl. 00.00, fordi
 * intervallet er halvåbent. Gemmer nogen i stedet den 18. kl. 00.00, er
 * medarbejderen ledig hele den 18. — og så kan en syg chauffør disponeres,
 * hvilket er præcis det denne skærm findes for at forhindre.
 *
 * Mennesket siger "til og med den 18.", maskinen regner på "før den 19.".
 * Vis det ene, gem det andet. Samme disciplin som meter mod millimeter på
 * flåden og kroner mod øre i beslutning 2.
 *
 * Trækker ét millisekund fra, så både et døgnjusteret og et vilkårligt
 * sluttidspunkt lander på den rigtige dato.
 */
export const sidsteDag = (f) => f.til - 1;

/**
 * Antal påbegyndte kalenderdage. Til visning — ikke til lønberegning.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ TÆLLES MED `Date`, IKKE MED MILLISEKUNDER — beslutning 108
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Her stod `Math.ceil((f.til - f.fra) / DAG)`, og den var forkert over hvert
 * sommertidsskifte. **Målt:** 23.–27. oktober 2026 gav **6 dage**. Skiftet
 * den 25. lægger en time til, så 5 døgn bliver til 121 timer, og `ceil`
 * runder op.
 *
 * Fejlen ramte to gange om året, på hver eneste ferie hen over skiftet, og
 * den var usynlig: 6 er et plausibelt tal ved siden af "23.10 – 27.10". Den
 * blev fundet ved at prøve netop den uge, ikke ved at læse koden.
 *
 * Det er samme fælde som `slots()` i gitter.js og `traekTil()`: **et døgn er
 * ikke 24 timer.** Dagene tælles derfor ved at gå fremad med `Date`.
 */
export function varighedDage(f) {
  if (!Number.isFinite(f?.fra) || !Number.isFinite(f?.til)) return 1;
  const d = new Date(f.fra);
  d.setHours(0, 0, 0, 0);
  let n = 0;
  /* Halvåbent: en dag tælles med hvis den BEGYNDER før `til`. */
  while (d.getTime() < f.til) {
    n += 1;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, n);
}

/** Overlapper to fravær? Samme halvåbne regel som overlapper() i
 *  reservations.js — to fravær på samme person i samme periode er en konflikt
 *  på en eksklusiv ressource, ikke bare et rod i data. */
export const overlapper = (a, b) => a.fra < b.til && b.fra < a.til;

/* ---- Reservationen --------------------------------------------------- */

/**
 * reservationFraFravaer(f) → posten reserver() skal skrive.
 *
 * BYGGER, SKRIVER IKKE. Samme mønster som reservationFraAftale() i sager.js:
 * konfliktkontrollen hører i en Cloud Function, fordi to skrivninger kan ramme
 * samme sekund, og et klientsidetjek ikke kan forhindre det.
 *
 * Prioriteten kommer fra reservations.js og skrives ikke her — 30 tastet ind
 * i en skærm er samme regel to steder.
 *
 * ⚠ HVERKEN NAVN ELLER ÅRSAG KOMMER MED. Reservationen er synlig for enhver
 * der kan læse reservationsnoden, og den er ikke klassificeret. Lagde vi
 * årsagen i `note` eller navnet i `kilde.reference`, ville helbredsoplysningen
 * være lækket ud af sensitive/ ad bagvejen — beslutning 17 omgået af en
 * bekvemmelighed. konfliktTekst() siger derfor "Medarbejderen har registreret
 * fravær i perioden" og ikke hvem eller hvorfor.
 */
export function reservationFraFravaer(f) {
  if (!f?.personId) throw new Error("reservationFraFravaer: fravær uden personId kan ikke reserveres.");
  if (!Number.isFinite(f.fra) || !Number.isFinite(f.til) || f.til <= f.fra) {
    throw new Error("reservationFraFravaer: fra og til skal være konkrete tidspunkter med til > fra.");
  }
  return {
    ressourceType: RESSOURCE.medarbejder,
    /* personId, ikke uid. Reservationen hænger på personen, ikke på kontoen —
       kontoen kan lukkes ved fratrædelse uden at et fravær fra i fjor
       forsvinder. */
    ressourceId: f.personId,
    fra: f.fra,
    til: f.til,
    kilde: { type: KILDE.fravaer, id: f.id, reference: null },
    maengde: null,
    note: null,
  };
}

/** Prioriteten for et fravær. Én kilde: reservations.js. */
export const fravaerPrioritet = () => prioritetFor(KILDE.fravaer);

/* ══════════════════════════════════════════════════════════════════════════
   AT ANSØGE OM FRIHED — beslutning 108
   ══════════════════════════════════════════════════════════════════════════

   Chaufførappens fjerde kort. Indtil nu kunne kun kontoret oprette et fravær:
   `.write` krævede `fravaer.skriv`, som ingen chauffør har.

   ⚠ MAN ANSØGER IKKE OM SYGDOM, og det er ikke en formulering — det er dét
   der gør ansøgningen mulig overhovedet.

   `art` er en HELBREDSOPLYSNING (GDPR art. 9) og bor i `sensitive/fravaer`,
   hvis `.write` kræver BÅDE `fravaer.skriv` OG `fravaer.sensitiveLaes` —
   *"kan man ikke læse feltet, skal man heller ikke kunne overskrive det i
   blinde"* (beslutning 17). En chauffør har ingen af delene, og skulle han
   skrive sin egen art, ville vejen ind i den node stå åben for alle.

   Men det han ansøger om, er **ferie, feriefridag eller afspadsering** — ikke
   én af dem er en helbredsoplysning. Ansøgningen bærer derfor et `oensket` på
   BASISNODEN, begrænset til de tre, og kontoret sætter `art` i den følsomme
   node når det godkender.

   ⚠ `oensket` OG `art` ER IKKE DET SAMME FELT TO STEDER. `oensket` er hvad
   han BAD OM; `art` er hvad der blev REGISTRERET. De kan være forskellige —
   han beder om ferie og får afspadsering — og det er samme skelnen som
   `estimeretMin` mod `faktiskMin`.

   ⚠ ET FRAVÆR UDEN `ansoegning` ER KONTORETS EGEN REGISTRERING, og det er
   dét der gør ændringen sikker at udrulle: hvert eksisterende fravær opfører
   sig præcis som før. Samme fremgangsmåde som `roller/`, hvor en tenant uden
   noden opfører sig som før den fandtes.

   ⚠ OG EN ANSØGNING SPÆRRER INGENTING. Reservationen skrives først når den er
   godkendt — tre ansøgninger om den samme uge ville ellers spærre manden tre
   gange for en frihed han ikke har fået. Det er beslutning 59's figur:
   et forslag reserverer heller ikke. */

export const ANSOEGNING = {
  ansoegt:  { label: "Ansøgt",   pill: "info" },
  godkendt: { label: "Godkendt", pill: "ok"   },
  afvist:   { label: "Afvist",   pill: "bad"  },
};

export const ALLE_ANSOEGNINGSSTATUS = Object.keys(ANSOEGNING);

/**
 * De arter man kan ANSØGE om.
 *
 * ⚠ UDLEDT AF `helbred`, IKKE SKREVET I HÅNDEN. Kommer der en ny art med
 * `helbred: true`, kan den ikke ansøges om af sig selv — og en liste skrevet
 * i hånden ville skulle huskes. `kursus` og `andet` er heller ikke med: et
 * kursus sender arbejdsgiveren på, og `andet` er kontorets opsamling.
 */
export const ANSOEGBARE_ARTER = ["ferie", "feriefridag", "afspadsering"]
  .filter((a) => FRAVAER_ART[a] && !FRAVAER_ART[a].helbred);

/** Felter på `ansoegning`. Reglens `$andet: false` siger det samme. */
export const ANSOEGNING_FELTER = [
  "status", "oensket", "ansoegtMs", "afgjortAf", "afgjortMs", "svar",
];

/** Er fraværet ansøgt om — eller registreret af kontoret? */
export const erAnsoegt = (f) => Boolean(f?.ansoegning);

/**
 * Er fraværet AFTALT?
 *
 * ⚠ ET FRAVÆR UDEN ANSØGNING ER AFTALT. Kontoret skrev det, og så har nogen
 * taget stilling. Svarede vi nej, ville hvert eksisterende fravær holde op
 * med at tælle den dag feltet blev indført.
 */
export const erAftalt = (f) =>
  !f?.ansoegning || f.ansoegning.status === "godkendt";

/**
 * Fejl ved en ansøgning — tom liste betyder gyldig.
 *
 * ⚠ HÅNDHÆVES OGSÅ I REGLEN. Her svares hurtigt; reglen afgør.
 */
export function valideAnsoegning(f, { nu = Date.now() } = {}) {
  const fejl = [];
  const a = f?.ansoegning || {};

  if (!f?.personId) fejl.push("Ansøgningen mangler en medarbejder.");
  if (!Number.isFinite(f?.fra) || !Number.isFinite(f?.til)) {
    fejl.push("Ansøgningen mangler en periode.");
  } else if (f.til < f.fra) {
    fejl.push("Slutdatoen ligger før startdatoen.");
  } else if (f.fra < nu - 90 * 86400000) {
    /* ⚠ ET LOFT BAGUD, IKKE EN AFVISNING AF FORTIDEN. Man kan søge fri for en
       dag der lige er gået — et sygebarn meldes bagud — men ikke for et år
       siden, hvor ingen kan huske hvad der skete. */
    fejl.push("Perioden ligger for langt tilbage. Kontakt kontoret.");
  }

  if (!ANSOEGNING[a.status]) fejl.push(`Ukendt status "${a.status}".`);
  if (!ANSOEGBARE_ARTER.includes(a.oensket)) {
    /* ⚠ DEN VIGTIGSTE. Slap `sygdom` igennem her, ville en chauffør have
       skrevet en helbredsoplysning på en node uden `fravaer.sensitiveLaes`. */
    fejl.push(`Man kan ikke ansøge om "${a.oensket}".`);
  }
  if (!Number.isFinite(a.ansoegtMs)) fejl.push("Ansøgningen mangler et tidspunkt.");

  for (const felt of Object.keys(a)) {
    if (!ANSOEGNING_FELTER.includes(felt)) fejl.push(`Ukendt felt: ${felt}`);
  }
  if (a.svar != null && (typeof a.svar !== "string" || a.svar.length > 300)) {
    fejl.push("Svaret skal være tekst på højst 300 tegn.");
  }
  return fejl;
}

/**
 * Ansøgningen som den skal skrives.
 *
 * ⚠ INGEN `afgjortAf` OG INGEN `afgjortMs`. En klient der måtte sætte dem,
 * kunne godkende sin egen ansøgning — og reglen afviser det, men formen her
 * skal ikke engang kunne udtrykke det.
 */
export function byggAnsoegning({ personId, fra, til, oensket, note, nu = Date.now() }) {
  const ud = {
    personId,
    fra,
    til,
    ansoegning: { status: "ansoegt", oensket, ansoegtMs: nu },
  };
  /* Chaufførens egen begrundelse hører på BASISNODEN som en note — ikke i
     `ansoegning.svar`, som er kontorets svar tilbage. To tekster, to
     afsendere; ét felt ville lade den ene overskrive den anden. */
  if (note?.trim()) ud.note = note.trim();
  return ud;
}

/* ══════════════════════════════════════════════════════════════════════════
   AT AFGØRE EN ANSØGNING — B2, V1-stabiliseringsauditens anden BLOCKER

   ⚠ IKKE EN NY STATUSMASKINE — DEN SAMME TRE-STATUS ordliste `ANSOEGNING`
   HAR HAFT SIDEN BESLUTNING 108, FÆRDIGGJORT. `ansoegt` var altid ment som
   et mellemtrin — kontoret svarer `godkendt` eller `afvist` — men intet sted
   i koden HÅNDHÆVEDE at det var de eneste to mål, eller at et allerede afgjort
   svar ikke kunne afgøres igen. Samme mønster som `OPGAVE_OVERGANGE` i
   opgaveplan-regler.js: en ren tabel, prøvet uden en emulator, brugt af
   BÅDE skærmen (som viser) og serveren (som håndhæver).

   ⚠ GODKENDT OG AFVIST ER ENDESTATIONER — som `udfoert`/`annulleret` på en
   opgave. En godkendelse der kunne fortrydes til `ansoegt`, ville lade en
   allerede skrevet reservation stå løs, uden at nogen tog stilling til den.
   Skal en afgørelse laves om, er svaret en ny samtale med medarbejderen —
   ikke et genåbnet felt. */
export const ANSOEGNING_OVERGANGE = {
  ansoegt: ["godkendt", "afvist"],
  godkendt: [],
  afvist: [],
};

/**
 * kanAfgoereAnsoegning(f, tilStatus) → { ok, aarsag }
 *
 * ⚠ SAMME FORM SOM kanSkifteOpgave() — fejler LUKKET på et fravær uden
 * ansøgning (kontorets egen registrering; der er intet at afgøre), på en
 * ukendt status, og på et mål der ikke er `godkendt` eller `afvist`.
 */
export function kanAfgoereAnsoegning(f, tilStatus) {
  const a = f?.ansoegning;
  if (!a) {
    return { ok: false, aarsag: "Fraværet er ikke en ansøgning — det er kontorets egen registrering." };
  }
  const fra = a.status;
  if (!ANSOEGNING_OVERGANGE[fra]) {
    return { ok: false, aarsag: `Ukendt status "${fra}".` };
  }
  if (!ANSOEGNING[tilStatus]) {
    return { ok: false, aarsag: `Ukendt handling "${tilStatus}".` };
  }
  if (!ANSOEGNING_OVERGANGE[fra].includes(tilStatus)) {
    if (!ANSOEGNING_OVERGANGE[fra].length) {
      return {
        ok: false,
        aarsag: `Ansøgningen er allerede afgjort ("${ANSOEGNING[fra].label}") og kan ikke ændres.`,
      };
    }
    return {
      ok: false,
      aarsag: `Kan ikke gå fra "${ANSOEGNING[fra].label}" til "${ANSOEGNING[tilStatus].label}".`,
    };
  }
  return { ok: true };
}
