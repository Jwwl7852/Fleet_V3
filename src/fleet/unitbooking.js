/* src/fleet/unitbooking.js
 * Unitbooking — udlejning af transportkasser.
 *
 * Kommer af prototypen "Turtlebooking" (Hizkia Denmark): kasser med id og
 * type, reolpladser i haller, udlån med sagsnummer, historik og kalender.
 * Se UNITBOOKING.md for hele planen og de syv ting der blev afgjort først.
 *
 * ---------------------------------------------------------------------------
 * ⚠ TRE NAVNE VAR TAGET, OG DE ER IKKE GENBRUGT.
 *
 *   `lagre`     er reservedelslageret under Indkøb
 *   `bookinger` er en TRANSPORTOPGAVE med etaper, køretøj og chauffør
 *   `kunder`    er kundekartoteket med priser og aftaler
 *
 * Derfor: `kasser`, `reolpladser`, `kasseudlaan`. Et udlån af en kasse har en
 * periode og en kasse; en booking har etaper og en rute. At kalde dem det
 * samme ville være beslutning 16 om igen.
 *
 * ---------------------------------------------------------------------------
 * ⚠ PLADSEN ER ET ID, IKKE EN STRENG.
 *
 * Prototypen brugte `"Hal 1 - Reol 2 - Fag 1 - Hylde 10 - Plads 1"` både som
 * nøgle og som visningsnavn, og den stod TO gange på hver kasse. Omdøbes en
 * hal, peger hver eneste kasse på en plads der ikke findes.
 *
 * Her er pladsen et id med felter, og navnet UDLEDES af `pladsnavn()`. Samme
 * rettelse som `steder.js` lavede for hjemsted.
 *
 * INGEN IMPORTS. Filen skal kunne prøves i Node uden Vite, og logikken skal
 * kunne kopieres til functions/delt/ den dag konfliktkontrollen bliver en
 * Cloud Function.
 */

/* ---- Kassens tilstand -------------------------------------------------- */

/**
 * ⚠ "UDLÅNT HOS KUNDE" VAR EN PLADS I PROTOTYPEN. Det er det ikke: det er en
 * TILSTAND. En kasse der er ude, står ikke på en hylde der hedder "hos
 * kunde" — den står ingen steder, og `pladsId` er null. Blandes de to, kan
 * man ikke tælle ledige pladser, og en reolplads kan optages af en kasse der
 * fysisk er i Paris.
 */
/**
 * ⚠ "BOOKET" ER IKKE EN KASSESTATUS. Prototypen havde den, og den blev
 * fjernet med vilje: *booket* betyder at en sagsbehandler har **reserveret**
 * kassen — og en reservation ER et udlån. Står den også på kassen, er den
 * samme kendsgerning gemt to steder, og de bliver uenige. Det er
 * `bemanding.ledig` i ny forklædning.
 *
 * En kasse der er reserveret til oktober, står i august stadig fysisk på sin
 * hylde og er *ledig*. Reservationen vises som et MÆRKAT udledt af
 * `kasseudlaan` — med sagsnummer og periode, hvilket er mere end et bart
 * "Booket" nogensinde fortalte.
 */
export const KASSE_STATUS = {
  ledig:      { status: "ledig",      label: "Ledig",       pill: "ok",   paaPlads: true },
  klargjort:  { status: "klargjort",  label: "Klargjort",   pill: "warn", paaPlads: true },
  udlaant:    { status: "udlaant",    label: "Udlånt",      pill: "bad",  paaPlads: false },
  /* En kasse kan gå i stykker. Den slettes ikke — der hænger historik på den. */
  udeAfDrift: { status: "udeAfDrift", label: "Ude af drift", pill: "bad", paaPlads: true },
};

export const ALLE_KASSE_STATUS = Object.keys(KASSE_STATUS);

/**
 * De to en lagermedarbejder må sætte i hånden.
 *
 * ⚠ `klargjort` og `udlaant` er FØLGER af et udlån, ikke valg. Kunne de
 * sættes i formularen, ville der findes en kasse der stod som udlånt uden et
 * udlån at pege på — og ingen kunne se hvem der havde den. De sættes af
 * `kasseudlaanskriv`, sammen med udlånet, i én skrivning.
 */
export const SELVVALGT_KASSE_STATUS = ["ledig", "udeAfDrift"];

/** Skal kassen stå på en reolplads i den her tilstand? */
export const kraeverPlads = (status) => KASSE_STATUS[status]?.paaPlads === true;

/* ---- Udlånets tilstand ------------------------------------------------- */

/**
 * Forløbet for ét udlån. ⚠ IKKE booking-state.js' tilstande — det er et andet
 * forløb med en anden godkendelse. To tilstandsmaskiner der ligner hinanden,
 * er ikke den samme.
 */
export const UDLAAN_TILSTAND = {
  booket:     { tilstand: "booket",     label: "Booket",     pill: "info" },
  klargjort:  { tilstand: "klargjort",  label: "Klargjort",  pill: "warn" },
  udlaant:    { tilstand: "udlaant",    label: "Udlånt",     pill: "bad" },
  returneret: { tilstand: "returneret", label: "Returneret", pill: "ok" },
  annulleret: { tilstand: "annulleret", label: "Annulleret", pill: "info" },
};

export const ALLE_UDLAAN_TILSTANDE = Object.keys(UDLAAN_TILSTAND);

/** Tilstande hvor kassen er lovet væk og ikke kan loves væk igen. */
export const BINDENDE = ["booket", "klargjort", "udlaant"];

/** Tilstande hvor sagen er lukket. Der skiftes ikke ud af dem. */
export const AFSLUTTET = ["returneret", "annulleret"];

/**
 * Hvad et udlån må skifte til.
 *
 * ⚠ DER ER INGEN GENVEJ FRA `booket` TIL `udlaant`. Klargøringen er det ene
 * sted hvor et menneske har kassen i hånden og kan se om den er hel. Springes
 * den over, går kassen ud af huset uden at nogen har set på den — og skaden
 * bliver først opdaget hos museet, hvor den ikke kan afgøres. Det koster ét
 * klik at klargøre.
 *
 * ⚠ OG DER ER INGEN VEJ TILBAGE FRA `returneret`. Kassen er kommet hjem;
 * skal den ud igen, er det et NYT udlån med sin egen periode. En genåbnet
 * post ville betyde at historikken kunne skrives om bagefter.
 */
export const UDLAAN_SKIFT = {
  booket:     ["klargjort", "annulleret"],
  klargjort:  ["udlaant", "booket", "annulleret"],
  udlaant:    ["returneret"],
  returneret: [],
  annulleret: [],
};

/**
 * Det ENE skridt fremad. Planchen kalder det "næste handling", og pointen er
 * at man aldrig skal vælge: der er ét rigtigt næste skridt, og resten er
 * undtagelser (annullér, rul klargøringen tilbage).
 *
 * ⚠ SKREVET UD, IKKE "FØRSTE ELEMENT I UDLAAN_SKIFT". Rækkefølgen i den
 * liste er en visningsrækkefølge, og den dag nogen sorterer den alfabetisk,
 * ville "annullér" blive til det næste skridt — og knappen ville stå som den
 * primære handling på hver eneste reservation. En prøve binder de to sammen,
 * så et skridt her altid er et lovligt skift dér.
 */
export const NAESTE_SKIFT = {
  booket: "klargjort",
  klargjort: "udlaant",
  udlaant: "returneret",
};

export const naesteSkift = (tilstand) => NAESTE_SKIFT[tilstand] || null;

/** Må udlånet skifte fra → til? Samme rolle som `kanSkifte()` i booking. */
export const kanSkifteUdlaan = (fra, til) =>
  Array.isArray(UDLAAN_SKIFT[fra]) && UDLAAN_SKIFT[fra].includes(til);

/**
 * Hvad skiftet gør ved KASSEN — eller `null`, hvis den ikke røres.
 *
 * ⚠ EN BOOKING RØRER IKKE KASSEN. Den står stadig på sin hylde. Det er hele
 * grunden til at `booket` ikke er en kassestatus.
 *
 * ⚠ EN UDLEVERET KASSE MISTER SIN PLADS. `pladsId: null`, ikke "hos kunde" —
 * ellers er hylden optaget af en kasse der fysisk er i Paris, og ledige
 * pladser kan ikke tælles. Ved retur får den sin HJEMPLADS igen: det er dér
 * den hører til, og lagermanden kan flytte den bagefter hvis den skal stå et
 * andet sted.
 *
 * Returneres den i stykker, sættes `udeAfDrift` bagefter i Kasser — det er en
 * observation om kassen, ikke om udlånet.
 */
export function virkningPaaKasse({ fra, til, kasse = {} }) {
  if (til === "klargjort") return { status: "klargjort" };
  if (til === "udlaant") return { status: "udlaant", pladsId: null };
  if (til === "returneret") {
    return { status: "ledig", pladsId: kasse.hjemPladsId || null };
  }
  /* Fortrydes klargøringen — eller annulleres et klargjort udlån — skal
     kassen ud af klargjort igen. Var den kun booket, blev den aldrig rørt. */
  if ((til === "booket" || til === "annulleret") && fra === "klargjort") {
    return { status: "ledig" };
  }
  return null;
}

/* ---- Reolpladsen ------------------------------------------------------- */

export const PLADSFELTER = ["hal", "reol", "fag", "hylde", "plads"];

/**
 * Navnet på en plads — UDLEDT, aldrig gemt.
 *
 * ⚠ ET GEMT NAVN DRIVER FRA SINE FELTER. Rettes `hal` fra "Hal 1" til
 * "Hal A", skal navnet med — og den dag de to er uenige, kan ingen se hvilket
 * der er rigtigt. Samme grund som at `bemanding.ledig` er den kendte fejl.
 */
export function pladsnavn(p) {
  if (!p) return "";
  return [
    p.hal,
    p.reol != null && p.reol !== "" ? `Reol ${p.reol}` : null,
    p.fag != null && p.fag !== "" ? `Fag ${p.fag}` : null,
    p.hylde != null && p.hylde !== "" ? `Hylde ${p.hylde}` : null,
    p.plads != null && p.plads !== "" ? `Plads ${p.plads}` : null,
  ].filter(Boolean).join(" · ");
}

/** Hallerne der findes, sorteret dansk. Udledt af pladserne — ikke et katalog. */
export function haller(pladser = {}) {
  const set = new Set(Object.values(pladser).map((p) => p?.hal).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, "da"));
}

export function valideReolplads(post = {}) {
  const f = {};
  if (!post.hal?.trim()) f.hal = "Hal skal udfyldes.";
  else if (post.hal.length > 40) f.hal = "Hal må højst være 40 tegn.";
  for (const felt of ["reol", "fag", "hylde", "plads"]) {
    const v = post[felt];
    if (v == null || String(v).trim() === "") f[felt] = "Skal udfyldes.";
    else if (String(v).length > 10) f[felt] = "Højst 10 tegn.";
  }
  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/* ---- Kassen ------------------------------------------------------------ */

/**
 * ⚠ KASSENS ID ER DENS PÅSKRIFT. "MDT-101" står på kassen med tusch, og det
 * er det man søger på i telefonen ude på lageret. Et genereret id ville
 * betyde at nummeret på kassen og nummeret i systemet var to ting.
 */
export const KASSE_ID_MOENSTER = /^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/;

/**
 * Undertyperne på en type, som poster. ⚠ DE LIGGER UNDER TYPEN, ikke i en
 * node ved siden af: en undertype hører til præcis én type, og med en egen
 * node kunne den pege på en type der var slettet.
 */
export const undertyperFor = (type) =>
  Object.entries(type?.undertyper || {})
    .map(([id, u]) => ({ id, navn: u?.navn || id }))
    .sort((a, b) => a.navn.localeCompare(b.navn, "da"));

/**
 * ⚠ "HAR UNDERTYPE" ER IKKE ET FELT. Planchens ja/nej er UDLEDT af om der er
 * nogen — et flag ved siden af listen ville være den samme kendsgerning to
 * steder, og de to ville blive uenige første gang nogen slettede den sidste.
 */
export const harUndertyper = (type) => undertyperFor(type).length > 0;

/**
 * Centimeter som tekst → hele millimeter. Null når feltet er tomt.
 *
 * ⚠ ÉT STED. Lagermanden måler i cm, noden bærer mm — som vægten tastes i kilo
 * og gemmes i gram. To omregninger ville betyde to steder at tabe en faktor ti.
 */
export function mmFraCm(cm) {
  if (cm === "" || cm === null || cm === undefined) return null;
  const v = Number(String(cm).replace(",", "."));
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 10);
}

/** Millimeter → centimeter som tekst til formularen. Komma, som dansk UI. */
export function cmFraMm(mm) {
  if (!Number.isFinite(mm)) return "";
  return String(mm / 10).replace(".", ",");
}

export function valideKasse(post = {}, { typer = [], pladser = [], katalog = [] } = {}) {
  const f = {};

  const id = (post.id || "").trim();
  if (!id) f.id = "Kasse-id skal udfyldes.";
  else if (!KASSE_ID_MOENSTER.test(id)) {
    f.id = "Bogstaver, tal og bindestreg — fx MDT-101.";
  }

  if (!post.type?.trim()) f.type = "Vælg en kassetype.";
  else if (typer.length && !typer.includes(post.type)) f.type = "Ukendt kassetype.";

  /* ⚠ UNDERTYPEN SKAL HØRE TIL KASSENS EGEN TYPE — og reglen siger det samme.
     Uden det led kunne en alukasse bære en trækasses undertype, og filtret
     "Alukasse + Stor" ville vise en kasse der hverken var det ene eller det
     andet.

     ⚠ OG DEN ER IKKE PÅKRÆVET. En type kan have nul undertyper, og så har
     kassen ingen. Et påkrævet felt ville tvinge en opfundet undertype frem
     på hver eneste kasse. */
  /* ⚠ MÅLENE TASTES I CENTIMETER OG GEMMES I MILLIMETER. Det er cm en
     lagermand måler i, og mm noden bærer — som vægten tastes i kilo og gemmes
     i gram. Omregningen står ét sted, `mmFraCm()`, og et halvt millimeter
     findes ikke: en kasse måles ikke skarpere end det.

     ⚠ OG ALLE TRE ELLER INGEN. Et enkelt mål alene kan hverken give m² eller
     m³, og `maalFraMm()` svarer `null` — men et felt der står udfyldt uden at
     tælle med, ser ud som en oplysning man har. */
  const maal = ["laengdeCm", "breddeCm", "hoejdeCm"];
  const satte = maal.filter((m) => String(post[m] ?? "").trim() !== "");
  for (const m of satte) {
    const v = Number(String(post[m]).replace(",", "."));
    const navn = { laengdeCm: "Længden", breddeCm: "Bredden", hoejdeCm: "Højden" }[m];
    if (!Number.isFinite(v)) f[m] = `${navn} skal være et tal.`;
    else if (v <= 0) f[m] = `${navn} skal være større end nul.`;
    /* ⚠ MÅLT FØR AFRUNDINGEN, ikke efter. Første udgave spurgte
       `mmFraCm(v) % 1 !== 0` — men mmFraCm RUNDER, så svaret var altid et
       helt tal og kontrollen kunne aldrig udløses. 95,55 cm blev til 956 mm
       i tavshed. Prøven fandt den; koden så rigtig ud. */
    else if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-9) {
      f[m] = `${navn} kan højst have én decimal — en kasse måles ikke skarpere.`;
    }
  }
  if (satte.length > 0 && satte.length < 3) {
    for (const m of maal) {
      if (!satte.includes(m) && !f[m]) {
        f[m] = "Udfyld alle tre mål — ellers kan volumen ikke regnes.";
      }
    }
  }

  const under = (post.undertype || "").trim();
  if (under && katalog.length) {
    const type = katalog.find((t) => t.id === post.type);
    if (!type) f.undertype = "Vælg først en kassetype.";
    else if (!undertyperFor(type).some((u) => u.id === under)) {
      f.undertype = harUndertyper(type)
        ? "Undertypen hører ikke til den valgte type."
        : "Den valgte type har ingen undertyper.";
    }
  }

  if (!ALLE_KASSE_STATUS.includes(post.status)) f.status = "Vælg en status.";

  /* ⚠ HJEMPLADSEN ER PÅKRÆVET, DEN NUVÆRENDE ER IKKE. En kasse hører til et
     sted; hvor den STÅR lige nu, afhænger af om den er ude. */
  if (!post.hjemPladsId) f.hjemPladsId = "Vælg en hjemplads.";
  else if (pladser.length && !pladser.includes(post.hjemPladsId)) {
    f.hjemPladsId = "Ukendt reolplads.";
  }

  if (post.pladsId && pladser.length && !pladser.includes(post.pladsId)) {
    f.pladsId = "Ukendt reolplads.";
  }
  if (kraeverPlads(post.status) && !post.pladsId) {
    f.pladsId = "En kasse der ikke er udlånt, står et sted.";
  }
  if (post.status === "udlaant" && post.pladsId) {
    /* Ellers er hylden optaget af en kasse der fysisk er hos kunden. */
    f.pladsId = "En udlånt kasse optager ikke en reolplads.";
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/* ---- Udlånet ----------------------------------------------------------- */

export function valideUdlaan(post = {}, { kasser = [] } = {}) {
  const f = {};

  if (!post.kasseId) f.kasseId = "Vælg en kasse.";
  else if (kasser.length && !kasser.includes(post.kasseId)) f.kasseId = "Ukendt kasse.";

  /* ⚠ SAGSNUMMERET ER PÅKRÆVET. Det er den eneste nøgle der binder udlånet
     til noget uden for systemet — uden det kan en kasse ikke findes igen når
     museet ringer. */
  if (!post.sagsnummer?.trim()) f.sagsnummer = "Sagsnummer skal udfyldes.";
  else if (post.sagsnummer.length > 40) f.sagsnummer = "Højst 40 tegn.";

  if (!Number.isFinite(post.fra)) f.fra = "Vælg en startdato.";
  if (!Number.isFinite(post.til)) f.til = "Vælg en slutdato.";
  if (Number.isFinite(post.fra) && Number.isFinite(post.til) && post.til < post.fra) {
    f.til = "Slut kan ikke ligge før start.";
  }

  if (!ALLE_UDLAAN_TILSTANDE.includes(post.tilstand)) f.tilstand = "Vælg en tilstand.";

  if (post.beskrivelse && post.beskrivelse.length > 300) {
    f.beskrivelse = "Højst 300 tegn.";
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/**
 * Overlapper to perioder?
 *
 * ⚠ INKLUSIVE I BEGGE ENDER. En kasse der kommer retur den 5. og lånes ud
 * igen den 5., er ikke to udlån der kan køre samtidig — den skal pakkes ud,
 * tjekkes og pakkes om. Er det for stramt for en kunde, er det en aftale, ikke
 * en regnefejl.
 */
export const overlapper = (aFra, aTil, bFra, bTil) => aFra <= bTil && bFra <= aTil;

const DAG_MS = 86400000;

/**
 * Udlånets periode som et HALVÅBENT interval `[fra, til)`.
 *
 * ⚠ TO KONVENTIONER I ÉT REPO, OG DET ER MED VILJE.
 *
 * Et udlån er **inklusivt** i begge ender: en kasse der er ude 1.–15., er også
 * ude den 15. Reservationsmodellen og `Gitterkalender.jsx` regner
 * **halvåbent** `[fra, til)`, fordi en time der slutter kl. 12 og en der
 * begynder kl. 12 ikke overlapper.
 *
 * Begge er rigtige for hver sin ting. Det farlige er oversættelsen — tegnes
 * udlånet råt på gitteret, mangler den **sidste dag**, og kassen ser fri ud
 * den dag den stadig står hos museet. Det er nøjagtig den fejl
 * Gitterkalenderens eget hoved advarer om: et gitter der er én dag forskudt,
 * opdages ikke ved at kigge på det.
 *
 * Derfor sker oversættelsen ÉT sted, med et navn, og den er prøvet mod
 * `overlapper()`.
 */
export const halvaabent = (u) => ({ fra: u.fra, til: u.til + DAG_MS });

/** Rører udlånet vinduet [vindueFra, vindueTil)? Bruges af kalenderen. */
export function iVindue(u, vindueFra, vindueTil) {
  const h = halvaabent(u);
  return h.fra < vindueTil && vindueFra < h.til;
}

/**
 * De udlån der spærrer kassen i perioden.
 *
 * ⚠ DEN HER AFGØR INGENTING — den svarer. Håndhævelsen hører i den Cloud
 * Function der skriver udlånet: to lagermænd kan ramme samme sekund, og en
 * kontrol der kun står i skærmen, kan gås uden om med en direkte skrivning.
 * Præcis samme forbehold som de fem disponeringstjek har (se CLAUDE.md).
 */
export function konflikter(udlaan = [], { kasseId, fra, til, undtagId = null }) {
  return udlaan.filter((u) =>
    u.kasseId === kasseId &&
    u.id !== undtagId &&
    BINDENDE.includes(u.tilstand) &&
    overlapper(fra, til, u.fra, u.til));
}

/**
 * De bindende udlån på en kasse, tidligst først.
 *
 * ⚠ DET ER HERFRA "BOOKET" KOMMER. Mærkatet på kassen er udledt af de her
 * poster og gemmes ikke — se noten ved `KASSE_STATUS`. Den der står med
 * listen, får både at vide AT kassen er lovet væk, og til hvilken sag og
 * hvornår. Et gemt flag kunne kun sige det første.
 */
export function reservationerFor(udlaan = [], kasseId) {
  return udlaan
    .filter((u) => u.kasseId === kasseId && BINDENDE.includes(u.tilstand))
    .sort((a, b) => (a.fra || 0) - (b.fra || 0));
}

/**
 * Den reservation der skal vises på kassen lige nu, eller `null`.
 *
 * Den igangværende hvis der er en; ellers den næste der kommer. En afsluttet
 * periode er ikke en reservation — den er historik.
 */
export function naesteReservation(udlaan = [], kasseId, naa) {
  const r = reservationerFor(udlaan, kasseId);
  return r.find((u) => u.til >= naa) || null;
}

/* ---- Historik ---------------------------------------------------------- */

/**
 * Hvor længe kassen var ude — og om tallet er en KENDSGERNING eller en PLAN.
 *
 * ⚠ FLAGET ER VIGTIGERE END TALLET. `fra`/`til` er aftalen; `udleveretMs` og
 * `returneretMs` er hvad der faktisk skete, stemplet af serveren i selve
 * tilstandsskiftet. Har vi begge stempler, ved vi det. Har vi dem ikke, gætter
 * vi ud fra planen — og en historik der siger "126 dage" uden at sige at det
 * var det aftalte, er en påstand vi ikke kan stå inde for, hvis kassen kom
 * hjem i forvejen.
 *
 * Det er samme forbehold som `tjekKoerehviletid()` bærer: vi kan se planen,
 * ikke virkeligheden — og et tal uden forbehold læses som en måling.
 *
 * @returns {{dage:number, faktisk:boolean}}
 */
export function dageUde(u = {}) {
  if (Number.isFinite(u.udleveretMs) && Number.isFinite(u.returneretMs)) {
    /* Mindst én dag: en kasse der er ude fire timer, har været ude. */
    return {
      dage: Math.max(1, Math.round((u.returneretMs - u.udleveretMs) / DAG_MS)),
      faktisk: true,
    };
  }
  if (!Number.isFinite(u.fra) || !Number.isFinite(u.til)) return { dage: 0, faktisk: false };
  /* ⚠ INKLUSIVT, som alt andet om et udlån: 1.–1. er én dag, ikke nul. */
  return { dage: Math.round((u.til - u.fra) / DAG_MS) + 1, faktisk: false };
}

/**
 * Udlånene på én kasse, nyeste først.
 *
 * ⚠ EN ANNULLERET RESERVATION ER OGSÅ HISTORIK. Nogen lovede kassen væk og
 * trak det tilbage; det er en oplysning, ikke støj. Den udelades kun dér hvor
 * den ville få kassen til at se optaget ud — på kalenderen.
 */
export const historikForKasse = (udlaan = [], kasseId) =>
  udlaan.filter((u) => u.kasseId === kasseId).sort((a, b) => (b.fra || 0) - (a.fra || 0));

/**
 * Sagerne, med de kasser der hører til hver.
 *
 * ⚠ SAGSNUMMERET ER DEN ENESTE NØGLE UD AF SYSTEMET. Når museet ringer om sag
 * 4260, er det den vej ind — og et museum låner sjældent én kasse. Derfor er
 * sagen en gruppering, ikke et felt man søger på i en flad liste.
 */
export function sagsoversigt(udlaan = []) {
  const map = new Map();
  for (const u of udlaan) {
    const nr = u.sagsnummer;
    if (!nr) continue;
    if (!map.has(nr)) {
      map.set(nr, {
        sagsnummer: nr, udlaan: [], kasser: new Set(),
        fra: u.fra, til: u.til, beskrivelse: u.beskrivelse || null,
      });
    }
    const s = map.get(nr);
    s.udlaan.push(u);
    s.kasser.add(u.kasseId);
    /* Sagens periode er yderpunkterne af dens udlån — den er ikke gemt
       nogen steder, og skal den blive ved med at passe, skal den udledes. */
    if (u.fra < s.fra) s.fra = u.fra;
    if (u.til > s.til) s.til = u.til;
    if (!s.beskrivelse && u.beskrivelse) s.beskrivelse = u.beskrivelse;
  }
  return [...map.values()]
    .map((s) => ({ ...s, kasser: [...s.kasser].sort((a, b) => a.localeCompare(b, "da")) }))
    .sort((a, b) => (b.fra || 0) - (a.fra || 0));
}

/** Kasser der er fri i hele perioden. Bruges af "søg ledige i periode". */
export function ledigeKasser(
  kasser = {}, udlaan = [], { fra, til, type = null, undertype = null } = {},
) {
  const alle = Object.entries(kasser).map(([id, k]) => ({ id, ...k }));
  return alle.filter((k) => {
    if (k.status === "udeAfDrift") return false;
    if (type && k.type !== type) return false;
    /* ⚠ UNDERTYPEN FILTRERES KUN SAMMEN MED TYPEN. To typer kan have hver sin
       undertype med samme nøgle — "std" findes både på Alukasse og
       Klimakasse — så et filter på undertypen alene ville blande dem. Kalderen
       tegner derfor heller ikke undertypefeltet, før en type er valgt. */
    if (undertype && (!type || k.undertype !== undertype)) return false;
    return konflikter(udlaan, { kasseId: k.id, fra, til }).length === 0;
  });
}
