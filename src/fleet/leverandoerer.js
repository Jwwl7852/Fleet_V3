/* src/fleet/leverandoerer.js
 * Leverandøren som entitet. Femte gang mønstret fra beslutning 18 dukker op.
 *
 * INGEN IMPORTS — samme grund som permissions.js og opgaver.js.
 *
 * ⚠ MODELLEN HAR HELE TIDEN REGNET MED DEN. `leverandoerId` er indekseret to
 * steder i firebase.rules.json:
 *
 *     "indkoeb":   ".indexOn": ["dato", "leverandoerId", "fakturastatus"]
 *     "fakturaer": ".indexOn": ["fakturadatoMs", "leverandoerId", "godkendelsesstatus"]
 *
 * — men noden fandtes ikke. Imens stod leverandørerne som FRITEKST i tre
 * demo-filer: "Mercedes Greve" i demo-vaerksted, i demo-sag og næsten i
 * demo-indkoeb. Det er Bil 104 med to nummerplader igen.
 *
 * ⚠ DIVISION: JA, SOM PÅ KUNDER — IKKE SOM PÅ PERSONALE.
 *
 * Prøven er: beskriver feltet LEVERANDØRENS FORRETNING eller VORES
 * ORGANISATION? Beslutning 19 forbyder det på personale og køretøjer, fordi
 * værdien dér ville beskrive vores egen opdeling — og den kunne ikke
 * begrundes på den enkelte medarbejder eller bil. På en leverandør kan den:
 * Mercedes Greve er et lastbilværksted, Crawford leverer porte til begge.
 * Det er samme begrundelse som `faelles` på kunder.
 *
 * ⚠ LEVERANDØRENS E-MAIL ER SAGENS UDGANGSPUNKT, IKKE DENS FACIT.
 * `sag.parter[]` er adgangslisten i beslutning 20, og den skal have et sted
 * at komme fra. parterFraLeverandoer() giver startlisten; derefter ejer SAGEN
 * den. En frigivelse fra karantæne tilføjer til sagen, aldrig til kartoteket
 * — ellers ville ét klik åbne for alle fremtidige sager.
 */

/** Hvad leverandøren leverer. Vokabular ét sted, så to skærme ikke kalder
 *  samme kategori noget forskelligt og gør den utællelig. */
export const LEVERANDOER_KATEGORI = {
  vaerksted: "Værksted og reparation",
  reservedele: "Reservedele",
  daek: "Dæk",
  braendstof: "Brændstof",
  facility: "Bygning og facility",
  kontor: "Kontor og IT",
  transport: "Transportkøb",
};

export const ALLE_KATEGORIER = Object.keys(LEVERANDOER_KATEGORI);

/** Aftaleformen. Styrer hvad man må forvente af prisen — en fastaftale der
 *  afviger, er en anden slags afvigelse end et spotkøb der gør det. */
export const AFTALETYPE = {
  fastaftale: { label: "Fastaftale", forventerFastPris: true },
  rammeaftale: { label: "Rammeaftale", forventerFastPris: true },
  spot: { label: "Spotkøb", forventerFastPris: false },
};

export const ALLE_AFTALETYPER = Object.keys(AFTALETYPE);

/* ---- Opslag ------------------------------------------------------------ */

/** Navnet på en leverandør. Fejler synligt frem for at vise et tomt felt:
 *  et id der ikke kan slås op, er en fejl i data og ikke en manglende værdi. */
export const leverandoerNavn = (liste, id) =>
  liste.find((l) => l.id === id)?.navn ?? `ukendt leverandør (${id})`;

export const leverandoer = (liste, id) => liste.find((l) => l.id === id) || null;

/**
 * Startlisten af parter til en sag på denne leverandør (beslutning 20).
 *
 * Returnerer ALTID et array, og altid i små bogstaver — vurderAfsender()
 * normaliserer på samme måde, og to lister der normaliserer forskelligt ville
 * betyde at en kendt afsender endte i karantæne.
 */
export function parterFraLeverandoer(l) {
  return [l?.kontaktEmail, ...(l?.ekstraKontakter || [])]
    .filter(Boolean)
    .map((a) => String(a).trim().toLowerCase());
}

/**
 * Må denne rolle godkende en faktura?
 *
 * ⚠ DEN BRUGER indkoeb.skriv I DAG, OG DET ER EN MIDLERTIDIG LØSNING.
 *
 * Der findes ingen `fakturaer.godkend` i permission-kataloget, fordi
 * `fakturaer/` er `.write: false` — ingen kan skrive noden, så der har ikke
 * været noget at kontrollere. Når reglerne åbnes, skal permissionen skilles
 * ud, og det er ikke en oprydning i navngivningen:
 *
 * AT GODKENDE EN FAKTURA ER EN ANDEN HANDLING END AT REGISTRERE ET INDKØB.
 * Den der bestiller varen, og den der godkender regningen for den, er i en
 * virksomhed med adskilte funktioner BEVIDST to personer — det er hele
 * pointen med en attestationsgang. Deler de én permission, kan den samme
 * medarbejder bestille hos sin svoger og godkende sin egen faktura.
 *
 * Det er nøjagtig samme argument som beslutning 5: disponenten laver
 * forslaget, koordinatoren godkender det. Ikke fordi disponenten er mindre
 * betroet, men fordi to sæt øjne fanger det ét sæt ikke gør.
 */
export const PERM_GODKEND_MIDLERTIDIG = "indkoeb.skriv";

/* ---- Afstemning -------------------------------------------------------- */

/**
 * ⚠ TRE UAFHÆNGIGE TOTALER, TO NAVNGIVNE AFVIGELSER.
 *
 * Mockuppen skrev "9.842.250 − 9.781.625 = 9.765.125". Det er ikke en
 * subtraktion — det er tre selvstændige opgørelser stillet op som om den ene
 * fulgte af de to andre.
 *
 *   registreredeIndkoeb   hvad VI har registreret at have købt
 *   modtagneFakturaer     hvad leverandørerne har sendt regning for
 *   bogfoertBeloeb        hvad der er bogført i regnskabet
 *
 * Hver afvigelse får sit eget navn, fordi de kræver hver sin handling. Et tal
 * man ikke kan handle på, er et tal og ikke en oplysning:
 *
 *   manglendeFakturaerOere   registrerede − modtagne   → ryk leverandøren
 *   ikkeBogfoertOere         modtagne − bogførte       → bogfør fakturaen
 *
 * Det er beslutning 14 anvendt igen: to tal der begge hedder "afvigelse"
 * bliver læst som ét, og så handler ingen på nogen af dem.
 *
 * BEREGNES, GEMMES ALDRIG.
 */
export function afstem({ registreredeIndkoebOere = 0, modtagneFakturaerOere = 0, bogfoertOere = 0 }) {
  return {
    registreredeIndkoebOere,
    modtagneFakturaerOere,
    bogfoertOere,
    manglendeFakturaerOere: registreredeIndkoebOere - modtagneFakturaerOere,
    ikkeBogfoertOere: modtagneFakturaerOere - bogfoertOere,
  };
}

/* ---- Fakturaer --------------------------------------------------------- */

export const FAKTURASTATUS = {
  mangler:   { label: "Mangler faktura",  pill: "warn" },
  modtaget:  { label: "Modtaget",         pill: "info" },
  godkendt:  { label: "Godkendt",         pill: "ok"   },
  bogfoert:  { label: "Bogført",          pill: "ok"   },
  afvist:    { label: "Afvist",           pill: "bad"  },
};

export const ALLE_FAKTURASTATUS = Object.keys(FAKTURASTATUS);

/** Totalen beregnes hos forbrugeren og gemmes ikke — beslutning 2.
 *  beloebOere er ALTID ekskl. moms, momsOere er et separat felt. */
export const fakturaTotalOere = (f) => (f?.beloebOere || 0) + (f?.momsOere || 0);

/**
 * Hvad godkendelsen ville gøre. Samme mønster som kanSkifte() på Forslag:
 * skærmen viser svaret frem for at gætte.
 *
 * → { ok, aarsag }
 */
export function kanGodkende(faktura, harPermission) {
  if (!faktura) return { ok: false, aarsag: "Ingen faktura valgt." };
  if (!harPermission) {
    return {
      ok: false,
      aarsag: `Du mangler adgangen "${PERM_GODKEND_MIDLERTIDIG}" til at godkende en faktura.`,
    };
  }
  if (faktura.status === "godkendt" || faktura.status === "bogfoert") {
    return { ok: false, aarsag: `Fakturaen er allerede ${FAKTURASTATUS[faktura.status].label.toLowerCase()}.` };
  }
  if (faktura.status === "mangler") {
    return { ok: false, aarsag: "Der er ikke modtaget en faktura endnu." };
  }
  /* Uden et match mod et registreret indkøb godkender man en regning for
     noget ingen har bestilt. Det er den anden slags nej — en forudsætning,
     ikke en rettighed. */
  if (!faktura.indkoebId) {
    return { ok: false, aarsag: "Fakturaen er ikke matchet mod et registreret indkøb." };
  }
  return { ok: true };
}
