/* src/fleet/leverandoerer.js
 * Leverandøren som entitet. Femte gang mønstret fra beslutning 18 dukker op.
 *
 * ÉN IMPORT: format.js, til oereFraKroner(). Filen står i functions/delt/,
 * og reglen der er LUKNING UNDER IMPORT — format.js står der også. Her stod
 * "INGEN IMPORTS" længe efter at importen var kommet til; en hovednote man
 * ikke kan tro på, er værre end ingen, for det er den man læser i stedet for
 * at følge importerne.
 *
 * ⚠ MODELLEN HAR HELE TIDEN REGNET MED DEN. `leverandoerId` er indekseret to
 * steder i firebase.rules.json:
 *
 *     "indkoeb":   ".indexOn": ["dato", "leverandoerId", "fakturastatus"]
 *     "fakturaer": ".indexOn": ["fakturadatoMs", "leverandoerId", "status"]
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

import { oereFraKroner } from "./format.js";
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

/**
 * Navnet på en leverandør. Fejler synligt frem for at vise et tomt felt: et id
 * der ikke kan slås op, er en fejl i data og ikke en manglende værdi.
 *
 * ⚠ MEN ET OPSLAG I EN TOM LISTE ER IKKE ET MISLYKKET OPSLAG.
 *
 * Efter beslutning 94 spørger `useListe` slet ikke om `leverandoerer` hos en
 * kunde uden Procure — noden er modulspærret, og en forespørgsel ville være
 * sikker på at blive afvist. Listen er altså tom **fordi vi ikke har spurgt**.
 *
 * Med den gamle udgave skrev funktionen da **"ukendt leverandør (lv-hydra)"**
 * på hver eneste værkstedsopgave i hans arbejdskø: en påstand om at hans data
 * er i stykker, fremsat af et opslag der aldrig havde noget at slå op i.
 *
 * Tom liste → id'et, råt. Ikke-tom liste uden træffer → stadig en fejl, for
 * så HAVDE vi kartoteket og fandt ham ikke. Se beslutning 95.
 */
export const leverandoerNavn = (liste, id) => {
  if (!id) return "—";
  const navn = liste?.find((l) => l.id === id)?.navn;
  if (navn) return navn;
  return liste?.length ? `ukendt leverandør (${id})` : id;
};

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
 * Må denne bruger godkende en faktura?
 *
 * ⚠ DEN VAR MIDLERTIDIG, OG ER DET IKKE LÆNGERE. Her stod `indkoeb.skriv`
 * med noten om at permissionen skal skilles ud "når reglerne åbnes". Det
 * skete i beslutning 82: `indkoeb.godkend` findes, og `ordrestatus` kræver
 * den.
 *
 * AT GODKENDE ER EN ANDEN HANDLING END AT BESTILLE. Den der bestiller varen,
 * og den der siger god for regningen, er i en virksomhed med adskilte
 * funktioner BEVIDST to personer — det er hele pointen med en attestationsgang.
 * Delte de én permission, kunne den samme medarbejder bestille hos sin svoger
 * og godkende sit eget køb, og beløbsgrænsen på planche 2 ville være pynt.
 *
 * ⚠ MEN SELVE FAKTURAGODKENDELSEN ER STADIG IKKE HÅNDHÆVET. `fakturaer/` er
 * `.write: false`, og der er ingen funktion der skriver den — det er trin 4 i
 * Procures proces og hører i sin egen etape. Permissionen er den rigtige;
 * vejen mangler. Skærmen siger det.
 */
export const PERM_GODKEND = "indkoeb.godkend";


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
      aarsag: `Du mangler adgangen "${PERM_GODKEND}" til at godkende en faktura.`,
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

/* =======================================================================
 * BESLUTNING 25 — PRISLISTER OG PERFORMANCE
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV. Hvilke seks tal en
 * vognmand faktisk styrer efter, skal efterprøves hos første kunde. Det er
 * derfor de er samlet i ÉT katalog nedenfor frem for spredt ud i skærmen —
 * skal et af dem skiftes ud, er der ét sted at gøre det.
 * ======================================================================= */

/* ---- Prislisten ------------------------------------------------------- */

/**
 * ⚠ EN SATS OVERSKRIVES ALDRIG. Ny post med gyldigFra. BESLUTNING 7.
 *
 * En prisliste er ikke et opslagsværk over hvad noget koster i dag — den er en
 * historik over hvad det kostede DENGANG. Overskrev vi prisen ved en
 * regulering, ville en faktura fra i marts pludselig se forkert ud målt mod
 * "aftalen", og afvigelsen ville pege på leverandøren frem for på os.
 *
 * Det er samme regel som satser i pricing.js, og den er værd at gentage:
 * ethvert tal der indgår i et regnskab, skal kunne slås op PÅ EN DATO.
 */

/**
 * Leverandøren som han kommer UD AF DATABASEN.
 *
 * ⚠ RTDB HAR INGEN LISTER. `prisliste` er et objekt `{prisId: post}` i basen
 * og en ARRAY i domænekoden — prisPaa() filtrerer og sorterer på den. Uden
 * oversættelsen her kaster `.filter is not a function` inde i et regnestykke,
 * og skærmen bliver hvid. Præcis den fejl kostede Fakturering en hvid skærm
 * på `linjer`; se fraDb() i grundlag.js, som er den samme oversættelse for
 * det samme problem.
 *
 * ⚠ OG DEN TAGER IMOD BEGGE FORMER. Demo-sættet bærer allerede en array, og
 * en oversættelse der kun kunne det ene, ville betyde at demo og produktion
 * skulle kaldes hver sin vej — og så ville den ene vej være uprøvet.
 */
export function leverandoerFraDb(post, id) {
  if (!post) return null;
  return {
    ...post,
    id: id ?? post.id,
    prisliste: Array.isArray(post.prisliste)
      ? post.prisliste
      : Object.entries(post.prisliste || {}).map(([prisId, p]) => ({ id: prisId, ...p })),
  };
}

/**
 * prisPaa(leverandoer, varenummer, paaMs) → posten der gjaldt på det tidspunkt.
 *
 * Vinderen er den SENESTE gyldigFra der ikke ligger i fremtiden. En kommende
 * prisregulering må gerne stå i listen — den skal bare ikke gælde endnu.
 *
 * null hvis varen ikke fandtes på det tidspunkt. IKKE den nyeste pris som
 * trøstepræmie: et opslag der altid svarer, kan ikke skelne "ukendt" fra
 * "kendt", og så bliver en prisafvigelse regnet mod et tal vi fandt på.
 */
export function prisPaa(leverandoer, varenummer, paaMs = Date.now()) {
  const raekker = (leverandoer?.prisliste || [])
    .filter((p) => p?.varenummer === varenummer)
    .filter((p) => Number.isFinite(p.gyldigFra) && p.gyldigFra <= paaMs)
    .sort((a, b) => b.gyldigFra - a.gyldigFra);
  return raekker[0] || null;
}

/** Den gældende prisliste på et tidspunkt — én række pr. vare. */
export function gaeldendePrisliste(leverandoer, paaMs = Date.now()) {
  const varer = [...new Set((leverandoer?.prisliste || []).map((p) => p.varenummer))];
  return varer
    .map((v) => prisPaa(leverandoer, v, paaMs))
    .filter(Boolean)
    .sort((a, b) => String(a.vare).localeCompare(String(b.vare), "da"));
}

/**
 * Kommende reguleringer. Vises for sig, så en prisstigning der træder i kraft
 * om tre uger, kan ses FØR den rammer — det er hele grunden til at den må stå
 * i listen på forhånd.
 */
export const kommendePriser = (leverandoer, paaMs = Date.now()) =>
  (leverandoer?.prisliste || [])
    .filter((p) => Number.isFinite(p.gyldigFra) && p.gyldigFra > paaMs)
    .sort((a, b) => a.gyldigFra - b.gyldigFra);

/* ---- De seks nøgletal -------------------------------------------------- */

/**
 * ⚠ ET NØGLETAL UDEN SIT GRUNDLAG ER VILDLEDENDE.
 *
 * "50 % til tiden" betyder noget helt andet ved to leveringer end ved to
 * hundrede. Stiller man de to leverandører op i samme tabel med samme kolonne,
 * ser de ens ud — og så skifter man leverandør på grundlag af én forsinkelse.
 *
 * Derfor bærer HVERT tal sit `grundlag` (antallet det er regnet på), og
 * værdien er `null` under MINDSTE_GRUNDLAG. Null betyder "vi ved det ikke
 * endnu", og skærmen skal skrive netop det — ikke vise en streg der ligner
 * nul, og ikke vise en procent der ligner en måling.
 */
export const MINDSTE_GRUNDLAG = 3;

/**
 * Linjens beløb. BEREGNET af antal × pris — aldrig gemt. Se demo-indkoeb.js.
 *
 * ⚠ FUNKTIONEN FINDES, FORDI FORMEN ER DEN FAKTISKE. Første udkast af
 * beregnNoegletal() læste `beloebOere`, `datoMs` og `prisOere` — felter jeg
 * havde forestillet mig. De rigtige indkøbslinjer hedder `dato`, `antal` og
 * `prisPrEnhedOere`. Havde jeg rettet demo-data efter funktionen frem for
 * omvendt, ville tallene have været rigtige lige indtil de mødte produktion.
 */
export const indkoebBeloebOere = (i) =>
  Number.isInteger(i?.beloebOere)
    ? i.beloebOere
    : Math.round((i?.antal || 0) * (i?.prisPrEnhedOere || 0));

/** Hvornår indkøbet blev foretaget. `dato` i den faktiske model. */
const indkoebMs = (i) => (Number.isFinite(i?.dato) ? i.dato : i?.datoMs);

/** Enhedsprisen vi faktisk betalte. */
const indkoebEnhedsprisOere = (i) =>
  Number.isInteger(i?.prisPrEnhedOere) ? i.prisPrEnhedOere : i?.prisOere;

/**
 * ⚠ ET TOMT FELT SKAL SIGE HVORFOR — DER ER TRE SLAGS.
 *
 * Skærmen skrev "for lidt grundlag" på hvert eneste tal uden værdi, og det er
 * kun den ene af dem. De andre to er noget helt andet, og de peger på hver
 * sin handling:
 *
 *   forLidt      vi har målt, men for få gange. Køb mere hos dem, så kommer
 *                tallet. HANDLING: vent.
 *   udsnit       vi har tallene, men vi har ikke DEM ALLE — nævneren er et
 *                hentet vindue. HANDLING: hent bredere, eller aggregér.
 *   ingenKilde   noden findes ikke. HANDLING: byg den.
 *
 * Det er den samme skelnen CLAUDE.md kræver af hvert `null` i `kpi/`
 * (beslutning 62), flyttet ned til det tal en indkøber kigger på. En
 * fællestekst gør de tre til ét problem ingen kan gøre noget ved.
 */
export const MAALING_AARSAG = {
  forLidt: "for lidt grundlag",
  udsnit: "kan ikke regnes af et udsnit",
  ingenKilde: "kilden findes ikke",
};

/** Teksten der skal stå i feltet. Ét sted — to skærme viser de samme tal. */
export const maalTekst = (maaling) =>
  MAALING_AARSAG[maaling?.aarsag] || MAALING_AARSAG.forLidt;

const maal = (vaerdi, grundlag) => ({
  vaerdi: grundlag >= MINDSTE_GRUNDLAG ? vaerdi : null,
  grundlag,
  nokData: grundlag >= MINDSTE_GRUNDLAG,
  aarsag: grundlag >= MINDSTE_GRUNDLAG ? null : "forLidt",
});

/**
 * Et tal vi ikke kan regne — af en anden grund end at grundlaget er tyndt.
 *
 * ⚠ GRUNDLAGET FØLGER MED ALLIGEVEL. "Vi har 40 indkøb hos dem, og vi kan
 * stadig ikke sige andelen" er en anden oplysning end "vi har to".
 */
const intetMaal = (aarsag, grundlag) => ({
  vaerdi: null, grundlag, nokData: false, aarsag,
});

/**
 * Leveringspræcisionen for et sæt indkøbslinjer — som andel og med grundlag.
 *
 * ⚠ KUN LINJER DER HAR EN AFTALT TERMIN TÆLLER MED. Et indkøb uden aftalt
 * dato kan ikke være forsinket, og talte vi det med som "til tiden", ville
 * tallet stige hver gang nogen glemte at skrive terminen på.
 *
 * ⚠ DEN STÅR HER OG IKKE INDE I beregnNoegletal(), fordi TO forbrugere skal
 * bruge den: leverandørens eget nøgletal, og nøgletallet
 * `indkoeb.leveranceTilTidenPct` for hele divisionen. Skrev aggregeringen sin
 * egen udgave, ville de to kunne blive uenige om hvad "til tiden" er — og
 * uenigheden ville først vise sig som to tal på to skærme, uden at nogen
 * kunne se hvilket der var forkert.
 *
 * ⚠ PÅ SEKUNDET, IKKE PÅ DAGEN. leveret <= aftalt. En levering samme dag men
 * to timer for sent er for sent — det er terminen der er aftalen.
 */
export function leveringspraecision(indkoeb = []) {
  const medTermin = indkoeb.filter(
    (i) => Number.isFinite(i?.aftaltLeveringMs) && Number.isFinite(i?.leveretMs)
  );
  const tilTiden = medTermin.filter((i) => i.leveretMs <= i.aftaltLeveringMs);
  return {
    pct: medTermin.length
      ? Math.round((tilTiden.length / medTermin.length) * 100)
      : 0,
    grundlag: medTermin.length,
  };
}

/**
 * beregnNoegletal(leverandoer, { indkoeb, fakturaer, sager }, paaMs)
 *   → seks tal, hvert med sit grundlag
 *
 * ⚠ BEREGNET HOS FORBRUGEREN, ALDRIG GEMT. Beslutning 6. Et gemt
 * performancetal driver fra de fakturaer det blev regnet på, og så rangerer
 * man sine leverandører efter et tal ingen kan genfinde.
 *
 * Alle seks er valgt så de peger på en HANDLING. Et tal man ikke kan gøre
 * noget ved, er pynt:
 *
 *   leveringspraecision  → tal med leverandøren om terminer
 *   prisafvigelse        → genforhandl, eller ret vores egen prisliste
 *   fakturaafvigelse     → ryk for en kreditnota
 *   manglendeFakturaer   → ryk for fakturaen
 *   svartid              → bed om en anden kontaktperson
 *   andelAfIndkoeb       → vurder afhængigheden
 */
export function beregnNoegletal(
  leverandoer,
  {
    indkoeb = [], fakturaer = [], sager = [],
    /**
     * ⚠ RAMTE LISTEN SIT LOFT? Det afgør om `andelAfIndkoeb` overhovedet kan
     * regnes. Nævneren er tenantens SAMLEDE indkøb, og skærmen henter et
     * vindue med en grænse — er den ramt, er summen et UDSNIT, og en andel
     * regnet af et udsnit er beslutning 6's fejl med et procenttegn på.
     *
     * `useListe` svarer `afkortet`, så oplysningen fandtes allerede. Den blev
     * bare ikke sendt videre.
     */
    indkoebAfkortet = false,
    /**
     * ⚠ FINDES `sager/` OVERHOVEDET? Den gør ikke — beslutning 20 er fase 0 —
     * og et tomt array skal derfor ikke læses som "de har aldrig svaret".
     * Uden flaget kan svartiden ikke skelne "ingen node" fra "for få sager",
     * og de to peger på hver sin handling: byg noden, eller vent.
     */
    sagerFindes = false,
  } = {},
  paaMs = Date.now()
) {
  const id = leverandoer?.id;
  const mine = indkoeb.filter((i) => i?.leverandoerId === id);
  const mineFakturaer = fakturaer.filter((f) => f?.leverandoerId === id);

  /* 1. Leveringspræcision. Kun poster der HAR en aftalt termin tæller — et
        indkøb uden aftalt dato kan ikke være forsinket, og at tælle det med
        som "til tiden" ville pynte på tallet. */
  const levering = leveringspraecision(mine);

  /* 2. Prisafvigelse mod den pris der GJALDT DA VI KØBTE — ikke mod dagens.
        Se noten ved prisPaa(). Positiv procent er dyrere end aftalt. */
  const medPris = mine
    .map((i) => {
      const betalt = indkoebEnhedsprisOere(i);
      const aftalt = prisPaa(leverandoer, i.varenummer, indkoebMs(i) ?? paaMs);
      if (!aftalt || !Number.isInteger(aftalt.prisOere) || !Number.isInteger(betalt)) return null;
      if (aftalt.prisOere === 0) return null;
      return ((betalt - aftalt.prisOere) / aftalt.prisOere) * 100;
    })
    .filter((n) => n !== null);
  const prisafvigelsePct = medPris.length
    ? Math.round((medPris.reduce((s, n) => s + n, 0) / medPris.length) * 10) / 10
    : 0;

  /* 3. Fakturaafvigelse: fakturabeløbet mod det indkøb det er matchet mod.
        I ØRE og ikke i procent — det er et beløb man skal have krediteret. */
  const matchede = mineFakturaer
    .filter((f) => f.indkoebId)
    .map((f) => {
      const i = mine.find((x) => x.id === f.indkoebId);
      if (!i) return null;
      return (f.beloebOere || 0) - indkoebBeloebOere(i);
    })
    .filter((n) => n !== null);
  const fakturaafvigelseOere = matchede.reduce((s, n) => s + n, 0);

  /* 4. Indkøb uden en modtaget faktura. Det er en HUSKELISTE, ikke en
        vurdering af leverandøren — derfor et antal og ikke en procent. */
  const fakturaIndkoebIder = new Set(mineFakturaer.map((f) => f.indkoebId).filter(Boolean));
  const manglendeFakturaer = mine.filter((i) => !fakturaIndkoebIder.has(i.id)).length;

  /* 5. Svartid på sager, i timer. Kun sager hvor de FAKTISK har svaret — en
        ubesvaret sag har ingen svartid, den har en alder. Regnede vi den med
        som en meget lang svartid, ville tallet blande to forskellige ting. */
  const besvarede = sager
    .filter((s) => s?.leverandoerId === id)
    .filter((s) => Number.isFinite(s.oprettetMs) && Number.isFinite(s.foersteSvarMs))
    .map((s) => (s.foersteSvarMs - s.oprettetMs) / 3600000);
  const svartidTimer = besvarede.length
    ? Math.round((besvarede.reduce((s, n) => s + n, 0) / besvarede.length) * 10) / 10
    : 0;

  /* 6. Andel af det samlede indkøb. Afhængighed er en risiko i sig selv: den
        leverandør der står for halvdelen, kan ikke bare skiftes ud. */
  const alleOere = indkoeb.reduce((s, i) => s + indkoebBeloebOere(i), 0);
  const mineOere = mine.reduce((s, i) => s + indkoebBeloebOere(i), 0);
  const andelAfIndkoebPct = alleOere ? Math.round((mineOere / alleOere) * 100) : 0;

  return {
    leveringspraecisionPct: maal(levering.pct, levering.grundlag),
    prisafvigelsePct: maal(prisafvigelsePct, medPris.length),
    fakturaafvigelseOere: maal(fakturaafvigelseOere, matchede.length),
    /* ⚠ INGEN GRÆNSE HER. Det er en optælling, ikke et gennemsnit — én
       manglende faktura ER én manglende faktura, uanset hvor få indkøb der
       ligger bag. En tærskel ville skjule den første, og det er netop den man
       skal reagere på. */
    manglendeFakturaer: {
      vaerdi: manglendeFakturaer, grundlag: mine.length, nokData: true, aarsag: null,
    },
    svartidTimer: sagerFindes
      ? maal(svartidTimer, besvarede.length)
      : intetMaal("ingenKilde", 0),
    /* ⚠ EN ANDEL AF ET UDSNIT ER IKKE EN ANDEL. Nævneren er tenantens
       SAMLEDE indkøb; er listen afkortet, kender vi den ikke. Uden det her
       led svarede funktionen **100 %** på en liste der kun rummede én
       leverandør — med et grundlag der så tilstrækkeligt ud, fordi grundlaget
       tælles på TÆLLEREN. Det er beslutning 6's fejl med et procenttegn på. */
    andelAfIndkoebPct: indkoebAfkortet
      ? intetMaal("udsnit", mine.length)
      : maal(andelAfIndkoebPct, mine.length),
    /* Ikke et af de seks — men det tal de andre skal ses i lyset af. */
    omsaetningOere: mineOere,
  };
}

/**
 * Er prisafvigelsen noget vi bør reagere på?
 *
 * ⚠ DET AFHÆNGER AF AFTALEFORMEN. En fastaftale der afviger 4 %, er et brud på
 * aftalen; et spotkøb der gør det, er markedet. Samme tal, to forskellige
 * betydninger — og en tabel der farver dem ens, lærer indkøberen at ignorere
 * farven.
 */
export const PRISAFVIGELSE_GRAENSE_FAST_PCT = 2;
export const PRISAFVIGELSE_GRAENSE_SPOT_PCT = 10;

export function prisafvigelseTone(leverandoer, pct) {
  if (pct === null || pct === undefined) return "info";
  const fast = AFTALETYPE[leverandoer?.aftale?.type]?.forventerFastPris;
  const graense = fast ? PRISAFVIGELSE_GRAENSE_FAST_PCT : PRISAFVIGELSE_GRAENSE_SPOT_PCT;
  if (pct > graense) return "bad";
  if (pct > graense / 2) return "warn";
  return "ok";
}

/* ---- Vareforbrug og prisudvikling ------------------------------------- */

/**
 * mestKoebteVarer(linjer, maks) → [{ vare, kategori, beloebOere, andelPct }]
 *
 * AFLEDT af de linjer forbrugeren har. Den hører derfor ikke i kpi/.
 *
 * ⚠ ANDELEN ER AF DEN VISTE LISTE, og det skal skærmen skrive. Det er samme
 * fælde som andelAfIndkoebPct i beregnNoegletal(): en andel ud af et udsnit
 * ser ud som en andel af helheden, og en enkelt vare i en filtreret liste
 * giver 100 %. Nævneren er summen af det man kan se — ikke tenantens indkøb.
 */
export function mestKoebteVarer(linjer = [], maks = 5) {
  const pr = new Map();
  for (const l of linjer) {
    if (!l?.vare) continue;
    const n = pr.get(l.vare) || { vare: l.vare, kategori: l.kategori, beloebOere: 0, antal: 0 };
    n.beloebOere += indkoebBeloebOere(l);
    n.antal += 1;
    pr.set(l.vare, n);
  }
  const alle = [...pr.values()].sort((a, b) => b.beloebOere - a.beloebOere);
  const sum = alle.reduce((s, v) => s + v.beloebOere, 0);
  return alle.slice(0, maks).map((v) => ({
    ...v,
    andelPct: sum ? Math.round((v.beloebOere / sum) * 100) : 0,
  }));
}

/**
 * snitprisPrMaaned(linjer, { varenummer, maaneder, nu }) → [{ maaned, snitOere, antal }]
 *
 * ⚠ VÆGTET GENNEMSNIT, ikke gennemsnittet af enhedspriserne. Købte man 4.000
 * liter til 10 kr og 100 liter til 20 kr, er snitprisen 10,24 — ikke 15. Det
 * usammenvejede tal lader et lille nødkøb flytte månedens pris, og så ligner
 * en enkelt dyr tankning en prisstigning hos leverandøren.
 *
 * Måneder UDEN indkøb udelades frem for at stå som nul. En måned man ikke
 * købte noget, har ikke en pris på nul kroner — den har ingen pris, og en
 * kurve der dykker til bunden i juli fortæller det modsatte af sandheden.
 *
 * `maaneder` tælles bagud fra `nu`, nyeste sidst.
 */
export function snitprisPrMaaned(linjer = [], { varenummer, maaneder = 6, nu = Date.now() } = {}) {
  const start = new Date(nu);
  start.setHours(0, 0, 0, 0);
  start.setDate(1);
  start.setMonth(start.getMonth() - (maaneder - 1));

  const spande = [];
  for (let i = 0; i < maaneder; i++) {
    const fra = new Date(start);
    fra.setMonth(fra.getMonth() + i);
    const til = new Date(fra);
    til.setMonth(til.getMonth() + 1);
    spande.push({ fraMs: fra.getTime(), tilMs: til.getTime(), maaned: fra.getMonth(), aar: fra.getFullYear(), oere: 0, antal: 0 });
  }

  for (const l of linjer) {
    if (varenummer && l?.varenummer !== varenummer) continue;
    const ms = l?.dato;
    if (!Number.isFinite(ms)) continue;
    const s = spande.find((x) => ms >= x.fraMs && ms < x.tilMs);
    if (!s) continue;
    s.oere += indkoebBeloebOere(l);
    s.antal += l.antal || 0;
  }

  return spande
    .filter((s) => s.antal > 0)
    .map((s) => ({
      maaned: s.maaned, aar: s.aar, fraMs: s.fraMs,
      snitOere: Math.round(s.oere / s.antal),
      antal: s.antal,
    }));
}

/* ---- Validering før skrivning ----------------------------------------- */

/**
 * ⚠ SPEJLER firebase.rules.json. Afgør ingenting — serveren validerer igen.
 */
export const GRAENSE_INDKOEB = {
  vare: 120,
  varenummer: 60,
  enhed: 20,
  leverandoerId: 60,
  reference: 60,
  formaal: 200,
  godkendtAf: 80,
  /* 100 mio. kr. Ikke en forretningsregel — den fanger en tastefejl med tre
     nuller for meget, og et beløb over det er noget nogen skal se på. */
  maksOere: 10000000000,
};

/**
 * valideIndkoeb(post, { leverandoerer, koeretoejer, lokationer })
 *
 * ⚠ PRISEN KOMMER SOM KRONETEKST OG GEMMES SOM ØRE. Feltet `prisKr` er
 * formularens; `prisPrEnhedOere` er basens. Beslutning 2: 18,50 kr/stk er
 * 1850, og en float ender som 1849,999 i en sum over hundrede linjer.
 */
export function valideIndkoeb(post = {}, { leverandoerer = [], koeretoejer = [], lokationer = [] } = {}) {
  const f = {};


  if (!post.leverandoerId) f.leverandoerId = "Vælg en leverandør.";
  else if (!leverandoerer.some((l) => l.id === post.leverandoerId)) {
    f.leverandoerId = "Leverandøren findes ikke.";
  }

  if (typeof post.vare !== "string" || !post.vare.trim()) f.vare = "Varen skal udfyldes.";
  else if (post.vare.length > GRAENSE_INDKOEB.vare) {
    f.vare = `Varen må højst være ${GRAENSE_INDKOEB.vare} tegn.`;
  }

  const antal = Number(post.antal);
  if (post.antal === "" || post.antal == null) f.antal = "Antal skal udfyldes.";
  else if (!Number.isFinite(antal) || antal <= 0) f.antal = "Antal skal være over 0.";

  /* Prisen: kronetekst ind, øre ud. null er ikke nul — et tomt felt har ikke
     prisen nul kroner, det har ingen pris. */
  if (post.prisKr === "" || post.prisKr == null) {
    f.prisKr = "Prisen skal udfyldes.";
  } else {
    const oere = oereFraKroner(post.prisKr);
    if (oere === null) f.prisKr = "Prisen skal være et beløb — brug komma som decimaltegn.";
    else if (oere < 0) f.prisKr = "Prisen kan ikke være negativ.";
    else if (oere > GRAENSE_INDKOEB.maksOere) {
      f.prisKr = "Beløbet er over 100 mio. kr. Er der tre nuller for meget?";
    }
  }

  if (post.momsKr) {
    const moms = oereFraKroner(post.momsKr);
    if (moms === null) f.momsKr = "Momsen skal være et beløb.";
    else if (moms < 0) f.momsKr = "Momsen kan ikke være negativ.";
  }

  if (!LEVERANDOER_KATEGORI[post.kategori]) f.kategori = "Vælg en kategori.";
  if (!FAKTURASTATUS[post.fakturastatus]) f.fakturastatus = "Vælg en fakturastatus.";
  if (!Number.isFinite(Number(post.dato))) f.dato = "Datoen skal udfyldes.";

  if (post.koeretoejId && !koeretoejer.some((k) => k.id === post.koeretoejId)) {
    f.koeretoejId = "Enheden findes ikke.";
  }
  if (post.lokationId && !lokationer.some((l) => l.id === post.lokationId)) {
    f.lokationId = "Lokationen findes ikke.";
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

export function byggIndkoeb(post) {
  const ud = {
    dato: Number(post.dato),
    leverandoerId: post.leverandoerId,
    vare: post.vare.trim(),
    antal: Number(post.antal),
    /* ⚠ ØRE SOM INTEGER. Se oereFraKroner() — der ganges ikke med 100 uden
       afrunding, og der gemmes aldrig en float. */
    prisPrEnhedOere: oereFraKroner(post.prisKr),
    kategori: post.kategori,
    fakturastatus: post.fakturastatus,
  };

  /* ⚠ INTET beloebOere. Linjens beløb BEREGNES af antal × pris — to kilder
     til samme tal kan drive fra hinanden, og reglerne afviser feltet. */

  if (post.momsKr) ud.momsOere = oereFraKroner(post.momsKr);
  if (post.enhed) ud.enhed = String(post.enhed).trim();
  if (post.varenummer) ud.varenummer = String(post.varenummer).trim();
  /* Leverandørens eget nummer — det man slår op i når man ringer. */
  if (post.reference) ud.reference = String(post.reference).trim();
  if (post.formaal) ud.formaal = String(post.formaal).trim();
  if (post.koeretoejId) ud.koeretoejId = post.koeretoejId;
  if (post.lokationId) ud.lokationId = post.lokationId;
  if (Number.isFinite(Number(post.aftaltLeveringMs))) {
    ud.aftaltLeveringMs = Number(post.aftaltLeveringMs);
  }
  if (Number.isFinite(Number(post.leveretMs))) ud.leveretMs = Number(post.leveretMs);

  return ud;
}
