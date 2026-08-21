/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/unitbooking.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
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

  /* ⚠ VALGFRI, MEN IKKE FRI. Klargøringen sker FØR kassen kører — en dato
     efter afhentningen beskriver noget der ikke kan lade sig gøre. Reglen
     siger det samme (`<= fra`), og det er dér det afgøres; det her svarer
     hurtigt. */
  if (post.klargoerSenest != null) {
    if (!Number.isFinite(post.klargoerSenest)) {
      f.klargoerSenest = "Vælg en dato, eller lad feltet stå tomt.";
    } else if (Number.isFinite(post.fra) && post.klargoerSenest > post.fra) {
      f.klargoerSenest = "Kassen skal være pakket før den hentes.";
    }
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

/* ---- Belægningsgraden -------------------------------------------------- */

/**
 * ⚠ NAVNET ER `kassebelaegning`, IKKE `belaegning` — OG DET ER IKKE PEDANTERI.
 *
 * `reolplads.js` har `belaegningPaaPlads()` og `belaegningPrPlads()`, og de
 * svarer på noget HELT andet: om en **hylde** er optaget. Det er et fysisk
 * spørgsmål om lagerpladsen. Det her er en procent af **kasserne** der er i
 * brug.
 *
 * De to blev allerede forvekslet én gang: UNITBOOKING.md begrundede at
 * planchens belægningsgrad ikke blev bygget med at den "allerede står på
 * Kasselisten" — den stod ingen steder, og det nærmeste var hyldetallet.
 * En begrundelse der peger på et tal med samme ordstamme, afgjorde at et andet
 * tal ikke blev bygget. Et navn der ikke kan forveksles, kan ikke det.
 */

/**
 * Hvilke tilstande der tæller som I BRUG.
 *
 * ⚠ `klargjort` TÆLLER MED. Kassen står ganske vist stadig på sin hylde, men
 * den er pakket til en bestemt sag og kan ikke loves væk til nogen anden. En
 * belægningsgrad der kun talte de fysisk udleverede, ville sige at lageret var
 * ledigt om fredagen, hvor hver eneste kasse var pakket til mandag.
 *
 * ⚠ Og `booket` er IKKE en kassetilstand. Det er udlånets. En booket kasse står
 * som `ledig` indtil nogen klargør den — se SELVVALGT_KASSE_STATUS. Tallet her
 * er derfor et øjebliksbillede af LAGERET, ikke af kalenderen.
 */
export const I_BRUG_STATUS = ["klargjort", "udlaant"];

/**
 * kassebelaegning(kasser) → { pct, iBrug, kanBruges, udeAfDrift, ialt }
 *
 * Hvor stor en del af de brugbare kasser der er i brug LIGE NU.
 *
 * ⚠ NÆVNEREN ER DE BRUGBARE, IKKE ALLE. En kasse der er ude af drift, er
 * hverken i brug eller til rådighed — den er taget ud af regnestykket. Talte vi
 * den med i nævneren, ville et lager hvor halvdelen er i stykker, vise 50 % og
 * ligne noget der stod halvt stille, mens hver eneste brugbare kasse var ude.
 *
 * ⚠ MEN SÅ SKAL ANTALLET STÅ VED SIDEN AF. Når nævneren krymper, STIGER
 * procenten hver gang en kasse går i stykker — og et tal der ser bedre ud af
 * at noget går i stykker, er farligt alene. Derfor giver funktionen
 * `udeAfDrift` med tilbage, og skærmene skriver det ud. Samme greb som
 * `dageUde()` i beslutning 37: flaget hører til tallet.
 *
 * ⚠ UDEN BRUGBARE KASSER ER SVARET `null` — IKKE 0. Nul brugbare kasser
 * betyder at spørgsmålet ikke kan besvares, og 0 % ville sige at lageret stod
 * helt stille. `pct()` skriver `—` for null. Det er den samme gate som
 * `num()`: "et felt der ikke kunne regnes, er et ubesvaret spørgsmål".
 *
 * ⚠ OG DER ER INTET `MINDSTE_GRUNDLAG` HER, selv om den ligner et nøgletal der
 * skulle have et. `beregnNoegletal()` i leverandoerer.js nægter under en
 * grænse, fordi den estimerer en RATE ud fra få leveringer — to og to hundrede
 * ser ens ud i en tabel. Det her er en OPTÆLLING: er én af to kasser ude, ER
 * belægningen 50 %. Et tal der er målt på hele populationen, kan ikke have for
 * lidt grundlag.
 *
 * ⚠ OG TALLET HØRER IKKE I `kpi/`. Det er afledt af den kasseliste skærmen
 * allerede henter, og et gemt afledt tal driver fra sit grundlag — det er
 * fejlen i `bemanding.ledig`. Se undtagelsen i CLAUDE.md.
 */
export function kassebelaegning(kasser = []) {
  const ialt = kasser.length;
  const udeAfDrift = kasser.filter((k) => k?.status === "udeAfDrift").length;
  const kanBruges = ialt - udeAfDrift;
  const iBrug = kasser.filter((k) => I_BRUG_STATUS.includes(k?.status)).length;

  return {
    pct: kanBruges > 0 ? (iBrug / kanBruges) * 100 : null,
    iBrug,
    kanBruges,
    udeAfDrift,
    ialt,
  };
}

/* ---- Klargøres snart --------------------------------------------------- */

/**
 * ⚠ PLANCHENS NØGLETAL TÆLLER DEM DER **SKAL** KLARGØRES, ikke dem der ER
 * klargjort. Skærmen havde "Klargjort", og de to er ikke det samme tal: det
 * ene er arbejde der er gjort, det andet er arbejde der venter. Et lager hvor
 * alt er klargjort og intet forestår, og et lager hvor intet er klargjort og
 * ti kasser skal ud i morgen, ser ens ud på det første.
 */
export const KLARGOER_VINDUE_TIMER = 48;

/**
 * klargoeresSnart(udlaan, nu, timer) → { antal, bagud, udenDato, poster }
 *
 * De udlån der stadig er `booket` og skal være pakket inden for vinduet.
 *
 * ⚠ KUN `booket` TÆLLER. Er udlånet allerede `klargjort`, er arbejdet gjort;
 * er det `udlaant`, er kassen kørt. En tælling der tog dem med, ville vokse
 * af at arbejdet blev udført — og så kan man ikke bruge den til at planlægge.
 *
 * ⚠ DE OVERSKREDNE TÆLLER MED, OG DE TÆLLES OGSÅ FOR SIG. Et udlån der skulle
 * have været pakket i går, er ikke holdt op med at skulle pakkes. Faldt det
 * ud af tallet fordi fristen var passeret, ville listen blive kortere netop
 * som den blev mere presserende — og den kasse ville forsvinde fra den eneste
 * skærm der viser den. `bagud` står ved siden af, så de kan skelnes.
 *
 * ⚠ OG `udenDato` ER IKKE NUL — DET ER ET UBESVARET SPØRGSMÅL.
 * `klargoerSenest` er valgfri, så et udlån uden den kan hverken tælles med
 * eller tælles fra: vi ved ikke hvornår den skal pakkes. Tallet ville påstå at
 * være en fuld optælling, og det er den ikke. Antallet gives med tilbage, og
 * skærmen skriver det ud — samme greb som `udeAfDrift` på belægningsgraden og
 * `volumenIalt()`s `uden`: det der ikke kunne regnes med, rapporteres frem for
 * at blive rundet ned til nul.
 */
export function klargoeresSnart(udlaan = [], nu = Date.now(), timer = KLARGOER_VINDUE_TIMER) {
  const graense = nu + timer * 3600000;
  const booket = udlaan.filter((u) => u?.tilstand === "booket");

  const udenDato = booket.filter((u) => !Number.isFinite(u.klargoerSenest)).length;
  const poster = booket
    .filter((u) => Number.isFinite(u.klargoerSenest) && u.klargoerSenest <= graense)
    .sort((a, b) => a.klargoerSenest - b.klargoerSenest);

  return {
    antal: poster.length,
    bagud: poster.filter((u) => u.klargoerSenest < nu).length,
    udenDato,
    poster,
  };
}

/* ---- Kalenderen grupperet efter SAG ------------------------------------ */

/**
 * sagsblokke(udlaan) → [{ sagsnummer, fra, til, kasser, tilstande }]
 *
 * Én sags udlån slået sammen til de perioder hvor sagen er i gang.
 *
 * ⚠ EN SAGSRÆKKE ER IKKE EN EKSKLUSIV RESSOURCE, OG DET ER HELE POINTEN.
 * Gitteret tegner overlap i SAMME række som en KONFLIKT — med vilje, fordi et
 * overlap på én kasse er noget `konflikter()` ville afvise. Men et museum
 * låner et helt sæt til én udstilling: fire kasser i nøjagtig samme periode er
 * det NORMALE, ikke en fejl. Lagde vi de fire udlån råt i sagens række, ville
 * hver eneste udstilling stå som fire røde konfliktblokke oven i hinanden.
 *
 * Derfor flettes de: perioder der overlapper eller rører hinanden, bliver til
 * ÉN blok, og blokken bærer hvor mange kasser der er i den.
 *
 * ⚠ MEN DE FLETTES KUN NÅR DE HÆNGER SAMMEN. Går kasserne ud i bølger — to i
 * august, to i november — er det to blokke. En enkelt blok fra august til
 * november ville påstå at sagen holdt kasser i tre måneder, hvor lageret var
 * frit imellem. Samme regel som `ledigeVinduer()`: hullet er også et svar.
 *
 * ⚠ OG DET ER UDLÅNETS EGNE `fra`/`til` — INKLUSIVE I BEGGE ENDER. Gitteret
 * regner halvåbent, og oversættelsen sker med `halvaabent()` hos kalderen,
 * ÉT sted. Gjorde vi den her, ville den ske to gange.
 */
export function sagsblokke(udlaan = []) {
  const prSag = new Map();
  for (const u of udlaan) {
    if (!u?.sagsnummer) continue;
    if (!Number.isFinite(u.fra) || !Number.isFinite(u.til)) continue;
    if (!prSag.has(u.sagsnummer)) prSag.set(u.sagsnummer, []);
    prSag.get(u.sagsnummer).push(u);
  }

  const ud = [];
  for (const [sagsnummer, liste] of prSag) {
    const sorteret = [...liste].sort((a, b) => a.fra - b.fra);
    let loeb = null;
    for (const u of sorteret) {
      /* ⚠ `<=` OG IKKE `<`. To udlån hvor det ene slutter den 5. og det andet
         begynder den 6., hænger sammen: sagen har kasser ude uden afbrydelse.
         Et hul på nul dage er ikke et hul. */
      if (loeb && u.fra <= loeb.til + DAG_MS) {
        loeb.til = Math.max(loeb.til, u.til);
        loeb.kasser.push(u.kasseId);
        loeb.tilstande.push(u.tilstand);
      } else {
        loeb = {
          sagsnummer, fra: u.fra, til: u.til,
          kasser: [u.kasseId], tilstande: [u.tilstand],
        };
        ud.push(loeb);
      }
    }
  }
  return ud.sort((a, b) => a.fra - b.fra);
}

/**
 * Den tilstand en sagsblok skal TEGNES med, når dens kasser er i hver sin.
 *
 * ⚠ DEN MEST BINDENDE VINDER, IKKE DEN FØRSTE. Er én kasse ude og tre booket,
 * er sagen i gang — og en blok der sagde "Booket", ville få den til at ligne
 * noget der endnu ikke var sket. Rækkefølgen er den samme som forløbets:
 * udlånt er længere fremme end klargjort, som er længere fremme end booket.
 */
export const SAGSTILSTAND_RANG = ["udlaant", "klargjort", "booket", "returneret", "annulleret"];

export const sagstilstand = (tilstande = []) =>
  SAGSTILSTAND_RANG.find((t) => tilstande.includes(t)) || tilstande[0] || null;
