/* src/fleet/fakturacenter.js
 * Ét fælles sted for fakturaer på tværs af Fleet, Facility og Procure.
 * Beslutning 86.
 *
 * ⚠ INGEN NY NODE. `fakturaer/` ER allerede den fælles node.
 *
 * Regelfilen siger det selv, og den har sagt det længe: *"fakturaer er en af
 * de TRE TVETYDIGE NODER der står i basen, fordi den røres af to skærme — en
 * klausul på det ene modul ville spærre det andet."* Planchen siger det samme
 * med andre ord: **Fakturacenteret ejer fakturaen; modulet ejer sagen.**
 *
 * En `fakturacenter/`-node ved siden af ville være den samme kendsgerning to
 * steder — og så skulle hver skærm huske at lægge dem sammen. Det er
 * `bemanding.ledig`, de to demo-sæt og Bil 104 med to nummerplader.
 *
 * ⚠ NODEN ER FÆLLES — SKÆRMEN ER IKKE. Her stod at Økonomi & Rapporter var
 * base og ikke et modul. Det var forkert, og det blev fanget ved at måle:
 * `oekonomi` ER et modul, og et VALGFRIT et (nordvest har det ikke).
 *
 * `fakturaer/` har til gengæld ingen modulklausul, og det er dét der gør noden
 * fælles: en faktura kan høre til et hvilket som helst modul, så den må ikke
 * ligge bag ét af dem. En kunde uden Økonomi ser derfor stadig sine fakturaer
 * — gennem Procures linse. Det han mangler, er den TVÆRGÅENDE visning.
 *
 * ⚠ FILEN ER REN OG KENDER INGEN DATABASE. Samme grund som `procure.js`:
 * regnestykket kan prøves uden en emulator, og funktionen henter posterne og
 * kalder herind.
 */
import {
  matchForslag, ordreSumOere, ORDRESTATUS,
} from "./procure.js";

/**
 * Hvor en faktura kan høre hen.
 *
 * ⚠ `modul` ER DET DER AFGØR OM ARTEN OVERHOVEDET FORESLÅS. En kunde uden
 * Facility må aldrig se en facility-destination: forslaget ville pege på en
 * node hans regler afviser, og "kan ikke læses" ligner "findes ikke".
 * Målt på nordvest, som har facility, flåde og indkøb — men hverken booking,
 * unitbooking eller warehouse.
 *
 * ⚠ OG DER ER INGEN `warehouse`-DESTINATION, SELV OM PLANCHEN TEGNER EN.
 *
 * Planchens femte kasse hedder *"Warehouse / øvrigt — lager, internt forbrug
 * m.m."*. Warehouse er 3PL: **kundens** gods, som VI fakturerer for. Der
 * kommer ingen leverandørfaktura ind på den forretning — pengene går den
 * anden vej. Den kasse svarer altså ikke til noget indgående bilag.
 *
 * Det der FINDES, er vores eget forbrugslager, og det hedder `forbrugsvarer`
 * (beslutning 85). Arten hedder derfor `lager` og ikke `warehouse` — at kalde
 * den warehouse ville være femte gang et lagernavn dækkede over et andet.
 */
export const DESTINATIONSART = {
  fleet: {
    label: "Fleet-sag", under: "Værksted, service og reparationer",
    modul: "flaade", ikon: "lastbil", node: "opgaver", opgaveart: "vaerksted",
  },
  facility: {
    label: "Facility-sag", under: "Ejendomme, drift og vedligehold",
    modul: "facility", ikon: "bygning", node: "opgaver", opgaveart: "facility",
  },
  procure: {
    label: "Procure-ordre", under: "Indkøb, ordrer og leverancer",
    modul: "indkoeb", ikon: "vogn", node: "indkoebsordrer",
  },
  lager: {
    label: "Varelager", under: "Vores egne forbrugsvarer",
    modul: "indkoeb", ikon: "kasse", node: "forbrugsvarer",
  },
  /**
   * ⚠ "UDEN MATCH" ER EN DESTINATION, IKKE ET FRAVÆR.
   *
   * Uden den kan en faktura der ikke hører nogen steder hen, aldrig afklares —
   * den bliver stående på listen over uafklarede for evigt, og en liste der
   * ikke kan tømmes, holder man op med at kigge på. Samme greb som
   * `ikkeMatchbar` på Procure-fakturaen (beslutning 83).
   */
  ingen: {
    label: "Uden match", under: "Kræver manuel håndtering",
    modul: null, ikon: "advarsel", node: null,
  },
};
export const ALLE_DESTINATIONSARTER = Object.keys(DESTINATIONSART);

/** De arter der peger på noget. `ingen` gør ikke. */
export const PEGENDE_ARTER = ALLE_DESTINATIONSARTER.filter((a) => DESTINATIONSART[a].node);

/**
 * Hvordan bilaget kom ind.
 *
 * ⚠ EN KILDE ER IKKE EN DESTINATION. Planchen er tydelig: *"Invoice-mail er
 * kun én kanal, ikke fundamentet."* Kilden siger hvor bilaget kom fra;
 * destinationen siger hvor det hører hen. Slog vi dem sammen, kunne en
 * faktura fra mailen aldrig blive en Fleet-sag.
 */
export const FAKTURAKILDE = {
  mail: { label: "Invoice-mail", bygget: false },
  upload: { label: "Manuel upload", bygget: false },
  mobil: { label: "Mobilkvittering", bygget: false },
  sag: { label: "Fra sag", bygget: false },
  /* ⚠ DEN ENESTE DER ER BYGGET. Alt andet kræver fillagring, og den findes
     ikke — se noten på skærmen. En kilde der står som bygget uden at være det,
     er et løfte systemet ikke holder. */
  registreret: { label: "Registreret i systemet", bygget: true },
};
export const ALLE_FAKTURAKILDER = Object.keys(FAKTURAKILDE);

/**
 * Signalerne bag et destinationsforslag.
 *
 * ⚠ SAMME HOLDNING SOM `MATCHSIGNAL` I procure.js: en score er en påstand om
 * sikkerhed, og den skal kunne efterprøves. Skærmen viser HVILKE signaler der
 * slog til, så den der godkender, kan se om de 96 % kommer af et sagsnummer
 * eller af at beløbet tilfældigvis lignede.
 */
export const DESTINATIONSSIGNAL = {
  nummer: { label: "Sags- eller ordrenummer på fakturaen", vaegt: 100 },
  leverandoer: { label: "Samme leverandør", vaegt: 40 },
  /* ⚠ "ENHEDEN", IKKE "KØRETØJET". Ordet blev omdøbt, og prøven i
     navne.test.mjs fangede det her — den findes fordi omdøbningen blev erklæret
     færdig to gange for tidligt. Identifikatoren hedder stadig `koeretoej`:
     den står i noden, i reglerne og i udstedte tokens, og den skal blive. Det
     er kun det brugeren SER, der er omdøbt. */
  koeretoej: { label: "Enheden står på fakturaen", vaegt: 30 },
  aktiv: { label: "Anlægget står på fakturaen", vaegt: 30 },
  vare: { label: "Varen står på fakturaen", vaegt: 30 },
  beloeb: { label: "Samme beløb (ekskl. moms)", vaegt: 25 },
  beloebNaer: { label: "Beløb tæt på", vaegt: 12 },
  dato: { label: "Tæt på hinanden i tid", vaegt: 15 },
};

/** Hvor tæt to beløb må være for at tælle som "tæt på". 5 % — et estimat er
 *  et estimat, og en værkstedsregning rammer sjældent præcist. */
export const BELOEB_TOLERANCE_BPS = 500;

/** Hvor længe efter en sag en faktura stadig er sandsynlig. */
export const VINDUE_DAGE = 120;

/**
 * ⚠ ET FORSLAG UNDER DET HER VISES IKKE. En liste med et 12 %-forslag
 * inviterer til at nogen godkender det for at komme videre — og en forkert
 * destination er værre end ingen, fordi den ser afsluttet ud.
 */
export const MINDSTE_SCORE = 40;

const DAG = 86400000;

const normal = (x) => String(x || "").toLowerCase().replace(/[\s,.\-/]+/g, " ").trim();
const nummerform = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const naerNok = (a, b, bps) => {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a === b) return true;
  const stoerst = Math.max(Math.abs(a), Math.abs(b));
  if (!stoerst) return false;
  return (Math.abs(a - b) * 10000) / stoerst <= bps;
};

/** Al tekst på fakturaen der kan bære et nummer eller et navn. */
const fakturatekst = (f) =>
  `${f?.fakturanummer || ""} ${f?.reference || ""} ${f?.note || ""} ${f?.sagsnummer || ""}`;

/**
 * scorAf(signaler) → 100 ved et nummertræf, ellers højst 95.
 *
 * ⚠ KUN ET NUMMER GIVER FULD SCORE. Alt andet er en SLUTNING — samme
 * leverandør, nogenlunde samme beløb, nogenlunde samme uge. En slutning må
 * ikke kunne se ud som en kendsgerning, når tallet står ved siden af en knap
 * der hedder "Godkend match". Præcis samme loft som `matchForslag()`
 * (beslutning 83).
 */
export function scorAf(signaler = []) {
  const raa = signaler.reduce((s, k) => s + (DESTINATIONSSIGNAL[k]?.vaegt || 0), 0);
  return signaler.includes("nummer") ? 100 : Math.min(95, raa);
}

/**
 * Fælles led for de destinationer der hænger på en OPGAVE — Fleet og Facility.
 *
 * ⚠ DE TO ER SAMME NODE MED HVER SIN ART. `opgaver.art` er `vaerksted` eller
 * `facility`, og modulet følger arten (CLAUDE.md). To separate opslag ville
 * være to steder at rette, når en opgave får et felt mere.
 */
function opgaveforslag(faktura, opgaver, art, { koeretoejer = [], aktiver = [] } = {}) {
  const tekst = fakturatekst(faktura);
  const nummer = nummerform(tekst);
  const navnetekst = normal(tekst);
  const ud = [];

  for (const o of opgaver) {
    if (o.art !== art) continue;
    /* ⚠ EN ANNULLERET OPGAVE HAR IKKE UDLØST EN REGNING. Stod den på listen,
       kunne et tilfældigt beløbssammenfald "afslutte" en opgave ingen har
       udført. Samme led som kladder får i `matchForslag()`. */
    if (o.status === "annulleret") continue;

    const signaler = [];

    /* Sagsnummeret eller opgavens eget id på fakturaen er afgørende. */
    if ((o.sagId && nummer.includes(nummerform(o.sagId)))
        || (o.id && nummer.includes(nummerform(o.id)))) {
      signaler.push("nummer");
    }
    if (faktura.leverandoerId && faktura.leverandoerId === o.leverandoerId) {
      signaler.push("leverandoer");
    }

    /* ⚠ KØRETØJET GENKENDES PÅ KALDENAVN ELLER NUMMERPLADE — ikke på id'et.
       Leverandøren skriver "Bil 104" eller "DE 45 678" på fakturaen; vores
       interne id har han aldrig set. */
    if (art === "vaerksted" && o.koeretoejId) {
      const kt = koeretoejer.find((k) => k.id === o.koeretoejId);
      const traef = kt && [kt.kaldenavn, kt.registrering].filter(Boolean).some(
        (n) => navnetekst.includes(normal(n)) || nummer.includes(nummerform(n)));
      if (traef) signaler.push("koeretoej");
    }
    if (art === "facility" && o.aktivId) {
      const a = aktiver.find((x) => x.id === o.aktivId);
      if (a?.navn && navnetekst.includes(normal(a.navn))) signaler.push("aktiv");
    }

    /* ⚠ BEGGE BELØB EKSKL. MOMS. Opgavens `beloebOere` er ekskl., og
       fakturaens ligeså — momsen er sit eget felt. Sammenlignede vi
       fakturaens inkl.-tal med opgavens, ville hver måling være 25 % forkert,
       systematisk. Det var planche 1's egen fejl (beslutning 83). */
    if (Number.isInteger(faktura.beloebOere) && Number.isInteger(o.beloebOere) && o.beloebOere > 0) {
      if (faktura.beloebOere === o.beloebOere) signaler.push("beloeb");
      else if (naerNok(faktura.beloebOere, o.beloebOere, BELOEB_TOLERANCE_BPS)) signaler.push("beloebNaer");
    }

    const dage = Number.isFinite(faktura.fakturadatoMs) && Number.isFinite(o.startMs)
      ? (faktura.fakturadatoMs - o.startMs) / DAG : null;
    /* Regningen kommer EFTER arbejdet. En faktura dateret før opgaven er ikke
       "tæt på" — den er et andet køb. */
    if (dage !== null && dage >= -1 && dage <= VINDUE_DAGE) signaler.push("dato");

    if (!signaler.length) continue;

    /**
     * ⚠ EN ANDEN LEVERANDØRS SAG FORESLÅS IKKE — uanset beløbet. Mercedes
     * sender ikke en regning for Crawfords portarbejde. Uden det led kunne
     * beløb + dato alene give 40 %, og et forslag på loftet bliver godkendt
     * for at komme videre. Målt i Procure, hvor det gav 55 %.
     *
     * Undtagelsen er nummeret og den fysiske genkendelse: står VORES sagsnummer
     * eller bilen på fakturaen, er en forkert leverandør en fejl vi skal SE.
     */
    const staerkt = signaler.includes("nummer") || signaler.includes("koeretoej")
      || signaler.includes("aktiv");
    if (!staerkt && !signaler.includes("leverandoer")) continue;

    const score = scorAf(signaler);
    if (score < MINDSTE_SCORE) continue;
    ud.push({ art: art === "vaerksted" ? "fleet" : "facility", maal: o, score, signaler });
  }
  return ud;
}

/** Forslag mod vores eget forbrugslager. */
function lagerforslag(faktura, forbrugsvarer) {
  const tekst = fakturatekst(faktura);
  const nummer = nummerform(tekst);
  const navnetekst = normal(tekst);
  const ud = [];

  for (const v of forbrugsvarer) {
    const signaler = [];
    if (v.varenummer && nummer.includes(nummerform(v.varenummer))) signaler.push("nummer");
    else if (v.navn && navnetekst.includes(normal(v.navn))) signaler.push("vare");
    if (faktura.leverandoerId && faktura.leverandoerId === v.leverandoerId) {
      signaler.push("leverandoer");
    }
    /* ⚠ EN LAGERVARE UDEN ET NAVNE- ELLER NUMMERTRÆF ER IKKE ET FORSLAG.
       Leverandøren alene ville foreslå hver eneste vare vi køber hos ham. */
    if (!signaler.includes("nummer") && !signaler.includes("vare")) continue;

    const score = scorAf(signaler);
    if (score < MINDSTE_SCORE) continue;
    ud.push({ art: "lager", maal: v, score, signaler });
  }
  return ud;
}

/**
 * foreslaaDestination(faktura, kontekst) → [{ art, maal, score, signaler }]
 *
 * Sorteret bedst først, på tværs af arter.
 *
 * ⚠ MODULERNE AFGØR HVAD DER OVERHOVEDET FORESLÅS. En kunde uden Facility må
 * aldrig se en facility-destination: forslaget ville pege på en node hans
 * regler afviser, og "kan ikke læses" ligner "findes ikke". `moduler` er
 * tenantens node — er den fraværende, har kunden ALLE moduler (samme regel som
 * i `firebase.rules.json`: `!moduler.exists() || …`). En filterkopi der er
 * 90 % rigtig, afviser præcis dét reglen tillader.
 *
 * ⚠ OG PROCURE GENDIGTES IKKE. `matchForslag()` fra beslutning 83 ER
 * scoringen for en indkøbsordre — den kender bestillingsnummeret, én-faktura-
 * pr-ordre-reglen og beløbet ekskl. moms. Et andet regnestykke her ville give
 * Fakturacenteret og Procure hver sit svar på ét spørgsmål, to klik fra
 * hinanden.
 */
export function foreslaaDestination(faktura, {
  moduler = null,
  opgaver = [], ordrer = [], forbrugsvarer = [],
  koeretoejer = [], aktiver = [],
  matchedeOrdrer = [],
} = {}) {
  if (!faktura) return [];

  /* Fraværende node = alle moduler. Præcis som reglen læser den. */
  const harModul = (m) => !m || !moduler || moduler[m] === true;

  const ud = [];
  if (harModul("flaade")) {
    ud.push(...opgaveforslag(faktura, opgaver, "vaerksted", { koeretoejer }));
  }
  if (harModul("facility")) {
    ud.push(...opgaveforslag(faktura, opgaver, "facility", { aktiver }));
  }
  if (harModul("indkoeb")) {
    for (const f of matchForslag(faktura, ordrer, { matchede: matchedeOrdrer })) {
      ud.push({ art: "procure", maal: f.ordre, score: f.score, signaler: f.signaler });
    }
    ud.push(...lagerforslag(faktura, forbrugsvarer));
  }

  return ud.sort((a, b) => b.score - a.score);
}

/**
 * Fakturaens tilstand i centeret — IKKE dens godkendelsesstatus.
 *
 * ⚠ TO SPØRGSMÅL, IKKE ÉT. "Hvor hører den hen" og "må den betales" er
 * uafhængige: en faktura kan være placeret og afvist, eller godkendt uden
 * nogensinde at have haft en destination. Slog vi dem sammen i ét felt, kunne
 * man ikke skrive det ene uden at påstå noget om det andet. Samme skel som
 * `MATCHTILSTAND` i procure.js.
 */
export const CENTERTILSTAND = {
  placeret: { label: "Placeret", tone: "ok" },
  udenMatch: { label: "Uden match", tone: "warn" },
  afklaretUdenMatch: { label: "Ingen destination", tone: "info" },
};

export function centertilstand(faktura) {
  if (faktura?.destinationArt === "ingen") return "afklaretUdenMatch";
  if (faktura?.destinationArt && faktura?.destinationId) return "placeret";
  return "udenMatch";
}

/**
 * kanSaetteDestination(faktura, { art, id }, kontekst) → { ok, aarsag }
 *
 * Svarer, afgør ikke — skærmen viser, funktionen håndhæver med den samme.
 */
export function kanSaetteDestination(faktura, valg = {}, { moduler = null } = {}) {
  if (!faktura) return { ok: false, aarsag: "Ingen faktura valgt." };
  if (!DESTINATIONSART[valg.art]) return { ok: false, aarsag: "Vælg en destination." };

  /* ⚠ EN BOGFØRT FAKTURA FLYTTES IKKE. Posten er sendt til regnskabet, og en
     destination der ændrer sig bagefter, gør en kontering der stemte, til en
     der ikke gør — uden at nogen kan se hvorfor. Samme led som `kanMatche()`. */
  if (faktura.status === "bogfoert") {
    return { ok: false, aarsag: "Fakturaen er bogført. Destinationen kan ikke ændres bagefter." };
  }

  const modul = DESTINATIONSART[valg.art].modul;
  if (modul && moduler && moduler[modul] !== true) {
    return {
      ok: false,
      aarsag: `Virksomheden har ikke ${modul}-modulet, så den destination findes ikke.`,
    };
  }

  /* `ingen` er et SVAR og bærer derfor intet id. */
  if (valg.art === "ingen") {
    if (!String(valg.begrundelse || "").trim()) {
      return {
        ok: false,
        aarsag: "Skriv hvorfor ingen af destinationerne passer. Uden en grund begynder den næste forfra.",
      };
    }
    return { ok: true, aarsag: null };
  }

  if (!valg.id) return { ok: false, aarsag: "Vælg hvad fakturaen hører til." };
  return { ok: true, aarsag: null };
}

/**
 * destinationstekst(faktura, kontekst) → en linje man kan læse i en tabel.
 *
 * ⚠ ET RÅT ID ER IKKE ET SVAR. Står der `-Oa1b2c3` i destinationskolonnen,
 * kan man hverken se hvad det er eller om det er rigtigt.
 */
export function destinationstekst(faktura, {
  opgaver = [], ordrer = [], forbrugsvarer = [], koeretoejer = [],
} = {}) {
  const art = faktura?.destinationArt;
  if (!art || !DESTINATIONSART[art]) return null;
  if (art === "ingen") return { label: DESTINATIONSART.ingen.label, under: faktura.destinationGrund || null };

  const id = faktura.destinationId;
  if (art === "procure") {
    const o = ordrer.find((x) => x.id === id);
    return {
      label: DESTINATIONSART.procure.label,
      under: o ? `${o.nummer} · ${ORDRESTATUS[o.status]?.label || o.status}` : id,
      sum: o ? ordreSumOere(o) : null,
    };
  }
  if (art === "lager") {
    const v = forbrugsvarer.find((x) => x.id === id);
    return { label: DESTINATIONSART.lager.label, under: v?.navn || id };
  }
  const o = opgaver.find((x) => x.id === id);
  const kt = o?.koeretoejId ? koeretoejer.find((k) => k.id === o.koeretoejId) : null;
  return {
    label: DESTINATIONSART[art].label,
    under: o ? [kt?.kaldenavn, o.beskrivelse].filter(Boolean).join(" · ") : id,
  };
}

/**
 * afvigelseOere(faktura, forslag) → hvad fakturaen afviger fra det ventede.
 *
 * ⚠ `null` NÅR DER INTET ER AT SAMMENLIGNE MED — ikke 0. Et nul betyder "de er
 * ens", hvilket er noget helt andet end "vi ved det ikke". `100 - null` er
 * 100; det er den fælde CLAUDE.md kalder at regne videre på et null.
 */
export function afvigelseOere(faktura, forslag) {
  if (!Number.isInteger(faktura?.beloebOere) || !forslag) return null;
  const ventet = forslag.art === "procure"
    ? ordreSumOere(forslag.maal)
    : forslag.maal?.beloebOere;
  if (!Number.isInteger(ventet) || ventet <= 0) return null;
  return faktura.beloebOere - ventet;
}
