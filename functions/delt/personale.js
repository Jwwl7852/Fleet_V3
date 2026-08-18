/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/personale.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/personale.js
 * Medarbejderen som entitet. Beslutning 18.
 *
 * INGEN IMPORTS — som permissions.js og audit-regler.js. Den Cloud Function
 * der provisionerer en tenant og udsteder claims, skal bruge samme katalog.
 *
 * ---------------------------------------------------------------------------
 * uid ER HVEM DER GJORDE NOGET. personId ER HVEM DET HANDLER OM.
 *
 * Nøglen i personale/ er et personId, ikke et uid. En person findes før sit
 * login og efter det: kontoen lukkes ved fratrædelse, men en reservation fra
 * tre år siden skal stadig kunne opløses til et navn. En chauffør har måske
 * aldrig et login; en vikar har det sjældent.
 *
 *   indberetninger.oprettetAf og auditloggen  → uid
 *   reservationer, fravaer, opgaver, etaper,
 *   kompetencer                                → personId
 *
 * Bytter man om, holder ejerskabstjekket i reglerne op med at virke:
 * data.child('oprettetAf').val() === auth.uid sammenligner med et uid, og et
 * personId matcher aldrig. Reglen står også i CLAUDE.md.
 * ---------------------------------------------------------------------------
 */
import { isoTilMs } from "./format.js";

/**
 * Funktioner. En person kan have FLERE — en mekaniker der også kører.
 *
 * Gemmes som et MAP, ikke et array: funktioner/{ chauffoer: true } kan
 * indekseres og forespørges ("hvem er mekanikere"), et array kan ikke.
 * Bemærk at roller/<id>/perms er det modsatte — et array — fordi
 * permission-navne indeholder punktum og ikke kan være RTDB-nøgler.
 * Forskellen er teknisk, ikke smag.
 *
 * DER ER INGEN DIVISION på en medarbejder — beslutning 19. Feltet fandtes, og
 * Lars med C+D stod som `faelles`. Det er væk: en medarbejder er defineret ved
 * sine KOMPETENCER, ikke ved en afdeling, og hun oprettes én gang og virker i
 * alle moduler tenanten har adgang til. At Lars må køre både lastbil og bus
 * står i kompetencer/ som C/E og D — dér kan det efterprøves, og dér kan det
 * udløbe. Reglerne afviser feltet med .validate: false.
 */
export const FUNKTION = {
  chauffoer: "chauffoer",
  buschauffoer: "buschauffoer",
  mekaniker: "mekaniker",
  lager: "lager",
  terminal: "terminal",
  disponent: "disponent",
  administration: "administration",
};

export const FUNKTION_LABEL = {
  chauffoer: "Chauffør",
  buschauffoer: "Buschauffør",
  mekaniker: "Mekaniker",
  lager: "Lagermedarbejder",
  terminal: "Terminalmedarbejder",
  disponent: "Disponent",
  administration: "Administration",
};

/**
 * Ikon pr. funktion. Ligger HER ved siden af FUNKTION_LABEL og ikke i den
 * skærm der først fik brug for det — to skærme med hvert sit ikonsæt er
 * samme fælde som to demo-datasæt: de driver, og ingen ser det.
 *
 * Navnene slås op i IKON i ui.jsx. En funktion uden ikon falder tilbage på
 * `personer` frem for at efterlade et hul i kolonnen.
 */
export const FUNKTION_IKON = {
  chauffoer: "lastbil",
  buschauffoer: "bus",
  mekaniker: "skruenoegle",
  lager: "kasse",
  terminal: "bygning",
  disponent: "kalender",
  administration: "dokument",
};

export const ikonFor = (funktion) => FUNKTION_IKON[funktion] || "personer";

export const ALLE_FUNKTIONER = Object.values(FUNKTION);

/**
 * Hvor en funktion har folk stående. Udledes af `stationeret` på personerne.
 *
 * ⚠ LOKATIONEN OPFINDES IKKE. Bemanding-mockuppen skrev "Greve" og "Taastrup";
 * de findes ikke i data. Et opdigtet stednavn er Bil 104 med to nummerplader,
 * denne gang på et depot — og det opdages først når nogen leder efter Greve.
 *
 * Kun AKTIVE tæller: en fratrådt lagermedarbejder i Aalborg betyder ikke at
 * lageret bemandes fra Aalborg. Ren funktion, så den kan prøves.
 */
export function stationeringerFor(personale = [], funktion) {
  const steder = personale
    .filter((p) => p?.status === "aktiv" && p?.funktioner?.[funktion])
    .map((p) => p.stationeret)
    .filter(Boolean);
  return [...new Set(steder)].sort((a, b) => a.localeCompare(b, "da"));
}

/* En fratrådt medarbejder HARDSLETTES ALDRIG. Der hænger reservationer,
   indberetninger og bookinger på personId'et — samme princip som
   regnskabsdata. Reglerne håndhæver det med newData.exists(). */
export const PERSONALE_STATUS = {
  aktiv: { label: "Aktiv", pill: "ok", disponerbar: true },
  orlov: { label: "Orlov", pill: "warn", disponerbar: false },
  fratraadt: { label: "Fratrådt", pill: "bad", disponerbar: false },
};

export const ANSAETTELSESFORM = {
  fastansat: "Fastansat",
  vikar: "Vikar",
  ekstern: "Ekstern",
};

export const kanDisponeres = (person) =>
  Boolean(PERSONALE_STATUS[person?.status]?.disponerbar);

export const harFunktion = (person, funktion) =>
  Boolean(person?.funktioner?.[funktion]);

/** Funktionerne på en person, i katalogets rækkefølge frem for objektets. */
export const funktionerAf = (person) =>
  ALLE_FUNKTIONER.filter((f) => harFunktion(person, f));

/* ---- Kompetencetjek ------------------------------------------------- */

/**
 * tjekKompetencer(kompetencer, krav, paaMs) → { ok, mangler, udloebne }
 *
 * kompetencer: personens poster fra kompetencer/ — [{ type, udloeberMs }]
 * krav:        fra kraevedeKompetencer() i flaade.js
 *
 * EN UDLØBET KOMPETENCE BLOKERER. Den advarer ikke.
 *
 * Det er samme regel som i reservationsmodellen: "ingen konflikter fundet"
 * skal betyde noget. En advarsel man kan klikke videre fra, er ikke en
 * kontrol — og en chauffør uden gyldigt ADR-bevis må ikke køre farligt gods,
 * uanset hvor travlt disponenten har.
 *
 * Bemærk at `mangler` og `udloebne` holdes adskilt. "Han har aldrig haft
 * C+E" og "hans C+E udløb i går" kræver hver sin handling — den ene et andet
 * køretøj, den anden en fornyelse — og en samlet liste ville skjule det.
 *
 * HÅNDHÆVELSEN hører i den Cloud Function der opretter etapen, ikke i
 * skærmen. Ligger den i skærmen, kan en direkte skrivning omgå den.
 */
export function tjekKompetencer(kompetencer = [], krav = [], paaMs = Date.now()) {
  const mine = new Map();
  for (const k of kompetencer.filter(Boolean)) {
    /* Har man to poster af samme type, tæller den der udløber sidst. */
    const nuvaerende = mine.get(k.type);
    if (!nuvaerende || (k.udloeberMs || 0) > (nuvaerende.udloeberMs || 0)) mine.set(k.type, k);
  }

  /* BESLUTNING 25 — to slags krav, og linjen er hvad kravet KOMMER FRA.
     Et array er alle blokerende (bagudkompatibelt: kraevedeKompetencer()
     udleder netop de blokerende). Et objekt skiller dem ad. */
  const blokerendeKrav = Array.isArray(krav) ? krav : (krav.blokerende || []);
  const advarendeKrav = Array.isArray(krav) ? [] : (krav.advarende || []);

  const vurder = (liste) => {
    const mangler = [];
    const udloebne = [];
    for (const t of liste) {
      const k = mine.get(t);
      if (!k) mangler.push(t);
      else if ((k.udloeberMs || 0) <= paaMs) udloebne.push(t);
    }
    return { mangler, udloebne, ok: !mangler.length && !udloebne.length };
  };

  const blokerende = vurder(blokerendeKrav);
  const advarende = vurder(advarendeKrav);

  return {
    /* ok betyder KAN DISPONERES. Advarsler gør den ikke falsk — de kræver en
       begrundet override, ikke en spærring. Læses advarsler som blokeringer,
       holder disponenten op med at læse dem. */
    ok: blokerende.ok,
    blokerende,
    advarende,
    /* Bevaret, så eksisterende kaldere ikke knækker. De peger på de
       BLOKERENDE — det var det de altid har betydet. */
    mangler: blokerende.mangler,
    udloebne: blokerende.udloebne,
  };
}

/**
 * En override af en ADVARSEL. Blokerende krav kan ikke overrules.
 *
 * ⚠ BEGRUNDELSEN HØRER I OBJEKTETS EGEN historik — IKKE I AUDITPOSTEN.
 *
 * `begrundelse` står ikke på LOGBARE_FELTER i audit-regler.js, og allowlisten
 * findes netop for at holde fritekst ude af loggen: en auditpost der lækker,
 * er værre end ingen. Tilføj den ikke til listen for at få den med her — den
 * skal ligge samme sted som en returneret bookings begrundelse gør, i
 * objektets append-only historik.
 *
 * Auditposten får at der SKETE en override, af hvem og på hvilken kompetence.
 * Ikke hvorfor.
 */
export function byggOverride({ personId, kompetence, begrundelse, bruger }, nu = Date.now()) {
  if (!begrundelse?.trim()) {
    throw new Error("byggOverride: en override kræver en begrundelse.");
  }
  return {
    personId, kompetence,
    af: bruger ?? null,
    ms: nu,
    /* Fritekst — og den bliver HER, i historikken. */
    begrundelse: begrundelse.trim(),
  };
}

/* ---- Validering før skrivning ----------------------------------------- */

/**
 * ⚠ SPEJLER firebase.rules.json. Afgør ingenting — serveren validerer igen,
 * og er de to uenige, er reglerne rigtige.
 */
export const GRAENSE_PERSON = {
  navn: 80,
  stationeret: 60,
  telefon: 30,
  email: 120,
};

/**
 * valideMedarbejder(post) → { [felt]: tekst }
 *
 * ⚠ MINDST ÉN FUNKTION. En medarbejder uden funktion kan ikke disponeres,
 * kan ikke tælles i bemandingsplanen, og står i Medarbejdere som en person
 * ingen kan bruge til noget. Det er ikke en regel på serveren — RTDB kan
 * ikke kræve "mindst ét barn" — så den her er den eneste kontrol, og teksten
 * siger hvorfor.
 */
export function valideMedarbejder(post = {}) {
  const f = {};

  if (typeof post.navn !== "string" || !post.navn.trim()) f.navn = "Navn skal udfyldes.";
  else if (post.navn.length > GRAENSE_PERSON.navn) {
    f.navn = `Navn må højst være ${GRAENSE_PERSON.navn} tegn.`;
  }

  if (!PERSONALE_STATUS[post.status]) f.status = "Vælg en status.";
  if (post.ansaettelsesform && !ANSAETTELSESFORM[post.ansaettelsesform]) {
    f.ansaettelsesform = "Vælg en ansættelsesform.";
  }

  const valgte = ALLE_FUNKTIONER.filter((fn) => post.funktioner?.[fn]);
  if (!valgte.length) {
    f.funktioner = "Vælg mindst én funktion — ellers kan personen ikke disponeres.";
  }

  if (typeof post.stationeret !== "string" || !post.stationeret.trim()) {
    f.stationeret = "Stationering skal udfyldes.";
  } else if (post.stationeret.length > GRAENSE_PERSON.stationeret) {
    f.stationeret = `Stationering må højst være ${GRAENSE_PERSON.stationeret} tegn.`;
  }

  if (post.telefon && String(post.telefon).length > GRAENSE_PERSON.telefon) {
    f.telefon = `Telefon må højst være ${GRAENSE_PERSON.telefon} tegn.`;
  }
  if (post.email && String(post.email).length > GRAENSE_PERSON.email) {
    f.email = `E-mail må højst være ${GRAENSE_PERSON.email} tegn.`;
  }

  /* ⚠ EN FRATRÅDT MEDARBEJDER SKAL HAVE EN DATO. Posten bliver stående —
     der hænger reservationer og indberetninger på personId'et — men uden
     datoen kan ingen sige hvornår ansvaret ophørte. */
  if (post.status === "fratraadt" && !post.fratraadtIso) {
    f.fratraadtIso = "En fratrådt medarbejder skal have en fratrædelsesdato.";
  }

  /* ⚠ DIVISION ER FORBUDT (beslutning 19). En medarbejder er defineret ved
     sine KOMPETENCER, ikke ved en afdeling — Lars med C+D stod som
     "faelles", og det er væk. Reglerne afviser feltet. */
  if (post.division !== undefined && post.division !== null) {
    f.division = "En medarbejder har ingen division. Feltet må ikke sendes.";
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/* ⚠ FLYTTET TIL format.js. Den stod her OG i Indkøb, og en tredje kopi
   var på vej ind med Unitbooking. Se noten der. */
const msFraIso = isoTilMs;

export function byggMedarbejder(post) {
  const ud = {
    navn: post.navn.trim(),
    status: post.status,
    stationeret: post.stationeret.trim(),
    /* ⚠ MAP, IKKE ARRAY. funktioner/{chauffoer:true} kan indekseres og
       forespørges ("hvem er mekanikere"); et array kan ikke. */
    funktioner: Object.fromEntries(
      ALLE_FUNKTIONER.filter((fn) => post.funktioner?.[fn]).map((fn) => [fn, true])
    ),
  };
  if (post.ansaettelsesform) ud.ansaettelsesform = post.ansaettelsesform;
  if (post.telefon) ud.telefon = String(post.telefon).trim();
  if (post.email) ud.email = String(post.email).trim();

  const ansat = msFraIso(post.ansatIso);
  if (ansat) ud.ansatMs = ansat;
  const fratraadt = msFraIso(post.fratraadtIso);
  if (fratraadt) ud.fratraadtMs = fratraadt;

  /* ⚠ uid SENDES IKKE FRA FORMULAREN. Det er hvem der GJORDE noget, og det
     sættes af den funktion der opretter loginnet — ikke af den der taster
     personen ind. Bytter man om, holder ejerskabstjekket i reglerne op med
     at virke. Beslutning 18. */
  return ud;
}
